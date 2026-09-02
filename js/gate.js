/* ==========================================================================
   Home Church, the way in

   The screen between the greeting and the Home tab, for a phone that is not
   signed in.

   IT IS NOT A SCREEN. It is the splash, still on the glass, with the house
   and the welcome lifted to make room underneath them. That is the whole
   reason this file exists instead of a route: a route would mean the
   greeting fading out and something else fading in, and what this is meant
   to be is one movement. The mark arrives, the welcome follows, the light
   crosses it, and then the pair of them climb and the way in comes up under
   them. Nothing cuts.

   THE SHAPE OF IT. Three panels on one track, and the track slides. What you
   chose leaves to the left, the next thing comes in from the right edge, and
   going back walks the same track the other way:

     choose   Log in with email, or continue as guest
     email    where to send the code
     code     the six digits that came back

   WHY THERE IS AN EMAIL STEP AT ALL. The code has to be sent somewhere.
   requestCode in js/auth.js is the same one Your account uses and it needs an
   address before there is a code to type, so the address is its own panel
   rather than a field bolted onto either side of it.

   WHAT IT NEVER DOES. It never stands between somebody and the app. Continue
   as guest is on the first panel in the same size type as the other button,
   because everything in here except the parts that follow you between phones
   works signed out, and an app that demands an account for what it gives
   away is also an app App Review sends back, guideline 5.1.1(i).

   WHEN IT APPEARS. Every cold launch where this church has accounts at all
   and this phone is not signed in. Continuing as guest gets past it for that
   launch and not for good: nothing about the choice is written down, so the
   next launch asks again. If that ever reads as nagging rather than as an
   invitation, shouldGate() below is the one function to change and
   HC.store.updateProfile is where the answer would be remembered.

   NO TOASTS IN HERE. HC.components.toast draws at z-index 60 and this layer
   is at 95, so a toast raised from the gate is a message behind a wall.
   Everything this has to say, it says in the panel that raised it.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* The same 560ms the track's transition is given in css/components.css. If
     one moves, move the other: this file waits out the slide before it puts
     the cursor in the field that just arrived, and a wait shorter than the
     slide is a keyboard opening over a moving panel. */
  var SLIDE = 560;

  /* How long "You're in!" holds before Home. The burst itself is 1200ms, so
     this leaves a beat of stillness after it rather than cutting on the last
     frame of an animation. */
  var SAY = 1600;
  var SAY_STILL = 900;

  var STEPS = { choose: 0, email: 1, code: 2 };

  var root = null;        // the splash layer, borrowed rather than built
  var deck = null;
  var track = null;
  var greeting = null;
  var step = 'choose';
  var identifier = '';
  var opened = false;
  var closed = false;
  var leave = null;       // splash.js's own exit, called when we are done

  function reduced() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* The whole question. Accounts have to exist for this church, and this
     phone has to not be in one. A project with js/config.js still empty has
     no sign in to offer and gets the app the way it has always opened. */
  function shouldGate() {
    return !!(HC.auth && HC.auth.isConfigured() && !HC.auth.isSignedIn());
  }

  /* ---------------------------------------------------------------- markup

     One string, no interpolation. The only words in here that come from
     outside are the address somebody typed, and that is written with
     textContent further down rather than built into this. */

  function markup() {
    return '' +
      '<div class="hc-gate__track" data-step="0">' +

        '<div class="hc-gate__panel" data-panel="choose">' +
          '<button type="button" class="hc-btn hc-btn--primary" data-gate="email">' +
            'Log in with email</button>' +
          '<button type="button" class="hc-btn hc-btn--secondary" data-gate="guest">' +
            'Continue as guest</button>' +
          '<p class="hc-gate__note">Signing in carries your journal, your group and your ' +
            'details to any phone. Everything else works either way.</p>' +
        '</div>' +

        '<form class="hc-gate__panel" data-panel="email" novalidate>' +
          '<label class="hc-gate__label" for="hc-gate-email">Your email</label>' +
          '<input class="hc-input" id="hc-gate-email" name="email" type="email" ' +
            'inputmode="email" autocomplete="email" autocapitalize="off" ' +
            'autocorrect="off" spellcheck="false" placeholder="you@example.com">' +
          '<p class="hc-gate__error" data-error hidden></p>' +
          '<button type="submit" class="hc-btn hc-btn--primary" data-gate="send">' +
            'Send me a code</button>' +
          '<button type="button" class="hc-btn hc-btn--tertiary hc-gate__back" ' +
            'data-gate="back-choose">Back</button>' +
        '</form>' +

        '<form class="hc-gate__panel" data-panel="code" novalidate>' +
          '<label class="hc-gate__label" for="hc-gate-code">Your code</label>' +
          '<input class="hc-input" id="hc-gate-code" name="code" type="text" ' +
            'inputmode="numeric" autocomplete="one-time-code" ' +
            'placeholder="6 digit code">' +
          '<p class="hc-gate__note" data-sent>We sent you a code. It can take a minute ' +
            'to land.</p>' +
          '<p class="hc-gate__error" data-error hidden></p>' +
          '<button type="submit" class="hc-btn hc-btn--primary" data-gate="verify">' +
            'Sign me in</button>' +
          '<button type="button" class="hc-btn hc-btn--tertiary hc-gate__back" ' +
            'data-gate="back-email">Use a different email</button>' +
        '</form>' +

      '</div>';
  }

  /* ----------------------------------------------------------- the panels */

  function panelOf(name) {
    return deck.querySelector('[data-panel="' + name + '"]');
  }

  /* Which panel is the one you are on, said twice: once for a screen reader
     and once for the tab key. Off screen is not the same as gone, and a field
     parked past the right edge would otherwise still take a keystroke. */
  function sync() {
    Object.keys(STEPS).forEach(function (name) {
      var panel = panelOf(name);
      if (!panel) return;
      var here = name === step;
      panel.setAttribute('aria-hidden', here ? 'false' : 'true');
      Array.prototype.forEach.call(
        panel.querySelectorAll('button, input'),
        function (node) {
          if (here) node.removeAttribute('disabled');
          else node.setAttribute('disabled', 'true');
        }
      );
    });
  }

  /* THE DECK MUST NEVER SCROLL. It clips at the edge of the screen, which is
     what makes a panel arrive from off it, and a box that clips is also a box
     the browser is willing to scroll. Putting the cursor in a field is enough:
     the field is pulled into view by scrolling this box sideways, underneath
     the transform that is meant to be the only thing moving the track, and
     every panel after that is somewhere nobody asked for. Measured at 355px
     of scroll on a 375pt screen, which is to say the panel was simply gone.

     Two answers, because either alone leaves a hole. preventScroll stops the
     focus call from doing it where that option is honored, and this puts the
     box back whenever anything else does: on iOS the keyboard rising scrolls
     ancestors on its own, and that scroll belongs to no function call here. */
  function pin() {
    if (!deck) return;
    if (deck.scrollLeft !== 0) deck.scrollLeft = 0;
    if (deck.scrollTop !== 0) deck.scrollTop = 0;
  }

  function focusInto(input) {
    if (!input) return;
    try { input.focus({ preventScroll: true }); }
    catch (err) { input.focus(); }
    pin();
  }

  function go(name) {
    if (!(name in STEPS)) return;
    step = name;
    track.setAttribute('data-step', String(STEPS[name]));
    sync();

    /* The cursor goes in after the panel has arrived, not while it is still
       crossing the screen. On iOS the keyboard comes up with it, and a
       keyboard rising over a moving panel is the one part of this that reads
       as a glitch rather than as motion. */
    var input = panelOf(name).querySelector('input');
    if (!input) return;
    setTimeout(function () {
      if (!closed && step === name) focusInto(input);
    }, reduced() ? 0 : SLIDE);
  }

  /* What went wrong, in the panel it went wrong in. Cleared on the next
     attempt rather than left to age. */
  function say(name, message) {
    var line = panelOf(name).querySelector('[data-error]');
    if (!line) return;
    line.textContent = message || '';
    if (message) line.removeAttribute('hidden');
    else line.setAttribute('hidden', 'true');
  }

  function busy(name, on) {
    var button = panelOf(name).querySelector('[type="submit"]');
    if (!button) return;
    if (on) button.setAttribute('disabled', 'true');
    else button.removeAttribute('disabled');
  }

  /* ------------------------------------------------------------- sign in */

  function sendCode() {
    var panel = panelOf('email');
    var input = panel.querySelector('input');
    var value = (input.value || '').trim();

    say('email', '');
    if (!HC.auth.classify(value)) {
      say('email', 'That does not look like an email address.');
      focusInto(input);
      return;
    }

    busy('email', true);
    HC.auth.requestCode(value).then(function (id) {
      identifier = id.value;
      var sent = panelOf('code').querySelector('[data-sent]');
      if (sent) {
        sent.textContent = 'We sent a code to ' + id.value + '. It can take a minute to land.';
      }
      busy('email', false);
      go('code');
    }).catch(function (err) {
      busy('email', false);
      say('email', err.message);
    });
  }

  function signIn() {
    var panel = panelOf('code');
    var input = panel.querySelector('input');
    var code = (input.value || '').trim();

    say('code', '');
    if (!code) {
      say('code', 'Enter the code we sent you.');
      focusInto(input);
      return;
    }

    busy('code', true);
    HC.auth.verifyCode(identifier, code).then(function () {
      welcome();
    }).catch(function (err) {
      busy('code', false);
      say('code', err.message);
    });
  }

  /* The one moment in this app that is allowed to be loud. The panels drop
     away, the house settles back toward the middle of the screen, light comes
     out from behind it, and the welcome that has been sitting there since the
     first frame changes its mind about what it says.

     The keyboard goes first. iOS leaves it standing otherwise and the burst
     happens behind it. */
  function welcome() {
    var focused = document.activeElement;
    if (focused && focused.blur) focused.blur();

    if (greeting) greeting.textContent = 'You’re in!';
    root.classList.add('hc-splash--in');
    if (HC.native && HC.native.tap) HC.native.tap('Medium');

    setTimeout(done, reduced() ? SAY_STILL : SAY);
  }

  /* ---------------------------------------------------------------- done */

  function done() {
    if (closed) return;
    closed = true;

    var app = document.getElementById('app');
    if (app) app.removeAttribute('aria-hidden');

    /* Left in the document rather than removed, because the layer it is
       drawn on is about to fade and taking half of it away first would be a
       flicker on the way out. splash.js removes the whole thing. */
    if (leave) leave();
  }

  /* ---------------------------------------------------------------- wiring
     One listener for the taps and one for the two forms, both on the deck, so
     a panel is markup and nothing has to be re-wired when the track moves.
     The submit buttons are deliberately not handled by the click listener:
     they are type="submit", the form hears them, and the return key on a
     keyboard reaches the same place a thumb does. */

  function wire() {
    deck.addEventListener('scroll', pin);

    deck.addEventListener('click', function (evt) {
      var el = evt.target.closest ? evt.target.closest('[data-gate]') : null;
      if (!el || el.hasAttribute('disabled')) return;
      var what = el.getAttribute('data-gate');

      if (what === 'email') go('email');
      else if (what === 'guest') done();
      else if (what === 'back-choose') go('choose');
      else if (what === 'back-email') go('email');
    });

    deck.addEventListener('submit', function (evt) {
      evt.preventDefault();
      var name = evt.target.getAttribute('data-panel');
      if (name === 'email') sendCode();
      else if (name === 'code') signIn();
    });
  }

  /* ---------------------------------------------------------------- open
     Called by js/splash.js at the end of the greeting's own hold, in place of
     the fade it would otherwise start. `exit` is that fade, handed over so
     this file decides when it runs and never has to know what it does. */

  function open(splashEl, exit) {
    if (opened || !splashEl) return;
    opened = true;
    root = splashEl;
    leave = exit;
    greeting = document.getElementById('hc-splash-greeting');

    deck = document.createElement('div');
    deck.className = 'hc-splash__gate';
    deck.innerHTML = markup();
    root.appendChild(deck);
    track = deck.querySelector('.hc-gate__track');

    wire();
    sync();

    /* Home is painted underneath and unreachable while this is up, so it is
       taken out of the accessibility tree for as long as the gate is there.
       Put back by done(), whichever way this ends. */
    var app = document.getElementById('app');
    if (app) app.setAttribute('aria-hidden', 'true');

    /* Two frames between the deck landing in the document and the class that
       moves everything. One is enough on paper; two survives the layout that
       a fresh subtree costs, and without them the browser has no starting
       value to transition from and the lift is a jump. */
    var start = function () { root.classList.add('hc-splash--gate'); };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(start); });
    } else {
      start();
    }
  }

  HC.gate = {
    shouldShow: shouldGate,
    open: open,
    /* For anything that needs to know the gate is what is on the glass, and
       for tests/e2e/gate.js. Null until it opens. */
    step: function () { return opened && !closed ? step : null; }
  };

})(window.HC = window.HC || {});
