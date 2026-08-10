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
      '<p class="hc-eyebrow">Next gathering</p>' +
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

  function announcement() {
    var today = todayLocal();
    var list = (HC.data.announcements || []).filter(function (a) {
      return isLive(a, today) && !HC.store.isDismissed(a.id);
    });
    if (!list.length) return '';

    // Home shows one, so when two are live on the same day something has to
    // break the tie deliberately rather than leaving it to whatever order the
    // rows arrived in. Higher priority wins, then id, so it is at least stable.
    list.sort(function (x, y) {
      var px = x.priority || 0;
      var py = y.priority || 0;
      if (px !== py) return py - px;
      return String(x.id) < String(y.id) ? -1 : 1;
    });

    var a = list[0];   // one announcement maximum, on purpose
    return '' +
      '<div class="hc-banner" data-banner="' + c.esc(a.id) + '">' +
        '<div class="hc-banner__body">' +
          '<p class="hc-eyebrow">' + c.esc(a.eyebrow) + '</p>' +
          '<p class="hc-banner__title hc-body-serif">' + c.esc(a.title) + '</p>' +
          '<p class="hc-caption">' + c.esc(a.body) + '</p>' +
        '</div>' +
        '<button type="button" class="hc-banner__dismiss" data-action="dismiss-banner" ' +
          'data-id="' + c.esc(a.id) + '" aria-label="Dismiss">' +
          c.icon('close') +
        '</button>' +
      '</div>';
  }

  /* The plan is one editable row in Supabase now, so this has to hold up
     against whatever is in it. No plan at all renders nothing and Home drops
     the section, rather than printing "undefined" or dividing by zero in
     front of a congregation. */
  function readingPlanRow() {
    var plan = HC.data.readingPlan;
    if (!plan || !plan.title) return '';

    var total = plan.totalWeeks || 0;
    var week = plan.currentWeek || 0;
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

  function render() {
    var html = '<div class="hc-screen hc-home">';

    // The mark now lives in the top bar, so Home does not repeat it.
    html += '<h1 class="hc-display-l hc-home__greeting">' + c.esc(greetingLine()) + '</h1>';

    html += '<div class="hc-home__stack">';
    html += gatheringCard();
    html += guideCard();
    html += '</div>';

    var ann = announcement();
    if (ann) {
      html += '<div class="hc-home__announcement">' + ann + '</div>';
    }

    // No plan, no section. An empty header over nothing reads as a bug.
    var plan = readingPlanRow();
    if (plan) {
      html += c.sectionHeader('Reading together', 'Where we are');
      html += plan;
    }

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.home = render;

})(window.HC = window.HC || {});
