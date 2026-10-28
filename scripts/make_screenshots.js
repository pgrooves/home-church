#!/usr/bin/env node
/*
 * Home Church, App Store screenshots.
 *
 * Renders the six screenshots from SUBMISSION_KIT.md section 4 at exactly
 * 1320 x 2868, which is the 6.9 inch iPhone size and the only one App Store
 * Connect requires. Apple scales it down for every smaller device.
 *
 * 440 x 956 CSS pixels at deviceScaleFactor 3 is 1320 x 2868. That is the
 * logical resolution of a 6.9 inch iPhone, so the layout lands the same way
 * it does on the device rather than being a stretched 390 wide phone.
 *
 * WHY A SCRIPT AND NOT SIX MANUAL CAPTURES. The app's content changes every
 * week. A screenshot with a stale guide title on it is a small lie on the
 * store page, and the version that gets caught is the one where a reviewer
 * compares the screenshot to the app. Regenerating is one command.
 *
 * WHAT THESE ARE NOT. They are Chromium renders, not device captures. The
 * fonts are the same bundled files and the layout is the same CSS, so they
 * are honest and they are accepted. If you want the last few percent of
 * fidelity, retake them in the iOS simulator using the same order and the
 * same captions. Do not ship a mix of both.
 *
 * USAGE
 *   npx http-server -p 8770 -s &
 *   node scripts/make_screenshots.js
 *   node scripts/make_screenshots.js --android
 *
 * Writes to screenshots/, or with --android to play/screenshots/.
 *
 * THE ANDROID SET. Google Play wants phone screenshots between 16:9 and 9:16,
 * and at least 1080 pixels on the short side to be eligible for the
 * listing's larger layouts. 405 x 720 CSS pixels at 8/3 is exactly 1080 x
 * 1920, which is 9:16 at a width close to a typical Android phone's.
 *
 * And the app is told it is Android, with a stand-in Capacitor global that
 * answers getPlatform() with 'android' and carries no plugins. That is what
 * makes every Android branch in js/native.js take its Android road, so Give
 * is absent from these exactly as it is from the Android app, rather than a
 * store screenshot showing a page that build does not have. PLAY_COMPLIANCE.md
 * section 3.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BASE = process.env.HC_BASE || 'http://127.0.0.1:8770';
const ANDROID = process.argv.includes('--android');
const OUT = ANDROID
  ? path.join(path.dirname(__dirname), 'play', 'screenshots')
  : path.join(path.dirname(__dirname), 'screenshots');

// 6.9 inch iPhone: 440 x 956 logical, 3x, so 1320 x 2868 actual.
// Android: 405 x 720 logical at 8/3, so 1080 x 1920 actual. See the header.
const VIEWPORT = ANDROID ? { width: 405, height: 720 } : { width: 440, height: 956 };
const SCALE = ANDROID ? 8 / 3 : 3;

/* Runs before any of the app's own scripts, so js/native.js sees Android
   from its first line. No plugins: every call that would reach one is
   guarded by a presence check, the same as in a browser. */
const AS_ANDROID = () => {
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {}
  };
};

/* Seed state before each shot. An empty app photographs badly and, worse,
   photographs dishonestly: the greeting says "Welcome home" to a stranger and
   "Good morning, Sarah" to everybody who actually uses it. */
const SEED = () => {
  HC.store.updateProfile({ firstName: 'Sarah', lastName: 'B', leaderMode: true });
  const g = HC.data.guidesByDate()[0];
  if (g) {
    HC.store.toggleChecked(g.id, '0-0');
    HC.store.toggleChecked(g.id, '0-1');
  }
};

const SHOTS = [
  {
    file: '1-guide-reader.png',
    caption: "This week's guide, ready before your group meets",
    route: () => `?v=guide-reader&id=${HC.data.guidesByDate()[0].id}`,
    after: async (p) => {
      // Open the discussion questions, which is the section worth showing.
      await p.evaluate(() => {
        const t = document.querySelector('[data-section="group"] .hc-section__toggle');
        if (t) t.click();
        const s = document.querySelector('[data-section="short-summary"] .hc-section__toggle');
        if (s && s.getAttribute('aria-expanded') === 'true') s.click();
      });
      await p.waitForTimeout(500);
      await p.evaluate(() => {
        const el = document.querySelector('[data-section="group"]');
        if (el) el.scrollIntoView({ block: 'start' });
      });
      await p.waitForTimeout(400);
    }
  },
  {
    file: '2-presentation.png',
    caption: 'Leader mode reads across a living room',
    route: () => `?v=present&id=${HC.data.guidesByDate()[0].id}&i=2`
  },
  {
    file: '3-guide-index.png',
    caption: 'Saved on your phone. Works with no signal.',
    route: () => '?v=guide'
  },
  {
    file: '4-listen.png',
    caption: 'Every message since 2024, with the notes',
    route: () => '?v=listen',
    after: async (p) => {
      await p.evaluate(() => {
        const t = document.querySelector('.hc-sermon__main');
        if (t) t.click();
      });
      await p.waitForTimeout(400);
    }
  },
  {
    file: '5-connect.png',
    caption: 'Find your people, and a place to serve',
    route: () => '?v=connect',
    after: async (p) => {
      await p.evaluate(() => {
        const t = document.querySelector('[data-section^="team-"] .hc-section__toggle');
        if (t) t.click();
        const el = document.querySelector('[data-section^="team-"]');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await p.waitForTimeout(500);
    }
  },
  {
    file: '6-home.png',
    caption: 'Sunday, and everything before it',
    route: () => '?v=home'
  }
];

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (err) {
    try {
      ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
    } catch (err2) {
      console.error('Playwright not found. npm i -D playwright');
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const captions = [];

  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
    if (ANDROID) await page.addInitScript(AS_ANDROID);

    // Land somewhere cheap, seed, then go to the real route so the seeded
    // profile is already in place when the screen first paints.
    await page.goto(`${BASE}/?v=home`, { waitUntil: 'networkidle' });
    await page.evaluate(SEED);

    const route = await page.evaluate(shot.route);
    await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);

    /* The offer to sign in comes up on every launch where nobody is signed
       in (js/gate.js), over whatever screen the link opened. Take it the way
       a visitor would, with Continue as guest, which closes it and leaves
       the screen underneath where it was. */
    const gate = await page.waitForSelector('[data-gate="guest"]', { timeout: 6000 }).catch(() => null);
    if (gate) {
      await gate.click();
      await page.waitForTimeout(1200);
    }

    if (shot.after) await shot.after(page);

    const file = path.join(OUT, shot.file);
    await page.screenshot({ path: file });

    const { width, height } = await page.evaluate(() => ({
      width: window.innerWidth * window.devicePixelRatio,
      height: window.innerHeight * window.devicePixelRatio
    }));
    console.log(`${shot.file.padEnd(22)} ${width}x${height}  ${shot.caption}`);
    captions.push(`${shot.file}\n    ${shot.caption}`);

    await page.close();
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'CAPTIONS.txt'),
    (ANDROID ? 'Google Play phone screenshots, in upload order.\n' +
      'Play has no caption field; these are for whoever is choosing the order.\n\n'
      : 'App Store screenshot captions, in order.\n' +
      'Paste these as the text overlay or as the localized captions.\n\n') +
    captions.join('\n\n') + '\n');

  console.log(`\n${SHOTS.length} screenshots in ${path.relative(path.dirname(__dirname), OUT)}/, captions in CAPTIONS.txt`);
}

main();
