/**
 * Home Church, keeping the Instagram rail current.
 *
 * WHAT IT DOES. Finds the church's newest Instagram posts, mirrors each
 * picture into the `instagram` Storage bucket, and upserts a row into
 * `instagram_posts`. That table is the rail across the top of Connect, and
 * `js/content.js` reads it on every app open, so a run of this reaches every
 * phone with no App Store build. pg_cron runs it hourly (migration 0070), and
 * it can be handed links to fetch instead, for a post out of order.
 *
 * WHERE THE WORK IS. sync.mjs is one run, start to finish, with the network
 * and the database handed in, and parse.mjs is everything that reads what
 * Instagram sends. Both are plain JavaScript so tests/instagram-fetch.test.js
 * runs the same lines. This file is the door, the store, and the run log.
 *
 * WHERE IT LOOKS, which is the part that changed after 15 October 2026. From
 * September the sync found new posts through one door: Instagram had stopped
 * answering a crawler's request for the profile page, so it read the page of
 * the newest post already on the rail, which lists two dozen others from the
 * same account. On the 15th the church deleted or archived that post, its
 * page became the empty JavaScript app, and every run failed for three and a
 * half days with nobody told. Nothing in this project had changed. So the
 * first place it looks is now the official API, which the church can switch
 * on with a token in the vault (INSTAGRAM_SYNC_SETUP.md), the crawler routes
 * behind it have three doors rather than one, and a rail that stops updating
 * now reaches the admins' phones (0092). sync.mjs's header has the order.
 *
 * WHY THE PAGES ARE ASKED FOR AS A CRAWLER. Request a post page as a browser
 * and Instagram returns its JavaScript application: 200, about 600KB, no og:
 * tags, no media object, not one mention of the account. Request it as a
 * link preview crawler and Instagram renders the whole post, because that is
 * how a link pasted into WhatsApp gets a preview card. Change CRAWLER_UA to a
 * browser string and that route stops working entirely, and looks, from its
 * output, exactly as though the account had gone private.
 *
 * WHAT IT WILL NOT DO.
 *
 *   It will not guess a date. `posted_at` is not only a sort key: connect.js
 *   reads it into each tile's aria-label, so it is read aloud, as fact, to
 *   exactly the people who cannot see the picture and check it. A post whose
 *   real timestamp did not come back is not published under a plausible one.
 *
 *   It will not touch a post that is not the church's own. Every source says
 *   who posted each post, and it is checked against the handle on the
 *   `church_profile` row. This is also what keeps the blast radius of the
 *   shared secret below to nothing worth having.
 *
 *   It will not store an instagram.com URL. Their CDN links are signed and
 *   expire within days, and pointing phones at them would hand Meta every
 *   congregant's IP address on every visit to Connect. The bytes are
 *   mirrored and `image_path` is an object path in the bucket. 0015 says more.
 *
 * HOW IT IS CALLED. Not from the app, and not by anybody signed in. Same shape
 * as `send-push`: a shared secret in `x-hc-instagram-secret`, checked against a
 * vault secret, so `verify_jwt` is off and this does its own door.
 *
 *   select public.hc_sync_instagram(9);                    -- what pg_cron runs
 *   select public.hc_fetch_instagram(array[
 *     'https://www.instagram.com/p/DcHwSuzCUYq/'           -- or, by hand
 *   ]);
 *
 * AND EVERY RUN WRITES ITS OWN OUTCOME to `instagram_sync_runs`. pg_net hands
 * pg_cron a request id the moment the request is queued, so pg_cron records
 * this job as `succeeded` whatever happens next. That table is the only
 * honest record, and since 0092 hc_instagram_watch reads it every hour and
 * tells the admins' phones when the rail has been stuck for six hours.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { runSync } from './sync.mjs';

const BUCKET = 'instagram';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

/* Compared without stopping at the first wrong character, the same as every
   other secret check in supabase/functions (send-push, homekids-drive), so
   how long a refusal takes says nothing about how close a guess was. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('instagram-fetch: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ error: 'not configured' }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  /* Every exit from here on writes one row to instagram_sync_runs.
   *
   * `note` arrived with 0092. If this deploy ever runs ahead of that
   * migration, the insert is tried again without it, because a log that
   * fails silently on a missing column has happened here once already (0062
   * says how) and blinded the very thing it was for. */
  // deno-lint-ignore no-explicit-any
  const finish = async (report: any, status = 200) => {
    const row = {
      ok: Boolean(report?.ok),
      trigger: report?.trigger ?? 'cron',
      via: report?.via ?? null,
      discovered: report?.counts?.discovered ?? 0,
      wrote: report?.counts?.wrote ?? 0,
      skipped: report?.counts?.skipped ?? 0,
      error: report?.ok ? null : String(report?.error ?? 'unknown'),
      note: report?.note ?? null
    };
    try {
      let { error } = await admin.from('instagram_sync_runs').insert(row);
      if (error) {
        console.error('instagram-fetch: run log refused the row, trying without note: ' + error.message);
        const { note: _note, ...bare } = row;
        ({ error } = await admin.from('instagram_sync_runs').insert(bare));
      }
      if (error) console.error('instagram-fetch: could not write the run log: ' + error.message);
    } catch (e) {
      // A log write that fails must not turn a good run into a bad response.
      console.error('instagram-fetch: could not write the run log: ' + String(e));
    }
    return json(report, status);
  };

  /* The door. The expected value lives in the vault rather than in a function
     secret, so that it can be created and rotated from a web session, and is
     asked for through an RPC because the Data API does not serve the vault
     schema. Migration 0060 is the long version. */
  const presented = req.headers.get('x-hc-instagram-secret') ?? '';
  const { data: expected, error: secretErr } = await admin.rpc('hc_instagram_secret');

  if (secretErr || !expected) {
    console.error(
      'instagram-fetch: could not read hc_instagram_secret: ' +
      (secretErr?.message ?? 'the vault returned nothing under that name')
    );
    return json({ error: 'not configured' }, 500);
  }
  if (!secretsMatch(presented, String(expected))) {
    return json({ error: 'forbidden' }, 403);
  }

  let body: { links?: unknown; limit?: unknown; force?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const links = Array.isArray(body.links) ? body.links.map(String) : null;
  const trigger = links?.length ? 'links' : 'cron';

  /* Whose feed this rail is. Used to find the posts, and to refuse a post
     that is not the church's own. */
  const { data: church } = await admin
    .from('church_profile').select('social').maybeSingle();
  const handleFrom = JSON.stringify(church?.social ?? '')
    .match(/instagram\.com\\?\/([A-Za-z0-9_.]+)/i);
  const handle = handleFrom ? handleFrom[1].toLowerCase() : null;
  if (!handle) {
    return await finish({
      ok: false, trigger,
      error: 'no instagram handle on the church_profile row to check against'
    }, 500);
  }

  /* The store sync.mjs writes through. Each method throws with the reason,
     so a refused write reaches the run log as a sentence. */
  const store = {
    async postIds(): Promise<string[]> {
      const { data, error } = await admin.from('instagram_posts').select('id');
      // Not treated as an empty rail: that would refetch every post on it.
      if (error) throw new Error('could not read instagram_posts: ' + error.message);
      return (data ?? []).map((r: { id: unknown }) => String(r.id));
    },
    async upload(path: string, bytes: Uint8Array, contentType: string) {
      const { error } = await admin.storage.from(BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(error.message);
    },
    async upsertPost(row: Record<string, unknown>) {
      const { error } = await admin.from('instagram_posts').upsert(row);
      if (error) throw new Error(error.message);
    },
    /* The official API's token, if the church has stored one (0092). An RPC
       that does not exist yet is the same as no token: the crawler routes
       still run, which is exactly what this did before 0092. */
    async token() {
      const { data, error } = await admin.rpc('hc_instagram_token');
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : data;
      return row?.token ? { token: String(row.token), savedAt: row.saved_at ?? null } : null;
    },
    async saveToken(token: string) {
      const { error } = await admin.rpc('hc_instagram_save_token', { p_token: token });
      if (error) throw new Error(error.message);
    }
  };

  let report;
  try {
    report = await runSync({
      handle,
      limit: Number(body.limit) || 9,
      links,
      force: Boolean(body.force),
      store,
      http: fetch
    });
  } catch (e) {
    return await finish({
      ok: false, trigger, handle,
      error: 'the run itself failed: ' + String((e as Error)?.message ?? e)
    }, 500);
  }

  return await finish(report, report.ok ? 200 : 503);
});
