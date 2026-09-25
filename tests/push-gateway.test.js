/* ===========================================================================
   Which of Apple's two gateways a push goes through.

   WHY THIS FILE EXISTS. Every newsletter the intake parsed asked for the two
   review pushes, and every one of them went to the only admin phone and came
   back 400 BadDeviceToken. That phone runs an Xcode build, so its token is a
   sandbox token, and send-push only ever spoke to production. The sender now
   tries a refused token once on the other gateway, and the rules worth pinning
   down are the ones that keep that from either missing the admin or keeping a
   genuinely dead phone on the list forever.

   HOW IT READS THE EDGE FUNCTION. Same trick as tests/newsletter-retry.test.js:
   the helpers are fenced between @@ gateway:start and @@ gateway:end, and this
   lifts that fence out, strips the types with node's own stripper and evals it.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  push gateway: node ' + process.version +
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

const start = source.indexOf('/* @@ gateway:start */');
const end = source.indexOf('/* @@ gateway:end */');
if (start === -1 || end === -1 || end < start) {
  console.log('FAIL  the gateway helpers are no longer fenced by @@ gateway:start / @@ gateway:end');
  process.exit(1);
}

const fenced = stripTypeScriptTypes(source.slice(start, end));
const { sendEitherGateway, PRODUCTION_HOST, SANDBOX_HOST } = vm.runInNewContext(
  fenced + '\n({ sendEitherGateway, PRODUCTION_HOST, SANDBOX_HOST })');

const OK = { ok: true, retire: false };
const BAD = { ok: false, retire: true, reason: '400 BadDeviceToken', wrongGateway: true };
const GONE = { ok: false, retire: true, reason: '410 Unregistered' };
const DOWN = { ok: false, retire: false, reason: 'TypeError: network' };

/* A fake APNs: answers by gateway, and remembers which ones it was asked. */
function apns(answers) {
  const asked = [];
  const send = (host) => { asked.push(host); return Promise.resolve(answers[host]); };
  return { send, asked };
}

(async () => {
  console.log('\n--- the ordinary phone ---');

  let a = apns({ [PRODUCTION_HOST]: OK });
  ok('a production token is delivered on production',
    (await sendEitherGateway(PRODUCTION_HOST, a.send)).ok, true);
  ok('and the sandbox is never bothered', a.asked, [PRODUCTION_HOST]);

  console.log('\n--- the admin phone that never heard anything ---');

  a = apns({ [PRODUCTION_HOST]: BAD, [SANDBOX_HOST]: OK });
  const dev = await sendEitherGateway(PRODUCTION_HOST, a.send);
  ok('THE BUG: an Xcode build is delivered through the sandbox', dev.ok, true);
  ok('and is not retired', dev.retire, false);
  ok('production first, then sandbox', a.asked, [PRODUCTION_HOST, SANDBOX_HOST]);

  a = apns({ [SANDBOX_HOST]: BAD, [PRODUCTION_HOST]: OK });
  ok('the reverse holds with APNS_HOST set to the sandbox',
    (await sendEitherGateway(SANDBOX_HOST, a.send)).ok, true);

  console.log('\n--- phones that really are gone ---');

  a = apns({ [PRODUCTION_HOST]: BAD, [SANDBOX_HOST]: BAD });
  const both = await sendEitherGateway(PRODUCTION_HOST, a.send);
  ok('refused by both is retired', [both.ok, both.retire], [false, true]);
  ok('and the note names both answers',
    both.reason, `400 BadDeviceToken; ${SANDBOX_HOST}: 400 BadDeviceToken`);

  a = apns({ [PRODUCTION_HOST]: GONE });
  const gone = await sendEitherGateway(PRODUCTION_HOST, a.send);
  ok('Unregistered is retired without a second try',
    [gone.retire, a.asked], [true, [PRODUCTION_HOST]]);

  console.log('\n--- nothing is retired on a guess ---');

  a = apns({ [PRODUCTION_HOST]: BAD, [SANDBOX_HOST]: DOWN });
  ok('the sandbox being unreachable keeps the token',
    (await sendEitherGateway(PRODUCTION_HOST, a.send)).retire, false);

  a = apns({ [PRODUCTION_HOST]: DOWN });
  await sendEitherGateway(PRODUCTION_HOST, a.send);
  ok('a network failure is not a wrong gateway', a.asked, [PRODUCTION_HOST]);

  a = apns({ 'apns.example.test': BAD });
  ok('a host that is neither of Apple\'s has no other one to try',
    (await sendEitherGateway('apns.example.test', a.send), a.asked), ['apns.example.test']);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
