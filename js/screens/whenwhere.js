/* ==========================================================================
   Home Church, When & Where
   The fourth stop behind •••: what time we gather, where the building is, and
   one button that opens the map. It is the church's Sunday Gatherings page,
   which has always lived on homechurchnola.com, brought into the app so that
   somebody who has downloaded this does not have to go back out to a browser
   to find out what time to turn up.

   NOTHING ON IT IS TYPED INTO THIS FILE. The times, the street, the town and
   the map link are church_profile.service_day, service_times, address_* and
   maps_url, the same row Home's gathering card reads. That is the whole
   argument for the page being here rather than a link out: the Sunday a
   service moves, both screens move with it and nobody ships a build.

   WHY IT IS NOT A COPY OF THE WEBSITE. Two things are deliberately different.
   The site sets this section in white on near-black; this app has one paper
   and one dark theme and they follow the phone, so the page wears whichever
   the reader is already in — inverting one screen inside the app would read
   as a fault rather than as the website. And the site can only print an
   address, while a phone can open it: Get directions is the one thing this
   page does that the page it came from cannot.

   HOME KEEPS ITS GATHERING CARD. Same times, same Directions button, still on
   the first screen somebody sees. This is the fuller answer for somebody who
   went looking, not a replacement for the one on the way past.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* The words that ship inside the app, and they are the church's own, lifted
     from the Sunday Gatherings block on homechurchnola.com. Same bargain as
     the paragraph on Give: the live version is a content_pages row an admin
     can rewrite, and this is what a phone with no signal draws, forever, on a
     project where nobody has run 0065. */
  var FALLBACK = 'Sunday gatherings are at the heart of our community — where ' +
    'we come together to worship, learn from Scripture, pray for one another, ' +
    'and make room to hear from the Spirit. It’s a time to praise, connect, ' +
    'and grow in a space that feels like home.';

  /* The line under it, bold on the website and bold here, because it is the
     sentence doing the work. Its own slot rather than a second paragraph in
     the row above, so it keeps its weight: blurb is drawn as plain paragraphs
     and a bold line inside one would have to be markup an admin typed. */
  var WELCOME = 'Everyone is welcome. Everyone is family.';

  var DIRECTIONS = 'Get directions';

  /* "Every Sunday", from the column rather than from this file, because a
     church that moves its gathering to a Saturday evening should not find
     this screen still saying Sunday underneath the new times. */
  function whenLine(church) {
    return church.serviceDay ? 'Every ' + church.serviceDay : 'Every week';
  }

  function times(church) {
    var list = church.serviceTimes || [];
    if (!list.length) return '';

    return '<p class="hc-eyebrow">Service times</p>' +
      '<p class="hc-display-m hc-ww__when">' + c.esc(whenLine(church)) + '</p>' +
      '<ul class="hc-ww__times" role="list">' +
        list.map(function (t) {
          return '<li class="hc-ww__time">' + c.esc(t) + '</li>';
        }).join('') +
      '</ul>';
  }

  function location(church) {
    var a = church.address || {};
    var town = [a.city, a.state].filter(Boolean).join(', ');
    if (a.zip) town = (town ? town + ' ' : '') + a.zip;

    var html = '<p class="hc-eyebrow">Location</p>';
    if (a.line1) html += '<p class="hc-display-m hc-ww__where">' + c.esc(a.line1) + '</p>';
    if (town) html += '<p class="hc-body-sans hc-ww__town">' + c.esc(town) + '</p>';

    /* No link, no button. A control with nothing behind it is worse than no
       control, and an address with no map on file is still an address
       somebody can read and type into their own. */
    if (church.mapsUrl) {
      html += '<div class="hc-ww__action">' +
        c.button(HC.data.copy('whenwhere.directions', DIRECTIONS), {
          action: 'open-url',
          url: church.mapsUrl,
          variant: 'secondary',
          icon: 'pin',
          labelSlot: 'whenwhere.directions',
          labelName: 'the Directions button on When & Where'
        }) +
      '</div>';
    }

    return html;
  }

  /* Three photographs, and they are the ones already on the phone.

     WHY INSTAGRAM AND NOT THREE FILES IN STORAGE. The sync job already mirrors
     the church's own posts into the `instagram` bucket for the rail on
     Connect, pictures and all, so the newest three are sitting in HC.data
     before this screen draws. Three files uploaded beside them would be a
     second place to remember, and the one nobody would remember: a photograph
     chosen once and frozen into a page is a photograph that is two years old
     by the time anybody notices.

     THREE OR NONE. Two photographs in a grid built for three is a hole, and a
     page that ends on the address is a perfectly good page. So this draws
     nothing at all until there are three, which is also what a project with no
     Instagram sync, and a phone that has never reached Supabase, both get.

     DECORATION, NOT A RAIL. They do not open anything and they carry no alt
     text, because the rail on Connect is where these posts are content: nine
     of them, captioned, each one a way into the feed. Here they are the room
     the address belongs to. Two tappable copies of the same picture on two
     screens is the kind of thing that reads as a bug. */
  function photographs() {
    var posts = (HC.data.instagramPosts || []).filter(function (p) {
      return p.imageUrl;
    }).slice(0, 3);

    if (posts.length < 3) return '';

    return '<div class="hc-ww__photos" aria-hidden="true">' +
      posts.map(function (p, i) {
        return '<div class="hc-ww__frame hc-ww__frame--' + (i + 1) + '">' +
          '<img class="hc-ww__photo" src="' + c.esc(p.imageUrl) + '" alt="" ' +
            'loading="lazy" decoding="async">' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function build() {
    var church = HC.data.church;
    var page = HC.data.getPage('page-when-where');

    var lede = page && page.blurb ? page.blurb : FALLBACK;
    var welcome = HC.data.copy('whenwhere.welcome', WELCOME);

    /* Editable only once the row exists, the same rule Give follows: until
       then what is on screen is the string above, which has nowhere to write
       an edit to, and offering one that goes nowhere is worse than offering
       none. Migration 0065 seeds it. */
    var ledeHtml = HC.screens.pageHelpers.paragraphs(lede, 'hc-body-serif hc-ww__lede');
    if (page && page.blurb) {
      ledeHtml = HC.edit.wrap(ledeHtml, {
        table: 'content_pages', id: page.id, column: 'blurb',
        target: page, field: 'blurb',
        value: page.blurb, label: 'the opening paragraph on When & Where', rows: 6
      });
    }

    var timesHtml = times(church);

    var html = '' +
      '<div class="hc-screen hc-ww">' +
        c.sectionHeader(
          (page && page.eyebrow) || 'When & Where',
          (page && page.title) || 'Sunday Gatherings',
          { flush: true, tag: 'h1',
            eyebrowEdit: page ? {
              table: 'content_pages', id: page.id, column: 'eyebrow',
              target: page, field: 'eyebrow',
              value: page.eyebrow || '', label: 'the line above “Sunday Gatherings”'
            } : null }
        ) +

        ledeHtml +

        HC.edit.wrap(
          welcome ? '<p class="hc-body-serif hc-ww__welcome">' + c.esc(welcome) + '</p>' : '',
          { slot: 'whenwhere.welcome', value: welcome,
            label: 'the welcome line on When & Where' }
        ) +

        /* NO CARDS, WHICH IS A DECISION. A border, a fill and a radius each
           say "separate object", and these are two labelled facts in one
           column of prose rather than two things to look at. The eyebrow and
           the hairline above it do what a card would have done, which is the
           same move the section header two inches up already makes. */
        (timesHtml ? '<section class="hc-ww__block">' + timesHtml + '</section>' : '') +
        '<section class="hc-ww__block">' + location(church) + '</section>' +

        photographs() +

        // Anything the church has added to the page beyond its opening
        // paragraph. Almost always nothing, and under the facts rather than
        // over them, the same as Give.
        ((page && page.sections && page.sections.length)
          ? page.sections.map(function (section, i) {
              return (section.heading ? c.sectionHeader('', section.heading) : '') +
                HC.screens.pageHelpers.sectionBody(page, section, i, 'hc-ww__lede');
            }).join('')
          : '') +

      '</div>';

    return html;
  }

  function render() {
    return c.el(build());
  }

  HC.screens = HC.screens || {};
  HC.screens.whenWhere = render;

  /* The string, without the element around it. Same split group.js makes, and
     for the same reason: everything that decides what this screen says is in
     build(), so it can be asked what it would draw without a browser to draw
     it into. See tests/when-where.test.js. */
  HC.screens.whenWhereHelpers = { html: build };

})(window.HC = window.HC || {});
