/* ==========================================================================
   Home Church, Listen
   The Home Church NOLA podcast. The latest message, then a rail of every
   series the church has preached with that series' messages underneath it,
   then the whole archive folded away behind one chevron. Every message opens
   to its own episode notes and a way into Spotify. Any sermon with a guide
   carries a quiet link into it.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  function guideLink(sermon) {
    if (!sermon.guideId) return '';
    return '<button type="button" class="hc-inline-link" data-action="open-guide" ' +
      'data-id="' + c.esc(sermon.guideId) + '">' +
      c.icon('guide', 'hc-share__icon') +
      '<span>Open the group guide</span>' +
    '</button>';
  }

  // The one action every episode carries. Named for where it lands, because
  // the tap leaves the app and the label should say so before it does. The
  // catalogue currently links each episode on its podcast host, and the show
  // itself on Spotify, so the label follows the URL rather than assuming.
  function listenButton(sermon, variant) {
    var url = HC.data.episodeUrl(sermon);
    var onSpotify = url.indexOf('spotify.com') !== -1;
    return c.button(onSpotify ? 'Listen on ' + HC.data.podcast.platform : 'Listen to this message', {
      action: 'open-url',
      url: url,
      variant: variant || 'secondary',
      icon: 'listen'
    });
  }

  function summaryHtml(sermon) {
    return HC.data.episodeSummary(sermon).map(function (para) {
      return '<p class="hc-body-serif hc-episode__para">' + c.esc(para) + '</p>';
    }).join('');
  }

  /* The date under the section header is the Sunday this was preached, so the
     byline here does not say it a second time three lines further down. */
  function latest(sermon) {
    var series = HC.data.getSeries(sermon.seriesId);
    return '' +
      '<div class="hc-latest">' +
        '<button type="button" class="hc-latest__media" data-action="open-url" ' +
          'data-url="' + c.esc(HC.data.episodeUrl(sermon)) + '" ' +
          'aria-label="Listen to ' + c.esc(sermon.title) + ' on ' + c.esc(HC.data.podcast.platform) + '">' +
          c.cover(HC.data.podcast.name, '16x9', { play: true }) +
        '</button>' +
        '<p class="hc-eyebrow hc-latest__eyebrow">' + c.esc(series ? series.title : 'Latest') + '</p>' +
        '<h2 class="hc-display-m hc-latest__title">' + c.esc(sermon.title) + '</h2>' +
        '<p class="hc-caption hc-latest__meta">' +
          c.esc(c.metaLine([sermon.preacher, sermon.duration])) +
        '</p>' +
        '<div class="hc-latest__desc">' + summaryHtml(sermon) + '</div>' +
        '<div class="hc-latest__action">' + listenButton(sermon, 'primary') + '</div>' +
        guideLink(sermon) +
      '</div>';
  }

  /* An archive row opens in place. The summary is the episode's own notes, so
     you can read what a message is about before deciding to leave for it.

     A message shows up twice on this screen, once under its series and once in
     the archive, so the panel id carries the block it was drawn in. Two rows
     sharing an id would mean the archive's chevron opening the picker's panel
     somewhere above it, off screen, and nothing happening where the thumb is. */
  function sermonRow(sermon, scope) {
    var panelId = 'episode-' + (scope || 'archive') + '-' + sermon.id;
    // The date rail reads its months off these stamps rather than the
    // catalogue, so it stays right whatever order this screen draws in.
    return '' +
      '<div class="hc-sermon" data-date="' + c.esc(sermon.preachedOn) + '">' +
        '<button type="button" class="hc-sermon__main" data-action="toggle-episode" ' +
          'aria-expanded="false" aria-controls="' + c.esc(panelId) + '">' +
          '<span class="hc-sermon__thumb">' + c.cover('', '1x1', { compact: true }) + '</span>' +
          '<span class="hc-sermon__body">' +
            '<span class="hc-row__title">' + c.esc(sermon.title) + '</span>' +
            '<span class="hc-caption">' + c.esc(c.byline(sermon.preacherShort, sermon.preachedOn)) + '</span>' +
            '<span class="hc-caption">' + c.esc(c.metaLine([sermon.passage, sermon.duration])) + '</span>' +
          '</span>' +
          c.icon('chevronDown', 'hc-sermon__chevron') +
        '</button>' +
        '<div class="hc-episode" id="' + c.esc(panelId) + '" data-open="false">' +
          '<div class="hc-episode__inner">' +
            summaryHtml(sermon) +
            '<div class="hc-episode__action">' + listenButton(sermon) + '</div>' +
            guideLink(sermon) +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ============================================================ series picker
     Under the latest message: one snapping rail holding every series the
     church has preached, the one you have landed on named underneath it, and
     that series' messages below that.

     THE ART IS THE TILE AND THE WORDS ARE THE CAPTION. The tile carries no
     label of its own. The line under the rail is what says which series you
     are looking at, and it changes as the rail moves, so the name is never
     printed twice and the block reads as one thing rather than two.

     THE GESTURE IS THE SAME ONE AS EVERYWHERE ELSE. This is the carousel
     machinery from Home, an overflowing scroller with snap points, which
     js/swipe.js already knows to hand a sideways drag to while it still has
     somewhere to go and to take back at the last slide. What is different here
     is that landing on a slide changes the page underneath it: js/app.js
     already watches these scrollers to paint their dots, so it tells this
     screen which slide it stopped on and selectSeries redraws from there.
     ------------------------------------------------------------------------ */

  /* Newest first, and whatever the church is preaching now opens the rail
     whatever its start date, so the tab always lands on the current series.
     A series nobody has preached a message in yet is not a slide. */
  function seriesList() {
    var current = HC.data.currentSeries();
    return (HC.data.series || []).filter(function (s) {
      return HC.data.sermonsInSeries(s.id).length > 0;
    }).sort(function (a, b) {
      if (current && a.id === current.id) return -1;
      if (current && b.id === current.id) return 1;
      if (a.startedOn === b.startedOn) return 0;
      return a.startedOn < b.startedOn ? 1 : -1;
    });
  }

  function seriesMeta(series) {
    var count = HC.data.sermonsInSeries(series.id).length;
    return '' +
      '<p class="hc-eyebrow hc-series-meta__kicker">' +
        (series.current ? 'Current series' : 'Past series') + '</p>' +
      '<h3 class="hc-display-m hc-series-meta__title">' + c.esc(series.title) + '</h3>' +
      (series.subtitle
        ? '<p class="hc-body-serif hc-series-meta__sub">' + c.esc(series.subtitle) + '</p>'
        : '') +
      '<p class="hc-caption hc-series-meta__count">' +
        count + ' episode' + (count === 1 ? '' : 's') + (series.current ? ' so far' : '') +
      '</p>';
  }

  function seriesEpisodes(series) {
    return HC.data.sermonsInSeries(series.id).map(function (s) {
      return sermonRow(s, 'series');
    }).join('');
  }

  /* The tiles say nothing out loud, so each one still has to say what it is to
     a screen reader, and the dots are decoration for the same reason they are
     on Home: they repeat what the caption underneath already states.

     A series with art in the catalogue wears it, laid over the house tile
     rather than instead of it, so art that does not arrive leaves the drawn
     cover showing rather than a hole. Most series have none and are the plain
     tile, which is what this screen has always drawn. */
  function seriesSlide(series) {
    var art = series.artUrl
      ? '<img class="hc-series-slide__img" src="' + c.esc(series.artUrl) + '" alt="" ' +
          'decoding="async" loading="lazy">'
      : '';
    return '' +
      '<li class="hc-carousel__slide hc-series-slide"' + (art ? ' data-media-fallback' : '') + '>' +
        '<span class="hc-visually-hidden">' + c.esc(series.title) + '</span>' +
        c.cover('', '4x3', { compact: true }) + art +
      '</li>';
  }

  function seriesPicker(list) {
    var dots = list.length > 1
      ? '<ol class="hc-carousel__dots" aria-hidden="true">' +
          list.map(function (series, i) {
            return '<li class="hc-carousel__dot" data-dot' +
              (i === 0 ? ' data-on="true"' : '') + '></li>';
          }).join('') +
        '</ol>'
      : '';

    var ids = list.map(function (series) { return series.id; }).join(',');

    return '' +
      '<div class="hc-series-picker" data-index="0" data-series-ids="' + c.esc(ids) + '">' +
        '<div class="hc-carousel">' +
          '<div class="hc-carousel__viewport" data-carousel data-series-rail>' +
            '<ul class="hc-carousel__track" role="list">' +
              list.map(seriesSlide).join('') +
            '</ul>' +
          '</div>' +
          dots +
        '</div>' +
        '<div class="hc-series-meta" data-series-meta>' + seriesMeta(list[0]) + '</div>' +
        '<div class="hc-series-list" data-series-list>' + seriesEpisodes(list[0]) + '</div>' +
      '</div>';
  }

  /* Called by js/app.js when one of these rails settles on a slide. Redraws
     the caption and the episode list, and does nothing at all when the rail
     has not actually changed series, which is most of the frames a swipe
     produces. */
  function selectSeries(rail, index) {
    var wrap = rail.closest ? rail.closest('.hc-series-picker') : null;
    if (!wrap || String(index) === wrap.getAttribute('data-index')) return;

    var ids = (wrap.getAttribute('data-series-ids') || '').split(',');
    var series = HC.data.getSeries(ids[index]);
    if (!series) return;

    wrap.setAttribute('data-index', String(index));
    var meta = wrap.querySelector('[data-series-meta]');
    var list = wrap.querySelector('[data-series-list]');
    if (meta) meta.innerHTML = seriesMeta(series);
    if (list) list.innerHTML = seriesEpisodes(series);
  }

  /* The empty screen, which a church that has just installed this sees for a
     week and nobody else ever sees again. Editable anyway, because "on
     Monday" is a promise about this church's week and this church may keep a
     different one. */
  var NOTHING_YET = 'Nothing to listen to yet. Sunday’s message lands here on Monday.';

  function showCard() {
    var podcast = HC.data.podcast;
    var inner = '' +
      '<p class="hc-eyebrow">On ' + c.esc(podcast.platform) + '</p>' +
      '<p class="hc-card__title">' + c.esc(podcast.name) + '</p>' +
      /* The show's own sentence, editable in place. The name and the platform
         above it are not: they are what the show is called on Spotify, and a
         card that disagrees with the app it opens is worse than one with a
         dated blurb. `podcast_show` is one row and its id is fixed, so this
         reaches it directly. */
      HC.edit.wrap(
        podcast.blurb ? '<p class="hc-caption hc-card__meta">' + c.esc(podcast.blurb) + '</p>' : '',
        { table: 'podcast_show', id: podcast.id || 'show-home-church-nola', column: 'blurb',
          target: podcast, field: 'blurb',
          value: podcast.blurb, label: 'what the show card says', rows: 4 }
      ) +
      '<div class="hc-show-card__action">' +
        c.button('Follow the show', {
          action: 'open-url',
          url: podcast.showUrl,
          variant: 'secondary',
          icon: 'arrowOut'
        }) +
      '</div>';
    return c.card(inner, { edge: true });
  }

  function render() {
    var all = HC.data.sermonsByDate();
    var html = '<div class="hc-screen hc-listen">';

    if (!all.length) {
      var empty = HC.data.copy('listen.empty', NOTHING_YET);
      html += c.sectionHeader('', 'Latest sermon', { flush: true, tag: 'h1' });
      html += HC.edit.wrap(
        empty ? c.emptyState(empty) : '',
        { slot: 'listen.empty', value: empty,
          label: 'what Listen says before the first message is up' }
      );
      html += '</div>';
      return c.el(html);
    }

    // The kicker over the top of the screen is the Sunday this message was
    // preached, written out. It is the one date on this screen that says how
    // fresh what you are looking at is, so it is not abbreviated.
    html += c.sectionHeader(c.formatDate(all[0].preachedOn), 'Latest sermon',
      { flush: true, tag: 'h1' });
    html += latest(all[0]);

    var list = seriesList();
    if (list.length) {
      html += c.sectionHeader('', 'Select series');
      html += seriesPicker(list);
    }

    // Archive, grouped by series, newest series first, and folded away. The
    // picker above already covers the series the church is in, and the back
    // catalogue behind this chevron runs to years of Sundays.
    var order = [];
    var bySeries = {};
    all.forEach(function (s) {
      if (!bySeries[s.seriesId]) {
        bySeries[s.seriesId] = [];
        order.push(s.seriesId);
      }
      bySeries[s.seriesId].push(s);
    });

    var archive = '';
    order.forEach(function (seriesId) {
      var series = HC.data.getSeries(seriesId);
      archive += '<div class="hc-archive-group">';
      archive += '<p class="hc-eyebrow hc-eyebrow--legible hc-archive-group__label">' +
        c.esc(series ? series.title : 'Messages') + '</p>';
      bySeries[seriesId].forEach(function (s) { archive += sermonRow(s, 'archive'); });
      archive += '</div>';
    });

    // The month rail waits for this section to go under the top bar before it
    // comes out, so it is the one block here that has to be findable by name.
    html += c.collapsible({
      id: 'listen-archive',
      anchorId: 'hc-archive-start',
      eyebrow: 'Everything else',
      title: 'Archive',
      body: archive,
      open: false
    });

    html += c.sectionHeader('Wherever you listen', 'The show');
    html += showCard();

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.listen = render;
  HC.screens.listenHelpers = { selectSeries: selectSeries };

})(window.HC = window.HC || {});
