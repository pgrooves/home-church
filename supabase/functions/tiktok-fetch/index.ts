/**
 * Home Church, keeping the TikTok frame on Home current.
 *
 * WHAT IT DOES. Reads the church's TikTok creator embed, takes the posts not
 * already stored, mirrors each cover picture into the `tiktok` Storage bucket,
 * and upserts a row into `tiktok_posts`. Home draws the newest row in a frame
 * under the Instagram one, and `js/content.js` reads the table on every app
 * open, so a run of this reaches every phone with no App Store build.
 * Scheduled hourly by migration 0080. Nobody has to open TikTok.
 *
 * WHY THE EMBED AND NOT THE PROFILE, which is the load bearing decision here.
 * Asked for by a logged out visitor, tiktok.com/@handle is a 400KB page whose
 * `itemList` is empty: the videos are fetched afterwards by signed API calls
 * that only TikTok's own JavaScript can make. Asked as Googlebot it is a 403.
 * The creator embed, tiktok.com/embed/@handle, is what a website pastes in to
 * show somebody's recent videos, so it is server rendered with them already
 * in it: a `videoList` of about a dozen posts carrying id, caption, cover and
 * the account that posted each one. One request gives everything a row needs.
 *
 * WHERE THE DATE COMES FROM. The embed has no timestamp, and posted_at is the
 * one field that must not be guessed: Home calls this post "latest". A TikTok
 * id's top 32 bits are the Unix second it was created, so the date is read
 * out of the id. See postedAtOf in parse.mjs.
 *
 * WHAT IT WILL NOT DO, same as instagram-fetch:
 *
 *   It will not store a tiktokcdn URL. Those are signed and expire, and
 *   pointing phones at them would hand TikTok every congregant's IP address.
 *
 *   It will not store a post that is not the church's own. Every embed item
 *   names its author and it is checked against the TikTok handle on the
 *   `church_profile` row.
 *
 * HOW IT IS CALLED. By `hc_sync_tiktok()` from pg_cron, with a shared secret
 * in `x-hc-tiktok-secret` checked against the vault, so `verify_jwt` is off
 * and this does its own door. Every exit writes one row to `tiktok_sync_runs`,
 * because pg_cron records the job as succeeded whatever happens here.
 *
 *   select public.hc_sync_tiktok(9);
 *   select * from public.tiktok_sync_runs order by ran_at desc limit 5;
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { freshPosts, handleFrom, looksLikeEmbed, videoList } from './parse.mjs';

/* A browser, not a crawler. The opposite of instagram-fetch, and on purpose:
   TikTok refuses Googlebot outright and serves the embed to anybody who looks
   like a person reading a church website. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const BUCKET = 'tiktok';
const MAX = 12;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('tiktok-fetch: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ error: 'not configured' }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const started = Date.now();
  // deno-lint-ignore no-explicit-any
  const finish = async (ok: boolean, body: any, status = 200) => {
    try {
      await admin.from('tiktok_sync_runs').insert({
        ok,
        trigger: 'cron',
        discovered: body?.counts?.discovered ?? 0,
        wrote: body?.counts?.wrote ?? 0,
        skipped: body?.counts?.skipped ?? 0,
        error: ok ? null : String(body?.error ?? 'unknown')
      });
    } catch (e) {
      // A log write that fails must not turn a good run into a bad response.
      console.error('tiktok-fetch: could not write the run log: ' + String(e));
    }
    return json(body, status);
  };

  /* The door. Unlogged on purpose: a request without the secret is not a run. */
  const presented = req.headers.get('x-hc-tiktok-secret') ?? '';
  const { data: expected, error: secretErr } = await admin.rpc('hc_tiktok_secret');
  if (secretErr || !expected) {
    console.error('tiktok-fetch: could not read hc_tiktok_secret: ' +
      (secretErr?.message ?? 'the vault returned nothing under that name'));
    return json({ error: 'not configured' }, 500);
  }
  if (presented !== expected) return json({ error: 'forbidden' }, 403);

  let body: { limit?: unknown; force?: unknown } = {};
  try { body = await req.json(); } catch { /* an empty body is the default run */ }
  const limit = Math.min(Math.max(Number(body.limit) || 9, 1), MAX);

  const { data: church } = await admin
    .from('church_profile').select('social').maybeSingle();
  const handle = handleFrom(church?.social);
  if (!handle) {
    return await finish(false,
      { error: 'no tiktok handle on the church_profile row to read' }, 500);
  }

  /* What is already stored, so a run with nothing new downloads nothing.
     `force` refetches everything in the embed, for a cover that changed. */
  const already = new Set<string>();
  if (!body.force) {
    const { data: rows } = await admin.from('tiktok_posts').select('id');
    for (const r of rows ?? []) already.add(String(r.id));
  }

  let html: string;
  try {
    const res = await fetch('https://www.tiktok.com/embed/@' + handle, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) {
      return await finish(false, { error: 'the embed answered HTTP ' + res.status }, 503);
    }
    html = await res.text();
  } catch (e) {
    return await finish(false,
      { error: 'the embed did not answer: ' + String((e as Error)?.message ?? e) }, 503);
  }

  const list = videoList(html);
  if (!list) {
    return await finish(false, {
      error: looksLikeEmbed(html)
        ? 'the embed arrived but had no videoList in it; TikTok has renamed something'
        : 'TikTok sent something other than the embed (' + html.length + ' bytes)'
    }, 503);
  }

  const discovered = list.length;
  const { posts, skipped } = freshPosts(list, handle, already, limit);
  const wrote: unknown[] = [];

  for (const post of posts) {
    try {
      const img = await fetch(post.coverUrl, { headers: { 'User-Agent': UA } });
      if (!img.ok) { skipped.push({ id: post.id, why: 'cover: HTTP ' + img.status }); continue; }
      const type = (img.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
      const bytes = new Uint8Array(await img.arrayBuffer());
      const objectPath = post.id + '.' + (EXT[type] ?? 'jpg');

      const { error: upErr } = await admin.storage.from(BUCKET)
        .upload(objectPath, bytes, { contentType: type, upsert: true });
      if (upErr) { skipped.push({ id: post.id, why: 'upload: ' + upErr.message }); continue; }

      /* The row only after the picture is in the bucket. The other order
         leaves a window in which Home draws a frame over nothing. */
      const { error: rowErr } = await admin.from('tiktok_posts').upsert({
        id: post.id,
        permalink: post.permalink,
        image_path: objectPath,
        media_type: post.mediaType,
        caption: post.caption,
        posted_at: post.postedAt,
        published: true
      });
      if (rowErr) { skipped.push({ id: post.id, why: 'row: ' + rowErr.message }); continue; }

      wrote.push({
        id: post.id, media_type: post.mediaType, posted_at: post.postedAt,
        bytes: bytes.length, caption: post.caption.split('\n')[0].slice(0, 60)
      });
    } catch (e) {
      skipped.push({ id: post.id, why: String((e as Error)?.message ?? e) });
    }
  }

  return await finish(true, {
    handle, discovered, wrote, skipped,
    counts: { discovered, wrote: wrote.length, skipped: skipped.length },
    note: posts.length ? undefined : 'nothing newer than what is already stored',
    ms: Date.now() - started
  });
});
