/* ===========================================================================
   The contact form at the top of Connect, driven.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. tests/contact.test.js already
   asks js/contact.js every question that can be asked without a page: what
   counts as filled in, what goes on the wire, and whether a failed send
   rejects. What it cannot ask is the only question a person actually cares
   about, which is what is ON THE SCREEN afterwards.

   That is the question this file exists for, and it is the exact question the
   Connect screen was rebuilt around. Read the top of js/screens/connect.js:
   the form that used to be there collected a name, a contact and a note,
   called form.reset() on them, and showed a warm toast. Every part of that
   bug lived in the rendering. A data layer that rejects correctly and a screen
   that thanks you anyway is the same broken promise, and only a page can tell
   the two apart.

   So the four things checked here are the four that would put it back:

     the form is first        It was asked for at the top of Connect, above
                              the rail and the group finder. A change that
                              quietly moves it down the page is a change
                              nobody would notice in a unit test.

     a good send says so      And clears the boxes, so the next message is a
                              new one rather than the last one sent twice.

     A FAILED SEND DOES NOT   No thanks, no success card, the failure said in
                              words, the church's address offered instead,
                              AND what the person typed still in the boxes.
                              That last clause is the old bug precisely.

     the honeypot is hidden   From a person and from a screen reader, while
                              still being in the markup for whatever fills in
                              every field it can find.

   NO SUPABASE. js/config.js is served over with one pointing at this file's
   own server, which answers /functions/v1/contact the way the Edge Function
   answers it, and can be told to fail. Same seam tests/e2e/gate.js uses.

     node tests/e2e/contact.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_CONTACT_PORT || 8237);
const ORIGIN = 'http://127.0.0.1:' + PORT;

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
  ', SUPABASE_ANON_KEY: "anon-key" }; })(window.HC = window.HC || {});\n';

const sent = [];        // every body that reached /functions/v1/contact
let failNext = false;   // when true, the function answers the way a dead Resend makes it

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
  if (url.startsWith('/supabase/functions/v1/contact')) {
    sent.push(await body(req));
    if (failNext) {
      // Verbatim from supabase/functions/contact, the 502 it answers when the
      // row is written and the send did not go.
      return json(res, 502, {
        error: 'We could not get that through just now. Email the church directly and somebody will answer.'
      });
    }
    return json(res, 200, { ok: true });
  }
  // Everything the app reaches for on boot: a project with no rows in it, so
  // js/content.js falls back to the bundled seed quietly.
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

const scene = (page) => page.evaluate(() => {
  const val = (name) => {
    const el = document.querySelector('[data-contact-field="' + name + '"]');
    return el ? el.value : null;
  };
  const toast = document.getElementById('hc-toast');
  return {
    form: !!document.querySelector('[data-contact-form]'),
    sentCard: !!document.querySelector('[data-action="contact-reset"]'),
    error: (document.querySelector('.hc-contact__error') || {}).textContent || '',
    mailto: !!document.querySelector('.hc-contact__actions [data-url^="mailto:"]'),
    name: val('name'), email: val('email'), message: val('message'),
    toast: toast && toast.getAttribute('data-visible') === 'true' ? toast.textContent : ''
  };
});

async function type(page, name, value) {
  await page.fill('[data-contact-field="' + name + '"]', value);
}

(async () => {
  const exe = chrome();
  if (!exe) { console.log('SKIP  no chromium for playwright-core.'); process.exit(0); }

  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const threw = [];
  page.on('pageerror', (err) => threw.push(String(err)));

  await page.goto(ORIGIN + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.data && window.HC.router, null,
    { timeout: 15000 });
  // The way in, answered the way a person answers it. See past-the-gate.js.
  await pastTheGate(page);
  await page.waitForTimeout(500);

  await page.evaluate(() => window.HC.router.go({ name: 'connect' }));
  await page.waitForSelector('[data-contact-form]', { timeout: 8000 });

  console.log('\n--- where it is on the page ---');

  /* The ask was "the top-most item on the contact page". The h1 stays above
     it, because a screen whose first element is a text box has no title and
     tells a screen reader nothing about where it landed, and everything else
     goes below. */
  const order = await page.evaluate(() => {
    const screen = document.querySelector('.hc-connect');
    const marks = {
      h1: screen.querySelector('h1'),
      form: screen.querySelector('[data-contact-form]'),
      rail: screen.querySelector('.hc-rail'),
      groups: screen.querySelector('.hc-filters, .hc-group-list'),
      serve: screen.querySelector('.hc-serve__blurb'),
      steps: screen.querySelector('.hc-step__blurb')
    };
    const seen = [];
    const walk = (node) => {
      Object.keys(marks).forEach((k) => {
        if (marks[k] && (node === marks[k] || node.contains(marks[k])) && seen.indexOf(k) === -1
            && node === marks[k]) seen.push(k);
      });
      Array.prototype.forEach.call(node.children, walk);
    };
    walk(screen);
    return seen;
  });

  ok('the title is still the first thing on the screen', order[0] === 'h1', order.join(' → '));
  ok('and the contact form is the first thing under it', order[1] === 'form', order.join(' → '));
  ok('above everything Connect already had',
     order.indexOf('form') < order.indexOf('groups') || order.indexOf('groups') === -1,
     order.join(' → '));

  console.log('\n--- the honeypot ---');

  const hp = await page.evaluate(() => {
    const field = document.querySelector('[data-contact-field="website"]');
    if (!field) return null;
    const box = field.getBoundingClientRect();
    return {
      present: true,
      onScreen: box.x >= 0 && box.y >= 0 && box.width > 1 && box.height > 1,
      hidden: !!field.closest('[aria-hidden="true"]'),
      tabbable: field.tabIndex >= 0
    };
  });

  ok('it is in the markup, for whatever fills in every field', hp && hp.present);
  ok('but not on the screen', hp && !hp.onScreen);
  ok('nor in the accessibility tree', hp && hp.hidden);
  ok('nor on the tab order', hp && !hp.tabbable);

  console.log('\n--- an incomplete message ---');

  sent.length = 0;
  await type(page, 'name', 'Dee Robicheaux');
  await page.click('[data-action="contact-send"]');
  await page.waitForTimeout(300);

  let now = await scene(page);
  ok('is not sent anywhere', sent.length === 0, JSON.stringify(sent));
  ok('and says which field it wants', /email/i.test(now.toast), now.toast);
  ok('and the form is still standing', now.form && !now.sentCard);

  console.log('\n--- a send that fails, which is the whole reason for this file ---');

  failNext = true;
  sent.length = 0;
  await type(page, 'email', 'dee@example.com');
  await type(page, 'message', 'Where do I park on a Sunday?');
  await page.click('[data-action="contact-send"]');
  await page.waitForSelector('.hc-contact__error', { timeout: 8000 });
  now = await scene(page);

  ok('it did reach the function', sent.length === 1, JSON.stringify(sent));
  ok('nobody is thanked', !now.sentCard && !/sent/i.test(now.toast), now.toast);
  ok('the failure is on the screen, in words',
     /could not get that through/i.test(now.error), now.error);
  ok('the church’s address is offered instead', now.mailto);

  /* The old bug, precisely: form.reset() on what somebody typed. Losing a
     message to a failed send is worse than the failure, because the failure
     can be retried and the words cannot. */
  ok('and every word of it is still in the boxes',
     now.name === 'Dee Robicheaux'
     && now.email === 'dee@example.com'
     && now.message === 'Where do I park on a Sunday?',
     JSON.stringify([now.name, now.email, now.message]));

  console.log('\n--- and one that works ---');

  failNext = false;
  sent.length = 0;
  await page.click('[data-action="contact-send"]');
  await page.waitForSelector('[data-action="contact-reset"]', { timeout: 8000 });
  now = await scene(page);

  ok('the three fields went, and the honeypot with them, empty',
     sent.length === 1 && sent[0].name === 'Dee Robicheaux'
     && sent[0].email === 'dee@example.com' && sent[0].website === '',
     JSON.stringify(sent));
  ok('the form is replaced by an answer that stays on screen', now.sentCard && !now.form);
  ok('and the toast says it went', /sent/i.test(now.toast), now.toast);
  ok('the failure from a moment ago is gone with it', !now.error, now.error);

  await page.click('[data-action="contact-reset"]');
  await page.waitForSelector('[data-contact-form]', { timeout: 8000 });
  now = await scene(page);

  ok('writing another starts from an empty form',
     now.form && !now.name && !now.email && !now.message,
     JSON.stringify([now.name, now.email, now.message]));

  console.log('\n--- and a draft outlives the rest of the screen ---');

  /* Tapping a filter chip repaints Connect. A person who loses a half written
     message to one does not write it again, which is why the draft lives in
     the screen's own state rather than only in the inputs. */
  await type(page, 'message', 'Half a thought, and then a tap.');

  const chip = await page.$('[data-action="filter"]');
  if (chip) {
    await chip.click();
    await page.waitForTimeout(300);
    now = await scene(page);
    ok('a filter tap does not take the message with it',
       now.message === 'Half a thought, and then a tap.', now.message);
  } else {
    // Groups are between seasons in the bundled seed, so there are no filter
    // chips to tap. The redraw is what is being tested rather than the chip,
    // and this is the same redraw: see repaintView() in js/app.js, which is
    // what the chip handler calls.
    console.log('      (no filter chips in the seed; redrawing the screen directly)');
  }

  await page.evaluate(() => window.HC.router.go({ name: 'connect' }, { force: true }));
  await page.waitForSelector('[data-contact-form]', { timeout: 8000 });
  now = await scene(page);
  ok('and neither does a redraw of the whole screen',
     now.message === 'Half a thought, and then a tap.', now.message);

  ok('nothing threw along the way', threw.length === 0, threw.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + (fail ? fail + ' failed, ' + pass + ' passed.' : pass + ' passed.'));
  process.exit(fail ? 1 : 0);
})();
