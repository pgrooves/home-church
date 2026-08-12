#!/usr/bin/env node
/*
 * Home Church, stamp the cache busting numbers.
 *
 * THE PROBLEM THIS SOLVES. Every local asset in index.html carries ?v=N, and
 * bumping it by hand is a step in two process documents and easy to forget.
 * Forgetting it is not loud: the app keeps working, it just serves last
 * week's JavaScript from cache to a returning phone, and Safari holds on
 * hardest. So the failure mode is somebody swearing that a fix did not ship
 * when it shipped fine.
 *
 * WHAT THIS DOES. Hashes the contents of css/ and js/, takes the first eight
 * characters, and writes it into every ?v= in index.html. Same content means
 * the same stamp, so running it twice changes nothing and the diff stays
 * quiet. Different content means every asset gets a new URL at once, which is
 * what you want, because these files are loaded as one set and a half updated
 * app is worse than a stale one.
 *
 * It replaces a number with a hash. ?v=9 becomes ?v=a3f1c802. Nothing cares
 * what is in there as long as it changes.
 *
 * THE SECOND STAMP. Icons carry ?i= instead, hashed from assets/icons/ and
 * written into index.html and manifest.webmanifest. They need their own stamp
 * because they change on their own schedule: the app icon was redrawn from
 * paper-colored to dark, kept its filename, and kept the css/js stamp with it,
 * so the URL never moved and Safari kept serving the old picture from a cache
 * that outlives the page cache and survives private browsing. Art moves, ?i=
 * moves. Code moves, ?v= moves. Neither one speaks for the other.
 *
 * USAGE
 *   node scripts/stamp_assets.js          stamp, and say what changed
 *   node scripts/stamp_assets.js --check  exit 1 if stamping is needed
 *
 * The --check form is for a future git hook or CI step. It never writes.
 *
 * No dependencies, standard library only.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.dirname(__dirname);
const INDEX = path.join(ROOT, 'index.html');
const MANIFEST = path.join(ROOT, 'manifest.webmanifest');
const WATCH = ['css', 'js'];
const ICON_WATCH = ['assets/icons'];

function walk(dir, out) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function stamp(dirs) {
  const hash = crypto.createHash('sha256');

  for (const name of dirs) {
    const dir = path.join(ROOT, name);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir, [])) {
      // Path as well as contents, so renaming a file changes the stamp even
      // when the bytes are identical.
      hash.update(path.relative(ROOT, file));
      hash.update(fs.readFileSync(file));
    }
  }

  return hash.digest('hex').slice(0, 8);
}

// One token in one string. Text in, text out, so index.html can take the ?v=
// pass and the ?i= pass one after the other without either one writing over
// the other's work. Reporting is separate from writing because --check has to
// look at everything before it decides to fail.
function restamp(text, token, want) {
  const pattern = new RegExp(`(\\?${token}=)[A-Za-z0-9]+`, 'g');
  const found = text.match(pattern) || [];
  const value = (m) => m.slice(token.length + 2);

  return {
    count: found.length,
    current: found.length ? value(found[0]) : '(none)',
    want: want,
    text: text.replace(pattern, `$1${want}`),
    stale: found.some((m) => value(m) !== want),
  };
}

function main() {
  const check = process.argv.includes('--check');
  const code = stamp(WATCH);
  const art = stamp(ICON_WATCH);

  // file, token, wanted stamp. index.html appears twice on purpose.
  const jobs = [
    [INDEX, 'v', code],
    [INDEX, 'i', art],
    [MANIFEST, 'i', art],
  ];

  const texts = new Map();
  const done = [];

  for (const [file, token, want] of jobs) {
    if (!texts.has(file)) texts.set(file, fs.readFileSync(file, 'utf8'));
    const pass = restamp(texts.get(file), token, want);
    texts.set(file, pass.text);
    done.push(Object.assign({ file: file, token: token }, pass));
  }

  const stale = done.filter((p) => p.stale);

  if (!stale.length) {
    const n = done.reduce((sum, p) => sum + p.count, 0);
    console.log(`Already stamped, code ${code} and icons ${art}, ${n} assets. Nothing to do.`);
    return;
  }

  if (check) {
    for (const p of stale) {
      console.error(`Stamp is stale. ${path.basename(p.file)} ?${p.token}= says ${p.current}, wants ${p.want}.`);
    }
    console.error('Run: npm run stamp');
    process.exit(1);
  }

  for (const [file, text] of texts) fs.writeFileSync(file, text);
  for (const p of stale) {
    console.log(`${path.basename(p.file)} ?${p.token}=: ${p.count} assets, ${p.current} to ${p.want}`);
  }
}

main();
