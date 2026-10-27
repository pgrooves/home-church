/* ===========================================================================
   The Android branches in js/native.js, and that an iPhone takes none of them.

   The Android port's one rule is that it adds branches and changes nothing an
   iPhone does. So every answer here is asked three times, once per platform
   Capacitor can report, and the iPhone answer is pinned to what the app did
   before Android existed: giving offered, push available, a reminder sent
   to the plugin with no Android-only field in it, and push registering as
   'ios'. PLAY_COMPLIANCE.md sections 3 and 8 say why Android differs.
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

function fakeStorage() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }
  };
}

/* What a plugin was asked to do, so a test can say "never touched". */
function fakePlugins(calls) {
  const record = (name, value) => function (arg) {
    calls.push([name, arg === undefined ? null : arg]);
    return Promise.resolve(value);
  };
  return {
    LocalNotifications: {
      checkPermissions: record('ln.checkPermissions', { display: 'granted' }),
      schedule: record('ln.schedule', {})
    },
    PushNotifications: {
      addListener: function () { return Promise.resolve({ remove: function () {} }); },
      checkPermissions: record('push.checkPermissions', { receive: 'granted' }),
      requestPermissions: record('push.requestPermissions', { receive: 'granted' }),
      register: record('push.register', undefined)
    }
  };
}

/* `platform` is what Capacitor.getPlatform() says, or null for a browser. */
function load(platform) {
  const calls = [];
  const sandbox = {
    window: { localStorage: fakeStorage(), console: console },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({ set innerHTML(v) {}, firstElementChild: null })
    }
  };
  if (platform) {
    sandbox.window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: fakePlugins(calls)
    };
  }
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  for (const f of ['data.js', 'store.js', 'components.js', 'native.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  }
  return { HC: sandbox.window.HC, calls: calls };
}

const web = load(null).HC.native;
const ios = load('ios');
const android = load('android');

/* ------------------------------------------------------------- platform */

ok('a browser is web', web.platform(), 'web');
ok('an iPhone is ios', ios.HC.native.platform(), 'ios');
ok('an Android phone is android', android.HC.native.platform(), 'android');
ok('only Android says isAndroid',
  [web.isAndroid(), ios.HC.native.isAndroid(), android.HC.native.isAndroid()],
  [false, false, true]);

/* --------------------------------------------------------------- giving */

ok('giving is offered in a browser and on an iPhone, as before',
  [web.offersGiving(), ios.HC.native.offersGiving()], [true, true]);
ok('and not on Android, until there is a determination letter',
  android.HC.native.offersGiving(), false);

/* ----------------------------------------------------------------- push */

ok('push is available on an iPhone, as before', ios.HC.native.pushAvailable(), true);
ok('and not on Android, until Firebase is set up', android.HC.native.pushAvailable(), false);

const later = new Date(Date.now() + 3 * 3600 * 1000);
const reminder = { id: 42, title: 'Group night', body: 'In an hour', at: later, eventId: 'e1' };

Promise.all([
  ios.HC.native.enableNotifications(),
  android.HC.native.enableNotifications()
]).then(function (answers) {
  ok('turning notifications on still registers on an iPhone', answers[0], true);
  ok('on an iPhone that is a permission request and a registration',
    ios.calls.map((c) => c[0]), ['push.requestPermissions', 'push.register']);
  ok('on Android it answers no', answers[1], false);
  ok('without touching the push plugin, which would crash with no Firebase file',
    android.calls.filter((c) => c[0].indexOf('push.') === 0), []);

  android.HC.native.resumeNotifications(false);
  return new Promise((r) => setTimeout(r, 0));
}).then(function () {
  ok('the launch check leaves the push plugin alone on Android too',
    android.calls.filter((c) => c[0].indexOf('push.') === 0), []);

  /* ------------------------------------------------------------ reminders */

  return Promise.all([
    ios.HC.native.scheduleReminder(reminder),
    android.HC.native.scheduleReminder(reminder)
  ]);
}).then(function (answers) {
  ok('a reminder is scheduled on both', answers, [true, true]);
  const sent = (calls) => calls.filter((c) => c[0] === 'ln.schedule')[0][1].notifications[0];
  ok('the iPhone payload has exactly the keys it always had',
    Object.keys(sent(ios.calls)).sort(), ['body', 'extra', 'id', 'schedule', 'title']);
  ok('Android asks for an inexact alarm, so nobody is sent to Settings',
    sent(android.calls).isExactNotification, false);

  /* ------------------------------------------------- what registers as what */

  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'native.js'), 'utf8');
  ok('registration carries the platform rather than a hard coded ios',
    /p_platform: platform\(\)/.test(src) && !/p_platform: 'ios'/.test(src), true);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch(function (err) {
  console.log('FAIL  threw: ' + (err && err.stack || err));
  process.exit(1);
});
