/* ===========================================================================
   Group mode, the switch that adds and removes a tab.

   WHAT IS ACTUALLY AT RISK HERE. `group_mode_on` is one boolean in
   app_settings and it decides whether a whole screen exists: its tile in the
   ••• sheet, its stop on the sideways swipe, its row on the More screen and
   its result in search. All four are drawn from one list, HC.modules(), which
   is the only reason they cannot drift apart — so that list is what this file
   pins.

   1. OFF IS THE ANSWER WHEN NOBODY HAS SAID. A phone that has never reached
      Supabase, a project with no 0064, and a church that has not flipped the
      switch all have to hide the tab. The fallback in the app is `false` and
      it is the whole feature: get it wrong and every phone in the church
      shows a room nobody can join.
   2. THE ROW MOVES UP, IT DOES NOT GAP. Hiding is a filter, not a hole, so
      with Group away the row starts at Journal and everything else shifts one
      slot toward the front. That is the order the sheet draws, the order a
      drag runs, and the order the More screen lists, all at once.
   3. THE ORDER ITSELF. Group, Journal, Worship, Practices, Alpha, Give, and
      it is a decision rather than an accident: the most-opened thing behind
      ••• is first and the once-a-month thing is last. A reorder should have
      to come here and say so.

   No browser. js/app.js only touches the document from inside its boot
   listener, which nothing here fires, so a stub with two methods on it is
   enough of one.
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

/* One app.js, booted with one answer to `group_mode_on`, handing back the
   routes behind ••• in the order it would draw them. `settings` is the whole
   of app_settings as far as this file is concerned, and leaving it empty is
   the phone that has never reached Supabase. */
function modules(settings) {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  sandbox.document = {
    addEventListener() {},
    readyState: 'loading',
    getElementById() { return null; }
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);

  // Only the one accessor js/app.js reads at list time. Same contract as the
  // real one: the fallback is required, and it is what a missing row means.
  sandbox.window.HC = {
    data: {
      setting: (key, fallback) =>
        Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback
    }
  };

  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'), sandbox);

  return sandbox.window.HC.modules().map((m) => m.route);
}

const WITHOUT = ['journal', 'worship', 'practices', 'alpha', 'give'];
const WITH = ['group'].concat(WITHOUT);

/* ------------------------------------------------------------------- off */

console.log('\n--- off, which is what a phone assumes ---\n');

ok('no row at all, the phone that has never reached Supabase',
   modules({}), WITHOUT);

ok('the row is there and says false',
   modules({ group_mode_on: false }), WITHOUT);

/* A row that is not a boolean at all: a text setting somebody typed under the
   same key, or a `null` from a column that was never filled in. Read strictly,
   because "not exactly true" is the safe side of this switch. */
ok('a row holding something that is not true',
   modules({ group_mode_on: 'yes' }), WITHOUT);

ok('a row holding null',
   modules({ group_mode_on: null }), WITHOUT);

/* -------------------------------------------------------------------- on */

console.log('\n--- on ---\n');

ok('the switch is on, so Group is back and it is first',
   modules({ group_mode_on: true }), WITH);

/* ----------------------------------------------------------------- order */

console.log('\n--- the order, which is a decision ---\n');

ok('Group leads, then what you wrote in it, then Sunday',
   modules({ group_mode_on: true }).slice(0, 3), ['group', 'journal', 'worship']);

ok('the two courses sit together, and Give is last',
   modules({ group_mode_on: true }).slice(3), ['practices', 'alpha', 'give']);

ok('hiding Group moves Journal into the first slot rather than leaving a gap',
   modules({})[0], 'journal');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
