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
 * this connects playwright to it, taps through the app the way a person
 * would, and takes each screenshot with adb so it is the whole phone screen,
 * status bar and all, exactly as somebody would see it.
 *
 *   node scripts/android_screens.js <output dir>
 *
 * Exits non-zero if any check fails. The screenshots are the artifact.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.connectOverCDP(CDP);
  const page = browser.contexts().flatMap((c) => c.pages())
    .find((p) => /localhost/.test(p.url()));
  if (!page) throw new Error('no app page behind ' + CDP);

  // Splash, content, and the sign in offer, on a cold emulator.
  await page.waitForFunction(() => window.HC && window.HC.router && window.HC.router.current(), null, { timeout: 60000 });
  await wait(4000);

  const native = await page.evaluate(() => ({
    platform: window.HC.native.platform(),
    giving: window.HC.native.offersGiving(),
    push: window.HC.native.pushAvailable()
  }));
  ok('the app knows it is on Android', native.platform === 'android', native);
  ok('and offers no giving', native.giving === false);
  ok('and does not touch push', native.push === false);

  shoot('1-launch');

  if (await page.$('[data-gate="guest"]')) {
    await page.click('[data-gate="guest"]');
    await wait(1500);
  }
  ok('Continue as guest reaches Home', await page.evaluate(() => window.HC.router.current().name) === 'home');
  shoot('2-home');

  ok('Home has no giving row', !(await page.$('.hc-home__give')));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(800);
  shoot('3-home-bottom');
  await page.evaluate(() => window.scrollTo(0, 0));

  if (await page.$('#hc-navfab')) {
    await page.click('#hc-navfab');
    await wait(1000);
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hc-navmenu__link')).map((a) => a.textContent.trim()));
    ok('the menu has no Give', links.length > 0 && !links.some((t) => /^Give\b/.test(t)), links);
    shoot('4-menu');
    await page.click('#hc-navfab');
    await wait(600);
  }

  await page.evaluate(() => window.HC.router.go({ name: 'profile' }));
  await wait(1200);
  shoot('5-settings');
  const notify = await page.evaluate(() => {
    const switches = document.querySelectorAll('[data-action="toggle-notify"]').length;
    const hint = Array.from(document.querySelectorAll('.hc-profile__hint'))
      .map((p) => p.textContent).join(' ');
    return { switches: switches, saysComing: /on their way to the Android app/.test(hint) };
  });
  ok('Settings draws no notification switches', notify.switches === 0, notify);
  ok('and says notifications are coming', notify.saysComing, notify);
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('.hc-profile__hint'))
      .find((p) => /Android app/.test(p.textContent));
    if (h) h.scrollIntoView({ block: 'center' });
  });
  await wait(600);
  shoot('6-settings-notifications');

  await page.evaluate(() => window.HC.router.go({ name: 'give' }));
  await wait(1200);
  ok('an old link to Give lands with no giving button', !(await page.$('.hc-give__action')));
  shoot('7-give-by-old-link');

  await page.evaluate(() => window.HC.router.go({ name: 'cal' }));
  await wait(1500);
  shoot('8-cal');

  await browser.close().catch(() => {});
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack || err);
  try { shoot('error'); } catch (e) { /* no device either */ }
  process.exit(1);
});
