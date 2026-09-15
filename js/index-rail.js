/* ==========================================================================
   Home Church, the index rail

   The browser's scrollbar is not drawn in this app, and the right edge is
   this instead: a faint ruler of notches, one per heading on whatever screen
   you are on, alternating long and short so it reads as something you slide
   along rather than a list of marks. Put a thumb on it and the page's whole
   contents fades up beside it — every heading written out, the one under the
   finger brought forward onto a card while the page glides to that section,
   its neighbours part way, the rest faint behind. Let go and the reading goes
   away again, and the ruler stays.

   IT READS THE DOM. A stop is a section header, a foldable section's heading,
   or anything a screen stamps [data-index-stop], in the order the page draws
   them. Nothing is registered, so a screen gets a rail by having headings and
   loses it by not having any, and a screen that wants out says so once with
   [data-no-index]. This is the same bargain js/date-rail.js makes, and it is
   the reason neither of them has a list of screens in it.

   WHY IT LISTENS ON THE SCROLLER. The obvious build is a strip element down
   the right edge with touch-action: none on it. That works, and it silently
   takes the right 34px away from js/swipe.js, because a touch that lands on a
   strip outside .hc-scroll never reaches the swipe listeners at all. So there
   is no strip. This listens on the same scroller swipe.js listens on, decides
   at the first movement whether the gesture is vertical, and simply does not
   claim it when it is not. Both components then read one gesture with the
   same two numbers, and a drag that turns out to be sideways still takes you
   to the next tab from the right edge.

   AND WHY IT READS TOUCHES. Sling the page and grab the notches on the way
   past and, for a while, nothing happened: they woke once everything was
   still, which is the one moment nobody wants them. A finger that lands on a
   flying page is a finger the browser has already promised to its own
   scrolling, and the pointer events it used to be read from do not survive
   that. Touches do. See the gesture below.

   WHAT IT COSTS TO DRAW. Every stop is measured once when the thumb goes
   down, and every heading's width once when the rail is built. After that one
   requestAnimationFrame loop writes transform and opacity, and nothing else,
   on the notches, the headings, the card and the veil — no reads, no classes,
   no layout, and any write that would move a value less than QUIET is not
   made. The loop stops itself when the finger is still and the page has
   arrived.

   NO HAPTICS. Crossing a notch is a tick you would feel forty times in one
   drag, and js/native.js keeps its two taps meaning something by not
   spending them here.

   THE HINT. A ruler nobody touches is a ruler nobody knows is there, so the
   rail shows its hand: two seconds after Home is on the glass, one swell
   travels from the top notch to the bottom, as though a thumb went down the
   edge without you. Still untouched thirty seconds in, it does it again, and
   every thirty seconds after that, on whatever screen you are on, until you
   use it. Then it stops for good, and the next launch starts the whole thing
   over.

   AND THE CLOCK IS SHARED. js/swipe.js has a hint of its own — the page leans
   toward the next tab far enough to show a heading on it — and this file owns
   the timer both of them run on, because two things moving at once is a tour
   rather than a hint. Three seconds after the opening swell the page leans,
   once, so a first launch says the app's two directions in the order somebody
   would find them. After that they take turns on the thirty second offer,
   starting with the rail. See armHints() and beat().

   The hint is the notches and nothing else. The headings, the card and the
   veil are what happens when a finger is down, and putting the contents of
   the page up unasked every thirty seconds is not a hint, it is an
   interruption. So the hint drives its own swell, and paint() gives it the
   marks while the reading stays with the thumb.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* --- the numbers, all of them, in one place --------------------------- */

  /* How far in from the right edge a gesture counts as the rail's. Two
     numbers rather than one, because a drag and a tap cost different things
     when they are read wrongly.

     A drag out here is a scrub the page would otherwise have taken as a
     scroll, and that is a fair trade: nobody drags down the far right of the
     screen by accident, and the ones who mean the rail rarely put a thumb on
     the actual glass edge. 56px is the 20px page gutter plus a card's own
     20px of padding, plus slack — a thumb landing anywhere over dead space
     catches it, and it is still the right seventh of the phone, nowhere near
     the middle.

     A tap out here is a click taken away from whatever was under it, and
     past about 40px what is under it is a card's contents: a chevron, a
     count, the right end of a row. So the tap keeps the old width and stays
     over the gutter. A still finger at 45px in is not reaching for the rail,
     it is pressing the thing it is on. */
  var HOT_DRAG = 56;
  var HOT_TAP  = 34;

  var W_MAX  = 30;    // a notch at the centre of the swell
  var W_MIN  = 9;     // a notch at rest
  var W_ALT  = 6;     // and every second one, so the column reads as a ruler
  var W_ACT  = 17;    // the section you are in, thumb or no thumb

  var A_REST = 0.20;  // ink with nobody's thumb on it
  var A_ON   = 0.30;  // the floor once a thumb is down
  var A_HERE = 0.55;  // the section you are in, at rest

  var T_DIM  = 0.26;  // a heading you are not on
  var T_LOW  = 0.54;  // how small one of those is allowed to get
  var T_HIGH = 0.78;  // and how large, when the notches are far enough apart
  var T_BITE = 1.5;   // >1 keeps the ink on the focused heading
  var T_VEIL = 0.94;  // how far the paper comes back over the page

  /* How wide the swell is, as a multiple of the gap between notches, held
     between these two. Not a fixed number of pixels: the gap changes with how
     many headings there are, and a fixed sigma would light three of twenty
     and one of six. */
  var SIGMA_OF = 1.25;
  var SIGMA_MIN = 34;
  var SIGMA_MAX = 110;

  /* The most air two notches get. A track is most of the height of the phone,
     and six headings spread across all of it means a thumb travelling the
     whole screen to see six things. Past this the block sits in the middle of
     the track instead of filling it, and the whole of it is inside one comfor-
     table drag. A page with enough headings to need the room still takes it:
     the gap only ever shrinks from here. */
  var PITCH_MAX = 64;

  var EDGE   = 14;    // px kept clear at each end of the track

  var LAND   = 12;    // where a jumped-to heading comes to rest under the top
  var LINE   = 72;    // the reading line the active notch is measured against

  var HOLD   = 1000;  // ms the headings stay up after the thumb lifts
  var SLOP   = 10;    // px before a gesture has to say which way it is going
  var AXIS   = 1.2;   // horizontal has to beat vertical by this to be a swipe

  /* How long after the page last moved it still counts as moving. Long enough
     to cover the gap between two scroll frames on a slow fling, short enough
     that a finger arriving after a page has genuinely settled is read as
     arriving on a still one. */
  var MOVING = 140;

  /* The hint. FIRST is counted from the moment the greeting lifts off, not
     from boot: two seconds after boot is still the middle of js/splash.js.
     EVERY is the standing offer after that, on any screen, until the rail is
     used. WAVE is one pass top to bottom — long enough to read as one
     movement travelling down the edge, short enough that looking away for a
     moment is what it takes to miss it. LEAD holds the swell off the ends of
     the block so the first notch rises into it rather than starting lit, and
     EDGE is the fraction of the pass spent fading the whole thing in and out
     again. */
  var HINT_FIRST = 2000;
  var HINT_EVERY = 30000;
  /* And how long after that opening swell the tab swipe leans, once, on a
     first launch. See armHints(). The swell itself is HINT_WAVE, about 1.15s,
     so this leaves the better part of two seconds of stillness between them. */
  var HINT_SWIPE_AFTER = 3000;
  var HINT_WAVE  = 1150;
  var HINT_LEAD  = 1.6;     // in sigmas, outside the first and last notch
  var HINT_EDGE  = 0.18;

  var EASE_PTR    = 0.35;   // per frame, finger -> drawn centre
  var EASE_SCROLL = 0.22;   // per frame, page -> target
  var EASE_GAIN   = 0.14;   // per frame, the swell in and out
  var QUIET       = 0.004;  // writes smaller than this are not worth making

  /* SLOP and AXIS are js/swipe.js's LOCK_SLOP and AXIS_BIAS. They are written
     out again rather than reached for because the two components have to
     agree about what a sideways drag is, and a shared number that one of them
     can change alone is worse than two that are checked together. */

  /* --- the parts ------------------------------------------------------- */

  var scroller = null;
  var rail = null;      // the notch track
  var track = null;     // what the notches are drawn into
  var titles = null;    // the written-out headings
  var card = null;      // the glass behind the focused one
  var veil = null;      // paper drawn back over the page
  var live = null;      // what a screen reader is told

  /* --- state ----------------------------------------------------------- */

  var stops  = [];   // { el, title, top }, in page order
  var marks  = [];   // the drawn hairlines, same order
  var names  = [];   // the written-out headings, same order
  var ys     = [];   // each notch's centre, in the track's coordinates
  var ty     = [];   // the same centres in the app's, for the headings
  var widths = [];   // each heading's natural width, measured once at build
  var lastW  = [];   // what was last written, so it is not written again
  var lastA  = [];
  var lastT  = [];
  var lastTA = [];

  var enabled  = false;
  var active   = -1;
  var armed    = false;   // pointer down, gesture not claimed yet
  var engaged  = false;   // it is ours
  var pointer  = -1;      // the pointer id we are holding, on a desktop
  var finger   = -1;      // or the touch identifier, in a hand
  var arrested = false;   // this touch landed on a moving page and stopped it
  var startX   = 0;
  var startY   = 0;
  var rawY     = 0;
  var ptrY     = 0;
  var gain     = 0;       // 0 at rest, 1 under a finger
  var glideTo  = 0;
  var glideAt  = 0;
  var gliding  = false;
  var running  = false;
  var hideTimer = 0;
  var trackTop = 0;
  var sMin     = T_HIGH;
  var sigma    = SIGMA_MAX;
  var yFirst   = 0;       // the notch block's own range, which is what the
  var yLast    = 0;       // finger is held to. See layout().
  var lastV    = -1;
  var swallowClick = false;
  var scrollAt = 0;       // when the page last moved. See moving().
  var pendingScan = false;

  var hinting  = false;   // a hint wave is on
  var hintAt   = 0;       // when it started, off the frame clock. 0 = next frame
  var hintY    = 0;       // the swell's centre, in the track's coordinates
  var hintGain = 0;       // and how much of it there is
  var used     = false;   // the rail has been used, so the hints are done
  var hintsSet = false;   // the hints have been set going for this launch
  var firstTimer = 0;
  var swipeTimer = 0;     // the tab swipe's one opening lean. See armHints().
  var everyTimer = 0;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function reduced() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* --- what counts as a heading ---------------------------------------- */

  /* In page order, whatever a screen happens to be made of. The two classes
     are the app's two ways of naming a block: the signature eyebrow-title-rule
     header, and a foldable section's own heading. */
  var STOP_SELECTOR = '.hc-section-header, .hc-section, [data-index-stop]';

  function titleOf(el) {
    if (el.hasAttribute('data-index-stop') && el.getAttribute('data-index-stop')) {
      return el.getAttribute('data-index-stop');
    }
    var t = el.querySelector('.hc-section-header__title, .hc-section__title');
    var text = (t ? t.textContent : el.textContent) || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  function collect(view) {
    var out = [];

    /* The top of the page, when the first heading is not already there. Home
       opens on a greeting and a photograph before it names anything, and a
       rail whose first stop is a third of the way down is a rail you cannot
       scroll back up with. The screen's own h1 is the honest name for that
       stop; screens whose h1 is already inside a header have one anyway. */
    var h1 = view.querySelector('h1');
    if (h1 && !h1.closest(STOP_SELECTOR) && !h1.closest('[data-no-index]')) {
      var lead = (h1.textContent || '').replace(/\s+/g, ' ').trim();
      if (lead) out.push({ el: h1, title: lead, top: 0 });
    }

    var els = view.querySelectorAll(STOP_SELECTOR);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('[data-no-index]')) continue;
      // A foldable section contains its own heading; count the section once.
      if (el.classList.contains('hc-section-header') && el.closest('.hc-section')) continue;
      var title = titleOf(el);
      if (!title) continue;
      out.push({ el: el, title: title, top: 0 });
    }
    return out;
  }

  /* --- measuring ------------------------------------------------------- */

  function measure() {
    if (!enabled) return;
    var base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    for (var i = 0; i < stops.length; i++) {
      stops[i].top = stops[i].el.getBoundingClientRect().top - base;
    }
    trackTop = rail.offsetTop;
  }

  function layout() {
    if (!enabled) return;
    var n = stops.length;
    var height = rail.clientHeight;
    var avail = height - EDGE * 2;
    /* Spread to fill the track, but never further apart than PITCH_MAX, so a
       short contents sits as a block in the middle rather than stretched over
       the whole phone. The strip outside that block is not dead: the finger
       is held to the block's own range, so a thumb past the last notch swells
       the last notch instead of swelling nothing. */
    var pitch = n > 1 ? Math.min(avail / (n - 1), PITCH_MAX) : 0;
    sigma = clamp(pitch * SIGMA_OF, SIGMA_MIN, SIGMA_MAX);
    var span = pitch * (n - 1);
    var y0 = (height - span) / 2;

    /* How small a heading you are not on may be drawn. The column has to stay
       a column: at a full pitch there is room for near enough full size, and
       when a long guide squeezes the notches together the names squeeze with
       them or they would sit on each other. */
    sMin = clamp((pitch - 6) / 26, T_LOW, T_HIGH);

    ys.length = 0;
    ty.length = 0;
    yFirst = y0;
    yLast = y0 + span;
    for (var i = 0; i < n; i++) {
      var y = y0 + i * pitch;
      ys.push(y);
      ty.push(trackTop + y);
      var notch = marks[i].parentNode;
      notch.style.top = (y - Math.max(11, pitch / 2)) + 'px';
      notch.style.height = Math.max(22, pitch) + 'px';
    }
  }

  /* --- building -------------------------------------------------------- */

  function clear() {
    enabled = false;
    pendingScan = false;
    hinting = false;
    hintGain = 0;
    stops = [];
    marks = [];
    names = [];
    widths = [];
    active = -1;
    gain = 0;
    release();
    track.innerHTML = '';
    titles.innerHTML = '';
    rail.hidden = true;
    setState('off');
  }

  var liveRoute = false;   // whether the screen on now is allowed a rail

  function build(route) {
    liveRoute = !!route;
    // Leaving a screen mid hint takes the hint with it; the timer that sent
    // it is still running and the next screen gets its own.
    stopHint(false);
    rescan();
    armHints(route);
  }

  /* Same titles, in the same order, is the same index — whatever happened to
     the elements underneath it. */
  function sameTitles(found) {
    if (found.length !== stops.length) return false;
    for (var i = 0; i < found.length; i++) {
      if (found[i].title !== stops[i].title) return false;
    }
    return true;
  }

  /* THE ELEMENTS DO NOT LAST. Several screens re-render in place rather than
     mounting again: the Group room replaces its whole subtree on every poll,
     and js/content.js repaints a screen when the real data lands after the
     first paint. The rail was holding the nodes it measured at build, and a
     detached node's rectangle is all zeros, so every heading measured to the
     same place and every notch scrolled to the same nothing. That is the Group
     tab bug, and it was one poll away on every other screen too.

     So the stops are re-read whenever #hc-view changes. When the headings are
     the same, only the references are swapped and the notches on screen are
     left alone, which keeps a focused notch focused and costs one pass over a
     handful of elements. */
  function rescan() {
    var view = document.getElementById('hc-view');
    if (!liveRoute || !view) { clear(); return; }

    var found = collect(view);
    // One heading is not an index, it is a heading.
    if (found.length < 2) { clear(); return; }

    if (enabled && sameTitles(found)) {
      for (var i = 0; i < found.length; i++) stops[i].el = found[i].el;
      settle();
      return;
    }

    stops = found;
    enabled = true;
    rail.hidden = false;

    var notchHtml = '';
    var titleHtml = '';
    for (var i = 0; i < stops.length; i++) {
      notchHtml += '<button type="button" class="hc-index__notch" data-action="index-jump" ' +
                     'data-index="' + i + '">' +
                     '<span class="hc-visually-hidden">' + HC.components.esc(stops[i].title) + '</span>' +
                     '<span class="hc-index__mark"></span>' +
                   '</button>';
      titleHtml += '<div class="hc-index__title">' + HC.components.esc(stops[i].title) + '</div>';
    }
    track.innerHTML = notchHtml;
    titles.innerHTML = titleHtml;

    marks = [];
    names = [];
    widths = [];
    lastW = [];
    lastA = [];
    lastT = [];
    lastTA = [];
    lastV = -1;
    var markNodes = track.querySelectorAll('.hc-index__mark');
    var nameNodes = titles.querySelectorAll('.hc-index__title');
    for (var k = 0; k < markNodes.length; k++) {
      marks.push(markNodes[k]);
      names.push(nameNodes[k]);
      // One read each, here and never again: the card is sized from this
      // rather than from the element it is under.
      widths.push(nameNodes[k].offsetWidth);
      lastW.push(-1);
      lastA.push(-1);
      lastT.push(-1);
      lastTA.push(-1);
    }

    active = -1;
    settle();
  }

  /* A view is mounted with an enter animation that lifts it six pixels, and
     nothing says when the last card has landed. Same answer as the date rail:
     measure now to have something usable, and again once it is still. */
  function settle() {
    measure();
    layout();
    fromScroll();
    paint();
    window.requestAnimationFrame(function () { measure(); layout(); paint(); });
    window.setTimeout(function () { measure(); layout(); refresh(); }, 320);
  }

  /* --- painting: transform and opacity, and nothing else ---------------- */

  function paint() {
    if (!enabled) return;
    /* Two swells, and only one of them at a time: the thumb's, or the hint's
       when there is no thumb. The marks take whichever is running. Everything
       below them — the headings, the card, the veil — takes the thumb's and
       only the thumb's, which is what keeps a hint to the ruler. */
    var centre = hinting ? hintY : ptrY;
    var swell  = hinting ? hintGain : gain;
    var peak = 0;
    var rest = A_REST + (A_ON - A_REST) * swell;
    var here = A_HERE + 0.23 * swell;

    for (var i = 0; i < marks.length; i++) {
      var f = 0;
      if (swell > 0.001) {
        var d = (ys[i] - centre) / sigma;
        f = swell * Math.exp(-d * d);
      }

      /* The notch. Its resting length alternates, and both lengths run to the
         same W_MAX under the finger, so the ruler stays a ruler while the one
         you are on is never in doubt. */
      var base = (i % 2) ? W_ALT : W_MIN;
      var w = base + (W_MAX - base) * f;
      var a = rest + (1 - rest) * f;
      if (i === active) {
        if (w < W_ACT) w = W_ACT;
        if (a < here) a = here;
      }
      var s = w / W_MAX;
      if (Math.abs(s - lastW[i]) > QUIET) {
        marks[i].style.transform = 'scaleX(' + s.toFixed(3) + ')';
        lastW[i] = s;
      }
      if (Math.abs(a - lastA[i]) > QUIET) {
        marks[i].style.opacity = a.toFixed(3);
        lastA[i] = a;
      }

      /* The heading written out beside it, on the same f, so a name and its
         notch are one movement rather than two that nearly agree. Under a
         hint there is no f to share: the names sit at rest, which is where
         they already are, so the two writes below are not made at all. */
      var tf = hinting ? 0 : f;
      var ts = sMin + (1 - sMin) * tf;
      var ta = gain * (T_DIM + (1 - T_DIM) * Math.pow(tf, T_BITE));
      if (Math.abs(ts - lastT[i]) > QUIET) {
        names[i].style.transform =
          'translate3d(0,' + ty[i].toFixed(1) + 'px,0) scale(' + ts.toFixed(3) + ')';
        lastT[i] = ts;
      }
      if (Math.abs(ta - lastTA[i]) > QUIET) {
        names[i].style.opacity = ta.toFixed(3);
        lastTA[i] = ta;
      }

      if (i === active) peak = tf;
    }

    var v = gain * T_VEIL;
    if (Math.abs(v - lastV) > QUIET) {
      veil.style.opacity = v.toFixed(3);
      lastV = v;
    }

    if (active >= 0 && !hinting) {
      var cs = sMin + (1 - sMin) * peak;
      card.style.transform =
        'translate3d(0,' + ty[active].toFixed(1) + 'px,0) scale(' + cs.toFixed(3) + ')';
      card.style.opacity = (gain * 0.96).toFixed(3);
    }
  }

  /* --- the hint ---------------------------------------------------------
     One swell sent down the edge on a timer instead of a thumb. It borrows
     the loop, the gaussian and the marks, and touches nothing else. */

  function clock() {
    return (window.performance && window.performance.now)
      ? window.performance.now() : Date.now();
  }

  function smooth(p) { return p * p * (3 - 2 * p); }

  /* Where the swell is and how much of it there is, at this point through the
     pass. The centre runs from clear of the first notch to clear of the last
     on a smoothstep, so it leans into the travel and settles out of it rather
     than starting and stopping at full speed. Returns whether there is more
     of it to come. */
  function wave(now) {
    if (!hintAt) hintAt = now;
    var p = (now - hintAt) / HINT_WAVE;

    if (p >= 1) {
      hinting = false;
      hintGain = 0;
      return false;
    }
    if (p < 0) p = 0;

    var lead = sigma * HINT_LEAD;
    hintY = (yFirst - lead) + ((yLast + lead) - (yFirst - lead)) * smooth(p);

    var up = p / HINT_EDGE;
    var down = (1 - p) / HINT_EDGE;
    var e = up < down ? up : down;
    hintGain = smooth(e > 1 ? 1 : e);
    return true;
  }

  function hint() {
    if (used || hinting || !enabled) return;
    // Not over a thumb already on the rail, not over a jump in flight, not
    // into a screen nobody is looking at, and not at all where the phone has
    // asked for stillness.
    if (armed || engaged || gliding || document.hidden || reduced()) return;

    hinting = true;
    hintAt = 0;             // taken off the frame clock, on the first frame
    hintGain = 0;
    hintY = yFirst;
    kick();
  }

  /* A hint that is interrupted hands its swell to the finger that
     interrupted it, rather than dropping the marks to rest for one frame and
     growing them again from nothing. */
  function stopHint(keep) {
    if (!hinting) return;
    hinting = false;
    if (keep && hintGain > gain) gain = hintGain;
    hintGain = 0;
  }

  /* The rail has been used. That is the end of the hints for this launch —
     there is nothing left to hint at — and a reload is what starts them
     again, which is the same thing as opening the app. */
  function noteUse() {
    stopHint(false);
    if (used) return;
    used = true;
    if (firstTimer) { window.clearTimeout(firstTimer); firstTimer = 0; }
    /* THE INTERVAL IS NOT CLEARED HERE, and it used to be. It is shared with
       the tab swipe's hint now, and that one has a retirement of its own, so
       the rail being finished is no longer the end of the clock. beat() stops
       it once neither of them has anything left to say. */
  }

  /* TWO HINTS, ONE CLOCK.

     js/swipe.js has a hint of its own: the screen leans toward the next tab
     and comes back, twice. It wants exactly this moment, and two things moving
     at once is a tour rather than a hint, so the two take turns on this one
     interval instead of running two of them. The page sliding sideways under
     a swell travelling down these notches would drag the swell with it, which
     is the other half of the same argument.

     The rail keeps the opening beat and the odd ones after it. It is the
     harder of the two to stumble onto by accident: HINTS.md §12 says of the
     other one that a sideways drag is discovered by accident more than
     anything else in the app.

     Whichever one's turn it is, if it has nothing to say — retired, Reduce
     Motion, a screen it does not belong on — the turn goes to the other rather
     than the beat being spent on nothing. */
  var turn = 0;

  function swipeHint(run) {
    var s = HC.swipe;
    if (!s || !s.hintLive || !s.hintLive()) return false;
    return run ? !!s.hint() : true;
  }

  function beat() {
    var live = swipeHint(false);

    // Neither of them has anything left this launch. Stop asking.
    if (used && !live) {
      if (everyTimer) { window.clearInterval(everyTimer); everyTimer = 0; }
      return;
    }

    if (++turn % 2) {
      if (!used) { hint(); return; }
      swipeHint(true);
      return;
    }
    if (swipeHint(true)) return;
    hint();
  }

  /* Set going once per launch, from the first screen that is allowed a rail.
     The two second one is Home's, because Home is what the app opens onto and
     a hint two seconds into somewhere you navigated to is a hint about a rail
     you just watched appear. The standing thirty second one belongs to
     whatever screen you happen to be on.

     AND THE TAB SWIPE LEANS THREE SECONDS BEHIND THE OPENING SWELL. The two
     are the app's two directions, and on a first launch they are worth saying
     once, together, in the order somebody would find them: the edge you slide
     down, then the page you slide sideways. The swell takes about 1.15s, so
     three seconds leaves the better part of two seconds of stillness between
     them — long enough that they read as two sentences rather than one busy
     moment, short enough to still be the same thought.

     After that pair, the ordinary rhythm: the standing thirty second offer,
     taking turns, starting with the rail. Nothing here touches `turn`, so the
     alternation below is exactly what it was.

     THE TWO TIMERS ARE INDEPENDENT ON PURPOSE. noteUse() clears the rail's
     when the notches are touched, and it must not clear the swipe's: putting a
     thumb on the rail is not swiping to another page, and the one thing that
     should call off the opening lean is somebody having already found the
     gesture it is about. That question belongs to js/swipe.js, which refuses
     for itself once a real drag has happened. */
  function armHints(route) {
    if (hintsSet || !route) return;
    hintsSet = true;

    var home = route.name === 'home';
    var start = function () {
      if (home) {
        firstTimer = window.setTimeout(function () {
          firstTimer = 0;
          hint();
        }, HINT_FIRST);

        swipeTimer = window.setTimeout(function () {
          swipeTimer = 0;
          swipeHint(true);
        }, HINT_FIRST + HINT_SWIPE_AFTER);
      }
      // beat(), not hint(): the standing offer is shared with the tab swipe.
      everyTimer = window.setInterval(beat, HINT_EVERY);
    };

    if (HC.splash && HC.splash.whenGone) HC.splash.whenGone(start);
    else start();
  }

  /* --- the one loop ----------------------------------------------------- */

  function kick() {
    if (running || !enabled) return;
    running = true;
    window.requestAnimationFrame(frame);
  }

  function frame(now) {
    var busy = false;
    var slow = reduced();

    if (hinting && wave(now || clock())) busy = true;

    if (engaged) {
      ptrY += (rawY - ptrY) * (slow ? 1 : EASE_PTR);
      if (Math.abs(rawY - ptrY) < 0.2) ptrY = rawY;
      else busy = true;
    }

    var want = engaged ? 1 : 0;
    if (Math.abs(want - gain) > 0.002) {
      gain += (want - gain) * (slow ? 1 : EASE_GAIN);
      busy = true;
    } else if (gain !== want) {
      gain = want;
      busy = true;
    }

    if (gliding) {
      glideAt += (glideTo - glideAt) * (slow ? 1 : EASE_SCROLL);
      if (Math.abs(glideTo - glideAt) < 0.5) { glideAt = glideTo; gliding = false; }
      else busy = true;
      scroller.scrollTop = glideAt;
    }

    paint();

    running = busy;
    if (busy) window.requestAnimationFrame(frame);
  }

  /* --- state ------------------------------------------------------------ */

  function setState(s) {
    rail.setAttribute('data-state', s);
  }

  function show() {
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = 0; }
    setState('on');
  }

  /* The kick is not optional. A finger held still stops the loop, because a
     still finger changes nothing; letting go is then the one moment with
     something to animate and nothing running to animate it, and without this
     the swell freezes at full and blinks out a second later. */
  function hideSoon(ms) {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(function () {
      hideTimer = 0;
      setState('off');
    }, ms);
    kick();
  }

  function setActive(i, speak) {
    if (i < 0 || i === active || !stops[i]) return;
    active = i;
    // Sized from a width read at build, so the card follows a heading across
    // the page without ever asking the layout engine a question.
    card.style.width = (widths[i] + 28) + 'px';
    if (speak && live) live.textContent = stops[i].title;
  }

  function nearest(y) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < ys.length; i++) {
      var d = Math.abs(ys[i] - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function goTo(i) {
    var max = scroller.scrollHeight - scroller.clientHeight;
    glideTo = clamp(stops[i].top - LAND, 0, max);
    glideAt = scroller.scrollTop;
    gliding = true;
    kick();
  }

  function fromScroll() {
    if (!enabled) return;
    var line = scroller.scrollTop + LINE;
    var i = 0;
    for (var k = 0; k < stops.length; k++) if (stops[k].top <= line) i = k;
    if (scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 2) {
      i = stops.length - 1;
    }
    setActive(i, false);
  }

  /* Called from the shell's scroll frame, next to the date rail's, and from
     nowhere else: this is the one entry that means the page moved, which is
     what moving() reads. The note is taken before the early return, and
     before the rail is built at all, because a fling that carries you onto a
     screen is still a fling. Anything that wants the reading brought up to
     date without saying the page moved asks refresh(). */
  function update() {
    scrollAt = clock();
    refresh();
  }

  function refresh() {
    if (!enabled || engaged || gliding) return;
    measure();
    fromScroll();
    kick();
  }

  /* --- the gesture ------------------------------------------------------
     On the scroller, not on a strip of our own. See the note at the top: a
     strip would take the right edge away from js/swipe.js for good, and this
     way both read the same gesture and only one of them claims it.

     AND READ OFF TOUCHES, NOT POINTERS. Four pointer listeners is the tidier
     build and it is wrong in the hand. A finger that lands while the page is
     still flying is a finger the browser has already promised to its own
     scrolling: the pointer stream for it is cancelled, or never starts, until
     the deceleration is over. So sling the page and grab the notches on the
     way past and nothing happened — they came to life a moment later, once
     everything had stopped, which is the one moment you no longer needed
     them. Touches keep arriving through that window. js/swipe.js and
     js/pull.js read this same scroller off touches for their own reasons;
     this is the third, and the pointer handlers below are left to the mouse,
     where there is no such thing as a page still moving under the cursor. */

  function inZone(x, hot) {
    var box = scroller.getBoundingClientRect();
    return x >= box.right - hot && x <= box.right;
  }

  function localY(y) {
    return clamp(y - rail.getBoundingClientRect().top, yFirst, yLast);
  }

  function typingTarget(el) {
    return !!(el && el.closest &&
      el.closest('input, textarea, select, [contenteditable="true"]'));
  }

  /* Is the page moving? Not asked of the scroll position, which is equal to
     itself between any two reads and would call a flying page still, but of
     when it last changed: update() runs from the shell's scroll frame for
     every frame the page moves in, and MOVING is a few frames' grace after
     the last of them. A glide of our own counts too — it is the same page
     going by under the same thumb. */
  function moving() {
    return gliding || (clock() - scrollAt) < MOVING;
  }

  /* Take the movement off the page before the scrub starts writing to it.
     The touch itself is what stops a fling on iOS, so the assignment is the
     belt to that brace; the line that earns its place is the one above it,
     because a glide of ours is not a fling and no finger stops it. */
  function arrest() {
    gliding = false;
    var top = scroller.scrollTop;
    scroller.scrollTop = top;
  }

  /* --- the gesture, whichever kind of thing is making it ----------------- */

  function begin(x, y) {
    if (!enabled || armed || engaged) return false;

    measure();
    layout();
    armed = true;
    startX = x;
    startY = y;
    /* A finger on the edge proper is the hint's answer, whichever way the
       gesture turns out to go, and it takes the swell over rather than
       starting again. Further in it is nobody's answer yet — the page is as
       likely to be what is being pressed — so the wave carries on, and the
       drag takes it over below if it turns into one. */
    if (inZone(x, HOT_TAP)) stopHint(true);
    rawY = ptrY = localY(y);
    show();
    kick();
    return true;
  }

  function drag(x, y) {
    if (!armed && !engaged) return;

    var dx = x - startX;
    var dy = y - startY;

    if (armed && !engaged) {
      if (Math.abs(dx) + Math.abs(dy) < SLOP) return;
      if (Math.abs(dx) > Math.abs(dy) * AXIS) {
        /* Sideways. That is the tab swipe's gesture, and it is already
           reading the same finger, so this one lets go of it rather than
           half-holding it. */
        release();
        hideSoon(160);
        return;
      }
      engaged = true;
      stopHint(true);   // a drag out of the outer band answers it after all
      noteUse();
      if (pointer !== -1) {
        try { scroller.setPointerCapture(pointer); } catch (err) { /* fine */ }
      }
    }

    if (!engaged) return;
    rawY = localY(y);
    var i = nearest(rawY);
    if (i !== active) { setActive(i, true); goTo(i); }
    kick();
  }

  function release() {
    armed = false;
    engaged = false;
    pointer = -1;
    finger = -1;
    arrested = false;
  }

  function finish(cancelled) {
    var quiet = armed && !engaged;

    /* A tap in the strip. Jump to the notch it landed on, and swallow the
       click that is about to land on whatever is under it.

       NOT WHEN THE PAGE WAS MOVING WHEN THE FINGER CAME DOWN. Putting a thumb
       on a page that is flying to stop it is a gesture every screen on the
       phone has, and answering that one with a jump to somewhere else is a
       worse fault than the one this file went to touches to fix. So a still
       finger that arrested the page has done exactly what it looked like it
       was doing, and nothing more; the drag out of it, which is what a thumb
       reaching for the notches is, still takes the rail below. */
    if (!cancelled && !arrested && quiet && inZone(startX, HOT_TAP)) {
      var i = nearest(rawY);
      noteUse();
      setActive(i, true);
      goTo(i);
      swallowClick = true;
      window.setTimeout(function () { swallowClick = false; }, 400);
      quiet = false;
    }

    release();

    /* A still finger in the outer band was pressing the page, not the rail.
       It is given back untouched — no jump, and the click it is about to
       fire is left alone. The reading it put up goes the short way out, the
       way a sideways swipe's does, rather than sitting there for a second
       over a card that has just been tapped. */
    hideSoon(quiet ? 160 : HOLD);

    // Whatever the page did while the thumb was down, it can be read now.
    if (pendingScan) { pendingScan = false; rescan(); }
  }

  /* --- a finger ---------------------------------------------------------- */

  function touchIn(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].identifier === finger) return list[i];
    }
    return null;
  }

  function onTouchStart(evt) {
    /* A second finger is a pinch, and this app kept zoom on purpose, so the
       rail gives back whatever it was holding rather than scrubbing through
       one of them. */
    if (finger !== -1) {
      if (evt.touches.length > 1) finish(true);
      return;
    }
    if (!enabled || armed || engaged) return;   // a mouse or a pen has it
    if (evt.touches.length !== 1) return;

    var t = evt.touches[0];
    if (typingTarget(evt.target)) return;
    if (!inZone(t.clientX, HOT_DRAG)) return;

    /* THE PAGE IS STILL MOVING, AND THIS IS THE LINE THE WHOLE THING TURNS
       ON. A touch that lands on a scrolling page is a touch the browser has
       already begun a scroll with, and a scroll that has begun cannot be
       refused at the first move: preventDefault on the moves after it is
       ignored, which is the same rule js/pull.js states next door for its own
       reason. Refused here instead, at the touch, before there is a scroll to
       argue with — and only here, because a still page has nothing to refuse
       and a refusal costs the click of anybody who was merely tapping a card
       out in the outer band. On a moving page that click was never coming:
       the first touch on a flying page stops it and fires nothing. */
    var flying = moving();
    if (flying) {
      arrest();
      if (evt.cancelable) evt.preventDefault();
    }

    if (!begin(t.clientX, t.clientY)) return;
    finger = t.identifier;
    arrested = flying;
  }

  /* Vertical travel inside the strip belongs to the rail, so the page under
     it must not scroll as well. Prevented from the first move rather than
     from the moment the gesture is claimed, because ten pixels of scroll
     before the scrub takes over is ten pixels of the page jumping. A swipe
     that turns out to be sideways does not need the default either: it
     cancels its own moves. */
  function onTouchMove(evt) {
    if (finger !== -1) {
      var t = touchIn(evt.touches);
      if (t) drag(t.clientX, t.clientY);
    }
    if (!armed && !engaged) return;
    if (evt.cancelable) evt.preventDefault();
  }

  function onTouchEnd(evt) {
    if (finger === -1) return;
    if (!touchIn(evt.changedTouches)) return;
    finish(evt.type === 'touchcancel');
  }

  /* --- a mouse, or a pen -------------------------------------------------
     A cursor cannot land on a page that is moving under it, so none of the
     above applies and the pointer stream is the right thing to read. Touch
     pointers are left alone here: they are read above, once, off the touches
     that carry them. */

  function onDown(evt) {
    if (evt.pointerType === 'touch') return;
    if (evt.pointerType === 'mouse' && evt.button !== 0) return;
    if (typingTarget(evt.target)) return;
    if (!inZone(evt.clientX, HOT_DRAG)) return;
    if (!begin(evt.clientX, evt.clientY)) return;
    pointer = evt.pointerId;
  }

  function onMove(evt) {
    if (pointer === -1 || evt.pointerId !== pointer) return;
    drag(evt.clientX, evt.clientY);
  }

  function onUp(evt) {
    if (pointer === -1 || evt.pointerId !== pointer) return;
    finish(evt.type === 'pointercancel');
  }

  /* --- wiring ------------------------------------------------------------ */

  /* Deferred while a thumb is down: re-reading the page mid drag would swap
     the notches out from under the finger holding them. */
  function scanSoon() {
    if (armed || engaged) { pendingScan = true; return; }
    rescan();
  }

  function watch() {
    /* Anything that changes what is on the page: a poll landing, data
       arriving after the first paint, a section folding open, a screen
       repainting itself in place. One rAF of debounce, because a repaint is
       many mutations and they all arrive together. */
    if (window.MutationObserver) {
      var view = document.getElementById('hc-view');
      var queued = false;
      if (view) {
        new MutationObserver(function () {
          if (queued) return;
          queued = true;
          window.requestAnimationFrame(function () {
            queued = false;
            scanSoon();
          });
        }).observe(view, { childList: true, subtree: true });
      }
    }

    if (!window.ResizeObserver) return;
    var pending = false;
    var observer = new ResizeObserver(function () {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () {
        pending = false;
        if (!enabled) return;
        measure();
        layout();
        fromScroll();
        paint();
      });
    });
    observer.observe(scroller);
    // The track itself as well: Listen's month strip slides in under the
    // header and takes 42px off the top of it, and the notches have to be
    // laid out again against what is left.
    observer.observe(rail);
    var view = document.getElementById('hc-view');
    if (view) observer.observe(view);
  }

  function init(config) {
    scroller = config.scroller;
    rail = config.rail;
    titles = config.titles;
    card = config.card;
    veil = config.veil;
    live = config.live;
    track = rail.querySelector('.hc-index__track');

    /* The touches first, and before js/swipe.js and js/pull.js are wired, so
       that HC.indexRail.busy() is already true when the pull asks. Neither of
       them is passive: the rail has to be able to say a gesture is not a
       scroll, and on a page that is already moving it has to say so at the
       touch rather than at the first move. */
    scroller.addEventListener('touchstart', onTouchStart, { passive: false });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd);
    scroller.addEventListener('touchcancel', onTouchEnd);

    // And the cursor, which never has this problem.
    scroller.addEventListener('pointerdown', onDown);
    scroller.addEventListener('pointermove', onMove);
    scroller.addEventListener('pointerup', onUp);
    scroller.addEventListener('pointercancel', onUp);

    document.addEventListener('click', function (evt) {
      if (!swallowClick) return;
      swallowClick = false;
      evt.stopPropagation();
      evt.preventDefault();
    }, true);

    // A notch is a button, so a keyboard gets the same jumps a thumb does.
    track.addEventListener('focusin', function () {
      noteUse();
      measure();
      layout();
      show();
    });
    track.addEventListener('focusout', function () { hideSoon(200); });

    watch();
    window.addEventListener('resize', function () {
      if (!enabled) return;
      measure();
      layout();
      paint();
    });
  }

  /* The shell's click delegation sends [data-action="index-jump"] here. */
  function jump(i) {
    if (!enabled || !stops[i]) return;
    noteUse();
    measure();
    setActive(i, true);
    goTo(i);
  }

  HC.indexRail = {
    init: init,
    build: build,
    update: update,
    jump: jump,

    /* Does this file have the finger? Asked by js/pull.js, which reads the
       same gesture off the same scroller and has to stay out of the way when
       somebody is scrubbing the edge rather than pulling the page down.

       Armed counts, not just engaged: armed is a thumb inside the rail's
       band that has not yet said which way it is going, and a pull that
       started under it would be a second claim on a finger this file is
       already holding. True by the time the pull's own touchstart runs,
       because this file's is wired first. See init(). */
    busy: function () { return armed || engaged; },

    /* Is a swell travelling down the notches right now? Asked by js/swipe.js,
       whose own hint can come due at any moment once it has waited out a
       scroll, and which must not lean while this is moving. beat() keeps the
       two apart on the ordinary turns; this covers the one case beat() cannot
       see. One thing moves at a time. */
    hinting: function () { return hinting; }
  };

})(window.HC = window.HC || {});
