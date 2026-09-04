/* ===========================================================================
   The month grid on the Cal tab, and the dates that go in and out of it.

   WHY THIS FILE EXISTS. A calendar is arithmetic pretending to be a picture,
   and every way it goes wrong is quiet. A month whose first row is short by
   one puts every date in it on the wrong weekday, which nobody notices until
   somebody turns up on a Tuesday. February in a leap year loses a day. A row
   that is not seven long does not throw, it just draws a grid that leans.

   So monthMatrix is tested against the four shapes a month can have: one that
   starts on a Sunday and needs no lead at all, a 28 day February, the 29 day
   one four years later, and an ordinary month with a lead and a tail.

   THE OTHER HALF IS THE TIME, which is the part of an event that crosses a
   boundary. eventStart reads the church's own phrase for when something
   happens, "All three services" as readily as "12:30 PM", and hands the phone
   a Date; startsAtIso goes the other way, from the two boxes in the admin
   form to the UTC timestamp the table stores. They have to agree about the
   nine in the morning an event with no clock time gets, or a date typed on a
   phone comes back an hour or a day out. Both are checked in the zone the
   test is running in, which is the zone the app does all of this in.

   No browser. Same shape as tests/announcements.test.js: the screen file is
   run in a VM with the smallest fakes that behave correctly, and only the
   helpers that do arithmetic are asked anything. What the grid looks like is
   not this file's business.
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

const HC = load(['data.js', 'store.js', 'components.js', 'screens/cal.js']);
const cal = HC.screens.calHelpers;

/* Today and its neighbours in the phone's own zone, which is the zone the
   list is filtered in. Written out rather than hardcoded, because a test with
   a date in it passes until that date. */
function localDay(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);          // noon, so a DST hop cannot move the day
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

/* ------------------------------------------------------------- the grid --- */

/* February 2026 starts on a Sunday and has 28 days, which is the one month
   shape with no padding at either end. If anything is going to be off by one
   it is here, where there is nothing to hide it. */
const feb26 = cal.monthMatrix(2026, 1);

ok('a 28 day month starting on Sunday is exactly four rows', feb26.length, 4);
ok('and every row is seven long', feb26.map(w => w.length), [7, 7, 7, 7]);
ok('and it opens on the first', feb26[0][0], 1);
ok('and closes on the 28th with nothing after it', feb26[3][6], 28);

// Four years on, the same month has an extra day and needs a fifth row for it.
const feb28 = cal.monthMatrix(2028, 1);
ok('a leap February has 29 days', feb28.reduce((n, w) => n + w.filter(Boolean).length, 0), 29);
ok('and February 29 is really in it', feb28.some(w => w.indexOf(29) > -1), true);

/* September 2026 starts on a Tuesday, so it has a two cell lead and a three
   cell tail, and the tail is the half that tends to be forgotten: a row that
   stops after the 30th rather than being padded out draws a grid that ends in
   a ragged edge. */
const sep26 = cal.monthMatrix(2026, 8);
ok('a month that starts mid week gets its lead', sep26[0].slice(0, 3), [0, 0, 1]);
ok('and every row is still seven long', sep26.every(w => w.length === 7), true);
ok('and the last row is padded rather than short',
  sep26[sep26.length - 1].length, 7);
ok('the 30th is the last day in it',
  Math.max.apply(null, [].concat.apply([], sep26)), 30);

/* Every day, once, in order. The cheap version of this test counts the cells;
   this one checks they are the days of that month in sequence, which is what
   catches a matrix that is the right size and the wrong shape. */
const days = [].concat.apply([], sep26).filter(Boolean);
ok('every day appears once, in order',
  days.join(','), Array.from({ length: 30 }, (_, i) => i + 1).join(','));

// December rolls the year rather than producing a thirteenth month.
ok('December is the twelfth month and does not roll',
  cal.monthMatrix(2026, 11).reduce((n, w) => n + w.filter(Boolean).length, 0), 31);

ok('an iso date is the phone-zone day, zero padded', cal.isoDate(2026, 8, 7), '2026-09-07');

/* ---------------------------------------------------- what the screen reads */

HC.data.events = [
  { id: 'a', title: 'Baptism Sunday', date: localDay(3), time: 'All three services',
    location: '216 Giuffrias Ave', blurb: 'Get in the water with us.' },
  { id: 'b', title: 'Coffee', date: localDay(3), time: '12:30 PM', location: 'The Loft' },
  { id: 'c', title: 'Serve Day', date: localDay(30), time: '8:00 AM to 1:00 PM',
    location: 'Meet at the church' },
  { id: 'd', title: 'Last month', date: localDay(-14), time: '6:00 PM', location: '' },
  { id: 'e', title: 'Today', date: localDay(0), time: '9:00 AM', location: '' }
];

const byDay = cal.eventsByDay();
ok('two events on one day land in the same day', (byDay[localDay(3)] || []).length, 2);
ok('and are in the order they are read', (byDay[localDay(3)] || []).map(e => e.id), ['a', 'b']);
ok('a day with nothing on it is simply not in the index', byDay[localDay(1)], undefined);

/* The list under the grid. Today counts as upcoming, which is the whole point
   of it: an event this evening must not drop off the screen at breakfast. */
const soon = cal.upcoming();
ok('upcoming is soonest first and drops what has been', soon.map(e => e.id),
  ['e', 'a', 'b', 'c']);

ok('a time and a place are joined', cal.metaLine(HC.data.events[1]), '12:30 PM · The Loft');
/* Both halves are nullable columns, so both have to be allowed to be missing.
   The section this list came from printed a leading middot on an event with
   no location, which is the one behaviour that changed in the move. */
ok('and a missing place does not leave a stray dot',
  cal.metaLine(HC.data.events[3]), '6:00 PM');
ok('an event with neither says nothing at all',
  cal.metaLine({ time: '', location: '' }), '');

/* ------------------------------------------------------------- the clock --- */

const noon = cal.eventStart({ date: '2026-09-12', time: '12:30 PM' });
ok('an afternoon time is read as an afternoon time',
  [noon.getHours(), noon.getMinutes()], [12, 30]);
ok('and it lands on the day it says',
  [noon.getFullYear(), noon.getMonth(), noon.getDate()], [2026, 8, 12]);

const morning = cal.eventStart({ date: '2026-09-12', time: '8:00 AM to 1:00 PM' });
ok('a range starts when the range starts', [morning.getHours(), morning.getMinutes()], [8, 0]);

/* "All three services" is a real value on this calendar and it is not a clock
   time. Nine in the morning is the least wrong guess for a church event, and
   the two halves of the app have to make the same one. */
const phrase = cal.eventStart({ date: '2026-09-12', time: 'All three services' });
ok('a phrase instead of a time falls back to nine',
  [phrase.getHours(), phrase.getMinutes()], [9, 0]);

const typed = new Date(cal.startsAtIso({ date: '2026-09-12', time: '18:30' }));
ok('what the form saves is the evening somebody typed, in this zone',
  [typed.getFullYear(), typed.getMonth(), typed.getDate(), typed.getHours(), typed.getMinutes()],
  [2026, 8, 12, 18, 30]);

const unclocked = new Date(cal.startsAtIso({ date: '2026-09-12', time: '' }));
ok('and an event with no clock time makes the same nine o clock guess',
  [unclocked.getDate(), unclocked.getHours()], [12, 9]);

/* ------------------------------------------- one event, said one way ---

   HC.components.eventWhen is the sentence the Admin screen puts on a date and
   the sentence the confirm in front of Merge repeats back. Two things read it
   and one of them is a dialog about deleting a row from the church's calendar,
   so the case that matters is the placeholder: a parsed event whose email gave
   no hour still carries a starts_at, because the column is not null, and an
   app that printed its nine in the morning would be stating as a fact
   something nobody said. Migration 0052 leans on exactly this distinction when
   it decides whether a merge moves a date. */

const clocked = HC.components.eventWhen({
  starts_at: new Date(2026, 9, 23, 18, 30).toISOString(), time_label: null
});
ok('a date with an hour says the hour', clocked, 'October 23, 2026, 6:30 PM');

const labelled = HC.components.eventWhen({
  starts_at: new Date(2026, 9, 23, 9, 0).toISOString(),
  time_label: 'Time to be announced'
});
ok('and one without says so instead of printing the guess',
  labelled, 'October 23, 2026, Time to be announced');

ok('a row with no date at all says so', HC.components.eventWhen({}), 'No date');
ok('and so does a date nothing can parse',
  HC.components.eventWhen({ starts_at: 'the second Tuesday' }), 'No date');

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
