#!/usr/bin/env node
/* ===========================================================================
   Stage the app where Remotion can run it.

   WHY A COPY AND NOT A RECORDING. The video is not a slideshow of stills. Every
   frame of app footage in it is the real app, running live inside the
   composition, driven one frame at a time. Remotion serves `public/` at the
   root of its bundle, so the app has to be inside `public/` for an iframe to
   reach it. This copies the six things index.html actually loads and nothing
   else.

   WHAT IT CHANGES ON THE WAY IN. One file: js/config.js, emptied.

   That is not a shortcut, it is the whole reason the render is reproducible.
   With Supabase keys in it the app opens a gate, asks the network for this
   week's content, and paints whatever came back. Three renders would give
   three different videos and none of them would survive a plane. Emptied, the
   app runs exactly as it runs on a phone that has never signed in: no gate,
   no network, everything read from the seed bundled in js/data.js. Same code,
   same CSS, same typefaces. The only thing that changed is where the words
   came from, and they came from the app's own copy of them.

     node prepare.mjs

   Writes to public/app/, which is gitignored. Run it before the studio and
   before a render; both npm scripts already do.
   =========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
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

   The keys are gone on purpose. See the header of video/prepare.mjs: an app
   with credentials in it is an app that phones home mid render, and a video
   that is different every time it is made. */

(function (HC) {
  'use strict';

  HC.config = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: ''
  };

})(window.HC = window.HC || {});
`;

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

fs.writeFileSync(path.join(OUT, 'js', 'config.js'), EMPTY_CONFIG);

console.log(`prepare: ${files} files into public/app, config.js emptied.`);

function walk(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? walk(path.join(dir, e.name)) : 1;
  }
  return n;
}
