/* ===========================================================================
   Which dependencies are Capacitor plugins, and what the iOS manifest is
   expected to name.

   WHY THIS FILE EXISTS. The plugin check in scripts/preflight.js has now been
   wrong twice, in opposite directions, on builds that were fine.

   The first time it looked for ios/App/Podfile. This project has no Podfile
   and never will — Capacitor builds it with Swift Package Manager — so the
   check skipped every run while announcing that ios/ was not generated, on a
   machine whose ios/ had just been synced.

   The second time it expected @capacitor/ios in Package.swift. That is the
   platform, not a plugin: under CocoaPods it is a pod pulled from its
   node_modules path, and under SPM the runtime comes from Capacitor's own
   remote package by URL instead, so Package.swift correctly never names it.
   A green build failed preflight for it.

   BOTH GOT THROUGH THE SAME WAY. Each was tested against a fixture written
   from the very list being tested, so the fixture agreed with the bug. The
   fix is to pin the rule to a number this repo does not get to choose: the
   `Found N Capacitor plugins for ios` that `npx cap sync ios` prints, which
   was 11 while preflight's list was 12. The count is the oracle, and
   package.json is the input, so adding or removing a plugin moves both
   together and this test keeps meaning something.

   THE MANIFEST SHAPE IS FROM A REAL ONE, not from my idea of one — the
   fixture below is what Capacitor 8 writes, down to the remote package URL
   and the node_modules paths, taken from the CLI's own generator. Anything
   assembled from package.json would be the same mistake a third time.
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
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/* The rule, lifted out of preflight as source so this tests the code that
   runs rather than a copy of it. Same trick as tests/info-plist.test.js. */
const preflight = fs.readFileSync(path.join(ROOT, 'scripts', 'preflight.js'), 'utf8');
const from = preflight.indexOf('function capacitorPlugins');
const to = preflight.indexOf('function pluginPods');
ok('the rule is still findable in scripts/preflight.js', from > -1 && to > from, true);
// eslint-disable-next-line no-eval
const capacitorPlugins = eval('(' + preflight.slice(from, to).trim() + ')');

/* ------------------------------------------------------------- the count

   THE NUMBER CAPACITOR REPORTS. `npx cap sync ios` prints "Found 11
   Capacitor plugins for ios" against this package.json, and preflight's list
   has to be that same set. When a plugin is added or dropped, this number
   moves with it — and it should be changed only after reading cap sync's own
   output, never to make this file green. */
const CAP_SYNC_REPORTS = 11;

const plugins = capacitorPlugins(pkg.dependencies);

ok('the plugin list is the length cap sync reports', plugins.length, CAP_SYNC_REPORTS);

ok('@capacitor/core is not in it, having no native side at all',
  plugins.indexOf('@capacitor/core'), -1);

ok('AND @capacitor/ios IS NOT EITHER, because it is the platform',
  plugins.indexOf('@capacitor/ios'), -1);

ok('the calendar plugin is in it', plugins.indexOf('@ebarooni/capacitor-calendar') > -1, true);
ok('and so is a plugin under somebody else\'s scope',
  plugins.indexOf('@aparajita/capacitor-biometric-auth') > -1, true);

ok('nothing outside the dependencies can get in',
  capacitorPlugins({ '@capacitor/haptics': '^8', 'left-pad': '^1' }),
  ['@capacitor/haptics']);

ok('and no dependencies at all is an empty list, not a crash',
  capacitorPlugins(undefined), []);

/* -------------------------------------------- what the manifest looks like

   A real ios/App/CapApp-SPM/Package.swift, as Capacitor 8 writes it: the
   runtime as a remote package by URL, then one local package per plugin at
   its path under node_modules. Note what is absent — there is no
   node_modules/@capacitor/ios line anywhere in it. */
const PACKAGE_SWIFT = [
  '// swift-tools-version: 5.9',
  'import PackageDescription',
  '',
  '// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands',
  'let package = Package(',
  '    name: "CapApp-SPM",',
  '    platforms: [.iOS(.v15)],',
  '    products: [',
  '        .library(',
  '            name: "CapApp-SPM",',
  '            targets: ["CapApp-SPM"])',
  '    ],',
  '    dependencies: [',
  '        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),'
].concat(plugins.map(function (name) {
  return '        .package(name: "X", path: "../../../node_modules/' + name + '"),';
})).concat([
  '    ]',
  ')'
]).join('\n');

ok('every plugin preflight looks for is named in a real Package.swift',
  plugins.filter((name) => PACKAGE_SWIFT.indexOf(name) === -1), []);

ok('THE PLATFORM IS NOT NAMED THERE, which is the bug this pins down',
  PACKAGE_SWIFT.indexOf('node_modules/@capacitor/ios') === -1, true);

ok('it arrives as the remote runtime package instead',
  PACKAGE_SWIFT.indexOf('capacitor-swift-pm') > -1, true);

/* And preflight has to be looking for that, since it stopped looking for
   @capacitor/ios in the plugin loop. */
ok('preflight checks for the runtime package by that name',
  /capacitor-swift-pm/.test(preflight), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
