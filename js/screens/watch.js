/* ==========================================================================
   Home Church, Watch
   Latest message, the current series, then the archive grouped by series.
   Any sermon with a guide carries a quiet link into it.
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

  function latest(sermon) {
    var series = HC.data.getSeries(sermon.seriesId);
    return '' +
      '<div class="hc-latest">' +
        '<button type="button" class="hc-latest__media" data-action="play" ' +
          'data-id="' + c.esc(sermon.id) + '" aria-label="Play ' + c.esc(sermon.title) + '">' +
          c.media(sermon.artLabel, '16x9', { play: true }) +
        '</button>' +
        '<p class="hc-eyebrow hc-latest__eyebrow">' + c.esc(series ? series.title : 'Latest') + '</p>' +
        '<h2 class="hc-display-m hc-latest__title">' + c.esc(sermon.title) + '</h2>' +
        '<p class="hc-caption hc-latest__meta">' +
          c.esc(sermon.preacher) + ' &middot; ' + c.esc(c.formatDate(sermon.preachedOn)) +
          ' &middot; ' + c.esc(sermon.duration) +
        '</p>' +
        '<p class="hc-body-serif hc-latest__desc">' + c.esc(sermon.description) + '</p>' +
        guideLink(sermon) +
      '</div>';
  }

  function seriesHero(series) {
    var count = HC.data.sermonsInSeries(series.id).length;
    return '' +
      '<div class="hc-series-hero">' +
        c.media(series.artLabel, '4x3') +
        '<p class="hc-series-hero__sub hc-body-serif">' + c.esc(series.subtitle) + '</p>' +
        '<p class="hc-caption">' + count + ' message' + (count === 1 ? '' : 's') + ' so far</p>' +
      '</div>';
  }

  function sermonRow(sermon) {
    return '' +
      '<div class="hc-sermon">' +
        '<button type="button" class="hc-sermon__main" data-action="play" data-id="' + c.esc(sermon.id) + '">' +
          '<span class="hc-sermon__thumb">' + c.media('', '16x9', { play: true }) + '</span>' +
          '<span class="hc-sermon__body">' +
            '<span class="hc-row__title">' + c.esc(sermon.title) + '</span>' +
            '<span class="hc-caption">' + c.esc(sermon.preacherShort) + ', ' +
              c.esc(c.formatDate(sermon.preachedOn)) + '</span>' +
            '<span class="hc-caption">' + c.esc(sermon.passage) + ' &middot; ' + c.esc(sermon.duration) + '</span>' +
          '</span>' +
        '</button>' +
        guideLink(sermon) +
      '</div>';
  }

  function render() {
    var all = HC.data.sermonsByDate();
    var html = '<div class="hc-screen hc-watch">';

    html += c.sectionHeader('Most recent', 'Watch', { flush: true, tag: 'h1' });

    if (!all.length) {
      html += c.emptyState('Nothing to watch yet. Sunday’s message lands here on Monday.');
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

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.watch = render;

})(window.HC = window.HC || {});
