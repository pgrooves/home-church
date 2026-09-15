/* ===========================================================================
   scripts/ios_plist.js, the script that writes the Info.plist keys the built
   app cannot ship without.

   WHY THIS FILE EXISTS. Those keys used to be rows somebody added by hand in
   Xcode, and Apple rejected build 13 for a missing purpose string on a
   machine where the repo's own check said the row was there. Exactly how the
   two came apart was never established — the check only searched the file's
   text, so it could not tell a key in the root dict from a key anywhere else
   in the bytes, which means it never had the evidence to say. That is the
   part worth fixing: the step is a script now, and the check parses.

   A script nobody has run is not better than a step nobody remembers, so it
   gets a test.

   WHAT IS ACTUALLY EXERCISED. The script talks to PlistBuddy, which only
   exists on a Mac, and the machines that run this suite are not Macs. So it
   runs against tests/fake-plistbuddy.py, which implements Print, Add and Set
   with the real exit codes and does its reading and writing through Python's
   plistlib. That makes this a cross-check as well as a test: the keys are
   written by the script, then read back by an independent plist parser, and
   then read again by this repo's own reader in scripts/preflight.js. All
   three have to agree about where a key is.

   Four things are held still.

   IT WRITES WHAT IS MISSING, into the root dict, where a parser can see it.

   IT IS IDEMPOTENT, because it runs on every `npm run ios` and must not
   churn a file Xcode may have open. A second run changes nothing.

   IT LEAVES A HAND EDITED WORDING ALONE. Somebody may have a better sentence
   than the repo's, and overwriting it every build would be rude and would
   also hide that they did it.

   AN EMPTY STRING IS NOT AN ANSWER. Xcode writes one whenever a row is added
   and tabbed away from, and an empty purpose string is as rejectable as no
   purpose string, so the script fills it.
   =========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const ROOT = path.join(__dirname, '..');
const BUDDY = path.join(__dirname, 'fake-plistbuddy.py');
const SPEC = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'ios-config', 'info-plist-keys.json'), 'utf8')).keys;

/* python3 is what the stand-in PlistBuddy runs on. Without it there is
   nothing to test against, which is a skip rather than a failure: the script
   itself is checked for shape by tests/info-plist.test.js, and the real
   PlistBuddy is checked by the build that uses it. */
if (spawnSync('python3', ['--version']).status !== 0) {
  console.log('SKIP  no python3 here, so the PlistBuddy stand-in cannot run');
  console.log('\n0 passed, 0 failed.');
  process.exit(0);
}

/* A plist in a temp directory, never the repo's own. The script takes
   HC_INFO_PLIST for exactly this, because the alternative — moving ios/ aside
   and back — would put the build Mac's hand done Xcode work (signing, the
   icon, the push capability) one interrupted test run away from being gone.
   A test must not be able to cost somebody that. */
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-plist-'));
const plistPath = path.join(workDir, 'Info.plist');

function restore() {
  fs.rmSync(workDir, { recursive: true, force: true });
}

function writePlist(body) {
  fs.writeFileSync(plistPath,
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
    '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n<dict>\n' + body + '</dict>\n</plist>\n');
}

function run() {
  const out = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'ios_plist.js')],
    { encoding: 'utf8', env: Object.assign({}, process.env,
      { HC_PLIST_BUDDY: BUDDY, HC_INFO_PLIST: plistPath }) });
  return { status: out.status, text: (out.stdout || '') + (out.stderr || '') };
}

// What an independent parser sees in the file now.
function readBack() {
  return JSON.parse(execFileSync('python3', ['-c',
    'import json,plistlib,sys;print(json.dumps(plistlib.load(open(sys.argv[1],"rb"))))',
    plistPath], { encoding: 'utf8' }));
}

// And what this repo's own reader sees, lifted out of preflight.
const preflight = fs.readFileSync(path.join(ROOT, 'scripts', 'preflight.js'), 'utf8');
const plistRootKeys = eval('(' + preflight.slice(          // eslint-disable-line no-eval
  preflight.indexOf('function plistRootKeys'),
  preflight.indexOf('function infoPlistKeys')).trim() + ')');

try {
  const names = Object.keys(SPEC);

  /* ------------------------------------------- a plist with none of them */

  writePlist('\t<key>CFBundleName</key>\n\t<string>Home Church</string>\n');
  let result = run();

  ok('a plist missing every required key is written and passes', result.status, 0);

  let parsed = readBack();
  ok('and a real plist parser finds them all',
    names.filter((n) => !(n in parsed)), []);

  ok('the purpose string is the one from ios-config/info-plist-keys.json',
    parsed.NSCalendarsUsageDescription, SPEC.NSCalendarsUsageDescription.value);

  ok('the encryption answer is a real boolean, not the word false',
    parsed.ITSAppUsesNonExemptEncryption, false);

  ok('what was already in the file is still in it', parsed.CFBundleName, 'Home Church');

  /* THE CROSS-CHECK. Python's parser and this repo's reader have to agree,
     because a disagreement is exactly what shipped build 13. */
  const ours = plistRootKeys(fs.readFileSync(plistPath, 'utf8'));
  ok('AND THIS REPO\'S OWN READER AGREES WITH IT',
    names.filter((n) => ours[n] === undefined), []);
  ok('including that the purpose string is not empty',
    ours.NSCalendarsUsageDescription.text, SPEC.NSCalendarsUsageDescription.value);

  /* --------------------------------------------------------- run it again */

  const before = fs.readFileSync(plistPath, 'utf8');
  result = run();
  ok('a second run passes', result.status, 0);
  ok('and changes nothing at all', fs.readFileSync(plistPath, 'utf8'), before);
  ok('saying so rather than pretending to work',
    /already set, left alone/.test(result.text), true);

  /* ------------------------------------------- somebody else's better words */

  writePlist('\t<key>NSCalendarsUsageDescription</key>\n' +
    '\t<string>We only ever add the event you tapped.</string>\n');
  result = run();
  ok('a hand edited wording survives the script', readBack().NSCalendarsUsageDescription,
    'We only ever add the event you tapped.');
  ok('while the keys that were missing get written', result.status, 0);
  ok('and all of them are present afterwards',
    names.filter((n) => !(n in readBack())), []);

  /* ------------------------------------------- the row tabbed away from */

  writePlist('\t<key>NSCalendarsUsageDescription</key>\n\t<string></string>\n');
  result = run();
  ok('an empty purpose string is filled in rather than left', result.status, 0);
  ok('with the repo\'s sentence', readBack().NSCalendarsUsageDescription,
    SPEC.NSCalendarsUsageDescription.value);

  /* ------------------------------------------------- a key in a sub-dict

     Valid XML, parses fine, and the key is in the wrong place — which a text
     search cannot tell from the right place. The script has to write a real
     root key and leave the impostor where it is. */

  writePlist('\t<key>NSAppTransportSecurity</key>\n\t<dict>\n' +
    '\t\t<key>NSCalendarsUsageDescription</key>\n' +
    '\t\t<string>nested, and worth nothing</string>\n\t</dict>\n');

  result = run();
  ok('a key hiding in a sub-dict is treated as absent', result.status, 0);
  parsed = readBack();
  ok('and a real root key is written with the repo\'s words',
    parsed.NSCalendarsUsageDescription, SPEC.NSCalendarsUsageDescription.value);
  ok('the sub-dict is left alone',
    parsed.NSAppTransportSecurity.NSCalendarsUsageDescription, 'nested, and worth nothing');
  ok('and this repo\'s reader sees the root one, not the nested one',
    plistRootKeys(fs.readFileSync(plistPath, 'utf8')).NSCalendarsUsageDescription.text,
    SPEC.NSCalendarsUsageDescription.value);

  /* --------------------------------------- an Info.plist nothing can read

     Keys pasted after </plist> is not a plist with a misplaced key, it is
     junk after the document element: invalid XML that no parser will load.
     The only honest thing a writer can do with it is refuse and say so,
     because a script that reports success here sends somebody to Xcode to
     archive a build that cannot process its own Info.plist. */

  fs.writeFileSync(plistPath,
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n' +
    '\t<key>CFBundleName</key>\n\t<string>Home Church</string>\n' +
    '</dict>\n</plist>\n' +
    '<key>NSCalendarsUsageDescription</key>\n<string>outside the document</string>\n');

  result = run();
  ok('AN UNREADABLE Info.plist FAILS RATHER THAN PASSING', result.status !== 0, true);
  ok('and says archiving now would be rejected',
    /Archiving now would upload a build Apple rejects/.test(result.text), true);
} finally {
  restore();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
