/* ==========================================================================
   Home Church, Connect
   Groups in season, serve teams, events, and next steps.

   THE RULE THIS SCREEN NOW KEEPS: nothing here tells a person that something
   will happen unless something actually happens. Before this pass, three
   controls on this screen were reassuring lies. Tapping a serve team said
   "someone from that team will find you on Sunday" and told nobody. Tapping a
   group said "we will pass your name to the host" from a card that had no
   field to type a name into. The next step forms collected a name, a contact,
   and a note, and then threw all three away.

   Every one of them now either goes somewhere real or says nothing. The
   destinations are the systems the church already runs, Church Center, Group
   Vitals, Flodesk, and an SMS keyword, because those have somebody watching
   them and a second copy in this app would not.
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

  /* An information card, not a button. It was a button, and tapping it claimed
     a name would be passed to the host from a card with nowhere to type one.
     Everything a person needs in order to decide is on the card instead, and
     the one thing the app cannot honestly offer, joining, is not pretended at.
     See LAUNCH_TODO.md, this is the last open destination on this screen. */
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
    return c.card(inner);
  }

  function groupList() {
    var list = (HC.data.groups || []).filter(matches);
    if (!list.length) {
      return c.emptyState('No group matches that yet. Widen the filter, or tell us what you need and we will start one.');
    }
    return list.map(groupCard).join('');
  }

  /* Groups run in seasons, and between them there is nothing to join. A filter
     strip standing over an empty list reads as a broken screen rather than as
     a season, so the whole finder drops and this takes its place. One boolean
     in church_profile, flipped twice a year. */
  function offSeason() {
    var note = HC.data.church.groupsOffSeasonNote;
    if (!note) return '';
    return '' +
      c.sectionHeader('Between seasons', 'Home groups') +
      c.card('<p class="hc-body-serif hc-group__off-season">' + c.esc(note) + '</p>', { edge: true });
  }

  /* --------------------------------------------------------- serve teams
     Descriptions, opened by tap. Not one tap interest buttons, which is what
     these were: a single tap fired off a claim that someone would find you on
     Sunday, with no confirmation and no way to tell what the tap would do
     before you made it. Reading about a team should cost nothing.
     ------------------------------------------------------------------- */

  function serveTeam(team) {
    var body = '';

    // Only two teams publish a schedule. The line drops rather than leaving a
    // gap on the five that do not.
    if (team.commitment) {
      body += '<p class="hc-eyebrow hc-eyebrow--legible hc-serve__commitment">' + c.esc(team.commitment) + '</p>';
    }

    body += '<p class="hc-body-serif hc-serve__blurb">' + c.esc(team.blurb) + '</p>';

    // A background check or a training process. Its own line, after the
    // description, because it is the thing somebody needs before they decide
    // and not a detail to find out later.
    if (team.requirement) {
      body += '<p class="hc-caption hc-serve__requirement">' + c.esc(team.requirement) + '</p>';
    }

    return c.collapsible({
      id: 'team-' + team.id,
      eyebrow: 'Serve team',
      title: team.name,
      body: body
    });
  }

  /* One signup for every team, which is how the church already runs it. The
     button is dropped rather than shown dead if there is no number on file. */
  function serveSignup() {
    var serve = HC.data.church.serve || {};
    if (!serve.blurb && !serve.number) return '';

    var link = c.smsUrl(serve.number, serve.keyword);
    var html = '' +
      c.sectionHeader('Interested?', serve.title || 'Sign up to serve') +
      '<p class="hc-body-serif hc-serve__signup-copy">' + c.esc(serve.blurb) + '</p>';

    if (link) {
      var label = serve.keyword
        ? 'Text ' + serve.keyword + ' to ' + serve.number
        : 'Text us at ' + serve.number;
      html += '<div class="hc-serve__signup-action">' +
        c.button(label, { action: 'open-url', url: link, icon: 'connect' }) +
        '<p class="hc-caption hc-serve__signup-note">Opens Messages with the number filled in.</p>' +
      '</div>';
    }

    return html;
  }

  /* ------------------------------------------------------ the Instagram rail
     A strip of the church's latest posts, across the top of this screen.

     WHY IT CAN BE INVISIBLE AND THAT IS FINE. Instagram serves no API to a
     Personal account, and the church's account is still one, so there is
     nothing feeding this yet. Rather than a feature flag somebody has to
     remember to flip, the rail obeys the rule this screen already keeps
     everywhere else: a section whose list is empty does not render at all.
     Zero rows means zero markup, not an empty strip. The day the sync writes
     its first rows the rail appears on every phone, with no App Store build,
     because the rows arrive through the same content pipeline as events.

     WHAT IT DELIBERATELY IS NOT. Not a copy of Instagram. No like counts, no
     comments, no inline video. It is a window with nine photographs in it and
     a door to the real thing, because every one of those extra things is
     something the app would then have to keep true.
     ------------------------------------------------------------------- */

  function instagramProfileUrl() {
    var social = (HC.data.church.social || []).filter(function (s) {
      return s.label === 'Instagram';
    })[0];
    return social ? social.url : '';
  }

  /* What VoiceOver reads for a tile.

     A rail of nine buttons all announcing "Instagram post" is a rail nobody
     can navigate, so the caption does the work when there is one. Instagram
     captions run to paragraphs and end in a drift of hashtags, so this takes
     the first line and caps it. "Opens Instagram" is on the end because the
     tile leaves the app, and a link that leaves should say so before it is
     followed rather than after. */
  function tileLabel(post) {
    var first = String(post.caption || '').split('\n')[0].trim();
    if (first.length > 120) {
      first = first.slice(0, 119).replace(/\s+\S*$/, '') + '…';
    }
    var fallback = post.mediaType === 'VIDEO' ? 'Instagram video' : 'Instagram post';
    var when = post.postedAt ? c.formatDate(String(post.postedAt).slice(0, 10)) : '';

    // Joining these with '. ' would double the stop on every caption that
    // already ends in one, and VoiceOver reads "Sunday dot dot". Each part
    // gets punctuated only if it needs it, then they join on a space.
    function sentence(s) {
      return /[.!?…]$/.test(s) ? s : s + '.';
    }

    return [first || fallback, when, 'Opens Instagram']
      .filter(Boolean).map(sentence).join(' ');
  }

  /* alt="" on the image is correct, not an oversight. The button already
     carries the description, and a nested image with its own alt text makes a
     screen reader announce the same post twice.

     data-media-fallback marks the tile for the image error listener in
     app.js. An image that never arrives leaves the cream block underneath it
     showing, which is the same treatment missing art gets everywhere else in
     the app, rather than a broken image glyph in a row of photographs. */
  function instagramTile(post) {
    return '' +
      '<li class="hc-rail__item">' +
        '<button type="button" class="hc-post" data-action="open-url" ' +
          'data-media-fallback data-url="' + c.esc(post.permalink) + '" ' +
          'aria-label="' + c.esc(tileLabel(post)) + '">' +
          '<img class="hc-post__img" src="' + c.esc(post.imageUrl) + '" alt="" ' +
            'loading="lazy" decoding="async">' +
          (post.mediaType === 'VIDEO' ? c.playBadge() : '') +
        '</button>' +
      '</li>';
  }

  function instagramRail() {
    var posts = (HC.data.instagramPosts || []).filter(function (p) {
      return p.imageUrl && p.permalink;
    });
    if (!posts.length) return '';

    // role="list" restores the semantics Safari drops the moment a list has
    // list-style: none, which is every styled list in this app.
    var html = c.sectionHeader('Lately', 'On Instagram') +
      '<div class="hc-rail">' +
        '<ul class="hc-rail__track" role="list">';

    posts.forEach(function (p) { html += instagramTile(p); });

    // The way out of the rail and into the actual feed. Reads the URL from
    // church.social rather than hardcoding it, so the handle lives in exactly
    // one place, which is the row Profile already links from.
    var profile = instagramProfileUrl();
    if (profile) {
      html += '<li class="hc-rail__item">' +
        '<button type="button" class="hc-post hc-post--more" data-action="open-url" ' +
          'data-url="' + c.esc(profile) + '" ' +
          'aria-label="See more on Instagram. Opens Instagram">' +
          c.icon('arrowOut', 'hc-post__more-icon') +
          '<span class="hc-post__more-label">See more</span>' +
        '</button>' +
      '</li>';
    }

    return html + '</ul></div>';
  }

  /* When an event actually starts, as a Date.

     evt.date is 'YYYY-MM-DD' and evt.time is whatever the church wrote, which
     is a clock time on most events and something like 'All three services' on
     the rest. A real time wins when there is one. When there is not, nine in
     the morning is the least wrong guess for a church event and it beats
     refusing to make a calendar entry at all. The person can drag it. */
  function eventStart(evt) {
    var parts = String(evt.date || '').split('-');
    var d = new Date(+parts[0], (+parts[1]) - 1, +parts[2], 9, 0, 0, 0);

    var m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(evt.time || '');
    if (m) {
      var hour = parseInt(m[1], 10) % 12;
      if (/PM/i.test(m[3])) hour += 12;
      d.setHours(hour, parseInt(m[2], 10), 0, 0);
    }
    return d;
  }

  function eventRow(evt) {
    return '' +
      '<div class="hc-event">' +
        '<p class="hc-eyebrow">' + c.esc(c.formatDate(evt.date)) + '</p>' +
        '<p class="hc-row__title">' + c.esc(evt.title) + '</p>' +
        '<p class="hc-caption">' + c.esc(evt.time) + ' &middot; ' + c.esc(evt.location) + '</p>' +
        '<p class="hc-body-serif hc-event__blurb">' + c.esc(evt.blurb) + '</p>' +
        '<div class="hc-event__action">' +
          '<button type="button" class="hc-inline-link" data-action="add-to-calendar" ' +
            'data-id="' + c.esc(evt.id) + '">' +
            c.icon('plus', 'hc-share__icon') +
            '<span>Add to calendar</span>' +
          '</button>' +
        '</div>' +
      '</div>';
  }

  /* ---------------------------------------------------------- next steps
     Was a form that collected a name, a contact, and a note and then called
     form.reset() on them. Now a description and, when there is somewhere real
     to land, a button that says where it goes before it goes there. A step
     with no url renders as a description, which is honest, rather than as a
     button that does nothing.
     ------------------------------------------------------------------- */

  function nextStep(step) {
    var body = '<p class="hc-body-serif hc-step__blurb">' + c.esc(step.blurb) + '</p>';

    if (step.url) {
      body += '<div class="hc-step__action">' +
        c.button(step.ctaLabel || 'Open', {
          action: 'open-url',
          url: step.url,
          icon: 'arrowOut'
        }) +
        '<p class="hc-caption hc-step__note">Opens in your browser.</p>' +
      '</div>';
    }

    return c.collapsible({
      id: 'step-' + step.id,
      eyebrow: 'Next step',
      title: step.title,
      body: body
    });
  }

  function render() {
    var church = HC.data.church;
    var groups = HC.data.groups || [];
    var html = '<div class="hc-screen hc-connect">';

    html += c.sectionHeader('Find your people', 'Connect', { flush: true, tag: 'h1' });

    // Under the h1, never above it. A screen whose first element is a strip of
    // unlabeled photographs reads as an ad banner to a person and as an
    // unheaded region to a screen reader. Renders nothing at all until the
    // Instagram sync exists, so today this line is a no-op.
    html += instagramRail();

    if (!church.groupsInSeason) {
      html += offSeason();
    } else if (groups.length) {
      html += c.sectionHeader('Open seats', 'Find a group');
      html += '<div class="hc-filters">';
      html += '<p class="hc-eyebrow hc-eyebrow--legible hc-filters__label">Day</p>';
      html += pills('day', uniq(groups, 'day'), filters.day);
      html += '<p class="hc-eyebrow hc-eyebrow--legible hc-filters__label">Neighborhood</p>';
      html += pills('neighborhood', uniq(groups, 'neighborhood'), filters.neighborhood);
      html += '</div>';
      html += '<div class="hc-group-list" data-group-list>' + groupList() + '</div>';
    } else {
      // In season and yet no groups is the same experience for a person as
      // being between seasons, so say the same thing rather than nothing.
      html += offSeason();
    }

    // Every list below is an editable table, so each one can legitimately come
    // back empty. A section header standing over nothing reads as a bug, so
    // the whole section drops instead.
    var serveTeams = HC.data.serveTeams || [];
    if (serveTeams.length) {
      html += c.sectionHeader('Lend a hand', 'Serve teams');
      serveTeams.forEach(function (t) { html += serveTeam(t); });
      html += serveSignup();
    }

    var events = HC.data.events || [];
    if (events.length) {
      html += c.sectionHeader('On the calendar', 'Events');
      html += '<div class="hc-event-list">';
      events.forEach(function (e) { html += eventRow(e); });
      html += '</div>';
    }

    var nextSteps = HC.data.nextSteps || [];
    if (nextSteps.length) {
      html += c.sectionHeader('Start somewhere', 'Next steps');
      nextSteps.forEach(function (s) { html += nextStep(s); });
    }

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
    repaintGroups: repaintGroups,
    eventStart: eventStart
  };

})(window.HC = window.HC || {});
