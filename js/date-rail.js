/* ==========================================================================
   Home Church, date rail
   The Listen archive runs back years. Once it starts, a second strip slides in
   under the header carrying the month each message was preached: it follows
   you down the list, and tapping a month jumps the page to it.

   It reads the DOM rather than the catalogue. Every archive row is stamped
   with its date by js/screens/listen.js, and a stop is the first row of each
   month in the order the page actually draws them. That matters, because the
   archive is grouped by series before it is sorted by date, so the months are
   only in order inside a group and the same month can come round twice. Page
   order is the one order the rail can be right about, so page order is what it
   uses.
   ========================================================================== */

(function (HC) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var scroller = null;
  var rail = null;
  var track = null;
  var topbar = null;

  var stops = [];        // { el, label, top }, in page order
  var chips = [];        // the buttons drawn from them, same order
  var anchor = null;     // the Archive header, the rail's own starting line
  var anchorTop = 0;
  var active = -1;
  var showing = false;
  var enabled = false;

  // A tap sets the month itself and then scrolls. Until the smooth scroll
  // settles, the scroll handler would keep recomputing from positions that are
  // still moving and flicker the highlight, so it stands down for a moment.
  var lockUntil = 0;

  // How far below the rail a jumped-to row lands, and how far below the rail
  // the reading line sits. The line has to be under the landing gap, or the
  // row you just jumped to falls above it and the previous month takes the
  // highlight straight back.
  var LAND = 12;
  var LINE = LAND + 8;

  function reduced() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function monthLabel(iso) {
    var parts = String(iso).split('-');
    var month = MONTHS[(parseInt(parts[1], 10) || 1) - 1];
    return month + ' ' + parts[0];
  }

  function monthKey(iso) {
    return String(iso).slice(0, 7);
  }

  /* ------------------------------------------------------------ measuring
     Offsets are taken against the scroller's own coordinates rather than
     offsetTop, which would depend on which ancestor happens to be positioned.
     Everything is measured in one pass so a rebuild costs one layout. */

  function chromeHeight() {
    return topbar ? topbar.offsetHeight : 0;
  }

  function measure() {
    if (!enabled) return;
    var base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    if (anchor) anchorTop = anchor.getBoundingClientRect().top - base;
    for (var i = 0; i < stops.length; i++) {
      stops[i].top = stops[i].el.getBoundingClientRect().top - base;
    }
  }

  /* ---------------------------------------------------------------- chips */

  function centerChip(chip, smooth) {
    var want = chip.offsetLeft - (track.clientWidth / 2) + (chip.offsetWidth / 2);
    var max = track.scrollWidth - track.clientWidth;
    if (want < 0) want = 0;
    if (want > max) want = max;
    if (Math.abs(want - track.scrollLeft) < 2) return;
    if (track.scrollTo) {
      track.scrollTo({ left: want, behavior: (smooth && !reduced()) ? 'smooth' : 'auto' });
    } else {
      track.scrollLeft = want;
    }
  }

  function setActive(index, smooth) {
    if (index < 0 || index === active) return;
    if (chips[active]) chips[active].removeAttribute('aria-current');
    active = index;
    if (!chips[active]) return;
    chips[active].setAttribute('aria-current', 'true');
    centerChip(chips[active], smooth !== false);
  }

  function paint() {
    var html = '';
    for (var i = 0; i < stops.length; i++) {
      html += '<button type="button" class="hc-date-rail__chip" data-action="date-rail-jump" ' +
        'data-index="' + i + '">' + stops[i].label + '</button>';
    }
    track.innerHTML = html;
    chips = track.querySelectorAll('.hc-date-rail__chip');
    active = -1;
  }

  /* ----------------------------------------------------------------- state */

  function show(next) {
    if (next === showing) return;
    showing = next;
    rail.setAttribute('data-show', next ? 'true' : 'false');
    // Two hairlines stacked read as a seam. While the rail is out it carries
    // the one that separates the chrome from the page.
    if (topbar) topbar.setAttribute('data-rail', next ? 'true' : 'false');
  }

  function update() {
    if (!enabled) return;

    var y = scroller.scrollTop;
    var chrome = chromeHeight();

    // Out once the Archive header has gone under the header, back in its
    // pocket the moment it returns.
    show(y > anchorTop - chrome + 8);
    if (!showing || Date.now() < lockUntil) return;

    var line = y + chrome + rail.offsetHeight + LINE;
    var found = 0;
    for (var i = 0; i < stops.length; i++) {
      if (stops[i].top > line) break;
      found = i;
    }
    setActive(found);
  }

  function jump(index) {
    var stop = stops[index];
    if (!stop) return;
    setActive(index);
    lockUntil = Date.now() + 700;
    var want = stop.top - chromeHeight() - rail.offsetHeight - LAND;
    scroller.scrollTo({
      top: want > 0 ? want : 0,
      behavior: reduced() ? 'auto' : 'smooth'
    });
  }

  /* ------------------------------------------------------------- building
     Called after every render. Anything that is not the Listen tab, or is
     Listen with nothing archived, puts the rail away entirely. */

  function build(route) {
    var isListen = route && route.name === 'listen';
    anchor = isListen ? document.getElementById('hc-archive-start') : null;
    var rows = isListen
      ? document.querySelectorAll('.hc-archive-group .hc-sermon[data-date]')
      : [];

    stops = [];
    if (anchor && rows.length) {
      var seen = null;
      for (var i = 0; i < rows.length; i++) {
        var iso = rows[i].getAttribute('data-date');
        var key = monthKey(iso);
        if (key === seen) continue;
        seen = key;
        stops.push({ el: rows[i], label: monthLabel(iso), top: 0 });
      }
    }

    enabled = stops.length > 1;
    rail.hidden = !enabled;
    if (!enabled) {
      show(false);
      track.innerHTML = '';
      chips = [];
      stops = [];
      return;
    }

    paint();
    settle();
  }

  /* A view is mounted with an enter animation that lifts it six pixels, and
     nothing tells us when the last row has finished arriving. So the first
     measurement is taken now to have something usable, and then taken again
     once the animation is over and the page is sitting where it will stay. */
  function settle() {
    measure();
    update();
    window.requestAnimationFrame(function () { measure(); update(); });
    window.setTimeout(function () { measure(); update(); }, 320);
  }

  /* ------------------------------------------------------------------ wiring
     One resize observer covers everything that can move a row: an episode
     opening in place, the text size preference, a rotation, and the fonts
     landing. Measuring is cheap and the alternative is four listeners that
     each have to remember the others. */

  function watch() {
    if (!window.ResizeObserver) return;
    var pending = false;
    var observer = new ResizeObserver(function () {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () {
        pending = false;
        measure();
        update();
      });
    });
    observer.observe(scroller);
    var view = document.getElementById('hc-view');
    if (view) observer.observe(view);
  }

  function init(config) {
    scroller = config.scroller;
    rail = config.rail;
    topbar = config.topbar;
    track = rail.querySelector('.hc-date-rail__track');

    watch();
    window.addEventListener('resize', function () { measure(); update(); });
  }

  HC.dateRail = {
    init: init,
    build: build,
    update: update,
    jump: jump
  };

})(window.HC = window.HC || {});
