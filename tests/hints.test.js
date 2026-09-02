/* ===========================================================================
   The first launch hint, and the one rule worth defending in a test.

   WHY THIS FILE EXISTS. js/hints.js draws almost nothing and decides almost
   everything, and the deciding is where the bugs are. They are quiet ones. A
   hint that stops dying on a view change is not a crash, it is a caption left
   over a screen it was never about. A hint that stops showing is nothing at
   all, which is worse, because nothing is exactly what it looks like when it
   is working correctly and the phone is signed in.

   THE CASE THAT MATTERS MOST is the hundredth launch. HINTS.md §3d says the
   hint runs every launch until there is an account, with no limit and no
   counter, and that is a decision somebody will find in six months, assume is
   an oversight, and "fix" by adding a cap. The test below is how a deliberate
   decision survives contact with a reasonable person who was not in the room.

   No browser. jsdom is not a dependency of this project and is not going to
   become one. shouldShow() is pure on purpose, so the whole policy is
   reachable with a plain object, exactly as tests/announcements.test.js
   reaches its seams. There is not even a faked localStorage here, because
   §3d left this feature with no stored state at all.
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

/* js/hints.js touches document and window.matchMedia at load, so it gets the
   smallest pair that lets it define itself. Nothing below calls anything that
   uses them: shouldShow() is the pure half and this file only tests that. */
function load() {
  const noop = () => {};
  const sandbox = {
    window: {
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: noop,
      setTimeout: noop,
      clearTimeout: noop,
      addEventListener: noop
    },
    document: { hidden: false, addEventListener: noop, getElementById: () => null }
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'hints.js'), 'utf8'), sandbox);
  return sandbox.window.HC;
}

const HC = load();
const shouldShow = HC.hints.shouldShow;

/* The account hint's own `when`, written out here rather than imported,
   because it lives in js/app.js next to the registration it belongs to. If
   the two ever disagree this file is the one that is wrong, and that is the
   right way round: the copy here is what the policy is supposed to be. */
const account = {
  id: 'account',
  when: (ctx) => ctx.configured && !ctx.signedIn && ctx.route === 'home'
};

/* A launch where everything is fine. Every case below is this with one thing
   changed, so what each test is actually about is the line that overrides. */
function ctx(over) {
  return Object.assign({
    route: 'home',
    signedIn: false,
    configured: true,
    splashUp: false,
    sheetOpen: false,
    hidden: false,
    alreadyRanThisLaunch: false
  }, over || {});
}

console.log('\n--- the happy path ---');
ok('a signed out phone on Home gets the hint',
  shouldShow(account, ctx()), true);

console.log('\n--- the only terminal condition ---');
ok('signed in never shows',
  shouldShow(account, ctx({ signedIn: true })), false);

console.log('\n--- the hundredth launch, which is the point of this file ---');
/* There is no launch counter to advance, which is exactly what is being
   asserted: nothing about the hundredth launch differs from the first, so the
   same context is the same answer. If somebody adds a cap, they have to add a
   counter, and adding a counter means changing shouldShow's signature, and
   changing its signature breaks this file. That is the tripwire. */
ok('a hundredth launch, still signed out, still shows',
  shouldShow(account, ctx()), true);
ok('and shouldShow takes no state argument, so there is nothing to count with',
  shouldShow.length, 2);
ok('opening Profile without signing in does not retire it',
  shouldShow(account, ctx({ route: 'home', signedIn: false })), true);

console.log('\n--- pointing at something that is not there ---');
ok('unconfigured auth never shows, because a sign-in that is not wired up is worse than silence',
  shouldShow(account, ctx({ configured: false })), false);

console.log('\n--- where it is allowed to go ---');
ok('not on Home does not show',
  shouldShow(account, ctx({ route: 'listen' })), false);
ok('nor in a guide somebody opened straight into',
  shouldShow(account, ctx({ route: 'guide' })), false);
ok('nor on Profile, where the thing it points at is already on screen',
  shouldShow(account, ctx({ route: 'profile' })), false);

console.log('\n--- not over something else ---');
ok('the splash still up does not show',
  shouldShow(account, ctx({ splashUp: true })), false);
ok('the ••• sheet open does not show',
  shouldShow(account, ctx({ sheetOpen: true })), false);
ok('a backgrounded app does not show',
  shouldShow(account, ctx({ hidden: true })), false);

console.log('\n--- one hint per launch ---');
ok('a second eligible hint does not show once one has run',
  shouldShow(account, ctx({ alreadyRanThisLaunch: true })), false);
ok('and that is decided here rather than by any hint, so a new hint inherits it',
  shouldShow({ id: 'other', when: () => true }, ctx({ alreadyRanThisLaunch: true })), false);

console.log('\n--- a hint with no opinion ---');
ok('a spec with no when() is eligible whenever the scheduler is',
  shouldShow({ id: 'bare' }, ctx()), true);
ok('and still cannot jump the one per launch rule',
  shouldShow({ id: 'bare' }, ctx({ alreadyRanThisLaunch: true })), false);
ok('nothing registered shows nothing',
  shouldShow(null, ctx()), false);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
