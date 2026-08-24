/* ==========================================================================
   Home Church, Give
   One warm line, one button, nothing else. Giving is handled by Overflow.
   No in app payment, by design.

   THE WARM LINE IS EDITABLE NOW. It used to be a string in this file, which
   meant softening one sentence about money was a build and an App Store
   review. It is a row in content_pages, `page-give`, written from
   Settings -> Admin -> Content, and migration 0026 seeds it with exactly the
   words that were here.

   The fallback below is those same words, still in the source, and it is not
   redundant. It is what a phone draws on its first launch with no signal,
   before the content sync has ever reached Supabase, and what it draws
   forever on a project where nobody has run 0026. Same rule as everything
   else in this app: never blank, never blocked on the network.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* The words that ship inside the app. Kept here rather than in js/data.js
     with the rest of the bundled content, because this is one paragraph
     belonging to one screen and it is only ever read by this file. */
  var FALLBACK = 'Everything we do here runs on people who decided this place ' +
    'was worth it. Kids rooms, meals after a baby, the lights, the guides, the ' +
    'doors staying open on a Tuesday when somebody needs to talk. That is you.';

  /* The line under the button. Not the giving link, not the button's label,
     just the sentence that says what happens when you press it. Editable in
     place because it is exactly the kind of thing that goes slightly wrong
     and stays wrong: the payment processor changes, or "stock" stops being
     true, and nobody is going to ship a build for one clause. See
     js/edit-mode.js. */
  var NOTE = 'Opens Overflow in your browser. Cash, card, and stock, all in one place.';

  function render() {
    var church = HC.data.church;
    var page = HC.data.getPage('page-give');

    var lede = page && page.blurb ? page.blurb : FALLBACK;
    var note = HC.data.copy('give.note', NOTE);

    /* The opening paragraph is editable only once the page row exists. Until
       then what is on screen is the fallback above, which is a string in this
       file with no row behind it to write to, and offering an edit that has
       nowhere to go would be worse than not offering one. Writing the page
       once from Settings -> Admin -> Content is what turns it on, and
       migration 0026 seeds it, so on this church's project it already is. */
    var ledeHtml = HC.screens.pageHelpers.paragraphs(lede, 'hc-body-serif hc-give__line');
    if (page && page.blurb) {
      ledeHtml = HC.edit.wrap(ledeHtml, {
        table: 'content_pages', id: page.id, column: 'blurb',
        target: page, field: 'blurb',
        value: page.blurb, label: 'the opening paragraph on Give', rows: 6
      });
    }

    var html = '' +
      '<div class="hc-screen hc-give">' +
        c.sectionHeader(
          (page && page.eyebrow) || 'Thank you',
          (page && page.title) || 'Give',
          { flush: true, tag: 'h1' }
        ) +

        ledeHtml +

        '<div class="hc-give__action">' +
          c.button('Give through Overflow', {
            action: 'open-url',
            url: church.givingUrl,
            icon: 'arrowOut'
          }) +
          HC.edit.wrap(
            note ? '<p class="hc-caption hc-give__note">' + c.esc(note) + '</p>' : '',
            { slot: 'give.note', value: note, label: 'the line under the Give button' }
          ) +
        '</div>' +

        // Anything the church added to the page beyond its opening paragraph.
        // Almost always nothing, and drawn under the button rather than above
        // it so the reason somebody came here stays at the top.
        ((page && page.sections && page.sections.length)
          ? page.sections.map(function (section) {
              return (section.heading ? c.sectionHeader('', section.heading) : '') +
                HC.screens.pageHelpers.paragraphs(section.body, 'hc-body-serif hc-give__line');
            }).join('')
          : '') +

      '</div>';

    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.give = render;

})(window.HC = window.HC || {});
