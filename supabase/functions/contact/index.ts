/**
 * Home Church, the contact form at the top of Connect.
 *
 * WHAT IT DOES, in order. Takes a name, an email address and a message from
 * the app, checks them, writes the row to `contact_messages`, then asks Resend
 * to send it to the church. Row first, send second, on purpose: a message that
 * reaches this function is never lost, even when the sending is broken.
 *
 * BUT THE ROW IS NOT THE PROMISE. This returns ok ONLY when Resend accepts the
 * message. If the send fails, the row is already written, `delivery_error`
 * says why, and the caller gets a 502 with copy that tells the person to email
 * the church directly instead. js/screens/connect.js draws that as the mailto
 * it has always had.
 *
 * That is not defensive coding for its own sake. Read the top of
 * js/screens/connect.js: three controls on that screen used to tell people
 * something would happen and told nobody, and the next steps form "collected a
 * name, a contact, and a note and then threw all three away". A contact form
 * that thanks somebody over a failed send is that same bug in better clothes.
 * The rule the screen keeps is that nothing claims to have happened unless it
 * happened, and this function is where that rule is actually enforced.
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
 *   RESEND_API_KEY        the same Resend account that already sends the
 *                         sign in codes. An API key, `re_...`, not the SMTP
 *                         password field from the auth settings.
 *   CONTACT_TO            optional, defaults below. Where submissions go.
 *   CONTACT_FROM          optional, defaults below. MUST be at a domain
 *                         verified in Resend or every send is refused.
 *   CONTACT_IP_PEPPER     optional but wanted. Any long random string. With
 *                         no pepper set, the rate limit still works and the
 *                         hash is simply less resistant to somebody who has
 *                         both the database and a list of addresses to guess.
 *
 * THE FROM ADDRESS IS NOT THE SENDER'S. It is the church's own, at a domain
 * Resend has verified, and the person who wrote the message goes in Reply-To.
 * Putting their address in From is how a contact form gets a domain's mail
 * marked as spam: it is an unauthenticated claim to send as them, and SPF and
 * DMARC exist to refuse exactly that. Hitting reply in the church's mailbox
 * still writes to the person, which is the only part anybody notices.
 *
 * DEPLOY
 *   supabase functions deploy contact --no-verify-jwt
 *
 * Needs migration 0047. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 * injected by the platform; do not add them by hand.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

/* Where it goes, and who it comes from. Both overridable by secret so that a
   change of address is a dashboard edit rather than a redeploy, which is the
   same trade the newsletter's model name makes. */
const DEFAULT_TO = 'hello@homechurchnola.com';
const DEFAULT_FROM = 'Home Church app <app@homechurchnola.com>';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');

  if (!url || !serviceKey) {
    console.error('contact: platform env vars missing');
    return json({ error: 'This is not set up correctly. Please tell the church.' }, 500);
  }

  /* No key means no send, and no send means no promise. Refused up front
     rather than after writing a row nobody will read, and said in the app's
     own voice because a person is looking at this. */
  if (!resendKey) {
    console.error('contact: RESEND_API_KEY is not set, so nothing can be sent');
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
     entry, because none of it happened. */
  if (text(payload.website, 200)) {
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
  const subject = headerSafe(`Contact form: ${name}`).slice(0, 200);

  let sendFailure = '';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('CONTACT_FROM') || DEFAULT_FROM,
        to: [Deno.env.get('CONTACT_TO') || DEFAULT_TO],
        // Hitting reply in the church's mailbox writes to the person. See the
        // header for why their address is not in From.
        reply_to: headerSafe(email),
        subject,
        text: body.plain,
        html: body.html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      sendFailure = `Resend returned ${res.status}: ${detail.slice(0, 300)}`;
    }
  } catch (err) {
    // DNS, TLS, a reset socket. The row is already written either way.
    sendFailure = `Could not reach Resend: ${String((err as Error).message ?? err)}`;
  }

  if (sendFailure) {
    console.error('contact: send failed for', row.id, sendFailure);
    await admin.from('contact_messages')
      .update({ delivery_error: sendFailure.slice(0, 1000) })
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
