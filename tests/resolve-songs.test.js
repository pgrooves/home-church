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
    /* With a key, because that is now the only way Odesli is asked at all.
       An unkeyed call can only ever 401, so the resolver stopped making one. */
    const { song, note } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { odesliKey: 'sk-test' });

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
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { odesliKey: 'sk-test' });
    ok('the song keeps its art and its Apple link',
      [!!song.artUrl, song.links.apple], [true, 'https://music.apple.com/us/album/so-much/1']);
    ok('and the gap is named rather than passed over',
      note.odesli, 'no answer');
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

  console.log('\n--- with no Odesli key at all ---');
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
    const asked = [];
    globalThis.fetch = (url) => {
      asked.push(String(url));
      if (String(url).includes('itunes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ITUNES_ANSWER) });
      }
      return Promise.resolve({ ok: false, status: 401 });
    };
    const { song } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] }, {});

    ok('the song keeps the art iTunes gave it', !!song.artUrl, true);
    ok('and keeps its Apple link', /music\.apple\.com/.test(song.links.apple || ''), true);
    ok('and gained no other platform', Object.keys(song.links), ['apple']);
    /* The point of the change: with no key there is nothing to send, and a
       401 is the only reply available, so the request is not made at all. */
    ok('and Odesli is not called at all without a key',
      asked.some(u => u.includes('song.link')), false);
    ok('and nothing was invented for the missing platforms',
      Object.values(song.links).every(u => /^https:\/\//.test(u)), true);
  }

  console.log('\n--- with an Odesli key ---');
  {
    /* The key rides in the query string rather than a header, which is
       Odesli's design. That is easy to get subtly wrong in two ways, so both
       are pinned here: the key has to actually be sent, and a refusal of a
       keyed call has to blame the key rather than tell somebody their
       network is blocked. */
    let odesliUrl = '';
    globalThis.fetch = (url) => {
      const u = String(url);
      if (u.includes('itunes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ITUNES_ANSWER) });
      }
      odesliUrl = u;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ODESLI_ANSWER) });
    };
    const { song } = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { odesliKey: 'sk-test' });

    ok('the key is sent to Odesli', /[?&]key=sk-test\b/.test(odesliUrl), true);
    /* Odesli matches the album wrapper rather than the recording without
       this, and a worship single's album links can point at a different
       master than the one the band actually played. */
    ok('and songIfSingle, which Odesli recommends for exactly our case',
      /[?&]songIfSingle=true\b/.test(odesliUrl), true);
    ok('and the other platforms come back', Object.keys(song.links).includes('spotify'), true);

    /* A keyed call that gets refused is the key's fault, and saying
       "the gateway answered 401, run this somewhere else" would send the
       pastor to reconfigure a network that is working fine. */
    globalThis.fetch = (url) => {
      if (String(url).includes('itunes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ITUNES_ANSWER) });
      }
      return Promise.resolve({ ok: false, status: 401 });
    };
    let message = '';
    try {
      await R.resolveSong({ title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
        { odesliKey: 'stale' });
    } catch (err) { message = err.message; }
    ok('a refused Odesli key names ODESLI_API_KEY, not the network',
      /refused the token/.test(message) && /ODESLI_API_KEY/.test(message), true);
    ok('and does not tell anybody to move machines',
      /could not reach/.test(message), false);
  }

  console.log('\n--- the key arrives after a set was already published ---');
  {
    /* The trap this pair exists to catch. Four songs went up during the
       Odesli outage with art and an Apple link and nothing else. When the
       key finally arrives, `--known` would hand those straight back: the
       cache has art, it has a link, it looks complete, and the other five
       platforms would never be fetched for any Sunday already published.
       The outage would quietly become permanent. */
    const cached = [{ title: 'So Much', artist: 'Life.Church Worship',
      artUrl: 'https://art', lyricsUrl: '', links: { apple: 'https://music.apple.com/x' } }];

    let odesliCalls = 0;
    globalThis.fetch = (url) => {
      if (String(url).includes('itunes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ITUNES_ANSWER) });
      }
      odesliCalls++;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ODESLI_ANSWER) });
    };

    const withKey = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { known: cached, odesliKey: 'sk-live' });
    ok('an Apple-only cache entry is refetched once a key exists', odesliCalls, 1);
    ok('and the song gains the other platforms',
      Object.keys(withKey.song.links).includes('spotify'), true);

    /* And the other half: with no key, refetching an Apple-only entry would
       just produce the same Apple-only row, so the cache is still honoured
       and no pointless call is made. */
    odesliCalls = 0;
    const noKey = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { known: cached });
    ok('but with no key the cache is still trusted', noKey.note.source, 'a previous Sunday');
    ok('and no call is wasted', odesliCalls, 0);

    /* A fully resolved song is never refetched, key or no key: that is the
       whole point of --known and a backfill would be pointless without it. */
    const whole = [{ title: 'So Much', artist: 'Life.Church Worship', artUrl: 'https://art',
      lyricsUrl: '', links: { apple: 'https://a', spotify: 'https://s', all: 'https://all' } }];
    odesliCalls = 0;
    const reused = await R.resolveSong(
      { title: 'So Much', artist: 'Life.Church Worship', alternates: [] },
      { known: whole, odesliKey: 'sk-live' });
    ok('a complete cache entry is reused even with a key',
      reused.note.source, 'a previous Sunday');
    ok('and costs nothing', odesliCalls, 0);
  }

  console.log('\n--- reading Odesli\'s public page ---');
  {
    /* The API is retired; the page is not, and it is explicitly excluded
       from the retirement. Spotify, YouTube and YouTube Music come back
       present-but-empty on every song tried, so the parser has to drop an
       empty url rather than store it: a key whose value is '' would draw a
       dead button on the screen. */
    const page = '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({
      props: { pageProps: { pageData: { sections: [
        { links: [
          { platform: 'appleMusic', url: 'https://geo.music.apple.com/x' },
          { platform: 'spotify', url: '' },
          { platform: 'youtube', url: '' },
          { platform: 'tidal', url: 'https://listen.tidal.com/track/222867632' },
          { platform: 'deezer', url: 'https://www.deezer.com/track/96932266' },
          { platform: 'amazonMusic', url: 'https://music.amazon.com/albums/B00VG33ZF2' },
          { platform: 'pandora', url: 'https://www.pandora.com/TR:2293235' }
        ] }
      ] } } }
    }) + '</script>';
    const got = R.linksFromSonglinkPage(page);
    ok('tidal, amazon, deezer and pandora are read',
      Object.keys(got).sort(), ['amazon', 'deezer', 'pandora', 'tidal']);
    ok('an empty spotify url is not stored as a link', 'spotify' in got, false);
    ok('nor an empty youtube one', 'youtube' in got, false);
    ok('a page with no data blob yields nothing, rather than throwing',
      Object.keys(R.linksFromSonglinkPage('<html>nope</html>')).length, 0);
  }

  console.log('\n--- picking a YouTube upload ---');
  {
    /* The real "Lean Back" search, which is why the channel is checked at
       all. The official upload runs 15:48 against Apple's 15:45; a reposted
       lyric video sits at 15:49, one second CLOSER. Duration alone picks the
       repost. */
    const vids = [
      { id: 'ixknfMJt21w', title: 'Lean Back', channel: 'TRIBL',       durationMs: 948000 },
      { id: 'PVDO9jHXxwo', title: 'Lean Back', channel: 'Shop Easier', durationMs: 949000 },
      { id: 'yG6wOHH2Kdg', title: 'Lean Back', channel: 'Worship Life', durationMs: 934000 }
    ];
    const want = { artist: 'Maverick City Music' };
    ok('a closer duration on a stranger\'s channel is refused',
      R.pickYoutube(vids, want, 945000), null);

    /* And the shape that does match: the artist\'s own channel, close enough. */
    const own = [
      { id: 'right', title: 'No Body', channel: 'Elevation Worship', durationMs: 363000 },
      { id: 'wrong', title: 'No Body', channel: 'OfficialChristianRadioHD', durationMs: 361200 }
    ];
    const hit = R.pickYoutube(own, { artist: 'Elevation Worship' }, 361965);
    ok('the artist\'s own channel wins even when another is closer',
      hit && hit.id, 'right');

    /* A radio edit on the right channel is still refused: minutes out is
       nowhere near the tolerance. */
    ok('a radio edit on the right channel is still refused',
      R.pickYoutube([{ id: 'radio', channel: 'Elevation Worship', durationMs: 254000 }],
        { artist: 'Elevation Worship' }, 361965), null);
  }

  console.log('\n--- verifying a Spotify candidate ---');
  {
    /* Spotify cannot be searched, so this checks rather than finds. The
       three ids below are the real ones a search for "So Much" returns: the
       album cut, a MultiTracks session and a radio version, in that order of
       plausibility and nowhere near each other in length. */
    const EMBEDS = {
      '6uqYWwJnvxaea90fGpnD5K': '{"name":"So Much","duration":406712}',
      '5WeGtzWzGwdMIIGL3n50Pg': '{"name":"So Much - MultiTracks Session","duration":327180}',
      '7CkgEinnbawU6SEtjIwdbp': '{"name":"So Much - Radio Version","duration":208380}'
    };
    R.setHttpText(async (url) => {
      const id = url.split('/').pop();
      return EMBEDS[id] || '';
    });

    ok('the duration is read out of the embed page',
      R.durationFromSpotifyEmbed(EMBEDS['6uqYWwJnvxaea90fGpnD5K']), 406712);

    let hit = await R.spotifyVerify(['6uqYWwJnvxaea90fGpnD5K'], 406713);
    ok('a one millisecond difference is the same recording', !!hit, true);
    ok('and it is returned as a track url',
      hit.url, 'https://open.spotify.com/track/6uqYWwJnvxaea90fGpnD5K');

    hit = await R.spotifyVerify(['5WeGtzWzGwdMIIGL3n50Pg'], 406713);
    ok('a MultiTracks session is refused', hit, null);
    hit = await R.spotifyVerify(['7CkgEinnbawU6SEtjIwdbp'], 406713);
    ok('so is a radio version', hit, null);

    /* Given the wrong one first and the right one second, it keeps looking
       rather than taking the first thing it is handed. */
    hit = await R.spotifyVerify(['7CkgEinnbawU6SEtjIwdbp', '6uqYWwJnvxaea90fGpnD5K'], 406713);
    ok('a bad candidate does not stop it finding a good one',
      hit && hit.id, '6uqYWwJnvxaea90fGpnD5K');

    ok('a malformed id is skipped rather than fetched',
      await R.spotifyVerify(['not-an-id'], 406713), null);
    ok('and no candidates means no link, not a guess',
      await R.spotifyVerify([], 406713), null);
    R.setHttpText(null);
  }

  console.log('\n--- the artist name a service will actually match ---');
  {
    ok('a billed credit reduces to the act',
      R.primaryArtist('Maverick City Music & Chandler Moore'), 'Maverick City Music');
    ok('so does a featuring credit',
      R.primaryArtist('Elevation Worship feat. Jonsal Barrientes'), 'Elevation Worship');
    ok('a plain name is left alone',
      R.primaryArtist('Jesus Culture'), 'Jesus Culture');
  }

  console.log('\n--- ids handed in for the two that cannot be searched ---');
  {
    ok('a title and id parse into candidates',
      R.parseIdMap('So Much=abc;Holy Spirit=def'),
      { 'so much': ['abc'], 'holy spirit': ['def'] });
    ok('several ids for one title are all kept, to be tried in turn',
      R.parseIdMap('So Much=one\nSo Much=two')['so much'], ['one', 'two']);
    ok('a parenthetical in the title still matches the song it names',
      Object.keys(R.parseIdMap('Lean Back (feat. Amanda)=abc')), ['lean back']);
    ok('junk is ignored rather than becoming a key',
      R.parseIdMap('no equals sign here'), {});
  }

  console.log('\n--- a YouTube id handed in ---');
  {
    /* The automatic pick only takes the artist's own channel, so an official
       upload on a label's stays unmatched and a person passes it in. It is
       still checked, because a hand-copied id goes wrong by landing on
       somebody else's video rather than on nothing. */
    R.setHttpText(async (url) => {
      if (url.includes('ixknfMJt21w')) {
        return JSON.stringify({ title: 'Lean Back (feat. Amanda Lindsey Cook & Chandler Moore)',
                                author_name: 'TRIBL' });
      }
      if (url.includes('dQw4w9WgXcQ')) {
        return JSON.stringify({ title: 'Never Gonna Give You Up', author_name: 'Rick Astley' });
      }
      return '';
    });
    const want = { title: 'Lean Back (feat. Amanda Lindsey Cook)', artist: 'Maverick City Music' };

    const hit = await R.youtubeVerify(['ixknfMJt21w'], want);
    ok('a label channel is accepted when the title is the song', hit && hit.id, 'ixknfMJt21w');
    ok('and the channel it actually came from is reported', hit.channel, 'TRIBL');

    ok('an unrelated video is refused even though it was handed in',
      await R.youtubeVerify(['dQw4w9WgXcQ'], want), null);
    ok('an id that resolves to nothing is refused',
      await R.youtubeVerify(['aaaaaaaaaaa'], want), null);
    ok('a malformed id is not even fetched',
      await R.youtubeVerify(['nope'], want), null);
    ok('a full watch url is accepted, not just a bare id',
      (await R.youtubeVerify(['https://www.youtube.com/watch?v=ixknfMJt21w'], want) || {}).id,
      'ixknfMJt21w');
    R.setHttpText(null);
  }

  console.log('\n--- a skipped Spotify search is not a song without a release ---');
  {
    /* Two gaps that look identical on the screen and are completely
       different problems. Candidates that all disagreed with Apple's length
       means somebody searched and found the wrong recordings. No candidates
       at all means the search never happened, which is a step of
       /new-worship being skipped, and every song has a Spotify release. */
    const row = R.buildRow('2026-08-23', null, [
      { title: 'So Much', artist: 'Life.Church Worship', artUrl: 'https://a',
        lyricsUrl: '', links: { apple: 'https://x' } }
    ]);
    const skipped = R.summarize(row, [{ title: 'So Much', confidence: 'high',
      source: 'iTunes', spotifySkipped: true }]);
    ok('the skipped case says the search was not done',
      /THE SPOTIFY SEARCH WAS NOT DONE/.test(skipped), true);
    ok('and tells you the flag to rerun with',
      /--spotify "So Much=<track id>"/.test(skipped), true);

    const unverified = R.summarize(row, [{ title: 'So Much', confidence: 'high',
      source: 'iTunes', spotifyUnverified: true }]);
    ok('the unverified case blames the ids, not the operator',
      /every id given was a different length/.test(unverified), true);
    ok('and does not claim the search was skipped',
      /WAS NOT DONE/.test(unverified), false);
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
