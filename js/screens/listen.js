/* ==========================================================================
   Home Church, Listen
   The Home Church NOLA podcast. Latest message, the current series, then the
   archive grouped by series. Every message opens to its own episode notes and
   a way into Spotify. Any sermon with a guide carries a quiet link into it.
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
  // the tap leaves the app and the label should say so before it does.
  function listenButton(sermon, variant) {
    return c.button('Listen on ' + HC.data.podcast.platform, {
      action: 'open-url',
      url: HC.data.episodeUrl(sermon),
      variant: variant || 'secondary',
      icon: 'listen'
    });
  }

  function summaryHtml(sermon) {
    return HC.data.episodeSummary(sermon).map(function (para) {
      return '<p class="hc-body-serif hc-episode__para">' + c.esc(para) + '</p>';
    }).join('');
  }

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
          c.esc(sermon.preacher) + ' &middot; ' + c.esc(c.formatDate(sermon.preachedOn)) +
          ' &middot; ' + c.esc(sermon.duration) +
        '</p>' +
        '<div class="hc-latest__desc">' + summaryHtml(sermon) + '</div>' +
        '<div class="hc-latest__action">' + listenButton(sermon, 'primary') + '</div>' +
        guideLink(sermon) +
      '</div>';
  }

  function seriesHero(series) {
    var count = HC.data.sermonsInSeries(series.id).length;
    return '' +
      '<div class="hc-series-hero">' +
        c.cover(series.title, '4x3', { compact: true }) +
        '<p class="hc-series-hero__sub hc-body-serif">' + c.esc(series.subtitle) + '</p>' +
        '<p class="hc-caption">' + count + ' episode' + (count === 1 ? '' : 's') + ' so far</p>' +
      '</div>';
  }

  /* An archive row opens in place. The summary is the episode's own notes, so
     you can read what a message is about before deciding to leave for it. */
  function sermonRow(sermon) {
    var panelId = 'episode-' + sermon.id;
    return '' +
      '<div class="hc-sermon">' +
        '<button type="button" class="hc-sermon__main" data-action="toggle-episode" ' +
          'aria-expanded="false" aria-controls="' + c.esc(panelId) + '">' +
          '<span class="hc-sermon__thumb">' + c.cover('', '1x1', { compact: true }) + '</span>' +
          '<span class="hc-sermon__body">' +
            '<span class="hc-row__title">' + c.esc(sermon.title) + '</span>' +
            '<span class="hc-caption">' + c.esc(sermon.preacherShort) + ', ' +
              c.esc(c.formatDate(sermon.preachedOn)) + '</span>' +
            '<span class="hc-caption">' + c.esc(sermon.passage) + ' &middot; ' + c.esc(sermon.duration) + '</span>' +
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

  function showCard() {
    var podcast = HC.data.podcast;
    var inner = '' +
      '<p class="hc-eyebrow">On ' + c.esc(podcast.platform) + '</p>' +
      '<p class="hc-card__title">' + c.esc(podcast.name) + '</p>' +
      '<p class="hc-caption hc-card__meta">' + c.esc(podcast.blurb) + '</p>' +
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

    html += c.sectionHeader('Most recent', 'Listen', { flush: true, tag: 'h1' });

    if (!all.length) {
      html += c.emptyState('Nothing to listen to yet. Sunday’s message lands here on Monday.');
      html += '</div>';
      return c.el(html);
    }

    html += latest(all[0]);

    var current = HC.data.currentSeries();
    if (current) {
      html += c.sectionHeader('Current series', current.title);
      html += seriesHero(current);
    }

    // Archive, grouped by series, newest series first.
    var order = [];
    var bySeries = {};
    all.forEach(function (s) {
      if (!bySeries[s.seriesId]) {
        bySeries[s.seriesId] = [];
        order.push(s.seriesId);
      }
      bySeries[s.seriesId].push(s);
    });

    html += c.sectionHeader('Everything else', 'Archive');

    order.forEach(function (seriesId) {
      var series = HC.data.getSeries(seriesId);
      html += '<div class="hc-archive-group">';
      html += '<p class="hc-eyebrow hc-eyebrow--legible hc-archive-group__label">' +
        c.esc(series ? series.title : 'Messages') + '</p>';
      bySeries[seriesId].forEach(function (s) { html += sermonRow(s); });
      html += '</div>';
    });

    html += c.sectionHeader('Wherever you listen', 'The show');
    html += showCard();

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.listen = render;

})(window.HC = window.HC || {});
