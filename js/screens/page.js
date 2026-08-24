/* ==========================================================================
   Home Church, a content page
   One screen that draws any row in content_pages, the same way there is one
   practice page rather than nine.

   WHAT IT IS FOR. Prose the church owns and might want to soften at ten at
   night: the paragraph on Give, and whatever gets written next. Editing one
   is Settings -> Admin -> Content, and the edit is live in the app straight
   away with no build and no App Store review.

   PARAGRAPHS. A section's body is one string with blank lines in it, because
   that is what somebody types into a textarea on a phone. Splitting it into
   paragraphs is a rendering decision and it happens here, not in the mapper
   in js/content.js and not in the table. Nobody writing an announcement
   should be composing an array of strings.

   NOT THE PRACTICES. Those are Practicing the Way's writing and their videos,
   and js/practices.js sets out at length why they are generated once by a
   script, reviewed, and committed rather than edited in a table. This screen
   has nothing to do with them.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* Blank lines separate paragraphs, a single newline does not. That is how
     the rest of the world's text boxes behave and it means a soft wrap in the
     middle of a sentence does not become a paragraph break. */
  function paragraphs(text, className) {
    return String(text || '')
      .split(/\n\s*\n/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean)
      .map(function (part) {
        return '<p class="' + className + '">' + c.esc(part) + '</p>';
      })
      .join('');
  }

  function body(page) {
    var html = '';
    if (page.blurb) html += paragraphs(page.blurb, 'hc-body-serif hc-page__lede');

    (page.sections || []).forEach(function (section) {
      if (section.heading) html += c.sectionHeader('', section.heading);
      if (section.body) html += paragraphs(section.body, 'hc-body-serif hc-page__text');
    });

    return html;
  }

  function render(route) {
    var page = route && route.id ? HC.data.getPage(route.id) : null;

    /* A page that is not there yet. Three ways to arrive here: the content
       sync has not landed, the row is a draft, or somebody deleted it and an
       old history entry still points at it. All three want the same thing,
       which is not an error, so this says the warm version and offers the way
       back rather than explaining itself. */
    if (!page) {
      return c.el('' +
        '<div class="hc-screen hc-page">' +
          c.emptyState('This page is not here right now. It may still be on its way.') +
        '</div>');
    }

    var html = '<div class="hc-screen hc-page">';
    html += c.sectionHeader(page.eyebrow || '', page.title, { flush: true, tag: 'h1' });
    html += body(page);
    html += '</div>';

    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.page = render;

  // The Give screen draws its own copy from a page row and needs the same
  // paragraph rule. One exported helper rather than a second copy of the
  // split, so the two can never disagree about what a paragraph is.
  HC.screens.pageHelpers = { paragraphs: paragraphs };

})(window.HC = window.HC || {});
