#!/usr/bin/env node
/*
 * Home Church, putting the narration where phones can reach it.
 *
 * WHAT THIS DOES. Uploads every mp3 that scripts/build_narration.py made into
 * the `narration` Storage bucket, then writes guides.narration so the app
 * knows which sections have audio. Two steps, in that order, because the
 * column is a promise that the file is there: write it first and every phone
 * that opens the guide in between draws a play button over nothing.
 *
 * WHAT IT NEEDS. The service role key, not the anon key. The bucket has a
 * public read policy and no write policy at all (migration 0046), so the
 * service role is the only writer by design. Never put this key in the app.
 *
 *   export SUPABASE_URL=https://xxxx.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   node scripts/upload_narration.js
 *
 *   node scripts/upload_narration.js --dry-run    say what would happen
 *
 * Safe to re-run. Uploads use upsert, and the column is rewritten from the
 * manifest each time, so a section whose text changed and was regenerated
 * replaces its file and its hash together.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run');
const DIR = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : 'narration';

function die(msg) { console.error(msg); process.exit(1); }

if (!DRY && (!URL_BASE || !KEY)) {
  die('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --dry-run.\n' +
      'The service role key is under Project Settings -> API. It is not the anon key,\n' +
      'and it must never end up in js/config.js.');
}

const manifestPath = path.join(DIR, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  die('No ' + manifestPath + '. Run scripts/build_narration.py first.');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const headers = {
  apikey: KEY,
  Authorization: 'Bearer ' + KEY
};

async function upload(objectPath, file) {
  const body = fs.readFileSync(file);
  const res = await fetch(
    URL_BASE + '/storage/v1/object/narration/' + objectPath,
    {
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Type': 'audio/mpeg',
        // Replace rather than fail when the file is already there, which is
        // the normal case for a regenerated section.
        'x-upsert': 'true'
      }),
      body: body
    }
  );
  if (!res.ok) throw new Error(objectPath + ': ' + res.status + ' ' + (await res.text()));
  return body.length;
}

async function patchGuide(guideId, sections) {
  const res = await fetch(
    URL_BASE + '/rest/v1/guides?id=eq.' + encodeURIComponent(guideId),
    {
      method: 'PATCH',
      headers: Object.assign({}, headers, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify({ narration: sections })
    }
  );
  if (!res.ok) throw new Error(guideId + ': ' + res.status + ' ' + (await res.text()));
}

async function main() {
  let files = 0, bytes = 0, guides = 0;

  for (const guideId of Object.keys(manifest)) {
    const sections = manifest[guideId];
    const ids = Object.keys(sections);
    if (!ids.length) continue;

    for (const sectionId of ids) {
      const row = sections[sectionId];
      const local = path.join(DIR, row.path);
      if (!fs.existsSync(local)) {
        die('Manifest names ' + row.path + ' but it is not on disk. Re-run build_narration.py.');
      }
      if (DRY) {
        console.log('  would upload  ' + row.path + '  ' + Math.round(row.bytes / 1024) + ' KB');
        bytes += row.bytes;
      } else {
        bytes += await upload(row.path, local);
        console.log('  uploaded      ' + row.path);
      }
      files++;
    }

    if (DRY) {
      console.log('  would set     ' + guideId + '.narration  (' + ids.length + ' sections)');
    } else {
      await patchGuide(guideId, sections);
      console.log('  set           ' + guideId + '.narration');
    }
    guides++;
  }

  console.log('\n' + (DRY ? 'Dry run. ' : '') +
    files + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB, ' + guides + ' guides.');
  if (DRY) console.log('Nothing was uploaded and no row was changed.');
}

main().catch((e) => die(String(e.message || e)));
