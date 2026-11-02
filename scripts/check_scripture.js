#!/usr/bin/env node
/* ==========================================================================
   Home Church, will every scripture on this guide open?

   Reads a guide's JSON (the file /new-guide and /new-sermon upsert) and runs
   each `scriptures[].reference` and `closing_scripture.reference` through
   the same reader the app uses, js/bible.js. Prints what each one opens as
   in the verse sheet, and exits 1 if any of them will not open there.

     node scripts/check_scripture.js /tmp/guide-your-slug.json
     node scripts/check_scripture.js --refs "Genesis 39:20-40:23; Numbers 13-14"

   What fails:
     a reference the app cannot read at all, which sends people out of the
       app to a bible.com search instead ("2 Samuel 11 & 12", "Gen 39ff")
     part of a reference that does not read, which is quietly dropped from
       the sheet ("Romans 12:1-2 & 9")
     a passage that runs across more than ten chapters, which the Bible
       function will not fetch in one go (MAX_CHAPTERS in
       supabase/functions/bible-passage)

   No network, so it says nothing about whether YouVersion has the words.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MAX_CHAPTERS = 10;

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'bible.js'), 'utf8'), sandbox);
const B = sandbox.window.HC.bible;

function refsFrom(args) {
  if (args[0] === '--refs') {
    return args.slice(1).join(' ').split(/\s*\n\s*/).filter(Boolean)
      .map((r) => ({ where: 'reference', reference: r }));
  }
  const out = [];
  args.forEach((file) => {
    const guide = JSON.parse(fs.readFileSync(file, 'utf8'));
    (guide.scriptures || []).forEach((s, i) => {
      out.push({ where: `scriptures[${i}]`, reference: s && s.reference });
    });
    if (guide.closing_scripture) {
      out.push({ where: 'closing_scripture', reference: guide.closing_scripture.reference });
    }
  });
  return out;
}

function check(reference) {
  const text = String(reference || '').trim();
  if (!text) return { problem: 'empty' };
  const pieces = text.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const passages = B.parseAll(text);
  if (!passages.length) {
    return { problem: 'the app cannot read this, so it opens a bible.com search instead' };
  }
  if (passages.length < pieces.length) {
    return { problem: 'part of this does not read and would be left out: write each passage ' +
      'as Book chapter:verse, separated by semicolons', passages };
  }
  const long = passages.find((p) => p.toChapter - p.chapter + 1 > MAX_CHAPTERS);
  if (long) {
    return { problem: `${B.label(long)} runs across more than ${MAX_CHAPTERS} chapters, ` +
      'too long for the verse sheet', passages };
  }
  return { passages };
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: node scripts/check_scripture.js <guide.json> | --refs "<reference>"');
  process.exit(2);
}

let bad = 0;
refsFrom(args).forEach(({ where, reference }) => {
  const got = check(reference);
  const opens = (got.passages || []).map((p) => `${B.label(p)} (${B.usfm(p)})`).join(', ');
  if (got.problem) {
    bad++;
    console.log(`FIX   ${where}: "${reference || ''}"\n        ${got.problem}`);
  } else {
    console.log(`OK    ${where}: "${reference}" opens ${opens}`);
  }
});

console.log(bad ? `\n${bad} reference${bad === 1 ? '' : 's'} to fix.` : '\nEvery reference opens.');
process.exit(bad ? 1 : 0);
