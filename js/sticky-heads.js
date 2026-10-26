/* ==========================================================================
   Home Church, a guide's headers holding on as you read

   The holding on is CSS: every part's header in the guide reader is
   position: sticky, bounded by its own part, so it stays under the top bar
   until the next part pushes it off. See "A guide's headers hold on as you
   read" in css/components.css.

   What CSS cannot say is whether a sticky thing is stuck right now, and the
   hairline under a stuck header should only be there while it is: at rest the
   part's own top rule is the divider. So this marks the one stuck header with
   data-stuck="true" and takes it off everything else.

   One listener for the app, on capture so it hears .hc-scroll without having
   to know when the router swaps it, and one measurement a frame at most.
   ========================================================================== */

(function (HC) {
  'use strict';

  var frame = 0;

  function mark() {
    frame = 0;
    var bars = document.querySelectorAll('.hc-reader .hc-section__bar');
    if (!bars.length) return;

    var scroller = document.querySelector('.hc-scroll');
    var base = scroller ? scroller.getBoundingClientRect().top : 0;

    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var style = window.getComputedStyle(bar);
      var stuck = false;
      if (style.position === 'sticky') {
        var line = base + (parseFloat(style.top) || 0);
        var section = bar.parentNode.getBoundingClientRect();
        // Its part has gone up under the line and the bar has not.
        stuck = section.top < line - 0.5 &&
          Math.abs(bar.getBoundingClientRect().top - line) < 1;
      }
      if (stuck) bar.setAttribute('data-stuck', 'true');
      else bar.removeAttribute('data-stuck');
    }
  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(mark);
  }

  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);

  HC.stickyHeads = { mark: mark };

})(window.HC = window.HC || {});
