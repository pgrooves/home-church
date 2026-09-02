/* ==========================================================================
   Home Church, hints

   Where a new phone gets pointed, and the machinery that decides whether it
   gets pointed at all. HINTS.md at the repo root is the long version, and
   demo-hint/ is the drawing this was built from.

   WHAT A HINT IS HERE. One quiet pointer at one thing, gone the moment
   anybody touches anything. It is not a tour, not a modal, not a coach mark
   with a Got it button. The app already decided that the way you put
   something away is by going on with what you were doing, and this file
   holds that line.

   THREE KINDS, AND THEY DO NOT SHARE A BUDGET. See HINTS.md §7.

     launch  fires when the app opens, points at shell chrome, lives on a
             condition that is true across launches. The account hint, and
             probably always the only one.
     screen  fires on arriving somewhere, points inside that screen, and is
             finished once somebody has USED the thing it points at.
     after   fires just after an action and says where the result went. The
             only kind nobody is looking for, which is why it lands.

   They do not compete, because they do not happen at the same moment: one is
   the app opening, one is walking into a room, one is finishing a job. A
   single shared "one per launch" cap would mean the account hint starved
   every screen hint for as long as somebody stayed signed out, which is the
   trade §3e wrote down and this is the answer to it.

   THE FIRST LAUNCH BELONGS TO THE ACCOUNT HINT ALONE. No screen hint fires on
   launch one. Somebody opening this app for the first time is looking at a
   church, not learning a piece of software.

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

   WHAT IS REMEMBERED, AND BY WHICH KIND. The account hint stores nothing:
   "every launch until there is an account" means the question is "is this
   phone signed out", and the session already answers that correctly across
   launches. A screen hint has to store something, because its stopping
   condition is "you have done this" and nothing else in the app records that.

   So: hc:hints holds { seen, used } per screen hint, hc:launches holds the
   count, and neither exists for the account hint. RETIRE ON USE, NOT ON
   VIEWS, is the rule that matters: a hint about highlighting is finished the
   moment somebody highlights something, which means the app never explains a
   thing to somebody who already found it. The seen cap is only a backstop
   for somebody who never does.

   AND THERE IS AN OFF SWITCH. Your account -> Display -> Hints. One check at
   the top of shouldShow(), so nothing anywhere can route around it.
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
  var DELAY      = 2500;   // launch hints, after the greeting lifts
  var HOLD       = 6000;
  var HOLD_STILL = 7500;
  var FADE       = 340;

  /* Screen hints. SETTLE lets the screen paint and the arriving swipe finish
     before anything is drawn over it, so a hint never animates in on top of a
     transition. COOLDOWN is the gap two hints must never be closer than: any
     closer and they read as a sequence, and a sequence is a tour. PER_LAUNCH
     is the whole session's budget, which is what stops six screens in a row
     each being allowed their one.

     MIN_LAUNCH is the first launch a screen hint may fire on, and 2 is the
     number that keeps launch one for the account hint. SEEN_CAP is the
     backstop for somebody who never uses the thing. */
  var SETTLE     = 900;
  var COOLDOWN   = 45000;
  var PER_LAUNCH = 2;
  var MIN_LAUNCH = 2;
  var SEEN_CAP   = 3;

  /* --- state ------------------------------------------------------------ */

  var specs   = [];      // everything registered, in registration order
  var armed   = false;   // arm() has run for this launch
  var ranThisLaunch = false;   // a LAUNCH hint has had its turn
  var screenRuns = 0;    // how many screen hints have run this launch
  var lastShown  = 0;    // when the last hint of any kind ended, for COOLDOWN
  var thisVisit  = null; // the route we last considered, so one visit is one try
  var settleTimer = 0;

  /* THE OPENING MOMENT BELONGS TO THE LAUNCH HINT, and this is what reserves
     it. A screen hint's settle timer is shorter than the launch hint's delay,
     so without this the screen hint takes the glass first and is still up when
     the launch hint's turn comes, and show() drops it on `if (current)`.

     The symptom was the account hint appearing on the very first launch and
     never again, which reads exactly like the every-launch rule in §3d being
     broken rather than like an ordering problem between two kinds. Found by
     opening the app four times in a row rather than by reading it. */
  var launchDone = false;
  var waitingOnLaunch = [];

  function afterLaunchSlot(fn) {
    if (launchDone) { fn(); return; }
    waitingOnLaunch.push(fn);
  }

  function settleLaunch() {
    if (launchDone) return;
    launchDone = true;
    var list = waitingOnLaunch;
    waitingOnLaunch = [];
    for (var i = 0; i < list.length; i++) list[i]();
  }
  var current = null;    // the spec on the glass, or null
  var layer   = null;    // its element, or null
  var target  = null;    // what it is pointing at, so the shape can be undone
  var shape   = 'ring';
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

    /* The off switch, first, so nothing below can route around it. Your
       account -> Display -> Hints. */
    if (!ctx.hintsOn) return false;

    // Nothing over the greeting, nothing into a screen nobody is looking at,
    // nothing on top of something that already owns the glass.
    if (ctx.splashUp) return false;
    if (ctx.sheetOpen) return false;
    if (ctx.hidden) return false;

    /* Never while somebody is working. Presentation mode is a leader in front
       of a room, Edit mode is an admin mid sentence, and a focused text box is
       anybody halfway through a thought. A hint arriving in any of those is an
       interruption rather than a help, whatever it says. */
    if (ctx.busyScreen) return false;
    if (ctx.typing) return false;

    var kind = spec.kind || 'launch';

    if (kind === 'launch') {
      // One launch hint per launch. This is the account hint's budget and it
      // is not shared with anything below.
      if (ctx.alreadyRanThisLaunch) return false;

    } else if (kind === 'after') {
      /* A confirmation hint answers a question somebody just created by
         finishing something, and it is the only kind whose moment cannot be
         postponed: it shows once, ever, so a rule that defers it does not
         delay it, it cancels it.

         So it is exempt from the cooldown and from the session budget, both
         of which exist to stop hints arriving in a sequence. This one is not
         part of a sequence, it is the tail of an action the person took on
         purpose. It still answers to the off switch, to `used`, to its own
         limit, and to every "not right now" above.

         Found the hard way: with the screen rules applied, noting a line in a
         guide within forty five seconds of any other hint silently spent the
         only showing this hint will ever have. */
      var afterState = ctx.hintState(spec.id);
      if (afterState.used) return false;
      if (afterState.seen >= (spec.limit || 1)) return false;

    } else {
      /* A screen hint's own three gates, and none of them apply to a launch
         hint. Retire on use comes first, because it is the rule and the two
         after it are only backstops. */
      var state = ctx.hintState(spec.id);
      if (state.used) return false;
      if (state.seen >= (spec.limit || SEEN_CAP)) return false;

      // Launch one belongs to the account hint alone.
      if (ctx.launch < (spec.minLaunch || MIN_LAUNCH)) return false;

      // The session budget, and the gap between any two.
      if (ctx.screenRuns >= PER_LAUNCH) return false;
      if (ctx.sinceLast < COOLDOWN) return false;

      // A screen hint only fires on its own screen.
      if (spec.route && spec.route !== ctx.route) return false;
    }

    // The hint's own question, which is the only part a spec writes.
    if (typeof spec.when === 'function' && !spec.when(ctx)) return false;

    return true;
  }

  function context() {
    var route = HC.router && HC.router.current ? HC.router.current() : null;
    var name = route ? route.name : null;
    var el = document.activeElement;
    var tag = el ? (el.tagName || '').toLowerCase() : '';

    return {
      route: name,
      signedIn: !!(HC.auth && HC.auth.isSignedIn && HC.auth.isSignedIn()),
      configured: !!(HC.auth && HC.auth.isConfigured && HC.auth.isConfigured()),
      splashUp: !!(HC.splash && HC.splash.showing && HC.splash.showing()),
      sheetOpen: !!(HC.overflow && HC.overflow.isOpen && HC.overflow.isOpen()),
      hidden: !!document.hidden,
      hintsOn: !HC.store.hintsOn || HC.store.hintsOn(),

      /* Presentation mode is the one route that is somebody standing in front
         of a room, and Edit mode turns every editable sentence on every screen
         into something an admin may be halfway through. */
      busyScreen: name === 'present' ||
                  !!(HC.edit && HC.edit.isOn && HC.edit.isOn()),
      typing: tag === 'input' || tag === 'textarea' ||
              !!(el && el.isContentEditable),

      alreadyRanThisLaunch: ranThisLaunch,
      screenRuns: screenRuns,
      launch: HC.store.launchCount ? HC.store.launchCount() : 1,
      sinceLast: lastShown ? (Date.now() - lastShown) : Infinity,
      hintState: function (id) {
        return HC.store.hintState ? HC.store.hintState(id) : { seen: 0, used: false };
      }
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

    /* An anchor the screen has since replaced measures to all zeros, which is
       the failure js/index-rail.js documents: several screens re-render in
       place and the Group room replaces its whole subtree every eight
       seconds. A detached node is not something to point at. */
    if (!anchor.isConnected) return false;

    target = anchor;
    shape = spec.shape || 'ring';

    /* THE SHAPES, and the vocabulary stops at these. See HINTS.md §9.

         ring    a gold ring out of a small target's own edge, twice
         edge    a gold hairline drawn down one side of a block, once
         travel  a swell that moves along a path, the only one that can show
                 a gesture, because a gesture cannot be pointed at

       All three are stylesheet animations switched on by one attribute, so
       this file animates nothing and the motion lives beside the rest of the
       app's. Nothing is drawn at all under Reduce Motion: the caption below
       is what carries the meaning there. */
    if (!reduced()) anchor.setAttribute('data-hint', shape);

    if (!spec.text) return true;

    var box = anchor.getBoundingClientRect();

    layer = document.createElement('p');
    layer.className = 'hc-hint';
    layer.setAttribute('aria-hidden', 'true');
    layer.textContent = spec.text;

    /* Anchored off the thing it points at rather than off a hardcoded header
       height, so it is right on a phone with a notch and one without.

       Two placements, and which one is chosen by where the anchor sits rather
       than by the spec: under the anchor when there is room, above it when the
       anchor is near the bottom of the screen, which is where the tab bar and
       the ••• tile live. A caption drawn off the bottom of the glass is a hint
       nobody sees. */
    var below = box.bottom + 2;
    var wantAbove = below > (window.innerHeight - 96);
    layer.style.top = wantAbove ? '' : below + 'px';
    layer.style.bottom = wantAbove
      ? Math.max(0, window.innerHeight - box.top + 8) + 'px' : '';

    /* Right aligned to the page gutter when the anchor is over on the right,
       left aligned when it is not, so the caption never runs off either edge
       and always reads as belonging to the thing beside it. */
    var mid = box.left + (box.width / 2);
    if (mid > window.innerWidth / 2) {
      layer.style.right = Math.max(8, window.innerWidth - box.right) + 'px';
    } else {
      layer.style.left = Math.max(8, box.left) + 'px';
    }

    document.body.appendChild(layer);

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
    var ctx = context();
    if (!shouldShow(spec, ctx)) return;
    if (!draw(spec)) return;      // nothing to point at, so nothing happened

    current = spec;

    /* Counted on SHOW rather than on dismiss, so a screen somebody left
       before the hint was eligible does not spend anything, and a hint that
       could not find its anchor does not either: draw() has already returned
       by here. */
    var kind = spec.kind || 'launch';
    if (kind === 'launch') {
      ranThisLaunch = true;
    } else {
      // Both remembered kinds count their showings; only a screen hint spends
      // the session budget. See the `after` branch in shouldShow().
      if (kind === 'screen') screenRuns += 1;
      HC.store.noteHint(spec.id, { seen: ctx.hintState(spec.id).seen + 1 });
    }

    holdTimer = window.setTimeout(function () {
      end('timer');
    }, reduced() ? HOLD_STILL : HOLD);
  }

  function end(why) {
    if (!current) return;
    var wasLaunch = (current.kind || 'launch') === 'launch';
    current = null;
    lastShown = Date.now();
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    undraw();
    // A launch hint that has had its moment releases it. The cooldown then
    // keeps the next screen hint well clear of it.
    if (wasLaunch) settleLaunch();
  }

  /* --- retiring ----------------------------------------------------------

     RETIRE ON USE, NOT ON VIEWS, which is the rule the whole second kind
     rests on. A hint about highlighting is finished the moment somebody
     highlights something, which means the app never explains a thing to
     somebody who has already found it. Called from wherever the thing
     actually happens, and calling it for a hint that never ran is fine and
     is in fact the common case: somebody who found the feature on their own
     retires its hint before ever seeing it.
     ---------------------------------------------------------------------- */

  function noteUse(id) {
    if (!id || !HC.store.noteHint) return;
    if (HC.store.hintState(id).used) return;
    HC.store.noteHint(id, { used: true });
    if (current && current.id === id) end('used');
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

    /* Counted once, here, and read by every screen hint's minLaunch. */
    if (HC.store.countLaunch) HC.store.countLaunch();

    var eligible = function (kind) {
      return specs.slice().filter(function (sp) {
        return (sp.kind || 'launch') === kind;
      }).sort(function (a, b) {
        return (a.order || 100) - (b.order || 100);
      });
    };

    var runFirst = function (kind) {
      var queue = eligible(kind);
      for (var i = 0; i < queue.length; i++) {
        show(queue[i]);
        if (current) return;
      }
    };

    // The launch hint, off the moment the greeting lifts.
    var start = function () {
      delayTimer = window.setTimeout(function () {
        delayTimer = 0;
        runFirst('launch');
        // Nothing to wait for: no launch hint was eligible, so the screen
        // hints holding behind this can go as soon as they are ready.
        if (!current) settleLaunch();
      }, DELAY);
    };

    if (HC.splash && HC.splash.whenGone) HC.splash.whenGone(start);
    else start();

    /* Screen hints. One try per arrival, not one per repaint: several screens
       re-render in place and the Group room does it every eight seconds, so
       keying off the route rather than off the event is what stops a room
       being offered a hint seven times a minute.

       SETTLE lets the screen paint and any arriving swipe finish first, so a
       hint is never drawn on top of a transition. */
    var arrive = function (name) {
      window.clearTimeout(settleTimer);
      if (!name || name === thisVisit) return;
      thisVisit = name;

      settleTimer = window.setTimeout(function () {
        settleTimer = 0;
        // Not on top of the greeting. On a cold launch this timer is running
        // long before the splash has finished its own sequence.
        var go = function () { afterLaunchSlot(function () { runFirst('screen'); }); };
        if (HC.splash && HC.splash.showing && HC.splash.showing()) {
          if (HC.splash.whenGone) HC.splash.whenGone(go);
          return;
        }
        go();
      }, SETTLE);
    };

    HC.store.on('view', function (route) {
      arrive(route ? route.name : null);
    });

    /* THE FIRST SCREEN IS NOT AN EVENT. js/router.js emits `view` for Home
       from start(), which boot() calls before this file is armed, so the
       arrival everybody actually opens the app onto is the one arrival the
       subscriber above can never hear. Seeding it here is what makes a hint
       on Home possible at all, and leaving it out is a bug that hides
       perfectly: every other screen works, so it reads as "hints are fine,
       Home just does not have one". */
    var here = HC.router && HC.router.current ? HC.router.current() : null;
    if (here) arrive(here.name);
  }

  /* Fired by whatever just finished, for the third kind. Not on a timer and
     not on arrival: the moment somebody completes something is the one moment
     they would understand where it went. */
  function after(id) {
    var spec = null;
    for (var i = 0; i < specs.length; i++) {
      if (specs[i].id === id) spec = specs[i];
    }
    if (!spec) return;
    window.setTimeout(function () { show(spec); }, 350);
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
    after: after,
    noteUse: noteUse,
    end: function () { end('asked'); },

    /* Asked by js/index-rail.js before its own opening swell, so the two do
       not arrive on top of each other two seconds into the same launch. Its
       standing thirty second offer is unaffected: by then this is long gone. */
    busy: function () { return !!current || !!delayTimer; },

    /* Forget every hint this phone has been shown or has retired, so they all
       come round again. There is no button for this and there should not be
       one: the switch in Your account turns hints off, and a person who has
       learned something does not need to be taught it again. It exists for
       testing on a real phone, where normal use retires a hint permanently
       after one swipe, and it is what Erase everything calls. */
    reset: function () {
      if (HC.store.resetHints) HC.store.resetHints();
      ranThisLaunch = false;
      screenRuns = 0;
      lastShown = 0;
      thisVisit = null;
    },

    // For the tests, and for anything that needs the policy without the DOM.
    shouldShow: shouldShow,
    context: context
  };

})(window.HC = window.HC || {});
