/**
 * Home Church, one run of the Instagram sync.
 *
 * Everything the Edge Function does between "the caller is allowed in" and
 * "write down how it went", with the network and the database handed in
 * rather than reached for. index.ts passes fetch and a store backed by
 * Supabase; tests/instagram-fetch.test.js passes fixtures and a Map, so the
 * tests run the same decisions the live sync makes.
 *
 * WHERE IT LOOKS, IN ORDER, stopping at the first place that answers:
 *
 *   1. The official API, once the church has put a token in the vault (see
 *      INSTAGRAM_SYNC_SETUP.md). One request, every field, and nothing in it
 *      depends on what Instagram shows a stranger: no crawler pages, no
 *      throttle, and no door that the church taking a post down can shut.
 *   2. The newest three posts already on the rail, asked for as a crawler. A
 *      post page lists two dozen others from the same account, and from 13
 *      September every good run came in through one of these pages, the
 *      newest. On the morning of 15 October the church deleted or archived
 *      that post, its page became the empty app, and the sync was locked out
 *      of the feed for three and a half days. Three doors now, not one.
 *   3. The public profile JSON, which carries dates, and which says why in
 *      Instagram's own words when it refuses. On 18 October it was refusing
 *      every account with a business category, so it is here for the day
 *      Instagram mends it.
 *   4. The profile page as a crawler. Instagram throttles it hardest and has
 *      refused nearly every request since September, so it goes last.
 *
 * The store is { postIds, upload, upsertPost, token, saveToken }; the run
 * comes back as the report index.ts logs to instagram_sync_runs and returns.
 */

import {
  API_FIELDS, apiChildPicture, apiErrorText, apiPosts, complete, describeFailure,
  discover, extractMedia, looksLikeShell, permalinkOf, pickFresh, postFromMedia,
  profilePosts, redact, shortcodeOf, slideParent, toPk, toRow, toShortcode, tokenDue
} from './parse.mjs';

/* A link preview crawler's User-Agent, for the pages. Ask for a post page as
   a browser and Instagram sends its JavaScript application with no post in
   it; asked as a crawler it renders the post. index.ts has the long version. */
export const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/* The JSON endpoints are what Instagram's own web app calls, so they are asked
   for the way that app asks, including the id it sends with every request. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const WEB_APP_ID = '936619743392459';

const GRAPH = 'https://graph.instagram.com';
export const MAX_LINKS = 12;
// How far back a missed post is still worth fetching. See pickFresh.
const WINDOW_DAYS = 30;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const DOORS = ['the newest stored post', 'the second newest stored post', 'the third newest stored post'];

const message = (e) => String(e?.message ?? e);

function asPk(id) {
  try {
    const n = BigInt(String(id));
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

const newestFirst = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

/* Every request gets a deadline. A page that never finishes would otherwise
   hold the run until pg_net gives up, and a run that never finishes writes
   no row, which is the one outcome instagram_sync_runs cannot show. */
function deadline(init, ms) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
  return signal ? Object.assign({}, init, { signal }) : init;
}

async function getPage(http, url) {
  try {
    const res = await http(url, deadline({
      headers: {
        'User-Agent': CRAWLER_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
      }
    }, 20000));
    // Instagram's throttle answers 429 first, then redirects to its login page.
    if (res.status === 429 || /\/accounts\/login\//.test(res.url ?? '')) {
      return { error: 'rate limited', kind: 'rate' };
    }
    if (!res.ok) return { error: 'HTTP ' + res.status, kind: 'other' };
    return { html: await res.text() };
  } catch (e) {
    return { error: redact(message(e)).slice(0, 160), kind: 'other' };
  }
}

async function getJson(http, url, headers) {
  try {
    const res = await http(url, deadline({ headers: headers ?? {} }, 20000));
    let body = null;
    try { body = await res.json(); } catch { /* not JSON, which the caller reports */ }
    return { status: res.status, ok: res.ok, url: res.url ?? '', body };
  } catch (e) {
    return { status: 0, ok: false, url: '', body: null, error: redact(message(e)).slice(0, 160) };
  }
}

function nothingIn(source, html) {
  return looksLikeShell(html)
    ? { source, detail: 'no posts, only JavaScript', kind: 'shell' }
    : { source, detail: 'nothing parsed', kind: 'other' };
}

/* ------------------------------------------------------------- the API */

/* The church's own posts from the official API, renewing the token first when
   it is a week old. A renewal that fails is noted and the old token used: it
   is good for sixty days from its last renewal, so one refusal costs nothing
   and the next run tries again. */
async function fromApi({ http, store, handle, now, notes, saved }) {
  let token = saved.token;

  if (tokenDue(saved.savedAt, now())) {
    const r = await getJson(http, GRAPH + '/refresh_access_token?grant_type=ig_refresh_token' +
      '&access_token=' + encodeURIComponent(token));
    const renewed = r.body?.access_token;
    if (r.ok && typeof renewed === 'string' && renewed.length > 20) {
      token = renewed;
      try {
        await store.saveToken(renewed);
        notes.push('API token renewed');
      } catch (e) {
        notes.push('API token renewed but not saved: ' + redact(message(e)).slice(0, 120));
      }
    } else {
      notes.push('API token renewal refused: ' +
        (r.body?.error ? apiErrorText(r.body.error) : r.error || 'HTTP ' + r.status));
    }
  }

  const r = await getJson(http, GRAPH + '/me/media?fields=' + encodeURIComponent(API_FIELDS) +
    '&limit=25&access_token=' + encodeURIComponent(token));
  if (!r.body) return { error: r.error || 'HTTP ' + r.status, kind: 'other' };

  const parsed = apiPosts(r.body);
  if (parsed.error) return { error: parsed.error, kind: parsed.expired ? 'expired' : 'other' };
  if (!parsed.posts.length) return { error: 'the API listed no posts', kind: 'other' };

  /* A token generated for the wrong account would otherwise look like a run
     where every post was somebody else's and nothing was wrong. */
  const other = parsed.posts.find((p) => p.username && p.username !== handle);
  if (other && parsed.posts.every((p) => p.username && p.username !== handle)) {
    return { error: 'the token belongs to @' + other.username + ', not @' + handle, kind: 'other' };
  }

  return { posts: parsed.posts, token };
}

/* --------------------------------------------------------------- finding */

async function findPosts({ http, store, sleep, handle, now, notes, saved, storedPks }) {
  const tried = [];
  const pause = () => (tried.length ? sleep(1000) : Promise.resolve());

  if (saved?.token) {
    const api = await fromApi({ http, store, handle, now, notes, saved });
    if (api.posts) {
      return {
        via: 'the Instagram API', tried, token: api.token,
        candidates: api.posts.map((post) => ({ pk: post.pk, code: post.code, post }))
      };
    }
    tried.push({ source: 'the Instagram API', detail: api.error, kind: api.kind });
  }

  for (let i = 0; i < Math.min(DOORS.length, storedPks.length); i++) {
    await pause();
    const page = await getPage(http, permalinkOf(toShortcode(storedPks[i])));
    if (page.error) { tried.push({ source: DOORS[i], detail: page.error, kind: page.kind }); continue; }
    const codes = discover(page.html);
    if (codes.length) return { via: DOORS[i], tried, candidates: codes.map((code) => ({ code })) };
    tried.push(nothingIn(DOORS[i], page.html));
  }

  await pause();
  const j = await getJson(http,
    'https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(handle), {
      'User-Agent': BROWSER_UA,
      'x-ig-app-id': WEB_APP_ID,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.instagram.com/' + handle + '/',
      'X-Requested-With': 'XMLHttpRequest'
    });
  if (j.status === 429 || /\/accounts\/login\//.test(j.url)) {
    tried.push({ source: 'the profile JSON', detail: 'rate limited', kind: 'rate' });
  } else if (!j.body) {
    tried.push({ source: 'the profile JSON', detail: j.error || 'HTTP ' + j.status, kind: 'other' });
  } else {
    const p = profilePosts(j.body);
    if (p.posts?.length) {
      return {
        via: 'the profile JSON', tried,
        candidates: p.posts.map((post) => ({ pk: post.pk, code: post.code, post }))
      };
    }
    tried.push({
      source: 'the profile JSON',
      detail: p.error || 'no posts in the answer',
      kind: /has been deleted|cannot use this schema/i.test(p.error || '') ? 'instagram-fault'
        : p.loginWall || j.status === 401 ? 'rate'
        : 'other'
    });
  }

  await pause();
  const page = await getPage(http, 'https://www.instagram.com/' + handle + '/');
  if (page.error) {
    tried.push({ source: 'the profile', detail: page.error, kind: page.kind });
  } else {
    const codes = discover(page.html);
    if (codes.length) return { via: 'the profile', tried, candidates: codes.map((code) => ({ code })) };
    tried.push(nothingIn('the profile', page.html));
  }

  return { tried };
}

/* ------------------------------------------------------------------ the run */

export async function runSync(ctx) {
  const { handle, store, http } = ctx;
  const sleep = ctx.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = ctx.now ?? (() => Date.now());
  const limit = Math.min(Math.max(Number(ctx.limit) || 9, 1), MAX_LINKS);
  const links = Array.isArray(ctx.links) ? ctx.links.map(String) : [];
  const trigger = links.length ? 'links' : 'cron';
  const started = now();
  const notes = [];

  const done = ({ ok, via = null, discovered = 0, wrote = [], skipped = [], error = null }) => ({
    ok, handle, trigger, via, discovered, wrote, skipped,
    counts: { discovered, wrote: wrote.length, skipped: skipped.length },
    error: ok ? null : error,
    note: notes.length ? notes.join('; ').slice(0, 600) : null,
    ms: now() - started
  });

  if (links.length > MAX_LINKS) return done({ ok: false, error: 'at most ' + MAX_LINKS + ' links per call' });

  /* What is already on the rail. The ids are read even on a forced run,
     because the newest of them are the doors into the feed; `force` only
     stops them counting as already mirrored. */
  const ids = (await store.postIds()).map(String);
  const storedPks = ids.map(asPk).filter((n) => n !== null).sort(newestFirst);
  const stored = ctx.force ? new Set() : new Set(ids);
  const newestPk = ctx.force || !storedPks.length ? null : storedPks[0];

  let saved = null;
  try {
    saved = await store.token();
  } catch (e) {
    notes.push('could not read the API token: ' + redact(message(e)).slice(0, 120));
  }

  const skipped = [];   // fine, and said for the record
  const failed = [];    // not fine: the post is missing from the rail
  let via, discovered = 0, apiToken = null, fresh;

  if (links.length) {
    via = 'links';
    fresh = [];
    for (const link of links) {
      const code = shortcodeOf(link);
      const pk = code ? toPk(code) : null;
      if (!pk) { skipped.push({ link, why: 'not an instagram post link' }); continue; }
      if (stored.has(pk.toString())) { skipped.push({ shortcode: code, why: 'already on the rail' }); continue; }
      fresh.push({ code, pk: pk.toString() });
    }
  } else {
    const found = await findPosts({ http, store, sleep, handle, now, notes, saved, storedPks });
    if (!found.candidates) return done({ ok: false, error: describeFailure(found.tried) });

    via = found.via;
    apiToken = found.token ?? null;
    discovered = found.candidates.length;
    // A route that failed before another answered is worth knowing about,
    // above all an API token that has stopped working while a page covers.
    if (found.tried.length) {
      notes.push('before ' + via + ': ' +
        found.tried.map((t) => t.source + ': ' + t.detail).join('; '));
    }

    fresh = pickFresh(found.candidates, {
      stored, newestPk, limit, now: now(), windowDays: WINDOW_DAYS
    });
    if (!fresh.length) return done({ ok: true, via, discovered });
  }

  const wrote = [];

  for (const c of fresh) {
    const shortcode = c.code;
    /* What discovery already knows is used as it is when it is complete, and
       so is an API carousel that only lacks its picture, which the API can
       supply. Anything else is fetched again for its own page. */
    let post = c.post ?? null;
    const usable = post && (complete(post) || (post.postedAt && post.apiId && apiToken));

    if (!usable) {
      // Paced, because a dozen pages at once is what trips the rate limiter.
      await sleep(1500);
      const page = await getPage(http, permalinkOf(shortcode));
      if (page.error) {
        failed.push({ shortcode, why: page.kind === 'rate' ? 'rate limited by Instagram, try again later' : page.error });
        continue;
      }
      const media = extractMedia(page.html, shortcode);
      if (!media) {
        // A carousel's slide, answered with its whole post. Nothing missing.
        const parent = slideParent(page.html, shortcode);
        if (parent) {
          skipped.push({ shortcode, why: 'a slide of ' + parent + ', not a post of its own' });
          continue;
        }
        failed.push({
          shortcode,
          why: /og:image/.test(page.html)
            ? 'the page arrived but the media object did not parse; Instagram has renamed something'
            : looksLikeShell(page.html) ? 'the page had no post in it, only JavaScript'
            : 'the page had no post in it'
        });
        continue;
      }
      post = postFromMedia(media);
    }

    if (stored.has(post.pk)) { skipped.push({ shortcode, why: 'already on the rail' }); continue; }

    /* The rail is the church's own feed, and checking whose post this is is
       also what keeps the shared secret worth nothing to anybody else. */
    if (post.username && post.username !== handle) {
      skipped.push({ shortcode, why: 'posted by @' + post.username + ', not @' + handle });
      continue;
    }

    // A carousel the API sent without a picture of its own: its first slide.
    if (!post.imageUrl && post.apiId && apiToken) {
      const kids = await getJson(http, GRAPH + '/' + encodeURIComponent(post.apiId) +
        '/children?fields=media_type,media_url,thumbnail_url&access_token=' + encodeURIComponent(apiToken));
      post = Object.assign({}, post, { imageUrl: apiChildPicture(kids.body) });
    }
    if (!post.imageUrl) { failed.push({ shortcode, why: 'no picture on the media object' }); continue; }

    /* Never guessed. connect.js reads posted_at into each tile's aria-label,
       so it is read aloud, as fact, to the people who cannot see the picture. */
    if (!post.postedAt) { failed.push({ shortcode, why: 'Instagram gave no date for it' }); continue; }

    let img;
    try {
      img = await http(post.imageUrl, deadline({ headers: { 'User-Agent': CRAWLER_UA } }, 30000));
    } catch (e) {
      failed.push({ shortcode, why: 'picture: ' + redact(message(e)).slice(0, 120) });
      continue;
    }
    if (!img.ok) { failed.push({ shortcode, why: 'picture: HTTP ' + img.status }); continue; }
    const type = String(img.headers?.get?.('content-type') ?? 'image/jpeg').split(';')[0].trim();
    const bytes = new Uint8Array(await img.arrayBuffer());
    const objectPath = post.pk + '.' + (EXT[type] ?? 'jpg');

    try {
      await store.upload(objectPath, bytes, type);
    } catch (e) {
      failed.push({ shortcode, why: 'upload: ' + message(e) });
      continue;
    }

    /* The row is written only after the picture is in the bucket. The other
       order leaves a window in which Connect draws a tile over nothing. */
    const row = toRow(post, objectPath);
    try {
      await store.upsertPost(row);
    } catch (e) {
      failed.push({ shortcode, why: 'row: ' + message(e) });
      continue;
    }
    stored.add(post.pk);

    wrote.push({
      shortcode, id: post.pk, media_type: row.media_type, posted_at: row.posted_at,
      bytes: bytes.length, caption: row.caption.split('\n')[0].slice(0, 60)
    });
  }

  /* A post that was due and did not make it is a failed run, not a good run
     with a footnote. It is retried next hour, because pickFresh still sees it
     as missing, and if it keeps failing the stalled-sync push says so. */
  if (failed.length) {
    return done({
      ok: false, via, discovered, wrote, skipped: skipped.concat(failed),
      error: failed.length + ' of ' + fresh.length + ' new post' + (fresh.length === 1 ? '' : 's') +
        ' did not make it: ' + failed.map((f) => f.shortcode + ' ' + f.why).join('; ')
    });
  }
  return done({ ok: true, via, discovered, wrote, skipped });
}
