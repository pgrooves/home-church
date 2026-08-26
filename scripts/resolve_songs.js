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
 * THE SERVICES. iTunes Search needs no key and is the backbone: the canonical
 * title and artist, the album art, and the Apple Music link. Everything else
 * needs one free credential each in .env, and is left out of the row rather
 * than guessed at when there is none. See .env.example.
 *
 *   iTunes      art, title, artist, Apple link.   no key
 *   Spotify     SPOTIFY_CLIENT_ID + _SECRET
 *   YouTube     YOUTUBE_API_KEY
 *   Odesli      ODESLI_API_KEY, and then it answers for all of them at once
 *   Genius      GENIUS_TOKEN, for the lyrics
 *
 * THIS USED TO BE TWO SERVICES AND ONE OF THEM WENT AWAY. Odesli answered for
 * every platform in a single unauthenticated call, which was the whole reason
 * the design was tidy, and it has since retired public access to that
 * endpoint: it returns 401 PUBLIC_API_ACCESS_DEPRECATED to anybody without a
 * key. Left as it was, every set would have published with art and an Apple
 * link and nothing else, and the summary would have said "1 link" as though
 * the song were simply not on Spotify. So each platform is asked for itself,
 * Odesli is skipped rather than attempted without a key, and "not set up" and
 * "found nothing" are different lines in the summary.
 *
 * Lyrics are not guessed either. A Lyrics link that lands on a search page or
 * on somebody else's song is worse than none, and the screen draws nothing at
 * all for an empty one.
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
const http = require('http');
const https = require('https');
const tls = require('tls');

const REPO_ROOT = path.dirname(__dirname);
const ENV_PATH = path.join(REPO_ROOT, '.env');

const ITUNES = 'https://itunes.apple.com/search';
const ODESLI = 'https://api.song.link/v1-alpha.1/links';
const GENIUS = 'https://api.genius.com/search';
const SPOTIFY_TOKEN = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SEARCH = 'https://api.spotify.com/v1/search';
const YOUTUBE_SEARCH = 'https://www.googleapis.com/youtube/v3/search';

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

/* --------------------------------------------------------------- transport

   WHY THIS IS NOT `fetch`. Node's global fetch ignores HTTPS_PROXY. Every
   other tool on a machine behind a proxy honours it, curl and git and
   `hc_supabase.py` included, so on such a machine fetch is the one thing that
   cannot reach anything, and it does not say why: the gateway answers with a
   plain text refusal and fetch hands that back as "unexpected token H in
   JSON". That reads like a broken catalogue and is actually a proxy.

   NODE_USE_ENV_PROXY fixes it on new enough Node and is still experimental,
   and undici's ProxyAgent is not importable without a dependency. So this
   opens the tunnel itself, with the standard library, the same way
   `hc_supabase.py` gets through with urllib. Certificates are Node's own
   store plus NODE_EXTRA_CA_CERTS, which is what a proxy that inspects TLS
   sets, so nothing here has to weaken verification and nothing here does. */

function proxyFor(url) {
  const bypass = (process.env.NO_PROXY || process.env.no_proxy || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const host = url.hostname.toLowerCase();
  for (const rule of bypass) {
    if (rule === '*') return null;
    const bare = rule.replace(/^\./, '');
    if (host === bare || host.endsWith('.' + bare)) return null;
  }
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy ||
                process.env.ALL_PROXY || process.env.all_proxy || '';
  return proxy ? new URL(proxy) : null;
}

/* One request, straight or through a CONNECT tunnel, resolving to the status
   and the body. Nothing here parses: the caller decides what a status means,
   because the same 401 means "the network said no" from one service and "your
   token expired" from another.

   GET and POST both, because Spotify's token endpoint is a POST and it used
   to have its own copy of the tunnelling below. Two copies of a CONNECT
   handshake is two places for a proxy bug to hide, and the copy was the one
   the tests could not reach. */
function httpRequest(urlStr, opts) {
  opts = opts || {};
  const method = opts.method || 'GET';
  const body = opts.body || null;
  const url = new URL(urlStr);
  const proxy = proxyFor(url);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(blocked(urlStr, 'timed out after ' + TIMEOUT_MS + 'ms'));
    }, TIMEOUT_MS);

    let socket = null;
    function cleanup() {
      clearTimeout(timer);
      if (socket && !socket.destroyed) socket.destroy();
    }

    function send(tunnel) {
      const req = https.request({
        host: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: method,
        headers: Object.assign({
          Accept: 'application/json',
          // iTunes answers 403 to a request with no user agent often enough
          // that it is worth being somebody.
          'User-Agent': 'home-church-setlist/1 (+https://github.com/pgrooves/home-church)'
        }, body ? { 'Content-Length': Buffer.byteLength(body) } : {}, opts.headers || {}),
        // A tunnelled request brings its own already connected socket. A
        // direct one lets Node do the connecting.
        createConnection: tunnel
          ? () => {
              const secure = tls.connect({ socket: tunnel, servername: url.hostname });
              // Same reason as the raw socket above: a reset during the TLS
              // teardown must not become an uncaught error event.
              secure.on('error', () => {});
              return secure;
            }
          : undefined,
        agent: tunnel ? false : undefined
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, body: body }); });
      });
      req.on('error', (err) => { cleanup(); reject(blocked(urlStr, err.message)); });
      if (body) req.write(body);
      req.end();
    }

    if (!proxy) return send(null);

    const connect = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: url.hostname + ':' + (url.port || 443),
      headers: Object.assign({ Host: url.hostname + ':' + (url.port || 443) },
        proxy.username
          ? { 'Proxy-Authorization': 'Basic ' + Buffer.from(
              decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password || '')
            ).toString('base64') }
          : {})
    });

    connect.on('connect', (res, sock) => {
      socket = sock;
      /* A tunnel socket that is torn down mid request emits 'error', and an
         'error' with no listener on it is not an exception somewhere, it is
         the whole process going down. Which is what a policy denial looks
         like: the gateway answers 403 and resets the connection a moment
         later, so the run would report the refusal correctly and then crash
         on the way out, burying it. Attached the moment the socket exists,
         before anything can go wrong with it. */
      sock.on('error', () => { /* reported by whichever request owns it */ });
      if (res.statusCode !== 200) {
        cleanup();
        // The proxy refusing the tunnel outright, which is a policy denial and
        // never the catalogue's doing.
        return reject(blocked(urlStr, 'the proxy refused CONNECT with ' + res.statusCode));
      }
      send(sock);
    });
    connect.on('error', (err) => { cleanup(); reject(blocked(urlStr, err.message)); });
    connect.end();
  });
}

/* The seam the tests reach through. getJson goes via this rather than calling
   httpGet directly, so a test can answer for the two services without a
   network and without the transport itself having a test-only branch in it.
   Swapped in tests/resolve-songs.test.js and nowhere else. */
const transport = { request: httpRequest };

/* One request, with the failures that actually happen told apart.

   `opts.authed` rather than sniffing for headers: whether we sent credentials
   is what decides who a 401 belongs to, and only the caller knows. */
async function getJson(url, opts) {
  opts = opts || {};
  let attempt = 0;
  for (;;) {
    attempt++;
    const res = await transport.request(url, { headers: opts.headers });
    const host = new URL(url).host;

    // Rate limited. The answer is to wait, not to give up on the song.
    if (res.status === 429 && attempt <= 4) {
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 404) return null;

    /* A refusal on a request that carried no credentials is not this song's
       fault and not this catalogue's. Nothing we sent could be unauthorised,
       so somebody in the middle said no, which is what an egress proxy does,
       and 407 is one saying so in as many words.

       This branch is not hypothetical. It is what the proxy in a web session
       actually answers, and before it existed that answer arrived as
       "itunes.apple.com answered 403", which reads like Apple turned us away
       and reads nothing like "run this somewhere else". */
    if (!opts.authed && (res.status === 401 || res.status === 403 || res.status === 407)) {
      /* Except when the service says in as many words that it is the one
         refusing. Odesli retired its free public API and answers exactly
         this, and calling that a blocked proxy would send somebody to a
         different machine to watch it fail again. */
      if (/API_ACCESS_DEPRECATED|API_KEY|UNAUTHORIZED/i.test(res.body || '')) {
        throw new Error(host + ' refused the request: ' + (res.body || '').slice(0, 200));
      }
      throw blocked(url, 'the gateway answered ' + res.status);
    }

    // A refusal on a request that did carry a key is the key's fault.
    if (opts.authed && (res.status === 401 || res.status === 403)) {
      throw new Error(host + ' refused the credentials (' + res.status + '). ' +
        (opts.credentialHint || 'Check the matching entry in .env.'));
    }

    if (res.status >= 400) {
      if (attempt <= 2 && res.status >= 500) { await sleep(1000 * attempt); continue; }
      throw new Error(host + ' answered ' + res.status);
    }

    try {
      return JSON.parse(res.body);
    } catch (err) {
      /* A body that is not JSON from a service that only speaks JSON is a
         gateway's error page wearing a 200, which some proxies do. */
      throw blocked(url, 'answered with something that is not JSON');
    }
  }
}

/* ------------------------------------------------------------ the services

   ONE SERVICE PER PLATFORM, and that is a change forced by reality rather
   than a preference. This started as iTunes for the art and Odesli for every
   other platform in a single call, which was the whole reason the design was
   tidy. Odesli then retired public access to that endpoint: it answers 401
   with PUBLIC_API_ACCESS_DEPRECATED to anybody without a key, so the tidy
   version now resolves nothing at all for a church that has not signed up.

   So each platform is asked for itself, and each one is optional:

     iTunes      the art, the canonical title and artist, the Apple link.
                 No key, no account, and the backbone of every row.
     Spotify     needs a free client id and secret in .env.
     YouTube     needs a free API key in .env.
     Odesli      still works with ODESLI_API_KEY, and when there is one it
                 fills in everything the two above do not.
     Genius      the lyrics, with a token.

   A platform with no credentials is absent from the row rather than guessed
   at, and the summary says which ones were skipped, so "we have no Spotify
   links" and "Spotify is not set up" never look the same. */

async function searchItunes(want) {
  const term = [want.title, want.artist].filter(Boolean).join(' ');
  const url = ITUNES + '?' + new URLSearchParams({
    term: term, entity: 'song', limit: '25', country: 'US'
  });
  const body = await getJson(url);
  return (body && Array.isArray(body.results)) ? body.results : [];
}

/* Odesli, for whoever has a key. Everything in one call, which is what this
   was always for, and skipped entirely without one rather than failing. */
async function odesliFor(appleUrl, key) {
  if (!key) return null;
  const url = ODESLI + '?' + new URLSearchParams({
    url: appleUrl, userCountry: 'US', key: key
  });
  return getJson(url, { authed: true, credentialHint: 'Check ODESLI_API_KEY in .env.' });
}

/* Spotify's client credentials flow: an id and a secret become a token that
   lasts an hour, which is long enough for any setlist. Fetched once and kept
   for the run rather than once per song. */
let spotifyToken = null;
async function spotifyAuth(id, secret) {
  if (spotifyToken) return spotifyToken;
  const res = await transport.request(SPOTIFY_TOKEN, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64')
    }
  });
  if (res.status === 400 || res.status === 401) {
    throw new Error('Spotify refused the credentials (' + res.status + '). ' +
      'Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.');
  }
  if (res.status >= 400) throw new Error('Spotify answered ' + res.status + ' for a token.');
  spotifyToken = JSON.parse(res.body).access_token;
  return spotifyToken;
}

async function spotifyFor(song, env) {
  const id = env.SPOTIFY_CLIENT_ID, secret = env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return '';
  const token = await spotifyAuth(id, secret);
  const q = 'track:"' + song.title.replace(/"/g, '') + '" artist:"' + song.artist.replace(/"/g, '') + '"';
  const url = SPOTIFY_SEARCH + '?' + new URLSearchParams({ q: q, type: 'track', limit: '5', market: 'US' });
  const body = await getJson(url, {
    headers: { Authorization: 'Bearer ' + token }, authed: true,
    credentialHint: 'Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.'
  });
  const items = (body && body.tracks && body.tracks.items) || [];
  // Checked against the song iTunes matched, not the line that was typed, so
  // a same titled song by somebody else cannot slip in on this leg.
  for (const t of items) {
    if (!t || !t.external_urls || !t.external_urls.spotify) continue;
    const artists = (t.artists || []).map(a => a.name).join(' ');
    if (baseTitle(t.name) === baseTitle(song.title) && overlap(song.artist, artists) >= 0.5) {
      return t.external_urls.spotify;
    }
  }
  return '';
}

async function youtubeFor(song, env) {
  const key = env.YOUTUBE_API_KEY;
  if (!key) return '';
  const url = YOUTUBE_SEARCH + '?' + new URLSearchParams({
    part: 'snippet', q: song.title + ' ' + song.artist, type: 'video',
    maxResults: '5', key: key
  });
  const body = await getJson(url, { authed: true, credentialHint: 'Check YOUTUBE_API_KEY in .env.' });
  const items = (body && body.items) || [];
  for (const it of items) {
    const id = it && it.id && it.id.videoId;
    const sn = (it && it.snippet) || {};
    if (!id) continue;
    // The channel is the artist, or the title names them. Anything looser and
    // this becomes a link to whoever covered it in their bedroom.
    const byArtist = overlap(song.artist, sn.channelTitle || '') >= 0.5 ||
                     overlap(song.artist, sn.title || '') >= 0.5;
    if (baseTitle(sn.title || '').includes(baseTitle(song.title)) && byArtist) {
      return 'https://www.youtube.com/watch?v=' + id;
    }
  }
  return '';
}

/* Genius, only when there is a token for it. Checked against the song that
   was actually matched rather than against the line that was typed, so a
   lyrics page for a different artist's song of the same name is refused. */
async function lyricsFor(song, token) {
  if (!token) return '';
  const url = GENIUS + '?' + new URLSearchParams({ q: song.title + ' ' + song.artist });
  const body = await getJson(url, {
    headers: { Authorization: 'Bearer ' + token }, authed: true,
    credentialHint: 'Check GENIUS_TOKEN in .env, or unset it to publish without lyrics.'
  });
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

async function resolveSong(want, opts) {
  const note = { title: want.title, artist: want.artist, alternates: want.alternates || [] };

  const known = findKnown(want, opts.known);
  if (known && known.artUrl && known.links && Object.keys(known.links).length) {
    note.source = 'a previous Sunday';
    note.confidence = 'high';
    return { song: Object.assign({}, known), note: note };
  }

  const song = {
    title: want.title,
    artist: want.artist,
    artUrl: '',
    lyricsUrl: '',
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

  note.source = 'iTunes';
  note.matched = best.match.trackName + ' / ' + best.match.artistName;
  note.confidence = best.confidence;
  note.score = Math.round(best.score * 10) / 10;
  if (best.runnerUp) note.runnerUp = best.runnerUp.trackName + ' / ' + best.runnerUp.artistName;

  const env = opts.env || {};
  const appleUrl = best.match.trackViewUrl;
  if (appleUrl) song.links.apple = appleUrl;

  /* Odesli first when there is a key, because one call answers for every
     platform at once and the two below are then only filling gaps. Without a
     key it is skipped rather than attempted: its public endpoint is retired
     and calling it would spend a request to be told so. */
  if (appleUrl && env.ODESLI_API_KEY) {
    const odesli = await odesliFor(appleUrl, env.ODESLI_API_KEY);
    if (odesli) Object.assign(song.links, linksFromOdesli(odesli));
  }

  /* Then each platform for itself, and only for what is still missing, so a
     key that answered for everything is not asked again. Each one is its own
     failure: Spotify being misconfigured must not cost the song its YouTube
     link, and neither must cost it the art that is already in hand. */
  const skipped = [];

  if (!song.links.spotify) {
    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) skipped.push('Spotify');
    else {
      try { song.links.spotify = await spotifyFor(song, env) || undefined; }
      catch (err) { note.spotifyError = err.message; }
    }
  }

  if (!song.links.youtube) {
    if (!env.YOUTUBE_API_KEY) skipped.push('YouTube');
    else {
      try { song.links.youtube = await youtubeFor(song, env) || undefined; }
      catch (err) { note.youtubeError = err.message; }
    }
  }

  if (!env.GENIUS_TOKEN) skipped.push('lyrics');
  else {
    try { song.lyricsUrl = await lyricsFor(song, env.GENIUS_TOKEN); }
    catch (err) { note.lyricsError = err.message; }
  }

  // undefined is not a link, and a key set to it would survive JSON.stringify
  // as a missing key on some paths and an explicit null on others.
  Object.keys(song.links).forEach(k => { if (!song.links[k]) delete song.links[k]; });

  /* "Not set up" and "looked and found nothing" are different facts about a
     row and the summary has to be able to tell them apart, or a church with
     no Spotify credentials spends a month believing their songs are not on
     Spotify. */
  if (skipped.length) note.skipped = skipped;

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
    if (n.alternates && n.alternates.length > 1) {
      lines.push('   ! the line named two artists: ' + n.alternates.join(' / ') +
                 '. Used the first. Ask before writing.');
    }
    /* Not the same fact as a missing link, and the difference matters: one is
       "this song is not on Spotify", the other is "nobody has put the Spotify
       credentials in .env yet", and a church told the first when the second
       is true will go looking for the wrong problem for a month. */
    if (n.skipped && n.skipped.length) {
      lines.push('   - not set up, so not looked for: ' + n.skipped.join(', '));
    }
    ['spotifyError', 'youtubeError', 'lyricsError'].forEach(k => {
      if (n[k]) lines.push('   ! ' + n[k]);
    });
    lines.push('');
  });

  /* Said once at the end rather than under every song, because a church with
     no keys would otherwise read the same two lines four times and stop
     seeing them. */
  const missing = new Set();
  notes.forEach(n => (n.skipped || []).forEach(x => missing.add(x)));
  if (missing.size) {
    lines.push('Not configured: ' + [...missing].join(', ') + '.');
    lines.push('See .env.example. Album art and Apple Music need no keys and are');
    lines.push('already in; the rest are free to set up and fill in from the next run.');
    lines.push('');
  }

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

  /* .env first, then the real environment, so a machine that exports these
     works and a repo checkout with a .env works, and neither has to know
     about the other. */
  const fileEnv = readEnv();
  const env = {};
  for (const k of ['ODESLI_API_KEY', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET',
                   'YOUTUBE_API_KEY', 'GENIUS_TOKEN']) {
    env[k] = fileEnv[k] || process.env[k] || '';
  }

  const songs = [];
  const notes = [];
  for (let i = 0; i < wants.length; i++) {
    if (i > 0 && args.sleep) await sleep(args.sleep);
    const { song, note } = await resolveSong(wants[i], { known: known, env: env });
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
  bigArt, linksFromOdesli, findKnown, buildRow, summarize,
  /* The transport, so a test can answer for the services without a network.
     Replace `transport.request`; see the note above its definition. */
  transport,
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
