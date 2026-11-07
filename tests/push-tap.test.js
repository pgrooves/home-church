/* ===========================================================================
   A tapped notification opens what it was about.

   send-push says where a tap should land, beside the message: on iPhone as an
   `hc` object next to aps, on Android as flat `v` and `id` strings. The app
   listens for the tap from boot and opens that announcement's page, that
   date on the calendar, or Home for a notification about several things.

   What is pinned here:
   1. The approval notification's target: one announcement opens its page;
      one date opens its announcement, or the day when it has none; a batch
      opens Home.
   2. The Firebase message carries the target as strings, and leaves the data
      as it was for a notification with none.
   3. The app reads both shapes, ignores anything else, and registers the
      listener only where push exists (never in a browser, never on Android
      with push switched off).
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

/* --------------------------------------------------- the sender's side */

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'send-push', 'index.ts'), 'utf8');

const fence = (name) => {
  const a = source.indexOf('/* @@ ' + name + ':start */');
  const b = source.indexOf('/* @@ ' + name + ':end */');
  if (a === -1 || b === -1 || b < a) throw new Error('fence ' + name + ' is missing');
  return stripTypeScriptTypes(source.slice(a, b));
};

if (typeof stripTypeScriptTypes === 'function') {
  const W = vm.runInNewContext(fence('batch-note') + '\n({ approvalOpen })', { Intl, Date, Map, Set, Number, String });
  const F = vm.runInNewContext(fence('fcm') + '\n({ fcmMessage })', { JSON, String, Number, Date, Math });

  const ann = { kind: 'announcement', row: { id: 'announcement-gala', title: 'Homecoming Gala' } };
  const date = { kind: 'event', row: { id: 'event-party', title: 'Christmas Party', starts_at: '2026-12-19T00:30:00Z' } };

  ok('one announcement opens its own page',
    W.approvalOpen([ann], null), { v: 'announcement', id: 'announcement-gala' });
  ok('one date opens the announcement it belongs to',
    W.approvalOpen([date], 'announcement-party'), { v: 'announcement', id: 'announcement-party' });
  ok('one date with no announcement opens its day',
    W.approvalOpen([date], null), { v: 'event', id: 'event-party' });
  ok('a batch opens Home',
    W.approvalOpen([ann, date], null), { v: 'home' });

  const plain = F.fcmMessage('tok', { title: 'T', body: 'B' }, 'sunday_reminder', 'sunday_reminder').message;
  ok('a notification with nowhere to go keeps the data it always had', plain.data, { topic: 'sunday_reminder' });

  const withId = F.fcmMessage('tok', { title: 'T', body: 'B', open: { v: 'announcement', id: 'a1' } },
    'approved_batch', 'approved_batch:7').message;
  ok('Android carries where to go as strings', withId.data, { topic: 'approved_batch', v: 'announcement', id: 'a1' });

  const home = F.fcmMessage('tok', { title: 'T', body: 'B', open: { v: 'home' } }, 'approved_batch', 'x').message;
  ok('and Home without an id', home.data, { topic: 'approved_batch', v: 'home' });

  ok('iPhone carries it beside aps', /\.\.\.\(note\.open\?\.v \? \{ hc: note\.open \} : \{\}\)/.test(source), true);
  ok('the one-row announcement topic opens its page too',
    /open: \{ v: 'announcement', id: ref \}/.test(source), true);
} else {
  console.log('SKIP  the sender half: node ' + process.version + ' has no module.stripTypeScriptTypes.');
}

/* -------------------------------------------------------- the app's side */

function load(platform, androidPush) {
  const listeners = {};
  const sandbox = {
    window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console },
    document: {
      querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {},
      createElement: () => ({ set innerHTML(v) {}, firstElementChild: null })
    }
  };
  if (platform) {
    sandbox.window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: {
        PushNotifications: {
          addListener: (name, fn) => { listeners[name] = fn; return Promise.resolve({ remove() {} }); }
        }
      }
    };
  }
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  let src = fs.readFileSync(path.join(__dirname, '..', 'js', 'native.js'), 'utf8');
  if (androidPush === false) src = src.replace(/var ANDROID_PUSH = true;/, 'var ANDROID_PUSH = false;');
  for (const f of ['data.js', 'store.js', 'components.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  }
  vm.runInContext(src, sandbox);
  return { native: sandbox.window.HC.native, listeners };
}

const ios = load('ios');
const t = ios.native._pushTarget;

ok('iPhone: the hc object beside aps',
  t({ aps: { alert: {} }, hc: { v: 'announcement', id: 'a1' } }), { v: 'announcement', id: 'a1' });
ok('Android: flat strings',
  t({ topic: 'approved_batch', v: 'event', id: 'e1' }), { v: 'event', id: 'e1' });
ok('Home needs no id', t({ hc: { v: 'home' } }), { v: 'home', id: null });
ok('hc that arrived as text is read too', t({ hc: '{"v":"announcement","id":"a2"}' }), { v: 'announcement', id: 'a2' });
ok('an announcement with no id goes nowhere', t({ hc: { v: 'announcement' } }), null);
ok('an unknown place goes nowhere', t({ hc: { v: 'admin', id: 'x' } }), null);
ok('the Sunday reminder, with nothing to say, goes nowhere', t({ topic: 'sunday_reminder' }), null);
ok('no data goes nowhere', t(undefined), null);

const opened = [];
ios.native.onPushTapped((target) => opened.push(target));
ok('on an iPhone it listens for the tap', typeof ios.listeners.pushNotificationActionPerformed, 'function');
ios.listeners.pushNotificationActionPerformed({
  actionId: 'tap', notification: { data: { aps: {}, hc: { v: 'announcement', id: 'a9' } } }
});
ios.listeners.pushNotificationActionPerformed({ actionId: 'tap', notification: { data: { aps: {} } } });
ok('a tap with somewhere to go is handed on, and one without is not', opened, [{ v: 'announcement', id: 'a9' }]);

const android = load('android');
android.native.onPushTapped(() => {});
ok('on Android it listens too', typeof android.listeners.pushNotificationActionPerformed, 'function');

const androidOff = load('android', false);
androidOff.native.onPushTapped(() => {});
ok('but not on Android with push switched off', androidOff.listeners.pushNotificationActionPerformed, undefined);

const web = load(null);
let threw = false;
try { web.native.onPushTapped(() => {}); } catch (e) { threw = true; }
ok('in a browser it does nothing, quietly', threw, false);

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
ok('the app registers it at boot', /HC\.native\.onPushTapped\(openFromPush\)/.test(app), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
