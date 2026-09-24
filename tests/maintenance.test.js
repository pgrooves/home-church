/* ===========================================================================
   Maintenance mode, the cover over the whole app.

   WHAT IS ACTUALLY AT RISK HERE. One boolean in app_settings decides whether
   anybody but an admin can use the app at all, so the question this file pins
   is exactly who is covered:

   1. OFF IS THE ANSWER WHEN NOBODY HAS SAID. A phone that has never reached
      Supabase and a project with no 0077 both open the app as usual.
   2. ON COVERS EVERYBODY WHO IS NOT AN ADMIN. Members, leaders, and phones
      nobody has signed in on. A leader is not an admin.
   3. ADMINS ARE NEVER COVERED, or there would be nobody left who could turn
      it off.
   4. STRICTLY TRUE. A text row under the same key, or a null, is not
      somebody asking for the whole app to go dark.

   And the wiring that makes it reachable: the script is loaded after
   admin.js, the switch is on the App settings screen, and the row is not
   offered for deletion.

   No browser. js/maintenance.js only touches the document from start() and
   sync(), and with no body there is nothing for sync() to draw into.
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

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/* One maintenance.js, loaded against one answer to app_settings and one
   person holding the phone. `who` is 'admin', 'leader', 'member' or null for
   a phone nobody has signed in on. */
function load(settings, who) {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  sandbox.document = { body: null, getElementById() { return null; } };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);

  sandbox.window.HC = {
    data: {
      setting: (key, fallback) =>
        Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback
    },
    // The same question js/admin.js answers: signed in, and role is admin.
    admin: { isAdmin: () => who === 'admin' }
  };

  vm.runInContext(read('js', 'maintenance.js'), sandbox);
  return sandbox.window.HC.maintenance;
}

const KEY = 'maintenance_mode_on';
const on = {}; on[KEY] = true;
const off = {}; off[KEY] = false;

console.log('\n--- off, which is what a phone assumes ---\n');

ok('no row at all: nobody is covered', load({}, 'member').blocked(), false);
ok('the row says false: a member is not covered', load(off, 'member').blocked(), false);
ok('the row says false: a signed out phone is not covered', load(off, null).blocked(), false);

console.log('\n--- on ---\n');

ok('a member is covered', load(on, 'member').blocked(), true);
ok('a leader is covered, because a leader is not an admin', load(on, 'leader').blocked(), true);
ok('a phone nobody has signed in on is covered', load(on, null).blocked(), true);
ok('an admin is never covered', load(on, 'admin').blocked(), false);

console.log('\n--- read strictly ---\n');

const yes = {}; yes[KEY] = 'yes';
const nul = {}; nul[KEY] = null;
ok('a row holding a string is not on', load(yes, 'member').blocked(), false);
ok('a row holding null is not on', load(nul, 'member').blocked(), false);

console.log('\n--- the wiring ---\n');

const index = read('index.html');
const adminAt = index.indexOf('src="js/admin.js');
const maintAt = index.indexOf('src="js/maintenance.js');
ok('index.html loads js/maintenance.js', maintAt !== -1, true);
ok('and after js/admin.js, whose isAdmin() it asks', maintAt > adminAt && adminAt !== -1, true);
ok('boot() starts it', /HC\.maintenance\.start\(\)/.test(read('js', 'app.js')), true);

const screen = read('js', 'screens', 'admin.js');
ok('App settings draws the Maintenance mode switch',
   screen.indexOf("action: 'admin-maintenance-toggle'") !== -1, true);
ok('its row is not offered for deletion',
   screen.indexOf('maintenance_mode_on: true') !== -1, true);
ok('the tap has a handler',
   read('js', 'app.js').indexOf("'admin-maintenance-toggle': function") !== -1, true);
ok('the migration seeds it off',
   /'maintenance_mode_on',[\s\S]*?'boolean', false/.test(
     read('supabase', 'migrations', '0077_maintenance_mode.sql')), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
