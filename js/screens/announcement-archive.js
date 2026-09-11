/* ==========================================================================
   Home Church, the announcement archive
   Everything this phone has put away, and the way to put it back.

   WHY IT EXISTS. The corner of an announcement card on Home used to be an x.
   One tap, no confirm, and the card was gone from this phone permanently: the
   only way back was a "Put it back" button on the Admin screen, which members
   cannot reach and admins had no reason to go looking at. A thumb that caught
   that x while scrolling lost an announcement and nothing said so.

   The corner is an archive box now, and this is what it is a box into. The tap
   is still one tap and still has no confirm, because it no longer needs one:
   nothing is destroyed, it has moved, and the line under the last card on Home
   says where to.

   IT IS A FACT ABOUT THE PHONE AND NOT ABOUT THE CHURCH. Archiving writes to
   localStorage through js/store.js and reaches no server. Everybody else still
   has the card, the church cannot see what anybody has archived, and a phone
   that erases everything in Your account empties this list along with the
   rest. That is the whole reason this screen restores rather than un-deletes.

   WHAT IS IN IT. Every announcement in HC.data whose id this phone has
   archived, in the order the church puts announcements in, which is
   HC.data.sortAnnouncements() and is the same order they were in on Home. Two
   things are deliberately not filters here:

     - The date window. An announcement can be archived on Tuesday and run out
       of dates on Friday, and it stays in this list, because archiving is a
       fact about the phone and the window is a fact about the church. What the
       row does instead is say the announcement has come down, the same
       sentence its own page says, so "Restore" is never a promise that a card
       will appear on Home when it will not.

     - Whether it is pinned. The strip in the shell is dismissed separately and
       has no archive of its own. See dismissPin() in js/store.js.

   An id in the archive map naming an announcement the church has since deleted
   is not an error and draws nothing: there is no announcement to draw. See
   archived() below.

   A PUSHED VIEW, like one announcement's page. The route is not one of the
   five tabs and not one of the modules behind •••, so js/router.js answers
   isStop() false and the shell draws the arrow in the bar and the back disc by
   the thumb. Nothing here has to ask for that.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* ------------------------------------------------------------ selection

     WHAT IS TICKED, held here rather than in the DOM or in js/store.js.

     Not the DOM, because the list is rendered to a string in one pass like
     every screen in this app, so a repaint after a restore would read the
     ticks off elements that no longer exist.

     Not the store, because this is not a thing to remember. A selection is
     what somebody is doing right now, and a selection that survived a relaunch
     would be six announcements silently ticked on a screen somebody opened a
     week later. It is cleared on the way out of the screen, at the bottom of
     this file. */
  var selected = {};

  function selectedIds() {
    return Object.keys(selected).filter(function (id) { return selected[id] === true; });
  }

  /* Only what is both ticked and still in the list. The guard is for the one
     ordinary way the two can disagree: a content refresh lands while this
     screen is open and the church has deleted an announcement that was ticked.
     Restoring an id that names nothing would be a no-op with a toast claiming
     otherwise. */
  function liveSelection() {
    var here = {};
    archived().forEach(function (a) { here[a.id] = true; });
    return selectedIds().filter(function (id) { return here[id] === true; });
  }

  /* ---------------------------------------------------------------- the list

     The announcements this phone has archived, in the church's own order. The
     ids come from the phone and the announcements come from HC.data, and the
     join is done in that direction on purpose: an archived id with no
     announcement behind it disappears, rather than becoming a row with nothing
     in it that cannot be restored to anywhere. */
  function archived() {
    var ids = {};
    HC.store.archivedIds().forEach(function (id) { ids[id] = true; });

    return HC.data.sortAnnouncements(
      (HC.data.announcements || []).filter(function (a) { return ids[a.id] === true; })
    );
  }

  /* ------------------------------------------------------------- one row

     The same card Home draws, with the archive box in the corner swapped for
     a tick box. Same classes, which is what keeps the two screens looking like
     one app: an announcement should not change shape on its way into a list of
     announcements.

     THE CARD IS STILL A DOOR. Tapping the body opens the announcement's own
     page, exactly as it does on Home, so the archive is somewhere you can read
     from rather than only a place things are parked. The tick box is a sibling
     of that button and not a child, for the reason components.css gives about
     the corner it replaces: a button inside a button is invalid markup, and
     the one thing it must never do is make "tick this" ambiguous with "open
     this". */

  /* The label above the title, written out here rather than shared with Home
     and with the announcement's own page, which is what those two already do
     to each other. The three are the same sentence today for reasons that
     could stop being true independently: Home's dates a card in a list of
     cards, the page's dates an address somebody may have had open for a week,
     and this one dates a thing that is no longer on Home at all. */
  function label(a) {
    if (a.eyebrow) return a.eyebrow;
    return a.publishedOn
      ? 'Announcement ' + c.formatDateNumeric(a.publishedOn)
      : 'Announcement';
  }

  /* 'YYYY-MM-DD' in the phone's own zone. The date columns are plain dates, so
     no timezone is involved. The same helper Home, the Admin screen and the
     announcement's own page each keep, and for the same reason: an
     announcement retires at midnight in Metairie. */
  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  /* What restoring this one would actually do, or ''. A row that has run out
     of dates can be restored and will not reappear on Home, and saying so on
     the row is the difference between a quiet restore that looks broken and a
     button that told the truth before it was tapped. */
  function windowNote(a) {
    var today = todayLocal();
    if (a.startsOn && today < a.startsOn) {
      return 'Goes up on ' + c.formatDate(a.startsOn);
    }
    if (a.endsOn && today >= a.endsOn) {
      return 'Came down on ' + c.formatDate(a.endsOn);
    }
    return '';
  }

  function row(a) {
    var on = selected[a.id] === true;
    var note = windowNote(a);

    return '' +
      '<div class="hc-banner hc-banner--archived" data-banner="' + c.esc(a.id) + '">' +
        '<button type="button" class="hc-banner__open" data-action="open-announcement" ' +
            'data-id="' + c.esc(a.id) + '">' +
          '<span class="hc-eyebrow hc-banner__label">' +
            c.esc(c.metaLine([label(a), note])) +
          '</span>' +
          '<span class="hc-banner__title hc-body-serif">' + c.esc(a.title) + '</span>' +
          (a.body
            ? '<span class="hc-caption hc-banner__snippet">' + c.esc(a.body) + '</span>'
            : '') +
          '<span class="hc-banner__cue hc-caption">' +
            'Read it' + c.icon('chevronRight', 'hc-banner__chev') +
          '</span>' +
        '</button>' +
        /* aria-pressed rather than a real checkbox, which is what every other
           tick in this app uses (the coverage boxes in a guide, the switches
           in Admin) and what .hc-check__box in css/components.css is drawn
           for. The label names the announcement, so somebody moving through
           six rows hears which one they are ticking rather than "Select" six
           times. */
        '<button type="button" class="hc-banner__select" data-action="archive-select" ' +
            'data-id="' + c.esc(a.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' +
            'aria-label="Select “' + c.esc(a.title) + '” to restore">' +
          '<span class="hc-check__box" aria-hidden="true">' +
            c.icon('check', 'hc-check__tick') +
          '</span>' +
        '</button>' +
      '</div>';
  }

  /* ---------------------------------------------------- restore selected

     ABOVE THE TOP ROW, AND ONLY WHEN SOMETHING IS TICKED. It is drawn on every
     paint and hidden with the `hidden` attribute rather than being added and
     removed, which is what lets a tick toggle it without a repaint: ticking a
     box must not rebuild the list under the thumb that is ticking it. See
     paintSelection() below.

     A link and not a button, in the caption size, because the rest of this
     screen is a list of announcements and a filled button above it would be
     the loudest thing on a screen whose whole subject is things that have been
     put away. */
  var RESTORE = 'Restore selected announcements';

  function restoreLine() {
    var n = selectedIds().length;
    return '' +
      '<p class="hc-archive__restore-line"' + (n ? '' : ' hidden') + ' data-restore-line>' +
        '<button type="button" class="hc-inline-link hc-archive__restore" ' +
            'data-action="archive-restore">' +
          c.esc(RESTORE) +
          '<span class="hc-visually-hidden" data-restore-count>' +
            (n ? ', ' + n + ' selected' : '') +
          '</span>' +
        '</button>' +
      '</p>';
  }

  /* --------------------------------------------------------- the screen */

  var EMPTY = 'Nothing in here. Announcements you archive from Home wait in ' +
    'this list until you put them back.';

  /* Said under the heading, every time, because the one thing somebody opening
     this screen might reasonably fear is that they have done something to the
     church's announcements rather than to their own copy of them. */
  var BLURB = 'Archiving is only on this phone. Everybody else still has these ' +
    'on their Home.';

  function body() {
    var list = archived();

    var html = '<div class="hc-screen hc-archive">';

    html += c.sectionHeader('', 'Announcement Archive', { flush: true, tag: 'h1' });
    html += '<p class="hc-caption hc-archive__blurb">' + c.esc(BLURB) + '</p>';

    if (!list.length) {
      html += c.emptyState(EMPTY, 'archive');
      return html + '</div>';
    }

    html += restoreLine();
    html += '<div class="hc-archive__list">' + list.map(row).join('') + '</div>';

    return html + '</div>';
  }

  function render() {
    /* Anything ticked that is no longer in the archive goes, so a selection
       cannot outlive what it selected. Two ways that happens and both are
       ordinary: the last restore emptied the list, and a content refresh
       landed while the screen was open. */
    var here = {};
    archived().forEach(function (a) { here[a.id] = true; });
    Object.keys(selected).forEach(function (id) {
      if (!here[id]) delete selected[id];
    });

    return c.el(body());
  }

  /* A repaint that does not go through the router, the same move
     js/screens/journal.js makes after a filter tap: the screen is rendered
     from the archive map in one pass, so there is nothing to patch, and
     replacing the element in place is what keeps the reader where they were.
     Silent when the archive is not what is on screen. */
  function repaint() {
    var mount = document.querySelector('.hc-archive');
    if (!mount || !mount.parentNode) return;
    mount.parentNode.replaceChild(render(), mount);
  }

  /* Ticking a box, without redrawing the list.

     A REPAINT HERE WOULD BE WRONG AND NOT JUST WASTEFUL. The list is long
     enough to scroll, and rebuilding it on every tick would rebuild the row
     under the thumb mid-tap. So the tick moves one attribute on one button and
     shows or hides the line at the top, which is the whole of what changed. */
  function paintSelection() {
    var n = selectedIds().length;

    var line = document.querySelector('[data-restore-line]');
    if (line) line.hidden = n === 0;

    var count = document.querySelector('[data-restore-count]');
    if (count) count.textContent = n ? ', ' + n + ' selected' : '';
  }

  function toggle(id) {
    if (!id) return;
    if (selected[id]) delete selected[id];
    else selected[id] = true;

    var box = document.querySelector('[data-action="archive-select"][data-id="' +
      (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id) + '"]');
    if (box) box.setAttribute('aria-pressed', selected[id] ? 'true' : 'false');

    paintSelection();
  }

  /* The one write this screen makes. Every ticked announcement goes back to
     Home in a single write to localStorage and a single 'dismissed' event, so
     a selection of six is one repaint rather than six. See unarchiveAll() in
     js/store.js.

     The toast says a counted number rather than "Restored", because the number
     is the confirmation: the rows leave this screen either way, and how many
     went back is the only part somebody cannot see for themselves without
     going to Home to count. */
  function restoreSelected() {
    var ids = liveSelection();
    if (!ids.length) return;

    var moved = HC.store.unarchiveAll(ids);
    selected = {};
    repaint();

    if (!moved) return;
    HC.native.tap('Light');
    c.toast(moved === 1
      ? 'Back on Home.'
      : moved + ' announcements are back on Home.');
  }

  HC.screens = HC.screens || {};
  HC.screens.announcementArchive = render;

  /* Handed to js/app.js, which owns every data-action in the app, and to the
     tests. Nothing here touches the DOM except through the two paint functions
     above, so the three that decide what is in the list and what is ticked can
     be asked without a browser. tests/announcement-archive.test.js. */
  HC.screens.archiveHelpers = {
    archived: archived,
    selectedIds: selectedIds,
    liveSelection: liveSelection,
    toggle: toggle,
    restoreSelected: restoreSelected,
    repaint: repaint,

    /* Leaving the screen empties the selection, for the reason the note on
       `selected` gives: it is what somebody is doing now, not something to
       come back to. Called from the 'view' subscriber in js/app.js rather than
       subscribed to here, so the order the script tags load in cannot decide
       whether it happens. */
    forget: function () { selected = {}; }
  };

})(window.HC = window.HC || {});
