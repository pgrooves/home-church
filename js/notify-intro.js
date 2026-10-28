/* ==========================================================================
   Home Church, what to hear about

   The one stop between the way in and the Home tab, on the first launch a
   phone gets through the gate: "Stay in the loop.", the notification
   switches from Your account in a card, and Continue.

   IT IS STILL THE SPLASH. Like js/gate.js, this borrows the layer that is
   already on the glass rather than routing to a screen of its own. The house
   and the line under it climb to the top and get smaller, the line changes
   its mind about what it says, and the card comes up underneath. Nothing
   cuts, which is the same promise the gate makes.

   WHEN IT APPEARS. Once per phone, the first time somebody leaves the gate,
   whichever way they left it: signed in (after "You're in!") or as a guest.
   Remembered under `notifyIntroSeen`, so a guest who meets the gate on every
   cold launch meets this only the first time. Every switch on it is also on
   Your account, and the caption under the card says so.

   ONE BUTTON, ON PURPOSE. A screen in front of the iOS permission alert may
   explain it and may not offer a way around it: App Review reads "Not now"
   on a pre-permission screen as steering people away from the system's own
   question, guideline 5.1.1(iv). So Continue is the only way on, and on a
   phone it leads straight to iOS asking. Turning every switch off is how
   somebody says "none of these", and iOS is still asked, because the pinned
   banner reaches every phone that allows notifications whatever is set here
   (migration 0078), and a phone that was never asked can never hear it.

   WHAT IT REPLACES ON A PHONE. resumeNotifications() in js/native.js used to
   ask iOS at boot, while the greeting was still up, and a yes turned every
   switch on. On a launch where this screen is going to show, app.js leaves
   that ask to Continue instead, and a yes keeps the switches exactly as they
   were left here. See applyChoices() in js/native.js.

   IN A BROWSER the switches are saved and nothing is asked, the same as
   moving them on Your account.
   ========================================================================== */

(function (HC) {
  'use strict';

  var SEEN_KEY = 'notifyIntroSeen';

  /* How small the house and the line get at the top. Small enough that the
     card has the screen, big enough that the line still reads as a title. */
  var SHRINK = 0.78;

  var root = null;
  var panel = null;
  var greeting = null;
  var leave = null;
  var opened = false;
  var closed = false;

  // The switches on screen, separate from the profile until Continue.
  var choice = {};

  function seen() {
    return !!(HC.store && HC.store.storage.get(SEEN_KEY, false));
  }

  /* Asked by js/gate.js at the moment it is done, and by app.js at boot to
     decide whether iOS is asked now or by Continue. */
  function shouldShow() {
    return !seen();
  }

  /* Whether this is going to be on the glass before the splash leaves. True
     from boot on a phone that will meet the gate and has never seen this,
     and for as long as it is up. */
  function pending() {
    if (closed) return false;
    if (opened) return true;
    return shouldShow() && !!(HC.gate && HC.gate.shouldShow());
  }

  /* ---------------------------------------------------------------- topics

     The same switches as Your account, with the same keys and the same
     words, read through the same copy slots so an edit there is an edit
     here. The admin pair is left off: nobody is an admin yet at this point
     on a first launch, and they live on Your account for anybody who is. */

  function topics() {
    var copy = function (slot, fallback) {
      return HC.data && HC.data.copy ? HC.data.copy(slot, fallback) : fallback;
    };
    var list = [
      { id: 'newGuide', icon: 'guide', title: 'A new guide is posted',
        sub: copy('profile.notify-guide', 'Monday morning, once a week') },
      { id: 'newSermon', icon: 'listen', title: 'New sermon audio',
        sub: copy('profile.notify-sermon', 'When Sunday’s message is up to listen to') },
      { id: 'sundayReminder', icon: 'sun', title: 'Sunday reminder',
        sub: copy('profile.notify-sunday', 'Saturday evening, service times and address') },
      { id: 'announcements', icon: 'bell', title: 'Announcements',
        sub: copy('profile.notify-news', 'When the church posts something on purpose') }
    ];
    // Season gated for the reason Your account gives beside the same switch.
    if (HC.data && HC.data.church && HC.data.church.groupsInSeason) {
      list.push({ id: 'groupWeek', icon: 'connect', title: 'The day your group meets',
        sub: 'Only on your group’s day' });
    }
    return list;
  }

  /* ---------------------------------------------------------------- markup */

  function markup() {
    var c = HC.components;
    var esc = c.esc;
    var rows = topics().map(function (t, i) {
      var on = !!choice[t.id];
      return '' +
        '<button type="button" class="hc-notify__row" data-notify="' + esc(t.id) + '" ' +
          'role="switch" aria-checked="' + on + '" style="--i:' + i + '">' +
          '<span class="hc-notify__icon">' + c.icon(t.icon) + '</span>' +
          '<span class="hc-notify__text">' +
            '<span class="hc-notify__title">' + esc(t.title) + '</span>' +
            '<span class="hc-notify__sub">' + esc(t.sub) + '</span>' +
          '</span>' +
          '<span class="hc-switch" aria-hidden="true" aria-checked="' + on + '">' +
            '<span class="hc-switch__knob"></span>' +
          '</span>' +
        '</button>';
    }).join('');

    return '' +
      '<p class="hc-notify__lede">Choose what you’d like to hear from us.</p>' +
      '<div class="hc-notify__list" role="group" aria-label="Notifications">' + rows + '</div>' +
      '<div class="hc-notify__foot">' +
        '<button type="button" class="hc-btn hc-btn--primary" data-notify-go>Continue</button>' +
        '<p class="hc-notify__note">You can change these anytime in Your account.</p>' +
      '</div>';
  }

  /* ----------------------------------------------------------------- place

     Where the house and the line go: their bottom edge a little above the
     card, at the smaller size. Measured rather than written into the CSS,
     because the card's top depends on the safe area and the lockup's height
     depends on the text size somebody chose, and a guess at either is a title
     sitting on top of the first switch on somebody's phone.

     offsetTop and offsetHeight, not getBoundingClientRect: those are the box
     before any transform, and the lockup is still holding the gate's lift,
     the house is still finishing its pop. The layer is the offset parent of
     both, so the two numbers are in the same frame. */
  function place() {
    var lockup = root.querySelector('.hc-splash__lockup');
    if (!lockup || !panel) return;
    var h = lockup.offsetHeight;
    var bottom = panel.offsetTop - 14;
    var center = bottom - (h * SHRINK) / 2;
    var dy = center - (lockup.offsetTop + h / 2);
    root.style.setProperty('--hc-notify-y', Math.round(dy) + 'px');
    root.style.setProperty('--hc-notify-scale', String(SHRINK));
  }

  /* ---------------------------------------------------------------- wiring */

  function flip(row) {
    var id = row.getAttribute('data-notify');
    choice[id] = !choice[id];
    var on = String(choice[id]);
    row.setAttribute('aria-checked', on);
    var sw = row.querySelector('.hc-switch');
    if (sw) sw.setAttribute('aria-checked', on);
    if (HC.native && HC.native.tap) HC.native.tap('Light');
  }

  function finish() {
    if (closed) return;
    closed = true;

    var next = Object.assign({}, HC.store.getProfile().notifications, choice);
    HC.store.updateProfile({ notifications: next });
    HC.store.storage.set(SEEN_KEY, true);

    var button = panel.querySelector('[data-notify-go]');
    if (button) button.setAttribute('disabled', 'true');

    /* iOS is asked with the layer still up, so the alert lands over the
       screen that explained it rather than over Home. The layer leaves once
       there is an answer, whichever answer. */
    var ask = HC.native && HC.native.applyChoices
      ? HC.native.applyChoices()
      : Promise.resolve(false);

    ask.then(out, out);
  }

  function out() {
    var app = document.getElementById('app');
    if (app) app.removeAttribute('aria-hidden');
    if (leave) leave();
  }

  function wire() {
    panel.addEventListener('click', function (evt) {
      if (closed) return;
      var row = evt.target.closest ? evt.target.closest('[data-notify]') : null;
      if (row) { flip(row); return; }
      if (evt.target.closest && evt.target.closest('[data-notify-go]')) finish();
    });
  }

  /* ------------------------------------------------------------------ open
     Called by js/gate.js in place of its own exit. `exit` is the splash's
     fade, handed down from js/splash.js through the gate, so this file
     decides when it runs and never has to know what it does. */

  function open(splashEl, exit) {
    if (opened || !splashEl) { if (exit) exit(); return; }
    opened = true;
    root = splashEl;
    leave = exit;
    greeting = document.getElementById('hc-splash-greeting');

    var prefs = (HC.store.getProfile().notifications) || {};
    topics().forEach(function (t) { choice[t.id] = !!prefs[t.id]; });

    panel = document.createElement('div');
    panel.className = 'hc-notify';
    panel.innerHTML = markup();
    root.appendChild(panel);

    wire();
    place();

    var start = function () {
      if (greeting) greeting.textContent = 'Stay in the loop.';
      root.classList.add('hc-splash--notify');
    };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(start); });
    } else {
      start();
    }
  }

  HC.notifyIntro = {
    shouldShow: shouldShow,
    pending: pending,
    open: open,
    // For tests/e2e/notify-intro.js. Null until it opens.
    choices: function () { return opened ? Object.assign({}, choice) : null; }
  };

})(window.HC = window.HC || {});
