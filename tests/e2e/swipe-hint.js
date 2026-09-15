/* ===========================================================================
   The swipe hint, in the app.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. tests/swipe-hint.test.js already
   covers hintPolicy(), which is every rule about *whether* the screen may
   lean. It will keep passing whatever the drawing does with that answer. What
   is left is the half that only exists with a real #hc-view under it: that the
   lean actually writes a transform, that it puts it back, that the will-change
   it turns on is turned off again, and that a drag retires it.

   AND ONE THING THAT IS NOT ABOUT THIS HINT AT ALL. js/index-rail.js owns the
   clock both hints share, and it used to clear that interval the moment the
   rail was used. If that ever comes back, this hint goes silent on any phone
   whose owner touches the notches first, and nothing anywhere would say so:
   the symptom is a hint that simply never appears, which HINTS.md §12 spends a
   page explaining is indistinguishable from four other faults. hint() and
   hintLive() are the contract beat() leans on, so they are checked here by
   name.

   WHAT IS NOT CHECKED, AND CANNOT BE. Whether it stutters, and whether 22px
   reads as an offer or as a fault on a real phone in the sun. HINTS.md §12 is
   the whole argument for why a green browser test is not that answer.

     node tests/e2e/swipe-hint.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_SWIPE_HINT_PORT || 8241);

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

/* One finger across the screen, the same hand-made events tests/e2e/swipe.js
   uses and for the same reason: Playwright's touchscreen can tap and nothing
   else, and everything this file cares about happens between the down and the
   up. */
const DRAG = `(function (fromX, toX) {
  var scroller = document.querySelector('.hc-scroll');
  var y = 400;
  function fire(type, x) {
    var t = new Touch({ identifier: 1, target: scroller, clientX: x, clientY: y });
    var live = type === 'touchend' ? [] : [t];
    scroller.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: live, targetTouches: live, changedTouches: [t]
    }));
  }
  fire('touchstart', fromX);
  for (var i = 1; i <= 12; i++) fire('touchmove', fromX + (toX - fromX) * (i / 12));
  fire('touchend', toX);
})`;

const mountX = () => {
  const el = document.getElementById('hc-view');
  const m = /translate3d\((-?[\d.]+)px/.exec(el.style.transform || '');
  return m ? parseFloat(m[1]) : 0;
};

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
    // No Supabase is reachable from here, so the content fetch fails and says
    // so. That is the app working as designed and not what this watches for.
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(text)) {
      noise.push('console: ' + text);
    }
  });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await pastTheGate(page);
  // Long enough for the greeting's own scroll to settle: the hint refuses over
  // a page that is still moving, which is a rule and not a flake.
  await page.waitForTimeout(900);

  /* ------------------------------------------------ the contract the rail uses */

  const api = await page.evaluate(() => ({
    hint: typeof window.HC.swipe.hint,
    live: typeof window.HC.swipe.hintLive,
    end: typeof window.HC.swipe.endHint
  }));
  ok('js/index-rail.js can ask for a turn', api.hint === 'function', JSON.stringify(api));
  ok('and can ask whether one is worth giving', api.live === 'function');
  ok('and the switch in Your account can put it away', api.end === 'function');

  /* ------------------------------------------------------------- it leans */

  const ran = await page.evaluate(() => window.HC.swipe.hint());
  ok('it runs on Home', ran === true);

  await page.waitForTimeout(180);
  const leaning = await page.evaluate(mountX);
  ok('the screen is leaning left, toward the next tab',
     leaning < -3 && leaning >= -22, 'at ' + leaning + 'px');

  const willChange = await page.evaluate(() =>
    document.getElementById('hc-view').classList.contains('hc-view-dragging'));
  ok('the layer is promoted while it moves', willChange === true);

  /* One lean, one return, a beat, a smaller lean, a smaller return, so the
     whole thing is 260 + 340 + 120 + 260 + 340. */
  await page.waitForTimeout(1500);

  const rest = await page.evaluate(() => ({
    x: document.getElementById('hc-view').style.transform,
    promoted: document.getElementById('hc-view').classList.contains('hc-view-dragging')
  }));
  ok('it puts the screen back exactly where it was', rest.x === '', 'left "' + rest.x + '"');
  /* A permanent will-change on the one element every screen mounts into keeps
     a compositor layer alive for the life of the app, to serve a movement
     lasting a second and a bit. */
  ok('and takes the promotion away again', rest.promoted === false);

  /* ------------------------------------------- the last stop leans the other way

     Asked of the real router rather than a list written out here, because the
     row is not a fixed length: an admin has one more stop than everybody else,
     and the modules behind ••• are handed to js/router.js by js/app.js. A test
     that hard-coded the last name would go green on the wrong screen the first
     time somebody adds a module. */

  const last = await page.evaluate(() => window.HC.router.lane().slice(-1)[0]);
  await page.evaluate(n => window.HC.router.go({ name: n }), last);
  await page.waitForTimeout(700);

  const atLast = await page.evaluate(() => window.HC.router.current().name);
  const leanedBack = await page.evaluate(() => window.HC.swipe.hint());
  await page.waitForTimeout(180);
  const rightward = await page.evaluate(mountX);
  /* There is nothing further left of the end of the line, so leaning that way
     would be miming a gesture that does nothing. It leans the other way
     instead, toward the stop it came from. */
  ok('it still runs on the last stop in the row', leanedBack === true, 'on ' + atLast);
  ok('and leans right, because left is the end of the line',
     rightward > 3 && rightward <= 22, 'at ' + rightward + 'px');

  await page.evaluate(() => window.HC.swipe.endHint(false));
  await page.waitForTimeout(1600);

  /* ------------------------------------------------------- retire on use */

  await page.evaluate(() => window.HC.router.go({ name: 'home' }));
  await page.waitForTimeout(700);

  const before = await page.evaluate(() => window.HC.swipe.hintLive());
  ok('before anybody swipes, it still has something to say', before === true);

  const next = await page.evaluate(() => window.HC.router.lane()[1]);
  await page.evaluate(DRAG + '(330, 60)');
  await page.waitForTimeout(700);

  const after = await page.evaluate(() => ({
    live: window.HC.swipe.hintLive(),
    ran: window.HC.swipe.hint(),
    where: window.HC.router.current().name
  }));
  ok('a real drag lands on the next stop in the row',
     after.where === next, 'wanted ' + next + ', landed on ' + after.where);
  /* Whether or not the drag commits. Somebody who has dragged the screen
     sideways knows the screens move sideways. */
  ok('and retires the hint for the launch', after.live === false);
  ok('which is a refusal, not a silent no-op', after.ran === false);

  /* -------------------------------------------------------- nothing threw */

  ok('no errors on the console', noise.length === 0, noise.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
