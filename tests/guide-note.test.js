/* ===========================================================================
   What the new guide notification says. Pins one rule: a series' first guide
   carries no "Part 1", because a first week may turn out to be the only one.
   From the second guide on the part number appears.

   Reads the wording fenced between @@ guide-note:start and @@ guide-note:end
   in send-push, the same way tests/approval-notify.test.js reads its block.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  guide note: node ' + process.version +
    ' has no module.stripTypeScriptTypes. Needs node 22.13 or newer.');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  if (got === want) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + got + '\n        want ' + want); fail++; }
};

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'send-push', 'index.ts'), 'utf8');
const start = source.indexOf('/* @@ guide-note:start */');
const end = source.indexOf('/* @@ guide-note:end */');
if (start < 0 || end < 0) { console.log('FAIL  guide-note markers missing from send-push'); process.exit(1); }

const ctx = {};
vm.runInNewContext(stripTypeScriptTypes(source.slice(start, end)) +
  '\nthis.guideBody = guideBody; this.guideGreeting = guideGreeting;', ctx);

ok('first guide of a series has no part number',
  ctx.guideBody('Crazy Faith', 1), 'This week’s guide is live in the app: Crazy Faith.');
ok('second guide shows Part 2',
  ctx.guideBody('Crazy Faith', 2), 'This week’s guide is live in the app: Crazy Faith, Part 2.');
ok('unknown part, series name only',
  ctx.guideBody('Family', null), 'This week’s guide is live in the app: Family.');
ok('no series',
  ctx.guideBody(null, 3), 'This week’s guide is live in the app.');
ok('Sunday greeting',
  ctx.guideGreeting(new Date('2026-11-15T20:00:00Z')), 'Happy Sunday!');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
