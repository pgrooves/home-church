#!/usr/bin/env node
/*
 * Home Church, the launch screen iOS shows before the app has loaded.
 *
 * WHAT THIS DOES. Writes ios/App/App/Assets.xcassets/Splash.imageset: a plain
 * paper image for light mode and a plain charcoal one for dark, the same two
 * colours as --hc-paper in css/tokens.css. Runs as part of `npm run ios`, so
 * there is nothing to drag into Xcode and nothing to remember.
 *
 * WHY IT EXISTS. `npx cap add ios` fills that image set with Capacitor's own
 * logo, the blue X, and version 1.0 shipped to the App Store with it. Every
 * fresh download flashed somebody else's logo for a moment before the welcome
 * screen in js/splash.js took over. The welcome screen already carries the
 * gold house, so the native screen is deliberately blank: the same paper the
 * welcome screen paints, so the handoff between them is invisible.
 *
 * WHY THE PHONE'S SETTING AND NOT THE PROFILE TOGGLE. iOS draws this before
 * any of the app's code runs, so all it can follow is the system appearance.
 * The Profile toggle defaults to 'system', so for most people the two agree.
 *
 * WHY NO PILLOW. A solid colour PNG is a few lines of zlib, and this runs on
 * every `npm run ios`, where a missing Python package would stop a build.
 *
 *   node scripts/ios_splash.js            (as part of `npm run ios`)
 *
 * Does nothing, and says so, where there is no ios/.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.dirname(__dirname);
const SET = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');

// Capacitor's launch storyboard fills the screen with this image, so one
// square big enough for the largest iPad covers every phone too.
const SIZE = 2732;

const LIGHT = [0xF7, 0xF4, 0xEF];  // --hc-paper
const DARK = [0x1A, 0x19, 0x18];   // --hc-paper, dark

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function solidPng(rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // truecolour, no alpha
  const row = Buffer.alloc(1 + SIZE * 3);
  for (let x = 0; x < SIZE; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.alloc(row.length * SIZE);
  for (let y = 0; y < SIZE; y++) row.copy(raw, y * row.length);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (!fs.existsSync(path.join(ROOT, 'ios'))) {
  console.log('ios_splash: no ios/ folder here, nothing to do.');
  process.exit(0);
}

fs.mkdirSync(SET, { recursive: true });

// Clear out Capacitor's logo files so Xcode is not left holding stray images.
for (const f of fs.readdirSync(SET)) fs.unlinkSync(path.join(SET, f));

const light = solidPng(LIGHT);
const dark = solidPng(DARK);
const images = [];
for (const scale of ['1x', '2x', '3x']) {
  const lightName = `splash-${scale}.png`;
  const darkName = `splash-dark-${scale}.png`;
  fs.writeFileSync(path.join(SET, lightName), light);
  fs.writeFileSync(path.join(SET, darkName), dark);
  images.push({ idiom: 'universal', filename: lightName, scale });
  images.push({
    idiom: 'universal',
    filename: darkName,
    scale,
    appearances: [{ appearance: 'luminosity', value: 'dark' }],
  });
}
fs.writeFileSync(path.join(SET, 'Contents.json'),
  JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n');

console.log('ios_splash: launch screen set to plain paper (light) and charcoal (dark).');
