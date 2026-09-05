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

function bootContent(rows, seenUrls) {
  const sandbox = {
    window: {
      localStorage: fakeStorage(),
      fetch: (url) => {
        if (seenUrls) seenUrls.push(String(url));
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

  return sandbox.window.HC;
}

const connectHC = bootConnect();
const linkify = connectHC.screens.connectHelpers.linkify;
const joinButton = connectHC.screens.connectHelpers.joinButton;

/* The button is drawn from the church row rather than from an argument, the
   same way the paragraph beside it is, so setting it means setting that. */
function withLink(url, label) {
  connectHC.data.church.groupsNoteLinkUrl = url;
  connectHC.data.church.groupsNoteLinkLabel = label;
  return joinButton();
}

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

console.log('\n--- the way into a group, at the foot of the card ---');

/* The reason this is a button and not a sentence, asserted with the real
   thing: the link the church posted in September is 355 characters of query
   string. It could never have survived into a 300 character paragraph, and
   two runs of the Update button died trying — once refused for dropping it,
   once cut off mid-JSON spelling it out. Nothing here has to hold it in
   prose, so its length is not a fact about anything any more. */
const REAL_LINK = 'https://homechurchnola.groupvitals.com/groupFinder?childcare-check=' +
  '&group-location-check=&group-type%5B%5D=all&groupmodel-check=&grouptopic-check=' +
  '&grouptype-check=&lifestage-check=&meeting-day%5B%5D=all&meeting-location%5B%5D=all' +
  '&meeting-time=all&meetingday-check=&meetingtime-check=&timezone-check=' +
  '&tld=.com%2FgroupFinder%3Fcampus-check%3D&view_type=list';

ok('a link the church posted becomes a button that opens it',
  withLink(REAL_LINK, 'JOIN A GROUP').indexOf('data-url="' + REAL_LINK.replace(/&/g, '&amp;') + '"') > -1,
  true);

ok('and it says what the church called it',
  withLink(REAL_LINK, 'JOIN A GROUP').indexOf('<span>JOIN A GROUP</span>') > -1, true);

ok('with no words of its own it still says something',
  withLink('https://example.com/groups', '').indexOf('<span>Join a group</span>') > -1, true);

/* The whole of the request this was built for: wherever it appears, it appears
   at the bottom, in the middle. The class is where both of those live — see
   .hc-group__cta in css/screens.css — and the paragraph is not allowed to
   carry it instead. */
ok('it is wrapped in the class that puts it at the bottom, centred',
  withLink('https://example.com/groups', 'Join').indexOf('class="hc-group__cta"') > -1, true);

ok('no link is no button at all, which is the ordinary state between seasons',
  withLink('', ''), '');

/* The same rule linkify() follows one function up, enforced twice on purpose:
   this hands its URL to the phone's browser, and a scheme that is not a web
   address has no business being handed to one. Migration 0054 refuses to store
   one; this refuses to draw one that got in some other way. */
ok('and a scheme that is not the web draws nothing',
  withLink('javascript:alert(1)', 'Join'), '');

ok('nor does a bare word somebody typed into the field',
  withLink('homechurchnola.com/groups', 'Join'), '');

withLink('', '');

console.log('\n--- the flyer column ---');

bootContent([{
  id: 'church-home',
  name: 'Home Church',
  published: true,
  groups_in_season: false,
  groups_off_season_note: 'Home groups open Sunday, September 6 at 9:00am.',
  groups_note_image_url: 'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/2026-09/flyer.jpg',
  groups_note_link_url: 'https://homechurchnola.groupvitals.com/groupFinder?view_type=list',
  groups_note_link_label: 'JOIN A GROUP'
}]).then((HC) => {
  ok('the note comes through the content sync',
    HC.data.church.groupsOffSeasonNote,
    'Home groups open Sunday, September 6 at 9:00am.');

  ok('and so does the flyer beside it',
    HC.data.church.groupsNoteImageUrl,
    'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/2026-09/flyer.jpg');

  /* The columns migration 0054 added, through the same mapper. A mapper that
     silently dropped these would leave the Update button apparently working
     and the way into a group never appearing, which is a bug nobody would
     think to look for in content.js. */
  ok('and the way into a group, which is its own column now',
    HC.data.church.groupsNoteLinkUrl,
    'https://homechurchnola.groupvitals.com/groupFinder?view_type=list');

  ok('with the words the church put on it',
    HC.data.church.groupsNoteLinkLabel, 'JOIN A GROUP');

  ok('and the card knows it is in a season when it is told so',
    HC.data.church.groupsNoteInSeason, false);

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

  ok('and a profile with no way in reads as no button',
    HC.data.church.groupsNoteLinkUrl, '');

  console.log('\n--- which season the card says it is in ---');

  /* The costly mistake is one way round. A column that has not been migrated
     yet, or a row written before 0049, must read as between seasons: "Open
     now" over the between seasons sentence is a church telling people groups
     are running when they are not. */
  ok('a profile with no season column at all is between seasons',
    HC.data.church.groupsNoteInSeason, false);

  return bootContent([{
    id: 'church-home',
    name: 'Home Church',
    published: true,
    groups_note_in_season: true,
    groups_off_season_note: 'Home groups open Sunday, September 6 at 9:00am.',
    groups_between_seasons_note: 'Home groups are between seasons right now.'
  }]);
}).then(async (HC) => {
  ok('a card carrying a current announcement says so',
    HC.data.church.groupsNoteInSeason, true);

  /* Read by the Admin form to show what the button would put back, and never
     drawn on Connect: while a season is on, the live note is the one on
     screen and this is the sentence waiting underneath it. */
  ok('and the sentence it would go back to comes through beside it',
    HC.data.church.groupsBetweenSeasonsNote,
    'Home groups are between seasons right now.');

  /* Not the same column as the finder's switch, which is the mistake this
     whole feature is arranged to avoid. A card that is in season says nothing
     about whether there are real groups to draw. */
  ok('while the switch that draws the finder is untouched by any of it',
    HC.data.church.groupsInSeason, true);

  console.log('\n--- a deleted announcement is not content ---');

  /* Since 0051 a deleted announcement keeps its row, and an admin's session is
     still allowed to read it. The content sync asks for `deleted_at=is.null`
     so that an admin's own Home does not keep drawing a card they just
     deleted — which is a thing only this filter prevents, because the policy
     cannot tell an admin reading the Admin screen from an admin reading Home.

     Asserted on the URL rather than on the rows, because the rows come back
     already filtered by the server and a test that only checked them would
     pass just as happily with the filter deleted. */
  const asked = [];
  await bootContent([{ id: 'church-home', name: 'Home Church', published: true }], asked);

  const announcementsUrl = asked.find((u) => u.indexOf('/announcements') > -1) || '';

  ok('the content sync refuses to fetch deleted announcements',
    announcementsUrl.indexOf('deleted_at=is.null') > -1, true);

  ok('and still asks for them newest first',
    announcementsUrl.indexOf('order=created_at.desc') > -1, true);

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) process.exit(1);
}).catch((err) => {
  console.log('ERROR ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
