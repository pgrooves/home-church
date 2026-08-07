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

  var DEFAULT_PROFILE = {
    name: '',
    campus: 'Metairie',
    notifications: {
      newGuide: true,
      sundayReminder: true,
      groupWeek: false
    },
    textScale: 1,
    theme: 'system',   // system | light | dark
    leaderMode: false
  };

  var state = {
    profile: Object.assign({}, DEFAULT_PROFILE, storage.get('profile', {})),
    // Per guide: { checked: { "0-1": true }, journal: { "3": "text" } }
    guideState: storage.get('guideState', {}),
    dismissed: storage.get('dismissed', {}),
    roster: storage.get('roster', null),
    prayers: storage.get('prayers', [])
  };

  // Notifications is nested, so a shallow merge can leave it undefined on an
  // older stored profile. Backfill it rather than guarding at every read.
  state.profile.notifications = Object.assign(
    {}, DEFAULT_PROFILE.notifications, state.profile.notifications || {}
  );

  /* -------------------------------------------------------------- profile */

  function getProfile() {
    return state.profile;
  }

  function updateProfile(patch) {
    state.profile = Object.assign({}, state.profile, patch);
    storage.set('profile', state.profile);
    emit('profile', state.profile);
    return state.profile;
  }

  function firstName() {
    var name = (state.profile.name || '').trim();
    if (!name) return '';
    return name.split(/\s+/)[0];
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

  /* ---------------------------------------------------------------- theme */

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

    root.style.setProperty('--hc-text-scale', String(state.profile.textScale || 1));

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

    isChecked: isChecked,
    toggleChecked: toggleChecked,
    checkedCount: checkedCount,
    clearChecked: clearChecked,
    getJournal: getJournal,
    setJournal: setJournal,
    journalCount: journalCount,

    isDismissed: isDismissed,
    dismiss: dismiss,

    getRoster: getRoster,
    updateMember: updateMember,
    addMember: addMember,
    removeMember: removeMember,
    getPrayers: getPrayers,
    addPrayer: addPrayer,
    removePrayer: removePrayer,

    applyPreferences: applyPreferences
  };

})(window.HC = window.HC || {});
