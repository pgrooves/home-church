/**
 * Home Church, filling the Instagram rail from post links.
 *
 * WHAT IT DOES. Takes a list of links to the church's own Instagram posts,
 * fetches each one, mirrors its picture into the `instagram` Storage bucket,
 * and upserts a row into `instagram_posts`. That table is the rail across the
 * top of Connect, and `js/content.js` reads it on every app open, so a run of
 * this reaches every phone with no App Store build.
 *
 * WHY IT IS A FUNCTION AND NOT THE SCRIPT NEXT DOOR. `scripts/
 * fetch_instagram_posts.js` does the same job and is the better tool when
 * somebody is at a keyboard. It cannot be run from a phone, and not for the
 * reason it first looks: the blocker is Storage. Neither the Supabase MCP
 * server nor `hc_supabase.py` can put a file in a bucket, so a web session can
 * write the row and not the picture, and a row without its picture is dropped
 * by Connect. Here the service role key is injected by the platform, so the
 * upload happens where the key already is and never travels.
 *
 * WHY IT ASKS AS A CRAWLER, which is the single load bearing detail in this
 * file. Request a post page as a browser and Instagram returns its JavaScript
 * application: 200, about 600KB, 81% script, no og: tags, no media object, and
 * not one mention of the account. The post is fetched later by code that only
 * runs in a browser. Request the same URL as a link preview crawler and
 * Instagram server renders the whole post, because that is how a link pasted
 * into WhatsApp gets a preview card; their own flag for it, `if_is_crawler`,
 * comes back in the response. Change UA below to a browser string and this
 * function stops working entirely and looks, from its output, exactly as
 * though the account had gone private.
 *
 * WHAT IT WILL NOT DO.
 *
 *   It will not guess a date. `posted_at` is not only a sort key: connect.js
 *   reads it into each tile's aria-label, so it is never drawn on screen and
 *   it is read aloud, as fact, to exactly the people who cannot see the
 *   picture and check it. A post whose real timestamp did not come back is
 *   skipped, not published under a plausible one.
 *
 *   It will not touch a post that is not the church's own. Every media object
 *   carries the username that posted it, and it is checked against the handle
 *   on the `church_profile` row. The rail is the church's own feed, and this
 *   is also what keeps the blast radius of the shared secret below to nothing
 *   worth having.
 *
 *   It will not store an instagram.com URL. Their CDN links are signed and
 *   expire within days, so a stored one goes blank on its own, and pointing
 *   phones at them would hand Meta every congregant's IP address on every
 *   visit to Connect. The bytes are mirrored and `image_path` is an object
 *   path in the bucket. Migration 0015 is the long version.
 *
 * HOW IT IS CALLED. Not from the app, and not by anybody signed in. Same shape
 * as `send-push`: a shared secret in `x-hc-instagram-secret`, checked against a
 * vault secret, so `verify_jwt` is off and this does its own door. The one
 * difference from 0012 is that the expected value is read from the vault at
 * run time rather than from a function secret, because a function secret
 * cannot be set from a web session and the vault can.
 *
 *   select public.hc_fetch_instagram(array[
 *     'https://www.instagram.com/p/DcHwSuzCUYq/'
 *   ]);
 *
 * Unlike `hc_send_push` this is not fire and forget: pg_net returns a request
 * id, and the reply lands in `net._http_response`, because the whole point of
 * a run is knowing which posts made it.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BUCKET = 'instagram';
const MAX_LINKS = 12;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

/* ---------------------------------------------------------------- reading */

/** The shapes a link arrives in, all of which are the same post. `/reel/` and
 *  `/tv/` mean video; the page overrules that when it says. */
function shortcodeOf(link: string): string | null {
  const m = String(link || '').match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

/** Balanced scan from a `{`, tracking strings and their escapes so a brace
 *  inside a caption does not end the object early. A regex cannot do this. */
function sliceAt(text: string, start: number): string | null {
  if (text[start] !== '{') return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** The media object for one post.
 *
 *  A carousel embeds one of these per slide, each with its own `code`, so the
 *  first match in the page is usually a single photograph rather than the
 *  post. The one whose `code` is the shortcode that was asked for is the one
 *  that counts, and it has to carry the id and the timestamp the row needs. */
// deno-lint-ignore no-explicit-any
function extractMedia(html: string, shortcode: string): any | null {
  const NEEDLE = '{"__typename":"XIGPolaris';
  for (let at = html.indexOf(NEEDLE); at >= 0; at = html.indexOf(NEEDLE, at + 1)) {
    const raw = sliceAt(html, at);
    if (!raw) continue;
    try {
      const media = JSON.parse(raw);
      if (media?.pk && media?.taken_at && media.code === shortcode) return media;
    } catch { /* one unparsable candidate is not a failure */ }
  }
  return null;
}

/** Instagram's own numbering: 1 a photo, 2 a video, 8 a carousel. A reel is a
 *  video whose product_type is `clips`. Anything unfamiliar draws as a still,
 *  because the play badge is a promise about what a tap does. */
// deno-lint-ignore no-explicit-any
function mediaTypeOf(media: any): string {
  if (media.media_type === 8 || media.product_type === 'carousel_container') {
    return 'CAROUSEL_ALBUM';
  }
  if (media.media_type === 2 || media.product_type === 'clips') return 'VIDEO';
  return 'IMAGE';
}

/** Instagram allows 2200 characters. The tile reads the first line and the app
 *  does its own truncating, so this only tidies what a phone keyboard left. */
function normalizeCaption(s: string): string {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2200);
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'
};

/* ------------------------------------------------------------------ serve */

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

  /* The door. The expected value lives in the vault rather than in a function
     secret, so that it can be created and rotated from a web session.

     Asked for through an RPC in `public` rather than by reading the vault
     schema directly: the Data API serves only its exposed schemas, so
     `.schema('vault')` is refused with a 406 before any row is read, however
     complete service_role's grants on the view are. Migration 0060 is the
     long version. The secret itself has not moved. */
  const presented = req.headers.get('x-hc-instagram-secret') ?? '';
  const { data: expected, error: secretErr } = await admin
    .rpc('hc_instagram_secret');

  if (secretErr || !expected) {
    console.error(
      'instagram-fetch: could not read hc_instagram_secret: ' +
      (secretErr?.message ?? 'the vault returned nothing under that name')
    );
    return json({ error: 'not configured' }, 500);
  }
  if (presented !== expected) {
    return json({ error: 'forbidden' }, 403);
  }

  let body: { links?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const links = Array.isArray(body.links) ? body.links.map(String) : [];
  if (!links.length) return json({ error: 'no links' }, 400);
  if (links.length > MAX_LINKS) {
    return json({ error: 'at most ' + MAX_LINKS + ' links per call' }, 400);
  }

  /* Whose feed this rail is. A link to somebody else's post is refused rather
     than mirrored: the rail is the church's own, and this is what keeps the
     shared secret from being worth stealing. */
  const { data: church } = await admin
    .from('church_profile').select('social').maybeSingle();
  const handleFrom = JSON.stringify(church?.social ?? '')
    .match(/instagram\.com\\?\/([A-Za-z0-9_.]+)/i);
  const handle = handleFrom ? handleFrom[1].toLowerCase() : null;
  if (!handle) {
    return json({ error: 'no instagram handle on the church row, so nothing to check against' }, 500);
  }

  const wrote: unknown[] = [];
  const skipped: unknown[] = [];

  for (const [index, link] of links.entries()) {
    const shortcode = shortcodeOf(link);
    if (!shortcode) { skipped.push({ link, why: 'not an instagram post link' }); continue; }

    // Paced, because a dozen links at once is what trips the rate limiter.
    if (index) await new Promise((r) => setTimeout(r, 1500));

    const permalink = 'https://www.instagram.com/p/' + shortcode + '/';
    try {
      const res = await fetch(permalink, {
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });

      if (res.status === 429 || /\/accounts\/login\//.test(res.url ?? '')) {
        skipped.push({ shortcode, why: 'rate limited by Instagram, try again later' });
        continue;
      }
      if (!res.ok) { skipped.push({ shortcode, why: 'HTTP ' + res.status }); continue; }

      const html = await res.text();
      const media = extractMedia(html, shortcode);
      if (!media) {
        skipped.push({
          shortcode,
          why: /og:image/.test(html)
            ? 'the page arrived but the media object did not parse; Instagram has renamed something'
            : 'the page had no post in it'
        });
        continue;
      }

      const who = String(media.user?.username ?? '').toLowerCase();
      if (who && who !== handle) {
        skipped.push({ shortcode, why: 'posted by @' + who + ', not @' + handle });
        continue;
      }

      const imageUrl = media.display_uri || media.image_versions2?.candidates?.[0]?.url;
      if (!imageUrl) { skipped.push({ shortcode, why: 'no picture on the media object' }); continue; }

      const img = await fetch(imageUrl, { headers: { 'User-Agent': UA } });
      if (!img.ok) { skipped.push({ shortcode, why: 'picture: HTTP ' + img.status }); continue; }
      const type = (img.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
      const bytes = new Uint8Array(await img.arrayBuffer());

      const id = String(media.pk);
      const objectPath = id + '.' + (EXT[type] ?? 'jpg');

      const { error: upErr } = await admin.storage.from(BUCKET)
        .upload(objectPath, bytes, { contentType: type, upsert: true });
      if (upErr) { skipped.push({ shortcode, why: 'upload: ' + upErr.message }); continue; }

      /* The row is written only after the picture is in the bucket. The other
         order leaves a window in which Connect draws a tile over nothing. */
      const row = {
        id,
        permalink,
        image_path: objectPath,
        media_type: mediaTypeOf(media),
        caption: normalizeCaption(media.caption?.text ?? ''),
        posted_at: new Date(media.taken_at * 1000).toISOString(),
        published: true
      };

      const { error: rowErr } = await admin.from('instagram_posts').upsert(row);
      if (rowErr) { skipped.push({ shortcode, why: 'row: ' + rowErr.message }); continue; }

      wrote.push({
        shortcode, id, media_type: row.media_type, posted_at: row.posted_at,
        bytes: bytes.length, caption: row.caption.split('\n')[0].slice(0, 60)
      });
    } catch (e) {
      skipped.push({ shortcode, why: String((e as Error)?.message ?? e) });
    }
  }

  return json({ wrote, skipped, counts: { wrote: wrote.length, skipped: skipped.length } });
});
