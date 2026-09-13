/* ===========================================================================
   The announcement archive, on both sides of the seam it crosses.

   WHY THIS FILE EXISTS. The corner of an announcement card on Home was an x
   and is now an archive box, and the difference between the two is entirely a
   promise about what happens next: the card is somewhere, and there is a way
   back. Nothing in that promise is loud when it breaks.

   Three ways it breaks quietly, and all three are asked here:

     - A card that stays on Home after it was archived, or an archived card
       that never turns up in the list. The two are one join done in two
       places, Home filtering it out and the archive filtering it in, and they
       read the same map in js/store.js.

     - The list coming back in a different order than it went away in. The
       archive is not today's announcements, so it cannot call
       liveAnnouncements(), and the moment somebody writes the three
       comparisons out a second time the tie-break is wrong on exactly the
       week two announcements were posted in the same minute.

     - A restore that half happens. Restoring a selection is one write and one
       event on purpose, and it has to move every id that is still there and
       nothing else: an id ticked before a content refresh deleted the row
       behind it would otherwise be counted as restored in the toast.

   No browser. jsdom is not a dependency of this project and is not going to
   become one, so localStorage and the two document lookups the screen makes
   are faked below with the smallest things that behave correctly, exactly as
   tests/announcements.test.js does.
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

/* --------------------------------------------------------------- the fakes */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => Array.from(map.keys())[i],
    get length() { return map.size; }
  };
}

/* The whole of what the archive screen asks of a page. Both lookups answer
   null, which is the honest answer when the screen is not mounted: the tick
   paints nothing, the repaint returns, and c.toast() bails at its own first
   line. What is being tested is the state underneath all three. */
function fakeDocument() {
  return {
    querySelector: () => null,
    getElementById: () => null
  };
}

function load(files) {
  const sandbox = {
    window: { localStorage: fakeStorage(), console: console },
    document: fakeDocument()
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  files.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  });
  // The one thing the screen calls that is a device and not a page.
  sandbox.window.HC.native = { tap: function () {} };
  return sandbox.window.HC;
}

function localDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

const TODAY = localDay(0);
const TOMORROW = localDay(1);

/* An announcement in the shape js/content.js maps a row into, so what is
   tested here is what the app actually holds. */
function ann(over) {
  return Object.assign({
    id: 'announcement-x',
    publishedOn: TODAY,
    title: 'Something',
    body: '',
    bodyHtml: null,
    eyebrow: null,
    startsOn: null,
    endsOn: null,
    priority: 0,
    imageUrl: null,
    videoUrl: null,
    images: [],
    linkUrl: null,
    linkTitle: null,
    linkImageUrl: null,
    pinned: false,
    createdAt: TODAY + 'T12:00:00Z'
  }, over || {});
}

function withAnnouncements(HC, rows) {
  HC.data.announcements.length = 0;
  rows.forEach(function (r) { HC.data.announcements.push(r); });
  return HC;
}

const ids = list => list.map(a => a.id);

/* The four files the screen needs under it, and the screen. components.js
   first, because both screens read HC.components at load. */
const SCREEN = ['data.js', 'store.js', 'components.js',
                'screens/announcement-archive.js'];
const HOME = ['data.js', 'store.js', 'components.js', 'screens/home.js'];

/* --------------------------------------------------- archiving one card

   The seam. Home filters the archived ones out and the archive filters the
   same ones in, off the same map, and neither is allowed to be a superset of
   the other. */

{
  const HC = load(HOME);
  const home = HC.screens.homeHelpers;

  withAnnouncements(HC, [
    ann({ id: 'a', createdAt: '2026-06-03T00:00:00Z' }),
    ann({ id: 'b', createdAt: '2026-06-02T00:00:00Z' }),
    ann({ id: 'c', createdAt: '2026-06-01T00:00:00Z' })
  ]);

  ok('nothing archived, everything is on Home', ids(home.liveAnnouncements()), ['a', 'b', 'c']);
  ok('and the archive is empty', ids(home.archivedAnnouncements()), []);

  HC.store.archive('b');

  ok('an archived card comes off Home', ids(home.liveAnnouncements()), ['a', 'c']);
  ok('and is the one thing in the archive', ids(home.archivedAnnouncements()), ['b']);

  /* The whole reason the corner stopped being an x. Archiving is reversible
     from the archive screen, and the announcement is exactly where it was. */
  HC.store.unarchive('b');
  ok('restoring puts it back where it was', ids(home.liveAnnouncements()), ['a', 'b', 'c']);
  ok('and takes it out of the archive', ids(home.archivedAnnouncements()), []);
}

{
  const HC = load(HOME);
  const home = HC.screens.homeHelpers;

  /* An id this phone archived whose announcement the church has since
     deleted. Not an error, and it must not become a row: a row with no
     announcement behind it is one nobody can restore to anywhere, and it
     would keep the "(Announcement Archive)" line on Home for good. */
  withAnnouncements(HC, [ann({ id: 'still-here' })]);
  HC.store.archive('deleted-last-month');

  ok('an archived id with no announcement behind it draws nothing',
    ids(home.archivedAnnouncements()), []);
  ok('and does not take the card that is still here off Home',
    ids(home.liveAnnouncements()), ['still-here']);
}

{
  const HC = load(HOME);
  const home = HC.screens.homeHelpers;

  /* Archiving is a fact about the phone and the window is a fact about the
     church, so the two do not cancel. A card archived on Tuesday that runs
     out of dates on Friday is still in the archive on Saturday, which is what
     lets the archive screen say "Came down on ..." on the row rather than
     losing it. */
  withAnnouncements(HC, [
    ann({ id: 'came-down', endsOn: TODAY }),
    ann({ id: 'not-yet', startsOn: TOMORROW })
  ]);
  HC.store.archive('came-down');
  HC.store.archive('not-yet');

  ok('an archived announcement that has come down is still in the archive',
    ids(home.archivedAnnouncements()), ['came-down', 'not-yet']);
  ok('and neither of them is on Home', ids(home.liveAnnouncements()), []);
}

/* ------------------------------------------------------------- the order */

{
  const HC = load(SCREEN);
  const archive = HC.screens.archiveHelpers;

  withAnnouncements(HC, [
    ann({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }),
    ann({ id: 'new', createdAt: '2026-06-01T00:00:00Z' }),
    ann({ id: 'urgent', createdAt: '2025-01-01T00:00:00Z', priority: 5 })
  ]);
  ['old', 'new', 'urgent'].forEach(id => HC.store.archive(id));

  // The same three comparisons liveAnnouncements() runs, which is the point
  // of there being one sortAnnouncements() rather than two copies of them.
  ok('the archive is in the order Home had them in',
    ids(archive.archived()), ['urgent', 'new', 'old']);
}

{
  const HC = load(SCREEN);

  withAnnouncements(HC, [
    ann({ id: 'b-second', createdAt: '2026-06-01T00:00:00Z' }),
    ann({ id: 'a-first', createdAt: '2026-06-01T00:00:00Z' })
  ]);
  ['a-first', 'b-second'].forEach(id => HC.store.archive(id));

  ok('a dead heat breaks on the id here too',
    ids(HC.screens.archiveHelpers.archived()), ['a-first', 'b-second']);
}

{
  const HC = load(SCREEN);

  // sortAnnouncements() hands back a copy. The archive builds its list by
  // filtering the array HC.data holds, and sorting that in place would
  // quietly reorder the church's own announcements.
  withAnnouncements(HC, [
    ann({ id: 'z', createdAt: '2026-01-01T00:00:00Z' }),
    ann({ id: 'y', createdAt: '2026-06-01T00:00:00Z' })
  ]);
  const before = ids(HC.data.announcements);
  HC.data.sortAnnouncements(HC.data.announcements);
  ok('sorting does not reorder the list it was handed',
    ids(HC.data.announcements), before);
}

/* ---------------------------------------------------------- the selection */

{
  const HC = load(SCREEN);
  const archive = HC.screens.archiveHelpers;

  withAnnouncements(HC, [
    ann({ id: 'a' }), ann({ id: 'b' }), ann({ id: 'c' })
  ]);
  ['a', 'b', 'c'].forEach(id => HC.store.archive(id));

  ok('nothing is ticked to begin with', archive.selectedIds(), []);

  archive.toggle('a');
  archive.toggle('c');
  ok('ticking two selects two', archive.selectedIds().sort(), ['a', 'c']);

  archive.toggle('a');
  ok('and ticking one again unticks it', archive.selectedIds(), ['c']);

  // The restore line is drawn on every paint and hidden until something is
  // ticked, so "is anything ticked" is the whole of what decides it.
  archive.toggle('c');
  ok('unticking the last one empties the selection', archive.selectedIds(), []);

  // A stray tap with no id on it must not put `undefined` in the selection.
  archive.toggle('');
  ok('a tap carrying no id selects nothing', archive.selectedIds(), []);
}

{
  const HC = load(SCREEN);
  const archive = HC.screens.archiveHelpers;

  withAnnouncements(HC, [ann({ id: 'a' }), ann({ id: 'b' })]);
  ['a', 'b'].forEach(id => HC.store.archive(id));
  archive.toggle('a');
  archive.toggle('b');

  /* A content refresh lands while the screen is open and the church has
     deleted one of the ticked announcements. What is restored is what is
     still there, and the toast counts that rather than the ticks. */
  withAnnouncements(HC, [ann({ id: 'a' })]);
  ok('a tick whose announcement has gone is not restored',
    archive.liveSelection(), ['a']);
  ok('and the ticks themselves are untouched until the next paint',
    archive.selectedIds().sort(), ['a', 'b']);
}

/* ----------------------------------------------------- restoring in bulk */

{
  const HC = load(SCREEN);
  const archive = HC.screens.archiveHelpers;

  withAnnouncements(HC, [
    ann({ id: 'a' }), ann({ id: 'b' }), ann({ id: 'c' })
  ]);
  ['a', 'b', 'c'].forEach(id => HC.store.archive(id));

  archive.toggle('a');
  archive.toggle('c');
  archive.restoreSelected();

  ok('the two that were ticked are back', HC.store.isArchived('a'), false);
  ok('both of them', HC.store.isArchived('c'), false);
  ok('and the one that was not is still archived', HC.store.isArchived('b'), true);
  ok('the archive holds only what is left', ids(archive.archived()), ['b']);
  ok('and nothing is ticked afterwards', archive.selectedIds(), []);
}

{
  const HC = load(SCREEN);

  withAnnouncements(HC, [ann({ id: 'a' })]);
  HC.store.archive('a');

  // One write and one event for a whole selection, which is the only reason
  // unarchiveAll() exists rather than a loop over unarchive().
  let events = 0;
  HC.store.on('dismissed', function () { events += 1; });

  ok('restoring three says how many actually moved',
    HC.store.unarchiveAll(['a', 'never-archived', 'nor-this']), 1);
  ok('and it is one event, not one per id', events, 1);

  // Nothing to do is not an event. A repaint driven off this must not fire on
  // a tap that changed nothing.
  ok('restoring nothing moves nothing', HC.store.unarchiveAll(['a']), 0);
  ok('and says nothing about it', events, 1);
  ok('and neither does an empty list', HC.store.unarchiveAll([]), 0);
}

{
  const HC = load(SCREEN);
  const archive = HC.screens.archiveHelpers;

  withAnnouncements(HC, [ann({ id: 'a' })]);
  HC.store.archive('a');

  // Nothing ticked, tap the link anyway. It is hidden at that moment, but a
  // handler that assumed otherwise would restore the whole archive.
  archive.restoreSelected();
  ok('restoring with nothing ticked restores nothing', HC.store.isArchived('a'), true);
}

{
  const HC = load(SCREEN);
  const archive = HC.screens.archiveHelpers;

  withAnnouncements(HC, [ann({ id: 'a' }), ann({ id: 'b' })]);
  ['a', 'b'].forEach(id => HC.store.archive(id));
  archive.toggle('a');

  // Leaving the screen, from the 'view' subscriber in js/app.js. A selection
  // is what somebody is doing now, not something to come back to.
  archive.forget();
  ok('walking away empties the selection', archive.selectedIds(), []);
  ok('and archives nothing on the way out', ids(archive.archived()), ['a', 'b']);
}

/* --------------------------------------------------- it survives a launch */

{
  const sandbox = {
    window: { localStorage: fakeStorage(), console: console },
    document: fakeDocument()
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

  vm.runInContext(src, sandbox);
  sandbox.window.HC.store.archive('announcement-serve-day');

  // Same storage, a fresh copy of the module: a cold start on the same phone.
  sandbox.window.HC = undefined;
  vm.runInContext(src, sandbox);

  ok('an archived card is still archived after a relaunch',
    sandbox.window.HC.store.isArchived('announcement-serve-day'), true);
  /* Under the old name too. The x wrote to this same key, so a phone that put
     three cards away last week opens this build with three cards in its
     archive rather than three cards it can never see again. */
  ok('and the old name answers the same question',
    sandbox.window.HC.store.isDismissed('announcement-serve-day'), true);
  ok('and the id is in the list the archive screen reads',
    sandbox.window.HC.store.archivedIds(), ['announcement-serve-day']);
}

{
  const HC = load(['data.js', 'store.js']);

  // Archiving a card and dismissing its strip stay two separate answers to
  // two separate questions, which is what tests/announcements.test.js holds
  // about the maps. Said again here because the archive screen is the first
  // thing that reads one of them as a list.
  HC.store.archive('a');
  HC.store.dismissPin('b');
  ok('the archive holds only what was archived', HC.store.archivedIds(), ['a']);

  HC.store.eraseEverything();
  ok('Delete everything empties the archive', HC.store.archivedIds(), []);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
