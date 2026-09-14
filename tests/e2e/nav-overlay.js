/* ===========================================================================
   The navigation overlay, and the screen underneath it.

   WHY THIS IS A BROWSER AND NOTHING ELSE WOULD DO. The bug this file exists
   for shipped with a full unit suite passing and a set of screenshots that
   looked correct, because it was invisible in both. The overlay closed by
   going to opacity 0, which paints nothing and still takes every touch that
   lands on it; the links inside set pointer-events:auto so they could be
   tapped while it was up, and a child can turn that back on whatever its
   parent said. So on any phone that had opened the navigation once, eleven
   invisible link boxes and one invisible scroll container lay across the
   middle of every screen in the app. Dragging on one scrolled a container
   with nothing in it rather than the page. Tapping one navigated.

   Nothing you can ask the DOM about state catches that, and nothing you can
   see in a screenshot shows it. What catches it is asking the browser the one
   question a thumb asks: at this point on the glass, what would I hit.
   document.elementFromPoint is that question, and this file is a column of
   them down the middle of the screen.

   THE RULE IT PINS. A closed navigation is not in the way. Not dimmed, not
   transparent, not unreachable by keyboard only: not hit-testable at all.
   Whatever css/components.css uses to achieve that, visibility today, this
   asks about the outcome rather than the mechanism.

   No database. Drives the app against its own bundled seed, the same terms as
   swipe.js and alpha.js beside it.

     node tests/e2e/nav-overlay.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_NAV_PORT || 8241);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

/* Same resolver as the tests beside this, for the same reason: playwright-core
   ships no browser of its own. */
function chrome() {
  if (process.env.HC_E2E_CHROME) return process.env.HC_E2E_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium/.test(d)).sort();
    for (let i = dirs.length - 1; i >= 0; i--) {
      for (const rel of [['chrome-linux', 'chrome'], ['chrome-linux', 'headless_shell']]) {
        const exe = path.join(root, dirs[i], ...rel);
        if (fs.existsSync(exe)) return exe;
      }
    }
    return null;
  } catch (e) { return null; }
}

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not here'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

let pass = 0, fail = 0;
const ok = (label, good, detail) => {
  if (good) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + (detail ? '\n        ' + detail : '')); fail++; }
};

/* A column of points down the middle of the screen, and what each one would
   hit. The top and bottom groups sit at the two ends, so a column catches
   both; the middle is where the page's own content should be answering. */
const COLUMN = `(function () {
  var hits = [];
  for (var y = 120; y <= 800; y += 40) {
    var el = document.elementFromPoint(195, y);
    hits.push({ y: y, cls: el ? String(el.className || el.tagName) : 'null' });
  }
  return hits;
})()`;

const overlayHits = hits => hits.filter(h => /hc-navmenu/.test(h.cls));

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

  const noise = [];
  page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
  page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(text)) {
      noise.push('console: ' + text);
    }
  });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await pastTheGate(page);
  await page.waitForTimeout(800);

  /* ------------------------------------------- before it has ever been opened */

  let hits = await page.evaluate(COLUMN);
  ok('a phone that has never opened the navigation has nothing in the way',
    overlayHits(hits).length === 0,
    JSON.stringify(overlayHits(hits)));

  /* ------------------------------------------------------- opened, it is there */

  await page.click('#hc-navfab');
  await page.waitForTimeout(600);

  hits = await page.evaluate(COLUMN);
  ok('opened, the overlay is what a thumb hits',
    overlayHits(hits).length > 6, JSON.stringify(hits.map(h => h.cls)));

  /* ------------------------------------------- closed again, it is gone for good

     THE ONE THAT MATTERS. paintMenu() leaves the links in the document when it
     closes, on purpose, so the next open is instant. They have to be
     unreachable rather than absent, and this is what says so. */

  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);

  ok('the links are still in the document, so the next open is instant',
    (await page.evaluate(() => document.querySelectorAll('.hc-navmenu__link').length)) > 0);

  hits = await page.evaluate(COLUMN);
  ok('and closed, not one point on the screen hits the overlay',
    overlayHits(hits).length === 0,
    'still in the way at: ' + JSON.stringify(overlayHits(hits)));

  ok('the screen underneath answers for every point instead',
    hits.filter(h => h.cls === 'null').length === 0,
    JSON.stringify(hits.filter(h => h.cls === 'null')));

  /* A closed navigation is not read out either. visibility takes the subtree
     out of the accessibility tree, which is the same rule said the other way. */
  ok('and a screen reader is not offered it either',
    (await page.evaluate(() =>
      getComputedStyle(document.querySelector('.hc-navmenu')).visibility)) === 'hidden');

  /* ------------------------------------------------ and it still opens after that */

  await page.click('#hc-navfab');
  await page.waitForTimeout(600);
  hits = await page.evaluate(COLUMN);
  ok('it opens again after being closed', overlayHits(hits).length > 6);

  const went = await page.evaluate(() => {
    var links = document.querySelectorAll('.hc-navmenu__group--tabs .hc-navmenu__link');
    links[links.length - 1].click();          // Home, the line nearest the button
    return true;
  });
  await page.waitForTimeout(800);
  ok('and a link in it still navigates and closes',
    went && (await page.evaluate(() => window.HC.router.current().name)) === 'home' &&
    (await page.evaluate(() => document.getElementById('app').getAttribute('data-navmenu'))) === 'closed');

  /* -------------------------------------------- the other navigation, same rule */

  await page.evaluate(() => window.HC.store.updateProfile({ navStyle: 'bar' }));
  await page.waitForTimeout(500);
  hits = await page.evaluate(COLUMN);
  ok('on a phone set to the tab bar the overlay is not in the way either',
    overlayHits(hits).length === 0, JSON.stringify(overlayHits(hits)));
  ok('and neither is the sheet the tab bar lifts',
    hits.filter(h => /hc-oversheet/.test(h.cls)).length === 0,
    JSON.stringify(hits.filter(h => /hc-oversheet/.test(h.cls))));

  ok('nothing threw along the way', noise.length === 0, noise.join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})();
