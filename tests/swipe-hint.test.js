/* ===========================================================================
   The swipe hint, the policy only.

   WHAT IS TESTED. hintPolicy(), which is the whole of when the screen is
   allowed to lean toward the next tab, and nothing else. The drawing is not
   tested and does not need to be: a lean that is four pixels short is a thing
   you can see, and a lean that happens in the middle of somebody's scroll is
   not.

   WHY THESE CASES. Every one of them is a rule somebody would reasonably undo
   in six months without knowing it was a decision. HINTS.md exists because the
   hints feature was built once, reverted, and the reasoning nearly went with
   it, and §12 of it is specifically about this hint's first shape.

   No browser and no DOM. hintPolicy takes a plain object on purpose, which is
   what makes this file possible: js/swipe.js gathers the context from the page
   in one function and decides with another, and only the deciding half is
   worth a test.
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

/* --------------------------------------------------------------- the load */

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'swipe.js'), 'utf8');

const sandbox = {
  window: {},
  document: { hidden: false, addEventListener() {}, getElementById() { return null; } },
  setTimeout() { return 0; },
  clearTimeout() {}
};
sandbox.window.HC = {};
sandbox.window.matchMedia = () => ({ matches: false });
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const hintPolicy = sandbox.window.HC.swipe.hintPolicy;

/* A context in which the hint is allowed. Every case below is this with one
   thing wrong, so the test says what the rule is rather than what a blob of
   booleans happens to do. */
const fine = {
  hintsOn: true,
  used: false,
  still: false,
  laneIndex: 0,
  dir: 1,
  busy: false,
  sheetOpen: false,
  editing: false,
  hidden: false,
  scrolling: false
};
const but = patch => Object.assign({}, fine, patch);

/* ------------------------------------------------------------- the rules */

console.log('--- when it leans ---');
ok('everything right', hintPolicy(fine), true);

console.log('\n--- the switch is the first word, and the last ---');
ok('Hints off in Your account', hintPolicy(but({ hintsOn: false })), false);
/* Asked before anything else so nothing can route around it. A hint that runs
   because some other condition looked more specific is the bug that makes
   somebody stop trusting a settings screen. */
ok('off beats every other reason to lean', hintPolicy({
  hintsOn: false, used: false, still: false, laneIndex: 0, dir: 1,
  busy: false, sheetOpen: false, editing: false, hidden: false, scrolling: false
}), false);

console.log('\n--- retire on use ---');
/* Somebody who has dragged the screen sideways knows the screens move
   sideways. This is the rail's rule and it is the whole reason the hint is
   not a nag: it ends the first time it is answered. */
ok('they have already swiped', hintPolicy(but({ used: true })), false);

console.log('\n--- Reduce Motion refuses, it does not degrade ---');
/* The guide hint degrades, because it is information and the marker and the
   words are still there when nothing moves. This one IS the movement. A still
   version of it would be a different hint wearing the same name, so under
   Reduce Motion it says nothing at all. */
ok('Reduce Motion', hintPolicy(but({ still: true })), false);

console.log('\n--- where it is standing ---');
/* laneIndex is -1 for everywhere a sideways drag does not run: a guide, the
   Admin sections, presentation mode. Leaning the screen on a pushed view
   would be miming a gesture that does nothing there. */
ok('a pushed view', hintPolicy(but({ laneIndex: -1, dir: 0 })), false);
/* dir is 0 only when there is nothing on either side, which cannot happen in
   the shipping lane and is the honest answer if the row is ever one long. */
ok('nowhere to lean', hintPolicy(but({ dir: 0 })), false);
/* The last stop in the row leans the other way rather than not at all. */
ok('the last stop leans right', hintPolicy(but({ laneIndex: 8, dir: -1 })), true);

console.log('\n--- not over the top of something else ---');
/* A finger already down, or a settle still in flight, owns the same transform
   this would write to. Two things placing one element is the class of bug
   that looks like the app stuttering. */
ok('a finger is down', hintPolicy(but({ busy: true })), false);
ok('a navigation is open', hintPolicy(but({ sheetOpen: true })), false);
ok('Edit mode is on', hintPolicy(but({ editing: true })), false);
ok('the app is in the background', hintPolicy(but({ hidden: true })), false);

console.log('\n--- and not under a moving page ---');
/* A sideways lean drawn while the page is still flying vertically is a smear
   rather than a demonstration. The same rule js/index-rail.js keeps about not
   waking its notches under a thumb that is mid fling. */
ok('the page is still scrolling', hintPolicy(but({ scrolling: true })), false);

console.log('\n--- and the one that would be undone as a kindness ---');
/* Somebody will eventually want this capped after N launches, or remembered
   across them. Both need storage, and neither is this hint: it runs while the
   gesture is undiscovered and stops the moment it is used, from a variable
   that dies with the launch. */
ok('a hundredth launch, still never swiped, still leans',
   hintPolicy(but({ used: false })), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
