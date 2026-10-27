#!/usr/bin/env node
/*
 * Home Church, what the Android build is allowed to ask for.
 *
 * WHY THIS EXISTS. On iOS a permission needs a sentence in Info.plist, so a
 * plugin cannot add one without somebody writing it down. On Android a
 * plugin's manifest is merged into ours at build time, silently, and every
 * permission in the result is something Play Console may ask about and the
 * Data safety form may have to declare. A plugin update that quietly adds
 * READ_CALENDAR would make our Data safety answers false without a single
 * line of this repo changing. So the merged manifest is checked against a
 * list, and anything not on the list fails the build.
 *
 * It also checks the bundle's native libraries for 16 KB page alignment,
 * which Google requires of apps targeting Android 15 and later. We write no
 * native code, but Firebase brings one small library in through androidx
 * datastore, so "we have no .so files" was already untrue on the first build.
 *
 * PLAY_COMPLIANCE.md sections 1 and 2 are the reasoning. Change this list and
 * that table together.
 *
 *   node scripts/android_manifest_check.js                 (after a build)
 *   node scripts/android_manifest_check.js <manifest> [aab]
 *
 * No dependencies. Reads the AAB with Node's zlib, which is enough for the
 * few entries it needs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.dirname(__dirname);
const APP = path.join(ROOT, 'android', 'app', 'build');
const MANIFEST = path.join(APP, 'intermediates', 'merged_manifests', 'release',
  'processReleaseManifest', 'AndroidManifest.xml');
const BUNDLE = path.join(APP, 'outputs', 'bundle', 'release', 'app-release.aab');

/* Every permission the release build may hold, and the feature it is for.
   `{app}` stands for the application id. */
const ALLOWED = {
  'android.permission.INTERNET': 'content, sign in, everything',
  'android.permission.ACCESS_NETWORK_STATE': 'knowing when there is no signal (Capacitor, Firebase)',
  'android.permission.POST_NOTIFICATIONS': 'reminders and push, asked at runtime on Android 13+',
  'android.permission.RECEIVE_BOOT_COMPLETED': 'reminders survive a restart',
  'android.permission.WAKE_LOCK': 'a reminder can fire while the phone sleeps',
  'android.permission.VIBRATE': 'haptics',
  'android.permission.USE_BIOMETRIC': 'the Journal lock',
  'android.permission.USE_FINGERPRINT': 'the Journal lock, on phones older than Android 9',
  'com.google.android.c2dm.permission.RECEIVE': 'push, through Firebase Cloud Messaging',
  '{app}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION': 'androidx internal, signature level, grants nothing to anyone else'
};

/* The ones most likely to arrive by accident, with what to do instead. Not a
   second allow list: anything off ALLOWED fails either way. This only makes
   the failure say something useful. */
const WHY_NOT = {
  'android.permission.READ_CALENDAR': 'Add to calendar uses createEventWithPrompt, which opens the phone\'s own New Event screen and needs no permission. Remove it with tools:node="remove".',
  'android.permission.WRITE_CALENDAR': 'Same as READ_CALENDAR.',
  'android.permission.SCHEDULE_EXACT_ALARM': 'Reminders are scheduled inexact (js/native.js). Left in, Android 12+ sends people to Settings the first time they ask for a reminder.',
  'android.permission.USE_EXACT_ALARM': 'Restricted by Play to alarm clock and calendar apps.',
  'com.google.android.gms.permission.AD_ID': 'No ads, no advertising ID. The Data safety form says so.',
  'android.permission.READ_EXTERNAL_STORAGE': 'Files go to the app\'s cache directory, which needs nothing.',
  'android.permission.WRITE_EXTERNAL_STORAGE': 'Same as READ_EXTERNAL_STORAGE.',
  'android.permission.READ_MEDIA_IMAGES': 'Restricted by Play\'s photo and video permissions policy.',
  'android.permission.READ_MEDIA_VIDEO': 'Restricted by Play\'s photo and video permissions policy.'
};

function permissions(xml) {
  const app = (xml.match(/<manifest[^>]*\bpackage="([^"]+)"/) || [])[1] || '';
  const found = [];
  const re = /<uses-permission(?:-sdk-23)?\b[^>]*?android:name="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) {
    const name = app && m[1].indexOf(app + '.') === 0 ? '{app}' + m[1].slice(app.length) : m[1];
    if (found.indexOf(name) === -1) found.push(name);
  }
  return found.sort();
}

function unexpected(found) {
  return found.filter(function (p) { return !Object.prototype.hasOwnProperty.call(ALLOWED, p); });
}

/* The few zip entries we need, from the central directory. */
function zipEntries(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    out.push({
      name: name,
      read: function () {
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const raw = buf.subarray(start, start + size);
        return method === 8 ? zlib.inflateRawSync(raw) : raw;
      }
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* The smallest alignment of any LOAD segment in an ELF file. */
function loadAlignment(elf) {
  const is64 = elf[4] === 2;
  const phoff = is64 ? Number(elf.readBigUInt64LE(0x20)) : elf.readUInt32LE(0x1c);
  const size = elf.readUInt16LE(is64 ? 0x36 : 0x2a);
  const num = elf.readUInt16LE(is64 ? 0x38 : 0x2c);
  let least = Infinity;
  for (let i = 0; i < num; i++) {
    const o = phoff + i * size;
    if (elf.readUInt32LE(o) !== 1) continue;
    const align = is64 ? Number(elf.readBigUInt64LE(o + 48)) : elf.readUInt32LE(o + 28);
    least = Math.min(least, align);
  }
  return least;
}

function misaligned(aab) {
  return zipEntries(aab)
    .filter(function (e) { return /\/lib\/[^/]+\/[^/]+\.so$/.test(e.name); })
    .map(function (e) { return { name: e.name, align: loadAlignment(e.read()) }; })
    .filter(function (l) { return l.align < 16384; });
}

function main() {
  const manifest = process.argv[2] || MANIFEST;
  const bundle = process.argv[3] || BUNDLE;
  let failed = false;

  if (!fs.existsSync(manifest)) {
    console.error('No merged manifest at ' + path.relative(ROOT, manifest) +
      '\nBuild first: cd android && ./gradlew bundleRelease');
    process.exit(1);
  }
  const found = permissions(fs.readFileSync(manifest, 'utf8'));
  for (const p of found) {
    if (ALLOWED[p]) console.log('PASS  ' + p + '  (' + ALLOWED[p] + ')');
  }
  for (const p of unexpected(found)) {
    failed = true;
    console.log('FAIL  ' + p + ' is not on the list.\n      ' +
      (WHY_NOT[p] || 'Find the plugin that added it, and either remove it in ' +
        'android/app/src/main/AndroidManifest.xml or add it to ALLOWED here and ' +
        'to PLAY_COMPLIANCE.md section 2, with the feature it is for.'));
  }

  if (fs.existsSync(bundle)) {
    const bad = misaligned(fs.readFileSync(bundle));
    if (bad.length) {
      failed = true;
      for (const l of bad) console.log('FAIL  ' + l.name + ' is aligned to ' + l.align + ' bytes, Play needs 16 KB');
    } else {
      console.log('PASS  every native library is 16 KB aligned');
    }
  } else {
    console.log('SKIP  no bundle at ' + path.relative(ROOT, bundle) + ', so alignment was not checked');
  }

  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();

module.exports = { ALLOWED: ALLOWED, permissions: permissions, unexpected: unexpected, loadAlignment: loadAlignment };
