/* ===========================================================================
   Maintenance mode, driven.

   WHY A BROWSER. The unit test beside this pins who is covered. What it
   cannot see is whether the cover is actually on the glass, whether it stays
   there past every timer the splash has, and whether it arrives on and leaves
   a phone that is already open. Those are claims about a running page:

     it covers            A signed out phone with the switch on sees the house
                          and "We'll be back soon." and nothing it can tap
                          underneath.
     it stays             Past the splash's ceiling, past the gate, for as long
                          as the switch is on.
     it follows the switch  Flipped off, an open phone uncovers; flipped back
                          on, it covers again, without a reload.
     an admin gets past   Signing in on the cover with an admin's account
                          lifts it. A member's account does not.

   NO SUPABASE. Same seam as tests/e2e/gate.js: js/config.js is served over
   with one pointing at this file's own server, which answers as Supabase
   would, with `maintenance_mode_on` held in a variable here.

     node tests/e2e/maintenance.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_MAINT_PORT || 8241);
const ORIGIN = 'http://127.0.0.1:' + PORT;
const SHOTS = process.env.HC_MAINT_SHOTS || '';

const ADMIN = 'admin@e2e.test';
const MEMBER = 'member@e2e.test';
const PASSWORD = 'a-real-password';

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

/* -------------------------------------------------------------- the server */

const CONFIG_STUB =
  '(function (HC) { HC.config = { SUPABASE_URL: ' + JSON.stringify(ORIGIN + '/supabase') +
  ', SUPABASE_ANON_KEY: "anon-key"' +
  ', PASSWORD_ACCOUNTS: ' + JSON.stringify([ADMIN, MEMBER]) +
  ' }; })(window.HC = window.HC || {});\n';

let maintenance = true;

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

  if (url.startsWith('/supabase/auth/v1/token') && sent.password !== undefined) {
    if (sent.password !== PASSWORD) {
      return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    const id = sent.email === ADMIN ? 'e2e-admin' : 'e2e-member';
    return json(res, 200, {
      access_token: 'access', refresh_token: 'refresh', expires_in: 3600,
      user: { id: id, email: sent.email }
    });
  }

  if (url.startsWith('/supabase/rest/v1/profiles')) {
    return json(res, 200, req.url.indexOf('e2e-admin') !== -1
      ? { id: 'e2e-admin', first_name: 'Ada', role: 'admin', can_host: true }
      : { id: 'e2e-member', first_name: 'Mo', role: 'member', can_host: false });
  }

  if (url.startsWith('/supabase/rest/v1/app_settings')) {
    const row = {
      key: 'maintenance_mode_on', label: 'Maintenance mode', help: null,
      kind: 'boolean', value_bool: maintenance, value_text: null, sort_order: 5
    };
    // The poll asks for one column of one row; the refresh asks for them all.
    return json(res, 200, req.url.indexOf('select=value_bool') !== -1
      ? [{ value_bool: maintenance }] : [row]);
  }

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

const state = (page) => page.evaluate(() => {
  const cover = document.getElementById('hc-maintenance');
  const app = document.getElementById('app');
  let onTop = false;
  if (cover) {
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 3);
    onTop = !!(hit && cover.contains(hit));
  }
  return {
    cover: !!cover,
    line: cover ? cover.querySelector('#hc-maintenance-line').textContent : '',
    onTop: onTop,
    inert: !!(app && app.inert),
    signedIn: window.HC.auth.isSignedIn()
  };
});

// What an open phone does on its own every minute, without the minute.
const poll = async (page) => {
  await page.evaluate(() => window.HC.maintenance.check());
  await page.waitForTimeout(600);
};

async function signIn(page, email) {
  await page.click('#hc-maintenance [data-m="open"]');
  await page.fill('#hc-maintenance [data-m="id"]', email);
  await page.click('#hc-maintenance [data-m="go"]');
  await page.fill('#hc-maintenance [data-m="secret"]', PASSWORD);
  await page.click('#hc-maintenance [data-m="go"]');
}

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const noise = [];

  async function fresh(scheme) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, colorScheme: scheme || 'light'
    });
    const page = await context.newPage();
    page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
    await page.goto(ORIGIN + '/index.html');
    await page.waitForFunction(() => window.HC && window.HC.maintenance && window.HC.router,
      null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    return { context, page };
  }

  /* ------------------------------------------------------------ it covers */

  maintenance = true;
  let { context, page } = await fresh();
  let s = await state(page);
  ok('with the switch on, a signed out phone is covered', s.cover && s.onTop, JSON.stringify(s));
  ok('and the cover says so', s.line === 'We’ll be back soon.', s.line);
  ok('and the app underneath is out of reach', s.inert, JSON.stringify(s));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'maintenance-light.png') });

  /* ------------------------------------------------------------- it stays */

  await page.waitForTimeout(6000);
  s = await state(page);
  ok('still there past the splash’s ceiling and the gate', s.cover && s.onTop, JSON.stringify(s));

  /* ---------------------------------------------------- it follows the switch */

  maintenance = false;
  await poll(page);
  s = await state(page);
  ok('switched off, an open phone uncovers without a reload', !s.cover && !s.inert, JSON.stringify(s));

  maintenance = true;
  await poll(page);
  s = await state(page);
  ok('switched back on, it covers again', s.cover && s.onTop, JSON.stringify(s));

  /* ------------------------------------------------------- a member does not */

  await signIn(page, MEMBER);
  await page.waitForTimeout(3500);
  s = await state(page);
  ok('a member signing in on the cover is still covered', s.signedIn && s.cover, JSON.stringify(s));
  ok('and is told why',
    /not an admin/.test(await page.textContent('#hc-maintenance [data-m="note"]')));
  await context.close();

  /* --------------------------------------------------- an admin gets past */

  ({ context, page } = await fresh('dark'));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'maintenance-dark.png') });
  await signIn(page, ADMIN);
  await page.waitForFunction(() => !document.getElementById('hc-maintenance'), null, { timeout: 8000 })
    .catch(() => {});
  s = await state(page);
  ok('an admin signing in on the cover lifts it', s.signedIn && !s.cover && !s.inert, JSON.stringify(s));

  await poll(page);
  s = await state(page);
  ok('and it stays lifted for them while the switch is still on', !s.cover, JSON.stringify(s));

  // The switch itself, where an admin finds it.
  await page.evaluate(() => window.HC.router.go({ name: 'admin', id: 'settings' }));
  await page.waitForTimeout(800);
  const sw = await page.evaluate(() => {
    const el = document.querySelector('[data-action="admin-maintenance-toggle"]');
    return el ? { checked: el.getAttribute('aria-checked'), text: el.textContent } : null;
  });
  ok('App settings has a Maintenance mode switch, showing on',
    sw && /Maintenance mode/.test(sw.text) && sw.checked === 'true', JSON.stringify(sw));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'maintenance-settings.png') });
  await context.close();

  ok('no script errors along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
