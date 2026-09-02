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
  const seen = (over && over._seen) || {};
  return Object.assign({
    route: 'home',
    signedIn: false,
    configured: true,
    splashUp: false,
    sheetOpen: false,
    hidden: false,
    hintsOn: true,
    busyScreen: false,
    typing: false,
    alreadyRanThisLaunch: false,
    screenRuns: 0,
    launch: 5,
    sinceLast: Infinity,
    hintState: (id) => seen[id] || { seen: 0, used: false }
  }, over || {});
}

// A screen hint, for everything below the launch hint's own cases.
const screenHint = { id: 'guide.highlight', kind: 'screen', route: 'guide-reader' };
function sctx(over) { return ctx(Object.assign({ route: 'guide-reader' }, over || {})); }

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

console.log('\n--- the off switch, which nothing may route around ---');
/* First line of shouldShow, deliberately, so no kind and no future gate can
   sit in front of it. Both kinds, because a switch that only silenced one of
   them would be a switch that looks broken. */
ok('hints off silences the launch hint',
  shouldShow(account, ctx({ hintsOn: false })), false);
ok('hints off silences a screen hint',
  shouldShow(screenHint, sctx({ hintsOn: false })), false);
ok('hints off beats every other condition being perfect',
  shouldShow(screenHint, sctx({ hintsOn: false, launch: 99 })), false);

console.log('\n--- retire on use, not on views ---');
ok('a screen hint runs when the thing has not been used',
  shouldShow(screenHint, sctx()), true);
ok('and is finished the moment it has',
  shouldShow(screenHint, sctx({ _seen: { 'guide.highlight': { seen: 0, used: true } } })), false);
ok('used beats everything, including never having been seen',
  shouldShow(screenHint, sctx({ _seen: { 'guide.highlight': { seen: 0, used: true } } })), false);

console.log('\n--- the seen cap, a backstop and not the rule ---');
ok('twice seen still shows',
  shouldShow(screenHint, sctx({ _seen: { 'guide.highlight': { seen: 2, used: false } } })), true);
ok('three times seen does not',
  shouldShow(screenHint, sctx({ _seen: { 'guide.highlight': { seen: 3, used: false } } })), false);

console.log('\n--- launch one belongs to the account hint alone ---');
ok('no screen hint on launch one',
  shouldShow(screenHint, sctx({ launch: 1 })), false);
ok('but the account hint still fires on launch one',
  shouldShow(account, ctx({ launch: 1 })), true);
ok('screen hints start on launch two',
  shouldShow(screenHint, sctx({ launch: 2 })), true);

console.log('\n--- the session budget and the cooldown ---');
ok('a second screen hint in a launch is allowed',
  shouldShow(screenHint, sctx({ screenRuns: 1 })), true);
ok('a third is not',
  shouldShow(screenHint, sctx({ screenRuns: 2 })), false);
ok('and none within forty five seconds of the last',
  shouldShow(screenHint, sctx({ sinceLast: 44000 })), false);
ok('just after is fine',
  shouldShow(screenHint, sctx({ sinceLast: 46000 })), true);

console.log('\n--- the two budgets do not touch ---');
/* The whole reason §7 exists. A signed out phone runs the account hint every
   launch, and if that spent the screen budget nothing else could ever run. */
ok('a launch hint having run does not block a screen hint',
  shouldShow(screenHint, sctx({ alreadyRanThisLaunch: true })), true);
ok('and screen hints having run do not block the launch hint',
  shouldShow(account, ctx({ screenRuns: 2 })), true);

console.log('\n--- a screen hint stays on its own screen ---');
ok('not on the wrong route',
  shouldShow(screenHint, sctx({ route: 'home' })), false);
ok('a screen hint with no route runs anywhere',
  shouldShow({ id: 'shell.swipe', kind: 'screen' }, sctx()), true);

console.log('\n--- never while somebody is working ---');
ok('not in presentation mode',
  shouldShow(screenHint, sctx({ busyScreen: true })), false);
ok('not while a text box has focus',
  shouldShow(screenHint, sctx({ typing: true })), false);
ok('and not for the launch hint either',
  shouldShow(account, ctx({ typing: true })), false);

console.log('\n--- a confirmation hint is not a screen hint ---');
/* It shows once, ever, at a moment the person created by finishing
   something. A rule that defers it does not delay it, it cancels it. This is
   the bug the browser found: with the screen rules applied, noting a line
   within forty five seconds of any other hint silently spent the only
   showing this hint would ever have. */
const confirm = { id: 'journal.first', kind: 'after', limit: 1 };
ok('fires inside the cooldown, where a screen hint would not',
  shouldShow(confirm, ctx({ sinceLast: 1000 })), true);
ok('fires with the session budget already spent',
  shouldShow(confirm, ctx({ sinceLast: 1000, screenRuns: 2 })), true);
ok('fires on launch one, because the action is what summoned it',
  shouldShow(confirm, ctx({ launch: 1 })), true);
ok('but only once, ever',
  shouldShow(confirm, ctx({ _seen: { 'journal.first': { seen: 1, used: false } } })), false);
ok('and still answers to the off switch',
  shouldShow(confirm, ctx({ hintsOn: false })), false);
ok('and still not while somebody is typing',
  shouldShow(confirm, ctx({ typing: true })), false);

console.log('\n--- the opening moment belongs to the launch hint ---');
/* The regression that shipped: a screen hint's settle timer is shorter than
   the launch hint's delay, so the screen hint took the glass and the account
   hint was dropped on `if (current)`. The symptom was the account hint
   appearing on the very first launch and never again, which reads like §3d
   being broken rather than like two kinds racing.

   The ordering itself lives in arm() and cannot be reached from here, so what
   is asserted is the thing that made the race possible: both kinds are
   eligible at the same moment on a signed out launch two, and nothing in the
   policy separates them. Ordering is the scheduler's job, and this is the
   note that says so. */
ok('on a signed out launch two, the account hint is eligible',
  shouldShow(account, ctx({ launch: 2 })), true);
ok('and so is a screen hint, at the same moment',
  shouldShow(screenHint, sctx({ launch: 2 })), true);
ok('so the launch hint keeps its slot after a screen hint has run',
  shouldShow(account, ctx({ launch: 2, screenRuns: 1, sinceLast: 1000 })), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
