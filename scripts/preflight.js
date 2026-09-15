#!/usr/bin/env node
/*
 * Home Church, submission preflight.
 *
 * WHAT THIS IS FOR. Everything in SUBMISSION_KIT.md that a machine can check,
 * checked. Not a test of what the app does, which is what tests/ is for, but
 * a test of the things App Review looks at that live outside the running app:
 * the public legal pages, the privacy manifest, the icons, the screenshots,
 * and the list of files that actually get copied into the bundle.
 *
 * WHY IT EXISTS. Every one of these was true once. The failure mode is not
 * getting them wrong, it is getting them right and then changing something
 * else. That is not hypothetical: the public privacy policy and terms sat on
 * `main` for weeks describing an app with no group rooms, no journal leaving
 * the phone, and no reporting or blocking, while the app had all three. The
 * generator existed. Nobody re-ran it, because nothing failed when they
 * didn't. Now something fails.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Anything that needs a browser, a
 * network, a Mac, or an Apple account. This runs in a second as part of
 * `npm test`, on any machine, offline. The Xcode side is in XCODE.md and
 * cannot be automated from here.
 *
 *   npm run preflight
 *   node scripts/preflight.js
 *
 * Exits non-zero on the first category that fails, with the fix named.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);

let pass = 0;
const failures = [];

function ok(label, good, fix) {
  if (good) { pass += 1; return true; }
  failures.push({ label, fix });
  return false;
}

function read(...parts) {
  return fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
}

function exists(...parts) {
  return fs.existsSync(path.join(ROOT, ...parts));
}

/* ---------------------------------------------------------------- the PNGs
   Enough of a PNG reader to answer the two questions Apple asks: how big is
   it, and does it carry an alpha channel. Colour type 4 and 6 have one in the
   pixels; a tRNS chunk carries one beside them, which is the form that slips
   past a check that only reads the header. An icon with either is rejected at
   upload with ITMS-90717.
   ---------------------------------------------------------------------- */

function png(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  const out = {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],
    tRNS: false
  };
  // Walk the chunks looking for tRNS. IHDR is always first and 13 bytes long.
  let at = 8 + 4 + 4 + 13 + 4;
  while (at + 8 <= buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('ascii', at + 4, at + 8);
    if (type === 'tRNS') { out.tRNS = true; break; }
    if (type === 'IDAT' || type === 'IEND') break;
    at += 12 + len;
  }
  out.alpha = out.colorType === 4 || out.colorType === 6 || out.tRNS;
  return out;
}

/* ================================================================ 1. legal
   The public pages are generated from js/screens/legal.js and the two copies
   drift silently. Rendering them again here would need a browser and a
   server, which is exactly the cost that stops a check from running. So this
   compares structure instead: every section heading the screen defines has to
   appear in the page that screen produces, and so does the effective date.
   That is enough to catch a page generated before a section was added, which
   is the way this has actually failed.
   ===================================================================== */

function legal() {
  const src = read('js', 'screens', 'legal.js');

  const effective = (src.match(/var EFFECTIVE = '([^']+)'/) || [])[1];
  ok('legal.js declares an effective date', effective,
    'Restore `var EFFECTIVE` at the top of js/screens/legal.js.');
  if (!effective) return;

  /* Each screen is one function, and its headings are the first argument of
     every block() call inside it. Slice the file at the function boundaries
     rather than parsing it: this file is plain ES5 in one closure and the
     functions are declared in a known order. */
  function headings(fn, next) {
    const from = src.indexOf('function ' + fn + '(');
    const to = next ? src.indexOf('function ' + next + '(') : src.length;
    if (from < 0 || to < 0 || to <= from) return null;
    const body = src.slice(from, to);
    const found = [];
    const re = /block\('((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(body))) {
      const title = m[1].replace(/\\'/g, "'");
      if (title) found.push(title);
    }
    return found;
  }

  const PAGES = [
    { fn: 'privacy', next: 'terms', file: 'privacy.html' },
    { fn: 'terms', next: 'data', file: 'terms.html' }
  ];

  PAGES.forEach(function (p) {
    if (!ok('legal/' + p.file + ' exists', exists('legal', p.file),
      'Run the generator. See legal/README.md.')) return;

    const page = read('legal', p.file);
    const want = headings(p.fn, p.next);

    if (!ok('the ' + p.fn + ' screen still parses for headings', want && want.length,
      'js/screens/legal.js changed shape. Teach scripts/preflight.js the new one.')) return;

    // The generator writes the app's own escaped markup, so a heading with an
    // apostrophe in it arrives as &#39; or as a curly quote. Compare on the
    // letters and nothing else.
    const flat = (s) => s.replace(/&#39;|&amp;|&quot;/g, '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
    const haystack = flat(page);

    const missing = want.filter((h) => haystack.indexOf(flat(h)) === -1);
    ok('legal/' + p.file + ' carries all ' + want.length + ' sections of the ' + p.fn + ' screen',
      missing.length === 0,
      'These sections are in the app and not on the public page:\n        ' +
      missing.join('\n        ') +
      '\n      The page is stale. Regenerate it:\n' +
      '        npx http-server -p 8770 -s &\n' +
      '        node scripts/make_legal_pages.js');

    ok('legal/' + p.file + ' carries the effective date the app shows',
      page.indexOf('Effective ' + effective) > -1,
      'The app says ' + effective + ' and the page does not. Regenerate it.');
  });

  ok('legal/support.html exists, for the Support URL field', exists('legal', 'support.html'),
    'Run the generator. App Store Connect requires a Support URL.');
}

/* ====================================================== 2. privacy manifest
   Xcode builds the privacy report from ios-config/PrivacyInfo.xcprivacy. The
   App Store privacy label is typed by hand into App Store Connect from
   SUBMISSION_KIT.md section 5. They are two copies of one answer and a
   reviewer can compare them. This is the contract between them, written once,
   here.

   Adding a field to Your information, or anything else that sends a new kind
   of data to the server, means changing this list AND the manifest AND
   section 5. That is the point: it is meant to be three deliberate edits
   rather than one silent one.
   ===================================================================== */

const DECLARED = {
  NSPrivacyCollectedDataTypeDeviceID: false,        // the APNs token, unlinked
  NSPrivacyCollectedDataTypeName: true,
  NSPrivacyCollectedDataTypeEmailAddress: true,
  NSPrivacyCollectedDataTypePhoneNumber: true,
  NSPrivacyCollectedDataTypePhysicalAddress: true,
  NSPrivacyCollectedDataTypeOtherDataTypes: true,   // birthday, gender, campus, marital status
  NSPrivacyCollectedDataTypeUserID: true,
  NSPrivacyCollectedDataTypeOtherUserContent: true  // rooms, journal, Connect forms
};

function manifest() {
  const file = path.join(ROOT, 'ios-config', 'PrivacyInfo.xcprivacy');
  if (!ok('ios-config/PrivacyInfo.xcprivacy exists', fs.existsSync(file),
    'Apple has required a privacy manifest since spring 2024.')) return;

  const xml = fs.readFileSync(file, 'utf8');

  /* A real plist parser is not worth a dependency for a file this shape. The
     entries are <dict> blocks and each names one type and one Linked flag. */
  const entries = {};
  (xml.match(/<dict>[\s\S]*?<\/dict>/g) || []).forEach(function (block) {
    const type = (block.match(/<string>(NSPrivacyCollectedDataType\w+)<\/string>/) || [])[1];
    if (!type) return;
    entries[type] = /NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/.test(block);
  });

  const want = Object.keys(DECLARED);
  const have = Object.keys(entries);

  const missing = want.filter((t) => have.indexOf(t) === -1);
  ok('the manifest declares every data type SUBMISSION_KIT section 5 does',
    missing.length === 0,
    'Missing from ios-config/PrivacyInfo.xcprivacy:\n        ' + missing.join('\n        ') +
    '\n      Under-declaring is a metadata rejection. Add them, or if the app\n' +
    '      genuinely stopped collecting one, remove it from DECLARED here and\n' +
    '      from SUBMISSION_KIT.md section 5 in the same commit.');

  const extra = have.filter((t) => want.indexOf(t) === -1);
  ok('and declares nothing section 5 leaves out', extra.length === 0,
    'In the manifest and not in SUBMISSION_KIT section 5:\n        ' + extra.join('\n        ') +
    '\n      Over-declaring is safe with Apple and unsafe here, because the label\n' +
    '      you type in App Store Connect comes from section 5 and would not\n' +
    '      mention these. Add them there, or drop them from the manifest.');

  const wrong = want.filter((t) => have.indexOf(t) > -1 && entries[t] !== DECLARED[t]);
  ok('and marks each one linked or unlinked the way section 5 does',
    wrong.length === 0,
    wrong.map((t) => '        ' + t + ': manifest says linked=' + entries[t] +
      ', section 5 says ' + DECLARED[t]).join('\n'));

  ok('NSPrivacyTracking is false', /NSPrivacyTracking<\/key>\s*<false\/>/.test(xml),
    'There is no analytics, ad network, or attribution SDK in this app. If ' +
    'that changed,\n      an ATT prompt is now required and this is the ' +
    'smallest of the problems.');

  ok('the tracking domain list is empty', /NSPrivacyTrackingDomains<\/key>\s*<array\s*\/>/.test(xml),
    'A domain here means the app tracks. See above.');
}

/* ================================================================ 3. icons
   ITMS-90717 rejects an App Store icon with an alpha channel, at upload,
   after the build. `npm run icons` strips it, and the sources it reads from
   are what this checks: strip a source and every generated size is clean,
   miss one and the failure arrives twenty minutes into an upload.

   assets/icons/mark.png is not checked. It is the house mark used inside the
   app on its own ground and its transparency is real.
   ===================================================================== */

function icons() {
  const SQUARE = ['icon-512.png', 'icon-192.png', 'apple-touch-icon-180.png', 'favicon.png'];

  SQUARE.forEach(function (name) {
    const file = path.join(ROOT, 'assets', 'icons', name);
    if (!ok('assets/icons/' + name + ' exists', fs.existsSync(file),
      'Run `npm run icons`, or restore it.')) return;

    const info = png(file);
    if (!ok('assets/icons/' + name + ' is a readable PNG', info, 'It is not a PNG.')) return;

    ok('assets/icons/' + name + ' carries no alpha channel', !info.alpha,
      'Colour type ' + info.colorType + (info.tRNS ? ' with a tRNS chunk' : '') + '.\n' +
      '      Apple rejects an App Store icon with transparency (ITMS-90717).\n' +
      '      Run `npm run icons`, which flattens every square source.');
    ok('assets/icons/' + name + ' is square', info.width === info.height,
      info.width + ' x ' + info.height);
  });

  // The 1024 App Store icon is upscaled from 512 unless a real one is dropped
  // in. That passes review, so this is a note rather than a failure.
  if (!exists('assets', 'icons', 'icon-1024.png')) {
    console.log('  note  no assets/icons/icon-1024.png, so `npm run icons` upscales the');
    console.log('        512 for the App Store slot. It passes. Export a real 1024 from');
    console.log('        the church\'s vector art if it still exists.');
  }
}

/* ========================================================== 4. screenshots
   One size is required, 6.9 inch iPhone at 1320 x 2868 portrait, and Apple
   scales it for everything smaller. No alpha. The captions file is checked
   alongside because a screenshot set with no captions is half a store page.
   ===================================================================== */

function screenshots() {
  const dir = path.join(ROOT, 'screenshots');
  if (!ok('screenshots/ exists', fs.existsSync(dir),
    'Run `node scripts/make_screenshots.js` with the app served on 8770.')) return;

  const shots = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();

  ok('there are at least 3 screenshots', shots.length >= 3,
    'Apple allows up to 10 and SUBMISSION_KIT section 4 plans 6. ' +
    'Found ' + shots.length + '.');

  shots.forEach(function (name) {
    const info = png(path.join(dir, name));
    if (!ok('screenshots/' + name + ' is a readable PNG', info, 'It is not a PNG.')) return;
    ok('screenshots/' + name + ' is 1320 x 2868', info.width === 1320 && info.height === 2868,
      'It is ' + info.width + ' x ' + info.height + '. App Store Connect rejects ' +
      'anything else\n      in the 6.9 inch slot.');
    ok('screenshots/' + name + ' carries no alpha channel', !info.alpha,
      'Apple rejects screenshots with transparency.');
  });

  ok('screenshots/CAPTIONS.txt exists', exists('screenshots', 'CAPTIONS.txt'),
    'The captions in SUBMISSION_KIT section 4 have to be typed into App Store ' +
    'Connect from somewhere.');
}

/* ================================================================ 5. bundle
   `npx cap sync` copies webDir wholesale into the app, so scripts/sync_web.js
   decides what ships. A file the app loads at runtime and that list does not
   name works perfectly in a browser served from the repo root and 404s on a
   phone, which is a Guideline 2.1 rejection found by a reviewer rather than
   by us. This walks index.html's own references and checks each one is under
   something sync_web.js copies.
   ===================================================================== */

function bundle() {
  const sync = read('scripts', 'sync_web.js');
  const list = (sync.match(/const INCLUDE = \[([\s\S]*?)\];/) || [])[1];
  if (!ok('scripts/sync_web.js still declares an INCLUDE list', list,
    'It changed shape. Teach scripts/preflight.js the new one.')) return;

  const include = (list.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));

  const html = read('index.html');
  const refs = [];
  const re = /(?:src|href)="([^"#:]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const url = m[1].split('?')[0];
    if (!url || url.startsWith('/') || url.startsWith('data:')) continue;
    refs.push(url);
  }

  ok('index.html references at least one local file', refs.length > 0,
    'Nothing matched, so this check is not checking anything.');

  const orphans = refs.filter(function (ref) {
    const top = ref.split('/')[0];
    return include.indexOf(top) === -1 && include.indexOf(ref) === -1;
  });
  ok('every file index.html loads is inside what sync_web.js copies',
    orphans.length === 0,
    'These would 404 on a phone and work in a browser:\n        ' +
    Array.from(new Set(orphans)).join('\n        ') +
    '\n      Add the top level folder to INCLUDE in scripts/sync_web.js.');

  const missing = Array.from(new Set(refs)).filter((ref) => !fs.existsSync(path.join(ROOT, ref)));
  ok('and every one of them is actually in the repo', missing.length === 0,
    Array.from(new Set(missing)).join('\n        '));

  // Nothing may be fetched from another company's server at launch. Fonts came
  // back from Google once already; a CDN would put the same render blocking
  // third party request back into a packaged app.
  const external = (html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [])
    .filter((s) => !/schema\.org|www\.w3\.org/.test(s));
  ok('index.html loads nothing from a third party host', external.length === 0,
    external.join('\n        ') +
    '\n      Typefaces are bundled and everything else is relative. See css/fonts.css.');
}

/* ================================================================ 6. shipping
   The two identifiers that have to agree with App Store Connect, and the one
   piece of copy that is a legal date rather than a string.
   ===================================================================== */

function shipping() {
  const cap = JSON.parse(read('capacitor.config.json'));
  ok('the bundle id is com.homechurchnola.app', cap.appId === 'com.homechurchnola.app',
    'It is ' + cap.appId + '. This has to match the App ID registered with ' +
    'Apple and\n      APNS_BUNDLE_ID on the send-push function.');
  ok('webDir is www, not the repo root', cap.webDir === 'www',
    'It is ' + cap.webDir + '. The repo root ships node_modules, .git and ' +
    'supabase/\n      inside the binary. See scripts/sync_web.js.');

  const effective = (read('js', 'screens', 'legal.js').match(/var EFFECTIVE = '([^']+)'/) || [])[1];
  if (effective) {
    console.log('  note  the legal screens read "Effective ' + effective + '".');
    console.log('        Set it to the real launch date before you submit, then');
    console.log('        regenerate legal/ so the public pages agree.');
  }
}

/* ==================================================== 2b. push entitlement
   The one key that grants an app the right to register for push, and the one
   whose absence is completely silent. Without `aps-environment` iOS does not
   refuse the registration and does not raise an error, it simply never calls
   back: permission reads granted, register() resolves, and no token ever
   arrives. Every other layer looks healthy while nothing works.

   That is exactly what happened here, for the whole life of the feature, and
   it was found by hand rather than by anything that could have told us. This
   check is the thing that would have told us. It cannot see inside ios/,
   which is generated and gitignored, so it guards the copy in ios-config/
   that XCODE.md step 8 says to install.
   ===================================================================== */

function pushEntitlement() {
  const file = path.join(ROOT, 'ios-config', 'App.entitlements');
  if (!ok('ios-config/App.entitlements exists', fs.existsSync(file),
    'Without aps-environment the app can never receive a push token, and\n' +
    '      fails silently when it tries. See XCODE.md step 8.')) return;

  const xml = fs.readFileSync(file, 'utf8');

  const value = (xml.match(/<key>aps-environment<\/key>\s*<string>(\w+)<\/string>/) || [])[1];

  ok('and declares aps-environment', !!value,
    'The file is there but the key is not, which is the same as not having it.');

  /* `development` is correct here even for a build you ship. Distribution
     signing rewrites it to `production` from the provisioning profile, so a
     file that says production is either hand edited or copied from somewhere
     it should not have been, and on a development build it is the version
     that quietly fails against the sandbox gateway. */
  ok('with the development value Xcode manages', value === 'development',
    'Found "' + value + '". Leave it as development: archiving rewrites it to\n' +
    '      production from the distribution profile. The sandbox and production\n' +
    '      gateways are chosen by the APNS_HOST secret instead, per LAUNCH_TODO.md.');
}

/* ================================================ 2c. the AppDelegate hooks
   The last of the three ways this app could fail to receive a push token
   while reporting perfect health, and the only one invisible from inside the
   web layer.

   Capacitor never sees APNs directly. iOS hands the token to the app
   delegate, and @capacitor/push-notifications is listening for a
   NotificationCenter post that only two AppDelegate methods make. The
   plugin's README says to add them; `npx cap add ios` does not. Without them
   the token arrives and is dropped one layer below any JavaScript, so
   register() resolves, no listener fires, and nothing errors.

   ios/ is generated and gitignored, so this can only check a machine that has
   actually run `npx cap add ios`. Where there is no ios/ the check is skipped
   rather than failed, which keeps this honest on a fresh clone and in CI.
   ===================================================================== */

function appDelegateHooks() {
  const fragment = path.join(ROOT, 'ios-config', 'AppDelegate-push.swift');
  ok('ios-config/AppDelegate-push.swift exists', fs.existsSync(fragment),
    'It is the paste-in for AppDelegate.swift that makes push tokens reach the\n' +
    '      plugin at all. See XCODE.md step 8.');

  const delegate = path.join(ROOT, 'ios', 'App', 'App', 'AppDelegate.swift');
  if (!fs.existsSync(delegate)) {
    console.log('SKIP  ios/ is not generated here, so AppDelegate cannot be checked');
    return;
  }

  const swift = fs.readFileSync(delegate, 'utf8');

  ok('AppDelegate.swift forwards the registered token to Capacitor',
    swift.indexOf('capacitorDidRegisterForRemoteNotifications') > -1,
    'Without it iOS hands over the token and the app drops it, silently.\n' +
    '      Paste both methods from ios-config/AppDelegate-push.swift into\n' +
    '      ios/App/App/AppDelegate.swift. XCODE.md step 8 says where.');

  ok('and forwards the failure too',
    swift.indexOf('capacitorDidFailToRegisterForRemoteNotifications') > -1,
    'Without it a refused registration is silent, which is how the missing\n' +
    '      entitlement stayed hidden. Paste the second method too.');
}

/* ============================================ 2e. the Info.plist keys
   The purpose strings and the encryption answer the built app cannot ship
   without. ios-config/info-plist-keys.json is the list and the values;
   scripts/ios_plist.js writes them in on every `npm run ios`. This checks
   they arrived.

   PARSED, NOT GREPPED, and that distinction is a rejected build. The first
   version of this check searched the file's text for each key name. Build 13
   passed it, uploaded clean, and came back from Apple as ITMS-90683, missing
   purpose string. What had actually gone wrong was never established, because
   a text search cannot tell a key in the root dict from the same characters
   anywhere else in the file — so the check never had the evidence for what it
   was asserting.

   So this walks the root dict and asks what a plist parser would ask. A key
   nested in a sub-dict, sitting after </plist>, or present with an empty
   string does not count — an empty purpose string is as rejectable as no
   purpose string, and Xcode writes one whenever somebody adds a row and tabs
   away without typing.
   ===================================================================== */

/* Top level keys of an XML plist, as { key: { tag, text } }.

   Deliberately small: it reads the shape Apple's own plists have and does not
   pretend to be a plist library. Depth is tracked so a key inside a nested
   dict or array is not mistaken for a root one, and the scan stops at the
   root dict's closing tag so nothing after it is ever seen. */
function plistRootKeys(xml) {
  const text = xml.replace(/<!--[\s\S]*?-->/g, '');

  const rootStart = text.search(/<dict\s*>/);
  if (rootStart === -1) return null;   // no root dict: not a plist we can read

  const keys = {};
  const tag = /<(\/?)(\w+)(\/?)\s*>/g;
  tag.lastIndex = rootStart;

  let depth = 0;
  let pendingKey = null;
  let match;

  while ((match = tag.exec(text)) !== null) {
    const closing = match[1] === '/';
    const name = match[2];
    const selfClosing = match[3] === '/';

    if ((name === 'dict' || name === 'array') && !selfClosing) {
      /* A root key whose value is a container is still a root key, so record
         it before stepping inside. Missing these would make this function
         quietly narrower than its name, which is the bug it exists to catch
         one level up. */
      if (!closing && depth === 1 && pendingKey !== null) {
        keys[pendingKey] = { tag: name, text: '' };
        pendingKey = null;
      }
      depth += closing ? -1 : 1;
      if (depth === 0) break;          // the root dict just closed
      continue;
    }

    if (depth !== 1) continue;         // only the root dict's own children

    if (name === 'key' && !closing) {
      const end = text.indexOf('</key>', tag.lastIndex);
      if (end === -1) break;
      pendingKey = text.slice(tag.lastIndex, end).trim();
      tag.lastIndex = end + '</key>'.length;
      continue;
    }

    if (pendingKey === null || closing) continue;

    // The element right after a root <key> is that key's value.
    if (selfClosing) {
      keys[pendingKey] = { tag: name, text: '' };
    } else {
      const close = '</' + name + '>';
      const end = text.indexOf(close, tag.lastIndex);
      if (end === -1) break;
      keys[pendingKey] = { tag: name, text: text.slice(tag.lastIndex, end).trim() };
      tag.lastIndex = end + close.length;
    }
    pendingKey = null;
  }

  return keys;
}

function infoPlistKeys() {
  const keysPath = path.join(ROOT, 'ios-config', 'info-plist-keys.json');
  if (!ok('ios-config/info-plist-keys.json exists', fs.existsSync(keysPath),
    'It is the list of Info.plist keys the built app needs and the only place\n' +
    '      their values are written down. scripts/ios_plist.js writes them into\n' +
    '      ios/ from it on every `npm run ios`.')) {
    return;
  }

  const spec = JSON.parse(fs.readFileSync(keysPath, 'utf8')).keys;

  ok('and scripts/ios_plist.js is there to write them in',
    fs.existsSync(path.join(ROOT, 'scripts', 'ios_plist.js')),
    'Without it those keys are a manual Xcode step again, which is what\n' +
    '      Apple rejected build 13 for. It runs from the `ios` npm script.');

  ok('and `npm run ios` runs it', /ios_plist\.js/.test(read('package.json')),
    'The `ios` script has to end with `node scripts/ios_plist.js`, after\n' +
    '      `npx cap sync ios`, or the keys are never written.');

  const plist = path.join(ROOT, 'ios', 'App', 'App', 'Info.plist');
  if (!fs.existsSync(plist)) {
    console.log('SKIP  ios/ is not generated here, so Info.plist cannot be checked');
    return;
  }

  const rootKeys = plistRootKeys(fs.readFileSync(plist, 'utf8'));

  if (!ok('ios/App/App/Info.plist parses as a plist', rootKeys !== null,
    'No root <dict> was found in it, so nothing can read it — Xcode and Apple\n' +
    '      included. Restore it with `npx cap sync ios`, or from git history if\n' +
    '      it was hand edited into an invalid state.')) {
    return;
  }

  Object.keys(spec).forEach(function (key) {
    const want = spec[key];
    const got = rootKeys[key];

    const present = got !== undefined &&
      !(want.type === 'string' && (got.tag !== 'string' || got.text === ''));

    ok('Info.plist has ' + key, present,
      (got === undefined
        ? 'It is not a key of the root <dict>. A text search can still find it\n' +
          '      in the file — that is how build 13 was archived and rejected — so\n' +
          '      check where it actually sits.\n      '
        : 'It is there but empty or the wrong type, which Apple treats as\n' +
          '      missing.\n      ') +
      'Run `npm run ios`, which writes it from\n' +
      '      ios-config/info-plist-keys.json. ' + (want.why || ''));
  });
}

/* ============================================== 2d. the plugin manifest
   Every native capability this app has arrives as a plugin, and a plugin that
   did not make it into the Xcode project is the quietest failure mode here.
   js/native.js reaches each one through window.Capacitor.Plugins and treats
   an absent one as "this phone cannot do that", which is the right answer in
   a browser and a lie in a packaged app. So a missing plugin does not throw,
   does not log, and does not look like itself:

     - no local-notifications, and Get notified is never drawn at all
     - no calendar, and Add to calendar falls back to the send-to sheet,
       which is the bug that sent somebody looking at the Cal tab for it
     - no haptics, and every confirmation is silently flat

   None of those are visible from inside the web layer, and all of them are
   one `npm install` away from being fine.

   CHECKED AGAINST package.json RATHER THAN A LIST HERE, because a list here
   is a list to forget: the calendar plugin was added to fix Add to calendar
   and a hand written check would have gone on passing without it. Both
   manifests below name each plugin by its path under node_modules, which is
   the package name, so the dependency names are the only thing anything has
   to agree about and native module names never come into it.

   WHICHEVER MANIFEST CAPACITOR ACTUALLY WROTE, and reading only one of them
   is how the first version of this check managed to verify nothing at all.
   Capacitor builds iOS either of two ways. Under CocoaPods it writes a
   Podfile, and Podfile.lock says the pod installed. Under Swift Package
   Manager — which is what this project uses, and what `cap sync` means by
   "Writing Package.swift" — it writes ios/App/CapApp-SPM/Package.swift and
   there is no lock file to read, because local path dependencies are
   resolved by Xcode at build time and never appear in Package.resolved.

   This check looked only for a Podfile at first. There is no Podfile here
   and never will be, so it skipped every run while announcing that ios/ was
   not generated — which was false, and which is exactly the "a check that
   only answers about the thing you thought of" failure it was written to
   replace. Now a generated ios/ with neither manifest is a failure rather
   than a shrug.

   ios/ is generated and gitignored, so like the AppDelegate check above this
   can only check a machine that has run `npx cap add ios`, and skips rather
   than fails anywhere else.
   ===================================================================== */

/* The dependencies that are Capacitor plugins, out of the ones whose names
   merely say Capacitor. Two are not plugins and neither appears in the
   manifest beside the plugins:

     @capacitor/core is the JavaScript bridge and has no native side at all.

     @capacitor/ios is the platform. Under CocoaPods it is a pod like any
     other, pulled from its node_modules path, which is why a Podfile names
     it. Under Swift Package Manager the runtime comes from Capacitor's own
     remote package instead — capacitor-swift-pm, by URL — so Package.swift
     never names @capacitor/ios, and expecting it there fails a build that is
     perfectly fine. That false alarm shipped, on a green build, because the
     fixture it was tested against was written from this same list and so
     agreed with the bug. `cap sync` counts 11 plugins; this has to agree.

   Split out from pluginPods so tests/plugin-manifest.test.js can hold the
   rule to that number rather than to a fixture of my own making. */
function capacitorPlugins(dependencies) {
  const NOT_PLUGINS = ['@capacitor/core', '@capacitor/ios'];
  return Object.keys(dependencies || {})
    .filter((name) => /capacitor/i.test(name) && NOT_PLUGINS.indexOf(name) === -1);
}

function pluginPods() {
  const pkg = JSON.parse(read('package.json'));

  const plugins = capacitorPlugins(pkg.dependencies);

  if (!fs.existsSync(path.join(ROOT, 'ios'))) {
    console.log('SKIP  ios/ is not generated here, so the plugin list cannot be checked');
    return;
  }

  const spm = path.join(ROOT, 'ios', 'App', 'CapApp-SPM', 'Package.swift');
  const podfile = path.join(ROOT, 'ios', 'App', 'Podfile');

  let manifest;          // what `cap sync` wrote, and its name for a message
  let installed = null;  // CocoaPods only: what actually got installed

  if (fs.existsSync(spm)) {
    manifest = { name: 'Package.swift', text: fs.readFileSync(spm, 'utf8') };

    /* The platform itself, which the plugin loop deliberately no longer looks
       for because SPM names it differently from everything else. Checked here
       instead, so dropping it from that list did not drop it from the run. */
    ok('Package.swift pulls in the Capacitor runtime',
      manifest.text.indexOf('capacitor-swift-pm') > -1,
      'Without it there is no Capacitor in the build at all, and no plugin\n' +
      '      could load even if every one of them is listed. Run\n' +
      '      `npm install && npm run ios` and read what cap sync prints.');
  } else if (fs.existsSync(podfile)) {
    manifest = { name: 'the Podfile', text: fs.readFileSync(podfile, 'utf8') };

    const lockPath = path.join(ROOT, 'ios', 'App', 'Podfile.lock');
    installed = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : null;

    if (!ok('Podfile.lock exists, so pod install has run at least once', installed !== null,
      'ios/App/Podfile.lock is missing, which means CocoaPods never ran. Run\n' +
      '      `npm install && npm run ios`. If that still leaves no lock file, the\n' +
      '      pod install inside `npx cap sync ios` is failing — read its output\n' +
      '      rather than opening Xcode, which will build happily without it.')) {
      return;
    }
  } else {
    ok('ios/ has a plugin manifest', false,
      'ios/ exists but has neither ios/App/CapApp-SPM/Package.swift nor\n' +
      '      ios/App/Podfile, so nothing here can say which plugins are in the\n' +
      '      build. Run `npm run ios` and read what `npx cap sync ios` prints:\n' +
      '      its own "Found N Capacitor plugins for ios" list is the answer\n' +
      '      until this passes.');
    return;
  }

  plugins.forEach(function (name) {
    /* The second question is only asked when the first passed, so a plugin
       `cap sync` never saw fails once with the reason it actually has rather
       than twice with the second reason being wrong about the first. */
    if (!ok(name + ' is in ' + manifest.name, manifest.text.indexOf(name) > -1,
      '`npx cap sync ios` has not seen it. Run `npm install && npm run ios`.\n' +
      '      Until then the plugin is absent at runtime, and js/native.js\n' +
      '      treats absent as "this phone cannot do that" — silently.')) return;

    if (installed === null) return;   // SPM: the manifest is the whole answer

    ok('and ' + name + ' is installed', installed.indexOf(name) > -1,
      'It is in the Podfile but not in Podfile.lock, so pod install did not\n' +
      '      finish. Run `npm run ios` again and read the CocoaPods output.\n' +
      '      Xcode will build without it and the capability will just be gone.');
  });
}

/* ------------------------------------------------------------------ run it */

console.log('Preflight, everything in SUBMISSION_KIT.md a machine can check.\n');

legal();
manifest();
pushEntitlement();
appDelegateHooks();
infoPlistKeys();
pluginPods();
icons();
screenshots();
bundle();
shipping();

console.log('');
if (failures.length === 0) {
  console.log(pass + ' checks passed.');
  console.log('');
  console.log('What is left is in LAUNCH_TODO.md and XCODE.md, and none of it can be');
  console.log('checked from here: Apple Developer enrollment, APNs credentials, the');
  console.log('App Store Connect metadata, and the Xcode settings.');
  process.exit(0);
}

failures.forEach(function (f) {
  console.log('FAIL  ' + f.label);
  if (f.fix) console.log('      ' + f.fix);
  console.log('');
});
console.log(pass + ' passed, ' + failures.length + ' failed.');
process.exit(1);
