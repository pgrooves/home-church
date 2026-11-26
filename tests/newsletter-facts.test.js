/* ===========================================================================
   Reading a draft back against the email it came from.

   WHY THIS FILE EXISTS. The newsletter of the 20th of November 2026 carried
   Christmas Eve Eve on two flyers saying 5pm and 6:30pm. The draft that came
   out of it said "Services at 5:30pm and 7:00pm", it was approved, and a member
   texted the church to ask which was right. The calendar had said 5:00pm for
   five days. Nothing had compared the card with the email, or with the
   calendar, so nothing said so.

   factCheck in supabase/functions/newsletter-intake is that comparison, with
   no model in it. This file lifts it out of the fence the same way
   newsletter-dates.test.js does, and checks the case it is named after first.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  newsletter facts: node ' + process.version +
    ' has no module.stripTypeScriptTypes. Needs node 22.13 or newer.');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};
const has = (label, notes, fragment) => ok(label, notes.some((n) => n.includes(fragment)), true);

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'newsletter-intake', 'index.ts'), 'utf8');

const start = source.indexOf('/* @@ facts:start');
const end = source.indexOf('/* @@ facts:end */');
if (start === -1 || end === -1 || end < start) {
  console.log('FAIL  the fact check is no longer fenced by @@ facts:start / @@ facts:end');
  process.exit(1);
}

const box = vm.runInNewContext(
  stripTypeScriptTypes(source.slice(start, end)) +
  '\n({ clockTimes, dayMentioned, factCheck, servicesLabel, churchClock })',
  { Intl, Date });
const { clockTimes, dayMentioned, factCheck, servicesLabel, churchClock } = box;

const keys = (text, lenient) => clockTimes(text, lenient).map((t) => t.label);

/* ------------------------------------------------------- reading times */

console.log('\n--- clockTimes ---');

ok('the flyer', keys('Christmas Eve Eve | December 23 | 5PM & 6:30PM'), ['5:00pm', '6:30pm']);
ok('the draft', keys('Services at 5:30pm and 7:00pm'), ['5:30pm', '7:00pm']);
ok('three services, one am', keys('8, 9:30, and 11am'), ['8:00am', '9:30am', '11:00am']);
ok('three services, each with its own am', keys('8:00am, 9:30am, and 11:00am'), ['8:00am', '9:30am', '11:00am']);
ok('a range', keys('from 5:00 PM to 6:30 PM'), ['5:00pm', '6:30pm']);
ok('a range with a dash', keys('5–6:30pm'), ['5:00pm', '6:30pm']);
ok('a.m. with full stops', keys('Doors at 6:30 p.m.'), ['6:30pm']);
ok('noon', keys('Lunch at noon'), ['12:00pm']);
ok('a time with no am or pm still counts', keys('Doors open at 6:30'), ['6:30']);
ok('a date is not a time', keys('Wednesday, 12/23/2026'), []);
ok('a year is not a time', keys('December 23, 2026'), []);
ok('a price is not a time', keys('$15 a person'), []);
ok('an age range is not a time', keys('For babies ages 0 to 2'), []);
ok('a count is not a time', keys('Only 7 vendor spots left'), []);
ok('a flyer range "8-1" counts only when reading the email',
  [keys('SUNDAY DECEMBER 6\n8-1'), keys('SUNDAY DECEMBER 6\n8-1', true)], [[], ['8:00', '1:00']]);
ok('THE HOLIDAY MARKET: 8:00am to 1:00pm is vouched for by a flyer saying 8-1', factCheck({
  title: 'Holiday Market, December 6', text: 'Time: 8:00am - 1:00pm',
  event: { date: '2026-12-06', hour: 8, end_hour: 13 },
}, 'Holiday Market\nSUNDAY DECEMBER 6\n8-1', '2026-11-20'), []);
ok('a bare number beside a colon time counts only when reading the email',
  [keys('5-6:30'), keys('5-6:30', true)], [['6:30'], ['5:00', '6:30']]);

/* -------------------------------------------------------- reading days */

console.log('\n--- dayMentioned ---');

const SENT = '2026-11-20';
ok('a month and day', dayMentioned('2026-12-23', 'Wednesday, December 23', SENT), true);
ok('an abbreviated month with an ordinal', dayMentioned('2026-12-23', 'Dec. 23rd', SENT), true);
ok('slashed', dayMentioned('2026-12-23', 'CHRISTMAS EVE EVE 12/23', SENT), true);
ok('the 23rd', dayMentioned('2026-12-23', 'Wednesday the 23rd', SENT), true);
ok('this Sunday, from a Friday newsletter', dayMentioned('2026-11-22', 'Communion this Sunday', SENT), true);
ok('a day the email does not name', dayMentioned('2026-12-24', 'Christmas Eve Eve, December 23', SENT), false);
ok('a weekday three weeks out does not vouch for a date', dayMentioned('2026-12-09', 'every Wednesday', SENT), false);

/* --------------------------------------------- the case it is named after */

console.log('\n--- Christmas Eve Eve ---');

/* What the reader will see from now on: the words of the email, and under
   them the words read off its flyers. */
const EMAIL = [
  'Christmas Eve Eve',
  'Slow down and prepare your heart for Christmas with a special worship service.',
  'Invite family and friends.',
  '',
  'WORDS ON THE FLYERS',
  'FLYER 1',
  'CHRISTMAS EVE EVE',
  'WEDNESDAY DECEMBER 23',
  '5PM & 6:30PM',
].join('\n');

const DRAFT = {
  title: 'Christmas Eve Eve, December 23',
  text: 'Slow down and prepare your heart for Christmas with a special worship service.\n' +
    'Wednesday, December 23, 2026\nServices at 5:30pm and 7:00pm\nInvite family and friends',
  event: { date: '2026-12-23', hour: 17, minute: 30, more_times: [{ hour: 19, minute: 0 }] },
};

/* The calendar as it stood on the 20th: entered and approved on the 15th. */
const CALENDAR = [{
  id: 'event-christmas-eve-eve-service-december-23',
  title: 'Christmas Eve Eve, December 23',
  starts_at: '2026-12-23T23:00:00+00:00',
  time_label: null,
  published: true,
}];

const notes = factCheck(DRAFT, EMAIL, SENT, CALENDAR);
has('THE BUG: 5:30pm and 7:00pm are not in the email', notes,
  '5:30pm and 7:00pm are not in the email or on its flyers');
has('THE BUG: and the calendar already said 5:00pm', notes,
  'The calendar already has “Christmas Eve Eve, December 23” that day at 5:00pm, and this says 5:30pm and 7:00pm');

/* Even with no flyers read at all, the calendar alone would have caught it. */
const wordsOnly = EMAIL.split('WORDS ON THE FLYERS')[0];
has('with the words alone, the calendar still catches it',
  factCheck(DRAFT, wordsOnly, SENT, CALENDAR), 'The calendar already has');

/* And a draft that read the flyers right says nothing at all. */
const RIGHT = {
  ...DRAFT,
  text: DRAFT.text.replace('5:30pm and 7:00pm', '5:00pm and 6:30pm'),
  event: { date: '2026-12-23', hour: 17, minute: 0, more_times: [{ hour: 18, minute: 30 }] },
};
ok('the right times raise nothing', factCheck(RIGHT, EMAIL, SENT, CALENDAR), []);

/* The calendar as it stands now, with both services in its label. */
const FIXED = [{ ...CALENDAR[0], time_label: '5:00pm and 6:30pm' }];
ok('nor against the calendar as it is now', factCheck(RIGHT, EMAIL, SENT, FIXED), []);
has('a wrong draft against the calendar as it is now', factCheck(DRAFT, EMAIL, SENT, FIXED),
  'at 5:00pm and 6:30pm, and this says 5:30pm and 7:00pm');

/* ----------------------------------------------------------- not crying wolf */

console.log('\n--- not crying wolf ---');

const SUNDAY = 'Communion Sunday\nJoin us this Sunday across all three services: 8, 9:30 and 11am.';
ok('three services written loosely in the email, neatly in the draft', factCheck({
  title: 'Communion Sunday, November 22',
  text: 'Service times: 8:00am, 9:30am, and 11:00am',
  event: { date: '2026-11-22', hour: 8 },
}, SUNDAY, SENT), []);

ok('a draft with no times and no date says nothing', factCheck({
  title: 'November Food Drive', text: 'Bring canned goods to the lobby.',
}, 'November Food Drive. Bring canned goods to the lobby.', SENT), []);

ok('a different night with a shared word is not a clash', factCheck({
  title: 'Christmas Party, December 18', text: 'Friday at 6:30pm',
  event: { date: '2026-12-18', hour: 18, minute: 30 },
}, 'Christmas Party, Friday December 18, 6:30pm', SENT, CALENDAR), []);

ok('the same day under a different name is not a clash', factCheck({
  title: 'Choir Rehearsal, December 23', text: 'Rehearsal at 3pm',
  event: { date: '2026-12-23', hour: 15 },
}, 'Choir rehearsal December 23 at 3pm', SENT, CALENDAR), []);

ok('a calendar entry still waiting on its time is not a clash', factCheck(RIGHT, EMAIL, SENT,
  [{ ...CALENDAR[0], time_label: 'Time to be announced' }]), []);

ok('an unpublished calendar entry is not a clash', factCheck(DRAFT, EMAIL.replace('5PM & 6:30PM', '5:30PM & 7PM'), SENT,
  [{ ...CALENDAR[0], published: false }]), []);

/* ------------------------------------------------------------ the day check */

console.log('\n--- the day ---');

has('a date the model worked out but the email never printed', factCheck({
  title: 'Christmas Eve Eve', text: 'A special worship service.',
  event: { date: '2026-12-23' },
}, 'Christmas Eve Eve. A special worship service.', SENT), 'December 23 was worked out, not read');

/* --------------------------------------------------------- several services */

console.log('\n--- servicesLabel ---');

ok('two services', servicesLabel({ date: '2026-12-23', hour: 17, minute: 0, more_times: [{ hour: 18, minute: 30 }] }),
  '5:00pm and 6:30pm');
ok('three services, out of order', servicesLabel({ date: '2026-11-22', hour: 11, more_times: [{ hour: 8 }, { hour: 9, minute: 30 }] }),
  '8:00am, 9:30am and 11:00am');
ok('one time is no label', servicesLabel({ date: '2026-12-23', hour: 17 }), null);
ok('a repeat of the start time is still one', servicesLabel({ date: '2026-12-23', hour: 17, more_times: [{ hour: 17, minute: 0 }] }), null);
ok('nonsense is dropped', servicesLabel({ date: '2026-12-23', hour: 17, more_times: [{ hour: 47 }] }), null);

/* --------------------------------------------------------------- the clock */

console.log('\n--- churchClock ---');

ok('5pm in December is 23:00 UTC', churchClock('2026-12-23T23:00:00+00:00'), { date: '2026-12-23', hour: 17, minute: 0 });
ok('an evening in summer crosses midnight UTC', churchClock('2026-08-21T00:00:00+00:00'), { date: '2026-08-20', hour: 19, minute: 0 });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
