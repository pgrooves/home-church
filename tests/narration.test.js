/* Drives the part of narration that can be confidently wrong.

   WHY THIS FILE. Generating the audio is loud when it breaks: the script
   throws, or the file is not there, or it is obviously silent. Deciding what
   words to speak is quiet. "2 Samuel 11:1-27" spoken as "two Samuel eleven
   colon one dash twenty seven" produces a perfectly valid mp3 of the wrong
   thing, and nobody finds out until a leader presses play in front of their
   group. So every rule in normalize() has a case here, and so does the hash
   that decides whether a recording still matches the words it was made from.

   Nothing here loads the speech model or touches the network. */

const n = require('../scripts/narration_text.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), c = JSON.stringify(want);
  if (a === c) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + c); fail++; }
};

/* ------------------------------------------------------- scripture, spoken */

ok('a single verse',
  n.normalize('2 Samuel 11:1'), 'Second Samuel chapter 11, verse 1');
ok('a verse range',
  n.normalize('2 Samuel 11:1-27'), 'Second Samuel chapter 11, verses 1 to 27');
ok('an en dash range reads the same',
  n.normalize('2 Samuel 11:1–27'), 'Second Samuel chapter 11, verses 1 to 27');
ok('two chapters joined by an ampersand',
  n.normalize('2 Samuel 11 & 12'), 'Second Samuel 11 and 12');
ok('an unnumbered book is left alone',
  n.normalize('John 3:16'), 'John chapter 3, verse 16');
ok('third John',
  n.normalize('3 John 4'), 'Third John 4');

/* The longest-key-first rule. "1 Corinthians" must not be eaten by "1 Cor"
   leaving "First Corinthiansinthians" behind. */
ok('a long book name is not half eaten',
  n.normalize('1 Corinthians 13:4'), 'First Corinthians chapter 13, verse 4');
ok('the abbreviated form still works',
  n.normalize('1 Cor 13:4'), 'First Corinthians chapter 13, verse 4');

/* A reference inside a sentence, which is how the Scripture Index actually
   reads: reference, full stop, then the note about it. */
ok('a reference inside prose',
  n.normalize('Read 2 Samuel 12:7 slowly.'),
  'Read Second Samuel chapter 12, verse 7 slowly.');

/* ------------------------------------------------------------- house style */

// Em dashes are against the brand rule and should never reach here. If one
// does, it becomes the comma the rule would have wanted rather than silence.
ok('an em dash becomes a comma',
  n.normalize('He saw — and he took.'), 'He saw, and he took.');

ok('runs of spaces collapse', n.normalize('a    b'), 'a b');
ok('nothing is an empty string', n.normalize(null), '');

/* A number that is not a reference is not touched. Times, counts and years
   all appear in guides and none of them are chapters. */
ok('a plain number survives', n.normalize('all 12 of them'), 'all 12 of them');

/* ---------------------------------------------------------------- sections */

const GUIDE = {
  id: 'guide-test',
  shortSummary: ['One.', 'Two.'],
  fullSummary: ['Body.'],
  anchors: [{ label: 'First', body: 'Then this.' }],
  groupSections: [{ heading: 'Opening', questions: ['Why?', 'How?'] }],
  reflectionQuestions: ['What now?'],
  oneLiners: ['A line.'],
  scriptures: [{ reference: '2 Samuel 11:1', note: 'The setup.' }]
};

ok('a section is headed by its own name and the guide title',
  n.sectionText(GUIDE, 'short-summary', 'A Title').split('\n\n')[0],
  'A Title. Overview.');

ok('the summary carries its anchors',
  n.sectionText(GUIDE, 'full-summary', 'T').indexOf('Where it went') > -1, true);

ok('discussion keeps its headings',
  n.sectionText(GUIDE, 'group', 'T').indexOf('Opening.') > -1, true);

ok('an unknown section is empty', n.sectionText(GUIDE, 'nope', 'T'), '');

/* ------------------------------------------------------------- speakability
   The head is always present, so a section is only worth recording if there
   is something under it. An empty recording draws a button that does nothing,
   which is worse than drawing no button. */

ok('a section with a body is speakable',
  n.isSpeakable(n.sectionText(GUIDE, 'oneliners', 'T')), true);
ok('a section with only a heading is not',
  n.isSpeakable(n.sectionText({ oneLiners: [] }, 'oneliners', 'T')), false);

/* ------------------------------------------------------------------- hashes
   The hash is what stops a guide reading out a question that was edited after
   it was recorded. guides.subtitle, group_sections and reflection_questions
   are all editable from inside the app, see migration 0031. */

ok('the same text hashes the same', n.hash('abc'), n.hash('abc'));
ok('different text does not', n.hash('abc') === n.hash('abd'), false);
ok('the hash is short enough to store', n.hash('abc').length, 16);

const before = n.build(GUIDE, 'T');
const edited = JSON.parse(JSON.stringify(GUIDE));
edited.groupSections[0].questions[1] = 'How, really?';
const after = n.build(edited, 'T');

const hashOf = (built, id) => built.sections.find((s) => s.id === id).hash;

ok('editing a question changes that section',
  hashOf(before, 'group') === hashOf(after, 'group'), false);
ok('and leaves every other section alone',
  hashOf(before, 'oneliners'), hashOf(after, 'oneliners'));

/* ------------------------------------------------------------------- build */

ok('a full guide yields six sections', n.build(GUIDE, 'T').sections.length, 6);
ok('the sections come out in reader order',
  n.build(GUIDE, 'T').sections.map((s) => s.id), n.SECTIONS);

// A guide that is half written, which is every guide mid-draft, records only
// the parts that exist rather than failing.
ok('a half written guide records what it has',
  n.build({ id: 'g', shortSummary: ['Only this.'] }, 'T').sections.map((s) => s.id),
  ['short-summary']);

/* ---------------------------------------------------------------- the ids
   These strings are a contract with three other places: c.collapsible() in
   js/components.js, the six calls in js/screens/guide.js, and the keys of
   guides.narration in migration 0046. Rename one and the play button quietly
   stops appearing on that section. */

ok('the section ids are the reader\'s ids', n.SECTIONS,
  ['short-summary', 'full-summary', 'group', 'reflection', 'oneliners', 'scripture']);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
