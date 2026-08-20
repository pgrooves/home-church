/* ==========================================================================
   Home Church, More
   What is behind the ••• tile: everything that is part of the app but is not
   one of the five tabs.

   WHY THIS EXISTS. The tab bar was already at six tiles and the comment in
   js/app.js said out loud that six was past what the design system asks for.
   Journal would have been a seventh, and whatever comes after Journal an
   eighth, so rather than renegotiate the bar every time something is added,
   the sixth tile stopped being a tab.

   NOTHING OPENS THIS ANY MORE. ••• lifts the overflow sheet instead, and the
   modules are stops on the sideways swipe rather than rows you tap into and
   come back from. The route stays at ?v=more so an old link, a bookmark, or a
   history entry restored from a build before the change still lands somewhere
   real rather than being bounced to Home. It draws from HC.modules, the same
   array the sheet draws from, so a screen almost nobody reaches can never
   start disagreeing with the one everybody does.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  function modules() {
    return HC.modules || [];
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
