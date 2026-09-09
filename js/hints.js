/* ==========================================================================
   Home Church, hints
   One hint, and the switch that turns hints off.

   WHAT IT SAYS. The words in a guide can be kept. js/highlight.js is the most
   undiscoverable thing in this app by a distance: the bar that offers Note
   this is docked above the tab bar and only exists once something is already
   selected, so there is nothing on screen to find and nothing to point at.
   The hint performs it instead. A sentence marks itself in the app's own
   highlight treatment, a card says what that means, and the bar shows up
   ghosted where the real one will land.

   WHEN. The first time somebody scrolls onto prose in a section they just
   opened by tapping its header. Not on the tap: a fold that fires a hint
   under your thumb is a hint you are looking away from. Scrolling onto the
   words is the moment they have started reading them.

   HOW OFTEN. Once per launch. Not once per section, not once per guide, and
   not once ever: closing the app and opening it again offers it again. There
   is nothing stored anywhere, which is deliberate, and it is why this file
   has no persistence and js/store.js gained one boolean rather than a record.

   WHAT ENDS IT. Two seconds, and then it fades. That is the ordinary way and
   very nearly the only way: leaving the screen, the app going to the
   background, a rotation, the switch in Your account, and starting a
   selection, which is not a dismissal but the thing it was asking for.

   A TAP DOES NOT END IT, AND THE LAYER STILL NEVER TAKES ONE. Those are two
   different sentences and both are true. The layer and every child are
   pointer-events: none in css/components.css, so every tap during those two
   seconds lands on whatever is under it, exactly as it would have. The hint
   simply does not react to it. There is no Got it and no x, because there is
   nothing to dismiss: it is already leaving.

   SCROLLING CARRIES IT rather than ending it. It is measured in viewport
   coordinates, so the two boxes that belong to the page are translated by
   however far the page has moved. See travel().

   WHY THIS FILE IS NOT A FRAMEWORK. HINTS.md maps a registry, a scheduler and
   a catalogue of about thirty. All of that was built once and reverted: the
   app felt slower on a real phone and no hint appeared, neither of which
   reproduced in a headless browser. §12 of that document asks for one hint at
   a time, watched, before any of the rest comes back. This is that one hint,
   and it is deliberately a single file with no registry in it. The second
   hint is when the registry earns itself, not before.

   WHY THERE IS NO ANIMATED BACKGROUND IN HERE. §12's best guess at the
   stutter is a shape that animated background-position across the blurred
   tab bar, which repaints a live blur every frame. Everything that moves here
   is transform or opacity, and the only thing drawn over the plinth is the
   ghosted bar, which does not move.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* Voice rules, design system §2b: second person, invitational rather than
     instructional, one sentence, no em-dash, and it must not wrap on a 375pt
     phone. Not "Did you know" and not "Try highlighting some text": say the
     thing. */
  var WORDS = 'Hold a line to keep it.';

  var DRAW_STAGGER = 110;   // ms between one line box lighting and the next
  var DRAW_TIME    = 420;   // ms for one line box to draw
  var WORDS_BEAT   = 240;   // ms after the marker finishes before the words
  var HOLD         = 2000;  // ms the words sit there once they have landed
  var STILL_HOLD   = 3200;  // the same, under Reduce Motion, with no movement
  var SETTLE       = 140;   // ms of no scrolling that counts as having stopped

  var spent = false;        // has the one hint of this launch been used
  var armed = null;         // the block a scroll would fire the hint on
  var layer = null;         // the words and the bar, while they are up
  var markLayer = null;     // the marks, which live apart: see components.css
  var follow = null;        // the card's own box, which travels with the page
  var scrolledFrom = 0;     // where the page was when it was drawn
  var timers = [];
  var settleTimer = null;

  /* ------------------------------------------------------------- the policy

     One function, no DOM, no clock, no globals, so tests/hints.test.js can
     cover the whole of it. Everything below asks this rather than deciding
     for itself, and the order is the answer to "why is it quiet": the first
     line that says no is the reason. */

  function shouldShow(ctx) {
    if (!ctx.hintsOn) return false;        // the switch in Your account
    if (ctx.spent) return false;           // one per launch, and it is gone
    /* THE READER, NOT THE LIST. 'guide' is the index of guides and
       'guide-reader' is the one you are reading, which is the only screen
       with prose that can be kept. Presentation mode is a route of its own,
       'present', so this line is also what keeps the hint off a television,
       and every other screen with foldable sections in it — Connect's serve
       teams, Listen's archive, the Group room — is excluded here rather than
       by hoping none of them ever grows a [data-hl-path]. */
    if (ctx.route !== 'guide-reader') return false;
    if (ctx.sheetOpen) return false;       // something else owns the glass
    if (ctx.editing) return false;         // an admin is mid sentence
    if (ctx.hidden) return false;          // nobody is there
    if (!ctx.inView) return false;         // they have not scrolled onto it
    return true;
  }

  /* What shouldShow would say, and the first reason it would say no. Nothing
     in the app calls this. It exists for a console on a real phone, because
     a hint that does not appear is indistinguishable from a hint that is
     switched off, from one already spent, and from a stale bundle, and not
     being able to tell those apart is what cost the last attempt a revert.
     See HINTS.md §12. */
  function explain() {
    var ctx = context(armed);
    var reasons = [
      [!ctx.hintsOn, 'Hints is off in Your account'],
      [ctx.spent, 'already shown once this launch'],
      [ctx.route !== 'guide-reader', 'not in a guide, the route is ' + ctx.route],
      [ctx.sheetOpen, 'a sheet is open'],
      [ctx.editing, 'Edit mode is on'],
      [ctx.hidden, 'the app is in the background'],
      [!armed, 'nothing armed: no section has been opened yet'],
      [armed && !ctx.inView, 'the block is armed but has not been scrolled into view']
    ];
    for (var i = 0; i < reasons.length; i++) {
      if (reasons[i][0]) return 'no: ' + reasons[i][1];
    }
    return 'yes: it would show now';
  }

  function context(block) {
    var route = HC.router && HC.router.current();
    var app = document.getElementById('app');
    var sheet = app ? app.getAttribute('data-oversheet') : null;
    return {
      hintsOn: isOn(),
      spent: spent,
      route: route ? route.name : null,
      // setSheetState() in js/app.js mirrors the ••• sheet onto #app. 'closed'
      // and 'fade' are both on their way out; the other two own the glass.
      sheetOpen: sheet === 'open' || sheet === 'peek',
      editing: !!(HC.edit && HC.edit.isOn && HC.edit.isOn()),
      hidden: document.hidden,
      inView: !!block && inView(block)
    };
  }

  function isOn() {
    var p = HC.store && HC.store.getProfile ? HC.store.getProfile() : null;
    return !p || p.hints !== false;
  }

  function reduced() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Far enough onto the screen to have been read, rather than one pixel of it
     showing under the bar. */
  function inView(block) {
    var r = block.getBoundingClientRect();
    if (!r.height) return false;
    var top = header();
    var bottom = window.innerHeight - plinth();
    return r.top < bottom - 40 && r.bottom > top + 20;
  }

  function header() {
    var bar = document.querySelector('.hc-header, .hc-topbar');
    return bar ? bar.getBoundingClientRect().bottom : 52;
  }

  function plinth() {
    var tabs = document.querySelector('.hc-tabbar');
    return tabs ? window.innerHeight - tabs.getBoundingClientRect().top : 100;
  }

  /* --------------------------------------------------------------- arming */

  /* Called by the toggle-section handler in js/app.js when a section opens.
     Arming is not showing: it only says which block a scroll would be
     scrolling onto. */
  function sectionOpened(section) {
    if (spent || !isOn() || !section) return;
    var route = HC.router && HC.router.current();
    if (!route || route.name !== 'guide-reader') return;

    var block = section.querySelector('[data-hl-path]');
    if (!block) return;      // Discussion Questions and the reflection prompts
    armed = block;
  }

  function onScroll() {
    if (!armed || spent || layer) return;
    if (settleTimer) clearTimeout(settleTimer);
    /* Not during the fling. A marker drawn under a moving page is a smear,
       and the moment worth teaching is the one where somebody has stopped on
       the words. */
    settleTimer = setTimeout(function () {
      settleTimer = null;
      if (shouldShow(context(armed))) show(armed);
    }, SETTLE);
  }

  /* -------------------------------------------------------------- drawing */

  function icon(name) {
    return HC.components ? HC.components.icon(name, 'hc-hint__icon') : '';
  }

  function show(block) {
    var sentence = firstSentence(block);
    if (!sentence.length) return;

    spent = true;
    armed = null;

    layer = document.createElement('div');
    layer.className = 'hc-hint';
    layer.setAttribute('aria-hidden', 'true');

    /* Two layers, and the split is not cosmetic: the marks blend with the page
       and blending only happens inside a stacking context, which .hc-hint is
       and this deliberately is not. The long note on .hc-hint-marks in
       css/components.css is the whole of it. */
    markLayer = document.createElement('div');
    markLayer.className = 'hc-hint-marks';
    markLayer.setAttribute('aria-hidden', 'true');

    /* The whole layer is hidden from assistive technology on purpose. The
       words are already reachable: every highlightable block is real prose,
       and VoiceOver's own rotor gets to it without being told. A visual
       pointer read aloud is noise. */

    var still = reduced();
    var marks = sentence.map(function (rect, i) {
      var mark = document.createElement('div');
      mark.className = 'hc-hint__mark';
      mark.style.left = (rect.left - 2) + 'px';
      mark.style.top = (rect.top - 3) + 'px';
      mark.style.width = (rect.width + 4) + 'px';
      mark.style.height = (rect.height + 6) + 'px';
      markLayer.appendChild(mark);
      if (!still) {
        timers.push(setTimeout(function () {
          mark.setAttribute('data-in', 'true');
        }, 20 + i * DRAW_STAGGER));
      } else {
        mark.setAttribute('data-in', 'true');
      }
      return mark;
    });

    var last = sentence[sentence.length - 1];

    var say = document.createElement('div');
    say.className = 'hc-hint__say';
    say.innerHTML =
      '<div class="hc-hint__card">' + icon('pencil') + '<span>' + WORDS + '</span></div>';

    /* The card rides in a box of its own so that following a scroll and
       arriving are two different transforms on two different elements. Put
       both on the card and the arrival slides it back to where it started. */
    follow = document.createElement('div');
    follow.className = 'hc-hint__follow';
    follow.appendChild(say);
    layer.appendChild(follow);

    var bar = document.createElement('div');
    bar.className = 'hc-hint__say hc-hint__bar';
    /* Word for word what js/highlight.js draws, pencil and all, because a
       ghost of a bar that is not quite the bar teaches the wrong bar. */
    bar.innerHTML =
      '<div class="hc-hint__pill">' +
        '<span>' + icon('pencil') + 'Note this</span>' +
        '<span class="hc-hint__rule"></span>' +
        '<span>Highlight</span>' +
      '</div>';
    layer.appendChild(bar);

    var app = document.getElementById('app');
    app.appendChild(markLayer);
    app.appendChild(layer);

    var scroller = document.getElementById('hc-scroll');
    scrolledFrom = scroller ? scroller.scrollTop : 0;

    /* Measured once it is in the page, because the card's height depends on
       whether its one line wrapped, which depends on the text size somebody
       chose in Your account. Kept inside the gutters at both ends. */
    var pad = 20;
    var w = say.offsetWidth;
    var left = Math.min(Math.max(last.left, pad), window.innerWidth - w - pad);
    say.style.left = Math.max(pad, left) + 'px';
    say.style.top = (last.bottom + 10) + 'px';

    /* If the card would land under the plinth, put it over the sentence
       instead. Below reads better and above beats not being seen. */
    if (last.bottom + 10 + say.offsetHeight > window.innerHeight - plinth() - 8) {
      say.style.top = (sentence[0].top - say.offsetHeight - 10) + 'px';
    }

    var drawn = still ? 0 : 20 + (marks.length - 1) * DRAW_STAGGER + DRAW_TIME;
    timers.push(setTimeout(function () {
      say.setAttribute('data-in', 'true');
      bar.setAttribute('data-in', 'true');
      timers.push(setTimeout(function () {
        end('timer');
      }, still ? STILL_HOLD : HOLD));
    }, drawn + (still ? 0 : WORDS_BEAT)));
  }

  /* The line boxes of the first sentence of the block, in viewport
     coordinates. One box per line, because a sentence that wraps is three
     rectangles and one rectangle around all three would cover the words
     either side of it. */
  function firstSentence(block) {
    var text = block.textContent || '';
    var stop = text.search(/[.?!]\s/);
    var end = stop === -1 ? Math.min(text.length, 90) : stop + 1;

    var range = document.createRange();
    var node = firstTextNode(block);
    if (!node) return [];

    try {
      range.setStart(node, 0);
      var at = walkTo(block, end);
      if (!at) return [];
      range.setEnd(at.node, at.offset);
    } catch (e) {
      return [];
    }

    var rects = range.getClientRects();
    var out = [];
    for (var i = 0; i < rects.length; i++) {
      if (rects[i].width > 2) out.push(rects[i]);
    }
    return out;
  }

  function firstTextNode(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    return walker.nextNode();
  }

  /* The block already contains <mark> elements from earlier highlights, so an
     offset into its text is not an offset into any one node. Same walk as
     offsetWithin() in js/highlight.js, for the same reason. */
  function walkTo(block, offset) {
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
    var count = 0;
    var node;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue.length;
      if (count + len >= offset) return { node: node, offset: offset - count };
      count += len;
    }
    return node ? { node: node, offset: node.nodeValue.length } : null;
  }

  /* ------------------------------------------------------------------ end */

  /* It is measured in viewport coordinates and drawn in a fixed layer, so a
     page that moves under it would leave the marker sitting on the wrong
     words. Rather than measuring again on every scroll event, the two boxes
     that belong to the page are translated by however far the page has gone:
     one property on two elements, on the compositor, no layout read past
     scrollTop. The bar is left out on purpose. It is docked to the band above
     the tab bar, which does not move, and that is the whole of what it is
     there to say. */
  function travel(scroller) {
    if (!layer) return;
    var dy = scrolledFrom - scroller.scrollTop;
    var move = 'translateY(' + dy + 'px)';
    markLayer.style.transform = move;
    follow.style.transform = move;
  }

  function end(why) {
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    timers.forEach(clearTimeout);
    timers = [];
    if (!layer && !markLayer) return;

    var soft = why === 'timer';
    var going = [layer, markLayer];
    layer = null;
    markLayer = null;
    follow = null;

    going.forEach(function (el) {
      if (el) el.setAttribute('data-going', soft ? 'soft' : 'tap');
    });
    setTimeout(function () {
      going.forEach(function (el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    }, soft ? 480 : 240);
  }

  function busy() { return !!layer; }

  /* Turning the switch off puts away whatever is on the glass. Turning it on
     resets nothing: somebody who has already learned this does not need to be
     taught it again, and the launch it was spent on is spent. */
  function switched(on) {
    if (!on) { armed = null; end('off'); }
  }

  /* Everything else that ends it. Capture phase on the tap, so the hint is
     already leaving while the thing that was tapped is still deciding what to
     do, and passive so nothing here can slow a scroll down. */
  function listen() {
    var scroller = document.getElementById('hc-scroll');
    if (scroller) {
      scroller.addEventListener('scroll', function () {
        if (layer) travel(scroller);
        else onScroll();
      }, { passive: true });
    }

    /* THERE IS NO TAP LISTENER HERE, AND THAT IS DELIBERATE.

       It used to end on any pointerdown, capture phase, the way HINTS.md §3b
       describes. That rule was written for a hint with no clock on it, where
       going on with what you were doing had to be the way it went away. This
       one has a clock: two seconds and it is gone. Ending it on the first
       touch as well meant the touch that scrolled onto the words could end it
       before it had finished arriving, which is a hint nobody sees.

       The layer still never takes a tap. pointer-events: none in
       css/components.css is untouched and is not negotiable: every tap during
       those two seconds lands on whatever is under it, exactly as it would
       have. What went away is the hint reacting to that tap at all. */

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) end('hidden');
    });

    window.addEventListener('resize', function () {
      // The measurement is stale and re-measuring is not worth the code.
      if (layer) end('resize');
    });

    /* The one thing that still ends it early, and it is not a dismissal: they
       have started doing the thing. Selecting a line puts the real bar up in
       the same band the ghost is drawn in, and two bars in one place reads as
       a glitch rather than as an offer. The ghost gets out of the way of the
       thing it was pointing at. */
    document.addEventListener('selectionchange', function () {
      if (!layer) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed && String(sel).trim()) end('a selection');
    });

    /* Anything floating over a screen belongs to that screen, which is the
       rule js/highlight.js already keeps with its own bar. HC.emitViewChange
       in js/app.js publishes this on every view change. */
    if (HC.store && HC.store.on) {
      HC.store.on('view', function () { armed = null; end('view'); });
    }
  }

  HC.hints = {
    listen: listen,
    sectionOpened: sectionOpened,
    end: end,
    busy: busy,
    switched: switched,
    explain: explain,
    shouldShow: shouldShow    // exported for tests/hints.test.js
  };
})(window.HC = window.HC || {});
