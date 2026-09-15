/* ===========================================================================
   Services, the page that answers "what time, and where".

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
   3. THE COLLAGE HAS TO CLOSE. The photographs are the newest Instagram posts
      the sync has mirrored, and they are drawn into one of two arrangements
      that fill their grid completely: five in a three by three, or four in a
      two by three. A partial arrangement leaves an empty cell in the middle
      of a block of pictures, which is what this page shipped with and what
      reads as a photograph that failed to load. So there are two things to
      check and they are different kinds of check: the screen never draws
      fewer frames than an arrangement needs, and the arrangement in the
      stylesheet covers every cell of its grid exactly once.
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

console.log('\n--- five photographs, or four, or none ---\n');

const posts = (n) => Array.from({ length: n }, (_, i) => post(i + 1));

ok('none synced yet, which is the ordinary case',
   draw({ church: OTHER, posts: [] }).includes('hc-ww__photos'), false);

ok('three is the arrangement this page used to ship, and it left a hole',
   draw({ church: OTHER, posts: posts(3) }).includes('hc-ww__photos'), false);

const four = draw({ church: OTHER, posts: posts(4) });
okTrue('four draws the two by three', four.includes('hc-ww__photos--4'));
ok('with a frame per cell it has to fill',
   (four.match(/hc-ww__frame--/g) || []).length, 4);

const five = draw({ church: OTHER, posts: posts(5) });
okTrue('five draws the three by three instead', five.includes('hc-ww__photos--5'));
okFalse('and only that one', five.includes('hc-ww__photos--4'));
ok('five frames in it', (five.match(/hc-ww__frame--/g) || []).length, 5);

/* Nine is what the sync keeps, so this is what the church actually sees. */
const nine = draw({ church: OTHER, posts: posts(9) });
okTrue('a full feed is still the five', nine.includes('hc-ww__photos--5'));
ok('and five frames', (nine.match(/hc-ww__frame--/g) || []).length, 5);
okTrue('they are the newest five', nine.includes('p1.jpg') && nine.includes('p5.jpg'));
okFalse('not the sixth', nine.includes('p6.jpg'));

/* A post the sync mirrored a row for but never got the picture into the
   bucket for. It maps to an empty imageUrl, and an empty frame is the hole
   these arrangements exist to avoid, so it does not make up the numbers: five
   rows with one picture missing is a four. */
const holed = draw({
  church: OTHER,
  posts: [post(1), { imageUrl: '', permalink: 'x' }, post(3), post(4), post(5)]
});
okTrue('a post with no picture drops to the arrangement that still fills',
       holed.includes('hc-ww__photos--4'));
okFalse('and the empty frame is not drawn', holed.includes('src=""'));

const holedFour = draw({
  church: OTHER,
  posts: [post(1), { imageUrl: '', permalink: 'x' }, post(3), post(4)]
});
okFalse('three pictures left is nothing at all',
        holedFour.includes('hc-ww__photos'));

/* ---------------------------------------------------- the grid itself

   The bug was never in the screen, it was in the stylesheet: three frames
   placed into a grid with six cells, and the one nobody placed anything into
   was the top left. So this reads the placements back out of css/screens.css
   and fills the grid in, which is the only way to assert the thing that was
   actually wrong — that there is no empty cell, and no two photographs
   stacked in the same one. */
const CSS = read('css', 'screens.css');

// `1` on its own, or `2 / span 2`. Returns [start, span].
function place(value) {
  const parts = value.split('/').map((s) => s.trim());
  const start = parseInt(parts[0], 10);
  const span = parts[1] ? parseInt(parts[1].replace('span', '').trim(), 10) : 1;
  return [start, span];
}

function track(decl) {
  const repeat = decl.match(/repeat\(\s*(\d+)/);
  return repeat ? parseInt(repeat[1], 10) : decl.trim().split(/\s+/).length;
}

function coverage(size) {
  const block = CSS.match(
    new RegExp('\\.hc-ww__photos--' + size + '\\s*\\{([^}]*)\\}')
  );
  if (!block) return { error: 'no .hc-ww__photos--' + size + ' rule' };

  const cols = track((block[1].match(/grid-template-columns:([^;]*);/) || [])[1] || '');
  const rows = track((block[1].match(/grid-template-rows:([^;]*);/) || [])[1] || '');

  const cells = {};
  const rule = new RegExp(
    '\\.hc-ww__photos--' + size +
    '\\s+\\.hc-ww__frame--(\\d+)\\s*\\{\\s*grid-column:([^;]*);\\s*grid-row:([^;]*);',
    'g'
  );

  let frames = 0, m;
  while ((m = rule.exec(CSS))) {
    frames++;
    const [col, colSpan] = place(m[2]);
    const [row, rowSpan] = place(m[3]);
    for (let x = col; x < col + colSpan; x++) {
      for (let y = row; y < row + rowSpan; y++) cells[x + ',' + y] = (cells[x + ',' + y] || 0) + 1;
    }
  }

  const empty = [], doubled = [];
  for (let x = 1; x <= cols; x++) {
    for (let y = 1; y <= rows; y++) {
      const n = cells[x + ',' + y] || 0;
      if (n === 0) empty.push('column ' + x + ', row ' + y);
      if (n > 1) doubled.push('column ' + x + ', row ' + y);
    }
  }

  return { cols, rows, frames, empty, doubled,
           outside: Object.keys(cells).length - (cols * rows - empty.length) };
}

[4, 5].forEach(function (size) {
  const grid = coverage(size);
  ok('the ' + size + ' arrangement places ' + size + ' frames', grid.frames, size);
  ok('and leaves no cell of its ' + grid.cols + ' by ' + grid.rows + ' empty',
     grid.empty, []);
  ok('and stacks nothing on top of anything', grid.doubled, []);
  ok('and nothing hangs off the edge of the grid', grid.outside, 0);
});

/* ------------------------------------------------------------- the words */

console.log('\n--- the words, with and without a row ---\n');

const bare = draw({ church: OTHER });
okTrue('with no content_pages row the header still has both names',
       bare.includes('Services') && bare.includes('Sunday Gatherings'));
okTrue('the page name is over the church’s own heading, not under it',
       bare.indexOf('Services') < bare.indexOf('Sunday Gatherings'));
okFalse('and the old name is gone from the screen',
        bare.includes('When &amp; Where') || bare.includes('When & Where'));
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
