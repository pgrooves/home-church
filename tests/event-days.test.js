/* ===========================================================================
   One event on more than one day, and what the Cal tab does with it.

   WHY THIS IS A FILE OF ITS OWN rather than four more cases in
   tests/calendar.test.js. That file is about arithmetic — a month with 28
   days, a leap February, nine in the morning meaning the same thing on both
   sides of a save. This is about a rule with two halves that pull in opposite
   directions, and the whole value of writing it down is that the two halves
   are stated next to each other:

     THE GRID DRAWS IT ON EVERY DAY. A class over two Sundays must be on the
     5th and on the 12th, because the person looking at the Monday in between
     is asking "is this still happening" and an empty grid answers no.

     THE LIST DRAWS IT ONCE. Upcoming is "what is coming up", and a class that
     filled two rows of it would read as two classes — which is the exact
     confusion multi-day events exist to remove.

   Get either one backwards and nothing throws. The calendar simply says
   something slightly untrue, forever, to everybody.

   THE THIRD THING, and it is the one that cannot be taken back: Add to
   calendar writes into somebody's own calendar, which this app can never reach
   again. So the day a tap sends is checked here — the button under the second
   Sunday must add the second Sunday and not the first.

   No browser. Same shape as tests/calendar.test.js: js/content.js and
   js/screens/cal.js run in a VM with the smallest fakes that behave
   correctly, and only the helpers that decide something are asked anything.
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

/* Today and its neighbours in the phone's own zone, which is the zone all of
   this is filtered in. Written out rather than hardcoded, because a test with
   a date in it passes until that date. */
function localDay(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);          // noon, so a DST hop cannot move the day
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

/* --------------------------------------------------------- the day list --- */

ok('an event with one day is on one day',
  cal.daysOf({ date: '2026-10-04', dates: ['2026-10-04'] }), ['2026-10-04']);

/* A payload cached before migration 0074 has `date` and no `dates` at all, and
   it is read by an app that has already reloaded. Falling over there would
   empty the calendar on every phone until the next sync. */
ok('a payload from before this feature still has a day',
  cal.daysOf({ date: '2026-10-04' }), ['2026-10-04']);

ok('and an event with no date at all is on no days', cal.daysOf({}), []);

/* --------------------------------------------------------------- the grid --- */

HC.data.events = [
  { id: 'class', title: 'Membership Class', date: localDay(3),
    dates: [localDay(3), localDay(10)], time: '6:30 PM', location: 'The Loft' },
  { id: 'retreat', title: 'Fall Retreat', date: localDay(5),
    dates: [localDay(5), localDay(6), localDay(7)], time: '5:00 PM', location: '' },
  { id: 'coffee', title: 'Coffee', date: localDay(3), dates: [localDay(3)],
    time: '12:30 PM', location: 'The Loft' },
  { id: 'gone', title: 'Last month', date: localDay(-14), dates: [localDay(-14)],
    time: '6:00 PM', location: '' }
];

const byDay = cal.eventsByDay();

// Sorted by title within a day, which is the order this grid has always
// drawn and is not something multi-day events change.
ok('a class over two Sundays is on the first one',
  (byDay[localDay(3)] || []).map(e => e.id), ['coffee', 'class']);

/* THE HALF THAT WAS BROKEN BEFORE 0074. The second Sunday drew nothing, so
   somebody checking the grid that week concluded the class was over. */
ok('and on the second one, which is the whole point',
  (byDay[localDay(10)] || []).map(e => e.id), ['class']);

ok('a retreat is on every day of the weekend it runs',
  [3, 4, 5, 6, 7].map(n => (byDay[localDay(n)] || []).length), [2, 0, 1, 1, 1]);

ok('one event on one day is still on it once',
  (byDay[localDay(3)] || []).filter(e => e.id === 'class').length, 1);

ok('a day with nothing on it is simply not in the index',
  byDay[localDay(1)], undefined);

/* --------------------------------------------------------------- the list --- */

const soon = cal.upcoming();

ok('every event still to come is listed, and the one that has been is not',
  soon.map(e => e.id), ['coffee', 'class', 'retreat']);

ok('and each is listed exactly once, however many days it runs',
  soon.filter(e => e.id === 'retreat').length, 1);

/* A class whose first Sunday has passed is still coming up, and printing it
   under the Sunday that has gone would be worse than not listing it at all. */
HC.data.events = [
  { id: 'half-done', title: 'Membership Class', date: localDay(-3),
    dates: [localDay(-3), localDay(4)], time: '6:30 PM', location: '' }
];

const half = cal.upcoming();
ok('a class part way through is still coming up', half.map(e => e.id), ['half-done']);
ok('and it is printed under the day it is next on, not the day it began',
  half[0].date, localDay(4));

/* The copy Upcoming prints must not be the row the rest of the app reads. If
   this leaks, the date on Home moves for everybody as a side effect of
   somebody opening the Cal tab. */
ok('and the event itself still starts on the day it started on',
  HC.data.events[0].date, localDay(-3));

/* --------------------------------------------------------- what it says --- */

const twoSundays = { date: localDay(3), dates: [localDay(3), localDay(10)] };
ok('two days are both named', cal.otherDays(twoSundays, localDay(3)),
  'Also ' + HC.components.formatDate(localDay(10)));

const weekend = { date: localDay(5), dates: [localDay(5), localDay(6), localDay(7)] };
ok('three are named too, because two is still a sentence',
  cal.otherDays(weekend, localDay(5)),
  'Also ' + HC.components.formatDate(localDay(6)) + ' and ' +
  HC.components.formatDate(localDay(7)));

const many = { date: localDay(1), dates: [1, 2, 3, 4, 5, 6].map(localDay) };
ok('more than that is counted rather than listed',
  cal.otherDays(many, localDay(1)),
  'Also on 5 other days, through ' + HC.components.formatDate(localDay(6)));

ok('a one-day event says nothing at all',
  cal.otherDays({ date: localDay(3), dates: [localDay(3)] }, localDay(3)), '');

/* "Also" about a date that has been and gone is a sentence nobody can act on.
   The row is printing the last day of a retreat; the days before it are past. */
ok('and days that have already gone are not offered as also',
  cal.otherDays({ date: localDay(-2), dates: [localDay(-2), localDay(0)] }, localDay(0)), '');

/* ------------------------------------------------- which day gets added --- */

/* THE ONE THAT CANNOT BE TAKEN BACK. Add to calendar writes into somebody's
   own calendar and this app can never reach it again, so the button under the
   second Sunday has to add the second Sunday. */
const evt = { date: '2026-10-04', dates: ['2026-10-04', '2026-10-11'], time: '6:30 PM' };

const first = cal.eventStart(evt);
ok('with no day named it is the day the event starts on',
  [first.getFullYear(), first.getMonth(), first.getDate(), first.getHours()],
  [2026, 9, 4, 18]);

const second = cal.eventStart(evt, '2026-10-11');
ok('and the second Sunday adds the second Sunday, at the same hour',
  [second.getFullYear(), second.getMonth(), second.getDate(), second.getHours()],
  [2026, 9, 11, 18]);

/* A day that is not a day. An attribute can be missing, empty, or something
   nobody meant; all three have to land on the event's own date rather than on
   an Invalid Date, which would put NaN in somebody's calendar. */
['', null, undefined, 'next Tuesday', '2026-13-45x'].forEach(function (bad) {
  const d = cal.eventStart(evt, bad);
  ok('a day of ' + JSON.stringify(bad) + ' falls back to the first day',
    [d.getMonth(), d.getDate()], [9, 4]);
});

/* ------------------------------------------------------------ the form --- */

cal.startDraft({
  id: 'event-class', title: 'Membership Class',
  starts_at: new Date(2026, 9, 4, 18, 30).toISOString(),
  also_on: ['2026-10-11'], location: 'The Loft', description: 'Two Sundays.'
});

ok('editing a class opens with its other Sunday on it',
  cal.getDraft().days, ['2026-10-11']);

ok('adding a third is taken', cal.addDay('2026-10-18'), '');
ok('and lands in order', cal.getDraft().days, ['2026-10-11', '2026-10-18']);

/* All three refusals say something rather than silently doing nothing, because
   a date box that swallows a tap is a date box people tap twice. */
ok('the day already in the Date box is refused',
  cal.addDay('2026-10-04'), 'That is already the date above.');
ok('so is one already on the list',
  cal.addDay('2026-10-11'), 'That day is already on it.');
ok('and so is an empty box', cal.addDay(''), 'Pick a day first.');

ok('nothing was added by any of those', cal.getDraft().days.length, 2);

cal.removeDay('2026-10-11');
ok('a day can be taken off', cal.getDraft().days, ['2026-10-18']);

cal.removeDay('2026-10-18');
ok('and the last one leaves an empty list rather than nothing',
  cal.getDraft().days, []);

/* A new event starts with no other days, which is what nearly every event is. */
cal.startDraft(null);
ok('a new event begins as a one-day event', cal.getDraft().days, []);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
