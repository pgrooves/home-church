/**
 * Home Church, the contact form at the top of Connect.
 *
 * WHAT IT DOES, in order. Takes a name, an email address and a message from
 * the app, checks them, writes the row to `contact_messages`, then sends it to
 * the church as an email. Row first, send second, on purpose: a message that
 * reaches this function is never lost, even when the sending is broken.
 *
 * BUT THE ROW IS NOT THE PROMISE. This returns ok ONLY when a mail provider
 * accepts the message. If the send fails, the row is already written,
 * `delivery_error` says why, and the caller gets a 502 with copy that tells
 * the person to email the church directly instead. js/screens/connect.js draws
 * that as the mailto it has always had.
 *
 * That is not defensive coding for its own sake. Read the top of
 * js/screens/connect.js: three controls on that screen used to tell people
 * something would happen and told nobody, and the next steps form "collected a
 * name, a contact, and a note and then threw all three away". A contact form
 * that thanks somebody over a failed send is that same bug in better clothes.
 * The rule the screen keeps is that nothing claims to have happened unless it
 * happened, and this function is where that rule is actually enforced.
 *
 * WHO IT COMES FROM. homechurchapp@gmail.com, over Gmail's own SMTP, using an
 * App Password. That is a mailbox the church already owns and can open, which
 * is the point: the sent copy is somewhere a person can see it, and the
 * address is one they recognise rather than a no-reply nobody has ever logged
 * into.
 *
 * Gmail will not let this be anything else. SMTP authenticates AS an account
 * and Google rewrites From to that account, so a From at some other address is
 * either rewritten or refused. The sender's own address is not attempted for
 * the same reason it never was: see THE FROM ADDRESS below.
 *
 * RESEND IS STILL HERE, AS A BACKSTOP AND NOTHING ELSE. If the Gmail send
 * fails and RESEND_API_KEY is set, the message goes out through Resend from
 * the church's domain rather than not going out at all — an email from the
 * wrong address beats a person being turned away. When that happens the row
 * gets BOTH `delivered_at` and a `delivery_error` describing what Gmail did,
 * which is the only signal that the main path is broken. Grep the logs for
 * `contact: gmail failed` and fix it. Unset RESEND_API_KEY if you would rather
 * the form simply fail loudly.
 *
 * WHY verify_jwt IS OFF. The form is for anybody, including somebody who has
 * never signed in, and the app carries a publishable key rather than a JWT, so
 * there is no token to verify. That means this URL is open, which is a fact
 * about contact forms rather than a flaw in this one, and it is why the
 * defences below exist instead:
 *
 *   a honeypot field       a bot fills in every input it finds; a person
 *                          cannot fill in one that is not on the screen. A
 *                          filled honeypot is answered 200 and dropped, so
 *                          whatever is submitting learns nothing.
 *   hard length caps       checked here and again by the table's constraints
 *   a shape check on the   not validation theatre: the address goes into
 *   email address          Reply-To, and a header is not a place for whatever
 *                          somebody typed
 *   a per sender rate      five in an hour, counted on a peppered hash of the
 *   limit                  IP, so the endpoint cannot be turned into a relay
 *
 * WHAT THE HASH IS NOT. It is sha-256 of the caller's IP and CONTACT_IP_PEPPER,
 * a secret that never leaves this function's environment. The database holds
 * the digest and nothing else, so nothing there walks back to a person's
 * network, and losing the pepper means losing the ability to correlate rather
 * than exposing anything. This app does not track people and this is not the
 * exception; it is a counter with an hour's memory.
 *
 * SECRETS, under Project Settings -> Edge Functions -> Secrets. They are
 * project wide, which is why these are named for the job that owns them, the
 * same as HC_NEWSLETTER_CRON_SECRET and the APNS_ values already there. The
 * whole list and where each comes from is in CONTACT_FORM_SETUP.md.
 *
 *   GMAIL_APP_PASSWORD    required. The sixteen characters Google shows once,
 *                         at myaccount.google.com/apppasswords. NOT the
 *                         password used to sign into the account, which SMTP
 *                         will refuse. Spaces in it are ignored here, so it
 *                         can be pasted exactly as Google displays it.
 *   GMAIL_USER            optional, defaults below. The account the App
 *                         Password belongs to, and therefore the From address.
 *   GMAIL_FROM_NAME       optional, defaults below. The name beside it.
 *   CONTACT_TO            optional, defaults below. Where submissions go.
 *   CONTACT_IP_PEPPER     optional but wanted. Any long random string. With
 *                         no pepper set, the rate limit still works and the
 *                         hash is simply less resistant to somebody who has
 *                         both the database and a list of addresses to guess.
 *   RESEND_API_KEY        optional. The backstop described above. If it is
 *                         set, CONTACT_FROM overrides the address Resend
 *                         sends from, which must be at a domain verified in
 *                         Resend or that path is refused too.
 *
 * THE FROM ADDRESS IS NOT THE SENDER'S. It is the church's own, and the person
 * who wrote the message goes in Reply-To. Putting their address in From is how
 * a contact form gets a domain's mail marked as spam: it is an unauthenticated
 * claim to send as them, and SPF and DMARC exist to refuse exactly that.
 * Hitting reply in the church's mailbox still writes to the person, which is
 * the only part anybody notices.
 *
 * DEPLOY
 *   supabase functions deploy contact --no-verify-jwt
 *
 * Needs migration 0047. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 * injected by the platform; do not add them by hand.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  /* `content-type` is the one that matters and the one that is easy to leave
     out. The app posts JSON with an Authorization header, which makes the
     browser send a preflight, and Supabase's own gateway answers a preflight
     for a function that does not exist with a header list that does NOT
     include content-type. The browser then blocks the request and fetch
     rejects with a bare TypeError, which js/auth.js turns into "Could not
     reach the church's servers" — an offline message for a deployment
     problem. That is exactly how this first went wrong in production.

     x-client-info is here because supabase-js sends it and a future caller
     may well be supabase-js rather than the hand written fetch in
     js/auth.js. */
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* Where it goes and who it comes from. Overridable by secret so that a change
   of address is a dashboard edit rather than a redeploy, which is the same
   trade the newsletter's model name makes. */
const DEFAULT_TO = 'hello@homechurchnola.com';
const DEFAULT_GMAIL_USER = 'homechurchapp@gmail.com';
const DEFAULT_FROM_NAME = 'Home Church app';

/* Implicit TLS from the first byte, which is the port to reach for when the
   only question is whether the connection is encrypted. 587 and STARTTLS
   works too and is what to try if 465 turns out to be blocked; denomailer
   upgrades the connection itself when `tls` is false. */
const GMAIL_HOST = 'smtp.gmail.com';
const DEFAULT_GMAIL_PORT = 465;

/* SMTP is a conversation over a socket, and a socket that nobody ever answers
   holds this function open until the platform kills it — which the person
   waiting on the form sees as a spinner that never stops. Twenty seconds is
   far longer than a healthy send and far shorter than anybody's patience. */
const SEND_TIMEOUT_MS = 20_000;

/* The caps. Matched by the check constraints in migration 0047, so a caller
   that somehow got past this still cannot write a novel into the table. */
const MAX_NAME = 120;
const MAX_EMAIL = 200;
const MAX_MESSAGE = 4000;

/* Five an hour from one source. High enough that a family sending a second
   message because they forgot something never sees it, low enough that this
   is not worth anybody's time as a relay. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MINUTES = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

/* Deliberately loose. This is not trying to decide whether an address exists,
   which no regex can do; it is making sure what goes into a Reply-To header is
   one address and not a header injection or a sentence. No spaces, no commas,
   no CR or LF, one @, a dot in the domain. */
const EMAIL = /^[^\s@,;:<>"'\\]+@[^\s@,;:<>"'\\]+\.[A-Za-z]{2,}$/;

/* CR and LF are the only characters that can turn a value into a new header.
   Stripped rather than rejected, because a name pasted out of a signature can
   carry a newline with no bad intent behind it. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* The caller's address, as the platform reports it. x-forwarded-for is a list
   when there are proxies in front and the first entry is the client. Absent on
   a local invocation, which is why every caller of this treats an empty string
   as "no rate limiting is possible" rather than as an identity. */
function callerIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0].trim();
  return first || (req.headers.get('x-real-ip') ?? '').trim();
}

async function senderHash(ip: string, pepper: string): Promise<string | null> {
  if (!ip) return null;
  const bytes = new TextEncoder().encode(`${pepper}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* What the church reads. Plain text as well as HTML, because a mail client
   that shows the plain part is not a broken mail client, and because the
   plain part is what a phone's notification preview will show.

   The address is repeated in the body rather than left to Reply-To alone: a
   forwarded message keeps the body and loses the header, and "who was this
   from" is the first question anybody forwarding it will be asked. */
function mailBody(name: string, email: string, message: string) {
  const plain = [
    `${name} <${email}> wrote from the Home Church app:`,
    '',
    message,
    '',
    '---',
    'Sent from the contact form at the top of the Connect tab.',
    'Reply to this email and it goes straight to them.',
  ].join('\n');

  const html = [
    `<p><strong>${escapeHtml(name)}</strong> `,
    `&lt;<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>&gt; `,
    'wrote from the Home Church app:</p>',
    `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
    '<hr>',
    '<p style="color:#6b6b6b;font-size:13px">Sent from the contact form at the ',
    'top of the Connect tab. Reply to this email and it goes straight to them.</p>',
  ].join('');

  return { plain, html };
}

interface Letter {
  to: string;
  replyTo: string;
  subject: string;
  plain: string;
  html: string;
}

/* Both senders answer the same way: empty string when the message is gone,
   and a sentence worth writing into `delivery_error` when it is not. Neither
   throws, because a thrown send is indistinguishable to the caller from a
   thrown anything else, and the caller's next move is to write the reason
   down either way. */

async function sendViaGmail(letter: Letter): Promise<string> {
  /* Google prints an App Password in four groups of four. Stripping the
     spaces here means a copy and paste out of that page works, rather than
     failing authentication for a reason nobody would guess from the log. */
  const password = (Deno.env.get('GMAIL_APP_PASSWORD') ?? '').replace(/\s+/g, '');
  const user = (Deno.env.get('GMAIL_USER') || DEFAULT_GMAIL_USER).trim();
  const fromName = headerSafe(Deno.env.get('GMAIL_FROM_NAME') || DEFAULT_FROM_NAME);
  /* A typo in a dashboard field should not take the form down. Anything that
     is not a number falls back to the default rather than dialling NaN. */
  const configuredPort = Number(Deno.env.get('GMAIL_SMTP_PORT'));
  const port = Number.isInteger(configuredPort) && configuredPort > 0
    ? configuredPort
    : DEFAULT_GMAIL_PORT;

  if (!password) return 'GMAIL_APP_PASSWORD is not set';
  if (!EMAIL.test(user)) return `GMAIL_USER is not an address: ${user}`;

  const client = new SMTPClient({
    connection: {
      hostname: GMAIL_HOST,
      port,
      /* 465 is TLS from the first byte. Anything else is assumed to be 587,
         where denomailer opens in the clear and issues STARTTLS itself. */
      tls: port === 465,
      auth: { username: user, password },
    },
  });

  let timer: number | undefined;
  try {
    await Promise.race([
      client.send({
        from: `${fromName} <${user}>`,
        to: letter.to,
        replyTo: letter.replyTo,
        subject: letter.subject,
        content: letter.plain,
        html: letter.html,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer from ${GMAIL_HOST}:${port} in ${SEND_TIMEOUT_MS}ms`)),
          SEND_TIMEOUT_MS,
        );
      }),
    ]);
    return '';
  } catch (err) {
    return `Gmail SMTP refused it: ${String((err as Error)?.message ?? err)}`;
  } finally {
    clearTimeout(timer);
    /* The socket goes either way, and this is wrapped rather than chained for
       two reasons that both cost a production 500 to learn. denomailer's
       close() returns void, not a promise, so `.close().catch()` reads a
       property of undefined and throws; and a throw inside a finally replaces
       whatever the try was returning, so that TypeError came back to the app
       as a bare 500 instead of the honest sentence, and hid whether the send
       had worked at all. A close that fails on an already dead connection is
       not news and must never become the reported failure. */
    try {
      await client.close();
    } catch { /* already gone */ }
  }
}

async function sendViaResend(letter: Letter, key: string): Promise<string> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('CONTACT_FROM') || `${DEFAULT_FROM_NAME} <app@homechurchnola.com>`,
        to: [letter.to],
        reply_to: letter.replyTo,
        subject: letter.subject,
        text: letter.plain,
        html: letter.html,
      }),
    });

    if (res.ok) return '';
    const detail = await res.text().catch(() => '');
    return `Resend returned ${res.status}: ${detail.slice(0, 300)}`;
  } catch (err) {
    // DNS, TLS, a reset socket. The row is already written either way.
    return `Could not reach Resend: ${String((err as Error)?.message ?? err)}`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD') ?? '';

  if (!url || !serviceKey) {
    console.error('contact: platform env vars missing');
    return json({ error: 'This is not set up correctly. Please tell the church.' }, 500);
  }

  /* No way to send means no promise to make. Refused up front rather than
     after writing a row nobody will read, and said in the app's own voice
     because a person is looking at this. */
  if (!gmailPassword && !resendKey) {
    console.error('contact: no GMAIL_APP_PASSWORD and no RESEND_API_KEY, so nothing can be sent');
    return json({
      error: 'The form is not connected yet. Email the church directly and somebody will answer.',
    }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'That did not go through. Try again in a moment.' }, 400);
  }

  /* The honeypot, first, before anything is written or checked. Answered as
     though it worked: a bot that is told it failed tries something else, and a
     bot that is told it succeeded goes away. No row, no email, no rate limit
     entry, because none of it happened.

     TWO NAMES, AND BOTH ARE CHECKED. The field was called `website` until the
     security review, and that name is published: this repository was public
     while it was in the source, so it has to be assumed known and is no longer
     worth anything on its own. `homepage_url` replaces it.

     The old one keeps being checked, and not out of caution. The app is an App
     Store binary, so the phone in somebody's pocket is whatever version they
     last updated to, and that version posts `website`. Checking only the new
     name would leave every un-updated phone with no honeypot at all until they
     update, which for some people is never. Either field filled is a bot;
     neither filled is a person. Drop the legacy branch when the oldest
     supported build sends the new name, and not before.

     WORTH BEING HONEST ABOUT WHAT THIS BUYS. A honeypot's only power is that
     the filler does not know it is there, so a public repository costs it most
     of its value and a rename does not restore that — it invalidates the name
     anyone already scraped, which is worth doing and is not the same thing.
     The defences that do not care who is reading are the ones below: the
     length caps, the address shape check, and the rate limit. */
  if (text(payload.homepage_url, 200) || text(payload.website, 200)) {
    console.log('contact: honeypot filled, dropped');
    return json({ ok: true });
  }

  const name = text(payload.name, MAX_NAME);
  const email = text(payload.email, MAX_EMAIL);
  const message = text(payload.message, MAX_MESSAGE);

  /* The app checks all three before it ever calls this, so these are the
     second answer rather than the first, and they are here because the app is
     not the only thing that can reach this URL. */
  if (!name) return json({ error: 'Tell us your name first.' }, 400);
  if (!EMAIL.test(email)) return json({ error: 'That does not look like an email address.' }, 400);
  if (!message) return json({ error: 'Write your message first.' }, 400);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const hash = await senderHash(callerIp(req), Deno.env.get('CONTACT_IP_PEPPER') ?? '');

  /* The rate limit. Skipped entirely when there is no hash, because with no
     address to count there is nothing to count, and refusing everybody would
     be the wrong way to fail.

     A failure to READ the count is not a reason to refuse the message. The
     limit exists to stop abuse, not to stand between a person and the church,
     so a database hiccup here falls through to the send. */
  if (hash) {
    const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
    const { count, error: countError } = await admin
      .from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_hash', hash)
      .gte('created_at', since);

    if (countError) {
      console.error('contact: could not count recent messages:', countError.message);
    } else if ((count ?? 0) >= RATE_LIMIT) {
      console.log('contact: rate limited a sender');
      return json({
        error: 'That is a few messages in a short time. Give it an hour, or email the church directly.',
      }, 429);
    }
  }

  /* The row, before the send. This is the line that makes the difference
     between a form and a promise: after it, the message exists somewhere the
     church can find even if everything downstream is broken. */
  const { data: row, error: writeError } = await admin
    .from('contact_messages')
    .insert({ name, email, message, sender_hash: hash })
    .select('id')
    .single();

  if (writeError) {
    console.error('contact: could not write the message:', writeError.message);
    return json({
      error: 'That did not go through. Email the church directly and somebody will answer.',
    }, 500);
  }

  const body = mailBody(name, email, message);
  const letter: Letter = {
    to: (Deno.env.get('CONTACT_TO') || DEFAULT_TO).trim(),
    // Hitting reply in the church's mailbox writes to the person. See the
    // header for why their address is not in From.
    replyTo: headerSafe(email),
    subject: headerSafe(`Contact form: ${name}`).slice(0, 200),
    plain: body.plain,
    html: body.html,
  };

  /* Gmail, then Resend only if Gmail could not do it. `note` is what ends up
     in delivery_error whichever way this goes: the reason it failed, or the
     reason the backstop had to be used. */
  let note = '';

  if (gmailPassword) {
    note = await sendViaGmail(letter);
    if (note) console.error('contact: gmail failed for', row.id, note);
  } else {
    note = 'GMAIL_APP_PASSWORD is not set';
  }

  if (note && resendKey) {
    const resendFailure = await sendViaResend(letter, resendKey);
    if (resendFailure) {
      note = `${note}; and the Resend backstop: ${resendFailure}`;
    } else {
      console.log('contact: delivered', row.id, 'through the Resend backstop');
      note = `Delivered by the Resend backstop, from the church's domain rather than Gmail. Gmail said: ${note}`;
      await admin.from('contact_messages')
        .update({ delivered_at: new Date().toISOString(), delivery_error: note.slice(0, 1000) })
        .eq('id', row.id);
      return json({ ok: true });
    }
  }

  if (note) {
    console.error('contact: send failed for', row.id, note);
    await admin.from('contact_messages')
      .update({ delivery_error: note.slice(0, 1000) })
      .eq('id', row.id);

    /* 502 and the honest sentence. The message is safe in the table and an
       admin can find it, but nobody has been told it is there, so this must
       not read as success. The app draws the mailto underneath. */
    return json({
      error: 'We could not get that through just now. Email the church directly and somebody will answer.',
    }, 502);
  }

  await admin.from('contact_messages')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', row.id);

  console.log('contact: delivered', row.id);
  return json({ ok: true });
});
