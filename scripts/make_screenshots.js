#!/usr/bin/env node
/*
 * Home Church, App Store screenshots.
 *
 * Renders the six screenshots from SUBMISSION_KIT.md section 4. The default
 * is 1320 x 2868, the 6.9 inch iPhone size and the only one App Store Connect
 * requires, which Apple scales down for every smaller device. --size renders
 * the same six at another slot's spec for the case where a slot is already
 * populated with older images and will not take the 6.9 set.
 *
 * 440 x 956 CSS pixels at deviceScaleFactor 3 is 1320 x 2868. That is the
 * logical resolution of a 6.9 inch iPhone, so the layout lands the same way
 * it does on the device rather than being a stretched 390 wide phone. Every
 * size in SIZES below is the same idea: the phone's own logical size, tripled.
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
 *   node scripts/make_screenshots.js --size 6.5
 *
 * Writes to screenshots/, or to screenshots/<size>/ for any size other than
 * the required one. --out overrides the directory.
 */

'use strict';

const path = require('path');
const fs = require('fs');

/* The same Continue as guest the browser tests tap. Shared rather than
   reimplemented so there is one answer to the gate in the repo, and so a
   change to the way in cannot fix the tests and leave the screenshots
   showing a login screen. */
const pastTheGate = require(path.join(__dirname, '..', 'tests', 'e2e', 'past-the-gate.js'));

const BASE = process.env.HC_BASE || 'http://127.0.0.1:8770';

/* The display sizes App Store Connect has slots for, as the logical
   resolution of the phone rather than the pixel count, because that is what
   decides the layout. Every one of these is a 3x device, so the pixels are
   the logical size tripled, and they come out at exactly the spec.

   RENDER AT THE SIZE, DO NOT RESCALE TO IT. A 6.5 inch phone is 414 points
   wide, not 440, and at 414 the app lays the page out the way that phone
   actually lays it out: the greeting wraps where it wraps there, the cards
   size to that width, the tab bar spaces itself for it. Taking the 6.9 inch
   render and squeezing it to 1242 wide is a picture of a different phone.
   scripts/resize_screenshots.py exists for images that cannot be re-rendered
   and is the worse option whenever this script can do the job. */
const SIZES = {
  '6.9': { width: 440, height: 956 },   // 1320 x 2868
  '6.7': { width: 430, height: 932 },   // 1290 x 2796
  '6.5': { width: 414, height: 896 },   // 1242 x 2688
  '5.5': { width: 414, height: 736 }    // 1242 x 2208
};
const SCALE = 3;

/* --size 6.5, and --out to keep a second set away from the first. The
   default is the required size written into the default directory, so the
   documented one-liner in SUBMISSION_KIT section 4 keeps working untouched. */
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SIZE = arg('size', '6.9');
if (!SIZES[SIZE]) {
  console.error(`Unknown size ${SIZE}. One of: ${Object.keys(SIZES).join(', ')}`);
  process.exit(1);
}
const VIEWPORT = SIZES[SIZE];
const OUT = path.resolve(path.dirname(__dirname),
  arg('out', SIZE === '6.9' ? 'screenshots' : `screenshots/${SIZE}`));

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
        if (el) HC_SCROLL_UNDER_HEADER(el);
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

    // Land somewhere cheap, seed, then go to the real route so the seeded
    // profile is already in place when the screen first paints.
    await page.goto(`${BASE}/?v=home`, { waitUntil: 'networkidle' });
    await pastTheGate(page);
    await page.evaluate(SEED);

    const route = await page.evaluate(shot.route);
    await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });

    // AND AGAIN, BECAUSE THAT SECOND GOTO IS ANOTHER COLD LAUNCH. Continuing
    // as guest gets past the gate for one launch and deliberately not for
    // good, as js/gate.js says, so a reload puts it straight back up. Without
    // this the shot below is a picture of the login screen with the real one
    // behind it, which is exactly what this script quietly produced for every
    // one of the six once js/config.js got real Supabase values: the gate
    // draws at z-index 95, over everything, and nothing here failed.
    await pastTheGate(page);

    await page.evaluate(() => document.fonts.ready);

    /* scrollIntoView({ block: 'start' }) puts the element's top at the
       viewport's top, and .hc-topbar is fixed over exactly that, so the
       heading it was called on ends up behind the header. It survived at 440
       wide by luck of where the sections fell; at 414 it clipped "Discussion
       Questions" in half. Offset by the header the CSS already measures. */
    await page.evaluate(() => {
      window.HC_SCROLL_UNDER_HEADER = function (el) {
        const cs = getComputedStyle(document.documentElement);
        const header = parseFloat(cs.getPropertyValue('--hc-header-h')) || 0;
        const pin = parseFloat(cs.getPropertyValue('--hc-pin-h')) || 0;
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top - header - pin - 16, behavior: 'instant' });
      };
    });

    await page.waitForTimeout(700);

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
    'App Store screenshot captions, in order.\n' +
    'Paste these as the text overlay or as the localized captions.\n\n' +
    captions.join('\n\n') + '\n');

  console.log(`\n${SHOTS.length} screenshots at the ${SIZE} inch size in ` +
    `${path.relative(path.dirname(__dirname), OUT)}/, captions in CAPTIONS.txt`);
}

main();
