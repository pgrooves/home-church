/* ==========================================================================
   Home Church, the screen before Home

   The app used to open straight onto the Home tab. This holds a greeting in
   front of it for a couple of seconds: the gold house, "Welcome home, Trey."
   and Loading in small type at the bottom. Drawn in demo-splash first, and
   the study that was picked is the one that borrows the Home tab's own
   display face and paper, so the handoff is a change of words rather than a
   change of screen.

   WHY THE MARKUP IS IN index.html AND NOT HERE. The splash has to be on the
   glass at first paint, before any script has run, or the thing it exists to
   cover is the very thing you would see. So the layer and its three pieces
   ship in the document and this file only does the two things markup cannot:
   put the name in, and take the whole thing away when Home is ready.

   WHY IT READS THE THEME BEFORE app.js DOES. Dark mode is an attribute on
   <html>, set by store.applyPreferences(), which used to happen in boot().
   The splash paints before boot, so on a phone in dark mode it would appear
   in paper and snap to charcoal a frame later. Calling it here settles that
   before the first paint. It is idempotent, and boot() still calls it.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* HOW LONG IT STAYS. The floor is the honest cost of the thing: the house
     arrives, the welcome follows, the light crosses the mark, and only then
     does the splash lift off. Cutting the floor below that means launching
     into the middle of an animation, which looks like a stutter rather than a
     greeting. Everything the app does at boot is finished long before this,
     so in practice the floor is the whole duration.

     Reduce Motion has no sequence to wait for, since base.css collapses every
     animation, so it holds only long enough to be read and no longer.

     The ceiling is the promise that this can never be what keeps somebody out
     of the app. Home is already painted underneath, so if boot never says it
     is ready, the layer leaves anyway. */
  var FLOOR = 2750;
  var FLOOR_STILL = 1200;
  var CEILING = 5000;
  var FADE = 420;

  var el = null;
  var shownAt = 0;
  var done = false;
  var ceilingTimer = null;

  function reduced() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Signed out, and on a genuinely first launch, this stays "Welcome home."
     rather than reaching for a stand-in. Nobody is called friend here. */
  function paintGreeting() {
    var line = document.getElementById('hc-splash-greeting');
    if (!line) return;

    var name = HC.store ? HC.store.firstName() : '';
    line.textContent = name ? 'Welcome home, ' + name + '.' : 'Welcome home.';
  }

  function remove() {
    if (!el) return;
    if (el.parentNode) el.parentNode.removeChild(el);
    el = null;
  }

  /* Called by boot() the moment Home is on the glass. Everything after this
     is the floor: if Home was ready early, which it always is, the splash
     waits out the rest of its own sequence before leaving. */
  function ready() {
    if (done || !el) return;
    done = true;
    clearTimeout(ceilingTimer);

    var floor = reduced() ? FLOOR_STILL : FLOOR;
    var waited = Date.now() - shownAt;

    setTimeout(function () {
      if (!el) return;
      el.classList.add('hc-splash--out');
      /* Removed rather than left at opacity 0. A fixed layer over the whole
         screen still swallows taps, and a phone that never fires the
         transition would be a phone nobody could use. */
      setTimeout(remove, FADE + 60);
    }, Math.max(0, floor - waited));
  }

  function init() {
    el = document.getElementById('hc-splash');
    if (!el) return;

    shownAt = Date.now();
    if (HC.store) HC.store.applyPreferences();
    paintGreeting();

    ceilingTimer = setTimeout(function () {
      done = true;
      if (!el) return;
      el.classList.add('hc-splash--out');
      setTimeout(remove, FADE + 60);
    }, CEILING);
  }

  init();

  HC.splash = {
    ready: ready,
    /* For anything that needs to know whether the greeting is still up, and
       for the tests. */
    showing: function () { return !!el; }
  };

})(window.HC = window.HC || {});
