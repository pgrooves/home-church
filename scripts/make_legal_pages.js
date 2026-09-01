#!/usr/bin/env node
/*
 * Home Church, standalone legal pages for the open web.
 *
 * WHY THIS IS NEEDED. Apple requires the privacy policy in two places, and
 * people routinely ship only one. It has to be reachable inside the app,
 * which js/screens/legal.js handles, and it has to be a public URL in the
 * App Store Connect metadata field. A 404 there, or a link to a homepage
 * that never mentions the app, is a 5.1.1 rejection.
 *
 * WHY IT IS GENERATED RATHER THAN WRITTEN TWICE. Two copies of a privacy
 * policy drift, and the drift is invisible until somebody compares them,
 * which is usually a lawyer or a reviewer. js/screens/legal.js is the single
 * source of truth. This renders the same screens in a headless browser,
 * lifts the markup, and wraps it in a page that stands on its own.
 *
 * SELF CONTAINED ON PURPOSE. All CSS is inlined and both typefaces are
 * embedded as base64, so each file is one HTML document with no external
 * requests. Drop it on Squarespace, GitHub Pages, or anywhere else and it
 * renders the same. No relative paths to break.
 *
 * USAGE
 *   npx http-server -p 8770 -s &
 *   node scripts/make_legal_pages.js
 *
 * Writes legal/privacy.html, legal/terms.html and legal/support.html.
 * Re-run whenever js/screens/legal.js changes.
 *
 * FORGETTING TO RE-RUN IT IS THE FAILURE THIS SCRIPT EXISTS TO PREVENT, AND
 * IT HAPPENED. The three pages sat on `main` for weeks describing an app with
 * no group rooms, no journal that leaves the phone, and no reporting or
 * blocking, while the app on the phone had all of it. The public privacy
 * policy is the one URL App Review checks most reliably, so that is a
 * Guideline 5.1.1 problem sitting at the exact address we hand Apple.
 *
 * `npm run preflight` now fails when the pages drift, without needing a
 * browser or a server: it reads the section headings out of
 * js/screens/legal.js and checks each one is present in the page it belongs
 * to. Run that before you submit. This script is still what fixes it.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const BASE = process.env.HC_BASE || 'http://127.0.0.1:8770';
const OUT = path.join(ROOT, 'legal');

const PAGES = [
  { route: 'privacy', file: 'privacy.html', title: 'Privacy policy, Home Church' },
  { route: 'terms',   file: 'terms.html',   title: 'Terms of use, Home Church' }
];

/* The support page is written here rather than lifted from a screen, because
   there is no support screen in the app and there should not be. App Store
   Connect requires a Support URL, it has to resolve, and it has to be about
   the app rather than a homepage that never mentions it. Reviewers do check.

   Kept short on purpose. A support page that answers the four questions
   somebody actually has beats one that pads to look thorough. */
const SUPPORT = `
<header class="hc-section-header hc-section-header--flush">
  <span class="hc-eyebrow hc-section-header__eyebrow">Home Church</span>
  <h1 class="hc-section-header__title">App support</h1>
  <div class="hc-section-header__rule" aria-hidden="true"></div>
</header>

<section class="hc-legal__block">
  <h2 class="hc-legal__heading">Something is wrong, or you have a question</h2>
  <p class="hc-body-serif hc-legal__p">Email <a href="mailto:hello@homechurchnola.com">hello@homechurchnola.com</a> and a real person will answer. Tell us what phone you are on and what you were doing, and we will get further faster.</p>
</section>

<section class="hc-legal__block">
  <h2 class="hc-legal__heading">This week's guide has not appeared</h2>
  <p class="hc-body-serif hc-legal__p">Guides go up within a day or two of Sunday. The app checks for new content every time you open it, so close it fully and open it again. If it still is not there, we have probably not posted it yet.</p>
</section>

<section class="hc-legal__block">
  <h2 class="hc-legal__heading">Nothing loads, or the app looks empty</h2>
  <p class="hc-body-serif hc-legal__p">The app keeps a copy of everything on your phone and is built to work with no signal, so an empty screen usually means something else. Close it fully and reopen. If that does not fix it, delete the app and install it again. You will lose any notes you have written, which is worth knowing before you do it, because those live on your phone and nowhere else.</p>
</section>

<section class="hc-legal__block">
  <h2 class="hc-legal__heading">Where your notes live</h2>
  <p class="hc-body-serif hc-legal__p">On your phone. Your notes, your group roster, and anything you have written down for prayer stay on the device and are never sent to us. That means we cannot read them, and it also means we cannot recover them for you. Open Your account, then Your data, to see exactly what is stored and to erase all of it.</p>
</section>

<section class="hc-legal__block">
  <h2 class="hc-legal__heading">Giving</h2>
  <p class="hc-body-serif hc-legal__p">Giving opens Overflow in your phone's browser, outside the app. For a question about a gift, a receipt, or a recurring donation, email us and we will sort it out.</p>
</section>

<section class="hc-legal__block">
  <h2 class="hc-legal__heading">Home Church</h2>
  <p class="hc-body-serif hc-legal__p">
    216 Giuffrias Ave<br>
    Metairie, LA 70001<br>
    Sundays at 8:00, 9:30, and 11:00
  </p>
  <p class="hc-body-serif hc-legal__p"><a href="https://www.homechurchnola.com">homechurchnola.com</a></p>
  <p class="hc-body-serif hc-legal__p"><a href="privacy.html">Privacy policy</a> &middot; <a href="terms.html">Terms of use</a></p>
</section>
`;

// Only the faces the legal screens actually use. Embedding all six would
// double the file for italics that never appear in a policy.
const FONTS = [
  // Manrope's file is the variable one, so the weight here is the range it
  // carries rather than a single cut. Naming one weight would make the
  // browser synthesise the others off it.
  { family: 'Manrope', weight: '200 800', style: 'normal', file: 'manrope-latin.woff2' },
  { family: 'Poppins', weight: 800,       style: 'normal', file: 'poppins-800.woff2' }
];

function read(...parts) {
  return fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
}

/* Same resolver the end to end tests use, for the same reason: playwright-core
   ships no browser, so somebody has to find one. */
function bundledChrome() {
  if (process.env.HC_E2E_CHROME) return process.env.HC_E2E_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort();
    for (let i = dirs.length - 1; i >= 0; i--) {
      const exe = path.join(root, dirs[i], 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
      const mac = path.join(root, dirs[i], 'chrome-mac', 'Chromium.app',
        'Contents', 'MacOS', 'Chromium');
      if (fs.existsSync(mac)) return mac;
    }
  } catch (err) { /* no browsers directory, fall through */ }
  return null;
}

function embeddedFonts() {
  return FONTS.map(function (f) {
    const b64 = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', f.file)).toString('base64');
    return `@font-face{font-family:'${f.family}';font-style:${f.style};` +
           `font-weight:${f.weight};font-display:swap;` +
           `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
}

function shell(title, css, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="robots" content="index,follow">
<!--
  Generated from js/screens/legal.js by scripts/make_legal_pages.js.
  Do not edit this file. Edit the app screen and regenerate, or the two
  copies drift and only a lawyer or a reviewer finds out.
-->
<style>
${css}
</style>
</head>
<body>
<main class="hc-page">
${body}
</main>
</body>
</html>
`;
}

async function main() {
  /* playwright-core is what this repo ships, and it deliberately carries no
     browser of its own. The tests under tests/e2e/ resolve one the same way,
     so a machine that can run `npm test` can run this. Full `playwright` is
     accepted too, for whoever already has it. */
  let chromium, launch = {};
  try {
    ({ chromium } = require('playwright-core'));
    const exe = bundledChrome();
    if (!exe) {
      console.error('playwright-core is installed but no chromium was found.\n' +
        'Set HC_E2E_CHROME to a chromium binary, or PLAYWRIGHT_BROWSERS_PATH to\n' +
        'the directory holding one, or `npm i -D playwright` for a bundled browser.');
      process.exit(1);
    }
    launch = { executablePath: exe };
  } catch (err) {
    try {
      ({ chromium } = require('playwright'));
    } catch (err2) {
      console.error('Neither playwright-core nor playwright is installed. npm install');
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT, { recursive: true });

  // The app's own stylesheets, minus the ones that only describe app chrome.
  const css = [
    embeddedFonts(),
    read('css', 'tokens.css'),
    read('css', 'base.css'),
    read('css', 'components.css'),
    read('css', 'screens.css'),
    // The app frame is fixed and full bleed, which is right in a web view and
    // wrong on a web page that should just scroll.
    `
/* --- standalone page overrides ------------------------------------------ */
html, body { position: static; overflow: visible; height: auto; }
body { background: var(--hc-paper); }
.hc-page {
  max-width: 46rem;
  margin: 0 auto;
  padding: var(--hc-space-xxl) var(--hc-screen-pad) var(--hc-space-xxxl);
}
/* .hc-screen pads itself to clear the app's fixed header and tab bar, and
   neither exists here. */
.hc-screen { padding-top: 0; padding-bottom: 0; max-width: none; }
.hc-legal a.hc-btn { display: inline-flex; text-decoration: none; }
`
  ].join('\n');

  const browser = await chromium.launch(launch);

  for (const page of PAGES) {
    const p = await browser.newPage();
    await p.goto(`${BASE}/?v=${page.route}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);

    const body = await p.evaluate(() => {
      const view = document.getElementById('hc-view').cloneNode(true);

      // data-action buttons are wired to the app's delegated listener, which
      // does not exist here. Turn the ones that go somewhere into real links
      // and drop the rest, rather than shipping buttons that do nothing.
      view.querySelectorAll('[data-action]').forEach((el) => {
        const url = el.getAttribute('data-url');
        if (el.getAttribute('data-action') === 'open-url' && url) {
          const a = document.createElement('a');
          a.className = el.className;
          a.href = url;
          a.innerHTML = el.innerHTML;
          el.replaceWith(a);
        } else {
          el.remove();
        }
      });

      return view.innerHTML;
    });

    const html = shell(page.title, css, body);
    const file = path.join(OUT, page.file);
    fs.writeFileSync(file, html);
    console.log(`legal/${page.file}  ${(html.length / 1024).toFixed(0)} KB, self contained`);

    await p.close();
  }

  // Support page. Hand written above rather than lifted from a screen,
  // because the app has no support screen and does not need one.
  const supportFile = path.join(OUT, 'support.html');
  const supportHtml = shell('App support, Home Church', css, SUPPORT);
  fs.writeFileSync(supportFile, supportHtml);
  console.log(`legal/support.html  ${(supportHtml.length / 1024).toFixed(0)} KB, self contained`);

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'README.md'),
`# Legal pages for the web

**Generated. Do not edit these by hand.**

They are rendered from \`js/screens/legal.js\`, which is the single source of
truth for this text, so the page on the website and the screen inside the app
cannot say different things. Edit the app screen, then run:

    npx http-server -p 8770 -s &
    node scripts/make_legal_pages.js

Each file is one self contained HTML document. No external requests, no
relative paths, both typefaces embedded. Host them anywhere.

## What they are for

\`privacy.html\` has to be published at a stable public URL and that URL goes
in the **Privacy Policy URL** field in App Store Connect. Apple requires the
policy both in the app and as a public link, and a 404 or a link to a generic
homepage is a Guideline 5.1.1 rejection.

\`terms.html\` **is** required now, and the sentence that used to sit here said
it was not. That was written when nothing one person typed was ever shown to
another person. The Group tab does exactly that, so Guideline 1.2 applies, and
1.2 wants terms that forbid objectionable content and that people agree to
before they post. The app enforces the agreement itself, at the first attempt
to write in a room and again on the server, but the terms it asks people to
agree to have to be readable somewhere public.

\`support.html\` goes in the **Support URL** field, which is also required.
A homepage is thin and reviewers do check.

## Before publishing

All three are drafts and none has been read by a lawyer. See
\`LAUNCH_TODO.md\`. Run \`npm run preflight\` after regenerating: it is what
catches these three files going stale against the app screens again.
`);

  console.log('\nlegal/README.md written. privacy.html is the one that goes in App Store Connect.');
}

main();
