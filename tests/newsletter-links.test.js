/* ===========================================================================
   Where a newsletter link actually goes.

   WHY THIS FILE EXISTS. The Jonah reading plan card went up on Home with a
   button reading ACCESS THE READING PLAN that opened a YouTube video. The href
   in the email was

     https://aifarn.fn72.fdske.com/e/c/01m28c9k…/01m28c9k…

   a click-tracking wrapper pasted in from another campaign and still pointing
   wherever that campaign had pointed. Nothing in the intake was in a position
   to notice: the allowlist asks "was this string in the email", which a
   wrapper passes as easily as a real link, and the admin reading the card
   before approving it could no more tell where that URL went than the model
   could.

   So the intake now reads a wrapper rather than copying it — off the URL where
   the destination is written into it, and over the network where it is not.
   The reading of "this one hides where it goes" is what everything else hangs
   off, and it is the half that does not need a mailbox, a model or a socket to
   test. Getting it wrong in one direction costs a needless HTTP request; in
   the other it puts an unreadable URL on a card the congregation taps. Both
   directions are pinned down below.

   HOW IT READS THE EDGE FUNCTION. Same trick as tests/newsletter-dates.test.js
   and tests/newsletter-retry.test.js: the helpers are fenced inside the
   one-file Deno function between two markers, and this lifts that fence out,
   strips the types with node's own stripper and evals it. No Deno, no network,
   no model.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

/* One ExperimentalWarning per run on stderr, and the default listener is what
   prints it. Not worth a line in a run somebody is reading for failures. */
process.removeAllListeners('warning');

/* Added in node 22.13. Skipping loudly rather than failing: an older node is a
   reason this file cannot check the intake's links, not a reason to tell
   somebody their app is broken. */
if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  newsletter links: node ' + process.version +
    ' has no module.stripTypeScriptTypes. Needs node 22.13 or newer.');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'newsletter-intake', 'index.ts'), 'utf8');

const start = source.indexOf('/* @@ links:start');
const end = source.indexOf('/* @@ links:end */');
if (start === -1 || end === -1 || end < start) {
  console.log('FAIL  the link helpers are no longer fenced by @@ links:start / @@ links:end');
  process.exit(1);
}

const fenced = stripTypeScriptTypes(source.slice(start, end));
/* A fresh vm context has the language and nothing else, and these helpers read
   a URL rather than a string. URL and URLSearchParams are platform, not
   JavaScript, so they are handed in — the same two Deno gives the function.
   `fetch` deliberately is not: checkedLinks takes its lookup as an argument and
   every call below passes one, so nothing in here can reach the network even by
   accident. */
const box = vm.runInNewContext(
  fenced + '\n({ unwrapRedirect, opaqueRedirect, checkedLinks })',
  { URL, URLSearchParams, Promise });

const { unwrapRedirect, opaqueRedirect, checkedLinks } = box;

/* The two links out of the newsletter of the 11th of September that this is
   all about: the one that was pasted in from somewhere else, and the one on
   Home that it should have matched. */
const PASTED = 'https://aifarn.fn72.fdske.com/e/c/01m28c9kdesvkzv0g8vf4bt6m7/01m28c9kdesvkzv0g8vjvyadmc';
const PLAN = 'https://brianaguillory.github.io/jonah-homechurch/';

/* ------------------------------------------- a wrapper that says where it goes

   Free, offline, and worth doing first: most of what a mailing list wraps a
   link in carries the destination in the open. */

console.log('\n--- unwrapRedirect ---');

ok('the ordinary ?url=',
  unwrapRedirect('https://click.example.com/r?url=https%3A%2F%2Fhomechurchnola.com%2Fserve'),
  'https://homechurchnola.com/serve');

ok('Outlook safe links',
  unwrapRedirect('https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fhomechurchnola.com%2Fgive&data=05'),
  'https://homechurchnola.com/give');

ok("Google's ?q=",
  unwrapRedirect('https://www.google.com/url?q=https://homechurchnola.com/homecoming&sa=D'),
  'https://homechurchnola.com/homecoming');

/* `q` is a search box everywhere else, so it only counts on the two hosts that
   redirect with it. A church website searching for a URL is not a redirect. */
ok('a ?q= that is somebody else\'s search box',
  unwrapRedirect('https://bibleproject.com/search?q=https://example.com'),
  'https://bibleproject.com/search?q=https://example.com');

ok('an SES path segment carrying the whole URL',
  unwrapRedirect('https://abc.r.us-east-1.awstrack.me/L0/https:%2F%2Fhomechurchnola.com%2Fserve/1/0100019'),
  'https://homechurchnola.com/serve');

ok('a wrapper inside a wrapper',
  unwrapRedirect('https://click.example.com/r?url=' +
    encodeURIComponent('https://www.google.com/url?q=https://homechurchnola.com/serve')),
  'https://homechurchnola.com/serve');

/* Mailchimp's `u` is an account id, not a destination, and an ordinary page
   with `?u=42` on it must come back untouched. Only a value that is itself an
   absolute URL counts. */
ok('a ?u= that is an id rather than a URL',
  unwrapRedirect('https://church.us1.list-manage.com/track/click?u=abc123def456&id=9f8e7d6c5b'),
  'https://church.us1.list-manage.com/track/click?u=abc123def456&id=9f8e7d6c5b');

ok('an ordinary link is left exactly alone', unwrapRedirect(PLAN), PLAN);
ok('the pasted tracker says nothing about itself', unwrapRedirect(PASTED), PASTED);
ok('not a URL at all', unwrapRedirect('mailto:hello@homechurchnola.com'),
  'mailto:hello@homechurchnola.com');

/* --------------------------------------------- a wrapper that says nothing

   What is left after unwrapping. True here means "go and look", and the cost
   of a wrong true is one HTTP request the intake need not have made. */

console.log('\n--- opaqueRedirect ---');

ok('the one that started this', opaqueRedirect(PASTED), true);
ok('SendGrid\'s /ls/click, with the id in the query',
  opaqueRedirect('https://u123.ct.sendgrid.net/ls/click?upn=aG9tZWNodXJjaG5vbGE9PQ3D'), true);
ok('Mailchimp\'s /track/click',
  opaqueRedirect('https://church.us1.list-manage.com/track/click?u=abc123def456&id=9f8e7d6c5b'), true);
ok('a shortener', opaqueRedirect('https://bit.ly/3xYzAb1'), true);
ok('a shortener with www', opaqueRedirect('https://www.tinyurl.com/y8x2p9'), true);

/* THE FALSE POSITIVES THAT WOULD MATTER. Every one of these is a real link out
   of a real Home Church newsletter. None of them is a wrapper, and reading any
   of them as one would have the Admin screen warning about a perfectly good
   button every week. */
ok('the reading plan itself', opaqueRedirect(PLAN), false);
ok('a Church Center sign-up',
  opaqueRedirect('https://homechurchnola.churchcenter.com/registrations/signups/3869072'), false);
ok('the church website', opaqueRedirect('https://www.homechurchnola.com/homecoming'), false);
ok('a YouTube video', opaqueRedirect('https://www.youtube.com/watch?v=15YS_dk6GEU'), false);
ok('a linktree with tracking junk on the end',
  opaqueRedirect('https://linktr.ee/homechurchnola?fbclid=PAZXh0bgNhZW0CMTEAc3J0Ywlk&utm_medium=social'), false);
ok('an Eventbrite listing, which is ids and words together',
  opaqueRedirect('https://www.eventbrite.com/e/homecoming-gala-tickets-123456789'), false);
ok('a bare domain is a destination', opaqueRedirect('https://homechurchnola.com'), false);
ok('a bare domain with a slash', opaqueRedirect('https://homechurchnola.com/'), false);
ok('a long path of ordinary words',
  opaqueRedirect('https://homechurchnola.com/reading-plans/jonah/week-one'), false);
ok('a Google Doc, which is opaque but not a redirect',
  opaqueRedirect('https://docs.google.com/document/d/1A2b3C4d5E6f7G8h9I0j/edit'), false);
ok('something that is not a URL', opaqueRedirect('ACCESS THE READING PLAN'), false);
ok('a scheme this app would never open', opaqueRedirect('ftp://example.com/aB3xY9zQ12'), false);

/* ------------------------------------------------------- and the app's copy

   THE SAME QUESTION IS ASKED TWICE, in two languages, because an Edge Function
   cannot call into the app and the app cannot call into it. The intake uses
   its answer to decide which links to go and look up; the Needs review card
   uses its own to decide which links to warn a person about before they tap
   Approve. Two readings that disagree would mean a link the intake quietly
   declined to check and the card quietly declined to mention, which is exactly
   the shape of the bug this is all here for.

   So every case above is put through c.opaqueLink as well, and the assertion
   is that the two agree. If somebody tightens one of them, this is what says
   the other is now out of step. */

console.log('\n--- c.opaqueLink agrees with the intake ---');

const sandbox = { window: {}, URL, URLSearchParams };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'components.js'), 'utf8'), sandbox);
const c = sandbox.window.HC.components;

[
  PASTED,
  PLAN,
  'https://u123.ct.sendgrid.net/ls/click?upn=aG9tZWNodXJjaG5vbGE9PQ3D',
  'https://church.us1.list-manage.com/track/click?u=abc123def456&id=9f8e7d6c5b',
  'https://bit.ly/3xYzAb1',
  'https://www.tinyurl.com/y8x2p9',
  'https://homechurchnola.churchcenter.com/registrations/signups/3869072',
  'https://www.homechurchnola.com/homecoming',
  'https://www.youtube.com/watch?v=15YS_dk6GEU',
  'https://linktr.ee/homechurchnola?fbclid=PAZXh0bgNhZW0CMTEAc3J0Ywlk&utm_medium=social',
  'https://www.eventbrite.com/e/homecoming-gala-tickets-123456789',
  'https://homechurchnola.com',
  'https://homechurchnola.com/reading-plans/jonah/week-one',
  'https://docs.google.com/document/d/1A2b3C4d5E6f7G8h9I0j/edit',
  'ACCESS THE READING PLAN',
  'ftp://example.com/aB3xY9zQ12',
].forEach(function (url) {
  ok('both sides agree about ' + url.slice(0, 52),
    c.opaqueLink(url), opaqueRedirect(url));
});

/* ------------------------------------------- the candidate list, end to end

   What the model is actually handed. Everything here runs against a lookup
   that answers from a table rather than a socket, which is the only way to
   pin down the case that matters most — a tracker that refuses to say — without
   waiting on one to refuse.

   The newsletter of the 11th of September is the fixture: seven announcements,
   a YouTube video in one of them, and a pasted wrapper in another that lands on
   that same video. */

const VIDEO = 'https://www.youtube.com/watch?v=15YS_dk6GEU';
const SIGNUP = 'https://homechurchnola.churchcenter.com/registrations/signups/3869072';

/* The lookup, answering from a table instead of a socket: it knows where the
   pasted wrapper goes and nothing else, which is also what a tracker that
   refuses to answer looks like from in here. */
const settled = (links, table) => checkedLinks(links, (url) =>
  Promise.resolve(
    Object.prototype.hasOwnProperty.call(table || {}, url) ? table[url] : null));

(async () => {
  console.log('\n--- checkedLinks ---');

  {
    const r = await settled(
      [
        { url: 'https://www.youtube.com/watch?v=15YS_dk6GEU', text: 'Watch the video' },
        { url: PASTED, text: 'ACCESS THE READING PLAN' },
        { url: SIGNUP, text: 'SIGN UP FOR BABY BLESSING' },
      ],
      { [PASTED]: VIDEO },
    );
    ok('a wrapper that lands on a link already in the list is left off',
      r.links.map((l) => l.url), [VIDEO, SIGNUP]);
    ok('the words that survive are the ones on the link that goes straight there',
      r.links[0].text, 'Watch the video');
    ok('and the pair is written down, which is the whole point',
      r.notes, ['“ACCESS THE READING PLAN” goes to youtube.com, the same place as ' +
        '“Watch the video”, so it was left off.']);
  }

  {
    // The same email with the two anchors the other way round. The order a
    // newsletter happens to put them in must not decide which label survives.
    const r = await settled(
      [
        { url: PASTED, text: 'ACCESS THE READING PLAN' },
        { url: 'https://www.youtube.com/watch?v=15YS_dk6GEU', text: 'Watch the video' },
      ],
      { [PASTED]: VIDEO },
    );
    ok('the wrapper first makes no difference to what is kept',
      r.links.map((l) => l.url), [VIDEO]);
    ok('nor to whose words are kept', r.links[0].text, 'Watch the video');
    ok('nor to what is said about it',
      r.notes, ['“ACCESS THE READING PLAN” goes to youtube.com, the same place as ' +
        '“Watch the video”, so it was left off.']);
  }

  {
    // A wrapper that lands somewhere new is simply that place, with its own
    // words: this is the ordinary case, a church whose mailing list tracks
    // clicks on every button it sends.
    const r = await settled(
      [{ url: PASTED, text: 'ACCESS THE READING PLAN' }],
      { [PASTED]: PLAN },
    );
    ok('a wrapper becomes where it goes', r.links, [{ url: PLAN, text: 'ACCESS THE READING PLAN' }]);
    ok('and there is nothing to report', r.notes, []);
  }

  {
    // THE CASE THE WHOLE DESIGN TURNS ON. The lookup failed, so nobody knows
    // where this goes. The link is kept — a missing button on a real
    // announcement is the commoner harm — and the note is what a person gets
    // instead.
    const r = await settled([{ url: PASTED, text: 'ACCESS THE READING PLAN' }], {});
    ok('a lookup that fails keeps the link', r.links, [{ url: PASTED, text: 'ACCESS THE READING PLAN' }]);
    ok('and says so', r.notes,
      ['“ACCESS THE READING PLAN” is a redirect that would not say where it goes.']);
  }

  {
    const r = await settled([
      { url: 'https://click.example.com/r?url=' + encodeURIComponent(SIGNUP), text: 'Sign up' },
      { url: SIGNUP, text: 'Sign up again' },
    ], {});
    ok('a wrapper that says where it goes needs no lookup at all',
      r.links, [{ url: SIGNUP, text: 'Sign up' }]);
    ok('and a newsletter repeating its own link is not worth a word',
      r.notes, []);
  }

  {
    const r = await settled([
      { url: SIGNUP, text: 'Sign up' },
      { url: 'https://www.homechurchnola.com/homecoming', text: 'Homecoming' },
      { url: 'http://homechurchnola.com/give', text: 'Give' },
    ], {});
    ok('ordinary links come through in order, untouched',
      r.links.map((l) => l.url),
      [SIGNUP, 'https://www.homechurchnola.com/homecoming', 'http://homechurchnola.com/give']);
    ok('and nothing is said about any of them', r.notes, []);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(function (err) {
  // A throw inside the async block would otherwise end the process at 0 and
  // report nothing, which is a test file that passes by not running.
  console.log('FAIL  checkedLinks threw: ' + (err && err.stack || err));
  process.exit(1);
});
