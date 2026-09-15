#!/usr/bin/env node
/*
 * Home Church, the Info.plist keys the app cannot ship without.
 *
 * WHAT THIS DOES. Reads ios-config/info-plist-keys.json and makes sure every
 * key in it is in ios/App/App/Info.plist, with the value written there. Runs
 * as the last step of `npm run ios`, after `npx cap sync ios`, because cap
 * touches that file too. Idempotent: a key already present and non-empty is
 * left exactly as it is, so a hand edited wording survives.
 *
 * WHY IT EXISTS, which is a build Apple rejected. These keys used to be rows
 * somebody added by hand in Xcode's Info tab, written down in XCODE.md and
 * checked by preflight. Build 13 was archived on a machine where preflight
 * said the calendar rows were present, uploaded clean, and came back:
 *
 *   ITMS-90683: Missing purpose string in Info.plist — the Info.plist file
 *   for the "App.app" bundle should contain a NSCalendarsUsageDescription key
 *
 * What went wrong between the file and the binary was never pinned down, and
 * the reason it could not be is the interesting part: preflight searched the
 * file's text for the key name, so it could not distinguish a key in the root
 * dict from the same characters sitting anywhere else in the bytes. It had no
 * evidence for what it claimed. The hand written step and the check guarding
 * it were unreliable in the same way at the same time.
 *
 * A manual step that must not be forgotten is a bug with a person standing
 * in for a script. So this is the script. XCODE.md no longer asks anybody to
 * add these rows, and preflight now parses the plist rather than grepping it,
 * which is the other half of the same lesson.
 *
 * WHY PlistBuddy. It is on every Mac, it edits a plist as a plist, and it
 * cannot put a key anywhere but where a key goes. Hand assembling XML here
 * would be repeating the mistake this file exists to prevent, one level down.
 *
 *   node scripts/ios_plist.js            (as part of `npm run ios`)
 *
 * Does nothing, and says so, where there is no ios/ — a fresh clone, CI, or
 * any machine that has not run `npx cap add ios`. Exits non-zero only when
 * ios/ is there and a key could not be written, because that is a build that
 * would be rejected.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(__dirname);

/* PlistBuddy only exists on a Mac, and a Mac is the only place this script
   has anything to do. HC_PLIST_BUDDY lets tests/ios-plist-writer.test.js
   point it at a stand-in so the Add/Set/read-back logic is exercised on the
   machines that run the test suite, rather than only on the machine that
   archives. Nothing in the build sets it. */
const PLIST_BUDDY = process.env.HC_PLIST_BUDDY || '/usr/libexec/PlistBuddy';

/* HC_INFO_PLIST is the same test-only affordance as HC_PLIST_BUDDY above, and
   it exists for a sharper reason: without it, testing this script would mean
   moving the real ios/ out of the way and back, and ios/ on the build Mac
   carries hand done Xcode work — signing, the icon, the push capability — that
   `npx cap add ios` does not restore. A suite interrupted at the wrong moment
   is not allowed to cost somebody that. Nothing in the build sets it. */
const plistPath = process.env.HC_INFO_PLIST ||
  path.join(ROOT, 'ios', 'App', 'App', 'Info.plist');
const keysPath = path.join(ROOT, 'ios-config', 'info-plist-keys.json');

if (!fs.existsSync(plistPath)) {
  console.log('Info.plist: no ios/ here, nothing to write. ' +
    '(`npx cap add ios` generates it; XCODE.md step 2.)');
  process.exit(0);
}

if (!fs.existsSync(PLIST_BUDDY)) {
  console.error('Info.plist: ios/ exists but ' + PLIST_BUDDY + ' does not, so\n' +
    '  the required keys cannot be written. That combination should not happen:\n' +
    '  PlistBuddy ships with macOS and ios/ only builds there. Add the keys in\n' +
    '  ios-config/info-plist-keys.json by hand before archiving.');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(keysPath, 'utf8')).keys;

function buddy(command) {
  return execFileSync(PLIST_BUDDY, ['-c', command, plistPath], { encoding: 'utf8' });
}

// Whatever is there now, or null. PlistBuddy exits non-zero for a key that
// does not exist, which is the answer rather than a problem.
function current(key) {
  try {
    return buddy('Print :' + key).trim();
  } catch (err) {
    return null;
  }
}

const added = [];
const kept = [];
const failed = [];

Object.keys(spec).forEach(function (key) {
  const want = spec[key];
  const have = current(key);

  /* An empty string counts as absent. Xcode writes one when somebody adds a
     row and tabs away without typing, and an empty purpose string is exactly
     as rejectable as a missing one. A false boolean is a real answer, so only
     strings get this treatment. */
  if (have !== null && !(want.type === 'string' && have === '')) {
    kept.push(key);
    return;
  }

  const value = want.type === 'bool'
    ? (want.value ? 'true' : 'false')
    : String(want.value);

  try {
    if (have === null) buddy('Add :' + key + ' ' + want.type + ' ' + value);
    else buddy('Set :' + key + ' ' + value);
    added.push(key);
  } catch (err) {
    failed.push({ key: key, message: String(err.stderr || err.message).trim() });
  }
});

/* Read every key back through the parser before saying anything went well.
   The whole reason this file exists is a key that was written and not there,
   so "PlistBuddy did not complain" is not the evidence worth printing. */
const missing = Object.keys(spec).filter(function (key) {
  const have = current(key);
  return have === null || (spec[key].type === 'string' && have === '');
});

if (added.length) console.log('Info.plist: wrote ' + added.join(', '));
if (kept.length) console.log('Info.plist: already set, left alone — ' + kept.join(', '));

if (failed.length || missing.length) {
  console.error('');
  failed.forEach(function (f) {
    console.error('Info.plist: could not write ' + f.key + '\n  ' + f.message);
  });
  missing.forEach(function (key) {
    console.error('Info.plist: ' + key + ' is still not readable after writing it.\n' +
      '  ' + (spec[key].why || ''));
  });
  console.error('\n  Archiving now would upload a build Apple rejects. Open\n' +
    '  ios/App/App/Info.plist and add the keys from\n' +
    '  ios-config/info-plist-keys.json inside the top level <dict>.');
  process.exit(1);
}

console.log('Info.plist: ' + Object.keys(spec).length + ' required keys present.');
