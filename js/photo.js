/* ==========================================================================
   Home Church, the photo viewer
   Tap a picture on an announcement and it comes up whole, over a dark
   screen, the way Photos shows one.

   WHY IT EXISTS. The announcement page draws its pictures in a 4:3 frame,
   cropped, because a photograph of a serve day reads fine with its edges
   trimmed. A flyer does not: a food drive poster lifted from the newsletter
   is tall, and the crop takes the dates, the list and the address off the
   bottom of it, which are the parts somebody needed. So the frame stays the
   way it is, and a tap shows the whole thing.

   WHAT YOU CAN DO WITH IT.
     pinch                 zoom in and out, around your fingers
     double tap            zoom in on that spot, or back out
     drag                  move around once zoomed in
     drag down, at rest    close it, the way Photos does
     tap the dark, or ✕    close it

   THE PAGE UNDER IT IS NOT ZOOMED. The stage is touch-action: none, so a
   pinch here moves the picture and not the app; this app kept system zoom on
   purpose, and leaving a phone zoomed in on a page it cannot see would be a
   bad way to say goodbye to a picture.

   IT IS A SHEET to everything else in the app: class hc-sheet, so a pull
   down on it is not a pull to refresh (js/pull.js) and the highlight bar
   does not come up through it (js/highlight.js). It drops its sheet layout
   in css/components.css under .hc-photo.

   OPENED FROM js/app.js, the 'photo-open' action, which the gallery in
   js/screens/announcement.js puts on every picture.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var MAX = 5;          // as far in as a pinch goes
  var DOUBLE = 2.5;     // where a double tap lands
  var DISMISS = 110;    // px of downward drag at rest that closes it

  /* The gesture in progress. Rebuilt on every open, so nothing from the last
     picture leaks into the next one. */
  var g = null;

  function root() { return document.querySelector('[data-sheet="photo"]'); }
  function isOpen() { return !!root(); }

  /* ------------------------------------------------------------ geometry */

  /* How far the picture may move at this scale before an edge comes away
     from the edge of the screen. Zero on an axis where the scaled picture
     still fits, which keeps a zoomed-out picture centred. */
  function limits(s) {
    var W = g.stage.clientWidth, H = g.stage.clientHeight;
    var w = g.img.offsetWidth * s, h = g.img.offsetHeight * s;
    return { x: Math.max(0, (w - W) / 2), y: Math.max(0, (h - H) / 2) };
  }

  function clamp(v, m) { return Math.max(-m, Math.min(m, v)); }

  function apply(animate) {
    g.img.style.transition = animate ? 'transform 220ms cubic-bezier(.2,.8,.2,1)' : 'none';
    g.img.style.transform = 'translate(' + g.x + 'px,' + g.y + 'px) scale(' + g.s + ')';
  }

  /* A point on screen as an offset from the middle of the stage, which is
     where transform-origin puts the picture's centre. */
  function local(px, py) {
    var r = g.stage.getBoundingClientRect();
    return { x: px - (r.left + r.width / 2), y: py - (r.top + r.height / 2) };
  }

  /* Scale to s, keeping the point p (stage centred) under the finger. */
  function zoomAt(s, p) {
    s = Math.max(1, Math.min(MAX, s));
    var k = s / g.s;
    g.x = p.x - (p.x - g.x) * k;
    g.y = p.y - (p.y - g.y) * k;
    g.s = s;
    var m = limits(s);
    g.x = clamp(g.x, m.x);
    g.y = clamp(g.y, m.y);
  }

  function reset() { g.s = 1; g.x = 0; g.y = 0; }

  /* ------------------------------------------------------------ gestures */

  function pts() {
    var out = [];
    for (var id in g.pointers) out.push(g.pointers[id]);
    return out;
  }

  function onDown(evt) {
    g.closeOnClick = false;
    g.stage.setPointerCapture && g.stage.setPointerCapture(evt.pointerId);
    g.pointers[evt.pointerId] = { x: evt.clientX, y: evt.clientY };
    var p = pts();
    if (p.length === 1) {
      g.start = { x: evt.clientX, y: evt.clientY, t: Date.now(), gx: g.x, gy: g.y, moved: false };
      g.pinch = null;
    } else if (p.length === 2) {
      g.pinch = {
        d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
        s: g.s,
        mid: local((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2)
      };
      if (g.start) g.start.moved = true;   // a pinch is never a tap
    }
  }

  function onMove(evt) {
    if (!g.pointers[evt.pointerId]) return;
    g.pointers[evt.pointerId] = { x: evt.clientX, y: evt.clientY };
    var p = pts();

    if (p.length >= 2 && g.pinch) {
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      var mid = local((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
      // Follow the fingers as they move, then scale around where they are.
      g.x += mid.x - g.pinch.mid.x;
      g.y += mid.y - g.pinch.mid.y;
      g.pinch.mid = mid;
      zoomAt(g.pinch.s * d / g.pinch.d, mid);
      apply(false);
      return;
    }

    if (p.length === 1 && g.start) {
      var dx = evt.clientX - g.start.x, dy = evt.clientY - g.start.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.start.moved = true;
      if (!g.start.moved) return;

      if (g.s > 1) {
        var m = limits(g.s);
        g.x = clamp(g.start.gx + dx, m.x);
        g.y = clamp(g.start.gy + dy, m.y);
        apply(false);
      } else {
        // At rest a drag only goes down, and the dark thins as it goes.
        g.y = Math.max(0, dy);
        g.x = 0;
        g.el.style.setProperty('--hc-photo-fade', String(Math.max(0.3, 1 - g.y / 400)));
        apply(false);
      }
    }
  }

  function onUp(evt) {
    if (!g.pointers[evt.pointerId]) return;
    delete g.pointers[evt.pointerId];
    var left = pts();

    if (left.length === 1) {
      // One finger lifted off a pinch: carry on as a drag from here.
      g.pinch = null;
      g.start = { x: left[0].x, y: left[0].y, t: Date.now(), gx: g.x, gy: g.y, moved: true };
      return;
    }
    if (left.length) return;

    var st = g.start;
    g.start = null;
    g.pinch = null;

    if (g.s <= 1.02) {
      if (g.y > DISMISS) { dismiss(); return; }
      reset();
      g.el.style.removeProperty('--hc-photo-fade');
      apply(true);
    }

    if (!st || st.moved || evt.type === 'pointercancel') return;

    // A tap. Two on the picture inside 300ms is a double tap.
    var now = Date.now();
    var onImg = hits(g.img, evt.clientX, evt.clientY);
    if (onImg && g.lastTap && now - g.lastTap.t < 300 &&
        Math.hypot(evt.clientX - g.lastTap.x, evt.clientY - g.lastTap.y) < 30) {
      g.lastTap = null;
      if (g.s > 1) reset();
      else zoomAt(DOUBLE, local(evt.clientX, evt.clientY));
      apply(true);
      return;
    }
    g.lastTap = { t: now, x: evt.clientX, y: evt.clientY };

    /* A tap on the dark around a picture at rest closes it, on the click
       that follows rather than here. Gone on pointerup, the overlay would
       leave that click to land on whatever is under it, which is the
       picture that opened it. */
    g.closeOnClick = !onImg && g.s <= 1;
  }

  function onClick() {
    if (g && g.closeOnClick) dismiss();
  }

  /* Hit tested by position, because the stage holds pointer capture and so
     is the target of every event, whichever part of it was touched. */
  function hits(node, x, y) {
    var r = node.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* ------------------------------------------------------------- the API */

  function open(url) {
    url = String(url || '').trim();
    if (!url) return;
    dismiss();

    var el = c.el(
      '<div class="hc-sheet hc-photo" data-sheet="photo" role="dialog" aria-modal="true" ' +
        'aria-label="Picture">' +
        '<div class="hc-photo__stage">' +
          '<img class="hc-photo__img" src="' + c.esc(url) + '" alt="" draggable="false">' +
        '</div>' +
        '<button type="button" class="hc-photo__close" data-action="photo-close" ' +
          'aria-label="Close">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</div>');

    g = {
      el: el,
      stage: el.querySelector('.hc-photo__stage'),
      img: el.querySelector('.hc-photo__img'),
      pointers: {}, start: null, pinch: null, lastTap: null,
      s: 1, x: 0, y: 0
    };

    g.stage.addEventListener('pointerdown', onDown);
    g.stage.addEventListener('pointermove', onMove);
    g.stage.addEventListener('pointerup', onUp);
    g.stage.addEventListener('pointercancel', onUp);
    g.stage.addEventListener('click', onClick);
    // Safari's own pinch, which touch-action alone does not always stop.
    el.addEventListener('gesturestart', function (e) { e.preventDefault(); });

    document.getElementById('app').appendChild(el);
    el.querySelector('.hc-photo__close').focus();
  }

  function dismiss() {
    var el = root();
    if (el && el.parentNode) el.parentNode.removeChild(el);
    g = null;
  }

  function init() {
    // Leaving the page takes the picture with it, as the verse sheet does.
    HC.store.on('view', function () { if (isOpen()) dismiss(); });
    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && isOpen()) dismiss();
    });
  }

  HC.photo = {
    init: init,
    open: open,
    close: dismiss,
    isOpen: isOpen
  };

})(window.HC = window.HC || {});
