/* ===========================================================================
   The pinned banner on Admin -> App settings, driven.

     typing stays typing   Words and spaces go into the box without the
                           keyboard being thrown away, and nothing is written
                           until Save.
     cancel               leaves the banner as it was.
     save                 writes the words once.
     notify everyone      saves, turns the banner on, and asks the database to
                          send it, in that order.

   NO SUPABASE. Same fake as tests/e2e/maintenance.js.

     node tests/e2e/banner.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_BANNER_PORT || 8243);
const ORIGIN = 'http://127.0.0.1:' + PORT;
const SHOTS = process.env.HC_BANNER_SHOTS || '';

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

// Maintenance on only so the admin can sign in through the cover, which is
// the sign-in path tests/e2e/maintenance.js already drives.
const settings = {
  maintenance_mode_on: { key: 'maintenance_mode_on', label: 'Maintenance mode',
    kind: 'boolean', value_bool: true, value_text: null, sort_order: 5 },
  home_banner_on: { key: 'home_banner_on', label: 'Pinned banner', kind: 'boolean',
    value_bool: false, value_text: null, sort_order: 10 },
  home_banner_message: { key: 'home_banner_message', label: 'Banner message', kind: 'text',
    value_bool: null, value_text: 'Old words.', sort_order: 20 },
  home_featured_video: { key: 'home_featured_video', label: 'Featured video', kind: 'text',
    value_bool: null, value_text: '', sort_order: 40 }
};
const writes = [];
const rpcs = [];

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
    if (req.method === 'PATCH') {
      const key = decodeURIComponent((req.url.match(/key=eq\.([^&]+)/) || [])[1] || '');
      writes.push({ method: 'PATCH', key: key, body: sent });
      if (settings[key]) Object.assign(settings[key], sent);
      res.writeHead(204); return res.end();
    }
    if (req.method === 'POST') {
      writes.push({ method: 'POST', key: sent.key, body: sent });
      settings[sent.key] = Object.assign(settings[sent.key] || {}, sent);
      res.writeHead(201); return res.end();
    }
    if (req.url.indexOf('select=value_bool') !== -1) {
      return json(res, 200, [{ value_bool: settings.maintenance_mode_on.value_bool }]);
    }
    return json(res, 200, Object.keys(settings).map(k => settings[k]));
  }

  if (url.startsWith('/supabase/rest/v1/rpc/hc_admin_send_banner')) {
    rpcs.push({ banner: settings.home_banner_message.value_text,
                on: settings.home_banner_on.value_bool });
    return json(res, 200, 1);
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


async function signIn(page, email) {
  await page.click('#hc-maintenance [data-m="open"]');
  await page.fill('#hc-maintenance [data-m="id"]', email);
  await page.click('#hc-maintenance [data-m="go"]');
  await page.fill('#hc-maintenance [data-m="secret"]', PASSWORD);
  await page.click('#hc-maintenance [data-m="go"]');
}

const box = '[data-admin-field="bannerMessage"]';

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const noise = [];

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
  page.on('dialog', d => d.accept());
  await page.goto(ORIGIN + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.maintenance && window.HC.router,
    null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await signIn(page, ADMIN);
  await page.waitForFunction(() => !document.getElementById('hc-maintenance'), null, { timeout: 8000 });

  await page.evaluate(() => window.HC.router.go({ name: 'admin', id: 'settings' }));
  await page.waitForSelector('[data-action="admin-banner-edit"]', { timeout: 8000 });

  ok('the banner is not a type-to-save box any more',
    await page.$('[data-admin-field="setting"][data-id="home_banner_message"]') === null);
  ok('it shows what it says now', /Old words\./.test(await page.textContent('.hc-admin__banner-text')));

  /* ---------------------------------------------------------- cancel */

  await page.click('[data-action="admin-banner-edit"]');
  await page.waitForSelector(box);
  await page.waitForTimeout(100);
  ok('Edit puts the caret in the box', await page.evaluate(s => document.activeElement === document.querySelector(s), box));
  await page.fill(box, 'Thrown away');
  await page.click('[data-action="admin-banner-cancel"]');
  await page.waitForTimeout(300);
  ok('Cancel writes nothing', writes.length === 0, JSON.stringify(writes));
  ok('and shows the old words', /Old words\./.test(await page.textContent('.hc-admin__banner-text')));

  /* ------------------------------------------------- typing stays typing */

  await page.click('[data-action="admin-banner-edit"]');
  await page.waitForSelector(box);
  await page.fill(box, '');
  await page.keyboard.type('No service this Sunday ', { delay: 30 });
  await page.waitForTimeout(900);   // longer than the old 400ms debounce
  await page.keyboard.type('because of the storm.', { delay: 30 });
  await page.waitForTimeout(900);

  const typed = await page.evaluate(s => {
    const el = document.querySelector(s);
    return { value: el.value, focused: document.activeElement === el };
  }, box);
  ok('every word and space lands in the box', typed.value === 'No service this Sunday because of the storm.', typed.value);
  ok('and the box still has the keyboard', typed.focused);
  ok('nothing is written while typing', writes.length === 0, JSON.stringify(writes));

  /* ---------------------------------------------------------------- save */

  await page.click('[data-action="admin-banner-save"]');
  await page.waitForSelector('[data-action="admin-banner-edit"]', { timeout: 5000 });
  ok('Save writes the words once',
    writes.length === 1 && writes[0].key === 'home_banner_message' &&
    writes[0].body.value_text === 'No service this Sunday because of the storm.', JSON.stringify(writes));
  ok('and without Notify, nobody is told', rpcs.length === 0);

  /* ------------------------------------------------------ notify everyone */

  writes.length = 0;
  await page.click('[data-action="admin-banner-edit"]');
  await page.waitForSelector(box);
  const notifySwitch = '[data-action="admin-banner-notify-toggle"]';
  ok('Notify everyone starts off', await page.getAttribute(notifySwitch, 'aria-checked') === 'false');
  await page.click(box);
  await page.keyboard.press('End');
  await page.keyboard.type(' Stay safe.');
  await page.click(notifySwitch);
  ok('and flips on', await page.getAttribute(notifySwitch, 'aria-checked') === 'true');
  ok('without losing what was typed',
    (await page.inputValue(box)).endsWith('Stay safe.'));
  await page.click('[data-action="admin-banner-save"]');
  await page.waitForSelector('[data-action="admin-banner-edit"]', { timeout: 5000 });
  await page.waitForTimeout(300);

  ok('Notify saves the words, then turns the banner on',
    writes.length === 2 && writes[0].key === 'home_banner_message' &&
    writes[1].key === 'home_banner_on' && writes[1].body.value_bool === true, JSON.stringify(writes));
  ok('then sends the banner as it now stands',
    rpcs.length === 1 && rpcs[0].on === true && /Stay safe\.$/.test(rpcs[0].banner), JSON.stringify(rpcs));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'banner-settings.png') });

  ok('no script errors along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
