/* ===========================================================================
   Coffee, rendered from the real app with sample rows.

   Not the mockup (that is render-mockup.js). This serves the repo exactly as
   the phone loads it, signs a pretend person in, fixes the clock to a Sunday
   morning, and answers the cafe's REST and function calls from sample.json.
   Every other Supabase call is refused, so nothing touches the live project
   and nothing reaches Square.

     node demo-happy-lion-cafe/render.js [out-dir]   # default: demo-happy-lion-cafe/out-app

   Writes PNGs: the ••• menu with Coffee in it, the menu, a drink's sheet, the
   order with pickup times, the ticket, the counter's queue, the menu in dark,
   and Admin's Pages switches.
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('../tests/e2e/past-the-gate');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out-app'));
const PORT = Number(process.env.HC_CAFE_PORT || 8253);
const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample.json'), 'utf8'));

// Sunday 4 October 2026, 8:30 in the morning in New Orleans.
const SUNDAY = new Date('2026-10-04T13:30:00Z');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

function chrome() {
  if (process.env.HC_E2E_CHROME) return process.env.HC_E2E_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-/.test(d)).sort().reverse();
    for (const d of dirs) {
      const exe = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) { /* fall through */ }
  return undefined;
}

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

function answer(url, accept) {
  const send = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (/\/rest\/v1\/app_settings/.test(url)) {
    let rows = SAMPLE.app_settings.map(r => {
      if (r.key === 'cafe_on' && answer.cafeOff) return Object.assign({}, r, { value_bool: false });
      if (r.key === 'cafe_open_override' && answer.closed) return Object.assign({}, r, { value_text: 'closed 2026-10-04' });
      return r;
    });
    const only = (url.match(/key=eq\.([a-z_]+)/) || [])[1];
    if (only) rows = rows.filter(r => r.key === only);
    return send(rows);
  }
  if (/\/rpc\/hc_admin_list_users/.test(url)) return send(SAMPLE.users);
  if (/\/rest\/v1\/profiles/.test(url)) return send(/pgrst\.object/.test(accept) ? SAMPLE.profile : [SAMPLE.profile]);
  if (/\/rpc\/hc_cafe_slot_load/.test(url)) return send(SAMPLE.slot_load);
  if (/\/rpc\/hc_cafe_ahead/.test(url)) return send(3);
  if (/\/rpc\/hc_cafe_queue/.test(url)) return send(SAMPLE.queue);
  if (/\/rest\/v1\/cafe_orders/.test(url)) {
    return send(/pgrst\.object/.test(accept) ? SAMPLE.order : (/status=in/.test(url) ? [SAMPLE.order] : []));
  }
  if (/\/functions\/v1\/cafe-checkout/.test(url)) return send({ status: 'paid', ticket_no: 14 });
  return { status: 404, body: '[]' };
}

async function phone(browser, opts) {
  const page = await browser.newPage({
    viewport: { width: 390, height: opts.height || 844 },
    deviceScaleFactor: 2, hasTouch: true,
    colorScheme: opts.dark ? 'dark' : 'light'
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.setFixedTime(SUNDAY);

  await page.route('**/*.supabase.co/**', route => {
    const req = route.request();
    return route.fulfill(answer(req.url(), req.headers().accept || ''));
  });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  // A pretend session, an hour from expiring, so nothing tries to refresh it.
  await page.evaluate((p) => {
    window.HC.store.storage.set('session', {
      accessToken: 'demo', refreshToken: 'demo', expiresAt: Date.now() + 3600000,
      user: { id: p.id, email: 'trey@example.org' }
    });
  }, SAMPLE.profile);
  await page.reload();
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await pastTheGate(page);
  await page.evaluate((o) => {
    window.HC.store.updateProfile({ theme: o.dark ? 'dark' : 'light', firstName: 'Trey', canRunCafe: !o.customer });
    window.HC.store.applyPreferences();
  }, { dark: !!opts.dark, customer: !!opts.customer });
  if (opts.admin) {
    await page.evaluate(() => window.HC.store.updateProfile({ role: 'admin' }));
  }
  await page.waitForFunction((off) => window.HC.data.setting('cafe_on', !off) === !off, !!opts.cafeOff, { timeout: 15000 });
  page.errors = errors;
  return page;
}

async function go(page, route) {
  await page.evaluate(r => window.HC.router.go(r, { force: true }), route);
  await page.waitForTimeout(900);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ executablePath: chrome() });
  const errors = [];
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

  // The ••• menu, with Coffee between Give and Settings.
  let page = await phone(browser, {});
  await go(page, { name: 'home' });
  await page.click('#hc-navfab');
  await page.waitForTimeout(700);
  await shot(page, '01-nav-menu.png');
  errors.push(...page.errors);
  await page.close();

  // The menu, with two drinks already in the order.
  page = await phone(browser, {});
  await page.evaluate(() => {
    window.HC.cafe.clearCart();
    window.HC.cafe.addLine({ item_id: 'hot-coffee', size: '16oz', options: { half_and_half: 'regular', sugar: 2 } });
    window.HC.cafe.addLine({ item_id: 'cold-brew', size: '12oz', options: { two_percent: 'light', splenda: 1 } });
  });
  await go(page, { name: 'cafe' });
  await shot(page, '02-menu.png');

  // A drink's sheet.
  await page.click('[data-cafe="open"][data-id="hot-coffee"]');
  await page.waitForTimeout(300);
  await page.click('[data-cafe="size"][data-id="16oz"]');
  await page.click('[data-cafe="level"][data-key="half_and_half"][data-id="regular"]');
  await page.click('[data-cafe="more"][data-key="sugar"]');
  await page.click('[data-cafe="more"][data-key="sugar"]');
  await page.waitForTimeout(500);
  await shot(page, '03-drink-sheet.png');
  await page.evaluate(() => document.querySelector('[data-cafe="close"]').click());

  // The order, a time picked.
  await go(page, { name: 'cafe', id: 'order' });
  await page.click('[data-cafe="slot"][data-id="0920"]');
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 1500 });
  await page.waitForTimeout(300);
  await shot(page, '04-order.png');
  errors.push(...page.errors);
  await page.close();

  // The ticket.
  page = await phone(browser, {});
  await go(page, { name: 'cafe', id: 't-' + SAMPLE.order.id });
  await page.waitForTimeout(800);
  await shot(page, '05-ticket.png');
  errors.push(...page.errors);
  await page.close();

  // The counter.
  page = await phone(browser, { height: 1700 });
  await go(page, { name: 'cafe', id: 'queue' });
  await page.waitForTimeout(800);
  await shot(page, '06-queue.png');
  errors.push(...page.errors);
  await page.close();

  // The menu, dark.
  page = await phone(browser, { dark: true });
  await go(page, { name: 'cafe' });
  await shot(page, '07-menu-dark.png');
  errors.push(...page.errors);
  await page.close();

  // Manage users, the cafe owner's row open: Cafe mode, beside Leader mode.
  page = await phone(browser, { height: 1400, admin: true });
  await go(page, { name: 'admin', id: 'users' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const fold = document.querySelector('[data-action="admin-user-fold"][data-id="members"]');
    if (fold) fold.click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const el = document.querySelector('[data-action="admin-barista"]');
    if (el) document.getElementById('hc-scroll').scrollTop += el.getBoundingClientRect().top - 420;
  });
  await page.waitForTimeout(300);
  await shot(page, '08-manage-users-cafe-mode.png');
  errors.push(...page.errors);
  await page.close();

  // The owner, in Cafe mode, before the church has turned the page on: Coffee
  // is in his menu, and the page says nobody else can see it yet.
  answer.cafeOff = true;
  page = await phone(browser, { cafeOff: true });
  await go(page, { name: 'cafe' });
  await shot(page, '09-cafe-mode-page-off.png');
  errors.push(...page.errors);
  await page.close();
  answer.cafeOff = false;

  // Open and closed, as a customer sees it under the logo.
  page = await phone(browser, { customer: true });
  await go(page, { name: 'cafe' });
  await page.screenshot({ path: path.join(OUT, '10-customer-open.png'), clip: { x: 0, y: 0, width: 390, height: 560 } });
  errors.push(...page.errors);
  await page.close();
  answer.closed = true;
  page = await phone(browser, { customer: true });
  await go(page, { name: 'cafe' });
  await page.screenshot({ path: path.join(OUT, '11-customer-closed.png'), clip: { x: 0, y: 0, width: 390, height: 560 } });
  errors.push(...page.errors);
  await page.close();
  page = await phone(browser, { height: 700 });
  await go(page, { name: 'cafe', id: 'queue' });
  await page.waitForTimeout(800);
  await shot(page, '13-queue-closed-off-day.png');
  errors.push(...page.errors);
  await page.close();
  page = await phone(browser, { customer: true, dark: true });
  await go(page, { name: 'cafe' });
  await page.screenshot({ path: path.join(OUT, '12-customer-closed-dark.png'), clip: { x: 0, y: 0, width: 390, height: 560 } });
  errors.push(...page.errors);
  await page.close();
  answer.closed = false;

  await browser.close();
  server.close();
  console.log('wrote', fs.readdirSync(OUT).length, 'images to', OUT);
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
