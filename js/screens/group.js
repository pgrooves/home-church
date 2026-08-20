/* ==========================================================================
   Home Church, Group
   The sixth tab. A leader opens a room, the app mints a six digit code, the
   group joins with it, and everyone answers this week's guide questions in
   the same place. Answers stay shut until the leader opens them.

   NOT ONE FETCH IN THIS FILE. Everything that talks to Supabase is in
   js/rooms.js, and this screen only ever draws HC.rooms.snapshot(). That is
   worth keeping: the rule the whole feature rests on is that a closed answer
   never leaves the database, and a screen that cannot ask for data cannot
   accidentally be handed some.

   RE-RENDERING WHILE SOMEBODY IS TYPING. The room re-reads itself every eight
   seconds, and a naive subscriber would rebuild the DOM under a thumb halfway
   through a sentence. Two defences below: `signature()` skips the render
   entirely when nothing anybody would notice has changed, and `remember()`
   puts focus and the caret back when a render does happen. Drafts live in
   this module rather than in the DOM for the same reason.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* Local to this screen, same pattern as the filters on Connect. None of it
     is worth persisting: a half typed answer that survives a force quit is
     not a feature anybody asked for. */
  var drafts = {};        // question id -> what you have typed but not posted
  var prayerDraft = '';
  var newQuestion = '';
  var codeDraft = '';
  var editing = null;     // { id, body } while the host has a question open
  var showingJournal = null;   // question id whose journal suggestions are open
  var busy = null;        // an id, while its button is waiting on the network
  var joinError = null;
  var lastSignature = null;
  var pendingWrite = false;   // somebody tried to write before agreeing to terms

  /* ---------------------------------------------------------------- helpers */

  function profile() { return HC.store.getProfile(); }

  function firstName() {
    return (profile().firstName || '').trim();
  }

  function agreedToTerms() {
    return !!profile().termsAcceptedAt;
  }

  function canHost() {
    // The church sets can_host on the profile row. The app never writes it,
    // and hc_room_open checks the column rather than trusting this, so the
    // worst a tampered client can do is show a button that then refuses.
    return !!profile().canHost;
  }

  function spaced(code) {
    return code ? code.slice(0, 3) + ' ' + code.slice(3) : '';
  }

  function me() {
    var user = HC.auth.isSignedIn() && HC.auth.getUser();
    return user ? user.id : null;
  }

  /* ------------------------------------------------------------- the states
     Four, and the screen is a switch over them:
       away    accounts are not configured for this church at all
       join    no room on this phone
       room    in a room
     plus the terms gate, which sits over `room` the first time you post. */

  function screenState(snap) {
    if (!HC.auth.isConfigured()) return 'away';
    if (!snap.room) return 'join';
    return 'room';
  }

  /* ------------------------------------------------------------------ join */

  function joinScreen() {
    var html = '<div class="hc-screen hc-group">';

    html += c.sectionHeader('Your group', 'Join the room', { flush: true, tag: 'h1' });
    html += '<p class="hc-body-serif hc-group__intro">Whoever hosts your group opens the room and sends out a ' +
      'six digit code. Type it here and you are in.</p>';

    /* One field rather than six boxes. The drawing had six and they look
       better, but six inputs means six focus handlers, and paste, backspace
       and every password manager on earth have to be taught to behave across
       them. One numeric field with the digits spaced out is the same thing to
       look at and cannot be got wrong. */
    html += '<form class="hc-group__join" data-join-form novalidate>' +
      '<label class="hc-field">' +
        '<span class="hc-visually-hidden">Room code</span>' +
        '<input class="hc-input hc-code-input" type="text" inputmode="numeric" ' +
          'autocomplete="one-time-code" maxlength="7" name="code" placeholder="000000" ' +
          'aria-describedby="hc-join-help" value="' + c.esc(spaced(codeDraft)) + '">' +
      '</label>' +
      (joinError ? '<p class="hc-group__error" role="alert">' + c.esc(joinError) + '</p>' : '') +
      c.button('Join the room', { action: 'room-join', disabled: codeDraft.length !== 6 }) +
    '</form>';

    html += '<p class="hc-caption hc-group__hint" id="hc-join-help">A code is good for one night.</p>';

    // Hosting, for the people the church has marked.
    if (canHost()) {
      var guide = HC.data.latestGuide();
      html += c.sectionHeader('Leader mode', 'Host tonight');
      if (guide) {
        html += c.card(
          '<p class="hc-eyebrow">This week</p>' +
          '<p class="hc-card__title">' + c.esc(HC.data.guideTitle(guide)) + '</p>' +
          '<p class="hc-caption hc-card__meta">' +
            c.esc(c.byline(HC.data.guideMeta(guide).preacherShort, HC.data.guideMeta(guide).preachedOn)) + '</p>' +
          '<p class="hc-caption hc-group__carry">Its discussion questions come across into the room. You can ' +
            'reword them, drop them, or add your own once you are in.</p>' +
          '<div class="hc-group__actions">' +
            c.button('Open a room', { action: 'room-open', id: guide.id, icon: 'plus' }) +
          '</div>', { edge: true });
      } else {
        html += c.emptyState('No guide this week yet. A room opens against one, so this waits for Sunday.');
      }
    }

    if (!HC.auth.isSignedIn()) {
      html += '<p class="hc-caption hc-group__hint hc-mt-lg">You can look at a room with just the code. ' +
        'Writing in one needs an account, so your name goes on what you say.</p>';
    }

    html += '</div>';
    return html;
  }

  /* --------------------------------------------------------------- the room */

  function roomBar(snap) {
    var here = snap.members.length;
    return '<div class="hc-room-bar">' +
      '<span class="hc-eyebrow hc-room-bar__code">Room ' + c.esc(spaced(snap.room.code)) + '</span>' +
      '<span class="hc-room-bar__live' + (snap.stale ? ' hc-room-bar__live--stale' : '') + '">' +
        (snap.stale ? 'Not up to date' : here + (here === 1 ? ' here' : ' here')) +
      '</span>' +
    '</div>';
  }

  function guideCard(snap) {
    return '<div class="hc-card hc-card--edge hc-room-guide">' +
      '<p class="hc-eyebrow">Tonight</p>' +
      '<p class="hc-room-guide__title">' + c.esc(snap.room.guideTitle || 'Your group') + '</p>' +
      '<p class="hc-caption">Questions carried over from the guide.</p>' +
    '</div>';
  }

  // The host's one control for the whole room, above the questions where a
  // leader running behind will look for it.
  // Counted from the answer index rather than from the notes on this phone.
  // A closed answer is not here to be counted; see migration 0021.
  function revealAll() {
    var n = HC.rooms.answerCounts();
    if (!n.total) return '';
    var everything = n.open === n.total;

    return '<div class="hc-reveal-all">' +
      '<button type="button" class="hc-btn hc-btn--secondary hc-btn--small" ' +
        'data-action="room-open-all" data-on="' + (everything ? '0' : '1') + '">' +
        c.icon(everything ? 'eyeOff' : 'eye', 'hc-btn__icon') +
        (everything ? 'Hide every answer' : 'Open every answer') +
      '</button>' +
      '<span class="hc-caption">' + n.open + ' of ' + n.total + ' open</span>' +
    '</div>';
  }

  /* A note, as everybody else sees it once it is open. The report and block
     controls are guideline 1.2's, and they are on every note rather than
     behind a long press, because a control a reviewer cannot find is a
     control that does not exist. Your own note gets edit and delete instead:
     there is nothing to report about yourself. */
  function noteCard(note, snap, opts) {
    opts = opts || {};
    var mine = note.authorId === me();
    var host = HC.rooms.isHost();

    var html = '<div class="hc-note' + (mine ? ' hc-note--mine' : '') +
      (opts.waiting ? ' hc-note--waiting' : '') + '" data-note="' + c.esc(note.id) + '">' +
      '<p class="hc-note__who">' + c.esc(note.author) + (mine ? ' <span class="hc-note__you">you</span>' : '') + '</p>' +
      '<p class="hc-note__text">' + c.esc(note.body) + '</p>';

    if (opts.waiting) {
      html += '<p class="hc-note__flag">' + c.icon('lock', 'hc-note__lock') +
        'In, and only you can see it until ' + c.esc(hostName(snap)) + ' opens this one.</p>';
    }

    html += '<div class="hc-note__tools">';
    if (mine) {
      html += '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
        'data-action="room-edit-note" data-id="' + c.esc(note.id) + '">Edit</button>' +
        '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
        'data-action="room-delete-note" data-id="' + c.esc(note.id) + '">Delete</button>';
    } else {
      html += '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
        'data-action="room-report" data-id="' + c.esc(note.id) + '">' +
        c.icon('flag', 'hc-btn__icon') + 'Report</button>' +
        '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
        'data-action="room-block" data-id="' + c.esc(note.authorId) + '" ' +
        'data-name="' + c.esc(note.author) + '">Block</button>';
      if (host) {
        html += '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
          'data-action="room-take-down" data-id="' + c.esc(note.id) + '">Take down</button>';
      }
    }
    html += '</div></div>';
    return html;
  }

  function hostName(snap) {
    var host = snap.members.filter(function (m) { return m.isHost; })[0];
    return host ? host.name : 'your leader';
  }

  /* --------------------------------------------------------- the host's queue

     Report said "whoever hosts this room will see it", and for a while there
     was nowhere for the host to see it. This is that place: the top of the
     room, above the questions, because a flag that waits until you scroll is
     a flag nobody reads.

     Two buttons under each, not one. Taking it down is the right answer when
     the report is right; a queue that empties only by deleting somebody's
     writing teaches a host to delete, or to stop looking. "Leave it up" is
     hc_room_resolve_report from migration 0019. */

  function reportQueue(snap) {
    var open = HC.rooms.reports();
    if (!open.length) return '';

    var html = '<div class="hc-queue" role="region" aria-label="Reported notes">' +
      '<p class="hc-eyebrow hc-queue__eyebrow">' + c.icon('flag', 'hc-queue__icon') + 'Reported</p>' +
      '<p class="hc-queue__title">' +
        (open.length === 1 ? 'One thing to look at' : open.length + ' things to look at') + '</p>' +
      '<p class="hc-caption">Somebody in the room flagged ' +
        (open.length === 1 ? 'this' : 'these') + '. Only you see it.</p>';

    open.forEach(function (r) {
      html += '<div class="hc-queue__item">' +
        '<p class="hc-queue__who">' + c.esc(r.reporter) + ' reported ' +
          (r.note ? c.esc(r.note.author) + '&rsquo;s ' + (r.note.kind === 'prayer' ? 'prayer request' : 'answer')
                  : 'a note') + '</p>';

      if (r.reason) {
        html += '<p class="hc-queue__reason">&ldquo;' + c.esc(r.reason) + '&rdquo;</p>';
      }

      // A reported note can be unreadable by the time you look: the room may
      // have closed that answer again, or you blocked whoever wrote it. Say
      // so plainly and keep both buttons, since neither one needs the text.
      html += r.note
        ? '<p class="hc-queue__text">' + c.esc(r.note.body) + '</p>'
        : '<p class="hc-queue__text hc-queue__text--gone">Not on your screen right now. It may be shut ' +
          'again, or written by somebody you have blocked.</p>';

      html += '<div class="hc-queue__row">' +
        '<button type="button" class="hc-btn hc-btn--secondary hc-btn--small" ' +
          'data-action="room-take-down" data-id="' + c.esc(r.noteId) + '">Take it down</button>' +
        '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
          'data-action="room-resolve-report" data-id="' + c.esc(r.id) + '">Leave it up</button>' +
      '</div></div>';
    });

    return html + '</div>';
  }

  /* Blocking works by making somebody's writing not arrive, which means the
     room cannot be where you undo it: there is nothing left to tap. So the
     way back lives here, at the bottom, and only shows when there is one. */
  function blockedRow() {
    var list = HC.rooms.blocked();
    if (!list.length) return '';

    var html = '<div class="hc-blocked">' +
      '<p class="hc-caption hc-blocked__label">Blocked, so nothing they write reaches you:</p>';
    list.forEach(function (p) {
      html += '<div class="hc-blocked__row">' +
        '<span class="hc-blocked__name">' + c.esc(p.name) + '</span>' +
        '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
          'data-action="room-unblock" data-id="' + c.esc(p.id) + '" ' +
          'data-name="' + c.esc(p.name) + '">Unblock</button>' +
      '</div>';
    });
    return html + '</div>';
  }

  /* The reveal desk. Only the host sees it, and it deliberately shows names
     and not text: opening an answer shows it to the host and the room in the
     same moment, so nobody reads ahead, the leader included. */
  function desk(question, snap) {
    // The index, not the notes. The host cannot read a shut answer either, so
    // building this out of what the phone holds drew an empty desk in a full
    // room. Migration 0021 is the fix and this line is the reason for it.
    var rows = HC.rooms.indexFor(question.id);
    if (!rows.length) {
      return '<p class="hc-empty-state hc-room-q__empty">Nothing written here yet.</p>';
    }
    var shut = rows.filter(function (n) { return !n.openedAt; }).length;

    var html = '<div class="hc-desk">' +
      '<p class="hc-desk__label">' + rows.length + (rows.length === 1 ? ' answer in.' : ' answers in.') +
        ' Tap a name to open it.</p>' +
      '<div class="hc-desk__names">';

    rows.forEach(function (n) {
      html += '<button type="button" class="hc-chip" data-action="room-open-answer" ' +
        'data-id="' + c.esc(n.id) + '" data-on="' + (n.openedAt ? '0' : '1') + '" ' +
        'aria-pressed="' + (n.openedAt ? 'true' : 'false') + '">' +
        c.icon(n.openedAt ? 'eye' : 'lock', 'hc-chip__icon') +
        c.esc(n.author || 'Someone') +
      '</button>';
    });

    if (rows.length > 1) {
      html += '<button type="button" class="hc-chip hc-chip--act" data-action="room-open-question" ' +
        'data-id="' + c.esc(question.id) + '" data-on="' + (shut ? '1' : '0') + '">' +
        (shut ? 'Open all ' + rows.length : 'Close all') + '</button>';
    }

    return html + '</div></div>';
  }

  function questionBlock(question, index, snap) {
    var host = HC.rooms.isHost();
    var notes = HC.rooms.notesFor(question.id);
    var mineHere = notes.filter(function (n) { return n.authorId === me(); });
    var openNotes = notes.filter(function (n) { return n.openedAt; });
    var isEditing = editing && editing.id === question.id;

    var html = '<div class="hc-room-q" data-question="' + c.esc(question.id) + '">';

    html += '<div class="hc-room-q__head">' +
      '<span class="hc-room-q__num">' + (index + 1) +
        (question.heading ? ' · ' + c.esc(question.heading.toUpperCase()) : '') + '</span>' +
      (host && !isEditing
        ? '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
          'data-action="room-edit-question" data-id="' + c.esc(question.id) + '">' +
          c.icon('pencil', 'hc-btn__icon') + 'Edit</button>'
        : '') +
    '</div>';

    if (isEditing) {
      html += '<div class="hc-field hc-mt-sm">' +
        '<textarea class="hc-textarea" data-editing="1" rows="4" ' +
          'aria-label="Edit this question">' + c.esc(editing.body) + '</textarea>' +
        '<div class="hc-room-q__editrow">' +
          c.button('Save for everyone', { action: 'room-save-question', id: question.id, small: true }) +
          c.button('Cancel', { action: 'room-cancel-edit', variant: 'secondary', small: true }) +
          c.button('Remove', { action: 'room-remove-question', id: question.id, variant: 'tertiary', small: true }) +
        '</div>' +
        '<p class="hc-caption">Saving changes it on every phone in the room. The published guide stays as it is.</p>' +
      '</div>';
    } else {
      html += '<p class="hc-question hc-room-q__text">' + c.esc(question.body) + '</p>';
      if (question.addedByHost) {
        html += '<span class="hc-room-q__tag">Added by ' + c.esc(hostName(snap)) + '</span>';
      }
    }

    // The host gets the desk. Everybody else gets what is open, their own,
    // and an honest count of what is still shut.
    if (host) {
      html += desk(question, snap);
      html += '<div class="hc-notes">';
      openNotes.forEach(function (n) { html += noteCard(n, snap); });
      html += '</div>';
    } else {
      html += '<div class="hc-notes">';
      mineHere.filter(function (n) { return !n.openedAt; }).forEach(function (n) {
        html += noteCard(n, snap, { waiting: true });
      });
      openNotes.forEach(function (n) { html += noteCard(n, snap); });

      // Same correction as the desk: other people's shut answers are not on
      // this phone either, so the count comes from the index.
      var othersShut = HC.rooms.shutFor(question.id, me());

      if (othersShut) {
        html += '<div class="hc-locked">' + c.icon('lock') +
          '<span>' + othersShut + (othersShut === 1 ? ' answer is' : ' answers are') + ' in. ' +
          c.esc(hostName(snap)) + ' opens ' + (othersShut === 1 ? 'it' : 'them') +
          ' when the group gets here.</span></div>';
      } else if (!notes.length) {
        html += '<p class="hc-empty-state hc-room-q__empty">Nobody has written anything here yet.</p>';
      }
      html += '</div>';
    }

    /* Your own box. The host answers too: hosting is not a reason to sit out. */

    // Your own box. The host answers too: hosting is not a reason to sit out.
    var already = mineHere.length > 0;
    if (!already) {
      var draft = drafts[question.id] || '';
      html += fromJournal(question, snap);
      html += '<div class="hc-field hc-room-q__mine">' +
        '<label class="hc-visually-hidden" for="hc-answer-' + c.esc(question.id) + '">' +
          'Your answer to question ' + (index + 1) + '</label>' +
        '<textarea class="hc-textarea" id="hc-answer-' + c.esc(question.id) + '" rows="2" ' +
          'data-draft="' + c.esc(question.id) + '" ' +
          'placeholder="' + c.esc(firstName() ? 'Type it the way you would say it, ' + firstName() + '.'
                                              : 'Type it the way you would say it.') + '"' +
          '>' + c.esc(draft) + '</textarea>' +
        (draft.trim()
          ? '<div class="hc-room-q__post">' +
            c.button('Post to the group', { action: 'room-post', id: question.id, small: true,
                                            busy: busy === question.id }) + '</div>'
          : '') +
        '<p class="hc-caption">' + (draft.trim()
          ? 'It goes in now and shows to the room when ' + c.esc(hostName(snap)) + ' opens this question.'
          : 'Write it whenever. Nobody reads it until this question is opened.') + '</p>' +
      '</div>';
    }

    return html + '</div>';
  }

  /* ------------------------------------------------- what you already wrote

     A room opens against a guide, and the person answering may well have
     highlighted that guide on Sunday and written something about it. This
     offers those back, above the box, so the answer to "what did that land
     on" can start from what they already thought rather than from nothing.

     THREE RULES, and all three are about consent.

     It only ever fills the draft. Tapping a suggestion puts the words in the
     box and stops; posting is still the same button it was, and the terms
     gate is still in front of it. A one tap path from private writing to a
     room full of people is a mistake somebody makes once, at speed, and
     cannot take back.

     It appends rather than replaces, so it cannot eat a half typed answer.

     And what crosses is plain text. Room notes are read by other people and
     are plain text in the database; stored markup has no business travelling
     into somebody else's phone. See the note on bodyText in js/journal.js. */

  function journalFor(snap) {
    if (!snap.room || !snap.room.guideId || !HC.journal) return [];
    return HC.journal.forGuide(snap.room.guideId)
      .filter(function (e) { return (e.bodyText || '').trim(); });
  }

  function fromJournal(question, snap) {
    var mine = journalFor(snap);
    if (!mine.length) return '';

    var open = showingJournal === question.id;

    /* Ranked: anything anchored to this exact question first, since a room
       question carries its guide question's text. Everything else after, as
       it comes. */
    var ranked = mine.slice().sort(function (a, b) {
      var am = a.quote && question.body && question.body.indexOf(a.quote) !== -1 ? 0 : 1;
      var bm = b.quote && question.body && question.body.indexOf(b.quote) !== -1 ? 0 : 1;
      return am - bm;
    });

    var html = '<div class="hc-fromj">' +
      '<button type="button" class="hc-fromj__toggle" data-action="room-journal-toggle" ' +
        'data-id="' + c.esc(question.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        c.icon('journal', 'hc-fromj__icon') +
        '<span>From your journal</span>' +
        '<span class="hc-fromj__count">' + ranked.length + '</span>' +
        c.icon('chevronDown', 'hc-fromj__chevron') +
      '</button>';

    if (open) {
      html += '<div class="hc-fromj__list">';
      ranked.slice(0, 6).forEach(function (e) {
        var line = e.bodyText.replace(/\s+/g, ' ').trim();
        if (line.length > 120) line = line.slice(0, 119).replace(/\s\S*$/, '') + '…';
        html += '<button type="button" class="hc-fromj__item" data-action="room-journal-use" ' +
          'data-id="' + c.esc(question.id) + '" data-entry="' + c.esc(e.id) + '">' +
          (e.quote ? '<span class="hc-fromj__quote">' + c.esc(e.quote) + '</span>' : '') +
          '<span class="hc-fromj__body">' + c.esc(line) + '</span>' +
        '</button>';
      });
      html += '<p class="hc-caption hc-fromj__note">Tapping one puts it in the box below. ' +
        'Nothing is posted until you post it.</p>';
      html += '</div>';
    }

    return html + '</div>';
  }

  function prayerBlock(snap) {
    var list = HC.rooms.prayers();
    var html = '<div class="hc-prayers">' +
      '<p class="hc-eyebrow">Before you go</p>' +
      '<p class="hc-prayers__title">Prayer requests</p>' +
      '<p class="hc-caption">Everyone sees these, and they go out on the sheet at the end of the night.</p>' +
      '<div class="hc-notes">';

    if (!list.length) {
      html += '<p class="hc-empty-state">Nothing here yet. What do you want the group carrying this week?</p>';
    }
    list.forEach(function (n) { html += noteCard(n, snap); });
    html += '</div>';

    html += '<div class="hc-field">' +
      '<label class="hc-visually-hidden" for="hc-prayer">Add a prayer request</label>' +
      '<textarea class="hc-textarea" id="hc-prayer" rows="2" data-prayer="1" ' +
        'placeholder="What do you want the group carrying this week?">' + c.esc(prayerDraft) + '</textarea>' +
      (prayerDraft.trim()
        ? '<div class="hc-room-q__post">' +
          c.button('Add to the list', { action: 'room-pray', small: true, busy: busy === 'prayer' }) + '</div>'
        : '') +
    '</div>';

    return html + '</div>';
  }

  function hostExtras(snap) {
    var html = '';

    // Adding a question of your own.
    html += '<div class="hc-room-q hc-room-q--add">' +
      '<p class="hc-eyebrow">Your own question</p>' +
      '<div class="hc-field">' +
        '<label class="hc-visually-hidden" for="hc-newq">Add a question</label>' +
        '<textarea class="hc-textarea" id="hc-newq" rows="2" data-newq="1" ' +
          'placeholder="Ask the room something the guide did not.">' + c.esc(newQuestion) + '</textarea>' +
        (newQuestion.trim()
          ? '<div class="hc-room-q__post">' +
            c.button('Add for everyone', { action: 'room-add-question', icon: 'plus', small: true,
                                           busy: busy === 'newq' }) + '</div>'
          : '') +
        '<p class="hc-caption">It lands at the bottom of the list on every phone in the room.</p>' +
      '</div>' +
    '</div>';

    // The code, so the host can send it again to whoever is late.
    html += '<div class="hc-card hc-room-code">' +
      '<p class="hc-eyebrow">The code</p>' +
      '<p class="hc-room-code__digits">' + c.esc(spaced(snap.room.code)) + '</p>' +
      '<div class="hc-group__actions">' +
        c.button('Text it to your group', { action: 'room-share-code', icon: 'message', variant: 'secondary' }) +
      '</div>' +
    '</div>';

    return html;
  }

  function roomScreen(snap) {
    var host = HC.rooms.isHost();
    var html = '<div class="hc-screen hc-group" data-room="' + c.esc(snap.room.id) + '">';

    html += roomBar(snap);
    html += c.sectionHeader(host ? 'Leader mode' : 'In the room',
                            snap.room.groupName || snap.room.guideTitle || 'Your group',
                            { flush: true, tag: 'h1' });
    html += guideCard(snap);

    if (!HC.auth.isSignedIn()) {
      html += '<div class="hc-locked hc-mt-lg">' + c.icon('lock') +
        '<span>You are reading the questions signed out. Sign in to write, so your name goes on what you say.</span>' +
      '</div>';
      html += '<div class="hc-group__actions">' +
        c.button('Sign in', { action: 'go-profile', variant: 'secondary' }) + '</div>';
    }

    if (host) html += reportQueue(snap);
    if (host) html += revealAll();

    if (!snap.questions.length) {
      html += c.emptyState('This room has no questions yet.');
    }
    snap.questions.forEach(function (q, i) { html += questionBlock(q, i, snap); });

    if (host) html += hostExtras(snap);

    html += prayerBlock(snap);

    // The offline promise, said out loud, same as the Guide index does.
    html += '<p class="hc-caption hc-group__offline">' + c.icon('download', 'hc-group__offline-icon') +
      '<span>Saved on this phone. With no signal you keep the questions and everything already opened, ' +
      'and yours goes out when the phone catches up.</span></p>';

    html += blockedRow();

    if (host) {
      html += '<div class="hc-wrap">' +
        '<p class="hc-eyebrow">When the night is over</p>' +
        '<p class="hc-wrap__title">Tonight, on one sheet</p>' +
        '<p class="hc-caption">The guide, ' +
          (snap.questions.length === 1 ? 'the question' : 'all ' + snap.questions.length + ' questions') +
          ', what each person wrote, and the prayer requests above. Anything ' +
          'still shut is opened to the room first, so nothing on the sheet is ' +
          'a surprise to whoever wrote it.</p>' +
        '<div class="hc-wrap__row">' +
          c.button('Print everything to PDF', { action: 'room-sheet', icon: 'doc' }) +
          c.button('Send as text', { action: 'room-send-sheet', icon: 'message', variant: 'secondary' }) +
        '</div>' +
      '</div>';
      html += '<div class="hc-group__actions hc-mt-lg">' +
        c.button('Close the room', { action: 'room-close', variant: 'tertiary' }) + '</div>';
    } else {
      html += '<p class="hc-caption hc-group__hint">' + c.esc(hostName(snap)) +
        ' sends the whole night out when you are done.</p>';
      html += '<div class="hc-group__actions">' +
        c.button('Leave this room', { action: 'room-leave', variant: 'tertiary' }) + '</div>';
    }

    html += '</div>';
    return html;
  }

  /* --------------------------------------------------------------- the gate
     Guideline 1.2 wants agreement to terms forbidding objectionable content
     before a first post. This is that, and it is not decoration: hc_room_post
     checks profiles.terms_accepted_at and refuses, so a client that skipped
     this screen would get an error rather than a way past it. */

  function termsGate() {
    return '<div class="hc-screen hc-group">' +
      c.sectionHeader('One thing first', 'Before you write', { flush: true, tag: 'h1' }) +
      '<p class="hc-body-serif hc-group__intro">What you write in a room is read by everybody in it. ' +
      'So, once, the short version of what that means.</p>' +
      c.card(
        '<ul class="hc-terms-list">' +
          '<li>Write what you would say out loud in the room. Nothing hateful, nothing obscene, ' +
            'nothing aimed at somebody.</li>' +
          '<li>What other people write stays in the room. It is not yours to forward.</li>' +
          '<li>Every note has a Report button and you can block anybody. Whoever hosts can take ' +
            'anything down, and we act on reports within a day.</li>' +
          '<li>You can edit or delete your own writing whenever you like.</li>' +
        '</ul>' +
        '<div class="hc-group__actions">' +
          c.button('I agree, let me write', { action: 'room-accept-terms' }) +
          c.button('Read the full terms', { action: 'go-legal', id: 'terms', variant: 'tertiary' }) +
        '</div>', { edge: true }) +
    '</div>';
  }

  /* ---------------------------------------------------------------- render */

  // What a person would notice changing. Poll ticks that move only
  // lastSyncedAt do not rebuild the DOM, which is what keeps a half typed
  // answer from being swept out from under a thumb every eight seconds.
  function signature(snap) {
    return JSON.stringify([
      screenState(snap),
      snap.room && [snap.room.id, snap.room.code, snap.room.closedAt],
      snap.stale,
      snap.members.map(function (m) { return m.id + m.name; }),
      snap.questions.map(function (q) { return q.id + q.body; }),
      snap.notes.map(function (n) { return n.id + n.body + (n.openedAt || ''); }),
      // The index is its own line and not folded into the one above. It is
      // what changes first when somebody answers: their note does not reach
      // this phone, only the fact of it, and if that does not move the
      // signature the host's desk never redraws.
      snap.index.map(function (n) { return n.id + (n.author || '') + (n.openedAt || ''); }),
      snap.reports.map(function (r) { return r.id; }),
      snap.blocks.map(function (b) { return b.personId; }),
      HC.auth.isSignedIn(), agreedToTerms(), canHost(),
      // Local state that changes what is drawn.
      Object.keys(drafts).map(function (k) { return k + (drafts[k].trim() ? '1' : '0'); }).join(),
      prayerDraft.trim() ? '1' : '0', newQuestion.trim() ? '1' : '0',
      codeDraft, joinError, editing && editing.id, busy, showingJournal,
      // The suggestions themselves. A journal entry written in another tab
      // has to be able to appear here without waiting for something else to
      // change.
      HC.journal ? HC.journal.forGuide(snap.room && snap.room.guideId).length : 0
    ]);
  }

  function build() {
    var snap = HC.rooms.snapshot();
    var state = screenState(snap);

    if (state === 'away') {
      return '<div class="hc-screen hc-group">' +
        c.sectionHeader('Your group', 'Not set up yet', { flush: true, tag: 'h1' }) +
        c.emptyState('Group rooms need an account, and accounts are not switched on for this church yet.') +
      '</div>';
    }
    if (state === 'join') return joinScreen();
    if (HC.auth.isSignedIn() && !agreedToTerms() && pendingWrite) return termsGate();
    return roomScreen(snap);
  }

  function render() {
    lastSignature = null;   // a fresh mount always draws
    var node = c.el(build());
    return node;
  }

  /* Focus and caret survive a re-render. Without this, the poll landing while
     you are mid sentence moves the cursor to the end of the box, or loses the
     box entirely. */
  function remember() {
    var active = document.activeElement;
    if (!active || active.tagName !== 'TEXTAREA' && active.tagName !== 'INPUT') return null;
    var sel = active.getAttribute('data-draft') ? '[data-draft="' + active.getAttribute('data-draft') + '"]'
            : active.getAttribute('data-prayer') ? '[data-prayer="1"]'
            : active.getAttribute('data-newq') ? '[data-newq="1"]'
            : active.getAttribute('data-editing') ? '[data-editing="1"]'
            : active.name === 'code' ? 'input[name="code"]'
            : null;
    if (!sel) return null;
    return { sel: sel, start: active.selectionStart, end: active.selectionEnd };
  }

  function restore(memo, root) {
    if (!memo) return;
    var el = root.querySelector(memo.sel);
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(memo.start, memo.end); } catch (err) { /* not a text input */ }
  }

  // Re-render in place, which is what the subscriber and every action use.
  function repaint(force) {
    var mount = document.querySelector('.hc-group');
    if (!mount || !mount.parentNode) return;

    var sig = signature(HC.rooms.snapshot());
    if (!force && sig === lastSignature) return;
    lastSignature = sig;

    var memo = remember();
    var fresh = c.el(build());
    mount.parentNode.replaceChild(fresh, mount);
    restore(memo, fresh);
  }

  HC.screens = HC.screens || {};
  HC.screens.group = function () { return render(); };
  HC.screens.groupHelpers = {
    repaint: repaint,
    drafts: drafts,
    setDraft: function (key, value) { drafts[key] = value; },
    setPrayerDraft: function (v) { prayerDraft = v; },
    setNewQuestion: function (v) { newQuestion = v; },
    setCodeDraft: function (v) { codeDraft = v; },
    getCodeDraft: function () { return codeDraft; },
    setJoinError: function (v) { joinError = v; },
    setEditing: function (v) { editing = v; },
    setShowingJournal: function (v) { showingJournal = v; },
    getShowingJournal: function () { return showingJournal; },
    getEditing: function () { return editing; },
    setBusy: function (v) { busy = v; },
    clearDraft: function (key) { delete drafts[key]; },
    clearPrayerDraft: function () { prayerDraft = ''; },
    clearNewQuestion: function () { newQuestion = ''; },
    requireTerms: function (on) { pendingWrite = on; },
    needsTerms: function () { return HC.auth.isSignedIn() && !agreedToTerms(); },
    signature: signature
  };

})(window.HC = window.HC || {});
