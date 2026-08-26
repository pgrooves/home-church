/* ===========================================================================
   Alpha, drawn and driven.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. Nothing in js/screens/alpha.js
   returns a value. It returns an HTML string, and every promise the screen
   makes is a promise about what that string does once it is on the glass and
   somebody's thumb lands on it. Three of those promises are worth holding
   onto, and all three fail quietly rather than loudly:

     the video plays here      The whole screen is written on the rule that
                               tapping a poster starts a player in the app
                               rather than throwing somebody to YouTube. A
                               mistyped id, a poster wired to open-url, a
                               provider the handler rejects: every one of them
                               looks exactly like a video that will not start,
                               and none of them says anything.

     the button goes somewhere The only reason this page exists is the
                               registration at the foot of it. A button
                               pointed at nothing, or at the app's own router,
                               is a screen that reads perfectly and converts
                               nobody.

     the season is a switch    Between runs of Alpha the signup has to come
                               off entirely and the note has to take its
                               place. Getting this wrong leaves a live button
                               over a registration that closed in March, which
                               is the failure the switch exists to prevent and
                               is invisible from inside the code.

   And one thing that is not a promise so much as a shape: eleven questions,
   numbered, because that is the count Alpha runs and a twelfth appearing in
   the list would be this app putting a question on the screen that the course
   never asks.

   No database. This drives the app against its own bundled seed, so it runs
   anywhere and cannot touch the church's content. The hostile input rounds
   over the same screen live in editable-content.js beside this; what is here
   is behaviour rather than resilience.

     node tests/e2e/alpha.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_ALPHA_PORT || 8233);

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

/* The registration the app ships with. Read out of js/data.js rather than
   written down a second time, so the day the church opens next season's
   registration this test follows the seed instead of failing on it. */
const SEEDED_URL = (fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8')
  .match(/alphaSignupUrl:\s*'([^']+)'/) || [])[1];
if (!SEEDED_URL) {
  console.error('Could not read alphaSignupUrl out of js/data.js');
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
  await page.waitForTimeout(600);

  /* ------------------------------------------------------ where it lives ---
     A module behind •••, not a tab and not a pushed view. What that buys is
     the sideways drag and the absence of a back arrow, and it is decided by
     three lists in js/app.js that have to agree with each other. */

  const nav = await page.evaluate(() => ({
    isTop: window.HC.router.isTop('alpha'),
    stops: window.HC.router.stops().join(','),
    module: (window.HC.modules || []).filter(m => m.route === 'alpha')[0] || null
  }));

  ok('Alpha is a top level stop rather than a pushed view', nav.isTop);
  ok('and a drag left off Practices is what reaches it',
    nav.stops.indexOf('practices,alpha') > -1, nav.stops);
  ok('and it carries its own icon into the sheet',
    !!nav.module && nav.module.icon === 'alpha' && nav.module.title === 'Alpha',
    JSON.stringify(nav.module));

  await page.evaluate(() => window.HC.router.go({ name: 'alpha' }, { force: true }));
  await page.waitForTimeout(300);

  ok('the screen draws', await page.evaluate(() => !!document.querySelector('.hc-alpha')));

  /* ------------------------------------------------------------- video ---
     Two of them, and the one thing that matters about both is that the poster
     turns into a player in place. See the note at the top of this file, and
     the same promise made at the top of js/screens/practices.js. */

  const posters = await page.$$('.hc-alpha .hc-video__poster');
  ok('two videos, both of them Alpha’s', posters.length === 2,
    'got ' + posters.length);

  ok('and neither is a link out of the app', await page.evaluate(() =>
    Array.prototype.every.call(
      document.querySelectorAll('.hc-alpha .hc-video__poster'),
      el => el.getAttribute('data-action') === 'play-video')));

  await posters[0].click();
  await page.waitForTimeout(300);

  const src = await page.evaluate(() => {
    const f = document.querySelector('.hc-alpha .hc-video__iframe');
    return f ? f.getAttribute('src') : null;
  });

  ok('tapping one swaps the poster for a player rather than leaving',
    !!src && src.indexOf('https://www.youtube.com/embed/') === 0, String(src));
  /* playsinline is the parameter that stops iOS taking the video full screen
     the instant it starts, which is the same experience as leaving the app
     wearing a different coat. js/app.js sets it; this is what notices if it
     ever stops. */
  ok('and it plays inline rather than taking over the screen',
    !!src && src.indexOf('playsinline=1') > -1, String(src));

  /* --------------------------------------------------------- the questions */

  ok('eleven questions, numbered', await page.evaluate(() =>
    document.querySelectorAll('.hc-alpha-questions .hc-numbered').length) === 11);

  ok('and the day away is named beside them rather than numbered among them',
    await page.evaluate(() => !!document.querySelector('.hc-alpha-away')));

  /* -------------------------------------------------------- the way in ---
     The reason the page exists. One primary button, opening outside the app,
     at the registration the seed names, with a sentence under it saying where
     it lands. */

  const cta = await page.evaluate(() => {
    const btn = document.querySelector('.hc-alpha-signup .hc-btn');
    const note = document.querySelector('.hc-alpha-signup__note');
    return {
      there: !!btn,
      action: btn ? btn.getAttribute('data-action') : null,
      url: btn ? btn.getAttribute('data-url') : null,
      note: note ? note.textContent.trim() : '',
      // One primary button on the page. The credit block's is secondary and
      // the videos are posters, so a second primary here would mean two
      // things competing to be the thing you do next.
      primaries: document.querySelectorAll('.hc-alpha .hc-btn--primary').length
    };
  });

  ok('there is a signup at the foot of the page', cta.there);
  ok('pointed at the registration the app ships with',
    cta.url === SEEDED_URL, cta.url + '\n        want ' + SEEDED_URL);
  ok('opening outside the app rather than routing inside it',
    cta.action === 'open-url', String(cta.action));
  ok('with a line under it saying where it lands', cta.note.length > 20, cta.note);
  ok('and it is the only thing on the page asking to be tapped',
    cta.primaries === 1, 'found ' + cta.primaries);

  /* ------------------------------------------------------- out of season ---
     One boolean, and the two things it has to do. Driven through HC.data the
     way a content sync would set it, rather than by reaching into the screen. */

  await page.evaluate(() => {
    window.HC.data.church.alphaInSeason = false;
    window.HC.router.go({ name: 'alpha' }, { force: true });
  });
  await page.waitForTimeout(300);

  ok('between seasons the signup comes off entirely',
    await page.evaluate(() => !document.querySelector('.hc-alpha-signup')));
  ok('and a warm sentence takes its place', await page.evaluate(() => {
    const el = document.querySelector('.hc-alpha__off-season');
    return !!el && el.textContent.trim().length > 20;
  }));
  ok('the rest of the page is still there to read',
    await page.evaluate(() =>
      document.querySelectorAll('.hc-alpha-questions .hc-numbered').length) === 11);

  /* --------------------------------------------------- the empty column ---
     church_profile.alpha_signup_url is empty on any project that has not run
     migration 0035, and on a phone that has never reached Supabase. Neither
     of those may produce a button with nothing behind it. */

  await page.evaluate(() => {
    const church = window.HC.data.church;
    church.alphaInSeason = true;
    church.alphaSignupUrl = '';
    window.HC.router.go({ name: 'alpha' }, { force: true });
  });
  await page.waitForTimeout(300);

  ok('an empty column falls back to the url in the source', await page.evaluate(() => {
    const btn = document.querySelector('.hc-alpha-signup .hc-btn');
    return !!btn && /^https:\/\//.test(btn.getAttribute('data-url') || '');
  }));

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) process.exit(1);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
