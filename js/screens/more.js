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

  var WHERE_SETTINGS_ARE = 'Your account, notifications, and text size are under the ' +
    'circle at the top right of every screen.';

  function modules() {
    return HC.modules || [];
  }

  /* The line under each module's name is a description of what is behind the
     door, so it is editable. The name itself is not: it is what the module is
     called in the sheet, in the tab bar's ••• list and in the index rail, and
     those three have to keep agreeing. The pencil sits beside the row rather
     than inside it, because the row is already a button. */
  function moduleRow(m) {
    var sub = HC.data.copy('more.' + m.route + '-sub', m.sub);
    return HC.edit.mark(
      '<button type="button" class="hc-module" data-action="go-module" data-id="' + c.esc(m.route) + '">' +
        '<span class="hc-module__disc" aria-hidden="true">' + c.icon(m.icon, 'hc-module__icon') + '</span>' +
        '<span class="hc-module__body">' +
          '<span class="hc-module__title">' + c.esc(m.title) + '</span>' +
          '<span class="hc-caption">' + c.esc(sub) + '</span>' +
        '</span>' +
        c.icon('chevronRight', 'hc-row__chevron') +
      '</button>',
      { slot: 'more.' + m.route + '-sub', value: sub,
        label: m.title + ', the line under it', rows: 3 }
    );
  }

  function render() {
    var html = '<div class="hc-screen hc-more">';

    html += c.sectionHeader('More', 'The rest of the app', { flush: true, tag: 'h1' });

    html += '<div class="hc-module-list">';
    modules().forEach(function (m) { html += moduleRow(m); });
    html += '</div>';

    /* Leader mode is not in the list above, because it is not a module you
       open, it is something the church granted that changes what the guides
       and the Group tab show you. The row is here anyway for the people who
       have it, since otherwise the only way back to the roster is through
       Your account. Asked of HC.store.isLeader() rather than of a local
       switch, since migration 0036. */
    if (HC.store.isLeader()) {
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

    /* Admin is not in the module list either, and for the opposite reason to
       Leader mode: not a switch, but a pushed view most people do not have.
       The sheet grows the same tile for the same people, in js/app.js, and
       this row is here so this screen keeps agreeing with the one everybody
       actually sees. Drawn from local state and gated for real by the
       database, exactly as in js/screens/profile.js. */
    if (HC.admin && HC.admin.isAdmin()) {
      html += c.sectionHeader('For the church', 'Admin');
      html += '<div class="hc-module-list">' +
        c.row({
          title: 'Open the admin dashboard',
          sub: 'Everything here is live the moment you save it.',
          action: 'go-admin',
          chevron: true,
          serif: true
        }) +
      '</div>';
    }

    var note = HC.data.copy('more.note', WHERE_SETTINGS_ARE);
    html += HC.edit.wrap(
      note ? '<p class="hc-caption hc-more__note">' + c.esc(note) + '</p>' : '',
      { slot: 'more.note', value: note,
        label: 'the note at the foot of More', rows: 3 }
    );

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.more = render;

})(window.HC = window.HC || {});
