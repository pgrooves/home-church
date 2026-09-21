/* ===========================================================================
   Merge with, the backup for every duplicate the robot did not notice.

   WHAT IS WORTH TESTING, and it is not the merging. Whether "Homecoming" and
   "Homecoming Gala" are one night is a judgement a person makes reading two
   cards, and whether the merged wording is any good is a judgement they make
   reading the preview. What this file holds still is the panel's promises,
   because every one of them is a promise about something NOT happening:

     NOTHING IS WRITTEN FROM THE PICKER. The first screen is a dropdown and a
     button. If a Save ever appears there, somebody merges two cards without
     having read what the merge says.

     SAVE IS ABSENT WHEN NOTHING CHANGED, rather than present and greyed out.
     The church asked for this in as many words: if the other card adds
     nothing, say so and change nothing. A disabled button is a worse way of
     saying that than a sentence.

     THE DIFF SHOWS BOTH SIDES. A preview that printed only the new value
     would be a preview of half the decision — "is this replacing something I
     wrote" is the question somebody is actually asking.

     AND IT ESCAPES. The words in this panel come out of a model, by way of
     two rows anybody with a newsletter can influence. They are drawn as text,
     and a panel that let a quote out of them would be an injection with an
     admin's session behind it.

   No browser. js/components.js runs in a VM and mergePanel() is asked for
   markup, which is a string, which is a thing a test can hold.
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

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => Array.from(map.keys())[i],
    get length() { return map.size; }
  };
}

function load(files) {
  const sandbox = { window: { localStorage: fakeStorage(), console: console } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  files.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  });
  return sandbox.window.HC;
}

const HC = load(['data.js', 'store.js', 'components.js']);
const c = HC.components;

const TARGETS = [
  { id: 'a-gala', title: 'Homecoming', when: 'On Home' },
  { id: 'a-serve', title: 'City Serve Day', when: 'Draft' }
];

const has = (html, needle) => html.indexOf(needle) !== -1;

/* ------------------------------------------------------------- picking --- */

let html = c.mergePanel(
  { kind: 'announcement', sourceId: 'a-new', targetId: '', step: 'pick',
    preview: null, error: '' },
  TARGETS,
  { sourceTitle: 'Homecoming Gala' });

ok('the picker names what is being merged', has(html, 'Homecoming Gala'), true);
ok('and lists everything it could be merged into',
  [has(html, 'Homecoming'), has(html, 'City Serve Day')], [true, true]);

/* THE FIRST PROMISE. A Save on this screen would be a merge nobody read. */
ok('nothing on the picker saves anything', has(html, 'merge-save'), false);

/* And the one button there is stays dead until a target is picked, because
   "see what would change" about nothing is a model call for no reason. */
ok('and the button is dead until something is picked', has(html, 'disabled'), true);

html = c.mergePanel(
  { kind: 'announcement', sourceId: 'a-new', targetId: 'a-gala', step: 'pick',
    preview: null, error: '' },
  TARGETS, {});

ok('once something is picked the button comes alive', has(html, 'disabled'), false);
ok('and the picked one is the one selected', has(html, 'value="a-gala" selected'), true);

/* A failure says so on the panel rather than only in a toast that has gone by
   the time somebody looks up. */
html = c.mergePanel(
  { kind: 'announcement', sourceId: 'a-new', targetId: 'a-gala', step: 'pick',
    preview: null, error: 'The model is busy right now.' },
  TARGETS, {});

ok('a failure is said on the panel', has(html, 'The model is busy right now.'), true);

/* ------------------------------------------------------------ previewing --- */

const preview = {
  kind: 'announcement',
  keeps_title: 'Homecoming',
  other_title: 'Homecoming Gala',
  unchanged: false,
  note: 'Adds the ticket link and the $25 price.',
  fields: { title: 'Homecoming Gala', body: 'Save the date. Tickets are $25.' },
  changes: [
    { field: 'body', label: 'The words', before: 'Save the date.',
      after: 'Save the date. Tickets are $25.' },
    { field: 'link_url', label: 'The link', before: '',
      after: 'https://example.com/gala' }
  ]
};

html = c.mergePanel(
  { kind: 'announcement', sourceId: 'a-new', targetId: 'a-gala', step: 'preview',
    preview: preview, error: '' },
  TARGETS, {});

ok('the preview says in one line what the merge adds',
  has(html, 'Adds the ticket link and the $25 price.'), true);

/* THE THIRD PROMISE. Both sides, or it is a preview of half the decision. */
ok('every change shows what it is replacing',
  has(html, 'Save the date.') && has(html, 'Save the date. Tickets are $25.'), true);

ok('and a field that was empty says so rather than showing a struck-through blank',
  has(html, 'hc-merge__before--none') && has(html, '>nothing<'), true);

ok('now there is a Save', has(html, 'merge-save'), true);
ok('and a way back to the picker that writes nothing',
  has(html, 'merge-back'), true);

ok('and Cancel is on every step', has(html, 'merge-cancel'), true);

ok('it names both cards, so which one survives is answerable without scrolling',
  has(html, 'Homecoming') && has(html, 'Homecoming Gala'), true);

/* --------------------------------------------------------- nothing new --- */

/* THE SECOND PROMISE, and the one the church asked for by name. */
html = c.mergePanel(
  { kind: 'announcement', sourceId: 'a-new', targetId: 'a-gala', step: 'preview',
    preview: {
      keeps_title: 'Homecoming', other_title: 'Homecoming Gala',
      unchanged: true, note: 'Nothing new.', fields: {}, changes: []
    }, error: '' },
  TARGETS, {});

ok('when nothing changes it says so', has(html, 'Nothing changes.'), true);
ok('and there is no Save at all', has(html, 'merge-save'), false);
ok('but there is still a way out', has(html, 'merge-cancel'), true);

/* ------------------------------------------------------------ the dates --- */

html = c.mergePanel(
  { kind: 'event', sourceId: 'e-new', targetId: 'e-gala', step: 'preview',
    preview: {
      keeps_title: 'Homecoming Gala', other_title: 'Homecoming',
      unchanged: false, note: 'Adds the location.',
      fields: { location: 'The Loft' },
      changes: [{ field: 'location', label: 'Where', before: '', after: 'The Loft' }]
    }, error: '' },
  TARGETS, {});

/* A date and an announcement do not end the same way, and the sentence under
   the diff has to say which: one goes to a drawer and can be got back, the
   other comes off the calendar for good. */
ok('a date merge says the other one comes off the calendar',
  has(html, 'comes off the calendar'), true);
ok('and does not promise a Deleted drawer it does not have',
  has(html, 'Deleted drawer'), false);

/* -------------------------------------------------------------- escaping --- */

/* THE FOURTH PROMISE. These words came from a model reading two rows, and a
   row can be written by anybody who can get an item into the church's
   newsletter. */
html = c.mergePanel(
  { kind: 'announcement', sourceId: 'a-new', targetId: 'a-gala', step: 'preview',
    preview: {
      keeps_title: '"><script>alert(1)</script>',
      other_title: 'Fine',
      unchanged: false, note: '<img src=x onerror=alert(1)>',
      fields: {},
      changes: [{ field: 'body', label: '<b>Label</b>',
                  before: '<i>was</i>', after: '</p><script>bad()</script>' }]
    }, error: '' },
  TARGETS, {});

ok('a title with markup in it comes out as text', has(html, '<script>'), false);
/* The tag is what matters, not the word inside it: escaping turns <img into
   &lt;img, and "onerror=" as plain text on a page is just eight characters. */
ok('so does a note', [has(html, '<img'), has(html, '&lt;img')], [false, true]);
ok('and so does every side of every change',
  has(html, '&lt;i&gt;was&lt;/i&gt;') && has(html, '&lt;b&gt;Label&lt;/b&gt;'), true);

/* And the picker, which draws titles the same way inside option tags. */
html = c.mergePanel(
  { kind: 'announcement', sourceId: 'a-new', targetId: '', step: 'pick',
    preview: null, error: '' },
  [{ id: 'x"><script>alert(1)</script>', title: '<script>alert(2)</script>',
     when: 'On Home' }],
  { sourceTitle: '<script>alert(3)</script>' });

ok('the picker escapes ids, titles and the name at the top',
  has(html, '<script>'), false);

/* --------------------------------------------------------------- nothing --- */

ok('no merge in flight draws nothing at all', c.mergePanel(null, TARGETS, {}), '');

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
