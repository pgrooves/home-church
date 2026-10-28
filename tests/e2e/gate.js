/* ===========================================================================
   The way in, driven.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. Every claim the gate makes is a
   claim about a running page. It has no data layer of its own: it asks
   js/auth.js for a code and then for a session, and everything else it does
   is arrangement and movement. There is nothing underneath it to unit test,
   and the four things that can actually break are these:

     the greeting climbs      The house and the welcome make room rather than
                              being replaced. Measured, because "it moved up"
                              is a number and every other way of asserting it
                              is a screenshot somebody has to look at.

     nobody is stuck          A signed out phone is asked to sign in, and the
                              way past that question is on the same panel. If
                              Continue as guest ever stops reaching Home, the
                              app is closed to everyone who has not made an
                              account, which is also a rejected submission.

     the track goes both ways Three panels on one rail. Going forward is the
                              part anybody would test; coming back from the
                              code panel to a mistyped address is the part
                              that quietly rots.

     a real sign in ends it   The code goes to js/auth.js, the session lands,
                              the layer leaves, and Home underneath has the
                              name it did not have a second ago.

   NO SUPABASE. js/config.js is served over with one pointing at this file's
   own server, which answers /auth/v1/otp and /auth/v1/verify the way GoTrue
   answers them. That is the same seam tests/auth.test.js uses, moved into a
   browser: the shapes are Supabase's, the network is local, and nothing here
   can touch the church's project.

     node tests/e2e/gate.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_GATE_PORT || 8236);
const ORIGIN = 'http://127.0.0.1:' + PORT;

const EMAIL = 'trey@e2e.test';
const CODE = '123456';
const NAME = 'Trey';

/* The other way in, the one submission 1.0 (8) was rejected for not having.
   An address on config.PASSWORD_ACCOUNTS is asked for a password instead of
   being emailed a code, because whoever reviews this app cannot read our
   mail. The whole point is that no code is ever sent, so this file counts
   the codes that were. */
const DEMO = 'demo.leader@e2e.test';
const PASSWORD = 'a-real-password';
const DEMO_NAME = 'Dana';

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

/* -------------------------------------------------------------- the server

   The app, unmodified, with two exceptions. js/config.js is replaced so the
   app believes this church has accounts and that they live here, and anything
   under /supabase is answered the way Supabase would answer it. */

const CONFIG_STUB =
  '(function (HC) { HC.config = { SUPABASE_URL: ' + JSON.stringify(ORIGIN + '/supabase') +
  ', SUPABASE_ANON_KEY: "anon-key"' +
  ', PASSWORD_ACCOUNTS: ' + JSON.stringify([DEMO]) +
  ' }; })(window.HC = window.HC || {});\n';

const otp = [];      // every address a code was asked for, in order
const verified = []; // every code that was submitted
const grants = [];   // every address that tried the password grant

function body(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function supabase(req, res, url) {
  const sent = await body(req);

  if (url.startsWith('/supabase/auth/v1/otp')) {
    otp.push(sent.email || sent.phone || '');
    return json(res, 200, {});
  }

  if (url.startsWith('/supabase/auth/v1/verify')) {
    verified.push(sent.token);
    if (sent.token !== CODE) {
      // GoTrue's own wording for a code that is not the one it sent.
      return json(res, 403, { error_description: 'Token has expired or is invalid' });
    }
    return json(res, 200, {
      access_token: 'access', refresh_token: 'refresh', expires_in: 3600,
      user: { id: 'e2e-user', email: EMAIL }
    });
  }

  /* The password grant. The refresh token comes through the same endpoint,
     so what tells them apart is what was sent: GoTrue's password grant is
     the one carrying a password. */
  if (url.startsWith('/supabase/auth/v1/token') && sent.password !== undefined) {
    grants.push(sent.email);
    if (sent.password !== PASSWORD) {
      // GoTrue's own wording, which js/auth.js is expected to replace.
      return json(res, 400, {
        error: 'invalid_grant', error_description: 'Invalid login credentials'
      });
    }
    return json(res, 200, {
      access_token: 'access', refresh_token: 'refresh', expires_in: 3600,
      user: { id: 'e2e-demo', email: DEMO }
    });
  }

  /* The row a trigger makes beside every new user. Asked for as an object.
     The demo account comes back as a leader, because that is the whole
     reason a reviewer is given one: Leader mode belongs to an account and
     an account is the only way to see it. */
  if (url.startsWith('/supabase/rest/v1/profiles')) {
    return json(res, 200, req.url.indexOf('e2e-demo') !== -1
      ? { id: 'e2e-demo', first_name: DEMO_NAME, role: 'member', can_host: true }
      : { id: 'e2e-user', first_name: NAME, role: 'member', can_host: false });
  }

  // Everything else the app reaches for on boot: a project with no rows in
  // it. Enough for js/content.js to fall back to the bundled seed quietly.
  return json(res, 200, []);
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);

    if (url.startsWith('/supabase/')) return supabase(req, res, url);

    if (url === '/js/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end(CONFIG_STUB);
    }

    const file = path.join(ROOT, url === '/' ? '/index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not here');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

/* ---------------------------------------------------------------- reading */

// Where the pieces are, in the coordinates a thumb lives in.
const scene = (page) => page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const panel = (name) => box('[data-panel="' + name + '"]');
  return {
    step: window.HC.gate ? window.HC.gate.step() : null,
    splash: !!document.getElementById('hc-splash'),
    mark: box('.hc-splash__mark'),
    greeting: (document.getElementById('hc-splash-greeting') || {}).textContent,
    burst: document.querySelector('.hc-splash--in') !== null,
    buttons: Array.prototype.slice
      .call(document.querySelectorAll('[data-panel="choose"] .hc-btn'))
      .map(b => b.textContent),
    panels: {
      choose: panel('choose'), email: panel('email'),
      code: panel('code'), password: panel('password')
    },
    /* How many panels are actually in the track's flow. The password panel
       shares slot 2 with the code panel, so this is three at every moment
       of every route through the gate, and a four would mean every panel is
       a quarter of a rail that is three thirds wide. */
    inFlow: document.querySelectorAll('.hc-gate__panel:not([hidden])').length,
    signedIn: window.HC.auth.isSignedIn()
  };
});

const errorIn = (page, name) => page.evaluate((n) => {
  const line = document.querySelector('[data-panel="' + n + '"] [data-error]');
  return line && !line.hasAttribute('hidden') ? line.textContent : '';
}, name);

// The gate is on the glass. Waits out the greeting's own hold and the lift.
async function waitForGate(page) {
  await page.waitForFunction(() => window.HC && window.HC.gate && window.HC.gate.step(),
    null, { timeout: 15000 });
  await page.waitForTimeout(900);
}

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const noise = [];
  page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
  page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(text)) {
      noise.push('console: ' + text);
    }
  });

  await page.goto(ORIGIN + '/index.html');

  /* --------------------------------------------------------- the greeting */

  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const before = await scene(page);
  ok('the greeting is up first, with nothing to tap on it',
    before.splash && before.step === null && before.buttons.length === 0,
    JSON.stringify({ splash: before.splash, step: before.step }));

  await waitForGate(page);
  const gate = await scene(page);

  ok('and then the way in appears on the same layer',
    gate.splash && gate.step === 'choose', JSON.stringify({ splash: gate.splash, step: gate.step }));
  ok('the house climbed to make room rather than being replaced',
    before.mark && gate.mark && gate.mark.y < before.mark.y - 40,
    JSON.stringify({ before: before.mark, after: gate.mark }));
  ok('the welcome is still the welcome', gate.greeting === 'Welcome home.', gate.greeting);
  ok('two buttons, in the words that were asked for',
    gate.buttons.length === 2 &&
    gate.buttons[0] === 'Log in with email' &&
    gate.buttons[1] === 'Continue as guest',
    JSON.stringify(gate.buttons));
  ok('both are a full tap target',
    gate.panels.choose && (await page.evaluate(() => Array.prototype.every.call(
      document.querySelectorAll('[data-panel="choose"] .hc-btn'),
      b => b.getBoundingClientRect().height >= 44))));
  ok('the next panel is parked off the right edge, not underneath',
    gate.panels.email && gate.panels.email.x >= 380,
    JSON.stringify(gate.panels));
  ok('and nothing off screen can be tabbed into',
    await page.evaluate(() => Array.prototype.every.call(
      document.querySelectorAll('[data-panel="email"] input, [data-panel="code"] input'),
      i => i.hasAttribute('disabled'))));

  /* ------------------------------------------------------------ the track */

  await page.click('[data-gate="email"]');
  await page.waitForTimeout(900);
  const asked = await scene(page);

  ok('tapping Log in with email brings the address panel in',
    asked.step === 'email' && asked.panels.email.x === 0, JSON.stringify(asked.panels));
  ok('and takes the two buttons away to the left',
    asked.panels.choose.x <= -380, JSON.stringify(asked.panels));
  ok('the field has the cursor in it',
    await page.evaluate(() => document.activeElement &&
      document.activeElement.id === 'hc-gate-email'));

  await page.fill('#hc-gate-email', 'not an address');
  await page.click('[data-gate="send"]');
  await page.waitForTimeout(300);
  ok('a typo is answered on the panel it was typed on',
    /does not look like/.test(await errorIn(page, 'email')),
    await errorIn(page, 'email'));
  ok('and nothing was sent for it', otp.length === 0, JSON.stringify(otp));

  await page.fill('#hc-gate-email', EMAIL);
  await page.click('[data-gate="send"]');
  await page.waitForFunction(() => window.HC.gate.step() === 'code', null, { timeout: 8000 });
  await page.waitForTimeout(800);
  const sent = await scene(page);

  ok('a real address asks js/auth.js for a code',
    otp.length === 1 && otp[0] === EMAIL, JSON.stringify(otp));
  ok('and the code panel comes in from the right edge',
    sent.step === 'code' && sent.panels.code.x === 0 && sent.panels.email.x <= -380,
    JSON.stringify(sent.panels));
  ok('which says where the code went',
    (await page.textContent('[data-panel="code"] [data-sent]')).indexOf(EMAIL) !== -1,
    await page.textContent('[data-panel="code"] [data-sent]'));

  // Back, and forward again. The rail runs both ways or the mistyped address
  // somebody is looking at is one they cannot fix.
  await page.click('[data-gate="back-email"]');
  await page.waitForTimeout(800);
  ok('use a different email walks back down the same rail',
    (await scene(page)).step === 'email');
  await page.click('[data-gate="send"]');
  await page.waitForFunction(() => window.HC.gate.step() === 'code', null, { timeout: 8000 });
  await page.waitForTimeout(700);
  ok('and the address it kept is the one already in the field',
    otp.length === 2 && otp[1] === EMAIL, JSON.stringify(otp));

  /* ----------------------------------------------------------- the wrong code */

  await page.fill('#hc-gate-code', '000000');
  await page.click('[data-gate="verify"]');
  await page.waitForTimeout(600);
  ok('a wrong code is the server\'s own sentence, on the panel',
    /expired or is invalid/.test(await errorIn(page, 'code')), await errorIn(page, 'code'));
  ok('and the gate is still standing',
    (await scene(page)).step === 'code' && !(await scene(page)).signedIn);
  ok('the button came back rather than staying spent',
    await page.evaluate(() => !document.querySelector('[data-gate="verify"]')
      .hasAttribute('disabled')));

  /* The box that clips the track is also a box the browser will scroll, and
     putting the cursor in a field is enough to make it: it drags the whole
     rail sideways under the transform and leaves the panel somebody is typing
     into half off the screen. It did, by 355px on a 375pt screen. js/gate.js
     pins it, and this is the pin. */
  ok('and the clipping box never scrolled out from under the track',
    await page.evaluate(() => {
      const box = document.querySelector('.hc-splash__gate');
      const panel = document.querySelector('[data-panel="code"]');
      return box.scrollLeft === 0 && Math.abs(panel.getBoundingClientRect().x) < 2;
    }),
    await page.evaluate(() => document.querySelector('.hc-splash__gate').scrollLeft));

  /* -------------------------------------------------------------- you're in */

  await page.fill('#hc-gate-code', CODE);
  await page.click('[data-gate="verify"]');
  await page.waitForFunction(() => document.querySelector('.hc-splash--in') !== null,
    null, { timeout: 8000 });
  const arrived = await scene(page);

  ok('the right code signs you in', arrived.signedIn && verified.indexOf(CODE) !== -1,
    JSON.stringify(verified));
  ok('and the welcome says so', arrived.greeting === 'You’re in!', arrived.greeting);
  ok('with the light behind the house', arrived.burst);

  await page.waitForFunction(() => !document.getElementById('hc-splash'),
    null, { timeout: 8000 });
  const home = await page.evaluate(() => ({
    view: document.getElementById('app').getAttribute('data-view'),
    greeting: (document.querySelector('.hc-home__greeting') || {}).textContent || '',
    hidden: document.getElementById('app').getAttribute('aria-hidden')
  }));

  ok('then the layer leaves and Home is underneath', home.view === 'home', home.view);
  ok('and Home knows the name it did not have a moment ago',
    home.greeting.indexOf(NAME) !== -1, home.greeting);
  ok('the app is back in the accessibility tree', home.hidden === null, String(home.hidden));

  /* ------------------------------------------------------- the second launch */

  await page.reload();
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await page.waitForFunction(() => !document.getElementById('hc-splash'),
    null, { timeout: 15000 });
  ok('a signed in phone is never asked again',
    (await page.evaluate(() => window.HC.gate.step())) === null);

  /* -------------------------------------------------------------- the guest

     A phone nobody has signed in on, with Reduce Motion turned on, which is
     two things worth asking at once. base.css collapses every animation and
     transition in the app to nothing, so the still version of this is not the
     movement run fast: it is three panels that have to be arranged correctly
     with no movement at all, and a lift that has to have happened without
     ever being seen to happen. And the way out has to still be there. */

  const still = await browser.newContext({
    viewport: { width: 390, height: 844 }, reducedMotion: 'reduce'
  });
  const quiet = await still.newPage();
  quiet.on('pageerror', e => noise.push('pageerror: ' + String(e)));

  await quiet.goto(ORIGIN + '/index.html');
  await waitForGate(quiet);
  const stillScene = await scene(quiet);

  ok('Reduce Motion still arrives at the way in', stillScene.step === 'choose');
  ok('with the house already up where the climb would have left it',
    stillScene.mark.y < 300, JSON.stringify(stillScene.mark));
  ok('and the first panel squarely on screen',
    stillScene.panels.choose.x === 0, JSON.stringify(stillScene.panels));

  await quiet.click('[data-gate="guest"]');
  await quiet.waitForFunction(() => !document.getElementById('hc-splash'),
    null, { timeout: 8000 });
  const guest = await quiet.evaluate(() => ({
    view: document.getElementById('app').getAttribute('data-view'),
    signedIn: window.HC.auth.isSignedIn()
  }));

  ok('continue as guest reaches Home', guest.view === 'home', guest.view);
  ok('and signs nobody into anything', guest.signedIn === false);

  /* ------------------------------------------------------ the password door

     What whoever reviews this app for Apple will do, on a phone that has
     never been signed in on, in the order they will do it. Submission 1.0 (8)
     was rejected under Guideline 2.1 because the only way in was a code
     emailed to a mailbox the reviewer had to log into first, and they never
     got past it. So the claims here are about what they see: that typing the
     address on the list asks for a password rather than a code, that nothing
     is emailed to anyone, and that what they arrive at is a leader's account,
     since Leader mode is the feature the review notes are built around.

     A context of its own, because the page above this is signed in and a
     signed in phone is never shown the gate again. */

  const reviewCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const review = await reviewCtx.newPage();
  review.on('pageerror', e => noise.push('pageerror: ' + String(e)));

  await review.goto(ORIGIN + '/index.html');
  await waitForGate(review);

  const firstLook = await scene(review);
  ok('a reviewer is shown the same two buttons everybody is shown',
    firstLook.buttons.length === 2 && firstLook.buttons[0] === 'Log in with email',
    JSON.stringify(firstLook.buttons));
  ok('and nothing on the glass advertises a password',
    (await review.textContent('[data-panel="choose"]')).toLowerCase().indexOf('password') === -1);
  ok('three panels in the track, not four',
    firstLook.inFlow === 3, String(firstLook.inFlow));

  await review.click('[data-gate="email"]');
  await review.waitForTimeout(900);

  const codesBefore = otp.length;
  await review.fill('#hc-gate-email', DEMO);
  await review.click('[data-gate="send"]');
  await review.waitForFunction(() => window.HC.gate.step() === 'password',
    null, { timeout: 8000 });
  await review.waitForTimeout(800);
  const asked2 = await scene(review);

  ok('the address on the list is asked for a password instead',
    asked2.step === 'password', asked2.step);
  ok('and no code was emailed to anybody to make that happen',
    otp.length === codesBefore, JSON.stringify(otp));
  ok('the password panel is squarely on screen, at the width of one panel',
    asked2.panels.password.x === 0 && Math.abs(asked2.panels.password.w - 390) < 2,
    JSON.stringify(asked2.panels.password));
  ok('the code panel stepped out of the flow to make room for it',
    asked2.inFlow === 3 &&
    await review.evaluate(() => document.querySelector('[data-panel="code"]').hasAttribute('hidden')),
    String(asked2.inFlow));
  ok('the address panel left to the left, the same as every other step',
    asked2.panels.email.x <= -380, JSON.stringify(asked2.panels.email));
  ok('and the panel says who is signing in',
    (await review.textContent('[data-panel="password"] [data-for]')).indexOf(DEMO) !== -1,
    await review.textContent('[data-panel="password"] [data-for]'));

  await review.fill('#hc-gate-password', 'not the password');
  await review.click('[data-gate="password-verify"]');
  await review.waitForTimeout(600);
  ok('a wrong password is answered in the app\'s own words, not GoTrue\'s',
    /did not match/.test(await errorIn(review, 'password')),
    await errorIn(review, 'password'));
  ok('and nobody is signed in on the strength of it',
    (await scene(review)).signedIn === false);
  ok('the button came back rather than staying spent',
    await review.evaluate(() => !document.querySelector('[data-gate="password-verify"]')
      .hasAttribute('disabled')));

  await review.fill('#hc-gate-password', PASSWORD);
  await review.click('[data-gate="password-verify"]');
  await review.waitForFunction(() => document.querySelector('.hc-splash--in') !== null,
    null, { timeout: 8000 });
  const inNow = await scene(review);

  ok('the right password signs the reviewer in',
    inNow.signedIn && grants.indexOf(DEMO) !== -1, JSON.stringify(grants));
  ok('through the password grant and never through /verify',
    verified.indexOf(PASSWORD) === -1, JSON.stringify(verified));
  ok('and the welcome is the same one everybody else gets',
    inNow.greeting === 'You’re in!', inNow.greeting);

  await review.waitForFunction(() => !document.getElementById('hc-splash'),
    null, { timeout: 8000 });
  const landed = await review.evaluate(() => ({
    view: document.getElementById('app').getAttribute('data-view'),
    greeting: (document.querySelector('.hc-home__greeting') || {}).textContent || '',
    canHost: window.HC.store.getProfile().canHost
  }));

  ok('Home is underneath, the same as the code path', landed.view === 'home', landed.view);
  ok('with the name off the account rather than off the phone',
    landed.greeting.indexOf(DEMO_NAME) !== -1, landed.greeting);
  /* The one that matters for the review notes. Leader mode belongs to the
     account, so if can_host did not come down with the session, the reviewer
     follows the walkthrough to a screen that tells them Leader mode is off
     and the heart of the app is invisible. */
  ok('and Leader mode on, which is the whole reason they were given this account',
    landed.canHost === true, String(landed.canHost));

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
