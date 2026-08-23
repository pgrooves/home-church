/* Drives the two guessing parts of scripts/build_practices.js without a
   network: the site parser and the video-to-session mapper.

   WHY THESE TWO. Everything else in that script is fetching and printing, and
   a wrong fetch is loud. These two are quiet: they take a page and a playlist
   that nobody at this church controls and produce pairings that look right
   whether or not they are. The whole reason the script prints a report before
   it writes anything is that these functions can be confidently wrong, so the
   cases below are mostly the ways they should refuse to answer rather than
   the ways they should. */

const b = require('../scripts/build_practices.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), c = JSON.stringify(want);
  if (a === c) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + c); fail++; }
};

/* --------------------------------------------------------------- durations */

ok('duration, minutes', b.parseDuration('PT8M12S').label, '8:12');
ok('duration, an hour', b.parseDuration('PT1H2M3S').label, '1:02:03');
ok('duration, seconds only', b.parseDuration('PT45S').label, '0:45');
ok('duration, seconds total', b.parseDuration('PT1H2M3S').seconds, 3723);
ok('duration, nonsense is zero', b.parseDuration('banana').seconds, 0);

/* ------------------------------------------------------------ session tags */

ok('title names its session', b.sessionFromTitle('Sabbath Session 2: Rest'), 2);
ok('title names a week', b.sessionFromTitle('Week 3 — Delight'), 3);
ok('title leads with a numeral', b.sessionFromTitle('01 - Stopping'), 1);
ok('a trailer names nothing', b.sessionFromTitle('Sabbath Trailer'), null);
// "4 rhythms" is a count, not a session number, and the leading-numeral form
// only counts when a dash follows it.
ok('a number in prose is not a label', b.sessionFromTitle('4 rhythms of rest'), null);

/* -------------------------------------------------------------- site parse */

const PAGE = `
<html><head><title>Sabbath</title><style>.x{color:red}</style></head><body>
<nav>Home</nav>
<h1>Sabbath</h1>
<p>Sabbath is a twenty-four hour block of time in which we stop work, practice
rest, and turn our attention toward God and the people we love.</p>
<p>It is the oldest rhythm in the Scriptures, and the one most of us have quietly
let go of somewhere between our calendar and our phone.</p>
<div class="promo"><p>Pre-order the new book today for $24.99</p></div>
<h2>Session 1: Stopping</h2>
<p>The first thing Sabbath asks of you is not rest. It is stopping, which is a
much harder thing, and the two are not the same at all.</p>
<p>Practice: Pick a twenty-four hour window this week and write it on the calendar.</p>
<h2>Session 2: Resting</h2>
<p>Rest is what stopping is for, and it is not the same as collapsing on a sofa
until the day is gone and you feel worse than when it started.</p>
<p>Practice: Plan one thing that genuinely restores you and put it in the window.</p>
<h2>Session 3: Delighting</h2>
<p>Delight is the part everybody skips. A Sabbath with no joy in it is just an
unusually strict Tuesday.</p>
<p>Practice: Name three things you delight in and do one of them.</p>
<h2>Session 4: Worshiping</h2>
<p>Worship is what turns a day off into a Sabbath, and it is the reason this is
a practice rather than a self-care routine.</p>
<p>Practice: Spend the first hour of your Sabbath with the Scriptures.</p>
</body></html>`;

const site = b.parseSite(PAGE, { slug: 'sabbath', title: 'Sabbath' });

ok('four sessions found', site.sessions.length, 4);
ok('session titles', site.sessions.map(s => s.title),
   ['Stopping', 'Resting', 'Delighting', 'Worshiping']);
ok('intro paragraphs kept', site.intro.length, 2);
ok('the page title is not intro', site.intro.some(p => p === 'Sabbath'), false);
ok('practice line lifted off session 1', site.sessions[0].practice,
   'Pick a twenty-four hour window this week and write it on the calendar.');
ok('practice line is not left in the teaching', site.sessions[0].teaching.length, 1);
// The flags quote it on purpose, so this looks at the content only.
ok('the preorder never reaches the data',
   JSON.stringify({ intro: site.intro, sessions: site.sessions }).includes('Pre-order'), false);
ok('but the preorder is flagged',
   site.flags.some(f => f.kind === 'promotional-content'), true);
ok('a clean page raises nothing else',
   site.flags.filter(f => f.kind !== 'promotional-content').length, 0);

const EMPTY = b.parseSite('<html><body><div id="root"></div></body></html>',
                          { slug: 'prayer', title: 'Prayer' });
ok('a JavaScript-rendered page is flagged, not guessed at',
   EMPTY.flags.map(f => f.kind).sort(), ['missing-intro', 'no-sessions-found']);

/* ----------------------------------------------------------------- mapping */

const vid = (position, title, extra) => Object.assign({
  position, title, videoId: 'id' + position, duration: '9:00', seconds: 540,
  thumbnail: 't', embeddable: true, unavailable: false
}, extra || {});

const sessions = site.sessions;

// The good case: the playlist labels its own videos.
const labelled = b.proposeMapping([
  vid(1, 'Sabbath Session 1: Stopping'),
  vid(2, 'Sabbath Session 2: Resting'),
  vid(3, 'Sabbath Session 3: Delighting'),
  vid(4, 'Sabbath Session 4: Worshiping')
], sessions);
ok('labelled videos map with certainty',
   labelled.mapped.map(m => m.confidence), ['labelled', 'labelled', 'labelled', 'labelled']);
ok('labelled mapping has no extras', labelled.extras.length, 0);
ok('labelled mapping is unflagged', labelled.flags.length, 0);

// Four unlabelled videos against four sessions: zipped, and said out loud.
const positional = b.proposeMapping([
  vid(1, 'Stopping'), vid(2, 'Resting'), vid(3, 'Delighting'), vid(4, 'Worshiping')
], sessions);
ok('unlabelled but matching counts are zipped',
   positional.mapped.map(m => m.confidence),
   ['positional', 'positional', 'positional', 'positional']);
ok('and the guess is flagged as a guess',
   positional.flags.some(f => f.kind === 'positional-mapping'), true);

// The thirteen-video case. A trailer and Q&A are recognised, the rest do not
// divide into four, and nothing is invented.
const messy = b.proposeMapping([
  vid(1, 'Sabbath Trailer'),
  vid(2, 'Sabbath Session 1: Stopping'),
  vid(3, 'Sabbath Session 2: Resting'),
  vid(4, 'Bonus Q&A with the teaching team'),
  vid(5, 'Sabbath Session 3: Delighting'),
  vid(6, 'Sabbath Session 4: Worshiping'),
  vid(7, 'A conversation about rest'),
  vid(8, 'Another conversation about rest')
], sessions);
ok('sessions still land on their labelled videos',
   messy.mapped.map(m => m.video.position), [2, 3, 5, 6]);
ok('trailer, Q&A and strays go to extras',
   messy.extras.map(v => v.position), [1, 4, 7, 8]);
ok('the shape mismatch is flagged',
   messy.flags.some(f => f.kind === 'shape-mismatch'), true);

// Counts that do not match and no labels: refuse to pair anything.
const mismatch = b.proposeMapping([vid(1, 'One'), vid(2, 'Two')], sessions);
ok('a count mismatch pairs nothing',
   mismatch.mapped.map(m => m.video), [null, null, null, null]);
ok('and says why',
   mismatch.flags.some(f => f.kind === 'count-mismatch'), true);

// A playlist with a dead slot and a video that cannot be embedded. This app
// never opens YouTube, so an unembeddable video is a hole, not a link.
const broken = b.proposeMapping([
  vid(1, 'Sabbath Session 1: Stopping'),
  vid(2, 'Private video', { unavailable: true }),
  vid(3, 'Sabbath Session 3: Delighting', { embeddable: false }),
  vid(4, 'Sabbath Session 4: Worshiping')
], sessions);
ok('a private video is dropped and flagged',
   broken.flags.some(f => f.kind === 'unavailable-videos'), true);
ok('an unembeddable video is flagged',
   broken.flags.some(f => f.kind === 'embedding-disabled'), true);
ok('the session whose video is gone gets none',
   broken.mapped[1].video, null);

/* ------------------------------------------------------------- file shape */

const file = b.toFile(
  { slug: 'sabbath', title: 'Sabbath', icon: 'practiceSabbath',
    playlistId: 'PL6zls_4DoKIxWQnGB_MA639KE4GZzrKK6' },
  site,
  { source: 'youtube-data-api-v3', videos: [] },
  messy,
  site.flags.concat(messy.flags)
);
ok('the file names its schema', file.schema, 1);
ok('the file carries its icon', file.icon, 'practiceSabbath');
ok('every session is in the file', file.sessions.length, 4);
ok('a mapped session carries its video id', file.sessions[0].video.videoId, 'id2');
ok('and how sure the pairing is', file.sessions[0].video.confidence, 'labelled');
ok('extras survive into the file', file.extras.length, 4);
ok('so do the flags', file.flags.length > 0, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
