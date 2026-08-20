/* ===========================================================================
   js/journal.js, on its own.

   The four things worth a test here are the four that are easy to get wrong
   and expensive to get wrong:

     the sanitizer      because it is the only door markup comes through
     the plain text     because that is what crosses into a group room
     ownership          because signing out must not hand your journal over
     the migration      because it runs against writing people already have

   No browser. jsdom is not a dependency of this project and is not going to
   become one, so localStorage and DOMParser are faked below with the smallest
   thing that behaves correctly for what this file asks of them.
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

/* --------------------------------------------------------------- the fakes */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => Array.from(map.keys())[i],
    get length() { return map.size; },
    _map: map
  };
}

/* A DOMParser over a very small HTML subset: the tags in the allowlist, the
   ones it unwraps, and text. Enough to drive cleanNodes() honestly, including
   the attacks that matter (script, onerror, javascript: hrefs), because those
   are all just elements and attributes to the walker being tested. */
function fakeDOMParser() {
  const VOIDS = new Set(['br', 'img', 'input', 'hr', 'meta', 'link']);

  function parse(html) {
    const root = { nodeType: 1, tagName: 'BODY', childNodes: [], attrs: {} };
    const stack = [root];
    const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)\/?>|<!--[\s\S]*?-->|([^<]+)/g;
    let m;

    while ((m = re.exec(html))) {
      const [whole, tag, rawAttrs, text] = m;

      if (text !== undefined) {
        stack[stack.length - 1].childNodes.push({
          nodeType: 3,
          nodeValue: text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        });
        continue;
      }
      if (tag === undefined) continue;            // a comment

      const name = tag.toUpperCase();
      if (whole[1] === '/') {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tagName === name) { stack.length = i; break; }
        }
        continue;
      }

      const attrs = {};
      const ar = /([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g;
      let a;
      while ((a = ar.exec(rawAttrs || ''))) attrs[a[1].toLowerCase()] = a[2];

      const node = {
        nodeType: 1, tagName: name, attrs, childNodes: [],
        getAttribute: k => (k.toLowerCase() in attrs ? attrs[k.toLowerCase()] : null)
      };
      stack[stack.length - 1].childNodes.push(node);
      if (!VOIDS.has(tag.toLowerCase()) && whole.slice(-2) !== '/>') stack.push(node);
    }
    return { body: root };
  }

  return function DOMParser() {
    this.parseFromString = (html) => parse(html.replace(/^<body>|<\/body>$/g, ''));
  };
}

/* ------------------------------------------------------------- the harness */

function boot(opts) {
  opts = opts || {};
  const storage = fakeStorage();

  const sandbox = {
    window: { crypto: require('crypto').webcrypto, localStorage: storage },
    console
  };
  sandbox.window.DOMParser = fakeDOMParser();
  sandbox.DOMParser = sandbox.window.DOMParser;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // store.js first, since journal.js keeps its cache through it.
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8'), sandbox);

  // A stand-in for auth and data. Both are read-only from journal.js's side.
  sandbox.window.HC.auth = {
    isSignedIn: () => !!opts.user,
    getUser: () => (opts.user ? { id: opts.user } : null)
  };
  sandbox.window.HC.data = {
    getGuide: id => (opts.guides || {})[id] || null,
    guideTitle: g => g.title,
    guideMeta: g => ({ preachedOn: g.preachedOn })
  };

  if (opts.seed) storage.setItem('hc:' + opts.seed.key, JSON.stringify(opts.seed.value));

  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'journal.js'), 'utf8'), sandbox);

  const HC = sandbox.window.HC;
  // Booted the way the app boots it, so the migration under test is the one
  // that actually runs on somebody's phone rather than one poked by hand.
  HC.journal.init();
  return { HC, storage, signIn: (uid) => { opts.user = uid; } };
}

/* ------------------------------------------------------------- the sanitizer */

console.log('\n— the allowlist —');
{
  const { HC } = boot();
  const s = HC.journal.sanitize;

  ok('bold survives', s('<strong>held</strong>'), '<strong>held</strong>');
  ok('b becomes strong', s('<b>held</b>'), '<strong>held</strong>');
  ok('i becomes em', s('<i>held</i>'), '<em>held</em>');
  ok('lists survive', s('<ul><li>one</li><li>two</li></ul>'),
     '<ul><li>one</li><li>two</li></ul>');

  ok('a script tag loses the tag and the code with it',
     s('<script>alert(1)</script>'), 'alert(1)');
  ok('an event handler cannot ride in on a kept tag',
     s('<strong onclick="steal()">held</strong>'), '<strong>held</strong>');
  ok('an image with onerror is not an image any more',
     s('<img src=x onerror="steal()">'), '');
  ok('a style attribute goes', s('<p style="position:fixed">x</p>'), '<p>x</p>');

  ok('a Bible Gateway link keeps its href',
     s('<a href="https://www.biblegateway.com/passage/?search=John%203%3A16">John 3:16</a>'),
     '<a href="https://www.biblegateway.com/passage/?search=John%203%3A16">John 3:16</a>');
  ok('any other link keeps only its words',
     s('<a href="https://example.com/pay">click</a>'), 'click');
  ok('javascript: keeps only the words, never the scheme',
     s('<a href="javascript:steal()">click</a>'), 'click');
  ok('a lookalike host does not pass',
     s('<a href="https://www.biblegateway.com.evil.test/x">John 3:16</a>'), 'John 3:16');

  // What a browser actually hands back after return-then-bullet.
  ok('a list inside a div is not wrapped in a paragraph',
     s('first line<div><ul><li>one</li><li>two</li></ul></div>'),
     'first line<ul><li>one</li><li>two</li></ul>');
  ok('but a div of plain text still becomes one',
     s('<div>a line</div>'), '<p>a line</p>');
  ok('and a paragraph of plain text is left alone',
     s('<p>a line</p>'), '<p>a line</p>');

  ok('an unknown tag is unwrapped, the words stay',
     s('<marquee>still here</marquee>'), 'still here');
  ok('angle brackets in text are escaped, not executed',
     s('a &lt; b'), 'a &lt; b');
}

/* --------------------------------------------------------------- plain text */

console.log('\n— the plain text mirror —');
{
  const { HC } = boot();
  ok('a list becomes lines, not a run-on',
     HC.journal.plainText('<ul><li>one</li><li>two</li></ul>'), 'one\ntwo');
  ok('paragraphs keep their break',
     HC.journal.plainText('<p>one</p><p>two</p>'), 'one\n\ntwo');
  ok('formatting is dropped, the words are not',
     HC.journal.plainText('<p>the <strong>whole</strong> thing</p>'), 'the whole thing');
  ok('a scripture link comes across as its reference',
     HC.journal.plainText('<p>see <a href="https://www.biblegateway.com/x">John 3:16</a></p>'),
     'see John 3:16');
}

/* ---------------------------------------------------------------- entries */

console.log('\n— writing —');
{
  const { HC } = boot({ guides: { g1: { title: 'Held By What Holds You' } } });

  const e = HC.journal.create({ bodyText: 'Something he said about his dad.', guideId: 'g1' });
  ok('an entry knows its guide by name', e.guideTitle, 'Held By What Holds You');
  ok('and stores both shapes of what was written',
     [e.bodyHtml, e.bodyText],
     ['<p>Something he said about his dad.</p>', 'Something he said about his dad.']);

  const withRef = HC.journal.create({
    bodyHtml: '<p>on <a href="https://www.biblegateway.com/passage/?search=John+3%3A16">John 3:16</a></p>'
  });
  ok('scripture is pulled out of the body', withRef.refs, ['John 3:16']);

  ok('the list is newest first', HC.journal.all().map(x => x.id), [withRef.id, e.id]);
  HC.journal.togglePin(e.id);
  ok('pinned comes first regardless', HC.journal.all().map(x => x.id), [e.id, withRef.id]);

  ok('search looks at the words', HC.journal.all({ search: 'dad' }).map(x => x.id), [e.id]);
  ok('and at the guide it is tagged to',
     HC.journal.all({ search: 'holds' }).map(x => x.id), [e.id]);

  HC.journal.remove(e.id);
  ok('a deleted entry is gone from the list', HC.journal.all().map(x => x.id), [withRef.id]);
  ok('and cannot be fetched', HC.journal.get(e.id), null);
  ok('but leaves a tombstone to sync', !!HC.journal._state().entries[e.id].deletedAt, true);
}

/* -------------------------------------------------------------- ownership */

console.log('\n— whose journal is it —');
{
  const boot1 = boot();
  const HC = boot1.HC;

  const loose = HC.journal.create({ bodyText: 'written signed out' });
  ok('signed out, an entry belongs to nobody in particular', loose.ownerId, 'local');

  // Somebody signs in on a phone that has never belonged to anybody.
  HC.journal._adopt('user-a');
  ok('signing in adopts what was written signed out',
     HC.journal._state().entries[loose.id].ownerId, 'user-a');

  boot1.signIn('user-a');
  ok('and they can see it', HC.journal.all().map(x => x.bodyText), ['written signed out']);

  // A's own entry, then A signs out and writes something loose.
  const mine = HC.journal.create({ bodyText: 'a private thing' });
  boot1.signIn(null);
  ok('signed out, A’s entries are not on screen', HC.journal.all().length, 0);

  const afterOut = HC.journal.create({ bodyText: 'written after signing out' });
  ok('and a new one is loose again', afterOut.ownerId, 'local');

  // B signs in on the same phone.
  HC.journal._adopt('user-b');
  boot1.signIn('user-b');
  ok('B does not inherit A’s entry',
     HC.journal._state().entries[mine.id].ownerId, 'user-a');
  ok('B does not inherit what A wrote signed out either',
     HC.journal._state().entries[afterOut.id].ownerId, 'local');
  ok('so B’s journal is empty', HC.journal.all().length, 0);
}

/* --------------------------------------------------------------- migration */

console.log('\n— the answers people already have —');
{
  const seeded = {
    key: 'guideState',
    value: {
      g1: {
        checked: { '0-1': true },
        journal: { '0': 'What I said about my father.', '2': 'Still working on this one.' }
      },
      g2: { checked: {}, journal: { '1': '   ' } }
    }
  };
  const { HC } = boot({
    seed: seeded,
    guides: {
      g1: {
        title: 'Held By What Holds You',
        preachedOn: '2026-08-16',
        reflectionQuestions: ['Who holds you?', 'Second', 'Third one']
      }
    }
  });

  const moved = HC.journal.all();
  ok('both real answers came across', moved.length, 2);
  ok('as reflections, tagged to their guide',
     moved.map(e => [e.kind, e.guideId]).sort(),
     [['reflection', 'g1'], ['reflection', 'g1']]);
  ok('whitespace was not an answer', moved.filter(e => e.guideId === 'g2').length, 0);

  const first = moved.filter(e => e.path === 'reflectionQuestions.0')[0];
  ok('the question travels with the answer', first.quote, 'Who holds you?');
  ok('and it is dated to its guide, not to today',
     first.createdAt.slice(0, 10), '2026-08-16');

  ok('nothing was taken out of guideState',
     Object.keys(HC.store.storage.get('guideState', {}).g1.journal), ['0', '2']);

  const before = HC.journal.all().length;
  HC.journal._migrate();
  ok('running it again imports nothing twice', HC.journal.all().length, before);

  // The reader still reads and writes the same answers.
  ok('the guide reader finds its answer',
     HC.journal.getReflection('g1', '0'), 'What I said about my father.');
  HC.journal.setReflection('g1', '0', 'Rewritten.', 'Who holds you?');
  ok('editing updates rather than adding', HC.journal.all().length, before);
  ok('and the new words are there', HC.journal.getReflection('g1', '0'), 'Rewritten.');
  HC.journal.setReflection('g1', '0', '   ', 'Who holds you?');
  ok('emptying the box deletes the entry', HC.journal.all().length, before - 1);
}

/* ------------------------------------------------------------- anchoring */

console.log('\n— highlights, after the guide has been edited —');
{
  const { HC } = boot({ guides: { g1: { title: 'Held' } } });
  const TEXT = 'He said the thing about his father, and then he said it again.';

  const e = HC.journal.create({
    kind: 'highlight', guideId: 'g1', path: 'shortSummary.0',
    quote: 'the thing about his father', start: 8, end: 34
  });

  ok('an untouched paragraph resolves on the offsets',
     HC.journal.locate(e, TEXT), { start: 8, end: 34 });

  // Somebody fixes a typo earlier in the paragraph. Everything shifts.
  const EDITED = 'He then said the thing about his father, and then he said it again.';
  ok('a shifted paragraph resolves on the words',
     HC.journal.locate(e, EDITED), { start: 13, end: 39 });

  // The sentence is rewritten entirely.
  ok('a rewritten paragraph resolves to nothing',
     HC.journal.locate(e, 'He talked about his childhood.'), null);
  ok('but the entry is still in the journal', HC.journal.all().length, 1);
  ok('with the quotation it was made from',
     HC.journal.all()[0].quote, 'the thing about his father');

  // Two copies of the same sentence: take the one nearest where it was.
  const TWICE = 'the thing about his father. And again: the thing about his father.';
  ok('the nearer of two identical sentences wins',
     HC.journal.locate(e, TWICE), { start: 0, end: 26 });

  /* --------------------------------------------------------- drawing */

  const drawn = HC.journal.marked('g1', 'shortSummary.0', TEXT);
  ok('the mark wraps exactly the highlighted words',
     /<mark [^>]*>the thing about his father<\/mark>/.test(drawn), true);
  ok('and the rest of the paragraph is intact',
     drawn.replace(/<[^>]+>/g, ''), TEXT);
  ok('a highlight with no note is not drawn as one',
     / hc-hl--noted/.test(drawn), false);

  HC.journal.update(e.id, { bodyText: 'Ask him about it.' });
  ok('one with a note is', / hc-hl--noted/.test(
     HC.journal.marked('g1', 'shortSummary.0', TEXT)), true);

  // Overlaps are not nested.
  HC.journal.create({
    kind: 'highlight', guideId: 'g1', path: 'shortSummary.0',
    quote: 'about his father, and', start: 18, end: 39
  });
  const both = HC.journal.marked('g1', 'shortSummary.0', TEXT);
  ok('an overlapping highlight is not nested', (both.match(/<mark/g) || []).length, 1);
  ok('and the text still survives it', both.replace(/<[^>]+>/g, ''), TEXT);

  // A paragraph with nothing in it renders exactly what it always did.
  ok('a guide with no highlights renders plain escaped text',
     HC.journal.marked('g1', 'fullSummary.0', 'Plain <b>text</b> & more'),
     'Plain &lt;b&gt;text&lt;/b&gt; &amp; more');
  ok('and so does one with no guide at all',
     HC.journal.marked(null, 'x', 'a & b'), 'a &amp; b');
}

console.log('\n' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : '') + '.');
process.exit(fail ? 1 : 0);
