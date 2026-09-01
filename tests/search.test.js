/* ===========================================================================
   Search, the parts that are not about how it looks.

   WHAT IS WORTH TESTING HERE. A search box fails quietly, which is the whole
   problem with it. Nothing crashes when a message stops being findable by its
   own title; there is just one fewer result on a list nobody counted, and the
   person searching concludes the app does not have the thing. So the
   questions below are the ones whose wrong answers are silent.

   THE APOSTROPHE IS THE FIRST ONE AND IT IS NOT A DETAIL. Nearly every title
   in this catalogue carries a curly apostrophe, "Who's In Your Corner?" among
   them, and no phone keyboard produces one by default. Fold it or that
   message cannot be found by name, by anybody, ever.

   THE SECOND IS THE HIGHLIGHT, which is the same fact wearing a different
   hat. normalize() has to map one character to one character, because the
   snippet is cut out of the original text using indices found in the
   normalized copy. The day somebody reaches for String.normalize('NFD')
   because it folds accents better, every mark after the first accented letter
   in a guide lands a character to the left of the word it means, and nothing
   fails. So it is asserted here.

   THE THIRD IS THE JOURNAL LOCK. A locked journal that is still searchable
   from the top bar is not locked. That is a privacy promise made on Your
   account and in the App Store listing, and this is the one place in the app
   where it could be broken without anybody noticing.

   THE FOURTH IS THE IDS. Every row in this app has an id like
   `guide-slow-burn`, and the id is text. Leave them on the index and a search
   for "guide" returns the whole catalogue, which is a search nobody uses
   twice.

   No browser. jsdom is not a dependency of this project and is not going to
   become one, so the handful of DOM calls js/search.js makes are faked below,
   exactly as tests/edit-mode.test.js and tests/worship.test.js do.
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
const okTrue = (label, got) => ok(label, !!got, true);

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/* --------------------------------------------------------------- the fakes

   js/search.js reaches for a document only inside screenText(), and only to
   draw the screens for their words. There is no document here, which that
   function checks for and answers '' to, so every place on the index below
   contributes its name and nothing else. That is deliberate: what the screens
   say is js/screens/*.js's business and is asserted by the browser tests
   under tests/e2e. What is asserted here is the half that has to be right
   with no browser at all. */
function boot(over) {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  // components.js, for esc() and formatDate(). Neither touches the DOM, which
  // is what lets the real file be used rather than a stand-in that could
  // disagree with it about escaping.
  vm.runInContext(read('js', 'components.js'), sandbox);

  const HC = sandbox.HC;

  // The one thing store.js is asked for here is the subscription at the
  // bottom of js/search.js, which must not throw when the index is built.
  HC.store = { on: () => {} };

  HC.router = { TABS: ['home', 'listen', 'guide', 'group', 'connect'] };
  HC.titles = { home: 'Home', listen: 'Listen', guide: 'Guides',
                group: 'Group', connect: 'Connect', give: 'Give',
                profile: 'Your account', privacy: 'Privacy policy',
                terms: 'Terms of use', data: 'Your data' };
  HC.modules = [{ route: 'give', sub: 'Through Overflow, in your own browser.' }];

  HC.data = Object.assign({
    sermons: [],
    guides: [],
    series: [],
    announcements: [],
    events: [],
    groups: [],
    serveTeams: [],
    nextSteps: [],
    worshipSets: [],
    contentPages: [],
    textOverrides: [],
    readingPlan: null,
    church: null,
    podcast: null,
    guideTitle: (g) => g.themeTitle || 'Untitled'
  }, over && over.data);

  if (over && over.practices) HC.practices = over.practices;
  if (over && over.journal) HC.journal = over.journal;

  vm.runInContext(read('js', 'search.js'), sandbox);
  return HC;
}

const titles = (found) => found.map((r) => r.title);
const kinds = (found) => found.map((r) => r.kind);

/* --------------------------------------------------- the curly apostrophe */

{
  const HC = boot({
    data: {
      sermons: [{
        id: 'sermon-who-s-in-your-corner',
        title: 'Who’s In Your Corner?',
        preacher: 'Stephen Daigle',
        passage: '2 Samuel 15-19',
        summary: ['Who’s in your corner when life falls apart?']
      }]
    }
  });

  ok('a curly apostrophe is found by the straight one anybody types',
    titles(HC.search.results('who\'s in your corner')), ['Who’s In Your Corner?']);

  ok('and by the curly one, if somebody pastes it',
    titles(HC.search.results('who’s in your corner')), ['Who’s In Your Corner?']);

  ok('the preacher finds the message he preached',
    titles(HC.search.results('daigle')), ['Who’s In Your Corner?']);

  ok('so does the passage',
    titles(HC.search.results('2 samuel')), ['Who’s In Your Corner?']);

  ok('a word in the summary, which is not the title, still finds it',
    titles(HC.search.results('falls apart')), ['Who’s In Your Corner?']);

  /* Every token has to land somewhere, which is what makes a second word
     narrow the list rather than widen it. "corner" is in this message and
     "sabbath" is not, so together they are nothing. */
  ok('two words are an and, not an or', HC.search.results('corner sabbath'), []);

  ok('one letter is not a search yet', HC.search.results('w'), []);
  ok('nor is an empty box', HC.search.results('   '), []);
}

/* ------------------------------------------------------------ ids and URLs */

{
  const HC = boot({
    data: {
      guides: [
        { id: 'guide-slow-burn', themeTitle: 'Failure Isn’t Final',
          subtitle: 'What David did after the worst thing he ever did' },
        { id: 'guide-seat-table', themeTitle: 'A Seat at the Table',
          subtitle: 'Grace, in one chapter' }
      ],
      announcements: [{
        id: 'ann-baptism', title: 'Baptism Sunday', eyebrow: '',
        body: 'Tell us by the Sunday before.',
        linkUrl: 'https://homechurchnola.churchcenter.com/registrations/events/3798127'
      }]
    }
  });

  /* The word is in both primary keys and in neither piece of prose. On an
     index that kept ids this returns two guides, which is how a search box
     becomes furniture. */
  ok('an id is not text', HC.search.results('guide-'), []);

  ok('nor is the rest of it', HC.search.results('slow burn'), []);

  ok('a URL is not text either', HC.search.results('churchcenter'), []);

  ok('the words around it are',
    titles(HC.search.results('sunday before')), ['Baptism Sunday']);
}

/* --------------------------------------------------------- markup and dates */

{
  const HC = boot({
    data: {
      announcements: [{
        id: 'ann-serve', title: 'City Serve Day', publishedOn: '2026-09-01',
        bodyHtml: '<p>One Saturday, <strong>four sites</strong> across the parish.</p>'
      }]
    }
  });

  ok('markup an admin typed is indexed as the words inside it',
    titles(HC.search.results('four sites')), ['City Serve Day']);

  ok('and the tags themselves are not searchable',
    HC.search.results('strong'), []);

  ok('a date column is not text', HC.search.results('2026-09-01'), []);
}

/* -------------------------------------------------------------- the snippet

   Where the words were found, with the words marked. The two things that can
   be wrong here are silent: a mark around the wrong characters, and markup
   from the content reaching innerHTML unescaped. */

{
  const HC = boot({
    data: {
      guides: [{
        id: 'guide-seat-table', themeTitle: 'A Seat at the Table',
        subtitle: 'Grace, in one chapter',
        // Long enough that the snippet has to be cut out of the middle of it,
        // and carrying an accented word before the match, which is the case
        // an NFD fold would put the highlight in the wrong place on.
        fullSummary: [
          'David is secure. He has come through the cave years and the civil ' +
          'war and the naïve early days of the kingdom, and security usually ' +
          'makes people protective rather than generous. This is the chapter ' +
          'where he does the opposite of what a new king is supposed to do, ' +
          'and the word behind it is hesed, the stubborn covenant loyalty ' +
          'that keeps showing up long after the relationship has given it ' +
          'every reason to quit.'
        ]
      }]
    }
  });

  const hit = HC.search.results('hesed')[0];

  okTrue('the snippet marks the word that was searched for',
    hit.snippet.indexOf('<mark class="hc-search__hit">hesed</mark>') !== -1);

  okTrue('and cuts the middle out rather than starting at the beginning',
    hit.snippet.indexOf('…') === 0);

  /* The assertion that keeps normalize() honest. An accent sits before the
     match in this text; if folding it moved an index, the mark would open a
     character early and the word inside it would not be the word. */
  ok('the marked characters are exactly the word',
    (hit.snippet.match(/<mark class="hc-search__hit">([^<]*)<\/mark>/) || [])[1],
    'hesed');
}

{
  const HC = boot({
    data: {
      contentPages: [{
        id: 'page-give', title: 'Give',
        blurb: 'Everything <b>here</b> runs on people & the promises they kept.'
      }]
    }
  });

  const hit = HC.search.results('promises')[0];

  okTrue('an ampersand from the content is escaped on its way to the snippet',
    hit.snippet.indexOf('&amp;') !== -1);

  okTrue('and no tag from the content survives into it',
    hit.snippet.indexOf('<b>') === -1);
}

/* ----------------------------------------------------------------- ranking

   A screen carries every word on it, so without a hand on the scale a search
   for anything returns the tab it is listed on above the thing itself. The
   screens still have to win when their own name is what was typed. */

{
  const HC = boot({
    data: {
      sermons: [{ id: 'sermon-give', title: 'The Cost of Giving',
                  summary: ['What it costs to give.'] }]
    }
  });

  ok('the thing itself outranks the screen it lives on',
    kinds(HC.search.results('giving'))[0], 'Message');

  ok('a screen called what you typed comes first',
    titles(HC.search.results('give'))[0], 'Give');

  ok('a module keeps the name js/app.js gives it',
    kinds(HC.search.results('give'))[0], 'Screen');

  ok('and its route is where tapping it goes',
    HC.search.results('give')[0].route, { name: 'give' });
}

/* Every result carries a whole address, because js/app.js follows it blind. */
{
  const HC = boot({
    data: {
      guides: [{ id: 'guide-seat-table', themeTitle: 'A Seat at the Table',
                 subtitle: 'Grace' }],
      announcements: [{ id: 'ann-baptism', title: 'Baptism Sunday',
                        body: 'In the water.' }],
      contentPages: [{ id: 'page-give', title: 'Giving', blurb: 'Overflow.' }]
    }
  });

  ok('a guide opens the reader, by id',
    HC.search.results('seat at the table')[0].route,
    { name: 'guide-reader', id: 'guide-seat-table' });

  ok('an announcement opens its own page, by id',
    HC.search.results('baptism')[0].route,
    { name: 'announcement', id: 'ann-baptism' });

  ok('a content page opens the one screen that draws them, by id',
    HC.search.results('overflow')[0].route,
    { name: 'page', id: 'page-give' });
}

/* ------------------------------------------------------------ the practices

   The nine are on the index by name straight away, and fill in as their files
   land. A practice nobody has opened must still be findable by what it is
   called, because that is what the grid shows. */

{
  const loaded = {
    sabbath: { title: 'Sabbath', subtitle: 'A day to stop',
               sessions: [{ title: 'Stopping', body: 'The first practice is to stop.' }] }
  };
  const HC = boot({
    practices: {
      list: () => [{ slug: 'sabbath', title: 'Sabbath' },
                   { slug: 'fasting', title: 'Fasting' }],
      get: (slug) => loaded[slug] || null
    }
  });

  ok('a practice that has not been opened is still findable by name',
    titles(HC.search.results('fasting')), ['Fasting']);

  ok('one that has been read is findable by what is inside it',
    titles(HC.search.results('the first practice')), ['Sabbath']);

  ok('and it opens that practice',
    HC.search.results('fasting')[0].route, { name: 'practice', id: 'fasting' });
}

/* --------------------------------------------------------- the journal lock */

{
  const entries = [{ id: 'entry-1', title: 'Monday morning',
                     bodyText: 'I keep coming back to Mephibosheth.',
                     guideTitle: 'A Seat at the Table' }];

  const open = boot({
    journal: { all: () => entries, isLocked: () => false }
  });
  ok('an unlocked journal is searchable, because it is yours',
    titles(open.search.results('mephibosheth')), ['Monday morning']);
  ok('and an entry opens itself',
    open.search.results('mephibosheth')[0].route,
    { name: 'journal-entry', id: 'entry-1' });

  const locked = boot({
    journal: { all: () => entries, isLocked: () => true }
  });
  ok('a locked journal is not on the index at all',
    locked.search.results('mephibosheth'), []);

  /* The lock comes on while the app is open, so the index has to be able to
     go back. invalidate() is what the subscriptions at the bottom of
     js/search.js call, and this is the assertion that it really rebuilds. */
  let isLocked = false;
  const both = boot({
    journal: { all: () => entries, isLocked: () => isLocked }
  });
  ok('found while the journal is open',
    titles(both.search.results('mephibosheth')), ['Monday morning']);
  isLocked = true;
  both.search.invalidate();
  ok('gone once it is locked and the index is rebuilt',
    both.search.results('mephibosheth'), []);
}

/* --------------------------------------------------------- the church itself

   "What time is church" is the most likely thing anybody types into a box
   like this, and the answer is not in any of the collections above. */

{
  const HC = boot({
    data: {
      church: {
        id: 'church-home', name: 'Home Church',
        tagline: 'A church of the city.',
        address: { line1: '216 Giuffrias Ave', city: 'Metairie', state: 'LA' },
        serviceDay: 'Sunday',
        serviceTimes: ['8:00 AM', '9:30 AM', '11:00 AM'],
        givingUrl: 'https://donate.overflow.co/homechurchnola'
      }
    }
  });

  ok('the street finds the church',
    titles(HC.search.results('giuffrias')), ['Home Church']);
  ok('so does a service time',
    titles(HC.search.results('9:30')), ['Home Church']);
  ok('and the giving link is still not text',
    HC.search.results('donate.overflow'), []);
}

/* ------------------------------------------------------------------ the fold

   Asserted directly as well as through the results above, because this is the
   invariant the snippet depends on and it is the one somebody could break
   while making the folding better. */

{
  const HC = boot({});
  const n = HC.search.normalize;

  ok('normalize is length preserving', n('Who’s naïve — “quoted”').length,
    'Who’s naïve — “quoted”'.length);
  ok('and folds what a keyboard cannot type', n('Who’s naïve — “quoted”'),
    'who\'s naive - "quoted"');
  ok('a word with no folding in it is only lowercased', n('Sabbath'), 'sabbath');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
