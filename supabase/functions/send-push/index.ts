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

type Topic = 'new_guide' | 'sunday_reminder' | 'group_day' | 'test';

const TOPIC_COLUMN: Record<Topic, string | null> = {
  new_guide: 'wants_new_guide',
  sunday_reminder: 'wants_sunday_reminder',
  group_day: 'wants_group_day',
  test: null, // a test goes to every active phone, on purpose
};

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

async function compose(topic: Topic, admin: ReturnType<typeof createClient>): Promise<Note | null> {
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

  return null;
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
        'apns-collapse-id': topic,
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

  let body: { topic?: string; dry_run?: boolean };
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

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Platform env missing.' }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Compose first. If there is nothing to say, say nothing and write down
  // that we deliberately said nothing, so a quiet Monday is distinguishable
  // from a broken one when somebody reads push_log in three weeks.
  const note = await compose(topic, admin);
  if (!note) {
    await admin.from('push_log').insert({
      topic, skipped: true, note: 'Nothing new to announce.',
    });
    return json({ ok: true, skipped: true, reason: 'nothing new' });
  }

  let query = admin.from('device_tokens').select('token').eq('active', true);
  const column = TOPIC_COLUMN[topic];
  if (column) query = query.eq(column, true);

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

  // Batched rather than all at once. This church is small enough that it will
  // never matter, and a congregation-sized list opening 400 sockets at once
  // would matter a lot.
  const BATCH = 20;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const slice = tokens.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((t) => sendOne(host, t, jwt, bundleId, note, topic)),
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
