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

console.log('\n--- the embed blob, which is the good source ---');

const BLOB = {
  __typename: 'GraphImage',
  display_url: 'https://scontent.cdninstagram.com/v/t51/photo.jpg',
  taken_at_timestamp: 1786838400,   // 2026-08-16T00:00:00Z
  edge_media_to_caption: { edges: [{ node: { text: 'Sunday morning.' } }] }
};
const embedPage = (media) =>
  '<html><script>window.__additionalDataLoaded(\'extra\',' +
  '{"shortcode_media":' + JSON.stringify(media) + '});</script></html>';

{
  const got = F.fromMedia(F.extractMedia(embedPage(BLOB)));
  ok('the picture', got.imageUrl, 'https://scontent.cdninstagram.com/v/t51/photo.jpg');
  ok('the caption', got.caption, 'Sunday morning.');
  ok('the real date, which is the whole reason to prefer this source',
    got.postedAt, '2026-08-16T00:00:00.000Z');
  ok('and it says where it came from', got.source, 'embed json');
}

ok('GraphSidecar is a carousel',
  F.fromMedia(F.extractMedia(embedPage(
    Object.assign({}, BLOB, { __typename: 'GraphSidecar' })))).mediaType,
  'CAROUSEL_ALBUM');
ok('GraphVideo is a video',
  F.fromMedia(F.extractMedia(embedPage(
    Object.assign({}, BLOB, { __typename: 'GraphVideo' })))).mediaType,
  'VIDEO');
ok('is_video counts even when the typename does not say',
  F.fromMedia(F.extractMedia(embedPage(
    Object.assign({}, BLOB, { is_video: true })))).mediaType,
  'VIDEO');
ok('a post with no caption is a post with no caption, not an invented one',
  F.fromMedia(F.extractMedia(embedPage(
    Object.assign({}, BLOB, { edge_media_to_caption: { edges: [] } })))).caption,
  '');
ok('a blob with no picture in it is not a source',
  F.fromMedia(F.extractMedia(embedPage(
    Object.assign({}, BLOB, { display_url: undefined })))),
  null);

console.log('\n--- the embed markup, when the blob is gone ---');

const EMBED_HTML =
  '<div class="Caption"><a class="CaptionUsername" href="/homechurch.nola/">' +
  'homechurch.nola</a> Come and see. &amp; bring someone</div>' +
  '<img class="EmbeddedMediaImage" src="https://scontent.cdninstagram.com/v/t51/e.jpg">';

{
  const got = F.fromEmbedHtml(EMBED_HTML);
  ok('the picture', got.imageUrl, 'https://scontent.cdninstagram.com/v/t51/e.jpg');
  ok('the username is not part of what the church wrote',
    got.caption, 'Come and see. & bring someone');
  ok('and there is no date here, which is why it is second',
    got.postedAt, null);
}
ok('markup with no image is not a source', F.fromEmbedHtml('<div>nope</div>'), null);

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
  const row = F.buildRow(post, F.fromMedia(F.extractMedia(embedPage(BLOB))), 'DcHwSuzCUYq.jpg');
  ok('the id is the shortcode, so a re-run updates rather than duplicates',
    row.id, 'DcHwSuzCUYq');
  ok('the path is in the bucket, never a URL on instagram.com',
    row.image_path, 'DcHwSuzCUYq.jpg');
  ok('the date is the post\'s own', row.posted_at, '2026-08-16T00:00:00.000Z');
  ok('and it is published', row.published, true);
}

/* The one that matters. og tags carry no date, and connect.js reads posted_at
   into the aria-label, so a guess here is announced as fact to exactly the
   people who cannot see the picture and check it. Null is what makes the
   caller hold the post back. */
ok('a post whose date could not be found gets no date',
  F.buildRow(post, F.fromOgTags(OG_PAGE), 'x.jpg').posted_at, null);

ok('a date given on the line is used, which is how such a post is published',
  F.buildRow(F.parseUrl('https://www.instagram.com/p/DcHwSuzCUYq/  2026-08-16'),
    F.fromOgTags(OG_PAGE), 'x.jpg').posted_at,
  '2026-08-16T12:00:00Z');

ok('a date on the line does not overrule the post\'s own',
  F.buildRow(F.parseUrl('https://www.instagram.com/p/DcHwSuzCUYq/  2001-01-01'),
    F.fromMedia(F.extractMedia(embedPage(BLOB))), 'x.jpg').posted_at,
  '2026-08-16T00:00:00.000Z');

/* ------------------------------------------------------------------- tally */

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
