/* ===========================================================================
   scripts/ios_splash.js, the script that turns Capacitor's launch artwork
   into plain paper.

   Run against a scratch Assets.xcassets laid out the way `npx cap add ios`
   leaves it, because the real ios/ only exists on the build Mac. Held still:
   Capacitor's files are gone, the two images are the two papers, dark mode
   is wired to the charcoal one, and a second run changes nothing.
   =========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'ios_splash.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

function run(imageset) {
  return execFileSync('node', [SCRIPT], {
    env: Object.assign({}, process.env, { HC_SPLASH_IMAGESET: imageset }),
    encoding: 'utf8'
  });
}

// The colour of the first pixel, read back out of the PNG the long way.
function firstPixel(file) {
  const png = fs.readFileSync(file);
  const idat = [];
  let at = 8;
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-splash-'));
const assets = path.join(tmp, 'Assets.xcassets');
const imageset = path.join(assets, 'Splash.imageset');

console.log('\n--- no ios/ ---\n');

ok('with no Assets.xcassets it does nothing and says so',
   /nothing to do/.test(run(imageset)), true);
ok('and creates nothing', fs.existsSync(imageset), false);

console.log('\n--- the Capacitor template ---\n');

fs.mkdirSync(imageset, { recursive: true });
['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png', 'Contents.json']
  .forEach((f) => fs.writeFileSync(path.join(imageset, f), 'capacitor'));

run(imageset);

ok('Capacitor\'s artwork is gone, and only the two papers are left',
   fs.readdirSync(imageset).sort(),
   ['Contents.json', 'splash-charcoal.png', 'splash-paper.png']);
ok('the light image is --hc-paper',
   firstPixel(path.join(imageset, 'splash-paper.png')), [0xF7, 0xF4, 0xEF]);
ok('the dark image is the dark --hc-paper',
   firstPixel(path.join(imageset, 'splash-charcoal.png')), [0x1A, 0x19, 0x18]);

const contents = JSON.parse(fs.readFileSync(path.join(imageset, 'Contents.json'), 'utf8'));
ok('Contents.json names the paper for the default appearance',
   contents.images.filter((i) => !i.appearances).map((i) => i.filename), ['splash-paper.png']);
ok('and the charcoal for dark mode',
   contents.images.filter((i) => i.appearances && i.appearances[0].value === 'dark')
     .map((i) => i.filename), ['splash-charcoal.png']);

console.log('\n--- again ---\n');

const before = fs.readdirSync(imageset).map((f) => fs.readFileSync(path.join(imageset, f), 'hex'));
run(imageset);
const after = fs.readdirSync(imageset).map((f) => fs.readFileSync(path.join(imageset, f), 'hex'));
ok('a second run writes the same bytes', after, before);

fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
