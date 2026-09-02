/* ==========================================================================
   Home Church, hints

   Where a new phone gets pointed, and the machinery that decides whether it
   gets pointed at all. HINTS.md at the repo root is the long version, and
   demo-hint/ is the drawing this was built from.

   WHAT A HINT IS HERE. One quiet pointer at one thing, shown once per launch,
   gone the moment anybody touches anything. It is not a tour, not a modal,
   not a coach mark with a Got it button. The app already decided that the way
   you put something away is by going on with what you were doing, and this
   file holds that line.

   THE SPLIT, WHICH IS THE WHOLE DESIGN. A hint says WHAT and WHERE. This file
   says WHETHER, WHEN, and HOW IT ENDS. Nothing that registers a hint can get
   the annoying parts wrong, because nothing that registers a hint is allowed
   to write them. Adding a second hint is a register() call and no new rules.

   THE PROMISE, AND IT IS ONE CSS LINE. .hc-hint has pointer-events: none, on
   the layer and every child. Not click-through forwarding, not a scrim that
   re-dispatches: actually none, so there is no code path anywhere in which a
   tap lands on a hint instead of on the app. Tapping the avatar through the
   hint opens Profile and the hint dies on the way. That line is why there is
   no dismiss button here and why there must never be one. See css/components.css.

   NO PERSISTENCE, DELIBERATELY. An earlier draft capped the account hint at
   three launches, which needed a counter on the phone, an increment that had
   to happen on show rather than on dismiss, and a retirement flag two events
   could set. All of it existed to answer "has this hint had its turns yet".
   The rule is now "every launch until there is an account", so the question is
   "is this phone signed out", HC.auth.isSignedIn() already answers it, and
   the answer is already right across launches because the session is already
   stored. So there is no hc:hints key and nothing in js/store.js. A counter
   that does not exist cannot be miscounted.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* --- the numbers, all of them, in one place --------------------------- */

  /* DELAY is counted from the moment the greeting lifts, not from boot: two
     seconds after boot is still the middle of js/splash.js. HOLD is long
     enough to be read by somebody who looked away at the wrong moment, short
     enough to be gone before it becomes furniture. HOLD_STILL is longer
     because under Reduce Motion there is no movement to draw the eye to it.

     FADE has to outlast the transition in components.css, or the layer is
     pulled out from under its own fade. */
  var DELAY      = 2500;
  var HOLD       = 6000;
  var HOLD_STILL = 7500;
  var FADE       = 340;

  /* --- state ------------------------------------------------------------ */

  var specs   = [];      // everything registered, in registration order
  var armed   = false;   // arm() has run for this launch
  var ranThisLaunch = false;
  var current = null;    // the spec on the glass, or null
  var layer   = null;    // its element, or null
  var target  = null;    // what it is pointing at, so the ring can be undone
  var holdTimer  = 0;
  var delayTimer = 0;

  function reduced() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* --- the policy -------------------------------------------------------

     One pure function, no DOM, no clock, no globals, which is what lets
     tests/hints.test.js cover the whole of it with node and vm and no jsdom.
     Everything that can say no is here rather than scattered through show().

     `ctx` is gathered by context() below and passed in whole, so a caller in
     a test can build one by hand. */

  function shouldShow(spec, ctx) {
    if (!spec) return false;

    // Somebody is already being pointed at something. One hint per launch is
    // the rule that makes a second hint safe to add without re-auditing the
    // first, and two hints on one screen is a tour.
    if (ctx.alreadyRanThisLaunch) return false;

    // Nothing over the greeting, and nothing into a screen nobody is looking
    // at or that already has something over it.
    if (ctx.splashUp) return false;
    if (ctx.sheetOpen) return false;
    if (ctx.hidden) return false;

    // The hint's own question. This is the only part a spec writes, and it is
    // where "signed out" lives for the account hint.
    if (typeof spec.when === 'function' && !spec.when(ctx)) return false;

    return true;
  }

  function context() {
    var route = HC.router && HC.router.current ? HC.router.current() : null;
    return {
      route: route ? route.name : null,
      signedIn: !!(HC.auth && HC.auth.isSignedIn && HC.auth.isSignedIn()),
      configured: !!(HC.auth && HC.auth.isConfigured && HC.auth.isConfigured()),
      splashUp: !!(HC.splash && HC.splash.showing && HC.splash.showing()),
      sheetOpen: !!(HC.overflow && HC.overflow.isOpen && HC.overflow.isOpen()),
      hidden: !!document.hidden,
      alreadyRanThisLaunch: ranThisLaunch
    };
  }

  /* --- drawing ----------------------------------------------------------

     The caption is built once per showing and thrown away with it. It is
     cheaper to keep one around, and it is also one more thing that can be
     left on the glass by a code path nobody thought about. A hint that cannot
     outlive its own showing is worth a few bytes of garbage. */

  function draw(spec) {
    var anchor = typeof spec.anchor === 'function' ? spec.anchor() : null;
    if (!anchor) return false;

    target = anchor;

    /* The ring, on the thing itself. Two pseudo elements in the stylesheet,
       switched on by one attribute here, so this file never animates anything
       and the whole of the motion lives next to the rest of the app's.
       Nothing is drawn under Reduce Motion: base.css collapses it to nothing
       anyway, and the caption below is what carries the meaning there. */
    if (!reduced()) anchor.setAttribute('data-hint', 'on');

    if (!spec.text) return true;

    var box = anchor.getBoundingClientRect();

    layer = document.createElement('p');
    layer.className = 'hc-hint';
    /* Read out by nothing. VoiceOver already announces the avatar as "Your
       account", which is better than anything written here, and a visual
       pointer read aloud is noise. The focusin death below is the other half
       of this: somebody navigating by keyboard or VoiceOver is finding their
       own way and the hint gets out of it. */
    layer.setAttribute('aria-hidden', 'true');
    layer.textContent = spec.text;

    /* Anchored off the thing it points at rather than off a hardcoded header
       height, so it stays put if the bar ever changes and it is right on a
       phone with a notch and one without. Right aligned to the page gutter so
       its right edge lands under the disc. */
    layer.style.top = (box.bottom + 2) + 'px';
    layer.style.right = Math.max(0, window.innerWidth - box.right) + 'px';

    document.body.appendChild(layer);

    // One frame at rest before the transition, or there is nothing to
    // transition from and it simply appears.
    window.requestAnimationFrame(function () {
      if (layer) layer.setAttribute('data-show', 'true');
    });
    return true;
  }

  function undraw() {
    if (target) {
      target.removeAttribute('data-hint');
      target = null;
    }
    if (!layer) return;

    var going = layer;
    layer = null;
    going.removeAttribute('data-show');
    /* Removed rather than left at opacity 0. It has pointer-events: none so
       it swallows nothing either way, but a layer left on the glass is a
       layer some future stylesheet can make visible again by accident. */
    window.setTimeout(function () {
      if (going.parentNode) going.parentNode.removeChild(going);
    }, FADE);
  }

  /* --- showing and ending ------------------------------------------------ */

  function show(spec) {
    if (current) return;
    if (!shouldShow(spec, context())) return;
    if (!draw(spec)) return;      // nothing to point at, so nothing happened

    current = spec;
    ranThisLaunch = true;

    holdTimer = window.setTimeout(function () {
      end('timer');
    }, reduced() ? HOLD_STILL : HOLD);
  }

  /* Every way a showing ends goes through here. `why` is not used for
     anything today and is kept because the first question asked of a hint
     that misbehaves is which of the nine deaths took it. */
  function end(why) {
    if (!current) return;
    current = null;
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    undraw();
  }

  /* --- the death list ----------------------------------------------------

     Nine ways a showing ends, and there is no state in which it survives any
     of them. Bound once, at arm(), and never unbound: they cost nothing while
     nothing is showing because end() returns on the first line.
     ---------------------------------------------------------------------- */

  function bindDeaths() {
    /* Capture phase, so the hint is already leaving while the tapped thing is
       still deciding what to do. It never calls preventDefault, never calls
       stopPropagation, and never looks at the target to decide whether the
       tap counted. Every pointerdown anywhere is the end of the hint, and
       every one of them goes on to do whatever it was going to do. */
    document.addEventListener('pointerdown', function () {
      end('pointerdown');
    }, true);

    /* Reading, not looking at the header. The scroller is the app's, not the
       document's, which is why this is not a window listener. */
    var scroller = document.getElementById('hc-scroll');
    if (scroller) {
      scroller.addEventListener('scroll', function () { end('scroll'); },
        { passive: true });
    }

    // A keyboard or VoiceOver is driving. They are walking the controls in
    // order and will reach the avatar on their own.
    document.addEventListener('focusin', function () { end('focusin'); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) end('hidden');
    });

    // The screen it was anchored to is gone. Also covers the ••• sheet, which
    // arrives as a view change, and signing in, which repaints Profile.
    HC.store.on('view', function () { end('view'); });

    HC.store.on('auth', function (payload) {
      if (payload && payload.signedIn) end('signed in');
    });

    /* The anchor was measured once, at show time, and a rotation or a
       keyboard opening makes that measurement a lie. Re-measuring is more
       code than this is worth for a layer with six seconds to live. */
    window.addEventListener('resize', function () { end('resize'); });
  }

  /* --- the launch --------------------------------------------------------

     Called by boot() once Home is on the glass. The wait is counted from the
     moment the greeting lifts rather than from boot, which is what
     HC.splash.whenGone is for: two seconds after boot is still the middle of
     the splash.
     ---------------------------------------------------------------------- */

  function arm() {
    if (armed) return;
    armed = true;
    bindDeaths();

    var start = function () {
      delayTimer = window.setTimeout(function () {
        delayTimer = 0;
        // Re-sorted here rather than at register time so load order cannot
        // decide precedence.
        var queue = specs.slice().sort(function (a, b) {
          return (a.order || 100) - (b.order || 100);
        });
        for (var i = 0; i < queue.length; i++) {
          show(queue[i]);
          if (current) return;   // one per launch, and this is where that ends
        }
      }, DELAY);
    };

    if (HC.splash && HC.splash.whenGone) HC.splash.whenGone(start);
    else start();
  }

  function register(spec) {
    if (!spec || !spec.id) return;
    for (var i = 0; i < specs.length; i++) {
      if (specs[i].id === spec.id) return;   // registering twice is a no-op
    }
    specs.push(spec);
  }

  HC.hints = {
    register: register,
    arm: arm,
    end: function () { end('asked'); },

    /* Asked by js/index-rail.js before its own opening swell, so the two do
       not arrive on top of each other two seconds into the same launch. Its
       standing thirty second offer is unaffected: by then this is long gone. */
    busy: function () { return !!current || !!delayTimer; },

    // For the tests, and for anything that needs the policy without the DOM.
    shouldShow: shouldShow,
    context: context
  };

})(window.HC = window.HC || {});
