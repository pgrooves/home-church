/* ==========================================================================
   Home Church, one announcement
   The page behind a card on Home. Everything the church wrote, at the size
   they wrote it: the words with their formatting, the video playing here
   rather than in somebody else's app, every picture, and the link.

   WHY IT EXISTS. Home is a front door and an announcement is news, and the two
   pull in opposite directions the moment an announcement is more than a
   sentence. A card carrying a player, a gallery and a link is a noticeboard
   nailed to the front door; a card that carries none of them is a card that
   quietly loses half of what somebody wrote. A page settles it: the card
   summarises and the page holds the announcement, and tapping the card is what
   joins them. See announcementCard() in js/screens/home.js.

   A PUSHED VIEW, like a guide or a journal entry. Nothing here asks for that:
   the route is not one of the five tabs and not one of the modules behind •••,
   so js/router.js answers isStop() false for it and the shell draws the arrow
   in the bar, the back disc by the thumb at the bottom left, and no sideways
   drag. The one thing this file does have to do is exist under a route name
   js/app.js knows, which is `announcement`.

   THE WINDOW DOES NOT APPLY HERE, deliberately, and getAnnouncement() in
   js/data.js says why at length. Briefly: a card comes off Home at midnight
   because Home is what the church is saying today, and a page somebody
   navigated to is an address in their history that should still hold the words
   they were reading. What this screen does instead is say how old it is.

   NOTHING REACHES innerHTML THAT HAS NOT BEEN THROUGH THE SANITIZER. The words
   are the one thing in this app that arrive as markup somebody typed, and they
   are cleaned here, on the way out, as well as on the way in when they were
   saved. Twice is not belt and braces: this phone may be holding a payload
   cached by an older build, and the version that renders is the version that
   must decide what is safe. See js/richtext.js.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* The line above the title, the same one the card carries. Written out in
     both places rather than shared, because the two are the same sentence for
     a reason that could stop being true: the card's says what kind of card it
     is in a list of cards, and this one dates a page that may have been open
     in a history stack for a week. */
  function label(a) {
    if (a.eyebrow) return a.eyebrow;
    return a.publishedOn
      ? 'Announcement ' + c.formatDateNumeric(a.publishedOn)
      : 'Announcement';
  }

  /* 'YYYY-MM-DD' in the phone's own zone. The date columns are plain dates, so
     this never involves a timezone, and it is the same helper Home and the
     Admin screen use for the same reason: an announcement retires at midnight
     in Metairie. */
  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  /* One sentence for an announcement that is no longer on Home, or ''.

     This is the whole of what the page does about the date window. Somebody
     arriving from a notification they left on their lock screen for a
     fortnight, or from a history entry, gets the words and a line saying the
     announcement has come down, which is a much better answer than either of
     the alternatives: an empty screen, or a page that reads as current. */
  function windowNote(a) {
    var today = todayLocal();
    if (a.startsOn && today < a.startsOn) {
      return 'This goes up on ' + c.formatDate(a.startsOn) + '.';
    }
    if (a.endsOn && today >= a.endsOn) {
      return 'This came down on ' + c.formatDate(a.endsOn) + '. It is here because ' +
        'you came looking for it.';
    }
    return '';
  }

  /* ------------------------------------------------------------- the words

     Two shapes, and which one a row has says when it was written. An
     announcement written in the editor has body_html and is drawn as markup.
     One written before the editor existed has only `body`, which is plain
     text, and is drawn as paragraphs by the same rule js/screens/page.js draws
     prose by: a blank line separates paragraphs and a single newline does not.

     EDIT MODE IS OFFERED ONLY ON THE SECOND, and that line is drawn on
     purpose. Edit mode is a textarea over one sentence; a textarea over markup
     would show somebody their own <strong> tags and save whatever they did to
     them as text. So a plain announcement can still be reworded where it is
     read, which is what that feature is for, and one with formatting is edited
     on the Admin form, where the editor that made it is. The eyebrow above is
     editable either way: it is a sentence in both. */
  function words(a) {
    if (a.bodyHtml) {
      var html = HC.richtext.sanitize(a.bodyHtml, { links: 'web' });
      if (!html) return '';
      return '<div class="hc-rich hc-announce__body">' + html + '</div>';
    }

    return HC.edit.wrap(
      HC.screens.pageHelpers.paragraphs(a.body, 'hc-body-serif hc-announce__text'),
      { table: 'announcements', id: a.id, column: 'body',
        target: a, field: 'body',
        value: a.body, label: 'the announcement’s words', rows: 6 }
    );
  }

  /* -------------------------------------------------------------- the video

     A poster with a play badge, and the real player only once somebody has
     asked for it. The same markup and the same 'play-video' handler the nine
     practices use, so tapping it does what tapping a video anywhere else in
     this app does: it plays here, in the app, rather than handing somebody to
     the YouTube app and losing them.

     THE POSTER IS THE PRIVACY ANSWER AS WELL AS THE PERFORMANCE ONE. An embed
     drawn on load would put an iframe from Google on the screen, and this app
     has refused that trade twice already, once for the typefaces and once for
     the Instagram rail. Behind a poster nothing is requested from Google until
     somebody taps, and the one thing that is requested before then is the
     thumbnail, on a page a person chose to open rather than on the screen the
     app launches to. That is the trade migration 0026 was not willing to make
     on Home and it is a different trade here.

     A link that is not a video this app can play draws nothing rather than an
     error player. The Admin form says so under the field while somebody is
     still looking at it. */
  function video(a) {
    var id = c.youtubeId(a.videoUrl);
    if (!id) return '';

    return '' +
      c.sectionHeader('', 'Watch') +
      '<div class="hc-video" data-video="' + c.esc(id) + '">' +
        '<button type="button" class="hc-video__poster" data-media-fallback ' +
            'data-action="play-video" ' +
            'data-id="' + c.esc(id) + '" ' +
            'data-provider="youtube" ' +
            'aria-label="Play the video">' +
          '<img class="hc-video__thumb" src="' + c.esc(c.youtubeThumb(id)) + '" ' +
            'alt="" loading="lazy" aria-hidden="true">' +
          c.playBadge() +
        '</button>' +
      '</div>';
  }

  /* ----------------------------------------------------------- the pictures

     Every one of them, stacked, at the width of the page. Not a carousel: a
     carousel is right for a rail of Instagram photographs, where the point is
     that there are more of them than fit, and wrong for two pictures of a
     serve day that somebody should see both of without discovering a gesture.

     The first picture is the one the card on Home already showed, and it is
     drawn again here rather than skipped. Skipping it would mean the page
     opens on the second photograph, which reads as the first one having gone
     missing. */
  function pictures(a) {
    var list = (a.images && a.images.length) ? a.images : (a.imageUrl ? [a.imageUrl] : []);
    if (!list.length) return '';

    var html = '<div class="hc-announce__gallery">';
    list.forEach(function (url) {
      html += '<span class="hc-latest__frame hc-latest__frame--4x3" data-media-fallback>' +
        '<img class="hc-latest__img" src="' + c.esc(url) + '" alt="" ' +
          'loading="lazy" decoding="async">' +
      '</span>';
    });
    return html + '</div>';
  }

  /* --------------------------------------------------------------- the link

     A row with a thumbnail, or a row without one, and the difference is a
     decision an admin made with the x on the form rather than something this
     screen works out. Both open in the phone's own browser through
     openExternal(), which is the door every outbound link in this app goes
     through.

     The title falls back to the link's own host, which is a better thing to
     show than ninety characters of tracking URL and is still honest about
     where the tap goes. */
  function link(a) {
    var url = c.webUrl(a.linkUrl);
    if (!url) return '';

    var title = String(a.linkTitle || '').trim() || c.urlHost(url) || url;

    return '' +
      '<button type="button" class="hc-linkcard" data-action="open-url" ' +
          'data-url="' + c.esc(url) + '">' +
        (a.linkImageUrl
          ? '<span class="hc-linkcard__frame" data-media-fallback>' +
              '<img class="hc-linkcard__img" src="' + c.esc(a.linkImageUrl) + '" ' +
                'alt="" loading="lazy" decoding="async">' +
            '</span>'
          : '') +
        '<span class="hc-linkcard__body">' +
          '<span class="hc-linkcard__title">' + c.esc(title) + '</span>' +
          '<span class="hc-caption hc-linkcard__host">' +
            c.esc(c.urlHost(url) || url) + '</span>' +
        '</span>' +
        c.icon('arrowOut', 'hc-linkcard__icon') +
      '</button>';
  }

  /* ------------------------------------------------------- add to calendar

     The same button the Connect tab draws under this event, from the same
     helper in js/components.js, so the two cannot drift apart. An announcement
     about a dated thing carries its event id, and the .ics comes out of the
     events row rather than out of the announcement: the announcement knows
     what it is called and the event knows when it starts.

     DRAWN ONLY WHEN THE EVENT IS ACTUALLY THERE. HC.data.events holds
     published events, so an announcement whose event has not been approved, or
     whose event was deleted, finds nothing here and gets no button. That is the
     honest outcome: the 'add-to-calendar' handler in js/app.js looks the id up
     in the same list and returns silently when it misses, so drawing it anyway
     would be a button that does nothing when tapped.

     A row from before 0040 has no eventId at all and takes the same path. */
  function calendar(a) {
    if (!a.eventId) return '';

    var evt = (HC.data.events || []).filter(function (e) {
      return e.id === a.eventId;
    })[0];
    if (!evt) return '';

    return '<div class="hc-announce__calendar">' +
      c.addToCalendar(evt.id) +
      '<p class="hc-caption">' + c.esc(c.formatDate(evt.date)) +
        (evt.time ? ', ' + c.esc(evt.time) : '') +
        (evt.location ? ' · ' + c.esc(evt.location) : '') +
      '</p>' +
    '</div>';
  }

  /* ------------------------------------------------------------- the screen */

  function render(route) {
    var a = route && route.id ? HC.data.getAnnouncement(route.id) : null;

    /* Not here. Three ways to arrive: the content sync has not landed yet, the
       row was deleted, or an old history entry names an id that no longer
       exists. All three want the same thing, which is not an error page, so
       this says the warm version. The way back is the arrow in the bar and the
       disc by the thumb, both of which the shell has already drawn. */
    if (!a) {
      return c.el('' +
        '<div class="hc-screen hc-announce">' +
          c.emptyState('This announcement is not here right now. It may still be ' +
            'on its way, or it may have been taken down.') +
        '</div>');
    }

    var html = '<div class="hc-screen hc-announce">';

    /* The title is not editable, here or anywhere. It is what the
       notification said on every lock screen in the church, and a title that
       drifts from the notification people already got is a small lie on their
       lock screen. The label above it is: it is pure voice, and empty means
       the date the announcement went up, so the box opens holding nothing
       rather than holding a date somebody would then have to keep in step. */
    html += c.sectionHeader(label(a), a.title, {
      flush: true, tag: 'h1',
      eyebrowEdit: {
        table: 'announcements', id: a.id, column: 'eyebrow',
        target: a, field: 'eyebrow',
        value: a.eyebrow || '', label: 'the label over the announcement'
      }
    });

    var note = windowNote(a);
    if (note) html += '<p class="hc-caption hc-announce__note">' + c.esc(note) + '</p>';

    html += words(a);
    // Directly under the words, above the video and the pictures. It is the
    // one thing on this page a person acts on rather than reads, and burying
    // it under a gallery is how it gets missed.
    html += calendar(a);
    html += video(a);
    html += pictures(a);
    html += link(a);

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.announcement = render;

})(window.HC = window.HC || {});
