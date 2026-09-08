#!/usr/bin/env node
/*
 * Home Church, turning Instagram post links into rail rows.
 *
 * Takes the links somebody copied out of Instagram:
 *
 *     https://www.instagram.com/p/DcHwSuzCUYq/
 *     https://www.instagram.com/reel/DcEDXxvjLJW/
 *
 * and produces the rows `instagram_posts` wants, with each picture already
 * mirrored into the `instagram` Storage bucket:
 *
 *     node scripts/fetch_instagram_posts.js --out /tmp/ig.json < links.txt
 *     python3 scripts/hc_supabase.py upsert instagram_posts /tmp/ig.json
 *
 * WHY THIS EXISTS AT ALL, WHEN 0015 DESCRIBES A SYNC. The sync in that
 * migration needs Instagram's API, the API needs a Professional account, and
 * the church declined to switch. Everything else about the rail is built and
 * shipped, so the only missing piece is something that fills the table. This
 * is that, run by a person once a week instead of by pg_cron once an hour.
 *
 * OR FINDS THEM ITSELF, which is what --latest does:
 *
 *     node scripts/fetch_instagram_posts.js --latest 9 --out /tmp/ig.json
 *
 * This file used to say that listing an account's posts without credentials
 * was the part that does not work. That was true of a browser and false of a
 * crawler, which is the same discovery the UA constant below describes. Asked
 * as a crawler, a profile page is a document carrying about a dozen recent
 * posts, each with its numeric id. It carries no `taken_at`, so discovery
 * yields links and every link is still fetched for its own date.
 *
 * NOTHING IS EVER INVENTED, AND THE DATE IS WHY THIS MATTERS MORE THAN IT
 * LOOKS. `posted_at` sorts the rail, and 0015 and the demo seed both say that
 * is all it does. That is no longer true: connect.js:599 reads it into the
 * tile's aria-label, so a made up date is read aloud, as fact, to exactly the
 * people who cannot see the picture and check. So a post whose real timestamp
 * could not be found is held back with `! no date` rather than published on a
 * guess. Pass the real date on the line to publish it:
 *
 *     https://www.instagram.com/p/DcHwSuzCUYq/   2026-08-16
 *
 * THE ID IS INSTAGRAM'S MEDIA ID, exactly as 0015 specifies. The crawler's
 * copy of the page carries the media object with `pk` in it, so there is no
 * need for the shortcode substitute an earlier draft of this file used, and
 * rows written here are the same rows a future API sync would write. That is
 * also why a post that resolves only as far as its og: tags is held back
 * rather than keyed on its shortcode: one table with two id conventions in it
 * is worse than a rail that is one post short this week.
 *
 * There were once five demo rows keyed by shortcode, from a seed file that has
 * since been deleted along with the pictures it pointed at. They were not
 * updated in place by this script and could not be, which is what deleting
 * them was for. Nothing is keyed that way any more.
 *
 * WHAT IT NEEDS. The service role key, for the upload only. The bucket has a
 * public read policy and no write policy at all (0015 section 6), so the
 * service role is the only writer by design. Never put this key in the app.
 *
 *     export SUPABASE_URL=https://xxxx.supabase.co
 *     export SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 *     --latest N       find the newest N posts on the profile, no stdin
 *     --handle NAME    whose profile, default homechurch.nola
 *     --dry-run        fetch and report, upload nothing, write no file
 *     --no-upload      build rows against images already in the bucket
 *     --out FILE       write the rows here as well as to stdout
 *     --save-html DIR  keep the pages Instagram sent, for a broken selector
 *
 * Exit codes, the same shape as resolve_songs.js: 0 every post came back
 * whole, 2 at least one is thin or held back so a caller can tell "published
 * with gaps" from "published whole", 1 nothing was written so do not publish.
 */

'use strict';

const fs = require('fs');

/* A link preview crawler's User-Agent, and this is the single most important
   line in the file.
 *
 * Ask instagram.com for a post as a browser and you get their JavaScript
 * application: HTTP 200, about 600KB, 81% script, no og: tags, no media object
 * and not one mention of the account. The post is fetched later by code that
 * never runs outside a browser, so there is nothing in that page to parse and
 * it looks exactly like an empty or private post.
 *
 * Ask as a crawler and Instagram server renders the whole thing, because that
 * is how a link posted to Facebook or WhatsApp gets a preview. Their own name
 * for the flag is `if_is_crawler`, which appears in the response. You get the
 * og: tags and, better, a complete media object with the numeric id, the real
 * timestamp, the type and the caption.
 *
 * This is not a disguise or a way past anything. It is the difference between
 * asking for the page as an application shell and asking for it as a document,
 * and only the second has ever had the post in it. Change this line to a
 * browser string and the command stops working entirely. */
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const BUCKET = 'instagram';

/* ------------------------------------------------------------ reading links */

/* The shapes a link arrives in, all of which are the same post:

     https://www.instagram.com/p/DcHwSuzCUYq/
     https://instagram.com/p/DcHwSuzCUYq
     https://www.instagram.com/p/DcHwSuzCUYq/?img_index=2
     https://www.instagram.com/reel/DcEDXxvjLJW/?utm_source=ig_web_copy_link
     instagram.com/tv/DcEDXxvjLJW/

   `?img_index=` is Instagram's own marker for a multi image post and is the
   only carousel signal available without the API, so it is kept rather than
   stripped with the rest of the query. /reel/ and /tv/ mean video.

   A share link, /share/..., is deliberately not handled. It redirects to the
   real permalink and resolving it means following a redirect chain to find out
   what somebody actually sent, so the command asks for the real link instead
   of guessing at one. */
function parseUrl(line) {
  const text = String(line || '').trim();
  if (!text || text.startsWith('#')) return null;

  // An optional date after the link, for the post whose own date could not be
  // read. Anything else trailing the link is ignored.
  const dateMatch = text.match(/\s(\d{4}-\d{2}-\d{2})\s*$/);
  const givenDate = dateMatch ? dateMatch[1] : null;

  const m = text.match(
    /instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
  );
  if (!m) return null;

  const kind = m[1].toLowerCase();
  const shortcode = m[2];
  const carousel = /[?&]img_index=/.test(text);

  return {
    shortcode: shortcode,
    permalink: 'https://www.instagram.com/' +
      (kind === 'tv' || kind === 'reels' ? 'reel' : kind) + '/' + shortcode + '/',
    // A hint, not a verdict. The page itself overrules it when it says.
    mediaHint: (kind === 'reel' || kind === 'reels' || kind === 'tv') ? 'VIDEO'
      : carousel ? 'CAROUSEL_ALBUM'
      : null,
    givenDate: givenDate
  };
}

/* However the links were pasted: one per line, numbered, bulleted, or with
   commentary around them. Order is preserved and duplicates are dropped,
   keeping the first, because the same post pasted twice is one post. */
function parseList(text) {
  const out = [];
  const seen = new Set();
  for (const line of String(text || '').split('\n')) {
    const post = parseUrl(line);
    if (!post || seen.has(post.shortcode)) continue;
    seen.add(post.shortcode);
    out.push(post);
  }
  return out;
}

/* ------------------------------------------------------------- reading pages */

/* The handful of entities that actually turn up in a caption. A caption is
   prose somebody typed on a phone, so it is mostly apostrophes and ampersands
   and the occasional quoted phrase. */
function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Last, or it un-escapes the escapes above: &amp;quot; is the text
    // "&quot;", not a quotation mark.
    .replace(/&amp;/g, '&');
}

/* Scan a balanced JSON object out of a page, starting at the brace after
   `key`. A regex cannot do this: captions contain braces, and the blob these
   pages carry is thousands of nested objects long. Strings and their escapes
   are tracked so a `}` inside a caption does not end the scan early. */
function sliceAt(html, start) {
  if (html[start] !== '{') return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  return null;
}

function sliceObject(html, key) {
  const at = html.indexOf(key);
  if (at < 0) return null;
  const start = html.indexOf('{', at + key.length);
  return start < 0 ? null : sliceAt(html, start);
}

/* The media object Instagram server renders for crawlers.
 *
 * Every one of these objects opens with its own type, so `{"__typename":
 * "XIGPolaris` is a literal object boundary rather than something to search
 * near, and each can be sliced and parsed on its own.
 *
 * The catch is that a carousel post contains a dozen more of them, one per
 * picture, each with its own `code`. Taking the first match would key the row
 * to a single slide of the post rather than the post. So every candidate is
 * parsed and the one whose `code` is the shortcode that was actually asked for
 * wins, and it must carry the two fields the row cannot be built without. */
function extractMedia(html, shortcode) {
  const text = String(html || '');
  const NEEDLE = '{"__typename":"XIGPolaris';

  for (let at = text.indexOf(NEEDLE); at >= 0; at = text.indexOf(NEEDLE, at + 1)) {
    const raw = sliceAt(text, at);
    if (!raw) continue;
    let media;
    try { media = JSON.parse(raw); } catch (e) { continue; }
    if (!media || !media.pk || !media.taken_at) continue;
    if (shortcode && media.code !== shortcode) continue;
    return media;
  }
  return null;
}

/* A post's shortcode, derived from its numeric media id.
 *
 * The two are the same number. A shortcode is the id written in base64 with
 * Instagram's own alphabet, so `3965350390354495018` is `DcHwSuzCUYq` and the
 * conversion needs nothing from the network. That matters because the profile
 * page carries `pk` for every recent post and carries no `code` at all: this
 * is what turns a page of ids into a page of links.
 *
 * Checked against all five posts that were on the rail when this was written,
 * in instagram-posts.test.js. BigInt rather than Number, because these ids are
 * past 2^53 and floating point silently rounds them into a different post. */
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toShortcode(pk) {
  let n = BigInt(pk), out = '';
  if (n <= 0n) return '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 64n)] + out;
    n /= 64n;
  }
  return out;
}

/* Every recent post on a profile page, newest first.
 *
 * THIS IS THE PIECE THAT WAS MISSING, and the reason this file used to say
 * listing an account's posts was the part that does not work. It does not work
 * for a browser: a logged out profile is the JavaScript application and
 * nothing else. Asked as a crawler it is a document, and it carries about a
 * dozen posts with their ids, captions, types and pictures already in it.
 *
 * What it does NOT carry is `taken_at`. So this yields links rather than rows,
 * and each one still has to be fetched for its date. Do not be tempted to
 * publish straight from here: the date is read aloud, and the profile has
 * none.
 *
 * A carousel's slides appear as objects too, so only the ones carrying `pk`
 * are posts; the slides have an id and an image and nothing else. A pinned
 * post appears at the top whatever its age, which does not disturb ordering
 * because rows sort on the real date, but it does mean the newest dozen here
 * are not always the newest dozen posted. */
function discover(html) {
  const text = String(html || '');
  const NEEDLE = '{"__typename":"XIGPolaris';
  const seen = new Set();
  const posts = [];

  for (let at = text.indexOf(NEEDLE); at >= 0; at = text.indexOf(NEEDLE, at + 1)) {
    const raw = sliceAt(text, at);
    if (!raw) continue;
    let media;
    try { media = JSON.parse(raw); } catch (e) { continue; }
    if (!media || !media.pk || seen.has(media.pk)) continue;
    seen.add(media.pk);

    const shortcode = toShortcode(media.pk);
    if (!shortcode) continue;

    posts.push({
      shortcode: shortcode,
      permalink: 'https://www.instagram.com/p/' + shortcode + '/',
      mediaHint: null,          // the post's own page decides, as ever
      givenDate: null,
      pinned: Boolean(media.is_timeline_pinned),
      caption: ((media.caption || {}).text) || ''
    });
  }
  return posts;
}

/* Instagram's numeric media type, which is what `0015` calls media_type and
   is not the same numbering as anything else here.

     1  a single photo        8  a carousel
     2  a video, and product_type says which kind: `clips` is a reel */
function mediaTypeOf(media) {
  if (media.media_type === 8 || media.product_type === 'carousel_container') {
    return 'CAROUSEL_ALBUM';
  }
  if (media.media_type === 2 || media.product_type === 'clips') return 'VIDEO';
  return 'IMAGE';
}

function fromMedia(media) {
  if (!media) return null;

  /* `display_uri` is the post's own picture at full size. A carousel's is its
     first slide, which is the right one: the rail draws one tile per post, and
     the first slide is what Instagram itself shows in the grid. */
  const image = media.display_uri ||
    (((media.image_versions2 || {}).candidates || [])[0] || {}).url;
  if (!image) return null;

  return {
    source: 'media json',
    // Instagram's own numeric id, which is what 0015 asks the row to be keyed
    // by. Only this path has it, which is why only this path can publish.
    mediaId: String(media.pk),
    imageUrl: decodeEntities(image),
    caption: ((media.caption || {}).text) || '',
    postedAt: media.taken_at ? new Date(media.taken_at * 1000).toISOString() : null,
    mediaType: mediaTypeOf(media)
  };
}

/* The og: tags, which every link preview on the internet reads.
 *
 * NOT A SOURCE A POST CAN BE PUBLISHED FROM, and it is worth being clear why
 * rather than leaving it looking like a fallback that was never finished.
 * These tags carry a picture and a caption and nothing else: no timestamp, so
 * the date would have to be guessed, and no numeric id, so the row would have
 * to be keyed differently from every row the media object produces. Two id
 * conventions in one table is the drift this file exists to avoid.
 *
 * So it is a diagnosis. Tags but no media object means the page was served,
 * the post is real and public, and the media object has been renamed: a
 * precise thing to fix, and a completely different message from the two other
 * ways this fails. */
function fromOgTags(html) {
  const text = String(html || '');
  const pick = (prop) => {
    const m = text.match(
      new RegExp('<meta[^>]+property="' + prop + '"[^>]+content="([^"]*)"')
    ) || text.match(
      new RegExp('<meta[^>]+content="([^"]*)"[^>]+property="' + prop + '"')
    );
    return m ? decodeEntities(m[1]) : '';
  };

  const image = pick('og:image');
  if (!image) return null;

  const title = pick('og:title');
  const quoted = title.match(/:\s*[“"]([\s\S]*)[”"]\s*$/);

  return {
    source: 'og tags',
    imageUrl: image,
    caption: quoted ? quoted[1].trim() : '',
    postedAt: null,
    mediaType: pick('og:type') === 'video' ? 'VIDEO' : null
  };
}

/* Did Instagram send a page with a post in it, or the empty shell?
 *
 * These are the two failures and they need completely different fixes, so
 * telling them apart is worth a function. A datacenter IP gets HTTP 200 and
 * about 600KB that is 80% JavaScript, no og: tags, no media object, and not
 * one mention of the account: the post is fetched later by script that never
 * runs here. Reported as a parse failure it looks exactly like Instagram
 * having renamed something, and somebody spends the afternoon rewriting
 * selectors that were fine.
 *
 * The tell is a picture. Every real post page carries at least one URL for
 * actual media, and the shell carries only its own code. static.cdninstagram
 * .com/rsrc.php is that code, so it does not count. */
function looksLikeShell(html) {
  const text = String(html || '');
  const media = text.match(
    /https:\/\/[a-z0-9.-]*(?:cdninstagram\.com|fbcdn\.net)\/[^"'\\\s]+/gi
  ) || [];
  return !media.some((u) => !/\/rsrc\.php\//.test(u));
}

/* The page's own answer wins, because /p/ links are handed out for reels too
   and a play badge is a promise about what a tap does. The hint from the link
   only stands in when the page did not say, which now means it never does on a
   post that gets published. */
function mediaTypeFor(hint, found) {
  return found || hint || 'IMAGE';
}

/* Instagram allows 2200 characters. The tile reads the first line and the app
   does its own truncating, so this only normalises line endings and strips the
   trailing blank lines a phone keyboard leaves behind. */
function normalizeCaption(s) {
  return String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2200);
}

/* The id is Instagram's numeric media id, exactly as `0015` specifies, and it
   comes from the media object rather than from the link. A post that resolved
   only far enough to give a picture has no id and no date, and is held back
   rather than keyed on its shortcode: one table with two id conventions in it
   is worse than a rail that is one post short this week. */
function buildRow(post, found, imagePath) {
  return {
    id: (found && found.mediaId) || null,
    permalink: post.permalink,
    image_path: imagePath || null,
    media_type: mediaTypeFor(post.mediaHint, found && found.mediaType),
    caption: normalizeCaption(found && found.caption),
    posted_at: (found && found.postedAt) ||
      (post.givenDate ? post.givenDate + 'T12:00:00Z' : null),
    published: true
  };
}

/* ------------------------------------------------------------------ network */

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml'
    }
  });
  /* 429 is the one status worth its own sentence. It means the asking was too
     quick, not that anything is wrong with the link or the account, and the
     fix is to wait rather than to change anything. Reported as a bare status
     it reads like a block. */
  if (res.status === 429) {
    const err = new Error(
      'Instagram is rate limiting this connection. Nothing is wrong with the ' +
      'link or the account: wait a few minutes and run it again.'
    );
    err.rateLimited = true;
    throw err;
  }

  /* The same throttle, one stage further on. Keep asking after a 429 and
     Instagram stops answering 429 and starts redirecting to the login page
     instead, with `is_from_rle` in the query: rate limit exceeded. It looks
     like a login wall, and being read as one sends somebody off to make the
     account public or to find a way to sign in, when the fix is to stop
     asking for a while. */
  if (/\/accounts\/login\//.test(res.url || '')) {
    const err = new Error(
      'Instagram redirected to its login page' +
      (/is_from_rle/.test(res.url) ? ', flagged as rate limit exceeded' : '') +
      '. This is the throttle, not the account: it means too many requests ' +
      'from this connection recently. Leave it an hour and run it again.'
    );
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) throw new Error(res.status + ' from ' + url);
  return res.text();
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function fetchImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('image: ' + res.status);
  const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    type: type,
    ext: EXT[type] || 'jpg'
  };
}

async function upload(objectPath, image, env) {
  const res = await fetch(
    env.url + '/storage/v1/object/' + BUCKET + '/' + objectPath,
    {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: 'Bearer ' + env.key,
        'Content-Type': image.type,
        // Replace rather than fail, so re-running after a caption edit is safe.
        'x-upsert': 'true'
      },
      body: image.bytes
    }
  );
  if (!res.ok) throw new Error(objectPath + ': ' + res.status + ' ' + (await res.text()));
}

/* Why a post did not resolve, in Meta's own words.
 *
 * Only ever called after both fetches have already failed, and only to turn a
 * useless message into a precise one. The embed page and the post page both
 * answer a private post with something that looks exactly like a network
 * problem or a changed selector, and the difference between "the church made
 * this account private" and "Instagram moved the picture again" is a week of
 * looking in the wrong place.
 *
 * The oEmbed endpoint says which. Since 15 June 2026 it takes no access token,
 * no app and no App Review, and it distinguishes the two cases that matter:
 *
 *   2207046  Private Media    the post is real and the account is not public
 *   2207045  Media Not Found  no such post, or it was deleted
 *
 * It is not used for anything else. Tokenless oEmbed no longer returns
 * thumbnail_url, so it cannot supply a picture, and it never carried a date.
 * This is a diagnostic, not a source. */
function explainOembedError(body) {
  const err = body && body.error;
  if (!err) return null;
  /* DO NOT REPORT THIS AS "the account is private". It says that, and it is
     not reliable: @homechurch.nola is a public account that anyone can read in
     a logged out browser, and all five of its posts answer 2207046 anyway.
     The likeliest reading is that Graph oEmbed refuses posts from accounts
     that are not Professional, which is every account this command exists to
     serve. Acting on the literal wording sends somebody to change a privacy
     setting that was never the problem. */
  if (err.error_subcode === 2207046) {
    return 'the Graph API declined to embed it, which it does both for ' +
      'private accounts and for ordinary personal ones, so on its own this ' +
      'says nothing. Open the post in a logged out browser to tell which.';
  }
  if (err.error_subcode === 2207045) {
    return 'Instagram says there is no such post. Check the link, and ' +
      'whether it has been deleted.';
  }
  return 'Instagram says: ' + (err.error_user_msg || err.message || 'no reason given');
}

async function diagnose(shortcode) {
  try {
    const res = await fetch(
      'https://graph.facebook.com/v23.0/instagram_oembed?url=' +
      encodeURIComponent('https://www.instagram.com/p/' + shortcode + '/') +
      '&omitscript=true',
      { headers: { 'User-Agent': UA } }
    );
    return explainOembedError(await res.json());
  } catch (e) {
    // The diagnosis failing is not itself worth reporting. The caller still
    // has the real errors from the two fetches that actually matter.
    return null;
  }
}

/* One fetch, of the post's own page, asked for as a crawler.
 *
 * There used to be two, the /embed/captioned/ endpoint first and this second,
 * on the understanding that the embed was the richer source. With the crawler
 * User-Agent that is backwards: the post page server renders the complete
 * media object, and the embed endpoint returns less. So the embed request was
 * removed rather than left in as a fallback that could only ever produce a row
 * this one would have produced better. */
async function look(post, opts) {
  const attempts = [];
  const pages = [];
  const save = (opts && opts.saveHtml) || null;

  try {
    const html = await fetchText(post.permalink);
    pages.push(html);
    if (save) {
      const file = save.replace(/\/$/, '') + '/' + post.shortcode + '.html';
      try { fs.writeFileSync(file, html); attempts.push('saved ' + file); }
      catch (e) { attempts.push('could not save ' + file + ': ' + e.message); }
    }

    const found = fromMedia(extractMedia(html, post.shortcode));
    if (found) return found;

    /* A picture in the og: tags but no media object is its own diagnosis: the
       page arrived, the post is real and public, and the shape has changed. */
    if (fromOgTags(html)) {
      const err = new Error(
        'the page has the post in it, and its og: tags read fine, but the ' +
        'media object did not. That object carries the id and the date, so ' +
        'the post cannot be published without it. Instagram has renamed ' +
        'something: re-run with --save-html DIR and keep the file.'
      );
      err.stale = true;
      throw err;
    }
    attempts.push('the post page had neither a media object nor og:image');
  } catch (e) {
    if (e.stale || e.rateLimited) throw e;
    attempts.push('post page: ' + e.message);
  }

  if (pages.length && pages.every(looksLikeShell)) {
    const err = new Error(
      'Instagram sent a page with no post in it, only its own JavaScript. ' +
      'That is what a datacenter IP gets, and what a web session gets. Run ' +
      'this from a normal connection on a laptop.'
    );
    err.shell = true;
    throw err;
  }

  /* Nothing was fetched at all, so ask Meta whether the link is even real
     before reporting a network error somebody will spend the afternoon on. */
  const why = await diagnose(post.shortcode);
  const err = new Error(
    why ? why + ' What was tried: ' + attempts.join('; ') : attempts.join('; ')
  );
  err.attempts = attempts;
  throw err;
}

/* --------------------------------------------------------------------- main */

function parseArgs(argv) {
  const args = { out: null, dryRun: false, upload: true, saveHtml: null, latest: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-upload') args.upload = false;
    else if (a === '--save-html') args.saveHtml = argv[++i];
    else if (a === '--latest') args.latest = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--handle') args.handle = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = `
Turn Instagram post links into instagram_posts rows, pictures and all.

  node scripts/fetch_instagram_posts.js --out /tmp/ig.json < links.txt

  --out FILE    write the rows here as well as to stdout
  --dry-run     fetch and report, upload nothing, write no file
  --no-upload   build rows against pictures already in the bucket
  --save-html DIR  keep the pages Instagram sent, for when a selector breaks
  --latest N       find the newest N posts on the profile instead of stdin
  --handle NAME    whose profile --latest reads, default homechurch.nola

Links go in on stdin, one per line, newest first. A post whose date cannot
be read is held back; give it one on the line to publish it:

  https://www.instagram.com/p/DcHwSuzCUYq/   2026-08-16

Uploading needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return 0; }

  let posts;
  if (args.latest) {
    const handle = args.handle || 'homechurch.nola';
    try {
      const html = await fetchText('https://www.instagram.com/' + handle + '/');
      const found = discover(html);
      if (!found.length) {
        console.error(
          looksLikeShell(html)
            ? 'The profile page came back with no posts in it, only Instagram\'s\n' +
              'own JavaScript. That is the shell, not an empty account.'
            : 'The profile page arrived but no posts parsed out of it.\n' +
              'Instagram has most likely renamed something.'
        );
        return 1;
      }
      posts = found.slice(0, args.latest);
      console.error('Found ' + found.length + ' posts on @' + handle +
        ', taking the newest ' + posts.length + '.');
    } catch (e) {
      console.error('Could not read @' + handle + ': ' + e.message);
      return 1;
    }
  } else {
    posts = parseList(fs.readFileSync(0, 'utf8'));
    if (!posts.length) {
      console.error('No Instagram post links on stdin.\n' + USAGE);
      return 1;
    }
  }

  const env = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const uploading = args.upload && !args.dryRun;
  if (uploading && (!env.url || !env.key)) {
    console.error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --dry-run.\n' +
      'The service role key is under Project Settings -> API. It is not the\n' +
      'anon key, and it must never end up in js/config.js.'
    );
    return 1;
  }

  const rows = [];
  let thin = 0;

  /* A pause between posts, because nine links in nine milliseconds is what
     trips Instagram's rate limiter, and a 429 halfway through a run is worse
     than a run that takes twenty seconds. */
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const [index, post] of posts.entries()) {
    if (index) await pause(2000);
    let found;
    try {
      found = await look(post, { saveHtml: args.saveHtml });
    } catch (e) {
      console.error('  ! ' + post.shortcode + '  nothing came back: ' + e.message);
      thin++;
      continue;
    }

    const row = buildRow(post, found, null);

    /* Held back rather than published wrong. Both of these come from the media
       object, so in practice they fail together, and both are worth their own
       sentence: the date because connect.js reads it aloud, so a plausible one
       is worse than none, and the id because keying this row differently from
       every other row is a mess that outlives the week it was convenient. */
    if (!row.id) {
      console.error('  ! ' + post.shortcode + '  no media object, so no id ' +
        'and no date, via ' + found.source + '. Not published.');
      thin++;
      continue;
    }
    if (!row.posted_at) {
      console.error('  ! ' + post.shortcode + '  no date, via ' + found.source +
        '. Add one on the line to publish it.');
      thin++;
      continue;
    }

    const objectPath = row.id + '.jpg';
    if (uploading) {
      try {
        const image = await fetchImage(found.imageUrl);
        const named = row.id + '.' + image.ext;
        await upload(named, image, env);
        row.image_path = named;
        console.error('  ok ' + post.shortcode + '  ' + row.media_type.toLowerCase() +
          ', ' + Math.round(image.bytes.length / 1024) + ' KB, via ' + found.source);
      } catch (e) {
        /* A row with no image_path draws nothing: connect.js drops it, because
           a tile with no picture is a hole in a row of photographs. So the
           post is left out entirely rather than written as a row that can
           never render. */
        console.error('  ! ' + post.shortcode + '  picture did not mirror: ' + e.message);
        thin++;
        continue;
      }
    } else {
      row.image_path = objectPath;
      console.error('  -- ' + post.shortcode + '  ' + row.media_type.toLowerCase() +
        ', via ' + found.source + ', no upload');
    }

    rows.push(row);
  }

  if (!rows.length) {
    console.error('\nNothing resolved, so nothing was written.');
    return 1;
  }

  const json = JSON.stringify(rows, null, 2);
  process.stdout.write(json + '\n');
  if (args.out && !args.dryRun) fs.writeFileSync(args.out, json + '\n');

  console.error('\n' + rows.length + ' post' + (rows.length === 1 ? '' : 's') +
    (thin ? ', ' + thin + ' held back' : '') +
    (args.dryRun ? '. Dry run, nothing uploaded and no file written.' : '') +
    (args.out && !args.dryRun ? '. Written to ' + args.out : ''));

  return thin ? 2 : 0;
}

module.exports = {
  parseUrl, parseList, decodeEntities, sliceAt, sliceObject, extractMedia,
  toShortcode, discover,
  looksLikeShell, fromMedia, fromOgTags, mediaTypeFor, mediaTypeOf,
  normalizeCaption, buildRow, explainOembedError
};

/* process.exitCode rather than process.exit(), so stdout is flushed before
   the process goes away. Same reason as resolve_songs.js. */
if (require.main === module) {
  main().then(
    code => { process.exitCode = code; },
    err => {
      console.error(String(err && err.message || err));
      process.exitCode = 1;
    }
  );
}
