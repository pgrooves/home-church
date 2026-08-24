/* ==========================================================================
   Home Church, Home
   The quiet front door. Three things above the fold, no more.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  function greetingLine() {
    var name = HC.store.firstName();
    if (!name) return 'Welcome home.';
    return c.greeting() + ', ' + name + '.';
  }

  /* ============================================================ the media block
     The frame under the greeting. It began as one Instagram photograph and is
     now a carousel: swipe it sideways and the next thing the church has to
     show comes with your thumb, the same gesture as the rail on Connect.

     WHAT GOES IN IT. Whatever is in HC.data.homeMedia, in order, and then the
     newest Instagram post last. The house rule is that the pastor's own word
     comes first and Instagram is the thing you arrive at by swiping, which is
     also the order that keeps the Instagram post in the same place it has
     always been for a week when nothing else has been posted: alone, at the
     front, looking exactly like it did before this was a carousel.

     Each slide names itself in its own eyebrow rather than the block carrying
     one label for all of them, because a video from the pastor and a photo
     from Instagram are not the same kind of thing and should not claim to be.

     ITEM SHAPE, for whatever ends up filling homeMedia (a data.js edit today,
     a `home_media` table wired through content.js later, either way this
     reads the same array):

       { id:        'video-2026-08-23',        // required, unique
         kind:      'video' | 'photo',         // defaults to photo
         label:     'From Pastor Trey',        // the eyebrow over the frame
         videoUrl:  'https://.../update.mp4',  // kind video, plays in place
         posterUrl: 'https://.../still.jpg',   // the frame before it plays
         imageUrl:  'https://.../photo.jpg',   // kind photo
         url:       'https://...',             // optional, makes a photo a tap
         aspect:    '9x16',                    // the shape it was shot in
         caption:   'Two minutes on Sunday.' } // optional, three lines max

     A video plays inline, in the frame, without leaving the app. It is the
     one thing here that is not a link, which is why the slides are not all
     buttons: a <video> with its own controls inside a button is a control
     inside a control, and browsers resolve that however they like.
     ------------------------------------------------------------------------ */

  /* WHY THIS SORTS RATHER THAN TAKING [0]. content.js asks PostgREST for these
     newest first, so the first element is almost always right. Almost is not
     good enough for a screen that calls this post "latest" in front of a
     congregation: change that order parameter for any reason and Home starts
     presenting an old photograph as this week's news, silently. Sorting here
     costs nothing on nine rows and makes the claim true on its own terms. */
  function latestInstagram() {
    var usable = (HC.data.instagramPosts || []).filter(function (p) {
      return p.imageUrl && p.permalink;
    });
    if (!usable.length) return null;

    var post = usable.slice().sort(function (a, b) {
      return String(b.postedAt || '') < String(a.postedAt || '') ? -1 : 1;
    })[0];

    return {
      id: 'instagram',
      kind: 'photo',
      label: 'Latest on Instagram',
      imageUrl: post.imageUrl,
      url: post.permalink,
      caption: String(post.caption || '').trim(),
      leaves: 'Opens Instagram.'
    };
  }

  /* Anything missing the one thing its kind is for is dropped rather than
     drawn as an empty cream rectangle with a caption under it. */
  function mediaSlides() {
    var items = (HC.data.homeMedia || []).filter(function (m) {
      return m && (m.kind === 'video' ? m.videoUrl : m.imageUrl);
    });
    var insta = latestInstagram();
    if (insta) items = items.concat([insta]);
    return items;
  }

  /* The shape of the frame. Photographs are cropped to 4:3 and always have
     been, for the reasons in screens.css. A video is not cropped at all, so
     the frame has to be the shape the video was shot in or there are bars
     down two of its sides. A phone held upright is 9x16, and 4x5 is the
     portrait that does not swallow the whole screen. Anything not on this
     list falls back to 4:3 rather than being written into a style attribute,
     which is the only reason this is a whitelist and not a string. */
  var ASPECTS = ['4x3', '1x1', '4x5', '16x9', '9x16'];

  function frameClass(item) {
    var want = String(item.aspect || (item.kind === 'video' ? '9x16' : '4x3'));
    if (ASPECTS.indexOf(want) === -1) want = '4x3';
    return 'hc-latest__frame hc-latest__frame--' + want;
  }

  function slideBody(item) {
    var caption = String(item.caption || '').trim();
    var label = item.label
      ? '<span class="hc-eyebrow hc-latest__label">' + c.esc(item.label) + '</span>'
      : '';

    // Above the frame, so the slide says what it is before it shows it.
    // Underneath, it read as a caption for the picture rather than a label.
    var frame = item.kind === 'video'
      ? '<span class="' + frameClass(item) + '">' +
          // preload="metadata" so the poster and the duration are there and
          // the video itself is not pulled down on every launch of the app.
          '<video class="hc-latest__video" src="' + c.esc(item.videoUrl) + '" ' +
            (item.posterUrl ? 'poster="' + c.esc(item.posterUrl) + '" ' : '') +
            'controls playsinline preload="metadata"></video>' +
        '</span>'
      : '<span class="' + frameClass(item) + '">' +
          // No loading="lazy" on the first slide, unlike the rail on Connect.
          // This one is above the fold on the screen the app opens to, so
          // deferring it would mean watching it arrive on every launch.
          '<img class="hc-latest__img" src="' + c.esc(item.imageUrl) + '" alt="" ' +
            'decoding="async">' +
        '</span>';

    return label + frame +
      (caption || item.leaves
        ? '<span class="hc-latest__meta">' +
            (caption
              ? '<span class="hc-latest__caption hc-body-serif">' + c.esc(caption) + '</span>'
              : '') +
            (item.leaves
              ? '<span class="hc-visually-hidden">' + c.esc(item.leaves) + '</span>'
              : '') +
          '</span>'
        : '');
  }

  /* No aria-label on the button, deliberately. An aria-label would replace the
     visible caption as the accessible name, which leaves a screen reader user
     hearing something different from what everyone else is reading. The text
     inside names it, and the hidden span adds the one thing the visible text
     cannot say: that this leaves the app. */
  function slide(item) {
    var tappable = item.kind !== 'video' && item.url;
    var inner = slideBody(item);
    var body = tappable
      ? '<button type="button" class="hc-latest" data-action="open-url" ' +
          'data-media-fallback data-url="' + c.esc(item.url) + '">' + inner + '</button>'
      : '<div class="hc-latest hc-latest--static" data-media-fallback>' + inner + '</div>';

    return '<li class="hc-carousel__slide">' + body + '</li>';
  }

  function mediaCarousel() {
    var items = mediaSlides();
    if (!items.length) return '';

    // One slide is not a carousel. No dots, and with nothing to scroll to the
    // viewport has no room to scroll, so the sideways gesture stays with the
    // tab switch exactly as it does today.
    var dots = items.length > 1
      ? '<ol class="hc-carousel__dots" aria-hidden="true">' +
          items.map(function (item, i) {
            return '<li class="hc-carousel__dot" data-dot' +
              (i === 0 ? ' data-on="true"' : '') + '></li>';
          }).join('') +
        '</ol>'
      : '';

    return '' +
      '<div class="hc-carousel">' +
        '<div class="hc-carousel__viewport" data-carousel>' +
          '<ul class="hc-carousel__track" role="list">' +
            items.map(slide).join('') +
          '</ul>' +
        '</div>' +
        dots +
      '</div>';
  }

  /* "Three services", counted rather than typed. The card lists whatever is in
     church.serviceTimes, and that list is editable in Supabase, so a written
     "Three" would go on saying three the Sunday a fourth service is added and
     be wrong in the one place a visitor is trusting it. Past six it stops
     spelling the number, which is the point where a church's Sunday needs a
     different card anyway. */
  var COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

  function serviceCountLabel(times) {
    var n = times.length;
    if (n === 1) return 'One service';
    if (n < COUNT_WORDS.length) return COUNT_WORDS[n] + ' services';
    return n + ' services';
  }

  function gatheringCard() {
    var church = HC.data.church;
    var sunday = c.nextSunday();
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var isToday = sunday.getTime() === today.getTime();

    var when = isToday
      ? 'Today'
      : c.dayName(sunday) + ', ' + c.formatDateShort(sunday.toISOString().slice(0, 10));

    var inner = '' +
      '<p class="hc-eyebrow">' + c.esc(serviceCountLabel(church.serviceTimes)) + '</p>' +
      '<p class="hc-gathering__when hc-display-m">' + c.esc(when) + '</p>' +
      '<ul class="hc-gathering__times">' +
        church.serviceTimes.map(function (t) {
          return '<li class="hc-gathering__time hc-body-sans">' + c.esc(t) + '</li>';
        }).join('') +
      '</ul>' +
      '<p class="hc-caption hc-gathering__address">' +
        c.esc(church.address.line1) + '<br>' +
        c.esc(church.address.city + ', ' + church.address.state + ' ' + church.address.zip) +
      '</p>' +
      '<div class="hc-gathering__action">' +
        c.button('Directions', {
          action: 'open-url',
          url: church.mapsUrl,
          variant: 'secondary',
          icon: 'pin'
        }) +
      '</div>';

    return c.card(inner, { edge: true });
  }

  function guideCard() {
    var guide = HC.data.latestGuide();
    if (!guide) {
      return c.card(c.emptyState('Nothing here yet. Your guide shows up after Sunday.'));
    }
    var series = HC.data.getSeries(guide.seriesId);
    var meta = HC.data.guideMeta(guide);
    var inner = '' +
      '<p class="hc-eyebrow">' + c.esc(series ? series.title : 'This week') + '</p>' +
      '<p class="hc-card__title hc-guide-card__title">' + c.esc(meta.title) + '</p>' +
      '<p class="hc-caption hc-card__meta">' +
        c.esc(c.byline(meta.preacherShort, meta.preachedOn)) +
      '</p>' +
      '<p class="hc-guide-card__cue hc-caption">Open this week’s guide' +
        c.icon('chevronRight', 'hc-guide-card__chev') + '</p>';

    return c.card(inner, { action: 'open-guide', id: guide.id });
  }

  /* Today in the phone's own zone, as 'YYYY-MM-DD'. The window columns are
     plain dates, not timestamps, so comparing them as strings is exact and
     sidesteps every timezone question. A church in New Orleans should see an
     announcement retire at midnight local, not at midnight UTC. */
  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  /* startsOn is the first day it shows, endsOn is the first day it does not.
     A Saturday event announced with endsOn set to the Sunday is gone when
     people wake up Sunday. Either end null means that end is open. */
  function isLive(a, today) {
    if (a.startsOn && today < a.startsOn) return false;
    if (a.endsOn && today >= a.endsOn) return false;
    return true;
  }

  /* The label above an announcement. It used to be the literal "One thing"
     carried on the row, and it is now the date the announcement went up, so a
     card that has been sitting on Home for three weeks says so rather than
     reading as news. The date is generated, not typed: nobody has to remember
     to change it, and it cannot disagree with the window the row is running
     on. A row carrying no date at all degrades to the bare word rather than to
     "Announcement //", which is the only thing worse than no date.

     An eyebrow written by hand in the admin form wins over both. That field
     exists so a genuinely different kind of card can say what it is, and a
     church that types one means it. */
  function announcementLabel(a) {
    if (a.eyebrow) return a.eyebrow;
    return a.publishedOn
      ? 'Announcement ' + c.formatDateNumeric(a.publishedOn)
      : 'Announcement';
  }

  /* The picture on an announcement, if there is one.

     Cropped to 4:3 like every other photograph in the app, using the same
     frame classes the media carousel above uses, so an announcement's picture
     and an Instagram photograph are the same shape and the same corner
     radius. loading="lazy" here and not up there: the carousel is above the
     fold on launch and this is not. */
  function announcementImage(a) {
    if (!a.imageUrl) return '';
    return '' +
      '<span class="hc-latest__frame hc-latest__frame--4x3 hc-banner__frame">' +
        '<img class="hc-latest__img" src="' + c.esc(a.imageUrl) + '" alt="" ' +
          'loading="lazy" decoding="async">' +
      '</span>';
  }

  /* The video, as a button that leaves the app rather than as a player.

     A YouTube link is not an mp4 the church hosts, and embedding one would
     put an iframe from Google on the screen the app opens to, handing every
     congregant's address to them on every launch. That is the trade this
     project has already refused twice, once for the typefaces and once for
     the Instagram rail, and an announcement is not the place to start making
     it. The button says where it goes. See migration 0026 section 1. */
  function announcementVideo(a) {
    if (!a.videoUrl) return '';
    return '<span class="hc-banner__video">' +
      c.button('Watch', {
        action: 'open-url',
        url: a.videoUrl,
        variant: 'secondary',
        small: true,
        icon: 'arrowOut'
      }) +
    '</span>';
  }

  /* ONE CARD BECAME A LIST, and the reason is worth writing down because the
     comment that used to be here argued the other way and argued it well.

     Home showed a single announcement on purpose: the screen is a front door,
     a front door with a noticeboard on it is not a front door, and two things
     both claiming to be "one thing" is neither. That reasoning was sound
     while the only way to write an announcement was a migration or a service
     role key, because the friction was doing the editing for us. Nobody
     writes four announcements from the SQL editor on a Tuesday.

     An in-app form removes that friction, so the restraint has to come from
     somewhere else, and it comes from the date window. starts_on and ends_on
     were always the mechanism by which an announcement retires itself, and
     they are now also what keeps this list short: a church that dates its
     announcements gets one or two live at a time, and one that does not gets
     the noticeboard it asked for. That is a decision the church should be
     allowed to make, and it is reversible from the admin screen in a way a
     hardcoded slice(0, 1) never was.

     Newest first, by created_at, with priority as the tie-break rather than
     the sort. Priority is for the Sunday when something genuinely has to sit
     above a newer card, which is rare, and making it the primary key of the
     sort would mean every announcement needs a number thought about. */
  function liveAnnouncements() {
    var today = todayLocal();
    return (HC.data.announcements || []).filter(function (a) {
      return isLive(a, today) && !HC.store.isDismissed(a.id);
    }).sort(function (x, y) {
      var px = x.priority || 0;
      var py = y.priority || 0;
      if (px !== py) return py - px;
      var cx = String(x.createdAt || x.publishedOn || '');
      var cy = String(y.createdAt || y.publishedOn || '');
      if (cx !== cy) return cx < cy ? 1 : -1;
      // Same priority, same day. Something has to break the tie deliberately
      // rather than leaving it to whatever order the rows arrived in.
      return String(x.id) < String(y.id) ? -1 : 1;
    });
  }

  function announcementCard(a) {
    return '' +
      '<div class="hc-banner" data-banner="' + c.esc(a.id) + '">' +
        '<div class="hc-banner__body">' +
          '<p class="hc-eyebrow">' + c.esc(announcementLabel(a)) + '</p>' +
          '<p class="hc-banner__title hc-body-serif">' + c.esc(a.title) + '</p>' +
          (a.body ? '<p class="hc-caption">' + c.esc(a.body) + '</p>' : '') +
          announcementImage(a) +
          announcementVideo(a) +
        '</div>' +
        '<button type="button" class="hc-banner__dismiss" data-action="dismiss-banner" ' +
          'data-id="' + c.esc(a.id) + '" aria-label="Dismiss">' +
          c.icon('close') +
        '</button>' +
      '</div>';
  }

  function announcements() {
    var list = liveAnnouncements();
    if (!list.length) return '';
    return list.map(announcementCard).join('');
  }

  /* ------------------------------------------------------- the pinned line

     One sentence above everything, including the greeting. It is the only
     thing on this screen that can outrank a person's own name, which is why
     it is two settings rather than one: the message survives being switched
     off, so turning it back on next time does not mean retyping it, and an
     empty message with the switch on draws nothing rather than an empty bar.

     Not dismissible, unlike an announcement, and that is the whole difference
     between the two. An announcement is news and a person is allowed to be
     done with it. This is the building being closed on Sunday.

     Both fallbacks are the behaviour the app had before the setting existed,
     per the note on HC.data.setting: a phone that has never reached Supabase
     shows no banner rather than an undefined one. */
  function pinnedBanner() {
    if (!HC.data.setting('home_banner_on', false)) return '';
    var message = String(HC.data.setting('home_banner_message', '') || '').trim();
    if (!message) return '';

    return '<div class="hc-pinned" role="status">' +
      '<p class="hc-pinned__text">' + c.esc(message) + '</p>' +
    '</div>';
  }

  /* ------------------------------------------------------ which week it is
     The week counts itself from the plan's start date rather than waiting for
     somebody to bump a number every Sunday. That number was `current_week`,
     it was the reason the reading_plans table existed, and it is exactly the
     kind of chore that gets skipped in a busy week: the row sat on week 9 for
     as long as nobody remembered, while the church read on without it.

     starts_on is the first day of week 1, so the count rolls over on whatever
     weekday the plan started, and a plan that starts next month reads as week
     1 until it does. Days are compared as UTC midnights, which makes the
     subtraction exact: local midnights are 23 or 25 hours apart twice a year,
     and the spring one turns a full week into 6.96 and floors it to the week
     before.

     current_week is still the fallback. A row with no start date on it keeps
     behaving exactly as it did, which is what every plan in the table does
     until somebody fills the column in.
     ------------------------------------------------------------------------ */

  function utcDay(d) {
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  }

  function planWeek(plan) {
    var stored = plan.currentWeek || 1;
    if (!plan.startsOn) return stored;

    var days = utcDay(new Date()) - utcDay(c.parseDate(plan.startsOn));
    var week = Math.floor(days / 7) + 1;

    if (week < 1) week = 1;                                    // not started yet
    if (plan.totalWeeks && week > plan.totalWeeks) {
      week = plan.totalWeeks;                                  // finished, holds
    }
    return week;
  }

  /* The plan is one editable row in Supabase now, so this has to hold up
     against whatever is in it. No plan at all renders nothing and Home drops
     the section, rather than printing "undefined" or dividing by zero in
     front of a congregation. */
  function readingPlanRow() {
    var plan = HC.data.readingPlan;
    if (!plan || !plan.title) return '';

    var total = plan.totalWeeks || 0;
    var week = planWeek(plan);
    // Position, not pressure. No streak, no percentage, no badge.
    var pct = total > 0 ? Math.round((week / total) * 100) : 0;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;

    var resources = plan.resources || [];
    var url = resources.length && resources[0] ? resources[0].url : '';

    // Without somewhere to send them, this is a label rather than a button.
    var open = url
      ? '<button type="button" class="hc-plan" data-action="open-url" data-url="' + c.esc(url) + '">'
      : '<div class="hc-plan">';
    var close = url ? '</button>' : '</div>';

    var progress = total > 0
      ? '<span class="hc-caption">Week ' + week + ' of ' + total + '</span>'
      : '';

    return '' +
      open +
        '<div class="hc-plan__head">' +
          '<span class="hc-plan__title hc-row__title">' + c.esc(plan.title) + '</span>' +
          progress +
        '</div>' +
        '<div class="hc-progress" role="presentation">' +
          '<div class="hc-progress__fill" style="width:' + pct + '%"></div>' +
        '</div>' +
        (plan.thisWeek
          ? '<p class="hc-caption hc-plan__reading">This week, ' + c.esc(plan.thisWeek) + '</p>'
          : '') +
      close;
  }

  /* Giving used to be a tile in the tab bar. That tile is ••• now, and Give
     lives on the More screen, which is two taps from here instead of one. A
     church's giving link is not a thing to bury two taps deep, so it keeps a
     way in from the screen the app opens to. Quiet, at the bottom, under
     everything the person actually came for. Never a banner, never above the
     guide.

     It goes to the Give screen rather than straight out to Overflow. That
     screen exists to say thank you in the church's own voice before handing
     anybody off, and skipping it to save a tap would be skipping the point. */
  /* The line under it is 2 Corinthians 9:7, reference first and then the verse,
     with a blank line between them. c.row() escapes the text and puts it in one
     paragraph, so the break is a real newline in the string and
     `white-space: pre-line` on .hc-home__give is what draws it. Two paragraphs
     would have meant a second row shape for one screen's sake. */
  var GIVING_LINE = '2 Corinthians 9:7\n\nEach one must give as he has decided ' +
    'in his heart, not reluctantly or under compulsion, for God loves a ' +
    'cheerful giver';

  function givingRow() {
    if (!HC.data.church.givingUrl) return '';
    return '' +
      '<div class="hc-home__give">' +
        c.row({
          title: 'Give',
          sub: GIVING_LINE,
          action: 'go-module',
          id: 'give',
          chevron: true,
          serif: true
        }) +
      '</div>';
  }

  function render() {
    var html = '<div class="hc-screen hc-home">';

    // Above the greeting, because the one thing that outranks saying good
    // morning to somebody by name is the building being shut.
    html += pinnedBanner();

    // The mark now lives in the top bar, so Home does not repeat it.
    html += '<h1 class="hc-display-l hc-home__greeting">' + c.esc(greetingLine()) + '</h1>';

    /* Between the greeting and the gathering card. Renders nothing until
       there is something to show, so Home is unchanged on a project with an
       empty instagram_posts table and no homeMedia.

       No header over it, deliberately. Every slide already says what it is in
       its own eyebrow, and a heading above a block that changes what it is
       from slide to slide would have to be vague enough to cover all of them,
       which is a heading that says nothing. */
    html += mediaCarousel();

    /* The social links sit under the photograph, but they do not depend on
       it. A week when nothing has been posted, or a sync that has broken, is
       exactly when somebody might go looking for the church elsewhere, and
       that is the week these would have disappeared if they were nested
       inside the block above.

       Outside that block for a second reason too: it is a button, and a
       button inside a button is invalid HTML that browsers resolve however
       they like. */
    html += c.socialRow(HC.data.church.social);

    /* From here down, every block is named. The headings carry no eyebrow, so
       what a person scrolling past sees is one column of titles in the same
       weight, each one answering what the thing under it is before they have
       to work it out from the card itself. */

    html += c.sectionHeader('', 'Service times');
    html += gatheringCard();

    /* Announcements sit between the gathering card and the sermon: after the
       one thing a person opening the app on a Sunday morning is most likely
       looking for, and before the cards that change on a schedule everybody
       already knows. They are the only genuinely new information on this
       screen, so they go above Latest sermon rather than at the bottom of it.

       Same rule as every other block here, though: no announcements, no
       header. An empty heading over nothing reads as a bug. */
    var ann = announcements();
    if (ann) {
      html += c.sectionHeader('', 'Announcements');
      html += '<div class="hc-home__announcement">' + ann + '</div>';
    }

    html += c.sectionHeader('', 'Latest sermon');
    html += guideCard();

    var plan = readingPlanRow();
    if (plan) {
      html += c.sectionHeader('', 'Reading plan');
      html += plan;
    }

    // Same rule again: a church with no giving link gets no giving heading.
    var give = givingRow();
    if (give) {
      html += c.sectionHeader('', 'Give');
      html += give;
    }

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.home = render;

})(window.HC = window.HC || {});
