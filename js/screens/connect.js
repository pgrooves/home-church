/* ==========================================================================
   Home Church, Connect
   Find a group, your group, serve teams, events, next steps.
   Seed data and inert forms in v1. The shapes are ready for a real backend.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  // Filter state lives here so the list can repaint without a full navigation.
  var filters = { day: 'all', neighborhood: 'all' };

  function uniq(list, prop) {
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      if (!seen[item[prop]]) {
        seen[item[prop]] = true;
        out.push(item[prop]);
      }
    });
    return out;
  }

  function pills(name, values, active) {
    var html = '<div class="hc-pills" role="group" aria-label="Filter by ' + c.esc(name) + '">';
    html += '<button type="button" class="hc-pill" data-action="filter" data-filter="' + c.esc(name) + '" ' +
      'data-value="all" aria-pressed="' + (active === 'all' ? 'true' : 'false') + '">Any</button>';
    values.forEach(function (v) {
      html += '<button type="button" class="hc-pill" data-action="filter" data-filter="' + c.esc(name) + '" ' +
        'data-value="' + c.esc(v) + '" aria-pressed="' + (active === v ? 'true' : 'false') + '">' +
        c.esc(v) + '</button>';
    });
    html += '</div>';
    return html;
  }

  function matches(group) {
    if (filters.day !== 'all' && group.day !== filters.day) return false;
    if (filters.neighborhood !== 'all' && group.neighborhood !== filters.neighborhood) return false;
    return true;
  }

  function groupCard(group) {
    var status = group.openings ? 'Room for more' : 'Full for now';
    var inner = '' +
      '<p class="hc-eyebrow">' + c.esc(group.day + 's, ' + group.time) + '</p>' +
      '<p class="hc-card__title">' + c.esc(group.name) + '</p>' +
      '<p class="hc-caption hc-card__meta">' +
        c.esc(group.neighborhood) + ' &middot; ' + c.esc(group.host) + ' &middot; ' + c.esc(group.lifeStage) +
      '</p>' +
      '<p class="hc-body-serif hc-group__blurb">' + c.esc(group.blurb) + '</p>' +
      '<p class="hc-caption hc-group__status" data-open="' + (group.openings ? 'true' : 'false') + '">' +
        c.esc(status) + '</p>';
    return c.card(inner, { action: 'join-group', id: group.id });
  }

  function groupList() {
    var list = (HC.data.groups || []).filter(matches);
    if (!list.length) {
      return c.emptyState('No group matches that yet. Widen the filter, or tell us what you need and we will start one.');
    }
    return list.map(groupCard).join('');
  }

  /* Groups are editable rows now, so the list can legitimately be empty and
     this has to say so rather than throw. Ordering comes from sort_order, set
     in the fetch, so "the first group" is a stable answer and not whichever
     row Postgres handed back. */
  function myGroup() {
    var group = (HC.data.groups || [])[0];
    if (!group) return '';
    var guide = HC.data.latestGuide();
    var inner = '' +
      '<p class="hc-eyebrow">' + c.esc(group.day + 's, ' + group.time) + '</p>' +
      '<p class="hc-card__title">' + c.esc(group.name) + '</p>' +
      '<p class="hc-caption hc-card__meta">' + c.esc(group.host) + ' &middot; ' + c.esc(group.neighborhood) + '</p>';

    if (guide) {
      inner += '<p class="hc-body-serif hc-mygroup__next">This week you are on ' + c.esc(HC.data.guideTitle(guide)) + '.</p>';
      inner += '<button type="button" class="hc-inline-link" data-action="open-guide" data-id="' + c.esc(guide.id) + '">' +
        c.icon('guide', 'hc-share__icon') + '<span>Open the guide</span></button>';
    }
    return c.card(inner, { edge: true });
  }

  function eventRow(evt) {
    return '' +
      '<div class="hc-event">' +
        '<p class="hc-eyebrow">' + c.esc(c.formatDate(evt.date)) + '</p>' +
        '<p class="hc-row__title">' + c.esc(evt.title) + '</p>' +
        '<p class="hc-caption">' + c.esc(evt.time) + ' &middot; ' + c.esc(evt.location) + '</p>' +
        '<p class="hc-body-serif hc-event__blurb">' + c.esc(evt.blurb) + '</p>' +
      '</div>';
  }

  function serveRow(team) {
    return c.row({
      title: team.name,
      sub: team.commitment + '. ' + team.blurb,
      serif: true,
      action: 'serve',
      id: team.id,
      chevron: true
    });
  }

  function nextStep(step) {
    var body = '' +
      '<p class="hc-body-serif hc-step__blurb">' + c.esc(step.blurb) + '</p>' +
      '<form class="hc-form" data-step="' + c.esc(step.id) + '" novalidate>' +
        '<label class="hc-field">' +
          '<span class="hc-field__label">Your name</span>' +
          '<input class="hc-input" type="text" name="name" autocomplete="name" placeholder="First and last">' +
        '</label>' +
        '<label class="hc-field">' +
          '<span class="hc-field__label">How do we reach you</span>' +
          '<input class="hc-input" type="text" name="contact" autocomplete="email" placeholder="Email or phone">' +
        '</label>' +
        '<label class="hc-field">' +
          '<span class="hc-field__label">Anything you want us to know</span>' +
          '<textarea class="hc-textarea" name="note" rows="3" placeholder="Optional, and there is no wrong answer."></textarea>' +
        '</label>' +
        c.button('Send it', { action: 'submit-step', id: step.id }) +
      '</form>';

    return c.collapsible({
      id: 'step-' + step.id,
      eyebrow: 'Next step',
      title: step.title,
      body: body
    });
  }

  function render() {
    var groups = HC.data.groups || [];
    var html = '<div class="hc-screen hc-connect">';

    html += c.sectionHeader('Find your people', 'Connect', { flush: true, tag: 'h1' });

    // No groups at all is a real state now that the table is editable. Both
    // sections drop rather than rendering a header over an empty filter strip.
    var mine = myGroup();
    if (mine) {
      html += c.sectionHeader('Where you belong', 'Your group');
      html += mine;
    }

    if (groups.length) {
      html += c.sectionHeader('Open seats', 'Find a group');
      html += '<div class="hc-filters">';
      html += '<p class="hc-eyebrow hc-eyebrow--legible hc-filters__label">Day</p>';
      html += pills('day', uniq(groups, 'day'), filters.day);
      html += '<p class="hc-eyebrow hc-eyebrow--legible hc-filters__label">Neighborhood</p>';
      html += pills('neighborhood', uniq(groups, 'neighborhood'), filters.neighborhood);
      html += '</div>';
      html += '<div class="hc-group-list" data-group-list>' + groupList() + '</div>';
    }

    html += c.sectionHeader('Lend a hand', 'Serve teams');
    html += '<div class="hc-serve-list">';
    HC.data.serveTeams.forEach(function (t) { html += serveRow(t); });
    html += '</div>';

    html += c.sectionHeader('On the calendar', 'Events');
    html += '<div class="hc-event-list">';
    HC.data.events.forEach(function (e) { html += eventRow(e); });
    html += '</div>';

    html += c.sectionHeader('Start somewhere', 'Next steps');
    HC.data.nextSteps.forEach(function (s) { html += nextStep(s); });

    html += '</div>';
    return c.el(html);
  }

  function setFilter(name, value) {
    filters[name] = value;
  }

  function repaintGroups(scope) {
    var target = scope.querySelector('[data-group-list]');
    if (target) target.innerHTML = groupList();
  }

  HC.screens = HC.screens || {};
  HC.screens.connect = render;
  HC.screens.connectHelpers = {
    setFilter: setFilter,
    repaintGroups: repaintGroups
  };

})(window.HC = window.HC || {});
