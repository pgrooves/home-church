/* ===========================================================================
   Approve, then notify: the Yes / More / No prompt, in a real browser, on
   the demo sample demo/approve-notify.json. Migration 0098.

   What it holds to:
   1. Approving an announcement asks "Notify everyone about this one, or add
      more?", and the card leaves the queue.
   2. The second asks to add it "to the notification with the first
      announcement"; the third and later "to the batch notification for the
      other announcements"; dates are asked about the same way.
   3. More holds the clock; Yes starts it; No leaves the row out and asks
      nothing of the server.
   4. While one is waiting, the Announcements screen counts down to it, can
      schedule it for a day and time instead, and Cancel push takes it away.
      Approving after it is scheduled joins it and leaves the time alone.
   5. Nothing but reads ever leaves the page.

     node tests/e2e/approve-notify.js [shots-dir]
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_APPROVE_PORT || 8263);
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true,
    timezoneId: 'America/Chicago' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());

  const sent = [];
  await page.route('**/*.supabase.co/**', route => {
    const r = route.request();
    sent.push({ method: r.method(), url: r.url() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const shot = name => SHOTS ? page.screenshot({ path: path.join(SHOTS, name) }) : null;

  // 2 pm on a Saturday in Metairie, so the clock is the daytime one whatever
  // time this runs. Quiet hours are pinned in the database test.
  await page.clock.install({ time: new Date('2026-11-07T20:00:00Z') });
  await page.goto(ORIGIN + '/index.html?demo=approve-notify&v=admin&id=announcements');
  await page.waitForFunction(() => window.HC && window.HC.router, null, { timeout: 15000 });
  await page.waitForFunction(() => !document.getElementById('hc-splash'), null, { timeout: 15000 });
  await page.waitForSelector('[data-action="admin-review-approve"][data-id="demo-holiday-market"]', { timeout: 15000 });
  ok('the queue is on screen', true);

  const sheetText = () => page.textContent('[data-sheet="notify-batch"]');
  const approve = async (action, id) => {
    await page.click('[data-action="' + action + '"][data-id="' + id + '"]');
    await page.waitForSelector('[data-sheet="notify-batch"]', { timeout: 10000 });
    await page.waitForTimeout(300);
  };
  const answer = async (which) => {
    await page.click('[data-sheet="notify-batch"] [data-action="notify-batch-' + which + '"]:not(.hc-sheet__scrim)');
    await page.waitForSelector('[data-sheet="notify-batch"]', { state: 'detached', timeout: 10000 });
    await page.waitForTimeout(400);
  };
  const strip = async () => {
    const el = await page.$('.hc-admin__batch');
    return el ? el.textContent() : '';
  };

  // 1. The first.
  await approve('admin-review-approve', 'demo-holiday-market');
  ok('in the daytime it says Yes sends in 5 minutes',
    /Yes sends it 5 minutes after your last Yes/.test(await sheetText()), await sheetText());
  ok('the first asks to notify or add more',
    /Notify everyone about this one, or add more\?/.test(await sheetText()), await sheetText());
  ok('it names what was approved', /Holiday Market, December 6/.test(await sheetText()));
  ok('Yes, More and No are offered', await page.evaluate(() =>
    ['yes', 'more', 'no'].every(w => document.querySelector(
      '[data-sheet="notify-batch"] .hc-btn[data-action="notify-batch-' + w + '"]'))));
  await shot('01-first-approval.png');

  await answer('more');
  ok('the approved card left the queue',
    !(await page.$('[data-action="admin-review-approve"][data-id="demo-holiday-market"]')));
  ok('More holds it', await page.evaluate(() => window.HC.notifyBatch.state().held === true));
  ok('the strip says one is waiting, held', /Notification waiting/.test(await strip()) && /Held/.test(await strip()), await strip());
  ok('a held clock says Paused', (await page.textContent('[data-batch-left]')) === 'Paused');
  ok('one thing: "Schedule this instead"', /Schedule this instead/.test(await strip()), await strip());

  // 2. The second.
  await approve('admin-review-approve', 'demo-baby-blessing');
  ok('the second asks to join the first announcement',
    /Add this to the notification with the first announcement and reset the 5 minute timer\?/.test(await sheetText()),
    await sheetText());
  await shot('02-second-approval.png');
  await answer('yes');
  ok('Yes starts the clock', await page.evaluate(() => {
    const s = window.HC.notifyBatch.state();
    return s.held === false && s.items.length === 2 && !!s.due_at;
  }));
  await page.waitForTimeout(1200);
  ok('the clock counts down from five minutes',
    /^[45]:\d\d$/.test(await page.textContent('[data-batch-left]')), await page.textContent('[data-batch-left]'));
  ok('more than one: "Schedule this batch instead"', /Schedule this batch instead/.test(await strip()), await strip());

  // 3. A date, third.
  await page.waitForSelector('[data-action="admin-event-approve"][data-id="demo-christmas-party"]', { timeout: 10000 });
  await approve('admin-event-approve', 'demo-christmas-party');
  ok('the third asks to join the batch for the other announcements',
    /Add this to the batch notification for the other announcements and reset the 5 minute timer\?/.test(await sheetText()),
    await sheetText());
  await answer('yes');

  // 4. No leaves one out.
  await approve('admin-review-approve', 'demo-serve-day');
  ok('the fourth mentions announcements and events',
    /for the other announcements and events/.test(await sheetText()), await sheetText());
  await answer('no');
  ok('No leaves it out', await page.evaluate(() => window.HC.notifyBatch.state().items.length === 3));

  const waiting = await strip();
  ok('the strip counts 2 announcements and 1 date', /2 announcements and 1 date/.test(waiting), waiting);
  ok('and says when it goes out',
    /Until it goes out at 2:0\d PM, 5 minutes after the last Yes/.test(waiting), waiting);
  await page.waitForTimeout(3500);   // let the toast go
  await page.evaluate(() => document.querySelector('.hc-admin__batch').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot('03-waiting-clock.png');

  // 5. Schedule this batch instead.
  await page.click('[data-action="notify-batch-schedule"]');
  await page.waitForSelector('[data-sheet="notify-batch-schedule"]', { timeout: 5000 });
  ok('the schedule sheet names the batch',
    /Schedule this batch/.test(await page.textContent('[data-sheet="notify-batch-schedule"]')));
  await page.click('[data-action="notify-batch-preset"][data-id="tomorrow"]');
  ok('a preset fills the day and time', await page.evaluate(() =>
    document.querySelector('[data-batch-sched="time"]').value === '09:00'));
  await shot('04-schedule-sheet.png');
  await page.click('[data-action="notify-batch-schedule-save"]');
  await page.waitForSelector('[data-sheet="notify-batch-schedule"]', { state: 'detached', timeout: 5000 });
  await page.waitForTimeout(400);
  ok('it is scheduled for tomorrow at 9', /Scheduled for tomorrow at 9:00 AM/.test(await strip()), await strip());
  ok('the button now changes the time', /Change the time/.test(await strip()), await strip());

  // 6. An approval after scheduling joins it and leaves the time alone.
  await approve('admin-event-approve', 'demo-holiday-market-date');
  ok('it asks to add to the scheduled notification',
    /Add this to the notification scheduled for tomorrow at 9:00 AM\?/.test(await sheetText()), await sheetText());
  ok('and offers only Yes and No', await page.evaluate(() =>
    !document.querySelector('[data-sheet="notify-batch"] .hc-btn[data-action="notify-batch-more"]')));
  await answer('yes');
  ok('still scheduled for tomorrow at 9', /Scheduled for tomorrow at 9:00 AM/.test(await strip()), await strip());
  ok('its own date does not count twice', /2 announcements and 1 date/.test(await strip()), await strip());
  await page.waitForTimeout(3500);
  await page.evaluate(() => document.querySelector('.hc-admin__batch').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot('05-scheduled.png');

  // 7. Cancel push.
  await page.click('[data-action="notify-batch-cancel"]');
  await page.waitForTimeout(500);
  ok('Cancel push takes it away', !(await page.$('.hc-admin__batch')));
  ok('and nothing is waiting', await page.evaluate(() => window.HC.notifyBatch.state().open === false));
  const writes = sent.filter(s => s.method !== 'GET' && s.method !== 'HEAD');
  ok('no write or rpc reached the network', writes.length === 0, JSON.stringify(writes.slice(0, 3)));
  ok('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
