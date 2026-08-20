/* ==========================================================================
   Home Church, Journal
   The list of everything you have written, and the screen for one entry.

   NOT ONE FETCH IN THIS FILE, same rule the Group tab keeps. Everything that
   stores or syncs an entry is in js/journal.js and this only ever draws what
   that hands back.

   Two views:
     journal        the list, grouped by the guide an entry belongs to
     journal-entry  one entry, open, with the editor in it

   A new entry does not exist until somebody types. Tapping New opens
   journal-entry with the id 'new' and a draft kept here; the first keystroke
   is what creates the row and swaps the route under it. Otherwise every
   abandoned tap would leave an empty card in the list, and a list that fills
   with blanks is worse than one extra branch here.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* Local to this screen, like the drafts in js/screens/group.js. A filter is
     not worth persisting and a person who leaves the tab and comes back is
     asking for the whole list, not for last Tuesday's search. */
  var filter = 'all';
  var search = '';
  var draft = null;      // { bodyText, guideId } while a new entry is unsaved

  var FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'highlight', label: 'Highlights' },
    { id: 'scripture', label: 'Scripture' }
  ];

  /* ---------------------------------------------------------------- pieces */

  function query() {
    var opts = { search: search.trim() };
    if (filter === 'highlight') opts.kind = 'highlight';
    if (filter === 'scripture') opts.withScripture = true;
    return HC.journal.all(opts);
  }

  // A card's first line. The quote when there is one, because that is what
  // you were looking at; otherwise your own opening words.
  function preview(entry) {
    var text = (entry.bodyText || '').replace(/\s+/g, ' ').trim();
    if (text.length > 150) text = text.slice(0, 149).replace(/\s\S*$/, '') + '…';
    return text;
  }

  function when(entry) {
    return c.formatDateShort(String(entry.createdAt).slice(0, 10));
  }

  function eyebrowFor(entry) {
    if (entry.kind === 'highlight') return 'From the guide';
    if (entry.kind === 'reflection') return 'Take home';
    if (entry.kind === 'night') return 'Your group';
    return entry.guideTitle ? 'On this guide' : 'Loose note';
  }

  function card(entry) {
    var body = preview(entry);

    return '' +
      '<button type="button" class="hc-jcard" data-action="journal-open" data-id="' + c.esc(entry.id) + '">' +
        '<span class="hc-jcard__top">' +
          '<span class="hc-eyebrow">' + c.esc(eyebrowFor(entry)) + '</span>' +
          (entry.pinned ? '<span class="hc-jcard__pin" aria-label="Pinned">' +
            c.icon('pin', 'hc-jcard__pin-icon') + '</span>' : '') +
        '</span>' +

        // The quote is the header when there is one. A highlight with no note
        // is still an entry, and this is the whole of what it says.
        (entry.quote
          ? '<span class="hc-jcard__quote">' + c.esc(entry.quote) + '</span>'
          : '') +

        (body ? '<span class="hc-jcard__body">' + c.esc(body) + '</span>' : '') +

        (!body && !entry.quote
          ? '<span class="hc-jcard__body hc-jcard__body--empty">Nothing written here yet.</span>'
          : '') +

        '<span class="hc-jcard__foot">' +
          '<span class="hc-caption">' + c.esc(when(entry)) + '</span>' +
          ((entry.refs || []).length
            ? '<span class="hc-caption hc-jcard__refs">' + c.esc(entry.refs.join(' · ')) + '</span>'
            : '') +
        '</span>' +
      '</button>';
  }

  /* Grouped by the guide an entry belongs to, newest group first, with the
     untagged ones last under their own heading. The Guide index already
     groups by series this way, so it is a pattern that exists rather than a
     new one to learn. */
  function grouped(list) {
    var order = [];
    var groups = {};

    list.forEach(function (entry) {
      var key = entry.guideId || '__loose';
      if (!groups[key]) {
        groups[key] = { title: entry.guideTitle || 'Loose notes', entries: [] };
        order.push(key);
      }
      groups[key].entries.push(entry);
    });

    // Loose notes go last wherever they landed. They are the miscellany.
    order = order.filter(function (k) { return k !== '__loose'; })
      .concat(groups.__loose ? ['__loose'] : []);

    var html = '';
    order.forEach(function (key) {
      var group = groups[key];
      html += c.sectionHeader(key === '__loose' ? 'No guide' : 'Guide', group.title);
      html += '<div class="hc-jlist">';
      group.entries.forEach(function (entry) { html += card(entry); });
      html += '</div>';
    });
    return html;
  }

  function filterRow() {
    // hc-pills is the row Connect already uses for exactly this.
    var html = '<div class="hc-pills hc-journal__filters" role="group" aria-label="Filter your journal">';
    FILTERS.forEach(function (f) {
      html += '<button type="button" class="hc-pill" data-action="journal-filter" ' +
        'data-value="' + f.id + '" aria-pressed="' + (filter === f.id ? 'true' : 'false') + '">' +
        c.esc(f.label) + '</button>';
    });
    return html + '</div>';
  }

  /* ------------------------------------------------------------- the list */

  function list() {
    var entries = query();
    var everything = HC.journal.count();

    var html = '<div class="hc-screen hc-journal">';

    html += c.sectionHeader('Yours', 'Journal', { flush: true, tag: 'h1' });
    html += '<p class="hc-body-serif hc-journal__intro">Everything you have written down, from a guide or on ' +
      'your own. Nobody else can see any of it.</p>';

    html += '<div class="hc-journal__new">' +
      c.button('New entry', { action: 'journal-new', icon: 'plus' }) +
    '</div>';

    // The search box and the filters are worth their space once there is
    // something to sift. On an empty journal they are furniture.
    if (everything > 2) {
      html += '<label class="hc-field hc-journal__search">' +
        '<span class="hc-visually-hidden">Search what you have written</span>' +
        '<input class="hc-input" type="search" data-journal-search placeholder="Search your journal" ' +
          'value="' + c.esc(search) + '">' +
      '</label>';
      html += filterRow();
    }

    if (!entries.length) {
      html += c.emptyState(everything
        ? 'Nothing matches that. Try fewer words.'
        : 'Nothing here yet. Highlight something in a guide, or start with a blank page. Both count.');
    } else {
      html += grouped(entries);
    }

    html += storageNote();

    html += '</div>';
    return html;
  }

  /* Said out loud on both screens, because where somebody's writing lives is
     not a detail to leave them guessing about. It is also the honest version:
     signed out this never leaves the phone, and signed in it does. */
  function storageNote() {
    var signedIn = HC.auth.isSignedIn();
    return '<p class="hc-caption hc-journal__where">' +
      c.icon(signedIn ? 'lock' : 'download', 'hc-journal__where-icon') +
      '<span>' + (signedIn
        ? 'Saved on this phone and in your account, so it follows you to a new one. Only you can see it.'
        : 'Saved on this phone. Sign in and it follows you to a new one.') +
      '</span></p>';
  }

  /* -------------------------------------------------------------- one entry */

  function guidePicker(entry) {
    var guides = HC.data.guidesByDate();
    var current = entry ? entry.guideId : (draft && draft.guideId);

    var opts = '<option value=""' + (!current ? ' selected' : '') + '>No guide</option>';
    guides.forEach(function (g) {
      opts += '<option value="' + c.esc(g.id) + '"' + (current === g.id ? ' selected' : '') + '>' +
        c.esc(HC.data.guideTitle(g)) + '</option>';
    });

    return '<label class="hc-field hc-entry__guide">' +
      '<span class="hc-field__label">Which guide is this about?</span>' +
      '<select class="hc-input hc-select" data-journal-guide>' + opts + '</select>' +
    '</label>';
  }

  function entryScreen(route) {
    var isNew = route.id === 'new';
    var entry = isNew ? null : HC.journal.get(route.id);

    if (!isNew && !entry) {
      return '<div class="hc-screen hc-journal">' +
        c.sectionHeader('Journal', 'We lost that one', { flush: true, tag: 'h1' }) +
        c.emptyState('That entry is not here. It may have been deleted on another phone.') +
        '<div class="hc-mt-lg">' +
          c.button('Back to your journal', { action: 'go-journal', variant: 'secondary' }) +
        '</div>' +
      '</div>';
    }

    var html = '<div class="hc-screen hc-entry" data-entry="' + c.esc(entry ? entry.id : 'new') + '">';

    // What you highlighted, above what you wrote about it. Not editable: it
    // is a quotation, and a quotation you can rewrite is not one.
    if (entry && entry.quote) {
      html += '<figure class="hc-entry__quote">' +
        '<blockquote class="hc-quote">“' + c.esc(entry.quote) + '”</blockquote>' +
        (entry.guideTitle
          ? '<figcaption class="hc-caption">' + c.esc(entry.guideTitle) + '</figcaption>'
          : '') +
      '</figure>';
    } else {
      html += c.sectionHeader(entry ? 'Your entry' : 'New', entry && entry.title ? entry.title : 'Write it down',
        { flush: true, tag: 'h1' });
    }

    html += HC.editor.field({
      id: 'hc-entry-body',
      html: entry ? entry.bodyHtml : (draft ? draft.bodyHtml : ''),
      label: 'What you want to say',
      placeholder: 'Whatever it was. Nobody is reading this but you.'
    });

    /* A reflection answer already knows which guide and which question it
       belongs to, and moving it to another guide would orphan it from the
       prompt above it. Everything else gets the picker. */
    if (!entry || entry.kind === 'entry') {
      html += guidePicker(entry);
    } else if (entry.guideTitle) {
      html += '<p class="hc-caption hc-entry__tag">' + c.esc(entry.guideTitle) + '</p>';
    }

    if (entry) {
      html += '<div class="hc-entry__tools">' +
        c.button(entry.pinned ? 'Unpin' : 'Pin to the top', {
          action: 'journal-pin', id: entry.id, variant: 'tertiary', small: true, icon: 'pin'
        }) +
        c.button('Delete', { action: 'journal-delete', id: entry.id, variant: 'tertiary', small: true }) +
      '</div>';
    }

    html += storageNote();

    html += '</div>';
    return html;
  }

  /* ---------------------------------------------------------------- render */

  function repaint() {
    var route = HC.router.current();
    if (!route) return;
    if (route.name === 'journal') {
      var mount = document.querySelector('.hc-journal');
      if (!mount || !mount.parentNode) return;
      mount.parentNode.replaceChild(c.el(list()), mount);
    }
  }

  HC.screens = HC.screens || {};
  HC.screens.journal = function () { return c.el(list()); };
  HC.screens.journalEntry = function (route) { return c.el(entryScreen(route)); };

  HC.screens.journalHelpers = {
    repaint: repaint,
    setFilter: function (v) { filter = v; },
    getFilter: function () { return filter; },
    setSearch: function (v) { search = v; },

    // The unsaved new entry. See the note at the top of this file.
    getDraft: function () { return draft; },
    startDraft: function () { draft = { bodyHtml: '', guideId: null }; },
    setDraft: function (patch) { draft = Object.assign(draft || { bodyHtml: '', guideId: null }, patch); },
    clearDraft: function () { draft = null; }
  };

})(window.HC = window.HC || {});
