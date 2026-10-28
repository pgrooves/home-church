/* ===========================================================================
   Android push: what send-push tells Firebase, and what it makes of the
   answer.

   WHY THIS FILE EXISTS. The one mistake here that would really hurt is
   retiring good phones. Firebase answers a malformed message and a dead token
   with the same INVALID_ARGUMENT, and a sender that read every 400 as "this
   phone is gone" would switch off every Android phone in the church over one
   bad deploy. So the rules for which answers retire a token are pinned here,
   with the payload beside them so it keeps saying what the APNs one says.

   HOW IT READS THE EDGE FUNCTION. Same trick as tests/push-gateway.test.js:
   the helpers are fenced between @@ fcm:start and @@ fcm:end.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  push fcm: node ' + process.version +
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

const start = source.indexOf('/* @@ fcm:start */');
const end = source.indexOf('/* @@ fcm:end */');
if (start === -1 || end === -1 || end < start) {
  console.log('FAIL  the FCM helpers are no longer fenced by @@ fcm:start / @@ fcm:end');
  process.exit(1);
}

const { parseServiceAccount, fcmMessage, fcmOutcome } = vm.runInNewContext(
  stripTypeScriptTypes(source.slice(start, end)) +
  '\n({ parseServiceAccount, fcmMessage, fcmOutcome })');

/* What Firebase sends back, in the shape the v1 API uses. */
const answer = (code, status, message, errorCode) => JSON.stringify({
  error: {
    code, status, message,
    details: errorCode
      ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }]
      : []
  }
});

console.log('\n--- which answers retire a phone ---');

ok('a 200 is delivered', fcmOutcome(200, ''), { ok: true, retire: false });
ok('UNREGISTERED retires it: the app was uninstalled',
  fcmOutcome(404, answer(404, 'NOT_FOUND', 'Requested entity was not found.', 'UNREGISTERED')).retire, true);
ok('SENDER_ID_MISMATCH retires it: a token from another Firebase project',
  fcmOutcome(403, answer(403, 'PERMISSION_DENIED', 'SenderId mismatch', 'SENDER_ID_MISMATCH')).retire, true);
ok('INVALID_ARGUMENT about the token retires it',
  fcmOutcome(400, answer(400, 'INVALID_ARGUMENT',
    'The registration token is not a valid FCM registration token', 'INVALID_ARGUMENT')).retire, true);
ok('INVALID_ARGUMENT about the message does not: that is our bug, not the phone',
  fcmOutcome(400, answer(400, 'INVALID_ARGUMENT',
    'Invalid value at \'message.android.ttl\'', 'INVALID_ARGUMENT')).retire, false);
ok('a quota answer does not', fcmOutcome(429, answer(429, 'RESOURCE_EXHAUSTED', 'Quota', 'QUOTA_EXCEEDED')).retire, false);
ok('Google having a bad minute does not', fcmOutcome(503, answer(503, 'UNAVAILABLE', 'down', 'UNAVAILABLE')).retire, false);
ok('a wrong access token does not', fcmOutcome(401, answer(401, 'UNAUTHENTICATED', 'bad creds', 'THIRD_PARTY_AUTH_ERROR')).retire, false);
ok('an answer that is not JSON does not', fcmOutcome(502, '<html>Bad Gateway</html>').retire, false);
ok('push_log gets the code, not the whole answer',
  fcmOutcome(404, answer(404, 'NOT_FOUND', 'x', 'UNREGISTERED')).reason, 'FCM 404 UNREGISTERED');

console.log('\n--- the message ---');

const m = fcmMessage('tok', { title: 'Home Church', body: 'Hello' }, 'announcement', 'announcement:42').message;
ok('it goes to the one phone', m.token, 'tok');
ok('with the same title and body Apple gets', m.notification, { title: 'Home Church', body: 'Hello' });
ok('replacing an earlier one with the same collapse id, as apns-collapse-id does',
  [m.android.notification.tag, m.android.collapse_key], ['announcement:42', 'announcement:42']);
ok('dropped after six hours, as apns-expiration is', m.android.ttl, '21600s');
ok('on the channel js/native.js makes', m.android.notification.channel_id, 'church');
ok('data values are strings, which is all FCM accepts',
  Object.values(m.data).every((v) => typeof v === 'string'), true);

const native = fs.readFileSync(path.join(__dirname, '..', 'js', 'native.js'), 'utf8');
ok('and js/native.js does make that channel', /id: 'church'/.test(native), true);

console.log('\n--- the secret ---');

const account = {
  type: 'service_account', project_id: 'home-church-e3d0d',
  client_email: 'firebase-adminsdk@home-church-e3d0d.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n',
  token_uri: 'https://oauth2.googleapis.com/token'
};

ok('the file as Firebase gives it is read',
  parseServiceAccount(JSON.stringify(account)).project_id, 'home-church-e3d0d');
ok('a key whose newlines were pasted as backslash n is repaired',
  parseServiceAccount(JSON.stringify(account).replace(/\\n/g, '\\\\n')).private_key, account.private_key);
ok('a missing token_uri falls back to Google\'s',
  parseServiceAccount(JSON.stringify(Object.assign({}, account, { token_uri: undefined }))).token_uri,
  'https://oauth2.googleapis.com/token');
ok('unset says so', parseServiceAccount(undefined), 'FCM_SERVICE_ACCOUNT is not set.');
ok('half a paste says so',
  /not JSON/.test(parseServiceAccount('{"type": "service_account", "project_id"')), true);
ok('google-services.json by mistake says which file it needs instead',
  /google-services\.json/.test(parseServiceAccount(fs.readFileSync(
    path.join(__dirname, '..', 'android', 'app', 'google-services.json'), 'utf8'))), true);
ok('a file without the private key names what is missing',
  parseServiceAccount(JSON.stringify({ project_id: 'p', client_email: 'e' })),
  'FCM_SERVICE_ACCOUNT is missing private_key.');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
