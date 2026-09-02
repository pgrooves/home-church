/* ==========================================================================
   Home Church, who posted the announcement
   One line, for the people who run this church: "by Ada Lovelace" beside the
   date on an announcement, or "from the email newsletter" when nobody typed
   it. Admins and leaders see it. Everybody else sees the announcement, which
   is what an announcement is for.

   WHY IT IS A MODULE AND NOT TWO LINES IN A SCREEN. Two screens draw the date
   an announcement went up, the card on Home and the announcement's own page,
   and a byline written out in both is a byline that ends up saying two
   different things. The sentence is made here, once, and both screens ask for
   it. Same split as js/admin.js and the Admin screen: what the app knows lives
   apart from how it looks.

   WHERE THE NAME COMES FROM. announcement_authors, added by migration 0045,
   which is a table of its own for a reason worth knowing before anybody moves
   it: the app's content sync reads announcements with the publishable key and
   `select=*`, so a name on that table is a name every phone in the church
   downloads, whether or not a screen draws it. There is no read path to this
   one that does not go through hc_is_leader(). This file therefore has to ask
   for it with a session, separately, and that is the whole reason it exists
   rather than being one more column in js/content.js.

   NOTHING HERE IS A SECURITY BOUNDARY, the same disclaimer js/admin.js opens
   with and for the same reason. isLeader() decides whether this file bothers
   asking; the database decides what comes back. A member who edits their own
   localStorage gets one fetch that answers with an empty list.

   THE CACHE IS SHAPED LIKE js/admin.js's, not like js/content.js's. Screens in
   this app render to a string in one pass, so note() has to answer
   immediately: it returns what is in hand and starts a fetch if nobody has
   yet. The repaint comes from the 'bylines' event, which js/app.js turns into
   a redraw of Home or of the announcement being read. Nothing is written to
   localStorage, because a byline is worth exactly one small fetch per launch
   to the handful of people who see it, and a stale one is a name on a card.
   ========================================================================== */

(function (HC) {
  'use strict';

  var TABLE = 'announcement_authors';

  /* null means nobody has asked yet, an object means the table answered, and
     `failed` is the third state: a fetch that came back badly is settled
     rather than retried on every repaint, which is js/admin.js's argument
     about not hammering a server that is already having a bad time. Signing
     in or out, or posting an announcement, is what clears it. */
  var notes = null;
  var inflight = false;
  var failed = false;

  /* Worth asking at all? Signed in, on a configured project, and a leader or
     an admin as far as this phone knows. The profile is filled by js/auth.js
     on every sign in and session refresh, so somebody made a leader while the
     app is open gets the line at the next refresh rather than instantly, which
     is the same gap Admin's own door has and is safe for the same reason. */
  function wanted() {
    return !!(HC.auth && HC.auth.isConfigured() && HC.auth.isSignedIn() &&
              HC.store.isLeader());
  }

  function ensure() {
    if (!wanted() || notes !== null || failed || inflight) return;
    inflight = true;

    HC.auth.restFetch('/' + TABLE + '?select=*').then(function (rows) {
      var map = {};
      (Array.isArray(rows) ? rows : []).forEach(function (row) {
        if (row && row.announcement_id) map[row.announcement_id] = row;
      });
      notes = map;
    }).catch(function () {
      /* Offline, or a project that has not run migration 0045 yet. Neither is
         worth a message: the announcement is on screen and complete, and the
         line this file adds is one the congregation never sees anyway. */
      failed = true;
    }).then(function () {
      inflight = false;
      HC.store.emit('bylines', null);
    });
  }

  /* Everything this file exists to produce, in one sentence or in none.

     THE ORDER MATTERS. A name wins over a source, because an announcement
     parsed out of the newsletter and then rewritten by hand is still the
     newsletter's row and the person who typed the words is the more useful
     answer. Nothing at all is the ordinary outcome for every announcement
     written before 0045 ran and for every one posted by a slash command:
     nobody was signed in, the database never recorded a name, and a guess
     would be worse than a blank. */
  function note(id) {
    ensure();
    if (!wanted() || !notes || !id) return '';

    var row = notes[id];
    if (!row) return '';

    var name = String(row.author_name || '').trim();
    if (name) return 'by ' + name;
    if (row.source === 'newsletter') return 'from the email newsletter';
    return '';
  }

  /* Drop what we know. Called on the way in and out of a session, so a sign
     out takes the names off this phone rather than leaving them on screen for
     whoever picks it up next, and a sign in as somebody who can see them asks
     again. Also called by js/admin.js after a write, because an announcement
     just posted from this phone has a byline the list in hand cannot have. */
  function forget() {
    notes = null;
    failed = false;
  }

  HC.bylines = {
    note: note,
    forget: forget
  };

  /* Subscribed here rather than wired in js/app.js, because this is the
     module's own housekeeping and not something a screen or the shell has an
     opinion about. js/store.js is loaded before this file, which is what makes
     it safe to do at load time. */
  HC.store.on('auth', forget);

})(window.HC = window.HC || {});
