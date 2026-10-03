/* ===========================================================================
   Happy Lion Cafe, mockups. Not wired into the app yet: mockup.src.html draws
   the seven screens with the app's real stylesheets and the cafe logo, and
   this writes one PNG per screen.

     node demo-happy-lion-cafe/render.js [out-dir]   # default: demo-happy-lion-cafe/out
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
const NAMES = ['1-menu', '2-customize', '3-checkout', '4-order-status',
  '5-barista-queue', '6-admin-settings', '7-menu-dark'];

function chrome() {
  if (process.env.HC_E2E_CHROME) return process.env.HC_E2E_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const dirs = fs.readdirSync(root).filter(d => /^chromium-/.test(d)).sort().reverse();
  for (const d of dirs) {
    const exe = path.join(root, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: chrome() });
  const page = await browser.newPage({ viewport: { width: 3200, height: 2300 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(__dirname, 'mockup.src.html'));
  await page.waitForTimeout(600);
  for (let i = 0; i < NAMES.length; i++) {
    await page.locator('#s' + (i + 1)).screenshot({ path: path.join(OUT, NAMES[i] + '.png') });
  }
  await browser.close();
  console.log('wrote ' + NAMES.length + ' images to ' + OUT);
})();
