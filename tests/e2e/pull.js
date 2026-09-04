/* ===========================================================================
   Pull to sync, in a browser.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. tests/pull.test.js already asks
   js/pull.js the two questions that are arithmetic: whose finger is this, and
   where does the disc sit for one that has come down this far. Everything
   else in that file is a finger, and a finger is what this has.

   WHAT IT IS ACTUALLY WATCHING FOR. Four things, and every one of them is a
   way for this feature to be quietly wrong rather than visibly broken:

     1. A short pull is not a sync. Let go before the mark and the app must do
        nothing at all, or every scroll that starts at the top of a screen
        costs somebody a round trip on church wifi.
     2. A full pull is a sync, and the disc says so while it is out and stops
        saying so afterwards. A disc that never comes down is a feature nobody
        finds; one that never goes back up is an app that looks stuck.
     3. It works on a screen that is not Home. "Through all pages" is the
        whole ask, and the failure mode is a gesture wired to one screen's
        markup.
     4. It is not the tab swipe and it is not a scroll. A sideways drag has to
        reach js/swipe.js untouched, and a pull that starts halfway down a
        page has to stay an ordinary scroll.
     5. It is the only way to ask. No button anywhere does this too, and
        js/pull.js hands out nothing that could start a sync without a finger.
        A second control for the same work is the thing this checks for,
        because it is the kind of thing that gets added back kindly.

   No database, and no Supabase: the fetches are counted rather than made, so
   what this asks about is the gesture and the disc, not the network. See
   COUNT below for how, and note that it replaces js/content.js's refresh
   after boot rather than before, so the app still starts the way it starts.

     node tests/e2e/pull.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_PULL_PORT || 8236);

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

/* One finger, in a dozen steps. Playwright's touchscreen can tap and nothing
   else, and js/pull.js is entirely about what happens between the down and
   the up, so the events are made by hand, the same way tests/e2e/swipe.js
   makes them.

   Twelve steps rather than two because the axis lock needs a move it can call
   vertical before it will take the gesture. Dispatched on the scroller, which
   is the element the listeners are on. */
const DRAG = `(function (fromX, fromY, toX, toY) {
  var scroller = document.querySelector('.hc-scroll');
  function fire(type, x, y) {
    var t = new Touch({ identifier: 1, target: scroller, clientX: x, clientY: y });
    var live = type === 'touchend' ? [] : [t];
    scroller.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: live, targetTouches: live, changedTouches: [t]
    }));
  }
  fire('touchstart', fromX, fromY);
  for (var i = 1; i <= 12; i++) {
    fire('touchmove', fromX + (toX - fromX) * (i / 12), fromY + (toY - fromY) * (i / 12));
  }
  fire('touchend', toX, toY);
})`;

/* RESIST is a half, so the thumb travels twice the disc. 260 points down is
   the disc well past the 64 point mark; 40 is nowhere near it. Started at
   x=195, which is the middle of a 390pt phone: clear of the left eighteen
   points, which are the platform's back gesture, and clear of the right band,
   which is the index rail's. */
const FULL = '(195, 120, 195, 380)';
const SHORT = '(195, 120, 195, 160)';
const SIDEWAYS = '(330, 120, 60, 130)';

/* The fetches, counted rather than made. Everything js/pull.js asks for is
   replaced with a promise that resolves next tick, so what is left being
   tested is the disc, the thresholds, and the screens the gesture reaches. */
const COUNT = `(function () {
  window.__hc = { content: 0, rooms: 0, journal: 0 };
  window.HC.content.refresh = function () {
    window.__hc.content++;
    return Promise.resolve(false);
  };
  window.HC.rooms.refresh = function () {
    window.__hc.rooms++;
    return Promise.resolve(null);
  };
  window.HC.journal.sync = function () {
    window.__hc.journal++;
    return Promise.resolve(false);
  };
})()`;

// What the disc is doing, right now.
const DISC = `(function () {
  var el = document.getElementById('hc-pull');
  var box = el.getBoundingClientRect();
  var disc = el.querySelector('.hc-pull__disc');
  return {
    state: el.getAttribute('data-state'),
    down: Math.round(new DOMMatrix(getComputedStyle(el).transform).m42),
    lit: Number(getComputedStyle(disc).opacity) > 0.5,
    top: Math.round(box.top),
    said: document.getElementById('hc-pull-live').textContent
  };
})()`;

const counts = page => page.evaluate('window.__hc');

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, hasTouch: true
  });

  const noise = [];
  page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
  page.on('console', m => {
    const text = m.text();
    // No Supabase is reachable from here, so the app's own boot fetch fails
    // and says so. That is the app working as designed.
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(text)) {
      noise.push('console: ' + text);
    }
  });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await pastTheGate(page);
  await page.waitForTimeout(600);
  await page.evaluate(COUNT);

  /* --------------------------------------------------------- at rest --- */

  const rest = await page.evaluate(DISC);
  ok('the disc starts up under the header, out of sight',
    rest.state === 'off' && rest.down === 0 && !rest.lit, JSON.stringify(rest));
  ok('and it sits under the top bar rather than over it',
    rest.top > 0 && rest.top < 120, JSON.stringify(rest));

  /* ------------------------------------------------- a pull that is not --- */

  await page.evaluate(DRAG + SHORT);
  await page.waitForTimeout(500);
  const short = await counts(page);
  ok('letting go before the mark syncs nothing',
    short.content === 0 && short.rooms === 0 && short.journal === 0,
    JSON.stringify(short));
  ok('and the disc goes back up',
    (await page.evaluate(DISC)).state === 'off');

  /* ---------------------------------------------------- somebody's thumb --- */

  // Caught mid gesture: down, lit, and past the mark, before the finger is up.
  const held = await page.evaluate(`(function () {
    var scroller = document.querySelector('.hc-scroll');
    function fire(type, y) {
      var t = new Touch({ identifier: 2, target: scroller, clientX: 195, clientY: y });
      var live = type === 'touchend' ? [] : [t];
      scroller.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: live, targetTouches: live, changedTouches: [t]
      }));
    }
    fire('touchstart', 120);
    for (var i = 1; i <= 12; i++) fire('touchmove', 120 + (260 * i / 12));
    var el = document.getElementById('hc-pull');
    var out = {
      state: el.getAttribute('data-state'),
      down: Math.round(new DOMMatrix(getComputedStyle(el).transform).m42),
      lit: Number(getComputedStyle(el.querySelector('.hc-pull__disc')).opacity) > 0.5
    };
    fire('touchend', 380);
    return out;
  })()`);

  ok('a thumb dragging down brings the disc out with it',
    held.down > 20 && held.lit, JSON.stringify(held));
  ok('and past the mark it says it is ready',
    held.state === 'ready', JSON.stringify(held));

  await page.waitForTimeout(1400);

  /* ------------------------------------------------------- the real thing --- */

  await page.evaluate('window.__hc = { content: 0, rooms: 0, journal: 0 }');
  await page.evaluate(DRAG + FULL);
  await page.waitForTimeout(120);

  const working = await page.evaluate(DISC);
  ok('a full pull leaves the disc out and turning',
    working.state === 'syncing' && working.down > 20 && working.lit,
    JSON.stringify(working));
  ok('and says as much to a screen reader',
    /Checking/.test(working.said), working.said);

  const asked = await counts(page);
  ok('the church content is fetched again', asked.content === 1, JSON.stringify(asked));
  ok('and the group room with it', asked.rooms === 1, JSON.stringify(asked));

  // FLOOR is 650ms, and the disc has to be gone a beat after that.
  await page.waitForTimeout(1200);
  const after = await page.evaluate(DISC);
  ok('and when it lands the disc goes back up under the header',
    after.state === 'off' && after.down === 0 && !after.lit, JSON.stringify(after));

  /* ------------------------------------- every screen, not just this one --- */

  await page.evaluate(() => window.HC.router.go({ name: 'connect' }));
  await page.waitForTimeout(500);
  await page.evaluate('window.__hc.content = 0');
  await page.evaluate(DRAG + FULL);
  await page.waitForTimeout(200);
  ok('the same pull works on another tab',
    (await counts(page)).content === 1);

  await page.waitForTimeout(1600);

  await page.evaluate(() => window.HC.router.go({ name: 'journal' }));
  await page.waitForTimeout(500);
  await page.evaluate('window.__hc.content = 0');
  await page.evaluate(DRAG + FULL);
  await page.waitForTimeout(200);
  ok('and on a module behind the overflow sheet',
    (await counts(page)).content === 1);

  await page.waitForTimeout(1600);

  /* ------------------------------------------------ what it keeps off of --- */

  await page.evaluate(() => window.HC.router.go({ name: 'home' }));
  await page.waitForTimeout(500);
  await page.evaluate('window.__hc.content = 0');
  await page.evaluate(DRAG + SIDEWAYS);
  await page.waitForTimeout(400);
  ok('a sideways drag is the tab swipe\'s and syncs nothing',
    (await counts(page)).content === 0);

  // Back to a screen that is not mid swipe, and scrolled off the top.
  await page.evaluate(() => window.HC.router.go({ name: 'home' }));
  await page.waitForTimeout(700);
  await page.evaluate(() => { document.querySelector('.hc-scroll').scrollTop = 400; });
  await page.evaluate('window.__hc.content = 0');
  await page.evaluate(DRAG + FULL);
  await page.waitForTimeout(400);
  const scrolled = await page.evaluate(DISC);
  ok('a pull halfway down a page is an ordinary scroll',
    (await counts(page)).content === 0 && scrolled.state === 'off',
    JSON.stringify(scrolled));

  /* --------------------------------------------------- and the only way ---
     One gesture syncs this app. There is no button anywhere that does the
     same work, and nothing in the app can start a sync without a finger on
     the glass, which is what the two checks below hold in place: the pair of
     them is what would fail the day somebody adds a second control for this
     rather than reaching for the one that exists. */

  await page.evaluate(() => { document.querySelector('.hc-scroll').scrollTop = 0; });
  await page.evaluate(() => window.HC.router.go({ name: 'profile' }));
  await page.waitForTimeout(600);

  ok('Your account still says where this phone\'s content came from',
    !!(await page.$('.hc-about__content')));

  const controls = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-action]'))
      .map(el => el.getAttribute('data-action'))
      .filter(a => /sync|refresh|update|reload|fetch/i.test(a)));
  ok('and offers no button that syncs instead of the pull',
    controls.length === 0, controls.join(', '));

  const surface = await page.evaluate(() =>
    Object.keys(window.HC.pull).filter(k => k[0] !== '_').sort().join(','));
  ok('and js/pull.js hands out no way in without one',
    surface === 'init,isSyncing', surface);

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
