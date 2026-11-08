/* ===========================================================================
   The version line at the foot of Your account.

   It used to say "Version 1.0" in the source, so every copy said 1.0 whatever
   was installed. It now asks the phone, through the App plugin's getInfo(),
   which reports the Version and Build typed into Xcode (versionName and
   versionCode on Android). These pin that: the number comes from the phone,
   a browser says it is the web version, and nothing hard coded comes back.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

/* `platform` is what Capacitor.getPlatform() says, or null for a browser.
   `info` is what App.getInfo() resolves, or an Error to reject with. */
function load(platform, info) {
  const asked = { n: 0 };
  const window = { console: console };
  if (platform) {
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: info === undefined ? {} : {
        App: {
          getInfo: function () {
            asked.n++;
            return info instanceof Error ? Promise.reject(info) : Promise.resolve(info);
          }
        }
      }
    };
  }
  const sandbox = { window: window, document: { addEventListener: () => {} } };
  window.window = window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'native.js'), 'utf8'), sandbox);
  return { native: window.HC.native, asked: asked };
}

const ios = load('ios', { name: 'Home Church', id: 'com.homechurchnola.app', version: '1.2', build: '25' });
const android = load('android', { version: '1.2', build: '137' });
const web = load(null);
const noPlugin = load('ios');
const broken = load('ios', new Error('no'));

ok('a browser says it is the web version', web.native.versionLabel(), 'Web version');
ok('a phone says nothing until it has been asked', ios.native.versionLabel(), '');

Promise.all([
  ios.native.appVersion(),
  android.native.appVersion(),
  web.native.appVersion(),
  noPlugin.native.appVersion(),
  broken.native.appVersion()
]).then(function (answers) {
  ok('an iPhone reports the Version and Build from Xcode',
    answers[0], { version: '1.2', build: '25' });
  ok('and the line reads them', ios.native.versionLabel(), 'Version 1.2 (25)');
  ok('Android reports versionName and versionCode',
    android.native.versionLabel(), 'Version 1.2 (137)');
  ok('a browser has no build to report', answers[2], null);
  ok('no App plugin is no answer, not a crash', [answers[3], noPlugin.native.versionLabel()], [null, '']);
  ok('a plugin that fails is no answer, not a crash', [answers[4], broken.native.versionLabel()], [null, '']);
  return ios.native.appVersion();
}).then(function () {
  ok('the phone is asked once, then the answer is kept', ios.asked.n, 1);

  const root = path.join(__dirname, '..', 'js');
  const profile = fs.readFileSync(path.join(root, 'screens', 'profile.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  ok('Your account has no version number written into it',
    /Version \d/.test(profile), false);
  ok('Your account draws the line the phone reports',
    /HC\.native\.versionLabel\(\)/.test(profile) && /data-appversion/.test(profile), true);
  ok('the app fills the line in once the phone answers',
    /HC\.native\.appVersion\(\)\.then\(paintVersion\)/.test(app), true);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch(function (err) {
  console.log('FAIL  threw: ' + (err && err.stack || err));
  process.exit(1);
});
