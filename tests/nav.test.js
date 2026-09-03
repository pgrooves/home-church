/* ===========================================================================
   The row a sideways drag runs, and where it stops being a row.

   WHY THIS FILE EXISTS. There are now three overlapping answers to "is this a
   top level place", and they disagree on purpose:

     isTop      a name in the row. What the sheet and the tab bar ask.
     isStop     the same question of a whole route, so an Admin section can be
                told apart from the Admin menu it shares a name with. What the
                chrome asks: back arrow, logo, the raised tile.
     laneIndex  where a drag stands, which is the row plus Settings parked one
                past the end of it. What js/swipe.js asks.

   Settings is the one route where the last two part company: a drag runs
   through it and it still arrives as a pushed view with an arrow out. Admin's
   four sections are the other way round, a stop's name that is not a stop.
   Both are one `if` away from being wrong in a way nothing on screen would
   announce, so both are pinned here.

   The rows below are what js/app.js hands over in syncModules: the sheet's
   tiles, stops first and the pushed views parked past them second, in the
   order the sheet draws them. An admin has one more stop than everybody else,
   so both phones are asked.

   No browser. js/router.js touches window only inside start(), which nothing
   here calls, so an empty object is enough of one.
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

function router(stops, past) {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8'), sandbox);
  const r = sandbox.window.HC.router;
  r.setModules(stops, past);
  return r;
}

// What syncModules hands over on a phone signed in as an admin, and on
// everybody else's, which has no Admin tile.
const MODULES = ['worship', 'group', 'practices', 'alpha', 'journal', 'give'];
const admin = router(MODULES.concat(['admin']), ['profile']);
const member = router(MODULES, ['profile']);

/* ------------------------------------------------------------------ the row */

ok('the row is the five tabs and then the sheet, in the sheet\'s order',
  admin.stops(),
  ['home', 'listen', 'guide', 'cal', 'connect'].concat(MODULES, ['admin']));

ok('and it is one shorter without an Admin tile',
  member.stops().indexOf('admin'), -1);

ok('Settings is not in it',
  admin.stops().indexOf('profile'), -1);

/* ----------------------------------------------------------------- the lane */

ok('the drag goes one screen further than the row, and Settings is that screen',
  admin.lane().slice(-2), ['admin', 'profile']);

ok('on a phone with no Admin tile, Settings comes straight off Give',
  member.lane().slice(-2), ['give', 'profile']);

ok('a drag left off Admin brings Settings in',
  admin.lane()[admin.laneIndex({ name: 'admin' }) + 1], 'profile');

ok('and a drag right off Settings goes back to Admin',
  admin.lane()[admin.laneIndex({ name: 'profile' }) - 1], 'admin');

ok('past Settings there is nothing, which is the edge pull',
  admin.lane()[admin.laneIndex({ name: 'profile' }) + 1], undefined);

/* ------------------------------------------ where the three answers disagree */

ok('Settings is somewhere a drag runs',
  admin.laneIndex({ name: 'profile' }) >= 0, true);

ok('and is still a pushed view when it gets there, so it keeps its back arrow',
  [admin.isStop({ name: 'profile' }), admin.isTop('profile')], [false, false]);

ok('the Admin menu is a stop and a drag runs through it',
  [admin.isStop({ name: 'admin' }), admin.laneIndex({ name: 'admin' }) >= 0],
  [true, true]);

ok('an Admin section is neither, though it wears the same route name',
  [admin.isStop({ name: 'admin', id: 'users' }),
   admin.laneIndex({ name: 'admin', id: 'users' })],
  [false, -1]);

ok('a pushed view that is in neither list is in neither answer',
  [admin.isStop({ name: 'search' }), admin.laneIndex({ name: 'search' })],
  [false, -1]);

ok('and nothing at all is nowhere',
  [admin.isStop(null), admin.laneIndex(null)], [false, -1]);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
