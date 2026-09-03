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

    var head = section.querySelector('.hc-section__bar');
    if (head && head.parentNode) head.parentNode.insertBefore(row, head.nextSibling);
    return row;
  }

  function paint() {
    if (!playing || !audio || !audio.duration) return;
    var pct = Math.min(100, (audio.currentTime / audio.duration) * 100);
    var fill = playing.bar &&
      playing.bar.querySelector('.hc-section__progress > span');
    if (fill) fill.style.width = pct + '%';
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
    }
    playing = null;
  }

  function toggle(btn) {
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

    playing = { btn: btn, wrap: wrap, bar: playBar(section) };
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('data-state', 'loading');
    wrap.setAttribute('data-playing', 'true');
    paintSpeed();

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
    cycle: cycle,
    stop: stop,
    speed: speed,
    label: label,
    sectionToggled: sectionToggled
  };

})(window.HC = window.HC || {});
