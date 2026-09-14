/* ===========================================================================
   js/pdf.js and js/print-pdf.js, which together are the file a leader gets.

   WHY THIS FILE IS WORTH ITS LENGTH. Everything else the app produces is
   looked at by somebody the moment it is made: a screen that draws wrong is
   wrong in front of you. A PDF leaves the app. It is written into the cache
   directory, handed to the share sheet, and opened somewhere else entirely,
   which means a document that is subtly malformed comes back as "the file
   would not open", from a person who cannot tell you why, a day later. That
   is the exact shape of the bug this whole feature exists to fix, and the
   only way not to ship it again is to check the bytes here.

   So four things are tested, in this order:

     the file        every offset in the cross reference table, because that
                     is the one part a reader refuses outright to guess at
     the metrics     Adobe's own numbers, spot checked, since every line
                     break in every document is computed from them
     the encoding    what happens to a curly quote, and to an emoji somebody
                     put in their journal
     the layout      that nothing any of the three documents draws lands
                     outside the margins of the page it is drawn on

   The last one is the interesting one. It re-reads the finished content
   streams, measures every line of text the document actually contains, and
   fails if any of them runs off the paper. That catches the whole family of
   bugs where a heading, an indent, or a bullet is wrapped to one width and
   drawn at another, which is invisible in any assertion about page counts.

   No browser and no data.js. The guide below is a small made up one: the
   point is the geometry, and real content would only tie this file to what
   the church happened to publish this week.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

/* ---------------------------------------------------------------- loading */

const sandbox = { console: console, Buffer: Buffer, Uint8Array: Uint8Array, window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

for (const file of ['js/pdf.js', 'js/print-pdf.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}

const HC = sandbox.window.HC;

/* The two helpers print-pdf.js reaches for, and nothing else. Both are copies
   of the real ones in js/components.js, small enough that a copy is honest. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

HC.components = {
  formatDate(iso) {
    const p = String(iso).split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  },
  byline(name, iso) {
    return [name, iso ? HC.components.formatDate(iso) : ''].filter(Boolean).join(', ');
  }
};

const LONG = 'David is at the lowest point of his life and the people closest to him have ' +
  'turned, which is the sort of sentence that has to wrap more than once to be worth ' +
  'anything as a test of wrapping. ';

const GUIDE = {
  id: 'guide-test',
  seriesId: 'series-test',
  sermonId: 'sermon-test',
  subtitle: 'What nine forgotten names teach you about the friends you actually need',
  shortSummary: [LONG.repeat(3), LONG.repeat(2)],
  fullSummary: [LONG.repeat(4), LONG.repeat(4), LONG.repeat(4), LONG.repeat(4)],
  anchors: [
    { label: 'Constant', body: LONG },
    { label: 'Keeps it real', body: LONG.repeat(2) }
  ],
  groupSections: [
    { heading: 'Getting started', questions: [LONG, 'Short one?'] },
    { heading: 'Arm’s length', questions: [LONG.repeat(2)] }
  ],
  reflectionQuestions: [LONG, 'And a short one, for the contrast.'],
  oneLiners: ['Friends are not optional. They are essential.', LONG],
  scriptures: [
    { reference: '2 Samuel 15:19-21', note: LONG },
    { reference: 'Proverbs 18:24', note: 'Short.' }
  ],
  closingScripture: { text: 'One who has unreliable friends soon comes to ruin.', reference: 'Proverbs 18:24' }
};

HC.data = {
  church: { websiteUrl: 'https://www.homechurchnola.com' },
  getGuide: id => (id === GUIDE.id ? GUIDE : null),
  getSeries: () => ({ title: 'The Life of David' }),
  guideTitle: () => 'Who’s In Your Corner?',
  guideMeta: () => ({
    title: 'Who’s In Your Corner?',
    preacher: 'Stephen Daigle',
    preachedOn: '2026-08-09',
    passage: '2 Samuel 15-19'
  })
};

/* ------------------------------------------------------------ the writer */

const doc = HC.pdf.create();
doc.page().text('Hello', 72, 100, { size: 12 });
doc.page().rect(0, 0, 612, 792, '#F7F4EF');
const simple = doc.build();

ok('a PDF says it is one', simple.slice(0, 8), '%PDF-1.4');
ok('and says where it ends', simple.trim().slice(-5), '%%EOF');
ok('two pages, two page objects', (simple.match(/\/Type \/Page[^s]/g) || []).length, 2);
ok('the page tree counts them', /\/Count (\d+)/.exec(simple)[1], '2');

/* THE CROSS REFERENCE TABLE IS THE FILE. A reader opens a PDF by reading the
   last line, jumping to the offset it names, and trusting every byte offset
   in the table it finds there. One wrong number and nothing opens, with no
   clue as to which object was wrong, so every offset is checked against what
   is actually at it. */
function xrefOffsets(pdf) {
  const start = Number(/startxref\s+(\d+)/.exec(pdf)[1]);
  const table = pdf.slice(start);
  const rows = table.match(/^(\d{10}) 00000 n $/gm) || [];
  return { start, table, offsets: rows.map(r => Number(r.slice(0, 10))) };
}

const xref = xrefOffsets(simple);
ok('startxref points at the table', simple.slice(xref.start, xref.start + 4), 'xref');
ok('one row per object', xref.offsets.length, (simple.match(/^\d+ 0 obj$/gm) || []).length);
ok('every offset lands on its object',
  xref.offsets.every((offset, i) => simple.slice(offset).indexOf((i + 1) + ' 0 obj\n') === 0), true);

// A stream whose /Length lies is the other way a reader gives up.
const lengths = [...simple.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
ok('every stream is as long as it claims',
  lengths.every(m => Number(m[1]) === m[2].length), true);

ok('base64 comes back as the same bytes',
  Buffer.from(doc.toBase64(), 'base64').toString('binary'), simple);

/* ------------------------------------------------------------- the metrics
   Adobe's own numbers for the standard fourteen, spot checked. If these ever
   drift, every line break in every document drifts with them. */

ok('Times-Roman capital A', HC.pdf.measure('A', 'Times-Roman', 1000), 722);
ok('Times-Roman space', HC.pdf.measure(' ', 'Times-Roman', 1000), 250);
ok('Helvetica capital A', HC.pdf.measure('A', 'Helvetica', 1000), 667);
ok('an em dash is a full em in Times', HC.pdf.measure('—', 'Times-Roman', 1000), 1000);
ok('tracking counts between the letters, not after the last',
  HC.pdf.measure('AA', 'Times-Roman', 1000, 100) - HC.pdf.measure('AA', 'Times-Roman', 1000), 100);

const wrapped = HC.pdf.wrap(LONG.repeat(2), 'Times-Roman', 11, 200);
ok('wrapping produces more than one line', wrapped.length > 1, true);
ok('and no line is wider than it was told',
  wrapped.every(line => HC.pdf.measure(line, 'Times-Roman', 11) <= 200), true);
ok('wrapping loses no words',
  wrapped.join(' ').split(/\s+/).length, LONG.repeat(2).trim().split(/\s+/).length);

// A pasted URL is the case that used to run into the margin.
const chopped = HC.pdf.wrap('https://www.homechurchnola.com/a/very/long/path/nobody/would/type',
  'Times-Roman', 11, 60);
ok('a word too long for the line is cut rather than allowed to run off',
  chopped.every(line => HC.pdf.measure(line, 'Times-Roman', 11) <= 60), true);

/* ------------------------------------------------------------ the encoding */

const codes = t => HC.pdf.encode(t);

ok('a curly apostrophe is WinAnsi 146', codes('’'), [146]);
ok('curly quotes are 147 and 148', codes('“”'), [147, 148]);
ok('an em dash is 151', codes('—'), [151]);
ok('a middot is Latin-1 183', codes('·'), [183]);
ok('a newline inside a line becomes a space', codes('a\nb'), [97, 32, 98]);
ok('a hard space is a space', codes('a b'), [97, 32, 98]);
// Emoji are two JavaScript characters and one thing somebody typed.
ok('an emoji is one question mark, not two', codes('🙏'), [63]);
ok('and so is anything else we cannot spell', codes('日'), [63]);

/* -------------------------------------------------------------- the layout

   Re-reads what the documents actually drew. Every line of text in every
   content stream is measured where it sits, and has to fit inside the page.
   16mm of margin either side is what print.css sets and what the sheet in
   js/print-pdf.js keeps. */

const SIDE = HC.pdf.mm(16);
const FONTS = HC.pdf.FONTS;

function unliteral(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\') { out += text[i]; continue; }
    const next = text[i + 1];
    if (next >= '0' && next <= '7') {
      out += String.fromCharCode(parseInt(text.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      out += next;
      i += 1;
    }
  }
  return out;
}

function linesOf(base64) {
  const pdf = Buffer.from(base64, 'base64').toString('binary');
  const streams = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]);

  return streams.map(stream => {
    const found = [];
    const re = /\/F(\d) ([\d.]+) Tf\n(?:([\d.-]+) Tc\n)?1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\n\((.*?)\) Tj/g;
    let m;
    while ((m = re.exec(stream))) {
      found.push({
        font: FONTS[Number(m[1]) - 1],
        size: Number(m[2]),
        tracking: m[3] ? Number(m[3]) : 0,
        x: Number(m[4]),
        y: Number(m[5]),
        text: unliteral(m[6])
      });
    }
    return found;
  });
}

function offPage(base64) {
  const bad = [];
  linesOf(base64).forEach((lines, page) => {
    lines.forEach(line => {
      const right = line.x + HC.pdf.measure(line.text, line.font, line.size, line.tracking);
      // Half a point of slack, which is under the width of a hairline.
      if (line.x < SIDE - 0.5 || right > HC.pdf.WIDTH - SIDE + 0.5) {
        bad.push('page ' + (page + 1) + ': ' + line.text.slice(0, 40));
      }
      if (line.y < 0 || line.y > HC.pdf.HEIGHT) {
        bad.push('page ' + (page + 1) + ': off the top or bottom');
      }
    });
  });
  return bad;
}

/* Text comes back out of a content stream as WinAnsi bytes, where a curly
   apostrophe is one character with the code 146 rather than the U+2019 a test
   file is written in. Comparing through encode() puts both sides in the same
   alphabet, and is the only honest way to ask whether a line says something. */
function says(lines, text) {
  const want = HC.pdf.encode(text).join(',');
  return lines.some(l => HC.pdf.encode(l.text).join(',') === want);
}

function anywhere(pages, text) {
  return pages.some(page => says(page, text));
}

const guidePdf = HC.printPdf.guide('guide-test');
const guideLines = linesOf(guidePdf);

ok('a guide runs to more than one page', guideLines.length > 4, true);
ok('the cover says what it is', says(guideLines[0], 'HOME CHURCH · SMALL GROUP GUIDE'), true);
ok('and carries the title', says(guideLines[0], 'Who’s In Your Corner?'), true);
ok('nothing in a guide is drawn off the page', offPage(guidePdf), []);

/* The footer is how somebody reassembles a sheet they dropped, so the numbers
   have to be there and in order. It is drawn as the page opens, which puts it
   at the top of the stream: the sheet's title, then the number. The cover is
   page one and says nothing, and the closing scripture is the other dark
   page, so the numbered run is everything between the two. */
const paper = guideLines.slice(1, -1);
ok('every page of paper is numbered, in order',
  paper.map(lines => (lines[1] ? lines[1].text : '')).join(','),
  paper.map((page, i) => i + 2).join(','));
ok('the closing page carries no page number',
  says(guideLines[guideLines.length - 1], 'Proverbs 18:24'.toUpperCase()) &&
  !says(guideLines[guideLines.length - 1], String(guideLines.length)), true);

// The night sheet, with an answer nobody opened and a question nobody answered.
const snap = {
  room: { groupName: 'Thursday night', guideTitle: 'Who’s In Your Corner?', openedAt: '2026-09-10T23:00:00Z' },
  members: [{ name: 'Trey' }, { name: 'Anna' }],
  questions: [{ id: 'q1', body: LONG }, { id: 'q2', body: 'Short one?' }],
  notes: [
    { kind: 'answer', questionId: 'q1', author: 'Anna', body: LONG.repeat(2) },
    { kind: 'prayer', author: 'Trey', body: 'For my mother’s surgery on Tuesday.' }
  ]
};

const nightPdf = HC.printPdf.night(snap);
const nightLines = linesOf(nightPdf);
ok('a night sheet has a cover, the talk, and the prayers', nightLines.length >= 3, true);
ok('a question nobody answered says so',
  anywhere(nightLines, 'Nobody wrote on this one.'), true);
ok('the prayer requests are on the sheet',
  anywhere(nightLines, 'For my mother’s surgery on Tuesday.'), true);
ok('nothing on a night sheet is drawn off the page', offPage(nightPdf), []);

// The journal, which is the one document with somebody else's writing in it.
const entries = [
  { id: '1', guideId: 'guide-test', guideTitle: 'Who’s In Your Corner?',
    quote: 'He is not far from each one of us.',
    bodyText: 'This landed hard 🙏\n\n' + LONG, createdAt: '2026-09-08T12:00:00Z',
    refs: ['Acts 17:27'] },
  { id: '2', guideTitle: null, bodyText: '', createdAt: '2026-09-09T12:00:00Z', refs: [] }
];

const journalPdf = HC.printPdf.journal(entries);
const journalLines = linesOf(journalPdf);
ok('a journal groups by guide, loose notes last',
  anywhere(journalLines, 'Loose notes'), true);
ok('a highlight with nothing written about it still appears',
  anywhere(journalLines, 'Highlighted, with nothing written about it.'), true);
// The one thing a journal must not do is quietly lose a sentence somebody
// wrote because of a character this file cannot spell.
ok('an emoji does not eat the words around it',
  anywhere(journalLines, 'This landed hard ?'), true);
ok('nothing in a journal is drawn off the page', offPage(journalPdf), []);

/* A guide with the optional halves missing, which is what a guide published
   before its anchors, one-liners or closing scripture are filled in looks
   like, and what a guide coming back from Supabase can look like at any time.
   Nothing here may throw, and nothing may leave a hole on the cover. */
const SPARSE = {
  id: 'guide-sparse',
  shortSummary: ['One paragraph, and that is the whole guide.'],
  fullSummary: [],
  groupSections: [],
  reflectionQuestions: []
};

HC.data.getGuide = id => (id === GUIDE.id ? GUIDE : (id === SPARSE.id ? SPARSE : null));
HC.data.getSeries = id => (id === 'series-test' ? { title: 'The Life of David' } : null);
HC.data.guideMeta = guide => (guide === SPARSE
  ? { title: 'Untitled', preacher: '', preachedOn: '', passage: '' }
  : { title: 'Who’s In Your Corner?', preacher: 'Stephen Daigle',
      preachedOn: '2026-08-09', passage: '2 Samuel 15-19' });

const sparsePdf = HC.printPdf.guide('guide-sparse');
const sparseLines = linesOf(sparsePdf);
ok('a half filled guide still makes a document', sparseLines.length >= 2, true);
ok('and draws no empty lines on its cover',
  sparseLines[0].every(l => l.text.trim() !== ''), true);
ok('and nothing off the page', offPage(sparsePdf), []);

// Every document has to survive being handed nothing.
function throws(fn) {
  try { fn(); return false; } catch (err) { return true; }
}
ok('a guide that does not exist refuses', throws(() => HC.printPdf.guide('nope')), true);
ok('a night with no room refuses', throws(() => HC.printPdf.night({})), true);
ok('an empty journal refuses', throws(() => HC.printPdf.journal([])), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
