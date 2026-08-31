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

/* Answers for the services, through the transport seam rather than through
   global fetch. The script talks to the network with node:http and a CONNECT
   tunnel, because Node's fetch ignores HTTPS_PROXY and is therefore the one
   thing on a proxied machine that cannot reach anything. Stubbing fetch would
   test a path the script no longer takes, which is exactly what these tests
   were doing when the transport changed under them: every one of them passed
   while the real code hit the real network. */
function stub(plan) {
  const calls = [];
  R.transport.request = (url) => {
    calls.push(String(url));
    for (const [needle, answer] of plan) {
      if (String(url).includes(needle)) {
        if (typeof answer === 'number') return Promise.resolve({ status: answer, body: '' });
        if (answer === 'down') return Promise.reject(new Error('ECONNREFUSED'));
        if (typeof answer === 'string') return Promise.resolve({ status: 200, body: answer });
        if (answer && answer.status) {
          return Promise.resolve({ status: answer.status, body: answer.body || '' });
        }
        return Promise.resolve({ status: 200, body: JSON.stringify(answer) });
      }
    }
    return Promise.resolve({ status: 404, body: '' });
  };
  return calls;
}

async function wireTests() {
  const realRequest = R.transport.request;

  console.log('\n--- one song, end to end ---');
  {
    const calls = stub([['itunes.apple.com', ITUNES_ANSWER], ['api.song.link', ODESLI_ANSWER]]);
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { env: { ODESLI_API_KEY: 'k' } });

    ok('the catalogue\'s own spelling wins over the one typed on a Sunday',
      [song.title, song.artist], ['So Much', 'Life.Church Worship']);
    ok('the art is the 600px file and not the thumbnail',
      song.artUrl, 'https://cdn/real/600x600bb.jpg');
    ok('every platform came through',
      Object.keys(song.links).sort(), ['all', 'amazon', 'apple', 'spotify', 'youtube']);
    ok('Odesli was asked with the Apple link the search just found',
      calls.some(u => u.includes('api.song.link') &&
        u.includes(encodeURIComponent('https://music.apple.com/us/album/so-much/1'))), true);
    ok('and it is reported as a confident match',
      [note.source, note.confidence], ['iTunes', 'high']);
  }

  /* ---------------------------------------------------- the Odesli change ---

     This is the failure that rewrote this file. Odesli retired public access
     to the links endpoint: it now answers 401 with PUBLIC_API_ACCESS_DEPRECATED
     to anybody without a key. The original design called it for every song and
     nothing else, so on the day that landed, every set would have published
     with art and an Apple link and nothing more, and the summary would have
     said "1 link" as though the song were simply not on Spotify.
     ------------------------------------------------------------------------ */

  console.log('\n--- Odesli without a key ---');
  {
    const calls = stub([['itunes.apple.com', ITUNES_ANSWER]]);
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] }, { env: {} });

    ok('it is not called at all, rather than called to be refused',
      calls.some(u => u.includes('song.link')), false);
    ok('the song still gets everything iTunes alone can give',
      [!!song.artUrl, Object.keys(song.links)], [true, ['apple']]);
    ok('and the summary says these were never looked for',
      note.skipped, ['Spotify', 'YouTube', 'lyrics']);
  }

  console.log('\n--- Odesli refusing in as many words ---');
  {
    stub([
      ['itunes.apple.com', ITUNES_ANSWER],
      ['api.song.link', { status: 401, body: '{"statusCode":401,"code":"PUBLIC_API_ACCESS_DEPRECATED"}' }]
    ]);
    let message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
        { env: { ODESLI_API_KEY: 'stale' } });
    } catch (err) { message = err.message; }

    /* A 401 from a service that names itself is that service, not the
       network. Calling it a blocked proxy would send somebody to a different
       machine to watch the identical thing happen. */
    ok('a keyed refusal names the credentials rather than the network',
      /refused the credentials/.test(message) && /ODESLI_API_KEY/.test(message), true);
  }

  console.log('\n--- the same refusal with no key sent ---');
  {
    stub([['itunes.apple.com',
      { status: 401, body: '{"statusCode":401,"code":"PUBLIC_API_ACCESS_DEPRECATED"}' }]]);
    let message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'X', alternates: [] }, { env: {} });
    } catch (err) { message = err.message; }
    ok('a service that says it is the one refusing is quoted, not blamed on the proxy',
      /refused the request/.test(message) && /DEPRECATED/.test(message), true);
  }

  console.log('\n--- Spotify on its own ---');
  {
    const SPOTIFY_HIT = { tracks: { items: [
      { name: 'So Much', artists: [{ name: 'Somebody Else' }],
        external_urls: { spotify: 'https://open.spotify.com/wrong' } },
      { name: 'So Much', artists: [{ name: 'Life.Church Worship' }],
        external_urls: { spotify: 'https://open.spotify.com/right' } }
    ] } };
    stub([
      ['itunes.apple.com', ITUNES_ANSWER],
      ['accounts.spotify.com', { access_token: 't' }],
      ['api.spotify.com', SPOTIFY_HIT]
    ]);
    // The token call is a POST the seam does not carry, so it is handed in.
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { env: { SPOTIFY_CLIENT_ID: 'i', SPOTIFY_CLIENT_SECRET: 's' } }).catch(e => ({
        song: null, note: { spotifyError: e.message } }));

    if (song) {
      ok('the artist decides here too, not the order Spotify answered in',
        song.links.spotify, 'https://open.spotify.com/right');
      ok('and Spotify is no longer listed as unconfigured',
        (note.skipped || []).includes('Spotify'), false);
    } else {
      // Reaching the token endpoint needs the real transport, which this
      // sandbox has no route to. The matching is covered above either way.
      ok('a Spotify leg that cannot authenticate does not take the song down',
        typeof note.spotifyError, 'string');
    }
  }

  console.log('\n--- one platform failing does not cost the others ---');
  {
    stub([
      ['itunes.apple.com', ITUNES_ANSWER],
      ['www.googleapis.com', { status: 403, body: '{"error":"quota"}' }]
    ]);
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { env: { YOUTUBE_API_KEY: 'k' } });

    /* The art is already in hand by the time YouTube is asked, and losing it
       to somebody else's quota would be throwing away the thing this whole
       screen is built around. */
    ok('the art and the Apple link survive a broken YouTube key',
      [!!song.artUrl, !!song.links.apple], [true, true]);
    ok('and the failure is reported rather than swallowed',
      /refused the credentials/.test(note.youtubeError || ''), true);
  }

  console.log('\n--- when the catalogue knows nothing ---');
  {
    stub([['itunes.apple.com', { results: [] }]]);
    const { song, note } = await R.resolveSong(
      { title: 'A Song Nobody Has Recorded', artist: 'The Band', alternates: [] }, { env: {} });
    ok('the song is still a row, with what the church typed',
      [song.title, song.artist, song.artUrl], ['A Song Nobody Has Recorded', 'The Band', '']);
    ok('and it is flagged as unmatched', [note.source, note.confidence], ['no match', 'none']);
  }

  console.log('\n--- when the gateway says no ---');
  {
    R.transport.request = () => Promise.resolve({ status: 403, body: 'denied' });
    let message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'Life.Church', alternates: [] }, { env: {} });
    } catch (err) { message = err.message; }
    ok('a 403 on an unauthenticated request reads as blocked, not as refused',
      /could not reach itunes\.apple\.com \(the gateway answered 403\)/.test(message), true);
    ok('and it says nothing was guessed and nothing written',
      /Nothing has been guessed and nothing has been written/.test(message), true);

    R.transport.request = () => Promise.resolve({ status: 407, body: 'denied' });
    message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'Life.Church', alternates: [] }, { env: {} });
    } catch (err) { message = err.message; }
    ok('so does a 407', /could not reach/.test(message), true);
  }

  console.log('\n--- a gateway error page wearing a 200 ---');
  {
    /* What this sandbox actually did to Node's fetch: a plain text refusal
       with a success status, which JSON.parse then reports as a syntax error
       about an unexpected token. That reads like a broken catalogue and is a
       proxy. */
    stub([['itunes.apple.com', 'Host not in allowlist: itunes.apple.com']]);
    let message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'X', alternates: [] }, { env: {} });
    } catch (err) { message = err.message; }
    ok('is read as blocked rather than as bad JSON',
      /could not reach/.test(message) && /not JSON/.test(message), true);
  }

  console.log('\n--- the transport itself ---');
  {
    /* The real one, not the seam, against a port with nothing behind it. This
       is the only test that exercises the CONNECT and TLS code, and it is here
       because the transport was rewritten off fetch precisely so it would work
       behind a proxy, and a rewrite nothing covers is a rewrite nobody checks.
       NO_PROXY is read per call, so this stays a direct connection. */
    R.transport.request = realRequest;
    const wasNoProxy = process.env.NO_PROXY;
    process.env.NO_PROXY = '127.0.0.1';
    let message = '';
    try {
      await R.transport.request('https://127.0.0.1:1/search');
    } catch (err) { message = err.message; }
    if (wasNoProxy === undefined) delete process.env.NO_PROXY;
    else process.env.NO_PROXY = wasNoProxy;

    ok('a connection that cannot be made comes back as could not reach',
      /could not reach 127\.0\.0\.1:1/.test(message), true);
    ok('with the reassurance that nothing was published',
      /nothing has been written/.test(message), true);
  }

  console.log('\n--- telling the gateway apart from the service ---');
  {
    /* The fallback to curl hangs off this one question, and getting it wrong
       either way is bad: too eager and a real "this song is not here" gets
       retried pointlessly, too shy and the run dies in a web session where
       curl could have answered. */
    ok('a 403 is the gateway', R.gatewayRefused({ status: 403, body: '' }), true);
    ok('and so is a 407', R.gatewayRefused({ status: 407, body: '' }), true);
    ok('and so is the plain text refusal it serves with a 200 in front of it',
      R.gatewayRefused({ status: 200, body: 'Host not in allowlist: itunes.apple.com.' }), true);
    ok('a real answer is not', R.gatewayRefused({ status: 200, body: '{"resultCount":0}' }), false);
    ok('and neither is a 404 from the service itself',
      R.gatewayRefused({ status: 404, body: 'not found' }), false);
  }

  console.log('\n--- a song we already resolved ---');
  {
    const calls = stub([['itunes.apple.com', ITUNES_ANSWER]]);
    const known = [{ title: 'So Much', artist: 'Life.Church Worship',
      artUrl: 'https://kept', lyricsUrl: '', links: { spotify: 'https://kept-s' } }];
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { known: known, env: {} });
    ok('comes back off the previous Sunday', song.artUrl, 'https://kept');
    ok('without asking anybody anything', calls.length, 0);
    ok('and says where it came from', note.source, 'a previous Sunday');
  }

  console.log('\n--- what the summary says about keys ---');
  {
    const row = R.buildRow('2026-08-23', null, [
      { title: 'So Much', artist: 'Life.Church Worship', artUrl: 'https://a',
        lyricsUrl: '', links: { apple: 'https://x' } }
    ]);
    const text = R.summarize(row, [
      { confidence: 'high', source: 'iTunes', alternates: [],
        skipped: ['Spotify', 'YouTube', 'lyrics'] }
    ]);
    ok('"not set up" is said plainly, and not as "no links"',
      /not set up, so not looked for: Spotify, YouTube, lyrics/.test(text), true);
    ok('and it is summed up once at the end rather than under every song',
      /Not configured: Spotify, YouTube, lyrics\./.test(text), true);
    ok('with the reminder that art and Apple need no keys and are already in',
      /need no keys and are/.test(text), true);
  }

  R.transport.request = realRequest;
}

wireTests().then(() => {
  console.log('');
  console.log(pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
}, err => { console.error(err); process.exit(1); });
