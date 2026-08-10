/* ==========================================================================
   Home Church, Leader tools
   A sixth view, not a sixth tab. Reached from Profile when leader mode is on.

   Roster and prayer capture are local only in v1. The point is the shape:
   most church apps serve attenders, almost none serve the person who has to
   run the room on a Thursday night.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  function memberRow(member) {
    return '' +
      '<div class="hc-member" data-member="' + c.esc(member.id) + '">' +
        '<button type="button" class="hc-check hc-member__check" data-action="toggle-present" ' +
          'data-id="' + c.esc(member.id) + '" aria-pressed="' + (member.present ? 'true' : 'false') + '">' +
          '<span class="hc-check__box" aria-hidden="true">' + c.icon('check', 'hc-check__tick') + '</span>' +
          '<span class="hc-check__text hc-row__title">' + c.esc(member.name) + '</span>' +
        '</button>' +
        '<div class="hc-member__note">' +
          '<label class="hc-visually-hidden" for="note-' + c.esc(member.id) + '">Private note about ' + c.esc(member.name) + '</label>' +
          '<input class="hc-input hc-member__input" id="note-' + c.esc(member.id) + '" type="text" ' +
            'data-member-note="' + c.esc(member.id) + '" value="' + c.esc(member.note) + '" ' +
            'placeholder="A private note, just for you">' +
        '</div>' +
        '<button type="button" class="hc-btn hc-btn--tertiary hc-member__remove" ' +
          'data-action="remove-member" data-id="' + c.esc(member.id) + '">Remove</button>' +
      '</div>';
  }

  function prayerRow(entry) {
    return '' +
      '<div class="hc-prayer">' +
        '<div class="hc-prayer__body">' +
          '<p class="hc-eyebrow hc-eyebrow--legible">' + c.esc(entry.who) + '</p>' +
          '<p class="hc-body-serif">' + c.esc(entry.text) + '</p>' +
          '<p class="hc-caption">' + c.esc(c.formatDate(entry.savedOn.slice(0, 10))) + '</p>' +
        '</div>' +
        '<button type="button" class="hc-banner__dismiss" data-action="remove-prayer" ' +
          'data-id="' + c.esc(entry.id) + '" aria-label="Remove this prayer request">' +
          c.icon('close') +
        '</button>' +
      '</div>';
  }

  function render() {
    var roster = HC.store.getRoster();
    var prayers = HC.store.getPrayers();
    var guide = HC.data.latestGuide();
    var here = roster.filter(function (m) { return m.present; }).length;

    var html = '<div class="hc-screen hc-leader">';

    html += c.sectionHeader('Leader mode', 'Your group', { flush: true, tag: 'h1' });
    html += '<p class="hc-body-serif hc-leader__intro">Everything on this screen stays on your phone. Nobody else sees it, and nothing here is a report.</p>';

    // This week
    if (guide) {
      var inner = '' +
        '<p class="hc-eyebrow">This week</p>' +
        '<p class="hc-card__title">' + c.esc(HC.data.guideTitle(guide)) + '</p>' +
        '<p class="hc-caption hc-card__meta">' + c.esc(guide.preacherShort) + ', ' +
          c.esc(c.formatDate(guide.preachedOn)) + '</p>' +
        '<div class="hc-leader__actions">' +
          c.button('Present the questions', { action: 'present', id: guide.id, icon: 'book' }) +
          c.button('Open the full guide', { action: 'open-guide', id: guide.id, variant: 'secondary' }) +
        '</div>';
      html += c.card(inner, { edge: true });
    }

    // Roster. Attendance is a memory aid, never a scoreboard.
    html += c.sectionHeader('Who is here', 'Roster');
    html += '<p class="hc-caption hc-leader__count">' +
      (here ? here + ' checked in tonight' : 'Tap a name as people arrive') + '</p>';

    html += '<div class="hc-roster" data-roster>';
    if (!roster.length) {
      html += c.emptyState('No names yet. Add the people who show up and this becomes useful fast.');
    } else {
      roster.forEach(function (m) { html += memberRow(m); });
    }
    html += '</div>';

    html += '<form class="hc-addform" data-add-member novalidate>' +
      '<label class="hc-field hc-addform__field">' +
        '<span class="hc-field__label">Add someone</span>' +
        '<input class="hc-input" type="text" name="member" placeholder="First name">' +
      '</label>' +
      c.button('Add to roster', { action: 'add-member', variant: 'secondary', icon: 'plus' }) +
    '</form>';

    // Prayer capture
    html += c.sectionHeader('What they asked for', 'Prayer requests');
    html += '<form class="hc-addform" data-add-prayer novalidate>' +
      '<label class="hc-field hc-addform__field">' +
        '<span class="hc-field__label">Who</span>' +
        '<input class="hc-input" type="text" name="who" placeholder="A name, or leave it blank">' +
      '</label>' +
      '<label class="hc-field hc-addform__field">' +
        '<span class="hc-field__label">The request</span>' +
        '<textarea class="hc-textarea" name="text" rows="3" placeholder="Write it the way they said it."></textarea>' +
      '</label>' +
      c.button('Keep this', { action: 'add-prayer' }) +
    '</form>';

    html += '<div class="hc-prayer-list" data-prayers>';
    if (!prayers.length) {
      html += c.emptyState('Nothing saved yet. What people ask for out loud is worth writing down.');
    } else {
      prayers.forEach(function (p) { html += prayerRow(p); });
    }
    html += '</div>';

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.leader = render;
  HC.screens.leaderHelpers = { memberRow: memberRow, prayerRow: prayerRow };

})(window.HC = window.HC || {});
