/* ===========================================================================
   The index rail, grabbed while the page is still moving.

   WHY THIS IS A BROWSER. tests/ has no unit test for js/index-rail.js and
   cannot usefully have one: every question worth asking of that file is a
   finger on a moving page, and a moving page is the whole subject here.

   WHAT WENT WRONG. The rail read the gesture off pointer events. A finger
   that lands while the page is flying is a finger the browser has already
   promised to its own scrolling, and the pointer stream for it is cancelled
   or never starts until the deceleration is over. So slinging the page and
   grabbing the notches on the way past did nothing at all: they woke a moment
   later, once everything was still, which is the one moment nobody needs
   them. The rail reads touches now, and refuses the scroll at the touch
   rather than at the first move, because a scroll that has already begun
   cannot be refused at the first move.

   WHAT IS ACTUALLY CHECKED. Four things, and each of them is a way for this
   to be quietly wrong rather than visibly broken:

     1. A touch that lands on a moving page is the rail's, and the scroll is
        refused there and then.
     2. A drag out of that touch scrubs, while the page is still settling.
        This is the report, in one line.
     3. A touch on a still page is NOT refused. The 56px band is mostly card,
        and a refusal costs the click of everybody who was only tapping one.
     4. A still finger that landed on a moving page stops the page and does
        nothing else. Touching a flying page to stop it is a gesture every
        screen on the phone has, and answering it with a jump to somewhere
        else would be worse than the bug above. The same tap on a still page
        still jumps, which is the half of it that has to keep working.

   HOW THE PAGE IS MADE TO MOVE. Not by a fling, which no synthetic touch in
   a headless browser produces: by scrolling the page and reading it within
   the few frames js/index-rail.js counts as moving. That is the same state
   the file itself tests for — when the page last changed, not how it came to
   change — so this asks the real question rather than a picture of it.

     node tests/e2e/index-rail.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_RAIL_PORT || 8237);

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

/* One finger, made by hand, on the element the listeners are on. Playwright's
   touchscreen can tap and nothing else, and everything here is what happens
   between the down and the up. */
const HAND = `window.__hand = (function () {
  var scroller = document.querySelector('.hc-scroll');

  function fire(type, x, y) {
    var t = new Touch({ identifier: 7, target: scroller, clientX: x, clientY: y });
    var live = type === 'touchend' ? [] : [t];
    var evt = new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: live, targetTouches: live, changedTouches: [t]
    });
    scroller.dispatchEvent(evt);
    return evt.defaultPrevented;
  }

  function frames(n) {
    return new Promise(function (done) {
      (function step() {
        if (n-- <= 0) { done(); return; }
        requestAnimationFrame(step);
      })();
    });
  }

  return {
    fire: fire,
    frames: frames,

    // The far right of the glass, well inside the strip a tap is read in.
    x: function () { return scroller.getBoundingClientRect().right - 12; },

    // Where a notch is, in the page's own coordinates.
    notchY: function (i) {
      var n = document.querySelectorAll('.hc-index__notch')[i];
      var b = n.getBoundingClientRect();
      return b.top + b.height / 2;
    },

    top: function () { return Math.round(scroller.scrollTop); },

    /* Put the page where it is asked to be and let the shell's scroll frame
       read it. Two frames later it is a page that moved a moment ago, which
       is what js/index-rail.js calls moving. */
    settled: function (to) {
      scroller.scrollTop = to;
      return frames(30);
    },
    stirred: function (to) {
      scroller.scrollTop = to;
      return frames(2);
    }
  };
})();`;

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
  await page.waitForTimeout(900);
  await page.evaluate(HAND);

  /* A screen with a rail on it. Home is the one the app opens onto and it has
     the headings for one; if that ever stops being true this says so here
     rather than failing four times below for a reason that is not the
     subject. */
  const notches = await page.evaluate(
    () => document.querySelectorAll('.hc-index__notch').length);
  ok('Home has a rail to grab', notches > 2, 'notches: ' + notches);

  const room = await page.evaluate(() => {
    const s = document.querySelector('.hc-scroll');
    return s.scrollHeight - s.clientHeight;
  });
  ok('and enough page under it to fling', room > 400, 'scrollable: ' + room);

  /* ------------------------------------------- 1 and 2, the report itself */

  const mid = await page.evaluate(async () => {
    const h = window.__hand;
    // A page that moved a moment ago, and a thumb arriving on it.
    await h.stirred(240);
    const prevented = h.fire('touchstart', h.x(), h.notchY(1));
    return { prevented: prevented, busy: window.HC.indexRail.busy() };
  });
  ok('a touch on a moving page is the rail\'s, and the scroll is refused at the touch',
    mid.prevented === true, JSON.stringify(mid));
  ok('and the rail has the finger straight away, not once everything is still',
    mid.busy === true, JSON.stringify(mid));

  const scrubbed = await page.evaluate(async () => {
    const h = window.__hand;
    const from = h.top();
    const x = h.x();
    const last = document.querySelectorAll('.hc-index__notch').length - 1;
    const to = h.notchY(last);
    const at = h.notchY(1);
    for (let i = 1; i <= 8; i++) {
      h.fire('touchmove', x, at + (to - at) * (i / 8));
      await h.frames(1);
    }
    const engaged = window.HC.indexRail.busy();
    const state = document.getElementById('hc-index').getAttribute('data-state');
    h.fire('touchend', x, to);
    await h.frames(40);
    return { from: from, to: h.top(), engaged: engaged, state: state };
  });
  ok('a drag out of it scrubs, while the page is still settling',
    scrubbed.engaged === true && scrubbed.to > scrubbed.from + 100,
    JSON.stringify(scrubbed));
  ok('and the contents is up beside the thumb while it does',
    scrubbed.state === 'on', JSON.stringify(scrubbed));

  /* ------------------------------------------------ 3, the ordinary tap */

  const still = await page.evaluate(async () => {
    const h = window.__hand;
    await h.settled(240);
    const prevented = h.fire('touchstart', h.x(), h.notchY(1));
    h.fire('touchend', h.x(), h.notchY(1));
    await h.frames(40);
    return prevented;
  });
  ok('a touch on a still page is not refused, so a card in the band keeps its click',
    still === false, 'defaultPrevented: ' + still);

  /* --------------------------------------- 4, what a still finger means */

  const stop = await page.evaluate(async () => {
    const h = window.__hand;
    await h.settled(0);
    await h.stirred(300);
    const before = h.top();
    h.fire('touchstart', h.x(), h.notchY(0));
    await h.frames(10);
    h.fire('touchend', h.x(), h.notchY(0));
    await h.frames(50);
    return { before: before, after: h.top() };
  });
  ok('a still finger that landed on a moving page stops it and does nothing else',
    Math.abs(stop.after - stop.before) < 6, JSON.stringify(stop));

  const jump = await page.evaluate(async () => {
    const h = window.__hand;
    await h.settled(300);
    const before = h.top();
    h.fire('touchstart', h.x(), h.notchY(0));
    await h.frames(10);
    h.fire('touchend', h.x(), h.notchY(0));
    await h.frames(60);
    return { before: before, after: h.top() };
  });
  ok('and the same tap on a still page still jumps to the notch under it',
    jump.after < jump.before - 100, JSON.stringify(jump));

  /* ------------------------------------------------- and not read twice */

  const twice = await page.evaluate(() => {
    const s = document.querySelector('.hc-scroll');
    const b = s.getBoundingClientRect();
    s.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: 3, pointerType: 'touch',
      clientX: b.right - 12, clientY: 300
    }));
    const busy = window.HC.indexRail.busy();
    s.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerId: 3, pointerType: 'touch',
      clientX: b.right - 12, clientY: 300
    }));
    return busy;
  });
  ok('a touch pointer is left to the touch that carries it, so nothing reads it twice',
    twice === false, 'busy: ' + twice);

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})();
