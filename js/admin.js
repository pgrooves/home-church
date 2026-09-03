/* ==========================================================================
   Home Church, the admin data layer
   Everything Settings -> Admin reads and writes, and nothing about how it
   looks. Same split as js/rooms.js and the Group tab, and for the same
   reason: the screen file is long enough already, and a write that happens
   in two places is a write that behaves differently in two places.

   WHO CAN GET HERE. Nothing in this file is a security boundary and none of
   it is trying to be. isAdmin() decides whether the app draws a door; the
   database decides whether anything comes through it, in the policies from
   migration 0026 and the admin-gated functions from 0025 and 0027. A member
   who edits their own localStorage and makes the Admin row appear gets a
   screen full of buttons that all come back 403, which is the correct
   outcome and is worth knowing on purpose rather than discovering.

   THE CACHE, and why it is shaped like js/practices.js rather than like
   js/content.js. Screens in this app render to a string in one pass, so
   anything they call has to answer immediately. Every list() below returns
   what is in hand, synchronously, and starts a fetch if nobody has; the
   repaint comes from the 'admin' event. Nothing here is cached to
   localStorage, unlike content: this is the church's working copy, an admin
   opening the screen wants what is in the table right now, and a stale draft
   restored from last week is worse than a spinner.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* Which announcements, pages and settings exist, as far as this screen
     knows. `null` means nobody has asked yet, `[]` means the table answered
     and is empty, and the screens tell those two apart. */
  var cache = {
    announcements: null, users: null, pages: null, settings: null,
    // The newsletter intake's own heartbeat, read for the notice at the top of
    // the announcements section. A slot of its own rather than a field on the
    // announcements load, because it is a different table with a different
    // failure mode: the drafts can arrive perfectly while the last poll failed,
    // and the screen has to be able to say both.
    newsletter: null,
    // The home groups box's own last run, read for the notice under its
    // button. A slot of its own for the same reason the newsletter has one:
    // it is a different table with a different failure mode, and the box can
    // be perfectly current while the last attempt to update it failed.
    groupStatus: null,
    // Events waiting to be approved. A table of its own rather than a filter,
    // see the events queue section below.
    events: null,
    // Who approved what, from migration 0043. An admin-only table, and the
    // only place the name of the person who tapped Approve is written down.
    approvals: null
  };
  var inflight = {};
  var lastError = {};

  function emit() {
    HC.store.emit('admin', null);
  }

  /* ------------------------------------------------------------- who am I */

  /* Read off the profile this phone is holding, which js/auth.js fills from
     the profiles row on every sign in and every session refresh. Not asked of
     the network here, because this is called on every draw of the Profile
     screen and a door that appears a second late is a door people miss.

     A demotion therefore shows up on this phone at the next refresh rather
     than instantly. That gap is deliberate and it is safe: the row is drawn
     from stale local state, and every button behind it is checked live by the
     database. The reverse gap, an admin whose row has not arrived yet, closes
     itself the moment ensureFreshSession() next runs. */
  function isAdmin() {
    if (!HC.auth.isConfigured() || !HC.auth.isSignedIn()) return false;
    return HC.store.getProfile().role === 'admin';
  }

  /* ------------------------------------------------------------ the fetch */

  /* One shape for every list. `key` names the cache slot, `run` is the
     promise that fills it. Errors are kept rather than thrown, because a
     screen has to draw something either way and "we could not reach the
     church's servers" is a thing to draw.

     THE TWO EARLY RETURNS ARE LOAD BEARING, and the first one is not an
     optimisation. The Admin screen calls this on every render, and a render
     is what an arriving list causes: js/app.js repaints on the 'admin' event.
     Without the cache check that is a fetch, an emit, a render, a fetch, for
     as long as the screen is open. A settled result therefore has to make
     this a no-op until something invalidates it.

     A failed load is left settled too, on `lastError` rather than on a filled
     cache, which is why the check is `cache[key] !== null` and not "did it
     work". A screen that retried a failed fetch on every repaint would hammer
     a server that is already having a bad time. The retry is somebody leaving
     the section and coming back, which is one tap. */
  function load(key, run) {
    if (cache[key] !== null) return;
    if (inflight[key]) return;
    inflight[key] = true;
    delete lastError[key];

    run().then(function (rows) {
      cache[key] = Array.isArray(rows) ? rows : [];
    }).catch(function (err) {
      lastError[key] = err;
      // Settled, not empty. `pending()` in the screen reads lastError first,
      // so this draws the reason rather than "nothing here yet", and the
      // guard above stops it being asked again on every repaint.
      cache[key] = [];
    }).then(function () {
      delete inflight[key];
      emit();
    });
  }

  function list(key) {
    return cache[key] || [];
  }

  function ready(key) {
    return cache[key] !== null;
  }

  function failed(key) {
    return lastError[key] || null;
  }

  /* Called after every write. Dropping the slot rather than patching it in
     place means the next draw shows exactly what the table holds, including
     the updated_at the database stamped and any row somebody else changed
     while this screen was open. One extra round trip on a screen used a few
     times a week is not worth the class of bug that optimistic local edits
     open up. */
  function invalidate(key) {
    cache[key] = null;
    emit();
  }

  /* ------------------------------------------------------- announcements */

  /* select=* and no published filter, which is the whole point of the admin
     read: the policy in 0026 widens SELECT to `published or hc_is_admin()`,
     so this session sees drafts and the app's own content sync, which reads
     with the publishable key and no session, still cannot. */
  function loadAnnouncements() {
    load('announcements', function () {
      return HC.auth.restFetch('/announcements?select=*&order=created_at.desc');
    });
  }

  /* ------------------------------------------------- the newsletter intake

     The pipeline in migration 0038 and supabase/functions/newsletter-intake.
     Everything below reads its two log tables or moves a parsed draft out of
     the review queue. The parsing itself happens on a schedule and nothing in
     the app can start it, which is deliberate: the only thing a person does
     here is decide.

     WHY THE REVIEW QUEUE IS NOT A THIRD FETCH. A pending draft is an
     announcements row with review_state = 'pending', and this screen already
     holds every announcements row: 0026's select policy hands an admin the
     drafts along with everything else, which is what loadAnnouncements()
     already relies on to draw "Draft" in the list. So the queue is a filter
     over a list we have, not a query. One list means the review cards and the
     Posted list underneath them can never disagree about what exists. */

  function loadNewsletter() {
    load('newsletter', function () {
      // Only the newest matters. The screen says "checked 12 minutes ago" or
      // it says what went wrong, and both are answered by one row.
      return HC.auth.restFetch('/newsletter_runs?select=*&order=ran_at.desc&limit=1');
    });
  }

  /* The last poll, or null when nobody has asked yet or the table is empty. An
     empty table is a real state and it is the one the day this ships: the cron
     job has not run yet, and the screen says so rather than implying a
     failure. */
  function lastRun() {
    var rows = list('newsletter');
    return rows.length ? rows[0] : null;
  }

  function pending() {
    return list('announcements').filter(function (row) {
      return row.review_state === 'pending';
    });
  }

  /* ------------------------------------------------- the home groups box

     The paragraph on Connect where the group finder would be, and the two
     ways it moves: a button that shortens the church's most recent home
     groups announcement into it, and a form for typing it. Migration 0048,
     and the group_status mode in supabase/functions/newsletter-intake.

     THE LOG IS READ THE SAME WAY THE NEWSLETTER'S IS, and for the same
     reason: pg_net throws the Edge Function's response away, so a row in
     group_status_runs is the only account of what a tap did. The extra thing
     this log carries is previous_note, which is the undo — see the notice in
     js/screens/admin.js, which offers it back when a shortening is not
     wanted. */

  function loadGroupStatus() {
    load('groupStatus', function () {
      return HC.auth.restFetch('/group_status_runs?select=*&order=ran_at.desc&limit=1');
    });
  }

  function lastGroupRun() {
    var rows = list('groupStatus');
    return rows.length ? rows[0] : null;
  }

  /* Shorten the latest announcement into the box now.

     Through a named function for the reason migration 0039 gives about the
     newsletter's button and 0048 repeats: the Edge Function proves its caller
     with a secret that lives in the vault and must never reach a phone.
     hc_admin_refresh_group_status is the whole of what an admin can reach, it
     takes no arguments, and it checks hc_is_admin() before it does anything. */
  function refreshGroupStatus() {
    return HC.auth.rpc('hc_admin_refresh_group_status');
  }

  /* The newest run, asked of the network rather than of the cache, for exactly
     the reason latestRun() below does the same: the poll is watching for a row
     that does not exist yet, and the cache would answer instantly with the one
     from before the tap. */
  function latestGroupRun() {
    return HC.auth.restFetch('/group_status_runs?select=*&order=ran_at.desc&limit=1')
      .then(function (rows) {
        return Array.isArray(rows) && rows.length ? rows[0] : null;
      });
  }

  /* The paragraph and the flyer, written together.

     One RPC rather than a PATCH, because the flyer is a URL and 0031 keeps
     phone-writable columns to prose on purpose. hc_admin_set_group_note
     checks that the picture is an upload in this project's own bucket, which
     a column grant could not. Migration 0048 section 4 is the long version.

     The content sync is refreshed rather than the admin cache, because what
     changed is on Connect: church_profile is content, not an admin list. */
  /* The log slot, after a run has finished. Same move refreshNewsletter()
     makes: the row the poll just read is newer than the one in hand, and the
     notice under the button is drawn from the cache. */
  function invalidateGroupStatus() {
    invalidate('groupStatus');
  }

  function saveGroupNote(note, imageUrl) {
    return HC.auth.rpc('hc_admin_set_group_note', {
      p_note: note || '',
      p_image_url: imageUrl || null
    }).then(function () {
      invalidate('groupStatus');
      HC.content.refresh();
    });
  }

  /* ---------------------------------------------------- who approved what

     The internal note, from migration 0043. It exists because more than one
     person can now be looking at the same queue at the same time: the intake
     tells every admin at once that something is waiting, and the first one to
     get there settles it for the rest. "It disappeared" is a worse answer to
     the second person than "Ada approved it".

     ONE FETCH FOR BOTH KINDS. review_approvals holds announcements and events
     in one table keyed on (kind, row_id), so this is a single list filtered
     twice rather than two round trips. It is small by construction, one row
     per thing ever approved out of the two queues, and it is only ever read on
     a screen somebody had to be an admin to open.

     There is no anon path to this table at all, which is the whole reason it
     is a table rather than two columns on announcements: the app's content
     sync reads announcements with the publishable key, so a name stored there
     would be a name downloaded by every phone in the church. 0043 section 7
     says the same thing from the database's side. */

  function loadApprovals() {
    load('approvals', function () {
      return HC.auth.restFetch('/review_approvals?select=*');
    });
  }

  /* The note for one row, or null. Null is the ordinary answer for anything
     approved before 0043 ran and for everything a person wrote by hand, and
     the screen simply draws nothing rather than guessing at a name. */
  function approvalFor(kind, id) {
    var rows = list('approvals');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].kind === kind && rows[i].row_id === id) return rows[i];
    }
    return null;
  }

  /* ------------------------------------------------- the events queue

     Events parsed out of the newsletter and not yet approved. A second queue
     beside the announcements one, because since 0041 they are two decisions:
     approving the words on a card is not the same as vouching for a date that
     will land in the church's calendar and then in people's phones.

     Its own cache slot and its own fetch, unlike the announcements queue,
     which is a filter over a list this screen already holds. Events are a
     different table and this screen has never had a reason to read it before,
     so there is nothing to filter. The policy from 0040 is what lets an admin
     see an unpublished one at all. */

  function loadPendingEvents() {
    load('events', function () {
      return HC.auth.restFetch(
        '/events?select=*&review_state=eq.pending&order=starts_at.asc');
    });
  }

  function pendingEvents() {
    return list('events');
  }

  /* THE REFRESH HAPPENS WHETHER OR NOT THIS WORKED, which is the one thing
     here that is not obvious. Since 0043 the most likely reason for a refusal
     is that another admin approved this a minute ago and this screen is
     holding a list from before they did. Leaving the stale card on screen
     after telling somebody it is already settled is how they tap it again.

     So the queue is dropped first and the error is re-thrown after, and the
     repaint that follows takes the card away for this admin the same way the
     approval took it away for everybody else. */
  function approveEvent(id) {
    return HC.auth.rpc('hc_admin_approve_event', { p_id: id })
      .then(function () {
        invalidate('events');
        invalidate('approvals');
        // The Connect tab draws from the synced copy, so it has to be told.
        HC.content.refresh();
      }, function (err) {
        invalidate('events');
        invalidate('approvals');
        throw err;
      });
  }

  /* Deletes rather than marks, per 0041. The announcement it belonged to keeps
     everything else and simply stops offering an Add to calendar button, so
     the announcements list has to be dropped too. */
  function discardEvent(id) {
    return HC.auth.rpc('hc_admin_discard_event', { p_id: id })
      .then(function () {
        invalidate('events');
        invalidate('announcements');
        // 0043 deletes the note along with the row, because ids in this
        // project come back on a later parse of the same recurring event and a
        // stale note would name somebody who never saw it.
        invalidate('approvals');
        HC.content.refresh();
      });
  }

  /* ------------------------------------------- the calendar an admin keeps

     What the Cal tab's + , pencil and x reach. Three calls, and none of them
     touches the review queue above: an event a model parsed is still approved
     through hc_admin_approve_event and nowhere else. This is the church's own
     calendar, written by hand.

     Both writes go through the functions migration 0042 adds rather than
     through a PATCH, because events still has no write policy for any client
     role. 0026 decided that, 0040 and 0041 restated it, and 0042 keeps it: a
     named, admin-checked function is the whole surface. */

  /* One event, as the table holds it, for the edit form.

     Asked of the network rather than of HC.data, and js/screens/cal.js says at
     length why: the app's own copy has time_label and the formatted clock time
     flattened into one field, and a form that wrote that back would corrupt
     one or the other. Not cached, because there is one caller and it is a
     button somebody pressed to see this row right now. */
  function event(id) {
    return HC.auth.restFetch('/events?select=*&id=eq.' + encodeURIComponent(id))
      .then(function (rows) {
        return Array.isArray(rows) && rows.length ? rows[0] : null;
      });
  }

  /* New when draft.id is null, that row when it is not. The function decides
     which, so this cannot get it wrong on a slow connection and write two.

     HC.content.refresh() rather than invalidate(): the Cal tab draws
     HC.data.events, which is the synced copy every screen reads, not this
     file's cache. The pending queue above is a different list and is untouched
     by a hand written event. */
  function saveEvent(draft) {
    return HC.auth.rpc('hc_admin_save_event', {
      p_id: draft.id || null,
      p_title: draft.title,
      p_starts_at: draft.startsAt,
      p_time_label: draft.timeLabel || null,
      p_location: draft.location || null,
      p_description: draft.description || null
    }).then(function (id) {
      HC.content.refresh();
      return id;
    });
  }

  /* The x. Deletes for good, per 0042: there is no unpublished state worth
     leaving a row in, because an unpublished event is on no screen in this
     app and could never be found again. */
  function deleteEvent(id) {
    return HC.auth.rpc('hc_admin_delete_event', { p_id: id }).then(function () {
      // An announcement can point at the event that just went, and the card
      // it draws loses its Add to calendar button, so the admin list of
      // announcements is stale from here too.
      invalidate('announcements');
      HC.content.refresh();
    });
  }

  /* Check the mailbox now rather than at the next twenty minute tick.

     Through a named function for the reason migration 0039 gives: the Edge
     Function proves its caller with a secret that lives in the vault and must
     never reach a phone, so the app cannot call the intake directly and should
     not be able to. hc_admin_fetch_newsletter is the whole of what an admin
     can reach, it takes no arguments, and it checks hc_is_admin() before it
     does anything. */
  function fetchNewsletter() {
    return HC.auth.rpc('hc_admin_fetch_newsletter');
  }

  /* The newest run, asked of the network rather than of the cache.

     This is the one read in the file that deliberately bypasses the cache, and
     it has to: the whole point of it is watching for a row that does not exist
     yet. `load()` above would answer instantly with what it already has, which
     is exactly the stale answer the poll is trying to see past. */
  function latestRun() {
    return HC.auth.restFetch('/newsletter_runs?select=*&order=ran_at.desc&limit=1')
      .then(function (rows) {
        return Array.isArray(rows) && rows.length ? rows[0] : null;
      });
  }

  /* Both slots, after a check has finished. The run log for the notice at the
     top, and the announcements for the drafts underneath it, because a
     successful check changes both and refreshing one without the other shows
     somebody a "3 new drafts" line above a list that has none. */
  function refreshNewsletter() {
    invalidate('announcements');
    invalidate('newsletter');
  }

  /* Approve. One PATCH, and it is the only place in this feature that sets
     published to true.

     `published` and `review_state` are written together and never apart. Two
     PATCHes would leave a window in which a row is live but still in the
     queue, and the failure of the second one would leave it there permanently.
     Nothing else on the row is touched, so whatever the parse produced is what
     goes up, which is the point of having reviewed it. */
  function approveAnnouncement(id) {
    return HC.auth.rpc('hc_admin_approve_announcement', { p_id: id })
      .then(function () {
        invalidate('announcements');
        invalidate('approvals');
        HC.content.refresh();
      }, function (err) {
        // Same as approveEvent above, and for the same reason: a refusal here
        // usually means somebody else got there first, and the card has to go.
        invalidate('announcements');
        invalidate('approvals');
        throw err;
      });
  }

  /* Discard, and note what it does not do: it does not delete.

     The row leaves the review queue and lands in the Posted list below it as an
     ordinary draft, where the Delete button that has been there since 0026 can
     remove it for good. That is what lets Discard be a single tap with no
     confirmation dialog in front of it: the tap is reversible, and the
     irreversible thing is still behind the same confirm it has always been
     behind. A one-tap delete on a card somebody is reading for the first time
     is how a good announcement disappears on a mis-tap. */
  function discardAnnouncement(id) {
    return HC.auth.rpc('hc_admin_discard_announcement', { p_id: id })
      .then(function () {
        invalidate('announcements');
        // The event went with it, and the Connect tab is drawn from the synced
        // copy, so that copy has to be told.
        HC.content.refresh();
      });
  }

  /* An id is permanent once written, per 0003: the app keys "I dismissed
     this" in localStorage on it, so renaming one un-dismisses it on every
     phone that had already put it away. That is why the slug is derived from
     the title exactly once, when the row is created, and never again when it
     is edited.

     Uniqueness is settled against the list this screen already has rather
     than by asking the database, then guarded by the primary key underneath.
     A collision needs two announcements with the same title, which happens
     ('Serve Day'), so the suffix is a real path and not a theoretical one. */
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function newId(prefix, title, taken) {
    var base = prefix + '-' + (slugify(title) || 'untitled');
    var id = base;
    var n = 2;
    while (taken.indexOf(id) !== -1) { id = base + '-' + n; n++; }
    return id;
  }

  function announcementId(title) {
    return newId('announcement', title, list('announcements').map(function (a) { return a.id; }));
  }

  /* Every picture on the draft that is actually a picture. The form keeps a
     list of text boxes and an admin who taps + twice and fills in one of them
     has two empty strings in it, which are not pictures and must not become
     rows of nothing on Home. Trimmed here rather than in the form, for the
     same reason cleanSections() below trims there: the form is where somebody
     changes their mind, and the save is where it stops mattering. */
  function cleanImages(list) {
    return (list || []).map(function (u) {
      return String(u == null ? '' : u).trim();
    }).filter(Boolean);
  }

  /* The two columns that hold the words, written together and never apart.

     body_html is what the announcement's own page draws. body is the plain
     text mirror of it, and three things read that and can read nothing else:
     the push notification, which puts its first sentence on every lock screen
     in the church; the list on this screen; and the snippet under the title on
     Home, which sits inside a button and so can hold no link. Migration 0033
     says the same thing from the table's side.

     The sanitizer runs here, on the way out, as well as on the way in when the
     page draws it. That is the same twice-over rule js/journal.js has kept
     since it shipped: the version that writes and the version that renders
     both decide, so markup from an admin's phone that is three releases behind
     is judged by the build that is actually storing it. */
  function announcementWords(row) {
    var html = HC.richtext.sanitize(row.bodyHtml || '', { links: 'web' });
    // Nothing but an empty paragraph a browser left behind. Stored as null,
    // so "this announcement has no words" is one answer and not two.
    var text = HC.richtext.plainText(html).trim();
    if (!text) return { body_html: null, body: null };
    return { body_html: html, body: text };
  }

  /* Insert or update, decided by whether the caller handed us an id. The two
     are one function because the form is one form: the only difference a
     person sees between writing an announcement and fixing one is what was
     in the fields when it opened. */
  function saveAnnouncement(row) {
    var images = cleanImages(row.images);
    var words = announcementWords(row);

    var body = {
      eyebrow:   row.eyebrow || null,
      title:     row.title,
      body:      words.body,
      body_html: words.body_html,
      // image_url is the first of the list rather than a field of its own.
      // 0026's column stays because a phone running an older build reads it
      // and nothing else, and the day the two disagree is the day that phone
      // shows a photograph the church took off the announcement.
      image_url: images[0] || null,
      image_urls: images,
      video_url: row.videoUrl || null,
      link_url:  row.linkUrl || null,
      link_title: row.linkTitle || null,
      // Written even when it is null, and that is the x on the form: "this
      // link has no thumbnail" is a decision somebody made and a PATCH that
      // left the column out would quietly undo it on the next save.
      link_image_url: row.linkImageUrl || null,
      starts_on: row.startsOn || null,
      ends_on:   row.endsOn || null,
      priority:  row.priority || 0,
      published: row.published !== false,
      // The strip under the top bar. Written on every save, including the
      // saves that turn it off: `!!` rather than `|| null`, because the
      // column is not null and "unpin this" has to be a value the PATCH
      // actually carries. See migration 0028.
      pinned:    !!row.pinned,

      /* What editing a parsed draft means, which is the one place the review
         queue touches the ordinary form.

         Null for everything a person wrote, now and forever: `reviewState` is
         only ever set by editorFor() off a row that has it, so an announcement
         written by hand keeps a null here through every save.

         For a parsed one, saving it published IS approving it. Somebody who
         opened the draft, fixed the date and pressed Save changed their mind
         about nothing except the words, and making them then go back and find
         the card in the queue to approve it separately would be a second
         decision about a thing they have already decided. Saving it still
         unpublished leaves it pending, because that is somebody halfway
         through and not somebody finished. See migration 0038 section 4. */
      review_state: row.reviewState
        ? (row.published !== false ? 'approved' : 'pending')
        : null
    };

    var done = row.id
      ? HC.auth.restFetch('/announcements?id=eq.' + encodeURIComponent(row.id), {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: body
        })
      : HC.auth.restFetch('/announcements', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: Object.assign({ id: announcementId(row.title) }, body)
        });

    return done.then(function (rows) {
      invalidate('announcements');
      var saved = Array.isArray(rows) ? rows[0] : rows;
      // Home reads HC.data.announcements, which the content sync fills. A
      // refresh here is what makes a just-posted announcement appear on Home
      // without waiting for the next cold start.
      HC.content.refresh();
      /* And the byline the database has just written for it, which the list
         js/bylines.js is holding cannot have: this is the one moment in the
         app where a new announcement_authors row appears. Dropped rather than
         patched, for the reason invalidate() gives above. */
      if (HC.bylines) HC.bylines.forget();
      return saved;
    });
  }

  function deleteAnnouncement(id) {
    return HC.auth.restFetch('/announcements?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }).then(function () {
      invalidate('announcements');
      HC.content.refresh();
      // The note went with the row, per the cascade in migration 0045.
      if (HC.bylines) HC.bylines.forget();
    });
  }

  /* The notification. Deliberately a separate call from the save rather than
     a flag on it, because they fail differently and a person needs to know
     which one did: an announcement that posted but did not notify is fine and
     fixable, and a notification sent about an announcement that did not save
     is a lie on four hundred lock screens. Two calls in order, and the second
     one's failure never rolls back the first. */
  function notifyAnnouncement(id) {
    return HC.auth.rpc('hc_admin_send_announcement', { p_id: id });
  }

  /* --------------------------------------------------------- the picture

     Straight to Storage over HTTP, with the session's own token, which the
     policies in 0026 section 6 answer as an admin. No SDK, same as the rest
     of this app.

     The path is dated and randomised rather than being the file's own name.
     Two reasons: two photographs called IMG_0042.jpg is the normal case, not
     the edge case, and `upsert: false` would fail the second one; and a
     bucket that is public read is a bucket whose object names are guessable,
     so the names should not describe what is in them. */
  function imagePath(file) {
    var dot = String(file.name || '').lastIndexOf('.');
    var ext = dot > -1 ? String(file.name).slice(dot + 1).toLowerCase() : 'jpg';
    if (!/^[a-z0-9]{1,5}$/.test(ext)) ext = 'jpg';

    var now = new Date();
    var stamp = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
    var rand = Math.random().toString(36).slice(2, 10);
    return stamp + '/' + rand + '.' + ext;
  }

  var MAX_BYTES = 5 * 1024 * 1024;   // matches the bucket's own limit, 0026

  function uploadImage(file) {
    if (!file) return Promise.reject(new Error('No file.'));
    // Checked here as well as by the bucket so somebody on a slow connection
    // finds out before they have uploaded four megabytes of it.
    if (file.size > MAX_BYTES) {
      return Promise.reject(new Error('That picture is larger than 5MB. Try a smaller one.'));
    }

    var path = imagePath(file);
    var base = HC.config.SUPABASE_URL.replace(/\/$/, '');

    return HC.auth.withSession(function (session) {
      return fetch(base + '/storage/v1/object/announcements/' + path, {
        method: 'POST',
        headers: {
          apikey: HC.config.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + session.accessToken,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'false'
        },
        body: file
      }).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (b) {
            throw new Error(b.message || b.error ||
              'That picture would not upload. Check your connection and try again.');
          });
        }
        return base + '/storage/v1/object/public/announcements/' + path;
      });
    });
  }

  /* ------------------------------------------------------ the link thumbnail

     A thumbnail for the link an admin just pasted, or '' for one this app
     cannot work out.

     WHY THIS IS NOT OPEN GRAPH. The honest way to get a thumbnail for an
     arbitrary page is to fetch it and read its og:image, and the app cannot:
     a cross origin fetch from the web view is refused by the browser, and the
     way round that is a server that fetches URLs on somebody else's behalf,
     which is a new Edge Function, a new thing to keep running, and a small
     open proxy pointed at the internet. That is a great deal of machinery for
     a picture.

     So this answers the two cases it can answer without asking anybody
     anything, and for everything else the form's Picture control is right
     there: an admin can upload or paste a thumbnail in two taps, and the x
     takes it off again. A link card with no thumbnail is a perfectly good link
     card, which is the other half of why this is enough.

     A NOTE ON THE YOUTUBE CASE. It is the same poster the video player uses,
     which means a link to a video and the video field itself draw the same
     picture, which is right: they are the same video. */
  var IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|avif)(?:[?#].*)?$/i;

  function suggestLinkImage(url) {
    var web = HC.components.webUrl(url);
    if (!web) return '';

    var videoId = HC.components.youtubeId(web);
    if (videoId) return HC.components.youtubeThumb(videoId);

    // A link that is itself a photograph. Somebody pasting one means it.
    if (/^https?:/i.test(web) && IMAGE_EXT.test(web)) return web;

    return '';
  }

  /* ---------------------------------------------------------------- users */

  /* Through a function rather than a select, because the roster needs an
     email and emails live in auth.users, which no client role can read and
     none should. See 0025 section 4. */
  function loadUsers() {
    load('users', function () {
      return HC.auth.rpc('hc_admin_list_users');
    });
  }

  function me() {
    var user = HC.auth.getUser();
    return user ? user.id : null;
  }

  // The safety guard, in the app's own voice. The database refuses both of
  // these too, in the trigger from 0025 section 3 and inside
  // hc_admin_set_role, so this is the message rather than the mechanism.
  function isSelf(id) {
    return !!id && id === me();
  }

  function setRole(id, role) {
    if (isSelf(id)) {
      return Promise.reject(new Error('You cannot change your own role.'));
    }
    return HC.auth.rpc('hc_admin_set_role', { p_user: id, p_role: role })
      .then(function () { invalidate('users'); });
  }

  /* Leader mode, which until migration 0036 was a switch anybody could flip
     in Your account. It is granted here now, because what it turns on is no
     longer only a private roster: a leader opens a group room, rewrites the
     questions the whole group sees, and can take down anything anybody wrote
     in it.

     The same self guard setRole has, because it is the same rule: three
     tiers, and nobody sets their own. The screen never draws the switch on an
     admin's row anyway, and your own row is always an admin's, so this is the
     message rather than the mechanism. hc_admin_set_leader and the trigger
     under it refuse it too. */
  function setLeader(id, on) {
    if (isSelf(id)) {
      return Promise.reject(new Error('You cannot change your own tier.'));
    }
    return HC.auth.rpc('hc_admin_set_leader', { p_user: id, p_on: !!on })
      .then(function () { invalidate('users'); });
  }

  function removeUser(id) {
    if (isSelf(id)) {
      return Promise.reject(new Error(
        'You cannot remove your own account here. Use Delete my account under Your data.'));
    }
    return HC.auth.callFunction('/admin-remove-user', { user_id: id })
      .then(function () { invalidate('users'); });
  }

  /* ---------------------------------------------------------------- pages */

  function loadPages() {
    load('pages', function () {
      return HC.auth.restFetch('/content_pages?select=*&order=sort_order.asc,title.asc');
    });
  }

  function pageId(title) {
    return newId('page', title, list('pages').map(function (p) { return p.id; }));
  }

  /* `sections` is [{heading, body}] and arrives from the form already in that
     shape. Empty rows are dropped here rather than in the screen: a section
     with neither a heading nor a body is somebody having added one and
     changed their mind, and storing it would draw a gap on the page. */
  function cleanSections(sections) {
    return (sections || []).map(function (s) {
      return { heading: String(s.heading || '').trim(), body: String(s.body || '').trim() };
    }).filter(function (s) {
      return s.heading || s.body;
    });
  }

  function savePage(row) {
    var body = {
      title:      row.title,
      eyebrow:    row.eyebrow || null,
      blurb:      row.blurb || null,
      sections:   cleanSections(row.sections),
      sort_order: row.sortOrder || 0,
      published:  row.published !== false
    };

    var done = row.id
      ? HC.auth.restFetch('/content_pages?id=eq.' + encodeURIComponent(row.id), {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: body
        })
      : HC.auth.restFetch('/content_pages', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: Object.assign({ id: pageId(row.title) }, body)
        });

    return done.then(function (rows) {
      invalidate('pages');
      HC.content.refresh();
      return Array.isArray(rows) ? rows[0] : rows;
    });
  }

  function deletePage(id) {
    return HC.auth.restFetch('/content_pages?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }).then(function () {
      invalidate('pages');
      HC.content.refresh();
    });
  }

  /* ------------------------------------------------------------- settings */

  function loadSettings() {
    load('settings', function () {
      return HC.auth.restFetch('/app_settings?select=*&order=sort_order.asc,label.asc');
    });
  }

  /* One row, one column. `kind` decides which, so a switch can never write a
     string into the field a boolean is read from, which is the reason the
     table has two typed columns instead of one text one. See 0026 section 3. */
  function saveSetting(key, kind, value) {
    var body = kind === 'boolean'
      ? { value_bool: !!value }
      : { value_text: value == null ? '' : String(value) };

    return HC.auth.restFetch('/app_settings?key=eq.' + encodeURIComponent(key), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: body
    }).then(function () {
      invalidate('settings');
      HC.content.refresh();
    });
  }

  /* Adding a setting from the app, which is what keeps this a settings screen
     rather than a settings screen that needs a migration every time. The key
     is slugified from the label for the same reason announcement ids are:
     something has to read it later, and `home_banner_on` is a better thing to
     find in a query than a uuid. */
  function createSetting(row) {
    var key = slugify(row.label).replace(/-/g, '_');
    if (!key) return Promise.reject(new Error('Give it a name first.'));

    return HC.auth.restFetch('/app_settings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        key: key,
        label: row.label,
        help: row.help || null,
        kind: row.kind === 'text' ? 'text' : 'boolean',
        value_bool: row.kind === 'text' ? null : false,
        value_text: row.kind === 'text' ? '' : null,
        sort_order: row.sortOrder || 100
      }
    }).then(function (rows) {
      invalidate('settings');
      HC.content.refresh();
      return Array.isArray(rows) ? rows[0] : rows;
    });
  }

  function deleteSetting(key) {
    return HC.auth.restFetch('/app_settings?key=eq.' + encodeURIComponent(key), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }).then(function () {
      invalidate('settings');
      HC.content.refresh();
    });
  }

  HC.admin = {
    isAdmin: isAdmin,
    isSelf: isSelf,

    ready: ready,
    failed: failed,

    announcements: function () { return list('announcements'); },
    loadAnnouncements: loadAnnouncements,
    saveAnnouncement: saveAnnouncement,
    deleteAnnouncement: deleteAnnouncement,
    notifyAnnouncement: notifyAnnouncement,

    pending: pending,
    loadApprovals: loadApprovals,
    approvalFor: approvalFor,
    pendingEvents: pendingEvents,
    loadPendingEvents: loadPendingEvents,
    approveEvent: approveEvent,
    discardEvent: discardEvent,
    approveAnnouncement: approveAnnouncement,
    discardAnnouncement: discardAnnouncement,

    // The Cal tab's own three, which have nothing to do with the queue above.
    event: event,
    saveEvent: saveEvent,
    deleteEvent: deleteEvent,

    loadNewsletter: loadNewsletter,
    lastRun: lastRun,
    fetchNewsletter: fetchNewsletter,
    latestRun: latestRun,
    refreshNewsletter: refreshNewsletter,

    loadGroupStatus: loadGroupStatus,
    lastGroupRun: lastGroupRun,
    refreshGroupStatus: refreshGroupStatus,
    latestGroupRun: latestGroupRun,
    invalidateGroupStatus: invalidateGroupStatus,
    saveGroupNote: saveGroupNote,

    uploadImage: uploadImage,
    suggestLinkImage: suggestLinkImage,

    users: function () { return list('users'); },
    loadUsers: loadUsers,
    setRole: setRole,
    setLeader: setLeader,
    removeUser: removeUser,

    pages: function () { return list('pages'); },
    loadPages: loadPages,
    savePage: savePage,
    deletePage: deletePage,

    settings: function () { return list('settings'); },
    loadSettings: loadSettings,
    saveSetting: saveSetting,
    createSetting: createSetting,
    deleteSetting: deleteSetting
  };

})(window.HC = window.HC || {});
