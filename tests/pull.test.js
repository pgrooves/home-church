/* ===========================================================================
   Pull to sync: the two decisions the gesture makes before anything moves.

   WHY THESE TWO AND NOT THE REST. js/pull.js is mostly a finger and a disc,
   and neither can be asked anything without a browser. But two pieces of it
   are arithmetic, they are the two that decide whether the feature is usable
   at all, and both are the kind of thing that goes quietly wrong:

     claim()   whose finger this is. Get it wrong in one direction and every
               scroll down the page drags a disc out; get it wrong in the
               other and the tab swipe loses gestures to a pull that should
               never have started.
     travel()  where the disc sits for a finger that has come down this far.
               It has to reach the mark, it has to keep moving past it, and
               it must never overshoot and come back, which is the one shape
               the design system rules out by name.

   No browser. js/pull.js touches window and document only inside init() and
   the handlers, none of which this calls, so an empty object is enough of
   one.

     node tests/pull.test.js
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

const yes = (label, got) => ok(label, !!got, true);

function load() {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'pull.js'), 'utf8'), sandbox);
  return sandbox.window.HC.pull;
}

const pull = load();
const travel = pull._travel;
const claim = pull._claim;

/* The numbers at the top of js/pull.js, repeated here on purpose. A test that
   read them out of the file could not tell the difference between the
   behaviour changing and the behaviour being described differently. */
const TRIP = 64;
const MAX = 104;

/* --------------------------------------------------------------- whose finger */

ok('a finger that has not moved is nobody\'s yet', claim(0, 0), 'wait');
ok('a few points down is still nobody\'s', claim(0, 5), 'wait');
ok('straight down, past the slop, is a pull', claim(0, 20), 'yes');
ok('down and a little across is still a pull', claim(6, 30), 'yes');

ok('across is the tab swipe\'s, and it does not come back',
  claim(20, 4), 'no');
ok('mostly across is the tab swipe\'s too', claim(-30, 12), 'no');
ok('up is a scroll, and it does not come back', claim(0, -20), 'no');

/* The band where neither has enough to say. It has to be 'wait' rather than
   'no': a finger that starts diagonally and straightens out is a pull, and
   answering 'no' here would have thrown it away before it did. */
ok('down but not clearly down waits rather than refuses',
  claim(12, 13), 'wait');

/* ------------------------------------------------------------------ the shape */

ok('a finger that has not moved leaves the disc home', travel(0), 0);
ok('and neither does one moving up', travel(-40), 0);

// Half the finger, up to the mark. 128 down is the disc at exactly the trip.
ok('the disc moves half as far as the thumb, up to the mark', travel(128), TRIP);
ok('half of that is half of that', travel(64), TRIP / 2);

yes('the mark is reachable, and comfortably so, in one thumb\'s length',
  travel(128) >= TRIP && 128 < 300);

/* Past the mark it keeps going and keeps slowing. Monotonic the whole way,
   which is what "no spring, no overshoot" means when it is a number: the disc
   never travels back up while the finger is still going down. */
let last = -1;
let monotonic = true;
let capped = true;
for (let dy = 0; dy <= 2000; dy += 7) {
  const at = travel(dy);
  if (at < last - 1e-9) monotonic = false;
  if (at > MAX) capped = false;
  last = at;
}
yes('the disc never travels backwards while the finger goes forwards', monotonic);
yes('and never passes the stop, however hard it is pulled', capped);

yes('past the mark it is heavier than it was before it',
  travel(128 + 40) - travel(128) < travel(128) - travel(88));

// Far enough past the mark that the disc has all but stopped, which is the
// gesture saying "understood, and there is no more" without a bounce.
yes('a very long pull rests just short of the stop',
  travel(1200) > MAX - 1 && travel(1200) <= MAX);

/* ---------------------------------------------------------------- the surface */

yes('the module is wired up and nothing else', typeof pull.init === 'function');
yes('and can say whether a sync is already out',
  typeof pull.isSyncing === 'function' && pull.isSyncing() === false);

/* There is no second way to start one, on purpose. A now() here, or anything
   like it, is what a button somewhere else would reach for, and one gesture
   syncing this app is the decision. See the head of js/pull.js. */
ok('and hands out no way to sync without a finger',
  Object.keys(pull).filter(k => !/^_/.test(k)).sort(), ['init', 'isSyncing']);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
