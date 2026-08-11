/* ==========================================================================
   Home Church, app
   Boot, route table, and one delegated listener per event type. Screens render
   HTML strings, this file turns taps into state changes and navigation.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var TAB_META = [
    { name: 'home',    label: 'Home',    icon: 'home' },
    { name: 'listen',  label: 'Listen',  icon: 'listen' },
    { name: 'guide',   label: 'Guide',   icon: 'guide' },
    { name: 'connect', label: 'Connect', icon: 'connect' },
    { name: 'give',    label: 'Give',    icon: 'give' }
  ];

  var TITLES = {
    home: 'Home',
    listen: 'Listen',
    guide: 'Guides',
    connect: 'Connect',
    give: 'Give',
    profile: 'Your account',
    leader: 'Leader mode',
    'guide-reader': 'Guide',
    present: 'Presenting',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    data: 'Your data'
  };

  var mount, scroller, topbar, tabbar;

  /* ------------------------------------------------------------- the shell */

  function renderShell() {
    var app = document.getElementById('app');

    app.innerHTML = '' +
      '<header class="hc-topbar" id="hc-topbar" data-scrolled="false">' +
        '<button type="button" class="hc-topbar__back" data-action="back" aria-label="Back" hidden>' +
          c.icon('chevronLeft') +
        '</button>' +
        '<span class="hc-topbar__center">' +
          '<img class="hc-topbar__logo hc-topbar__logo--light" src="assets/img/logo-lockup-ink.png" alt="Home Church">' +
          '<img class="hc-topbar__logo hc-topbar__logo--dark" src="assets/img/logo-lockup.png" alt="Home Church">' +
          '<span class="hc-topbar__title" id="hc-topbar-title"></span>' +
        '</span>' +
        '<button type="button" class="hc-avatar" data-action="go-profile" aria-label="Your account">' +
          '<span class="hc-avatar__disc" id="hc-avatar-disc" aria-hidden="true"></span>' +
        '</button>' +
      '</header>' +

      '<main class="hc-scroll" id="hc-scroll">' +
        '<div id="hc-view"></div>' +
      '</main>' +

      '<nav class="hc-tabbar" id="hc-tabbar" aria-label="Sections">' +
        TAB_META.map(function (t) {
          return '<button type="button" class="hc-tab" data-action="tab" data-tab="' + t.name + '">' +
            c.icon(t.icon, 'hc-tab__icon') +
            '<span class="hc-tab__label">' + t.label + '</span>' +
          '</button>';
        }).join('') +
      '</nav>' +

      '<div class="hc-toast" id="hc-toast" role="status" aria-live="polite" data-visible="false"></div>';

    mount = document.getElementById('hc-view');
    scroller = document.getElementById('hc-scroll');
    topbar = document.getElementById('hc-topbar');
    tabbar = document.getElementById('hc-tabbar');
  }

  function initials() {
    var p = HC.store.getProfile();
    var first = (p.firstName || '').trim();
    var last = (p.lastName || '').trim();
    if (!first && !last) return '';
    return ((first ? first[0] : '') + (last ? last[0] : '')).toUpperCase();
  }

  function paintAvatar() {
    var disc = document.getElementById('hc-avatar-disc');
    if (!disc) return;
    var text = initials();
    if (text) {
      disc.textContent = text;
      disc.innerHTML = c.esc(text);
    } else {
      disc.innerHTML = c.icon('home', 'hc-avatar__icon');
    }
  }

  /* ---------------------------------------------------- view change plumbing */

  HC.emitViewChange = function (route) {
    var app = document.getElementById('app');
    app.setAttribute('data-view', route.name);

    // Presentation mode takes the whole screen. Nothing else competes with it.
    var chromeless = route.name === 'present';
    topbar.hidden = chromeless;
    tabbar.hidden = chromeless;

    var title = document.getElementById('hc-topbar-title');
    var back = topbar.querySelector('.hc-topbar__back');
    var isTab = HC.router.isTab(route.name);

    back.hidden = isTab;
    title.textContent = TITLES[route.name] || '';

    // The logo only ever appears on a tab, sliding to center once scrolled.
    // A pushed view has no room for it, back arrow and title fill that slot.
    topbar.setAttribute('data-is-tab', isTab ? 'true' : 'false');

    // The bar starts bare on a tab, and carries the title straight away on a
    // pushed view where the back arrow needs company.
    topbar.setAttribute('data-scrolled', isTab ? 'false' : 'true');

    TAB_META.forEach(function (t, i) {
      var btn = tabbar.children[i];
      if (t.name === route.name) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    paintAvatar();
  };

  function watchScroll() {
    var ticking = false;
    scroller.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        var route = HC.router.current();
        if (!route || !HC.router.isTab(route.name)) return;
        topbar.setAttribute('data-scrolled', scroller.scrollTop > 24 ? 'true' : 'false');
      });
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- sharing */

  function share(text, title) {
    if (navigator.share) {
      navigator.share({ text: text, title: title || 'Home Church' }).catch(function () { /* dismissed */ });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        c.toast('Copied. Go put it somewhere good.');
      }, function () {
        c.toast('Your browser would not let us copy that one.');
      });
      return;
    }
    c.toast('Sharing needs a newer browser, sorry.');
  }

  /* ------------------------------------------------------------- guide bits */

  function guideIdFrom(el) {
    var scope = el.closest('[data-guide]');
    return scope ? scope.getAttribute('data-guide') : null;
  }

  function repaintCoverage(guideId) {
    var box = document.querySelector('[data-coverage]');
    if (!box) return;
    var guide = HC.data.getGuide(guideId);
    if (!guide) return;
    var total = 0;
    guide.groupSections.forEach(function (s) { total += s.questions.length; });
    var covered = HC.store.checkedCount(guideId);
    box.innerHTML =
      '<p class="hc-caption">' + c.esc(HC.screens.guideHelpers.coverageText(covered, total)) + '</p>' +
      (covered ? '<button type="button" class="hc-btn hc-btn--tertiary" data-action="clear-checks">Start over</button>' : '');
  }

  /* ---------------------------------------------------------------- actions */

  var actions = {
    tab: function (el) {
      HC.router.go({ name: el.getAttribute('data-tab') });
    },

    back: function () {
      HC.router.back();
    },

    'go-profile': function () {
      HC.router.go({ name: 'profile' });
    },

    'go-guide': function () {
      HC.router.go({ name: 'guide' });
    },

    'go-leader': function () {
      HC.router.go({ name: 'leader' });
    },

    'open-guide': function (el) {
      HC.router.go({ name: 'guide-reader', id: el.getAttribute('data-id') });
    },

    'download-guide': function (el) {
      HC.print.guide(el.getAttribute('data-id'));
    },

    'open-url': function (el) {
      c.openExternal(el.getAttribute('data-url'));
    },

    'go-legal': function (el) {
      HC.screens.legalHelpers.setConfirming(false);
      HC.router.go({ name: el.getAttribute('data-id') });
    },

    /* ------------------------------------------------------------- erasing
       Two taps, and the second one is the one that means it. The screen
       repaints between them rather than throwing a system dialog, so the
       consequence is on screen in the app's own voice while somebody decides.
       ---------------------------------------------------------------------- */

    'erase-ask': function () {
      HC.screens.legalHelpers.setConfirming(true);
      HC.router.go({ name: 'data' }, { force: true });
    },

    'erase-cancel': function () {
      HC.screens.legalHelpers.setConfirming(false);
      HC.router.go({ name: 'data' }, { force: true });
    },

    'erase-confirm': function () {
      var ok = HC.store.eraseEverything();
      HC.screens.legalHelpers.setConfirming(false);
      HC.store.applyPreferences();   // theme and text size went back to default
      paintAvatar();
      HC.router.go({ name: 'home' });
      c.toast(ok
        ? 'Erased. This phone is back to a fresh start.'
        : 'Cleared what we could reach. Your browser is not letting the app store anything right now.');
    },

    'open-scripture': function (el) {
      c.openExternal(c.bibleUrl(el.getAttribute('data-reference')));
    },

    share: function (el) {
      share(el.getAttribute('data-share-text'), el.getAttribute('data-share-title'));
    },

    'toggle-section': function (el) {
      var open = el.getAttribute('aria-expanded') === 'true';
      el.setAttribute('aria-expanded', open ? 'false' : 'true');
      var panel = document.getElementById('panel-' + el.getAttribute('data-section-id'));
      if (panel) panel.setAttribute('data-open', open ? 'false' : 'true');
    },

    'toggle-check': function (el) {
      var guideId = guideIdFrom(el);
      if (!guideId) return;
      var on = HC.store.toggleChecked(guideId, el.getAttribute('data-check-key'));
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      repaintCoverage(guideId);
    },

    'clear-checks': function (el) {
      var guideId = guideIdFrom(el);
      if (!guideId) return;
      HC.store.clearChecked(guideId);
      Array.prototype.forEach.call(
        document.querySelectorAll('[data-action="toggle-check"]'),
        function (btn) { btn.setAttribute('aria-pressed', 'false'); }
      );
      repaintCoverage(guideId);
      c.toast('Cleared. Fresh start.');
    },

    'dismiss-banner': function (el) {
      var id = el.getAttribute('data-id');
      HC.store.dismiss(id);
      var banner = document.querySelector('[data-banner="' + id + '"]');
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    },

    // Archive rows open in place, so you can read the episode notes without
    // leaving for Spotify and losing your spot in the list.
    'toggle-episode': function (el) {
      var open = el.getAttribute('aria-expanded') === 'true';
      el.setAttribute('aria-expanded', open ? 'false' : 'true');
      var panel = document.getElementById(el.getAttribute('aria-controls'));
      if (panel) panel.setAttribute('data-open', open ? 'false' : 'true');
    },

    filter: function (el) {
      var name = el.getAttribute('data-filter');
      var value = el.getAttribute('data-value');
      HC.screens.connectHelpers.setFilter(name, value);
      Array.prototype.forEach.call(
        el.parentNode.querySelectorAll('[data-action="filter"]'),
        function (pill) {
          pill.setAttribute('aria-pressed', pill === el ? 'true' : 'false');
        }
      );
      HC.screens.connectHelpers.repaintGroups(mount);
    },

    /* join-group, serve, and submit-step used to live here. All three showed a
       warm toast and did nothing: no name was captured, nobody was told, and
       submit-step called form.reset() on what the person had typed. Connect
       now sends people to the systems the church actually runs, so there is
       nothing left for them to do. Do not add them back without a destination.
       ---------------------------------------------------------------------- */

    /* ---------------------------------------------------------- leader mode */

    present: function (el) {
      HC.router.go({ name: 'present', id: el.getAttribute('data-id'), index: 0 });
    },

    'present-prev': function (el) {
      var wrap = el.closest('.hc-present');
      var i = parseInt(wrap.getAttribute('data-index'), 10) || 0;
      if (i <= 0) return;
      HC.router.go({ name: 'present', id: wrap.getAttribute('data-guide'), index: i - 1 }, { force: true });
    },

    'present-next': function (el) {
      var wrap = el.closest('.hc-present');
      var i = parseInt(wrap.getAttribute('data-index'), 10) || 0;
      var guide = HC.data.getGuide(wrap.getAttribute('data-guide'));
      var total = HC.screens.guideHelpers.flatQuestions(guide).length;
      if (i >= total - 1) return;
      HC.router.go({ name: 'present', id: wrap.getAttribute('data-guide'), index: i + 1 }, { force: true });
    },

    'exit-present': function (el) {
      HC.router.go({ name: 'guide-reader', id: el.getAttribute('data-id') });
    },

    'toggle-present': function (el) {
      var id = el.getAttribute('data-id');
      var on = el.getAttribute('aria-pressed') !== 'true';
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      HC.store.updateMember(id, { present: on });
    },

    'add-member': function (el) {
      var form = el.closest('form');
      var input = form.querySelector('input[name="member"]');
      var name = (input.value || '').trim();
      if (!name) {
        c.toast('Give us a name first.');
        input.focus();
        return;
      }
      HC.store.addMember(name);
      input.value = '';
      HC.router.go({ name: 'leader' }, { force: true });
      c.toast(name + ' is on the list.');
    },

    'remove-member': function (el) {
      HC.store.removeMember(el.getAttribute('data-id'));
      HC.router.go({ name: 'leader' }, { force: true });
    },

    'add-prayer': function (el) {
      var form = el.closest('form');
      var who = form.querySelector('input[name="who"]');
      var text = form.querySelector('textarea[name="text"]');
      var body = (text.value || '').trim();
      if (!body) {
        c.toast('Write the request first.');
        text.focus();
        return;
      }
      HC.store.addPrayer((who.value || '').trim(), body);
      who.value = '';
      text.value = '';
      HC.router.go({ name: 'leader' }, { force: true });
      c.toast('Saved. Come back to it during the week.');
    },

    'remove-prayer': function (el) {
      HC.store.removePrayer(el.getAttribute('data-id'));
      HC.router.go({ name: 'leader' }, { force: true });
    },

    /* -------------------------------------------------------------- profile */

    'toggle-notify': function (el) {
      var key = el.getAttribute('data-id');
      var profile = HC.store.getProfile();
      var next = Object.assign({}, profile.notifications);
      next[key] = !next[key];
      HC.store.updateProfile({ notifications: next });
      setSwitch(el, next[key]);
    },

    'toggle-theme': function (el) {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      HC.store.updateProfile({ theme: dark ? 'light' : 'dark' });
      HC.store.applyPreferences();
      setSwitch(el, !dark);
    },

    'toggle-leader': function (el) {
      var on = !HC.store.getProfile().leaderMode;
      HC.store.updateProfile({ leaderMode: on });
      setSwitch(el, on);
      HC.router.go({ name: 'profile' }, { force: true });
      c.toast(on ? 'Leader tools are on. Look for them in every guide.' : 'Leader tools are off.');
    },

    'text-size': function (el) {
      var value = parseFloat(el.getAttribute('data-value'));
      HC.store.updateProfile({ textScale: value });
      HC.store.applyPreferences();
      Array.prototype.forEach.call(
        el.parentNode.querySelectorAll('[data-action="text-size"]'),
        function (pill) { pill.setAttribute('aria-pressed', pill === el ? 'true' : 'false'); }
      );
    },

    /* -------------------------------------------------------- sign in */

    'auth-request': function (el) {
      var form = el.closest('form');
      var input = form.querySelector('input[name="identifier"]');
      var value = (input.value || '').trim();
      if (!HC.auth.classify(value)) {
        c.toast('That does not look like an email or a phone number.');
        input.focus();
        return;
      }
      el.setAttribute('disabled', 'true');
      HC.auth.requestCode(value).then(function (id) {
        HC.screens.profileHelpers.setAuthIdentifier(id.value);
        HC.screens.profileHelpers.setAuthStep('sent');
        HC.router.go({ name: 'profile' }, { force: true });
        c.toast(id.channel === 'email' ? 'Code sent. Check your email.' : 'Code sent. Check your texts.');
      }).catch(function (err) {
        el.removeAttribute('disabled');
        c.toast(err.message);
      });
    },

    'auth-verify': function (el) {
      var form = el.closest('form');
      var code = form.querySelector('input[name="code"]').value;
      var identifier = HC.screens.profileHelpers.getAuthIdentifier();
      el.setAttribute('disabled', 'true');
      HC.auth.verifyCode(identifier, code).then(function () {
        HC.screens.profileHelpers.resetAuth();
        HC.router.go({ name: 'profile' }, { force: true });
        c.toast('You are signed in.');
      }).catch(function (err) {
        el.removeAttribute('disabled');
        c.toast(err.message);
      });
    },

    'auth-restart': function () {
      HC.screens.profileHelpers.resetAuth();
      HC.router.go({ name: 'profile' }, { force: true });
    },

    'sign-out': function () {
      HC.auth.signOut().then(function () {
        HC.router.go({ name: 'profile' }, { force: true });
        c.toast('Signed out. Everything on this screen still works.');
      });
    }
  };

  function setSwitch(el, on) {
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    var knob = el.querySelector('.hc-switch');
    if (knob) knob.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  /* -------------------------------------------------------------- listeners */

  function wireEvents() {
    document.addEventListener('click', function (evt) {
      var el = evt.target.closest('[data-action]');
      if (!el) return;
      var name = el.getAttribute('data-action');
      var fn = actions[name];
      if (!fn) return;
      evt.preventDefault();
      fn(el, evt);
    });

    // Anything typed is saved quietly, a moment after the typing stops.
    var timers = {};
    function debounce(id, fn) {
      window.clearTimeout(timers[id]);
      timers[id] = window.setTimeout(fn, 400);
    }

    document.addEventListener('input', function (evt) {
      var el = evt.target;

      var journalKey = el.getAttribute && el.getAttribute('data-journal-key');
      if (journalKey !== null && journalKey !== undefined) {
        var guideId = guideIdFrom(el);
        if (!guideId) return;
        debounce('journal-' + journalKey, function () {
          HC.store.setJournal(guideId, journalKey, el.value);
          var status = document.querySelector('[data-journal-status="' + journalKey + '"]');
          if (status) {
            status.textContent = el.value.trim() ? 'Saved on this phone' : '';
            status.setAttribute('data-visible', el.value.trim() ? 'true' : 'false');
          }
        });
        return;
      }

      var profileField = el.getAttribute && el.getAttribute('data-profile-field');
      if (profileField) {
        // Keyed per field, not shared, so editing first name and then last
        // name inside the same 400ms does not cancel the first save.
        debounce('profile-' + profileField, function () {
          var patch = {};
          patch[profileField] = el.value;
          HC.auth.saveProfile(patch);
          paintAvatar();
        });
        return;
      }

      var memberId = el.getAttribute && el.getAttribute('data-member-note');
      if (memberId) {
        debounce('member-' + memberId, function () {
          HC.store.updateMember(memberId, { note: el.value });
        });
      }
    });

    // Forms are inert in v1. Stop the browser from navigating away.
    document.addEventListener('submit', function (evt) {
      evt.preventDefault();
    });

    // Follow the system theme while the user has not chosen one.
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (HC.store.getProfile().theme === 'system') HC.store.applyPreferences();
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ------------------------------------------------------------------- boot */

  function boot() {
    HC.store.applyPreferences();

    // Last known good content, straight off the device, before anything is
    // drawn. Synchronous on purpose: it is a single localStorage read, and
    // doing it here means a returning phone opens to this week's guide
    // instead of whatever was frozen into the binary at build time. A first
    // install has no cache and falls through to js/data.js, which is why
    // that file still ships.
    HC.content.primeFromCache();

    renderShell();
    wireEvents();
    watchScroll();

    HC.router.start({
      mount: mount,
      scroll: scroller,
      routes: {
        home: HC.screens.home,
        listen: HC.screens.listen,
        guide: HC.screens.guide,
        connect: HC.screens.connect,
        give: HC.screens.give,
        profile: HC.screens.profile,
        leader: HC.screens.leader,
        'guide-reader': HC.screens.guideReader,
        present: HC.screens.present,
        privacy: HC.screens.privacy,
        terms: HC.screens.terms,
        data: HC.screens.data
      }
    });

    // Session restore is async and best effort. If it lands while Profile
    // is on screen, repaint it so the signed-in state catches up.
    HC.store.on('auth', function () {
      paintAvatar();
      var route = HC.router.current();
      if (route && route.name === 'profile') HC.router.go({ name: 'profile' }, { force: true });
    });

    // A content check finishing changes the line at the bottom of Profile even
    // when the content itself did not change, so repaint it the same way.
    HC.store.on('content', function () {
      var route = HC.router.current();
      if (route && route.name === 'profile') {
        HC.router.go({ name: 'profile', restore: true }, { force: true });
      }
    });
    HC.auth.init();

    // Then go and get the current content, after the first paint so nothing
    // waits on the network. If it lands and something actually changed, the
    // current screen redraws in place with the scroll position kept. If the
    // phone is offline, or the project is unreachable, this quietly does
    // nothing and the app carries on with what it already had.
    HC.content.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.HC = window.HC || {});
