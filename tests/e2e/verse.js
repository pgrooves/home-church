/* ===========================================================================
   The verse sheet, in a real browser.

   WHY THIS IS A BROWSER AND NOT ONLY tests/verse.test.js. That file proves
   the reader, the cache and the words. What it cannot prove is the part that
   used to be a web page: that a tap on a scripture row, or on a scripture
   link inside words somebody wrote, lands in the sheet and NOT in the phone's
   browser. That is the delegated click handler in js/app.js, the sheet, and
   the Edge Function's answer agreeing with each other.

   The function is answered here by page.route(), so nothing reaches Supabase
   or YouVersion. window.open is replaced with a recorder, so "it left the
   app" is something this can see.

     node tests/e2e/verse.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_VERSE_PORT || 8241);

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

const SHEET = `(function () {
  var el = document.querySelector('[data-sheet="verse"]');
  if (!el) return null;
  return {
    text: el.innerText,
    chapter: (el.querySelector('[data-action="open-url"]') || {}).getAttribute
      ? el.querySelector('[data-action="open-url"]').getAttribute('data-url') : ''
  };
})()`;

(async () => {
  const exe = chrome();
  if (!exe) {
    console.log('SKIP  no chromium on this machine, so the sheet cannot be driven');
    process.exit(0);
  }

  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({
    viewport: { width: 390, height: 780 },
    hasTouch: true, isMobile: true, deviceScaleFactor: 2
  });

  const asked = [];
  await page.route('**/functions/v1/bible-passage**', route => {
    const ref = new URL(route.request().url()).searchParams.get('ref');
    asked.push(ref);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        id: ref,
        reference: ref,
        text: ref === 'JHN.3.16'
          ? 'For God so loved the world that he gave his one and only Son'
          : 'Words for ' + ref,
        version: { id: 111, abbreviation: 'NIV', copyright: 'NIV® Copyright © 2011 by Biblica, Inc.®' }
      })
    });
  });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  try {
    await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
    await pastTheGate(page);
    await page.waitForFunction(() => window.HC && window.HC.router && window.HC.data && window.HC.verse);

    // Anything that tries to leave the app, written down instead.
    await page.evaluate(`(function () {
      window.__left = [];
      window.open = function (url) { window.__left.push(url); return null; };
    })()`);

    /* ------------------------------------------- 1. a scripture row */

    const guide = await page.evaluate(`(function () {
      var list = HC.data.guidesByDate();
      for (var i = 0; i < list.length; i++) {
        if (list[i].scriptures && list[i].scriptures.length) return list[i].id;
      }
    })()`);
    await page.evaluate(`HC.router.go({ name: 'guide-reader', id: ${JSON.stringify(guide)} })`);
    await page.waitForTimeout(400);

    // The scripture rows live in a section that starts folded. Open it the
    // way a person would, by its header.
    const fold = page.locator('[data-section="scripture"] [data-action="toggle-section"]');
    if (await fold.count() && (await fold.first().getAttribute('aria-expanded')) !== 'true') {
      await fold.first().scrollIntoViewIfNeeded();
      await fold.first().tap();
      await page.waitForTimeout(400);
    }

    const row = page.locator('[data-action="open-scripture"]').first();
    const reference = await row.getAttribute('data-reference');
    const want = await page.evaluate(`HC.bible.usfm(HC.bible.parseAll(${JSON.stringify(reference)})[0])`);

    await row.scrollIntoViewIfNeeded();
    await row.tap();
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    let sheet = await page.evaluate(SHEET);

    ok('tapping a scripture row opens the sheet, not a web page',
      sheet && (await page.evaluate('window.__left.length')) === 0, JSON.stringify(sheet));
    ok('it asked for the passage the row names', asked[0] === want, asked[0] + ' vs ' + want);
    ok('the words are there', sheet && sheet.text.indexOf('Words for ' + want) !== -1, sheet && sheet.text);
    ok('under the reference as the guide wrote it',
      sheet && sheet.text.indexOf(await page.evaluate(
        `HC.bible.label(HC.bible.parseAll(${JSON.stringify(reference)})[0])`)) !== -1);
    ok('with the copyright', sheet && /Biblica/.test(sheet.text));
    ok('and the chapter on bible.com a tap away',
      sheet && /^https:\/\/www\.bible\.com\/bible\/111\/[1-3A-Z]{3}\.\d+\.NIV$/.test(sheet.chapter), sheet && sheet.chapter);

    await page.locator('[data-sheet="verse"] .hc-sheet__close').tap();
    ok('the close button takes it down', (await page.evaluate(SHEET)) === null);

    await row.tap();
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    ok('the second time it comes from the phone', asked.length === 1, asked.join(', '));

    await page.keyboard.press('Escape');
    ok('and Escape takes it down too', (await page.evaluate(SHEET)) === null);

    /* ------------------------- 2. a scripture link in somebody's words */

    /* A link the old scripture button wrote, Bible Gateway and all, dropped
       into the screen the way an announcement's words are. It must open the
       sheet off its words, not the web page off its href. */
    await page.evaluate(`(function () {
      var p = document.createElement('p');
      p.id = 'verse-probe';
      p.innerHTML = 'read <a href="https://www.biblegateway.com/passage/?search=Jude+4&version=ESV">Jude 4</a>' +
        ' and <a href="https://example.com/">this</a>';
      document.querySelector('.hc-screen').prepend(p);
    })()`);

    await page.locator('#verse-probe a').first().tap();
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    sheet = await page.evaluate(SHEET);
    ok('an old Bible Gateway link opens the sheet', sheet && /Jude 4/.test(sheet.text), sheet && sheet.text);
    ok('for the passage in its words', asked[asked.length - 1] === 'JUD.1.4', asked.join(', '));
    ok('and nothing left the app', (await page.evaluate('window.__left.length')) === 0);

    await page.keyboard.press('Escape');
    await page.locator('#verse-probe a').nth(1).tap();
    ok('an ordinary link still goes where it always went',
      (await page.evaluate('window.__left')).join() === 'https://example.com/',
      (await page.evaluate('window.__left')).join());

    /* ------------------------------ 3. keeping words from the sheet */

    /* Selects `words` inside the first paragraph of the verse sheet the way a
       drag would leave it: one Range, which fires selectionchange. */
    const select = words => page.evaluate(`(function (words) {
      var block = document.querySelector('[data-sheet="verse"] .hc-verse__text');
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var at = node.nodeValue.indexOf(words);
        if (at === -1) continue;
        var r = document.createRange();
        r.setStart(node, at);
        r.setEnd(node, at + words.length);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        return true;
      }
      return false;
    })(${JSON.stringify(words)})`);

    await page.evaluate(`HC.verse.open('John 3:16')`);
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    await select('loved the world');
    await page.waitForSelector('.hc-hlbar', { timeout: 3000 }).catch(() => {});

    const bar = await page.evaluate(`(function () {
      var b = document.querySelector('.hc-hlbar');
      if (!b) return null;
      var r = b.getBoundingClientRect();
      var top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { onTop: !!(top && top.closest('.hc-hlbar')), mode: document.getElementById('app').getAttribute('data-hlbar') };
    })()`);
    ok('selecting words in the verse sheet brings up Note this / Highlight', !!bar, JSON.stringify(bar));
    ok('over the sheet, where it can be tapped', bar && bar.onTop && bar.mode === 'sheet', JSON.stringify(bar));

    await page.locator('.hc-hlbar [data-action="hl-mark"]').tap();
    await page.waitForTimeout(200);
    const kept = await page.evaluate(`(function () {
      var e = HC.journal.all({ kind: 'highlight' }).filter(function (x) { return !x.guideId; })[0];
      return e && { quote: e.quote, title: e.title, path: e.path, refs: e.refs };
    })()`);
    ok('Highlight keeps the words in the Journal', kept && kept.quote === 'loved the world', JSON.stringify(kept));
    ok('filed under the passage', kept && kept.title === 'John 3:16' && kept.refs.join() === 'John 3:16',
      JSON.stringify(kept));
    ok('and the words are marked in the sheet',
      await page.evaluate(`!!document.querySelector('[data-sheet="verse"] mark.hc-hl')`));

    // Opened again from somewhere else, the mark is still there.
    await page.keyboard.press('Escape');
    await page.evaluate(`HC.verse.open('Jn 3:16')`);
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    ok('and still marked the next time the passage is opened',
      await page.evaluate(`(document.querySelector('[data-sheet="verse"] mark.hc-hl') || {}).textContent === 'loved the world'`));

    // Note this: the note sheet comes up over the verse sheet.
    await select('his one and only Son');
    await page.waitForSelector('.hc-hlbar', { timeout: 3000 }).catch(() => {});
    await page.locator('.hc-hlbar [data-action="hl-note"]').tap();
    await page.waitForSelector('[data-sheet="note"] #hc-hl-note');
    await page.locator('#hc-hl-note').type('Only Son. Not one of several.');
    await page.waitForTimeout(600);
    await page.locator('[data-sheet="note"] [data-action="hl-close"]').last().tap();
    await page.waitForTimeout(200);
    const noted = await page.evaluate(`(function () {
      var e = HC.journal.all({ kind: 'highlight' }).filter(function (x) { return x.quote === 'his one and only Son'; })[0];
      return e && { body: e.bodyText, title: e.title };
    })()`);
    ok('Note this writes a note that lands in the Journal',
      noted && noted.body === 'Only Son. Not one of several.' && noted.title === 'John 3:16', JSON.stringify(noted));
    ok('and the verse sheet shows it as a noted highlight',
      await page.evaluate(`!!document.querySelector('[data-sheet="verse"] mark.hc-hl--noted')`));
    await page.keyboard.press('Escape');

    /* -------------------------- 4. a reference typed into the journal */

    await page.evaluate(`HC.router.go({ name: 'journal-entry', id: 'new' })`);
    await page.waitForSelector('#hc-entry-body');
    await page.locator('#hc-entry-body').tap();
    await page.keyboard.type('Came back to John 3:16 tonight.');
    await page.waitForTimeout(600);
    // Letting go of the box is what links it on screen.
    await page.evaluate(`document.activeElement.blur()`);
    await page.waitForTimeout(600);

    const typed = await page.evaluate(`(function () {
      var a = document.querySelector('#hc-entry-body a');
      var e = HC.journal.all({ kind: 'entry' })[0];
      return { link: a && a.textContent, href: a && a.getAttribute('href'), saved: e && e.bodyHtml, refs: e && e.refs };
    })()`);
    ok('a reference typed in an entry becomes a link once the box lets go',
      typed.link === 'John 3:16' && typed.href === 'https://www.bible.com/bible/111/JHN.3.16.NIV', JSON.stringify(typed));
    ok('and it is saved that way', /<a href="https:\/\/www\.bible\.com\/bible\/111\/JHN\.3\.16\.NIV">John 3:16<\/a>/.test(typed.saved || ''),
      typed.saved);

    await page.locator('#hc-entry-body a').tap();
    await page.waitForSelector('[data-sheet="verse"] .hc-verse__text');
    ok('tapping it in the entry opens the verse sheet',
      /For God so loved/.test((await page.evaluate(SHEET) || {}).text || ''));
    ok('with what was highlighted from it earlier',
      await page.evaluate(`!!document.querySelector('[data-sheet="verse"] mark.hc-hl')`));
    await page.keyboard.press('Escape');

    /* Typed the way a person types, with the caret in the box the whole
       time: the link has to appear the moment the reference is finished,
       not a verse before, and the caret has to stay where the writing is. */
    await page.evaluate(`HC.router.go({ name: 'journal-entry', id: 'new' })`);
    await page.waitForSelector('#hc-entry-body');
    await page.locator('#hc-entry-body').tap();
    const live = () => page.evaluate(`(function () {
      var box = document.querySelector('#hc-entry-body');
      var a = box.querySelectorAll('a');
      return { links: [].map.call(a, function (x) { return x.textContent; }),
               hrefs: [].map.call(a, function (x) { return x.getAttribute('href'); }),
               text: box.textContent.replace(/\u00a0/g, ' '), focused: document.activeElement === box };
    })()`);

    await page.keyboard.type('Reading john 3:1');
    let now = await live();
    ok('while typing, "john 3:1" is not linked yet: it may be going on to 3:16',
      now.links.length === 0, JSON.stringify(now));
    await page.keyboard.type('6');
    now = await live();
    ok('nor is "john 3:16" with the caret still at the end of it', now.links.length === 0, JSON.stringify(now));
    await page.keyboard.type(' again');
    now = await live();
    ok('a space finishes it: linked while still typing, lower case and all',
      now.links.join() === 'john 3:16' && now.hrefs[0] === 'https://www.bible.com/bible/111/JHN.3.16.NIV',
      JSON.stringify(now));
    ok('and the caret carried on after it, in the box', now.text === 'Reading john 3:16 again' && now.focused,
      JSON.stringify(now));

    await page.keyboard.type(' and Jn 14:6, then more.');
    now = await live();
    ok('a short form with chapter and verse, finished by a comma',
      now.links.join('|') === 'john 3:16|Jn 14:6', JSON.stringify(now));
    ok('nothing typed went missing', now.text === 'Reading john 3:16 again and Jn 14:6, then more.',
      JSON.stringify(now));

    await page.keyboard.type(' Psalm 23:1-');
    now = await live();
    ok('a range still being typed waits', now.links.length === 2, JSON.stringify(now));
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    now = await live();
    ok('and a new line finishes it', now.links.indexOf('Psalm 23:1-3') !== -1, JSON.stringify(now));

    // Editing a link's words into another verse moves the link with them.
    await page.evaluate(`(function () {
      var a = document.querySelector('#hc-entry-body a');
      var t = a.firstChild;
      var r = document.createRange();
      r.setStart(t, t.nodeValue.length); r.collapse(true);
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    })()`);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('7');
    now = await live();
    ok('while the new verse is being typed the old link lets go of it',
      now.links[0] !== 'john 3:1', JSON.stringify(now));
    // Moving on, here with the arrow keys, finishes it.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    now = await live();
    ok('a link edited into another verse points at the new one',
      now.links[0] === 'john 3:17' && now.hrefs[0] === 'https://www.bible.com/bible/111/JHN.3.17.NIV',
      JSON.stringify(now));

    await page.waitForTimeout(600);
    const livelySaved = await page.evaluate(`HC.journal.all({ kind: 'entry' })[0].bodyHtml`);
    ok('and it is saved with the links in it',
      /JHN\.3\.17\.NIV">john 3:17<\/a>/.test(livelySaved) && /JHN\.14\.6\.NIV">Jn 14:6<\/a>/.test(livelySaved),
      livelySaved);

    await page.locator('#hc-entry-body a', { hasText: 'Jn 14:6' }).tap();
    await page.waitForSelector('[data-sheet="verse"]');
    ok('and a link made while typing opens the verse sheet while still editing',
      (await page.evaluate(`document.querySelector('[data-sheet="verse"]').getAttribute('aria-label')`)) === 'Jn 14:6');
    await page.keyboard.press('Escape');

    /* An entry typed before this existed, reopened: the reference comes up as
       a link without anybody having to touch it. */
    const old = await page.evaluate(`(function () {
      var id = 'old-entry';
      var s = HC.journal._state();
      s.entries[id] = Object.assign({}, s.entries[Object.keys(s.entries)[0]], {
        id: id, kind: 'entry', path: null, quote: null, title: '',
        bodyHtml: '<p>From before: Romans 8:28.</p>', deletedAt: null
      });
      return id;
    })()`);
    await page.evaluate(`HC.router.go({ name: 'journal-entry', id: ${JSON.stringify(old)} })`);
    await page.waitForSelector('#hc-entry-body');
    ok('an older entry shows its typed reference as a link when it is opened',
      await page.evaluate(`(document.querySelector('#hc-entry-body a') || {}).textContent === 'Romans 8:28'`));

    /* The Journal lists what was kept from scripture under its own heading. */
    await page.evaluate(`HC.router.go({ name: 'journal' })`);
    await page.waitForTimeout(400);
    ok('the Journal files verse highlights under Scripture',
      await page.evaluate(`/Scripture/.test(document.querySelector('.hc-journal').innerText) && /From scripture/i.test(document.querySelector('.hc-journal').innerText)`));

    /* --------------------------- 5. scripture says it can be tapped */

    const glint = sel => page.evaluate(`(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var cs = getComputedStyle(el);
      return { weight: cs.fontWeight, anim: cs.animationName, clip: cs.webkitBackgroundClip };
    })(${JSON.stringify(sel)})`);

    await page.evaluate(`HC.router.go({ name: 'guide-reader', id: ${JSON.stringify(guide)} })`);
    await page.waitForTimeout(400);
    let g = await glint('.hc-row[data-action="open-scripture"] .hc-row__title');
    ok('a guide\'s scripture rows are a little heavier, with the glint crossing them',
      g && g.weight === '600' && g.anim === 'hc-scripture-glint' && g.clip === 'text', JSON.stringify(g));
    ok('each row a beat after the one above',
      await page.evaluate(`(function () {
        var rows = document.querySelectorAll('.hc-row[data-action="open-scripture"]');
        return rows.length < 2 || getComputedStyle(rows[1].querySelector('.hc-row__title')).animationDelay !==
          getComputedStyle(rows[0].querySelector('.hc-row__title')).animationDelay;
      })()`));

    await page.evaluate(`HC.router.go({ name: 'journal-entry', id: ${JSON.stringify(old)} })`);
    await page.waitForSelector('#hc-entry-body a');
    g = await glint('#hc-entry-body a');
    ok('and so is a scripture link in an entry', g && g.weight === '600' && g.anim === 'hc-scripture-glint',
      JSON.stringify(g));

    await page.emulateMedia({ reducedMotion: 'reduce' });
    g = await glint('#hc-entry-body a');
    ok('with Reduce Motion on it keeps the weight and loses the light',
      g && g.weight === '600' && g.anim === 'none', JSON.stringify(g));
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    /* ------------------------------------------------ 6. leaving */

    await page.evaluate('window.__left = []');
    await page.evaluate(`HC.verse.open('Romans 8:28')`);
    await page.waitForSelector('[data-sheet="verse"]');
    await page.evaluate(`HC.router.go({ name: 'home' })`);
    await page.waitForTimeout(300);
    ok('going to another screen takes the sheet with it', (await page.evaluate(SHEET)) === null);

    ok('and nothing threw along the way', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + pass + ' passed' + (fail ? ', ' + fail + ' failed.' : '.'));
  process.exit(fail ? 1 : 0);
})();
