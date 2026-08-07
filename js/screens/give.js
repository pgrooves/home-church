/* ==========================================================================
   Home Church, Give
   One warm line, one button, nothing else. Giving is handled by Overflow.
   No in app payment, by design.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  function render() {
    var church = HC.data.church;

    var html = '' +
      '<div class="hc-screen hc-give">' +
        c.sectionHeader('Thank you', 'Give', { flush: true, tag: 'h1' }) +

        '<p class="hc-body-serif hc-give__line">Everything we do here runs on people who decided this place was worth it. Kids rooms, meals after a baby, the lights, the guides, the doors staying open on a Tuesday when somebody needs to talk. That is you.</p>' +

        '<div class="hc-give__action">' +
          c.button('Give through Overflow', {
            action: 'open-url',
            url: church.givingUrl,
            icon: 'arrowOut'
          }) +
          '<p class="hc-caption hc-give__note">Opens Overflow in your browser. Cash, card, and stock, all in one place.</p>' +
        '</div>' +

      '</div>';

    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.give = render;

})(window.HC = window.HC || {});
