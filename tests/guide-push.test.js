/* ===========================================================================
   What the new guide notice says.

   It is read at a glance on a lock screen, so the wording is the feature: a
   greeting that fits when it lands (1pm Sunday, or 8am Monday), that the
   guide is live in the app, and the series and which sermon of it this is.

   HOW IT READS THE EDGE FUNCTION. Same trick as tests/push-gateway.test.js:
   the helpers are fenced between @@ guide-note:start and @@ guide-note:end,
   and this lifts that fence out, strips the types and evals it.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  guide push: node ' + process.version +
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

const start = source.indexOf('/* @@ guide-note:start */');
const end = source.indexOf('/* @@ guide-note:end */');
if (start === -1 || end === -1 || end < start) {
  console.log('FAIL  the guide note helpers are no longer fenced by @@ guide-note:start / @@ guide-note:end');
  process.exit(1);
}

const { guideGreeting, guideBody } = vm.runInNewContext(
  stripTypeScriptTypes(source.slice(start, end)) + '\n({ guideGreeting, guideBody })');

console.log('\n--- the greeting ---');

// 2026-10-04 is a Sunday. 18:00 UTC is 1pm in Chicago (CDT).
ok('Sunday at 1pm in Chicago', guideGreeting(new Date('2026-10-04T18:00:00Z')), 'Happy Sunday!');
// 13:00 UTC Monday is 8am in Chicago.
ok('Monday at 8am in Chicago', guideGreeting(new Date('2026-10-05T13:00:00Z')), 'Good morning!');
// 03:00 UTC Monday is still Sunday evening in Chicago, so the day is Chicago's.
ok('the day is Chicago\'s, not UTC\'s', guideGreeting(new Date('2026-10-05T03:00:00Z')), 'Happy Sunday!');
// Winter, CST: 14:00 UTC Monday is 8am.
ok('Monday at 8am in winter', guideGreeting(new Date('2026-12-07T14:00:00Z')), 'Good morning!');
ok('a weekday afternoon (a hand-sent test)', guideGreeting(new Date('2026-10-06T20:00:00Z')), 'Hi there!');

console.log('\n--- the body ---');

ok('series and part',
  guideBody('The Life of David', 4),
  'This week’s guide is live in the app: The Life of David, Part 4.');
ok('series with no part number',
  guideBody('The Life of David', null),
  'This week’s guide is live in the app: The Life of David.');
ok('no series at all',
  guideBody(null, null),
  'This week’s guide is live in the app.');
ok('a blank series title reads as none',
  guideBody('   ', 2),
  'This week’s guide is live in the app.');
ok('short enough to read at a glance',
  guideBody('The Life of David', 12).length <= 90, true);
ok('no em-dash, the brand rule',
  /—/.test(guideBody('X', 1) + guideGreeting(new Date())), false);

console.log('\n' + (fail ? fail + ' failed, ' : '') + pass + ' passed.');
process.exit(fail ? 1 : 0);
