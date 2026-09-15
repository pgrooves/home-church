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

  /* ------------------------------------------ the opening pair, on its own

     The rail's swell goes two seconds after the greeting lifts and the page
     leans three seconds behind it, so a first launch says both directions
     once. Nothing calls anything here: this waits for the app to do it.

     Worth a browser because the timer is in js/index-rail.js and the thing it
     fires is in js/swipe.js, and every other check in this file reaches past
     that seam by calling HC.swipe.hint() directly. A wiring mistake between
     the two would leave all of them green and the app silent for a minute. */

  /* The deepest point rather than the first frame: runHint() writes a zero
     transform before the first tick, to put the pane where it belongs, so
     "the transform appeared" and "the screen moved" are a few frames apart. */
  const opening = await page.evaluate(() => new Promise(resolve => {
    const view = document.getElementById('hc-view');
    const t0 = Date.now();
    let started = 0, deepest = 0;
    (function watch() {
      const m = /translate3d\((-?[\d.]+)px/.exec(view.style.transform || '');
      if (m) {
        if (!started) started = Date.now() - t0;
        deepest = Math.min(deepest, parseFloat(m[1]));
      }
      if (started && Date.now() - t0 - started > 400) {
        return resolve({ at: started, x: deepest });
      }
      if (Date.now() - t0 > 9000) return resolve({ at: -1, x: 0 });
      requestAnimationFrame(watch);
    })();
  }));

  ok('it leans on its own, without being asked',
     opening.at > 0, opening.at < 0 ? 'nothing in 9s' : 'at ' + opening.at + 'ms');
  /* Measured from just after the gate rather than from the splash lifting, so
     the window is generous at both ends; what it is really pinning is that the
     lean is a few seconds in rather than a minute in, which is what it was
     before the opening pair existed. */
  ok('a few seconds in, not a minute', opening.at > 1500 && opening.at < 8000,
     'at ' + opening.at + 'ms');
  ok('and it is the swipe hint that moved, at the swipe hint\'s depth',
     opening.x < -40 && opening.x >= -64.5, 'at ' + opening.x + 'px');

  await page.waitForTimeout(1800);

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

  /* The deepest point of the first lean, 300ms in. */
  await page.waitForTimeout(290);
  const deep = await page.evaluate(() => {
    const view = document.getElementById('hc-view');
    const pane = document.querySelector('.hc-swipe__pane');
    const m = /translate3d\((-?[\d.]+)px/.exec(view.style.transform || '');
    return {
      x: m ? parseFloat(m[1]) : 0,
      promoted: view.classList.contains('hc-view-dragging'),
      pane: !!pane,
      paneHasScreen: !!(pane && pane.firstChild && pane.firstChild.textContent.trim().length > 20),
      // How much of the next screen is actually uncovered, in px from the
      // right edge of the phone.
      showing: pane ? Math.round(window.innerWidth - pane.getBoundingClientRect().left) : 0
    };
  });

  ok('the screen leans left, toward the next tab', deep.x < -40, 'at ' + deep.x + 'px');
  /* The whole point of 64 over 22. Deeper than this reads as the app changing
     tabs and thinking better of it; shallower shows only the 20px page gutter,
     which is blank paper and says nothing. */
  ok('as deep as 64px and no deeper', deep.x >= -64.5 && deep.x <= -55,
     'at ' + deep.x + 'px');
  ok('the layer is promoted while it moves', deep.promoted === true);

  /* A rendered screen, not empty paper. This is the change the depth is for:
     a lean this deep over nothing would be the same empty gesture three times
     as loud. */
  ok('the next screen is really rendered behind it', deep.pane === true);
  ok('and it has actual content in it, not a blank pane', deep.paneHasScreen === true);
  /* 20px of that is the page gutter, so what is left is what somebody can
     read. A couple of dozen pixels is the first few characters of a heading. */
  ok('and enough of it is uncovered to show words past the 20px gutter',
     deep.showing > 40, deep.showing + 'px of it showing');

  /* One lean, one return, a beat, a smaller lean, a smaller return, so the
     whole thing is 300 + 380 + 120 + 300 + 380. */
  await page.waitForTimeout(1700);

  const rest = await page.evaluate(() => ({
    x: document.getElementById('hc-view').style.transform,
    promoted: document.getElementById('hc-view').classList.contains('hc-view-dragging'),
    pane: !!document.querySelector('.hc-swipe__pane'),
    deck: !!document.querySelector('.hc-swipe')
  }));
  ok('it puts the screen back exactly where it was', rest.x === '', 'left "' + rest.x + '"');
  /* A permanent will-change on the one element every screen mounts into keeps
     a compositor layer alive for the life of the app, to serve a movement
     lasting a second and a bit. */
  ok('and takes the promotion away again', rest.promoted === false);
  ok('and takes the rendered screen down with it', rest.pane === false);
  ok('and the layer it built to hold it', rest.deck === false);

  /* ------------------------------------------- a tap in the middle of a lean

     The lean hands its offset and its pane to whatever touches the screen, on
     the assumption that the touch is about to become a drag. When it turns out
     to be a tap, or a scroll, nothing is left running to put either back, and
     without dropGesture() the screen simply stays parked 64px over with a
     rendered copy of the next tab showing beside it. Found by reading the
     hand-over rather than by watching it, which is the kind of thing a browser
     test is for. */

  await page.evaluate(() => window.HC.swipe.hint());
  await page.waitForTimeout(220);

  await page.evaluate(`(function () {
    var scroller = document.querySelector('.hc-scroll');
    function fire(type) {
      var t = new Touch({ identifier: 9, target: scroller, clientX: 200, clientY: 400 });
      var live = type === 'touchend' ? [] : [t];
      scroller.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: live, targetTouches: live, changedTouches: [t]
      }));
    }
    fire('touchstart');
    fire('touchend');
  })()`);
  await page.waitForTimeout(120);

  const tapped = await page.evaluate(() => ({
    x: document.getElementById('hc-view').style.transform,
    promoted: document.getElementById('hc-view').classList.contains('hc-view-dragging'),
    pane: !!document.querySelector('.hc-swipe__pane')
  }));
  ok('a tap mid lean puts the screen back', tapped.x === '', 'left "' + tapped.x + '"');
  ok('and does not strand the rendered screen', tapped.pane === false);
  ok('and gives the compositor layer back', tapped.promoted === false);

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
  /* Sampled part way through the lean rather than at its deepest, so the bound
     is the amplitude rather than a claim about where the easing had got to. */
  ok('and leans right, because left is the end of the line',
     rightward > 20 && rightward <= 64.5, 'at ' + rightward + 'px');

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

  /* ------------------------------------------------- and it can say why it is quiet

     The thing whose absence cost the last attempt a revert. explain() walks
     the same rules hintPolicy() does, in the same order, and names the first
     one that said no — so "I have not seen it" can be answered from a console
     instead of guessed at. Both ends are checked here because the two lists
     are written out twice and a reordering would otherwise report the wrong
     rule with total confidence. */

  const retiredWhy = await page.evaluate(() => window.HC.swipe.explain());
  ok('it names the rule that stopped it',
     /^no: retired for this launch/.test(retiredWhy), retiredWhy);

  await page.reload();
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await pastTheGate(page);
  await page.waitForTimeout(900);

  const freshWhy = await page.evaluate(() => window.HC.swipe.explain());
  ok('and says yes, and where it would lean, when nothing is stopping it',
     /^yes: it would lean left toward /.test(freshWhy), freshWhy);

  /* --------------------------------- somebody who swipes before it gets there

     The opening lean is scheduled at five seconds whatever happens, because
     the rail's own timer and this one are deliberately independent: a thumb on
     the notches must not call off a hint about a gesture nobody has found yet.
     Which leaves exactly one thing that should call it off, and it is the
     obvious one — somebody who has already swiped to another page does not
     need to be shown that pages swipe.

     That is not the timer's job and it is not checked there. The lean fires on
     schedule and js/swipe.js refuses it, which is the same rule that stops
     every other turn once the gesture has been used. This is the case that
     proves the two halves agree. */

  await page.reload();
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await pastTheGate(page);

  // Well inside the five seconds, and a real drag rather than a call.
  await page.evaluate(DRAG + '(330, 60)');
  await page.waitForTimeout(700);

  const afterEarly = await page.evaluate(() => new Promise(resolve => {
    const view = document.getElementById('hc-view');
    const t0 = Date.now();
    (function watch() {
      const m = /translate3d\((-?[\d.]+)px/.exec(view.style.transform || '');
      if (m && Math.abs(parseFloat(m[1])) > 2) return resolve(parseFloat(m[1]));
      if (Date.now() - t0 > 7000) return resolve(0);
      requestAnimationFrame(watch);
    })();
  }));

  ok('an early swipe calls the opening lean off', afterEarly === 0,
     'the screen moved to ' + afterEarly + 'px anyway');
  ok('and the hint says so by name',
     /^no: retired for this launch/.test(await page.evaluate(() => window.HC.swipe.explain())));

  /* -------------------------------------------------------- nothing threw */

  ok('no errors on the console', noise.length === 0, noise.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
