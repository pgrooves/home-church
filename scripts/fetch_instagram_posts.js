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
 * WHY NOT SCRAPE THE PROFILE. Listing an account's posts without credentials
 * is the part that does not work: logged out instagram.com serves a login
 * wall, datacenter IPs are refused on the first request, and Instagram rotates
 * the GraphQL ids behind the web app every few weeks. So this script never
 * asks "what has the church posted lately". It is told, one link at a time,
 * and then only fetches things Instagram publishes to anyone: the embed that
 * exists to be put on other people's websites, and the og: tags that exist to
 * be read by every link preview on the internet. That is the whole trick, and
 * it is why there is no token here and nothing to keep working.
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
 * THE ID IS THE SHORTCODE, NOT INSTAGRAM'S MEDIA ID. 0015 specifies the media
 * id, and the reason it gives is that a re-run should update a post rather
 * than duplicate it. The shortcode does that identically: it is stable, it is
 * unique, and unlike the numeric media id it is visible in the permalink,
 * which is the only thing anybody has here. Rows written by this script and
 * rows written by a future API sync would therefore not recognise each other.
 * If the church ever does switch, migrate the ids in one pass rather than
 * letting both conventions sit in the table.
 *
 * WHAT IT NEEDS. The service role key, for the upload only. The bucket has a
 * public read policy and no write policy at all (0015 section 6), so the
 * service role is the only writer by design. Never put this key in the app.
 *
 *     export SUPABASE_URL=https://xxxx.supabase.co
 *     export SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 *     --dry-run     fetch and report, upload nothing, write no file
 *     --no-upload   build rows against images already in the bucket
 *     --out FILE    write the rows here as well as to stdout
 *
 * Exit codes, the same shape as resolve_songs.js: 0 every post came back
 * whole, 2 at least one is thin or held back so a caller can tell "published
 * with gaps" from "published whole", 1 nothing was written so do not publish.
 */

'use strict';

const fs = require('fs');

/* A real browser's User-Agent. Not a disguise: the embed and the og: tags are
   public either way, but Instagram answers a bare fetch with a stub page that
   has neither, and a stub parsed for a picture that is not there looks exactly
   like a post with no picture. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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
function sliceObject(html, key) {
  const at = html.indexOf(key);
  if (at < 0) return null;
  const start = html.indexOf('{', at + key.length);
  if (start < 0) return null;

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

/* The best source, when it is there. The embed page carries the same media
   object the web app renders from, which has the picture, the caption, the
   real timestamp and the type all together and already decoded. */
function extractMedia(html) {
  const raw = sliceObject(String(html || ''), '"shortcode_media"');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function fromMedia(media) {
  if (!media || !media.display_url) return null;
  const caption =
    ((((media.edge_media_to_caption || {}).edges || [])[0] || {}).node || {}).text;
  return {
    source: 'embed json',
    imageUrl: media.display_url,
    caption: caption || '',
    postedAt: media.taken_at_timestamp
      ? new Date(media.taken_at_timestamp * 1000).toISOString()
      : null,
    mediaType: media.__typename === 'GraphSidecar' ? 'CAROUSEL_ALBUM'
      : (media.__typename === 'GraphVideo' || media.is_video) ? 'VIDEO'
      : 'IMAGE'
  };
}

/* The embed page's rendered markup, for when the blob is not there but the
   iframe still drew something. No timestamp lives here, which is the whole
   reason this is second and not first. */
function fromEmbedHtml(html) {
  const text = String(html || '');
  const img = text.match(/class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/) ||
              text.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]*src="([^"]+)"/);
  if (!img) return null;

  // The caption block carries the username as its own link first, which is
  // not part of what the church wrote.
  let caption = '';
  const cap = text.match(/<div class="Caption">([\s\S]*?)<\/div>/);
  if (cap) {
    caption = cap[1]
      .replace(/<a[^>]*class="CaptionUsername"[\s\S]*?<\/a>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  return {
    source: 'embed html',
    imageUrl: decodeEntities(img[1]),
    caption: decodeEntities(caption),
    postedAt: null,
    mediaType: /class="EmbedVideo|videoSpritePlayButton/.test(text) ? 'VIDEO' : null
  };
}

/* The last resort, and the one thing Instagram cannot take away without
   breaking every link preview on the internet. og:title reads

     Home Church on Instagram: "the caption, in quotes"

   so the caption is what sits inside the quotes, and there is no date. */
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

/* The hint from the link loses to the page, because /p/ links are handed out
   for reels too and a play badge is a promise about what a tap does. */
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

function buildRow(post, found, imagePath) {
  return {
    id: post.shortcode,
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

/* Ask the embed first, fall back to the post page. Both are public and
   neither takes a credential. Whichever answered is reported, because "the
   blob was there" and "we scraped the preview card" are different amounts of
   trust and the second one never carries a date. */
async function look(post) {
  const attempts = [];

  try {
    const html = await fetchText(
      'https://www.instagram.com/p/' + post.shortcode + '/embed/captioned/'
    );
    const found = fromMedia(extractMedia(html)) || fromEmbedHtml(html);
    if (found) return found;
    attempts.push('the embed answered with no picture in it');
  } catch (e) {
    attempts.push('embed: ' + e.message);
  }

  try {
    const found = fromOgTags(await fetchText(post.permalink));
    if (found) return found;
    attempts.push('the post page had no og:image');
  } catch (e) {
    attempts.push('post page: ' + e.message);
  }

  const err = new Error(attempts.join('; '));
  err.attempts = attempts;
  throw err;
}

/* --------------------------------------------------------------------- main */

function parseArgs(argv) {
  const args = { out: null, dryRun: false, upload: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-upload') args.upload = false;
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

Links go in on stdin, one per line, newest first. A post whose date cannot
be read is held back; give it one on the line to publish it:

  https://www.instagram.com/p/DcHwSuzCUYq/   2026-08-16

Uploading needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return 0; }

  const posts = parseList(fs.readFileSync(0, 'utf8'));
  if (!posts.length) {
    console.error('No Instagram post links on stdin.\n' + USAGE);
    return 1;
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

  for (const post of posts) {
    let found;
    try {
      found = await look(post);
    } catch (e) {
      console.error('  ! ' + post.shortcode + '  nothing came back: ' + e.message);
      thin++;
      continue;
    }

    const row = buildRow(post, found, null);

    /* Held back rather than published on a guess. See the header: this date is
       read aloud to screen reader users, so a plausible one is worse than
       none. */
    if (!row.posted_at) {
      console.error('  ! ' + post.shortcode + '  no date, via ' + found.source +
        '. Add one on the line to publish it.');
      thin++;
      continue;
    }

    const objectPath = post.shortcode + '.jpg';
    if (uploading) {
      try {
        const image = await fetchImage(found.imageUrl);
        const named = post.shortcode + '.' + image.ext;
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
  parseUrl, parseList, decodeEntities, sliceObject, extractMedia,
  fromMedia, fromEmbedHtml, fromOgTags, mediaTypeFor, normalizeCaption, buildRow
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
