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
const WATCH = ['css', 'js'];

function walk(dir, out) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function stamp() {
  const hash = crypto.createHash('sha256');

  for (const name of WATCH) {
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

function main() {
  const check = process.argv.includes('--check');
  const want = stamp();

  const before = fs.readFileSync(INDEX, 'utf8');
  const after = before.replace(/(\?v=)[A-Za-z0-9]+/g, `$1${want}`);

  const found = before.match(/\?v=([A-Za-z0-9]+)/g) || [];
  const current = found.length ? found[0].slice(3) : '(none)';

  if (before === after) {
    console.log(`Already stamped ${want}, ${found.length} assets. Nothing to do.`);
    return;
  }

  if (check) {
    console.error(`Stamp is stale. index.html says ${current}, css/ and js/ hash to ${want}.`);
    console.error('Run: npm run stamp');
    process.exit(1);
  }

  fs.writeFileSync(INDEX, after);
  console.log(`Stamped ${found.length} assets: ${current} to ${want}`);
}

main();
