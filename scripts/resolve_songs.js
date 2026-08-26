#!/usr/bin/env node
/*
 * Home Church, worship setlist resolver.
 *
 * Turns the list somebody typed on a Sunday afternoon:
 *
 *     1. Oceans - Hillsong United
 *     2. How Great Is Our God - Chris Tomlin
 *
 * into the row `worship_sets` wants, with every song's album art and its
 * links on every platform already filled in:
 *
 *     node scripts/resolve_songs.js --served-on 2026-08-23 \
 *       --sermon sermon-last-words < songs.txt > /tmp/worship-2026-08-23.json
 *     python3 scripts/hc_supabase.py upsert worship_sets /tmp/worship-2026-08-23.json
 *
 * WHY THIS IS A SCRIPT AND NOT INSTRUCTIONS. /new-worship used to describe
 * this pipeline in prose and leave the fetching to be hand rolled on the day,
 * which is how the first setlist got published with four titles and no art:
 * the egress proxy refused the calls, and prose has no way to fail loudly.
 * A script fails with an exit code, matches the same way every week, and can
 * be tested without a network, which the prose could not.
 *
 * THE TWO SERVICES, one of which now needs a key it does not have:
 *
 *   iTunes Search   the canonical title and artist, the album art, and the
 *                   Apple Music link. Public, unauthenticated, generous.
 *   Odesli          every other platform from that one link, in one call.
 *                   This one HAS CHANGED. The free public tier is gone and
 *                   the endpoint now answers 401 PUBLIC_API_ACCESS_DEPRECATED
 *                   to any request without a key. There is no key here, so
 *                   the call is made, the refusal is reported once, and the
 *                   set publishes with its Apple links and its art and
 *                   without the other platforms. The sleep below is kept for
 *                   the day a key exists.
 *
 * Lyrics are not guessed. Genius is used when GENIUS_TOKEN is in .env and
 * left empty when it is not, because a Lyrics link that lands on a search
 * page or on somebody else's song is worse than no Lyrics link, and the
 * screen draws nothing at all for an empty one.
 *
 * NOTHING IS EVER INVENTED. Every URL here came back from a service. A song
 * that cannot be matched keeps its title and its artist and loses everything
 * else, which is a real row: the screen wears the house cover and draws no
 * buttons. Exit code 2 says at least one song came back thin, so a caller
 * can tell "published with gaps" from "published whole".
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const REPO_ROOT = path.dirname(__dirname);
const ENV_PATH = path.join(REPO_ROOT, '.env');

const ITUNES = 'https://itunes.apple.com/search';
const ODESLI = 'https://api.song.link/v1-alpha.1/links';
const GENIUS = 'https://api.genius.com/search';

const TIMEOUT_MS = 15000;

/* Odesli's free tier is about ten calls a minute and answers 429 past it.
   One Sunday is four or five songs, so this only ever matters on a backfill,
   which is exactly when being rate limited halfway through would be worst. */
const DEFAULT_SLEEP_MS = 1200;

/* --------------------------------------------------------------- the list ---
   However it was typed. All of these are the same line:

     1. Oceans - Hillsong United        Oceans — Hillsong United
     • Holy Spirit: Jesus Culture       Lean Back by Maverick City Music
     Great Are You Lord, All Sons       Holy Spirit (Jesus Culture)
   -------------------------------------------------------------------------- */

/* Order matters and comma is last on purpose. An em-dash or a colon is
   always a separator; a comma is usually part of an artist's name, so it only
   gets to split a line that nothing else could. */
const SEPARATORS = [' — ', ' – ', ' -- ', ' - ', ': ', ' by ', ', '];

function stripBullet(line) {
  return line.replace(/^\s*(?:\d+\s*[.)\]]\s*|[-*•·]\s+)/, '').trim();
}

/* "Jesus Culture or Bryan & Katie Torwalt" is two recordings of one song, and
   picking one silently is picking one wrong half the time. The first is used
   and every alternate is carried out to the summary, so /new-worship can ask
   before anything is written. */
function splitAlternates(artist) {
  const parts = artist.split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [artist];
}

function parseLine(raw) {
  const line = stripBullet(String(raw || ''));
  if (!line) return null;

  for (const sep of SEPARATORS) {
    const at = line.indexOf(sep);
    if (at > 0) {
      const title = line.slice(0, at).trim();
      const rest = line.slice(at + sep.length).trim();
      if (!title || !rest) continue;
      const alternates = splitAlternates(rest);
      return { title: title, artist: alternates[0], alternates: alternates };
    }
  }

  /* No separator anywhere, so a trailing parenthetical is the artist:
     "Holy Spirit (Jesus Culture)". Only in this branch, because
     "Oceans (Where Feet May Fail)" is a title with a parenthetical in it and
     a line that had a real separator has already been read correctly. */
  const paren = /^(.*?)\s*[([]([^)\]]+)[)\]]\s*$/.exec(line);
  if (paren && paren[1].trim()) {
    const alternates = splitAlternates(paren[2].trim());
    return { title: paren[1].trim(), artist: alternates[0], alternates: alternates };
  }

  // A bare title. Real, and the artist is asked for rather than invented.
  return { title: line, artist: '', alternates: [] };
}

function parseList(text) {
  return String(text || '').split(/\r?\n/).map(parseLine).filter(Boolean);
}

/* ------------------------------------------------------------- the matching */

function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // é becomes e
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// "Oceans (Where Feet May Fail)" and "Oceans" are the same song, and the
// church wrote whichever one it wrote.
function baseTitle(s) {
  return normalize(String(s || '').replace(/\s*[([].*$/, ''));
}

/* The same trim without the normalising, because a search query goes to a
   service that wants readable words rather than our comparison form. */
function baseTitleRaw(s) {
  return String(s || '').replace(/\s*[([].*$/, '').trim();
}

/* A recording nobody asked for. Karaoke and tribute records are the ones that
   actually get returned first for a worship search, because they are cheap to
   publish and there are hundreds of them, and they are the reason a naive
   "take the first result" would put the wrong thing on the screen most weeks. */
const DISQUALIFY = /\b(karaoke|tribute|made famous by|made popular by|in the style of|originally performed)\b/;
const VARIANT = /\b(live|remix|instrumental|acoustic|radio edit|sped up|slowed|reprise|demo|commentary)\b/;

function tokens(s) { return normalize(s).split(' ').filter(Boolean); }

function overlap(a, b) {
  const A = tokens(a), B = new Set(tokens(b));
  if (!A.length) return 0;
  return A.filter(t => B.has(t)).length / A.length;
}

/* How well one iTunes result answers the line that was typed. Additive and
   deliberately dull: the point is that two people reading it agree on why a
   song won, not that the numbers mean anything on their own. */
function scoreCandidate(want, cand) {
  const wantTitle = normalize(want.title);
  const candTitle = normalize(cand.trackName);
  const wantArtist = normalize(want.artist);
  const candArtist = normalize(cand.artistName);

  let score = 0;

  if (candTitle === wantTitle) score += 6;
  else if (baseTitle(cand.trackName) === baseTitle(want.title)) score += 5;
  else if (candTitle.startsWith(wantTitle) || wantTitle.startsWith(candTitle)) score += 3;
  else score += overlap(want.title, cand.trackName) * 2;

  if (wantArtist) {
    if (candArtist === wantArtist) score += 6;
    else if (candArtist.includes(wantArtist) || wantArtist.includes(candArtist)) score += 4;
    else score += overlap(want.artist, cand.artistName) * 3;
  }

  const askedVariant = VARIANT.test(normalize(want.title));
  const isVariant = VARIANT.test(candTitle);
  if (isVariant && !askedVariant) score -= 4;

  if (DISQUALIFY.test(candTitle) || DISQUALIFY.test(candArtist)) score -= 20;

  return score;
}

function confidenceOf(score) {
  if (score >= 10) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
}

/* The best result, with why. Null when nothing scored above the floor, which
   is a real answer: better a song with no art than a song wearing somebody
   else's cover. */
function pickBest(want, candidates) {
  let best = null, bestScore = -Infinity, runnerUp = null;
  for (const cand of candidates || []) {
    if (!cand || !cand.trackName) continue;
    const score = scoreCandidate(want, cand);
    if (score > bestScore) { runnerUp = best; best = cand; bestScore = score; }
    else if (!runnerUp || score > scoreCandidate(want, runnerUp)) { runnerUp = cand; }
  }
  if (!best || bestScore < 4) return null;
  return { match: best, score: bestScore, confidence: confidenceOf(bestScore), runnerUp: runnerUp };
}

/* iTunes hands back a 100px thumbnail in the search result and the same file
   is on the same CDN at every other size. The screen draws art up to 320pt on
   a 3x phone, so 100px would be a blur and 600 is the honest size. */
function bigArt(url) {
  return String(url || '').replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1');
}

/* Odesli's platform names to the ones the row uses. Only the ones that are
   real: the screen draws three of these today and stores the rest, so adding
   a fourth mark later is a line in js/screens/worship.js and no republishing. */
const PLATFORM_KEYS = {
  youtube: 'youtube',
  spotify: 'spotify',
  appleMusic: 'apple',
  amazonMusic: 'amazon',
  youtubeMusic: 'youtubeMusic',
  tidal: 'tidal',
  pandora: 'pandora',
  deezer: 'deezer'
};

function linksFromOdesli(body) {
  const out = {};
  const by = (body && body.linksByPlatform) || {};
  for (const [odesli, ours] of Object.entries(PLATFORM_KEYS)) {
    const url = by[odesli] && by[odesli].url;
    if (typeof url === 'string' && url.trim()) out[ours] = url.trim();
  }
  if (body && typeof body.pageUrl === 'string' && body.pageUrl.trim()) {
    out.all = body.pageUrl.trim();
  }
  return out;
}

/* ------------------------------------------------------- the other sources ---

   Odesli's API used to answer this whole section in one call. It is gone, so
   the same four facts now come from four places, and every one of them is
   checked against the recording iTunes already matched rather than trusted
   on its name. The check is the track's length.

   WHY LENGTH. A worship title is not unique. "Holy Spirit" by Jesus Culture
   alone has four Spotify releases, "So Much" has a radio edit and a
   MultiTracks session, and searching by name lands on whichever the service
   ranks first. Length is the one field every service publishes that is
   specific to a master: the four songs on this Sunday's set matched their
   Spotify entries to within a single millisecond, while the radio edit of
   "So Much" was out by 198 seconds. So nothing here is accepted on a title
   match. It is accepted because it is the same length as the recording
   Apple already gave us, or it is not accepted at all. */

const SONGLINK_PAGE = 'https://song.link/i/';
const DEEZER_SEARCH = 'https://api.deezer.com/search';
const DEEZER_TRACK = 'https://api.deezer.com/track/';
const YOUTUBE_SEARCH = 'https://www.youtube.com/results';
const SPOTIFY_EMBED = 'https://open.spotify.com/embed/track/';

/* Deezer publishes whole seconds and iTunes publishes milliseconds, so a
   correct match is routinely a few hundred ms apart and occasionally a
   second. Four is wide enough for that rounding and nowhere near wide enough
   to admit a radio edit, which is minutes out, not seconds. */
const DURATION_TOLERANCE_MS = 4000;

/* Node's fetch cannot be used for these four. Deezer, YouTube, song.link and
   Spotify's embed host all sit behind bot protection that fingerprints the
   client, and undici's TLS and header signature is not curl's: every one of
   them answers 403 to fetch and 200 to curl, with identical headers and from
   this same machine. This is not a style preference. It was measured, and
   curl is the only one of the two clients these services will talk to.

   iTunes is unaffected and keeps using fetch above, which also keeps the
   existing tests, which stub globalThis.fetch, driving the path they were
   written for. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

function curlText(url) {
  return new Promise((resolve) => {
    execFile('curl', ['-sSL', '--max-time', '25', '-H', 'User-Agent: ' + BROWSER_UA, url],
      { maxBuffer: 24 * 1024 * 1024 },
      (err, stdout) => resolve(err ? '' : String(stdout || '')));
  });
}

/* Swapped by tests, which drive every parser below with saved payloads
   rather than over the network. The shape these services answer with is not
   something to discover on a Sunday morning. */
let httpText = curlText;
function setHttpText(fn) { httpText = fn || curlText; }

async function httpJson(url) {
  const body = await httpText(url);
  if (!body) return null;
  try { return JSON.parse(body); } catch (err) { return null; }
}

/* Odesli's API is gone but its public pages are not, and they are explicitly
   excluded from the API's retirement. The page carries the same matching in
   a __NEXT_DATA__ blob. Spotify, YouTube and YouTube Music come back empty
   from it on every song tried, so those two are not read from here. */
function linksFromSonglinkPage(html) {
  const out = {};
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html || '');
  if (!m) return out;
  let data;
  try { data = JSON.parse(m[1]); } catch (err) { return out; }
  const sections =
    (((data.props || {}).pageProps || {}).pageData || {}).sections || [];
  const WANT = { tidal: 'tidal', amazonMusic: 'amazon', deezer: 'deezer', pandora: 'pandora' };
  for (const section of sections) {
    for (const link of (section.links || [])) {
      const ours = WANT[link.platform];
      if (ours && typeof link.url === 'string' && link.url.trim()) out[ours] = link.url.trim();
    }
  }
  return out;
}

async function songlinkFor(itunesTrackId) {
  if (!itunesTrackId) return {};
  return linksFromSonglinkPage(await httpText(SONGLINK_PAGE + encodeURIComponent(itunesTrackId)));
}

/* The ISRC, which is the recording's global id. Nothing on the screen uses
   it; it is stored so a later run can re-resolve this exact master instead
   of searching for its name again. Deezer is the only reachable service that
   hands one out without a key. */
function pickByDuration(candidates, wantMs, durationOf) {
  let best = null;
  for (const cand of candidates || []) {
    const ms = durationOf(cand);
    if (!ms) continue;
    const delta = Math.abs(ms - wantMs);
    if (!best || delta < best.delta) best = { cand: cand, delta: delta };
  }
  return (best && best.delta <= DURATION_TOLERANCE_MS) ? best : null;
}

/* "Maverick City Music & Chandler Moore" is how Apple bills the recording
   and not how Deezer indexes it, so the full credit finds nothing while the
   first name alone finds it immediately. Both are tried, widest last, and
   the length check is what decides either way. */
function primaryArtist(name) {
  return String(name || '').split(/\s*(?:&|feat\.?|featuring|,|with)\s+/i)[0].trim();
}

async function deezerFor(song, wantMs) {
  if (!wantMs) return {};
  const title = baseTitleRaw(song.title);
  const artists = [song.artist, primaryArtist(song.artist)]
    .map(a => String(a || '').trim())
    .filter((a, i, all) => a && all.indexOf(a) === i);

  let hit = null;
  for (const artist of artists) {
    const q = 'artist:"' + artist + '" track:"' + title + '"';
    const body = await httpJson(DEEZER_SEARCH + '?limit=25&q=' + encodeURIComponent(q));
    hit = pickByDuration((body && body.data) || [], wantMs, t => (t.duration || 0) * 1000);
    if (hit) break;
  }
  if (!hit) return {};
  const detail = await httpJson(DEEZER_TRACK + encodeURIComponent(hit.cand.id));
  return {
    isrc: (detail && detail.isrc) || '',
    link: hit.cand.link || '',
    delta: hit.delta
  };
}

/* YouTube, from the search page's ytInitialData. Two checks, and both are
   needed: the length has to match, and the channel has to be the artist's.

   Neither alone is enough, and "Lean Back" is why. Its official upload runs
   15:48 against Apple's 15:45, and a reposted lyric video sits at 15:49,
   one second CLOSER. Length alone picks the repost. The channel is what
   separates them. */
function youtubeCandidates(html) {
  const m = /var ytInitialData = (\{[\s\S]*?\});<\/script>/.exec(html || '');
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch (err) { return []; }
  const out = [];
  (function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const v = node.videoRenderer;
    if (v && v.videoId) {
      const text = (o) => ((o && o.runs) || []).map(r => r.text || '').join('');
      const label = (v.lengthText && v.lengthText.simpleText) || '';
      let ms = 0;
      if (/^\d+(:\d+)+$/.test(label)) {
        ms = label.split(':').reduce((acc, part) => acc * 60 + parseInt(part, 10), 0) * 1000;
      }
      out.push({
        id: v.videoId,
        title: text(v.title),
        channel: text(v.ownerText) || text(v.longBylineText),
        durationMs: ms
      });
    }
    for (const key of Object.keys(node)) walk(node[key]);
  })(data);
  return out;
}

/* The channel is the artist's when either name contains the other, which is
   how "Elevation Worship" matches its own channel. It deliberately does not
   try to know that TRIBL is Maverick City's label: a table of which channel
   belongs to which artist would be wrong the first week somebody signs
   elsewhere. An official upload on a label channel is left unmatched and
   named in the summary, so it can be confirmed once by a person. */
function pickYoutube(candidates, want, wantMs) {
  const artist = normalize(want.artist);
  if (!artist || !wantMs) return null;
  const sameArtist = (candidates || []).filter(c => {
    const channel = normalize(c.channel);
    return channel && (channel.includes(artist) || artist.includes(channel));
  });
  const hit = pickByDuration(sameArtist, wantMs, c => c.durationMs);
  return hit ? hit.cand : null;
}

async function youtubeFor(want, wantMs) {
  if (!wantMs || !want.artist) return null;
  const q = primaryArtist(want.artist) + ' ' + baseTitleRaw(want.title);
  const html = await httpText(YOUTUBE_SEARCH + '?search_query=' + encodeURIComponent(q));
  const candidates = youtubeCandidates(html);
  /* The channel check runs against both spellings for the same reason the
     Deezer query does: a channel is named for the act, not for the credit
     on one recording. */
  return pickYoutube(candidates, want, wantMs) ||
         pickYoutube(candidates, { artist: primaryArtist(want.artist) }, wantMs);
}

/* Spotify is the one service here that cannot be searched. Its search page
   renders in the browser and carries no results in the HTML, its API needs a
   token, and the endpoint that mints an anonymous one is blocked. So this
   VERIFIES rather than finds: given candidate track ids, it keeps the one
   whose length matches and discards the rest.

   The embed page is what makes that possible. It is server rendered, needs
   no key, and carries the exact duration in milliseconds. On this Sunday's
   set it agreed with Apple to within one millisecond on all four songs, and
   it is what threw out the radio edit and the MultiTracks session of
   "So Much" that a title search returns first.

   Where the candidates come from is /new-worship's job, not this file's. */
function durationFromSpotifyEmbed(html) {
  const m = /"duration":(\d+)/.exec(html || '');
  return m ? parseInt(m[1], 10) : 0;
}

async function spotifyVerify(candidateIds, wantMs) {
  if (!wantMs) return null;
  for (const raw of (candidateIds || [])) {
    const id = String(raw || '').trim().replace(/^.*\/track\//, '').replace(/\?.*$/, '');
    if (!/^[A-Za-z0-9]{22}$/.test(id)) continue;
    const ms = durationFromSpotifyEmbed(await httpText(SPOTIFY_EMBED + id));
    if (ms && Math.abs(ms - wantMs) <= DURATION_TOLERANCE_MS) {
      return { id: id, url: 'https://open.spotify.com/track/' + id, delta: Math.abs(ms - wantMs) };
    }
  }
  return null;
}

/* ---------------------------------------------------------------- the wire */

function readEnv() {
  const out = {};
  if (!fs.existsSync(ENV_PATH)) return out;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* One line per host, however many songs are in the set. A four song Sunday
   would otherwise print the same warning four times and bury the summary
   underneath it. */
const warned = new Set();
function warnOnce(message) {
  if (warned.has(message)) return;
  warned.add(message);
  process.stderr.write('resolve_songs: ' + message + '\n');
}

/* The one failure that must never be mistaken for "this song has no art".
   Nothing was resolved, so nothing should be published, and the message says
   where to run it instead. */
function blocked(url, why) {
  const host = new URL(url).host;
  return new Error(
    'could not reach ' + host + ' (' + why + ').\n' +
    '       This is what a blocked egress proxy looks like. Run it on a machine\n' +
    '       with open network access, or pass the links in by hand.\n' +
    '       Nothing has been guessed and nothing has been written.');
}

/* One request, with the two failures that actually happen told apart.

   A blocked egress proxy and a song that does not exist look identical from
   inside a try/catch, and they need opposite responses: one is "run this
   somewhere else", the other is "this song has no art". So a transport
   failure throws with the host on it and a 404 comes back as no result. */
async function getJson(url, opts) {
  opts = opts || {};
  let attempt = 0;
  for (;;) {
    attempt++;
    let res;
    try {
      res = await fetch(url, {
        headers: Object.assign({ Accept: 'application/json' }, opts.headers || {}),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      throw blocked(url, err && err.message ? err.message : 'network error');
    }

    // Rate limited. Odesli does this on a backfill and the answer is to wait.
    if (res.status === 429 && attempt <= 4) {
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 404) return null;

    /* A refusal on a request that carried no credentials is not this song's
       fault and not this catalogue's. iTunes and Odesli are open, so nothing
       we sent could be unauthorised: somebody in the middle said no, which is
       what an egress proxy does, and 407 is one saying so in as many words.

       This branch is not hypothetical. It is what the proxy in a web session
       actually answers, and before it existed that answer arrived as
       "itunes.apple.com answered 403", which reads like Apple turned us away
       and reads nothing like "run this somewhere else". */
    const sentCredentials = !!opts.headers || !!opts.keyed;

    if ((res.status === 403 || res.status === 407) && !sentCredentials) {
      throw blocked(url, 'the gateway answered ' + res.status);
    }

    /* A 401 on a request that carried no credentials is a third thing again,
       and it is neither of the two above: not a bad key, because we sent no
       key, and not a gateway, because the tunnel opened and the service
       itself answered. It is an API that used to be open and is not any more.

       Odesli retired its free public tier and answers exactly this
       (PUBLIC_API_ACCESS_DEPRECATED), and there is no key anywhere in this
       repo to satisfy it with. Throwing would abandon the iTunes half of the
       song, which is real, already fetched, and the half that carries the
       art. So this reads as "no answer" the way a 404 does: the song keeps
       its art, its canonical title and its Apple link, and `summarize`
       prints the link count so a one-link song is visible as one.

       Note this does NOT trip the exit 2 path: a song with art and an Apple
       link is not "thin" by the definition in main, which asks for no art or
       no links at all. Exit stays 0 and the missing platforms show up as
       "1 links" in the summary and in the warning above. Nothing is
       invented to fill the hole. */
    if (res.status === 401 && !sentCredentials) {
      warnOnce(new URL(url).host + ' answered 401: its public API now requires ' +
        'a key and this request carried none, so this set publishes with its ' +
        'art and its Apple links only. Put ODESLI_API_KEY in .env to get ' +
        'Spotify, YouTube, YouTube Music, Amazon and Tidal back. ' +
        'No link has been guessed.');
      return null;
    }

    // A refusal on a request that did carry a key is the key's fault.
    if (res.status === 401 || res.status === 403) {
      const host = new URL(url).host;
      const which = opts.keyed
        ? 'Check ODESLI_API_KEY in .env, or unset it to publish with Apple links only.'
        : 'Check GENIUS_TOKEN in .env, or unset it to publish without lyrics.';
      throw new Error(host + ' refused the token (' + res.status + '). ' + which);
    }

    if (!res.ok) {
      if (attempt <= 2 && res.status >= 500) { await sleep(1000 * attempt); continue; }
      throw new Error(new URL(url).host + ' answered ' + res.status);
    }
    return res.json();
  }
}

async function searchItunes(want) {
  const term = [want.title, want.artist].filter(Boolean).join(' ');
  const url = ITUNES + '?' + new URLSearchParams({
    term: term, entity: 'song', limit: '25', country: 'US'
  });
  const body = await getJson(url);
  return (body && Array.isArray(body.results)) ? body.results : [];
}

/* The key is a query parameter, which is Odesli's own design and not ours.
   It never reaches a log or an error message: everything below reports
   `new URL(url).host`, never the URL itself, so a key cannot leak into a
   terminal somebody pastes into chat. */
async function odesliFor(appleUrl, key) {
  /* songIfSingle is Odesli's own recommendation and it bears directly on the
     failure this file exists to prevent. Handed a single, Odesli otherwise
     matches the album wrapper rather than the recording inside it, and the
     album's links can point at a different master than the one the band
     played. Worship releases are singles far more often than not. */
  const params = { url: appleUrl, userCountry: 'US', songIfSingle: 'true' };
  if (key) params.key = key;
  const url = ODESLI + '?' + new URLSearchParams(params);
  /* `keyed` rather than sniffing opts.headers: the key rides in the query
     string, so getJson cannot otherwise tell an authenticated call from an
     anonymous one, and that distinction is the whole point of the 401
     branches. */
  return getJson(url, { keyed: !!key });
}

/* Genius, only when there is a token for it. Checked against the song that
   was actually matched rather than against the line that was typed, so a
   lyrics page for a different artist's song of the same name is refused. */
async function lyricsFor(song, token) {
  if (!token) return '';
  const url = GENIUS + '?' + new URLSearchParams({ q: song.title + ' ' + song.artist });
  const body = await getJson(url, { headers: { Authorization: 'Bearer ' + token } });
  const hits = (body && body.response && body.response.hits) || [];
  for (const hit of hits) {
    const r = hit && hit.result;
    if (!r || !r.url) continue;
    const titleOk = baseTitle(r.title) === baseTitle(song.title);
    const artistOk = overlap(song.artist, (r.primary_artist && r.primary_artist.name) || '') >= 0.5;
    if (titleOk && artistOk) return String(r.url);
  }
  return '';
}

/* ------------------------------------------------------------- one song --- */

/* A song already resolved on an earlier Sunday. Matching on title and artist
   together, because the same title by a different artist is a different
   recording and reusing its links would be the exact mistake this file
   exists to prevent. */
function findKnown(want, known) {
  return (known || []).find(k =>
    k && baseTitle(k.title) === baseTitle(want.title) &&
    (!want.artist || overlap(want.artist, k.artist) >= 0.6)) || null;
}

/* A song resolved while Odesli was unreachable has its art and its Apple
   link and nothing else. Left alone, that is how an outage outlives itself:
   the key finally arrives, every Sunday already published keeps its single
   button, and nothing ever goes back for the other five platforms, because
   the cache looks complete enough to reuse.

   So a key on the table makes an Apple-only entry stale by definition. It
   costs one extra iTunes lookup on the first run after the key lands and
   nothing on any run after that. Without a key this returns false and the
   cache behaves exactly as it always did, because re-fetching would only
   produce the same Apple-only row again. */
function missingOdesliLinks(links) {
  const keys = Object.keys(links || {});
  return keys.length > 0 && keys.every(k => k === 'apple');
}

async function resolveSong(want, opts) {
  const note = { title: want.title, artist: want.artist, alternates: want.alternates || [] };

  const known = findKnown(want, opts.known);
  const staleFromOutage = !!opts.odesliKey && !!known && missingOdesliLinks(known.links);
  if (known && known.artUrl && known.links && Object.keys(known.links).length && !staleFromOutage) {
    note.source = 'a previous Sunday';
    note.confidence = 'high';
    return { song: Object.assign({}, known), note: note };
  }

  const song = {
    title: want.title,
    artist: want.artist,
    artUrl: '',
    lyricsUrl: '',
    isrc: '',
    links: {}
  };

  const results = await searchItunes(want);
  const best = pickBest(want, results);

  if (!best) {
    note.source = 'no match';
    note.confidence = 'none';
    return { song: song, note: note };
  }

  // The catalogue's spelling wins over the one typed on a Sunday afternoon,
  // which is how "Hillsong United" becomes "Hillsong UNITED" and how a song
  // gets its parenthetical back.
  song.title = best.match.trackName;
  song.artist = best.match.artistName;
  song.artUrl = bigArt(best.match.artworkUrl100);

  /* Apple's length for the recording it just matched. Every other service
     below is checked against this number, so if it is missing the checks
     cannot run and the other sources are skipped rather than guessed at. */
  const wantMs = best.match.trackTimeMillis || 0;
  if (!wantMs) note.noDuration = true;

  note.source = 'iTunes';
  note.matched = best.match.trackName + ' / ' + best.match.artistName;
  note.confidence = best.confidence;
  note.score = Math.round(best.score * 10) / 10;
  if (best.runnerUp) note.runnerUp = best.runnerUp.trackName + ' / ' + best.runnerUp.artistName;

  const appleUrl = best.match.trackViewUrl;
  if (appleUrl) song.links.apple = appleUrl;

  /* Odesli's API, still first when a key exists, because one call that
     matches on the recording's own identity beats four that infer it from a
     length. Everything after this is the fallback for not having one. */
  if (appleUrl && opts.odesliKey) {
    const odesli = await odesliFor(appleUrl, opts.odesliKey);
    if (odesli) Object.assign(song.links, linksFromOdesli(odesli));
    else note.odesli = 'no answer';
  }

  if (wantMs) {
    /* Tidal, Amazon and Deezer, off Odesli's public page, which its API's
       retirement explicitly does not cover. */
    const page = await songlinkFor(best.match.trackId);
    for (const [k, v] of Object.entries(page)) if (!song.links[k]) song.links[k] = v;

    const deezer = await deezerFor(song, wantMs);
    if (deezer.isrc) song.isrc = deezer.isrc;
    if (deezer.link && !song.links.deezer) song.links.deezer = deezer.link;

    if (!song.links.youtube) {
      const video = await youtubeFor(song, wantMs);
      if (video) {
        song.links.youtube = 'https://www.youtube.com/watch?v=' + video.id;
        song.links.youtubeMusic = 'https://music.youtube.com/watch?v=' + video.id;
        note.youtube = video.channel;
      } else {
        /* Not a failure. An official upload that lives on a label's channel
           rather than the artist's is the common shape of this, and it wants
           one look from a person instead of a guess. */
        note.youtubeUnmatched = true;
      }
    }

    if (!song.links.spotify) {
      const hit = await spotifyVerify(opts.spotifyIds && opts.spotifyIds[baseTitle(song.title)], wantMs);
      if (hit) { song.links.spotify = hit.url; note.spotify = 'verified +/-' + hit.delta + 'ms'; }
      else note.spotifyUnverified = true;
    }
  }

  song.lyricsUrl = await lyricsFor(song, opts.geniusToken);

  return { song: song, note: note };
}

/* ------------------------------------------------------------- the row --- */

function buildRow(servedOn, sermonId, songs) {
  return {
    id: 'worship-' + servedOn,
    served_on: servedOn,
    // Null is the row this app is built for rather than a gap to fill in: the
    // screen finds the message by date until /new-podcast fills this in.
    sermon_id: sermonId || null,
    songs: songs,
    published: true
  };
}

/* What /new-worship shows before it writes anything. On stderr, so the row
   itself can be piped straight into a file. */
function summarize(row, notes) {
  const lines = [];
  lines.push('');
  lines.push('Sunday      ' + row.served_on);
  lines.push('Message     ' + (row.sermon_id || 'not linked yet, the screen will find it by date'));
  lines.push('');

  notes.forEach((n, i) => {
    const song = row.songs[i];
    const platforms = Object.keys(song.links).filter(k => k !== 'all').length;
    const bits = [
      song.artUrl ? 'art' : 'NO ART',
      platforms ? platforms + ' links' : 'NO LINKS',
      song.lyricsUrl ? 'lyrics' : 'no lyrics'
    ];
    lines.push((i + 1) + '. ' + song.title + '  /  ' + (song.artist || 'ARTIST UNKNOWN'));
    lines.push('   ' + bits.join(', ') + '   [' + n.confidence + ', via ' + n.source + ']');
    if (n.confidence === 'low' || n.confidence === 'none') {
      lines.push('   ! check this one' + (n.runnerUp ? ', runner up was ' + n.runnerUp : ''));
    }
    if (n.youtubeUnmatched) {
      lines.push('   ! no YouTube upload on this artist\'s own channel. Often means the');
      lines.push('     official one sits on a label channel. Check and pass it in.');
    }
    if (n.spotifyUnverified) {
      lines.push('   ! no Spotify link. Search for the track, then rerun with');
      lines.push('     --spotify "' + song.title + '=<track id>". It is checked before it is used.');
    }
    if (n.alternates && n.alternates.length > 1) {
      lines.push('   ! the line named two artists: ' + n.alternates.join(' / ') +
                 '. Used the first. Ask before writing.');
    }
    lines.push('');
  });

  return lines.join('\n');
}

/* ----------------------------------------------------------------- main --- */

function parseArgs(argv) {
  const args = { sleep: DEFAULT_SLEEP_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--served-on') args.servedOn = argv[++i];
    else if (a === '--sermon') args.sermon = argv[++i];
    else if (a === '--known') args.known = argv[++i];
    else if (a === '--songs') args.songs = argv[++i];
    else if (a === '--spotify') args.spotify = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--sleep') args.sleep = parseInt(argv[++i], 10) || 0;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error('unknown option ' + a);
  }
  return args;
}

const USAGE = `
Home Church, worship setlist resolver.

  node scripts/resolve_songs.js --served-on 2026-08-23 [options] < songs.txt

  --served-on YYYY-MM-DD   the Sunday. Required, and it becomes the row's id.
  --sermon    sermon-id    that morning's message. Omit when the episode is
                           not published yet, which is the normal case.
  --songs     "a\\nb"       the list, instead of stdin.
  --spotify   "T=id;T=id"  candidate Spotify track ids per title. Each is
                           checked against Apple's length and dropped if it
                           disagrees, so a wrong id costs a missing link
                           rather than a wrong one.
  --known     file.json    songs resolved on earlier Sundays, reused when a
                           title and artist both match.
  --out       file.json    write the row here as well as to stdout.
  --sleep     ms           between Odesli calls. Default ${DEFAULT_SLEEP_MS}.

The row goes to stdout, a summary for a human goes to stderr:

  node scripts/resolve_songs.js --served-on 2026-08-23 --sermon sermon-last-words \\
    < songs.txt > /tmp/worship-2026-08-23.json
  python3 scripts/hc_supabase.py upsert worship_sets /tmp/worship-2026-08-23.json

Exit 0 every song resolved, 2 at least one came back without art or links,
1 something went wrong and nothing was written.
`;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    return '';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(USAGE); return 0; }

  if (!args.servedOn || !/^\d{4}-\d{2}-\d{2}$/.test(args.servedOn)) {
    process.stderr.write('resolve_songs: --served-on YYYY-MM-DD is required.\n' + USAGE);
    return 1;
  }

  const text = args.songs != null ? args.songs.replace(/\\n/g, '\n') : readStdin();
  const wants = parseList(text);
  if (!wants.length) {
    process.stderr.write('resolve_songs: no songs on stdin and none in --songs.\n' + USAGE);
    return 1;
  }

  let known = [];
  if (args.known) {
    const raw = JSON.parse(fs.readFileSync(args.known, 'utf8'));
    // Either a list of songs, or the rows a `select worship_sets` came back
    // with, which is what /new-worship has to hand.
    known = Array.isArray(raw)
      ? raw.flatMap(r => (r && Array.isArray(r.songs)) ? r.songs : [r]).filter(Boolean)
      : [];
  }

  /* Candidate Spotify ids, as "Song Title = id" per line or separated by
     semicolons. They are candidates and not answers: each one is checked
     against Apple's length for that recording and dropped if it disagrees,
     so passing the wrong id costs a missing link rather than a wrong one. */
  const spotifyIds = {};
  for (const entry of String(args.spotify || '').split(/[;\n]/)) {
    const at = entry.indexOf('=');
    if (at < 1) continue;
    const key = baseTitle(entry.slice(0, at));
    const id = entry.slice(at + 1).trim();
    if (!key || !id) continue;
    (spotifyIds[key] = spotifyIds[key] || []).push(id);
  }

  const env = readEnv();
  const geniusToken = env.GENIUS_TOKEN || process.env.GENIUS_TOKEN || '';
  const odesliKey = env.ODESLI_API_KEY || process.env.ODESLI_API_KEY || '';

  const songs = [];
  const notes = [];
  for (let i = 0; i < wants.length; i++) {
    if (i > 0 && args.sleep) await sleep(args.sleep);
    const { song, note } = await resolveSong(wants[i],
      { known: known, geniusToken: geniusToken, odesliKey: odesliKey,
        spotifyIds: spotifyIds });
    songs.push(song);
    notes.push(note);
  }

  const row = buildRow(args.servedOn, args.sermon, songs);
  const json = JSON.stringify(row, null, 2) + '\n';

  if (args.out) fs.writeFileSync(args.out, json, 'utf8');
  process.stdout.write(json);
  process.stderr.write(summarize(row, notes));

  const thin = songs.some(s => !s.artUrl || !Object.keys(s.links).length);
  if (thin) {
    process.stderr.write(
      'Some songs came back without art or links. They are still real rows and\n' +
      'the screen draws them, but say so before publishing.\n\n');
  }
  return thin ? 2 : 0;
}

/* Exported for tests/worship.test.js, which drives the parsing and the
   matching with fixtures rather than over the network: the scoring is the
   part that decides whether a congregation sees the right recording, and it
   should not need a working connection to check. */
module.exports = {
  parseLine, parseList, normalize, baseTitle, scoreCandidate, pickBest,
  bigArt, linksFromOdesli, findKnown, missingOdesliLinks, buildRow, summarize,
  baseTitleRaw, linksFromSonglinkPage, youtubeCandidates, pickYoutube,
  durationFromSpotifyEmbed, spotifyVerify, pickByDuration, setHttpText, primaryArtist,
  /* The whole path for one song, exported so a test can drive it with a
     stubbed global fetch. Reading the two services correctly matters as much
     as scoring them, and the shape of what they answer with is not something
     to find out on a Sunday. */
  resolveSong
};

/* process.exitCode rather than process.exit(), which is not the same thing
   here. The row goes to stdout and the summary to stderr, and both of those
   are pipes when this is used the way the usage above shows. process.exit()
   ends the process with writes still queued on a pipe, so the row gets cut
   off partway through and the file it was redirected into is invalid JSON.
   Setting the code and letting Node leave on its own flushes both first. */
if (require.main === module) {
  main().then(
    code => { process.exitCode = code; },
    err => {
      process.stderr.write('resolve_songs: ' + (err && err.message ? err.message : err) + '\n');
      process.exitCode = 1;
    }
  );
}
