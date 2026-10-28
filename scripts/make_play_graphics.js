#!/usr/bin/env node
/*
 * Home Church, the two Google Play listing graphics that are not
 * screenshots.
 *
 *   play/icon-512.png        512 x 512, 32-bit PNG with alpha, which is what
 *                            Play asks for. The same square as the iOS and
 *                            web icon; Play rounds the corners itself, so
 *                            nothing is masked here.
 *   play/feature-graphic.png 1024 x 500, 24-bit PNG with no alpha, which is
 *                            what Play asks for. The banner across the top
 *                            of the listing.
 *
 * The feature graphic is drawn as a page and photographed, so it uses the
 * same bundled typefaces and the same lockup as the app rather than a second
 * copy of the brand that could drift. Google crops and overlays parts of it
 * in some layouts, so everything that matters sits in the middle and nothing
 * is near an edge.
 *
 *   node scripts/make_play_graphics.js
 *
 * Needs Playwright for the render, as scripts/make_screenshots.js does, and
 * nothing else.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'play');

const b64 = (...p) => fs.readFileSync(path.join(ROOT, ...p)).toString('base64');

/* The warm dark the icon is drawn on, --hc-dark in css/tokens.css, and the
   paper colour as the text on it, --hc-on-dark. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Manrope; font-weight: 200 800;
  src: url(data:font/woff2;base64,${b64('assets', 'fonts', 'manrope-latin.woff2')}) format('woff2'); }
html, body { margin: 0; width: 1024px; height: 500px; background: #1A1918; }
body { display: flex; flex-direction: column; align-items: center; justify-content: center; }
img { width: 600px; height: auto; }
p { margin: 34px 0 0; font: 500 30px/1.2 Manrope, sans-serif; letter-spacing: 0.01em; color: #F7F4EF; opacity: 0.82; }
</style></head><body>
<img src="data:image/png;base64,${b64('assets', 'img', 'logo-lockup.png')}" alt="">
<p>Sermons, guides, and a way in</p>
</body></html>`;

/* A PNG's colour type is byte 25 of the file: 2 is RGB, 6 is RGBA. Checked
   rather than trusted, because Play rejects the wrong one at upload. */
const colourType = (file) => fs.readFileSync(file)[25];

/* Re-encode an RGB PNG as RGBA with every pixel opaque, for the icon, using
   nothing but zlib: unfilter each scanline, add the alpha byte, write it back
   out unfiltered. Small file, done once. */
function rgbToRgba(input, output) {
  const buf = fs.readFileSync(input);
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 2) throw new Error(input + ' is not 8-bit RGB');
  const idat = [];
  for (let at = 8; at < buf.length;) {
    const len = buf.readUInt32BE(at), type = buf.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 3, out = Buffer.alloc(height * (1 + width * 4));
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? line[x - 3] : 0, b = prev[x], c = x >= 3 ? prev[x - 3] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = (line[x] + p) & 255;
    }
    const o = y * (1 + width * 4);
    for (let x = 0; x < width; x++) {
      line.copy(out, o + 1 + x * 4, x * 3, x * 3 + 3);
      out[o + 1 + x * 4 + 3] = 255;
    }
    prev = line;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(output, Buffer.concat([
    buf.subarray(0, 8), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]));
}

async function main() {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });

  const icon = path.join(OUT, 'icon-512.png');
  rgbToRgba(path.join(ROOT, 'assets', 'icons', 'icon-512.png'), icon);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(PAGE);
  await page.evaluate(() => document.fonts.ready);
  const feature = path.join(OUT, 'feature-graphic.png');
  await page.screenshot({ path: feature, omitBackground: false });
  await browser.close();

  const checks = [[icon, 6, '512 x 512, 32-bit with alpha'], [feature, 2, '1024 x 500, 24-bit, no alpha']];
  let bad = false;
  for (const [file, want, what] of checks) {
    const got = colourType(file);
    console.log((got === want ? 'ok    ' : 'WRONG ') + path.relative(ROOT, file) + '  ' + what);
    if (got !== want) bad = true;
  }
  process.exit(bad ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
