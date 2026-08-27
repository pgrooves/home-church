/* ===========================================================================
   What happens when an admin actually changes something.

   WHY THIS EXISTS, and why it is a browser rather than another unit test.
   Edit mode lets somebody rewrite roughly a hundred sentences across the app
   from a phone, with no review step, and the question that keeps coming back
   is not "can they save" but "can a save break something else". The unit
   tests answer that for the machinery and the SQL tests answer it for the
   privileges. Neither can answer it for the screens, because the screens only
   exist once something has drawn them.

   So this changes every editable field to something hostile, draws every
   screen, and looks:

     empty            a church clearing a line off the screen, which is a
                      supported thing to do and must not leave a gap that
                      cannot be tapped or a card with nothing in it
     markup           <script> and an onerror image, because the words come
                      from a text box and end up in an HTML string. Nothing in
                      this app uses innerHTML on anything a person typed, and
                      this is what keeps that true
     quotes           the characters that break a badly built attribute
     2000 characters  the cap the database allows, in a caption built for six
                      words, to catch a layout that pushes the screen sideways
     newlines, emoji  what somebody actually types on a phone

   And then it checks the two places in the app that read one of these values
   back rather than drawing it: the group finder compares its filter chips
   against a group's day, and Add to calendar parses an event's date and time
   into a real Date. Neither field is editable, which is the point, and this
   asserts that they still work after everything around them has been
   rewritten.

   No database. This drives the app against its own bundled seed, so it runs
   anywhere and cannot touch the church's content.

     sh tests/e2e/run.sh            runs this with the group room test
     node tests/e2e/editable-content.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_CONTENT_PORT || 8231);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

/* Same resolver as group-room.js, for the same reason: playwright-core ships
   no browser of its own. */
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

const TABS = ['home', 'listen', 'connect', 'give', 'more', 'journal', 'profile',
              'guide', 'practices', 'alpha', 'leader'];

const HOSTILE = [
  { name: 'emptied', value: '' },
  { name: 'markup', value: '<script>window.__pwned = 1</script><img src=x onerror="window.__pwned=1">' },
  { name: 'quotes', value: '"><b>\'&amp; \' " \\ </p>' },
  { name: 'two thousand characters', value: 'x'.repeat(2000) },
  { name: 'newlines and emoji', value: 'One.\n\nTwo.\n\n\n\nThree. 🙏🏽 — “curly” …' }
];

/* Every slot a screen offers, so the source strings are exercised too rather
   than only the table columns. A slot missing from this list is not a failure,
   it just is not covered, which is why the count is asserted at the end. */
const SLOTS = [
  'give.note', 'give.button', 'home.guide-empty', 'home.guide-cue', 'home.directions',
  'listen.empty', 'listen.follow', 'listen.show-eyebrow', 'connect.groups-empty',
  'connect.step-note', 'connect.serve-sms-note', 'connect.add-to-calendar',
  'connect.eyebrow', 'connect.groups-eyebrow', 'connect.serve-eyebrow',
  'connect.events-eyebrow', 'connect.steps-eyebrow', 'connect.off-season-eyebrow',
  'connect.serve-signup-eyebrow', 'connect.instagram-eyebrow',
  'more.note', 'more.practices-sub', 'more.journal-sub', 'more.give-sub',
  'journal.intro', 'journal.eyebrow', 'journal.export-note', 'journal.empty',
  'journal.no-matches', 'guide.empty', 'guide.missing',
  'leader.roster-empty', 'leader.prayers-empty',
  'practices.lede', 'practices.signup-lead', 'practices.signup-note',
  'practices.credit-grid', 'practices.credit-page', 'practices.load-failed',
  'practices.not-added',
  'alpha.lede', 'alpha.credit', 'alpha.invite-note', 'alpha.night-lede',
  'alpha.questions-lede', 'alpha.day-away',
  'alpha.asked-cost', 'alpha.asked-talk', 'alpha.asked-believe',
  'alpha.asked-miss', 'alpha.signup-lead', 'alpha.signup-note',
  'alpha.signup-button',
  /* profile.leader-copy and profile.leader-sub both went with the Leader mode
     section. Leader mode is a tier an admin sets under Manage users, so Your
     account says nothing about it and has no sentence left to reword. */
  'profile.notify-guide', 'profile.notify-sunday', 'profile.notify-news'
];

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
    // A project with no Supabase reachable from here fails its content fetch,
    // which is the app working as designed and not what this is watching for.
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(text)) {
      noise.push('console: ' + text);
    }
  });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.data && window.HC.router, null,
    { timeout: 15000 });
  await page.waitForTimeout(600);

  const covered = await page.evaluate(() => {
    let n = 0;
    const D = window.HC.data;
    n += (D.serveTeams || []).length * 3;
    n += (D.nextSteps || []).length * 2;
    n += (D.groups || []).length;
    n += (D.events || []).length;
    n += (D.series || []).length * 2;
    n += (D.sermons || []).length;
    n += (D.guides || []).length;
    return n;
  });

  for (const round of HOSTILE) {
    await page.evaluate((input) => {
      const D = window.HC.data;
      const v = input.value;
      const setAll = (list, fields) => (list || []).forEach(row => fields.forEach(f => {
        if (f in row) row[f] = Array.isArray(row[f]) ? [v, v] : v;
      }));

      setAll(D.serveTeams, ['blurb', 'commitment', 'requirement']);
      setAll(D.nextSteps, ['blurb', 'ctaLabel']);
      setAll(D.groups, ['blurb']);
      setAll(D.events, ['blurb']);
      setAll(D.series, ['subtitle', 'blurb']);
      setAll(D.sermons, ['description', 'summary']);
      setAll(D.guides, ['subtitle']);
      setAll(D.announcements, ['eyebrow', 'body']);
      setAll(D.contentPages, ['eyebrow', 'blurb']);
      (D.contentPages || []).forEach(p => (p.sections || []).forEach(s => { s.body = v; }));

      D.church.tagline = v;
      D.church.groupsOffSeasonNote = v;
      if (D.church.serve) D.church.serve.blurb = v;
      // The finder draws its chips only in season, and the chips are what the
      // last assertion in this file is about.
      D.church.groupsInSeason = true;
      /* Alpha in season, which is the state the loop below draws: the signup
         button, pointed at whatever this round is passing off as a URL. The
         other state is drawn separately further down, because the two never
         coexist on screen and the one that is not on screen is exactly the one
         that goes unchecked otherwise. */
      D.church.alphaInSeason = true;
      D.church.alphaSignupUrl = v;
      D.church.alphaOffSeasonNote = v;
      D.podcast.blurb = v;
      if (D.readingPlan) {
        D.readingPlan.subtitle = v;
        D.readingPlan.thisWeek = v;
        // The schedule is what Home actually draws now, thisWeek only when it
        // cannot. Both, so this round reaches whichever one is on the card.
        D.readingPlan.weeks = (D.readingPlan.weeks || []).map(() => v);
      }

      D.textOverrides.length = 0;
      input.slots.forEach(slot => D.textOverrides.push({ slot: slot, value: v }));

      // The banner, on, so its sentence is actually drawn.
      D.appSettings.length = 0;
      D.appSettings.push({ key: 'home_banner_on', kind: 'boolean', value: true });
      D.appSettings.push({ key: 'home_banner_message', kind: 'text', value: v });
    }, { value: round.value, slots: SLOTS });

    for (const tab of TABS) {
      await page.evaluate(t => window.HC.router.go({ name: t }, { force: true }), tab);
      await page.waitForTimeout(160);
      const seen = await page.evaluate(() => ({
        painted: !!document.querySelector('#app .hc-screen'),
        sideways: document.documentElement.scrollWidth > window.innerWidth,
        pwned: !!window.__pwned,
        script: !!document.querySelector('#app script')
      }));

      ok(round.name + ', ' + tab + ' still draws', seen.painted);
      ok(round.name + ', ' + tab + ' does not push the screen sideways', !seen.sideways);
      ok(round.name + ', ' + tab + ' renders the words rather than running them',
        !seen.pwned && !seen.script);
    }

    /* Alpha's other half. Between seasons the signup button comes off and a
       paragraph takes its place, and that paragraph is editable, so it needs
       the same five rounds through it as everything the loop above drew. */
    await page.evaluate(() => {
      window.HC.data.church.alphaInSeason = false;
      window.HC.router.go({ name: 'alpha' }, { force: true });
    });
    await page.waitForTimeout(160);
    const offSeason = await page.evaluate(() => ({
      painted: !!document.querySelector('#app .hc-screen'),
      sideways: document.documentElement.scrollWidth > window.innerWidth,
      pwned: !!window.__pwned,
      script: !!document.querySelector('#app script'),
      // The whole point of the switch: no signup button while it is off.
      noButton: !document.querySelector('.hc-alpha-signup')
    }));

    ok(round.name + ', Alpha between seasons still draws', offSeason.painted);
    ok(round.name + ', Alpha between seasons does not push the screen sideways',
      !offSeason.sideways);
    ok(round.name + ', Alpha between seasons renders the words rather than running them',
      !offSeason.pwned && !offSeason.script);
    ok(round.name + ', Alpha between seasons offers nothing to sign up for',
      offSeason.noButton);

    await page.evaluate(() => window.HC.router.go({ name: 'connect' }, { force: true }));
    await page.waitForTimeout(200);
    const behaviour = await page.evaluate(() => {
      const out = {};
      const group = (window.HC.data.groups || [])[0];
      const chips = Array.prototype.slice
        .call(document.querySelectorAll('[data-action="filter"]'))
        .map(el => el.getAttribute('data-value'));
      out.filter = !!group && chips.indexOf(group.day) > -1;
      const event = (window.HC.data.events || [])[0];
      out.calendar = !event ||
        !isNaN(window.HC.screens.connectHelpers.eventStart(event).getTime());
      return out;
    });

    ok(round.name + ', the group filter still matches its own groups', behaviour.filter);
    ok(round.name + ', an event still parses into a calendar entry', behaviour.calendar);
  }

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));
  ok('and the seed had enough content for this to mean something', covered > 20,
    'only ' + covered + ' editable row fields in the bundled seed');

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) process.exit(1);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
