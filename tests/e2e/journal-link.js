/* ===========================================================================
   The journal pill, both ways round.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. The pill is shell chrome that
   reads the current route and repaints itself, and the half of it that can
   actually break is not the markup: it is that the thing appears on exactly
   two screens, carries the right guide on the address, and disappears from
   everywhere else. That is a router, a screen and a fixed element agreeing
   with each other, and none of the three can be asked on its own.

   THE ONE IT EXISTS TO CATCH. The Journal reached from ••• and the Journal
   reached from a guide are the same route with and without an id. If the
   screen ever stops reading its scope off that id, the failure is silent and
   nasty: somebody taps My journal from Sunday's guide, lands on the whole
   journal, and the pill offers to take them "back" to a guide they are no
   longer looking at anything from. So every check below asks the address and
   the screen the same question.

   And the geometry, which is the other silent one: the pill sits in the same
   44px band as the two discs and as Note this / Highlight, so it is measured
   here against all three rather than eyeballed once.

   No database. This drives the app against its own bundled seed, the same as
   swipe.js beside it, with the journal entries written straight into the
   local store the way answering a take home question would.

     node tests/e2e/journal-link.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_JLINK_PORT || 8237);

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

const settled = page => page.waitForTimeout(360);

/* What the pill is, as one object, asked of the real element. */
const READ = `(function () {
  var el = document.getElementById('hc-jlink');
  if (!el) return { there: false };
  var box = el.getBoundingClientRect();
  var text = (el.textContent || '').trim();
  var arrow = el.querySelector('.hc-jlink__icon path');
  return {
    there: true,
    up: el.getAttribute('data-show') === 'true',
    hidden: el.getAttribute('aria-hidden') === 'true',
    tabbable: el.tabIndex === 0,
    text: text,
    action: el.getAttribute('data-action') || '',
    guide: el.getAttribute('data-id') || '',
    height: Math.round(box.height),
    left: Math.round(box.left),
    right: Math.round(box.right),
    // Which way the arrow points, off the shaft the icon actually drew.
    shaft: arrow ? arrow.getAttribute('d') : '',
    // Where the arrow sits in the reading order, which flips with it.
    arrowFirst: !!(el.firstElementChild && el.firstElementChild.classList.contains('hc-jlink__icon'))
  };
})()`;

const DISCS = `(function () {
  var back = document.getElementById('hc-back').getBoundingClientRect();
  var top = document.getElementById('hc-totop').getBoundingClientRect();
  return { backRight: Math.round(back.right), topLeft: Math.round(top.left) };
})()`;

(async () => {
  const exe = chrome();
  if (!exe) {
    console.log('SKIP  no chromium on this machine, so the pill cannot be driven');
    process.exit(0);
  }

  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({
    viewport: { width: 390, height: 780 },
    hasTouch: true, isMobile: true, deviceScaleFactor: 2
  });

  try {
    await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
    await pastTheGate(page);
    await page.waitForFunction(() => window.HC && window.HC.router && window.HC.data);

    /* A guide with something written about it, and a second one with nothing,
       because the empty case is the common one on a Sunday afternoon and it
       is the one that has a sentence of its own. */
    const guides = await page.evaluate(`(function () {
      var list = HC.data.guidesByDate();
      var g = list[0], other = list[1];
      HC.journal.setReflection(g.id, '0', 'Work, mostly. I have never asked for help there.',
        'What is your Lo-debar?');
      return { written: g.id, blank: other.id };
    })()`);

    /* ---------------------------------------------------- 1. in a guide */

    await page.evaluate(`HC.router.go({ name: 'guide-reader', id: ${JSON.stringify(guides.written)} })`);
    await settled(page);

    let pill = await page.evaluate(READ);
    const discs = await page.evaluate(DISCS);

    ok('the pill is up in a guide, without scrolling for it', pill.up && !pill.hidden && pill.tabbable,
      JSON.stringify(pill));
    ok('it says My journal', /^my journal$/i.test(pill.text), pill.text);
    ok('the arrow points the way it is going', pill.shaft === 'M5 12h14' && !pill.arrowFirst,
      pill.shaft + ' arrowFirst=' + pill.arrowFirst);
    ok('the target is a full 44px, whatever the pill is painted at', pill.height === 44,
      pill.height + 'px');
    ok('it is clear of both discs', pill.left > discs.backRight && pill.right < discs.topLeft,
      'back ends ' + discs.backRight + ', pill ' + pill.left + '-' + pill.right + ', top starts ' + discs.topLeft);
    ok('it carries the guide it was drawn in', pill.guide === guides.written, pill.guide);

    /* ------------------------------------------- 2. it stands down for the
       highlight bar, which lands in exactly this band and asks a question
       that cannot wait behind a link. */

    await page.evaluate(`document.getElementById('app').setAttribute('data-hlbar', 'true')`);
    await settled(page);
    ok('it gets out of the way of Note this / Highlight',
      await page.evaluate(`getComputedStyle(document.getElementById('hc-jlink')).opacity === '0'`));
    await page.evaluate(`document.getElementById('app').removeAttribute('data-hlbar')`);
    await settled(page);

    /* ----------------------------------------------- 3. the tap, and where
       it lands: the address, the scope, and the entries on the glass. */

    await page.click('#hc-jlink');
    await settled(page);

    const landed = await page.evaluate(`(function () {
      var route = HC.router.current();
      var pills = Array.prototype.map.call(
        document.querySelectorAll('[data-action="journal-filter"]'),
        function (b) { return b.textContent.trim() + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''); }
      );
      return {
        name: route.name,
        id: route.id || '',
        url: location.search,
        pills: pills,
        cards: document.querySelectorAll('[data-action="journal-open"]').length,
        heading: (document.querySelector('.hc-journal .hc-section-header__title')
          || { textContent: '' }).textContent.trim()
      };
    })()`);

    ok('it lands on the journal, at that guide', landed.name === 'journal' && landed.id === guides.written,
      JSON.stringify(landed));
    ok('the address says so too, so a reload lands in the same place',
      landed.url.indexOf('v=journal') > -1 && landed.url.indexOf('id=' + guides.written) > -1, landed.url);
    ok('This guide leads the filters and is the one selected',
      landed.pills[0] === 'This guide*', JSON.stringify(landed.pills));
    ok('and what is on the glass is that guide only', landed.cards === 1, landed.cards + ' cards');

    /* --------------------------------------------- 4. and back the other way */

    pill = await page.evaluate(READ);
    ok('the pill turns round', /^back to guide$/i.test(pill.text) && pill.action === 'journal-guide', pill.text);
    ok('so does its arrow, and it leads now', pill.shaft === 'M19 12H5' && pill.arrowFirst,
      pill.shaft + ' arrowFirst=' + pill.arrowFirst);

    await page.click('#hc-jlink');
    await settled(page);
    const back = await page.evaluate(`(function () {
      var r = HC.router.current();
      return { name: r.name, id: r.id || '' };
    })()`);
    ok('it goes back to the guide it came from',
      back.name === 'guide-reader' && back.id === guides.written, JSON.stringify(back));

    /* ------------------------------------ 5. the Journal reached any other
       way, which is the whole of "only once you have navigated there from a
       guide". */

    await page.evaluate(`HC.router.go({ name: 'journal' })`);
    await settled(page);

    const plain = await page.evaluate(`(function () {
      var el = document.getElementById('hc-jlink');
      var pills = Array.prototype.map.call(
        document.querySelectorAll('[data-action="journal-filter"]'),
        function (b) { return b.textContent.trim(); }
      );
      return {
        up: el.getAttribute('data-show') === 'true',
        tabbable: el.tabIndex === 0,
        pills: pills,
        cards: document.querySelectorAll('[data-action="journal-open"]').length
      };
    })()`);

    ok('no pill on the Journal opened from anywhere else', !plain.up && !plain.tabbable,
      JSON.stringify(plain));
    ok('and no This guide filter either, since there is no guide to mean',
      plain.pills.indexOf('This guide') === -1, JSON.stringify(plain.pills));
    ok('the whole journal is on the glass', plain.cards >= 1, plain.cards + ' cards');

    /* --------------------------------- 6. a guide nobody has written in yet */

    await page.evaluate(`HC.router.go({ name: 'journal', id: ${JSON.stringify(guides.blank)} })`);
    await settled(page);
    const blank = await page.evaluate(`(function () {
      var empty = document.querySelector('.hc-journal .hc-empty, .hc-journal .hc-empty-state');
      return {
        up: document.getElementById('hc-jlink').getAttribute('data-show') === 'true',
        cards: document.querySelectorAll('[data-action="journal-open"]').length,
        says: (empty ? empty.textContent : document.querySelector('.hc-journal').textContent).trim()
      };
    })()`);
    ok('a guide with nothing written about it still gets the way back', blank.up);
    ok('it says so in its own words rather than reporting a search',
      /nothing from this guide yet/i.test(blank.says) && blank.cards === 0,
      blank.says.slice(0, 120));

    /* --------------------------------------------- 7. everywhere else, gone */

    const elsewhere = [];
    for (const name of ['home', 'guide', 'listen', 'connect']) {
      await page.evaluate(`HC.router.go({ name: ${JSON.stringify(name)} })`);
      await settled(page);
      const up = await page.evaluate(`document.getElementById('hc-jlink').getAttribute('data-show') === 'true'`);
      if (up) elsewhere.push(name);
    }
    ok('it is on two screens and nowhere else', elsewhere.length === 0, 'also up on ' + elsewhere.join(', '));

    // Presentation mode is chromeless, and the pill is chrome.
    await page.evaluate(`HC.router.go({ name: 'present', id: ${JSON.stringify(guides.written)}, index: 0 })`);
    await settled(page);
    ok('and it leaves with the rest of the chrome in presentation mode',
      await page.evaluate(`document.getElementById('hc-jlink').getAttribute('data-show') !== 'true'`));

  } catch (err) {
    ok('the run finished', false, err && err.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
