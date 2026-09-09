/* ===========================================================================
   Hints, the policy only.

   WHAT IS TESTED. shouldShow(), which is the whole of when the one hint this
   app has is allowed on the glass, and nothing else. The drawing is not
   tested and does not need to be: a marker that is four pixels out is a thing
   you can see, and a hint that appears in presentation mode is not.

   WHY THESE CASES. Every one of them is a rule somebody would reasonably undo
   in six months without knowing it was a decision. HINTS.md exists because
   this feature was built once, reverted, and the reasoning nearly went with
   it, so the rules that survived are pinned here rather than left in a
   comment.

   No browser and no DOM. shouldShow takes a plain object on purpose, which is
   what makes this file possible: js/hints.js gathers the context from the
   page in one function and decides with another, and only the deciding half
   is worth a test.
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

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'hints.js'), 'utf8');

const sandbox = {
  window: {},
  document: {
    hidden: false,
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; }
  },
  setTimeout() { return 0; },
  clearTimeout() {},
  NodeFilter: { SHOW_TEXT: 4 }
};
sandbox.window.HC = {};
sandbox.window.matchMedia = () => ({ matches: false });
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const shouldShow = sandbox.window.HC.hints.shouldShow;

/* A context in which the hint is allowed. Every case below is this with one
   thing wrong, so the test says what the rule is rather than what a blob of
   booleans happens to do. */
const fine = {
  hintsOn: true,
  spent: false,
  route: 'guide-reader',
  sheetOpen: false,
  editing: false,
  hidden: false,
  inView: true
};
const but = patch => Object.assign({}, fine, patch);

/* ------------------------------------------------------------- the rules */

console.log('--- when it shows ---');
ok('everything right', shouldShow(fine), true);

console.log('\n--- the switch is the first word, and the last ---');
ok('Hints off in Your account', shouldShow(but({ hintsOn: false })), false);
/* The switch is asked before anything else so nothing can route around it.
   A hint that runs because some other condition looked more specific is the
   bug that makes somebody stop trusting a settings screen. */
ok('off beats every other reason to show', shouldShow({
  hintsOn: false, spent: false, route: 'guide-reader',
  sheetOpen: false, editing: false, hidden: false, inView: true
}), false);

console.log('\n--- once per launch ---');
ok('already shown this launch', shouldShow(but({ spent: true })), false);

console.log('\n--- where ---');
/* 'guide' is the LIST of guides and 'guide-reader' is the one you are
   reading. Getting this wrong shows the hint on a screen with no prose in it,
   which is exactly the kind of thing that looks like the feature is broken. */
ok('the guide list, not the reader', shouldShow(but({ route: 'guide' })), false);
ok('Home', shouldShow(but({ route: 'home' })), false);
ok('the Group room, which also has foldable sections',
   shouldShow(but({ route: 'group' })), false);
/* Presentation mode is a route rather than a flag, so this line is what keeps
   a hint off a television in front of a small group. */
ok('presentation mode', shouldShow(but({ route: 'present' })), false);

console.log('\n--- not over the top of something else ---');
ok('the ••• sheet is open', shouldShow(but({ sheetOpen: true })), false);
/* An admin fixing a sentence in place is working, not reading. */
ok('Edit mode is on', shouldShow(but({ editing: true })), false);
ok('the app is in the background', shouldShow(but({ hidden: true })), false);

console.log('\n--- the trigger is the scroll, not the tap ---');
/* Opening a section arms the hint and nothing more. A hint that fires on the
   fold appears under the thumb that just tapped, at the moment the panel is
   still growing, which is the moment nobody is looking at the words. */
ok('opened but not yet scrolled onto', shouldShow(but({ inView: false })), false);

console.log('\n--- and the one that would be undone as a kindness ---');
/* Somebody will eventually want this to stop after N launches, or to
   remember that it has been seen. Both need storage, both are the counter
   HINTS.md §5 was glad to be rid of, and neither is this hint: it is once a
   launch, from a variable that dies with the launch, and a phone that has
   been closed and reopened is offered it again. */
ok('a hundredth launch, not yet spent, still shows',
   shouldShow(but({ spent: false })), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
