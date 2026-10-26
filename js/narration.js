/* ==========================================================================
   Home Church, a guide read out loud

   One audio element for the whole app, borrowed by whichever section is
   playing. Not one per section: six <audio> tags per guide, each holding a
   few megabytes of decoded buffer, is how a phone runs out of memory in a
   living room.

   The recordings are made once, when a guide is published, by
   scripts/build_narration.py running Kokoro on a CPU. Nothing here calls an
   API, nothing here costs anything per play, and every file is a plain mp3 in
   a public bucket. See supabase/migrations/0046_guide_narration.sql.

   WHAT THIS DELIBERATELY DOES NOT DO. Background playback. The moment the
   phone locks, this stops, because Capacitor has not been given the audio
   background mode and the Info.plist does not ask for it. That is a real
   limit and it is written down in README rather than hidden: somebody
   listening to a ten minute Sermon Summary in a car will lose it at the
   lock screen. Fixing it is an Xcode change and an App Store review answer,
   not a change to this file.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* The speeds a person actually wants. Not a slider: a slider on a phone is
     a thing you knock while scrolling, and nobody has ever wanted 1.37x. */
  var SPEEDS = [0.75, 1, 1.25, 1.5, 2];

  var audio = null;

  /* What is playing, or null. `btn` is the play button in the header, `wrap`
     its .hc-section__controls, `bar` the progress line we inserted under the
     header and own the removal of. */
  var playing = null;

  function el() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';

    audio.addEventListener('timeupdate', function () {
      /* The router replaces the whole view on navigation, which detaches the
         button this is playing for. There is no global player in this app, so
         audio still going after its controls are gone is audio nobody can
         stop. Cheaper than a router subscription and it cannot get out of
         sync with one. */
      if (playing && !document.contains(playing.btn)) { stop(); return; }
      paint();
    });

    audio.addEventListener('ended', function () { stop(); });

    audio.addEventListener('error', function () {
      /* Offline, or a file that is not there yet. Say so where the tap
         happened rather than in a toast that covers the text. */
      if (playing) {
        var note = playing.btn.getAttribute('aria-label') || 'this section';
        HC.components.toast('Could not play ' + note.replace(/^Listen to /, '') +
          '. Check your signal and try again.');
      }
      stop();
    });

    return audio;
  }

  /* ------------------------------------------------------------------ speed */

  function speed() {
    var p = HC.store.getProfile();
    var v = Number(p && p.narrationSpeed);
    return SPEEDS.indexOf(v) >= 0 ? v : 1;
  }

  function applySpeed(a) {
    /* Without this a faster read is a chipmunk. Safari wants the prefixed
       name and has for years; setting all three is two dead assignments and
       no branching. */
    a.preservesPitch = true;
    a.mozPreservesPitch = true;
    a.webkitPreservesPitch = true;
    a.playbackRate = speed();
  }

  function label(v) {
    // 1× not 1.0×, 1.25× not 1.3×. Trailing zeros read as precision nobody asked for.
    return String(v) + '×';
  }

  function paintSpeed() {
    var text = label(speed());
    var nodes = document.querySelectorAll('[data-narrate-rate]');
    for (var i = 0; i < nodes.length; i++) nodes[i].innerHTML = text;
  }

  function cycle() {
    var next = SPEEDS[(SPEEDS.indexOf(speed()) + 1) % SPEEDS.length];
    HC.store.updateProfile({ narrationSpeed: next });
    if (audio) applySpeed(audio);
    paintSpeed();
    HC.native.tap('Light');
  }

  /* --------------------------------------------------------------- progress */

  /* The row under the header, built only while something is playing: a
     progress line and the speed pill. Built here rather than drawn by
     c.collapsible() because it exists for a few minutes at a time, and a
     guide holding six of these permanently is six controls for five things
     that are not happening. */
  function playBar(section) {
    var row = section.querySelector('.hc-section__playbar');
    if (row) return row;

    row = document.createElement('div');
    row.className = 'hc-section__playbar';

    var track = document.createElement('div');
    track.className = 'hc-section__progress';
    track.setAttribute('aria-hidden', 'true');
    track.appendChild(document.createElement('span'));

    var pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'hc-narrate-speed';
    pill.setAttribute('data-action', 'narrate-speed');
    pill.setAttribute('aria-label', 'Playback speed, tap to change');
    var rate = document.createElement('span');
    rate.setAttribute('data-narrate-rate', '');
    rate.innerHTML = label(speed());
    pill.appendChild(rate);

    row.appendChild(track);
    row.appendChild(pill);

    /* Inside the header row rather than after it, so that when the guide
       reader holds the header at the top of the screen the progress and the
       speed go with it. css/components.css gives it a line of its own. */
    var head = section.querySelector('.hc-section__bar');
    if (head) head.appendChild(row);
    return row;
  }

  function paint() {
    if (!playing || !audio || !audio.duration) return;
    var pct = Math.min(100, (audio.currentTime / audio.duration) * 100);
    [playing.bar, playing.dock].forEach(function (host) {
      var fill = host && host.querySelector('.hc-section__progress > span');
      if (fill) fill.style.width = pct + '%';
    });
  }

  /* ------------------------------------------------------------------- dock

     THE PLAYING SECTION'S HEADER STAYS ON SCREEN FOR THE WHOLE PAGE. In the
     guide reader every header sticks under the top bar, but only until its
     own part ends, because that is all position: sticky can do. A section
     that is talking needs more than that: you press play on the Overview and
     keep reading into the Sermon Summary, and the pause button has to come
     with you.

     So while a section plays, this keeps a copy of its header, the dock,
     fixed in the same spot the sticky one sits. The copy is shown only while
     the real one is off screen, above (its part has ended) or below (you have
     scrolled back up past it), so there is never two of it, and because it is
     the same markup in the same place the hand-off cannot be seen.

     Pressing play on another part replaces the dock with that part's header.
     Tapping the dock's title scrolls back to the part that is playing. */

  /* Where a stuck header's top edge sits, in viewport pixels: the scroller's
     top plus the header's own `top`, which the browser has already resolved
     from the top bar, the pinned strip and the notch. */
  function stickyLine() {
    var scroller = document.querySelector('.hc-scroll');
    var base = scroller ? scroller.getBoundingClientRect().top : 0;
    var top = playing && playing.head
      ? parseFloat(window.getComputedStyle(playing.head).top) : 0;
    return base + (isNaN(top) ? 0 : top);
  }

  function buildDock(head) {
    var app = document.getElementById('app');
    if (!app || !head) return null;

    var dock = document.createElement('div');
    dock.className = 'hc-narrate-dock';
    dock.setAttribute('role', 'region');
    dock.setAttribute('aria-label', 'Now playing');
    dock.hidden = true;

    var inner = document.createElement('div');
    inner.className = 'hc-narrate-dock__inner';

    var copy = head.cloneNode(true);
    copy.removeAttribute('data-stuck');

    // The title takes you back to the part, rather than folding it from
    // somewhere it cannot be seen.
    var toggle = copy.querySelector('.hc-section__toggle');
    if (toggle) {
      toggle.setAttribute('data-action', 'narrate-jump');
      toggle.removeAttribute('aria-expanded');
      toggle.removeAttribute('aria-controls');
      toggle.removeAttribute('data-section-id');
    }
    // Headings belong to the page, not to a copy floating over it.
    var h = copy.querySelector('.hc-section__h');
    if (h) {
      var plain = document.createElement('div');
      plain.className = h.className;
      while (h.firstChild) plain.appendChild(h.firstChild);
      h.parentNode.replaceChild(plain, h);
    }

    var btn = copy.querySelector('.hc-narrate');
    if (btn) {
      btn.setAttribute('data-narrate-dock', '');
      btn.removeAttribute('data-narrate-src');
      btn.setAttribute('aria-pressed', 'true');
      btn.removeAttribute('data-state');
    }

    inner.appendChild(copy);
    dock.appendChild(inner);
    app.appendChild(dock);
    return dock;
  }

  var dockFrame = 0;

  function placeDock() {
    dockFrame = 0;
    if (!playing || !playing.dock) return;
    if (!document.contains(playing.btn)) { stop(); return; }

    var line = stickyLine();
    var r = playing.head.getBoundingClientRect();
    var below = r.top > window.innerHeight - r.height;
    var above = r.top < line - 0.5;
    playing.dock.hidden = !(above || below);
    if (playing.dock.hidden) return;

    // The loading dim follows the real button.
    var copy = playing.dock.querySelector('.hc-narrate');
    if (copy) {
      if (playing.btn.getAttribute('data-state')) copy.setAttribute('data-state', 'loading');
      else copy.removeAttribute('data-state');
    }
  }

  function onScroll() {
    if (!dockFrame) dockFrame = window.requestAnimationFrame(placeDock);
  }

  function jump() {
    if (!playing) return;
    var scroller = document.querySelector('.hc-scroll');
    var section = playing.btn.closest('.hc-section');
    if (!scroller || !section) return;
    var line = stickyLine();
    var y = scroller.scrollTop + section.getBoundingClientRect().top - line;
    scroller.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  /* ----------------------------------------------------------- play / stop */

  function stop() {
    if (audio) { audio.pause(); }
    if (playing) {
      playing.btn.setAttribute('aria-pressed', 'false');
      playing.btn.removeAttribute('data-state');
      playing.wrap.removeAttribute('data-playing');
      if (playing.bar && playing.bar.parentNode) {
        playing.bar.parentNode.removeChild(playing.bar);
      }
      if (playing.dock && playing.dock.parentNode) {
        playing.dock.parentNode.removeChild(playing.dock);
      }
      if (playing.section) playing.section.removeAttribute('data-playing');
      if (playing.reader) playing.reader.removeAttribute('data-narrating');
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    }
    playing = null;
  }

  function toggle(btn) {
    // The pause button on the dock is a copy, and pausing from it is pausing.
    if (btn.hasAttribute('data-narrate-dock')) { stop(); return; }

    var src = btn.getAttribute('data-narrate-src');
    if (!src) return;

    // The same button again means pause, and pause means stop: there is no
    // resume affordance on a control this small, and half-remembered
    // positions across six sections is a state nobody asked us to keep.
    if (playing && playing.btn === btn) { stop(); return; }

    stop();

    var section = btn.closest('.hc-section');
    var wrap = btn.closest('.hc-section__controls');
    if (!section || !wrap) return;

    var a = el();
    if (a.src !== src) a.src = src;
    a.currentTime = 0;
    applySpeed(a);

    playing = { btn: btn, wrap: wrap, bar: playBar(section), section: section };
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('data-state', 'loading');
    wrap.setAttribute('data-playing', 'true');
    paintSpeed();

    // Only the guide reader holds headers at the top, so only it gets a dock.
    var reader = section.closest('.hc-reader');
    var head = section.querySelector('.hc-section__bar');
    if (reader && head) {
      section.setAttribute('data-playing', 'true');
      reader.setAttribute('data-narrating', 'true');
      playing.reader = reader;
      playing.head = head;
      playing.dock = buildDock(head);
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
      placeDock();
    }

    a.play().then(function () {
      if (playing && playing.btn === btn) btn.removeAttribute('data-state');
      HC.native.tap('Light');
    }).catch(function () {
      // A refused play() is almost always a browser wanting a real gesture,
      // which this was. Anything else the error handler above will catch.
      stop();
    });
  }

  /* ------------------------------------------------------------------- open
     Called by the toggle-section handler in js/app.js. A section that folds
     shut while it is talking stops talking: the control that would pause it
     just went away. */

  function sectionToggled(sectionEl, open) {
    if (!sectionEl) return;
    var controls = sectionEl.querySelector('.hc-section__controls');
    if (!controls) return;

    if (open) {
      controls.hidden = false;
      paintSpeed();
      return;
    }

    if (playing && sectionEl.contains(playing.btn)) stop();
    controls.hidden = true;
  }

  /* What is playing, for a test or for the console. The audio element is
     deliberately not in the document, so document.querySelector('audio')
     finds nothing and there is no other way to ask. One detached element,
     borrowed by whichever section is talking, is the whole design. */
  function nowPlaying() {
    if (!playing || !audio) return null;
    return {
      section: playing.btn.getAttribute('data-narrate-key'),
      paused: audio.paused,
      rate: audio.playbackRate,
      time: audio.currentTime,
      pitchPreserved: audio.preservesPitch !== false
    };
  }

  HC.narration = {
    SPEEDS: SPEEDS,
    nowPlaying: nowPlaying,
    toggle: toggle,
    jump: jump,
    cycle: cycle,
    stop: stop,
    speed: speed,
    label: label,
    sectionToggled: sectionToggled
  };

})(window.HC = window.HC || {});
