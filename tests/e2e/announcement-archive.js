/* ===========================================================================
   The announcement archive, driven by a thumb.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. tests/announcement-archive.test.js
   asks everything that can be asked without a page: what is in the list, what
   order it comes back in, what a restore moves. Every promise left over is a
   promise about the glass, and each one fails silently rather than loudly:

     the corner puts it somewhere   The x on a card became an archive box on
                                    the strength of there being a list to go
                                    to. A corner wired to the old handler, or
                                    a line that never appears under the last
                                    card, is the old trapdoor with a new
                                    drawing on it, and nothing says so.

     the way back survives an       The week somebody most needs the archive
     empty Home                     is the week they have archived everything,
                                    which is exactly the week a link hung off
                                    the presence of a card above it would
                                    disappear. That is one `if` in
                                    js/screens/home.js and it reads fine both
                                    ways.

     a tick does not rebuild        Ticking a box shows the restore line
     the list                       without redrawing the rows, because
                                    redrawing them would rebuild the row under
                                    the thumb mid-tap. A repaint there would
                                    still pass every unit test in the project.

     restore actually restores      The end of the whole feature: the rows
                                    leave the archive and the cards are back on
                                    Home. Two screens and one map between them.

   No database. This drives the app against its own bundled seed, which carries
   one announcement, and pushes two more into HC.data the way js/content.js
   does when a fetch lands. Nothing here touches the church's content.

     node tests/e2e/announcement-archive.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_ARCHIVE_PORT || 8237);

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

/* Two more announcements, pushed into the array js/content.js mutates in
   place. The bundled seed carries one, and one is not enough to check off
   several of and restore them in bulk. Shaped off the seeded row rather than
   written out, so a field added to the mapper arrives here too. */
const SEED_TWO = `
  (function () {
    var base = window.HC.data.announcements[0];
    ['ann-e2e-two', 'ann-e2e-three'].forEach(function (id, i) {
      window.HC.data.announcements.push(Object.assign({}, base, {
        id: id,
        title: 'Test announcement ' + (i + 2),
        publishedOn: '2026-08-1' + (7 + i),
        createdAt: '2026-08-1' + (7 + i) + 'T12:00:00Z'
      }));
    });
  })();
`;

const home = page => page.evaluate(() =>
  window.HC.router.go({ name: 'home' }, { force: true }));

const settle = page => page.waitForTimeout(250);

const count = (page, sel) => page.evaluate(
  s => document.querySelectorAll(s).length, sel);

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const noise = [];
  page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
  page.on('console', m => {
    const text = m.text();
    // No Supabase is reachable from here, so the content fetch fails and says
    // so. That is the app working as designed and not what this watches for.
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(text)) {
      noise.push('console: ' + text);
    }
  });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.data && window.HC.router, null,
    { timeout: 15000 });
  await pastTheGate(page);
  await settle(page);

  await page.evaluate(SEED_TWO);
  await home(page);
  await settle(page);

  /* ------------------------------------------------------- the corner --- */

  ok('three announcements on Home', await count(page, '.hc-home__announcement .hc-banner') === 3,
    'got ' + await count(page, '.hc-home__announcement .hc-banner'));

  ok('each carries an archive box and not an x',
    await count(page, '.hc-banner__archive[data-action="archive-banner"]') === 3);
  ok('and nothing on Home is still wired to the old dismissal',
    await count(page, '[data-action="dismiss-banner"]') === 0);

  // Nothing archived, so there is nothing to link to yet.
  ok('no archive line before anything is archived',
    await count(page, '[data-action="open-announcement-archive"]') === 0);

  await page.click('.hc-banner[data-banner="ann-e2e-three"] .hc-banner__archive');
  await settle(page);

  ok('the archived card comes off Home',
    await count(page, '.hc-home__announcement .hc-banner') === 2);
  ok('and it is the one that was tapped',
    await count(page, '.hc-banner[data-banner="ann-e2e-three"]') === 0);

  const line = await page.evaluate(() => {
    const el = document.querySelector('[data-action="open-announcement-archive"]');
    if (!el) return null;
    const box = el.closest('.hc-home__announcement');
    const banners = box ? box.querySelectorAll('.hc-banner') : [];
    const last = banners.length ? banners[banners.length - 1] : null;
    return {
      // The visible words, without the count that is only said to a screen
      // reader, which is what the hidden span in home.js carries.
      text: el.firstChild ? String(el.firstChild.textContent).trim() : '',
      spoken: el.textContent.replace(/\s+/g, ' ').trim(),
      // 4 is Node.DOCUMENT_POSITION_FOLLOWING: the line comes after the card.
      afterLastCard: !!last && (last.compareDocumentPosition(el.parentNode) & 4) > 0
    };
  });

  ok('the archive line appears', !!line, 'no line drawn');
  ok('and says what the church asked it to say',
    line && line.text === '(Announcement Archive)', line && line.text);
  ok('and a screen reader is told how many are in there',
    line && /1 archived announcement$/.test(line.spoken), line && line.spoken);
  ok('and it sits under the last announcement, not over the first',
    line && line.afterLastCard);

  /* ------------------------------------------------------ the way back --- */

  await page.click('[data-action="open-announcement-archive"]');
  await settle(page);

  ok('tapping it opens the archive',
    await page.evaluate(() => window.HC.router.current().name) === 'announcement-archive');
  ok('which is a pushed view and not a stop, so the arrow back is drawn',
    await page.evaluate(() => !window.HC.router.isStop(window.HC.router.current())));
  ok('and a sideways drag does not run through it',
    await page.evaluate(() => window.HC.router.laneIndex(window.HC.router.current())) === -1);
  ok('the screen draws', await count(page, '.hc-archive') === 1);
  ok('with the one archived announcement in it',
    await count(page, '.hc-archive .hc-banner') === 1);
  ok('and the restore line is hidden until something is ticked',
    await page.evaluate(() => document.querySelector('[data-restore-line]').hidden) === true);

  /* ----------------------------------------- the way back with no cards ---
     The week somebody most needs this list is the week they have archived
     everything on Home, and that is the week a link hung off the presence of
     a card above it would vanish. */

  await home(page);
  await settle(page);
  await page.click('.hc-banner[data-banner="ann-e2e-two"] .hc-banner__archive');
  await settle(page);
  await page.click('.hc-banner[data-banner="ann-serve-day"] .hc-banner__archive');
  await settle(page);

  ok('every card can be archived', await count(page, '.hc-home__announcement .hc-banner') === 0);
  ok('and the way back is still on Home with none of them left',
    await count(page, '[data-action="open-announcement-archive"]') === 1);
  ok('under a heading that still names what the line is about',
    await page.evaluate(() => {
      const box = document.querySelector('.hc-home__announcement');
      const head = box && box.previousElementSibling;
      return !!head && /Announcements/.test(head.textContent);
    }));

  /* ------------------------------------------------- ticking and restoring */

  await page.click('[data-action="open-announcement-archive"]');
  await settle(page);

  ok('all three are in the archive', await count(page, '.hc-archive .hc-banner') === 3);

  const rowIds = () => page.evaluate(() =>
    Array.prototype.map.call(document.querySelectorAll('.hc-archive .hc-banner'),
      el => el.getAttribute('data-banner')).join(','));

  // Newest first, the same order Home had them in, which is the whole reason
  // there is one sortAnnouncements() rather than two copies of it.
  const order = await rowIds();
  ok('in the order Home had them in',
    order === 'ann-e2e-three,ann-e2e-two,ann-serve-day', order);

  await page.click('.hc-archive .hc-banner[data-banner="ann-e2e-two"] .hc-banner__select');
  await settle(page);

  ok('one tick shows the restore line',
    await page.evaluate(() => document.querySelector('[data-restore-line]').hidden) === false);
  ok('and the line says what it does',
    (await page.evaluate(() =>
      document.querySelector('[data-action="archive-restore"]').firstChild.textContent.trim()))
      === 'Restore selected announcements');
  ok('the row it belongs to is ticked and the others are not',
    await page.evaluate(() =>
      Array.prototype.map.call(document.querySelectorAll('.hc-banner__select'),
        el => el.getAttribute('aria-pressed')).join(',')) === 'false,true,false');

  /* THE ONE THING A UNIT TEST CANNOT ASK. A tick must not redraw the list, or
     the row under the thumb is rebuilt mid-tap. The elements themselves are
     the evidence: if any of them were replaced, this handle is stale. */
  const handle = await page.$('.hc-archive .hc-banner[data-banner="ann-serve-day"]');
  await page.click('.hc-archive .hc-banner[data-banner="ann-serve-day"] .hc-banner__select');
  await settle(page);

  ok('ticking a second one does not rebuild the list',
    await page.evaluate(el => !!el && el.isConnected, handle));
  ok('and both are ticked',
    await page.evaluate(() =>
      Array.prototype.map.call(document.querySelectorAll('.hc-banner__select'),
        el => el.getAttribute('aria-pressed')).join(',')) === 'false,true,true');

  await page.click('[data-action="archive-restore"]');
  await settle(page);

  const left = await rowIds();
  ok('restoring takes the ticked ones out of the archive',
    left === 'ann-e2e-three', left);
  ok('and leaves nothing ticked, so the line goes back down',
    await page.evaluate(() => document.querySelector('[data-restore-line]').hidden) === true);

  const said = await page.evaluate(() => {
    const t = document.getElementById('hc-toast');
    return t && t.getAttribute('data-visible') === 'true' ? t.textContent : '';
  });
  ok('and says how many went back', said === '2 announcements are back on Home.', said);

  await home(page);
  await settle(page);

  const back = await page.evaluate(() =>
    Array.prototype.map.call(
      document.querySelectorAll('.hc-home__announcement .hc-banner'),
      el => el.getAttribute('data-banner')).join(','));
  ok('and the two cards are back on Home', back === 'ann-e2e-two,ann-serve-day', back);
  ok('with the archive line still there for the one left in it',
    await count(page, '[data-action="open-announcement-archive"]') === 1);

  /* -------------------------------------------------- and it is still a door
     An archived announcement can be read from the archive, which is what
     keeps the list somewhere you can go rather than only somewhere things are
     parked. */

  await page.click('[data-action="open-announcement-archive"]');
  await settle(page);
  await page.click('.hc-archive .hc-banner__open');
  await settle(page);

  ok('tapping an archived card still opens its page', await page.evaluate(() => {
    const r = window.HC.router.current();
    return r.name === 'announcement' && r.id === 'ann-e2e-three';
  }));

  /* Leaving the archive empties the selection. A tick is what somebody is
     doing now, not something to come back to a week later. */
  ok('and walking out of the archive drops what was ticked',
    await page.evaluate(() => window.HC.screens.archiveHelpers.selectedIds().length) === 0);

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})();
