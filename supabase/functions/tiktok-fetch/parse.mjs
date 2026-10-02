/**
 * Home Church, reading TikTok's creator embed.
 *
 * Plain JavaScript in its own file, rather than inside index.ts, so that the
 * Edge Function and tests/tiktok-posts.test.js run the same lines. Deno
 * imports it as a module, Node imports it with import(), and nothing here
 * touches the network: every function takes a page or an object and returns
 * a value, which is what makes it testable against fixtures.
 */

/** Balanced scan from a `[` or `{`, tracking strings and their escapes so a
 *  bracket inside a caption does not end the value early. */
export function sliceAt(text, start) {
  const open = text[start];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) return null;
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
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Every post in the embed page's `videoList`, in the order TikTok gave them.
 *  That order is a pinned post or two first and then newest first, so the
 *  caller sorts by id rather than trusting position. null when the page has
 *  no list at all, which is a different failure from an empty one. */
export function videoList(html) {
  const NEEDLE = '"videoList":';
  const at = String(html || '').indexOf(NEEDLE);
  if (at < 0) return null;
  const raw = sliceAt(html, at + NEEDLE.length);
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

/** Did TikTok send the embed, or something else in its place? The embed is
 *  a few hundred KB carrying __FRONTITY_CONNECT_STATE__; a block page or a
 *  captcha is not. Told apart because "TikTok renamed videoList" and "TikTok
 *  refused us" are different fixes. */
export function looksLikeEmbed(html) {
  return /__FRONTITY_CONNECT_STATE__/.test(String(html || ''));
}

/** When a post went up, read out of its own id.
 *
 *  A TikTok id is a 64 bit number whose top 32 bits are the Unix second the
 *  post was created. That is TikTok's id scheme, not an estimate, which is
 *  why this is allowed to be the source of posted_at at all: home.js calls
 *  this post "latest" and the date is read aloud. Anything outside 2016 to a
 *  day from now is not a TikTok id and comes back null. BigInt, because these
 *  ids are past 2^53 and Number() would round them. */
export function postedAtOf(id, now = Date.now()) {
  if (!/^\d{15,22}$/.test(String(id || ''))) return null;
  const seconds = Number(BigInt(id) >> 32n);
  const ms = seconds * 1000;
  if (ms < Date.UTC(2016, 0, 1) || ms > now + 86400000) return null;
  return new Date(ms).toISOString();
}

/** The account handle out of church_profile.social, which is where Profile's
 *  TikTok link already lives. Lowercased, because handles are. */
export function handleFrom(social) {
  const m = JSON.stringify(social ?? '').match(/tiktok\.com\\?\/@([A-Za-z0-9_.]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** TikTok allows 4000 characters. Home clamps to three lines on its own, so
 *  this only tidies what a phone keyboard left. */
export function normalizeCaption(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000);
}

/** One embed item as a row-to-be, or the reason it is not one.
 *
 *  Photo-mode posts are slideshows of stills. Their covers are served from a
 *  `photomode` path and their links are /photo/ rather than /video/, and they
 *  draw without a play badge, because the badge is a promise about what a
 *  tap does. */
export function toPost(item, handle, now = Date.now()) {
  const id = String(item?.id ?? '');
  if (!/^\d{15,22}$/.test(id)) return { skip: 'no usable id' };

  const who = String(item.authorUniqueId ?? '').toLowerCase();
  if (who && handle && who !== handle) {
    return { id, skip: 'posted by @' + who + ', not @' + handle };
  }
  if (item.privateItem) return { id, skip: 'private' };

  const postedAt = postedAtOf(id, now);
  if (!postedAt) return { id, skip: 'the id carries no believable date' };

  const coverUrl = String(item.coverUrl || item.originCoverUrl || '');
  if (!/^https:\/\//.test(coverUrl)) return { id, skip: 'no cover picture' };

  const photo = /photomode/i.test(coverUrl) || /photomode/i.test(String(item.originCoverUrl || ''));
  return {
    id,
    permalink: 'https://www.tiktok.com/@' + (who || handle) + '/' + (photo ? 'photo' : 'video') + '/' + id,
    coverUrl,
    mediaType: photo ? 'IMAGE' : 'VIDEO',
    caption: normalizeCaption(item.desc),
    postedAt
  };
}

/** The embed's items that are not stored yet, newest first, at most `limit`.
 *  `already` is a Set of stored ids. Skips come back alongside, with reasons,
 *  so a run's report says why a post did not make it. */
export function freshPosts(list, handle, already, limit, now = Date.now()) {
  const posts = [], skipped = [];
  for (const item of list || []) {
    const p = toPost(item, handle, now);
    if (p.skip) { skipped.push({ id: p.id ?? null, why: p.skip }); continue; }
    if (already.has(p.id)) continue;
    posts.push(p);
  }
  posts.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1));
  return { posts: posts.slice(0, limit), skipped };
}
