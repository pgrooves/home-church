/* ===========================================================================
   The home groups box on Connect.

   WHY THIS FILE EXISTS. That box used to hold one sentence a person wrote
   about a season that had not started. It now holds whatever the church last
   said about home groups, shortened out of an announcement by a language
   model reading the church's email, and drawn with the links in it live. Two
   things about that are worth a test rather than a read-through.

   THE ESCAPING. linkify() is the only place on this screen where a string out
   of the database becomes markup rather than text. Everything else goes
   through c.esc() and stops. If that ever slipped, the symptom would not be a
   broken layout — it would be nothing visible at all, on a public screen,
   fed by a pipeline whose input is email. So the escaping is asserted here,
   including the case that matters most: a note that contains a tag.

   THE COLUMN. The flyer is a new column on church_profile, and the app reads
   it through the same mapper every other content column goes through. A
   mapper that silently dropped it would leave the button apparently working
   and the picture never appearing, which is a bug nobody would think to look
   for in content.js.

   No browser. Same rule as tests/announcements.test.js: jsdom is not a
   dependency of this project and is not going to become one.
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

/* ------------------------------------------------------------ the mapper */

function bootContent(rows) {
  const sandbox = {
    window: {
      localStorage: fakeStorage(),
      fetch: (url) => {
        const table = /rest\/v1\/([a-z_]+)/.exec(String(url))[1];
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(table === 'church_profile' ? rows : [])
        });
      },
      AbortController: null,
      setTimeout: () => 0,
      clearTimeout: () => {}
    },
    console
  };
  sandbox.window.window = sandbox.window;
  sandbox.setTimeout = sandbox.window.setTimeout;
  sandbox.clearTimeout = sandbox.window.clearTimeout;
  sandbox.fetch = sandbox.window.fetch;
  vm.createContext(sandbox);

  vm.runInContext(read('js', 'data.js'), sandbox);
  vm.runInContext(read('js', 'store.js'), sandbox);
  vm.runInContext(read('js', 'config.js'), sandbox);
  vm.runInContext(read('js', 'content.js'), sandbox);

  const HC = sandbox.window.HC;
  return HC.content.refresh().then(() => HC);
}

/* --------------------------------------------------------------- linkify */

function bootConnect() {
  const sandbox = { window: { localStorage: fakeStorage() }, console };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);

  // components for esc(), data for the seed the screen reads at module level,
  // and the screen itself. Nothing here touches the DOM until something is
  // rendered, and nothing below renders anything.
  vm.runInContext(read('js', 'data.js'), sandbox);
  vm.runInContext(read('js', 'components.js'), sandbox);
  vm.runInContext(read('js', 'screens', 'connect.js'), sandbox);

  return sandbox.window.HC.screens.connectHelpers.linkify;
}

const linkify = bootConnect();

console.log('\n--- what the box does with a plain sentence ---');

ok('prose comes through as prose',
  linkify('Home groups open Sunday, September 6 at 9:00am.'),
  'Home groups open Sunday, September 6 at 9:00am.');

ok('and a note with no links has no markup in it at all',
  /[<>]/.test(linkify('Text Season 3 to (833) 801-3857 and we will send the link.')), false);

console.log('\n--- markup in the words is words ---');

/* The one that matters. A note is prose written by a model out of an email,
   and prose contains angle brackets: an ampersand in a church name, a "<3" in
   a sentence about the season, an <b> somebody pasted out of a newsletter. */
ok('a tag in the note is escaped rather than drawn',
  linkify('Groups <b>open</b> Sunday'),
  'Groups &lt;b&gt;open&lt;/b&gt; Sunday');

ok('and so is the one that would matter most',
  linkify('<script>alert(1)</script>').indexOf('<script>'), -1);

ok('an ampersand survives as an ampersand',
  linkify('Kids & Students meet too'),
  'Kids &amp; Students meet too');

console.log('\n--- a link somebody can actually tap ---');

ok('an https link becomes an anchor',
  linkify('Sign up at https://homechurchnola.com/groups today'),
  'Sign up at <a href="https://homechurchnola.com/groups">https://homechurchnola.com/groups</a> today');

/* The sentence owns its full stop, not the address. Left inside the href, every
   link at the end of a sentence would be a 404. */
ok('a full stop at the end of the sentence stays outside the link',
  linkify('Sign up at https://homechurchnola.com/groups.'),
  'Sign up at <a href="https://homechurchnola.com/groups">https://homechurchnola.com/groups</a>.');

ok('and the query string in one is escaped in the href',
  linkify('https://example.com/a?b=1&c=2'),
  '<a href="https://example.com/a?b=1&amp;c=2">https://example.com/a?b=1&amp;c=2</a>');

ok('two links in one note both survive',
  (linkify('One https://a.example.com and two https://b.example.com')
    .match(/<a /g) || []).length, 2);

/* Not every scheme, and this is the reason: the anchor is handed to
   openExternal() by the delegated handler in js/app.js, and http and https are
   what a URL in a shortened announcement is. Anything else stays as text,
   where it is visible and harmless. */
ok('a scheme that is not http stays as text',
  linkify('javascript:alert(1)').indexOf('<a '), -1);

console.log('\n--- the flyer column ---');

bootContent([{
  id: 'church-home',
  name: 'Home Church',
  published: true,
  groups_in_season: false,
  groups_off_season_note: 'Home groups open Sunday, September 6 at 9:00am.',
  groups_note_image_url: 'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/2026-09/flyer.jpg'
}]).then((HC) => {
  ok('the note comes through the content sync',
    HC.data.church.groupsOffSeasonNote,
    'Home groups open Sunday, September 6 at 9:00am.');

  ok('and so does the flyer beside it',
    HC.data.church.groupsNoteImageUrl,
    'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/2026-09/flyer.jpg');

  return bootContent([{
    id: 'church-home',
    name: 'Home Church',
    published: true,
    groups_off_season_note: 'Between seasons.'
  }]);
}).then((HC) => {
  // The ordinary state, and the one the seed ships in: no flyer at all. Empty
  // rather than undefined, so the screen's `if (flyer)` is asking a question
  // with an answer.
  ok('a profile with no flyer reads as no flyer',
    HC.data.church.groupsNoteImageUrl, '');

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) process.exit(1);
}).catch((err) => {
  console.log('ERROR ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
