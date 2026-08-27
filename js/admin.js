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
  var cache = { announcements: null, users: null, pages: null, settings: null };
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
      pinned:    !!row.pinned
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
