/* ===========================================================================
   The Android permission list in scripts/android_manifest_check.js.

   The check itself runs after a Gradle build, which the test suite does not
   do. This pins the rule: what counts as a permission, how the application id
   is folded so the androidx signature permission matches on any id, and that
   the permissions PLAY_COMPLIANCE.md says we keep out really do fail.
   =========================================================================== */
'use strict';

const check = require('../scripts/android_manifest_check.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const manifest = (perms) =>
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n' +
  '    package="com.homechurchnola.app"\n    android:versionCode="1">\n' +
  perms.map((p) => '    <uses-permission android:name="' + p + '" />\n').join('') +
  '</manifest>\n';

const today = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.VIBRATE',
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'com.google.android.c2dm.permission.RECEIVE',
  'com.homechurchnola.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
];

ok('the first build\'s merged manifest passes',
  check.unexpected(check.permissions(manifest(today))), []);

ok('the app id is folded, so the androidx permission matches',
  check.permissions(manifest(['com.homechurchnola.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'])),
  ['{app}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']);

ok('a repeated permission is counted once',
  check.permissions(manifest(['android.permission.INTERNET', 'android.permission.INTERNET'])),
  ['android.permission.INTERNET']);

for (const p of [
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'com.google.android.gms.permission.AD_ID',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.ACCESS_FINE_LOCATION'
]) {
  ok(p.split('.').pop() + ' fails', check.unexpected(check.permissions(manifest(today.concat([p])))), [p]);
}

ok('another app\'s signature permission is not ours',
  check.unexpected(check.permissions(manifest(['org.example.other.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']))),
  ['org.example.other.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
