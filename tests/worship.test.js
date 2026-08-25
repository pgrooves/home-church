/* ===========================================================================
   The Worship screen's two seams, both of which fail quietly.

   THE FIRST IS THE ONE THAT MATTERS. `worship_sets` has no column for the
   sermon's title, and the whole feature depends on that staying true:
   podcasts.title is the only place a message is named, the Worship header
   reads through to it, and that is what makes /new-podcast's Monday rename
   reach this screen with nothing to keep in step. The way it breaks is not a
   crash. It is somebody adding a `title` to the row because it is convenient,
   and a fortnight later the Worship tab is the one screen in the app still
   calling Sunday's message by the working title it had on Thursday.

   THE SECOND IS THE JOIN. A setlist is published on the Sunday afternoon and
   the episode does not post until Monday, so sermon_id is null on almost
   every row for a day and the date is doing the work. Which is fine until a
   Sunday with two messages on it, and the catalogue already has one of those:
   The Table of Grace, twice, two preachers. A date with two answers has to
   produce no answer rather than a coin toss printed under a setlist.

   And the mapper, because `songs` is the one shape in this schema that
   arrives as free JSON rather than as columns. A row hand written into the
   SQL editor can hold anything at all, and what it must never do is put the
   word "undefined" under a piece of album art in front of a congregation.

   No browser. jsdom is not a dependency of this project and is not going to
   become one, so localStorage is faked below with the smallest thing that
   behaves correctly for what js/store.js asks of it, exactly as
   tests/journal.test.js does.
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

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

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

/* data.js and store.js, then content.js on top of them.

   THE WAY IN IS refresh(), NOT primeFromCache(). The mappers are not
   exported, and the two doors into them are not equivalent: rows are mapped in
   getTable, on the way back from the network, and what goes into the cache is
   already mapped. So priming from a cache would apply rows without ever
   running the code being tested, and every assertion below would pass on
   whatever the payload happened to say. The fake fetch answers with the
   snake_case Supabase really sends. */
function boot(tables) {
  const storage = fakeStorage();

  function respond(url) {
    const table = /rest\/v1\/([a-z_]+)/.exec(url)[1];
    const rows = tables[table];
    // A table this test does not care about answers the way a table the
    // policies refuse does, which content.js drops from the payload rather
    // than failing the whole refresh on.
    if (!rows) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(rows) });
  }

  const sandbox = {
    window: {
      localStorage: storage,
      fetch: (url) => respond(String(url)),
      // No AbortController, which is a real branch in getTable and the one a
      // very old web view takes.
      AbortController: null,
      setTimeout: () => 0,
      clearTimeout: () => {}
    },
    console
  };
  sandbox.window.window = sandbox.window;
  sandbox.setTimeout = sandbox.window.setTimeout;
  sandbox.clearTimeout = sandbox.window.clearTimeout;
  // getTable calls fetch bare, the way a browser lets it. window.fetch is
  // what refresh() checks for, so both have to be the same function.
  sandbox.fetch = sandbox.window.fetch;
  vm.createContext(sandbox);

  vm.runInContext(read('js', 'data.js'), sandbox);
  vm.runInContext(read('js', 'store.js'), sandbox);
  // The real config, so content.js considers itself configured and fetches.
  vm.runInContext(read('js', 'config.js'), sandbox);
  vm.runInContext(read('js', 'content.js'), sandbox);

  const HC = sandbox.window.HC;
  return HC.content.refresh().then(() => HC);
}

/* Three Sundays, one of which has two messages preached on it, which is the
   shape the real catalogue already has. */
const PODCASTS = [
  { id: 'sermon-last-words', title: 'Last Words', preached_on: '2026-08-23',
    guide_id: 'guide-last-words', series_id: 'series-david' },
  { id: 'sermon-rise-again', title: 'When you stop needing God',
    preached_on: '2026-08-16', guide_id: null, series_id: 'series-david' },
  { id: 'sermon-table-adam', title: 'The Table of Grace, Adam',
    preached_on: '2026-08-09', guide_id: null, series_id: 'series-david' },
  { id: 'sermon-table-allen', title: 'The Table of Grace, Allen',
    preached_on: '2026-08-09', guide_id: null, series_id: 'series-david' }
];

const GUIDES = [
  { id: 'guide-last-words', sermon_id: 'sermon-last-words', theme_title: null,
    preached_on: '2026-08-23', subtitle: 'Three things left to say' },
  // A guide written for a Sunday whose episode has not posted yet, which is
  // every Sunday between the Thursday and the Monday.
  { id: 'guide-not-yet', sermon_id: null, theme_title: 'What Comes Next',
    preached_on: '2026-08-30', subtitle: 'Written before the message aired' }
];

const song = (over) => Object.assign({
  title: 'Oceans', artist: 'Hillsong UNITED',
  artUrl: 'https://art/600x600bb.jpg',
  lyricsUrl: 'https://lyrics/oceans',
  links: { youtube: 'https://y', spotify: 'https://s', apple: 'https://a' }
}, over || {});

const WORSHIP = [
  { id: 'worship-2026-08-23', served_on: '2026-08-23', sermon_id: 'sermon-last-words',
    songs: [song({ title: 'So Much' }), song({ title: 'Holy Spirit' })] },
  // Published on the Sunday, before the episode existed. The date is what
  // finds the message.
  { id: 'worship-2026-08-16', served_on: '2026-08-16', sermon_id: null,
    songs: [song({ title: 'Great Are You Lord' })] },
  // The Sunday with two messages on it.
  { id: 'worship-2026-08-09', served_on: '2026-08-09', sermon_id: null,
    songs: [song({ title: 'Build My Life' })] },
  // A Sunday with a guide but no episode at all yet.
  { id: 'worship-2026-08-30', served_on: '2026-08-30', sermon_id: null,
    songs: [song({ title: 'No Body' })] }
];

const everything = () => boot({ podcasts: PODCASTS, guides: GUIDES, worship_sets: WORSHIP });

async function main() {

  /* --------------------------------------------- the title is never stored */

  console.log('\n--- the message is named in one place ---');
  {
    const HC = await everything();
    const set = HC.data.getWorshipSet('worship-2026-08-23');

    ok('the header reads the message\'s title through the sermon',
      HC.data.worshipTitle(set), 'Last Words');

    ok('and the row itself carries no title to disagree with it',
      Object.prototype.hasOwnProperty.call(set, 'title'), false);

    /* The Monday rename, which is the whole reason the column does not exist.
       /new-podcast writes podcasts.title and nothing else, and this is the
       assertion that fails the day somebody copies a title into worship_sets
       to save a lookup. */
    HC.data.getSermon('sermon-last-words').title = 'The Last Words of David';
    ok('renaming the message renames it on the Worship screen, with no second write',
      HC.data.worshipTitle(set), 'The Last Words of David');
  }

  /* ------------------------------------------------------------- the join */

  console.log('\n--- finding Sunday\'s message ---');
  {
    const HC = await everything();

    ok('a set published before its episode still finds the message by date',
      HC.data.worshipTitle(HC.data.getWorshipSet('worship-2026-08-16')),
      'When you stop needing God');

    ok('and it is the sermon itself, not just a name',
      (HC.data.sermonForWorship(HC.data.getWorshipSet('worship-2026-08-16')) || {}).id,
      'sermon-rise-again');

    /* Two messages on one Sunday. Naming one of them would be a coin toss, so
       the answer is none, and the header falls back to the date on its own. */
    const twoUp = HC.data.getWorshipSet('worship-2026-08-09');
    ok('a Sunday with two messages resolves to neither rather than to a guess',
      HC.data.sermonForWorship(twoUp), null);
    ok('and the header shows no title rather than the wrong one',
      HC.data.worshipTitle(twoUp), '');

    /* The id is the tie-break, and filling it in is what /new-podcast does. */
    twoUp.sermonId = 'sermon-table-allen';
    ok('until the episode names it, and then the id wins over the ambiguous date',
      HC.data.worshipTitle(twoUp), 'The Table of Grace, Allen');

    /* A Sunday with a guide and no episode. The guide is written days before
       the message airs, so this is what the screen shows from the Thursday to
       the Monday. */
    const guideOnly = HC.data.getWorshipSet('worship-2026-08-30');
    ok('with no episode at all, the guide names the week',
      HC.data.worshipTitle(guideOnly), 'What Comes Next');
    ok('and the guide link on the header points at that guide',
      (HC.data.guideForWorship(guideOnly) || {}).id, 'guide-not-yet');

    /* An id pointing at a sermon this phone has not got yet. A cache written
       before the episode row arrived is exactly this, and it has to degrade to
       the date rather than to nothing. */
    const orphan = HC.data.getWorshipSet('worship-2026-08-16');
    orphan.sermonId = 'sermon-that-has-not-synced-yet';
    ok('an id the catalogue has not caught up with falls back to the date',
      HC.data.worshipTitle(orphan), 'When you stop needing God');
  }

  /* ---------------------------------------------------------- the ordering */

  console.log('\n--- newest Sunday first ---');
  {
    const HC = await everything();
    /* The carousel opens on slide zero and the current week has to be on it.
       Sorted in data.js rather than trusted from the table, because a payload
       cached before the order on that table existed arrives unordered, which
       is what the shuffled fixture stands for. */
    ok('the weeks come back newest first, so the carousel opens on this Sunday',
      HC.data.worshipSetsByDate().map(w => w.servedOn),
      ['2026-08-30', '2026-08-23', '2026-08-16', '2026-08-09']);
  }

  /* ----------------------------------------------------------- the mapper */

  console.log('\n--- a song is free JSON, so the mapper is total ---');
  {
    const HC = await boot({
      podcasts: PODCASTS,
      worship_sets: [{
        id: 'worship-junk', served_on: '2026-08-23', sermon_id: null,
        songs: [
          // Everything missing but the name.
          { title: 'Bare' },
          // A song with no title is not a smaller row, it is a gap. Dropped.
          { artist: 'Nobody', artUrl: 'https://art' },
          // Nulls where strings were expected, which is what a hand written
          // row looks like, and the one shape that renders as the word
          // "undefined" under a piece of album art if the mapper is not total.
          { title: 'Nulls', artist: null, artUrl: null, lyricsUrl: null, links: null },
          // Links that are not links. A null under a platform and a missing
          // platform have to mean the same thing, because the screen asks by
          // name and draws a button for anything truthy.
          { title: 'Bad links',
            links: { spotify: 'https://s', apple: null, youtube: '  ', tidal: 42 } },
          // Not an object at all.
          'Oceans',
          null
        ]
      }]
    });

    const set = HC.data.getWorshipSet('worship-junk');

    ok('a song with no title is dropped rather than drawn empty',
      set.songs.map(s => s.title), ['Bare', 'Nulls', 'Bad links']);

    ok('the order is the setlist, and nothing reorders it',
      set.songs[0].title, 'Bare');

    ok('a bare song still fills every field the screen reads',
      set.songs[0], { title: 'Bare', artist: '', artUrl: '', lyricsUrl: '', links: {} });

    ok('nulls become empty strings rather than the word undefined',
      set.songs[1], { title: 'Nulls', artist: '', artUrl: '', lyricsUrl: '', links: {} });

    ok('only the links that are really links survive',
      set.songs[2].links, { spotify: 'https://s' });

    ok('and snake_case inside the json is read too, since a row can be hand written',
      (await boot({
        podcasts: PODCASTS,
        worship_sets: [{ id: 'w', served_on: '2026-08-23', sermon_id: null,
          songs: [{ title: 'Oceans', art_url: 'https://art', lyrics_url: 'https://lyrics' }] }]
      })).data.getWorshipSet('w').songs[0],
      { title: 'Oceans', artist: '', artUrl: 'https://art',
        lyricsUrl: 'https://lyrics', links: {} });
  }

  console.log('\n--- a row that is barely a row ---');
  {
    const HC = await boot({
      podcasts: PODCASTS,
      worship_sets: [
        { id: 'worship-empty', served_on: '2026-08-23', sermon_id: null, songs: [] },
        // songs is guarded as an array by a check constraint in the database,
        // so this cannot arrive from Supabase. It can arrive from a cache
        // written by an older build, which is the case this covers.
        { id: 'worship-nosongs', served_on: '2026-08-16', sermon_id: null, songs: null },
        // A Sunday the catalogue knows nothing about: no episode, no guide.
        // The header shows the date on its own and the screen is still a
        // screen.
        { id: 'worship-orphan', served_on: '2026-07-05', sermon_id: null, songs: [] }
      ]
    });

    ok('a set with no songs is a set with no songs, not a crash',
      HC.data.getWorshipSet('worship-empty').songs, []);
    ok('and songs that are not a list at all read as none',
      HC.data.getWorshipSet('worship-nosongs').songs, []);
    ok('a Sunday with no message and no guide has no title, and no undefined either',
      HC.data.worshipTitle(HC.data.getWorshipSet('worship-orphan')), '');
  }

  console.log('');
  console.log(pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
