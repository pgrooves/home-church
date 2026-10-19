/* ===========================================================================
   The Instagram sync, as the Edge Function runs it.

   tests/instagram-posts.test.js covers the laptop script's parsers. This file
   covers supabase/functions/instagram-fetch: parse.mjs, which reads what
   Instagram sends, and sync.mjs, which is one whole run with the network and
   the database handed in. Here they are handed fixtures and a Map, so every
   decision the hourly job makes is made below, offline, against pages shaped
   like the real ones.

   THE RUN THIS FILE EXISTS FOR. From 13 September 2026 the sync found new
   posts through one door, the page of the newest post on the rail. On the
   morning of 15 October the church deleted or archived that post, its page
   became Instagram's empty app, and every hourly sync failed the same way
   for three and a half days with nothing telling anybody. So that morning is
   replayed here, and so is each way out of it: more than one door into the
   feed, the official API, a message that names the fault, and a missed post
   that is fetched on the next run instead of being lost below the newest.

   No network.
   =========================================================================== */
'use strict';

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  const b = JSON.stringify(want, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const HANDLE = 'homechurch.nola';
// A fixed "now", the evening of 18 October 2026, so nothing here rots.
const NOW = Date.UTC(2026, 9, 18, 23, 30);
const DAY = 86400000;

/* A media id for a moment, built the way Instagram builds them: milliseconds
   since its epoch in the top bits, anything below. */
const pkAt = (ms, low = 7) => ((BigInt(ms) - 1314220021721n) << 23n) + BigInt(low);

/* --------------------------------------------------------------- fixtures */

const media = (pk, code, takenAt, extra) => Object.assign({
  __typename: 'XIGPolarisImageMedia',
  pk: String(pk), code, taken_at: takenAt, media_type: 1,
  caption: { text: 'A caption for ' + code },
  display_uri: 'https://scontent-ord5-2.cdninstagram.com/v/t51/' + code + '.jpg',
  user: { username: HANDLE }
}, extra || {});

// What a post page carries for the other posts it lists: an id, no date.
const mention = (pk) => ({ __typename: 'XIGPolarisImageMedia', pk: String(pk), media_type: 1 });

const page = (...objects) =>
  '<html><script>{"items":[' + objects.map((o) => JSON.stringify(o)).join(',') + ']}</script></html>';

// What a deleted post's page sends a crawler: the app, and nothing in it.
const SHELL = '<html><script src="https://static.cdninstagram.com/rsrc.php/v4/yW/r/x.js"></script></html>';

// The profile JSON's refusal on 18 October 2026, verbatim.
const SCHEMA_GONE = {
  message: 'Asset asset://laser.provider/ig_business_category_subvertical has been deleted. You cannot use this schema',
  status: 'fail'
};
const LOGIN_WALL = { message: 'Please wait a few minutes before you try again.', require_login: true, status: 'fail' };

// The profile JSON when it answers, trimmed from @instagram's of that night.
const profileJson = (nodes) => ({
  data: { user: { username: HANDLE, id: '1', edge_owner_to_timeline_media: { count: nodes.length, edges: nodes.map((node) => ({ node })) } } },
  status: 'ok'
});
const jsonNode = (pk, code, takenAt, extra) => Object.assign({
  __typename: 'GraphImage', id: String(pk), shortcode: code,
  display_url: 'https://scontent-ord5-1.cdninstagram.com/v/t51/' + code + '.jpg',
  edge_media_to_caption: { edges: [{ node: { text: 'Caption ' + code } }] },
  taken_at_timestamp: takenAt, owner: { id: '1', username: HANDLE },
  is_video: false, product_type: 'feed'
}, extra || {});

// /me/media, as the official API answers it.
const apiItem = (code, iso, extra) => Object.assign({
  id: '17' + code.length + '000000000000' + code.charCodeAt(0),
  caption: 'From the API ' + code,
  media_type: 'IMAGE',
  media_url: 'https://scontent.cdninstagram.com/v/t51/api-' + code + '.jpg',
  permalink: 'https://www.instagram.com/p/' + code + '/',
  timestamp: iso.replace('.000Z', '+0000').replace('Z', '+0000'),
  username: HANDLE
}, extra || {});

/* ------------------------------------------------------- a fake Instagram */

/* routes: [[test, answer]], where test is a string the URL contains or a
   function of it, and answer is { status, html | json | bytes, url }. The
   first route that matches answers, and every request is recorded. */
function fakeHttp(routes) {
  const calls = [];
  const http = async (url) => {
    calls.push(url);
    const hit = routes.find(([test]) => (typeof test === 'function' ? test(url) : url.includes(test)));
    if (!hit) return respond({ status: 404, html: 'nothing routed for ' + url });
    const answer = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
    if (answer instanceof Error) throw answer;
    return respond(answer);
  };
  http.calls = calls;
  return http;
}

function respond({ status = 200, html, json, bytes, url = '', type }) {
  const body = json !== undefined ? JSON.stringify(json) : html !== undefined ? html : '';
  return {
    status, ok: status >= 200 && status < 300, url,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (type || (bytes ? 'image/jpeg' : 'text/html')) : null) },
    text: async () => body,
    json: async () => JSON.parse(body),
    arrayBuffer: async () => (bytes || new Uint8Array([1, 2, 3])).buffer
  };
}

const PICTURE = [(u) => /scontent/.test(u), { bytes: new Uint8Array([255, 216, 255]) }];

function fakeStore(ids, token) {
  const posts = new Map(ids.map((id) => [String(id), { id: String(id) }]));
  const store = {
    posts, uploads: new Map(), token: token || null, saved: [],
    async postIds() { return [...posts.keys()]; },
    async upload(path, bytes, type) { store.uploads.set(path, { bytes: bytes.length, type }); },
    async upsertPost(row) { posts.set(row.id, row); },
    async token() { return store.tokenRow ?? null; },
    async saveToken(t) { store.saved.push(t); store.tokenRow = { token: t, savedAt: new Date(NOW).toISOString() }; }
  };
  if (token) store.tokenRow = token;
  return store;
}

const run = (S, store, http, extra) => S.runSync(Object.assign({
  handle: HANDLE, limit: 9, store, http, sleep: async () => {}, now: () => NOW
}, extra || {}));

/* ------------------------------------------------------------------- tests */

(async () => {
  const P = await import('../supabase/functions/instagram-fetch/parse.mjs');
  const S = await import('../supabase/functions/instagram-fetch/sync.mjs');

  // Three real posts from the rail, newest first, and when they went up.
  const N1 = '4008162313852242062';   // Def2mNnRUiO, 2026-10-15T02:10:14Z
  const N2 = '4006384399889320561';   // DeZiWKNEcpx, 2026-10-12T15:17:39Z
  const N3 = '4005937641593332172';   // DeX8w-HiWHM, 2026-10-12T00:30:01Z

  console.log('\n--- ids, codes and the clock inside an id ---');

  ok('the newest post on the rail on 18 October', P.toShortcode(N1), 'Def2mNnRUiO');
  ok('a code with a hyphen in it', P.toShortcode(N3), 'DeX8w-HiWHM');
  ok('and back again', P.toPk('DeX8w-HiWHM').toString(), N3);
  ok('@instagram\'s reel from the night of the outage, id against shortcode',
    P.toShortcode('4007854180690832102'), 'DeewiSPpCrm');
  ok('a code with a character outside the alphabet is not an id', P.toPk('not a code!'), null);
  ok('nor is nothing', P.toPk(''), null);
  ok('a bad id has no shortcode rather than throwing', P.toShortcode('abc'), '');

  /* The clock. Checked here against posts whose real dates are known, because
     pickFresh trusts it to say whether a missed post is recent enough to go
     back for. It is never used as posted_at. */
  const within = (pk, iso, minutes) => Math.abs(P.pkTime(pk) - Date.parse(iso)) <= minutes * 60000;
  ok('the id knows when it was posted, to the minute', within(N1, '2026-10-15T02:10:14Z', 1), true);
  ok('a scheduled post too (14:00:01)', within('4004896184553206111', '2026-10-10T14:00:01Z', 1), true);
  ok('and one from July', within('3945050083506620288', '2026-07-20T00:17:19Z', 1), true);
  ok('a made up id is placed where it was made', P.pkTime(pkAt(Date.UTC(2026, 9, 17, 14))), Date.UTC(2026, 9, 17, 14));
  ok('rubbish has no time', P.pkTime('nope'), null);

  ok('a reel link is a post', P.shortcodeOf('https://www.instagram.com/reel/DcEDXxvjLJW/?igsh=x'), 'DcEDXxvjLJW');
  ok('a profile link is not', P.shortcodeOf('https://www.instagram.com/homechurch.nola/'), null);

  console.log('\n--- the pages ---');

  {
    const html = page(media(N1, 'Def2mNnRUiO', 1792030214), mention(N2), mention(N3), mention(N2));
    ok('every post a page mentions, once each, in page order',
      P.discover(html), ['Def2mNnRUiO', 'DeZiWKNEcpx', 'DeX8w-HiWHM']);
    ok('the post asked for is picked out of the page',
      P.extractMedia(html, 'Def2mNnRUiO')?.pk, N1);
    ok('a post the page only mentions is not a source, because it has no date',
      P.extractMedia(html, 'DeZiWKNEcpx'), null);
    const post = P.postFromMedia(P.extractMedia(html, 'Def2mNnRUiO'));
    ok('a page post carries everything a row needs', P.complete(post), true);
    ok('and its date is the one Instagram gave', post.postedAt, '2026-10-15T02:10:14.000Z');
  }
  /* A carousel's slides, as the 12 October album's page carried them on 18
     October 2026: XIGPolaris objects inside the post's carousel_media, each
     with a code and a pk of its own and no caption. The first run that went
     back for missed posts took them for three posts. */
  const SLIDES = ['4006383945188316269', '4006383945381296988', '4006383945758762297'];
  const album = (extra) => media(N2, 'DeZiWKNEcpx', 1791818259, Object.assign({
    __typename: 'XIGPolarisCarouselMedia', media_type: 8, product_type: 'carousel_container',
    carousel_media: SLIDES.map((pk) => ({
      __typename: 'XIGPolarisImageMedia', code: P.toShortcode(pk),
      display_uri: 'https://scontent-ord5-2.cdninstagram.com/v/t51/' + pk + '.jpg',
      id: 'POLARIS_' + pk, pk, media_type: 1, __isXIGPolarisMedia: 'XIGPolarisImageMedia'
    }))
  }, extra || {}));

  ok('a carousel\'s slides are not posts, though each now carries a pk',
    P.discover(page(album(), mention(N1), mention(N3))), ['DeZiWKNEcpx', 'Def2mNnRUiO', 'DeX8w-HiWHM']);
  ok('wherever on the page the slides turn up',
    P.discover(page(mention(N1), album(), mention(N3))).includes(P.toShortcode(SLIDES[0])), false);
  ok('a slide\'s own link answers with its post, and says whose slide it is',
    P.slideParent(page(album()), P.toShortcode(SLIDES[2])), 'DeZiWKNEcpx');
  ok('a post is nobody\'s slide', P.slideParent(page(album()), 'Def2mNnRUiO'), null);

  ok('the shell is told apart from a page with a post in it', P.looksLikeShell(SHELL), true);
  ok('a page with a picture is not the shell',
    P.looksLikeShell('<img src="https://scontent-iad3-1.cdninstagram.com/v/t51/1_n.jpg">'), false);
  ok('the shell discovers nothing', P.discover(SHELL), []);

  console.log('\n--- the public profile JSON ---');

  {
    const t = Math.floor(Date.UTC(2026, 9, 17, 14) / 1000);
    const pk = pkAt(Date.UTC(2026, 9, 17, 14));
    const code = P.toShortcode(pk);
    const got = P.profilePosts(profileJson([
      jsonNode(pk, code, t),
      jsonNode(N1, 'Def2mNnRUiO', 1792030214, { __typename: 'GraphSidecar', product_type: 'carousel_container' }),
      // A reel, shaped as @instagram's were that night.
      jsonNode('4007854180690832102', 'DeewiSPpCrm', 1791993604, { __typename: 'GraphVideo', product_type: 'clips', is_video: true })
    ]));
    ok('three posts', got.posts.length, 3);
    ok('keyed by the media id', got.posts[0].pk, pk.toString());
    ok('with the real date, so no page needs fetching for it', got.posts[0].postedAt, '2026-10-17T14:00:00.000Z');
    ok('and its caption', got.posts[0].caption, 'Caption ' + code);
    ok('a carousel says so', got.posts[1].mediaType, 'CAROUSEL_ALBUM');
    ok('a reel is a video', got.posts[2].mediaType, 'VIDEO');
    ok('every post knows who posted it', got.posts.map((p) => p.username), [HANDLE, HANDLE, 'homechurch.nola']);
    ok('a dated post with a picture is complete', P.complete(got.posts[0]), true);
  }
  ok('a post with no date is incomplete, so its page is fetched instead',
    P.complete(P.profilePosts(profileJson([jsonNode(N1, 'Def2mNnRUiO', 0)])).posts[0]), false);
  ok('Instagram\'s own refusal comes back in its own words',
    P.profilePosts(SCHEMA_GONE).error,
    'Instagram said "Asset asset://laser.provider/ig_business_category_subvertical has been deleted. You cannot use this schema"');
  ok('the login wall is marked as the throttle', P.profilePosts(LOGIN_WALL).loginWall, true);
  ok('something that is not JSON is said so', P.profilePosts(null).error, 'the answer was not JSON');

  console.log('\n--- the official API ---');

  {
    const t = '2026-10-17T14:00:05+0000';
    const pk = pkAt(Date.UTC(2026, 9, 17, 14));
    const code = P.toShortcode(pk);
    const got = P.apiPosts({ data: [
      { id: '18011', caption: 'Sunday', media_type: 'IMAGE', media_url: 'https://scontent/x.jpg',
        permalink: 'https://www.instagram.com/p/' + code + '/', timestamp: t, username: 'HomeChurch.Nola' },
      { id: '18012', media_type: 'VIDEO', media_url: 'https://scontent/x.mp4', thumbnail_url: 'https://scontent/x-cover.jpg',
        permalink: 'https://www.instagram.com/reel/Def2mNnRUiO/', timestamp: '2026-10-15T02:10:14+0000', username: HANDLE },
      { id: '18013', media_type: 'CAROUSEL_ALBUM',
        permalink: 'https://www.instagram.com/p/DeZiWKNEcpx/', timestamp: '2026-10-12T15:17:39+0000', username: HANDLE }
    ] });
    ok('keyed by the media id from the permalink, not the API\'s own id',
      got.posts.map((p) => p.pk), [pk.toString(), N1, N2]);
    ok('Meta\'s +0000 is read as UTC', got.posts[0].postedAt, '2026-10-17T14:00:05.000Z');
    ok('a video\'s picture is its cover, not the video', got.posts[1].imageUrl, 'https://scontent/x-cover.jpg');
    ok('a reel link becomes the same /p/ permalink the rail always uses',
      got.posts[1].permalink, 'https://www.instagram.com/p/Def2mNnRUiO/');
    ok('an album with no picture of its own keeps its API id for the slides',
      [got.posts[2].imageUrl, got.posts[2].apiId], [null, '18013']);
    ok('the username is compared lowercased', got.posts[0].username, HANDLE);
  }
  ok('an expired token is named for what it is',
    P.apiPosts({ error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190 } }),
    { error: 'the token has expired or been revoked, so a new one has to be generated', expired: true });
  ok('the first slide is the album\'s picture',
    P.apiChildPicture({ data: [{ media_type: 'IMAGE', media_url: 'https://scontent/slide1.jpg' }] }), 'https://scontent/slide1.jpg');
  ok('a video slide gives its cover',
    P.apiChildPicture({ data: [{ media_type: 'VIDEO', media_url: 'v.mp4', thumbnail_url: 'https://scontent/c.jpg' }] }), 'https://scontent/c.jpg');

  ok('a token in a URL is never written down',
    P.redact('error sending request for url (https://graph.instagram.com/me/media?fields=id&access_token=IGAAKb2xYzzzzzzzzzzzzzzzzzzzzzzz&limit=25)'),
    'error sending request for url (https://graph.instagram.com/me/media?fields=id&access_token=[redacted]&limit=25)');
  ok('nor a bare one', P.redact('saw IGAAKb2xYzzzzzzzzzzzzzzzzzzzzzzzzzzzzz there'), 'saw [redacted] there');

  ok('a token saved yesterday is not due', P.tokenDue(new Date(NOW - DAY).toISOString(), NOW), false);
  ok('a week old one is', P.tokenDue(new Date(NOW - 7 * DAY).toISOString(), NOW), true);
  ok('one of unknown age is', P.tokenDue(null, NOW), true);

  console.log('\n--- what is worth fetching ---');

  {
    const newer = pkAt(Date.UTC(2026, 9, 17, 14));      // after the newest stored
    const gap = pkAt(Date.UTC(2026, 9, 13, 14));        // before it, never stored
    const ancient = pkAt(Date.UTC(2026, 6, 1, 14));     // July, never stored
    const stored = new Set([N1, N2, N3]);
    const cands = [ancient, N3, gap, newer, N1, newer].map((pk) => ({ code: P.toShortcode(pk) }));
    const fresh = P.pickFresh(cands, { stored, newestPk: N1, limit: 9, now: NOW });

    ok('the new post, and the one missed below the newest, newest first',
      fresh.map((c) => c.pk), [newer.toString(), gap.toString()]);
    ok('a post the account made in July is history, not a gap',
      fresh.some((c) => c.pk === ancient.toString()), false);
    ok('nothing already on the rail, hidden posts included, comes back',
      P.pickFresh(cands, { stored: new Set([N1, N2, N3, newer.toString(), gap.toString()]), newestPk: N1, now: NOW }), []);
    ok('the cap keeps the newest',
      P.pickFresh(cands, { stored, newestPk: N1, limit: 1, now: NOW }).map((c) => c.pk), [newer.toString()]);
    ok('an empty table takes the newest few, however old',
      P.pickFresh(cands, { stored: new Set(), newestPk: null, limit: 2, now: NOW }).map((c) => c.pk),
      [newer.toString(), N1]);
  }

  console.log('\n--- saying why ---');

  const JSON_FAULT = { source: 'the profile JSON', detail: 'Instagram said "...has been deleted..."', kind: 'instagram-fault' };
  ok('the doors sending the app is named, not the profile JSON\'s standing fault',
    P.describeFailure([
      { source: 'the newest stored post', detail: 'no posts, only JavaScript', kind: 'shell' },
      JSON_FAULT,
      { source: 'the profile', detail: 'rate limited', kind: 'rate' }
    ]).split('. ')[0],
    'Instagram is sending its app instead of the posts');
  ok('an expired token outranks everything, because a person can fix it',
    P.describeFailure([
      { source: 'the Instagram API', detail: 'the token has expired', kind: 'expired' },
      { source: 'the newest stored post', detail: 'no posts, only JavaScript', kind: 'shell' },
      JSON_FAULT
    ]).split('. ')[0],
    'The Instagram API token has expired or been revoked');
  ok('throttled everywhere is its own sentence',
    P.describeFailure([{ source: 'a', detail: 'rate limited', kind: 'rate' }, { source: 'b', detail: 'rate limited', kind: 'rate' }]),
    'Instagram is rate limiting the sync. a: rate limited; b: rate limited');
  ok('and stays so with the profile JSON broken beside it',
    P.describeFailure([{ source: 'a', detail: 'rate limited', kind: 'rate' }, JSON_FAULT]).split('. ')[0],
    'Instagram is rate limiting the sync');
  ok('Instagram\'s fault is the headline only when nothing else names one',
    P.describeFailure([{ source: 'a', detail: 'HTTP 500', kind: 'other' }, JSON_FAULT]).split('. ')[0],
    'Instagram is failing to show this account to anybody signed out');
  ok('and nothing at all is said plainly', P.describeFailure([]), 'No source would answer.');

  /* ---------------------------------------------------------- whole runs */

  console.log('\n--- 15 October, replayed ---');

  {
    /* As it was from that morning: Def2mNnRUiO, the newest post on the rail,
       had been taken down, so its page was the app; the profile page was
       throttled, as it had been since September; and the profile JSON had
       Instagram's own fault. The old sync had only the first door. */
    const fresh = pkAt(Date.UTC(2026, 9, 17, 14));
    const code = P.toShortcode(fresh);
    const store = fakeStore([N1, N2, N3]);
    const http = fakeHttp([
      ['/p/Def2mNnRUiO/', { html: SHELL }],
      ['/p/DeZiWKNEcpx/', { html: page(media(N2, 'DeZiWKNEcpx', 1791818259), mention(fresh), mention(N1)) }],
      ['/p/' + code + '/', { html: page(media(fresh, code, Math.floor(Date.UTC(2026, 9, 17, 14) / 1000))) }],
      ['web_profile_info', { status: 400, json: SCHEMA_GONE }],
      ['instagram.com/homechurch.nola/', { status: 200, html: '', url: 'https://www.instagram.com/accounts/login/?next=x&is_from_rle' }],
      PICTURE
    ]);
    const r = await run(S, store, http);
    ok('the run is fine', r.ok, true);
    ok('found through the second door', r.via, 'the second newest stored post');
    ok('the post that went up while it was stuck is on the rail',
      store.posts.get(fresh.toString())?.posted_at, '2026-10-17T14:00:00.000Z');
    ok('with its picture mirrored first', store.uploads.has(fresh + '.jpg'), true);
    ok('and the dead door is noted, not hidden',
      r.note, 'before the second newest stored post: the newest stored post: no posts, only JavaScript');
    ok('without troubling the routes past the door that answered',
      http.calls.some((u) => u.includes('web_profile_info') || u.endsWith('/homechurch.nola/')), false);
  }

  {
    // A post can also go as a 404. Same way out.
    const store = fakeStore([N1, N2, N3]);
    const http = fakeHttp([
      ['/p/Def2mNnRUiO/', { status: 404, html: 'gone' }],
      ['/p/DeZiWKNEcpx/', { html: page(media(N2, 'DeZiWKNEcpx', 1791818259), mention(N1), mention(N3)) }]
    ]);
    const r = await run(S, store, http);
    ok('a door that answers 404 is passed the same way', [r.ok, r.via], [true, 'the second newest stored post']);
    ok('and noted with its status', r.note, 'before the second newest stored post: the newest stored post: HTTP 404');
  }

  console.log('\n--- every way in shut ---');

  {
    // All three doors gone at once. Until now, one gone door was enough.
    const store = fakeStore([N1, N2, N3]);
    const http = fakeHttp([
      ['/p/', { html: SHELL }],
      ['web_profile_info', { status: 400, json: SCHEMA_GONE }],
      ['instagram.com/homechurch.nola/', { status: 200, html: '', url: 'https://www.instagram.com/accounts/login/?next=x&is_from_rle' }]
    ]);
    const r = await run(S, store, http);
    ok('the run fails', r.ok, false);
    ok('and the first sentence names what the doors sent',
      r.error.split('. ')[0], 'Instagram is sending its app instead of the posts');
    ok('then what every way in said',
      r.error.split('. ').slice(1).join('. '),
      'the newest stored post: no posts, only JavaScript; ' +
      'the second newest stored post: no posts, only JavaScript; ' +
      'the third newest stored post: no posts, only JavaScript; ' +
      'the profile JSON: Instagram said "Asset asset://laser.provider/ig_business_category_subvertical has been deleted. You cannot use this schema"; ' +
      'the profile: rate limited');
    ok('it is logged as the hourly job', r.trigger, 'cron');
    ok('and nothing was written', [r.counts.wrote, store.uploads.size], [0, 0]);
  }

  console.log('\n--- a carousel\'s slides, on the door that found the October posts ---');

  {
    /* The 18 October run, as it was: the newest stored post's page was the
       shell, the 12 October album's page answered, and its three slides sat
       in it beside the posts. */
    const fresh = pkAt(Date.UTC(2026, 9, 17, 23, 50));
    const code = P.toShortcode(fresh);
    const store = fakeStore([N1, N2, N3]);
    const http = fakeHttp([
      ['/p/Def2mNnRUiO/', { html: SHELL }],
      ['/p/DeZiWKNEcpx/', { html: page(album(), mention(fresh), mention(N1), mention(N3)) }],
      ['/p/' + code + '/', { html: page(media(fresh, code, Math.floor(Date.UTC(2026, 9, 17, 23, 50) / 1000))) }],
      PICTURE
    ]);
    const r = await run(S, store, http);
    ok('the new post is found through the album\'s page and written', [r.ok, r.wrote.map((w) => w.id)], [true, [fresh.toString()]]);
    ok('and no slide is fetched as though it were a post',
      http.calls.some((u) => SLIDES.some((pk) => u.includes('/p/' + P.toShortcode(pk) + '/'))), false);
  }

  {
    /* And if a page ever lists a slide on its own, outside its album, the
       slide's link answers with the album and the slide is let go rather than
       failing the run every hour for a month. */
    const slide = P.toShortcode(SLIDES[0]);
    const store = fakeStore([N1, N2, N3]);
    const http = fakeHttp([
      ['/p/Def2mNnRUiO/', { html: page(media(N1, 'Def2mNnRUiO', 1792030214), mention(SLIDES[0])) }],
      ['/p/' + slide + '/', { html: page(album()) }]
    ]);
    const r = await run(S, store, http);
    ok('a slide that got through is told for what it is',
      r.skipped, [{ shortcode: slide, why: 'a slide of DeZiWKNEcpx, not a post of its own' }]);
    ok('and the run is fine', r.ok, true);
  }

  console.log('\n--- a post that failed is tried again, not lost ---');

  {
    const newer = pkAt(Date.UTC(2026, 9, 17, 23));
    const older = pkAt(Date.UTC(2026, 9, 16, 14));
    const [cNew, cOld] = [P.toShortcode(newer), P.toShortcode(older)];
    const store = fakeStore([N1, N2, N3]);
    let olderUp = false;
    const http = fakeHttp([
      ['/p/Def2mNnRUiO/', { html: page(media(N1, 'Def2mNnRUiO', 1792030214), mention(newer), mention(older)) }],
      // Like every post page, it lists others from the account, so on the
      // second run, when it is the newest stored post, it is the door.
      ['/p/' + cNew + '/', { html: page(media(newer, cNew, Math.floor(Date.UTC(2026, 9, 17, 23) / 1000)), mention(older), mention(N1)) }],
      ['/p/' + cOld + '/', () => (olderUp
        ? { html: page(media(older, cOld, Math.floor(Date.UTC(2026, 9, 16, 14) / 1000))) }
        : { status: 429, html: '' })],
      PICTURE
    ]);

    const first = await run(S, store, http);
    ok('the newer post makes it', store.posts.has(newer.toString()), true);
    ok('the older one does not, and the run says so rather than passing',
      [first.ok, first.error], [false, '1 of 2 new posts did not make it: ' + cOld + ' rate limited by Instagram, try again later']);

    /* Until October this was where the older post was lost for good: it now
       sits below the newest stored id, and "newer than the newest" never
       looked at it again. */
    olderUp = true;
    const second = await run(S, store, http);
    ok('the next run goes back for it', second.wrote.map((w) => w.id), [older.toString()]);
    ok('and is fine', second.ok, true);
  }

  console.log('\n--- the official API, once there is a token ---');

  {
    const t = Date.UTC(2026, 9, 17, 14);
    const pk = pkAt(t);
    const code = P.toShortcode(pk);
    const store = fakeStore([N1, N2, N3], { token: 'IGAAtoken0000000000000000000000000001', savedAt: new Date(NOW - DAY).toISOString() });
    const http = fakeHttp([
      ['graph.instagram.com/me/media', { json: { data: [apiItem(code, new Date(t).toISOString()), apiItem('Def2mNnRUiO', '2026-10-15T02:10:14Z')] } }],
      PICTURE
    ]);
    const r = await run(S, store, http);
    ok('the API answers first', r.via, 'the Instagram API');
    ok('the new post is written straight from it', store.posts.get(pk.toString())?.caption, 'From the API ' + code);
    ok('with the API\'s own timestamp', store.posts.get(pk.toString())?.posted_at, '2026-10-17T14:00:00.000Z');
    ok('and not one instagram.com page was asked for',
      http.calls.filter((u) => /www\.instagram\.com/.test(u)).length, 0);
    ok('a token saved yesterday is left alone', store.saved, []);
  }

  {
    // A week old token is renewed before it is used, and the new one kept.
    const store = fakeStore([N1], { token: 'IGAAold00000000000000000000000000000001', savedAt: new Date(NOW - 8 * DAY).toISOString() });
    const http = fakeHttp([
      ['refresh_access_token', { json: { access_token: 'IGAAnew00000000000000000000000000000002', token_type: 'bearer', expires_in: 5184000 } }],
      [(u) => u.includes('/me/media') && u.includes('IGAAnew'), { json: { data: [apiItem('Def2mNnRUiO', '2026-10-15T02:10:14Z')] } }],
      [(u) => u.includes('/me/media'), { status: 400, json: { error: { code: 190, message: 'old token' } } }]
    ]);
    const r = await run(S, store, http);
    ok('the renewed token is saved', store.saved, ['IGAAnew00000000000000000000000000000002']);
    ok('and used', [r.ok, r.via], [true, 'the Instagram API']);
    ok('and the log says it happened', r.note, 'API token renewed');
  }

  {
    // The token has died and Instagram's pages are still broken.
    const store = fakeStore([N1, N2, N3], { token: 'IGAAdead0000000000000000000000000000001', savedAt: new Date(NOW - DAY).toISOString() });
    const http = fakeHttp([
      ['/me/media', { status: 400, json: { error: { code: 190, message: 'Error validating access token' } } }],
      ['/p/', { html: SHELL }],
      ['web_profile_info', { status: 400, json: SCHEMA_GONE }],
      ['instagram.com/homechurch.nola/', { html: SHELL }]
    ]);
    const r = await run(S, store, http);
    ok('the push leads with the token, which is the part a person can fix',
      r.error.split('. ')[0], 'The Instagram API token has expired or been revoked');
  }

  {
    // The token has died but a door still works: the rail stays current and
    // the log still says the API is down.
    const store = fakeStore([N1], { token: 'IGAAdead0000000000000000000000000000001', savedAt: new Date(NOW - DAY).toISOString() });
    const http = fakeHttp([
      ['/me/media', { status: 400, json: { error: { code: 190 } } }],
      ['/p/Def2mNnRUiO/', { html: page(media(N1, 'Def2mNnRUiO', 1792030214)) }]
    ]);
    const r = await run(S, store, http);
    ok('the run is fine through the door', [r.ok, r.via], [true, 'the newest stored post']);
    ok('and the dead token is in the log for the next person',
      r.note, 'before the newest stored post: the Instagram API: the token has expired or been revoked, so a new one has to be generated');
  }

  {
    // A token for the wrong account is refused rather than read as "nothing new".
    const store = fakeStore([N1], { token: 'IGAAwrong000000000000000000000000000001', savedAt: new Date(NOW - DAY).toISOString() });
    const http = fakeHttp([
      ['/me/media', { json: { data: [apiItem('DeewiSPpCrm', '2026-10-15T02:10:14Z', { username: 'instagram' })] } }],
      ['/p/Def2mNnRUiO/', { html: page(media(N1, 'Def2mNnRUiO', 1792030214)) }]
    ]);
    const r = await run(S, store, http);
    ok('the wrong account is named', /the token belongs to @instagram, not @homechurch\.nola/.test(r.note), true);
  }

  {
    // An album the API sent without a picture: its first slide, from the API.
    const t = Date.UTC(2026, 9, 17, 14);
    const pk = pkAt(t);
    const code = P.toShortcode(pk);
    const store = fakeStore([N1], { token: 'IGAAtoken0000000000000000000000000000001', savedAt: new Date(NOW - DAY).toISOString() });
    const http = fakeHttp([
      ['/children', { json: { data: [{ media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/v/t51/slide1.jpg' }] } }],
      ['/me/media', { json: { data: [apiItem(code, new Date(t).toISOString(), { media_type: 'CAROUSEL_ALBUM', media_url: undefined })] } }],
      PICTURE
    ]);
    const r = await run(S, store, http);
    ok('an album is written with its first slide', [r.ok, store.posts.get(pk.toString())?.media_type], [true, 'CAROUSEL_ALBUM']);
    ok('fetched from the API, not from a page', http.calls.some((u) => /slide1\.jpg/.test(u)), true);
  }

  {
    // Whatever goes wrong with a request that carries the token, the token
    // never reaches the log, the run's answer, or a lock screen.
    const store = fakeStore([N1], { token: 'IGAAsecret00000000000000000000000000001', savedAt: new Date(NOW - DAY).toISOString() });
    const http = fakeHttp([
      ['/me/media', (u) => new Error('error sending request for url (' + u + ')')],
      ['/p/', { html: SHELL }],
      ['web_profile_info', { status: 400, json: SCHEMA_GONE }],
      ['instagram.com/homechurch.nola/', { html: SHELL }]
    ]);
    const r = await run(S, store, http);
    ok('the token is redacted out of the error', /IGAAsecret/.test(JSON.stringify(r)), false);
    ok('and the error still says where it happened', /the Instagram API: error sending request/.test(r.error), true);
  }

  console.log('\n--- the profile JSON as the way in ---');

  {
    const t = Date.UTC(2026, 9, 17, 14);
    const pk = pkAt(t);
    const code = P.toShortcode(pk);
    const store = fakeStore([N1, N2, N3]);
    const http = fakeHttp([
      ['/p/', { html: SHELL }],
      ['web_profile_info', { json: profileJson([jsonNode(pk, code, t / 1000), jsonNode(N1, 'Def2mNnRUiO', 1792030214)]) }],
      PICTURE
    ]);
    const r = await run(S, store, http);
    ok('when the doors are shut the JSON answers', [r.ok, r.via], [true, 'the profile JSON']);
    ok('and its post is written with no page fetched for it',
      [store.posts.has(pk.toString()), http.calls.some((u) => u.includes('/p/' + code))], [true, false]);
  }

  console.log('\n--- whose post ---');

  {
    const t = Date.UTC(2026, 9, 17, 14);
    const pk = pkAt(t);
    const code = P.toShortcode(pk);
    const store = fakeStore([N1]);
    const http = fakeHttp([
      ['/p/Def2mNnRUiO/', { html: page(media(N1, 'Def2mNnRUiO', 1792030214), mention(pk)) }],
      ['/p/' + code + '/', { html: page(media(pk, code, t / 1000, { user: { username: 'someoneelse' } })) }],
      PICTURE
    ]);
    const r = await run(S, store, http);
    ok('somebody else\'s post is refused', r.skipped, [{ shortcode: code, why: 'posted by @someoneelse, not @homechurch.nola' }]);
    ok('which is not a failure of the run', r.ok, true);
    ok('and nothing is written', store.posts.has(pk.toString()), false);
  }

  console.log('\n--- by hand, with links ---');

  {
    const t = Date.UTC(2026, 9, 17, 14);
    const pk = pkAt(t);
    const code = P.toShortcode(pk);
    const store = fakeStore([N1]);
    const http = fakeHttp([
      ['/p/' + code + '/', { html: page(media(pk, code, t / 1000)) }],
      PICTURE
    ]);
    const r = await run(S, store, http, { links: [
      'https://www.instagram.com/p/Def2mNnRUiO/',
      'https://www.instagram.com/p/' + code + '/?img_index=1',
      'https://example.com/nothing'
    ] });
    ok('logged as a run by hand', r.trigger, 'links');
    ok('the stored one is left alone, the bad one said, the new one written',
      [r.skipped.map((s) => s.why), r.wrote.map((w) => w.id)],
      [['already on the rail', 'not an instagram post link'], [pk.toString()]]);
    ok('more than twelve is refused before anything is fetched',
      (await run(S, store, fakeHttp([]), { links: new Array(13).fill('https://www.instagram.com/p/Def2mNnRUiO/') })).error,
      'at most 12 links per call');
  }

  console.log('\n--- an idle hour ---');

  {
    const store = fakeStore([N1, N2]);
    const http = fakeHttp([['/p/Def2mNnRUiO/', { html: page(media(N1, 'Def2mNnRUiO', 1792030214), mention(N2)) }]]);
    const r = await run(S, store, http);
    ok('nothing new is a good run', [r.ok, r.counts.wrote], [true, 0]);
    ok('and costs exactly one request', http.calls.length, 1);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
})();
