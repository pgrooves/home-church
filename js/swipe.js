/* ==========================================================================
   Home Church, swipe between tabs

   Drag left or right anywhere on a tab and the next one comes with your
   thumb. It is continuous, not a flick that fires an animation afterwards:
   the screen you are leaving and the screen you are arriving at move together
   under the finger, and let go early and they spring back where they were.

   THE ROW IS LONGER THAN THE BAR. It runs the five tabs and then the modules
   behind •••, so Connect is no longer where a drag stops. The bar cannot
   follow that far, having six tiles and more stops than that, so the tile
   parks on ••• and the sheet says which module you are on. How many stops
   there are is not fixed: an admin has one more, Admin itself, at the end.
   See HC.router.stops().

   HOW IT IS PUT TOGETHER. The app has exactly one scroll container, so two
   screens cannot simply sit side by side inside it, and giving each screen
   its own scroller would mean rebuilding the header, the date rail, and the
   scroll memory around a carousel. Instead:

     - the live screen stays exactly where it is, in #hc-view, and is moved
       with a transform. .hc-scroll clips it, so nothing overflows and its
       vertical scroll position is never touched.
     - the screen coming in is rendered into a pane in a fixed layer under
       the chrome, parked one screen width away, and moved by the same amount.

   That means the header, the date rail, and the tab bar hold still while the
   content slides, which is what a tab switch should look like, and it also
   means the gesture cannot lose anybody's place in a screen it is only
   passing over.

   WHEN IT COMMITS. Past about a quarter of the screen, or a flick faster than
   FLICK_SPEED going the same way. Otherwise it goes back. Either way the
   settle is one transition whose duration comes from how far is left to
   travel and how fast the finger was going, so a lazy drag lands slowly and a
   flick lands quickly.

   NOTHING IS RENDERED TWICE. On commit the pane's screen is handed to the
   router, which adopts it as the real view rather than building a second copy
   of it. The layer is removed in the same frame, so there is no repaint
   between the last frame of the animation and the mounted screen.

   WHAT IT KEEPS ITS HANDS OFF. Pushed views like a guide, where the platform
   back gesture already owns horizontal travel. Anything typed into. A rail
   that still has somewhere to scroll, so the Instagram strip on Connect and
   the month strip on Listen are dragged rather than the tab under them. A
   second finger, because that is a pinch and this app deliberately kept zoom.
   And reduced motion, which still gets the gesture, just without the slide.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* How far a finger travels before we decide what this gesture is. Small
     enough that the screen starts moving while it still feels like the same
     motion, large enough that a thumb rolling down a list never trips it. */
  var LOCK_SLOP = 10;

  /* Horizontal has to beat vertical by this much to take the gesture. A
     scroll that drifts sideways is still a scroll. */
  var AXIS_BIAS = 1.2;

  /* Past the first tab and past the last one there is nothing to bring on, so
     the screen follows at a third speed and stops. The pull is the answer:
     it says the gesture was understood and there is nothing over there. */
  var EDGE_PULL = 0.32;

  /* Past this much of the width, letting go finishes the switch. */
  var COMMIT_PART = 0.26;

  /* Or a flick: this fast, in the direction of travel, having moved at least
     FLICK_MIN. px per ms, so 0.45 is a brisk but unhurried throw. */
  var FLICK_SPEED = 0.45;
  var FLICK_MIN = 30;

  /* The settle. Duration is distance over speed, held between these so a
     hair's breadth from the edge still reads as a movement and a full width
     drag never crawls. */
  var SETTLE_MIN = 170;
  var SETTLE_MAX = 380;

  /* Decelerating, and slightly softer than --hc-ease, because this one is
     catching something that was already moving. */
  var SETTLE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

  var app, scroller, mount, tabbar, totop;
  var deck = null;         // the fixed layer holding the incoming screen
  var g = null;            // the gesture in flight, null between gestures
  var settling = false;    // an animation is finishing
  var finishSettle = null; // ends that animation early, see onStart
  var swallowClick = false;

  function reducedMotion() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Everywhere the drag can land: the five tabs, then the modules behind •••.
     Connect used to be the end of the line. */
  function stops() {
    return HC.router.stops();
  }

  /* The bar has one more tile than it has tabs, and the last one is •••. Past
     Connect every module lights that same tile, so the travelling tile stops
     there rather than sliding off the end of a bar that has nowhere further
     to go. See emitViewChange in js/app.js, which lands on the same number. */
  function tileLimit() {
    return HC.router.TABS.length;
  }

  /* --------------------------------------------------------- what to ignore */

  function typingTarget(el) {
    return !!(el && el.closest &&
      el.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe]'));
  }

  /* A horizontal scroller between the finger and the screen keeps the gesture,
     as long as it still has somewhere to go that way. Once it is against its
     end, the next drag belongs to the tabs, which is how a strip inside a page
     behaves everywhere else on a phone.

     dir is +1 toward the next tab, which is a finger moving left, which is a
     rail scrolling right. */
  function railWants(el, dir) {
    var node = el;
    while (node && node !== scroller && node.nodeType === 1) {
      if (node.scrollWidth - node.clientWidth > 2) {
        var overflow = window.getComputedStyle(node).overflowX;
        if (overflow === 'auto' || overflow === 'scroll') {
          var room = dir > 0
            ? node.scrollWidth - node.clientWidth - node.scrollLeft
            : node.scrollLeft;
          if (room > 1) return true;
        }
      }
      node = node.parentNode;
    }
    return false;
  }

  /* ------------------------------------------------------------- the panes */

  function ensureDeck() {
    if (deck) return deck;
    deck = document.createElement('div');
    deck.className = 'hc-swipe';
    // Two copies of the same screen in the accessibility tree, one of them a
    // preview nobody asked for, is worse than no preview at all.
    deck.setAttribute('aria-hidden', 'true');
    app.appendChild(deck);
    return deck;
  }

  /* Built on demand and kept for the rest of the gesture, so reversing over
     the origin costs one render rather than one per direction change. */
  function paneFor(dir) {
    if (g.panes[dir] !== undefined) return g.panes[dir];

    var name = stops()[g.index + dir];
    var el = name ? HC.router.renderRoute({ name: name }) : null;
    if (!el) {
      g.panes[dir] = null;
      return null;
    }

    var pane = document.createElement('div');
    pane.className = 'hc-swipe__pane';
    pane.setAttribute('data-side', dir > 0 ? 'next' : 'prev');
    pane.appendChild(el);
    ensureDeck().appendChild(pane);

    g.panes[dir] = pane;
    return pane;
  }

  /* --------------------------------------------------------------- moving */

  function place(dx) {
    mount.style.transform = 'translate3d(' + dx + 'px, 0, 0)';

    [-1, 1].forEach(function (dir) {
      var pane = g.panes[dir];
      if (pane) {
        pane.style.transform = 'translate3d(' + (dir * g.width + dx) + 'px, 0, 0)';
      }
    });

    // The tile under the tab bar is placed by a custom property that the CSS
    // multiplies by its own width, so a fraction of a tab is a fraction of the
    // travel. It rides the finger for free, as far as ••• and no further.
    var progress = Math.max(-1, Math.min(1, -dx / g.width));
    var at = Math.min(g.index + progress, tileLimit());
    tabbar.style.setProperty('--hc-tab-index', at.toFixed(4));
  }

  function begin(dir) {
    g.dragging = true;
    g.width = scroller.clientWidth || window.innerWidth || 1;

    // Where the drag counts from. Fixed here rather than recomputed per move,
    // so travel stays continuous across the origin: a finger that comes back
    // and carries on the other way brings the other tab with it, in one
    // unbroken movement, instead of jumping the width of the slop.
    g.slop = dir > 0 ? -LOCK_SLOP : LOCK_SLOP;

    if (g.flat) return;

    app.setAttribute('data-swiping', 'true');
    tabbar.setAttribute('data-swiping', 'true');
    mount.classList.add('hc-view-dragging');

    // The disc belongs to how far the outgoing screen is scrolled, and the
    // screen is on its way out. It comes back on a cancel, and the router
    // repaints it on a commit.
    if (totop) {
      g.totopWas = totop.getAttribute('data-show');
      totop.setAttribute('data-show', 'false');
    }

    paneFor(dir);
  }

  /* -------------------------------------------------------------- settling */

  /* Once this has been asked for, it owns the rest of the gesture. A pinch
     that starts one settle and then lifts a finger, which asks for another,
     used to leave two animations racing for the same elements and the second
     one reading a gesture the first had already taken down. */
  function settle(dir) {
    if (settling) return;

    var pane = dir ? g.panes[dir] : null;
    var name = dir ? stops()[g.index + dir] : null;
    var totopWas = g.totopWas;

    if (g.flat || !g.dragging) {
      if (dir && name) HC.router.go({ name: name });
      teardown();
      return;
    }

    var from = g.dx;
    var to = dir ? -dir * g.width : 0;
    var speed = Math.max(Math.abs(g.velocity), 0.4);
    var ms = Math.max(SETTLE_MIN, Math.min(SETTLE_MAX, Math.abs(to - from) / speed));

    settling = true;

    mount.style.transition = 'transform ' + ms + 'ms ' + SETTLE_EASE;
    [-1, 1].forEach(function (side) {
      if (g.panes[side]) {
        g.panes[side].style.transition = 'transform ' + ms + 'ms ' + SETTLE_EASE;
      }
    });

    // The tile stops being placed by hand and finishes the trip on its own,
    // over exactly as long as the screens take, so they arrive together.
    tabbar.style.setProperty('--hc-tab-tween', ms + 'ms');
    tabbar.removeAttribute('data-swiping');
    tabbar.style.setProperty('--hc-tab-index', Math.min(g.index + dir, tileLimit()));

    place(to);

    var settled = false;
    function done() {
      if (settled) return;
      settled = true;
      mount.removeEventListener('transitionend', onEnd);
      window.clearTimeout(timer);

      if (dir && pane) {
        // The pane's screen becomes the real screen. Mounting it and dropping
        // the layer inside one synchronous run means the browser never paints
        // the gap between them.
        var el = pane.firstChild;
        mount.style.transition = '';
        mount.style.transform = '';
        HC.router.go({ name: name }, { adopt: el, animate: false });
        HC.native.tap('Light');

        /* Past Connect the raised tile parks on ••• and stays there, so the
           bar can no longer say which module you are in. The sheet says it:
           it shows itself for a second with that module lit and then goes.
           Only a drag calls this, because only a drag can land you somewhere
           the bar cannot name. See js/app.js. */
        if (HC.overflow) HC.overflow.arrived(name);
        /* A drag that committed is somebody who has found the gesture, so the
           hint about it is finished. This is the one call site, because it is
           the only place a swipe is known to have landed rather than sprung
           back to where it started. */
        if (HC.hints) HC.hints.noteUse('shell.swipe');
      } else if (totop && totopWas) {
        totop.setAttribute('data-show', totopWas);
      }

      teardown();
    }

    function onEnd(evt) {
      if (evt.target === mount) done();
    }

    finishSettle = done;
    mount.addEventListener('transitionend', onEnd);
    // transitionend does not arrive if the frame is dropped or the app is
    // backgrounded mid animation, and a gesture layer that never comes down
    // would leave the app looking frozen.
    var timer = window.setTimeout(done, ms + 120);
  }

  function teardown() {
    if (deck && deck.parentNode) deck.parentNode.removeChild(deck);
    deck = null;

    mount.style.transition = '';
    mount.style.transform = '';
    mount.classList.remove('hc-view-dragging');

    tabbar.removeAttribute('data-swiping');
    tabbar.style.removeProperty('--hc-tab-tween');
    app.removeAttribute('data-swiping');

    g = null;
    settling = false;
    finishSettle = null;
  }

  /* --------------------------------------------------------------- gestures */

  function onStart(evt) {
    if (evt.touches.length !== 1) return;

    // A finger landing while the last one is still settling takes the app
    // over: the animation jumps to where it was already going and this gesture
    // starts from there. Two quick flicks are two tabs, not one tab and a
    // dropped gesture, which is what waiting for the settle would mean.
    if (settling && finishSettle) finishSettle();
    if (g) return;

    /* Asked of the whole route, not its name. The Admin menu is the last stop
       in the row and its four sections are pushed views wearing the same
       name, and a drag inside Manage users belongs to that screen rather than
       to the row. See HC.router.isStop. */
    var route = HC.router.current();
    if (!route || !HC.router.isStop(route)) return;

    var touch = evt.touches[0];
    if (typingTarget(evt.target)) return;

    // The first few points from the left edge are the system back gesture on
    // iOS. Starting a tab swipe there would mean two things reading the same
    // finger, and the one that is not ours wins.
    if (touch.clientX <= 18) return;

    g = {
      target: evt.target,
      startX: touch.clientX,
      startY: touch.clientY,
      dx: 0,
      lastDx: 0,
      lastT: Date.now(),
      velocity: 0,
      index: stops().indexOf(route.name),
      width: scroller.clientWidth || window.innerWidth || 1,
      panes: {},
      dragging: false,
      flat: reducedMotion(),
      totopWas: null
    };
  }

  function onMove(evt) {
    if (!g || settling) return;

    // A pinch. Put everything back and leave the finger to the browser.
    if (evt.touches.length > 1) {
      if (g.dragging) settle(0);
      else g = null;
      return;
    }

    var touch = evt.touches[0];
    var dx = touch.clientX - g.startX;
    var dy = touch.clientY - g.startY;

    if (!g.dragging) {
      if (Math.abs(dy) > LOCK_SLOP && Math.abs(dy) >= Math.abs(dx)) {
        g = null;               // a scroll, and it always was
        return;
      }
      if (Math.abs(dx) < LOCK_SLOP || Math.abs(dx) < Math.abs(dy) * AXIS_BIAS) return;

      if (railWants(g.target, dx < 0 ? 1 : -1)) {
        g = null;
        return;
      }
      begin(dx < 0 ? 1 : -1);
    }

    // The slop is taken out of the travel, so the screen starts from under the
    // finger instead of jumping the ten pixels it took to decide.
    dx -= g.slop;

    if (!paneFor(dx < 0 ? 1 : -1)) dx *= EDGE_PULL;

    var now = Date.now();
    if (now > g.lastT) {
      g.velocity = (dx - g.lastDx) / (now - g.lastT);
      g.lastDx = dx;
      g.lastT = now;
    }
    g.dx = dx;

    // Once this is a tab swipe it is not also a scroll. Not every move event
    // can be cancelled, which is why the axis test above is generous about
    // giving vertical the benefit of the doubt.
    if (evt.cancelable) evt.preventDefault();

    if (!g.flat) place(dx);
  }

  function onEnd() {
    if (!g || settling) return;
    if (!g.dragging) { g = null; return; }

    // A finger that dragged is not also a tap, and the browser does not always
    // agree, so the click that may follow is swallowed once.
    swallowClick = true;
    window.setTimeout(function () { swallowClick = false; }, 400);

    var dir = g.dx < 0 ? 1 : -1;
    var far = Math.abs(g.dx) > g.width * COMMIT_PART;
    var flick = Math.abs(g.velocity) > FLICK_SPEED &&
                Math.abs(g.dx) > FLICK_MIN &&
                (g.velocity < 0) === (dir > 0);

    settle((paneFor(dir) && (far || flick)) ? dir : 0);
  }

  function onCancel() {
    if (!g || settling) return;
    if (g.dragging) settle(0);
    else g = null;
  }

  /* ------------------------------------------------------------------- init */

  function init(config) {
    app = document.getElementById('app');
    scroller = config.scroller;
    mount = config.mount;
    tabbar = config.tabbar;
    totop = config.totop;

    scroller.addEventListener('touchstart', onStart, { passive: true });
    // Not passive: a horizontal drag has to be able to say it is not a scroll.
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd);
    scroller.addEventListener('touchcancel', onCancel);

    document.addEventListener('click', function (evt) {
      if (!swallowClick) return;
      swallowClick = false;
      evt.stopPropagation();
      evt.preventDefault();
    }, true);

    // A rotation mid gesture invalidates every width this was measured
    // against. Put it back rather than finish it against the wrong numbers.
    window.addEventListener('resize', function () {
      if (g && g.dragging && !settling) settle(0);
    });
  }

  HC.swipe = { init: init };

})(window.HC = window.HC || {});
