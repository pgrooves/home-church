/* ===========================================================================
   The day a newsletter announcement is about.

   WHY THIS FILE EXISTS. "Baby Blessing Sign-Up 9/20" went through the intake
   on the 4th of September and came out as a perfectly good card with no date
   in the calendar behind it. The model had read the day correctly — it set the
   card to retire on the 21st, which is the 20th plus one — and then left the
   `event` field out, because the rule it was given said a sign-up and a link
   to a form are not events. It is a sign-up. The thing being signed up for
   happens on a Sunday morning, and that Sunday morning is what somebody wanted
   in their phone.

   The prompt is fixed too, and nothing here can test a prompt. What it can
   test is the part that does not depend on the model agreeing with us:
   eventDateFor, which takes the model's answer when there is one and works the
   day out of the announcement's own title or its retire date when there is
   not. That is the guarantee, so it is the thing worth pinning down.

   HOW IT READS THE EDGE FUNCTION. supabase/functions/newsletter-intake is
   TypeScript for Deno, in one file, deployed by pasting it at Supabase — the
   same shape as every other function in this project, and worth keeping. So
   the date helpers are fenced inside it between two markers, and this file
   lifts that fence out, strips the types with node's own stripper, and evals
   it. No Deno, no network, no model. If the markers ever go missing this file
   fails loudly rather than quietly testing nothing.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

/* node prints one ExperimentalWarning for the stripper, on stderr, every run.
   The default listener is what prints it, and the noise is not worth the line
   it takes up in a test run somebody is reading for failures. */
process.removeAllListeners('warning');

/* Added in node 22.13. Skipping loudly rather than failing: an older node is a
   reason this file cannot check the intake's dates, not a reason to tell
   somebody their app is broken. */
if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  newsletter dates: node ' + process.version +
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
  path.join(__dirname, '..', 'supabase', 'functions', 'newsletter-intake', 'index.ts'), 'utf8');

const start = source.indexOf('/* @@ dates:start');
const end = source.indexOf('/* @@ dates:end */');
if (start === -1 || end === -1 || end < start) {
  console.log('FAIL  the date helpers are no longer fenced by @@ dates:start / @@ dates:end');
  process.exit(1);
}

const fenced = stripTypeScriptTypes(source.slice(start, end));
const box = vm.runInNewContext(
  fenced + '\n({ cleanDate, shiftDate, titleDate, eventDateFor })');

const { cleanDate, shiftDate, titleDate, eventDateFor } = box;

/* The newsletter that carried the announcement this file is named after. */
const SENT = '2026-09-04';

/* ------------------------------------------------------- the day before */

console.log('\n--- shiftDate ---');

ok('a day back inside a month', shiftDate('2026-09-21', -1), '2026-09-20');
ok('a day back over the first of the month', shiftDate('2026-10-01', -1), '2026-09-30');
ok('a day back over new year', shiftDate('2027-01-01', -1), '2026-12-31');
/* 2028 is a leap year, and the 1st of March is where a naive "minus one day"
   built out of string arithmetic gets it wrong once every four years. */
ok('a day back onto the 29th of February', shiftDate('2028-03-01', -1), '2028-02-29');

/* ------------------------------------------------- the date in the title

   Rule 3 asks the model to put the date on the front of the card, so this is
   usually there whatever the model then decided about `event`. */

console.log('\n--- titleDate ---');

ok('the one that started this', titleDate('Baby Blessing Sign-Up 9/20', SENT), '2026-09-20');
ok('a month written out', titleDate('City Serve Day, September 12', SENT), '2026-09-12');
ok('a month abbreviated', titleDate('Fall Retreat, Oct 4', SENT), '2026-10-04');
ok('a month abbreviated with a full stop', titleDate('Sept. 20 Baby Blessing', SENT), '2026-09-20');
ok('a range takes the first day', titleDate('Youth Camp, Sept 8-10', SENT), '2026-09-08');
ok('a year the title actually gives', titleDate('Kickoff, January 4, 2027', SENT), '2027-01-04');
ok('a slashed date with a two digit year', titleDate('Baby Blessing 12/20/27', SENT), '2027-12-20');

/* THE YEAR IS THE HARD HALF, because titles almost never say it. Forward
   inside the same year, forward into the next one when the month has already
   gone by, and a fortnight of slack behind the email because a newsletter does
   sometimes look back at last Sunday. */
ok('a month already past is next year', titleDate('New Year Prayer, January 5', SENT), '2027-01-05');
ok('last Sunday is still this year', titleDate('Thank You, August 30', SENT), '2026-08-30');
ok('a spring date from a December newsletter', titleDate('Easter Egg Hunt, April 3', '2026-12-20'), '2027-04-03');

ok('a title with no date at all', titleDate('Home Groups Sign-Up', SENT), null);
ok('a day that does not exist is not a date', titleDate('Something, February 30', SENT), null);
ok('a month that does not exist is not a date', titleDate('Serve 13/40', SENT), null);
/* A verse reference is the false positive worth caring about in a church app,
   and it is a colon rather than a slash, so it must not read as a date. */
ok('a verse reference is not a date', titleDate('Sunday in 1 Peter 5:8', SENT), null);

/* -------------------------------------------------- which day, in the end */

console.log('\n--- eventDateFor ---');

ok('a date the model named outright wins',
  eventDateFor('2026-09-20', 'Baby Blessing Sign-Up 9/20', '2026-09-21', SENT), '2026-09-20');

ok('THE BUG: no event from the model, the day is in the title',
  eventDateFor(null, 'Baby Blessing Sign-Up 9/20', '2026-09-21', SENT), '2026-09-20');

ok('no event and no date in the title, so ends_on minus one',
  eventDateFor(null, 'Baby Blessing Sign-Up', '2026-09-21', SENT), '2026-09-20');

/* The title outranks ends_on rather than the other way round: rule 8 is the
   rule the model gets wrong ("the day AFTER the event, never the event date
   itself"), and a title is the church's own words. */
ok('the title wins over an ends_on that disagrees',
  eventDateFor(null, 'Homecoming Gala, October 23', '2026-10-23', SENT), '2026-10-23');

ok('nothing dated anywhere stays nothing',
  eventDateFor(null, 'Home Groups Sign-Up', null, SENT), null);

ok('a model date that is not a real day falls through to the title',
  eventDateFor(null, 'City Serve Day, September 12', null, SENT), '2026-09-12');

ok('a nonsense ends_on is not arithmetic',
  eventDateFor(null, 'Something Open Ended', 'later this year', SENT), null);

/* cleanDate is inside the fence because everything above leans on it. */
console.log('\n--- cleanDate ---');
ok('a real day', cleanDate('2026-09-20'), '2026-09-20');
ok('a day that is not one', cleanDate('2026-02-31'), null);
ok('not a date at all', cleanDate('next Sunday'), null);
ok('nothing', cleanDate(null), null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
