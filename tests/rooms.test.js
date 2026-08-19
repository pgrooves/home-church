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
const calls = [];

const auth = {
  isConfigured: () => true,
  isSignedIn: () => true,
  getUser: () => ({ id: 'trey' }),
  restFetch: (path) => {
    if (path.startsWith('/group_rooms')) return Promise.resolve([ROOM]);
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
  rpc: (name, args) => { calls.push([name, args]); return Promise.resolve(name === 'hc_room_join' ? ROOM : null); },
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

  // ---- host questions
  ok('isHost compares against the signed in user', rooms.isHost(), true);
  ok('answeredBy names who wrote, not what', rooms.answeredBy('q1').map(m => m.name), ['Priya']);

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

  console.log('\n' + (fail ? fail + ' failed, ' + pass + ' passed.' : pass + ' passed.'));
  process.exit(fail ? 1 : 0);
})();
