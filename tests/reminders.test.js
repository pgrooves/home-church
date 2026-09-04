/* ===========================================================================
   Get notified, the second button under every event on the Cal tab.

   WHY THIS FILE EXISTS. A reminder is a promise about a moment that has not
   happened yet, and every way it goes wrong is quiet in the same way the
   calendar grid is quiet: nothing throws, nothing looks broken, and somebody
   finds out by not being told about the thing they asked to be told about.

   Four things are worth holding still.

   THE DEFAULT IS THE DAY BEFORE, which is what the sheet promises and what
   the button is for. It is arithmetic on the event's own start, so it has to
   survive an event with a clock time, an event with the church's own phrase
   instead of one, and the month and year boundaries either side.

   AND IT CANNOT BE IN THE PAST. Every event inside the next twenty four hours
   has no day before left, and those are exactly the events somebody is most
   likely to want a reminder about. The default walks down to an hour before,
   and then to ten minutes from now, rather than opening the sheet on a time
   it would refuse to accept.

   THE NOTIFICATION ID IS STABLE. iOS wants a number, the events table hands
   out uuids, and the whole of "changing a reminder replaces the one already
   queued" rests on the same event hashing to the same number every time, in
   range, forever.

   THE TWO BOXES ROUND TRIP. What the sheet writes into a date input and a
   time input has to come back as the same wall clock moment in this phone's
   own zone, because a reminder is a wall clock promise and an hour of drift
   is a notification on the wrong evening.

   No browser and no plugin. Same shape as tests/calendar.test.js: the files
   are run in a VM with the smallest fakes that behave correctly, and only the
   pure helpers are asked anything. Whether iOS actually holds the thing is
   not a question this file can answer.
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

/* js/reminders.js reaches for the plugin through js/native.js and for the
   screen through js/screens/cal.js, and asks nothing of the DOM until a sheet
   is opened. So a document that answers "nothing here" to every query is
   enough to load all four files and ask the arithmetic its questions. */
function load(files) {
  const sandbox = {
    window: { localStorage: fakeStorage(), console: console },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({ set innerHTML(v) {}, firstElementChild: null })
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  files.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  });
  return sandbox.window.HC;
}

const HC = load(['data.js', 'store.js', 'components.js', 'native.js',
                 'screens/cal.js', 'reminders.js']);
const r = HC.reminders;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// 'YYYY-MM-DD' a given number of days from today, in the phone's own zone,
// which is the zone every date on this screen lives in.
function localDay(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);          // noon, so a DST hop cannot move the day
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

/* ------------------------------------------------------ the notification id */

const idA = r.notificationId('9f2b8c1e-0000-4000-8000-000000000001');
const idB = r.notificationId('9f2b8c1e-0000-4000-8000-000000000002');

ok('the same event hashes to the same number twice',
  r.notificationId('9f2b8c1e-0000-4000-8000-000000000001'), idA);
ok('two events that differ in one character do not collide', idA === idB, false);
ok('it is a positive integer', idA > 0 && Number.isInteger(idA), true);
/* iOS rejects anything that does not fit in a 32 bit signed int, and some
   plugin versions read 0 as "no id given". Both ends of that matter. */
ok('and it fits in the range iOS accepts', idA <= 0x7fffffff, true);
ok('an empty id is still a usable number', r.notificationId('') > 0, true);

/* ---------------------------------------------------------- the two boxes */

const round = r.atFrom('2027-03-14', '18:30');
ok('a day and a time come back as that wall clock moment',
  [round.getFullYear(), round.getMonth(), round.getDate(),
   round.getHours(), round.getMinutes()],
  [2027, 2, 14, 18, 30]);

// Midnight is a real answer and 0 is not the same as missing.
const midnight = r.atFrom('2027-03-14', '00:00');
ok('midnight is a time like any other',
  [midnight.getHours(), midnight.getMinutes()], [0, 0]);

ok('an empty day is no answer at all', r.atFrom('', '18:30'), null);
ok('and so is an empty time', r.atFrom('2027-03-14', ''), null);
ok('and so is something that is not a date', r.atFrom('next Tuesday', '18:30'), null);

/* ------------------------------------------------------------- the default */

/* An event a given number of minutes from now, written the way the church
   writes one: a 'YYYY-MM-DD' day and a clock time it can read back. Built
   from the clock rather than hardcoded, because "an event about to start" is
   the case the presets have to drop and a fixture with a time in it is only
   about to start once a day. */
function eventInMinutes(id, minutes) {
  const at = new Date(Date.now() + minutes * MINUTE);
  let h = at.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return {
    id: id,
    title: 'Prayer',
    date: at.getFullYear() + '-' +
      ('0' + (at.getMonth() + 1)).slice(-2) + '-' + ('0' + at.getDate()).slice(-2),
    time: h + ':' + ('0' + at.getMinutes()).slice(-2) + ' ' + suffix,
    location: ''
  };
}

/* An event a fortnight out, at a real clock time. The day before is a whole
   day earlier to the minute, which is the promise the button makes. */
HC.data.events = [
  { id: 'far', title: 'City Serve Day', date: localDay(14), time: '8:00 AM',
    location: 'Meet at the church' },
  { id: 'phrase', title: 'Baptism Sunday', date: localDay(10),
    time: 'All three services', location: '216 Giuffrias Ave' },
  { id: 'tomorrow', title: 'The Loft', date: localDay(1), time: '11:59 PM',
    location: 'Upstairs' },
  eventInMinutes('imminent', 2)
];

const far = HC.data.events[0];
const farStart = HC.screens.calHelpers.eventStart(far);
const farDefault = r.defaultAt(far);

ok('the default is the day before, to the minute',
  farStart.getTime() - farDefault.getTime(), DAY);
ok('and it keeps the event’s own time of day',
  [farDefault.getHours(), farDefault.getMinutes()], [8, 0]);

/* "All three services" is a real value on this calendar and not a clock time.
   js/screens/cal.js guesses nine in the morning for it, and the reminder has
   to make the same guess or the two halves of the app disagree about when the
   event is. */
const phrase = HC.data.events[1];
const phraseDefault = r.defaultAt(phrase);
ok('an event with a phrase instead of a time gets the same nine o’clock guess',
  [phraseDefault.getHours(), phraseDefault.getMinutes()], [9, 0]);
ok('and its default is still a day before it',
  HC.screens.calHelpers.eventStart(phrase).getTime() - phraseDefault.getTime(), DAY);

/* ---------------------------------------------------- the day before is gone

   An event tomorrow night has a "day before" that is earlier today, and an
   event tonight has none at all. Neither may open the sheet on a time it
   would then refuse. */

const tomorrow = HC.data.events[2];
const tomorrowDefault = r.defaultAt(tomorrow);
ok('an event inside a day never defaults to a time already gone',
  tomorrowDefault.getTime() > Date.now(), true);
ok('and it does not default past the event either',
  tomorrowDefault.getTime() <= HC.screens.calHelpers.eventStart(tomorrow).getTime(), true);

/* An event two minutes away has no reminder time left that precedes it, and
   the sheet still has to open on something a person could press Remind me on.
   It lands ten minutes out, which is late for this event and is the honest
   answer: there is no earlier moment left to offer, and the sheet is where
   somebody says what they actually wanted. */
const imminent = HC.data.events[3];
const imminentDefault = r.defaultAt(imminent);
ok('an event about to start still gets a default that is still to come',
  imminentDefault.getTime() > Date.now(), true);

/* ------------------------------------------------------------- the presets

   Three offers, and each is dropped rather than disabled once it has passed,
   because a greyed pill invites a tap that explains nothing. */

const farOffers = r.offerings(far).map(o => o.id);
ok('an event a fortnight out is offered all three',
  farOffers, ['day-before', 'morning-of', 'hour-before']);
ok('and the first of them is what the sheet opens on',
  r.offerings(far)[0].when.getTime(), farDefault.getTime());

const imminentOffers = r.offerings(imminent).map(o => o.id);
ok('an event about to start is offered none of them, not a past one',
  imminentOffers, []);
ok('every offer that is made is still to come',
  r.offerings(tomorrow).every(o => o.when.getTime() > Date.now()), true);

/* --------------------------------------------------------------- the words */

/* What the toast and the sheet say back. The day name is in it because a
   reminder is agreed to on one day and arrives on another, and "Friday" is
   the half of that somebody actually checks. */
const said = r.longLabel(new Date(2027, 2, 14, 18, 30));
ok('a reminder says its day, its date and its time back',
  said, 'Sunday, March 14, 2027 at 6:30 PM');
ok('and noon is PM, not AM',
  r.longLabel(new Date(2027, 2, 14, 12, 0)), 'Sunday, March 14, 2027 at 12:00 PM');
ok('and midnight is 12 AM, not 0 AM',
  r.longLabel(new Date(2027, 2, 14, 0, 5)), 'Sunday, March 14, 2027 at 12:05 AM');

/* --------------------------------------------------------------- the record

   get() is what the button under an event reads. A reminder whose time has
   passed answers null: it has already gone off, so the button is an offer
   again rather than a receipt for something that has happened. */

HC.store.setReminder('far', { at: Date.now() + DAY, id: idA, offset: DAY });
ok('a reminder still to come is read back', !!r.get('far'), true);
ok('and it says when', r.get('far').at > Date.now(), true);

HC.store.setReminder('phrase', { at: Date.now() - MINUTE, id: idB, offset: DAY });
ok('one that has already gone off reads as no reminder', r.get('phrase'), null);
ok('an event nobody set one for reads the same way', r.get('tomorrow'), null);

ok('the button says the day and the time it will arrive',
  r.shortLabel('far'),
  'Reminding you ' +
    HC.components.formatDateShort(
      new Date(r.get('far').at).getFullYear() + '-' +
      ('0' + (new Date(r.get('far').at).getMonth() + 1)).slice(-2) + '-' +
      ('0' + new Date(r.get('far').at).getDate()).slice(-2)) +
    ', ' + HC.components.formatClock(new Date(r.get('far').at)));

HC.store.clearReminder('far');
ok('turning one off leaves nothing behind', r.get('far'), null);

/* ------------------------------------------------------- what a browser gets

   There is no way to hand a web page's reminder to the operating system, so
   the button is not drawn at all rather than drawn and inert. This sandbox has
   no Capacitor in it, which is exactly the shape of a browser. */

ok('a browser cannot hold a reminder, and says so', HC.native.canRemind(), false);
ok('so no button is drawn there', HC.components.remindMe('far'), '');
ok('and scheduling one there fails rather than pretending',
  typeof HC.native.scheduleReminder === 'function', true);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
