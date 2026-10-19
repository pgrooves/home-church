// Renders store-art/art.html to the App Store Connect header and search
// results PNGs. Run: node store-art/render.js [--guides]
//
// Needs Playwright (global or local) and Pillow for the flatten. App Store
// Connect rejects artwork with an alpha channel, so the PNGs go out as RGB.

const path = require('path');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }

const DIR = __dirname;
const guides = process.argv.includes('--guides');
const JOBS = [
  { kind: 'header', w: 3840, h: 1646, out: 'header-3840x1646.png' },
  { kind: 'search', w: 3840, h: 2560, out: 'search-results-3840x2560.png' },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--allow-file-access-from-files'],
  });
  for (const j of JOBS) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    const url = 'file://' + path.join(DIR, 'art.html') + '#' + j.kind + (guides ? '-guides' : '');
    await page.goto(url);
    await page.waitForSelector('body[data-ready="1"]');
    const out = path.join(DIR, guides ? j.out.replace('.png', '-guides.png') : j.out);
    await page.screenshot({ path: out, omitBackground: false });
    execFileSync('python3', ['-c',
      'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[1], optimize=True)', out]);
    console.log('wrote', path.relative(process.cwd(), out));
    await page.close();
  }
  await browser.close();
})();
