#!/usr/bin/env node
/*
 * Home Church, the Android app in an emulator: screenshots and the checks
 * that only a real Android build can answer.
 *
 * WHY. The preview link shows the web version, and on the web every
 * Android-only branch in js/native.js answers the way an iPhone does. So the
 * only way to see the Android app, to prove Give really is gone from it,
 * and that push asks the way Android asks and gets a real Firebase token, is
 * the real build on a real Android system. This
 * runs in the GitHub Action (.github/workflows/android.yml), which has the
 * emulator; nobody needs to run it on a laptop.
 *
 * HOW. A debug build lets Chrome's DevTools protocol into the app's WebView.
 * scripts/android_emulator.sh forwards that socket to localhost:9222, and
 * this talks to it directly, taps through the app the way a person would,
 * and takes each screenshot with adb so it is the whole phone screen, status
 * bar and all, exactly as somebody would see it.
 *
 * WHY NOT PLAYWRIGHT. Its connectOverCDP manages browser contexts on
 * connect, and an Android WebView refuses ("Browser context management is
 * not supported"). The protocol itself is a WebSocket and one method,
 * Runtime.evaluate, so this speaks it with Node's own fetch and WebSocket
 * and needs no dependency at all.
 *
 *   node scripts/android_screens.js <output dir>
 *
 * Exits non-zero if any check fails. The screenshots are the artifact.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = process.argv[2] || 'android-screens';
const CDP = process.env.HC_CDP || 'http://127.0.0.1:9222';

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); fail++; }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function shoot(name) {
  const png = execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(OUT, name + '.png'), png);
  console.log('      ' + name + '.png');
}

/* ---------------------------------------------- the protocol, by hand */

let socket = null;
let nextId = 1;
const pending = new Map();

async function connect() {
  const targets = await (await fetch(CDP + '/json')).json();
  const target = targets.find((t) => t.type === 'page' && /localhost/.test(t.url));
  if (!target) throw new Error('no app page behind ' + CDP + ': ' + JSON.stringify(targets));
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    const waiting = data.id && pending.get(data.id);
    if (!waiting) return;
    pending.delete(data.id);
    if (data.error) waiting.reject(new Error(data.error.message));
    else waiting.resolve(data.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('could not open ' + target.webSocketDebuggerUrl));
  });
}

function send(method, params) {
  const id = nextId++;
  socket.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  return new Promise((resolve, reject) => pending.set(id, { resolve: resolve, reject: reject }));
}

/* Runs `fn` in the app and hands back what it returned. `fn` is source, so
   it can only use what it is given as `arg`. */
async function run(fn, arg) {
  const result = await send('Runtime.evaluate', {
    expression: '(' + fn.toString() + ')(' + JSON.stringify(arg === undefined ? null : arg) + ')',
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error('in the app: ' + JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails.text));
  }
  return result.result.value;
}

const has = (sel) => run((s) => !!document.querySelector(s), sel);

/* Android's own permission dialog is not in the WebView, so it is found the
   way a test finds any system screen: uiautomator's dump of what is on the
   glass. Returns the centre of the first node whose resource id matches. */
function findOnScreen(idPattern) {
  let xml = '';
  try {
    // A dump taken while the screen is changing can fail; that is a miss,
    // not a reason to stop the run.
    execFileSync('adb', ['shell', 'rm', '-f', '/sdcard/hc-ui.xml']);
    execFileSync('adb', ['shell', 'uiautomator', 'dump', '/sdcard/hc-ui.xml'], { stdio: 'pipe' });
    xml = execFileSync('adb', ['exec-out', 'cat', '/sdcard/hc-ui.xml'], { stdio: 'pipe' }).toString();
  } catch (e) {
    return null;
  }
  for (const node of xml.match(/<node [^>]*>/g) || []) {
    const id = (node.match(/resource-id="([^"]*)"/) || [])[1] || '';
    const b = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (idPattern.test(id) && b) {
      return { x: (+b[1] + +b[3]) >> 1, y: (+b[2] + +b[4]) >> 1 };
    }
  }
  return null;
}
const tap = (sel) => run((s) => { document.querySelector(s).click(); }, sel);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await connect();

  // Splash, content, and the sign in offer, on a cold emulator.
  const until = Date.now() + 60000;
  while (!(await run(() => !!(window.HC && window.HC.router && window.HC.router.current())))) {
    if (Date.now() > until) throw new Error('the app never finished starting');
    await wait(500);
  }
  await wait(4000);

  const native = await run(() => ({
    platform: window.HC.native.platform(),
    giving: window.HC.native.offersGiving(),
    push: window.HC.native.pushAvailable()
  }));
  ok('the app knows it is on Android', native.platform === 'android', native);
  ok('and offers no giving', native.giving === false);
  ok('and can be sent a push, now that Firebase is in the build', native.push === true);

  /* NOTHING HERE REACHES THE LIVE TOKEN TABLE. This emulator is a real phone
     as far as Firebase is concerned, and a token it saved would be a row in
     the church's device_tokens getting every Sunday reminder until Firebase
     reported it gone. So the two calls that save one answer here, on the
     phone, and are kept for the checks below. */
  await run(() => {
    window.__hcSaved = [];
    const real = window.fetch;
    window.fetch = function (url, init) {
      if (/\/rpc\/hc_[a-z_]*device/.test(String(url))) {
        window.__hcSaved.push({ url: String(url), body: init && init.body });
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return real.apply(this, arguments);
    };
  });

  /* A new phone is asked after the way in, not at launch. Continue as guest,
     then "Stay in the loop." (js/notify-intro.js), whose Turn on
     notifications is what brings up Android's own dialog. On Android 13 and
     later that is the system's dialog over the app.

     On one run in two on October 28 the dialog did not appear when asked,
     and the switches showed nobody had answered. Why is not known yet, so a
     miss prints what the phone thought and then asks again the same way.
     Asking again is what the screen itself offers after a first no, so that
     is a warning; never being able to ask is the failure. */
  const findDeny = async (seconds) => {
    const until = Date.now() + seconds * 1000;
    let found = null;
    while (!found && Date.now() < until) {
      found = findOnScreen(/permission_deny/);
      if (!found) await wait(1000);
    }
    return found;
  };

  ok('nobody is asked about notifications at launch', !findOnScreen(/permission_deny/));
  if (await has('[data-gate="guest"]')) {
    shoot('1-launch');
    await tap('[data-gate="guest"]');
    await wait(2500);
  }
  ok('the way in leads to the notification switches',
    await has('.hc-splash--notify [data-notify-go]'));
  shoot('1b-notifications');
  await tap('[data-notify-go]');

  let deny = await findDeny(30);
  if (!deny) {
    const state = await run(() => window.Capacitor.Plugins.PushNotifications.checkPermissions()
      .then((r) => r.receive, (e) => 'error: ' + e));
    let focus = '';
    try {
      focus = execFileSync('adb', ['shell', 'dumpsys', 'window'], { stdio: 'pipe' }).toString()
        .split('\n').filter((l) => /mCurrentFocus|mFocusedApp/.test(l)).map((l) => l.trim()).join(' | ');
    } catch (e) { focus = String(e); }
    let log = '';
    try {
      log = execFileSync('adb', ['logcat', '-d', '-v', 'brief'], { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 })
        .toString().split('\n')
        .filter((l) => /POST_NOTIFICATIONS|GrantPermissions|permissioncontroller|Capacitor\/Plugin.*Push|PushNotifications/i.test(l))
        .slice(-15).join('\n        ');
    } catch (e) { log = String(e); }
    console.log('WARN  no notification prompt 30 seconds after Turn on notifications.\n' +
      '        the app reads the permission as: ' + state + '\n' +
      '        focus: ' + focus + '\n        ' + (log || '(no permission lines in logcat)'));
    shoot('1c-no-prompt');
    await run(() => { window.HC.native.applyChoices(); });
    deny = await findDeny(30);
  }
  ok('a new phone is asked about notifications', !!deny);
  shoot('1c-prompt');
  if (deny) {
    // No, for the screenshots: a phone that declines is the one with the most
    // to show, every switch drawn and off.
    execFileSync('adb', ['shell', 'input', 'tap', String(deny.x), String(deny.y)]);
    await wait(2000);
  }

  /* After a first no Android will ask once more, so the screen offers Turn
     on notifications again rather than the way to Settings an iPhone gets.
     Maybe later is Home. */
  const off = await run(() => ({
    title: (document.getElementById('hc-splash-greeting') || {}).textContent,
    again: !!document.querySelector('[data-notify-again]'),
    later: !!document.querySelector('[data-notify-later]')
  }));
  ok('a no says notifications are off', off.title === 'Notifications are off.', off);
  ok('and offers to ask again, which Android allows once', off.again, off);
  shoot('1d-notifications-off');
  if (off.later) {
    await tap('[data-notify-later]');
    await wait(1500);
  }

  ok('Maybe later reaches Home', await run(() => window.HC.router.current().name) === 'home');
  shoot('2-home');

  ok('Home has no giving row', !(await has('.hc-home__give')));
  await run(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(800);
  shoot('3-home-bottom');
  await run(() => window.scrollTo(0, 0));

  if (await has('#hc-navfab')) {
    await tap('#hc-navfab');
    await wait(1000);
    const links = await run(() =>
      Array.from(document.querySelectorAll('.hc-navmenu__link')).map((a) => a.textContent.trim()));
    ok('the menu has no Give', links.length > 0 && !links.some((t) => /^Give\b/.test(t)), links);
    shoot('4-menu');
    await tap('#hc-navfab');
    await wait(600);
  }

  await run(() => window.HC.router.go({ name: 'profile' }));
  await wait(1200);
  shoot('5-settings');
  const notify = await run(() => {
    const rows = Array.from(document.querySelectorAll('[data-action="toggle-notify"]'));
    const hint = Array.from(document.querySelectorAll('.hc-profile__hint'))
      .map((p) => p.textContent).join(' ');
    return {
      switches: rows.length,
      on: rows.filter((r) => r.getAttribute('aria-checked') === 'true').length,
      saysComing: /on their way to the Android app/.test(hint)
    };
  });
  ok('Settings draws the notification switches', notify.switches > 0, notify);
  ok('all off, after a no', notify.on === 0, notify);
  ok('and no longer says notifications are coming', !notify.saysComing, notify);
  await run(() => {
    const s = document.querySelector('[data-action="toggle-notify"]');
    if (s) s.scrollIntoView({ block: 'center' });
  });
  await wait(600);
  shoot('6-settings-notifications');

  /* THE WHOLE ROAD TO A TOKEN, short of the database. Saying yes in Settings
     is what pm grant stands in for; then the same call the switch makes.
     Firebase answers with a token only if google-services.json matches this
     app and project, so a token here is the build's half of section 8
     proven on a real Android system. Firebase needs the network, which an
     emulator on a CI runner usually has and occasionally does not, so no
     answer at all is a warning; a refusal is a failure. */
  execFileSync('adb', ['shell', 'pm', 'grant', 'com.homechurchnola.app',
    'android.permission.POST_NOTIFICATIONS']);
  await run(() => {
    window.__hcPushError = null;
    window.Capacitor.Plugins.PushNotifications.addListener('registrationError', (e) => {
      window.__hcPushError = String((e && e.error) || JSON.stringify(e));
    });
    return window.HC.native.enableNotifications().then((v) => { window.__hcEnabled = v; });
  });
  let saved = [];
  let pushError = null;
  for (let i = 0; i < 45; i++) {
    saved = await run(() => window.__hcSaved);
    pushError = await run(() => window.__hcPushError);
    if (saved.some((c) => /register_device_token/.test(c.url)) || pushError) break;
    await wait(1000);
  }
  ok('after a yes, turning notifications on succeeds', await run(() => window.__hcEnabled) === true);
  ok('Firebase does not refuse this build', !pushError, pushError);
  const registration = saved.find((c) => /register_device_token/.test(c.url));
  if (registration) {
    const args = JSON.parse(registration.body);
    ok('Firebase gave this phone a token', typeof args.p_token === 'string' && args.p_token.length > 100,
      args.p_token && args.p_token.length);
    ok('and it registers as android', args.p_platform === 'android', args.p_platform);
  } else if (!pushError) {
    console.log('WARN  Firebase did not answer in 45 seconds; no token to check on this run');
  }

  await run(() => window.HC.router.go({ name: 'give' }));
  await wait(1200);
  ok('an old link to Give lands with no giving button', !(await has('.hc-give__action')));
  shoot('7-give-by-old-link');

  await run(() => window.HC.router.go({ name: 'cal' }));
  await wait(1500);
  shoot('8-cal');

  /* Sharing a file, the road a printed guide, a calendar invitation and an
     exported journal all take. The app may only hand out files from its own
     cache (android/app/src/main/res/xml/file_paths.xml), so this writes one
     there and opens the share sheet with it. If that list ever stops
     covering where the app writes, Android refuses at once and the plugin
     rejects; a share sheet on screen is the pass. */
  await run(() => {
    window.__hcShareError = null;
    const P = window.Capacitor.Plugins;
    return P.Filesystem.writeFile({
      path: 'hc-share-check.txt', data: 'Home Church', directory: 'CACHE', encoding: 'utf8'
    }).then((written) => {
      P.Share.share({ title: 'Share check', files: [written.uri] })
        .catch((err) => { window.__hcShareError = String((err && err.message) || err); });
    });
  });
  await wait(3000);
  shoot('9-share-sheet');
  const shareError = await run(() => window.__hcShareError);
  ok('a file from the cache can be shared', !shareError, shareError);
  execFileSync('adb', ['shell', 'input', 'keyevent', '4']);
  await wait(800);

  socket.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack || err);
  try { shoot('error'); } catch (e) { /* no device either */ }
  process.exit(1);
});
