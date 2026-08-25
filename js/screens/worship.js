/* ==========================================================================
   Home Church, Worship
   What the band played on Sunday. One week at a time: the date and the
   message at the top, then the songs in the order they were played, each one
   with its album art, and a way into it wherever you listen.

   THE HEADER IS THE CAROUSEL. Swiping the block at the top moves between
   Sundays and redraws the list underneath, which is the series picker from
   Listen and the guide rails on Group, doing the same job a third time: a
   rail whose slide changes the page rather than just its own dots. The
   machinery is in js/app.js and this screen supplies one hook, selectWeek.

   IT IS THE HEADER AND NOT THE WHOLE PAGE, deliberately. js/swipe.js owns a
   sideways drag on the page itself, which is how you get from here to Journal
   and back, and a full page pager would eat that gesture. So the header is
   the thing you drag, and the chevrons either side of it say so out loud for
   the thumb that never tries.

   THE MESSAGE'S NAME IS NOT STORED HERE. It is read through to the podcast
   row every time this screen draws, so /new-podcast renaming Sunday's message
   renames it here too, with nothing to keep in step. HC.data.worshipTitle()
   is the resolution and migration 0034 is the long version of why.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* Which platforms get a mark, and in what order. Fixed rather than read off
     the row, because the row's key order is whatever the JSON happened to be
     written in and a link row that reorders itself between two songs looks
     like a bug.

     Only what BRANDS in js/components.js can actually draw. A platform with
     no mark falls back to a generic arrow there, which is right for the
     church's own social row where a link that exists must never silently
     vanish, and wrong here, where it would be one anonymous glyph in a row of
     recognisable ones on every song. The other platforms /new-worship
     resolves stay in the row: adding one is a mark in BRANDS and a line
     here. */
  var PLATFORMS = [
    { key: 'youtube', label: 'YouTube' },
    { key: 'spotify', label: 'Spotify' },
    { key: 'apple',   label: 'Apple Music' }
  ];

  var NOTHING_YET = 'The songs from Sunday land here after the service.';

  /* ------------------------------------------------------------- the header */

  /* One Sunday, as the slide you swipe. The date is written out rather than
     abbreviated, the same as the kicker on Listen, because on a screen you
     reach by swiping through weeks the date is the thing telling you where
     you have got to.

     The message's name sits under it in the display serif. A Sunday whose
     episode has not posted yet has no name to show, and that is a real state
     rather than a broken one: the line is dropped and the date carries the
     slide on its own. */
  function weekSlide(set) {
    var title = HC.data.worshipTitle(set);
    return '' +
      '<li class="hc-carousel__slide hc-worship-week">' +
        '<p class="hc-eyebrow hc-worship-week__date">' +
          c.esc(c.formatDate(set.servedOn)) +
        '</p>' +
        (title
          ? '<h2 class="hc-display-m hc-worship-week__title">' + c.esc(title) + '</h2>'
          : '') +
      '</li>';
  }

  /* Where the header goes when you tap it. Both are drawn only when they
     exist, and on most Sundays both do: the guide is written days before the
     episode posts, and the episode arrives on the Monday.

     open-guide and open-url are the app's existing actions, so this screen
     adds no navigation of its own. The guide link is the same button Listen
     puts under an episode, down to the wording, because it goes to the same
     place and two names for one destination is how an app starts feeling
     bigger than it is. */
  function weekLinks(set) {
    var html = '';
    var guide = HC.data.guideForWorship(set);
    var sermon = HC.data.sermonForWorship(set);

    if (guide) {
      html += '<button type="button" class="hc-inline-link" data-action="open-guide" ' +
        'data-id="' + c.esc(guide.id) + '">' +
        c.icon('guide', 'hc-share__icon') +
        '<span>Open the group guide</span>' +
      '</button>';
    }

    if (sermon) {
      html += '<button type="button" class="hc-inline-link" data-action="open-url" ' +
        'data-url="' + c.esc(HC.data.episodeUrl(sermon)) + '">' +
        c.icon('listen', 'hc-share__icon') +
        '<span>Listen to this message</span>' +
      '</button>';
    }

    return html ? '<div class="hc-worship-week__links">' + html + '</div>' : '';
  }

  /* --------------------------------------------------------------- the songs */

  /* The art, which is the biggest thing on the screen and the reason the list
     reads as records rather than as rows.

     A song with no art wears the house cover, exactly as a series with no art
     does on Listen, and a song whose art fails to arrive falls back to the
     same thing through [data-media-fallback], which js/app.js watches for.
     Neither one is a hole where a square should be. */
  function songArt(song) {
    var art = song.artUrl
      ? '<img class="hc-song__img" src="' + c.esc(song.artUrl) + '" alt="" ' +
          'decoding="async" loading="lazy">'
      : '';
    return '' +
      '<div class="hc-song__art"' + (art ? ' data-media-fallback' : '') + '>' +
        c.cover('', '1x1', { compact: true }) + art +
      '</div>';
  }

  /* Somewhere to hear it, and somewhere to read it.

     Every one of these leaves the app, which is what open-url is for and why
     each carries a label naming the platform: the marks are recognisable to
     most people and to nobody using a screen reader. Lyrics is words rather
     than a mark, because there is no lyrics brand, and because it is the one
     link here that does something different from the others. */
  function songLinks(song) {
    var links = song.links || {};
    var html = '';

    PLATFORMS.forEach(function (p) {
      if (!links[p.key]) return;
      html += '<button type="button" class="hc-song__link" data-action="open-url" ' +
        'data-url="' + c.esc(links[p.key]) + '" ' +
        'aria-label="' + c.esc(song.title + ' on ' + p.label) + '">' +
        c.brandIcon(p.label, 'hc-song__brand') +
      '</button>';
    });

    if (song.lyricsUrl) {
      html += '<button type="button" class="hc-song__lyrics" data-action="open-url" ' +
        'data-url="' + c.esc(song.lyricsUrl) + '">Lyrics</button>';
    }

    return html ? '<div class="hc-song__links">' + html + '</div>' : '';
  }

  /* One song. Art, then the title in the display serif, then who sings it in
     the small sans, which is the same relationship the eyebrow and the title
     have everywhere else in this app, turned the other way up.

     The artist can be missing and the row still stands. The title cannot, and
     a song without one never reaches here: js/content.js drops it on the way
     in. */
  function songItem(song) {
    return '' +
      '<li class="hc-song">' +
        songArt(song) +
        '<h3 class="hc-display-m hc-song__title">' + c.esc(song.title) + '</h3>' +
        (song.artist
          ? '<p class="hc-caption hc-song__artist">' + c.esc(song.artist) + '</p>'
          : '') +
        songLinks(song) +
      '</li>';
  }

  /* The set, in the order it was played, which is the order it is stored in.
     Not sorted here and not sortable: the order is the setlist. */
  function songList(set) {
    if (!set.songs.length) {
      return c.emptyState('The songs from this Sunday have not been added yet.');
    }
    return '<ol class="hc-song-list" role="list">' +
      set.songs.map(songItem).join('') +
    '</ol>';
  }

  /* --------------------------------------------------------------- the screen */

  /* Told by js/app.js when the week rail settles on a slide. Redraws the two
     things under the rail that belong to a week, and does nothing at all when
     the rail has not actually changed week, which is nearly every frame a
     swipe produces. Same shape as selectSeries on Listen. */
  function selectWeek(rail, index) {
    var wrap = rail.closest ? rail.closest('.hc-worship') : null;
    if (!wrap || String(index) === wrap.getAttribute('data-index')) return;

    var ids = (wrap.getAttribute('data-week-ids') || '').split(',');
    var set = HC.data.getWorshipSet(ids[index]);
    if (!set) return;

    wrap.setAttribute('data-index', String(index));

    var links = wrap.querySelector('[data-week-links]');
    var list = wrap.querySelector('[data-week-songs]');
    if (links) links.innerHTML = weekLinks(set);
    if (list) list.innerHTML = songList(set);
    paintArrows(wrap, index, ids.length);
  }

  /* The two chevrons either side of the header.

     THEY ARE NOT DECORATION. The gesture that moves this screen is a drag on
     one block of a page whose every other sideways drag goes somewhere else
     entirely, and there is nothing on a header that announces it can be
     dragged. The dots say there are other weeks; these say how to reach them,
     and they are how anybody gets there with a thumb that never guesses.

     Disabled at the ends rather than hidden, so the header does not change
     width on the first and last week and the block stops moving under the
     thumb. */
  function paintArrows(wrap, index, count) {
    var prev = wrap.querySelector('[data-week-prev]');
    var next = wrap.querySelector('[data-week-next]');
    // Newest first, so "previous week" is to the right and further into the
    // archive, and "this week" is to the left. The arrows point the way the
    // rail moves, and the labels say which week rather than which direction.
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= count - 1;
  }

  function weekRail(sets) {
    var dots = sets.length > 1
      ? '<ol class="hc-carousel__dots" aria-hidden="true">' +
          sets.map(function (set, i) {
            return '<li class="hc-carousel__dot" data-dot' +
              (i === 0 ? ' data-on="true"' : '') + '></li>';
          }).join('') +
        '</ol>'
      : '';

    var arrows = sets.length > 1
      ? '<button type="button" class="hc-worship__arrow hc-worship__arrow--prev" ' +
            'data-action="worship-week" data-step="-1" data-week-prev disabled ' +
            'aria-label="A more recent Sunday">' +
          c.icon('chevronLeft') +
        '</button>' +
        '<button type="button" class="hc-worship__arrow hc-worship__arrow--next" ' +
            'data-action="worship-week" data-step="1" data-week-next ' +
            'aria-label="An earlier Sunday">' +
          c.icon('chevronRight') +
        '</button>'
      : '';

    return '' +
      '<div class="hc-worship__head">' +
        arrows +
        '<div class="hc-carousel hc-worship__carousel">' +
          '<div class="hc-carousel__viewport" data-carousel data-worship-rail>' +
            '<ul class="hc-carousel__track" role="list">' +
              sets.map(weekSlide).join('') +
            '</ul>' +
          '</div>' +
          dots +
        '</div>' +
      '</div>';
  }

  function render() {
    var sets = HC.data.worshipSetsByDate();
    var html = '<div class="hc-screen hc-worship" data-index="0" ' +
      'data-week-ids="' + c.esc(sets.map(function (s) { return s.id; }).join(',')) + '">';

    /* The heading every screen has, which the right hand index rail lists and
       which is how somebody knows what they swiped into. The eyebrow above it
       is the church's line about its own singing and is editable; the heading
       is not, anywhere in this app. */
    html += c.sectionHeader('What we sang', 'Worship',
      { flush: true, tag: 'h1', eyebrowSlot: 'worship.eyebrow' });

    if (!sets.length) {
      var empty = HC.data.copy('worship.empty', NOTHING_YET);
      html += HC.edit.wrap(
        empty ? c.emptyState(empty) : '',
        { slot: 'worship.empty', value: empty,
          label: 'what Worship says before the first set is up' }
      );
      html += '</div>';
      return c.el(html);
    }

    html += weekRail(sets);
    html += '<div class="hc-worship__links" data-week-links>' + weekLinks(sets[0]) + '</div>';
    html += '<div class="hc-worship__songs" data-week-songs>' + songList(sets[0]) + '</div>';

    html += '</div>';

    var el = c.el(html);
    // The first slide is this Sunday and the rail opens on it, so the arrow
    // pointing further back is the only live one until somebody moves.
    paintArrows(el, 0, sets.length);
    return el;
  }

  HC.screens = HC.screens || {};
  HC.screens.worship = render;
  HC.screens.worshipHelpers = { selectWeek: selectWeek };

})(window.HC = window.HC || {});
