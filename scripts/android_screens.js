#!/usr/bin/env node
/*
 * Home Church, the Android app in an emulator: screenshots and the checks
 * that only a real Android build can answer.
 *
 * WHY. The preview link shows the web version, and on the web every
 * Android-only branch in js/native.js answers the way an iPhone does. So the
 * only way to see the Android app, and to prove Give and the push switches
 * really are gone from it, is the real build on a real Android system. This
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
  ok('and does not touch push', native.push === false);

  shoot('1-launch');

  if (await has('[data-gate="guest"]')) {
    await tap('[data-gate="guest"]');
    await wait(1500);
  }
  ok('Continue as guest reaches Home', await run(() => window.HC.router.current().name) === 'home');
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
    const switches = document.querySelectorAll('[data-action="toggle-notify"]').length;
    const hint = Array.from(document.querySelectorAll('.hc-profile__hint'))
      .map((p) => p.textContent).join(' ');
    return { switches: switches, saysComing: /on their way to the Android app/.test(hint) };
  });
  ok('Settings draws no notification switches', notify.switches === 0, notify);
  ok('and says notifications are coming', notify.saysComing, notify);
  await run(() => {
    const h = Array.from(document.querySelectorAll('.hc-profile__hint'))
      .find((p) => /Android app/.test(p.textContent));
    if (h) h.scrollIntoView({ block: 'center' });
  });
  await wait(600);
  shoot('6-settings-notifications');

  await run(() => window.HC.router.go({ name: 'give' }));
  await wait(1200);
  ok('an old link to Give lands with no giving button', !(await has('.hc-give__action')));
  shoot('7-give-by-old-link');

  await run(() => window.HC.router.go({ name: 'cal' }));
  await wait(1500);
  shoot('8-cal');

  socket.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack || err);
  try { shoot('error'); } catch (e) { /* no device either */ }
  process.exit(1);
});
