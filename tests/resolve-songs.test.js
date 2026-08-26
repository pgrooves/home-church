/* ===========================================================================
   The setlist resolver's two jobs, both of which fail quietly.

   READING THE LIST. It arrives however somebody typed it on a Sunday
   afternoon, and the failure is not a crash: it is "Oceans (Where Feet May
   Fail)" read as a song called Oceans by an artist called Where Feet May
   Fail, which then matches nothing, and the song loses its art without
   anybody being told why.

   PICKING THE RECORDING. A worship search on any catalogue comes back with
   karaoke records, tribute records and "in the style of" records before the
   real one, because there are hundreds of those and they are cheap to
   publish. Take the first result and most weeks the congregation gets a
   stranger's cover of the song they sang. That is the whole reason there is
   a score in that file rather than `results[0]`.

   No network. Everything below is fixtures, on purpose: the scoring is what
   decides what a congregation sees, and checking it should not depend on a
   connection or on what a catalogue happens to hold this morning.
   =========================================================================== */
'use strict';

const R = require('../scripts/resolve_songs.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const pair = (l) => { const p = R.parseLine(l); return p && [p.title, p.artist]; };

/* ----------------------------------------------------------- reading a list */

console.log('\n--- however it was typed ---');

ok('a numbered line with a hyphen',
  pair('1. Oceans - Hillsong United'), ['Oceans', 'Hillsong United']);
ok('an em-dash',
  pair('2. How Great Is Our God — Chris Tomlin'), ['How Great Is Our God', 'Chris Tomlin']);
ok('a colon',
  pair('3. Holy Spirit: Jesus Culture'), ['Holy Spirit', 'Jesus Culture']);
ok('a bullet and a by',
  pair('• Lean Back by Maverick City Music'), ['Lean Back', 'Maverick City Music']);
ok('a bare line with a comma, which nothing else could split',
  pair('Great Are You Lord, All Sons & Daughters'), ['Great Are You Lord', 'All Sons & Daughters']);
ok('a parenthetical artist, when there is no separator at all',
  pair('Holy Spirit (Jesus Culture)'), ['Holy Spirit', 'Jesus Culture']);

/* The one that breaks a naive parser, and the reason the parenthetical branch
   is last rather than first. This line has a separator, so the brackets are
   part of the song's name and not the artist. */
ok('a title that is itself parenthetical keeps its parenthetical',
  pair('1. Oceans (Where Feet May Fail) - Hillsong UNITED'),
  ['Oceans (Where Feet May Fail)', 'Hillsong UNITED']);

ok('a song with no artist is a song with no artist, not an invented one',
  pair('Build My Life'), ['Build My Life', '']);
ok('a blank line is nothing',
  R.parseLine('   '), null);
ok('a whole list, in the order it was played',
  R.parseList('1. So Much - Life.Church Worship\n\n2. No Body - Elevation Worship')
    .map(s => s.title),
  ['So Much', 'No Body']);

console.log('\n--- two artists on one line ---');
{
  /* "Jesus Culture or Bryan & Katie Torwalt" is two recordings of one song.
     The first is used so the run can finish, and both are carried out so
     /new-worship asks before anything is written. Silently choosing is
     choosing wrong half the time. */
  const p = R.parseLine('2. Holy Spirit: Jesus Culture or Bryan & Katie Torwalt');
  ok('the first is used', [p.title, p.artist], ['Holy Spirit', 'Jesus Culture']);
  ok('and both are carried out to be asked about',
    p.alternates, ['Jesus Culture', 'Bryan & Katie Torwalt']);
}

/* ------------------------------------------------------ picking a recording */

const track = (name, artist) => ({
  trackName: name, artistName: artist,
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg',
  trackViewUrl: 'https://music.apple.com/us/album/x'
});

console.log('\n--- the right recording ---');
{
  /* What a real search for a worship song comes back with. The karaoke record
     is first, which is not a hypothetical: it is what these catalogues do. */
  const results = [
    track('Oceans (Where Feet May Fail) [Karaoke Version]', 'Sing2Music'),
    track('Oceans (Where Feet May Fail) [Made Popular By Hillsong United]', 'Tribute Artists'),
    track('Oceans (Where Feet May Fail)', 'Hillsong UNITED'),
    track('Oceans (Where Feet May Fail) [Live]', 'Hillsong UNITED')
  ];
  const best = R.pickBest({ title: 'Oceans', artist: 'Hillsong United' }, results);
  ok('the karaoke record does not win',
    best.match.artistName, 'Hillsong UNITED');
  ok('and neither does the live cut, when nobody asked for live',
    best.match.trackName, 'Oceans (Where Feet May Fail)');
  ok('a clean match is reported as one, so the summary can stay quiet',
    best.confidence, 'high');
}

console.log('\n--- asking for the live one ---');
{
  const results = [
    track('Holy Spirit', 'Jesus Culture'),
    track('Holy Spirit (Live)', 'Jesus Culture')
  ];
  const best = R.pickBest({ title: 'Holy Spirit (Live)', artist: 'Jesus Culture' }, results);
  ok('a line that asks for live gets live rather than being penalised for it',
    best.match.trackName, 'Holy Spirit (Live)');
}

console.log('\n--- the same title by somebody else ---');
{
  /* Two different songs share this name, and the artist is the whole
     difference between them. Getting this wrong puts the wrong record under
     the right title, which is the one failure nobody would catch by looking
     at the screen. */
  const results = [
    track('Great Are You Lord', 'Casting Crowns'),
    track('Great Are You Lord', 'All Sons & Daughters')
  ];
  const best = R.pickBest({ title: 'Great Are You Lord', artist: 'All Sons & Daughters' }, results);
  ok('the artist decides', best.match.artistName, 'All Sons & Daughters');
}

console.log('\n--- nothing good enough ---');
{
  const results = [track('Something Else Entirely', 'A Different Band')];
  ok('a search that answered with nothing close matches nothing at all',
    R.pickBest({ title: 'So Much', artist: 'Life.Church Worship' }, results), null);
  ok('and an empty answer is not a crash',
    R.pickBest({ title: 'So Much', artist: 'Life.Church Worship' }, []), null);
}

/* ------------------------------------------------------------- the details */

console.log('\n--- art, links, and reuse ---');

ok('the thumbnail is asked for at the size the screen actually draws',
  R.bigArt('https://is1-ssl.mzstatic.com/image/thumb/abc/100x100bb.jpg'),
  'https://is1-ssl.mzstatic.com/image/thumb/abc/600x600bb.jpg');
ok('art that is not the shape we expect is left alone rather than mangled',
  R.bigArt('https://example.com/cover.png'), 'https://example.com/cover.png');
ok('and nothing is not something',
  R.bigArt(null), '');

ok('every platform is stored, not only the three the screen draws today',
  R.linksFromOdesli({
    pageUrl: 'https://song.link/x',
    linksByPlatform: {
      spotify: { url: 'https://s' }, appleMusic: { url: 'https://a' },
      youtube: { url: 'https://y' }, amazonMusic: { url: 'https://z' },
      // Not a platform the row has a name for, and not a reason to fail.
      napster: { url: 'https://n' },
      // Present but empty, which has to read the same as absent.
      tidal: { url: '' }
    }
  }),
  { youtube: 'https://y', spotify: 'https://s', apple: 'https://a',
    amazon: 'https://z', all: 'https://song.link/x' });

ok('an answer with no platforms at all is an empty set, not a throw',
  R.linksFromOdesli(null), {});

{
  const known = [
    { title: 'Oceans (Where Feet May Fail)', artist: 'Hillsong UNITED',
      artUrl: 'https://art', links: { spotify: 'https://s' } },
    { title: 'Great Are You Lord', artist: 'Casting Crowns',
      artUrl: 'https://art2', links: { spotify: 'https://s2' } }
  ];
  ok('a song we resolved in June is found again in August',
    (R.findKnown({ title: 'Oceans', artist: 'Hillsong United' }, known) || {}).artUrl,
    'https://art');
  ok('but the same title by a different artist is a different recording',
    R.findKnown({ title: 'Great Are You Lord', artist: 'All Sons & Daughters' }, known),
    null);
}

console.log('\n--- the row ---');
{
  const row = R.buildRow('2026-08-23', 'sermon-last-words', [{ title: 'So Much' }]);
  ok('the id comes off the date, so it cannot collide with another Sunday',
    row.id, 'worship-2026-08-23');
  ok('and there is no title on it, which is the point of the whole table',
    Object.prototype.hasOwnProperty.call(row, 'title'), false);
  ok('a set with no episode yet carries null rather than a guess',
    R.buildRow('2026-08-23', undefined, []).sermon_id, null);
}

console.log('\n--- what a person is shown before it is written ---');
{
  const row = R.buildRow('2026-08-23', 'sermon-last-words', [
    { title: 'So Much', artist: 'Life.Church Worship', artUrl: 'https://a',
      lyricsUrl: 'https://l', links: { spotify: 'https://s', apple: 'https://x', all: 'https://all' } },
    { title: 'Lean Back', artist: 'Maverick City Music', artUrl: '', lyricsUrl: '', links: {} }
  ]);
  const text = R.summarize(row, [
    { confidence: 'high', source: 'iTunes', alternates: [] },
    { confidence: 'none', source: 'no match', alternates: ['Maverick City Music', 'Capital City Music'] }
  ]);

  ok('a song that came back thin says so in capitals rather than quietly',
    /NO ART/.test(text) && /NO LINKS/.test(text), true);
  ok('the summary counts platforms, not the song.link page as a fourth one',
    /2 links/.test(text), true);
  ok('and a line that named two artists is flagged for asking about',
    /named two artists/.test(text), true);
}

/* ------------------------------------------------------------ over the wire

   The two services, stubbed. What is being checked is the reading rather than
   the reaching: which fields come off an iTunes result, that the art is asked
   for at the size the screen draws, that Odesli is asked with the Apple link
   the search just produced, and that a service answering with nothing takes
   away that song's links rather than the whole run.
   -------------------------------------------------------------------------- */

const ITUNES_ANSWER = {
  results: [
    { trackName: 'So Much (Karaoke)', artistName: 'Praise Tracks',
      artworkUrl100: 'https://cdn/x/100x100bb.jpg', trackViewUrl: 'https://music.apple.com/karaoke' },
    { trackName: 'So Much', artistName: 'Life.Church Worship',
      artworkUrl100: 'https://cdn/real/100x100bb.jpg',
      trackViewUrl: 'https://music.apple.com/us/album/so-much/1' }
  ]
};

const ODESLI_ANSWER = {
  pageUrl: 'https://song.link/i/1',
  linksByPlatform: {
    spotify: { url: 'https://open.spotify.com/track/1' },
    appleMusic: { url: 'https://music.apple.com/us/album/so-much/1' },
    youtube: { url: 'https://youtube.com/watch?v=1' },
    amazonMusic: { url: 'https://music.amazon.com/1' }
  }
};

function stubFetch(plan) {
  const calls = [];
  globalThis.fetch = (url) => {
    calls.push(String(url));
    for (const [needle, answer] of plan) {
      if (String(url).includes(needle)) {
        if (answer === 404) return Promise.resolve({ ok: false, status: 404 });
        if (answer === 'down') return Promise.reject(new Error('ECONNREFUSED'));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answer) });
      }
    }
    return Promise.resolve({ ok: false, status: 404 });
  };
  return calls;
}

async function wireTests() {
  const realFetch = globalThis.fetch;

  console.log('\n--- one song, end to end ---');
  {
    const calls = stubFetch([
      ['itunes.apple.com', ITUNES_ANSWER],
      ['api.song.link', ODESLI_ANSWER]
    ]);
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] }, {});

    ok('the catalogue\'s own spelling wins over the one typed on a Sunday',
      [song.title, song.artist], ['So Much', 'Life.Church Worship']);
    ok('the art is the 600px file and not the thumbnail',
      song.artUrl, 'https://cdn/real/600x600bb.jpg');
    ok('every platform came through',
      Object.keys(song.links).sort(),
      ['all', 'amazon', 'apple', 'spotify', 'youtube']);
    ok('Odesli was asked with the Apple link the search just found',
      calls.some(u => u.includes('api.song.link') &&
        u.includes(encodeURIComponent('https://music.apple.com/us/album/so-much/1'))), true);
    ok('and it is reported as a confident match',
      [note.source, note.confidence], ['iTunes', 'high']);
    ok('lyrics stay empty with no Genius token, rather than being guessed at',
      song.lyricsUrl, '');
  }

  console.log('\n--- when Odesli has nothing ---');
  {
    stubFetch([['itunes.apple.com', ITUNES_ANSWER], ['api.song.link', 404]]);
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] }, {});
    ok('the song keeps its art and its Apple link',
      [!!song.artUrl, song.links.apple], [true, 'https://music.apple.com/us/album/so-much/1']);
    ok('and the gap is named rather than passed over',
      note.odesli, 'no answer, Apple link only');
  }

  console.log('\n--- when the catalogue knows nothing ---');
  {
    stubFetch([['itunes.apple.com', { results: [] }]]);
    const { song, note } = await R.resolveSong(
      { title: 'A Song Nobody Has Recorded', artist: 'The Band', alternates: [] }, {});
    ok('the song is still a row, with what the church typed',
      [song.title, song.artist, song.artUrl], ['A Song Nobody Has Recorded', 'The Band', '']);
    ok('and it is flagged as unmatched',
      [note.source, note.confidence], ['no match', 'none']);
  }

  console.log('\n--- when the proxy is in the way ---');
  {
    stubFetch([['itunes.apple.com', 'down']]);
    let message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'Life.Church', alternates: [] }, {});
    } catch (err) { message = err.message; }

    /* The one failure that must never be mistaken for "this song has no art".
       A blocked proxy means nothing was resolved and nothing should be
       published, and the message has to say where to run it instead. This is
       the exact failure that put four songs on the screen with no art. */
    ok('it throws rather than quietly returning an empty song',
      /could not reach itunes\.apple\.com/.test(message), true);
    ok('and it says nothing was guessed and nothing written',
      /Nothing has been guessed and nothing has been written/.test(message), true);
  }

  console.log('\n--- when the gateway says no ---');
  {
    /* The failure this whole file is named after. A proxy refuses at the HTTP
       layer rather than at the socket, so it arrives as a 403 on a request
       that carried no credentials, which cannot be our fault and cannot be
       Apple's. Before this was told apart it read as "itunes.apple.com
       answered 403", which sounds like the catalogue turned us away and
       sounds nothing like "run this somewhere else". */
    globalThis.fetch = () => Promise.resolve({ ok: false, status: 403 });
    let message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'Life.Church', alternates: [] }, {});
    } catch (err) { message = err.message; }
    ok('a 403 on an unauthenticated request reads as blocked, not as refused',
      /could not reach itunes\.apple\.com \(the gateway answered 403\)/.test(message), true);

    // And 407, which is a proxy saying it in as many words.
    globalThis.fetch = () => Promise.resolve({ ok: false, status: 407 });
    message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'Life.Church', alternates: [] }, {});
    } catch (err) { message = err.message; }
    ok('so does a 407', /could not reach/.test(message), true);
  }

  console.log('\n--- when a service that used to be open closes ---');
  {
    /* The same 401 as the test below, and the opposite meaning, and the only
       thing that tells them apart is whether we sent a key. Odesli retired
       its free public tier and now answers 401 to a request that carries no
       credentials, which is not a bad token and not a blocked gateway.

       What matters here is that the iTunes half survives it. That half is
       already fetched and it is the half with the art on it, so throwing
       would trade four covers for nothing. The song keeps its art and its
       Apple link, loses only the platforms Odesli would have added, and the
       note says so. */
    globalThis.fetch = (url) => {
      if (String(url).includes('itunes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ITUNES_ANSWER) });
      }
      return Promise.resolve({ ok: false, status: 401 });
    };
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] }, {});

    ok('the song keeps the art iTunes gave it', !!song.artUrl, true);
    ok('and keeps its Apple link', /music\.apple\.com/.test(song.links.apple || ''), true);
    ok('and gained no other platform', Object.keys(song.links), ['apple']);
    ok('and the note says Odesli did not answer', !!note.odesli, true);
    ok('and nothing was invented for the missing platforms',
      Object.values(song.links).every(u => /^https:\/\//.test(u)), true);
  }

  console.log('\n--- when the lyrics token is wrong ---');
  {
    /* The same status, opposite meaning, and the difference is whether we
       sent a key. Genius is the only call here that carries one, and a
       refusal there is a bad token rather than a blocked network. Telling
       somebody to move machines because their Genius token expired would
       send them a long way in the wrong direction. */
    globalThis.fetch = (url) => {
      if (String(url).includes('itunes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ITUNES_ANSWER) });
      }
      if (String(url).includes('song.link')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ODESLI_ANSWER) });
      }
      return Promise.resolve({ ok: false, status: 401 });
    };
    let message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
        { geniusToken: 'stale' });
    } catch (err) { message = err.message; }
    ok('a refused token names the token rather than the network',
      /refused the token/.test(message) && /GENIUS_TOKEN/.test(message), true);
  }

  console.log('\n--- a song we already resolved ---');
  {
    const calls = stubFetch([['itunes.apple.com', ITUNES_ANSWER]]);
    const known = [{ title: 'So Much', artist: 'Life.Church Worship',
      artUrl: 'https://kept', lyricsUrl: '', links: { spotify: 'https://kept-s' } }];
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] }, { known: known });
    ok('comes back off the previous Sunday', song.artUrl, 'https://kept');
    ok('without asking anybody anything', calls.length, 0);
    ok('and says where it came from', note.source, 'a previous Sunday');
  }

  globalThis.fetch = realFetch;
}

wireTests().then(() => {
  console.log('');
  console.log(pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
}, err => { console.error(err); process.exit(1); });
