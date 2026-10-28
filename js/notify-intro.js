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

   IF THE PHONE IS TOLD DON'T ALLOW, the screen stays for one more moment.
   On an iPhone: the three taps in Settings, Open Settings, and Maybe later,
   because iOS will not show its own alert a second time. On Android, which
   will: Turn on notifications again, and Maybe later. See refused().

   ONE BUTTON, ON PURPOSE. A screen in front of the iOS permission alert may
   explain it and may not offer a way around it: App Review reads "Not now"
   on a pre-permission screen as steering people away from the system's own
   question, guideline 5.1.1(iv). So the button is the only way on, and on a
   phone it says "Turn on notifications" and leads straight to iOS asking,
   which is the church's call: an honest name for what it does, and the
   alert that follows still has Don't Allow on it. If App Review ever
   objects to the wording, goLabel() is the one place to change it back to
   Continue. Turning every switch off is how
   somebody says "none of these", and iOS is still asked, because the pinned
   banner reaches every phone that allows notifications whatever is set here
   (migration 0078), and a phone that was never asked can never hear it.

   WHAT IT REPLACES ON A PHONE. resumeNotifications() in js/native.js used to
   ask iOS at boot, while the greeting was still up, and a yes turned every
   switch on. On a launch where this screen is going to show, app.js leaves
   that ask to Continue instead, and a yes keeps the switches exactly as they
   were left here. See applyChoices() in js/native.js.

   WHERE IT SHOWS. Only in an app that can be sent a push: the iPhone app,
   and the Android app while pushAvailable() in js/native.js says so. Not
   the web version, which has no push. See canReach().
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
  var asked = false;      // Continue has been tapped
  var closed = false;     // the layer is on its way out

  // The switches on screen, separate from the profile until Continue.
  var choice = {};

  function seen() {
    return !!(HC.store && HC.store.storage.get(SEEN_KEY, false));
  }

  /* Only where a notification can actually arrive. That is the iPhone app,
     and the Android app once pushAvailable() in js/native.js says Firebase
     is in (PLAY_COMPLIANCE.md section 8). Not the web version, which has no
     push at all, and not Android before then, where touching the push
     plugin crashes the app: a screen of switches with nothing behind them
     is the lie Your account already refuses to draw on Android. A demo on a
     preview link shows it, since showing it is what the demo is for. */
  function canReach() {
    if (HC.demo && HC.demo.on) return true;
    var n = HC.native;
    return !!(n && n.isNative && n.isNative() && n.pushAvailable && n.pushAvailable());
  }

  /* Asked by js/gate.js at the moment it is done, and by app.js at boot to
     decide whether iOS is asked now or by Continue. */
  function shouldShow() {
    return canReach() && !seen();
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
    /* Announcements first, ahead of the order Your account uses: it is the
       one the church most wants heard, and the top of the card is the row
       everybody reads. */
    var list = [
      { id: 'announcements', icon: 'bell', title: 'Announcements',
        sub: copy('profile.notify-news',
          'When the church posts something important, like an event or a change to Sunday') },
      { id: 'newGuide', icon: 'guide', title: 'A new guide is posted',
        sub: copy('profile.notify-guide', 'Monday mornings weekly') },
      { id: 'newSermon', icon: 'listen', title: 'New sermon audio',
        sub: copy('profile.notify-sermon',
          'When Sunday’s message is up to listen to, Tuesdays weekly') },
      { id: 'sundayReminder', icon: 'sun', title: 'Sunday reminder',
        sub: copy('profile.notify-sunday',
          'Service times and address, Saturday evenings weekly') }
    ];
    // Season gated for the reason Your account gives beside the same switch.
    if (HC.data && HC.data.church && HC.data.church.groupsInSeason) {
      list.push({ id: 'groupWeek', icon: 'connect', title: 'The day your group meets',
        sub: 'Only on your group’s day' });
    }
    return list;
  }

  /* What the one button says, which is what it does: it brings up the
     phone's own alert. Every place this screen shows has one behind it. */
  function goLabel() {
    return 'Turn on notifications';
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
        '<button type="button" class="hc-btn hc-btn--primary" data-notify-go>' +
          esc(goLabel()) + '</button>' +
        '<p class="hc-notify__note">You can change these anytime in Your account.</p>' +
      '</div>' +

      /* The second state, for a phone that just said Don't Allow. Empty and
         hidden until then; refused() fills it for the phone it is on. */
      '<div class="hc-notify__off" hidden></div>';
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

  function save() {
    var next = Object.assign({}, HC.store.getProfile().notifications, choice);
    HC.store.updateProfile({ notifications: next });
  }

  function finish() {
    if (asked) return;
    asked = true;

    save();
    HC.store.storage.set(SEEN_KEY, true);

    var button = panel.querySelector('[data-notify-go]');
    if (button) button.setAttribute('disabled', 'true');

    /* iOS is asked with the layer still up, so the alert lands over the
       screen that explained it rather than over Home. A yes, or a browser
       with nobody to ask, goes on to Home. A no stays here for one more
       moment: see refused(). */
    var ask = HC.native && HC.native.applyChoices
      ? HC.native.applyChoices()
      : Promise.resolve(null);

    ask.then(function (answer) {
      if (answer === 'denied') refused();
      else out();
    }, out);
  }

  /* DON'T ALLOW, AND WHAT IS LEFT AFTER IT, which is different on the two
     phones.

     AN IPHONE ASKS ONCE. Asked again, iOS answers "denied" straight away and
     shows nothing, so a button that "asks again" would do nothing. What is
     left is the switch iOS keeps in Settings, and this says where it is,
     with a button straight to it.

     ANDROID ASKS TWICE. After the first Don't allow it reports
     'prompt-with-rationale', and the system dialog will come up once more,
     so there the button asks again. A second no is final on Android and
     goes to Home: somebody who has said no twice has answered. A phone that
     was already past both (Android reports 'denied') gets the way to
     Settings in words, since there is no Android link to it without another
     plugin.

     Nothing here blocks the app or comes back on a later launch: Maybe later
     is Home, and this screen is already marked as seen. The line it says is
     a fact about what the church sends, not a reason to feel bad. */
  var LEDE = 'That’s okay. Just so you know, urgent news, like a change to ' +
    'Sunday, only reaches phones with notifications on.';

  function step(n, html) {
    return '<li><span class="hc-notify__num">' + n + '</span><span>' + html + '</span></li>';
  }

  function later(label, primary) {
    return '<button type="button" class="hc-btn ' +
      (primary ? 'hc-btn--primary' : 'hc-btn--tertiary hc-notify__later') +
      '" data-notify-later>' + label + '</button>';
  }

  function offMarkup(mode) {
    if (mode === 'again') {
      return '<p class="hc-notify__lede">' + LEDE + '</p>' +
        '<div class="hc-notify__foot">' +
          '<button type="button" class="hc-btn hc-btn--primary" data-notify-again>' +
            'Turn on notifications</button>' +
          later('Maybe later') +
        '</div>';
    }
    if (mode === 'android-settings') {
      return '<p class="hc-notify__lede">' + LEDE + '</p>' +
        '<ol class="hc-notify__steps">' +
          step(1, 'Open your phone’s <strong>Settings</strong>') +
          step(2, 'Tap <strong>Apps</strong>, then <strong>Home Church</strong>') +
          step(3, 'Tap <strong>Notifications</strong> and turn them on') +
        '</ol>' +
        '<div class="hc-notify__foot">' + later('Continue', true) + '</div>';
    }
    return '<p class="hc-notify__lede">' + LEDE + '</p>' +
      '<ol class="hc-notify__steps">' +
        step(1, 'Tap <strong>Open Settings</strong> below') +
        step(2, 'Tap <strong>Notifications</strong>') +
        step(3, 'Turn on <strong>Allow Notifications</strong>') +
      '</ol>' +
      '<div class="hc-notify__foot">' +
        '<button type="button" class="hc-btn hc-btn--primary" data-notify-settings>' +
          'Open Settings</button>' +
        later('Maybe later') +
      '</div>';
  }

  function refused() {
    var android = HC.native && HC.native.isAndroid && HC.native.isAndroid();
    var check = HC.native && HC.native.notificationAnswer
      ? HC.native.notificationAnswer()
      : Promise.resolve(null);

    check.then(function (answer) {
      if (closed) return;
      var mode = !android ? 'ios'
        : answer === 'prompt-with-rationale' ? 'again'
        : 'android-settings';
      var off = panel.querySelector('.hc-notify__off');
      if (off) {
        off.innerHTML = offMarkup(mode);
        off.removeAttribute('hidden');
      }
      root.classList.add('hc-splash--notify-off');
      say('Notifications are off.');
      if (HC.native && HC.native.tap) HC.native.tap('Light');
      document.addEventListener('visibilitychange', backFromSettings);
    });
  }

  /* Android's second chance. The switches go back to what was chosen (the
     first no turned them all off) before asking, because the registration
     carries them. Yes is the same ending as coming back from Settings; a
     second no is final, and Home. */
  function askAgain() {
    var button = panel.querySelector('[data-notify-again]');
    if (button) button.setAttribute('disabled', 'true');
    save();
    HC.native.applyChoices().then(function (answer) {
      if (answer === 'granted') allSet();
      else out();
    }, out);
  }

  function allSet() {
    if (closed) return;
    document.removeEventListener('visibilitychange', backFromSettings);
    say('You’re all set.');
    root.classList.add('hc-splash--notify-done');
    setTimeout(out, 1300);
  }

  /* Back from Settings. If notifications are on now, the switches go back to
     what was chosen a moment ago (the no turned them all off), the phone
     registers, and the screen says so before it leaves. If not, it stays put
     and Maybe later is still there. */
  function backFromSettings() {
    if (document.visibilityState !== 'visible' || closed) return;
    HC.native.notificationAnswer().then(function (answer) {
      if (answer !== 'granted' || closed) return;
      save();
      HC.native.applyChoices();
      allSet();
    });
  }

  /* The line under the house says something new and arrives again. */
  function say(text) {
    if (!greeting) return;
    greeting.textContent = text;
    greeting.style.animation = 'none';
    void greeting.offsetWidth;
    greeting.style.animation = '';
  }

  function out() {
    if (closed) return;
    closed = true;
    document.removeEventListener('visibilitychange', backFromSettings);
    var app = document.getElementById('app');
    if (app) app.removeAttribute('aria-hidden');
    if (leave) leave();
  }

  function wire() {
    panel.addEventListener('click', function (evt) {
      if (closed) return;
      var hit = function (sel) { return evt.target.closest && evt.target.closest(sel); };
      var row = hit('[data-notify]');
      if (row && !asked) { flip(row); return; }
      if (hit('[data-notify-go]')) finish();
      else if (hit('[data-notify-again]')) askAgain();
      else if (hit('[data-notify-settings]')) HC.native.openAppSettings();
      else if (hit('[data-notify-later]')) out();
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

    /* Sermon audio starts off everywhere else (js/store.js, migration 0096)
       and starts on here. This screen is where somebody new sees it and
       chooses, which is the choosing the church asked for. */
    choice.newSermon = true;

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
