#!/usr/bin/env node
/*
 * Home Church, the launch screen iOS shows before the app's own splash.
 *
 * WHAT THIS DOES. Replaces the image in ios/App/App/Assets.xcassets/
 * Splash.imageset with plain paper: #F7F4EF, and #1A1918 when the phone is in
 * dark mode, the two values of --hc-paper in css/tokens.css. Runs as part of
 * `npm run ios`, after `npx cap sync ios`.
 *
 * WHY. That image set is Capacitor's own, from the template `npx cap add ios`
 * wrote, and nothing in this repo ever replaced it. So every launch opened on
 * Capacitor's artwork for half a second before js/splash.js put the house and
 * "Welcome home" up. The church's splash is the one in index.html; this
 * makes the native one a blank sheet of the same paper, so the first thing
 * anybody sees is the house arriving.
 *
 * WHY NOT DELETE IT. iOS requires a launch screen, and both the launch
 * storyboard and the @capacitor/splash-screen plugin draw the image named
 * "Splash". Making that image plain paper empties both without touching the
 * storyboard or the plugin.
 *
 * WHY A SCRIPT. ios/ is generated and gitignored, so a file dropped into it
 * by hand is gone the next time somebody runs `npx cap add ios`. Same lesson
 * as scripts/ios_plist.js.
 *
 *   node scripts/ios_splash.js            (as part of `npm run ios`)
 *
 * Does nothing, and says so, where there is no ios/. Idempotent: a second run
 * writes the same bytes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.dirname(__dirname);

/* Test-only, the same affordance as HC_INFO_PLIST in scripts/ios_plist.js:
   tests/ios-splash.test.js points this at a scratch directory rather than at
   a real ios/. Nothing in the build sets it. */
const IMAGESET = process.env.HC_SPLASH_IMAGESET ||
  path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');

const PAPER = [0xF7, 0xF4, 0xEF];     // --hc-paper, light
const CHARCOAL = [0x1A, 0x19, 0x18];  // --hc-paper, dark

/* Small, because it is one colour: the storyboard draws it aspect-fill over
   the whole screen, and a solid square scaled up is still a solid square. */
const SIDE = 64;

const CONTENTS = {
  images: [
    { idiom: 'universal', filename: 'splash-paper.png' },
    {
      idiom: 'universal',
      filename: 'splash-charcoal.png',
      appearances: [{ appearance: 'luminosity', value: 'dark' }]
    }
  ],
  info: { version: 1, author: 'xcode' }
};

/* A solid colour PNG, with no dependency. zlib.crc32 only arrived in Node 22
   and the build Mac may be older, so the checksum is computed here. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function solidPng(rgb, side) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // truecolour, no alpha
  const row = Buffer.alloc(1 + side * 3);   // filter byte 0, then pixels
  for (let x = 0; x < side; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array(side).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function main() {
  if (!fs.existsSync(path.dirname(IMAGESET))) {
    console.log('ios_splash: no ' + path.relative(ROOT, path.dirname(IMAGESET)) +
      ' here, nothing to do. Run `npx cap add ios` first on the build Mac.');
    return;
  }

  fs.mkdirSync(IMAGESET, { recursive: true });

  /* Everything else in the set goes, which is Capacitor's artwork. An image
     left in the folder but not named in Contents.json is a warning in Xcode
     and a file nobody can explain later. */
  const keep = CONTENTS.images.map((i) => i.filename).concat('Contents.json');
  fs.readdirSync(IMAGESET)
    .filter((f) => keep.indexOf(f) === -1)
    .forEach((f) => fs.rmSync(path.join(IMAGESET, f), { recursive: true, force: true }));

  fs.writeFileSync(path.join(IMAGESET, 'splash-paper.png'), solidPng(PAPER, SIDE));
  fs.writeFileSync(path.join(IMAGESET, 'splash-charcoal.png'), solidPng(CHARCOAL, SIDE));
  fs.writeFileSync(path.join(IMAGESET, 'Contents.json'), JSON.stringify(CONTENTS, null, 2) + '\n');

  console.log('ios_splash: the launch screen is plain paper, charcoal in dark mode.');
}

main();
