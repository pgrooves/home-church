/* ===========================================================================
   The Admin screen's guards against a stray tap, driven.

     settings boxes       Typing in an App settings text box writes nothing.
                          Save writes it once. The video wrapper refuses
                          something that is not a link, and asks before it
                          changes, and Cancel on that question writes nothing.
     page switches        Turning a page on asks first, and Cancel leaves it
                          off. Turning it off does not ask.
     tell everybody       Posting with Tell everybody on asks first, and
                          Cancel posts nothing and notifies nobody. Posting
                          with it off does not ask.
     the owner            The owner's row on the people list has no Make a
                          member or Remove. Everybody else's still does.

   NO SUPABASE. Same fake as tests/e2e/banner.js.

     node tests/e2e/admin-safety.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_SAFETY_PORT || 8247);
const ORIGIN = 'http://127.0.0.1:' + PORT;
const SHOTS = process.env.HC_SAFETY_SHOTS || '';

const ADMIN = 'admin@e2e.test';
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
  ', PASSWORD_ACCOUNTS: ' + JSON.stringify([ADMIN]) +
  ' }; })(window.HC = window.HC || {});\n';

const WRAPPER = 'https://pgrooves.github.io/home-church';

// Maintenance on only so the admin can sign in through the cover, which is
// the sign-in path tests/e2e/maintenance.js already drives.
const settings = {
  maintenance_mode_on: { key: 'maintenance_mode_on', label: 'Maintenance mode',
    kind: 'boolean', value_bool: true, value_text: null, sort_order: 5 },
  announcement_push_default: { key: 'announcement_push_default',
    label: 'Start new announcements with notification on', kind: 'boolean',
    value_bool: true, value_text: null, sort_order: 15 },
  homekids_on: { key: 'homekids_on', label: 'HomeKids page', kind: 'boolean',
    value_bool: false, value_text: null, sort_order: 35 },
  home_embed_base: { key: 'home_embed_base', label: 'Video wrapper URL', kind: 'text',
    value_bool: null, value_text: WRAPPER, sort_order: 50 },
  cafe_opens_at: { key: 'cafe_opens_at', label: 'Cafe: opens at', kind: 'text',
    value_bool: null, value_text: '07:50', sort_order: 60 }
};

const USERS = [
  { id: 'e2e-admin', email: ADMIN, first_name: 'Ada', last_name: '', role: 'admin',
    is_leader: false, is_barista: false },
  { id: 'e2e-owner', email: 'owner@e2e.test', first_name: 'Owen', last_name: '', role: 'admin',
    is_leader: false, is_barista: false },
  { id: 'e2e-member', email: 'member@e2e.test', first_name: 'Mo', last_name: '', role: 'member',
    is_leader: false, is_barista: false }
];
let owners = [{ id: 'e2e-owner' }];

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
    return json(res, 200, {
      access_token: 'access', refresh_token: 'refresh', expires_in: 3600,
      user: { id: 'e2e-admin', email: sent.email }
    });
  }

  if (url.startsWith('/supabase/rest/v1/profiles')) {
    return json(res, 200, { id: 'e2e-admin', first_name: 'Ada', role: 'admin', can_host: true });
  }

  if (url.startsWith('/supabase/rest/v1/app_settings')) {
    if (req.method === 'PATCH') {
      const key = decodeURIComponent((req.url.match(/key=eq\.([^&]+)/) || [])[1] || '');
      writes.push({ table: 'app_settings', key: key, body: sent });
      if (settings[key]) Object.assign(settings[key], sent);
      res.writeHead(204); return res.end();
    }
    if (req.method === 'POST') {
      writes.push({ table: 'app_settings', key: sent.key, body: sent });
      settings[sent.key] = Object.assign(settings[sent.key] || {}, sent);
      res.writeHead(201); return res.end();
    }
    if (req.url.indexOf('select=value_bool') !== -1) {
      return json(res, 200, [{ value_bool: settings.maintenance_mode_on.value_bool }]);
    }
    return json(res, 200, Object.keys(settings).map(k => settings[k]));
  }

  if (url.startsWith('/supabase/rest/v1/announcements') && req.method !== 'GET') {
    writes.push({ table: 'announcements', method: req.method, body: sent });
    const row = Object.assign({ id: sent.id || 'ann-1' }, sent);
    return json(res, req.method === 'POST' ? 201 : 200, [row]);
  }

  if (url.startsWith('/supabase/rest/v1/rpc/hc_admin_list_users')) return json(res, 200, USERS);
  if (url.startsWith('/supabase/rest/v1/rpc/hc_admin_owner_ids')) {
    if (!owners) return json(res, 404, { message: 'Could not find the function' });
    return json(res, 200, owners);
  }
  if (url.startsWith('/supabase/rest/v1/rpc/')) {
    rpcs.push(url.replace('/supabase/rest/v1/rpc/', ''));
    return json(res, 200, null);
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

const settingsWrites = () => writes.filter(w => w.table === 'app_settings');
const announcementWrites = () => writes.filter(w => w.table === 'announcements');

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const noise = [];

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', e => noise.push('pageerror: ' + String(e)));

  // Every question the app asks, and the answer this test gives it.
  let answer = 'accept';
  const asked = [];
  page.on('dialog', d => { asked.push(d.message()); return answer === 'accept' ? d.accept() : d.dismiss(); });

  await page.goto(ORIGIN + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.maintenance && window.HC.router,
    null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await signIn(page, ADMIN);
  await page.waitForFunction(() => !document.getElementById('hc-maintenance'), null, { timeout: 8000 });

  /* ------------------------------------------------------- settings boxes */

  await page.evaluate(() => window.HC.router.go({ name: 'admin', id: 'settings' }));
  const wrapperBox = '[data-admin-field="setting"][data-id="home_embed_base"]';
  const wrapperSave = '[data-action="admin-setting-save"][data-id="home_embed_base"]';
  await page.waitForSelector(wrapperBox, { timeout: 8000 });

  ok('every settings text box has a Save button',
    await page.$(wrapperSave) !== null &&
    await page.$('[data-action="admin-setting-save"][data-id="cafe_opens_at"]') !== null);

  await page.click(wrapperBox);
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(900);   // longer than the old 400ms save-as-you-type
  ok('a stray keystroke in the video wrapper box writes nothing',
    settingsWrites().length === 0, JSON.stringify(writes));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'settings-save.png') });

  await page.fill(wrapperBox, 'not a link');
  await page.click(wrapperSave);
  await page.waitForTimeout(300);
  ok('Save refuses a wrapper that is not a link', settingsWrites().length === 0, JSON.stringify(writes));

  asked.length = 0;
  answer = 'dismiss';
  await page.fill(wrapperBox, WRAPPER + '-new');
  await page.click(wrapperSave);
  await page.waitForTimeout(400);
  ok('Save on the video wrapper asks first',
    asked.length === 1 && /every video/.test(asked[0]), JSON.stringify(asked));
  ok('and Cancel writes nothing', settingsWrites().length === 0, JSON.stringify(writes));

  answer = 'accept';
  await page.click(wrapperSave);
  await page.waitForTimeout(600);
  ok('and OK writes it once',
    settingsWrites().length === 1 && settingsWrites()[0].key === 'home_embed_base' &&
    settingsWrites()[0].body.value_text === WRAPPER + '-new', JSON.stringify(writes));

  writes.length = 0;
  asked.length = 0;
  const opensBox = '[data-admin-field="setting"][data-id="cafe_opens_at"]';
  await page.fill(opensBox, '08:00');
  await page.waitForTimeout(900);
  ok('another box writes nothing while typing', settingsWrites().length === 0, JSON.stringify(writes));
  await page.click('[data-action="admin-setting-save"][data-id="cafe_opens_at"]');
  await page.waitForTimeout(600);
  ok('and Save writes it once, without asking',
    settingsWrites().length === 1 && settingsWrites()[0].body.value_text === '08:00' &&
    asked.length === 0, JSON.stringify({ writes, asked }));

  /* -------------------------------------------------------- page switches */

  writes.length = 0;
  asked.length = 0;
  answer = 'dismiss';
  const homekids = '[data-action="admin-page-toggle"][data-id="homekids_on"]';
  await page.click(homekids);
  await page.waitForTimeout(400);
  ok('turning a page on asks first',
    asked.length === 1 && /Turn on HomeKids\?/.test(asked[0]), JSON.stringify(asked));
  ok('and Cancel leaves it off and writes nothing',
    settingsWrites().length === 0 && await page.getAttribute(homekids, 'aria-checked') === 'false',
    JSON.stringify(writes));

  answer = 'accept';
  await page.click(homekids);
  await page.waitForTimeout(600);
  ok('and OK turns it on',
    settingsWrites().length === 1 && settingsWrites()[0].key === 'homekids_on' &&
    settingsWrites()[0].body.value_bool === true, JSON.stringify(writes));

  asked.length = 0;
  writes.length = 0;
  await page.click(homekids);
  await page.waitForTimeout(600);
  ok('turning it off does not ask',
    asked.length === 0 && settingsWrites().length === 1 &&
    settingsWrites()[0].body.value_bool === false, JSON.stringify({ writes, asked }));

  asked.length = 0;
  answer = 'dismiss';
  await page.click('[data-action="admin-page-toggle"][data-id="cafe_on"]');
  await page.waitForTimeout(300);
  ok('the cafe says it takes real orders',
    asked.length === 1 && /order and pay/.test(asked[0]), JSON.stringify(asked));

  asked.length = 0;
  await page.click('[data-action="admin-group-mode-toggle"]');
  await page.waitForTimeout(300);
  ok('Group mode asks too', asked.length === 1 && /Turn on Group\?/.test(asked[0]), JSON.stringify(asked));

  /* ------------------------------------------------------- tell everybody */

  writes.length = 0;
  asked.length = 0;
  await page.evaluate(() => window.HC.router.go({ name: 'admin', id: 'announcements' }));
  await page.waitForSelector('[data-action="admin-announcement-new"]', { timeout: 8000 });
  await page.click('[data-action="admin-announcement-new"]');
  await page.waitForSelector('[data-admin-field="title"]');
  await page.fill('[data-admin-field="title"]', 'Testing');
  ok('Tell everybody starts on',
    await page.getAttribute('[data-action="admin-draft-toggle"][data-id="notify"]', 'aria-checked') === 'true');

  answer = 'dismiss';
  await page.click('[data-action="admin-announcement-save"]');
  await page.waitForTimeout(500);
  ok('Post it with Tell everybody on asks first',
    asked.length === 1 && /“Testing”/.test(asked[0]) && /turn off Tell everybody/.test(asked[0]),
    JSON.stringify(asked));
  ok('and Cancel posts nothing and tells nobody',
    announcementWrites().length === 0 && rpcs.indexOf('hc_admin_send_announcement') === -1,
    JSON.stringify({ writes, rpcs }));
  ok('and the draft is still there',
    await page.inputValue('[data-admin-field="title"]') === 'Testing');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'announcement-draft.png') });

  asked.length = 0;
  await page.click('[data-action="admin-draft-toggle"][data-id="notify"]');
  await page.click('[data-action="admin-announcement-save"]');
  await page.waitForTimeout(800);
  ok('with Tell everybody off, Post it does not ask', asked.length === 0, JSON.stringify(asked));
  ok('and posts without a notification',
    announcementWrites().length >= 1 && rpcs.indexOf('hc_admin_send_announcement') === -1,
    JSON.stringify({ writes, rpcs }));

  /* ------------------------------------------------------------ the owner */

  await page.evaluate(() => window.HC.router.go({ name: 'menu' }));
  await page.evaluate(() => window.HC.router.go({ name: 'admin', id: 'users' }));
  await page.waitForSelector('[data-user-search]', { state: 'attached', timeout: 8000 });
  await page.waitForTimeout(500);
  // Open the Admins fold, which is where the owner is.
  const fold = await page.$('[data-action="admin-user-fold"][data-id="admins"]');
  if (fold && await fold.getAttribute('aria-expanded') !== 'true') await fold.click();
  await page.waitForTimeout(300);

  const rowFor = (email) => page.evaluate((email) => {
    const row = Array.from(document.querySelectorAll('[data-user-search]'))
      .filter(el => el.textContent.indexOf(email) !== -1)[0];
    if (!row) return null;
    return {
      text: row.textContent,
      remove: !!row.querySelector('[data-action="admin-user-remove"]'),
      role: !!row.querySelector('[data-action="admin-role"]')
    };
  }, email);

  let owner = await rowFor('owner@e2e.test');
  ok('the owner’s row says so', owner && /Owner/.test(owner.text), JSON.stringify(owner));
  ok('and has no Make a member or Remove', owner && !owner.remove && !owner.role, JSON.stringify(owner));
  const member = await rowFor('member@e2e.test');
  ok('everybody else’s row still has both', member && member.remove && member.role, JSON.stringify(member));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'people-owner.png'), fullPage: false });

  ok('no script errors along the way', noise.length === 0, noise.join('\n        '));
  await context.close();

  /* ------------- a project without 0095: every row looks the way it did */

  owners = null;
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await second.newPage();
  const noise2 = [];
  p2.on('pageerror', e => noise2.push('pageerror: ' + String(e)));
  await p2.goto(ORIGIN + '/index.html');
  await p2.waitForFunction(() => window.HC && window.HC.maintenance && window.HC.router,
    null, { timeout: 15000 });
  await p2.waitForTimeout(1500);
  await signIn(p2, ADMIN);
  await p2.waitForFunction(() => !document.getElementById('hc-maintenance'), null, { timeout: 8000 });
  await p2.evaluate(() => window.HC.router.go({ name: 'admin', id: 'users' }));
  await p2.waitForSelector('[data-user-search]', { state: 'attached', timeout: 8000 });
  await p2.waitForTimeout(500);
  const before = await p2.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[data-user-search]'))
      .filter(el => el.textContent.indexOf('owner@e2e.test') !== -1)[0];
    return row ? !!row.querySelector('[data-action="admin-user-remove"]') : null;
  });
  ok('without the owner list, the buttons are drawn as before', before === true, String(before));
  ok('and nothing errors', noise2.length === 0, noise2.join('\n        '));
  await second.close();

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
