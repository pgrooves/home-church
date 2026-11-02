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
  ok('a short form with only a chapter is left alone', F('Ps 23 and Jn 3'), []);
  ok('but with a chapter and a verse the shape is scripture, in any case',
     F('john 3:16, Jn 3:16, ps 23:1, rom 8:28.'), ['john 3:16', 'Jn 3:16', 'rom 8:28']);
  ok('two letter forms still need their capital', F('ps 23:1 but Ps 23:1'), ['Ps 23:1']);
  ok('and an everyday word in lower case is still a word', F('my job 5:15 shift'), []);
  ok('a time on its own is not scripture', F('we met at 7:15'), []);
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
        stripTypeScriptTypes(source.slice(start, end)) +
        '\n({ isPassageId, versesOf, tidy, BOOKS, versesIn, chapterSpan, chaptersOf, joinedReference })');

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
      ok('the function knows how long every chapter is, the same as the app',
         B.books.every(b => b.verses.every((n, i) => fn.versesIn(b.usfm, i + 1) === n) &&
           fn.versesIn(b.usfm, b.chapters + 1) === 0),
         true);
      ok('how many chapters an id runs across',
         ['JHN.3.16', 'JHN.3.16-JHN.3.18', 'GEN.39.20-GEN.40.23', 'NUM.13-NUM.14', 'GEN.37-GEN.45']
           .map(fn.chapterSpan), [1, 1, 2, 2, 9]);
      const C = s => { const got = fn.chaptersOf(U(s)); return got && Array.from(got); };
      ok('a passage across chapters, a chapter at a time',
         C('Genesis 39:20-40:23'), ['GEN.39.20-GEN.39.23', 'GEN.40']);
      ok('a run of whole chapters',
         C('Numbers 13-14'), ['NUM.13', 'NUM.14']);
      ok('the middle chapters whole, the ends as far as they go',
         C('John 3:36-5:2'), ['JHN.3.36', 'JHN.4', 'JHN.5.1-JHN.5.2']);
      ok('starting at the first verse is the whole chapter, ending short is not',
         C('Genesis 3:1-4:10'), ['GEN.3', 'GEN.4.1-GEN.4.10']);
      ok('Genesis 37-45, the longest a guide has used, fits',
         C('Genesis 37-45').length, 9);
      ok('nothing to split inside one chapter, or past ten chapters, or past the end',
         [fn.chaptersOf('JHN.3.16-JHN.3.18'), fn.chaptersOf('PSA.23'),
          fn.chaptersOf('GEN.1-GEN.50'), fn.chaptersOf('GEN.39.30-GEN.40.1'),
          fn.chaptersOf('JHN.4.1-JHN.3.1')],
         [null, null, null, null, null]);
      ok('the joined reference reads the way the app writes it',
         [fn.joinedReference('Genesis 39:20-23', 'GEN.39.20-GEN.40.23'),
          fn.joinedReference('Numbers 13', 'NUM.13-NUM.14'),
          fn.joinedReference('1 Samuel 17:55-58', '1SA.17.55-1SA.18.4'),
          fn.joinedReference('Psalms 22', 'PSA.22-PSA.23')],
         ['Genesis 39:20-40:23', 'Numbers 13-14', '1 Samuel 17:55-18:4', 'Psalms 22-23']);
      ok('every reference the app reads is one the function can answer',
         B.books.every(b => {
           for (let ch = 1; ch <= b.chapters; ch++) {
             const last = b.verses[ch - 1];
             const ids = [B.usfm({ book: b.name, chapter: ch, verse: 0, toChapter: ch, toVerse: 0 }),
                          B.usfm({ book: b.name, chapter: ch, verse: 1, toChapter: ch, toVerse: last })];
             if (ch < b.chapters) {
               ids.push(B.usfm({ book: b.name, chapter: ch, verse: last, toChapter: ch + 1, toVerse: 1 }));
               ids.push(B.usfm({ book: b.name, chapter: ch, verse: 0, toChapter: ch + 1, toVerse: 0 }));
             }
             if (!ids.every(fn.isPassageId)) return false;
             if (ids.slice(2).some(id => !fn.chaptersOf(id))) return false;
           }
           return true;
         }),
         true);
      ok('the text is tidied and the poetry keeps its lines',
         fn.tidy('  The Lord is my shepherd,\r\n   I lack nothing.\n\n\n\nHe makes me  lie down '),
         'The Lord is my shepherd,\nI lack nothing.\n\nHe makes me lie down');
    }
  }

  /* ------------------------------------- the Edge Function, end to end

     The whole function, run here with a YouVersion that behaves the way the
     real one does: a chapter, or a range inside one, comes back; a range that
     runs from one chapter into the next is a 404. The cache and the rate
     counter are a Map and a yes. */
  if (typeof stripTypeScriptTypes === 'function') {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'bible-passage', 'index.ts'), 'utf8');

    function runFunction() {
      const asked = [];
      const cache = new Map();
      let handler = null;
      const books = { GEN: 'Genesis', NUM: 'Numbers', JHN: 'John' };
      const crosses = id => {
        const m = /^(\w+)\.(\d+)(?:\.\d+)?-\1\.(\d+)/.exec(id);
        return !!(m && m[2] !== m[3]);
      };
      const written = id => {
        const m = /^(\w+)\.(\d+)(?:\.(\d+))?(?:-\w+\.(\d+)(?:\.(\d+))?)?$/.exec(id);
        const name = books[m[1]] + ' ' + m[2];
        if (!m[3]) return name;
        return name + ':' + m[3] + (m[5] && m[5] !== m[3] ? '-' + m[5] : '');
      };
      const table = () => {
        const q = { filters: {} };
        q.select = () => q;
        q.eq = (k, v) => { q.filters[k] = v; return q; };
        q.gte = () => q;
        q.maybeSingle = async () => ({ data: cache.get(q.filters.passage_id) || null, error: null });
        q.upsert = async row => {
          cache.set(row.passage_id, { reference: row.reference, content: row.content });
          return { error: null };
        };
        return q;
      };
      const sandbox = {
        Deno: {
          env: { get: k => ({ YVP_APP_KEY: 'key', SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 'sr' })[k] },
          serve: fn => { handler = fn; }
        },
        createClient: () => ({ from: table, rpc: async () => ({ data: true, error: null }) }),
        fetch: async url => {
          const u = new URL(url);
          const m = /\/passages\/([^?]+)$/.exec(u.pathname);
          if (!m) {
            return new Response(JSON.stringify({ abbreviation: 'NIV', title: 'New International Version', copyright: 'Biblica' }));
          }
          const id = decodeURIComponent(m[1]);
          asked.push(id);
          if (crosses(id)) return new Response('{}', { status: 404 });
          return new Response(JSON.stringify({ reference: written(id), content: '[' + id + ']' }));
        },
        Response, URL, TextEncoder, crypto, console: { error: () => {}, log: () => {} }
      };
      vm.createContext(sandbox);
      vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*$/m, '')), sandbox);
      const ask = async ref => {
        const res = await handler(new Request('https://fn/bible-passage?ref=' + encodeURIComponent(ref)));
        return { status: res.status, body: await res.json() };
      };
      return { ask, asked, cache };
    }

    const yv = runFunction();
    const genesis = await yv.ask('GEN.39.20-GEN.40.23');
    ok('Genesis 39:20-40:23 comes back, where it used to be a 404',
       [genesis.status, genesis.body.reference, genesis.body.text],
       [200, 'Genesis 39:20-40:23', '[GEN.39.20-GEN.39.23]\n\n[GEN.40]']);
    ok('asked of YouVersion a chapter at a time',
       yv.asked, ['GEN.39.20-GEN.39.23', 'GEN.40']);
    ok('and each chapter is kept, and so is the whole',
       ['GEN.39.20-GEN.39.23', 'GEN.40', 'GEN.39.20-GEN.40.23'].map(k => yv.cache.has(k)),
       [true, true, true]);

    const again = await yv.ask('GEN.39.20-GEN.40.23');
    ok('the next phone gets it from the cache, without asking YouVersion again',
       [again.status, yv.asked.length], [200, 2]);

    const numbers = await yv.ask('NUM.13-NUM.14');
    ok('Numbers 13-14 too',
       [numbers.status, numbers.body.reference, numbers.body.text],
       [200, 'Numbers 13-14', '[NUM.13]\n\n[NUM.14]']);

    const chapter = await yv.ask('GEN.40');
    ok('a chapter already fetched as part of a longer passage is not fetched again',
       [chapter.status, yv.asked.filter(x => x === 'GEN.40').length], [200, 1]);

    const plain = await yv.ask('JHN.3.16-JHN.3.18');
    ok('a range inside one chapter is still one request, as before',
       [plain.status, plain.body.reference, yv.asked[yv.asked.length - 1]],
       [200, 'John 3:16-18', 'JHN.3.16-JHN.3.18']);

    const before = yv.asked.length;
    const long = await yv.ask('GEN.1-GEN.50');
    ok('fifty chapters at once is refused before anything is asked',
       [long.status, /too long/.test(long.body.error), yv.asked.length], [400, true, before]);

    const wrong = await yv.ask('GEN.39.30-GEN.40.1');
    ok('a verse that is not there is still not found',
       [wrong.status, wrong.body.error], [404, 'We could not find that passage.']);
  }

  /* --------------------------------------- the check the guide commands run */

  {
    const { spawnSync } = require('child_process');
    const run = refs => spawnSync(process.execPath,
      [path.join(__dirname, '..', 'scripts', 'check_scripture.js'), '--refs', refs.join('\n')],
      { encoding: 'utf8' });
    const good = run(['Genesis 39:20-40:23', 'Numbers 13-14', 'Acts 2:17-18; Joel 2:28-29', 'Jude 6']);
    ok('the scripture check passes references that open', [good.status, /Every reference opens/.test(good.stdout)], [0, true]);
    const bad = run(['2 Samuel 11 & 12', 'Romans 12:1-2; Hezekiah 4', 'Genesis 1-50']);
    ok('and stops on one that would not, or would lose a part, or is too long',
       [bad.status, (bad.stdout.match(/^FIX/gm) || []).length], [1, 3]);
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
