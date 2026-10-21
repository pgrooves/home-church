#!/usr/bin/env node
/* ===========================================================================
   Stage the app where Remotion can run it, with this week's content in it.

   WHY A COPY AND NOT A RECORDING. The video is not a slideshow of stills. Every
   frame of app footage in it is the real app, running live inside the
   composition, driven one frame at a time. Remotion serves `public/` at the
   root of its bundle, so the app has to be inside `public/` for an iframe to
   reach it. This copies the six things index.html actually loads, and then it
   does one more thing.

   IT BAKES THE CHURCH'S REAL CONTENT IN, ONCE, HERE.

   The seed seeds the app: js/data.js carries a snapshot from last spring, the
   Life of David, four songs with no artwork, and a calendar whose last event
   was in September. A video made from that is a video of the app as it was,
   and the series on the screen is not the series the church is preaching.

   So this reads the live tables once, at prepare time, downloads every picture
   they point at, rewrites the links to the copies, and writes the lot to
   public/app/live/content.json. src/stage.js hands that to the app through the
   same cache js/content.js fills after a real fetch, so the app ingests it the
   way it ingests a Sunday.

   WHY HERE AND NOT AT RENDER TIME. Remotion renders with several browser tabs
   at once and each one boots its own copy of the app. Eight tabs fetching the
   church's content eight times, mid render, is eight chances for them to
   disagree, and frames that disagree are frames that tear. Baked once, every
   tab reads the same bytes off disk, the render needs no network at all, and
   the video is reproducible again. Re-running prepare is how it gets this
   Sunday's content; that is one command and it is in every npm script here.

   WHEN THERE IS NO NETWORK, or the project will not answer, it says so and
   falls back: config.js is emptied and the app runs off its bundled seed,
   which is what this did before and is still honest, just older.

   A PICTURE IT CANNOT REACH IS LEFT POINTING AT THE INTERNET. The app already
   has an answer for art that does not arrive, the house cover, and it draws it
   through [data-media-fallback] without being asked. Every host that failed is
   named in the output so it is obvious which ones to allow.

     node prepare.mjs

   Writes to public/app/, which is gitignored. Run it before the studio and
   before a render; both npm scripts already do.
   =========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..');
const OUT = path.join(HERE, 'public', 'app');

/* Everything index.html asks for, and the practices JSON that js/practices.js
   fetches once somebody opens that screen. Deliberately not the whole repo:
   node_modules alone would take longer to walk than the render takes to run. */
const CARRY = [
  'index.html',
  'manifest.webmanifest',
  'css',
  'js',
  'assets',
  'data'
];

const EMPTY_CONFIG = `/* Written by video/prepare.mjs. Do not edit, and do not commit.

   The keys are gone because the live content could not be read this time, so
   the app falls back to the seed bundled in js/data.js and runs the way it
   runs on a phone that has never signed in. See the header of prepare.mjs. */

(function (HC) {
  'use strict';

  HC.config = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: ''
  };

})(window.HC = window.HC || {});
`;

const BAKED_CONFIG = `/* Written by video/prepare.mjs. Do not edit, and do not commit.

   THE PROJECT IS A FOLDER. js/content.js builds every request as
   SUPABASE_URL + '/rest/v1/' + table + '?select=...', so pointing the URL at
   this folder makes each of those a request for a file prepare.mjs has
   already written, and the app reads this week's content off the disk it is
   served from with its own fetch, its own twenty mapping functions and its
   own cache. Nothing is reached around and no mapper is copied anywhere.

   The key is a word rather than a key, because the only thing the app does
   with it is check that it is not empty before deciding a project exists. A
   folder does not need authenticating. */

(function (HC) {
  'use strict';

  HC.config = {
    SUPABASE_URL: '.',
    SUPABASE_ANON_KEY: 'baked'
  };

})(window.HC = window.HC || {});
`;

/* The pictures that are not links but object paths.

   Instagram and TikTok thumbnails are stored in Supabase Storage and the row
   only carries the path inside the bucket; js/content.js turns that into a
   URL by gluing the project in front of it. With the project pointed at this
   folder it glues this folder in front of it instead, so the files have to be
   here, under the same path the app is about to ask for. Mirrored rather than
   rewritten, because rewriting would mean changing a column the app derives
   rather than reads. */
const BUCKETS = [
  { table: 'instagram_posts', field: 'image_path', bucket: 'instagram' },
  { table: 'tiktok_posts', field: 'image_path', bucket: 'tiktok' }
];

/* The tables js/content.js reads, with the order and filter it reads them in.
   Kept in step with the TABLES list there by hand, which is fine: a table
   added over there and missed here is a table this video shows last spring's
   copy of, not a table that breaks anything. */
const TABLES = [
  { table: 'series' },
  { table: 'guides' },
  { table: 'podcasts' },
  { table: 'events' },
  { table: 'announcements', order: 'created_at.desc', filter: 'deleted_at=is.null' },
  { table: 'reading_plans' },
  { table: 'worship_sets', order: 'served_on.desc' },
  { table: 'homekids_lessons', order: 'taught_on.desc', limit: 26 },
  { table: 'homekids_updates', order: 'sent_on.desc.nullslast,created_at.desc', limit: 40 },
  { table: 'groups', order: 'sort_order.asc,name.asc' },
  { table: 'serve_teams', order: 'sort_order.asc,name.asc' },
  { table: 'next_steps', order: 'sort_order.asc,title.asc' },
  { table: 'instagram_posts', order: 'posted_at.desc', limit: 9 },
  { table: 'tiktok_posts', order: 'posted_at.desc', limit: 9 },
  { table: 'content_pages', order: 'sort_order.asc,title.asc' },
  { table: 'cafe_menu_items', order: 'sort_order.asc,name.asc' },
  { table: 'cafe_slots', order: 'sort_order.asc' },
  { table: 'app_settings', order: 'sort_order.asc,label.asc' },
  { table: 'text_overrides', order: 'slot.asc' },
  { table: 'church_profile' },
  { table: 'podcast_show' }
];


fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
for (const entry of CARRY) {
  const src = path.join(APP, entry);
  if (!fs.existsSync(src)) {
    console.error(`prepare: ${entry} is missing from the app. Nothing to copy.`);
    process.exit(1);
  }
  fs.cpSync(src, path.join(OUT, entry), { recursive: true });
  files += fs.statSync(src).isDirectory() ? walk(path.join(OUT, entry)) : 1;
}

const baked = await bakeLiveContent();
fs.writeFileSync(path.join(OUT, 'js', 'config.js'), baked ? BAKED_CONFIG : EMPTY_CONFIG);

console.log(`prepare: ${files} files into public/app` +
  (baked ? `, ${baked.rows} live rows and ${baked.images} pictures baked in.`
         : ', config.js emptied, running off the bundled seed.'));

/* --------------------------------------------------------------------------
   This week's content, read once and written to disk.
   -------------------------------------------------------------------------- */

async function bakeLiveContent() {
  const cfg = readConfig();
  if (!cfg) {
    console.log('prepare: no Supabase keys in js/config.js.');
    return null;
  }

  const imgDir = path.join(OUT, 'live', 'img');
  fs.mkdirSync(imgDir, { recursive: true });

  const payload = {};
  let rows = 0;
  for (const spec of TABLES) {
    const got = await getTable(cfg, spec);
    if (got === null) {
      console.error(`prepare: could not read ${spec.table}.`);
      return null;
    }
    payload[spec.table] = got;
    rows += got.length;
  }
  if (!rows) {
    console.error('prepare: the project answered with nothing in it.');
    return null;
  }

  silenceFeaturedVideo(payload);
  const images = await bakeImages(payload, imgDir)
    + await mirrorStorage(cfg, payload);

  /* One file per table, at the path the app's own request will ask for.
     Extensionless on purpose: the request carries a query string and a static
     server matches on the path, so `rest/v1/series` answers
     `rest/v1/series?select=*&order=...` without anybody parsing anything. */
  const api = path.join(OUT, 'rest', 'v1');
  fs.mkdirSync(api, { recursive: true });
  for (const [table, body] of Object.entries(payload)) {
    fs.writeFileSync(path.join(api, table), JSON.stringify(body));
  }

  return { rows, images };
}

/* The one row that is emptied on the way through.

   `home_featured_video` puts a YouTube embed under the greeting on Home and
   starts it muted the moment the app opens. There is no YouTube in a render:
   the iframe never loads, and what Home draws instead is a black rectangle
   the height of a video with "Tap for sound" floating on it, which is a worse
   advertisement for the app than no video at all. Emptied, Home skips the
   section the way it does for a church that has not set one, and everything
   under it moves up.

   If the video ever has to be in the piece, it needs a render with network
   and a frame rate nobody controls, which is a different kind of video. */
function silenceFeaturedVideo(payload) {
  const rows = payload.app_settings;
  if (!Array.isArray(rows)) return;
  const row = rows.find((r) => r && r.key === 'home_featured_video');
  if (row) row.value_text = '';
}

function readConfig() {
  const src = fs.readFileSync(path.join(APP, 'js', 'config.js'), 'utf8');
  const url = (src.match(/SUPABASE_URL:\s*'([^']*)'/) || [])[1];
  const key = (src.match(/SUPABASE_ANON_KEY:\s*'([^']*)'/) || [])[1];
  return url && key ? { url, key } : null;
}

/* ONE WAY OUT TO THE INTERNET, AND IT IS NOT ALWAYS fetch.

   Where this runs behind an egress proxy, Node's own fetch does not use it:
   undici reads no proxy environment variable, so a host the proxy would have
   reached comes back as ENOTFOUND while curl, which does read them, fetches
   it fine. The symptom is a picture that silently does not arrive, on some
   hosts and not others, which is a confusing afternoon.

   So: fetch first, because it is built in and it is what works on a laptop,
   and curl second, because it is what works behind the proxy. If neither
   does, the caller treats it as a picture that is not coming. */
function get(url, headers) {
  return fetchFirst(url, headers).catch(() => viaCurl(url, headers));
}

async function fetchFirst(url, headers) {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error('status ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

function viaCurl(url, headers) {
  const args = ['-sS', '--fail', '--location', '--max-time', '90'];
  for (const [k, v] of Object.entries(headers || {})) args.push('-H', `${k}: ${v}`);
  args.push('--output', '-', url);
  return Promise.resolve(execFileSync('curl', args, {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  }));
}

async function getTable(cfg, spec) {
  let url = cfg.url + '/rest/v1/' + spec.table + '?select=*';
  if (spec.filter) url += '&' + spec.filter;
  if (spec.order) url += '&order=' + encodeURIComponent(spec.order);
  if (spec.limit) url += '&limit=' + encodeURIComponent(spec.limit);

  try {
    const body = JSON.parse((await get(url, {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      Accept: 'application/json'
    })).toString('utf8'));
    return Array.isArray(body) ? body : null;
  } catch (err) {
    return null;
  }
}

/* --------------------------------------------------------------------------
   Every picture the content points at, pulled down beside it.

   WHY THEY CANNOT STAY WHERE THEY ARE. A render with no network draws no
   remote image, and a render with one draws it eight times from eight tabs
   over somebody's hotel wifi. Downloaded once and rewritten to a local path,
   the artwork is just another file in public/app.

   Walks the rows looking for anything that is a string beginning http and
   sitting under a key that reads like a picture, which covers series art,
   announcement images, Instagram thumbnails and the artUrl inside the songs
   array of a worship set without needing a schema.
   -------------------------------------------------------------------------- */

async function bakeImages(payload, dir) {
  const seen = new Map();
  const failedHosts = new Set();
  let saved = 0;

  /* Two ways to be a picture, because the rows have both.

     A key that reads like one, which covers a CDN link with no extension on
     it, and a value that ends in an image extension, which covers the plain
     array of links an announcement carries under `images` where the only key
     each one has is its position in the list. The first cut tested the key
     alone and left every one of those pointing at a host the render cannot
     reach, which drew three broken-image boxes down the middle of Home. */
  const pictureKey = (key) =>
    /(art|image|img|thumb|photo|poster|cover|avatar)/i.test(key);
  const pictureValue = (value) =>
    /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(value);

  /* Resolves one string to a local copy, or to nothing. */
  const swap = async (value) => {
    if (typeof value !== 'string' || !/^https?:\/\//.test(value)) return value;
    if (!seen.has(value)) seen.set(value, await download(value, dir, failedHosts));
    const local = seen.get(value);
    if (local) saved++;
    /* A PICTURE THAT CANNOT BE FETCHED BECOMES NO PICTURE. Leaving the link
       in means the render asks the internet for it, gets nothing, and draws
       the hole where it would have gone: on Home that is three broken-image
       boxes down the middle of the noticeboard. Emptied, every screen falls
       back to what it already does for a row that never had a picture, which
       on a series is the house cover and on an announcement is a card with
       just the words. Honest either way, and one of them is not broken. */
    return local || '';
  };

  const visit = async (node, parentKey) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        if (typeof item === 'string') {
          /* An array of bare links, which is how an announcement carries its
             pictures. The only key each one has is its position, so the key
             test cannot help and the parent's name has to stand in for it. */
          if (pictureKey(parentKey || '') || pictureValue(item)) node[i] = await swap(item);
        } else {
          await visit(item, parentKey);
        }
      }
      return;
    }
    if (!node || typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') { await visit(value, key); continue; }
      if (typeof value !== 'string' || !/^https?:\/\//.test(value)) continue;
      if (!pictureKey(key) && !pictureValue(value)) continue;
      node[key] = await swap(value);
    }
  };

  await visit(Object.values(payload));

  for (const host of failedHosts) {
    console.error(`prepare: could not reach ${host}, so its pictures are left ` +
      'out and the screens that wanted them draw what they draw without one. ' +
      'Allow that host where this runs and re-run prepare to get them in.');
  }
  return saved;
}

async function mirrorStorage(cfg, payload) {
  let saved = 0;
  for (const spec of BUCKETS) {
    for (const row of payload[spec.table] || []) {
      const key = row && row[spec.field];
      if (!key) continue;

      const rel = 'storage/v1/object/public/' + spec.bucket + '/' +
        String(key).split('/').map(encodeURIComponent).join('/');
      const file = path.join(OUT, decodeURIComponent(rel));
      if (fs.existsSync(file)) { saved++; continue; }

      try {
        const body = await get(cfg.url + '/' + rel);
        if (!body.length) continue;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, body);
        saved++;
      } catch (err) { /* a missing thumbnail is a missing thumbnail */ }
    }
  }
  return saved;
}

async function download(url, dir, failedHosts) {
  const ext = (url.split('?')[0].match(/\.(png|jpe?g|webp|gif|avif)$/i) || [, 'jpg'])[1].toLowerCase();
  const name = createHash('sha1').update(url).digest('hex').slice(0, 16) + '.' + ext;
  const file = path.join(dir, name);
  const rel = 'live/img/' + name;

  if (fs.existsSync(file)) return rel;

  try {
    const body = await get(url);
    if (!body.length) throw new Error('empty');
    fs.writeFileSync(file, body);
    return rel;
  } catch (err) {
    try { failedHosts.add(new URL(url).host); } catch (e) { failedHosts.add(url); }
    return null;
  }
}

function walk(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? walk(path.join(dir, e.name)) : 1;
  }
  return n;
}
