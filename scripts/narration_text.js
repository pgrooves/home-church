#!/usr/bin/env node
/*
 * Home Church, what the narrator actually says.
 *
 * WHAT THIS IS FOR. Turning a guide row into six blocks of speakable prose,
 * one per section of the reader, and hashing each one so the publishing
 * script knows which recordings are still true.
 *
 * WHY IT IS NODE AND NOT PYTHON. The speech model is Python and there is no
 * getting around that. This part is not: it is text handling, it is where the
 * wrong answers will be, and this repo tests its guessy code in tests/. So
 * the split is that Node decides every word that gets spoken, writes it to a
 * file, and Python reads that file and says it. scripts/build_narration.py
 * makes no editorial decisions at all.
 *
 * THE PART THAT MATTERS. A scripture reference is written to be read with the
 * eyes. "2 Samuel 11:1-27" is four tokens a person resolves instantly and a
 * speech model reads as "two Samuel eleven colon one dash twenty seven".
 * Everything in normalize() below exists because of that gap. It is the
 * difference between a guide being read to you and a database being read at
 * you, and it is worth more than any amount of voice tuning.
 *
 *   node scripts/narration_text.js                 # from Supabase, or the seed
 *   node scripts/narration_text.js --out text.json
 *
 * Writes narration-text.json by default, which build_narration.py consumes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* --------------------------------------------------------------- sections
   The ids are not free. They are the same strings c.collapsible() is given in
   js/screens/guide.js, which are the same strings the app looks up in
   guides.narration when it decides whether to draw a play button. Rename one
   here and the button silently stops appearing on that section. */

const SECTIONS = [
  'short-summary',
  'full-summary',
  'group',
  'reflection',
  'oneliners',
  'scripture'
];

/* ------------------------------------------------------------ book names
   Only the numbered books need help; "John" reads correctly on its own.
   Written as ordinals because that is how they are said out loud in a room,
   nobody says "two Samuel". */

const BOOKS = {
  '1 Samuel': 'First Samuel',    '2 Samuel': 'Second Samuel',
  '1 Sam': 'First Samuel',       '2 Sam': 'Second Samuel',
  '1 Kings': 'First Kings',      '2 Kings': 'Second Kings',
  '1 Chronicles': 'First Chronicles', '2 Chronicles': 'Second Chronicles',
  '1 Corinthians': 'First Corinthians', '2 Corinthians': 'Second Corinthians',
  '1 Cor': 'First Corinthians',  '2 Cor': 'Second Corinthians',
  '1 Thessalonians': 'First Thessalonians', '2 Thessalonians': 'Second Thessalonians',
  '1 Timothy': 'First Timothy',  '2 Timothy': 'Second Timothy',
  '1 Peter': 'First Peter',      '2 Peter': 'Second Peter',
  '1 John': 'First John',        '2 John': 'Second John',
  '3 John': 'Third John'
};

/* Spoken forms for a reference. Order matters inside normalize(): the ranged
   form has to run before the single form or "11:1-27" loses its range and
   becomes "chapter 11 verse 1" followed by a stray "-27". */
function normalize(text) {
  if (!text) return '';
  let out = String(text);

  // Numbered books first, longest key first so "1 Corinthians" is not
  // half-eaten by a "1 Cor" rule that happens to sort earlier.
  Object.keys(BOOKS)
    .sort((a, b) => b.length - a.length)
    .forEach((key) => {
      out = out.replace(new RegExp('\\b' + key.replace(/ /g, '\\s+') + '\\b', 'g'), BOOKS[key]);
    });

  // 11:1-27 and 11:1–27, hyphen or en dash.
  out = out.replace(/(\d+):(\d+)\s*[-–—]\s*(\d+)/g, 'chapter $1, verses $2 to $3');
  // 11:1
  out = out.replace(/(\d+):(\d+)/g, 'chapter $1, verse $2');
  // "2 Samuel 11 & 12", and any other ampersand, which a model reads as
  // nothing at all rather than as a word.
  out = out.replace(/\s+&\s+/g, ' and ');
  // A chapter range with no verses: "2 Samuel 11-12".
  out = out.replace(/\bchapters?\s+(\d+)\s*[-–—]\s*(\d+)/gi, 'chapters $1 to $2');

  /* An em dash is against the house style and should never appear in a guide
     (NEW_GUIDE_PROCESS.md, voice rules). If one gets through anyway, it reads
     as a hard stop rather than as silence, which is closer to the intent than
     letting the model swallow it. */
  out = out.replace(/\s*[—–]\s*/g, ', ');

  // Collapse the whitespace the joins above leave behind.
  return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------------------------------------------ the sections
   Each returns the spoken text for one section, headed by the same words the
   reader prints above it, so somebody listening with the phone in a pocket
   knows which part they are in. */

function sectionText(guide, id, title) {
  const head = (s) => (title ? title + '. ' + s + '.\n\n' : s + '.\n\n');
  const list = (a) => (a || []).join('\n\n');

  switch (id) {
    case 'short-summary':
      return head('Overview') + list(guide.shortSummary);

    case 'full-summary': {
      let body = head('Sermon Summary') + list(guide.fullSummary);
      const anchors = guide.anchors || [];
      if (anchors.length) {
        body += '\n\nWhere it went.\n\n' +
          anchors.map((a) => a.label + '. ' + a.body).join('\n\n');
      }
      return body;
    }

    case 'group':
      return head('Discussion Questions') +
        (guide.groupSections || [])
          .map((s) => s.heading + '.\n\n' + (s.questions || []).join('\n\n'))
          .join('\n\n');

    case 'reflection':
      return head('Self-Reflection Questions') + list(guide.reflectionQuestions);

    case 'oneliners':
      return head('Impactful One-Liners') + list(guide.oneLiners);

    case 'scripture':
      return head('Scripture Index') +
        (guide.scriptures || [])
          .map((s) => (s.reference || '') + '. ' + (s.note || ''))
          .join('\n\n');

    default:
      return '';
  }
}

/* The hash covers the spoken text, after normalisation, not the row. Two
   edits that produce the same words, a trailing space removed, an ampersand
   spelled out by hand, should not force a regeneration; an edit that changes
   a single question must. Truncated because it is a change detector, not a
   security boundary. */
function hash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

/* A section with no content is not narrated. An empty recording is worse than
   an absent one: the button appears, somebody presses it, nothing happens. */
function isSpeakable(text) {
  const body = text.split('\n\n').slice(1).join(' ').trim();
  return body.length > 0;
}

function build(guide, title) {
  const sections = [];
  SECTIONS.forEach((id) => {
    const raw = sectionText(guide, id, title);
    const text = normalize(raw);
    if (!isSpeakable(text)) return;
    sections.push({ id: id, text: text, hash: hash(text), words: text.split(/\s+/).length });
  });
  return { guideId: guide.id, title: title || guide.id, sections: sections };
}

/* ------------------------------------------------------------------ input
   Supabase when it is reachable, the seed in js/data.js when it is not. The
   seed is three complete guides, which is enough to run the whole pipeline
   offline, and it is what a fresh clone has before anybody hands it a key. */

/* The project the app itself talks to. js/config.js holds the URL and the
   publishable anon key, which is safe in client code and safe here, and
   guides are publicly readable (migration 0001), so reading them needs
   nothing else.

   THIS IS NOT A CONVENIENCE. Without it the script needs two environment
   variables that nothing else in this repo needs, and a run that does not
   have them falls back to the seed in js/data.js and narrates whatever is in
   there. The seed is three guides. Supabase has six. Nobody would see the
   difference: the script would succeed, print a smaller number than anyone
   was counting, and three published guides would quietly have no play
   buttons. */
function configured() {
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
    const url = (src.match(/SUPABASE_URL:\s*'([^']*)'/) || [])[1];
    const key = (src.match(/SUPABASE_ANON_KEY:\s*'([^']*)'/) || [])[1];
    return url && key ? { url: url, key: key } : null;
  } catch (e) {
    return null;
  }
}

/* Why this is noisier than it looks. Every one of these failures used to be
   the same silent `return null`, and the seed fallback below made that look
   like success: the script printed a smaller guide count and carried on. Two
   separate sessions burned a model download chasing that. A refused proxy, a
   revoked key and an unreachable host are three different fixes, so they get
   three different lines. */
function say(what) {
  console.log('  could not read Supabase, falling back to the seed: ' + what);
}

function host(u) {
  try { return new URL(u).host; } catch (e) { return String(u); }
}

/* A non-ok response is not an exception. The egress proxy answers a blocked
   host with a perfectly well-formed 403, so `r.ok` is false while nothing
   throws, which is exactly how this hid. Read the body: the proxy names the
   host it refused, and PostgREST names the column or the key it rejected. */
async function get(endpoint, key, onFail) {
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).trim().slice(0, 300);
    say('HTTP ' + res.status + ' from ' + host(endpoint) +
        (body ? ', ' + body : ''));
    return onFail;
  }
  return res.json();
}

async function fromSupabase() {
  const fallback = configured() || {};
  const url = process.env.SUPABASE_URL || fallback.url;
  const key = process.env.SUPABASE_ANON_KEY ||
              process.env.SUPABASE_SERVICE_ROLE_KEY ||
              fallback.key;
  if (!url || !key) return null;
  try {
    const [guides, podcasts] = await Promise.all([
      get(url + '/rest/v1/guides?select=*', key, null),
      get(url + '/rest/v1/podcasts?select=id,title', key, [])
    ]);
    if (!Array.isArray(guides)) return null;
    const titles = {};
    (podcasts || []).forEach((p) => { titles[p.id] = p.title; });
    return guides.map((r) => ({
      guide: {
        id: r.id,
        shortSummary: r.short_summary || [],
        fullSummary: r.full_summary || [],
        anchors: r.anchors || [],
        groupSections: r.group_sections || [],
        reflectionQuestions: r.reflection_questions || [],
        oneLiners: r.one_liners || [],
        scriptures: r.scriptures || []
      },
      title: r.theme_title || titles[r.sermon_id] || r.id
    }));
  } catch (e) {
    say('could not reach ' + host(url) + ', ' + (e.message || e));
    return null;
  }
}

function fromSeed() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
  const sandbox = { window: { HC: {} } };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(sandbox.window);
  const d = sandbox.window.HC.data;
  return d.guides.map((g) => {
    const sermon = (d.sermons || []).find((s) => s.id === g.sermonId);
    return { guide: g, title: g.themeTitle || (sermon && sermon.title) || g.id };
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const outAt = argv.indexOf('--out');
  const out = outAt >= 0 ? argv[outAt + 1] : 'narration-text.json';

  let rows = await fromSupabase();
  const source = rows ? 'supabase' : 'seed';
  if (!rows) rows = fromSeed();

  const guides = rows.map((r) => build(r.guide, r.title));
  const words = guides.reduce(
    (a, g) => a + g.sections.reduce((b, s) => b + s.words, 0), 0);

  fs.writeFileSync(out, JSON.stringify({ source: source, guides: guides }, null, 1));

  console.log('source        ' + source);
  console.log('guides        ' + guides.length);
  console.log('sections      ' + guides.reduce((a, g) => a + g.sections.length, 0));
  console.log('words         ' + words);
  console.log('est. audio    ' + (words / 150).toFixed(1) + ' min');
  console.log('wrote         ' + out);

  /* Loud, because the quiet version of this is the whole failure. The seed is
     the cold start catalogue, not the real one, and a run that fell back to
     it has just decided that half the published guides get no play button. */
  if (source === 'seed') {
    console.log('');
    console.log('  WARNING. This came from the seed in js/data.js, not from Supabase,');
    console.log('  which means it is whatever the repo shipped rather than what the');
    console.log('  church has published. Every guide missing from the seed will end up');
    console.log('  with no play buttons, silently. Check your connection, or set');
    console.log('  SUPABASE_URL and SUPABASE_ANON_KEY, and run this again before');
    console.log('  generating any audio.');
  }
}

module.exports = { SECTIONS, BOOKS, normalize, sectionText, hash, isSpeakable, build, configured };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
