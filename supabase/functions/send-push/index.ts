/**
 * Home Church, the thing that actually sends the notification.
 *
 * WHAT THIS REPLACES. Nothing. That is the point. Until this existed the three
 * switches in Profile wrote a boolean to localStorage and the church had no
 * way to reach a phone at all. `device_tokens` had zero rows and no reader.
 *
 * WHO CALLS IT. pg_cron, hourly, through `public.hc_push_tick()` in migration
 * 0012. The tick decides in America/Chicago local time whether the current
 * hour is one we send in, and calls `hc_send_push(topic)`, which posts here.
 * You can also call it by hand for a test, which is the only sane way to prove
 * push works before a Monday arrives.
 *
 * Two other things call it now, both through the same `hc_send_push`. An admin
 * tapping Notify on an announcement, since 0027. And the newsletter intake at
 * the end of a parse, since 0043, for the two review topics that tell the
 * admins their queue has something in it.
 *
 * THE TWO REVIEW TOPICS ARE ADDRESSED DIFFERENTLY from everything else here,
 * and it is the one thing in this file worth reading before changing it. They
 * go to the phones of people who are admins right now, established from
 * profiles on every send, rather than to whoever asked. See ADMIN_ONLY below
 * and the header of migration 0043 for why that is a line this project was
 * reluctant to cross.
 *
 * WHY verify_jwt IS OFF, and why that is not careless. This is invoked by the
 * database, which has no user session to present. The alternative is storing a
 * service role key in Postgres so it can mint a bearer token, and that key
 * bypasses row level security on every table in the project. Instead the caller
 * proves itself with a dedicated shared secret that can do exactly one thing:
 * cause a notification to be sent. Compared in constant time below. A leak
 * costs you spam, not your database.
 *
 * WHAT IT NEEDS BEFORE IT WORKS. Five secrets, set on this function in the
 * dashboard under Edge Functions -> send-push -> Secrets:
 *
 *   HC_PUSH_CRON_SECRET  must equal the vault secret 0012 generated
 *   APNS_KEY_ID          the 10 character Key ID of your .p8
 *   APNS_TEAM_ID         the 10 character Apple Developer Team ID
 *   APNS_PRIVATE_KEY     the entire .p8 file, BEGIN and END lines included
 *   APNS_BUNDLE_ID       com.homechurchnola.app
 *
 * And optionally APNS_HOST, which defaults to Apple's production gateway.
 * A build run from Xcode onto your own phone is a *development* build and
 * registers against the sandbox gateway; TestFlight and the App Store are
 * production. Sending a production token to sandbox, or the reverse, fails with
 * BadDeviceToken and looks exactly like a bug in your code. It is not. It is
 * this. See LAUNCH_TODO.md.
 *
 * DEPLOY
 *   supabase functions deploy send-push --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Topic =
  | 'new_guide'
  | 'sunday_reminder'
  | 'group_day'
  | 'test'
  | 'announcement'
  | 'announcement_review'
  | 'event_review';

const TOPIC_COLUMN: Record<Topic, string | null> = {
  new_guide: 'wants_new_guide',
  sunday_reminder: 'wants_sunday_reminder',
  group_day: 'wants_group_day',
  announcement: 'wants_announcements',
  announcement_review: 'wants_announcement_review',
  event_review: 'wants_event_review',
  test: null, // a test goes to every active phone, on purpose
};

/* The two topics that go to some phones rather than to all of them.
 *
 * Every other topic here is addressed to a preference: whoever asked for it
 * gets it, and the church never learns whose phone that is. These two are
 * addressed to a role, because what they say is "there is something in the
 * queue only you can decide", and the queue holds words the church has not
 * published yet.
 *
 * Which is why the switch is not the check. `wants_announcement_review` is a
 * preference and preferences can only ever narrow this: the identity comes
 * first, and it is re-established from profiles on every single send rather
 * than trusted from device_tokens. The recipient query in main() is where that
 * happens, and the comment above it says what it buys.
 */
const ADMIN_ONLY: ReadonlySet<Topic> = new Set<Topic>([
  'announcement_review',
  'event_review',
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* Constant time string compare. A plain === leaks the length of the matching
   prefix through timing, which is a silly way to lose a secret that only
   protects a notification, but it costs four lines to not do it. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------ APNs auth
   Apple wants a JWT signed ES256 with the .p8 key, and it is happy to reuse
   one for up to an hour. We mint one per invocation, which is well inside
   Apple's rate limit on token creation and saves caching anything.
   ---------------------------------------------------------------------- */

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  return der;
}

async function apnsToken(keyId: string, teamId: string, privateKeyPem: string): Promise<string> {
  const header = { alg: 'ES256', kid: keyId };
  const claims = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const encoder = new TextEncoder();

  const signingInput =
    base64url(encoder.encode(JSON.stringify(header))) + '.' +
    base64url(encoder.encode(JSON.stringify(claims)));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  // WebCrypto returns the raw r||s pair, which is exactly what JWS ES256
  // wants. No DER unwrapping, unlike most Node examples you will find.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput)),
  );

  return signingInput + '.' + base64url(signature);
}

/* ---------------------------------------------------------- the message
   Written here rather than in the database because the copy is part of the
   product, and because a notification that says something different from the
   switch that asked for it is worse than no notification.
   ---------------------------------------------------------------------- */

interface Note { title: string; body: string; }

async function compose(
  topic: Topic,
  admin: ReturnType<typeof createClient>,
  ref: string | null,
): Promise<Note | null> {
  if (topic === 'test') {
    return { title: 'Home Church', body: 'This is a test. Push notifications are working.' };
  }

  if (topic === 'sunday_reminder') {
    const { data } = await admin
      .from('church_profile')
      .select('service_times, address_line1, address_city')
      .limit(1)
      .maybeSingle();

    const times: string[] = Array.isArray(data?.service_times) ? data!.service_times : [];
    const where = data?.address_line1 ? ` at ${data.address_line1}` : '';
    const when = times.length ? times.join(', ') : 'See you in the morning';

    return {
      title: 'See you tomorrow',
      body: times.length ? `${when}${where}.` : `Gathering tomorrow${where}.`,
    };
  }

  if (topic === 'new_guide') {
    // Only announce a guide that actually appeared since the last time we
    // announced one. A Monday with no new guide should be silent, not a
    // weekly lie. This is why push_log exists.
    const { data: lastRun } = await admin
      .from('push_log')
      .select('ran_at')
      .eq('topic', 'new_guide')
      .eq('skipped', false)
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // First ever run has no watermark. Use the last week rather than the whole
    // history, so switching this on does not announce a guide from March.
    const since = lastRun?.ran_at ?? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const { data: guide } = await admin
      .from('guides')
      .select('id, theme_title, subtitle, created_at')
      .eq('published', true)
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!guide) return null;

    // theme_title is nullable and is null on every row today, so the generic
    // line is the one that will actually ship. Kept the specific one because
    // it costs nothing and reads better the day somebody fills the field in.
    return {
      title: 'This week’s guide is up',
      body: guide.theme_title
        ? String(guide.theme_title)
        : 'Open it before your group meets.',
    };
  }

  if (topic === 'group_day') {
    return { title: 'Your group meets today', body: 'The guide is ready when you are.' };
  }

  /* An announcement is the one topic that is about a specific row rather than
     about whatever is newest, which is why hc_admin_send_announcement passes
     an id through as `ref`. "The newest published announcement" would be the
     wrong row every time somebody writes next month's announcement today,
     which is the whole reason announcements carry a date window.

     Composed from the row rather than from a fixed string, because unlike the
     Sunday reminder there is no sentence that covers every announcement. The
     title is the announcement's own title, so what lights up the lock screen
     is what is printed on the card they are being sent to.

     Returning null here is not a failure, it is the caller having named a row
     that has since been deleted or unpublished between the tap and the send.
     Nothing goes out and push_log records that nothing did. */
  if (topic === 'announcement') {
    if (!ref) return null;

    const { data: row } = await admin
      .from('announcements')
      .select('title, body, published')
      .eq('id', ref)
      .maybeSingle();

    if (!row || !row.published) return null;

    const title = String(row.title ?? '').trim();
    if (!title) return null;

    // APNs will happily deliver a paragraph and iOS will happily truncate it
    // mid-word on the lock screen. One sentence, or the eyebrow, is a better
    // thing to arrive than half of two sentences.
    const body = String(row.body ?? '').trim();
    return {
      title,
      body: body ? firstSentence(body) : 'Open the app to read it.',
    };
  }

  /* The two review topics.
   *
   * COUNTED AT SEND TIME RATHER THAN CARRIED IN. The intake knows exactly how
   * many drafts it just wrote and could pass that number through as `ref`, and
   * it deliberately does not. What an admin wants to know is how much is
   * waiting for them, not how much arrived in the last twenty minutes: a run
   * that adds one draft to a queue of three is "four things are waiting", and
   * telling them "1 new announcement" while three others sit unlooked-at is
   * how a queue quietly grows. So the intake decides WHETHER to send, because
   * only it knows something changed, and this decides WHAT to say, because
   * only the table knows what is true right now.
   *
   * A queue that emptied between the two is the null case, and it is a real
   * one: an admin who was already on the screen can approve everything in the
   * seconds it takes pg_net to hand this request over. Nothing goes out and
   * push_log records that nothing did, which is the same shape as a Monday
   * with no new guide.
   */
  if (topic === 'announcement_review') {
    const { count } = await admin
      .from('announcements')
      .select('id', { count: 'exact', head: true })
      .eq('review_state', 'pending');

    const waiting = count ?? 0;
    if (!waiting) return null;

    return {
      title: waiting === 1 ? 'An announcement needs you' : `${waiting} announcements need you`,
      body: 'Parsed out of the newsletter, and on nobody’s Home until you approve it.',
    };
  }

  /* The dates queue. Its own topic rather than a line in the one above,
   * because 0041 split the queues on the argument that vouching for a date
   * that lands in somebody's calendar is not the same act as approving the
   * wording of a card. A notification that merged them back would undo that
   * on the only screen where the difference is visible.
   */
  if (topic === 'event_review') {
    const { count } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('review_state', 'pending');

    const waiting = count ?? 0;
    if (!waiting) return null;

    return {
      title: waiting === 1 ? 'A date needs you' : `${waiting} dates need you`,
      body: 'Nothing reaches the calendar until you say so.',
    };
  }

  return null;
}

/* The first sentence, or the first 140 characters on a body that does not
   have one. Cheap and deliberately not clever: a church announcement is
   written in plain sentences and the failure mode of getting this slightly
   wrong is a notification that reads a few words long, not a broken send. */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const end = flat.search(/[.!?](\s|$)/);
  if (end !== -1 && end < 200) return flat.slice(0, end + 1);
  return flat.length > 140 ? flat.slice(0, 139).trimEnd() + '\u2026' : flat;
}

/* --------------------------------------------------------------- sending */

interface SendOutcome { ok: boolean; retire: boolean; reason?: string; }

async function sendOne(
  host: string,
  token: string,
  jwt: string,
  bundleId: string,
  note: Note,
  topic: Topic,
  collapseId: string,
): Promise<SendOutcome> {
  try {
    const res = await fetch(`https://${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        // A phone that was off all weekend should not get Saturday's reminder
        // on Monday. Six hours is long enough to survive a flat battery and
        // short enough that nothing arrives stale.
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 6 * 3600),
        // Two sends of the same topic collapse into one on the lock screen
        // rather than stacking, which matters if a job is ever retried.
        //
        // Announcements are the exception and pass their own id, because two
        // announcements in one week are two different things to say and
        // collapsing them would silently replace the first on the lock screen
        // of anybody who had not looked yet. Same reasoning, opposite answer:
        // the rule is one notification per thing, and for the clock topics the
        // thing is the topic.
        'apns-collapse-id': collapseId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        aps: {
          alert: { title: note.title, body: note.body },
          sound: 'default',
          'thread-id': topic,
        },
      }),
    });

    if (res.ok) return { ok: true, retire: false };

    const detail = await res.text().catch(() => '');
    let reason = detail;
    try { reason = JSON.parse(detail)?.reason ?? detail; } catch { /* not json */ }

    // 410 Unregistered means the app was deleted from that phone. Apple is
    // explicit that continuing to send to it is a problem, and it is also just
    // rude bookkeeping. BadDeviceToken usually means the wrong gateway, but it
    // is equally dead for our purposes on this host.
    const retire = res.status === 410 ||
      reason === 'Unregistered' ||
      reason === 'BadDeviceToken';

    return { ok: false, retire, reason: `${res.status} ${reason}` };
  } catch (err) {
    return { ok: false, retire: false, reason: String(err) };
  }
}

/* ------------------------------------------------------------------ main */

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const cronSecret = Deno.env.get('HC_PUSH_CRON_SECRET');
  if (!cronSecret) {
    console.error('send-push: HC_PUSH_CRON_SECRET is not set on this function');
    return json({ error: 'Not configured.' }, 500);
  }

  const presented = req.headers.get('x-hc-cron-secret') ?? '';
  if (!secretsMatch(presented, cronSecret)) {
    return json({ error: 'No.' }, 401);
  }

  let body: { topic?: string; dry_run?: boolean; ref?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const topic = body.topic as Topic;
  if (!topic || !(topic in TOPIC_COLUMN)) {
    return json({ error: `Unknown topic: ${String(body.topic)}` }, 400);
  }
  const dryRun = body.dry_run === true;
  // Only `announcement` uses this. Everything else composes itself.
  const ref = typeof body.ref === 'string' && body.ref ? body.ref : null;

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Platform env missing.' }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Compose first. If there is nothing to say, say nothing and write down
  // that we deliberately said nothing, so a quiet Monday is distinguishable
  // from a broken one when somebody reads push_log in three weeks.
  const note = await compose(topic, admin, ref);
  if (!note) {
    await admin.from('push_log').insert({
      topic, skipped: true, note: 'Nothing new to announce.',
    });
    return json({ ok: true, skipped: true, reason: 'nothing new' });
  }

  let query = admin.from('device_tokens').select('token').eq('active', true);
  const column = TOPIC_COLUMN[topic];
  if (column) query = query.eq(column, true);

  /* WHO IS AN ADMIN IS ASKED OF profiles, EVERY TIME.
   *
   * device_tokens.admin_user_id says whose phone this is. It does not say that
   * they are still an admin, and the gap between those two is the whole reason
   * this is a second query rather than a `not null` filter.
   *
   * A person who is demoted keeps their phone. Nothing in the app runs on that
   * phone at the moment the church takes the role away, so nothing clears the
   * row, and the only honest place to notice is here, at the moment of
   * addressing. Asking profiles on every send means the send after a demotion
   * is the last one that phone gets, with no cleanup job, no trigger, and no
   * window where a former admin is still hearing what is in the queue.
   *
   * The cost is one query over a partial index of a handful of rows, on a
   * topic that fires a few times a week.
   */
  if (ADMIN_ONLY.has(topic)) {
    const { data: admins, error: adminError } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (adminError) {
      await admin.from('push_log').insert({
        topic, failed: 1, note: `Could not read profiles: ${adminError.message}`,
      });
      return json({ error: adminError.message }, 500);
    }

    const ids = (admins ?? []).map((r) => r.id as string);
    if (ids.length === 0) {
      await admin.from('push_log').insert({
        topic, skipped: true, note: 'Nobody is an admin, so there is nobody to tell.',
      });
      return json({ ok: true, skipped: true, recipients: 0 });
    }

    query = query.in('admin_user_id', ids);
  }

  const { data: rows, error: readError } = await query;
  if (readError) {
    await admin.from('push_log').insert({
      topic, failed: 1, note: `Could not read device_tokens: ${readError.message}`,
    });
    return json({ error: readError.message }, 500);
  }

  const tokens = (rows ?? []).map((r) => r.token as string);

  if (dryRun) {
    return json({ ok: true, dry_run: true, topic, recipients: tokens.length, note });
  }

  if (tokens.length === 0) {
    await admin.from('push_log').insert({
      topic, skipped: true, note: 'No phones have asked for this one.',
    });
    return json({ ok: true, skipped: true, recipients: 0 });
  }

  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY');
  const bundleId = Deno.env.get('APNS_BUNDLE_ID');
  const host = Deno.env.get('APNS_HOST') ?? 'api.push.apple.com';

  if (!keyId || !teamId || !privateKey || !bundleId) {
    const missing = [
      !keyId && 'APNS_KEY_ID', !teamId && 'APNS_TEAM_ID',
      !privateKey && 'APNS_PRIVATE_KEY', !bundleId && 'APNS_BUNDLE_ID',
    ].filter(Boolean).join(', ');
    console.error('send-push: missing', missing);
    await admin.from('push_log').insert({
      topic, recipients: tokens.length, failed: tokens.length,
      note: `APNs is not configured: ${missing} not set.`,
    });
    return json({ error: `APNs is not configured. Missing: ${missing}` }, 500);
  }

  let jwt: string;
  try {
    jwt = await apnsToken(keyId, teamId, privateKey);
  } catch (err) {
    // Almost always a mangled APNS_PRIVATE_KEY: pasted without the BEGIN and
    // END lines, or with the newlines eaten by a shell.
    console.error('send-push: could not sign the APNs token', err);
    await admin.from('push_log').insert({
      topic, recipients: tokens.length, failed: tokens.length,
      note: `Could not sign the APNs token. Check APNS_PRIVATE_KEY. ${err}`,
    });
    return json({ error: 'Could not sign the APNs token. Check APNS_PRIVATE_KEY.' }, 500);
  }

  const deliveredTokens: string[] = [];
  const failures: string[] = [];
  const retire: string[] = [];

  // See the note next to apns-collapse-id in sendOne().
  const collapseId = topic === 'announcement' && ref ? `announcement:${ref}` : topic;

  // Batched rather than all at once. This church is small enough that it will
  // never matter, and a congregation-sized list opening 400 sockets at once
  // would matter a lot.
  const BATCH = 20;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const slice = tokens.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((t) => sendOne(host, t, jwt, bundleId, note, topic, collapseId)),
    );
    results.forEach((r, n) => {
      if (r.ok) deliveredTokens.push(slice[n]);
      else {
        failures.push(r.reason ?? 'unknown');
        if (r.retire) retire.push(slice[n]);
      }
    });
  }

  if (retire.length) {
    await admin.from('device_tokens')
      .update({ active: false, last_error: 'Retired: APNs says this phone is gone.' })
      .in('token', retire);
  }

  if (deliveredTokens.length) {
    await admin.from('device_tokens')
      .update({ last_push_at: new Date().toISOString(), failure_count: 0, last_error: null })
      .in('token', deliveredTokens);
  }

  const delivered = deliveredTokens.length;
  const failed = tokens.length - delivered;
  await admin.from('push_log').insert({
    topic,
    recipients: tokens.length,
    delivered,
    failed,
    retired: retire.length,
    note: failed ? failures.slice(0, 5).join(' | ').slice(0, 500) : null,
  });

  console.log(`send-push: ${topic} delivered ${delivered}/${tokens.length}, retired ${retire.length}`);
  return json({ ok: true, topic, recipients: tokens.length, delivered, failed, retired: retire.length });
});
