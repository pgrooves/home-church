/* ==========================================================================
   Home Church, search
   The box, and the list under it. What it looks through, and why it looks
   through exactly that, is js/search.js. This file is the screen.

   A PUSHED VIEW, like Your account or an announcement. It is not one of the
   five tabs and not one of the modules behind •••, so js/router.js answers
   isStop() false and the shell draws the arrow in the bar and the back disc
   by the thumb. A sideways drag does nothing here, which is right: you came
   to type, not to browse.

   THE QUERY IS IN THE ADDRESS. Every keystroke, once it settles, is written
   into the route with replaceCurrent(), the same call the Journal uses for a
   new entry and for the same reason: it changes where you are without
   redrawing what you are looking at. So the back gesture leaves search
   rather than walking backwards through the letters somebody typed, and a
   restored history entry opens on the results it had.

   THE RESULTS ARE REPAINTED, THE SCREEN IS NOT. Redrawing the whole view on
   every keystroke would pull the field out from under the thumb typing into
   it and take the caret and the keyboard with it. So the box is drawn once
   and only the list under it is written again, which also means the input
   never has to be refocused and the selection never moves.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* What the screen says before anybody has typed. Editable in place, because
     it is the church's voice and because the list of things it names is the
     kind of sentence that goes out of date the week a new module lands. */
  var HINT = 'Messages, guides and every question in them, announcements, ' +
    'events, groups, serve teams, the practices, what we sang on Sunday, and ' +
    'anything you have written in your own journal.';

  var NO_MATCHES = 'Nothing matches that yet. Try a word from the title, a ' +
    'name, or a passage.';

  // The query the box is holding. Not read from the DOM, because the DOM is
  // rewritten under it and this has to survive that.
  var query = '';

  /* ------------------------------------------------------------ the results */

  function resultRow(r) {
    var id = r.route.id ? ' data-id="' + c.esc(r.route.id) + '"' : '';
    return '' +
      '<button type="button" class="hc-result" data-action="search-open" ' +
          'data-route="' + c.esc(r.route.name) + '"' + id + '>' +
        '<span class="hc-result__body">' +
          '<span class="hc-eyebrow hc-result__kind">' + c.esc(r.kind) + '</span>' +
          '<span class="hc-result__title">' + c.esc(r.title) + '</span>' +
          (r.sub
            ? '<span class="hc-caption hc-result__sub">' + c.esc(r.sub) + '</span>'
            : '') +
          /* The one place in this screen that writes markup rather than
             escaped text, and the only markup in it is the <mark> that
             js/search.js put there itself. Everything around the marks was
             escaped on the way out of that file, one piece at a time. */
          (r.snippet
            ? '<span class="hc-result__snippet">' + r.snippet + '</span>'
            : '') +
        '</span>' +
        c.icon('chevronRight', 'hc-result__chevron') +
      '</button>';
  }

  function resultsMarkup() {
    /* Both of these are the church's voice, so both are editable in place,
       and neither is at risk from the repaint on every keystroke: they are
       the two things that are only ever on screen when nobody is typing. An
       empty box draws the first and a search that found nothing draws the
       second, and those are different sentences on purpose. */
    if (!query.trim()) {
      var hint = HC.data.copy('search.hint', HINT);
      return HC.edit.wrap(
        hint ? '<p class="hc-body-serif hc-search__hint">' + c.esc(hint) + '</p>' : '',
        { slot: 'search.hint', value: hint,
          label: 'what the search box says it looks through', rows: 4 }
      );
    }

    var found = HC.search.results(query);

    if (!found.length) {
      var line = HC.data.copy('search.empty', NO_MATCHES);
      return HC.edit.wrap(
        line ? c.emptyState(line) : '',
        { slot: 'search.empty', value: line,
          label: 'what a search with no results says', rows: 3 }
      );
    }

    /* The count is said out loud rather than left to be counted. It is also
       the live region for this screen: somebody using VoiceOver types into
       the box and hears how many answers came back without having to swipe
       into the list to find out. */
    var html = '<p class="hc-caption hc-search__count" role="status" aria-live="polite">' +
      found.length + (found.length === 1 ? ' result' : ' results') + '</p>';

    html += '<div class="hc-results">';
    found.forEach(function (r) { html += resultRow(r); });
    html += '</div>';
    return html;
  }

  function repaint() {
    var slot = document.querySelector('[data-search-results]');
    if (!slot) return;
    slot.innerHTML = resultsMarkup();
  }

  function setQuery(value) {
    query = String(value == null ? '' : value);
    repaint();

    /* The address follows the box. Not go(), which would draw the screen
       again: this only changes where the phone thinks it is, so the back
       gesture leaves Search instead of stepping back through the typing. */
    var route = HC.router.current();
    if (route && route.name === 'search') {
      HC.router.replaceCurrent(query ? { name: 'search', id: query } : { name: 'search' });
    }
  }

  /* ------------------------------------------------------------- the screen */

  function render(route) {
    // Arriving from a link or a restored history entry, the query is in the
    // address. Arriving from the top bar, it is empty, and so is the box.
    query = (route && route.id) ? String(route.id) : '';

    var html = '<div class="hc-screen hc-search">';

    html += c.sectionHeader('Everything in the app', 'Search',
      { flush: true, tag: 'h1' });

    html += '<label class="hc-field hc-search__field">' +
      '<span class="hc-visually-hidden">Search Home Church</span>' +
      '<span class="hc-search__box">' +
        c.icon('search', 'hc-search__icon') +
        '<input class="hc-input hc-search__input" type="search" data-search-box ' +
          'placeholder="Search Home Church" autocomplete="off" ' +
          'autocorrect="off" autocapitalize="none" spellcheck="false" ' +
          'value="' + c.esc(query) + '">' +
      '</span>' +
    '</label>';

    html += '<div class="hc-search__results" data-search-results>' +
      resultsMarkup() +
    '</div>';

    html += '</div>';
    return c.el(html);
  }

  /* The keyboard comes up on its own. Screens here render to a string in one
     pass and get no moment after they are mounted, so this listens for the
     view change the router emits once the element is on the glass, which is
     the same seam js/date-rail.js and js/index-rail.js hang off.

     Guarded on the route name because this fires for every screen in the app,
     and wrapped because a browser is allowed to refuse focus. */
  if (HC.store && HC.store.on) {
    HC.store.on('view', function (route) {
      if (!route || route.name !== 'search') return;
      var box = document.querySelector('[data-search-box]');
      if (!box) return;
      try {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      } catch (err) {
        // A field that will not take focus is a field somebody taps. Fine.
      }
    });
  }

  HC.screens = HC.screens || {};
  HC.screens.search = render;
  HC.screens.searchHelpers = {
    setQuery: setQuery,
    repaint: repaint,
    query: function () { return query; }
  };

})(window.HC = window.HC || {});
