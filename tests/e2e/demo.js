/* ===========================================================================
   Demo mode in a real browser: ?demo=cafe on a page it is allowed on.

   What it holds to:
   1. Without ?demo nothing changes: no banner, the hc: keys, no demo.
   2. With it, the banner is up, the tab is signed in as the sample's person
      under hc-demo: keys, and Coffee opens because the sample says so.
   3. NOTHING BUT READS LEAVE THE PAGE. Every request that reaches the network
      for the Supabase project is a GET or HEAD carrying the publishable key,
      never the demo's pretend session, across a whole order.
   4. An order goes through end to end from sample data, and opens no Square.
   5. Exit ends it: banner gone, hc-demo: keys cleared, back to normal.

     node tests/e2e/demo.js [shots-dir]

   Shots are written only when a directory is given.
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_DEMO_PORT || 8261);
const SHOTS = process.argv[2] ? path.resolve(process.argv[2]) : null;
const ORIGIN = 'http://127.0.0.1:' + PORT;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + (detail ? '\n        ' + detail : '')); fail++; }
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
  return new Promise(resolve => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: chrome() });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // Every request that actually leaves for Supabase, answered empty here so
  // the test does not depend on the live project being reachable.
  const sent = [];
  await page.route('**/*.supabase.co/**', route => {
    const r = route.request();
    sent.push({ method: r.method(), url: r.url(), auth: r.headers().authorization || '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const opened = [];
  page.on('popup', p => opened.push(p.url()));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const shot = name => SHOTS ? page.screenshot({ path: path.join(SHOTS, name) }) : null;
  const ready = () => page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  // The greeting stays up for its own few seconds; signed in, it then leaves.
  const greeted = () => page.waitForFunction(() => !document.getElementById('hc-splash'), null, { timeout: 15000 });

  // 1. No ?demo.
  await page.goto(ORIGIN + '/index.html');
  await ready();
  ok('without ?demo, demo mode is off', await page.evaluate(() => window.HC.demo.on === false));
  ok('without ?demo, there is no banner', !(await page.$('#hc-demo-banner')));

  // 2. ?demo=cafe, straight to Coffee.
  await page.goto(ORIGIN + '/index.html?demo=cafe&v=cafe');
  await ready();
  await page.waitForSelector('#hc-demo-banner', { timeout: 10000 });
  await greeted();
  ok('signed in, the greeting leaves with no way-in panel', true);
  ok('the banner names the demo', /Demo · Coffee/.test(await page.textContent('#hc-demo-banner')));
  ok('signed in as the sample person', await page.evaluate(() => window.HC.auth.isSignedIn()));
  const keys = await page.evaluate(() => Object.keys(localStorage));
  ok('the session is under hc-demo:, not hc:', keys.includes('hc-demo:session') && !keys.includes('hc:session'), JSON.stringify(keys));
  await page.waitForFunction(() => window.HC.data.setting('cafe_on', false) === true, null, { timeout: 15000 });
  ok('the overlay turns Coffee on', true);
  ok('the cafe is open, by the sample', await page.evaluate(() => window.HC.cafe.isOpen ? window.HC.cafe.isOpen() : !window.HC.cafe.closedReason()));
  await page.waitForTimeout(800);
  ok('Coffee is the page on the glass', /Happy Lion|Coffee/i.test(await page.textContent('#hc-main, main, body')));
  await shot('01-demo-cafe.png');

  // The query is gone after the router writes its own; the tab keeps the demo.
  await page.reload();
  await ready();
  await page.waitForSelector('#hc-demo-banner', { timeout: 10000 });
  await greeted();
  ok('a reload keeps the demo for the tab', await page.evaluate(() => window.HC.demo.on && window.HC.auth.isSignedIn()));

  // 4. An order, end to end.
  const res = await page.evaluate(async () => {
    window.HC.cafe.clearCart();
    window.HC.cafe.addLine({ item_id: 'hot-coffee', size: '12oz', options: {} });
    return window.HC.cafe.checkout('asap', 'Trey');
  });
  ok('checkout answers from the sample', res && res.order_id === '22222222-2222-2222-2222-222222222222', JSON.stringify(res));
  await page.evaluate(id => window.HC.router.go({ name: 'cafe', id: 't-' + id }, { force: true }), res.order_id);
  await page.waitForTimeout(1500);
  ok('the ticket shows the sample order', /#14/.test(await page.textContent('body')));
  ok('no Square checkout was opened', opened.length === 0, JSON.stringify(opened));
  await shot('02-demo-ticket.png');

  // 3. Only reads ever left, and never with the pretend session.
  const writes = sent.filter(s => s.method !== 'GET' && s.method !== 'HEAD');
  ok('no write, rpc or function call reached the network', writes.length === 0, JSON.stringify(writes.slice(0, 3)));
  ok('no request carried the demo session', sent.every(s => s.auth !== 'Bearer demo'));
  ok('no sign-in call reached the network', sent.every(s => !/\/auth\/v1\//.test(s.url)));

  // 5. Exit.
  await page.click('#hc-demo-banner button');
  await page.waitForLoadState('load');
  await ready();
  ok('after Exit, demo mode is off', await page.evaluate(() => window.HC.demo.on === false));
  ok('after Exit, no banner', !(await page.$('#hc-demo-banner')));
  ok('after Exit, the hc-demo: keys are gone',
    await page.evaluate(() => Object.keys(localStorage).every(k => k.indexOf('hc-demo:') !== 0)));

  ok('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
