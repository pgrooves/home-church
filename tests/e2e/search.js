/* ===========================================================================
   Search and the two new discs in the top bar, drawn and driven.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. tests/search.test.js asks
   everything about the index that can be asked with no DOM: the folding, the
   snippet, the ranking, the journal lock. Four things are left over, and
   every one of them is a fact about a running page rather than about a
   function.

     the bar still fits         Three tap targets and a screen title now share
                                a header that used to hold one. On a scrolled
                                tab the lockup and the title were measured
                                landing on top of each other, which is why the
                                lockup stands down at that point. Nothing in
                                the CSS can be trusted to have kept that true;
                                only a layout can say.

     the two controls agree     Dark mode is a switch on Your account and a
                                disc in the bar, and on that screen they are
                                both on the glass. One moving without the
                                other is the kind of small lie that makes
                                people stop trusting a settings screen.

     the index costs no traffic Reading the screens for their words means
                                drawing them, and a screen drawn the ordinary
                                way pulls down every poster and thumbnail on
                                it. js/search.js draws into a <template>,
                                whose content is inert, precisely so that does
                                not happen. That promise is invisible from
                                inside the code and is asserted here by
                                counting the requests the page makes.

     a result goes somewhere    Every row carries a route and an id that
                                js/app.js follows without checking. A row
                                pointing at a screen that does not exist looks
                                exactly like a row that does.

   No database. This drives the app against its own bundled seed, so it runs
   anywhere and cannot touch the church's content.

     node tests/e2e/search.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_SEARCH_PORT || 8234);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

/* Same resolver as the two tests beside this, for the same reason:
   playwright-core ships no browser of its own. */
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

/* A title out of the seed, so this follows the catalogue rather than failing
   the week the church posts a different message. The first title in js/data.js
   is the newest Sunday, which is the one anybody would search for. */
const SEEDED_TITLE = (fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8')
  .match(/id: 'sermon-[^']+',\s*\n\s*seriesId: '[^']*',\s*\n\s*title: '([^']+)'/) || [])[1];
if (!SEEDED_TITLE) {
  console.error('Could not read a sermon title out of js/data.js');
  process.exit(1);
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

// The list on screen, as a person would read it.
const rows = (page) => page.evaluate(() =>
  Array.prototype.slice.call(document.querySelectorAll('.hc-result')).map(b => ({
    kind: b.querySelector('.hc-result__kind').textContent,
    title: b.querySelector('.hc-result__title').textContent,
    route: b.getAttribute('data-route'),
    id: b.getAttribute('data-id'),
    marks: b.querySelectorAll('mark').length
  })));

// Typing, at the speed the debounce in js/app.js is written for.
async function type(page, text) {
  await page.fill('[data-search-box]', text);
  await page.waitForTimeout(700);
}

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const noise = [];
  const requests = [];
  page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
  page.on('request', r => requests.push(r.url()));
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
  // The way in, answered the way a person answers it. See past-the-gate.js.
  await pastTheGate(page);
  await page.waitForTimeout(800);

  /* ------------------------------------------------------------- the bar ---
     Three circles at the right end, in the order they were asked for, none of
     them under the 44pt Apple asks for and this design system repeats. */

  const bar = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), right: Math.round(r.right),
               w: Math.round(r.width), h: Math.round(r.height),
               label: el.getAttribute('aria-label') };
    };
    return {
      theme: box('#hc-theme-disc'),
      search: box('#hc-search-disc'),
      avatar: box('.hc-avatar'),
      logo: box('.hc-topbar__logo--light'),
      icon: (document.querySelector('#hc-theme-disc svg') || {}).outerHTML || ''
    };
  });

  ok('the theme disc is in the bar', !!bar.theme);
  ok('and the search disc beside it', !!bar.search);
  ok('search sits directly left of the initials',
    bar.search && bar.avatar && bar.search.right <= bar.avatar.x + 1,
    JSON.stringify(bar));
  ok('and light-or-dark directly left of search',
    bar.theme && bar.search && bar.theme.right <= bar.search.x + 1,
    JSON.stringify(bar));

  ok('both are a full tap target',
    bar.theme.w >= 44 && bar.theme.h >= 44 && bar.search.w >= 44 && bar.search.h >= 44,
    JSON.stringify({ theme: bar.theme, search: bar.search }));

  ok('the label says what the tap will do, not what the icon is',
    bar.theme.label === 'Switch to dark mode', bar.theme.label);

  ok('and a light app is drawn with a sun',
    /circle/.test(bar.icon) && /M12 2\.9/.test(bar.icon), bar.icon);

  ok('the lockup still has room beside them at rest',
    bar.logo && bar.logo.right <= bar.theme.x,
    JSON.stringify({ logo: bar.logo, theme: bar.theme }));

  /* Scrolled, the title takes the left edge and the lockup slides out of its
     way rather than disappearing. This is the arrangement that broke when the
     two discs arrived: centred in its slot the lockup lands under the tail of
     a title like "Practices", so it goes to the far end of the slot instead
     and steps down three pixels on the way. None of that can be eyeballed, so
     it is measured here, and measured against every tab title rather than
     against the one this page happens to be on: the header is the same width
     whatever screen is under it, and "Practices" is 30pt longer than "Home".

     Only the tabs and the modules are asked. A pushed view draws no logo at
     all, which is a different rule with its own reason. */
  await page.evaluate(() => document.getElementById('hc-scroll').scrollTo(0, 500));
  await page.waitForTimeout(500);

  const scrolled = await page.evaluate(() => {
    const el = (sel) => document.querySelector(sel);
    const box = (sel) => {
      const b = el(sel).getBoundingClientRect();
      return { x: Math.round(b.x), right: Math.round(b.right),
               w: Math.round(b.width), shown: getComputedStyle(el(sel)).opacity !== '0' };
    };

    /* Every name the bar can carry while the logo is on screen, measured with
       the real face at the real weight by borrowing the title element. */
    const titleEl = el('.hc-topbar__title');
    const was = titleEl.textContent;
    let widest = 0, widestName = '';
    ['Home', 'Listen', 'Guides', 'Group', 'Connect'].concat(
      (window.HC.modules || []).map(m => window.HC.titles[m.route] || m.route)
    ).forEach(name => {
      titleEl.textContent = name;
      const w = titleEl.getBoundingClientRect().width;
      if (w > widest) { widest = w; widestName = name; }
    });
    titleEl.textContent = was;

    return {
      text: was,
      title: box('.hc-topbar__title'),
      logo: box('.hc-topbar__logo--light'),
      theme: box('#hc-theme-disc'),
      slot: box('.hc-topbar__center'),
      widest: Math.round(widest),
      widestName: widestName,
      scrolled: el('.hc-topbar').getAttribute('data-scrolled')
    };
  });

  ok('past the scroll threshold the screen names itself',
    scrolled.scrolled === 'true' && scrolled.text === 'Home',
    JSON.stringify({ scrolled: scrolled.scrolled, text: scrolled.text }));

  ok('the lockup is still on the glass rather than gone',
    scrolled.logo.shown, JSON.stringify(scrolled.logo));

  ok('it has slid right, to the far end of its slot',
    scrolled.logo.right >= scrolled.slot.right - 1 &&
    scrolled.logo.x > scrolled.slot.x,
    JSON.stringify({ logo: scrolled.logo, slot: scrolled.slot }));

  ok('and stepped down on the way, which is what buys the room',
    scrolled.logo.w < 120, JSON.stringify(scrolled.logo));

  /* The one that would have caught the regression. Measured against the
     longest name the bar can carry, not against the short one on screen. */
  ok('it clears even the longest tab title, with room to spare',
    scrolled.title.x + scrolled.widest + 8 <= scrolled.logo.x,
    JSON.stringify({ titleX: scrolled.title.x, widest: scrolled.widest,
                     widestName: scrolled.widestName, logoX: scrolled.logo.x,
                     gap: scrolled.logo.x - (scrolled.title.x + scrolled.widest) }));

  ok('and it never reaches the controls either',
    scrolled.logo.right <= scrolled.theme.x, JSON.stringify(scrolled));

  /* -------------------------------------------------------- light or dark ---
     The disc, the switch on Your account, and the phone all saying the same
     thing after a tap on either of them. */

  await page.click('#hc-theme-disc');
  await page.waitForTimeout(400);

  const dark = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    pressed: document.getElementById('hc-theme-disc').getAttribute('aria-pressed'),
    label: document.getElementById('hc-theme-disc').getAttribute('aria-label'),
    meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    icon: document.querySelector('#hc-theme-disc svg').outerHTML
  }));

  ok('one tap takes the app dark', dark.theme === 'dark', dark.theme);
  ok('the disc says so to a screen reader', dark.pressed === 'true');
  ok('and offers the way back in words', dark.label === 'Switch to light mode');
  ok('the sun has become a moon', /M20\.4 14\.6/.test(dark.icon), dark.icon);
  ok('and the status bar behind the app went with it', dark.meta === '#1A1918');

  await page.click('.hc-avatar');
  await page.waitForTimeout(700);

  const together = await page.evaluate(() => {
    const sw = document.querySelector('[data-action="toggle-theme"][role="switch"]');
    return { on: sw ? sw.getAttribute('aria-checked') : null,
             knob: sw ? sw.querySelector('.hc-switch').getAttribute('aria-checked') : null };
  });
  ok('Your account finds the switch already on', together.on === 'true',
    JSON.stringify(together));
  ok('down to the knob inside it', together.knob === 'true');

  // And back the other way, from the switch, with the disc watching.
  await page.click('[data-action="toggle-theme"][role="switch"]');
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    pressed: document.getElementById('hc-theme-disc').getAttribute('aria-pressed'),
    on: document.querySelector('[data-action="toggle-theme"][role="switch"]')
      .getAttribute('aria-checked')
  }));
  ok('the switch takes it back to light', back.theme === 'light', back.theme);
  ok('and the disc in the bar knows', back.pressed === 'false');
  ok('with the switch itself off', back.on === 'false');

  /* ------------------------------------------------------------ searching ---

     Everything from here is on the search screen. The request count is taken
     immediately before the first keystroke, because that is when the index is
     built and every screen in the app is drawn to be read. */

  await page.click('#hc-search-disc');
  await page.waitForTimeout(500);

  const opened = await page.evaluate(() => ({
    view: document.getElementById('app').getAttribute('data-view'),
    title: document.querySelector('.hc-topbar__title').textContent,
    focused: document.activeElement === document.querySelector('[data-search-box]'),
    back: !document.querySelector('.hc-topbar__back').hidden,
    stop: window.HC.router.isStop({ name: 'search' })
  }));

  ok('the glass shows Search', opened.view === 'search', opened.view);
  ok('named in the bar', opened.title === 'Search', opened.title);
  ok('with the caret already in the box', opened.focused);
  ok('and the arrow back, because this is a pushed view', opened.back && !opened.stop);

  const beforeIndex = requests.length;
  await type(page, SEEDED_TITLE.replace(/[’]/g, '\''));
  const during = requests.slice(beforeIndex);

  /* The only two things allowed on the wire while the index is being built.

     The nine practice files are deliberate: they are files in this app's own
     bundle, and reading them is what makes a practice nobody has opened
     findable by what is written inside it.

     The favicon is the browser's own errand, on its own schedule, and has
     nothing to do with this. Everything else is a photograph on a screen that
     was drawn to be read, which is exactly what the <template> exists to
     prevent, so anything else appearing here is that having stopped working. */
  const allowed = (u) =>
    /\/data\/practices\/[a-z]+\.json$/.test(u) ||
    /\/assets\/icons\/favicon\.png/.test(u);

  ok('building the index put nothing else on the wire',
    during.every(allowed), during.join('\n        '));
  ok('in particular, no screen was drawn with its photographs',
    during.every(u => !/\/assets\/img\//.test(u) && !/ytimg|youtube/.test(u)),
    during.join('\n        '));
  ok('and it reached nothing outside the app',
    during.every(u => u.indexOf('http://127.0.0.1:' + PORT + '/') === 0),
    during.join('\n        '));
  ok('what it did read is the nine practices, so their words are on the index',
    during.filter(u => /\/data\/practices\//.test(u)).length === 9,
    during.join('\n        '));

  const found = await rows(page);
  ok('a message is found by its own title, typed with the apostrophe on a keyboard',
    found.length > 0 && found[0].title === SEEDED_TITLE,
    JSON.stringify(found.slice(0, 3)));
  ok('and the words that matched are marked in the line underneath',
    found.some(r => r.marks > 0), JSON.stringify(found.slice(0, 3)));

  const address = await page.evaluate(() => window.location.search);
  ok('what was typed is in the address, so the back gesture leaves rather than rewinds',
    address.indexOf('v=search') > -1 && address.indexOf('id=') > -1, address);

  /* Two words are an and. The seed has both of these words in it, in different
     messages, and nothing that has them both. */
  await type(page, 'sabbath baptism');
  ok('two words that never appear together find nothing',
    (await rows(page)).length === 0);

  const empty = await page.evaluate(() =>
    !!document.querySelector('[data-search-results] .hc-empty'));
  ok('and the screen says so rather than going blank', empty);

  await type(page, 'a');
  ok('one letter is not a search yet',
    (await rows(page)).length === 0);

  /* An empty box is not the same as a search that found nothing, and the
     screen says two different things. Clearing it has to get the first one
     back rather than leaving "nothing matches" over a box with nothing in
     it. */
  await type(page, '');
  const cleared = await page.evaluate(() => ({
    hint: !!document.querySelector('.hc-search__hint'),
    empty: !!document.querySelector('[data-search-results] .hc-empty')
  }));
  ok('clearing the box brings the hint back', cleared.hint,
    JSON.stringify(cleared));
  ok('rather than leaving "nothing matches" over an empty box', !cleared.empty);

  /* --------------------------------------------------------- and a result ---
     The row is only worth anything if it opens the thing it names. A guide is
     the one to prove it on: its route carries an id, so a broken row here is a
     row that lands on the wrong guide rather than on no screen at all. */

  await type(page, 'grace');
  const list = await rows(page);
  const guide = list.filter(r => r.route === 'guide-reader')[0];
  ok('a guide is among the results, with an id on it', !!(guide && guide.id),
    JSON.stringify(list.slice(0, 4)));

  await page.click('.hc-result[data-route="guide-reader"]');
  await page.waitForTimeout(800);

  const landed = await page.evaluate(() => ({
    view: document.getElementById('app').getAttribute('data-view'),
    id: new URLSearchParams(window.location.search).get('id'),
    empty: !!document.querySelector('.hc-empty')
  }));

  ok('tapping it opens the guide reader', landed.view === 'guide-reader', landed.view);
  ok('on the guide the row named', landed.id === guide.id,
    JSON.stringify({ landed: landed.id, row: guide.id }));
  ok('and the guide is really there rather than an empty state', !landed.empty);

  await page.goBack();
  await page.waitForTimeout(700);
  const returned = await page.evaluate(() => ({
    view: document.getElementById('app').getAttribute('data-view'),
    value: (document.querySelector('[data-search-box]') || {}).value
  }));
  ok('back lands on Search again', returned.view === 'search', returned.view);
  ok('with what was typed still in the box', returned.value === 'grace', returned.value);

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
