/* ==========================================================================
   Home Church, store
   A thin localStorage wrapper, the app state object, and a tiny pub/sub.

   Every key is namespaced hc: and every access is wrapped, because private
   browsing on iOS can throw on write and the app must not care.
   ========================================================================== */

(function (HC) {
  'use strict';

  var PREFIX = 'hc:';

  /* --------------------------------------------------------------- storage */

  var storage = {
    available: (function () {
      try {
        var probe = PREFIX + 'probe';
        window.localStorage.setItem(probe, '1');
        window.localStorage.removeItem(probe);
        return true;
      } catch (err) {
        return false;
      }
    })(),

    get: function (key, fallback) {
      if (!this.available) return fallback;
      try {
        var raw = window.localStorage.getItem(PREFIX + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },

    set: function (key, value) {
      if (!this.available) return false;
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (err) {
        // Quota or private mode. The session keeps working from memory.
        return false;
      }
    },

    remove: function (key) {
      if (!this.available) return;
      try {
        window.localStorage.removeItem(PREFIX + key);
      } catch (err) { /* nothing to do */ }
    }
  };

  /* --------------------------------------------------------------- pub/sub */

  var subscribers = {};

  function on(topic, fn) {
    if (!subscribers[topic]) subscribers[topic] = [];
    subscribers[topic].push(fn);
    return function off() {
      subscribers[topic] = subscribers[topic].filter(function (f) { return f !== fn; });
    };
  }

  function emit(topic, payload) {
    (subscribers[topic] || []).forEach(function (fn) {
      try {
        fn(payload);
      } catch (err) {
        if (window.console && console.error) console.error('hc: subscriber failed on ' + topic, err);
      }
    });
  }

  /* ----------------------------------------------------------------- state */

  // Shaped to match the profiles table in Supabase once js/config.js points
  // at a real project. Local-only until then, see js/auth.js.
  var DEFAULT_PROFILE = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: '',
    birthdate: '',        // 'YYYY-MM-DD'
    campus: 'Metairie',
    maritalStatus: '',
    street: '',
    unit: '',
    city: '',
    state: '',
    zip: '',
    photoUrl: '',
    notifications: {
      newGuide: true,
      sundayReminder: true,
      groupWeek: false,
      // The church posting something on purpose. Default on for the reason in
      // migration 0027: a phone with notifications on at all wants to hear it.
      announcements: true,
      /* The two admin ones, from migration 0043. Default on, because an admin
         who cannot be told the queue has something in it finds out by
         remembering to look, which is how a newsletter that arrived on Tuesday
         reaches Home on Sunday.

         THEY ARE HERE FOR EVERYBODY AND THEY REACH THE SERVER FOR NOBODY
         ELSE. Profile draws the two switches only for an admin, and the only
         thing that carries them to device_tokens is
         hc_set_admin_device_token, which refuses anybody the database does
         not agree is an admin. So a member's phone holds two true booleans
         that nothing reads, and the day the church makes them an admin the
         switches are already on rather than waiting to be found. */
      announcementReview: true,
      eventReview: true
    },
    textScale: 1.1,    // 110%, the app's default reading size
    /* How fast a guide is read aloud, one of HC.narration.SPEEDS. Kept beside
       textScale because it is the same kind of preference: how this person
       takes the words in. Set from the small pill on an open guide section
       rather than from Profile, because the moment you know you want it
       faster is the moment you are listening. */
    narrationSpeed: 1,
    theme: 'system',   // system | light | dark
    /* Leader mode, mirrored from profiles.can_host by js/auth.js on every sign
       in and session refresh. It was a switch on this screen until migration
       0036: anybody could turn it on, because for a while all it did was
       change what this phone showed its owner. It now decides whether
       somebody can open a group room, edit the questions the whole group sees
       and take down what other people wrote there, so an admin grants it from
       Manage users and this side only ever reads it. Same one way rule as
       role below, cleared on sign out for the same reason. */
    canHost: false,
    /* member or admin, mirrored from profiles.role by js/auth.js on every
       sign in and session refresh. Read only on this side: nothing in the app
       writes it, the database refuses the write anyway (migration 0025), and
       it is cleared on sign out. It decides two things: whether Your account
       draws the Admin row, and, with the column above, whether this phone is
       in Leader mode. See isLeader(). */
    role: 'member',
    // Face ID in front of the Journal. Off by default, and only offered on a
    // phone that can actually do it. See js/native.js and js/journal.js.
    lockJournal: false
  };

  var state = {
    profile: Object.assign({}, DEFAULT_PROFILE, storage.get('profile', {})),
    // Per guide: { checked: { "0-1": true }, journal: { "3": "text" } }
    guideState: storage.get('guideState', {}),
    dismissed: storage.get('dismissed', {}),
    dismissedPins: storage.get('dismissedPins', {}),
    roster: storage.get('roster', null),
    prayers: storage.get('prayers', []),
    /* One phone's own reminders about what is on the church calendar, and the
       whole of what the app knows about them, keyed by event id:

         { at: <epoch ms>, id: <notification id>, offset: <ms before it> }

       `at` is what was scheduled and `offset` is why, which is what lets a
       reminder follow an event the church moves. See sweep() in
       js/reminders.js. Nothing here is ever sent anywhere; the long note
       above canRemind() in js/native.js is why that is the design rather than
       a version one shortcut. */
    reminders: storage.get('reminders', {})
  };

  /* Notifications is nested, so a shallow merge can leave it undefined on an
     older stored profile. Backfill it rather than guarding at every read.

     `announcements` is newer than the other three and cannot simply take the
     default, which is the interesting case. A phone that already has the app
     has a stored notifications object with three keys in it and no fourth,
     and merging the default over it would turn a switch ON for somebody who
     had deliberately turned every notification OFF. That is the one outcome
     a notification setting must never produce, so the new switch inherits
     whether this phone wanted to hear anything at all, and only a genuinely
     fresh profile gets the default. */
  var storedNotifications = state.profile.notifications || null;

  state.profile.notifications = Object.assign(
    {}, DEFAULT_PROFILE.notifications, storedNotifications || {}
  );

  function wantedAnything(stored) {
    return !!(stored.newGuide || stored.sundayReminder ||
              stored.groupWeek || stored.announcements);
  }

  if (storedNotifications && storedNotifications.announcements === undefined) {
    state.profile.notifications.announcements = !!(
      storedNotifications.newGuide ||
      storedNotifications.sundayReminder ||
      storedNotifications.groupWeek
    );
    storage.set('profile', state.profile);
  }

  /* The two admin switches, added in 0043, inherit the same way and for the
     same reason. Being an admin is not a reason to overrule somebody who
     turned every notification off: a person who did that and is then made an
     admin should find two switches waiting, not two notifications arriving.
     A fresh profile still gets the default, which is on. */
  if (storedNotifications && storedNotifications.announcementReview === undefined) {
    var inherited = wantedAnything(storedNotifications);
    state.profile.notifications.announcementReview = inherited;
    state.profile.notifications.eventReview = inherited;
    storage.set('profile', state.profile);
  }

  // v1 shipped with a single free-text `name` field. Split it once into
  // firstName/lastName so anyone with the old app already installed does not
  // lose what they typed in.
  if (state.profile.name && !state.profile.firstName) {
    var parts = state.profile.name.trim().split(/\s+/);
    state.profile.firstName = parts[0] || '';
    state.profile.lastName = parts.slice(1).join(' ');
    delete state.profile.name;
    storage.set('profile', state.profile);
  }

  /* Leader mode was a switch until migration 0036, so a phone that has had
     this app for a while has `leaderMode: true` sitting in its stored profile
     with nothing left that reads it. Taken out once, rather than left to look
     like state the app is still keeping: what decides Leader mode now is the
     profiles row, and the phone should not be holding a second answer to the
     same question. Anybody who was using it and leads a group gets it back
     from an admin, in two taps, and it follows their account rather than
     their handset from then on. */
  if ('leaderMode' in state.profile) {
    delete state.profile.leaderMode;
    storage.set('profile', state.profile);
  }

  /* -------------------------------------------------------------- profile */

  function getProfile() {
    return state.profile;
  }

  /* Is this phone in Leader mode? The one question the guide reader, the More
     sheet, Your account and the Group tab all ask, so that they cannot answer
     it differently from one another.

     Leaders, and admins whether or not anybody marked them one. That second
     half is migration 0036's: an admin can grant themselves the column from
     Manage users in two taps, so making them do it first would be ceremony,
     and the church's own account being unable to open a room on a Thursday
     night is a worse failure than the one it would prevent.

     Presentation only, like isAdmin() in js/admin.js. hc_room_open asks
     hc_is_leader() before it opens anything, so the worst a tampered phone
     gets is a roster nobody else can see and a button that comes back
     refused. */
  function isLeader() {
    var p = state.profile;
    return !!p.canHost || p.role === 'admin';
  }

  function updateProfile(patch) {
    state.profile = Object.assign({}, state.profile, patch);
    storage.set('profile', state.profile);
    emit('profile', state.profile);
    return state.profile;
  }

  function firstName() {
    return (state.profile.firstName || '').trim();
  }

  /* ---------------------------------------------------------- guide state */

  function guideBucket(guideId) {
    if (!state.guideState[guideId]) {
      state.guideState[guideId] = { checked: {}, journal: {} };
    }
    var bucket = state.guideState[guideId];
    if (!bucket.checked) bucket.checked = {};
    if (!bucket.journal) bucket.journal = {};
    return bucket;
  }

  function persistGuides() {
    storage.set('guideState', state.guideState);
  }

  function isChecked(guideId, key) {
    return guideBucket(guideId).checked[key] === true;
  }

  function toggleChecked(guideId, key) {
    var bucket = guideBucket(guideId);
    if (bucket.checked[key]) {
      delete bucket.checked[key];
    } else {
      bucket.checked[key] = true;
    }
    persistGuides();
    emit('guide:' + guideId, bucket);
    return bucket.checked[key] === true;
  }

  function checkedCount(guideId) {
    return Object.keys(guideBucket(guideId).checked).length;
  }

  function clearChecked(guideId) {
    guideBucket(guideId).checked = {};
    persistGuides();
    emit('guide:' + guideId, state.guideState[guideId]);
  }

  function getJournal(guideId, key) {
    return guideBucket(guideId).journal[key] || '';
  }

  function setJournal(guideId, key, text) {
    var bucket = guideBucket(guideId);
    if (text && text.trim()) {
      bucket.journal[key] = text;
    } else {
      delete bucket.journal[key];
    }
    persistGuides();
  }

  function journalCount(guideId) {
    return Object.keys(guideBucket(guideId).journal).length;
  }

  /* ------------------------------------------------------------ dismissed */

  function isDismissed(id) {
    return state.dismissed[id] === true;
  }

  function dismiss(id) {
    state.dismissed[id] = true;
    storage.set('dismissed', state.dismissed);
    emit('dismissed', state.dismissed);
  }

  /* The pinned strip across the top of every tab is dismissed separately from
     the announcement card it points at, and both are keyed on the same
     permanent announcement id.

     Two maps rather than one, because they are two answers to two different
     questions. Putting the card away on Home means "I have read this"; taking
     the strip down means "stop following me between tabs about it". Somebody
     who dismisses the strip should still find the announcement where the
     church put it, and somebody who has read the card should not have the
     strip vanish out from under the tap they were about to make. Sharing one
     map would make each of those dismiss the other.

     Undismissing exists for exactly one caller: tapping the strip. It takes
     you to the card, and a tap that navigates to a card this phone has
     already put away would arrive at a screen with nothing on it. See
     'open-pinned' in js/app.js. */
  function isPinDismissed(id) {
    return state.dismissedPins[id] === true;
  }

  function dismissPin(id) {
    state.dismissedPins[id] = true;
    storage.set('dismissedPins', state.dismissedPins);
    emit('dismissed', state.dismissed);
  }

  function undismiss(id) {
    if (!state.dismissed[id]) return;
    delete state.dismissed[id];
    storage.set('dismissed', state.dismissed);
    emit('dismissed', state.dismissed);
  }

  /* --------------------------------------------------------------- leader */

  // Roster and prayer capture are local only in v1. Real data lands here later.
  function getRoster() {
    if (state.roster === null) {
      state.roster = [
        { id: 'm1', name: 'Anna', present: false, note: '' },
        { id: 'm2', name: 'Marcus', present: false, note: '' },
        { id: 'm3', name: 'Dee', present: false, note: '' },
        { id: 'm4', name: 'Jasmine', present: false, note: '' },
        { id: 'm5', name: 'Paul', present: false, note: '' },
        { id: 'm6', name: 'Renee', present: false, note: '' }
      ];
      storage.set('roster', state.roster);
    }
    return state.roster;
  }

  function updateMember(id, patch) {
    var roster = getRoster();
    state.roster = roster.map(function (m) {
      return m.id === id ? Object.assign({}, m, patch) : m;
    });
    storage.set('roster', state.roster);
    emit('roster', state.roster);
    return state.roster;
  }

  function addMember(name) {
    var roster = getRoster();
    var member = { id: 'm' + Date.now(), name: name, present: false, note: '' };
    state.roster = roster.concat([member]);
    storage.set('roster', state.roster);
    emit('roster', state.roster);
    return member;
  }

  function removeMember(id) {
    state.roster = getRoster().filter(function (m) { return m.id !== id; });
    storage.set('roster', state.roster);
    emit('roster', state.roster);
  }

  function getPrayers() {
    return state.prayers;
  }

  function addPrayer(who, text) {
    var entry = {
      id: 'p' + Date.now(),
      who: who || 'Someone in the room',
      text: text,
      savedOn: new Date().toISOString()
    };
    state.prayers = [entry].concat(state.prayers);
    storage.set('prayers', state.prayers);
    emit('prayers', state.prayers);
    return entry;
  }

  function removePrayer(id) {
    state.prayers = state.prayers.filter(function (p) { return p.id !== id; });
    storage.set('prayers', state.prayers);
    emit('prayers', state.prayers);
  }

  /* ------------------------------------------------------------ erasing
     Everything this app knows about a person is on their own phone, so
     deleting it is a local operation and not a request to a server. The
     privacy policy points at this, and the Data screen runs it.

     Every hc: key goes, including the content cache. That cache holds
     sermons and guides rather than anything personal, so it could have been
     spared, but "we deleted everything except one thing" is a worse promise
     to make than a few seconds of refetching costs. The app refills it on
     the next launch.
     ------------------------------------------------------------------- */

  function eraseEverything() {
    var ok = true;

    // Collect first, then remove. Mutating localStorage while iterating its
    // own index is how you skip half the keys.
    var keys = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) keys.push(k);
      }
      keys.forEach(function (k) { window.localStorage.removeItem(k); });
    } catch (err) {
      ok = false;   // private mode, or storage is gone. Memory reset still runs.
    }

    // The in memory copy has to go too, or the current session keeps rendering
    // a profile and a roster that no longer exist on disk.
    state.profile = Object.assign({}, DEFAULT_PROFILE);
    state.guideState = {};
    state.dismissed = {};
    state.dismissedPins = {};
    state.roster = [];      // [] not null, so getRoster does not reseed the sample names
    state.prayers = [];
    /* The record goes, and so must the notifications it stands for: iOS holds
       those itself and would keep tapping somebody on the shoulder about a
       church calendar they have just erased. js/reminders.js listens for the
       'erased' event below and cancels them. */
    state.reminders = {};

    emit('profile', state.profile);
    emit('roster', state.roster);
    emit('prayers', state.prayers);
    emit('erased', { ok: ok });

    return ok;
  }

  /* ------------------------------------------------------------ reminders

     A thin map, kept here rather than in js/reminders.js for the same reason
     every other preference is: this file is the one place that knows how to
     write to a localStorage that might throw. What a reminder means, when it
     is due and how it reaches a lock screen are all somebody else's business.
     ------------------------------------------------------------------- */

  function getReminders() {
    return state.reminders || (state.reminders = {});
  }

  function getReminder(eventId) {
    if (!eventId) return null;
    return getReminders()[eventId] || null;
  }

  function setReminder(eventId, record) {
    if (!eventId) return;
    getReminders()[eventId] = record;
    storage.set('reminders', state.reminders);
    emit('reminders', state.reminders);
  }

  function clearReminder(eventId) {
    if (!eventId) return;
    delete getReminders()[eventId];
    storage.set('reminders', state.reminders);
    emit('reminders', state.reminders);
  }

  /* ------------------------------------------------ theme and text size */

  /* The iOS text size, read rather than obeyed.

     css/base.css used to let -webkit-text-size-adjust go to auto so that
     WKWebView would scale the app with the phone's accessibility text size.
     It did that, and it also switched on WebKit's text autosizing, which
     boosts type by the ratio of the viewport width to the layout width.
     Landscape made every word in the app bigger and portrait did not give it
     back, because WebKit does not recompute the boost on the way down. The
     property is pinned now, and the part that was actually wanted is done
     here.

     A hidden probe wearing -apple-system-body is the one thing WKWebView
     still sizes from the content size category: 17px at the default Large,
     23px at the largest of the ordinary sizes, 53px at the largest
     accessibility one. The ratio multiplies the person's own choice from
     Profile rather than competing with it, which is what auto was for.

     Bounded at both ends, because this multiplies a scale that already goes
     to 1.4. It never shrinks: Profile's smallest step is the smallest this
     design reads well at, and somebody who set iOS smaller did not ask this
     app to be tighter than it was drawn. It never grows past SYSTEM_MAX
     either, because 3.1 times Largest is a screen with four words on it, and
     a phone that needs more than this has system zoom for it.

     Measured through the DOM rather than kept, because the answer changes in
     Settings while the app is in the background. js/app.js re-asks on the
     way back in. */
  var SYSTEM_BODY = 17;     // -apple-system-body at the default Large
  var SYSTEM_MAX = 1.35;
  var systemScale = null;   // measured on first use, then cached

  function measureSystemScale() {
    if (typeof document === 'undefined' || !document.createElement) return 1;

    var probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.font = '-apple-system-body';

    /* A browser that has never heard of the keyword drops the declaration,
       which is the honest way to ask whether this is WebKit at all. */
    var known = (window.CSS && window.CSS.supports &&
                 window.CSS.supports('font', '-apple-system-body')) ||
                !!probe.style.font;
    if (!known) return 1;

    var host = document.body || document.documentElement;
    if (!host || !host.appendChild) return 1;

    host.appendChild(probe);
    var px = parseFloat(window.getComputedStyle(probe).fontSize);
    host.removeChild(probe);

    if (!px) return 1;   // 0, or the NaN a browser without a real font gives
    var scale = px / SYSTEM_BODY;
    if (scale < 1) return 1;
    if (scale > SYSTEM_MAX) return SYSTEM_MAX;
    return Math.round(scale * 1000) / 1000;
  }

  function systemTextScale() {
    if (systemScale === null) systemScale = measureSystemScale();
    return systemScale;
  }

  /* Somebody changed the setting in Settings and came back. Returns whether
     anything moved, so the caller can leave the common case alone. */
  function refreshSystemTextScale() {
    var next = measureSystemScale();
    if (next === systemScale) return false;
    systemScale = next;
    applyPreferences();
    return true;
  }

  function applyPreferences() {
    var root = document.documentElement;
    var theme = state.profile.theme;

    if (theme === 'system') {
      var prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }

    /* The choice made on Profile, times the one already made in Settings. */
    var scale = (state.profile.textScale || 1) * systemTextScale();
    root.style.setProperty('--hc-text-scale', String(Math.round(scale * 1000) / 1000));

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var dark = root.getAttribute('data-theme') === 'dark';
      meta.setAttribute('content', dark ? '#1A1918' : '#F7F4EF');
    }
  }

  HC.store = {
    storage: storage,
    on: on,
    emit: emit,

    getProfile: getProfile,
    updateProfile: updateProfile,
    firstName: firstName,
    isLeader: isLeader,

    isChecked: isChecked,
    toggleChecked: toggleChecked,
    checkedCount: checkedCount,
    clearChecked: clearChecked,
    getJournal: getJournal,
    setJournal: setJournal,
    journalCount: journalCount,

    isDismissed: isDismissed,
    dismiss: dismiss,
    undismiss: undismiss,
    isPinDismissed: isPinDismissed,
    dismissPin: dismissPin,

    getRoster: getRoster,
    updateMember: updateMember,
    addMember: addMember,
    removeMember: removeMember,
    getPrayers: getPrayers,
    addPrayer: addPrayer,
    removePrayer: removePrayer,

    getReminders: getReminders,
    getReminder: getReminder,
    setReminder: setReminder,
    clearReminder: clearReminder,

    eraseEverything: eraseEverything,

    applyPreferences: applyPreferences,
    systemTextScale: systemTextScale,
    refreshSystemTextScale: refreshSystemTextScale
  };

})(window.HC = window.HC || {});
