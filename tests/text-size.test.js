/* ===========================================================================
   Text size, and the rotation that used to change it.

   WHAT WENT WRONG. css/base.css let -webkit-text-size-adjust go to auto, to
   pick up the accessibility text size somebody had already set in iOS
   Settings. `auto` also hands WKWebView its text autosizing, which boosts
   every font by the ratio of the viewport width to the layout width. Turning
   the phone sideways made the whole app bigger, turning it back left it
   bigger, and the only way out was killing the app. Nothing in the app could
   see the number, so nothing in the app could put it back.

   WHAT IS TESTED HERE. That the property stays pinned, in the stylesheet and
   in the three generated legal pages, because that CSS line is the bug; and
   that pinning it did not quietly drop the accessibility size, which
   js/store.js now reads itself and folds into --hc-text-scale. The bounds
   matter as much as the reading: this multiplies a scale that already goes to
   1.4, so it may never shrink the app and may never run away with it.

   No browser. jsdom is not a dependency of this project and is not going to
   become one, so the handful of DOM calls js/store.js makes are faked below,
   the way tests/edit-mode.test.js fakes its own.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};
const okTrue = (label, got) => ok(label, !!got, true);

/* --------------------------------------------------------------- the fakes */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => Array.from(map.keys())[i],
    get length() { return map.size; }
  };
}

/* A probe's inline style. `known` is whether this browser understands
   -apple-system-body: WebKit keeps the declaration, everything else drops it
   on the floor, which is exactly how js/store.js decides where it is. */
function probeStyle(known) {
  const s = { position: '', visibility: '', pointerEvents: '', font: '' };
  let font = '';
  Object.defineProperty(s, 'font', {
    get: () => font,
    set: v => { if (known) font = v; }
  });
  return s;
}

/* opts.px        what -apple-system-body computes to. 17 is the default Large.
   opts.known     whether the CSSOM keeps the keyword. Default true.
   opts.supports  what window.CSS.supports says, or undefined for no CSS API.
   opts.computed  a computed size for a probe whose declaration was dropped,
                  for the one browser that answers the two questions
                  differently. */
function fakeDom(opts) {
  const o = opts || {};
  const known = o.known !== false;

  const root = {
    attrs: {},
    setAttribute: function (k, v) { root.attrs[k] = v; },
    getAttribute: function (k) { return k in root.attrs ? root.attrs[k] : null; },
    style: {
      props: {},
      setProperty: function (k, v) { root.style.props[k] = v; }
    }
  };

  const body = {
    children: [],
    appendChild: function (n) { body.children.push(n); return n; },
    removeChild: function (n) {
      body.children = body.children.filter(function (c) { return c !== n; });
      return n;
    }
  };

  const doc = {
    documentElement: root,
    body: body,
    createElement: function () {
      return {
        attrs: {},
        style: probeStyle(known),
        setAttribute: function (k, v) { this.attrs[k] = v; }
      };
    },
    querySelector: function () { return null; }
  };

  const win = {
    localStorage: fakeStorage(),
    console: console,
    matchMedia: function () { return { matches: false }; },
    /* A page that never asked for -apple-system-body is 16px, the same as
       every other div. Only the probe that got the keyword reads the setting. */
    getComputedStyle: function () {
      if (o.computed !== undefined) return { fontSize: o.computed + 'px' };
      return { fontSize: (known ? (o.px === undefined ? 17 : o.px) : 16) + 'px' };
    }
  };
  if (o.supports !== undefined) {
    win.CSS = { supports: function () { return o.supports; } };
  }

  return { win: win, doc: doc, root: root, body: body };
}

function load(dom) {
  const sandbox = { window: dom.win, document: dom.doc, console: console };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = dom.doc;
  vm.createContext(sandbox);
  ['data.js', 'store.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  });
  return sandbox.window.HC;
}

/* The number the app actually paints with, after Profile and iOS have both
   had their say. */
function scaleFor(opts) {
  const dom = fakeDom(opts);
  const HC = load(dom);
  if (opts && opts.textScale) HC.store.updateProfile({ textScale: opts.textScale });
  HC.store.applyPreferences();
  return dom.root.style.props['--hc-text-scale'];
}

/* -------------------------------------------- the stylesheet, which is the bug */

{
  const base = fs.readFileSync(path.join(__dirname, '..', 'css', 'base.css'), 'utf8');
  okTrue('base.css pins -webkit-text-size-adjust',
    /-webkit-text-size-adjust:\s*100%/.test(base));
  okTrue('and the unprefixed one with it',
    /[^-]text-size-adjust:\s*100%/.test(base));

  /* The three public pages inline css/base.css at generation time, so `auto`
     coming back anywhere is the same rotation bug on the open web. */
  const files = ['css/base.css', 'legal/privacy.html', 'legal/terms.html',
    'legal/support.html'];
  const loose = files.filter(function (f) {
    return /text-size-adjust:\s*auto/.test(
      fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  });
  ok('nothing anywhere lets it go back to auto', loose, []);
}

/* --------------------------------------------------- reading the iOS setting */

{
  // Large, which is what a phone nobody has touched reports. The app's own
  // default is 110% and that is all the person should get.
  ok('the default size leaves the app where Profile put it',
    scaleFor({ px: 17 }), '1.1');

  // xL. 19/17 is 1.118, times the app's 1.1.
  ok('a larger system size multiplies the app\'s own',
    scaleFor({ px: 19 }), '1.23');

  // The person turned the app up as well. Both choices count.
  ok('and multiplies the largest step too',
    scaleFor({ px: 19, textScale: 1.4 }), '1.565');

  // xxxL, 1.353, just past the ceiling.
  ok('the ceiling holds at the top of the ordinary sizes',
    scaleFor({ px: 23 }), '1.485');

  // AX5 is 53px, 3.1x. Unbounded, that is four words on a screen.
  ok('and holds against the accessibility sizes',
    scaleFor({ px: 53 }), '1.485');
  ok('however far up they go',
    scaleFor({ px: 53, textScale: 1.4 }), '1.89');

  // Somebody who set iOS smaller did not ask this app to be tighter than it
  // was drawn, and Profile's smallest step is the smallest it reads well at.
  ok('a smaller system size never shrinks the app',
    scaleFor({ px: 14 }), '1.1');
}

/* ------------------------------------------------- browsers that are not iOS */

{
  ok('a browser that drops the keyword is left alone',
    scaleFor({ known: false, px: 53 }), '1.1');

  // CSS.supports says yes and the CSSOM still serialises the shorthand back
  // as empty, which is the one case where trusting style.font alone would
  // have refused a real iOS phone its setting.
  ok('CSS.supports is enough on its own',
    scaleFor({ known: false, supports: true, computed: 19 }), '1.23');
  ok('and a browser that says no is still left alone',
    scaleFor({ known: false, supports: false, computed: 19 }), '1.1');
}

/* -------------------------------------------- coming back from Settings */

{
  const dom = fakeDom({ px: 17 });
  const HC = load(dom);
  HC.store.applyPreferences();
  ok('boots at the size the phone reports', dom.root.style.props['--hc-text-scale'], '1.1');

  ok('a refresh that finds nothing changed says so, and touches nothing',
    HC.store.refreshSystemTextScale(), false);
  ok('still there', dom.root.style.props['--hc-text-scale'], '1.1');

  // Off to Settings, up two steps, back in.
  dom.win.getComputedStyle = function () { return { fontSize: '23px' }; };
  ok('the trip to Settings is noticed on the way back',
    HC.store.refreshSystemTextScale(), true);
  ok('and lands in the property every font is a calc() away from',
    dom.root.style.props['--hc-text-scale'], '1.485');

  // The probe is a visitor. It does not get to stay in the document.
  ok('the probe leaves nothing behind', dom.body.children.length, 0);
}

/* ------------------------------------------- rotation, which is the whole point */

{
  /* There is no viewport in this fake and that is the argument: the scale is
     now a function of two preferences and nothing else. Width does not appear
     in it, so turning the phone cannot change it, and there is no boost left
     over to fail to come back. Resizing the window and asking again gets the
     same number. */
  const dom = fakeDom({ px: 17 });
  const HC = load(dom);
  HC.store.applyPreferences();
  const portrait = dom.root.style.props['--hc-text-scale'];

  dom.win.innerWidth = 926;   // landscape, as far as anything here can tell
  HC.store.applyPreferences();
  const landscape = dom.root.style.props['--hc-text-scale'];

  dom.win.innerWidth = 428;
  HC.store.applyPreferences();

  ok('landscape does not change the text scale', landscape, portrait);
  ok('and portrait comes back to the same number',
    dom.root.style.props['--hc-text-scale'], portrait);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
