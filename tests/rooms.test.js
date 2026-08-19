/* Drives js/rooms.js in Node with a stubbed transport. PostgREST is not here,
   so this is not about the network: it is about the mapping, the cache, and
   the state transitions, which is where the JavaScript bugs actually are. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOMS_JS = path.join(__dirname, '..', 'js', 'rooms.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

// ---- the fake world -------------------------------------------------------
const disk = {};
const store = {
  storage: {
    get: (k, d) => (k in disk ? JSON.parse(disk[k]) : d),
    set: (k, v) => { disk[k] = JSON.stringify(v); return true; },
    remove: (k) => { delete disk[k]; }
  },
  emit(topic, payload) { (this._subs[topic] || []).forEach(f => f(payload)); },
  on(topic, fn) { (this._subs[topic] = this._subs[topic] || []).push(fn); },
  _subs: {},
  getProfile: () => ({ firstName: 'Priya' }),
  updateProfile: (p) => Object.assign(profilePatch, p)
};
const profilePatch = {};

const ROOM = {
  id: 'r-1', code: '486217', host_id: 'trey', group_name: null,
  guide_id: 'guide-seat-table', guide_title: 'The Table of Grace',
  opened_at: '2026-08-19T00:00:00Z',
  closes_at: new Date(Date.now() + 3600e3).toISOString(), closed_at: null
};
let NOTES = [
  { id: 'n1', room_id: 'r-1', question_id: 'q1', kind: 'answer', author_id: 'priya',
    author_name: 'Priya', body: 'A courtroom.', opened_at: null, created_at: '1' }
];
let REPORTS = [];
let BLOCKS = [];
let AS_MEMBER = false;          // flips the answer index to a member's view
let signedInAs = 'trey';
const calls = [];
const paths = [];

const auth = {
  isConfigured: () => true,
  isSignedIn: () => true,
  getUser: () => ({ id: signedInAs }),
  restFetch: (path) => {
    paths.push(path);
    if (path.startsWith('/group_rooms')) return Promise.resolve([ROOM]);
    if (path.startsWith('/group_note_reports')) return Promise.resolve(REPORTS);
    if (path.startsWith('/group_blocks')) return Promise.resolve(BLOCKS);
    if (path.startsWith('/group_room_members')) return Promise.resolve([
      { person_id: 'trey', display_name: 'Trey', is_host: true, joined_at: '1' },
      { person_id: 'priya', display_name: 'Priya', is_host: false, joined_at: '2' }
    ]);
    if (path.startsWith('/group_room_questions')) return Promise.resolve([
      { id: 'q1', room_id: 'r-1', heading: 'Getting started', body: 'When you hear grace?',
        sort_order: 10, added_by_host: false }
    ]);
    if (path.startsWith('/group_room_notes')) return Promise.resolve(NOTES);
    throw new Error('unexpected path ' + path);
  },
  rpc: (name, args) => {
    /* The answer index is a read that happens to be an rpc, because it
       returns rows a policy cannot express: who answered, without what they
       said. Kept out of `calls` for that reason, so the write assertions
       below stay about writes. */
    if (name === 'hc_room_answer_index') {
      return Promise.resolve(NOTES.map(n => {
        // A host is told every name. A member is told a name only for an
        // answer that is open or their own, and gets nulls otherwise, which
        // is enough to count and not enough to see who is holding out.
        var named = !AS_MEMBER || n.opened_at || n.author_id === signedInAs;
        return {
          id: n.id, question_id: n.question_id, kind: n.kind,
          author_id: named ? n.author_id : null,
          author_name: named ? n.author_name : null,
          opened_at: n.opened_at, created_at: n.created_at
        };
      }));
    }
    calls.push([name, args]);
    return Promise.resolve(name === 'hc_room_join' ? ROOM : null);
  },
  publicGet: (path) => Promise.resolve(path.includes('486217') ? [ROOM] : [])
};

const sandbox = {
  window: {}, document: { visibilityState: 'visible', addEventListener() {} },
  setInterval: () => 1, clearInterval: () => {}, Promise, JSON, Date, console, encodeURIComponent
};
sandbox.window.HC = { auth, store, data: { guideTitle: g => g.title } };
sandbox.window.setInterval = sandbox.setInterval;
sandbox.window.clearInterval = sandbox.clearInterval;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ROOMS_JS, 'utf8'), sandbox);
const rooms = sandbox.window.HC.rooms;

(async () => {
  // ---- peek, the signed out path
  const peeked = await rooms.peek('486 217');
  ok('peek strips spaces and maps the row', peeked.code, '486217');
  await rooms.peek('12345').then(
    () => ok('peek rejects a short code', 'resolved', 'rejected'),
    e => ok('peek rejects a short code', e.message, 'A room code is six digits.'));

  // ---- join and pull
  await rooms.join('486217');
  let s = rooms.snapshot();
  ok('join sent the code', calls[0], ['hc_room_join', { p_code: '486217' }]);
  ok('the room mapped to camelCase', s.room.guideTitle, 'The Table of Grace');
  ok('members mapped', s.members.map(m => m.name), ['Trey', 'Priya']);
  ok('questions mapped', s.questions[0].body, 'When you hear grace?');
  ok('notes mapped', s.notes[0].author, 'Priya');
  ok('a pull clears the stale flag', s.stale, false);

  // ---- the reveal is never a client-side filter
  ok('a closed answer arrives with openedAt null', s.notes[0].openedAt, null);
  ok('and rooms.js does not drop it, the server already did the filtering',
     rooms.notesFor('q1').length, 1);
  ok('isOpen reads the column', rooms.isOpen('n1'), false);

  // ---- the answer index, which is how the host knows there is anything
  //
  // The bug migration 0021 fixes: the desk was built from `notes`, and the
  // host's `notes` cannot contain a shut answer, so a full room drew an empty
  // desk. Everything the desk needs now comes from a separate list that has
  // no bodies in it at all.
  ok('isHost compares against the signed in user', rooms.isHost(), true);
  ok('the index carries the shut answer the notes cannot',
     rooms.indexFor('q1').map(n => n.id), ['n1']);
  ok('answeredBy names who wrote, not what', rooms.answeredBy('q1').map(m => m.author), ['Priya']);
  ok('and nothing in the index has a body to leak',
     rooms.indexFor('q1').every(n => !('body' in n)), true);
  ok('counts come from the index, not from what reached this phone',
     rooms.answerCounts(), { total: 1, open: 0 });

  // ---- writes go through rpc and re-pull
  calls.length = 0;
  await rooms.post('q1', 'my answer');
  ok('post sends the room, question, kind and body',
     calls[0], ['hc_room_post', { p_room: 'r-1', p_question: 'q1', p_kind: 'answer', p_body: 'my answer' }]);
  await rooms.pray('for my sister');
  ok('a prayer request carries no question and its own kind',
     calls[1], ['hc_room_post', { p_room: 'r-1', p_question: null, p_kind: 'prayer', p_body: 'for my sister' }]);

  calls.length = 0;
  await rooms.openAnswer('n1', true);
  await rooms.openQuestion('q1', true);
  await rooms.openEverything(false);
  ok('one answer', calls[0], ['hc_room_open_answer', { p_note: 'n1', p_open: true }]);
  ok('a whole question', calls[1], ['hc_room_open_all', { p_room: 'r-1', p_question: 'q1', p_open: true }]);
  ok('the whole room', calls[2], ['hc_room_open_all', { p_room: 'r-1', p_question: null, p_open: false }]);

  // ---- prayers are separated by kind, not by question
  NOTES = NOTES.concat([{ id: 'n2', room_id: 'r-1', question_id: null, kind: 'prayer',
    author_id: 'dee', author_name: 'Dee', body: 'My sister.', opened_at: '1', created_at: '2' }]);
  await rooms.refresh();
  ok('prayers come out of the same table by kind', rooms.prayers().map(p => p.author), ['Dee']);
  ok('and are not mistaken for answers', rooms.notesFor('q1').length, 1);

  // ---- guideline 1.2: the queue a host acts on, and the way back from a block
  //
  // Report told people "whoever hosts this room will see it". These are the
  // reads behind that promise, plus the one a reviewer will go looking for:
  // once you block somebody their writing stops arriving, so the feed cannot
  // be where you undo it and something else has to be.
  REPORTS = [{ id: 'rep-1', note_id: 'n1', room_id: 'r-1', reporter_id: 'trey',
               reason: 'Felt aimed at somebody.', created_at: '3', resolved_at: null }];
  BLOCKS = [{ blocker_id: 'trey', blocked_id: 'priya', created_at: '4' }];
  await rooms.refresh();

  ok('the host is handed the open reports', rooms.reports().length, 1);
  ok('named from the member list rather than shown as a uuid',
     rooms.reports()[0].reporter, 'Trey');
  ok('with the note attached, so acting on it needs no second trip',
     rooms.reports()[0].note.body, 'A courtroom.');
  ok('and a block carries a name for the unblock button',
     rooms.blocked(), [{ id: 'priya', name: 'Priya', createdAt: '4' }]);

  // The case that is easy to forget: by the time a host looks, the room may
  // have shut that answer again, and then the read policy stops it reaching
  // this phone. The report must still be actionable.
  REPORTS = [{ id: 'rep-2', note_id: 'not-on-this-phone', room_id: 'r-1',
               reporter_id: 'somebody-who-left', reason: null, created_at: '5', resolved_at: null }];
  await rooms.refresh();
  ok('a report about a note this phone cannot read still arrives',
     rooms.reports().length, 1);
  ok('with no note rather than a broken one', rooms.reports()[0].note, null);
  ok('and a reporter who is not in the list does not render as blank',
     rooms.reports()[0].reporter, 'Someone in the group');

  calls.length = 0;
  await rooms.resolveReport('rep-2');
  ok('leaving it up is its own call, and does not touch the note',
     calls[0], ['hc_room_resolve_report', { p_report: 'rep-2' }]);
  await rooms.unblock('priya');
  ok('unblock is the block call with the flag turned round',
     calls[1], ['hc_room_block', { p_person: 'priya', p_blocked: false }]);

  // A member is not a moderator. Their poll does not ask for the queue at
  // all, rather than asking and drawing nothing.
  const asHost = auth.getUser;
  auth.getUser = () => ({ id: 'priya' });
  paths.length = 0;
  await rooms.refresh();
  ok('a member\'s poll never asks for the report queue',
     paths.some(p => p.startsWith('/group_note_reports')), false);
  ok('but does ask for their own blocks, which are theirs to undo',
     paths.some(p => p.startsWith('/group_blocks')), true);
  ok('and the queue is empty on their phone', rooms.reports().length, 0);
  auth.getUser = asHost;

  REPORTS = [];
  BLOCKS = [];
  await rooms.refresh();

  // ---- the same list, read by somebody who is not running the room
  //
  // A member may know how many answers are in. They may not know whose. The
  // nulling happens on the server; this checks the client does something
  // sensible with a row that arrives without a name rather than rendering
  // "undefined" at somebody.
  AS_MEMBER = true;
  signedInAs = 'dee';
  await rooms.refresh();
  ok('a member is not the host', rooms.isHost(), false);
  ok('and still counts the shut answers', rooms.answerCounts().total, 1);
  ok('but is told no name for one that is not theirs',
     rooms.indexFor('q1').map(n => n.author), [null]);
  ok('which is exactly the line their screen draws: one is in, not yet open',
     rooms.shutFor('q1', 'dee'), 1);

  // And for the person who wrote it, that line must not appear. Their own
  // shut answer is already on their screen, above the box, marked as waiting.
  // Counting it again as "1 answer is in" would be the app telling somebody
  // to wait for themselves.
  signedInAs = 'priya';
  await rooms.refresh();
  ok('the author does not wait on their own answer',
     rooms.shutFor('q1', 'priya'), 0);
  ok('and is told it is theirs', rooms.indexFor('q1').map(n => n.author), ['Priya']);

  AS_MEMBER = false;
  signedInAs = 'trey';
  await rooms.refresh();

  // ---- terms
  calls.length = 0;
  await rooms.acceptTerms();
  ok('accepting terms calls the function', calls[0][0], 'hc_room_accept_terms');
  ok('and mirrors it onto the profile', 'termsAcceptedAt' in profilePatch, true);

  // ---- the cache, which is the offline promise
  ok('the room was written to disk', !!disk.room, true);
  const before = rooms.snapshot();
  auth.isSignedIn = () => false;          // sign out, drop the network
  vm.runInContext(fs.readFileSync(ROOMS_JS, 'utf8'), sandbox);
  const cold = sandbox.window.HC.rooms;
  cold.init();
  const after = cold.snapshot();
  ok('a cold start reads the room back', after.room && after.room.code, before.room.code);
  ok('with its questions', after.questions.length, before.questions.length);
  ok('and marks itself behind rather than pretending', after.stale, true);

  // ---- an expired room is not tonight's room
  const expired = JSON.parse(disk.room);
  expired.room.closesAt = new Date(Date.now() - 3600e3).toISOString();
  disk.room = JSON.stringify(expired);
  vm.runInContext(fs.readFileSync(ROOMS_JS, 'utf8'), sandbox);
  sandbox.window.HC.rooms.init();
  ok('last night\'s room is not shown as tonight\'s', sandbox.window.HC.rooms.snapshot().room, null);

  // ---- the night sheet
  //
  // Its whole contract is that everything goes on it, including the answers
  // the group never opened. A sheet that quietly dropped those would be a
  // worse record than no sheet, and it is the kind of thing nobody notices
  // until somebody goes looking for what they wrote.
  const printSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'print-guide.js'), 'utf8');
  sandbox.window.HC.components = {
    esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    formatDate: () => 'August 13, 2026'
  };
  sandbox.window.HC.data = Object.assign(sandbox.window.HC.data || {}, {
    church: { websiteUrl: 'https://homechurchnola.com' }
  });
  sandbox.fetch = () => Promise.reject(new Error('no stylesheet in node'));
  vm.runInContext(printSrc, sandbox);

  const sheet = sandbox.window.HC.print.buildNightPages({
    room: { id: 'r1', code: '486217', groupName: 'Lakeview Thursday',
            guideTitle: 'The Table of Grace', openedAt: '2026-08-13T23:00:00Z' },
    members: [ { id: 'trey', name: 'Trey' }, { id: 'dee', name: 'Dee' } ],
    questions: [ { id: 'q1', body: 'First question?' }, { id: 'q2', body: 'Second question?' } ],
    notes: [
      { id: 'a1', questionId: 'q1', kind: 'answer', author: 'Dee', body: 'An opened answer.', openedAt: '1' },
      { id: 'a2', questionId: 'q1', kind: 'answer', author: 'Trey', body: 'A shut one.', openedAt: null },
      { id: 'p1', questionId: null, kind: 'prayer', author: 'Dee', body: 'For my sister.', openedAt: '1' }
    ]
  });

  ok('the sheet names the group and the night',
     /Lakeview Thursday/.test(sheet) && /August 13, 2026/.test(sheet), true);
  ok('and who was there', /Trey, Dee/.test(sheet), true);
  ok('every question is on it',
     /First question/.test(sheet) && /Second question/.test(sheet), true);
  ok('an opened answer is on it', /An opened answer/.test(sheet), true);
  ok('AND one that was never opened', /A shut one/.test(sheet), true);
  ok('a question nobody answered says so', /Nobody wrote on this one/.test(sheet), true);
  ok('the prayer list is on it', /For my sister/.test(sheet), true);
  ok('and a prayer is not filed as an answer too',
     (sheet.match(/For my sister/g) || []).length, 1);

  console.log('\n' + (fail ? fail + ' failed, ' + pass + ' passed.' : pass + ' passed.'));
  process.exit(fail ? 1 : 0);
})();
