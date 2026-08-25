/* ===========================================================================
   The reading plan on Home, which is two pieces of arithmetic wearing a card.

   WHY THIS FILE EXISTS. Both of them are wrong in the same quiet way. A week
   number counted from the wrong day, or a reading taken from the wrong slot in
   the schedule, produces a card that looks exactly like a correct one: a real
   week, a real chapter, a bar drawn to a plausible width. Nobody scrolling
   past Home is going to catch it, and the church finds out when a group turns
   up having read the wrong thing.

   That is the bug this pair was written for. `starts_on` (0024) made the week
   number advance on its own and left the reading beside it sitting wherever
   somebody last typed it, so Home printed "Week 17 of 20" over 2 Samuel 13,
   which the church had finished in June. `weeks` (0032) is the other half.

   So the questions here are: does the week roll over on the right day, does it
   hold at both ends of the plan, and does the reading come out of the slot the
   week number names, including when the schedule cannot answer and the old
   single cell has to.

   No browser. Nothing in this file touches the DOM, because neither function
   does: they are given a plan and the day, and they return a number and a
   sentence. js/screens/home.js hands them over as HC.screens.homeHelpers for
   exactly this reason.
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

const RealDate = Date;

/* 'YYYY-MM-DD' as a local midnight, which is what js/components.js does. The
   real one is not reachable from here without loading the whole component
   file, and this is the whole of what planWeek asks of it. */
function parseDate(iso) {
  const parts = String(iso).split('-');
  return new RealDate(+parts[0], (+parts[1]) - 1, +parts[2]);
}

/* Today, frozen. A test with a real clock in it passes until the day it does
   not, and every question below is about which day it is. Noon, so a fake that
   is an hour out either way is still the same date. */
function load(today) {
  function FakeDate(y, m, d) {
    if (arguments.length === 0) return parseDate(today);
    return new RealDate(y, m, d);
  }
  FakeDate.UTC = RealDate.UTC;
  FakeDate.now = () => parseDate(today).getTime();

  const sandbox = { window: { console: console } };
  sandbox.window.window = sandbox.window;
  sandbox.Date = FakeDate;
  sandbox.console = console;
  sandbox.String = String;
  sandbox.Array = Array;
  sandbox.Math = Math;
  vm.createContext(sandbox);

  /* data.js first, for the seed plan, then the one thing home.js reaches for
     at load time. Nothing here draws, so components is only parseDate. */
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8'), sandbox);
  sandbox.window.HC.components = { parseDate: parseDate };
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'screens', 'home.js'), 'utf8'), sandbox);

  return sandbox.window.HC;
}

/* A plan with a schedule long enough to index into and short enough to read. */
function plan(over) {
  const p = {
    id: 'plan-test',
    title: 'The Gospels',
    totalWeeks: 4,
    startsOn: '2026-05-03',
    currentWeek: 1,
    thisWeek: 'whatever was last typed here',
    weeks: ['Matthew 1 to 4', 'Matthew 5 to 9', 'Matthew 10 to 13', 'Matthew 14 to 18']
  };
  Object.keys(over || {}).forEach(k => { p[k] = over[k]; });
  return p;
}


/* ------------------------------------------------- which week it is today */

(function () {
  const H = load('2026-05-03').screens.homeHelpers;
  ok('the first day of a plan is week 1', H.planWeek(plan()), 1);
})();

(function () {
  const H = load('2026-05-09').screens.homeHelpers;
  ok('and the sixth day after it still is', H.planWeek(plan()), 1);
})();

(function () {
  const H = load('2026-05-10').screens.homeHelpers;
  ok('the count rolls over on the weekday the plan began', H.planWeek(plan()), 2);
})();

(function () {
  const H = load('2026-04-26').screens.homeHelpers;
  ok('a plan that has not started yet reads as week 1, not week 0',
    H.planWeek(plan()), 1);
})();

(function () {
  const H = load('2027-01-01').screens.homeHelpers;
  ok('and one that has finished holds at its last week rather than running on',
    H.planWeek(plan()), 4);
})();

/* The reason utcDay() exists. Two local midnights across the spring change are
   23 hours apart, so a full week measured in local time is 6.96 of them, and
   Math.floor takes that back to the week before: the card would sit on week 1
   for eight days and every week after would be a day late. */
(function () {
  const H = load('2026-03-15').screens.homeHelpers;
  ok('a week that contains the clocks going forward is still a week',
    H.planWeek(plan({ startsOn: '2026-03-08', totalWeeks: 8 })), 2);
})();

/* The fallback 0024 left in place: a row nobody has put a start date on keeps
   showing the number somebody typed, which is what the app did before dates. */
(function () {
  const H = load('2026-05-03').screens.homeHelpers;
  ok('a plan with no start date falls back to the week in the row',
    H.planWeek(plan({ startsOn: '', currentWeek: 3 })), 3);
})();


/* ------------------------------------------------- and what it reads today */

(function () {
  const H = load('2026-05-10').screens.homeHelpers;
  const r = H.planReading(plan(), H.planWeek(plan()));
  ok('the reading comes out of the slot the week number names', r.text, 'Matthew 5 to 9');
  ok('and the pencil writes back to that slot, not to the one beside it',
    { column: r.column, field: r.field, path: r.path },
    { column: 'weeks', field: 'weeks', path: [1] });
})();

(function () {
  const H = load('2027-01-01').screens.homeHelpers;
  const p = plan();
  ok('a finished plan holds on its last reading, in step with its last week',
    H.planReading(p, H.planWeek(p)).text, 'Matthew 14 to 18');
})();

/* The three ways the schedule can fail to answer. Every one of them draws
   exactly what Home drew before `weeks` existed, and says so in the
   descriptor, so a church that has not written a schedule sees no change. */
(function () {
  const H = load('2026-05-10').screens.homeHelpers;
  const r = H.planReading(plan({ weeks: [] }), 2);
  ok('a plan with no schedule falls back to the single cell', r.text,
    'whatever was last typed here');
  ok('and the pencil follows it to that column',
    { column: r.column, field: r.field, path: r.path },
    { column: 'this_week', field: 'thisWeek', path: null });
})();

(function () {
  const H = load('2026-05-10').screens.homeHelpers;
  ok('a schedule shorter than the plan falls back once it runs out',
    H.planReading(plan({ weeks: ['Matthew 1 to 4'] }), 2).text,
    'whatever was last typed here');
})();

(function () {
  const H = load('2026-05-10').screens.homeHelpers;
  ok('and so does a week left blank in the middle of one',
    H.planReading(plan({ weeks: ['Matthew 1 to 4', '   ', 'Matthew 10 to 13'] }), 2).text,
    'whatever was last typed here');
})();

/* Nothing to say, so nothing is said. Home drops the sentence rather than
   printing "This week," with a blank after it. */
(function () {
  const H = load('2026-05-10').screens.homeHelpers;
  ok('a plan with neither draws no reading at all',
    H.planReading(plan({ weeks: [], thisWeek: '' }), 2), null);
})();

/* A jsonb column arriving as something other than an array is a project that
   has been edited by hand. It falls back rather than throwing on .length. */
(function () {
  const H = load('2026-05-10').screens.homeHelpers;
  ok('and a weeks column that is not a list is ignored, not crashed on',
    H.planReading(plan({ weeks: 'Matthew 5 to 9' }), 2).text,
    'whatever was last typed here');
})();


/* ------------------------------------------------------------- the seed plan */
/* js/data.js is what a phone draws before it has ever reached Supabase, so its
   plan has to hold up to the same two functions. A schedule shorter than the
   plan it belongs to is the way this file goes stale: it would draw correctly
   for months and then quietly fall back to a line from last spring. */

(function () {
  const HC = load('2026-05-10');
  const p = HC.data.readingPlan;
  ok('the seed plan carries a reading for every week it claims to run',
    p.weeks.length, p.totalWeeks);
  ok('and every one of them says something',
    p.weeks.filter(w => !String(w).trim()).length, 0);

  const H = HC.screens.homeHelpers;
  const week = H.planWeek(p);
  ok('so the seed plan never falls back to its own single cell',
    H.planReading(p, week).column, 'weeks');
})();


console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
