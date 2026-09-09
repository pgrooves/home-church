/* ===========================================================================
   The guide hint, drawn and driven.

   WHY THIS IS A BROWSER. Everything about this hint is a claim about a
   rectangle on the glass at a moment, and every one of those claims fails
   quietly. A hint that is never armed, a marker measured against the wrong
   box, a layer that swallows the tap it was supposed to let through, a
   trigger wired to the fold instead of to the scroll: all of them look
   exactly like "no hint appeared", and none of them says anything.

   That is not hypothetical. HINTS.md §12 is a whole section about a version
   of this feature that was reverted because no hint appeared on a real phone
   and nothing could say why, after a headless browser said it was fine three
   times. The unit test beside this covers the policy, which is the half that
   can be reasoned about. This covers the half that cannot.

   WHAT IT HOLDS ONTO

     it does not fire on the tap    Opening a section arms the hint. If it
                                    drew here it would draw under the thumb
                                    that just tapped, while the panel is still
                                    growing.

     it fires on the scroll         And on the scroll settling, not during the
                                    fling, because a marker drawn under a
                                    moving page is a smear.

     the marker is on the words     Measured against the real line boxes of
                                    the real sentence, not a guess.

     it never takes a tap           A tap on the card lands on the prose
                                    underneath. This is the promise in
                                    HINTS.md §3a and the one that turns this
                                    into a modal if it ever softens.

     and a tap does not end it      Two different claims, both worth holding.
                                    It has a clock rather than a dismissal,
                                    and the touch that scrolled onto the words
                                    must not be able to end it before it has
                                    finished arriving.

     it goes on its own             Two seconds after the words land, and then
                                    nothing is left in the page.

     once a launch                  A second section, scrolled onto, gets
                                    nothing. A reload gets it again.

     the switch is the switch       Off in Your account, and no section in any
                                    guide arms anything.

     node tests/e2e/hints.js
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'
};

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('no'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, () => resolve(server));
  });
}

/* Into the first guide, with its second section opened. Returns the section
   handle so each round can drive from the same place. */
async function intoAGuide(page, base) {
  await page.goto(base + '/index.html');
  await pastTheGate(page);

  await page.evaluate(() => window.HC.router.go({ name: 'guide' }));
  await page.waitForSelector('[data-action="open-guide"]', { timeout: 10000 });
  await page.click('[data-action="open-guide"]');
  await page.waitForSelector('[data-hl-path]', { timeout: 10000 });
  await page.waitForTimeout(400);
}

/* Open the nth still-folded section that has prose in it, and mark it, so
   that what gets scrolled to afterwards is the section that was actually
   opened rather than whichever one the layout happens to put there. Every
   section in a guide is folded on arrival, so the first one is Overview. */
async function openASection(page, which = 0) {
  const opened = await page.evaluate((n) => {
    const shut = Array.from(document.querySelectorAll('.hc-section'))
      .filter(s => s.querySelector('[data-hl-path]'))
      .filter(s => s.querySelector('.hc-section__toggle').getAttribute('aria-expanded') === 'false');
    if (!shut[n]) return null;
    Array.from(document.querySelectorAll('[data-opened]'))
      .forEach(el => el.removeAttribute('data-opened'));
    shut[n].setAttribute('data-opened', 'true');
    shut[n].querySelector('.hc-section__toggle').click();
    return true;
  }, which);
  await page.waitForTimeout(450);   // the fold
  return opened;
}

/* Scroll the prose of the section that was just opened into view, the way a
   thumb would, and let it settle. */
async function scrollOnto(page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-opened] [data-hl-path]');
    const scroller = document.getElementById('hc-scroll');
    scroller.scrollTop += el.getBoundingClientRect().top - 160;
  });
  await page.waitForTimeout(1400);   // settle, draw, and the words
}

/* The other way in: open a section whose prose is already on screen and never
   scroll at all. This is what tapping Overview does, and before the fallback
   in js/hints.js existed it showed nothing. */
async function justWait(page) {
  await page.waitForTimeout(2000);   // the fallback, the draw, and the words
}

const marks = page => page.evaluate(() => document.querySelectorAll('.hc-hint__mark').length);
const said  = page => page.evaluate(() => {
  const card = document.querySelector('.hc-hint__card');
  return card ? card.textContent.trim() : null;
});

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.HC_CHROMIUM || '/opt/pw-browsers/chromium'
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  try {
    /* ------------------------------------------- the tap arms, and no more */
    await intoAGuide(page, base);
    await openASection(page);
    ok('nothing is drawn on the fold', await marks(page), 0);

    /* ------------------------------------------------ the scroll shows it */
    await scrollOnto(page);
    const drawn = await marks(page);
    ok('the marker is drawn, one box per line of the sentence', drawn > 0, true);
    ok('the words say what it means', await said(page), 'Hold a line to keep it.');
    ok('the ghosted bar is there too',
       await page.evaluate(() => !!document.querySelector('.hc-hint__pill')), true);

    /* The marker has to be ON the sentence. A hint measured against the wrong
       box is the failure that looks like a rendering glitch and gets shrugged
       at, so this asserts overlap rather than existence. */
    ok('the marker sits on the prose it is about', await page.evaluate(() => {
      const mark = document.querySelector('.hc-hint__mark').getBoundingClientRect();
      const blocks = Array.from(document.querySelectorAll('[data-hl-path]'));
      return blocks.some(b => {
        const r = b.getBoundingClientRect();
        return mark.top >= r.top - 6 && mark.bottom <= r.bottom + 6 &&
               mark.left >= r.left - 6 && mark.width > 20;
      });
    }), true);

    /* ------------------------------------------------- it never takes a tap */
    /* The one that matters most. elementFromPoint is what the browser itself
       would hit at that spot, so this is the real question: if somebody puts
       a thumb on the card, does the app get the tap. */
    ok('the layer does not take the tap', await page.evaluate(() => {
      const card = document.querySelector('.hc-hint__card').getBoundingClientRect();
      const hit = document.elementFromPoint(card.left + card.width / 2,
                                            card.top + card.height / 2);
      return !!hit && !hit.closest('.hc-hint');
    }), true);

    /* --------------------------------------------- and a tap does not end it */
    /* The rule that replaced "any pointerdown ends it". The touch that
       scrolled onto the words is a pointerdown too, and under the old rule it
       could end the hint before it had finished arriving. */
    await page.mouse.click(200, 300);
    await page.waitForTimeout(250);
    ok('a tap does not end it', await marks(page) > 0, true);
    ok('and the words are still there', await said(page), 'Hold a line to keep it.');

    /* A scroll carries it rather than ending it, so the marker stays on the
       words it is about while the page moves under it. */
    const before = await page.evaluate(() =>
      document.querySelector('.hc-hint__mark').getBoundingClientRect().top);
    await page.evaluate(() => { document.getElementById('hc-scroll').scrollTop += 40; });
    await page.waitForTimeout(120);
    ok('a scroll does not end it either', await marks(page) > 0, true);
    ok('and the marker travels with the words', await page.evaluate((was) => {
      const now = document.querySelector('.hc-hint__mark').getBoundingClientRect().top;
      return Math.abs((was - now) - 40) < 4;
    }, before), true);

    /* ------------------------------------------------------ it goes on its own */
    await page.waitForTimeout(2600);
    ok('two seconds later it has gone', await marks(page), 0);
    ok('and nothing of it is left in the page',
       await page.evaluate(() => document.querySelectorAll('.hc-hint, .hc-hint-marks').length), 0);

    /* ------------------------------------------------------- once a launch */
    await openASection(page, 0);
    await scrollOnto(page);
    ok('a second section this launch gets nothing', await marks(page), 0);

    /* ---------------------------------------------------- and again on a relaunch */
    await intoAGuide(page, base);
    await openASection(page);
    await scrollOnto(page);
    ok('a relaunch offers it again', await marks(page) > 0, true);
    await page.waitForTimeout(2800);   // let it go on its own; a tap will not

    /* ------------------------------------------- the scroll that never comes */
    /* Overview is the first section in every guide and it is folded like the
       rest, so the likeliest first tap in the app opens a section whose prose
       is already on screen with nothing left to scroll to. Wiring the trigger
       to the scroll alone meant that person saw nothing, ever. Found by
       folding Overview, not by reading the code. */
    await intoAGuide(page, base);
    await page.evaluate(() => { document.getElementById('hc-scroll').scrollTop = 0; });
    await openASection(page);
    ok('the first section is on screen without scrolling', await page.evaluate(() => {
      const r = document.querySelector('[data-opened] [data-hl-path]').getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }), true);
    await justWait(page);
    ok('and it shows anyway, with no scroll at all', await marks(page) > 0, true);
    await page.waitForTimeout(2600);

    /* ---------------------------------------------------------- the switch */
    await page.evaluate(() => {
      window.HC.store.updateProfile({ hints: false });
    });
    await intoAGuide(page, base);
    await openASection(page);
    await scrollOnto(page);
    ok('Hints off in Your account shows nothing', await marks(page), 0);
    ok('and it says why', await page.evaluate(() => window.HC.hints.explain()),
       'no: Hints is off in Your account');

    await page.evaluate(() => window.HC.store.updateProfile({ hints: true }));

    ok('no page errors', errors, []);
  } catch (e) {
    console.log('FAIL  threw\n        ' + e.message);
    fail++;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
