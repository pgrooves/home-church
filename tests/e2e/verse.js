/* ===========================================================================
   The verse sheet, in a real browser.

   WHY THIS IS A BROWSER AND NOT ONLY tests/verse.test.js. That file proves
   the reader, the cache and the words. What it cannot prove is the part that
   used to be a web page: that a tap on a scripture row, or on a scripture
   link inside words somebody wrote, lands in the sheet and NOT in the phone's
   browser. That is the delegated click handler in js/app.js, the sheet, and
   the Edge Function's answer agreeing with each other.

   The function is answered here by page.route(), so nothing reaches Supabase
   or YouVersion. window.open is replaced with a recorder, so "it left the
   app" is something this can see.

     node tests/e2e/verse.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_VERSE_PORT || 8241);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

function chrome() {
  if (process.env.HC_E2E_CHROME) return process.env.HC_E2E_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort();
    for (let i = dirs.length - 1; i >= 0; i--) {
      const exe = path.join(root, dirs[i], 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
    return null;
  } catch (e) { return null; }
}

let pass = 0, fail = 0;
const ok = (label, good, detail) => {
  if (good) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + (detail ? '\n        ' + detail : '')); fail++; }
};

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

const SHEET = `(function () {
  var el = document.querySelector('[data-sheet="verse"]');
  if (!el) return null;
  return {
    text: el.innerText,
    chapter: (el.querySelector('[data-action="open-url"]') || {}).getAttribute
      ? el.querySelector('[data-action="open-url"]').getAttribute('data-url') : ''
  };
})()`;

(async () => {
  const exe = chrome();
  if (!exe) {
    console.log('SKIP  no chromium on this machine, so the sheet cannot be driven');
    process.exit(0);
  }

  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({
    viewport: { width: 390, height: 780 },
    hasTouch: true, isMobile: true, deviceScaleFactor: 2
  });

  const asked = [];
  await page.route('**/functions/v1/bible-passage**', route => {
    const ref = new URL(route.request().url()).searchParams.get('ref');
    asked.push(ref);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        id: ref,
        reference: ref,
        text: 'Words for ' + ref,
        version: { id: 111, abbreviation: 'NIV', copyright: 'NIV® Copyright © 2011 by Biblica, Inc.®' }
      })
    });
  });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  try {
    await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
    await pastTheGate(page);
    await page.waitForFunction(() => window.HC && window.HC.router && window.HC.data && window.HC.verse);

    // Anything that tries to leave the app, written down instead.
    await page.evaluate(`(function () {
      window.__left = [];
      window.open = function (url) { window.__left.push(url); return null; };
    })()`);

    /* ------------------------------------------- 1. a scripture row */

    const guide = await page.evaluate(`(function () {
      var list = HC.data.guidesByDate();
      for (var i = 0; i < list.length; i++) {
        if (list[i].scriptures && list[i].scriptures.length) return list[i].id;
      }
    })()`);
    await page.evaluate(`HC.router.go({ name: 'guide-reader', id: ${JSON.stringify(guide)} })`);
    await page.waitForTimeout(400);

    // The scripture rows live in a section that starts folded. Open it the
    // way a person would, by its header.
    const fold = page.locator('[data-section="scripture"] [data-action="toggle-section"]');
    if (await fold.count() && (await fold.first().getAttribute('aria-expanded')) !== 'true') {
      await fold.first().scrollIntoViewIfNeeded();
      await fold.first().tap();
      await page.waitForTimeout(400);
    }

    const row = page.locator('[data-action="open-scripture"]').first();
    const reference = await row.getAttribute('data-reference');
    const want = await page.evaluate(`HC.bible.usfm(HC.bible.parseAll(${JSON.stringify(reference)})[0])`);

    await row.scrollIntoViewIfNeeded();
    await row.tap();
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    let sheet = await page.evaluate(SHEET);

    ok('tapping a scripture row opens the sheet, not a web page',
      sheet && (await page.evaluate('window.__left.length')) === 0, JSON.stringify(sheet));
    ok('it asked for the passage the row names', asked[0] === want, asked[0] + ' vs ' + want);
    ok('the words are there', sheet && sheet.text.indexOf('Words for ' + want) !== -1, sheet && sheet.text);
    ok('under the reference as the guide wrote it',
      sheet && sheet.text.indexOf(await page.evaluate(
        `HC.bible.label(HC.bible.parseAll(${JSON.stringify(reference)})[0])`)) !== -1);
    ok('with the copyright', sheet && /Biblica/.test(sheet.text));
    ok('and the chapter on bible.com a tap away',
      sheet && /^https:\/\/www\.bible\.com\/bible\/111\/[1-3A-Z]{3}\.\d+\.NIV$/.test(sheet.chapter), sheet && sheet.chapter);

    await page.locator('[data-sheet="verse"] .hc-sheet__close').tap();
    ok('the close button takes it down', (await page.evaluate(SHEET)) === null);

    await row.tap();
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    ok('the second time it comes from the phone', asked.length === 1, asked.join(', '));

    await page.keyboard.press('Escape');
    ok('and Escape takes it down too', (await page.evaluate(SHEET)) === null);

    /* ------------------------- 2. a scripture link in somebody's words */

    /* A link the old scripture button wrote, Bible Gateway and all, dropped
       into the screen the way an announcement's words are. It must open the
       sheet off its words, not the web page off its href. */
    await page.evaluate(`(function () {
      var p = document.createElement('p');
      p.id = 'verse-probe';
      p.innerHTML = 'read <a href="https://www.biblegateway.com/passage/?search=Jude+4&version=ESV">Jude 4</a>' +
        ' and <a href="https://example.com/">this</a>';
      document.querySelector('.hc-screen').prepend(p);
    })()`);

    await page.locator('#verse-probe a').first().tap();
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    sheet = await page.evaluate(SHEET);
    ok('an old Bible Gateway link opens the sheet', sheet && /Jude 4/.test(sheet.text), sheet && sheet.text);
    ok('for the passage in its words', asked[asked.length - 1] === 'JUD.1.4', asked.join(', '));
    ok('and nothing left the app', (await page.evaluate('window.__left.length')) === 0);

    await page.keyboard.press('Escape');
    await page.locator('#verse-probe a').nth(1).tap();
    ok('an ordinary link still goes where it always went',
      (await page.evaluate('window.__left')).join() === 'https://example.com/',
      (await page.evaluate('window.__left')).join());

    /* ------------------------------------------------ 3. leaving */

    await page.evaluate('window.__left = []');
    await page.evaluate(`HC.verse.open('Romans 8:28')`);
    await page.waitForSelector('[data-sheet="verse"]');
    await page.evaluate(`HC.router.go({ name: 'home' })`);
    await page.waitForTimeout(300);
    ok('going to another screen takes the sheet with it', (await page.evaluate(SHEET)) === null);

    ok('and nothing threw along the way', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + pass + ' passed' + (fail ? ', ' + fail + ' failed.' : '.'));
  process.exit(fail ? 1 : 0);
})();
