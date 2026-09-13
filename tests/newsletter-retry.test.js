/* ===========================================================================
   Whether the reader tries an email again, and when it stops.

   WHY THIS FILE EXISTS. On the 11th of September the weekly newsletter came
   in, Gemini's answer arrived cut off mid-JSON, and the intake recorded the
   email as permanently unreadable and marked it read. The ledger then did what
   it is for and skipped it on every run afterwards. Five announcements, one
   calendar date, gone — and the Admin screen said "Newsletter checked 3
   minutes ago" in ordinary grey, because one email failing was not the run
   failing.

   The fix is that a truncated answer defers instead of failing, and the thing
   that keeps "defer" from meaning "re-read this email every twenty minutes
   forever" is claimDecision. So the rules worth pinning down are the ones that
   bound it: settled is settled, a claim somebody is holding is left alone, a
   claim nobody came back for is taken, and the attempt budget ends it either
   way.

   None of that needs a mailbox or a model, which is the point of testing it
   here rather than finding out in production a week later.

   HOW IT READS THE EDGE FUNCTION. Same trick as tests/newsletter-dates.test.js:
   the helpers are fenced inside the one-file Deno function between two markers,
   and this lifts that fence out, strips the types with node's own stripper and
   evals it. MAX_PARSE_ATTEMPTS and CLAIM_STALE_MINUTES are read from inside
   the fence too, so this cannot drift into testing numbers the function does
   not use.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

/* One ExperimentalWarning per run on stderr, and the default listener is what
   prints it. Not worth a line in a run somebody is reading for failures. */
process.removeAllListeners('warning');

/* Added in node 22.13. Skipping loudly rather than failing: an older node is a
   reason this file cannot check the intake, not a reason to tell somebody
   their app is broken. */
if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  newsletter retry: node ' + process.version +
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

const start = source.indexOf('/* @@ retry:start');
const end = source.indexOf('/* @@ retry:end */');
if (start === -1 || end === -1 || end < start) {
  console.log('FAIL  the retry helpers are no longer fenced by @@ retry:start / @@ retry:end');
  process.exit(1);
}

const fenced = stripTypeScriptTypes(source.slice(start, end));
const box = vm.runInNewContext(
  fenced + '\n({ claimDecision, MAX_PARSE_ATTEMPTS, CLAIM_STALE_MINUTES })');

const { claimDecision, MAX_PARSE_ATTEMPTS, CLAIM_STALE_MINUTES } = box;

const NOW = Date.parse('2026-09-11T14:20:00Z');
const minutesAgo = (n) => new Date(NOW - n * 60000).toISOString();
const decide = (row) => claimDecision(row, NOW);

/* ------------------------------------------------------ the ordinary week */

console.log('\n--- nothing known about it ---');

ok('an email the ledger has never seen', decide(null), 'new');
ok('undefined is the same as absent', decide(undefined), 'new');

console.log('\n--- settled means settled ---');

/* 0038's whole point, and none of this may weaken it: an email that produced
   drafts must never be read a second time. */
ok('parsed, with drafts behind it', decide({ status: 'parsed', attempts: 1 }), 'skip');
ok('read fine, nothing in it', decide({ status: 'empty', attempts: 1 }), 'skip');
ok('settled as unreadable', decide({ status: 'failed', attempts: 4 }), 'skip');
ok('a status from some later version', decide({ status: 'something-new' }), 'skip');

console.log('\n--- an attempt that deferred ---');

ok('THE BUG: a truncated answer comes back for another go',
  decide({ status: 'deferred', attempts: 1 }), 'retry');
ok('and again on the attempt before the last',
  decide({ status: 'deferred', attempts: MAX_PARSE_ATTEMPTS - 1 }), 'retry');

/* The bound. Without this, an email the model truncates every single time is a
   model call every twenty minutes for as long as the fortnight search can see
   it, which is the cost 0038 was right to refuse. */
ok('the budget is spent',
  decide({ status: 'deferred', attempts: MAX_PARSE_ATTEMPTS }), 'skip');
ok('somehow past the budget',
  decide({ status: 'deferred', attempts: MAX_PARSE_ATTEMPTS + 3 }), 'skip');
ok('a count that is not a number is not a licence',
  decide({ status: 'deferred', attempts: 'lots' }), 'skip');

console.log('\n--- a claim somebody is holding ---');

/* The tick and the Fetch Announcements button overlap in real use — three taps
   inside four minutes is in the run log — and two runs parsing one newsletter
   is two sets of drafts and one evening in the calendar twice. */
ok('claimed a moment ago, leave it alone',
  decide({ status: 'parsing', attempts: 1, attempted_at: minutesAgo(0) }), 'skip');
ok('still inside the stale window',
  decide({ status: 'parsing', attempts: 1, attempted_at: minutesAgo(CLAIM_STALE_MINUTES - 1) }), 'skip');

console.log('\n--- a claim nobody came back for ---');

/* An Edge Function cannot outlive its own timeout, so a row still marked
   parsing a quarter of an hour later is a run that died holding the email.
   Leaving it would bury the newsletter exactly the way the old rule did. */
ok('past the stale window, take it',
  decide({ status: 'parsing', attempts: 1, attempted_at: minutesAgo(CLAIM_STALE_MINUTES + 1) }), 'reclaim');
ok('an hour later, certainly take it',
  decide({ status: 'parsing', attempts: 2, attempted_at: minutesAgo(60) }), 'reclaim');
ok('a claim with no clock on it was never coming back',
  decide({ status: 'parsing', attempts: 1, attempted_at: null }), 'reclaim');
ok('nor was one with a clock that is not a date',
  decide({ status: 'parsing', attempts: 1, attempted_at: 'yesterday' }), 'reclaim');

/* The budget ends a stuck claim too, or an email that crashes the run every
   time becomes an infinite supply of stale claims. */
ok('a stale claim with the budget spent stays put',
  decide({ status: 'parsing', attempts: MAX_PARSE_ATTEMPTS, attempted_at: minutesAgo(60) }), 'skip');
ok('and so does one with no clock and no budget',
  decide({ status: 'parsing', attempts: MAX_PARSE_ATTEMPTS, attempted_at: null }), 'skip');

console.log('\n--- the numbers themselves ---');

/* Not arbitrary, and worth failing loudly if somebody edits one without
   meaning to: four attempts twenty minutes apart is about an hour of trying,
   and fifteen minutes is comfortably longer than any run can live. */
ok('attempts are bounded at all', MAX_PARSE_ATTEMPTS >= 2 && MAX_PARSE_ATTEMPTS <= 10, true);
ok('a claim goes stale after a run could possibly still be alive',
  CLAIM_STALE_MINUTES >= 5 && CLAIM_STALE_MINUTES <= 60, true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
