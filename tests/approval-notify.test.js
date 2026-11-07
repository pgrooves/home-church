/* ===========================================================================
   What the approval notification says. Migration 0098.

   An admin approves a sitting of the newsletter queue and answers Yes or More
   after each one; one notification goes out for the lot. This pins the words:
   the three wordings for one announcement, for one date, and for a batch,
   taken in turn; an announcement and its own date counting once; and no emoji
   anywhere, because the church asked for plain words.

   HOW IT READS THE EDGE FUNCTION. Same trick as tests/push-gateway.test.js:
   the wording is fenced between @@ batch-note:start and @@ batch-note:end in
   send-push, lifted out, stripped of types with node's own stripper, and run.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  approval notify: node ' + process.version +
    ' has no module.stripTypeScriptTypes. Needs node 22.13 or newer.');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'send-push', 'index.ts'), 'utf8');

const start = source.indexOf('/* @@ batch-note:start */');
const end = source.indexOf('/* @@ batch-note:end */');
if (start === -1 || end === -1 || end < start) {
  console.log('FAIL  the approval wording is no longer fenced by @@ batch-note:start / @@ batch-note:end');
  process.exit(1);
}

const fenced = stripTypeScriptTypes(source.slice(start, end));
const W = vm.runInNewContext(fenced +
  '\n({ splitDated, eventTime, pickBatch, turnKeyFor, approvalNote })',
  { Intl, Date, Map, Set, Number, String });

// Thursday, October 29 2026, 6 pm in Metairie (CDT, UTC-5).
const GALA_DATE = { id: 'event-gala', title: 'Homecoming Gala, October 29',
  starts_at: '2026-10-29T23:00:00Z', time_label: null };
const GALA = { id: 'announcement-gala', title: 'Homecoming Gala, October 29',
  event_id: 'event-gala' };
const MARKET = { id: 'announcement-market', title: 'Holiday Market, December 6', event_id: null };
const BLESSING = { id: 'announcement-blessing', title: 'Baby Blessing, December 13', event_id: null };
const VOLUNTEERS = { id: 'announcement-volunteers', title: 'Volunteers needed', event_id: null };
const PARTY = { id: 'event-party', title: 'Christmas Party',
  starts_at: '2026-12-19T00:30:00Z', time_label: null };   // Fri Dec 18, 6:30 pm
const TBA = { id: 'event-tba', title: 'Fall Retreat',
  starts_at: '2026-11-20T15:00:00Z', time_label: 'Time to be announced' };

const SATURDAY = new Date('2026-11-07T16:00:00Z');
const one = (row, kind) => [{ kind: kind || 'announcement', row }];
const note = (picked, turn) => W.approvalNote(picked, turn, SATURDAY);

/* ----------------------------------------------------- one announcement */

ok('one announcement, first wording',
  note(one(GALA), 0),
  { title: 'Something new from Home Church',
    body: 'Homecoming Gala, October 29. Tap to see the details.' });

ok('one announcement, second wording',
  note(one(GALA), 1),
  { title: 'Heads up!', body: 'Homecoming Gala is coming October 29. Take a look.' });

ok('one announcement, third wording',
  note(one(GALA), 2),
  { title: 'Homecoming Gala, October 29', body: 'Just posted. Tap for the details.' });

ok('the fourth goes back to the first',
  note(one(GALA), 3).title, 'Something new from Home Church');

ok('an announcement with no date leaves the date out',
  note(one(VOLUNTEERS), 1),
  { title: 'Heads up!', body: 'Volunteers needed. Take a look.' });

/* --------------------------------------------------------------- one date */

ok('one date, first wording',
  note(one(GALA_DATE, 'event'), 0),
  { title: 'Save the date',
    body: 'Homecoming Gala · Thursday, October 29. It’s on the calendar now.' });

ok('one date, second wording',
  note(one(GALA_DATE, 'event'), 1),
  { title: 'Mark your calendar',
    body: 'Homecoming Gala is Thursday, October 29. We’d love to see you there.' });

ok('one date, third wording, with its time',
  note(one(GALA_DATE, 'event'), 2),
  { title: 'New on the calendar', body: 'Homecoming Gala · Thursday, October 29 at 6 pm' });

ok('a time with minutes',
  note(one(PARTY, 'event'), 2).body, 'Christmas Party · Friday, December 18 at 6:30 pm');

ok('a time label that is not a time leaves "at" off',
  note(one(TBA, 'event'), 2).body, 'Fall Retreat · Friday, November 20');

/* ------------------------------------------------------------------ batch */

const batch = [
  { kind: 'announcement', row: MARKET },
  { kind: 'announcement', row: BLESSING },
  { kind: 'announcement', row: VOLUNTEERS },
  { kind: 'event', row: PARTY },
  { kind: 'event', row: TBA },
];

ok('batch, first wording, with the day',
  note(batch, 0),
  { title: 'Happy Saturday!',
    body: '3 new announcements and 2 dates on the calendar: Holiday Market, Baby Blessing and more.' });

ok('batch, second wording',
  note(batch, 1),
  { title: 'Fresh from Home Church',
    body: 'Holiday Market, Baby Blessing and more just went up. ' +
          '3 new announcements and 2 dates on the calendar.' });

ok('batch, third wording',
  note(batch, 2),
  { title: 'A few things to know',
    body: '3 new announcements and 2 dates on the calendar. Tap to see what’s new.' });

ok('two things name both',
  note(batch.slice(0, 2), 0).body, '2 new announcements: Holiday Market and Baby Blessing.');

ok('one of each is singular',
  note([batch[0], batch[3]], 0).body,
  '1 new announcement and 1 date on the calendar: Holiday Market and Christmas Party.');

ok('dates only',
  note(batch.slice(3), 0).body, '2 new dates on the calendar: Christmas Party and Fall Retreat.');

/* --------------------------------------------------------- what counts */

const items = (list) => list.map(([kind, row_id]) => ({ kind, row_id }));

ok('an announcement and its own date count once, as the announcement',
  W.pickBatch(items([['announcement', 'announcement-gala'], ['event', 'event-gala']]),
    [GALA], [GALA_DATE]).map((p) => p.kind),
  ['announcement']);

ok('even when the date was approved first',
  W.pickBatch(items([['event', 'event-gala'], ['announcement', 'announcement-gala']]),
    [GALA], [GALA_DATE]).length, 1);

ok('a row no longer up is left out',
  W.pickBatch(items([['announcement', 'announcement-market'], ['announcement', 'gone']]),
    [MARKET], []).length, 1);

ok('a batch that has emptied says nothing',
  note(W.pickBatch(items([['announcement', 'gone']]), [], []), 0), null);

ok('one left after the rest dropped out uses the single wording',
  W.turnKeyFor(W.pickBatch(items([['event', 'event-party'], ['announcement', 'gone']]), [], [PARTY])),
  'approved_one_date');

ok('more than one is a batch',
  W.turnKeyFor(batch), 'approved_batch');

/* ---------------------------------------------------------------- shape */

ok('a date title has its date taken off for the name',
  W.splitDated('Baby Blessing, December 13'), { name: 'Baby Blessing', date: 'December 13' });

ok('a title that is only a date is left whole',
  W.splitDated('December 13').name, 'December 13');

const every = [];
for (let t = 0; t < 3; t++) {
  every.push(note(one(GALA), t), note(one(GALA_DATE, 'event'), t), note(batch, t));
}
ok('no emoji in any wording',
  every.filter((n) => /\p{Extended_Pictographic}/u.test(n.title + n.body)).length, 0);

ok('every body fits the lock screen',
  every.filter((n) => n.body.length > 178).length, 0);

const long = { id: 'a-long', title: 'A'.repeat(300), event_id: null };
ok('a very long title is clipped, not sent whole',
  note(one(long), 0).body.length <= 178, true);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
