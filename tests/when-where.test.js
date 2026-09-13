/* ===========================================================================
   When & Where, the page that answers "what time, and where".

   WHAT IS ACTUALLY AT RISK HERE. This is the screen a person who has never
   been to this church opens first, and every fact on it is a column. So the
   ways it can be wrong are not exceptions, they are ordinary Tuesdays at the
   church office:

   1. A FACT TYPED INTO THE SOURCE. The whole reason this page is in the app
      rather than a link to the website is that the row moves and the page
      moves with it. A time or a street that survives a change to
      church_profile is the bug this file exists to catch, so every assertion
      below feeds it a row that is not the seed and checks that is what comes
      out.
   2. A CONTROL WITH NOTHING BEHIND IT. No maps_url means no Get directions
      button, not a button that opens nothing. An address is still readable
      with no map on file.
   3. THE PHOTOGRAPHS ARE THREE OR NONE. They are the newest Instagram posts
      the sync has mirrored, and the grid is built for exactly three. Two in a
      grid for three is a hole, and a page that ends on the address is a
      perfectly good page — which is also what a project with no Instagram
      sync gets, so it is the ordinary case rather than an edge one.
   4. THE WORDS SURVIVE WITH NO ROW. content_pages is content like everything
      else here, which means the screen has to draw a real paragraph on a
      phone that has never reached Supabase.

   No browser. build() returns the string render() puts in an element, which
   is the same split js/screens/group.js makes and the reason this can be
   asked what it would draw without anything to draw into.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};
const okTrue = (label, got) => ok(label, !!got, true);
const okFalse = (label, got) => ok(label, !!got, false);

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/* --------------------------------------------------------------- the fakes

   The real components.js, because the button, the eyebrow and the section
   header it builds are half of what is on this screen, and a fake one would
   only ever prove that the fake agrees with itself.

   Everything else is stubbed to the smallest thing that answers honestly.
   Edit mode returns its input untouched, which is what it does for everybody
   who is not an admin with the switch on, and is the state this screen is in
   on every phone in the church. */
function draw(opts) {
  opts = opts || {};

  const sandbox = { window: {}, console };
  sandbox.window.window = sandbox.window;
  sandbox.document = { createElement: () => ({}) };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);

  vm.runInContext(read('js', 'components.js'), sandbox);

  const HC = sandbox.window.HC;

  HC.edit = { wrap: (html) => html, mark: (html) => html };

  HC.data = {
    church: opts.church || {},
    instagramPosts: opts.posts || [],
    getPage: () => opts.page || null,
    // No overrides table, which is every phone where nobody has rewritten a
    // sentence in place. The fallback the screen passes in is the answer.
    copy: (slot, fallback) => fallback
  };

  HC.screens = HC.screens || {};
  HC.screens.pageHelpers = {
    paragraphs: (text, cls) => '<p class="' + cls + '">' + text + '</p>',
    sectionBody: (page, section) => '<p>' + section.body + '</p>'
  };

  vm.runInContext(read('js', 'screens', 'whenwhere.js'), sandbox);

  return HC.screens.whenWhereHelpers.html();
}

/* A church that is not the one in the seed, in every value this screen reads.
   If any of these strings fails to appear, something is typed into a source
   file that should have been read from a row. */
const OTHER = {
  serviceDay: 'Saturday',
  serviceTimes: ['5:00 PM', '7:00 PM'],
  address: { line1: '900 Elysian Fields Ave', city: 'New Orleans', state: 'LA', zip: '70117' },
  mapsUrl: 'https://maps.apple.com/?address=900%20Elysian%20Fields'
};

const post = (n) => ({ imageUrl: 'https://example.test/p' + n + '.jpg', permalink: 'x' + n });

/* ---------------------------------------------------------- the columns */

console.log('\n--- every fact on it is a column ---\n');

const other = draw({ church: OTHER });

okTrue('the day comes from service_day, not from the source',
       other.includes('Every Saturday'));
okFalse('so a church that has moved off Sunday does not still say Sunday',
        other.includes('Every Sunday'));

okTrue('both times are drawn', other.includes('5:00 PM') && other.includes('7:00 PM'));
ok('and only the times the row holds', (other.match(/hc-ww__time"/g) || []).length, 2);

okTrue('the street is address_line1', other.includes('900 Elysian Fields Ave'));
okTrue('the town, state and zip are one line under it',
       other.includes('New Orleans, LA 70117'));
okTrue('and maps_url is what the button opens',
       other.includes('maps.apple.com/?address=900%20Elysian%20Fields'));

/* A church with no times on file yet. The block goes, rather than drawing a
   heading with nothing under it. The address is not affected: those are two
   different rows' worth of missing. */
const noTimes = draw({ church: Object.assign({}, OTHER, { serviceTimes: [] }) });
okFalse('no service times means no times block at all',
        noTimes.includes('Service times'));
okTrue('and the address is still there', noTimes.includes('900 Elysian Fields Ave'));

/* ------------------------------------------------------------ the button */

console.log('\n--- a control with nothing behind it ---\n');

const noMap = draw({ church: Object.assign({}, OTHER, { mapsUrl: '' }) });
okFalse('no maps_url, no Get directions button', noMap.includes('Get directions'));
okTrue('the address is still readable without one',
       noMap.includes('900 Elysian Fields Ave') && noMap.includes('New Orleans, LA 70117'));

/* ------------------------------------------------------- the photographs */

console.log('\n--- three photographs, or none ---\n');

ok('none synced yet, which is the ordinary case',
   draw({ church: OTHER, posts: [] }).includes('hc-ww__photos'), false);

ok('two is a hole in a grid built for three, so nothing is drawn',
   draw({ church: OTHER, posts: [post(1), post(2)] }).includes('hc-ww__photos'), false);

const three = draw({ church: OTHER, posts: [post(1), post(2), post(3)] });
okTrue('three draws the block', three.includes('hc-ww__photos'));
ok('and three frames in it', (three.match(/hc-ww__frame--/g) || []).length, 3);

const many = draw({
  church: OTHER,
  posts: [post(1), post(2), post(3), post(4), post(5)]
});
ok('a full rail is still three frames', (many.match(/hc-ww__frame--/g) || []).length, 3);
okTrue('and they are the newest three', many.includes('p1.jpg') && many.includes('p3.jpg'));
okFalse('not the fourth', many.includes('p4.jpg'));

/* A post the sync mirrored a row for but never got the picture into the
   bucket for. It maps to an empty imageUrl, and an empty frame is worse than
   no collage, so it does not count toward the three. */
const holed = draw({
  church: OTHER,
  posts: [post(1), { imageUrl: '', permalink: 'x' }, post(3)]
});
okFalse('a post with no picture does not make up the numbers',
        holed.includes('hc-ww__photos'));

/* ------------------------------------------------------------- the words */

console.log('\n--- the words, with and without a row ---\n');

const bare = draw({ church: OTHER });
okTrue('with no content_pages row the header still has both names',
       bare.includes('When &amp; Where') && bare.includes('Sunday Gatherings'));
okTrue('the paragraph is the one in the source, not a gap',
       bare.includes('heart of our community'));
okTrue('and the welcome line is under it',
       bare.includes('Everyone is welcome. Everyone is family.'));

const written = draw({
  church: OTHER,
  page: {
    id: 'page-when-where',
    eyebrow: 'Come and see',
    title: 'When we gather',
    blurb: 'A church rewrote this on a Tuesday.',
    sections: []
  }
});
okTrue('a row the church has rewritten wins over the source',
       written.includes('A church rewrote this on a Tuesday.'));
okFalse('and the shipped paragraph is gone',
        written.includes('heart of our community'));
okTrue('including the header, both halves of it',
       written.includes('Come and see') && written.includes('When we gather'));

/* Sections are the church adding to the page from Admin -> Content. Under the
   two facts rather than over them, so the reason somebody opened the screen
   stays at the top of it. */
const withSection = draw({
  church: OTHER,
  page: {
    id: 'page-when-where', eyebrow: '', title: '', blurb: 'Opening.',
    sections: [{ heading: 'Parking', body: 'In the lot off the avenue.' }]
  }
});
okTrue('a section the church added is drawn', withSection.includes('In the lot off the avenue.'));
okTrue('under the address, not over it',
       withSection.indexOf('900 Elysian Fields Ave') <
       withSection.indexOf('In the lot off the avenue.'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
