/* ===========================================================================
   The pinned announcement, on both sides of the seam it crosses.

   WHY THIS FILE EXISTS. The strip under the top bar is drawn by the shell and
   the cards are drawn by Home, and the two have to agree about one thing:
   which announcements the church is showing today. They agree by both reading
   HC.data.liveAnnouncements(), so that function is the seam, and the way it
   goes wrong is not a crash. It is a banner that stays up after the
   announcement behind it has retired, on a phone nobody is looking at closely
   enough to notice for a fortnight.

   The other half is the two dismissals. Putting the strip away and putting
   the card away are separate acts on the same id, and if either one silently
   did both, the bug would look like the app forgetting things people had not
   asked it to forget.

   AND SINCE AN ANNOUNCEMENT GREW A PAGE, two more seams that fail quietly.
   getAnnouncement() answers for an announcement whose dates have run out,
   deliberately, and a test is the only thing that stops somebody "fixing"
   that into liveAnnouncements() and emptying a page under a reader. And the
   three URL readings in js/components.js are shared by the admin form, the
   editor's link button and the announcement screen: a link the form accepted
   and the screen then refused to draw would be a card that silently is not
   there.

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

function load(files) {
  const sandbox = { window: { localStorage: fakeStorage(), console: console } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  files.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  });
  return sandbox.window.HC;
}

/* Today and its neighbours in the phone's own zone, which is the zone the
   window is compared in. Written out rather than hardcoded, because a test
   with a date in it passes until that date. */
function localDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

const YESTERDAY = localDay(-1);
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

/* HC.data holds its announcements in a private array that js/content.js fills
   by mutating in place, which is what this does too. */
function withAnnouncements(HC, rows) {
  HC.data.announcements.length = 0;
  rows.forEach(function (r) { HC.data.announcements.push(r); });
  return HC;
}

const ids = list => list.map(a => a.id);

/* ------------------------------------------------------------ the window */

{
  const HC = load(['data.js']);

  withAnnouncements(HC, [
    ann({ id: 'open', startsOn: null, endsOn: null }),
    ann({ id: 'starts-tomorrow', startsOn: TOMORROW }),
    ann({ id: 'started-yesterday', startsOn: YESTERDAY }),
    ann({ id: 'ends-today', endsOn: TODAY }),
    ann({ id: 'ends-tomorrow', endsOn: TOMORROW })
  ]);

  const live = ids(HC.data.liveAnnouncements());

  ok('an announcement with no dates is live', live.includes('open'), true);
  ok('one that starts tomorrow is not', live.includes('starts-tomorrow'), false);
  ok('one that started yesterday is', live.includes('started-yesterday'), true);
  // endsOn is the first day it does not show, which is the only way a church
  // can say "up to and including Saturday" with one date.
  ok('one that ends today is already down', live.includes('ends-today'), false);
  ok('one that ends tomorrow is still up', live.includes('ends-tomorrow'), true);
}

/* ------------------------------------------------------------- the order */

{
  const HC = load(['data.js']);

  withAnnouncements(HC, [
    ann({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }),
    ann({ id: 'new', createdAt: '2026-06-01T00:00:00Z' }),
    ann({ id: 'urgent', createdAt: '2025-01-01T00:00:00Z', priority: 5 })
  ]);

  ok('priority outranks newer, and newer outranks older',
    ids(HC.data.liveAnnouncements()), ['urgent', 'new', 'old']);
}

{
  const HC = load(['data.js']);

  // Same priority, same instant. The tie has to break on something stable, or
  // two phones fetching the same table can put a different banner on screen.
  withAnnouncements(HC, [
    ann({ id: 'b-second', createdAt: '2026-06-01T00:00:00Z' }),
    ann({ id: 'a-first', createdAt: '2026-06-01T00:00:00Z' })
  ]);

  ok('a dead heat breaks on the id',
    ids(HC.data.liveAnnouncements()), ['a-first', 'b-second']);
}

/* ------------------------------------------------------------- the pin */

{
  const HC = load(['data.js']);

  withAnnouncements(HC, [ann({ id: 'plain' })]);
  ok('nothing pinned, nothing on the strip', ids(HC.data.pinnedAnnouncements()), []);

  withAnnouncements(HC, [
    ann({ id: 'newest-card', createdAt: '2026-06-02T00:00:00Z' }),
    ann({ id: 'the-pin', createdAt: '2026-06-01T00:00:00Z', pinned: true })
  ]);
  ok('the strip is the pinned one, not the newest one',
    ids(HC.data.pinnedAnnouncements()), ['the-pin']);

  withAnnouncements(HC, [
    ann({ id: 'pinned-old', createdAt: '2026-01-01T00:00:00Z', pinned: true }),
    ann({ id: 'pinned-new', createdAt: '2026-06-01T00:00:00Z', pinned: true }),
    ann({ id: 'pinned-urgent', createdAt: '2025-01-01T00:00:00Z', pinned: true, priority: 3 })
  ]);
  // Two pins is not an error. They come back in the order the strip would
  // take them, so the shell can walk past the ones this phone has dismissed.
  ok('two pins come back in strip order',
    ids(HC.data.pinnedAnnouncements()), ['pinned-urgent', 'pinned-new', 'pinned-old']);

  // The reason the strip has no dates of its own: it retires with the
  // announcement behind it rather than on a second schedule.
  withAnnouncements(HC, [ann({ id: 'expired-pin', pinned: true, endsOn: TODAY })]);
  ok('a pin that has come down takes its strip with it',
    ids(HC.data.pinnedAnnouncements()), []);

  withAnnouncements(HC, [ann({ id: 'future-pin', pinned: true, startsOn: TOMORROW })]);
  ok('a pin that has not gone up yet has no strip',
    ids(HC.data.pinnedAnnouncements()), []);
}

{
  const HC = load(['data.js']);
  // A cached payload written before migration 0028 has no such key on it, and
  // js/content.js coerces it, but the accessor must not put a strip on screen
  // if something ever hands it a row that skipped that mapping.
  withAnnouncements(HC, [ann({ id: 'no-key', pinned: undefined })]);
  ok('a row with no pinned key is not pinned', ids(HC.data.pinnedAnnouncements()), []);
}

/* -------------------------------------------------- an announcement's page */

{
  const HC = load(['data.js']);

  withAnnouncements(HC, [
    ann({ id: 'up' }),
    ann({ id: 'came-down', endsOn: TODAY }),
    ann({ id: 'not-yet', startsOn: TOMORROW })
  ]);

  ok('the page finds an announcement that is on Home',
    (HC.data.getAnnouncement('up') || {}).id, 'up');

  /* THE WHOLE POINT OF IT BEING getAnnouncement AND NOT getLiveAnnouncement.
     A page is an address: it is in somebody's history, and it is where a
     notification left on a lock screen for a fortnight lands. The card comes
     off Home at midnight, which is what the window is for; the page still has
     to hold the words that were being read, with a line saying it has come
     down. See windowNote() in js/screens/announcement.js. */
  ok('and one whose dates have run out, which the page says so about',
    (HC.data.getAnnouncement('came-down') || {}).id, 'came-down');
  ok('and one that has not gone up yet',
    (HC.data.getAnnouncement('not-yet') || {}).id, 'not-yet');

  // Deleted, or an id off a history entry written by an older build. Both
  // want the same screen, which is not an error page.
  ok('an id nobody has is null', HC.data.getAnnouncement('nonsense'), null);
  ok('and so is no id at all', HC.data.getAnnouncement(''), null);
}

/* ------------------------------------------------------------ the two URLs

   Read by three places that must agree: the admin form, which decides whether
   to draw a thumbnail; the link button in the editor, which decides whether to
   insert an anchor; and the announcement screen, which decides whether to draw
   the card at all. A link one of them accepts and another refuses is a card
   that is silently missing. */

{
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'components.js'), 'utf8'), sandbox);
  const c = sandbox.window.HC.components;

  ok('a full link is left alone',
    c.webUrl('https://homechurch.org/serve'), 'https://homechurch.org/serve');
  ok('a bare host gets https, which is what typing one means',
    c.webUrl('homechurch.org/serve'), 'https://homechurch.org/serve');
  ok('an email address gets mailto',
    c.webUrl('hello@homechurch.org'), 'mailto:hello@homechurch.org');
  ok('a phone number is kept as one', c.webUrl('tel:+15045551234'), 'tel:+15045551234');

  // The three that must never come back as something the app will open.
  ok('javascript: is not a link', c.webUrl('javascript:steal()'), '');
  ok('nor is data:', c.webUrl('data:text/html,<script>steal()</script>'), '');
  ok('nor is a sentence somebody typed', c.webUrl('ask at the welcome desk'), '');
  ok('and empty is empty', c.webUrl(''), '');

  ok('the host is what a link card says under its title',
    c.urlHost('https://www.eventbrite.com/e/serve-day?aff=x'), 'eventbrite.com');
  ok('an email link says the address',
    c.urlHost('mailto:hello@homechurch.org'), 'hello@homechurch.org');

  // Every shape somebody can arrive with, because they will.
  ok('a watch link is a video', c.youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  ok('a share link is the same video', c.youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  ok('an embed link too', c.youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  ok('and a bare id pasted on its own', c.youtubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');

  /* The one that has to be refused by name. "videoseries" is a valid eleven
     character base64url string, so no pattern can tell it from an id, and it
     is YouTube's playlist path: a pasted playlist URL would sail through and
     render an error player inside the announcement. */
  ok('a playlist is not a video',
    c.youtubeId('https://www.youtube.com/embed/videoseries?list=PLabcdefghij'), '');
  ok('and something that is not YouTube at all is not a video',
    c.youtubeId('https://vimeo.com/12345'), '');
}

/* ------------------------------------------------------- the two dismissals */

{
  const HC = load(['data.js', 'store.js']);

  HC.store.dismissPin('announcement-serve-day');
  ok('the strip is down', HC.store.isPinDismissed('announcement-serve-day'), true);
  ok('and the card is not', HC.store.isDismissed('announcement-serve-day'), false);
}

{
  const HC = load(['data.js', 'store.js']);

  HC.store.dismiss('announcement-serve-day');
  ok('the card is down', HC.store.isDismissed('announcement-serve-day'), true);
  ok('and the strip is not', HC.store.isPinDismissed('announcement-serve-day'), false);
}

{
  const HC = load(['data.js', 'store.js']);

  // What tapping the strip does on the way to the card, so the tap never
  // lands on a Home that has filtered the card out.
  HC.store.dismiss('a');
  HC.store.dismiss('b');
  HC.store.undismiss('a');
  ok('undismiss puts back the one card named', HC.store.isDismissed('a'), false);
  ok('and leaves everything else where it was', HC.store.isDismissed('b'), true);
  ok('undismissing something never dismissed is a no-op',
    HC.store.isDismissed('never'), false);
}

{
  const HC = load(['data.js', 'store.js']);

  HC.store.dismiss('a');
  HC.store.dismissPin('a');
  HC.store.eraseEverything();
  ok('Delete everything takes the dismissed cards', HC.store.isDismissed('a'), false);
  ok('and the dismissed strips', HC.store.isPinDismissed('a'), false);
}

{
  // Both maps survive a relaunch, which is the whole difference between the x
  // and a strip that comes back every time the app is opened.
  const sandbox = { window: { localStorage: fakeStorage(), console: console } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

  vm.runInContext(src, sandbox);
  sandbox.window.HC.store.dismissPin('announcement-lent');
  sandbox.window.HC.store.dismiss('announcement-serve-day');

  // Same storage, a fresh copy of the module: a cold start on the same phone.
  sandbox.window.HC = undefined;
  vm.runInContext(src, sandbox);

  ok('a dismissed strip stays down across a launch',
    sandbox.window.HC.store.isPinDismissed('announcement-lent'), true);
  ok('a dismissed card stays down across a launch',
    sandbox.window.HC.store.isDismissed('announcement-serve-day'), true);
}

/* -------------------------------------------------------------------------- */

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
