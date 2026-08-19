/* ==========================================================================
   Home Church, group rooms
   The data layer behind the Group tab. Everything that talks to Supabase
   about a room lives here, and js/screens/group.js does not contain a single
   fetch.

   THE SHAPE, in one paragraph. Reads are ordinary REST against the tables and
   the row level security policies from migration 0016 decide what comes back.
   Writes are RPC calls to the hc_room_* functions, because there is no insert
   or update policy on any of these tables at all. That is not a style
   preference: it is what lets the host open somebody's answer without being
   able to rewrite it, and what makes the name on a note come from the
   caller's own profile rather than from whatever this file claims.

   WHAT THIS FILE MUST NEVER DO. Fetch every answer and let the screen hide
   the shut ones. A closed answer does not leave the database, so `notes()`
   below is already only the ones you are allowed to read, and there is
   nothing here that filters for display. If a future change makes this file
   receive an answer the room has not opened, the bug is in the policy, not
   in the rendering.

   Caching follows js/content.js: the last room seen is written to
   localStorage and read back on the next open, so the tab shows Thursday's
   questions in a living room with one bar rather than a spinner.
   ========================================================================== */

(function (HC) {
  'use strict';

  var CACHE_KEY = 'room';        // hc:room in localStorage
  var CACHE_VERSION = 1;

  /* How often the room re-reads itself while the tab is open. The app carries
     no Supabase SDK and no websocket, by choice, so this is how a leader
     opening an answer reaches everybody else's phone.

     Eight seconds is a guess with a reason behind it. A group works through
     one question at a time and nobody is watching for a change they did not
     expect, so the honest promise is "it catches up", not "it is instant".
     Faster costs battery and rows read for no felt difference; slower and
     opening an answer starts to feel broken. */
  var POLL_MS = 8000;

  var state = {
    room: null,        // the group_rooms row
    members: [],
    questions: [],
    notes: [],         // answers and prayer requests, only what you may read
    reports: [],       // open ones, host only, empty for everybody else
    blocks: [],        // people you have blocked, so there is a way back
    loading: false,
    error: null,
    lastSyncedAt: null,
    stale: false       // true when the last pull failed and this is cache
  };

  var timer = null;
  var inFlight = null;

  /* ------------------------------------------------------------- plumbing */

  function ready() {
    return HC.auth && HC.auth.isConfigured();
  }

  function signedIn() {
    return ready() && HC.auth.isSignedIn();
  }

  function emit() {
    HC.store.emit('room', snapshot());
  }

  function snapshot() {
    return {
      room: state.room,
      members: state.members.slice(),
      questions: state.questions.slice(),
      notes: state.notes.slice(),
      reports: state.reports.slice(),
      blocks: state.blocks.slice(),
      loading: state.loading,
      error: state.error,
      stale: state.stale,
      lastSyncedAt: state.lastSyncedAt
    };
  }

  /* --------------------------------------------------------------- mapping
     snake_case to camelCase at the boundary, same as js/content.js, so no
     screen has to know what the columns are called. */

  function mapRoom(r) {
    if (!r) return null;
    return {
      id: r.id,
      code: r.code,
      hostId: r.host_id,
      groupName: r.group_name,
      guideId: r.guide_id,
      guideTitle: r.guide_title,
      openedAt: r.opened_at,
      closesAt: r.closes_at,
      closedAt: r.closed_at
    };
  }

  function mapMember(m) {
    return { id: m.person_id, name: m.display_name, isHost: !!m.is_host, joinedAt: m.joined_at };
  }

  function mapQuestion(q) {
    return {
      id: q.id,
      heading: q.heading,
      body: q.body,
      order: q.sort_order,
      addedByHost: !!q.added_by_host
    };
  }

  function mapNote(n) {
    return {
      id: n.id,
      questionId: n.question_id,
      kind: n.kind,                 // 'answer' or 'prayer'
      authorId: n.author_id,
      author: n.author_name,
      body: n.body,
      // Null means the room has not been shown this one. Because of the read
      // policy, the only rows that can arrive with a null openedAt are your
      // own, so this is "mine, not out yet" rather than "somebody else's,
      // hidden", which the screen would have no way to draw anyway.
      openedAt: n.opened_at,
      createdAt: n.created_at
    };
  }

  function mapReport(r) {
    return {
      id: r.id,
      noteId: r.note_id,
      reporterId: r.reporter_id,
      reason: r.reason,
      createdAt: r.created_at
    };
  }

  function mapBlock(b) {
    return { personId: b.blocked_id, createdAt: b.created_at };
  }

  /* ----------------------------------------------------------------- cache */

  // Reports and blocks are deliberately not cached. Both exist to be acted on
  // and every action needs the network, so a stale copy would only offer
  // buttons that cannot work. What the group wrote is worth keeping offline;
  // a moderation queue from an hour ago is not.
  function writeCache() {
    if (!state.room) return;
    HC.store.storage.set(CACHE_KEY, {
      v: CACHE_VERSION,
      at: Date.now(),
      room: state.room,
      members: state.members,
      questions: state.questions,
      notes: state.notes
    });
  }

  function readCache() {
    var cached = HC.store.storage.get(CACHE_KEY, null);
    if (!cached || cached.v !== CACHE_VERSION || !cached.room) return false;

    // A room is one evening. Anything older than a day is not worth showing
    // as if it were tonight, and the server would refuse to serve it anyway.
    if (cached.room.closesAt && new Date(cached.room.closesAt).getTime() < Date.now()) return false;

    state.room = cached.room;
    state.members = cached.members || [];
    state.questions = cached.questions || [];
    state.notes = cached.notes || [];
    state.lastSyncedAt = cached.at || null;
    state.stale = true;   // until a real pull says otherwise
    return true;
  }

  function forget() {
    HC.store.storage.remove(CACHE_KEY);
    state.room = null;
    state.members = [];
    state.questions = [];
    state.notes = [];
    state.reports = [];
    state.blocks = [];
    state.error = null;
    state.stale = false;
    state.lastSyncedAt = null;
    stopPolling();
    emit();
  }

  /* ------------------------------------------------------------------ read
     One round trip per table rather than an embedded select, because
     PostgREST's embedding would need foreign key hints through the policies
     and this is four small queries against indexed columns. */

  function pull() {
    if (!state.room || !signedIn()) return Promise.resolve(snapshot());
    if (inFlight) return inFlight;

    var id = encodeURIComponent(state.room.id);
    state.loading = true;
    emit();

    /* The report queue is the host's screen and nobody else's, so a member's
       poll does not ask for it. The policy would return their own reports and
       there is nothing in the app that draws them: a report you filed is
       finished business from your side, and the reply is the host acting.

       Blocks are read every time by everybody, which is one extra round trip
       for a table that almost always has nothing in it. It buys the only way
       back: a blocked person's writing is gone from the feed, so the feed
       cannot be where you unblock them. */
    var mine = signedIn() && HC.auth.getUser();
    var host = !!(mine && state.room.hostId === mine.id);

    inFlight = Promise.all([
      HC.auth.restFetch('/group_rooms?id=eq.' + id + '&select=*'),
      HC.auth.restFetch('/group_room_members?room_id=eq.' + id + '&select=*&order=joined_at.asc'),
      HC.auth.restFetch('/group_room_questions?room_id=eq.' + id +
                        '&select=*&order=sort_order.asc,created_at.asc'),
      HC.auth.restFetch('/group_room_notes?room_id=eq.' + id + '&select=*&order=created_at.asc'),
      host ? HC.auth.restFetch('/group_note_reports?room_id=eq.' + id +
                               '&resolved_at=is.null&select=*&order=created_at.asc')
           : Promise.resolve([]),
      HC.auth.restFetch('/group_blocks?select=*')
    ]).then(function (res) {
      var room = (res[0] || [])[0];

      // The room went away, or closed, or the code was recycled. Either way
      // this phone is no longer in a room and pretending otherwise is worse
      // than an empty tab.
      if (!room) { forget(); return snapshot(); }

      state.room = mapRoom(room);
      state.members = (res[1] || []).map(mapMember);
      state.questions = (res[2] || []).map(mapQuestion);
      state.notes = (res[3] || []).map(mapNote);
      state.reports = (res[4] || []).map(mapReport);
      state.blocks = (res[5] || []).map(mapBlock);
      state.error = null;
      state.stale = false;
      state.lastSyncedAt = Date.now();
      writeCache();
      return snapshot();
    }).catch(function (err) {
      // Keep whatever is on screen. A room that stops updating is still a
      // room, and the screen says so rather than emptying itself.
      state.error = err.message;
      state.stale = true;
      return snapshot();
    }).then(function (snap) {
      state.loading = false;
      inFlight = null;
      emit();
      return snap;
    });

    return inFlight;
  }

  /* --------------------------------------------------------------- polling
     Only while the Group tab is the visible screen. Leaving the tab stops it,
     coming back pulls once immediately rather than waiting out the interval,
     and a backgrounded phone is not polling at all. */

  function startPolling() {
    stopPolling();
    if (!state.room) return;
    timer = window.setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      pull();
    }, POLL_MS);
  }

  function stopPolling() {
    if (timer) { window.clearInterval(timer); timer = null; }
  }

  /* ------------------------------------------------------------------ join */

  // What a signed out phone can ask: is there a room behind these six digits.
  // Answers the question without joining, so the screen can say "Lakeview
  // Thursday, 5 here" before asking anybody to sign in.
  function peek(code) {
    var six = String(code || '').replace(/\D/g, '');
    if (six.length !== 6) return Promise.reject(new Error('A room code is six digits.'));

    return HC.auth.publicGet('/group_rooms?code=eq.' + six + '&select=*&limit=1')
      .then(function (rows) {
        var room = (rows || [])[0];
        if (!room) throw new Error('No room with that code tonight.');
        return mapRoom(room);
      });
  }

  function join(code) {
    var six = String(code || '').replace(/\D/g, '');
    if (six.length !== 6) return Promise.reject(new Error('A room code is six digits.'));
    if (!signedIn()) return Promise.reject(new Error('Sign in to join your group.'));

    return HC.auth.rpc('hc_room_join', { p_code: six }).then(function (row) {
      state.room = mapRoom(Array.isArray(row) ? row[0] : row);
      state.stale = false;
      return pull().then(function (snap) { startPolling(); return snap; });
    });
  }

  // Opening one. The questions come from the guide as [{heading, body}] in the
  // order they are read, and the room owns its copy from that moment on.
  function open(guide) {
    if (!signedIn()) return Promise.reject(new Error('Sign in to host your group.'));
    if (!guide) return Promise.reject(new Error('No guide to open a room against.'));

    var questions = [];
    (guide.groupSections || []).forEach(function (section) {
      (section.questions || []).forEach(function (q) {
        questions.push({ heading: section.heading, body: q });
      });
    });

    return HC.auth.rpc('hc_room_open', {
      p_guide_id: guide.id,
      p_guide_title: HC.data.guideTitle(guide),
      // Null on purpose. A room's display name is the group's name, and this
      // app has nowhere to get it yet: the `groups` table on Connect has the
      // real ones but nothing ties a person to their group. The screen falls
      // back to the guide title, which is true and reads fine, and when
      // somebody wires up "which group is yours" this is the line to change.
      p_group_name: null,
      p_questions: questions
    }).then(function (row) {
      state.room = mapRoom(Array.isArray(row) ? row[0] : row);
      state.stale = false;
      return pull().then(function (snap) { startPolling(); return snap; });
    });
  }

  function close() {
    if (!state.room) return Promise.resolve();
    return HC.auth.rpc('hc_room_close', { p_room: state.room.id }).then(forget);
  }

  // Leaving is local. The row in group_room_members stays, because who was
  // there on a given night is part of what the sheet reports at the end.
  function leave() {
    forget();
    return Promise.resolve();
  }

  /* ----------------------------------------------------------------- write */

  function acceptTerms() {
    return HC.auth.rpc('hc_room_accept_terms', {}).then(function (when) {
      // A local mirror of what the database just recorded, so the screen does
      // not have to ask again on every render. The column is the real answer
      // and hc_room_post checks it there, so a phone that lies about this
      // gets an error on its first post rather than a way past the terms.
      // Deliberately not in js/auth.js FIELD_MAP: profile sync must not be
      // able to write this field back.
      HC.store.updateProfile({ termsAcceptedAt: when });
      return when;
    });
  }

  function post(questionId, body) {
    if (!state.room) return Promise.reject(new Error('You are not in a room.'));
    return HC.auth.rpc('hc_room_post', {
      p_room: state.room.id,
      p_question: questionId,
      p_kind: 'answer',
      p_body: body
    }).then(pull);
  }

  function pray(body) {
    if (!state.room) return Promise.reject(new Error('You are not in a room.'));
    return HC.auth.rpc('hc_room_post', {
      p_room: state.room.id,
      p_question: null,
      p_kind: 'prayer',
      p_body: body
    }).then(pull);
  }

  function editNote(noteId, body) {
    return HC.auth.rpc('hc_room_edit_note', { p_note: noteId, p_body: body }).then(pull);
  }

  function deleteNote(noteId) {
    return HC.auth.rpc('hc_room_delete_note', { p_note: noteId }).then(pull);
  }

  /* ---------------------------------------------------------- the reveal
     Three grains, because a leader running a room uses all three: one name
     when somebody is about to read theirs out, a whole question when the
     group gets to it, and the room when the night is over and it stops
     mattering. Each of them closes again the same way. */

  function openAnswer(noteId, isOpen) {
    return HC.auth.rpc('hc_room_open_answer', { p_note: noteId, p_open: !!isOpen }).then(pull);
  }

  function openQuestion(questionId, isOpen) {
    if (!state.room) return Promise.resolve();
    return HC.auth.rpc('hc_room_open_all', {
      p_room: state.room.id, p_question: questionId, p_open: !!isOpen
    }).then(pull);
  }

  function openEverything(isOpen) {
    if (!state.room) return Promise.resolve();
    return HC.auth.rpc('hc_room_open_all', {
      p_room: state.room.id, p_question: null, p_open: !!isOpen
    }).then(pull);
  }

  /* -------------------------------------------------------- the host's edits */

  function addQuestion(body) {
    if (!state.room) return Promise.resolve();
    return HC.auth.rpc('hc_room_add_question', { p_room: state.room.id, p_body: body }).then(pull);
  }

  function editQuestion(questionId, body) {
    return HC.auth.rpc('hc_room_edit_question', { p_question: questionId, p_body: body }).then(pull);
  }

  function removeQuestion(questionId) {
    return HC.auth.rpc('hc_room_remove_question', { p_question: questionId }).then(pull);
  }

  /* ------------------------------------------------------ guideline 1.2 */

  function report(noteId, reason) {
    // Followed by a pull rather than left alone, because when the host is the
    // one reporting, the queue they are looking at should gain the row they
    // just filed instead of waiting out the poll.
    return HC.auth.rpc('hc_room_report', { p_note: noteId, p_reason: reason || null }).then(pull);
  }

  function takeDown(noteId) {
    return HC.auth.rpc('hc_room_take_down', { p_note: noteId }).then(pull);
  }

  // The other ending. A host who reads a reported note and decides it is fine
  // needs a way to say so that is not deleting somebody's writing, or the
  // queue only ever empties one way. See migration 0019.
  function resolveReport(reportId) {
    return HC.auth.rpc('hc_room_resolve_report', { p_report: reportId }).then(pull);
  }

  function block(personId, isBlocked) {
    return HC.auth.rpc('hc_room_block', { p_person: personId, p_blocked: !!isBlocked }).then(pull);
  }

  function unblock(personId) {
    return block(personId, false);
  }

  /* ------------------------------------------------------------- questions
     the screen asks about state, kept here so no screen re-derives them */

  function isHost() {
    var user = signedIn() && HC.auth.getUser();
    return !!(state.room && user && state.room.hostId === user.id);
  }

  function notesFor(questionId) {
    return state.notes.filter(function (n) {
      return n.kind === 'answer' && n.questionId === questionId;
    });
  }

  function prayers() {
    return state.notes.filter(function (n) { return n.kind === 'prayer'; });
  }

  // What the host needs to run the reveal: who has answered this question,
  // and whether the room can see each one yet. Deliberately not the text.
  // The host waits with everybody else, see migration 0016.
  function answeredBy(questionId) {
    return state.members.filter(function (m) {
      return notesFor(questionId).some(function (n) { return n.authorId === m.id; });
    });
  }

  function isOpen(noteId) {
    var note = state.notes.filter(function (n) { return n.id === noteId; })[0];
    return !!(note && note.openedAt);
  }

  function memberName(personId) {
    var m = state.members.filter(function (x) { return x.id === personId; })[0];
    return m ? m.name : 'Someone in the group';
  }

  /* The host's queue, with enough attached to act on it without another
     round trip: who raised it, what they said, and the note itself.

     The note can be missing, and that is not a bug to paper over. Reporting
     needs the note to be readable, but by the time the host looks the room
     may have closed that answer again, or the host may have blocked its
     author, and either way the read policy stops the row reaching this phone.
     `note: null` is the screen's cue to say the writing is not visible and
     still offer both buttons, since taking down and closing out are the
     host's calls and neither depends on reading it here. */
  function reports() {
    return state.reports.map(function (r) {
      var note = state.notes.filter(function (n) { return n.id === r.noteId; })[0] || null;
      return {
        id: r.id,
        noteId: r.noteId,
        reason: r.reason,
        createdAt: r.createdAt,
        reporter: memberName(r.reporterId),
        note: note
      };
    });
  }

  function blocked() {
    return state.blocks.map(function (b) {
      return { id: b.personId, name: memberName(b.personId), createdAt: b.createdAt };
    });
  }

  /* ------------------------------------------------------------------ boot */

  function init() {
    if (!ready()) return;
    // Show whatever the phone already has, then improve it. Same rule as
    // js/content.js: never blank, never blocked on the network.
    if (readCache()) {
      emit();
      if (signedIn()) pull();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.room && timer) pull();
    });

    // Signing out is not a reason to keep somebody's room on the phone.
    HC.store.on('auth', function (payload) {
      if (payload && payload.signedIn === false) forget();
    });
  }

  HC.rooms = {
    init: init,
    snapshot: snapshot,

    peek: peek,
    join: join,
    open: open,
    close: close,
    leave: leave,
    refresh: pull,
    startPolling: startPolling,
    stopPolling: stopPolling,

    acceptTerms: acceptTerms,
    post: post,
    pray: pray,
    editNote: editNote,
    deleteNote: deleteNote,

    openAnswer: openAnswer,
    openQuestion: openQuestion,
    openEverything: openEverything,

    addQuestion: addQuestion,
    editQuestion: editQuestion,
    removeQuestion: removeQuestion,

    report: report,
    takeDown: takeDown,
    resolveReport: resolveReport,
    block: block,
    unblock: unblock,

    isHost: isHost,
    notesFor: notesFor,
    prayers: prayers,
    answeredBy: answeredBy,
    isOpen: isOpen,
    reports: reports,
    blocked: blocked
  };

})(window.HC = window.HC || {});
