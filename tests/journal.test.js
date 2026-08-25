/* ===========================================================================
   js/journal.js, on its own, and js/richtext.js underneath it.

   The four things worth a test here are the four that are easy to get wrong
   and expensive to get wrong:

     the sanitizer      because it is the only door markup comes through
     the plain text     because that is what crosses into a group room
     ownership          because signing out must not hand your journal over
     the migration      because it runs against writing people already have

   THE SANITIZER IS TESTED TWICE, under both of its link policies, and both
   halves belong here because this is where the DOMParser stand-in lives. The
   journal's policy keeps Bible Gateway and nothing else; an announcement's
   keeps the four schemes a church writing to its church needs. The second one
   is markup an admin types and every phone in the building renders, so its
   refusals matter more, not less.

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

  // The network, as a list of what was asked for and what to answer with.
  const wire = { sent: [], rows: opts.rows || [], fail: false };

  const sandbox = {
    window: {
      crypto: require('crypto').webcrypto,
      localStorage: storage,
      // The debounced push is scheduled, never awaited. Tests drive push()
      // directly, so the timer only has to exist.
      setTimeout: () => 0,
      clearTimeout: () => {}
    },
    // journal.js listens for the app coming back to the foreground.
    document: { addEventListener: () => {}, hidden: false },
    console
  };
  sandbox.setTimeout = sandbox.window.setTimeout;
  sandbox.clearTimeout = sandbox.window.clearTimeout;
  sandbox.window.DOMParser = fakeDOMParser();
  sandbox.DOMParser = sandbox.window.DOMParser;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // store.js first, since journal.js keeps its cache through it.
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8'), sandbox);

  // A stand-in for auth and data. Both are read-only from journal.js's side.
  sandbox.window.HC.auth = {
    isConfigured: () => opts.configured !== false,
    isSignedIn: () => !!opts.user,
    getUser: () => (opts.user ? { id: opts.user } : null),
    restFetch: (path, o) => {
      wire.sent.push({ path, opts: o });
      if (wire.fail) return Promise.reject(new Error('offline'));
      if (!o || (o.method || 'GET') === 'GET') return Promise.resolve(wire.rows);
      return Promise.resolve(null);
    }
  };
  sandbox.window.HC.data = {
    getGuide: id => (opts.guides || {})[id] || null,
    guideTitle: g => g.title,
    guideMeta: g => ({ preachedOn: g.preachedOn })
  };

  if (opts.seed) storage.setItem('hc:' + opts.seed.key, JSON.stringify(opts.seed.value));

  // The allowlist and the plain text mirror, which journal.js runs under its
  // own link policy. Below store.js and above journal.js, the same order
  // index.html loads them in.
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'richtext.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'journal.js'), 'utf8'), sandbox);

  const HC = sandbox.window.HC;
  // Booted the way the app boots it, so the migration under test is the one
  // that actually runs on somebody's phone rather than one poked by hand.
  HC.journal.init();
  return { HC, storage, wire, signIn: (uid) => { opts.user = uid; } };
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

/* ------------------------------------------------ the announcement's policy

   The same allowlist under the other link policy. What an admin writes on the
   Admin form and what every phone in the church then renders into a page, so
   the refusals below are the ones that matter most in this file. */

console.log('\n— the same allowlist, an announcement’s links —');
{
  const { HC } = boot();
  const s = (html) => HC.richtext.sanitize(html, { links: 'web' });

  ok('the formatting is the same formatting',
     s('<b>held</b><i>held</i>'), '<strong>held</strong><em>held</em>');

  ok('an ordinary link survives, which is the whole difference',
     s('<a href="https://homechurch.org/serve">Sign up</a>'),
     '<a href="https://homechurch.org/serve">Sign up</a>');
  ok('so does an email address',
     s('<a href="mailto:hello@homechurch.org">Email us</a>'),
     '<a href="mailto:hello@homechurch.org">Email us</a>');
  ok('and a phone number',
     s('<a href="tel:+15045551234">Call</a>'), '<a href="tel:+15045551234">Call</a>');
  ok('and a scripture link, because the button that makes them is still there',
     s('<a href="https://www.biblegateway.com/x">John 3:16</a>'),
     '<a href="https://www.biblegateway.com/x">John 3:16</a>');

  ok('javascript: keeps only the words, never the scheme',
     s('<a href="javascript:steal()">tap</a>'), 'tap');
  ok('and neither does data:',
     s('<a href="data:text/html;base64,c3RlYWwoKQ==">tap</a>'), 'tap');
  /* A browser follows `\njavascript:` exactly as it follows `javascript:`,
     which is why the href is stripped of leading control characters before it
     is read. Written with a real newline in the attribute, the way it would
     arrive. */
  ok('a scheme hiding behind a newline is still that scheme',
     s('<a href="\njavascript:steal()">tap</a>'), 'tap');
  ok('a relative link has no scheme to trust and loses its href',
     s('<a href="/give">tap</a>'), 'tap');

  ok('an event handler cannot ride in on a link either',
     s('<a href="https://homechurch.org" onclick="steal()">tap</a>'),
     '<a href="https://homechurch.org">tap</a>');
  ok('a script tag loses the tag and the code with it',
     s('<script>alert(1)</script>'), 'alert(1)');
  ok('an image with onerror is not an image any more',
     s('<img src=x onerror="steal()">'), '');

  // The default is the stricter policy, so a caller that forgets to say gets a
  // link that lost its href rather than one that kept an href it should not.
  ok('and a caller that says nothing gets the journal’s policy',
     HC.richtext.sanitize('<a href="https://homechurch.org">tap</a>'), 'tap');
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

  // An entry that carries only the words, with no offsets, is still drawn.
  // locate() can resolve it, so forAnchor() must not filter it out first.
  {
    const fresh = boot({ guides: { g1: { title: 'Held' } } }).HC;
    fresh.journal.create({
      kind: 'highlight', guideId: 'g1', path: 'shortSummary.0',
      quote: 'about his father'
    });
    ok('a quote with no offsets is still drawn',
       /<mark [^>]*>about his father<\/mark>/.test(
         fresh.journal.marked('g1', 'shortSummary.0', TEXT)), true);
  }

  // A paragraph with nothing in it renders exactly what it always did.
  ok('a guide with no highlights renders plain escaped text',
     HC.journal.marked('g1', 'fullSummary.0', 'Plain <b>text</b> & more'),
     'Plain &lt;b&gt;text&lt;/b&gt; &amp; more');
  ok('and so does one with no guide at all',
     HC.journal.marked(null, 'x', 'a & b'), 'a &amp; b');
}

/* ------------------------------------------------------------------ sync */

console.log('\n— two phones, one journal —');
(async () => {
  // Nothing goes up while nobody is signed in.
  {
    const { HC, wire } = boot();
    HC.journal.create({ bodyText: 'written signed out' });
    ok('signed out, nothing is sent anywhere', wire.sent.length, 0);
    ok('and sync refuses to run', await HC.journal.sync(), false);
  }

  // A push carries what is dirty, and marks it clean.
  {
    const { HC, wire } = boot({ user: 'user-a' });
    const e = HC.journal.create({ bodyText: 'a thing', guideId: 'g1' });
    const n = await HC.journal._push();
    // init() already ran a sync, so the first thing on the wire is its pull.
    const posted = wire.sent.filter(r => r.opts && r.opts.method === 'POST')[0];

    ok('one dirty entry, one pushed', n, 1);
    ok('as an upsert on the primary key',
       /on_conflict=id/.test(posted.path), true);
    ok('with merge-duplicates, which is what makes a retry safe',
       /merge-duplicates/.test(posted.opts.headers.Prefer), true);
    ok('the row carries the words', posted.opts.body[0].body_text, 'a thing');
    ok('and never claims a user_id',
       Object.prototype.hasOwnProperty.call(posted.opts.body[0], 'user_id'), false);
    ok('the entry is clean afterwards', HC.journal._state().entries[e.id].dirty, false);

    ok('a second push has nothing to say', await HC.journal._push(), 0);
  }

  // A failed push leaves the entry dirty, to try again.
  {
    const { HC, wire } = boot({ user: 'user-a' });
    const e = HC.journal.create({ bodyText: 'written on a plane' });
    wire.fail = true;
    ok('an offline sync fails quietly', await HC.journal.sync(), false);
    ok('and the entry is still dirty', HC.journal._state().entries[e.id].dirty, true);
    ok('and still on the phone', HC.journal.all().length, 1);
  }

  // A pull brings the other phone's writing in.
  {
    const { HC } = boot({
      user: 'user-a',
      rows: [{
        id: 'from-ipad', user_id: 'user-a', kind: 'entry',
        body_html: '<p>typed on the iPad</p>', body_text: 'typed on the iPad',
        created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z'
      }]
    });
    await HC.journal._pull();
    ok('the other phone\'s entry arrives', HC.journal.all().length, 1);
    ok('with its words', HC.journal.all()[0].bodyText, 'typed on the iPad');
    ok('not marked dirty, because it came from the server',
       HC.journal.all()[0].dirty, false);
    ok('and the watermark moved',
       HC.journal._state().lastPulledAt, '2026-08-01T10:00:00Z');
  }

  // Markup arriving from the server is sanitized on the way in, not trusted.
  {
    const { HC } = boot({
      user: 'user-a',
      rows: [{
        id: 'hostile', user_id: 'user-a',
        body_html: '<p>hello<script>steal()</script></p>', body_text: 'hello',
        created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z'
      }]
    });
    await HC.journal._pull();
    ok('a row from the server goes through the allowlist too',
       HC.journal.all()[0].bodyHtml, '<p>hellosteal()</p>');
  }

  // The conflict. Both sides edited; the later edit wins.
  {
    const { HC } = boot({
      user: 'user-a',
      rows: [{
        id: 'shared', user_id: 'user-a',
        body_html: '<p>the iPad version</p>', body_text: 'the iPad version',
        created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T12:00:00Z'
      }]
    });
    // A local copy that is older than what is coming down.
    HC.journal.create({ id: 'shared', bodyText: 'the phone version' });
    HC.journal._state().entries.shared.updatedAt = '2026-08-01T09:00:00Z';

    await HC.journal._pull();
    ok('an older local edit gives way to a newer remote one',
       HC.journal.get('shared').bodyText, 'the iPad version');
  }

  {
    const { HC } = boot({
      user: 'user-a',
      rows: [{
        id: 'shared', user_id: 'user-a',
        body_html: '<p>the iPad version</p>', body_text: 'the iPad version',
        created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z'
      }]
    });
    HC.journal.create({ id: 'shared', bodyText: 'the phone version' });   // dirty, and newer
    await HC.journal._pull();
    ok('a newer local edit is not clobbered by the pull',
       HC.journal.get('shared').bodyText, 'the phone version');
    ok('and is still waiting to go up',
       HC.journal._state().entries.shared.dirty, true);
  }

  // The delete that must not come back.
  {
    const { HC, wire } = boot({ user: 'user-a' });
    const e = HC.journal.create({ bodyText: 'to be deleted' });
    await HC.journal._push();
    HC.journal.remove(e.id);

    ok('a delete is a dirty tombstone, not an absence',
       [HC.journal._state().entries[e.id].dirty,
        !!HC.journal._state().entries[e.id].deletedAt], [true, true]);

    wire.sent.length = 0;
    await HC.journal._push();
    const tomb = wire.sent.filter(r => r.opts && r.opts.method === 'POST')[0];
    ok('and it is sent as a row with deleted_at set',
       !!tomb.opts.body[0].deleted_at, true);
    ok('only then is it dropped from the phone',
       !!HC.journal._state().entries[e.id], false);
  }

  console.log('\n' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : '') + '.');
  process.exit(fail ? 1 : 0);
})();
  