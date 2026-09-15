/* ==========================================================================
   Home Church, swipe between tabs

   Drag left or right anywhere on a tab and the next one comes with your
   thumb. It is continuous, not a flick that fires an animation afterwards:
   the screen you are leaving and the screen you are arriving at move together
   under the finger, and let go early and they spring back where they were.

   THE ROW IS LONGER THAN THE BAR. It runs the five tabs and then the modules
   behind •••, so Guide, the last of the five, is no longer where a drag
   stops. The bar cannot follow that far, having six tiles and more stops than
   that, so the tile parks on ••• and the sheet says which module you are on.
   How many stops there are is not fixed: an admin has one more, Admin itself,
   at the end.
   See HC.router.stops().

   AND THE DRAG IS LONGER THAN THE ROW, BY ONE. Settings is the last tile in
   the sheet and it is not a stop, so for a while it was the one tile in there
   a drag could not reach. It is the end of the line now: a drag left off the
   last stop, which is Admin on the phones that have it and Give on the rest,
   brings Settings in, and a drag right off Settings goes back to it. What
   arrives is still a pushed view, with the arrow and the title it has when the
   initials in the top bar open it. HC.router.lane() is the row plus that, and
   HC.router.laneIndex() is what this file asks of the view on screen.

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
   back gesture already owns horizontal travel. Settings is the one pushed view
   that is in the lane, and it is safe there because the first few points from
   the left edge are handed back to the system either way, see onStart.
   Anything typed into, which on Settings is most of the screen. A rail
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

  /* --- the hint's numbers, and where they came from ----------------------

     The screen leans toward the next tab and comes back, twice, the second
     time less far. See the long note above runHint().

     64px, AND WHY IT IS NOT 22. It was 22 first, over empty paper, on the
     reasoning that the movement alone says the screens move. Watched in the
     app, that turned out to say the wrong thing: it reads as *this screen
     wobbled*, not as *there is another screen over there*. The fix is not a
     bigger wobble, it is showing the thing — 64px is the first number that
     clears the 20px page gutter (`--hc-screen-pad`) with enough left over,
     about 44px, for the first few characters of the next screen's heading to
     come into view. Somebody sees a word that is not on this page, which is
     the whole claim the hint is making.

     It stays an offer rather than a decision because of the two numbers above
     it. LOCK_SLOP is the floor: ten pixels is what a real drag eats before the
     screen moves at all, so anything under it shows less than the gesture's
     own dead zone. COMMIT_PART is the ceiling: a quarter of the width is about
     102px on a 393pt phone, and a lean approaching that reads as the app
     changing tabs and thinking better of it. 64 is comfortably inside both.

     DECAY, and why the second lean is much smaller now. The first lean does
     the teaching and the second is the echo that says this was a gesture
     rather than a glitch. At 0.35 the second is about 22px, which is where the
     whole thing started, and two deep shoves in a row would read as the app
     struggling rather than as a thumb testing something and settling.

     OUT is quicker than BACK on purpose: leaving is deliberate and returning
     is a release. Both are a little longer than they were, because the same
     duration over three times the distance is a different, much brisker
     movement. Neither overshoots. The design system §3g rules out springs, and
     out-and-back is elastic enough without one — the *return* is the hint and
     the *overshoot* is the thing the rule forbids, which are two different
     movements wearing one word. */
  var HINT_AMP   = 64;     // px of the first lean: past the gutter, into the words
  var HINT_DECAY = 0.35;   // and how much of it the second lean is
  var HINT_OUT   = 300;    // ms leaning away
  var HINT_BACK  = 380;    // ms coming back
  var HINT_GAP   = 120;    // ms of rest between the two

  /* How long after the page last moved it still counts as moving. The same
     number and the same reasoning as MOVING in js/index-rail.js: a few frames'
     grace after the last scroll, because a sideways lean drawn under a page
     that is still flying is a smear rather than a demonstration. */
  var HINT_SETTLED = 140;

  var app, scroller, mount, tabbar, totop;
  var deck = null;         // the fixed layer holding the incoming screen
  var g = null;            // the gesture in flight, null between gestures
  var settling = false;    // an animation is finishing
  var finishSettle = null; // ends that animation early, see onStart
  var swallowClick = false;

  var hint = null;         // the lean in flight, null between runs
  var hintUsed = false;    // a real drag has happened: nothing left to point at
  var hintPane = null;     // the next screen, rendered, while the lean is up
  var hintSide = 0;        // which side it is parked on
  var scrollAt = 0;        // when the page last moved. See hintContext().

  function reducedMotion() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Everywhere the drag can land, in order: the five tabs, then the modules
     behind •••, then Settings. Connect used to be the end of the line. */
  function lane() {
    return HC.router.lane();
  }

  /* The bar has one more tile than it has tabs, and the last one is •••. Past
     Connect every module lights that same tile, so the travelling tile stops
     there rather than sliding off the end of a bar that has nowhere further
     to go. See paintTabs in js/app.js, which lands on the same number. */
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

    var name = lane()[g.index + dir];
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

    /* The tile under the tab bar is placed by a custom property that the CSS
       multiplies by its own width, so a fraction of a tab is a fraction of the
       travel. It rides the finger for free, as far as ••• and no further.

       PLACED WHETHER OR NOT THE BAR IS THE NAVIGATION ON THIS PHONE. On a
       phone set to 'button' the bar is display:none and this is one custom
       property written to an element nobody can see, which is cheaper than
       asking the store the question sixty times a second and means the bar is
       already in the right place if somebody switches back to it. */
    var progress = Math.max(-1, Math.min(1, -dx / g.width));
    var at = Math.min(g.index + progress, tileLimit());
    tabbar.style.setProperty('--hc-tab-index', at.toFixed(4));
  }

  function begin(dir) {
    g.dragging = true;
    g.width = scroller.clientWidth || window.innerWidth || 1;

    /* They have found it. That is the end of the hint for this launch, whether
       or not this drag goes on to commit: somebody who has dragged the screen
       sideways knows the screens move sideways. The rail's rule, and a
       relaunch starts it over. */
    noteHintUse();

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
    var name = dir ? lane()[g.index + dir] : null;
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
           the bar cannot name.

           ON A PHONE SET TO 'button' THIS DOES NOTHING, and the gesture is not
           the place that knows so. HC.overflow in js/app.js is the one door
           both navigations are behind, and it answers for whichever is on. */
        if (HC.overflow) HC.overflow.arrived(name);
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

  /* =============================================================== the hint

     The five tabs swipe and nothing on any screen says so. HINTS.md §8 has it
     in Tier 1 and calls it "a whole navigation model nothing announces".

     WHAT IT DRAWS. The screen leans toward the next tab by 22px and comes
     back, then again by less, and that is the whole of it. No overlay, no
     caption, no arrow: the gesture performs a little of itself, which is the
     house style §2 of that document takes off the index rail. "The hint is the
     thing itself moving."

     WHY IT IS NOT DRAWN OVER THE TAB BAR, WHICH IS THE POINT. §8 assigned this
     a shape called travel, a swell moving along the bar, and §12 blames that
     shape for the stutter that got the whole hints feature reverted: it
     animated background-position across the plinth, and the plinth carries
     backdrop-filter: blur(22px) saturate(150%), so every frame re-composited a
     live blur on a phone GPU. §12 asks for it to be "rebuilt, or dropped".
     This drops it. One transform on #hc-view, which is the same property
     place() writes sixty times a second while a finger is down, and nothing at
     all is drawn over the bar. The travelling tile is deliberately left alone
     for the same reason: it rides a finger, not a clock.

     That is a shape argument and not a measurement, and §12 is explicit that
     the measurement is the part still owed.

     THE CLOCK IS THE RAIL'S. js/index-rail.js already hints two seconds after
     the greeting lifts and every thirty seconds after that. This does not
     start a second timer; it takes turns on that one, so only one thing ever
     moves. See beat() over there.

     WHAT ENDS IT. Its own timeline, about 1.3 seconds, and that is very nearly
     the only way. There is no tap listener: the hint is already leaving, and
     nothing is drawn in front of anything, so every tap during it lands on
     whatever is underneath exactly as it would have.

     RETIRE ON USE. The first real drag ends it for the launch, in begin()
     below. There is nothing left to point at once somebody has found it, which
     is the rail's own rule, and a relaunch starts it over. Nothing is stored.

     AND A FINGER LANDING MID LEAN TAKES THE OFFSET OVER rather than finding
     the screen snapped back to zero. See onStart. js/index-rail.js does the
     same thing with its swell in stopHint(keep), for the same reason: a hint
     that drops what it was holding the moment you answer it is a hint you feel
     glitch. */

  function hintSmooth(p) { return p * p * (3 - 2 * p); }
  function hintRelease(p) { return 1 - Math.pow(1 - p, 3); }

  /* Which way there is something to go. Left by default, because left is
     further into the row; right only when left is the end of the line. +1 is
     the next stop, which is the screen travelling left under a finger going
     left, the same sign place() uses. */
  function hintDir(i) {
    if (i < 0) return 0;
    var row = HC.router.lane();
    if (row[i + 1]) return 1;
    if (row[i - 1]) return -1;
    return 0;
  }

  /* The whole of the policy, in the order the answers are wanted, so the first
     line that says no is the reason it is quiet. Pure, and exported at the
     bottom, because that is what makes tests/swipe-hint.test.js possible and
     because HINTS.md §5 is right that the policy is where the bugs that matter
     live. */
  function hintPolicy(ctx) {
    if (!ctx.hintsOn) return false;       // the one switch in Your account
    if (ctx.used) return false;           // they have swiped, so this is over
    if (ctx.still) return false;          // see the note in hintLive()
    if (ctx.laneIndex < 0) return false;  // a pushed view: nothing swipes here
    if (!ctx.dir) return false;           // nowhere to lean, so nothing honest to say
    if (ctx.busy) return false;           // a finger is down, or a settle is in flight
    if (ctx.sheetOpen) return false;      // something else owns the glass
    if (ctx.editing) return false;        // an admin is mid sentence
    if (ctx.hidden) return false;         // nobody is there
    if (ctx.scrolling) return false;      // a lean under a moving page is a smear
    return true;
  }

  /* What hintPolicy() would say right now, and the first reason it would say
     no, by name. Nothing in the app calls this. It exists for a console on a
     real phone, because a hint that does not appear is indistinguishable from
     one that is switched off, from one already retired, from a screen it does
     not belong on, and from a stale bundle — and not being able to tell those
     apart is what cost the last attempt a revert. HINTS.md §12, point 3.

         HC.swipe.explain()

     THE ORDER OF THIS LIST IS hintPolicy()'S ORDER, and it has to stay that
     way or this reports a rule that is not the one that actually stopped it.
     tests/e2e/swipe-hint.js checks the two ends of that agreement. */
  function explain() {
    var ctx = hintContext();
    var reasons = [
      [!ctx.hintsOn, 'Hints is off in Your account'],
      [ctx.used, 'retired for this launch: something has already been dragged sideways'],
      [ctx.still, 'Reduce Motion is on, and this hint is entirely motion'],
      [ctx.laneIndex < 0, 'a pushed view, so nothing swipes here'],
      [!ctx.dir, 'nowhere to lean from this screen'],
      [ctx.busy, 'a finger is down, a settle is in flight, or it is already leaning'],
      [ctx.sheetOpen, 'the navigation is open'],
      [ctx.editing, 'Edit mode is on'],
      [ctx.hidden, 'the app is in the background'],
      [ctx.scrolling, 'the page is still moving']
    ];
    for (var i = 0; i < reasons.length; i++) {
      if (reasons[i][0]) return 'no: ' + reasons[i][1];
    }
    return 'yes: it would lean ' + (ctx.dir > 0 ? 'left' : 'right') + ' toward ' +
           HC.router.lane()[ctx.laneIndex + ctx.dir] + ' on its next turn';
  }

  function hintContext() {
    var i = HC.router.laneIndex(HC.router.current());
    var nav = app ? app.getAttribute('data-navmenu') : null;
    var sheet = app ? app.getAttribute('data-oversheet') : null;
    return {
      /* One switch for every hint there will ever be, asked of the file that
         owns it rather than re-read from the profile here, so there is one
         answer and not two that have to agree. HINTS.md §9. */
      hintsOn: HC.hints && HC.hints.isOn ? HC.hints.isOn() : true,
      used: hintUsed,
      still: reducedMotion(),
      laneIndex: i,
      dir: hintDir(i),
      busy: !!g || settling || !!hint,
      /* Either navigation, opened. The same question js/hints.js asks, for the
         same reason: only one of the two can be on a phone, so asking both is
         asking one, and 'closed' and 'fade' are on their way out. */
      sheetOpen: nav === 'open' || sheet === 'open' || sheet === 'peek',
      editing: !!(HC.edit && HC.edit.isOn && HC.edit.isOn()),
      hidden: document.hidden,
      scrolling: (Date.now() - scrollAt) < HINT_SETTLED
    };
  }

  /* Lean, return, a beat, then a smaller lean and a smaller return. Written
     out as a timeline rather than computed per frame, because the shape of the
     movement is the whole design and it should be legible in one place. */
  function hintLegs(dir) {
    var legs = [];
    for (var i = 0; i < 2; i++) {
      var to = -dir * HINT_AMP * Math.pow(HINT_DECAY, i);
      legs.push({ from: 0, to: to, ms: HINT_OUT, ease: hintSmooth });
      legs.push({ from: to, to: 0, ms: HINT_BACK, ease: hintRelease });
      if (!i) legs.push({ from: 0, to: 0, ms: HINT_GAP, ease: hintSmooth });
    }
    return legs;
  }

  /* THE NEXT SCREEN, ACTUALLY RENDERED.

     The first draft of this hint leaned over empty paper, on the reasoning
     that rendering a whole screen to show 22 pixels of it is a cost nobody can
     see on a desk and everybody feels in a hand. That was the right sum and
     the wrong question: 22 pixels of paper is not worth rendering a screen
     for, and it is also not worth *leaning* for, because paper on paper says
     nothing. What earns the render is going deep enough to show a word.

     So this is paneFor() without a gesture around it, building the same
     element into the same layer with the same class, which is what lets a
     finger landing mid lean take the whole thing over rather than watching it
     blink out and be built again. See onStart.

     One render per hint, torn down after. That is the cost a single swipe
     already pays, once a minute, and it is the price of the hint saying
     anything at all. */
  function makeHintPane(dir) {
    var name = lane()[HC.router.laneIndex(HC.router.current()) + dir];
    var el = name ? HC.router.renderRoute({ name: name }) : null;
    if (!el) return null;

    var pane = document.createElement('div');
    pane.className = 'hc-swipe__pane';
    pane.setAttribute('data-side', dir > 0 ? 'next' : 'prev');
    pane.appendChild(el);
    ensureDeck().appendChild(pane);
    return pane;
  }

  /* Returns whether it actually ran, which is what lets the rail hand its turn
     to whichever of the two has something to say. */
  function runHint() {
    if (!mount) return false;
    var ctx = hintContext();
    if (!hintPolicy(ctx)) return false;

    /* No pane, no lean. A 64px lean onto bare paper is worse than the 22px one
       it replaced: it is the same empty gesture, three times as loud. */
    var pane = makeHintPane(ctx.dir);
    if (!pane) { tidyDeck(); return false; }

    hintPane = pane;
    hintSide = ctx.dir;
    hint = {
      legs: hintLegs(ctx.dir), leg: 0, at: 0, x: 0,
      width: scroller.clientWidth || window.innerWidth || 1
    };
    mount.classList.add('hc-view-dragging');
    placeHint(0);
    window.requestAnimationFrame(hintFrame);
    return true;
  }

  // The deck belongs to whichever of the two put something in it.
  function tidyDeck() {
    if (deck && !deck.childNodes.length && deck.parentNode) {
      deck.parentNode.removeChild(deck);
      deck = null;
    }
  }

  function hintFrame(now) {
    if (!hint) return;
    if (!hint.at) hint.at = now;

    var leg = hint.legs[hint.leg];
    var p = (now - hint.at) / leg.ms;

    if (p >= 1) {
      hint.leg++;
      hint.at = 0;
      if (hint.leg >= hint.legs.length) { endHint(false); return; }
      window.requestAnimationFrame(hintFrame);
      return;
    }

    hint.x = leg.from + (leg.to - leg.from) * leg.ease(p < 0 ? 0 : p);
    placeHint(hint.x);
    window.requestAnimationFrame(hintFrame);
  }

  /* Exactly place()'s arithmetic, on one pane instead of two. Written the same
     way on purpose: the pane ends up at the same coordinate the drag would
     have put it at, so handing it over costs nothing and moves nothing. */
  function placeHint(x) {
    mount.style.transform = 'translate3d(' + x.toFixed(2) + 'px, 0, 0)';
    if (hintPane) {
      hintPane.style.transform =
        'translate3d(' + (hintSide * hint.width + x).toFixed(2) + 'px, 0, 0)';
    }
    /* The tile under the tab bar is NOT placed, and that is the difference
       between a hint and a half-done navigation. It rides a finger, because a
       finger is a decision. A tile that slides a quarter of the way to Cal
       every minute is the app saying it is going somewhere it is not. */
  }

  /* Ends whatever is leaning and answers with where the screen had got to.

     `keep` is for a caller that is taking the movement over: it leaves the
     transform and the rendered pane exactly where they are, and whoever passed
     it is then responsible for both. Everything else puts the screen back and
     takes the pane down. */
  function endHint(keep) {
    if (!hint) return 0;
    var x = hint.x;
    hint = null;

    if (keep) return x;

    if (hintPane && hintPane.parentNode) hintPane.parentNode.removeChild(hintPane);
    hintPane = null;
    hintSide = 0;
    tidyDeck();
    mount.style.transform = '';
    mount.classList.remove('hc-view-dragging');
    return x;
  }

  /* The pane the lean had up, handed to the gesture that interrupted it, at
     the coordinate the gesture would have built it at. Returns null when there
     was no lean, which is the ordinary case. */
  function claimHintPane() {
    if (!hintPane) return null;
    var claimed = { el: hintPane, dir: hintSide };
    hintPane = null;
    hintSide = 0;
    return claimed;
  }

  function noteHintUse() {
    endHint(true);       // a drag is already writing to the same transform
    hintUsed = true;
  }

  /* Could this hint still have anything to say before the app is closed?
     Asked by the clock in js/index-rail.js, which the two of them share: once
     neither has anything left, the interval stops rather than waking every
     thirty seconds forever to ask a question whose answer cannot change.

     REDUCE MOTION REFUSES OUTRIGHT, which is the rail's rule rather than the
     guide hint's. That one degrades, because it is information and there is
     something left of it holding still: the marker and the words are simply
     there. This one is entirely movement. There is nothing left of it to show,
     and a still version would be a different hint wearing the same name. */
  function hintLive() {
    return !hintUsed && !reducedMotion();
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
       to the row. Settings is the other way round, a pushed view that the drag
       does run through. See HC.router.laneIndex. */
    var route = HC.router.current();
    var index = HC.router.laneIndex(route);
    if (index < 0) return;

    var touch = evt.touches[0];
    if (typingTarget(evt.target)) return;

    // The first few points from the left edge are the system back gesture on
    // iOS. Starting a tab swipe there would mean two things reading the same
    // finger, and the one that is not ours wins.
    if (touch.clientX <= 18) return;

    /* A FINGER LANDING MID LEAN TAKES THE LEAN OVER, PANE AND ALL. Not zero
       and start again: that is a jump of up to 64px at the exact moment
       somebody has answered the hint, and the whole claim this hint makes is
       that it is the gesture. The screen's offset is folded into the travel
       below, and the next screen the lean had already rendered becomes this
       gesture's own pane rather than being torn down and built again one frame
       later — which would show the app's ground through the gap it left. */
    var carried = endHint(true);
    var claimed = claimHintPane();

    g = {
      target: evt.target,
      startX: touch.clientX,
      startY: touch.clientY,
      carried: carried,
      dx: carried,
      lastDx: carried,
      lastT: Date.now(),
      velocity: 0,
      index: index,
      width: scroller.clientWidth || window.innerWidth || 1,
      panes: {},
      dragging: false,
      flat: reducedMotion(),
      totopWas: null
    };

    // paneFor() finds it already built and placed, and never renders a second
    // copy of a screen that is on the glass.
    if (claimed) g.panes[claimed.dir] = claimed.el;
  }

  /* A TOUCH THAT NEVER BECAME A DRAG, AND WHY IT HAS WORK TO DO NOW.

     It used to be enough to forget the gesture: nothing had moved, so there
     was nothing to put back. Since the hint hands its lean over on touchstart,
     a touch that turns out to be a tap or a scroll can be holding a screen
     offset by up to 64px and a rendered pane behind it, and dropping the
     reference would leave both on the glass with nothing left running to take
     them down. So the gesture gives back whatever it was handed.

     `carried` is the test rather than `dragging`, because this only ever has
     anything to undo when a lean was interrupted. */
  function dropGesture() {
    if (!g) return;
    if (g.carried) {
      mount.style.transform = '';
      mount.classList.remove('hc-view-dragging');
    }
    [-1, 1].forEach(function (dir) {
      var pane = g.panes[dir];
      if (pane && pane.parentNode) pane.parentNode.removeChild(pane);
    });
    g = null;
    tidyDeck();
  }

  function onMove(evt) {
    if (!g || settling) return;

    // A pinch. Put everything back and leave the finger to the browser.
    if (evt.touches.length > 1) {
      if (g.dragging) settle(0);
      else dropGesture();
      return;
    }

    var touch = evt.touches[0];
    var dx = touch.clientX - g.startX;
    var dy = touch.clientY - g.startY;

    if (!g.dragging) {
      if (Math.abs(dy) > LOCK_SLOP && Math.abs(dy) >= Math.abs(dx)) {
        dropGesture();          // a scroll, and it always was
        return;
      }
      if (Math.abs(dx) < LOCK_SLOP || Math.abs(dx) < Math.abs(dy) * AXIS_BIAS) return;

      if (railWants(g.target, dx < 0 ? 1 : -1)) {
        dropGesture();
        return;
      }
      begin(dx < 0 ? 1 : -1);
    }

    // The slop is taken out of the travel, so the screen starts from under the
    // finger instead of jumping the ten pixels it took to decide, and whatever
    // the hint was leaning goes back in, so it carries on from there.
    dx = dx - g.slop + g.carried;

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
    if (!g.dragging) { dropGesture(); return; }

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
    else dropGesture();
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

    /* Nothing but a timestamp, and passive so it cannot slow a scroll down.
       The hint asks it whether the page is still moving: see hintContext(). */
    scroller.addEventListener('scroll', function () {
      scrollAt = Date.now();
    }, { passive: true });

    /* A LEAN BELONGS TO THE SCREEN IT STARTED ON. Anything floating over a
       screen goes when that screen does, which is the rule js/hints.js keeps
       with its own layer and js/highlight.js with its bar. It matters more
       here than it reads: the lean is holding a rendered copy of the *old*
       screen's neighbour, so a tab tapped mid lean would slide the new screen
       over to show the wrong page entirely, and hold it there for the second
       or so the timeline had left. HC.emitViewChange in js/app.js publishes
       this on every view change. */
    if (HC.store && HC.store.on) {
      HC.store.on('view', function () { endHint(false); });
    }

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

  HC.swipe = {
    init: init,

    /* The hint. Asked by the clock in js/index-rail.js, which the two of them
       share so that only one thing ever moves at a time. hint() answers
       whether it actually ran, so a turn nobody can use goes to the other one
       rather than being spent on nothing. */
    hint: runHint,
    hintLive: hintLive,
    endHint: endHint,

    /* For a console on a real phone: the first rule that is stopping it, by
       name. See the note above explain(). */
    explain: explain,

    hintPolicy: hintPolicy    // exported for tests/swipe-hint.test.js
  };

})(window.HC = window.HC || {});
