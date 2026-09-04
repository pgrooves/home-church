/* ==========================================================================
   Home Church, pull to sync

   Drag down from the top of any screen and the app goes and asks for
   everything again. A disc comes down out from under the header with the
   finger, its ring closing as it travels; past the mark, letting go sends
   the app off to fetch, the ring turns while it works, and the disc goes
   back up under the header when it lands.

   WHY IT IS SHELL CHROME AND NOT A SCREEN'S BUSINESS. Every screen in this
   app draws content that came from the same place, through js/content.js,
   into the one scroll container the shell owns. So the gesture belongs to
   the app the way the tab bar and the index rail do: no screen has to
   remember it, no screen can disagree about where it lives, and a screen
   added next year has it without anybody wiring anything.

   WHAT A SYNC ACTUALLY IS HERE. Three things, and the pull asks for all
   three because a person pulling down is not making a distinction between
   them:

     js/content.js   guides, sermons, events, announcements, the church's own
                     words. Always, and it is the one that redraws the screen
                     underneath when something has changed.
     js/rooms.js     the group room this phone is in, if it is in one.
     js/journal.js   entries written on another phone, and entries written
                     here that have not gone up yet.

   The last two decline politely when they have nothing to do, which is what
   lets this file ask for them unconditionally rather than keeping a table of
   which screen syncs what.

   WHAT IT KEEPS ITS HANDS OFF. A screen that is not scrolled to the top,
   which is an ordinary scroll and always was. Sideways, which is the tab
   swipe's finger, see js/swipe.js. The first few points from the left edge,
   which is the system back gesture. A finger the index rail has already
   armed on, see HC.indexRail.busy(). Anything typed into. A second finger,
   because that is a pinch and this app deliberately kept zoom. A sheet or
   the overflow menu being up, because the thing under a sheet is not what
   is being touched. And presentation mode, where a leader is standing in
   front of a group and the whole of the chrome is already gone.

   THE ONLY WAY TO ASK, AND THE ONLY ONE THERE SHOULD BE. There is no button
   anywhere that does this too. A second control for the same work is a
   second thing to find, to word, to keep in step, and to be wrong in its own
   way, and this app would rather have one gesture that is true everywhere.
   Your account still says where this phone's content came from, and it says
   it as a fact rather than as a control: see contentLine() in
   js/screens/profile.js.

   WHAT THE APP STILL DOES ON ITS OWN, which is not a way of asking and is
   not competing with this: js/app.js fetches once after the first paint of
   every launch, and js/journal.js and js/rooms.js catch up when the app
   comes back to the foreground. Nobody taps anything for those. The disc is
   for the minute when somebody knows something has changed and is not
   willing to wait for the next launch to find out.

   VoiceOver hears this through the live region js/app.js draws beside the
   disc, so the gesture is not silent to somebody who cannot see it turn.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* How far a finger travels before we decide this is a pull and not a
     scroll that has not started yet. Same number as the tab swipe's, and
     for the same reason. */
  var SLOP = 8;

  /* Down has to beat sideways by this much to take the gesture. A pull that
     drifts across is still a pull; a drag that is mostly sideways belongs to
     js/swipe.js. */
  var AXIS_BIAS = 1.2;

  /* The first few points from the left edge are the system back gesture on
     iOS. Starting anything there means two things reading one finger. */
  var EDGE = 18;

  /* How far the disc has to come down before letting go syncs. Measured on
     the disc, not on the finger: with RESIST below, the thumb travels about
     twice this. */
  var TRIP = 64;

  /* Past the mark the disc keeps moving and keeps slowing, and never reaches
     this. Nothing bounces, nothing overshoots: see the design system, 3g. */
  var MAX = 104;

  /* The disc moves this fraction of the finger up to the mark. Half, so the
     gesture feels weighted rather than stuck to the glass. */
  var RESIST = 0.5;

  /* Where the disc waits while the fetch is out. Under the mark, so letting
     go visibly settles rather than parking where the thumb left it. */
  var REST = 52;

  /* The least time the disc is allowed to be on screen once it is turning.
     A sync off a warm cache can land in 80ms, and a disc that appears and
     vanishes inside a tenth of a second reads as a glitch rather than as an
     answer. */
  var FLOOR = 650;

  /* The ring's circumference, r=13 in a 36 unit box. Written here because
     the dash offset is set from JavaScript frame by frame and the number has
     to be the same one css/components.css draws with. */
  var RING = 81.68;

  var scroller = null;
  var el = null;        // the fixed layer the disc rides on
  var disc = null;
  var arc = null;
  var live = null;

  var g = null;         // the gesture in flight, null between gestures
  var working = false;  // a sync is out
  var settleTimer = null;

  /* ------------------------------------------------------------ the shape */

  /* Where the disc sits for a finger that has come down dy.

     Linear to the mark and asymptotic past it, so the gesture is honest
     about how far is left and then quietly firm about there being no more.
     No spring, nothing to overshoot and come back from. */
  function travel(dy) {
    if (dy <= 0) return 0;
    var d = dy * RESIST;
    if (d <= TRIP) return d;
    var room = MAX - TRIP;
    return TRIP + room * (1 - Math.exp(-(d - TRIP) / room));
  }

  /* Is this finger ours? Called once, on the first move that is big enough
     to have an opinion. Returns 'no' to hand the finger back for good,
     'wait' when it is still too early to say, and 'yes' to take it. */
  function claim(dx, dy) {
    if (Math.abs(dx) >= SLOP && Math.abs(dx) > dy) return 'no';   // the tab swipe's
    if (dy <= -SLOP) return 'no';                                 // a scroll, upward
    if (dy < SLOP) return 'wait';
    if (dy < Math.abs(dx) * AXIS_BIAS) return 'wait';
    return 'yes';
  }

  /* --------------------------------------------------------------- the disc */

  function state(name) {
    if (el) el.setAttribute('data-state', name);
  }

  function say(words) {
    if (live) live.textContent = words;
  }

  /* Written frame by frame while a thumb is down, so nothing transitions:
     a transition here would be a second opinion about a number the finger
     is already deciding. See the same note in js/index-rail.js. */
  function place(at) {
    var p = Math.min(1, at / TRIP);
    el.style.transform = 'translate3d(0,' + at.toFixed(1) + 'px,0)';
    disc.style.opacity = Math.min(1, at / 20).toFixed(3);
    disc.style.transform = 'scale(' + (0.62 + 0.38 * p).toFixed(3) + ')';
    arc.style.strokeDashoffset = (RING * (1 - p)).toFixed(2);
  }

  /* Hand the numbers back to the stylesheet. Inline styles beat it, so the
     turning ring and the way back up cannot happen until these are gone. */
  function unpin() {
    el.style.transform = '';
    disc.style.opacity = '';
    disc.style.transform = '';
    arc.style.strokeDashoffset = '';
  }

  /* The one place a transition is wanted: letting go. On for the length of
     the settle and off again, so the next finger down starts from a disc
     that is not still easing somewhere. */
  function settling(on, ms) {
    window.clearTimeout(settleTimer);
    el.setAttribute('data-settling', on ? 'true' : 'false');
    if (on) {
      settleTimer = window.setTimeout(function () {
        el.setAttribute('data-settling', 'false');
      }, ms);
    }
  }

  function retract() {
    settling(true, 280);
    unpin();
    state('off');
  }

  /* ------------------------------------------------------------ the syncing */

  // A refusal from one of these is not a reason to fail the whole pull.
  function soft(p) {
    return Promise.resolve(p).catch(function () { return null; });
  }

  function jobs() {
    var out = [];

    out.push(soft(HC.content.refresh()));

    // Both decline on a phone with nothing to do: no room, or nobody signed
    // in. See pull() in js/rooms.js and canSync() in js/journal.js.
    if (HC.rooms && HC.rooms.refresh) out.push(soft(HC.rooms.refresh()));
    if (HC.journal && HC.journal.canSync && HC.journal.canSync()) {
      out.push(soft(HC.journal.sync()));
    }

    return Promise.all(out);
  }

  /* What the phone has to say about the round trip afterwards. Silence when
     it worked, because js/content.js has already redrawn whatever changed
     and a toast on top of that is the app congratulating itself. A word only
     when nothing came back, because that is the case where the screen looks
     exactly the same and the reason is not on it. */
  function report() {
    var s = HC.content.state();
    if (s.status === 'offline' || s.status === 'error') {
      HC.components.toast('No signal. This is what the phone already had.');
      say('Offline. Nothing new could come in.');
      return;
    }
    if (s.status === 'partial') {
      HC.components.toast('Some of it came through. We will finish when the signal is better.');
      say('Some content came through.');
      return;
    }
    say('Up to date.');
  }

  /* Go and get everything. The disc is already down and turning by the time
     this is called, and it stays down for at least FLOOR so a fast answer
     still reads as an answer. */
  function run() {
    working = true;
    state('syncing');
    say('Checking for new content.');

    settling(true, 280);
    unpin();
    el.style.transform = 'translate3d(0,' + REST + 'px,0)';

    var started = Date.now();

    return jobs().then(function () {
      var left = Math.max(0, FLOOR - (Date.now() - started));
      return new Promise(function (done) { window.setTimeout(done, left); });
    }).then(function () {
      report();
      working = false;
      retract();
      return true;
    }).catch(function () {
      working = false;
      retract();
      return false;
    });
  }

  /* ------------------------------------------------------------- the guards */

  function typingTarget(node) {
    return !!(node && node.closest &&
      node.closest('input, textarea, select, [contenteditable="true"]'));
  }

  /* Is the app in a state where a pull means anything? */
  function open() {
    if (!el || working) return false;
    if (!HC.content.isConfigured()) return false;

    var route = HC.router.current();
    if (!route) return false;

    /* Presentation mode takes the whole screen and every other piece of
       chrome is already gone. A leader standing in front of a group does not
       need the slide to go and fetch itself. Same rule as redraw() in
       js/content.js. */
    if (route.name === 'present') return false;

    // The thing under a sheet is not the thing being touched.
    if (HC.overflow && HC.overflow.isOpen()) return false;
    if (document.querySelector('.hc-sheet')) return false;

    return true;
  }

  /* -------------------------------------------------------------- gestures */

  function onStart(evt) {
    if (evt.touches.length !== 1) return;
    if (g || !open()) return;

    // An ordinary scroll, and it always was.
    if (scroller.scrollTop > 0) return;

    /* The index rail arms on pointerdown, which fires before this, so by now
       it has already said whether the right edge of the screen is its
       finger. Both files read the same one, and only one of them holds it.
       See js/index-rail.js. */
    if (HC.indexRail && HC.indexRail.busy && HC.indexRail.busy()) return;

    var touch = evt.touches[0];
    if (touch.clientX <= EDGE) return;
    if (typingTarget(evt.target)) return;

    g = { startX: touch.clientX, startY: touch.clientY, at: 0, pulling: false, tripped: false };
  }

  function onMove(evt) {
    if (!g) return;

    // A pinch. Put the disc back and leave the fingers to the browser.
    if (evt.touches.length > 1) {
      if (g.pulling) retract();
      g = null;
      return;
    }

    var touch = evt.touches[0];
    var dx = touch.clientX - g.startX;
    var dy = touch.clientY - g.startY;
    var down = dy > 0 && dy > Math.abs(dx);

    /* REFUSED BEFORE IT IS CLAIMED, AND THAT ORDER MATTERS.

       This screen is already at the top, so a finger going down has nothing
       left to scroll: all it can produce is the platform's own rubber band,
       and a rubber band stretching under our disc is two answers to one
       finger. So the move is refused from the first one that is going down,
       which is before the block below has decided this is a pull at all.

       It cannot wait for that decision. WebKit reads the first touchmove of a
       sequence to decide whether a scroll is starting, and once it has
       started one, preventDefault on the moves after it is ignored. A slop
       measured first and a refusal sent second is a refusal that arrives
       after the bounce has begun, which is exactly the class of thing that
       looks fine on a desktop and is wrong in the hand. */
    if ((down || g.pulling) && evt.cancelable) evt.preventDefault();

    if (!g.pulling) {
      var verdict = claim(dx, dy);
      if (verdict === 'wait') return;
      if (verdict === 'no') { g = null; return; }

      // The scroller can have moved under us between touchstart and here.
      if (scroller.scrollTop > 0) { g = null; return; }

      g.pulling = true;
      // The slop comes out of the travel, so the disc starts from under the
      // finger rather than jumping the eight points it took to decide.
      g.slop = dy;
      settling(false);
      state('pulling');
    }

    g.at = travel(dy - g.slop);
    place(g.at);

    // One tap at the mark, the way a switch has a detent, so the answer to
    // "is that far enough" arrives through the thumb rather than the eye.
    if (g.at >= TRIP && !g.tripped) {
      g.tripped = true;
      state('ready');
      HC.native.tap('Light');
    } else if (g.at < TRIP && g.tripped) {
      g.tripped = false;
      state('pulling');
    }
  }

  function onEnd() {
    if (!g) return;
    var far = g.pulling && g.at >= TRIP;
    var pulled = g.pulling;
    g = null;
    if (far) run();
    else if (pulled) retract();
  }

  function onCancel() {
    if (!g) return;
    if (g.pulling) retract();
    g = null;
  }

  /* ------------------------------------------------------------------- api */

  function init(config) {
    scroller = config.scroller;
    el = config.pull;
    disc = el.querySelector('.hc-pull__disc');
    arc = el.querySelector('.hc-pull__arc');
    live = config.live;

    scroller.addEventListener('touchstart', onStart, { passive: true });
    // Not passive: a pull has to be able to say it is not a scroll.
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd);
    scroller.addEventListener('touchcancel', onCancel);
  }

  HC.pull = {
    init: init,
    isSyncing: function () { return working; },

    // Exported for the tests and for nothing else.
    _travel: travel,
    _claim: claim
  };

})(window.HC = window.HC || {});
