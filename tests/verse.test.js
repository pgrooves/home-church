/* ===========================================================================
   The verse sheet, and the three things under it.

     js/bible.js       reading "Rom 12:1-2" as a passage, and writing the
                       USFM id and the bible.com links out of it
     bible-passage     the checks the Edge Function makes before our key
                       goes anywhere, lifted out of the TypeScript the same
                       way tests/newsletter-dates.test.js lifts the intake's
     js/verse.js       asking once, keeping what came back, and saying the
                       right thing when there is no signal

   The reader is the part worth the most cases. Every reference in a guide
   goes through it, and one it gets wrong is a sheet with the wrong verse in
   it, which is worse than the web page it replaced.

   No browser and no network. The DOM is the smallest fake that lets the
   sheet mount and repaint; fetch is a list of answers.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');

process.removeAllListeners('warning');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const js = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

/* ------------------------------------------------------------- the harness */

function boot(answers) {
  const calls = { fetched: [], opened: [], painted: [] };
  let mounted = null;

  const host = {
    removeChild: () => { mounted = null; },
    replaceChild: (fresh) => { mounted = fresh; }
  };

  const storage = new Map();
  const sandbox = {
    window: {
      localStorage: {
        getItem: k => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: k => storage.delete(k)
      },
      setTimeout: () => 0,
      console
    },
    document: {
      querySelector: sel => (sel === '[data-sheet="verse"]' ? mounted : null),
      querySelectorAll: () => [],
      getElementById: () => ({ appendChild: el => { mounted = el; } }),
      addEventListener: () => {},
      createElement: () => ({})
    },
    navigator: {},
    fetch: (url, opts) => {
      calls.fetched.push({ url, apikey: opts && opts.headers && opts.headers.apikey });
      const next = answers.shift();
      if (!next) return Promise.reject(new TypeError('Load failed'));
      return Promise.resolve({
        ok: next.status === 200,
        json: () => Promise.resolve(next.body)
      });
    },
    console
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);

  ['store.js', 'bible.js', 'components.js'].forEach(f => vm.runInContext(js(f), sandbox));

  const HC = sandbox.window.HC;
  HC.config = { SUPABASE_URL: 'https://example.supabase.co/', SUPABASE_ANON_KEY: 'pk' };

  // Mounting is all the sheet asks of the DOM. What it drew is kept as markup.
  HC.components.el = html => {
    calls.painted.push(html);
    return {
      html,
      parentNode: host,
      querySelector: () => ({ scrollTop: 0, focus: () => {} }),
      setAttribute: () => {}
    };
  };
  HC.components.openExternal = url => calls.opened.push(url);

  vm.runInContext(js('verse.js'), sandbox);
  return { HC, calls, sheet: () => (mounted ? mounted.html : '') };
}

const settle = () => new Promise(r => setImmediate(r));

(async function main() {

  const { HC } = boot([]);
  const B = HC.bible;
  const P = s => { const p = B.parse(s); return p && [p.book, p.chapter, p.verse, p.toChapter, p.toVerse]; };

  /* ------------------------------------------------------------ the reader */

  ok('a verse', P('John 3:16'), ['John', 3, 16, 3, 16]);
  ok('a range inside a chapter', P('John 3:16-18'), ['John', 3, 16, 3, 18]);
  ok('a range that crosses a chapter', P('John 3:16–4:2'), ['John', 3, 16, 4, 2]);
  ok('a whole chapter', P('Psalm 23'), ['Psalms', 23, 0, 23, 0]);
  ok('a run of chapters', P('Matthew 5-7'), ['Matthew', 5, 0, 7, 0]);
  ok('an abbreviation with a dot', P('Rom. 12:1-2'), ['Romans', 12, 1, 12, 2]);
  ok('a numbered book, short', P('1 Cor 13'), ['1 Corinthians', 13, 0, 13, 0]);
  ok('a numbered book in roman numerals', P('II Timothy 3:16'), ['2 Timothy', 3, 16, 3, 16]);
  ok('and spelled out', P('First John 1:9'), ['1 John', 1, 9, 1, 9]);
  ok('a one chapter book, written the way people write it', P('Jude 4'), ['Jude', 1, 4, 1, 4]);
  ok('and a range in one', P('Philemon 8-10'), ['Philemon', 1, 8, 1, 10]);
  ok('and the long way round', P('Obadiah 1:4'), ['Obadiah', 1, 4, 1, 4]);
  ok('a one chapter book on its own', P('Jude'), ['Jude', 1, 0, 1, 0]);
  ok('a half verse is the verse', P('John 3:16a'), ['John', 3, 16, 3, 16]);
  ok('Song of Songs', P('Song of Songs 2:4'), ['Song of Solomon', 2, 4, 2, 4]);
  ok('a trailing full stop', P('Isaiah 53:5.'), ['Isaiah', 53, 5, 53, 5]);
  ok('spaces where they should not be', P('John 3 : 16 - 18'), ['John', 3, 16, 3, 18]);

  ok('a verse past the end of its chapter is nothing', B.parse('John 3:40'), null);
  ok('and so is a chapter past the end of its book', B.parse('Jude 2:1'), null);
  ok('and a range that runs backwards', B.parse('John 3:18-16'), null);
  ok('and a book that is not one', B.parse('Hezekiah 3:16'), null);
  ok('and a book on its own when it is longer than a chapter', B.parse('John'), null);
  ok('and a sentence', B.parse('see you Sunday'), null);

  const all = s => B.parseAll(s).map(B.label);
  ok('several, the way the guides write them',
     all('Matthew 10:1-4; Mark 3:31-35'), ['Matthew 10:1-4', 'Mark 3:31-35']);
  ok('the book carried over',
     all('John 15:15; 1 John 1:7; 5:4'), ['John 15:15', '1 John 1:7', '1 John 5:4']);
  ok('and the chapter too',
     all('Romans 12:1-2, 9-10'), ['Romans 12:1-2', 'Romans 12:9-10']);
  ok('a chapter after a chapter is a chapter', all('John 12; 13'), ['John 12', 'John 13']);
  ok('the one that will not read is skipped, not the lot',
     all('Ephesians 4:40-32; Matthew 6:14-15; Matt 18:21-22'),
     ['Matthew 6:14-15', 'Matthew 18:21-22']);

  /* ---------------------------------------------- references in prose */

  const F = t => B.find(t).map(h => h.text);
  ok('a reference in a sentence', F('I read John 3:16 this morning'), ['John 3:16']);
  ok('several, abbreviated and numbered',
     F('Rom. 12:1-2 and then 1 Cor 13 and 2 Sam 7:12–16.'),
     ['Rom. 12:1-2', '1 Cor 13', '2 Sam 7:12–16']);
  ok('a name is not a book', F('Mark was here 5 times'), []);
  ok('nor is a chapter that is not there', F('Mark 97'), []);
  ok('lower case is somebody\'s job, not the book of Job', F('my job 3 days a week'), []);
  ok('two letter abbreviations are left alone in prose', F('Ps 23 and Jn 3:16'), []);
  ok('but not the long names', F('Psalm 23, Song of Songs 2:4, Jude 4'),
     ['Psalm 23', 'Song of Songs 2:4', 'Jude 4']);
  ok('a reference glued to a word is not one', F('Johnny 3:16 and xJohn 3:16'), []);

  ok('linkify turns a typed reference into a scripture link, keeping the words',
     B.linkify('<p>on Romans 8:28 today</p>'),
     '<p>on <a href="https://www.bible.com/bible/111/ROM.8.28.NIV">Romans 8:28</a> today</p>');
  ok('it leaves a reference that is already a link alone',
     B.linkify('<p><a href="https://www.bible.com/bible/111/JHN.3.16.NIV">John 3:16</a></p>'),
     '<p><a href="https://www.bible.com/bible/111/JHN.3.16.NIV">John 3:16</a></p>');
  ok('and does not reach inside a tag',
     B.linkify('<p title="John 3:16">x</p>'), '<p title="John 3:16">x</p>');
  ok('markup with nothing to link comes back exactly as it went in',
     B.linkify('<p>Some <strong>words</strong>.</p>'), '<p>Some <strong>words</strong>.</p>');

  /* ---------------------------------------------------- what it writes out */

  const U = s => B.usfm(B.parse(s));
  ok('a verse as USFM', U('John 3:16'), 'JHN.3.16');
  ok('a range', U('John 3:16-18'), 'JHN.3.16-JHN.3.18');
  ok('across chapters', U('John 3:16-4:2'), 'JHN.3.16-JHN.4.2');
  ok('a chapter', U('Psalm 23'), 'PSA.23');
  ok('chapters', U('Matthew 5-7'), 'MAT.5-MAT.7');
  ok('the codes that are not the name', [U('Judges 1'), U('Philippians 4:13'), U('Song 1')],
     ['JDG.1', 'PHP.4.13', 'SNG.1']);
  ok('every book has a code, and they are all different',
     new Set(B.books.map(b => b.usfm)).size, 66);

  ok('the chapter on bible.com', B.chapterUrl(B.parse('John 3:16-18')),
     'https://www.bible.com/bible/111/JHN.3.NIV');
  ok('the passage on bible.com', B.passageUrl(B.parse('John 3:16-18')),
     'https://www.bible.com/bible/111/JHN.3.16-18.NIV');
  ok('which has no form for a range across chapters, so the chapter it starts in',
     B.passageUrl(B.parse('John 3:16-4:2')), 'https://www.bible.com/bible/111/JHN.3.NIV');

  const c = HC.components;
  ok('bibleUrl is bible.com now', c.bibleUrl('Jude 4'), 'https://www.bible.com/bible/111/JUD.1.4.NIV');
  ok('and a reference it cannot read goes to bible.com search',
     c.bibleUrl('the Sermon on the Mount'),
     'https://www.bible.com/search/bible?q=the%20Sermon%20on%20the%20Mount');
  ok('a scripture link is recognised on either host',
     [c.isScriptureHref('https://www.bible.com/bible/111/JHN.3.16.NIV'),
      c.isScriptureHref('https://www.biblegateway.com/passage/?search=John+3%3A16')],
     [true, true]);
  ok('and nothing else is',
     [c.isScriptureHref('https://www.bible.com/login'),
      c.isScriptureHref('https://www.bible.com.evil.test/bible/1'),
      c.isScriptureHref('https://homechurchnola.com')],
     [false, false, false]);

  /* ---------------------------------------------------- the Edge Function */

  if (typeof stripTypeScriptTypes !== 'function') {
    console.log('SKIP  bible-passage helpers: node ' + process.version + ' has no type stripper');
  } else {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'bible-passage', 'index.ts'), 'utf8');
    const start = source.indexOf('/* @@ passage:start');
    const end = source.indexOf('/* @@ passage:end */');
    if (start === -1 || end < start) {
      ok('the function helpers are fenced by @@ passage:start / @@ passage:end', false, true);
    } else {
      const fn = vm.runInNewContext(
        stripTypeScriptTypes(source.slice(start, end)) + '\n({ isPassageId, versesOf, tidy, BOOKS })');

      ok('the function knows the same sixty-six books as the app',
         Array.from(fn.BOOKS), B.books.map(b => b.usfm));
      ok('it takes every id the app writes',
         ['John 3:16', 'John 3:16-18', 'John 3:16-4:2', 'Psalm 23', 'Matthew 5-7', 'Jude 4']
           .map(s => fn.isPassageId(U(s))),
         [true, true, true, true, true, true]);
      ok('and refuses anything else before it reaches YouVersion',
         ['', 'JHN', 'jhn.3.16', 'JHN.3.16-MAT.1.1', 'JHN.3.16-JHN.4', 'JHN.3.16;DROP',
          'XYZ.1.1', 'JHN.3.16/../../bibles'].map(fn.isPassageId),
         [false, false, false, false, false, false, false, false]);
      ok('a range, one verse at a time, for the fallback',
         Array.from(fn.versesOf('JHN.3.16-JHN.3.18')), ['JHN.3.16', 'JHN.3.17', 'JHN.3.18']);
      ok('but not across chapters, and not Psalm 119 in one go',
         [fn.versesOf('JHN.3.16-JHN.4.2'), fn.versesOf('PSA.119.1-PSA.119.176')], [null, null]);
      ok('the text is tidied and the poetry keeps its lines',
         fn.tidy('  The Lord is my shepherd,\r\n   I lack nothing.\n\n\n\nHe makes me  lie down '),
         'The Lord is my shepherd,\nI lack nothing.\n\nHe makes me lie down');
    }
  }

  /* ------------------------------------------------------------ the sheet */

  const NIV = { id: 111, abbreviation: 'NIV', copyright: 'NIV® Copyright © 2011 by Biblica' };
  const first = boot([
    { status: 200, body: { reference: 'John 3:16', text: 'For God so loved the world', version: NIV } }
  ]);

  first.HC.verse.open('John 3:16');
  ok('it asks the function once, for the USFM id, with the publishable key',
     first.calls.fetched,
     [{ url: 'https://example.supabase.co/functions/v1/bible-passage?ref=JHN.3.16', apikey: 'pk' }]);
  ok('and says what it is opening while it waits', /Opening John 3:16/.test(first.sheet()), true);

  await settle();
  ok('then the words', /For God so loved the world/.test(first.sheet()), true);
  ok('with the copyright under them', /Biblica/.test(first.sheet()), true);
  ok('and the chapter one tap away',
     first.sheet().indexOf('data-url="https://www.bible.com/bible/111/JHN.3.NIV"') !== -1, true);

  first.HC.verse.close();
  ok('closing takes it down', first.sheet(), '');

  first.HC.verse.open('John 3:16');
  ok('a passage opened before comes from the phone, not the network',
     [first.calls.fetched.length, /For God so loved/.test(first.sheet())], [1, true]);

  const offline = boot([]);
  offline.HC.verse.open('Romans 8:28');
  await settle();
  ok('no signal, never opened: it says so rather than spinning',
     /not saved on this phone yet/.test(offline.sheet()), true);
  ok('and still offers the chapter', /ROM\.8\.NIV/.test(offline.sheet()), true);

  const refused = boot([{ status: 404, body: { error: 'We could not find that passage.' } }]);
  refused.HC.verse.open('Romans 8:28');
  await settle();
  ok('a refusal is said in the function\'s words',
     /We could not find that passage/.test(refused.sheet()), true);

  const unreadable = boot([]);
  unreadable.HC.verse.open('the Sermon on the Mount');
  ok('a reference it cannot read never reaches the network', unreadable.calls.fetched.length, 0);
  ok('it goes to bible.com search instead', unreadable.calls.opened,
     ['https://www.bible.com/search/bible?q=the%20Sermon%20on%20the%20Mount']);

  const several = boot([
    { status: 200, body: { reference: 'Matthew 10:1-4', text: 'Twelve disciples', version: NIV } },
    { status: 200, body: { reference: 'Mark 3:31-35', text: 'Mother and brothers', version: NIV } }
  ]);
  several.HC.verse.open('Matthew 10:1-4; Mark 3:31-35');
  await settle();
  ok('two passages get a pill each', (several.sheet().match(/hc-verse__pill"/g) || []).length, 2);
  ok('and only the first is fetched until somebody asks', several.calls.fetched.length, 1);
  several.HC.verse.show(1);
  await settle();
  ok('the second, when they do', /Mother and brothers/.test(several.sheet()), true);

  console.log('\n' + pass + ' passed' + (fail ? ', ' + fail + ' failed.' : '.'));
  process.exit(fail ? 1 : 0);
})();
