/* ===========================================================================
   What to hear about, driven.

   The stop between the way in and Home on a phone's first trip through it.
   See js/notify-intro.js. What can go wrong with it, all of it silent:

     it never shows          js/gate.js hands over to it, and a missed
                             handoff looks exactly like the app before it.

     it shows every launch   A guest meets the gate on every cold launch. If
                             this came with it every time it would be a nag.

     the choice is dropped   Continue has to write the switches to the profile,
                             the same record Your account draws, or the screen
                             is decoration.

     iOS is asked twice      On a phone, boot used to ask iOS for permission
                             while the greeting was up, and a yes turned every
                             switch on. With this screen coming, that ask
                             waits for Continue, and a yes keeps the switches
                             as they were chosen.

   HOW A BROWSER PRETENDS TO BE A PHONE. The same way tests/e2e/reminders.js
   does: a Capacitor installed before the app's scripts run, here with a
   PushNotifications that counts the times it was asked.

     node tests/e2e/notify-intro.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_NOTIFY_PORT || 8252);

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

/* A phone that has never been asked. requestPermissions says yes and
   records when it was called, relative to the screen being up. */
const PRETEND_PHONE = () => {
  window.__hcPush = { asked: 0, askedWhileGateUp: 0, registered: 0 };
  let answer = 'prompt';
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      PushNotifications: {
        checkPermissions: () => Promise.resolve({ receive: answer }),
        requestPermissions: () => {
          window.__hcPush.asked++;
          if (window.HC && window.HC.gate && window.HC.gate.step()) {
            window.__hcPush.askedWhileGateUp++;
          }
          answer = 'granted';
          return Promise.resolve({ receive: 'granted' });
        },
        register: () => { window.__hcPush.registered++; return Promise.resolve(); },
        addListener: () => ({ remove: () => {} })
      }
    }
  };
};

async function toTheGate(page) {
  await page.waitForFunction(() => window.HC && window.HC.gate && window.HC.gate.step(),
    null, { timeout: 25000 });
  await page.waitForTimeout(700);
}

async function toTheSwitches(page) {
  await page.waitForSelector('.hc-splash--notify [data-notify-go]', { timeout: 8000 });
  await page.waitForTimeout(1200);
}

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  const noise = [];
  const listen = (page) => {
    page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
    page.on('console', m => {
      const text = m.text();
      if (m.type() === 'error' && !/ERR_|Failed to load resource|push:/.test(text)) {
        noise.push('console: ' + text);
      }
    });
  };

  /* ------------------------------------------------------------ a browser */

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  listen(page);
  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await toTheGate(page);
  await page.click('[data-gate="guest"]');
  await toTheSwitches(page);

  const shown = await page.evaluate(() => {
    const box = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    return {
      greeting: document.getElementById('hc-splash-greeting').textContent,
      rows: Array.from(document.querySelectorAll('[data-notify]'))
        .map(r => [r.getAttribute('data-notify'), r.getAttribute('aria-checked')]),
      lockup: box('.hc-splash__lockup'),
      list: box('.hc-notify__list'),
      go: box('[data-notify-go]'),
      hidden: document.getElementById('app').getAttribute('aria-hidden')
    };
  });

  ok('leaving the gate as a guest lands on what to hear about',
    shown.greeting === 'Stay in the loop.', shown.greeting);
  ok('with the switches from Your account, as they start',
    JSON.stringify(shown.rows) === JSON.stringify([
      ['newGuide', 'true'], ['newSermon', 'false'],
      ['sundayReminder', 'true'], ['announcements', 'true']
    ]), JSON.stringify(shown.rows));
  ok('the house and the title sit above the card, not on it',
    shown.lockup.bottom <= shown.list.top, JSON.stringify(shown));
  ok('and Continue is on the screen',
    shown.go.bottom <= 844, JSON.stringify(shown.go));
  ok('Home stays out of the accessibility tree while it is up',
    shown.hidden === 'true', String(shown.hidden));

  await page.click('[data-notify="newSermon"]');
  await page.click('[data-notify="announcements"]');
  await page.click('[data-notify-go]');
  await page.waitForFunction(() => !document.getElementById('hc-splash'), null, { timeout: 8000 });

  const after = await page.evaluate(() => ({
    view: document.getElementById('app').getAttribute('data-view'),
    n: window.HC.store.getProfile().notifications,
    hidden: document.getElementById('app').getAttribute('aria-hidden')
  }));
  ok('Continue reaches Home', after.view === 'home', after.view);
  ok('and the profile holds what was chosen',
    after.n.newSermon === true && after.n.announcements === false &&
    after.n.newGuide === true && after.n.sundayReminder === true, JSON.stringify(after.n));
  ok('the app is back in the accessibility tree', after.hidden === null, String(after.hidden));

  await page.reload();
  await toTheGate(page);
  await page.click('[data-gate="guest"]');
  await page.waitForFunction(() => !document.getElementById('hc-splash'), null, { timeout: 8000 });
  ok('the next launch asks at the gate, and not about notifications again',
    (await page.evaluate(() => !document.querySelector('.hc-notify'))));

  /* -------------------------------------------------------------- a phone */

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  listen(phone);
  await phone.addInitScript(PRETEND_PHONE);
  await phone.goto('http://127.0.0.1:' + PORT + '/index.html');
  await toTheGate(phone);

  ok('a phone that will see the switches is not asked by iOS at boot',
    (await phone.evaluate(() => window.__hcPush.asked)) === 0);

  await phone.click('[data-gate="guest"]');
  await toTheSwitches(phone);
  ok('nor while the switches are up',
    (await phone.evaluate(() => window.__hcPush.asked)) === 0);

  await phone.click('[data-notify="newGuide"]');
  await phone.click('[data-notify-go]');
  await phone.waitForFunction(() => !document.getElementById('hc-splash'), null, { timeout: 8000 });

  const push = await phone.evaluate(() => ({
    p: window.__hcPush,
    n: window.HC.store.getProfile().notifications
  }));
  ok('Continue is what asks iOS, once', push.p.asked === 1, JSON.stringify(push.p));
  ok('and a yes registers the phone', push.p.registered >= 1, JSON.stringify(push.p));
  ok('without turning on what was just turned off',
    push.n.newGuide === false && push.n.newSermon === false && push.n.sundayReminder === true,
    JSON.stringify(push.n));

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
