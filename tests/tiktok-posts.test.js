/* ===========================================================================
   The TikTok fetcher reads a page TikTok serves for websites, and every way
   it can go wrong is quiet.

   READING THE EMBED. The list is one JSON array inside a 300KB page, and a
   caption is free text: a bracket in one must not end the array early.

   THE DATE. Home calls the newest of these the church's latest TikTok, so
   posted_at must be true. It comes from the id's top 32 bits, and this file
   pins that against ids whose dates are known.

   WHOSE POST. The embed names each post's author, and a post that is not the
   church's own is never stored.

   No network. Fixtures only, shaped like the real embed of 2 October 2026.
   =========================================================================== */
'use strict';

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const item = (id, extra) => Object.assign({
  id, desc: 'A caption #homechurch ', authorUniqueId: 'homechurch.nola',
  privateItem: false,
  coverUrl: 'https://p16-common-sign.tiktokcdn-us.com/tos-useast5-p-0068-tx/abc~tplv-tiktokx-origin.image?x-expires=1',
  originCoverUrl: 'https://p16-common-sign.tiktokcdn-us.com/tos-useast5-p-0068-tx/def~tplv-tiktokx-origin.image?x-expires=1'
}, extra || {});

const page = (list) =>
  '<html><body><main>Open TikTok</main>' +
  '<script id="__FRONTITY_CONNECT_STATE__" type="application/json">' +
  JSON.stringify({ source: { data: { '/embed/@homechurch.nola': {
    userInfo: { uniqueId: 'homechurch.nola' }, videoList: list } } } }) +
  '</script></body></html>';

// A fixed "now", so a test of "not in the future" does not rot.
const NOW = Date.UTC(2026, 9, 2, 12);

(async () => {
  const T = await import('../supabase/functions/tiktok-fetch/parse.mjs');

  console.log('\n--- reading the embed ---');

  const PINNED = '7532254676914425119';
  const NEWER = '7691147407073070349';

  const list = T.videoList(page([item(PINNED), item(NEWER), item('7690227233838927117')]));
  ok('finds every post in videoList', list.map((v) => v.id),
    [PINNED, NEWER, '7690227233838927117']);

  ok('a bracket or brace inside a caption does not end the list early',
    T.videoList(page([item(NEWER, { desc: 'Week ] one } [ #fyp "quoted"' }), item(PINNED)]))
      .map((v) => v.id),
    [NEWER, PINNED]);

  ok('a page with no videoList is null, not an empty list',
    T.videoList('<html>Access denied</html>'), null);
  ok('an empty videoList is an empty list', T.videoList(page([])), []);
  ok('the embed is recognised as the embed', T.looksLikeEmbed(page([])), true);
  ok('a block page is not', T.looksLikeEmbed('<html>Forbidden</html>'), false);

  console.log('\n--- the date, out of the id ---');

  // 7691147407073070349 >> 32 = 1790734801, which is 2026-09-30T02:20:01Z.
  ok('the top 32 bits are the second it was posted',
    T.postedAtOf('7691147407073070349', NOW), '2026-09-30T02:20:01.000Z');
  // 7532254676914425119 >> 32 = 1753739704, the pinned post from July 2025.
  ok('the pinned post dates to when it was really posted',
    T.postedAtOf(PINNED, NOW), '2025-07-28T21:55:04.000Z');
  ok('an id from the future is not believed',
    T.postedAtOf('9191147407073070349', NOW), null);
  ok('a small number is not a TikTok id', T.postedAtOf('12345', NOW), null);
  ok('a non-number is not an id', T.postedAtOf('abc', NOW), null);

  console.log('\n--- one post ---');

  const p = T.toPost(item(NEWER, { desc: 'Repost if you feel the same\r\n\r\n\r\n#fyp  ' }),
    'homechurch.nola', NOW);
  ok('the permalink is the video page on the church\'s account', p.permalink,
    'https://www.tiktok.com/@homechurch.nola/video/' + NEWER);
  ok('an ordinary post is a video', p.mediaType, 'VIDEO');
  ok('the caption is tidied', p.caption, 'Repost if you feel the same\n\n#fyp');
  ok('coverUrl is preferred over originCoverUrl', /abc~/.test(p.coverUrl), true);

  const photo = T.toPost(item(PINNED, {
    coverUrl: 'https://p16-common-sign.tiktokcdn-us.com/tos-useast8-i-photomode-tx2/15b~tplv-photomode-image.jpeg'
  }), 'homechurch.nola', NOW);
  ok('a photo-mode post is an image, so no play badge', photo.mediaType, 'IMAGE');
  ok('and its link is /photo/', photo.permalink,
    'https://www.tiktok.com/@homechurch.nola/photo/' + PINNED);

  ok('somebody else\'s post is refused',
    T.toPost(item(NEWER, { authorUniqueId: 'someoneelse' }), 'homechurch.nola', NOW).skip,
    'posted by @someoneelse, not @homechurch.nola');
  ok('a private post is refused',
    T.toPost(item(NEWER, { privateItem: true }), 'homechurch.nola', NOW).skip, 'private');
  ok('a post with no cover is refused',
    T.toPost(item(NEWER, { coverUrl: '', originCoverUrl: '' }), 'homechurch.nola', NOW).skip,
    'no cover picture');
  ok('originCoverUrl is used when coverUrl is missing',
    /def~/.test(T.toPost(item(NEWER, { coverUrl: '' }), 'homechurch.nola', NOW).coverUrl), true);

  console.log('\n--- which ones are new ---');

  const all = [item(PINNED), item(NEWER), item('7690227233838927117'),
    item('7690181147921222942', { authorUniqueId: 'someoneelse' })];

  const first = T.freshPosts(all, 'homechurch.nola', new Set(), 9, NOW);
  ok('newest first, whatever order the embed used (the pinned post goes last)',
    first.posts.map((x) => x.id), [NEWER, '7690227233838927117', PINNED]);
  ok('the refused post is reported with its reason',
    first.skipped, [{ id: '7690181147921222942', why: 'posted by @someoneelse, not @homechurch.nola' }]);

  ok('what is stored already is left alone',
    T.freshPosts(all, 'homechurch.nola', new Set([NEWER, PINNED]), 9, NOW).posts.map((x) => x.id),
    ['7690227233838927117']);
  ok('the limit keeps the newest',
    T.freshPosts(all, 'homechurch.nola', new Set(), 1, NOW).posts.map((x) => x.id), [NEWER]);

  console.log('\n--- the handle ---');

  ok('read from church_profile.social, the same link Profile uses',
    T.handleFrom([{ label: 'Instagram', url: 'https://www.instagram.com/homechurch.nola' },
      { label: 'TikTok', url: 'https://www.tiktok.com/@HomeChurch.Nola' }]),
    'homechurch.nola');
  ok('no TikTok link, no handle',
    T.handleFrom([{ label: 'Instagram', url: 'https://www.instagram.com/homechurch.nola' }]), null);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
})();
