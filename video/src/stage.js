/* ===========================================================================
   What is in front of the camera.

   The app runs off the seed bundled in js/data.js, which carries real guides,
   real sermons, real serve teams and a real setlist. Three of the things this
   video has to show are not in that seed, because they are not content the
   church publishes, they are things a person has done on their own phone:

     a room       Thursday night's group room, with the code on it and five
                  people's answers inside
     a journal    two entries somebody wrote
     an account   both of the above need one, and there is nobody signed in

   So this file puts them there. Everything below is furniture: the screens
   that draw it are the shipping screens, untouched, and every pixel of the
   room in the video is js/screens/group.js rendering what it is handed.

   WHY THE ROOM IS FURNITURE AND NOT A REAL ROOM. A room lives in Supabase,
   lasts one evening, and needs five people typing into it. Filming one would
   mean the video could only ever be re-made on a Thursday with the group in
   somebody's living room, and it would put five real answers about real
   loneliness on a public store page. The names below are made up and so is
   every word they wrote.

   HOW IT GETS IN. Through the door the app already has. js/rooms.js caches
   the room on the phone so a host who loses signal keeps the evening, and
   readCache() is the path this uses: write the cache, ask rooms to start
   again, and the app restores a room the way it would after a dead spot in a
   living room. Nothing here reaches past a public function.

   The one thing that is a stub rather than a fixture is auth. Three
   predicates are replaced, because js/auth.js decides whether accounts exist
   by looking for keys that prepare.mjs deliberately removed, and a Group tab
   that says accounts are not configured is not what this church's app does.
   =========================================================================== */

/* Sarah is the phone this is filmed on. Same name scripts/make_screenshots.js
   seeds, so the stills and the video are the same person's app. */
const ME = 'sarah-b';

export function stage(win) {
  fakeAccount(win);
  stageRoom(win);
  stageJournal(win);
}

/* --------------------------------------------------------------------------
   An account, without a server.
   -------------------------------------------------------------------------- */

function fakeAccount(win) {
  win.HC.auth.isConfigured = () => true;
  win.HC.auth.isSignedIn = () => false;   /* flipped on below, see stageRoom */
  win.HC.auth.getUser = () => ({ id: ME, email: 'sarah@example.com' });

  /* The room and the journal both agree to the terms before they will let
     anybody write, and being asked in a video is a modal over the feature. */
  win.HC.store.updateProfile({ termsAcceptedAt: new Date().toISOString() });
}

/* --------------------------------------------------------------------------
   Thursday night.
   -------------------------------------------------------------------------- */

function stageRoom(win) {
  const HC = win.HC;
  const now = Date.now();
  const ago = (mins) => new Date(now - mins * 60000).toISOString();
  const ahead = (hours) => new Date(now + hours * 3600000).toISOString();

  const guide = HC.data.guidesByDate()[0];

  const room = {
    id: 'room-tonight',
    code: '418302',
    hostId: ME,
    groupName: 'Thursday night, the Daigles',
    guideId: guide.id,
    guideTitle: HC.data.guideTitle(guide),
    openedAt: ago(48),
    closesAt: ahead(6),
    closedAt: null
  };

  const members = [
    { id: ME,   name: 'Sarah',  isHost: true,  joinedAt: ago(48) },
    { id: 'p2', name: 'Marcus', isHost: false, joinedAt: ago(44) },
    { id: 'p3', name: 'Dee',    isHost: false, joinedAt: ago(43) },
    { id: 'p4', name: 'Tony',   isHost: false, joinedAt: ago(41) },
    { id: 'p5', name: 'Renee',  isHost: false, joinedAt: ago(39) }
  ];

  /* The room carries this Sunday's questions over from the guide, so these are
     the guide's own words rather than invented ones. The third is the one a
     host added on the night, which is why it is tagged that way on screen. */
  const carried = (guide.groupSections || []).slice(0, 2);
  const questions = carried.map((section, i) => ({
    id: 'q' + (i + 1),
    heading: section.heading || section.title,
    body: (section.questions && section.questions[0]) || '',
    order: i + 1,
    addedByHost: false
  }));
  questions.push({
    id: 'q3',
    heading: 'This week',
    body: 'Who is in your corner right now, and do they know it?',
    order: questions.length + 1,
    addedByHost: true
  });

  const first = questions[0].id;
  const second = questions[1] ? questions[1].id : 'q2';

  /* Two answers already open, two still shut, on the first question. The shut
     pair is the point of the whole feature and the point of the scene: a
     group works down the page one answer at a time and nobody reads ahead.
     src/scenes.js opens Dee's on camera by writing openedAt onto these rows. */
  const answers = [
    { id: 'a1', questionId: first, authorId: 'p2', author: 'Marcus', open: ago(9),
      body: 'My sister. She texts every morning and I never once thought of that as somebody noticing.' },
    { id: 'a2', questionId: first, authorId: ME, author: 'Sarah', open: ago(8),
      body: 'Honestly, nobody outside my house, and that is the answer I did not want to write down.' },
    { id: 'a3', questionId: first, authorId: 'p3', author: 'Dee', open: null,
      body: 'My neighbor Cheryl. She brought food over the week after the funeral and she has not stopped checking in since.' },
    { id: 'a4', questionId: first, authorId: 'p5', author: 'Renee', open: null,
      body: 'The group chat from work, which is a strange answer for a church question, but it is the true one.' },
    { id: 'a5', questionId: second, authorId: ME, author: 'Sarah', open: null,
      body: 'Yes. I got quieter, and I called it being busy for about four years.' },
    { id: 'a6', questionId: second, authorId: 'p2', author: 'Marcus', open: null,
      body: 'Not a friendship. A church. It took me a long time to walk into another one.' }
  ];

  const prayers = [
    { id: 'p-1', authorId: 'p4', author: 'Tony', open: ago(4),
      body: 'My mom goes in Tuesday morning. Praying it is nothing.' },
    { id: 'p-2', authorId: 'p3', author: 'Dee', open: ago(3),
      body: 'For patience with my oldest. He is trying and so am I.' }
  ];

  /* notes carries the words, index carries who wrote what and whether the room
     has been shown it. They are two tables in the database and two arrays here
     for the same reason: a shut answer's words are not on anybody's phone, so
     the desk the host runs the night from is built from the index. */
  const notes = [];
  const index = [];
  answers.forEach((a, i) => {
    const created = ago(30 - i);
    notes.push({ id: a.id, questionId: a.questionId, kind: 'answer', authorId: a.authorId,
                 author: a.author, body: a.body, openedAt: a.open, createdAt: created });
    index.push({ id: a.id, questionId: a.questionId, kind: 'answer', authorId: a.authorId,
                 author: a.author, openedAt: a.open, createdAt: created });
  });
  prayers.forEach((p) => {
    notes.push({ id: p.id, questionId: null, kind: 'prayer', authorId: p.authorId,
                 author: p.author, body: p.body, openedAt: p.open, createdAt: p.open });
    index.push({ id: p.id, questionId: null, kind: 'prayer', authorId: p.authorId,
                 author: p.author, openedAt: p.open, createdAt: p.open });
  });

  HC.store.storage.set('room', { v: 1, at: now, room, members, questions, notes, index });

  /* Nothing may reach for the network. The keys are gone, so every call would
     fail anyway, and a failed call is a line on the screen saying the room
     could not be reached. */
  HC.rooms.stopPolling();
  HC.rooms.startPolling = () => {};
  HC.rooms.refresh = () => Promise.resolve(HC.rooms.snapshot());

  /* init() restores the cache and then, if somebody is signed in, goes and
     asks the server for a fresher copy. Signed out for the length of this one
     call is what stops it, and it is a truer no-op than stubbing the fetch. */
  HC.rooms.init();
  HC.auth.isSignedIn = () => true;

  /* The room came off a cache with nothing to check it against, so it draws
     itself with a "not up to date" mark in the corner. It is right, and it is
     an eight second poll away from going out on a real phone. The screen reads
     these three off the snapshot and nowhere else. */
  const snapshot = HC.rooms.snapshot;
  HC.rooms.snapshot = function () {
    const snap = snapshot();
    snap.stale = false;
    snap.loading = false;
    snap.error = null;
    snap.lastSyncedAt = Date.now();
    return snap;
  };
}

/* --------------------------------------------------------------------------
   Two things somebody wrote down.
   -------------------------------------------------------------------------- */

/* EVERY ONE OF THESE IS DATED BY HAND, and it is not decoration.

   js/journal.js sorts on createdAt and returns 0 when two entries carry the
   same one. Left to itself, create() stamps `new Date().toISOString()`, and
   three calls in a row land in the same millisecond most of the time and
   straddle one occasionally. So the order of two entries written a
   microsecond apart is decided by whether the clock ticked in between, which
   is a different answer on different runs.

   That does not matter on a phone, where the journal is written over weeks.
   It matters enormously here, because Remotion renders with several browser
   tabs at once and each one boots its own copy of the app: two tabs get two
   orders, and the frames they hand back are interleaved into one video. What
   that looks like is the note text tearing back and forth between two
   different notes, several times a second, for the length of the scene. It
   took a while to find because every single frame is correct on its own.

   Dated a few days apart, they sort the same way in every tab, and they read
   like a journal somebody actually kept rather than three things typed at
   once. */
function stageJournal(win) {
  const HC = win.HC;
  if (HC.journal.count && HC.journal.count() > 0) return;

  const guide = HC.data.guidesByDate()[0];
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  HC.journal.create({
    createdAt: daysAgo(2),
    guideId: guide.id,
    bodyText:
      'Kept coming back to the line about David being alone at thirty and ' +
      'alone again at sixty. I have been telling myself I am fine on my own ' +
      'since the move. I am not sure that is true. Text Marcus back.'
  });

  HC.journal.create({
    createdAt: daysAgo(1),
    bodyText:
      'Call Mom back. Ask her about the Tuesday appointment instead of waiting ' +
      'for her to bring it up.'
  });

  HC.journal.create({
    createdAt: daysAgo(5),
    bodyText:
      'Psalm 51 in the reading this week. Create in me a clean heart. I have ' +
      'read that a hundred times and never noticed it is a request and not a ' +
      'promise.'
  });
}
