/* ===========================================================================
   Series art, the two halves that decide whether a photograph ever shows up.

   WHAT THIS IS ABOUT. A series can carry its own graphic, `series.art_url`,
   and the app now wears it in five places: the rail on Listen, the latest
   message above it, every episode row under it, every guide in that series on
   the Guide index, and the week's guide card on Home. All five ask the same
   two questions, so both are asserted here rather than five times over.

   THE FIRST IS THE ONE THAT FAILS SILENTLY. c.cover() draws the house tile
   and lays the artwork over it, and the tile underneath is the whole safety
   net: it is what shows while the picture loads, what shows for a series that
   has none, and what shows again when the URL 404s, that last one because the
   tile carries data-media-fallback for the image error listener in js/app.js
   to mark. Take any one of those away and nothing throws. A row just goes
   blank, on somebody's phone, on a Sunday.

   THE SECOND IS THE PLUMBING. `art_url` has to survive the trip from Postgres
   through the mapper into HC.data.seriesArt, and a series with no art has to
   answer '' rather than null or undefined, because '' is the falsy value the
   screens hand to c.cover() to mean "just the drawn tile". A null that leaks
   through prints the word null in an src attribute and requests it.

   No browser. c.cover() is a string builder and js/data.js is asked directly,
   which is what lets both be checked with no DOM at all, exactly as
   tests/search.test.js and tests/listen.test.js do. What the screens do with
   the string they get back is the browser tests' business, under tests/e2e.
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

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/* --------------------------------------------------------------- the fakes */

// components.js touches no DOM at load and cover() touches none at all, so the
// real file runs here rather than a stand-in that could disagree with it about
// escaping.
function components() {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('js', 'components.js'), sandbox);
  return sandbox.HC.components;
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => Array.from(map.keys())[i],
    get length() { return map.size; },
    _map: map
  };
}

// The catalogue, booted through content.refresh() rather than the cache, so
// the real mapper runs on rows shaped the way Postgres hands them over.
function boot(tables) {
  function respond(url) {
    const table = /rest\/v1\/([a-z_]+)/.exec(url)[1];
    const rows = tables[table];
    if (!rows) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(rows) });
  }

  const sandbox = {
    window: {
      localStorage: fakeStorage(),
      fetch: (url) => respond(String(url)),
      AbortController: null,
      setTimeout: () => 0,
      clearTimeout: () => {}
    },
    console
  };
  sandbox.window.window = sandbox.window;
  sandbox.setTimeout = sandbox.window.setTimeout;
  sandbox.clearTimeout = sandbox.window.clearTimeout;
  sandbox.fetch = sandbox.window.fetch;
  vm.createContext(sandbox);

  vm.runInContext(read('js', 'data.js'), sandbox);
  vm.runInContext(read('js', 'store.js'), sandbox);
  vm.runInContext(read('js', 'config.js'), sandbox);
  vm.runInContext(read('js', 'content.js'), sandbox);

  const HC = sandbox.window.HC;
  return HC.content.refresh().then(() => HC);
}

const ART = 'https://usercontent.example.com/upload/%21Jonah-1.png';

const SERIES = [
  { id: 'series-jonah', title: 'Jonah', subtitle: 'Four weeks with the prophet who ran.',
    started_on: '2026-09-06', is_current: true, art_url: ART },
  { id: 'series-david', title: 'The Life of David', subtitle: 'A shepherd, a king.',
    started_on: '2026-05-03', is_current: false, art_url: null }
];

async function main() {

  console.log('\n--- the tile with no art on it ---');
  {
    const c = components();
    const tile = c.cover('', '1x1', { compact: true });

    ok('draws exactly the house tile it always drew, with no picture on it',
      tile.indexOf('hc-cover__art') !== -1, false);

    /* The marker is what the image error listener looks for. On a tile with
       no photograph there is nothing that can fail, and a tile that can never
       be marked should not claim it can. */
    ok('and carries no fallback marker, because it has nothing to fall back from',
      tile.indexOf('data-media-fallback') !== -1, false);

    okTrue('the drawn mark is still there', tile.indexOf('hc-cover__logo') !== -1);
  }

  console.log('\n--- the tile with art on it ---');
  {
    const c = components();
    const tile = c.cover('', '4x3', { compact: true, art: ART });

    okTrue('wears the photograph', tile.indexOf('class="hc-cover__art"') !== -1);
    okTrue('at the URL it was handed', tile.indexOf(c.esc(ART)) !== -1);

    /* THE FLOOR. The drawn tile is not replaced by the photograph, it is
       underneath it, which is what makes every failure mode above degrade to
       a cover rather than to a hole. */
    okTrue('over the drawn tile rather than instead of it',
      tile.indexOf('hc-cover__logo') !== -1);
    okTrue('and marked for the image error listener, so a dead URL falls back',
      tile.indexOf('data-media-fallback') !== -1);

    // Cheap and worth having: this string is written into an attribute.
    const quoted = c.cover('', '1x1', { art: 'https://x/"><img onerror="x' });
    ok('and the URL is escaped on the way into the attribute',
      quoted.indexOf('"><img onerror=') !== -1, false);
  }

  console.log('\n--- the tile that plays ---');
  {
    const c = components();
    const tile = c.cover('Home Church', '16x9', { play: true, art: ART });

    /* The disc has to be drawn after the picture, because the picture is laid
       over everything before it. A play badge underneath the artwork is a
       message that no longer says out loud that it plays. */
    okTrue('the play disc is drawn over the artwork, not under it',
      tile.indexOf('hc-cover__art') < tile.indexOf('hc-play'));
  }

  console.log('\n--- the catalogue ---');
  {
    const HC = await boot({ series: SERIES });

    ok('a series carries its art off the row and into the app',
      HC.data.seriesArt('series-jonah'), ART);

    /* Every screen hands this straight to c.cover() as opts.art, where '' is
       "draw the house tile" and null would be a src attribute reading null. */
    ok('a series with no art answers with the empty string, not null',
      HC.data.seriesArt('series-david'), '');
    ok('and so does a series that is not there at all',
      HC.data.seriesArt('series-nobody-has'), '');
    ok('and so does no series at all, which is what a loose guide has',
      HC.data.seriesArt(null), '');

    /* The mapper's own half of the same trip, asserted because artUrl is what
       Listen's rail reads directly. */
    ok('and the mapped row agrees with it',
      HC.data.getSeries('series-jonah').artUrl, ART);
    ok('including the null, which the mapper keeps as null on the row',
      HC.data.getSeries('series-david').artUrl, null);
  }

  console.log('');
  console.log(pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
