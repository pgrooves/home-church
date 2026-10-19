/**
 * Home Church, reading what Instagram says about the church's posts.
 *
 * Plain JavaScript in its own file, the way tiktok-fetch/parse.mjs is, so the
 * Edge Function and tests/instagram-fetch.test.js run the same lines. Deno
 * imports it as a module, Node imports it with import(), and nothing here
 * touches the network or the database: every function takes a page, an
 * answer or a list and returns a value.
 *
 * A POST ARRIVES IN THREE SHAPES, and only the first two carry their date.
 *
 *   apiPosts      graph.instagram.com/me/media, the official API, once the
 *                 church has a token in the vault. Everything a row needs.
 *   profilePosts  the public profile JSON that Instagram's own web app
 *                 reads: the newest dozen posts, dated, from one request.
 *   discover      a profile or post page asked for as a crawler, which is
 *                 what the sync ran on alone until October 2026. Ids only,
 *                 so each new one is fetched again for its own page.
 *
 * Whichever shape it came from, a post leaves here as
 *
 *   { pk, code, permalink, imageUrl, mediaType, caption, postedAt, username }
 *
 * with pk as a decimal string, because these ids are past 2^53 and Number()
 * rounds them into a different post.
 */

/* ------------------------------------------------------------ ids and codes */

/** Instagram's base64 alphabet. A shortcode is the media id written in it. */
export const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A shortcode's media id, as a BigInt, or null for anything that is not
 *  one. Instagram's ids increase with time, so comparing two of these orders
 *  two posts without fetching either. */
export function toPk(shortcode) {
  const s = String(shortcode || '');
  if (!s) return null;
  let n = 0n;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return null;
    n = n * 64n + BigInt(i);
  }
  return n > 0n ? n : null;
}

/** The same conversion backwards: a media id's shortcode, or ''. */
export function toShortcode(pk) {
  let n;
  try { n = BigInt(pk); } catch { return ''; }
  if (n <= 0n) return '';
  let out = '';
  while (n > 0n) { out = ALPHABET[Number(n % 64n)] + out; n /= 64n; }
  return out;
}

/* When a media id says it was made. Instagram's ids are 41 bits of
   milliseconds since their own epoch, then shard and sequence, so the top of
   the number is a clock. Checked against every post on the rail: it lands
   within a minute of the real posted_at, scheduled posts included.

   USED TO DECIDE WHAT IS WORTH FETCHING, AND NEVER AS posted_at. The date a
   tile reads aloud comes from Instagram saying it, not from arithmetic. */
const ID_EPOCH_MS = 1314220021721n;

export function pkTime(pk) {
  let n;
  try { n = BigInt(pk); } catch { return null; }
  if (n <= 0n) return null;
  return Number((n >> 23n) + ID_EPOCH_MS);
}

/** The shapes a link arrives in, all of which are the same post. */
export function shortcodeOf(link) {
  const m = String(link || '').match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

export function permalinkOf(code) {
  return 'https://www.instagram.com/p/' + code + '/';
}

/* ------------------------------------------------------------- the pages */

/** Balanced scan from a `{`, tracking strings and their escapes so a brace
 *  inside a caption does not end the object early. A regex cannot do this. */
export function sliceAt(text, start) {
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

const NEEDLE = '{"__typename":"XIGPolaris';

/** The media object for one post, out of a page asked for as a crawler.
 *
 *  A carousel embeds one of these per slide, each with its own `code`, so the
 *  first match in the page is usually a single photograph rather than the
 *  post. The one whose `code` is the shortcode that was asked for is the one
 *  that counts, and it has to carry the id and the timestamp the row needs. */
export function extractMedia(html, shortcode) {
  const text = String(html || '');
  for (let at = text.indexOf(NEEDLE); at >= 0; at = text.indexOf(NEEDLE, at + 1)) {
    const raw = sliceAt(text, at);
    if (!raw) continue;
    try {
      const media = JSON.parse(raw);
      if (media?.pk && media?.taken_at && media.code === shortcode) return media;
    } catch { /* one unparsable candidate is not a failure */ }
  }
  return null;
}

/* Every slide of every carousel inside `node`, as pks. A carousel post keeps
   its slides in `carousel_media`, each one an XIGPolaris object of its own. */
function collectSlides(node, into, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) {
    for (const v of node) collectSlides(v, into, depth + 1);
    return;
  }
  if (Array.isArray(node.carousel_media)) {
    for (const s of node.carousel_media) if (s?.pk) into.add(String(s.pk));
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') collectSlides(v, into, depth + 1);
  }
}

/** Every post a profile or post page mentions, as shortcodes, in page order.
 *
 *  A profile carries about a dozen of the account's posts; a post page about
 *  two dozen others from the same account. Neither carries their dates, so
 *  these are links to fetch, never rows to write.
 *
 *  NOT A CAROUSEL'S SLIDES. Each slide is an XIGPolaris object of its own,
 *  with an image, a code and, since at least October 2026, a pk, so "has a
 *  pk" no longer tells a post from a slide. Where a slide sits does: inside
 *  its post's `carousel_media`. Counting them would put three links to one
 *  photograph on the rail, and did, on the 18 October run that first went
 *  back for missed posts. */
export function discover(html) {
  const text = String(html || '');
  const order = [];
  const slides = new Set();
  for (let at = text.indexOf(NEEDLE); at >= 0; at = text.indexOf(NEEDLE, at + 1)) {
    const raw = sliceAt(text, at);
    if (!raw) continue;
    try {
      const m = JSON.parse(raw);
      collectSlides(m, slides);
      if (m?.pk) order.push(String(m.pk));
    } catch { /* one unparsable candidate is not a failure */ }
  }
  const seen = new Set();
  const out = [];
  for (const pk of order) {
    if (seen.has(pk) || slides.has(pk)) continue;
    seen.add(pk);
    const code = toShortcode(pk);
    if (code) out.push(code);
  }
  return out;
}

/** The post a shortcode is a slide of, or null. Asked for by itself, a
 *  slide's link answers with its whole post, so a page that has no media
 *  object for the code but does carry a carousel listing it has said what the
 *  code is: part of another post, not a post that failed to arrive. */
export function slideParent(html, shortcode) {
  const pk = toPk(shortcode);
  if (!pk) return null;
  const want = pk.toString();
  const text = String(html || '');
  for (let at = text.indexOf(NEEDLE); at >= 0; at = text.indexOf(NEEDLE, at + 1)) {
    const raw = sliceAt(text, at);
    if (!raw) continue;
    try {
      const m = JSON.parse(raw);
      const kids = Array.isArray(m?.carousel_media) ? m.carousel_media : [];
      if (kids.some((s) => String(s?.pk) === want || s?.code === shortcode)) {
        return m.code || toShortcode(String(m.pk)) || null;
      }
    } catch { /* one unparsable candidate is not a failure */ }
  }
  return null;
}

/** Did Instagram send a page with content, or the empty shell? The shell is
 *  200 and ~600KB of JavaScript with no post in it, and read as a parse
 *  failure it looks like a renamed field, which is a different fix. The tell
 *  is a picture: any media URL that is not one of Instagram's own bundles. */
export function looksLikeShell(html) {
  const media = String(html || '').match(
    /https:\/\/[a-z0-9.-]*(?:cdninstagram\.com|fbcdn\.net)\/[^"'\\\s]+/gi
  ) || [];
  return !media.some((u) => !/\/rsrc\.php\//.test(u));
}

/** Instagram's own numbering: 1 a photo, 2 a video, 8 a carousel. A reel is a
 *  video whose product_type is `clips`. Anything unfamiliar draws as a still,
 *  because the play badge is a promise about what a tap does. */
export function mediaTypeOf(media) {
  if (media.media_type === 8 || media.product_type === 'carousel_container') {
    return 'CAROUSEL_ALBUM';
  }
  if (media.media_type === 2 || media.product_type === 'clips') return 'VIDEO';
  return 'IMAGE';
}

/** Instagram allows 2200 characters. The tile reads the first line and the app
 *  does its own truncating, so this only tidies what a phone keyboard left. */
export function normalizeCaption(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2200);
}

/** A post out of a page's media object, or null without the id and date. */
export function postFromMedia(media) {
  if (!media?.pk || !media?.taken_at) return null;
  const pk = String(media.pk);
  const code = media.code || toShortcode(pk);
  return {
    pk,
    code,
    permalink: permalinkOf(code),
    imageUrl: media.display_uri || media.image_versions2?.candidates?.[0]?.url || null,
    mediaType: mediaTypeOf(media),
    caption: normalizeCaption(media.caption?.text ?? ''),
    postedAt: new Date(media.taken_at * 1000).toISOString(),
    username: String(media.user?.username ?? '').toLowerCase() || null
  };
}

/* ------------------------------------------------- the public profile JSON */

/** The account's newest posts, out of what
 *  /api/v1/users/web_profile_info/?username= answers.
 *
 *  This is the JSON Instagram's own web app asks for when it draws a profile,
 *  so it is a different way in from the crawler pages: a different endpoint,
 *  answered by a different part of Instagram, and it carries the dates.
 *  Returns { posts } or { error }, and the error is Instagram's own words
 *  when it gave any, because those are what name the fault. On 18 October
 *  2026 they were "Asset asset://laser.provider/ig_business_category_
 *  subvertical has been deleted", for every account with a business category
 *  that was tried, the church's included, while @instagram's answered: a
 *  fault on Instagram's side, and one that does not stop the post pages. */
export function profilePosts(body) {
  if (!body || typeof body !== 'object') return { error: 'the answer was not JSON' };
  const user = body.data?.user;
  if (!user) {
    const said = String(body.message || '').trim();
    return {
      error: said ? 'Instagram said "' + said.slice(0, 160) + '"' : 'no account in the answer',
      loginWall: body.require_login === true
    };
  }
  const edges = user.edge_owner_to_timeline_media?.edges;
  if (!Array.isArray(edges)) return { error: 'no posts in the answer' };

  const owner = String(user.username || '').toLowerCase() || null;
  const posts = [];
  for (const edge of edges) {
    const n = edge?.node;
    const code = String(n?.shortcode || '');
    const pk = toPk(code);
    if (!pk) continue;
    const taken = Number(n.taken_at_timestamp);
    posts.push({
      pk: pk.toString(),
      code,
      permalink: permalinkOf(code),
      // For a video this is its cover frame, which is what the tile draws.
      imageUrl: n.display_url || n.thumbnail_src || null,
      mediaType: n.__typename === 'GraphSidecar' || n.product_type === 'carousel_container'
        ? 'CAROUSEL_ALBUM'
        : n.is_video || n.__typename === 'GraphVideo' || n.product_type === 'clips'
          ? 'VIDEO'
          : 'IMAGE',
      caption: normalizeCaption(n.edge_media_to_caption?.edges?.[0]?.node?.text ?? ''),
      postedAt: Number.isFinite(taken) && taken > 0 ? new Date(taken * 1000).toISOString() : null,
      username: String(n.owner?.username || owner || '').toLowerCase() || null
    });
  }
  return { posts };
}

/* ---------------------------------------------------------- the official API */

/** What /me/media is asked for. Field names are Meta's, unversioned calls
 *  use whatever version the church's app was created on. */
export const API_FIELDS =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username';

/** Meta writes "2026-10-15T02:10:14+0000". The colon in the offset is added
 *  rather than trusted to a lenient parser. */
export function apiTime(s) {
  const iso = String(s || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** An access token out of anything about to be written down. Deno puts the
 *  whole URL in a network error, and this one's query string is the key. */
export function redact(text) {
  return String(text ?? '')
    .replace(/access_token=[^&\s)"']+/gi, 'access_token=[redacted]')
    .replace(/\bIG[A-Za-z0-9_-]{24,}/g, '[redacted]');
}

/** Meta's error object as a sentence. 190 is the one that needs a person. */
export function apiErrorText(err) {
  const code = Number(err?.code);
  if (code === 190) return 'the token has expired or been revoked, so a new one has to be generated';
  if ([4, 17, 32, 613].includes(code)) return 'rate limited by the API';
  return redact(String(err?.message || 'no reason given')).slice(0, 200);
}

/** The account's posts out of what /me/media answers: { posts } or { error }.
 *
 *  KEYED BY THE SAME ID AS EVERY OTHER ROW. The API's own `id` is a Graph id,
 *  a different number from the media id the rail is keyed by, so the row id
 *  comes from the permalink's shortcode, which is the media id written in
 *  base64. The Graph id is kept as apiId only to ask for a carousel's slides
 *  when the album itself came back without a picture. */
export function apiPosts(body) {
  if (!body || typeof body !== 'object') return { error: 'the answer was not JSON' };
  if (body.error) return { error: apiErrorText(body.error), expired: Number(body.error.code) === 190 };
  if (!Array.isArray(body.data)) return { error: 'no posts in the answer' };

  const posts = [];
  for (const m of body.data) {
    const code = shortcodeOf(m?.permalink);
    const pk = code ? toPk(code) : null;
    if (!pk) continue;
    const type = ['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'].includes(m.media_type) ? m.media_type : 'IMAGE';
    posts.push({
      pk: pk.toString(),
      code,
      permalink: permalinkOf(code),
      // media_url on a video is the video; its picture is thumbnail_url.
      imageUrl: type === 'VIDEO' ? (m.thumbnail_url || null) : (m.media_url || m.thumbnail_url || null),
      mediaType: type,
      caption: normalizeCaption(m.caption ?? ''),
      postedAt: apiTime(m.timestamp),
      username: String(m.username || '').toLowerCase() || null,
      apiId: m.id ? String(m.id) : null
    });
  }
  return { posts };
}

/** The first slide's picture, out of /{id}/children. */
export function apiChildPicture(body) {
  const first = Array.isArray(body?.data) ? body.data[0] : null;
  if (!first) return null;
  return (first.media_type === 'VIDEO' ? first.thumbnail_url : first.media_url) ||
    first.thumbnail_url || null;
}

/** Whether a stored token is due its weekly renewal. Instagram's long lived
 *  tokens last sixty days from their last refresh, and refuse one younger
 *  than a day, so a week is safe on both sides. Unknown age counts as due. */
export function tokenDue(savedAt, now = Date.now(), days = 7) {
  const at = Date.parse(String(savedAt ?? ''));
  return !Number.isFinite(at) || now - at >= days * 86400000;
}

/* ---------------------------------------------------- what is worth fetching */

/** Everything a row needs, so nothing has to be fetched again for it. */
export function complete(post) {
  return Boolean(post && post.pk && post.code && post.imageUrl && post.postedAt);
}

/** The candidates worth fetching: not on the rail, newest first, capped.
 *
 *  NEWER THAN THE NEWEST STORED POST IS NOT THE WHOLE TEST, which was the rule
 *  until October 2026 and is how a post goes missing for good. A run that
 *  mirrors a new post and fails on an older one leaves the older one below
 *  the newest stored id forever, and a catch-up after an outage longer than
 *  `limit` posts does the same to everything past the first `limit`. So a
 *  candidate also counts when its id says it was posted inside the last
 *  `windowDays`, which fills those gaps on the next run and still leaves the
 *  account's older history alone. Hidden posts are rows with published off,
 *  so they are in `stored` and never come back.
 *
 *  An empty table, or a forced run, has no floor and takes the newest few. */
export function pickFresh(candidates, { stored = new Set(), newestPk = null, limit = 9, now = Date.now(), windowDays = 30 } = {}) {
  const newest = newestPk == null ? null : BigInt(newestPk);
  const horizon = now - windowDays * 86400000;
  const seen = new Set();
  const out = [];
  for (const c of candidates || []) {
    let pk = null;
    try { pk = c?.pk != null ? BigInt(c.pk) : toPk(c?.code); } catch { pk = null; }
    if (!pk || pk <= 0n) continue;
    const key = pk.toString();
    if (seen.has(key) || stored.has(key)) continue;
    seen.add(key);
    if (newest !== null && !(pk > newest || (pkTime(pk) ?? 0) >= horizon)) continue;
    out.push(Object.assign({}, c, { pk: key, code: c.code || toShortcode(key) }));
  }
  out.sort((a, b) => (BigInt(a.pk) < BigInt(b.pk) ? 1 : BigInt(a.pk) > BigInt(b.pk) ? -1 : 0));
  return out.slice(0, limit);
}

/* ------------------------------------------------------------ saying why */

/** One sentence that names the fault, then what every source said.
 *
 *  The first sentence is what reaches an admin's lock screen when the sync has
 *  been stuck for six hours (send-push, topic instagram_sync), so it names
 *  what the routes that carry the sync said. `tried` is
 *  [{ source, detail, kind }], where kind is one of expired, instagram-fault,
 *  rate, shell or other.
 *
 *  An expired token comes first because a person can fix it. Instagram's own
 *  fault on the profile JSON comes last: it was there on 18 October while the
 *  post pages worked, so it says nothing about why a run failed, and putting
 *  it first would have the lock screen blame it for every outage after. */
export function describeFailure(tried) {
  const list = (tried || []).filter(Boolean);
  const kinds = new Set(list.map((t) => t.kind));
  const rest = list.filter((t) => t.kind !== 'instagram-fault');
  const headline =
    kinds.has('expired') ? 'The Instagram API token has expired or been revoked'
    : kinds.has('shell') ? 'Instagram is sending its app instead of the posts'
    : rest.length && rest.every((t) => t.kind === 'rate') ? 'Instagram is rate limiting the sync'
    : kinds.has('instagram-fault') ? 'Instagram is failing to show this account to anybody signed out'
    : 'No source would answer';
  const details = list.map((t) => t.source + ': ' + t.detail).join('; ');
  return details ? headline + '. ' + details : headline + '.';
}

/** The row instagram_posts wants. Written only after the picture is in. */
export function toRow(post, imagePath) {
  return {
    id: post.pk,
    permalink: post.permalink,
    image_path: imagePath,
    media_type: post.mediaType,
    caption: normalizeCaption(post.caption),
    posted_at: post.postedAt,
    published: true
  };
}
