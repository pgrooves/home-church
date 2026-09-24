/* ==========================================================================
   Home Church, Maintenance mode

   One switch in Admin -> App settings, `maintenance_mode_on`, and when it is
   on every phone that is not an admin's is covered by the screen the app opens
   on: the gold house on the paper, and "We'll be back soon." where the welcome
   would be. Members, leaders, and phones nobody has signed in on all get it.
   Admins get the app, because they are the ones fixing whatever it was.

   IT DOES NOT FADE AND IT DOES NOT TIME OUT, which is the difference between
   this and js/splash.js, whose markup and styles it borrows. The splash has a
   ceiling because it must never be what keeps somebody out of the app. This
   is exactly that, on purpose, and it leaves when an admin says so and at no
   other moment.

   HOW IT HEARS. The switch is an ordinary app_settings row and arrives with
   every content refresh, which is all a cold start needs. An open phone does
   not refresh on its own, though, and a cover that only arrived on the next
   launch would be no use on the afternoon it was thrown. So this asks for the
   one row every minute while the app is on screen, and again the moment it
   comes back to the foreground; when the answer differs from what the phone
   is showing, it asks content.js for a full refresh, which updates the cache
   too, so a phone that was covered stays covered through a cold start with
   no signal.

   THE WAY PAST IT FOR AN ADMIN. An admin whose session has lapsed would be
   locked out of the one screen that turns this off. So the foot of the cover,
   where the splash says Loading, carries a quiet "Admin sign in". Anybody may
   sign in there; only an admin's account lifts the cover, because the cover
   asks the same question the Admin screen does, HC.admin.isAdmin().

   WHAT IT IS NOT. A server lockdown. It is a cover the app draws, and the
   database's own policies are still what guard every write. See migration
   0077.
   ========================================================================== */

(function (HC) {
  'use strict';

  var KEY = 'maintenance_mode_on';
  var POLL_MS = 60 * 1000;

  var el = null;
  var pollTimer = null;
  var started = false;

  /* Strictly true, the same way group_mode_on is read. Off is the answer for
     a phone that has never heard, and anything that is not exactly `true`
     (a text row under the same key, a null) is not somebody asking for the
     whole app to go dark. */
  function on() {
    return !!(HC.data && HC.data.setting && HC.data.setting(KEY, false) === true);
  }

  function isAdmin() {
    return !!(HC.admin && HC.admin.isAdmin && HC.admin.isAdmin());
  }

  function blocked() {
    return on() && !isAdmin();
  }

  /* ------------------------------------------------------------- the cover */

  function build() {
    var root = document.createElement('div');
    root.id = 'hc-maintenance';
    root.className = 'hc-splash hc-maintenance';
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'hc-maintenance-line');

    root.innerHTML = '' +
      '<div class="hc-splash__lockup">' +
        '<div class="hc-splash__markwrap">' +
          '<img class="hc-maintenance__mark" src="assets/icons/mark.png" alt="Home Church">' +
        '</div>' +
        '<p class="hc-splash__greeting hc-maintenance__line" id="hc-maintenance-line">' +
          'We’ll be back soon.</p>' +
      '</div>' +
      '<div class="hc-maintenance__foot">' +
        '<button type="button" class="hc-maintenance__link" data-m="open">Admin sign in</button>' +
        '<div class="hc-maintenance__form" hidden>' +
          '<input class="hc-input hc-maintenance__input" data-m="id" type="email" ' +
            'autocomplete="username" inputmode="email" placeholder="Email" aria-label="Email">' +
          '<input class="hc-input hc-maintenance__input" data-m="secret" type="password" ' +
            'autocomplete="current-password" aria-label="Password" hidden>' +
          '<button type="button" class="hc-btn hc-btn--secondary hc-btn--small" data-m="go">Continue</button>' +
          '<p class="hc-caption hc-maintenance__note" data-m="note" aria-live="polite"></p>' +
        '</div>' +
      '</div>';

    wireForm(root);
    return root;
  }

  /* Everything under the cover is taken out of reach as well as out of
     sight: VoiceOver would otherwise read the app straight through it, and a
     hardware keyboard could tab into it. */
  function setAppInert(value) {
    var app = document.getElementById('app');
    if (!app) return;
    if (value) {
      app.setAttribute('aria-hidden', 'true');
      app.inert = true;
    } else {
      app.removeAttribute('aria-hidden');
      app.inert = false;
    }
  }

  function show() {
    if (el) return;
    el = build();
    document.body.appendChild(el);
    setAppInert(true);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function hide() {
    if (!el) return;
    if (el.parentNode) el.parentNode.removeChild(el);
    el = null;
    setAppInert(false);
  }

  function sync() {
    if (!document.body) return;
    if (blocked()) show();
    else hide();
  }

  /* --------------------------------------------------- the admin's way in

     Three steps in one small form, the same three the Profile screen walks:
     an address, then either the password (for the accounts config.js names)
     or a code sent to it. Nothing here decides who may pass. Signing in lands
     the role on the profile, the 'profile' event fires, and sync() asks
     isAdmin() like it always does. */
  function wireForm(root) {
    var q = function (name) { return root.querySelector('[data-m="' + name + '"]'); };
    var form = root.querySelector('.hc-maintenance__form');
    var idBox = q('id');
    var secretBox = q('secret');
    var go = q('go');
    var note = q('note');
    var stage = 'id';       // id | password | code
    var ident = '';
    var busy = false;

    function say(text) { note.textContent = text || ''; }

    function toStage(next) {
      stage = next;
      if (next === 'id') {
        secretBox.hidden = true;
        idBox.hidden = false;
        go.textContent = 'Continue';
        return;
      }
      idBox.hidden = true;
      secretBox.hidden = false;
      secretBox.value = '';
      if (next === 'password') {
        secretBox.type = 'password';
        secretBox.setAttribute('autocomplete', 'current-password');
        secretBox.setAttribute('aria-label', 'Password');
        secretBox.placeholder = 'Password';
        go.textContent = 'Sign in';
      } else {
        secretBox.type = 'text';
        secretBox.setAttribute('inputmode', 'numeric');
        secretBox.setAttribute('autocomplete', 'one-time-code');
        secretBox.setAttribute('aria-label', 'Code');
        secretBox.placeholder = 'Code';
        go.textContent = 'Sign in';
      }
      secretBox.focus();
    }

    function signedIn() {
      /* The role may land a moment after the session does, on the profile
         sync. sync() runs again when it does; this only covers the case
         where the account simply is not an admin's. */
      setTimeout(function () {
        if (el === root && blocked()) {
          say('That account is not an admin. The app is closed for everybody else for now.');
          toStage('id');
        }
      }, 2500);
    }

    function submit() {
      if (busy || !HC.auth || !HC.auth.isConfigured()) {
        if (!busy) say('Accounts are not set up on this phone.');
        return;
      }
      var p;
      if (stage === 'id') {
        ident = idBox.value.trim();
        if (!ident) { say('Enter your email first.'); return; }
        if (HC.auth.usesPassword(ident)) { say(''); toStage('password'); return; }
        p = HC.auth.requestCode(ident).then(function () {
          say('We sent a code to ' + ident + '.');
          toStage('code');
        });
      } else if (stage === 'password') {
        p = HC.auth.signInWithPassword(ident, secretBox.value).then(signedIn);
      } else {
        p = HC.auth.verifyCode(ident, secretBox.value).then(signedIn);
      }

      busy = true;
      go.disabled = true;
      p.catch(function (err) {
        say((err && err.message) || 'That did not go through. Try again in a moment.');
      }).then(function () {
        busy = false;
        go.disabled = false;
      });
    }

    q('open').addEventListener('click', function (evt) {
      evt.currentTarget.hidden = true;
      form.hidden = false;
      idBox.focus();
    });
    go.addEventListener('click', submit);
    [idBox, secretBox].forEach(function (box) {
      box.addEventListener('keydown', function (evt) {
        if (evt.key === 'Enter') { evt.preventDefault(); submit(); }
      });
    });
  }

  /* ------------------------------------------------------------- listening */

  /* The one row, with the publishable key, the way every other content read
     goes. A failure of any kind is silence: the phone keeps showing whatever
     it last knew, which is the safe answer in both directions. */
  function check() {
    if (!HC.auth || !HC.auth.isConfigured() || !HC.auth.publicGet) return;
    if (document.visibilityState === 'hidden') return;

    HC.auth.publicGet('/app_settings?key=eq.' + KEY + '&select=value_bool')
      .then(function (rows) {
        var live = !!(Array.isArray(rows) && rows[0] && rows[0].value_bool === true);
        if (live !== on() && HC.content && HC.content.refresh) HC.content.refresh();
      })
      .catch(function () {});
  }

  /* Called once from boot(), after the cached content has been applied, so a
     phone that was covered when it closed is covered before Home is drawn. */
  function start() {
    sync();
    if (started) return;
    started = true;

    if (HC.store && HC.store.on) {
      // A refresh landing, somebody signing in or out, a role changing.
      HC.store.on('content', sync);
      HC.store.on('auth', sync);
      HC.store.on('profile', sync);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') check();
    });
    window.addEventListener('online', check);
    pollTimer = setInterval(check, POLL_MS);
  }

  HC.maintenance = {
    KEY: KEY,
    start: start,
    sync: sync,
    check: check,
    isOn: on,
    blocked: blocked,
    showing: function () { return !!el; }
  };

})(window.HC = window.HC || {});
