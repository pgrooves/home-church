/* ==========================================================================
   Home Church, Practices
   Two screens. A grid of nine, and one page that every one of the nine is
   drawn with.

   THE PART WORTH BEING STUBBORN ABOUT. There is one practice page in this
   file, not nine. Every practice puts its own data through the same function
   and comes out in the same order: the overview, then each session in
   sequence with its video, its teaching, and the thing it asks you to go and
   do, then whatever else is in the playlist, then where it all came from.
   Sabbath has more to say than Witness does and it still says it in the same
   shape and the same order, because somebody moving between them should be
   learning the practice rather than relearning the page. A ninth custom
   layout is not a feature, it is nine places to fix the next change.

   NAVIGATION. The grid is a stop, like the Journal and Give: it sits behind
   ••• and a sideways drag reaches it, so it has the logo and no back arrow. A
   practice is a pushed view, so it gets the arrow by the thumb at the bottom
   left, which is the shell's and not this file's. See paintDiscs() in
   js/app.js.

   VIDEO. Everything plays inside the app. There is no link out to YouTube on
   this screen or anywhere else in it, which is why js/practices.js drops a
   video whose owner has disabled embedding rather than degrading it into one.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var PTW = 'https://practicingtheway.org';

  /* --------------------------------------------------------------- credit

     WHOSE WORK THIS IS. Every word and every video under Practices was made
     by Practicing the Way. Home Church wrote none of it. That is not a
     footnote to tuck at the bottom of a scroll somebody may never reach, so
     this block sits directly under the header on the grid AND on all nine
     practice pages, in the same place, saying the same thing.

     One function rather than two pieces of copy, so the disclaimer on a
     practice page can never drift from the one on the grid. The link out is
     deliberate and is the single exception to the no-external-links rule
     these screens otherwise keep: that rule exists so video plays in the app
     instead of throwing somebody to YouTube, and it should never be the
     reason a person cannot get to the people who actually made this. */

  function credit(practice) {
    var here = practice && practice.source && practice.source.site
      ? practice.source.site
      : PTW;

    return '' +
      '<aside class="hc-ptw" aria-label="Source and credit">' +
        '<p class="hc-ptw__text">' +
          'The nine practices, the session teaching, and the videos ' +
          (practice ? 'on this page' : 'in here') + ' are the work of ' +
          '<strong>Practicing the Way</strong>. Home Church did not write any ' +
          'of it. We have gathered it here so our people can walk through it ' +
          'together, and every word of it belongs to them.' +
        '</p>' +
        c.button('practicingtheway.org', {
          action: 'open-url',
          url: here,
          variant: 'secondary',
          icon: 'arrowOut'
        }) +
      '</aside>';
  }

  /* ----------------------------------------------------------- signing up

     The church already has one texting number and one signup pattern, the
     one the Connect tab uses for serving. This is that pattern again rather
     than a second one: same number, same helper, same "opens Messages" note,
     so a person who has signed up for anything else here recognises it.

     Dropped rather than shown dead when there is no number on file, which is
     what serveSignup() in js/screens/connect.js does for the same reason. */

  function signup() {
    var church = (HC.data && HC.data.church) || {};
    var number = (church.serve || {}).number;
    var cfg = church.practicesSignup || {};
    if (!number) return '';

    var link = c.smsUrl(number, cfg.keyword);
    if (!link) return '';

    return '' +
      '<div class="hc-practice-signup">' +
        '<p class="hc-practice-signup__lead">' +
          c.esc(cfg.blurb || 'To sign up for our next Practicing the Way, text us.') +
        '</p>' +
        c.button('Text ' + number, {
          action: 'open-url',
          url: link,
          icon: 'message'
        }) +
        '<p class="hc-caption hc-practice-signup__note">' +
          'Opens Messages with the number filled in.' +
        '</p>' +
      '</div>';
  }

  /* ------------------------------------------------------------- the grid */

  function tile(p) {
    return '' +
      '<button type="button" class="hc-practice-tile" data-action="go-practice" ' +
          'data-id="' + c.esc(p.slug) + '">' +
        '<span class="hc-practice-tile__disc" aria-hidden="true">' +
          c.icon(p.icon, 'hc-practice-tile__icon') +
        '</span>' +
        '<span class="hc-practice-tile__label">' + c.esc(p.title) + '</span>' +
      '</button>';
  }

  function grid() {
    var all = HC.practices.list();
    var html = '<div class="hc-screen hc-practices">';

    html += c.sectionHeader('Practices', 'Practicing the Way', { flush: true, tag: 'h1' });

    html += credit(null);

    html += '<p class="hc-body-serif hc-practices__lede">' +
      'Nine practices of Jesus, each one a few short sessions with something to ' +
      'go and do. Start anywhere. They are meant to be lived rather than ' +
      'finished.</p>';

    if (!all.length) {
      /* Before the index has landed this is a blank half second, and after a
         build that forgot to ship data/ it is forever. The empty state covers
         both without claiming to know which, and HC.practices.ready() is what
         separates "not yet" from "not there". */
      html += c.emptyState(
        HC.practices.ready()
          ? 'The practices could not be loaded. Reopening the app usually sorts it.'
          : 'Loading the practices...',
        'leaf'
      );
    } else {
      html += '<div class="hc-practice-grid">' + all.map(tile).join('') + '</div>';
      html += signup();
    }

    return c.el(html + '</div>');
  }

  /* -------------------------------------------------------------- a video

     A poster with a play badge, and the real player only once somebody has
     asked for it. Not a lazy loading trick: a practice page can carry six or
     more videos and six YouTube iframes on one screen is several megabytes
     and a visibly slower page, on a phone, for five videos nobody has tapped.

     The poster uses the same play badge every other piece of media in this app
     uses, so tapping it does what tapping those does. What it must never do is
     leave: see the note at the top of this file, and the swap in js/app.js. */

  function video(v, label) {
    if (!v) return '';
    var meta = [label, v.duration].filter(Boolean).join('  ·  ');
    return '' +
      '<div class="hc-video" data-video="' + c.esc(v.videoId) + '">' +
        /* data-media-fallback hands this to the image error listener in
           js/app.js, the same one the Instagram rail and the series carousel
           use. A thumbnail comes from YouTube, so it is the one thing on this
           page that needs a network, and a phone in a basement should get the
           cream block and the play badge rather than the web view's broken
           image glyph. The video behind it is no less playable for it. */
        '<button type="button" class="hc-video__poster" data-media-fallback ' +
            'data-action="play-video" ' +
            'data-id="' + c.esc(v.videoId) + '" ' +
            'data-provider="' + c.esc(v.provider) + '" ' +
            (v.hash ? 'data-hash="' + c.esc(v.hash) + '" ' : '') +
            'aria-label="Play ' + c.esc(v.title || 'the video') + '">' +
          // Vimeo has no guessable thumbnail URL, so that poster is the cream
          // block and the badge, which is what a failed thumbnail looks like
          // anyway. See playable() in js/practices.js.
          (v.thumbnail
            ? '<img class="hc-video__thumb" src="' + c.esc(v.thumbnail) + '" alt="" ' +
                'loading="lazy" aria-hidden="true">'
            : '') +
          c.playBadge() +
        '</button>' +
        (meta ? '<p class="hc-caption hc-video__meta">' + c.esc(meta) + '</p>' : '') +
      '</div>';
  }

  /* --------------------------------------------------------------- hero

     The looping band of film at the top of a practice page, the same one
     Practicing the Way run at the head of theirs. Muted, no controls, nothing
     to tap: it is wallpaper with a pulse.

     Two reasons it is not drawn for everybody. Somebody who has asked their
     phone for less motion has asked for exactly this to stop, and an
     autoplaying video is the clearest possible case of it. And it is the only
     thing on these screens that spends data before anybody has chosen to
     watch anything, so it goes first when the page has to be cheap. */

  function hero(p) {
    if (!p.hero) return '';
    if (window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return '';

    var src = 'https://player.vimeo.com/video/' + c.esc(p.hero.videoId) +
      (p.hero.hash ? '?h=' + c.esc(p.hero.hash) + '&' : '?') +
      'background=1&muted=1&autoplay=1&loop=1&autopause=0&dnt=1';

    return '' +
      '<div class="hc-practice-hero" aria-hidden="true">' +
        '<iframe class="hc-practice-hero__frame" src="' + src + '" ' +
          'title="" tabindex="-1" allow="autoplay" loading="lazy"></iframe>' +
      '</div>';
  }

  /* ------------------------------------------------------------- one page */

  function session(s, practice) {
    var html = '<section class="hc-practice-session">';

    html += '' +
      '<header class="hc-practice-session__head">' +
        '<span class="hc-eyebrow">Session ' + c.esc(String(s.number)) + '</span>' +
        '<h2 class="hc-practice-session__title">' + c.esc(s.title) + '</h2>' +
        '<div class="hc-practice-session__rule" aria-hidden="true"></div>' +
      '</header>';

    // Video, then teaching, then the action step. The same three, in this
    // order, on all nine pages. A session missing one of them simply skips it
    // rather than shuffling the other two up into a different shape.
    html += video(s.video, 'Session ' + s.number);

    s.teaching.forEach(function (p) {
      html += '<p class="hc-body-serif hc-practice-session__p">' + c.esc(p) + '</p>';
    });

    if (s.practice) {
      html += '' +
        '<div class="hc-practice-step">' +
          '<span class="hc-eyebrow hc-practice-step__label">Practice</span>' +
          '<p class="hc-practice-step__text">' + c.esc(s.practice) + '</p>' +
        '</div>';
    }

    return html + '</section>';
  }

  /* ---------------------------------------------------------- resources

     What a practice closes with: the companion guide, the book it assigns,
     the podcast series. Title, prose, optionally a picture and one link out.

     The pictures are hosted by Practicing the Way and are the one thing on
     these screens that needs a network, so they carry data-media-fallback and
     the block reads perfectly well without them. The links out are the same
     exception the credit block already makes: this material is theirs and
     pointing at it is the honest thing to do. */

  function resourceBlock(r) {
    var html = '<section class="hc-practice-resource">';

    if (r.image) {
      html += '<div class="hc-practice-resource__art" data-media-fallback>' +
        '<img class="hc-practice-resource__img" src="' + c.esc(r.image) + '" ' +
          'alt="" loading="lazy" aria-hidden="true">' +
      '</div>';
    }

    html += '<h3 class="hc-practice-resource__title">' + c.esc(r.title) + '</h3>';

    r.body.forEach(function (para) {
      html += '<p class="hc-body-serif hc-practice-resource__p">' + c.esc(para) + '</p>';
    });

    if (r.link) {
      html += c.button(r.link.label, {
        action: 'open-url',
        url: r.link.url,
        variant: 'secondary',
        icon: 'arrowOut'
      });
    }

    return html + '</section>';
  }

  function page(route) {
    var slug = route.id;
    var p = HC.practices.get(slug);
    var html = '<div class="hc-screen hc-practice">';

    if (!p) {
      var err = HC.practices.failed(slug);
      html += c.sectionHeader('Practices', 'Practice', { flush: true, tag: 'h1' });
      html += c.emptyState(
        err ? err.message : 'Loading...',
        'leaf'
      );
      return c.el(html + '</div>');
    }

    /* 1. Who this is, and whose work it is. The same header and the same
          credit on every one of the nine, in the same place, above anything
          a person might stop reading before. */
    html += c.sectionHeader('Practices', p.title, { flush: true, tag: 'h1' });

    html += hero(p);

    if (p.subtitle) {
      html += '<p class="hc-practice__subtitle">' + c.esc(p.subtitle) + '</p>';
    }

    html += credit(p);

    /* A file that exists but has nothing in it yet. Saying so is the whole
       job here: an empty page reads as a bug, and inventing something to fill
       it would be very much worse, because nobody downstream could tell it
       from the real thing. See the stub in scripts/build_practices.js. */
    if (p.pending) {
      html += '<p class="hc-body-serif hc-practice__p">' +
        'This practice has not been added yet. Its sessions and videos are on ' +
        'their way.</p>';
      return c.el(html + '</div>');
    }

    /* 2. The overview. */
    p.intro.forEach(function (para) {
      html += '<p class="hc-body-serif hc-practice__p">' + c.esc(para) + '</p>';
    });

    /* 3. Every session, in order, in the same shape. */
    p.sessions.forEach(function (s) { html += session(s, p); });

    /* 4. What the practice closes with. Same place on every page. */
    if (p.resources.length) {
      html += c.sectionHeader('To go further', 'Resources');
      html += '<div class="hc-practice-resources">';
      p.resources.forEach(function (r) { html += resourceBlock(r); });
      html += '</div>';
    }

    /* 5. Whatever else was in the playlist. A trailer, a Q&A, a conversation.
          Kept, and kept down here under its own heading, so that nothing in
          the run of sessions above is something the site never taught. */
    if (p.extras.length) {
      html += c.sectionHeader('Also in this series', 'More to watch');
      html += '<div class="hc-practice-extras">';
      p.extras.forEach(function (v) {
        html += '<div class="hc-practice-extra">' +
          video(v, '') +
          '<p class="hc-practice-extra__title">' + c.esc(v.title) + '</p>' +
        '</div>';
      });
      html += '</div>';
    }

    /* 6. Where it came from. Last on every page, for the same reason the
          effective date is at the top of the privacy policy: these are
          somebody else's words and videos, and the app should say so without
          being asked. */
    html += '<p class="hc-caption hc-practice__source">' +
      'Sessions and teaching from Practicing the Way, at ' +
      c.esc((p.source && p.source.site) || PTW) + '. Videos are theirs too, ' +
      'played here from their YouTube channel.</p>';

    return c.el(html + '</div>');
  }

  HC.screens = HC.screens || {};
  HC.screens.practices = grid;
  HC.screens.practice = page;

})(window.HC = window.HC || {});
