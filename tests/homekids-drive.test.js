/* ===========================================================================
   The HomeKids Drive watcher, without Google and without a model.

   Pinned against the shape of the first real lesson the director shared: a
   Google Doc named "Oct 4th Champions & Heroes", whose header says "Home Kids
   - Champions & Heroes - September 27, 2026". The fixture below is a .docx
   built here with the same header and the same kind of body, so the unzip,
   the group detection and the date rule are all exercised on a real zip.

   The helpers are fenced in the Edge Function between @@ drive:start and
   @@ drive:end, lifted out and evalled, the way the intake's are.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

if (typeof stripTypeScriptTypes !== 'function') {
  console.log('SKIP  homekids drive: node ' + process.version + ' cannot strip TypeScript.');
  process.exit(0);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions',
  'homekids-drive', 'index.ts'), 'utf8');
const start = source.indexOf('/* @@ drive:start');
const end = source.indexOf('/* @@ drive:end */');
if (start === -1 || end < start) {
  console.log('FAIL  the watcher helpers are no longer fenced by @@ drive:start / @@ drive:end');
  process.exit(1);
}

const D = vm.runInNewContext(stripTypeScriptTypes(source.slice(start, end)) +
  '\n({ docxText, groupsIn, dateIn, lessonDate, mergeLesson, checklistFor, lessonPrompt, unloop, prayerText, lessonSchema })',
  { TextDecoder, TextEncoder, DataView, Uint8Array, Blob, Response, DecompressionStream, Date, Object, JSON });

/* ------------------------------------------------- a .docx, built by hand */

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text, store] of entries) {
    const raw = Buffer.from(text, 'utf8');
    const data = store ? raw : zlib.deflateRawSync(raw);
    const nm = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(store ? 0 : 8, 8);
    lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(store ? 0 : 8, 10); ch.writeUInt32LE(crc32(raw), 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nm, data);
    centrals.push(ch, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}

const p = (t, bullet) => '<w:p>' + (bullet ? '<w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' : '') +
  '<w:r><w:t xml:space="preserve">' + t + '</w:t></w:r></w:p>';
const doc = (paras) => '<?xml version="1.0"?><w:document><w:body>' + paras.join('') + '</w:body></w:document>';

const header = '<w:hdr>' + p('Jonah - Week 3') +
  '<w:p><w:r><w:t>Home Kids - Champions &amp; Heroes</w:t></w:r><w:r><w:tab/><w:t>September 27, 2026</w:t></w:r></w:p></w:hdr>';
const body = doc([
  p('HomeKids Values: Every Sunday start your lesson going over our HomeKids Values.'),
  p('Know God: With your index fingers touch your forehead.', true),
  p('Teach the Story'),
  p('Jonah went outside the city and sat in the hot sun. God made a plant grow.'),
  p('ASK: What makes you feel super happy?'),
  p('The Big Truth'),
  p('Gods love is for everyone!')
]);

(async () => {
  console.log('\n--- reading the doc ---');
  const file = zip([
    ['[Content_Types].xml', '<Types/>', true],
    ['word/header1.xml', header],
    ['word/document.xml', body],
    ['word/media/image1.png', 'not really a png', true]
  ]);
  const read = await D.docxText(file);
  ok('the header comes out with the group and the date',
    read.header, 'Jonah - Week 3\nHome Kids - Champions & Heroes September 27, 2026');
  ok('bullets are kept as bullets', read.body.split('\n')[1], '- Know God: With your index fingers touch your forehead.');
  ok('the body is all there', read.body.split('\n').length, 7);

  let threw = '';
  try { await D.docxText(new Uint8Array([1, 2, 3])); } catch (e) { threw = e.message; }
  ok('something that is not a Word file says so', /not a Word document/.test(threw), true);

  // The real one, when it is on this machine. Not in the repo: it is the
  // church's lesson, and it was shared with a person, not with the code.
  const real = process.env.HC_HOMEKIDS_SAMPLE_DOCX;
  if (real && fs.existsSync(real)) {
    const r = await D.docxText(new Uint8Array(fs.readFileSync(real)));
    ok('the real lesson reads, header and all', /Champions & Heroes/.test(r.header) && r.body.length > 2000, true);
  }

  console.log('\n--- which groups ---');
  ok('Champions & Heroes', Array.from(D.groupsIn('Oct 4th Champions & Heroes')), ['champions', 'heroes']);
  ok('Legends & Warriors', Array.from(D.groupsIn('Oct 4th Legends & Warriors')), ['legends']);
  ok('either word of the third group is enough', Array.from(D.groupsIn('Warriors lesson')), ['legends']);
  ok('a doc that names none', Array.from(D.groupsIn('Jonah week 3')), []);

  console.log('\n--- which Sunday ---');
  ok('"Oct 4th" in a name', D.dateIn('Oct 4th Champions & Heroes', '2026-10-01'), '2026-10-04');
  ok('a written-out date with a year', D.dateIn('Home Kids - September 27, 2026', '2026-10-01'), '2026-09-27');
  ok('a slashed date', D.dateIn('HomeKids 10/11', '2026-10-01'), '2026-10-11');
  ok('a January doc saved in December is next year', D.dateIn('Jan 3rd Heroes', '2026-12-20'), '2027-01-03');
  ok('"Sept" is September', D.dateIn('Sept 20 lesson', '2026-09-01'), '2026-09-20');
  ok('no date', D.dateIn('Champions & Heroes', '2026-10-01'), null);

  const first = D.lessonDate('Oct 4th Champions & Heroes', read.header, null, '2026-10-01');
  ok('the file name wins over a stale header', first.date, '2026-10-04');
  ok('and the disagreement is written down for the admin',
    /file name says October 4 but the header inside says September 27/.test(first.note), true);
  ok('agreeing dates leave no note',
    D.lessonDate('Oct 4th Heroes', 'October 4, 2026', null, '2026-10-01').note, null);
  const none = D.lessonDate('Heroes', '', null, '2026-10-01');
  ok('no date anywhere guesses the next Sunday, and says so',
    [none.date, /Guessed/.test(none.note)], ['2026-10-04', true]);
  ok('a date that is not a Sunday is flagged',
    /not a Sunday/.test(D.lessonDate('Oct 5 Heroes', '', null, '2026-10-01').note), true);

  console.log('\n--- two docs, one Sunday ---');
  const ch = {
    title: 'Jonah and the Plant', passage: 'Jonah 4', big_idea: 'God’s love is for everyone.',
    story: ['Jonah sat in the hot sun.', 'God grew a plant.'],
    groups: {
      champions: { questions: ['Where did Jonah sit?'], activity: 'Grow like a plant.' },
      heroes: { questions: ['What made Jonah grumpy?'], activity: 'Play hot sun, leafy shade.' },
      legends: { questions: ['should be ignored'], activity: 'not this doc' }
    },
    prayer: 'God, help me love everyone. Amen.', parent_note: 'Ask about a grumpy moment.'
  };
  const lw = {
    title: 'Jonah Learns About Love', story: ['A different telling.'],
    groups: { legends: { questions: ['Who is hard to love?', 'Why did God care about Nineveh?'], activity: 'Write a kind note.' } }
  };

  let draft = D.mergeLesson(null, ch, ['champions', 'heroes'], 'file-ch', '2026-10-04');
  ok('the first doc fills its two groups and only those', Object.keys(draft.groups), ['champions', 'heroes']);
  ok('and the shared fields', [draft.title, draft.passage], ['Jonah and the Plant', 'Jonah 4']);

  draft = D.mergeLesson(draft, lw, ['legends'], 'file-lw', '2026-10-04');
  ok('the second doc adds the third group', Object.keys(draft.groups), ['champions', 'heroes', 'legends']);
  ok('without swapping the title or the story the first doc wrote',
    [draft.title, draft.story[0]], ['Jonah and the Plant', 'Jonah sat in the hot sun.']);
  ok('and keeps the first two groups exactly', draft.groups.heroes.questions, ['What made Jonah grumpy?']);

  const edited = Object.assign({}, ch, { title: 'Jonah and the Little Plant' });
  draft = D.mergeLesson(draft, edited, ['champions', 'heroes'], 'file-ch', '2026-10-04');
  ok('an edit to the first doc does update the shared fields', draft.title, 'Jonah and the Little Plant');
  ok('and leaves the third group alone', draft.groups.legends.questions.length, 2);

  ok('the checklist ids are fixed, with the big idea standing in for a missing verse',
    draft.checklist.map(i => i.id), ['story', 'bigidea', 'talk', 'pray']);
  ok('with a memory verse, it is the verse',
    D.checklistFor({ memory_verse: { text: 'When I am afraid' } }).map(i => i.id),
    ['story', 'verse', 'talk', 'pray']);

  const dashed = D.mergeLesson(null, { title: 'One — two', story: ['x'], groups: {} }, ['heroes'], 'f', '2026-10-04');
  ok('an em dash from the model never reaches the page', dashed.title, 'One, two');

  console.log('\n--- a model that loses its place ---');
  ok('a prayer stuck on Amen comes back with one',
    D.prayerText('Jesus, help me love everyone. Amen. Amen. Amen. Amen. Amen.'),
    'Jesus, help me love everyone. Amen.');
  ok('the model talking to itself after its Amen is cut off',
    D.prayerText('Help us love others. Amen and ever, amen. Wait, the prompt says do not write the word Amen.'),
    'Help us love others. Amen.');
  ok('a prayer with no Amen gets one', D.prayerText('God, thank you for loving me.'),
    'God, thank you for loving me. Amen.');
  ok('a sentence said over and over is said once',
    D.unloop('God loves you. God loves you. God loves you. God loves you.'), 'God loves you.');
  ok('a word stuck on repeat is said once', D.unloop('so so so so happy'), 'so happy');
  ok('ordinary text is left alone', D.unloop('Jonah sat. God grew a plant. Jonah smiled.'),
    'Jonah sat. God grew a plant. Jonah smiled.');
  const merged = D.mergeLesson(null, { title: 'T', story: ['x'], groups: {},
    prayer: 'Help me. Amen. Amen. Amen.' }, ['heroes'], 'f', '2026-10-04');
  ok('and the merge uses it', merged.prayer, 'Help me. Amen.');
  const schema = D.lessonSchema(['champions', 'heroes']);
  ok('the answer shape holds only the groups this doc covers',
    Object.keys(schema.properties.groups.properties), ['champions', 'heroes']);
  ok('with no list limits, which made Gemini answer 503',
    JSON.stringify(schema).includes('maxItems'), false);

  console.log('\n--- the prompt ---');
  const prompt = D.lessonPrompt('Oct 4th Champions & Heroes', 'Home Kids', 'body', ['champions', 'heroes']);
  ok('asks only for the groups this doc covers', /fill ONLY these: champions, heroes\./.test(prompt), true);
  ok('and leaves the classroom out', /supplies, room setup, videos/.test(prompt), true);
  ok('and does not invent a memory verse', /ONLY if the plan gives one/.test(prompt), true);
  ok('and does not mention Amen at all, which is what confused it', /amen/i.test(prompt), false);

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) process.exit(1);
})();
