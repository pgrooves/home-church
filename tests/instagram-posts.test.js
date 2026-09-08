/* ===========================================================================
   The Instagram fetcher's failures are all quiet ones.

   READING A LINK. Nobody types these, they paste them, and Instagram's own
   copy-link button appends tracking that has to survive being stripped while
   ?img_index= has to survive being kept, because that parameter is the only
   carousel signal there is without the API.

   READING A PAGE. Three sources answer with the same picture and only one of
   them carries a date. Confusing them is not a crash: it is a rail that looks
   right and announces the wrong day to the only people who cannot see it.

   THE DATE. connect.js:599 reads posted_at into the tile's aria-label. A post
   with no findable date is held back for that reason, and the test that says
   so is the point of this file rather than a detail in it.

   No network. Everything below is fixtures, on purpose: what these parsers do
   with a page decides what a congregation sees, and checking it should not
   depend on a connection or on what Instagram is serving this morning.
   =========================================================================== */
'use strict';

const F = require('../scripts/fetch_instagram_posts.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const code = (l) => { const p = F.parseUrl(l); return p && p.shortcode; };
const perma = (l) => { const p = F.parseUrl(l); return p && p.permalink; };
const hint = (l) => { const p = F.parseUrl(l); return p && p.mediaHint; };

/* --------------------------------------------------------- however it pasted */

console.log('\n--- reading a link ---');

ok('the plain one',
  code('https://www.instagram.com/p/DcHwSuzCUYq/'), 'DcHwSuzCUYq');
ok('no www, no trailing slash',
  code('https://instagram.com/p/DcHwSuzCUYq'), 'DcHwSuzCUYq');
ok('no scheme, the way it arrives in a text message',
  code('instagram.com/p/DcHwSuzCUYq/'), 'DcHwSuzCUYq');
ok('a numbered list, because somebody made a list',
  code('1. https://www.instagram.com/p/DcHwSuzCUYq/'), 'DcHwSuzCUYq');
ok('Instagram\'s own copy-link tracking is stripped',
  perma('https://www.instagram.com/reel/DcEDXxvjLJW/?utm_source=ig_web_copy_link'),
  'https://www.instagram.com/reel/DcEDXxvjLJW/');
ok('a blank line is nothing', F.parseUrl('   '), null);
ok('a line that is not a link is nothing',
  F.parseUrl('here are the posts from Sunday'), null);
ok('a comment line is nothing', F.parseUrl('# skip this one'), null);

/* A shortcode can legitimately contain a hyphen or an underscore, and a
   character class that forgets them truncates the code and 404s the post. */
ok('a shortcode with a hyphen and an underscore survives whole',
  code('https://www.instagram.com/p/Da_oi-YwiYeA/'), 'Da_oi-YwiYeA');

console.log('\n--- what kind of post ---');

ok('/p/ says nothing, so the page decides',
  hint('https://www.instagram.com/p/DcHwSuzCUYq/'), null);
ok('/reel/ is video',
  hint('https://www.instagram.com/reel/DcEDXxvjLJW/'), 'VIDEO');
ok('/tv/ is video too, and normalises to /reel/',
  perma('https://www.instagram.com/tv/DcEDXxvjLJW/'),
  'https://www.instagram.com/reel/DcEDXxvjLJW/');
ok('?img_index= is the only carousel signal there is, so it is kept',
  hint('https://www.instagram.com/p/DcHwSuzCUYq/?img_index=2'), 'CAROUSEL_ALBUM');

console.log('\n--- a whole list ---');

ok('order is preserved, because order is the rail',
  F.parseList([
    'https://www.instagram.com/p/AAAAAAAAAAA/',
    'https://www.instagram.com/p/BBBBBBBBBBB/',
    'https://www.instagram.com/p/CCCCCCCCCCC/'
  ].join('\n')).map(p => p.shortcode),
  ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC']);

ok('the same post pasted twice is one post',
  F.parseList('https://www.instagram.com/p/AAAAAAAAAAA/\n' +
              'https://www.instagram.com/p/AAAAAAAAAAA/?img_index=2')
    .map(p => p.shortcode),
  ['AAAAAAAAAAA']);

ok('prose around the links does not stop them being read',
  F.parseList('Sunday:\n  https://www.instagram.com/p/AAAAAAAAAAA/\nand the baptism\n' +
              '  https://www.instagram.com/reel/BBBBBBBBBBB/').map(p => p.shortcode),
  ['AAAAAAAAAAA', 'BBBBBBBBBBB']);

/* ------------------------------------------------------------- reading pages */

console.log('\n--- entities, which are all somebody typed an apostrophe ---');

ok('an apostrophe', F.decodeEntities('God&#39;s kindness'), "God's kindness");
ok('an ampersand', F.decodeEntities('Bryan &amp; Katie'), 'Bryan & Katie');
ok('a quote', F.decodeEntities('&quot;Come and see&quot;'), '"Come and see"');
/* &amp; has to be decoded last or it un-escapes the escapes: this text is
   literally the characters &quot;, not a quotation mark. */
ok('a double escape stays escaped', F.decodeEntities('&amp;quot;'), '&quot;');

console.log('\n--- finding the blob ---');

/* The reason this is a scanner and not a regex. A caption containing a brace
   ends a lazy match early and takes half the object with it. */
ok('a brace inside a caption does not end the object',
  F.sliceObject('x "shortcode_media": {"caption":"a { brace","id":"9"} tail', '"shortcode_media"'),
  '{"caption":"a { brace","id":"9"}');
ok('an escaped quote inside a string does not end the string',
  F.sliceObject('"shortcode_media":{"c":"say \\"hi\\" }","id":"9"}', '"shortcode_media"'),
  '{"c":"say \\"hi\\" }","id":"9"}');
ok('no blob is null', F.sliceObject('<html>nothing here</html>', '"shortcode_media"'), null);
ok('an unterminated object is null, not a half one',
  F.sliceObject('"shortcode_media":{"a":1', '"shortcode_media"'), null);

console.log('\n--- the media object, which is the only source a row can come from ---');

/* Trimmed from the object instagram.com actually served for /p/DcHwSuzCUYq/
   when asked as a crawler. Field names, the numeric media_type and the string
   pk are all as they really arrive. */
const MEDIA = {
  __typename: 'XIGPolarisCarouselMedia',
  __isXIGPolarisMedia: 'XIGPolarisCarouselMedia',
  pk: '3965350390354495018',
  code: 'DcHwSuzCUYq',
  taken_at: 1786926602,               // 2026-08-17T00:30:02Z
  media_type: 8,
  product_type: 'carousel_container',
  caption: { text: 'JESUS CHANGES EVERYTHING' },
  display_uri: 'https://scontent-ord5-2.cdninstagram.com/v/t51/774407877_n.jpg',
  image_versions2: { candidates: [{ url: 'https://scontent-ord5-2.cdninstagram.com/v/t51/alt.jpg' }] }
};
const page = (...media) =>
  '<html><script>{"items":[' + media.map(m => JSON.stringify(m)).join(',') + ']}</script></html>';

{
  const got = F.fromMedia(F.extractMedia(page(MEDIA), 'DcHwSuzCUYq'));
  ok('Instagram\'s own numeric id, which is what 0015 asks the row to be keyed by',
    got.mediaId, '3965350390354495018');
  ok('the picture', got.imageUrl,
    'https://scontent-ord5-2.cdninstagram.com/v/t51/774407877_n.jpg');
  ok('the caption', got.caption, 'JESUS CHANGES EVERYTHING');
  ok('the real date, which only this source carries',
    got.postedAt, '2026-08-17T00:30:02.000Z');
  ok('and it says where it came from', got.source, 'media json');
}

/* The trap this cost the most to get right. A carousel post embeds one media
   object per slide, each with its own code, so matching the first XIGPolaris
   object in the page keys the row to a single photograph instead of the post. */
console.log('\n--- a carousel, which contains a dozen decoys ---');

const SLIDE = {
  __typename: 'XIGPolarisImageMedia',
  pk: '9999999999999999999',
  code: 'DcHdvLmCSRF',
  taken_at: 1786926602,
  media_type: 1,
  display_uri: 'https://scontent-ord5-2.cdninstagram.com/v/t51/slide.jpg'
};

ok('the post is picked out of its own slides, by the code that was asked for',
  F.fromMedia(F.extractMedia(page(SLIDE, MEDIA), 'DcHwSuzCUYq')).mediaId,
  '3965350390354495018');
ok('and a slide is returned when a slide is what was asked for',
  F.fromMedia(F.extractMedia(page(SLIDE, MEDIA), 'DcHdvLmCSRF')).mediaId,
  '9999999999999999999');
ok('a code that is in no object on the page is not a source',
  F.extractMedia(page(SLIDE, MEDIA), 'NotOnThisPage'), null);
ok('an object with no id is skipped rather than half used',
  F.extractMedia(page({ __typename: 'XIGPolarisImageMedia', code: 'X', taken_at: 1 }), 'X'),
  null);
ok('an object with no date is skipped too, because the row needs one',
  F.extractMedia(page({ __typename: 'XIGPolarisImageMedia', code: 'X', pk: '1' }), 'X'),
  null);

console.log('\n--- what kind of post, by Instagram\'s own numbering ---');

ok('media_type 8 is a carousel', F.mediaTypeOf(MEDIA), 'CAROUSEL_ALBUM');
ok('media_type 1 is a photo', F.mediaTypeOf({ media_type: 1 }), 'IMAGE');
ok('media_type 2 is a video', F.mediaTypeOf({ media_type: 2 }), 'VIDEO');
ok('a reel is a video by its product_type',
  F.mediaTypeOf({ media_type: 2, product_type: 'clips' }), 'VIDEO');
ok('an unfamiliar type draws as a still, because a play badge is a promise',
  F.mediaTypeOf({ media_type: 99 }), 'IMAGE');

ok('a post with no caption is a post with no caption, not an invented one',
  F.fromMedia(Object.assign({}, MEDIA, { caption: null })).caption, '');
ok('image_versions2 stands in when display_uri is missing',
  F.fromMedia(Object.assign({}, MEDIA, { display_uri: null })).imageUrl,
  'https://scontent-ord5-2.cdninstagram.com/v/t51/alt.jpg');
ok('an object with no picture at all is not a source',
  F.fromMedia(Object.assign({}, MEDIA, { display_uri: null, image_versions2: null })),
  null);

console.log('\n--- og tags, the last resort ---');

const OG_PAGE =
  '<meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/og.jpg">' +
  '<meta property="og:title" content="Home Church on Instagram: &quot;Sunday. All are welcome&quot;">';

{
  const got = F.fromOgTags(OG_PAGE);
  ok('the picture', got.imageUrl, 'https://scontent.cdninstagram.com/v/t51/og.jpg');
  ok('the caption out of the quotes', got.caption, 'Sunday. All are welcome');
  ok('still no date', got.postedAt, null);
}
ok('attributes in the other order still parse',
  F.fromOgTags('<meta content="https://x/og.jpg" property="og:image">').imageUrl,
  'https://x/og.jpg');
ok('a page with no og:image is not a source',
  F.fromOgTags('<meta property="og:title" content="Instagram">'), null);

/* ------------------------------------------------------------- building rows */

console.log('\n--- what kind of tile ---');

ok('the page overrules the link, because /p/ links are handed out for reels',
  F.mediaTypeFor(null, 'VIDEO'), 'VIDEO');
ok('the link is used when the page did not say',
  F.mediaTypeFor('CAROUSEL_ALBUM', null), 'CAROUSEL_ALBUM');
ok('and a still is the default, because a play badge is a promise',
  F.mediaTypeFor(null, null), 'IMAGE');
ok('the page wins even against the link',
  F.mediaTypeFor('VIDEO', 'IMAGE'), 'IMAGE');

console.log('\n--- the caption as stored ---');

ok('trailing whitespace a phone keyboard left behind',
  F.normalizeCaption('  Sunday morning.  \n\n\n\n'), 'Sunday morning.');
ok('a paragraph break survives, because the first line is the label',
  F.normalizeCaption('Sunday.\n\nAll are welcome.'), 'Sunday.\n\nAll are welcome.');
ok('nothing is nothing', F.normalizeCaption(null), '');
ok('Instagram\'s own limit is the limit',
  F.normalizeCaption('x'.repeat(3000)).length, 2200);

console.log('\n--- the row, and the date that is read aloud ---');

const post = F.parseUrl('https://www.instagram.com/p/DcHwSuzCUYq/');

{
  const row = F.buildRow(post, F.fromMedia(MEDIA), '3965350390354495018.jpg');
  ok('the id is Instagram\'s media id, which is what 0015 specifies',
    row.id, '3965350390354495018');
  ok('the path is in the bucket, never a URL on instagram.com',
    row.image_path, '3965350390354495018.jpg');
  ok('the date is the post\'s own', row.posted_at, '2026-08-17T00:30:02.000Z');
  ok('and it is published', row.published, true);
}

/* The one that matters. og tags carry no date, and connect.js reads posted_at
   into the aria-label, so a guess here is announced as fact to exactly the
   people who cannot see the picture and check it. Null is what makes the
   caller hold the post back. */
ok('a post that only reached its og: tags gets no date',
  F.buildRow(post, F.fromOgTags(OG_PAGE), 'x.jpg').posted_at, null);

/* And no id either, which is the harder half. og: tags carry no numeric id,
   so such a row could only be keyed on its shortcode, and a table holding two
   id conventions is worse than a rail one post short. A null id is what makes
   the caller hold it back. */
ok('and no id, which is the other reason it cannot be published',
  F.buildRow(post, F.fromOgTags(OG_PAGE), 'x.jpg').id, null);

ok('a date on the line does not overrule the post\'s own',
  F.buildRow(F.parseUrl('https://www.instagram.com/p/DcHwSuzCUYq/  2001-01-01'),
    F.fromMedia(MEDIA), 'x.jpg').posted_at,
  '2026-08-17T00:30:02.000Z');

/* --------------------------------------------------------- finding the posts */

/* The id and the shortcode are the same number. A shortcode is the media id
   written in base64 with Instagram's alphabet, which is what turns a profile
   page full of ids into a page of links: the profile carries `pk` for every
   recent post and carries no `code` at all.

   These five pairs are real. They are the five posts that were on the rail
   when this was written, and every one of their ids came back from Instagram
   alongside the shortcode it was fetched by. */

console.log('\n--- the id and the shortcode are the same number ---');

ok('the post this whole feature was tested against',
  F.toShortcode('3965350390354495018'), 'DcHwSuzCUYq');
ok('a second, in case the first was a coincidence',
  F.toShortcode('3964308400091476566'), 'DcEDXxvjLJW');
ok('a third', F.toShortcode('3960279698546193819'), 'Db1vWdDCXWb');
ok('a fourth', F.toShortcode('3950145224676293832'), 'DbRvCcwCTzI');
/* This one earns its place: it contains an underscore, which is the 63rd
   character of the alphabet and the one an off-by-one gets wrong. */
ok('a fifth, whose shortcode contains an underscore',
  F.toShortcode('3945050083506620288'), 'Da_oiYwiYeA');

/* The ids are past 2^53. Number() rounds them, silently, to a different post:
   3965350390354495018 becomes ...5020 and the shortcode comes out wrong by one
   character, which is a real link to somebody else's photograph. */
ok('the arithmetic is BigInt, so an id past 2^53 is not rounded',
  F.toShortcode('3965350390354495018'),
  F.toShortcode(BigInt('3965350390354495018')));

console.log('\n--- a profile page, which is where the links come from ---');

/* Shaped as instagram.com actually served @homechurch.nola to a crawler: the
   post objects carry pk, caption, media_type and is_timeline_pinned, and
   carry neither `code` nor `taken_at`. A carousel's slides appear as their
   own objects with an image and an id and nothing else. */
const profilePage = (...objects) =>
  '<html><script>{"user":{"edges":[' +
  objects.map(o => JSON.stringify(o)).join(',') + ']}}</script></html>';

const POST = (pk, caption, extra) => Object.assign({
  __typename: 'XIGPolarisCarouselMedia',
  __isXIGPolarisMedia: 'XIGPolarisCarouselMedia',
  is_timeline_pinned: false,
  pk: pk,
  caption: { text: caption },
  media_type: 8,
  seo_canonical_url: null
}, extra || {});

const SLIDE_ONLY = {
  __typename: 'XIGPolarisImageMedia',
  image_versions2: { candidates: [{ url: 'https://x/slide.jpg' }] },
  id: 'POLARIS_1'
};

{
  const found = F.discover(profilePage(
    POST('3965350390354495018', 'JESUS CHANGES EVERYTHING'),
    SLIDE_ONLY,
    POST('3964308400091476566', 'It’s almost time to come Home!')
  ));
  ok('one entry per post', found.length, 2);
  ok('newest first, the order the page is in',
    found.map(p => p.shortcode), ['DcHwSuzCUYq', 'DcEDXxvjLJW']);
  ok('each one is a link that can be fetched',
    found[0].permalink, 'https://www.instagram.com/p/DcHwSuzCUYq/');
  ok('the caption comes along, for showing somebody before anything is written',
    found[0].caption, 'JESUS CHANGES EVERYTHING');
}

/* The trap. A carousel's slides are XIGPolaris objects too, and counting them
   as posts would put a dozen links to the same photograph on the rail. Only
   the objects carrying pk are posts. */
ok('a carousel slide is not a post',
  F.discover(profilePage(SLIDE_ONLY, SLIDE_ONLY)).length, 0);

ok('the same post twice in the page is one post',
  F.discover(profilePage(
    POST('3965350390354495018', 'a'),
    POST('3965350390354495018', 'a')
  )).length, 1);

/* A pinned post sits at the top of a profile whatever its age. It is kept,
   because rows sort on the real date and a pinned post is still a post, but
   it is flagged so a caller can say why an old photograph turned up in "the
   newest nine". */
ok('a pinned post is kept and marked',
  F.discover(profilePage(POST('3965350390354495018', 'a', { is_timeline_pinned: true })))[0].pinned,
  true);

/* Discovery yields links, never rows. The profile has no taken_at, and the
   date is the one thing that must not be guessed. */
ok('discovery never carries a date, so nothing can be published straight from it',
  F.discover(profilePage(POST('3965350390354495018', 'a')))[0].givenDate, null);

ok('a page with no posts in it discovers nothing rather than throwing',
  F.discover('<html>nothing here</html>'), []);

/* ------------------------------------------------- a page with nothing in it */

/* The failure that cost the most to find. A datacenter IP gets HTTP 200 and
   about 600KB of Instagram's own JavaScript, with no og: tags, no media
   object, and not one mention of the account: the post is fetched later by
   script that never runs. Read as a parse failure it looks exactly like
   Instagram having renamed something, which is an afternoon spent rewriting
   selectors that were fine.

   The snippets below are trimmed from the page instagram.com actually
   returned for /p/DcHwSuzCUYq/embed/captioned/ from a datacenter IP. */

console.log('\n--- the shell, versus a page with a post in it ---');

ok('Instagram\'s own bundles are not a picture',
  F.looksLikeShell(
    '<script src="https://static.cdninstagram.com/rsrc.php/v4/yW/r/ln1CsbucD2C.js"></script>' +
    '<link href="https://static.cdninstagram.com/rsrc.php/v5/yC/l/0,cross/fgQe914.css">'),
  true);

ok('a real photo means a real page',
  F.looksLikeShell(
    '<img src="https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/123_n.jpg">'),
  false);

ok('so does a photo on fbcdn, which is the other host they serve from',
  F.looksLikeShell(
    '<img src="https://scontent-lga3-2.xx.fbcdn.net/v/t51.2885-15/456_n.jpg">'),
  false);

ok('bundles alongside a photo is a real page, not a shell',
  F.looksLikeShell(
    '<script src="https://static.cdninstagram.com/rsrc.php/v4/yW/r/x.js"></script>' +
    '<img src="https://scontent.cdninstagram.com/v/t51/789_n.jpg">'),
  false);

ok('an empty page is a shell', F.looksLikeShell(''), true);

/* ---------------------------------------------------- why a post would not */

/* These are the real payloads, recorded from graph.facebook.com. The two
   subcodes are the whole reason this diagnosis exists: a private post and a
   deleted one look identical from the embed page and the og: tags, and only
   this endpoint tells them apart. Getting the two the wrong way round sends
   somebody to fix the wrong thing. */

console.log('\n--- why a post did not resolve ---');

/* Meta's wording here is "The requested media is private", and repeating it
   is a trap. @homechurch.nola is public, readable in any logged out browser,
   and all five of its posts answer 2207046 anyway. So this must not send
   anybody to change a privacy setting that was never the problem. */
ok('a refusal to embed is reported as inconclusive, not as "it is private"',
  F.explainOembedError({ error: {
    message: 'Permissions error', type: 'OAuthException', code: 200,
    error_subcode: 2207046, error_user_title: 'Private Media',
    error_user_msg: 'The requested media is private. Only public media can be embedded.'
  } }),
  'the Graph API declined to embed it, which it does both for private ' +
  'accounts and for ordinary personal ones, so on its own this says ' +
  'nothing. Open the post in a logged out browser to tell which.');

ok('a deleted or mistyped post is a different thing entirely',
  F.explainOembedError({ error: {
    message: 'The requested resource does not exist', type: 'OAuthException',
    code: 24, error_subcode: 2207045, error_user_title: 'Media Not Found',
    error_user_msg: 'The requested media could not be embedded either because it does not exist or you don\'t have permission to embed it.'
  } }),
  'Instagram says there is no such post. Check the link, and whether it has been deleted.');

ok('an error nobody anticipated is passed through rather than swallowed',
  F.explainOembedError({ error: { error_user_msg: 'Something new and unhelpful' } }),
  'Instagram says: Something new and unhelpful');

ok('an error with no words at all still says something',
  F.explainOembedError({ error: { code: 1 } }),
  'Instagram says: no reason given');

ok('a successful answer is not an error',
  F.explainOembedError({ author_name: 'homechurch.nola', html: '<blockquote>' }), null);

/* ------------------------------------------------------------------- tally */

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
