/* ===========================================================================
   The Info.plist keys the built app cannot ship without, and the reader that
   checks they are really there.

   WHY THIS FILE EXISTS. Apple rejected build 13 with ITMS-90683, missing
   purpose string, on a machine where this repo's own preflight had just said
   the purpose strings were present. Both were telling the truth. The text was
   in ios/App/App/Info.plist and the key was not in the plist, because a key
   added by hand can land outside the root <dict> — after </plist>, or after
   the root dict closes — where a text search finds it and no parser does.
   The manual step and the check guarding it failed the same way at once.

   So the step is a script now (scripts/ios_plist.js writes the keys on every
   `npm run ios`) and the check parses (scripts/preflight.js walks the root
   dict). This file holds the parser to that promise, because the parser is
   the part that can go back to being wrong quietly.

   THE CASE THAT MATTERS IS THE FIFTH ONE. A key after </plist> must not
   count, and a raw text search for it says it is there. If that assertion
   ever fails, preflight is lying again and a rejected build is the next
   thing that happens.

   The rest is the shape of a real Info.plist: booleans written as <false/>
   with no text, arrays and nested dicts the walk has to step over without
   mistaking their keys for root ones, and XML comments.

   No browser and no Mac. The parser is lifted out of scripts/preflight.js as
   source and evaluated, which is ugly and is also the honest thing: it tests
   the code that actually runs rather than a copy of it that could drift.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const ROOT = path.join(__dirname, '..');
const preflight = fs.readFileSync(path.join(ROOT, 'scripts', 'preflight.js'), 'utf8');

/* The parser, as it is in preflight, evaluated here. Sliced by function name
   rather than copied, so editing one edits both. */
const from = preflight.indexOf('function plistRootKeys');
const to = preflight.indexOf('function infoPlistKeys');
ok('the parser is still findable in scripts/preflight.js', from > -1 && to > from, true);
// eslint-disable-next-line no-eval
const plistRootKeys = eval('(' + preflight.slice(from, to).trim() + ')');

/* ------------------------------------------------- a real Info.plist shape */

const GOOD = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<plist version="1.0">',
  '<dict>',
  '\t<key>CFBundleName</key>',
  '\t<string>Home Church</string>',
  '\t<key>NSCalendarsUsageDescription</key>',
  '\t<string>Home Church adds a church event.</string>',
  '\t<key>ITSAppUsesNonExemptEncryption</key>',
  '\t<false/>',
  '\t<key>UIBackgroundModes</key>',
  '\t<array>',
  '\t\t<string>remote-notification</string>',
  '\t</array>',
  '\t<key>NSAppTransportSecurity</key>',
  '\t<dict>',
  '\t\t<key>NSCalendarsWriteOnlyAccessUsageDescription</key>',
  '\t\t<string>nested, and must not count</string>',
  '\t</dict>',
  '\t<key>CFBundleVersion</key>',
  '\t<string>13</string>',
  '</dict>',
  '</plist>'
].join('\n');

const root = plistRootKeys(GOOD);

ok('it reads the root keys and only those',
  Object.keys(root),
  ['CFBundleName', 'NSCalendarsUsageDescription', 'ITSAppUsesNonExemptEncryption',
    'UIBackgroundModes', 'NSAppTransportSecurity', 'CFBundleVersion']);

ok('a purpose string comes back with its text',
  root.NSCalendarsUsageDescription, { tag: 'string', text: 'Home Church adds a church event.' });

ok('a boolean comes back as its own tag, with no text',
  root.ITSAppUsesNonExemptEncryption, { tag: 'false', text: '' });

ok('and the walk steps over an array without losing its place',
  root.CFBundleVersion.text, '13');

/* ------------------------------------------------ the four ways to be absent

   Each of these is a file that a text search says contains the key. That is
   the whole point: every one of them shipped, or could have. */

ok('A KEY NESTED IN A SUB-DICT DOES NOT COUNT',
  root.NSCalendarsWriteOnlyAccessUsageDescription, undefined);
ok('  though a text search finds it',
  GOOD.indexOf('NSCalendarsWriteOnlyAccessUsageDescription') > -1, true);

const afterPlist = GOOD.replace('</plist>',
  '</plist>\n<key>NSCalendarsWriteOnlyAccessUsageDescription</key>\n<string>outside</string>');
ok('A KEY AFTER </plist> DOES NOT COUNT — this is build 13',
  plistRootKeys(afterPlist).NSCalendarsWriteOnlyAccessUsageDescription, undefined);
ok('  though a text search finds it',
  afterPlist.indexOf('NSCalendarsWriteOnlyAccessUsageDescription') > -1, true);

const afterDict = GOOD.replace('</dict>\n</plist>',
  '</dict>\n<key>NSCalendarsWriteOnlyAccessUsageDescription</key><string>outside</string>\n</plist>');
ok('a key after the root dict closes does not count either',
  plistRootKeys(afterDict).NSCalendarsWriteOnlyAccessUsageDescription, undefined);

const empty = GOOD.replace('<string>Home Church adds a church event.</string>', '<string></string>');
ok('an empty purpose string reads as empty, which Apple treats as missing',
  plistRootKeys(empty).NSCalendarsUsageDescription.text, '');

/* ------------------------------------------------------------ odd shapes */

const commented = GOOD.replace('\t<key>NSCalendarsUsageDescription</key>',
  '\t<!-- <key>NSCalendarsUsageDescription</key><string>old</string> -->\n' +
  '\t<key>NSCalendarsUsageDescription</key>');
ok('a commented out key is not read, and the real one still is',
  plistRootKeys(commented).NSCalendarsUsageDescription.text,
  'Home Church adds a church event.');

ok('something that is not a plist answers null rather than guessing',
  plistRootKeys('<html><body>no dict here</body></html>'), null);

ok('and an empty root dict is an answer, not a crash',
  plistRootKeys('<plist version="1.0">\n<dict>\n</dict>\n</plist>'), {});

/* ------------------------------------------- the list itself, and its writer

   The values live in ios-config/info-plist-keys.json because ios/ is
   generated and gitignored, so the repo is the only durable home for them.
   Checked here for shape, since both the writer and preflight read it. */

const spec = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'ios-config', 'info-plist-keys.json'), 'utf8'));

ok('ios-config/info-plist-keys.json has a keys object', typeof spec.keys, 'object');

const names = Object.keys(spec.keys);
ok('it names the purpose string Apple rejected build 13 for',
  names.indexOf('NSCalendarsUsageDescription') > -1, true);
ok('the iOS 17 write-only key', names.indexOf('NSCalendarsWriteOnlyAccessUsageDescription') > -1, true);
ok('and the encryption answer that keeps a build out of Missing Compliance',
  names.indexOf('ITSAppUsesNonExemptEncryption') > -1, true);

ok('every key declares a type the writer knows how to write',
  names.filter((n) => ['string', 'bool'].indexOf(spec.keys[n].type) === -1), []);

ok('every string key has a non-empty value, since an empty one is rejectable',
  names.filter((n) => spec.keys[n].type === 'string' && !String(spec.keys[n].value || '').trim()),
  []);

ok('and every key says why it is there, because the next person will ask',
  names.filter((n) => !String(spec.keys[n].why || '').trim()), []);

/* The writer has to be wired into the build, or the keys are a manual Xcode
   step again, which is the thing that cost a build. */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok('`npm run ios` runs the writer', /ios_plist\.js/.test(pkg.scripts.ios), true);
ok('after cap sync, which also touches Info.plist',
  pkg.scripts.ios.indexOf('cap sync ios') < pkg.scripts.ios.indexOf('ios_plist.js'), true);
ok('and the writer exists', fs.existsSync(path.join(ROOT, 'scripts', 'ios_plist.js')), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
