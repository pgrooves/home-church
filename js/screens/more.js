/* ==========================================================================
   Home Church, More
   What is behind the ••• tile: everything that is part of the app but is not
   one of the five tabs.

   WHY THIS EXISTS. The tab bar was already at six tiles and the comment in
   js/app.js said out loud that six was past what the design system asks for.
   Journal would have been a seventh, and whatever comes after Journal an
   eighth, so rather than renegotiate the bar every time something is added,
   the sixth tile stopped being a tab. Five tabs swipe. This list grows.

   It is an ordinary pushed view, not a sheet or a popover. That is deliberate:
   the back gesture, the title in the header, and the scroll restore all work
   already, and a menu is not worth a new component nobody else uses.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* The modules, in the order they are worth opening. Adding one is a row
     here plus a route in js/app.js, and the tab bar never has to change
     again, which is the whole point of this screen. */
  function modules() {
    return [
      {
        route: 'journal',
        icon: 'journal',
        title: 'Journal',
        sub: 'Everything you have written down, from a guide or on your own.'
      },
      {
        route: 'give',
        icon: 'give',
        title: 'Give',
        sub: 'Through Overflow, in your own browser.'
      }
    ];
  }

  function moduleRow(m) {
    return '' +
      '<button type="button" class="hc-module" data-action="go-module" data-id="' + c.esc(m.route) + '">' +
        '<span class="hc-module__disc" aria-hidden="true">' + c.icon(m.icon, 'hc-module__icon') + '</span>' +
        '<span class="hc-module__body">' +
          '<span class="hc-module__title">' + c.esc(m.title) + '</span>' +
          '<span class="hc-caption">' + c.esc(m.sub) + '</span>' +
        '</span>' +
        c.icon('chevronRight', 'hc-row__chevron') +
      '</button>';
  }

  function render() {
    var html = '<div class="hc-screen hc-more">';

    html += c.sectionHeader('More', 'The rest of the app', { flush: true, tag: 'h1' });

    html += '<div class="hc-module-list">';
    modules().forEach(function (m) { html += moduleRow(m); });
    html += '</div>';

    /* Leader mode is not in the list above, because it is not a module you
       open, it is a switch that changes what the guides and the Group tab
       show you. The row is here anyway for the people who have it on, since
       otherwise the only way back to the roster is through Your account. */
    if (HC.store.getProfile().leaderMode) {
      html += c.sectionHeader('Leader mode', 'Your group');
      html += '<div class="hc-module-list">' +
        c.row({
          title: 'Roster and prayer requests',
          sub: 'Who was there, and what to carry through the week.',
          action: 'go-leader',
          chevron: true,
          serif: true
        }) +
      '</div>';
    }

    html += '<p class="hc-caption hc-more__note">Your account, notifications, and text size are under the ' +
      'circle at the top right of every screen.</p>';

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.more = render;

})(window.HC = window.HC || {});
