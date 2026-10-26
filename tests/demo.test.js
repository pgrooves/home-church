/* ===========================================================================
   Demo mode, the rules that keep it a preview-only thing.

   WHAT IS ACTUALLY AT RISK HERE. js/demo.js ships in the App Store build and
   sits in front of every request to the live project, so the questions this
   file pins are where it can switch on and what it lets through:

   1. ONLY ON A PREVIEW. https *.pages.dev, and http://127.0.0.1 for renders
      here. Never GitHub Pages, never the app (capacitor://localhost), never
      plain http on pages.dev.
   2. ONLY READS GO THROUGH. A GET or HEAD to rest or storage may reach the
      live project; every write, rpc, function and sign-in call is answered
      here and goes nowhere.
   3. THE SAMPLE WINS where it has a route, and an overlay lays its rows over
      the live ones by key, honouring the filter the app asked with.
   4. It loads first, and store.js keeps a demo's keys apart.

   No browser; tests/e2e/demo.js drives the real thing.
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

// Loaded on a page it is not allowed on, so it only hands over its rules.
const sandbox = { window: { location: { protocol: 'https:', hostname: 'pgrooves.github.io', search: '?demo=cafe' } }, URLSearchParams, Intl };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(read('js', 'demo.js'), sandbox);
const demo = sandbox.window.HC.demo;

ok('off on GitHub Pages, even with ?demo', demo.on, false);

const here = (protocol, hostname) => demo._allowedHere({ protocol, hostname });
ok('allowed on a branch preview', here('https:', 'claude-demo-mode.home-church.pages.dev'), true);
ok('allowed on the bare pages.dev copy', here('https:', 'home-church.pages.dev'), true);
ok('allowed on 127.0.0.1 for renders', here('http:', '127.0.0.1'), true);
ok('not on GitHub Pages', here('https:', 'pgrooves.github.io'), false);
ok('not in the app', here('capacitor:', 'localhost'), false);
ok('not on http localhost', here('http:', 'localhost'), false);
ok('not on plain http pages.dev', here('http:', 'x.home-church.pages.dev'), false);
ok('not on a look-alike host', here('https:', 'pages.dev.example.com'), false);

const sample = demo._parseSample(JSON.stringify({
  overlay: { app_settings: [{ key: 'cafe_on', value_bool: true }, { key: 'cafe_open_override', value_text: 'open {{today}}' }] },
  routes: [
    { match: '/rest/v1/profiles', body: [{ id: 'p' }] },
    { match: '/rpc/hc_cafe_ahead', method: 'POST', body: 3 }
  ]
}), new Date('2026-10-25T15:00:00Z'));

ok('{{today}} is the church date', sample.overlay.app_settings[1].value_text, 'open 2026-10-25');

const kind = (m, p) => demo._decide(sample, m, p).kind;
ok('a sample route answers', kind('GET', '/rest/v1/profiles?id=eq.p'), 'route');
ok('a route can name its method', kind('POST', '/rest/v1/rpc/hc_cafe_ahead'), 'route');
ok('an overlay table is read live and laid over', kind('GET', '/rest/v1/app_settings?select=*'), 'overlay');
ok('any other read goes to the live project', kind('GET', '/rest/v1/guides?select=*'), 'read');
ok('storage reads go to the live project', kind('GET', '/storage/v1/object/public/x.png'), 'read');
ok('a write is answered here', kind('POST', '/rest/v1/journal_entries'), 'fake');
ok('an update is answered here', kind('PATCH', '/rest/v1/profiles?id=eq.p'), 'route');
ok('a delete is answered here', kind('DELETE', '/rest/v1/announcements?id=eq.1'), 'fake');
ok('an rpc is answered here', kind('POST', '/rest/v1/rpc/hc_cafe_set_status'), 'fake');
ok('a function is answered here', kind('POST', '/functions/v1/send-push'), 'fake');
ok('sign in is answered here', kind('POST', '/auth/v1/token?grant_type=password'), 'auth');
ok('a GET to auth is answered here too', kind('GET', '/auth/v1/user'), 'auth');
ok('an overlay never covers a write', kind('PATCH', '/rest/v1/app_settings?key=eq.cafe_on'), 'fake');

const live = [{ key: 'cafe_on', value_bool: false, label: 'Coffee' }, { key: 'maintenance_mode_on', value_bool: false }];
ok('overlay replaces by key and keeps the rest',
  demo._overlayRows(live, sample.overlay.app_settings, '/rest/v1/app_settings?select=*'),
  [{ key: 'cafe_on', value_bool: true, label: 'Coffee' }, { key: 'maintenance_mode_on', value_bool: false },
   { key: 'cafe_open_override', value_text: 'open 2026-10-25' }]);
ok('overlay honours key=eq',
  demo._overlayRows([], sample.overlay.app_settings, '/rest/v1/app_settings?key=eq.cafe_on'),
  [{ key: 'cafe_on', value_bool: true }]);
ok('overlay honours key=in',
  demo._overlayRows([], sample.overlay.app_settings, '/rest/v1/app_settings?key=in.(cafe_open_override,cafe_tax_percent)'),
  [{ key: 'cafe_open_override', value_text: 'open 2026-10-25' }]);

// Any other table matches on id, and only ever changes a row that came back:
// a guide made of the sample's one column would be a broken guide.
const guideRows = [{ id: 'g1', narration: { a: 1 } }, { id: 'g9', narration: { b: 2 } }];
ok('an id overlay lays over the live row it names',
  demo._overlayRows([{ id: 'g1', title: 'One', narration: {} }, { id: 'g2', title: 'Two' }],
    guideRows, '/rest/v1/guides?select=*'),
  [{ id: 'g1', title: 'One', narration: { a: 1 } }, { id: 'g2', title: 'Two' }]);
ok('and adds nothing the live project did not send',
  demo._overlayRows([], guideRows, '/rest/v1/guides?select=*'), []);

const index = read('index.html');
const at = s => index.indexOf('src="' + s);
ok('demo.js loads before everything else', at('js/demo.js') !== -1 && at('js/demo.js') < at('js/data.js') && at('js/demo.js') < at('js/store.js'), true);
ok('store.js keeps a demo apart', /HC\.demo && HC\.demo\.on \? 'hc-demo:' : 'hc:'/.test(read('js', 'store.js')), true);
ok('the samples do not ship in the app', /'demo'/.test(read('scripts', 'sync_web.js').split('const INCLUDE')[1].split(']')[0]), false);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
