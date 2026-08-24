#!/usr/bin/env node
/*
 * Home Church, build the Practices data files.
 *
 * WHAT THIS IS. A one time pipeline, run by a person on a laptop, that merges
 * two sources into nine static JSON files under data/practices/. The app reads
 * those files and nothing else. It does not scrape practicingtheway.org and it
 * does not call the YouTube API, ever, on anybody's phone. That is the whole
 * point of the split: the network work happens once, here, where a human can
 * look at the result before it ships.
 *
 * THE TWO SOURCES
 *   1. practicingtheway.org/<practice>, for the written content: the intro,
 *      and the session by session teaching text with its "Practice:" line.
 *   2. A YouTube playlist per practice, for the videos: title, id, thumbnail,
 *      duration, in playlist order.
 *
 * THE PART THAT NEEDS A HUMAN. The playlists are not guaranteed to line up
 * with the site's sessions. One of them has thirteen videos against four
 * written sessions. So this does not quietly pair them up and write the file.
 * It proposes a mapping, prints it, and makes you look:
 *
 *   node scripts/build_practices.js --report            propose, print, write nothing
 *   node scripts/build_practices.js --write             propose, print, and write
 *   node scripts/build_practices.js --report sabbath    one practice
 *   node scripts/build_practices.js --stub              placeholders, no network
 *
 * --report is the default. You have to ask for --write on purpose, because a
 * guessed pairing baked into a data file is invisible from then on: it does
 * not fail, it just shows the wrong video under the wrong session forever.
 *
 * CREDENTIALS AND NETWORK
 *   YOUTUBE_API_KEY   a YouTube Data API v3 key. Without one this falls back
 *                     to yt-dlp if it is on PATH, which needs no key.
 *
 * If the site page is rendered by JavaScript, or the network you are on cannot
 * reach it, save the page from a browser and hand it over instead:
 *
 *   node scripts/build_practices.js --report sabbath --html ~/Downloads/sabbath.html
 *
 * The same is true of the playlist. If the machine that can reach YouTube is
 * not the machine that builds the app, dump the playlist there and bring it:
 *
 *   yt-dlp --flat-playlist -J "https://www.youtube.com/playlist?list=PL..." > sabbath.pl.json
 *   node scripts/build_practices.js --write sabbath --playlist-json sabbath.pl.json
 *
 * A WARNING ABOUT THE SITE PARSER. The extractor below is heuristic. It looks
 * for session headings and "Practice:" lines in the page text rather than
 * reaching for CSS selectors, because a selector written against a marketing
 * site is a thing that breaks silently the next time somebody redesigns it.
 * Heuristics are not better, they are just louder about failing: anything it
 * is unsure of comes out in the flags list rather than in the data. Read the
 * flags. They are the reason this script prints a report at all.
 *
 * No dependencies. Node's standard library only, same promise as every other
 * script in this repo.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const OUT_DIR = path.join(ROOT, 'data', 'practices');

/* The nine, in the order the grid draws them: three rows of three. The order
   is not alphabetical and is not arbitrary. It runs from the practices a
   person does alone and first, through the ones done with other people, out
   to the one done with everybody else, which is roughly the order Practicing
   the Way teaches them in.

   `icon` names an entry in PATHS in js/components.js. Nothing checks that at
   build time on purpose: this file should not need to know how to parse
   JavaScript. js/practices.js falls back to a plain dot if the name is wrong,
   and the grid still works. */
const PRACTICES = [
  { slug: 'sabbath',    title: 'Sabbath',    icon: 'practiceSabbath',    playlistId: 'PL6zls_4DoKIxWQnGB_MA639KE4GZzrKK6' },
  { slug: 'prayer',     title: 'Prayer',     icon: 'practicePrayer',     playlistId: 'PL6zls_4DoKIx8AMvLlTyYFcq0HVQ7PcBv' },
  { slug: 'fasting',    title: 'Fasting',    icon: 'practiceFasting',    playlistId: 'PL6zls_4DoKIwEPaswOvpZUVK45P9bWHhn' },
  { slug: 'solitude',   title: 'Solitude',   icon: 'practiceSolitude',   playlistId: 'PL6zls_4DoKIwmEAighMzCWI5YdzYC1ryk' },
  { slug: 'scripture',  title: 'Scripture',  icon: 'practiceScripture',  playlistId: 'PL6zls_4DoKIy5VUZrhMOCu62vWKa_-2RL' },
  { slug: 'community',  title: 'Community',  icon: 'practiceCommunity',  playlistId: 'PL6zls_4DoKIxayL6ukxEs-GBjN0JUCoB3' },
  { slug: 'generosity', title: 'Generosity', icon: 'practiceGenerosity', playlistId: 'PL6zls_4DoKIykoOl71P4PIMfuUes_K1pq' },
  { slug: 'service',    title: 'Service',    icon: 'practiceService',    playlistId: 'PL6zls_4DoKIyLOoVi26-SS5eTNmX2e31g' },
  { slug: 'witness',    title: 'Witness',    icon: 'practiceWitness',    playlistId: 'PL6zls_4DoKIx3qL8Fqbg5m1lNPczkPNky' }
];

const SITE = 'https://practicingtheway.org/';

/* ------------------------------------------------------------------ fetch */

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: Object.assign({
      // A plain Node user agent gets a different page from some sites than a
      // browser does, and the difference is usually the content.
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9'
    }, headers || {}) }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), headers));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        resolve(body);
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error(`timeout for ${url}`)));
  });
}

/* --------------------------------------------------------------- youtube */

/* ISO 8601 durations, PT1H2M3S, into the 1:02:03 a person reads. Kept as a
   string rather than seconds because the only thing the app does with it is
   print it, and a number would mean writing this same function again in the
   phone's JavaScript. `seconds` goes in the file too, for anything that ever
   needs to sort or total. */
function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return { label: '', seconds: 0 };
  const [, d, h, mn, s] = m.map((x) => (x ? parseInt(x, 10) : 0));
  const total = d * 86400 + h * 3600 + mn * 60 + s;
  const pad = (n) => String(n).padStart(2, '0');
  const label = h || d
    ? `${d * 24 + h}:${pad(mn)}:${pad(s)}`
    : `${mn}:${pad(s)}`;
  return { label, seconds: total };
}

async function playlistViaApi(playlistId, key) {
  const items = [];
  let pageToken = '';
  do {
    const url = 'https://youtube.googleapis.com/youtube/v3/playlistItems' +
      '?part=snippet,contentDetails&maxResults=50' +
      `&playlistId=${encodeURIComponent(playlistId)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '') +
      `&key=${encodeURIComponent(key)}`;
    const page = JSON.parse(await get(url));
    if (page.error) throw new Error(page.error.message);
    items.push(...page.items);
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  /* Durations are not on a playlist item, they are on the video, so that is a
     second call. Fifty ids at a time, which is the API's limit. */
  const ids = items.map((i) => i.contentDetails.videoId);
  const durations = {};
  for (let i = 0; i < ids.length; i += 50) {
    const url = 'https://youtube.googleapis.com/youtube/v3/videos' +
      '?part=contentDetails,status' +
      `&id=${ids.slice(i, i + 50).join(',')}` +
      `&key=${encodeURIComponent(key)}`;
    const page = JSON.parse(await get(url));
    if (page.error) throw new Error(page.error.message);
    for (const v of page.items) {
      durations[v.id] = {
        duration: parseDuration(v.contentDetails.duration),
        embeddable: v.status ? v.status.embeddable !== false : true
      };
    }
  }

  return items.map((item, index) => {
    const s = item.snippet;
    const id = item.contentDetails.videoId;
    const extra = durations[id] || {};
    const thumbs = s.thumbnails || {};
    const best = thumbs.maxres || thumbs.standard || thumbs.high ||
                 thumbs.medium || thumbs.default || {};
    return {
      position: index + 1,
      videoId: id,
      title: s.title || '',
      thumbnail: best.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      duration: (extra.duration || {}).label || '',
      seconds: (extra.duration || {}).seconds || 0,
      embeddable: extra.embeddable !== false,
      // A private or deleted video keeps its slot in a playlist and the
      // snippet says so rather than going missing, which is worth carrying
      // through to the report instead of shipping a dead embed.
      unavailable: /^(Private|Deleted) video$/i.test(s.title || '')
    };
  });
}

function playlistViaYtDlp(playlistId) {
  const raw = execFileSync('yt-dlp', [
    '--flat-playlist', '-J', '--no-warnings',
    `https://www.youtube.com/playlist?list=${playlistId}`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const data = JSON.parse(raw);
  return (data.entries || []).map((e, index) => {
    const seconds = Math.round(e.duration || 0);
    const pad = (n) => String(n).padStart(2, '0');
    const label = seconds
      ? (seconds >= 3600
          ? `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
          : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`)
      : '';
    return {
      position: index + 1,
      videoId: e.id,
      title: e.title || '',
      thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
      duration: label,
      seconds,
      embeddable: true,
      unavailable: /^(Private|Deleted) video$/i.test(e.title || '')
    };
  });
}

/* A playlist read off the disk instead of the network, for the case this repo
   keeps running into: the machine that can reach YouTube and the machine that
   builds the app are not always the same machine. Takes whichever of the three
   shapes you happen to have.

     yt-dlp --flat-playlist -J "https://www.youtube.com/playlist?list=..." > sabbath.json
     curl ".../playlistItems?part=snippet,contentDetails&..." > sabbath.json

   The API's playlistItems response carries no durations, because durations live
   on the video rather than on the playlist entry. That is not worth failing
   over, so the videos come through without one and the omission is flagged
   rather than filled in with a plausible number. */
function playlistFromFile(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (Array.isArray(data)) {
    return { source: 'file:' + path.basename(file), videos: data };
  }

  if (Array.isArray(data.entries)) {
    const pad = (n) => String(n).padStart(2, '0');
    return {
      source: 'file:yt-dlp:' + path.basename(file),
      videos: data.entries.map((e, index) => {
        const seconds = Math.round(e.duration || 0);
        return {
          position: index + 1,
          videoId: e.id,
          title: e.title || '',
          thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
          duration: seconds
            ? (seconds >= 3600
                ? `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
                : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`)
            : '',
          seconds,
          embeddable: true,
          unavailable: /^(Private|Deleted) video$/i.test(e.title || '')
        };
      })
    };
  }

  if (Array.isArray(data.items)) {
    return {
      source: 'file:youtube-api:' + path.basename(file),
      videos: data.items.map((item, index) => {
        const sn = item.snippet || {};
        const id = (item.contentDetails && item.contentDetails.videoId) ||
                   (sn.resourceId && sn.resourceId.videoId);
        const t = sn.thumbnails || {};
        const best = t.maxres || t.standard || t.high || t.medium || t.default || {};
        return {
          position: index + 1,
          videoId: id,
          title: sn.title || '',
          thumbnail: best.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          duration: '',
          seconds: 0,
          embeddable: true,
          unavailable: /^(Private|Deleted) video$/i.test(sn.title || '')
        };
      })
    };
  }

  throw new Error(`${file} is not a playlist dump this understands. Expected an array, ` +
                  'or an object with `entries` (yt-dlp) or `items` (YouTube Data API).');
}

async function fetchPlaylist(playlistId, file) {
  if (file) return playlistFromFile(file);
  const key = process.env.YOUTUBE_API_KEY;
  if (key) return { source: 'youtube-data-api-v3', videos: await playlistViaApi(playlistId, key) };
  try {
    return { source: 'yt-dlp', videos: playlistViaYtDlp(playlistId) };
  } catch (err) {
    throw new Error(
      'No YOUTUBE_API_KEY set and yt-dlp did not work (' + err.message.split('\n')[0] + '). ' +
      'Set a YouTube Data API v3 key, or install yt-dlp.'
    );
  }
}

/* ------------------------------------------------------------------ site */

/* Turn a page into paragraphs of text, which is all this needs. No DOM, no
   dependency: strip the things that are not prose, put a newline where a
   block element ended, unescape the handful of entities that actually show up
   in body copy, and collapse the whitespace that is left. */
function pageToBlocks(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  /* Flatten every run of whitespace BEFORE marking the block boundaries, so
     that the only newlines left in the string are the ones this function put
     there. Without this, a paragraph the page's author happened to wrap over
     three source lines comes out as three paragraphs, which then reads as
     three teaching blocks in the app and, worse, splits a "Practice:" line
     away from the sentence it starts. */
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|blockquote|td|tr)>/gi, '\n');
  // Opening tags break too, for the pages that never close theirs.
  s = s.replace(/<(p|div|section|article|li|h[1-6]|blockquote)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ')
       .replace(/&amp;/gi, '&')
       .replace(/&quot;/gi, '"')
       /* &#x27; is the same apostrophe as &#39;, and Webflow writes both. They
          are folded to the curly one together rather than separately, because
          a page that arrives half straight and half curly reads as a typo in
          a serif column. */
       .replace(/&#0?39;|&#x27;|&apos;|&rsquo;/gi, '’')
       .replace(/&lsquo;/gi, '‘')
       .replace(/&ldquo;/gi, '“')
       .replace(/&rdquo;/gi, '”')
       .replace(/&mdash;/gi, '—')
       .replace(/&ndash;/gi, '–')
       .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
       // Hex character references. Webflow writes apostrophes as &#x27;, and
       // without this line every contraction on the page arrives as literal
       // "&#x27;" in the middle of a sentence.
       .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  return s.split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/* Things that are on the page and should not be in the app. A book preorder
   is the obvious one, but the whole family is the same shape: it is marketing
   for something with a date on it, and a date on it means it will be wrong in
   the app long before anybody notices. These are flagged, not silently
   dropped, so a person decides. */
const PROMO = [
  /pre-?order/i, /order (the|your) (book|copy)/i, /buy now/i, /add to cart/i,
  /\bshop\b/i, /newsletter/i, /sign up (for|to)/i, /subscribe/i,
  /coming soon/i, /available (now|in) /i, /\$\d/, /free download/i,
  /donate/i, /give (now|today)/i, /\bcohort\b/i, /early access/i
];

const SESSION_RE = /^(?:session|week|part)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[:.\s–—-]*(.*)$/i;
const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10
};

function toNumber(token) {
  const n = parseInt(token, 10);
  if (!isNaN(n)) return n;
  return WORD_NUM[String(token).toLowerCase()] || null;
}

/* Pull the intro and the sessions out of the page's text blocks.

   The shape it looks for is the shape the site uses: a run of prose, then a
   heading that names a session, then that session's prose, then somewhere in
   it a line that starts "Practice:". Everything before the first session
   heading is the intro. */
function parseSite(html, practice) {
  const blocks = pageToBlocks(html);
  const flags = [];

  const promo = blocks.filter((b) => b.length > 12 && PROMO.some((re) => re.test(b)));
  if (promo.length) {
    flags.push({
      kind: 'promotional-content',
      detail: 'Lines on the page that read as promotion or seasonal marketing. ' +
              'They are NOT in the data below. Check none of them is real teaching text.',
      lines: promo.slice(0, 12)
    });
  }

  const isPromo = (b) => PROMO.some((re) => re.test(b));
  const clean = blocks.filter((b) => !isPromo(b));

  // Where each session starts.
  const marks = [];
  clean.forEach((line, i) => {
    const m = SESSION_RE.exec(line);
    if (!m) return;
    const number = toNumber(m[1]);
    if (!number) return;
    // A sentence that merely mentions "session 2" is not a heading. A heading
    // is short.
    if (line.length > 90) return;
    marks.push({ index: i, number, title: (m[2] || '').trim() });
  });

  const intro = [];
  const end = marks.length ? marks[0].index : clean.length;
  for (let i = 0; i < end; i++) {
    const b = clean[i];
    // Nav crumbs, one word buttons, and the page's own title are not intro.
    if (b.length < 40) continue;
    if (b.toLowerCase() === practice.title.toLowerCase()) continue;
    intro.push(b);
  }

  const sessions = marks.map((mark, i) => {
    const from = mark.index + 1;
    const to = i + 1 < marks.length ? marks[i + 1].index : clean.length;
    const body = clean.slice(from, to);

    let practiceLine = '';
    const teaching = [];
    for (const b of body) {
      const p = /^practice\s*[:–—-]\s*(.+)$/i.exec(b);
      if (p) { practiceLine = p[1].trim(); continue; }
      if (b.length < 25) continue;
      teaching.push(b);
    }

    return {
      number: mark.number,
      title: mark.title || `Session ${mark.number}`,
      teaching,
      practice: practiceLine
    };
  });

  if (!intro.length) {
    flags.push({
      kind: 'missing-intro',
      detail: 'No intro prose was found before the first session heading. The page may be ' +
              'rendered by JavaScript, in which case save it from a browser and re-run with --html.'
    });
  }
  if (!sessions.length) {
    flags.push({
      kind: 'no-sessions-found',
      detail: 'No "Session N" headings were found in the page text. Same likely cause as above. ' +
              'Nothing was written for this practice beyond the video list.'
    });
  }
  sessions.forEach((s) => {
    if (!s.practice) {
      flags.push({
        kind: 'missing-practice-line',
        detail: `Session ${s.number} has no "Practice:" action line.`
      });
    }
    if (!s.teaching.length) {
      flags.push({
        kind: 'missing-teaching-text',
        detail: `Session ${s.number} has no teaching paragraphs.`
      });
    }
  });

  return { intro, sessions, flags };
}

/* --------------------------------------------------------------- mapping */

const EXTRA_RE = /\b(trailer|promo|teaser|q\s*&\s*a|q and a|bonus|behind the scenes|intro(?:duction)?|welcome|announcement|testimon|interview|live|recap|leader'?s? (?:guide|training)|how to use)\b/i;

/* Does this video's own title say which session it is? A playlist that labels
   its videos is the only case where a mapping can be asserted rather than
   assumed, so it is checked first and it is the only kind of match this
   script will call "certain". */
function sessionFromTitle(title) {
  const m = /\b(?:session|week|part|ep(?:isode)?)\s*#?\s*(\d{1,2})\b/i.exec(title) ||
            /^\s*(\d{1,2})\s*[.–—-]\s+/.exec(title);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 20 ? n : null;
}

/* Propose which video belongs to which written session, and say how sure it
   is. Three outcomes and they are deliberately distinguishable in the report:

   `labelled`  the video's title names its session. Trustworthy.
   `positional` the counts matched and nothing said otherwise, so they were
                zipped in order. Plausible, and the thing most likely to be
                quietly wrong.
   `unmapped`  no honest pairing. The video goes in the extras list and the
               session goes without one, which is a visible hole rather than
               an invisible mistake. */
function proposeMapping(videos, sessions) {
  const flags = [];
  const live = videos.filter((v) => !v.unavailable);

  const dead = videos.filter((v) => v.unavailable);
  if (dead.length) {
    flags.push({
      kind: 'unavailable-videos',
      detail: `${dead.length} video(s) in the playlist are private or deleted and were left out.`,
      lines: dead.map((v) => `#${v.position} ${v.title}`)
    });
  }
  const noDuration = live.filter((v) => !v.duration);
  if (noDuration.length && noDuration.length === live.length) {
    flags.push({
      kind: 'no-durations',
      detail: 'None of these videos came with a duration. A playlistItems response does not ' +
              'carry one; a videos call does. The pages will simply not print a running time.'
    });
  }

  const blocked = live.filter((v) => v.embeddable === false);
  if (blocked.length) {
    flags.push({
      kind: 'embedding-disabled',
      detail: 'The owner has turned off embedding for these. They cannot play inside the app, ' +
              'and this app does not open YouTube, so they will be shown as unavailable.',
      lines: blocked.map((v) => `#${v.position} ${v.title}`)
    });
  }

  const labelled = new Map();
  const extras = [];
  const unlabelled = [];

  for (const v of live) {
    const n = sessionFromTitle(v.title);
    if (n != null && !labelled.has(n)) { labelled.set(n, v); continue; }
    if (n != null) {
      flags.push({
        kind: 'duplicate-session-label',
        detail: `More than one video claims session ${n}. "${v.title}" was put in extras.`
      });
      extras.push(v);
      continue;
    }
    if (EXTRA_RE.test(v.title)) { extras.push(v); continue; }
    unlabelled.push(v);
  }

  const mapped = sessions.map((s) => {
    if (labelled.has(s.number)) {
      return { session: s.number, video: labelled.get(s.number), confidence: 'labelled' };
    }
    return { session: s.number, video: null, confidence: 'unmapped' };
  });

  const needing = mapped.filter((m) => !m.video);
  if (needing.length && unlabelled.length) {
    if (needing.length === unlabelled.length) {
      needing.forEach((m, i) => {
        m.video = unlabelled[i];
        m.confidence = 'positional';
      });
      unlabelled.length = 0;
      flags.push({
        kind: 'positional-mapping',
        detail: `${needing.length} video(s) carry no session number in their title and were paired ` +
                'with the remaining sessions in playlist order, because the counts matched. ' +
                'This is a guess. Check it.'
      });
    } else {
      flags.push({
        kind: 'count-mismatch',
        detail: `${unlabelled.length} unlabelled video(s) against ${needing.length} session(s) still ` +
                'needing one. The counts do not match, so nothing was paired by position. ' +
                'These sessions will have no video and the videos are in extras.'
      });
    }
  }

  extras.push(...unlabelled);
  extras.sort((a, b) => a.position - b.position);

  if (live.length !== sessions.length) {
    flags.push({
      kind: 'shape-mismatch',
      detail: `${live.length} playable video(s) against ${sessions.length} written session(s). ` +
              (extras.length ? `${extras.length} did not map to a session.` : '')
    });
  }

  return { mapped, extras, flags };
}

/* ---------------------------------------------------------------- report */

function printReport(practice, site, playlist, mapping) {
  const line = (s) => console.log(s);
  line('');
  line('='.repeat(72));
  line(`  ${practice.title.toUpperCase()}   ${SITE}${practice.slug}`);
  line(`  playlist ${practice.playlistId}   via ${playlist.source}`);
  line('='.repeat(72));

  line('');
  line(`  SITE: ${site.intro.length} intro paragraph(s), ${site.sessions.length} session(s)`);
  site.sessions.forEach((s) => {
    line(`    ${String(s.number).padStart(2)}. ${s.title}`);
    line(`        ${s.teaching.length} paragraph(s)` +
         (s.practice ? `, practice line present` : `, NO PRACTICE LINE`));
  });

  line('');
  line(`  PLAYLIST: ${playlist.videos.length} video(s)`);
  playlist.videos.forEach((v) => {
    line(`    #${String(v.position).padStart(2)} [${v.videoId}] ${v.duration.padStart(7)}  ${v.title}`);
  });

  line('');
  line('  PROPOSED MAPPING');
  mapping.mapped.forEach((m) => {
    const tag = m.confidence === 'labelled' ? 'certain '
              : m.confidence === 'positional' ? 'GUESSED '
              : 'NONE    ';
    line(`    session ${String(m.session).padStart(2)}  ${tag}  ` +
         (m.video ? `#${m.video.position} ${m.video.title}` : '(no video)'));
  });
  if (mapping.extras.length) {
    line(`    extras (${mapping.extras.length}), kept in the file but shown after the sessions:`);
    mapping.extras.forEach((v) => line(`        #${v.position} ${v.title}`));
  }

  const flags = site.flags.concat(mapping.flags);
  line('');
  if (!flags.length) {
    line('  FLAGS: none');
  } else {
    line(`  FLAGS (${flags.length})`);
    flags.forEach((f) => {
      line(`    [${f.kind}] ${f.detail}`);
      (f.lines || []).forEach((l) => line(`        - ${l}`));
    });
  }
  return flags;
}

/* ----------------------------------------------------------------- write */

function toFile(practice, site, playlist, mapping, flags) {
  const bySession = new Map(mapping.mapped.map((m) => [m.session, m]));
  return {
    /* Bumped when the shape below changes in a way js/practices.js has to
       know about. The app checks it and refuses to guess at a file it does
       not understand, which is better than half rendering one. */
    schema: 1,
    slug: practice.slug,
    title: practice.title,
    icon: practice.icon,
    source: {
      site: SITE + practice.slug,
      playlistId: practice.playlistId,
      playlistVia: playlist.source,
      generatedAt: new Date().toISOString()
    },
    subtitle: site.subtitle || '',
    hero: site.hero || null,
    playlist: site.playlist || null,
    intro: site.intro,
    /* The closing material: companion guide, assigned reading, podcast. Put
       in by hand, preserved across reruns. See one() above. */
    resources: site.resources || [],
    sessions: site.sessions.map((s) => {
      const m = bySession.get(s.number) || {};
      return {
        number: s.number,
        title: s.title,
        teaching: s.teaching,
        practice: s.practice,
        video: m.video ? {
          videoId: m.video.videoId,
          title: m.video.title,
          duration: m.video.duration,
          seconds: m.video.seconds,
          thumbnail: m.video.thumbnail,
          embeddable: m.video.embeddable,
          confidence: m.confidence
        } : null
      };
    }),
    /* Everything in the playlist that is not one of the four. Trailers, Q&A,
       whatever else is in there. They are kept rather than dropped, and they
       are kept apart rather than mixed in, so the page can show them under
       their own heading at the bottom instead of pretending one of them is
       session five. */
    extras: mapping.extras.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      duration: v.duration,
      seconds: v.seconds,
      thumbnail: v.thumbnail,
      embeddable: v.embeddable
    })),
    /* The report, kept with the data rather than only printed. Whoever opens
       this file in six months gets the same warnings the person who generated
       it saw. */
    flags
  };
}

/* ------------------------------------------------------------------ main */

/* Write a file that has everything except the content: the slug, the title,
   the icon, and the two source addresses, with an empty intro and no sessions.

   WHY THIS MODE EXISTS. The app needs nine files to exist before it can draw
   nine pages, and the content behind them has to be fetched by a person with a
   key on a network that can reach both sources. Those are two different days.
   A stub keeps the grid working in between and, more to the point, keeps the
   gap honest: the practice page reads the flag below and says out loud that
   the content has not been generated yet, rather than showing an empty page
   that looks like a bug or, far worse, plausible text that nobody sourced.

   Running --write over a stub replaces it. Nothing here is precious. */
function stub(practice) {
  return {
    schema: 1,
    slug: practice.slug,
    title: practice.title,
    icon: practice.icon,
    source: {
      site: SITE + practice.slug,
      playlistId: practice.playlistId,
      playlistVia: null,
      generatedAt: null
    },
    subtitle: '',
    hero: null,
    playlist: null,
    intro: [],
    resources: [],
    sessions: [],
    extras: [],
    flags: [{
      kind: 'not-yet-generated',
      detail: 'Placeholder. No content has been pulled for this practice yet. Run ' +
              `\`node scripts/build_practices.js --report ${practice.slug}\`, read the mapping, ` +
              'then re-run with --write to replace this file.'
    }]
  };
}

async function one(practice, opts) {
  let html = '';
  let siteError = null;
  if (opts.html) {
    html = fs.readFileSync(opts.html, 'utf8');
  } else {
    try {
      html = await get(SITE + practice.slug);
    } catch (err) {
      siteError = err.message;
    }
  }

  const site = html
    ? parseSite(html, practice)
    : { intro: [], sessions: [], flags: [{
        kind: 'site-unreachable',
        detail: `Could not fetch ${SITE}${practice.slug}: ${siteError}. ` +
                'No written content was generated. Re-run with --html once you can reach it.'
      }] };

  const playlist = await fetchPlaylist(practice.playlistId, opts.playlistJson);
  const mapping = proposeMapping(playlist.videos, site.sessions);
  const flags = printReport(practice, site, playlist, mapping);

  if (opts.write) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, practice.slug + '.json');

    /* Carry forward the two fields this script cannot work out on its own.
       The subtitle, the closing resources, the hero loop and the series
       player are all put in by hand from a saved page, and none of them is
       something this script can work out on its own. Re-run --write to
       refresh the videos and they would otherwise be silently deleted, which
       is a bad trade for a rerun somebody did to fix a thumbnail.
       --replace-resources overrides this when a page really has changed. */
    if (!opts.replaceResources && fs.existsSync(file)) {
      try {
        const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (prev.subtitle && !site.subtitle) site.subtitle = prev.subtitle;
        if (Array.isArray(prev.resources) && prev.resources.length) {
          site.resources = prev.resources;
        }
        // The hero loop and the series player are the same kind of thing: put
        // in by hand, invisible to this script, and expensive to lose.
        if (prev.hero) site.hero = prev.hero;
        if (prev.playlist) site.playlist = prev.playlist;
      } catch (err) {
        console.error(`  could not read the existing ${practice.slug}.json, not carrying anything over`);
      }
    }
    fs.writeFileSync(file, JSON.stringify(toFile(practice, site, playlist, mapping, flags), null, 2) + '\n');
    console.log(`\n  written  data/practices/${practice.slug}.json`);
  }
  return flags.length;
}

function writeIndex() {
  const file = path.join(OUT_DIR, 'index.json');
  fs.writeFileSync(file, JSON.stringify({
    schema: 1,
    // Grid order. See the note on PRACTICES above.
    practices: PRACTICES.map((p) => ({ slug: p.slug, title: p.title, icon: p.icon }))
  }, null, 2) + '\n');
  console.log('  written  data/practices/index.json');
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = {
    write: argv.includes('--write'),
    replaceResources: argv.includes('--replace-resources')
  };
  const htmlAt = argv.indexOf('--html');
  if (htmlAt !== -1) opts.html = argv[htmlAt + 1];
  const plAt = argv.indexOf('--playlist-json');
  if (plAt !== -1) opts.playlistJson = argv[plAt + 1];
  const only = argv.filter((a) => !a.startsWith('--') &&
                                  a !== opts.html && a !== opts.playlistJson);

  const list = only.length
    ? PRACTICES.filter((p) => only.includes(p.slug))
    : PRACTICES;

  /* --stub touches no network at all, so it is handled before anything else
     and before the checks below that only make sense for a real run. */
  if (argv.includes('--stub')) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const p of list) {
      const file = path.join(OUT_DIR, p.slug + '.json');
      fs.writeFileSync(file, JSON.stringify(stub(p), null, 2) + '\n');
      console.log(`  stubbed  data/practices/${p.slug}.json`);
    }
    writeIndex();
    console.log('\nPlaceholders only. No content was fetched.');
    return;
  }

  if (!list.length) {
    console.error('No such practice. One of: ' + PRACTICES.map((p) => p.slug).join(', '));
    process.exit(1);
  }
  if (opts.html && list.length !== 1) {
    console.error('--html takes one saved page, so name the one practice it belongs to.');
    process.exit(1);
  }
  if (opts.playlistJson && list.length !== 1) {
    console.error('--playlist-json takes one dump, so name the one practice it belongs to.');
    process.exit(1);
  }

  let flagged = 0;
  for (const p of list) {
    try {
      flagged += await one(p, opts);
    } catch (err) {
      console.error(`\n  ${p.slug}: ${err.message}`);
      flagged += 1;
    }
  }

  if (opts.write) { fs.mkdirSync(OUT_DIR, { recursive: true }); writeIndex(); }

  console.log('');
  console.log(opts.write
    ? `Done. ${flagged} flag(s) across ${list.length} practice(s). Read them before shipping.`
    : `Report only, nothing written. ${flagged} flag(s). Re-run with --write when the mapping looks right.`);
}

/* Run as a command, and also loadable as a module so tests/practices.test.js
   can drive the parser and the mapper without a network. The parts worth
   testing here are the two that guess: what counts as a session heading on a
   page nobody controls, and which video belongs to which session. */
if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = {
  PRACTICES: PRACTICES,
  pageToBlocks: pageToBlocks,
  parseSite: parseSite,
  parseDuration: parseDuration,
  sessionFromTitle: sessionFromTitle,
  proposeMapping: proposeMapping,
  toFile: toFile,
  stub: stub
};
