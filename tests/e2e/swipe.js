/* ===========================================================================
   The sideways drag, past the end of the row.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. tests/nav.test.js already asks
   js/router.js what is on either side of every screen, and it will keep
   passing whatever js/swipe.js does with the answer. What that file does is
   read a finger, and none of it can be asked anything without one: the axis
   lock, the commit threshold, the pane the incoming screen is built into, and
   the hand-off at the end where the pane's element becomes the mounted view.
   A drag that decides it was a scroll, or one that renders a screen and then
   navigates somewhere else, looks like a screen that will not come.

   WHAT IS NEW HERE AND WORTH A BROWSER. Settings sits one screen past the end
   of the row and it is not a stop. Everything the drag had done until now
   landed somewhere with a tile and no back arrow, and the one thing that
   could quietly go wrong with a pushed view at the end of the lane is the
   chrome: arriving by drag has to leave the arrow and the title exactly where
   arriving by the initials in the top bar leaves them, or somebody drags into
   Settings and has no way back out of it.

   And the exception in the other direction, which is the same `if`: the Admin
   sections wear the Admin menu's route name, and a drag inside Manage users
   belongs to that screen. The row is one line of js/app.js away from swapping
   those two answers over.

   No database. This drives the app against its own bundled seed, the same as
   alpha.js beside it. Nobody is signed in, so the phone has no Admin tile and
   the last stop is Give; the admin's row, one stop longer, is handed to the
   router directly for the second half.

     node tests/e2e/swipe.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_SWIPE_PORT || 8235);

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

/* One finger, in a dozen steps, across the screen. Playwright's touchscreen
   can tap and nothing else, and js/swipe.js is entirely about what happens
   between the down and the up, so the events are made by hand.

   Twelve steps rather than two because the axis lock needs a move it can call
   horizontal before it will take the gesture, and the velocity it settles on
   is read off the last couple of them. Dispatched on the scroller itself,
   which is the element the listeners are on and, conveniently, nothing that
   can be typed into. */
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

// Far enough to clear COMMIT_PART on a 390pt phone, and clear of the left
// eighteen points, which are the platform's back gesture and not ours.
const LEFT = '(330, 60)';
const RIGHT = '(60, 330)';

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
  // The way in, answered the way a person answers it. See past-the-gate.js.
  await pastTheGate(page);
  await page.waitForTimeout(600);

  // Everything the chrome says about where we are, in one read. The settle is
  // at most SETTLE_MAX plus the timeout that backs transitionend up.
  const where = async () => {
    await page.waitForTimeout(800);
    return page.evaluate(() => ({
      name: window.HC.router.current().name,
      arrow: !document.querySelector('.hc-topbar__back').hidden,
      title: document.getElementById('hc-topbar-title').textContent,
      tile: getComputedStyle(document.querySelector('.hc-tabbar'))
        .getPropertyValue('--hc-tab-tile').trim()
    }));
  };

  /* ------------------------------------------------ the end of the lane ---
     Nobody is signed in, so there is no Admin tile and Give is the last stop.
     Settings comes after it either way. */

  const lane = await page.evaluate(() => window.HC.router.lane().join(','));
  ok('the drag runs one screen past the row, and Settings is that screen',
    /,give,profile$/.test(lane), lane);

  await page.evaluate(() => window.HC.router.go({ name: 'give' }));
  const give = await where();
  ok('starting on the last stop', give.name === 'give', give.name);

  await page.evaluate(DRAG + LEFT);
  const settings = await where();
  ok('a drag left off it lands on Settings', settings.name === 'profile', settings.name);
  ok('and Settings arrives as the pushed view it is, arrow and title and no tile',
    settings.arrow && settings.title === 'Your account' && settings.tile === '0',
    JSON.stringify(settings));

  await page.evaluate(DRAG + RIGHT);
  const back = await where();
  ok('a drag right off Settings goes back to the last stop',
    back.name === 'give', back.name);
  ok('and the stop gets its logo and its tile back',
    !back.arrow && back.tile === '1', JSON.stringify(back));

  /* ------------------------------------------------- an admin's phone ---
     One stop longer. The row is handed over the way syncModules hands it
     over, rather than by forging a signed-in admin, because what is being
     asked here is the drag and not who is allowed to see the tile. */

  await page.evaluate(() => {
    window.HC.router.setModules(
      window.HC.modules.map(function (m) { return m.route; }).concat(['admin']),
      ['profile']
    );
    window.HC.router.go({ name: 'admin' });
  });
  const admin = await where();
  ok('starting on the Admin menu, which is a stop', admin.name === 'admin' && !admin.arrow,
    JSON.stringify(admin));

  await page.evaluate(DRAG + LEFT);
  const fromAdmin = await where();
  ok('a drag left off Admin brings Settings in',
    fromAdmin.name === 'profile', fromAdmin.name);

  await page.evaluate(DRAG + RIGHT);
  const toAdmin = await where();
  ok('and a drag right off Settings goes back to Admin',
    toAdmin.name === 'admin', toAdmin.name);

  await page.evaluate(DRAG + LEFT);
  const past = await where();
  ok('past Settings there is nothing to bring on, so it stays put',
    past.name === 'profile', past.name);

  /* --------------------------------------------- and where it does not go */

  await page.evaluate(() => window.HC.router.go({ name: 'admin', id: 'users' }));
  await page.waitForTimeout(400);
  await page.evaluate(DRAG + LEFT);
  await page.waitForTimeout(800);
  const inside = await page.evaluate(() => {
    const r = window.HC.router.current();
    return r.name + ':' + (r.id || '');
  });
  ok('a drag inside an Admin section belongs to that screen, not to the lane',
    inside === 'admin:users', inside);

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})();
