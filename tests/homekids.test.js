/* ===========================================================================
   HomeKids.

   WHAT IS PINNED HERE, in the order a week happens:

     which lesson       the page shows the most recent Sunday that has
                        happened; a lesson approved early stays hidden, arrows
                        included, until the morning of its Sunday.
     the ticks          stored per lesson and per item, counted against the
                        lesson's own list, and survive a reload.
     the emails         a HomeKids email is recognised by the two secrets and
                        nothing else; volunteers wins a tie; an unset secret
                        changes nothing about the newsletter.
     the drafts         every row the intake builds is unpublished and
                        pending, carries only links the email contained, and
                        drops an end date already behind it.
     the page itself    draws for every group, for no group, for no lesson, and
                        never prints "undefined" to somebody who is four.

   No browser, no Deno, no network. The intake's HomeKids helpers are fenced
   between two markers in the Edge Function, lifted out and evalled, the way
   tests/newsletter-dates.test.js reads the date helpers.
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

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SAMPLE = JSON.parse(read('demo-homekids/sample.json'));

/* ----------------------------------------------------------- a small app */

function memoryStorage() {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    key: i => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    _m: m
  };
}

function app(storage) {
  const sandbox = {
    console,
    document: {
      documentElement: { setAttribute() {}, getAttribute() { return null; }, style: { setProperty() {} } },
      querySelector() { return null; },
      addEventListener() {},
      createElement() { return { innerHTML: '', firstElementChild: null }; }
    }
  };
  sandbox.window = sandbox;
  sandbox.localStorage = storage || memoryStorage();
  sandbox.matchMedia = () => ({ matches: false, addEventListener() {} });
  vm.createContext(sandbox);
  ['js/data.js', 'js/store.js', 'js/content.js'].forEach(f =>
    vm.runInContext(read(f), sandbox, { filename: f }));
  return sandbox;
}

/* Rows through the real mapper. content.js keeps its mappers private, so the
   apply step is driven the way the cache primes: a payload keyed by table. */
function load(w, payload) {
  const lessons = w.HC.data.homekidsLessons;
  const updates = w.HC.data.homekidsUpdates;
  const src = read('js/content.js');
  // Lift the two mappers and their helpers out by name. If either is renamed
  // this fails loudly rather than testing nothing.
  ['function mapHomekidsGroupBlock', 'function mapHomekidsLesson', 'function mapHomekidsUpdate']
    .forEach(n => { if (src.indexOf(n) === -1) throw new Error('missing ' + n); });
  const grab = name => {
    const i = src.indexOf('function ' + name + '(');
    let depth = 0, j = src.indexOf('{', i);
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      if (src[j] === '}' && --depth === 0) break;
    }
    return src.slice(i, j + 1);
  };
  const mappers = vm.runInNewContext(
    'function str(v){return v==null?"":String(v);} function arr(v){return Array.isArray(v)?v:[];}' +
    grab('mapHomekidsGroupBlock') + grab('mapHomekidsLesson') + grab('mapHomekidsUpdate') +
    '({ lesson: mapHomekidsLesson, update: mapHomekidsUpdate })');
  lessons.length = 0; updates.length = 0;
  (payload.homekids_lessons || []).map(mappers.lesson).forEach(l => lessons.push(l));
  (payload.homekids_updates || []).map(mappers.update).forEach(u => updates.push(u));
  return mappers;
}

/* ------------------------------------------------------------ which lesson */

console.log('\n--- which lesson ---');
let w = app();
const mappers = load(w, SAMPLE);
const D = w.HC.data;

ok('newest Sunday first', D.homekidsLessonsByDate('2026-10-02').map(l => l.taughtOn), ['2026-09-27', '2026-09-20']);
ok('the Friday after a lesson shows that lesson',
  D.currentHomekidsLesson('2026-10-02').id, 'homekids-2026-09-27');
ok('a week runs Sunday to Saturday: the last Saturday of it still shows its Sunday',
  D.currentHomekidsLesson('2026-10-03').id, 'homekids-2026-09-27');
ok('on the Sunday itself, that Sunday',
  D.currentHomekidsLesson('2026-09-27').id, 'homekids-2026-09-27');
ok('the Saturday before, still last week',
  D.currentHomekidsLesson('2026-09-26').id, 'homekids-2026-09-20');
ok('a lesson approved early is hidden until its Sunday, arrows included',
  D.homekidsLessonsByDate('2026-09-26').map(l => l.taughtOn), ['2026-09-20']);
ok('and cannot be opened by id before then',
  [D.getHomekidsLesson('homekids-2026-09-27', '2026-09-26'), D.getHomekidsLesson('homekids-2026-09-27', '2026-09-27').id],
  [null, 'homekids-2026-09-27']);
ok('before the first Sunday there is nothing yet, which the page draws warmly',
  D.currentHomekidsLesson('2026-09-01'), null);

const empty = app();
ok('no lessons at all is null, which the page draws warmly',
  empty.HC.data.currentHomekidsLesson('2026-10-02'), null);

/* ------------------------------------------------------- the monthly report */

console.log('\n--- the monthly report ---');
ok('a week ends the Sunday after its lesson',
  D.homekidsWeekEnds({ taughtOn: '2026-09-27' }), '2026-10-04');
ok('across a year without a timezone slip',
  D.homekidsWeekEnds({ taughtOn: '2026-12-27' }), '2027-01-03');
ok('months with weeks in them, newest first',
  D.homekidsReportMonths('2026-10-02'), ['2026-10', '2026-09']);
ok('a week belongs to the month it ends in',
  [D.homekidsMonthLessons('2026-09', '2026-10-02').map(l => l.id),
   D.homekidsMonthLessons('2026-10', '2026-10-02').map(l => l.id)],
  [['homekids-2026-09-20'], ['homekids-2026-09-27']]);
ok('the report opens on this month',
  D.homekidsReportMonth('2026-10-02'), '2026-10');
ok('or the newest month that has a week, once the lessons stop',
  D.homekidsReportMonth('2026-11-15'), '2026-10');

// A real October, shown on its last Sunday.
const oct = app();
['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'].forEach(day =>
  oct.HC.data.homekidsLessons.push({ id: 'k-' + day, taughtOn: day, title: day, checklist: [] }));
ok('on the last Sunday, October is the four weeks that are already over, oldest first',
  oct.HC.data.homekidsMonthLessons('2026-10', '2026-10-25').map(l => l.taughtOn),
  ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18']);
ok('the card says which days October covers, Sunday to Saturday',
  oct.HC.data.homekidsMonthSpan('2026-10', '2026-10-25'), { from: '2026-09-27', to: '2026-10-24' });
ok('and that Sunday’s own lesson waits for November',
  oct.HC.data.homekidsMonthLessons('2026-11', '2026-10-25').map(l => l.taughtOn), ['2026-10-25']);
ok('which is the report the page opens on that morning',
  oct.HC.data.homekidsReportMonth('2026-10-25'), '2026-10');
ok('a lesson not yet taught is in no month',
  oct.HC.data.homekidsMonthLessons('2026-11', '2026-10-24').length, 0);

/* --------------------------------------------------------------- mapping */

console.log('\n--- mapping ---');
const lesson = D.getHomekidsLesson('homekids-2026-09-27');
ok('all three groups are present', Object.keys(lesson.groups), ['champions', 'heroes', 'legends']);
ok('the memory verse is carried', lesson.memoryVerse.reference, 'Psalm 56:3');
ok('both notes to parents are carried, the summary and the bedtime one',
  [/^This week the kids learned/.test(lesson.parentSummary), /At bedtime/.test(lesson.parentNote)], [true, true]);

const thin = mappers.lesson({ id: 'homekids-thin', taught_on: '2026-10-04', title: 'Thin',
  groups: { heroes: { questions: ['One', null, ''] } },
  checklist: [{ id: 'a', text: 'Do it' }, { text: 'no id' }, { id: 'b' }] });
ok('a missing group is an empty block, never undefined',
  thin.groups.champions, { questions: [], activity: '' });
ok('empty questions are dropped', thin.groups.heroes.questions, ['One']);
ok('a checklist item without an id or words cannot be ticked, so it is not shown',
  thin.checklist, [{ id: 'a', text: 'Do it' }]);
ok('no verse is null, not an empty card', thin.memoryVerse, null);

const badLink = mappers.update({ id: 'x', audience: 'parents', title: 'T',
  links: [{ url: 'javascript:alert(1)' }, { url: 'https://ok.example/a' }] });
ok('only http links survive the mapper', badLink.links, [{ label: 'Open the link', url: 'https://ok.example/a' }]);
ok('an unknown audience falls to parents, never to volunteers',
  mappers.update({ id: 'y', audience: 'staff', title: 'T' }).audience, 'parents');

/* --------------------------------------------------------------- updates */

console.log('\n--- what the emails said ---');
ok('parents see the parents items, newest email first',
  D.liveHomekidsUpdates('parents', '2026-10-02').map(u => u.id),
  ['homekids-parents-check-in', 'homekids-parents-fall-festival']);
ok('volunteers see only theirs',
  D.liveHomekidsUpdates('volunteers', '2026-10-02').map(u => u.id), ['homekids-volunteers-training']);
ok('an item leaves on its ends_on',
  D.liveHomekidsUpdates('volunteers', '2026-10-05').length, 0);

/* ----------------------------------------------------------------- ticks */

console.log('\n--- the ticks ---');
const storage = memoryStorage();
w = app(storage);
load(w, SAMPLE);
const S = w.HC.store;
const ids = ['story', 'verse', 'talk', 'pray'];
ok('nothing ticked to start', S.kidsCheckedCount('homekids-2026-09-27', ids), 0);
ok('a tap ticks', S.toggleKidsChecked('homekids-2026-09-27', 'story'), true);
S.toggleKidsChecked('homekids-2026-09-27', 'verse');
ok('two of four', S.kidsCheckedCount('homekids-2026-09-27', ids), 2);
ok('a second tap unticks', S.toggleKidsChecked('homekids-2026-09-27', 'verse'), false);
ok('each week keeps its own', S.kidsCheckedCount('homekids-2026-09-20', ['story']), 0);
S.toggleKidsChecked('homekids-2026-09-27', 'retired-item');
ok('a tick on an item no longer in the list does not count',
  S.kidsCheckedCount('homekids-2026-09-27', ids), 1);
S.setKidsGroup('legends');
S.setKidsName('Ava and Leo');

const again = app(storage);
ok('the ticks survive a reload', again.HC.store.isKidsChecked('homekids-2026-09-27', 'story'), true);
ok('so does the group', again.HC.store.kidsGroup(), 'legends');
ok('and the name on the card', again.HC.store.kidsName(), 'Ava and Leo');

/* ------------------------------------------------------------ the intake */

console.log('\n--- the intake ---');
const source = read('supabase/functions/newsletter-intake/index.ts');
const start = source.indexOf('/* @@ homekids:start */');
const end = source.indexOf('/* @@ homekids:end */');
if (typeof stripTypeScriptTypes !== 'function' || start === -1 || end < start) {
  ok('the HomeKids helpers are fenced in the intake, and node can read them', false, true);
} else {
  const K = vm.runInNewContext(stripTypeScriptTypes(source.slice(start, end)) +
    '\n({ kidsRules, homekidsAudience, homekidsRows, homekidsPrompt })');

  const parents = K.kidsRules(' Kids@HomeChurchNOLA.com , <subject:HomeKids Weekly> ,');
  const vols = K.kidsRules('subject:HomeKids Team');
  ok('rules are trimmed, lowercased, unbracketed', Array.from(parents),
    ['kids@homechurchnola.com', 'subject:homekids weekly']);
  ok('no secret, no rules', Array.from(K.kidsRules(undefined)), []);

  ok('the parents sender is parents',
    K.homekidsAudience('HomeKids <kids@homechurchnola.com>', 'This Sunday', parents, vols), 'parents');
  ok('a subject rule matches the subject',
    K.homekidsAudience('Trey <trey@example.com>', 'Fwd: HomeKids Weekly, Oct 4', parents, vols), 'parents');
  ok('volunteers wins when both match',
    K.homekidsAudience('kids@homechurchnola.com', 'HomeKids Team: this Sunday', parents, vols), 'volunteers');
  ok('the church newsletter is left alone',
    K.homekidsAudience('Home Church <office@homechurchnola.com>', 'Home Church Weekly', parents, vols), null);
  ok('with neither secret set, nothing is ever HomeKids',
    K.homekidsAudience('kids@homechurchnola.com', 'HomeKids Team', [], []), null);

  const taken = new Set(['homekids-parents-fall-festival']);
  const rows = K.homekidsRows([
    { title: 'Fall Festival', summary: 'Costumes.', details: ['12:30', ''],
      links: [{ label: 'Sign up', url: 'https://ok.example/a' }, { url: 'https://invented.example' }],
      happens_on: '2026-10-25', ends_on: '2026-10-26' },
    { title: 'Old news', summary: 'Gone.', ends_on: '2026-09-01', happens_on: '2026-02-30' },
    { title: '   ', summary: 'no title' }
  ], 'parents', ['https://ok.example/a'], '2026-09-29', '2026-10-02', taken);

  ok('one row per titled item', rows.length, 2);
  ok('every row is unpublished and pending', rows.map(r => [r.published, r.review_state]),
    [[false, 'pending'], [false, 'pending']]);
  ok('ids never collide with one already in the table', rows[0].id, 'homekids-parents-fall-festival-2');
  ok('only links the email contained', JSON.parse(JSON.stringify(rows[0].links)),
    [{ label: 'Sign up', url: 'https://ok.example/a' }]);
  ok('empty details are dropped', Array.from(rows[0].details), ['12:30']);
  ok('an end date already gone is dropped rather than hiding the row', rows[1].ends_on, null);
  ok('a day that does not exist is not a date', rows[1].happens_on, null);
  ok('the prompt names its audience',
    /VOLUNTEERS/.test(K.homekidsPrompt('volunteers', 'x', [], '2026-09-29')), true);
  ok('and forbids the things that stay in the email',
    /allergy/.test(K.homekidsPrompt('parents', 'x', [], '2026-09-29')), true);
}

/* ---------------------------------------------------------- the overlay */

console.log('\n--- where it sits ---');
const appSrc = read('js/app.js');
const order = ['homekids', 'group'].map(r => appSrc.indexOf("route: '" + r + "'"));
ok('HomeKids is first in the row, the stop straight after Guide',
  order[0] > 0 && order[0] < order[1], true);
ok('and the overlay draws it with the tabs, in bold above Guide',
  /route: 'homekids'[\s\S]{0,200}menu: 'tabs'/.test(appSrc) &&
  /group--tabs">' \+ promoted \+ tabs/.test(appSrc), true);
ok('and it has a screen behind it', /homekids: HC\.screens\.homekids/.test(appSrc), true);
ok('and index.html loads it', /js\/screens\/homekids\.js/.test(read('index.html')), true);

const kidsSrc = read('js/screens/homekids.js');
ok('the checklist ends in the monthly report, not a weekly show-the-teacher',
  [/'Monthly report'/.test(kidsSrc), /Show my teacher/.test(kidsSrc)], [true, false]);
ok('ticks save as they are tapped, and the page says so',
  /'Weekly progress saved on this phone\.'/.test(kidsSrc), true);
ok('the report can be saved as a PDF, and the tap is wired',
  /'Download as PDF'/.test(kidsSrc) && /'homekids-report-pdf': function/.test(appSrc) &&
  /HC\.printPdf\.kidsMonth\(report\)/.test(appSrc), true);

/* ---------------------------------------------------------- the copy */

console.log('\n--- the words ---');
const words = [read('js/screens/homekids.js'), JSON.stringify(SAMPLE),
  read('.claude/commands/new-homekids.md')].join('\n');
ok('no em dashes anywhere a family reads', /\u2014/.test(words), false);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
