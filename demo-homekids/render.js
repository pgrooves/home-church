/* ===========================================================================
   HomeKids, rendered from the real app with sample rows.

   Not a mockup. This serves the repo exactly as the phone loads it, answers
   the two HomeKids REST calls with sample.json, and lets js/content.js map
   them the way it will map the real tables. Every other table is refused, so
   the rest of the app falls back to its bundled seed and nothing here touches
   the live project.

     node demo-homekids/render.js [out-dir]

   Writes PNGs: the ••• overlay with HomeKids in it, the page top to bottom in
   light and dark, the monthly report and the PDF it saves, and the empty state the page shows today.
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('../tests/e2e/past-the-gate');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
const PORT = Number(process.env.HC_KIDS_PORT || 8251);
const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

function chrome() {
  if (process.env.HC_E2E_CHROME) return process.env.HC_E2E_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium/.test(d)).sort();
    for (let i = dirs.length - 1; i >= 0; i--) {
      for (const rel of [['chrome-linux', 'chrome'], ['chrome-linux', 'headless_shell']]) {
        const exe = path.join(root, dirs[i], ...rel);
        if (fs.existsSync(exe)) return exe;
      }
    }
  } catch (e) { /* fall through */ }
  return null;
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

async function phone(browser, opts) {
  const page = await browser.newPage({
    viewport: { width: 390, height: opts.height || 844 },
    deviceScaleFactor: 2, hasTouch: true,
    colorScheme: opts.dark ? 'dark' : 'light'
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // Supabase: the two HomeKids tables answer with the sample, everything else
  // is refused so nothing reaches the live project.
  await page.route('**/*.supabase.co/**', route => {
    const url = route.request().url();
    const table = (url.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    if (!opts.empty && table && SAMPLE[table]) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(SAMPLE[table]) });
    }
    return route.fulfill({ status: 404, body: '[]' });
  });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html?v=homekids');
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await pastTheGate(page);
  await page.evaluate((dark) => {
    window.HC.store.updateProfile({ theme: dark ? 'dark' : 'light' });
    window.HC.store.applyPreferences();
  }, !!opts.dark);
  if (!opts.empty) {
    await page.waitForFunction(() => window.HC.data.homekidsLessons.length > 0, null, { timeout: 15000 });
  }
  if (opts.group) await page.evaluate(g => window.HC.store.setKidsGroup(g), opts.group);
  if (opts.ticks) {
    await page.evaluate(ticks => ticks.forEach(t =>
      window.HC.store.toggleKidsChecked('homekids-2026-09-27', t)), opts.ticks);
  }
  if (opts.name) await page.evaluate(n => window.HC.store.setKidsName(n), opts.name);
  await page.evaluate(() => window.HC.router.go({ name: 'homekids' }, { force: true }));
  await page.waitForTimeout(700);
  page.errors = errors;
  return page;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const errors = [];

  // 1. The ••• overlay, with HomeKids in the top half.
  let page = await phone(browser, {});
  await page.evaluate(() => window.HC.router.go({ name: 'home' }));
  await page.waitForTimeout(500);
  await page.click('#hc-navfab');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '01-nav-overlay.png') });
  errors.push(...page.errors);
  await page.close();

  // 2. The page, top to bottom, light, Heroes picked, two of four ticked.
  page = await phone(browser, { height: 4200, group: 'heroes', ticks: ['story', 'verse'] });
  await page.screenshot({ path: path.join(OUT, '02-homekids-full-light.png') });
  errors.push(...page.errors);
  await page.close();

  // 3. The first screenful, as a phone actually shows it.
  page = await phone(browser, { group: 'heroes', ticks: ['story', 'verse'] });
  await page.screenshot({ path: path.join(OUT, '03-homekids-top.png') });
  // and scrolled to the checklist
  await page.evaluate(() => {
    const el = document.querySelector('[data-kids-reward]');
    document.getElementById('hc-scroll').scrollTop = el.getBoundingClientRect().top - 140;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '04-homekids-checklist.png') });
  errors.push(...page.errors);
  await page.close();

  // 4. Dark, Champions, all four done.
  page = await phone(browser, { height: 4200, dark: true, group: 'champions',
    ticks: ['story', 'verse', 'talk', 'pray'] });
  await page.screenshot({ path: path.join(OUT, '05-homekids-full-dark.png') });
  errors.push(...page.errors);
  await page.close();

  // 4b. Dark, at a phone's height: the group's questions, then the finished list.
  page = await phone(browser, { dark: true, group: 'champions',
    ticks: ['story', 'verse', 'talk', 'pray'] });
  for (const [sel, file] of [['[data-kids-group-block]', '05a-dark-questions.png'],
                             ['[data-kids-reward]', '05b-dark-checklist-done.png']]) {
    await page.evaluate(s => {
      const el = document.querySelector(s);
      const sc = document.getElementById('hc-scroll');
      sc.scrollTop += el.getBoundingClientRect().top - 140;
    }, sel);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, file) });
  }
  errors.push(...page.errors);
  await page.close();

  // 5. The monthly report, all four done, with a name on it, then the month
  //    before, then the PDF it saves (a browser download here).
  page = await phone(browser, { group: 'legends', ticks: ['story', 'verse', 'talk', 'pray'],
    name: 'Ava and Leo' });
  await page.evaluate(() => {
    const el = document.querySelector('[data-kids-reward]');
    document.getElementById('hc-scroll').scrollTop += el.getBoundingClientRect().top - 140;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '06-checklist-saved.png') });
  await page.evaluate(() => document.querySelector('[data-action="homekids-report"]').click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '06a-monthly-report.png') });
  await page.evaluate(() => {
    const card = document.querySelector('.hc-kids-teacher__card');
    card.scrollTop = card.scrollHeight;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '06b-monthly-report-end.png') });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.evaluate(() => document.querySelector('[data-action="homekids-report-pdf"]').click())
  ]);
  await download.saveAs(path.join(OUT, '06c-' + download.suggestedFilename()));
  await page.evaluate(() => document.querySelector('[data-action="homekids-report-step"][data-step="1"]').click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '06d-monthly-report-month-before.png') });
  errors.push(...page.errors);
  await page.close();

  // 6. Today, before any lesson or email exists.
  page = await phone(browser, { empty: true });
  await page.screenshot({ path: path.join(OUT, '07-homekids-empty.png') });
  errors.push(...page.errors);
  await page.close();

  await browser.close();
  server.close();
  console.log('wrote', fs.readdirSync(OUT).length, 'images to', OUT);
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})();
