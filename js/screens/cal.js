/* ==========================================================================
   Home Church, Cal
   The church's calendar, on a screen of its own: a month you can walk
   through at the top, and the upcoming events underneath it.

   WHY IT EXISTS. Events used to be the fourth section of the Connect tab,
   below the group finder and the serve teams, which is a long way down a
   screen about finding your people. A date is not a way in, it is a thing
   happening on a day, and the question somebody actually asks of it is "what
   is on, and when" — which is a question a list answers badly and a month
   answers at a glance. So the list moved here, unchanged, and the month grid
   is the new thing above it.

   WHERE THE DATES COME FROM, and it is not two places. Every event on this
   screen is a row in the `events` table, whether somebody typed it here, ran
   /new-event, or approved one the newsletter intake parsed out of an email.
   The Cal tab draws HC.data.events and asks nothing about where a row came
   from: the pipeline in 0038, 0040 and 0041 is untouched by this screen and
   ends where it always ended, at a published row.

   WHAT AN ADMIN CAN DO HERE. Add an event, correct one, and take one down.
   Those three are the reason migration 0042 exists: until it, the only ways
   to fix a wrong date were a laptop and the Supabase dashboard, neither of
   which is in the hand of the person who spots it on a Sunday. Everything an
   admin taps here is refused by the database for everybody else, exactly as
   on the Admin screen. See the header of js/admin.js.

   THE ONE PIECE OF STATE WORTH KNOWING ABOUT. `view` is the month on screen
   and `selected` is the day whose events are showing under the grid. Both
   live in this file rather than in the route, so a content refresh landing
   while somebody is looking at next March does not throw them back to today.
   Every tap that changes either one repaints the whole screen through the
   router, which is what keeps edit mode's registry honest: see
   HC.edit.beginRender() in js/router.js.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* The month on screen. Null means "wherever today is", which is what the
     screen opens on and what the Today button puts it back to. */
  var view = null;

  // 'YYYY-MM-DD', or '' for no day open. Cleared whenever the month moves,
  // because a day that is not in the grid cannot be the day the grid is
  // showing you.
  var selected = '';

  /* The event being written or corrected, or null. Held here rather than in
     the DOM for the reason the Admin screen holds its draft: a content
     refresh landing mid-sentence redraws the form with the words still in it.
     Nothing reaches Supabase until Save. */
  var draft = null;

  // Which button is waiting on the network, as 'save' or 'delete:<id>'.
  var busy = '';

  var NOTHING_YET = 'Nothing on the calendar yet. When something is planned, it lands here.';

  /* ------------------------------------------------------------- the dates */

  /* 'YYYY-MM-DD' in the phone's own zone. Every date on this screen is one of
     these: HC.data.events carries dates in that shape, they sort as strings,
     and comparing them never involves a timezone. Same helper Home and the
     Admin screen use, for the same reason. */
  function isoDate(year, month, day) {
    return year + '-' + c.pad2(month + 1) + '-' + c.pad2(day);
  }

  function todayIso() {
    var d = new Date();
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function events() {
    return (HC.data.events || []).filter(function (e) { return e && e.date; });
  }

  function byDate(a, b) {
    if (a.date === b.date) return String(a.title).localeCompare(String(b.title));
    return a.date < b.date ? -1 : 1;
  }

  /* Every event on the calendar, keyed by the day it happens. Built fresh on
     each draw rather than kept: the list underneath comes from the same
     object, and a cached index is one more thing that can be looking at last
     week's content after a refresh. */
  function eventsByDay() {
    var map = {};
    events().forEach(function (e) {
      (map[e.date] || (map[e.date] = [])).push(e);
    });
    Object.keys(map).forEach(function (day) { map[day].sort(byDate); });
    return map;
  }

  /* What the list under the grid shows: today and everything after it,
     soonest first.

     PAST EVENTS ARE NOT IN IT, and that is the one thing about the list that
     is different from the section it replaces on Connect. A heading that says
     Upcoming over a serve day from March is worse than no heading, and the
     month grid above is where anything that has already happened is now
     looked up, which is a thing the old list could not do at all. */
  function upcoming() {
    var today = todayIso();
    return events().filter(function (e) { return e.date >= today; }).sort(byDate);
  }

  /* When an event actually starts, as a Date. Moved here with the list from
     js/screens/connect.js, unchanged.

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

  /* ---------------------------------------------------------- the month */

  function viewMonth() {
    if (view) return view;
    var d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  /* One month as rows of seven. A 0 is a cell outside the month, which is
     drawn as a gap rather than as a greyed out day from the month either
     side: this grid is a place to tap, and a tappable 31st of last August
     sitting under a heading that says September is a small lie that only
     costs somebody a mis-tap.

     Pure, and exported, because the arithmetic is the part of this screen a
     test can hold still: months with 28, 30 and 31 days, a leap February, and
     a month that starts on a Sunday and so has no lead at all. See
     tests/calendar.test.js. */
  function monthMatrix(year, month) {
    var lead = new Date(year, month, 1).getDay();
    var days = new Date(year, month + 1, 0).getDate();
    var cells = [];
    var i;

    for (i = 0; i < lead; i++) cells.push(0);
    for (i = 1; i <= days; i++) cells.push(i);
    while (cells.length % 7) cells.push(0);

    var weeks = [];
    for (i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  /* The two steppers over the grid. Months on the left, years on the right,
     so a date eight months out is two taps rather than eight, and next
     Christmas is one.

     Chevrons and not a dropdown: a select on iOS lifts a wheel over the
     screen, which is a heavy thing to put in front of somebody who wanted to
     look at October. */
  function stepper(kind, label, back, forward) {
    return '' +
      '<div class="hc-cal__stepper">' +
        '<button type="button" class="hc-cal__step" data-action="cal-step" ' +
          'data-id="' + kind + ':-1" aria-label="' + c.esc(back) + '">' +
          c.icon('chevronLeft', 'hc-cal__step-icon') +
        '</button>' +
        '<span class="hc-cal__stepper-label">' + c.esc(label) + '</span>' +
        '<button type="button" class="hc-cal__step" data-action="cal-step" ' +
          'data-id="' + kind + ':1" aria-label="' + c.esc(forward) + '">' +
          c.icon('chevronRight', 'hc-cal__step-icon') +
        '</button>' +
      '</div>';
  }

  /* What VoiceOver reads for a day worth tapping. The date, then how much is
     on it, because "September 12" alone gives no reason to open it and the
     dot that gives a sighted person that reason is decoration. */
  function dayLabel(iso, count) {
    var when = c.formatDate(iso);
    if (count === 1) return when + ', one event';
    return when + ', ' + count + ' events';
  }

  function grid() {
    var v = viewMonth();
    var map = eventsByDay();
    var today = todayIso();
    var weeks = monthMatrix(v.year, v.month);
    var heading = c.monthNames[v.month] + ' ' + v.year;

    var html = '<div class="hc-cal__grid" role="grid" aria-label="' + c.esc(heading) + '">';

    /* Single letters, which is all seven fit in on a 375pt phone. The full
       day name goes in aria-label, so a screen reader says Wednesday rather
       than spelling W, and the two Ts and two Ss stop being ambiguous. */
    html += '<div class="hc-cal__row hc-cal__row--head" role="row">';
    c.dayNames.forEach(function (name) {
      html += '<span class="hc-cal__dow" role="columnheader" ' +
        'aria-label="' + c.esc(name) + '">' + c.esc(name.slice(0, 1)) + '</span>';
    });
    html += '</div>';

    weeks.forEach(function (week) {
      html += '<div class="hc-cal__row" role="row">';
      week.forEach(function (day) {
        if (!day) {
          html += '<span class="hc-cal__cell" role="gridcell"></span>';
          return;
        }

        var iso = isoDate(v.year, v.month, day);
        var list = map[iso] || [];
        var classes = 'hc-cal__day' +
          (list.length ? ' hc-cal__day--has' : '') +
          (iso === today ? ' hc-cal__day--today' : '') +
          (iso === selected ? ' hc-cal__day--open' : '');

        html += '<span class="hc-cal__cell" role="gridcell">';

        if (list.length) {
          html += '<button type="button" class="' + classes + '" ' +
            'data-action="cal-day" data-id="' + iso + '" ' +
            'aria-pressed="' + (iso === selected ? 'true' : 'false') + '" ' +
            'aria-label="' + c.esc(dayLabel(iso, list.length)) + '">' +
            '<span class="hc-cal__day-num">' + day + '</span>' +
            '<span class="hc-cal__dot" aria-hidden="true"></span>' +
          '</button>';
        } else {
          // Nothing on it, so nothing to open. A day that answers a tap with
          // "nothing here" is a tap the screen asked for and then wasted.
          html += '<span class="' + classes + '">' +
            '<span class="hc-cal__day-num">' + day + '</span>' +
          '</span>';
        }

        html += '</span>';
      });
      html += '</div>';
    });

    return html + '</div>';
  }

  function calendarBlock() {
    var v = viewMonth();
    var now = new Date();
    var onThisMonth = v.year === now.getFullYear() && v.month === now.getMonth();

    var html = '<div class="hc-cal">';

    html += '<div class="hc-cal__head">';
    html += stepper('month', c.monthNames[v.month], 'The month before', 'The month after');
    html += stepper('year', String(v.year), 'The year before', 'The year after');
    html += '</div>';

    html += grid();

    // Only when it would do something. A Today button on today is a button
    // that says the screen is somewhere it is not.
    if (!onThisMonth) {
      html += '<div class="hc-cal__today">' +
        c.button('Today', { action: 'cal-today', variant: 'tertiary', small: true }) +
      '</div>';
    }

    return html + '</div>';
  }

  /* The day somebody opened, under the grid. Drawn only for a day with
     something on it, which is the only kind this screen lets you tap.

     THE DESCRIPTIONS HERE ARE NOT EDITABLE, and that is deliberate rather
     than forgotten. The same paragraph is editable in the list below, and one
     sentence carrying two pencils on one screen opens two editors over the
     same words. Where an admin edits an event's description is the list, in
     both senses. */
  function dayPanel() {
    if (!selected) return '';
    var list = eventsByDay()[selected] || [];
    if (!list.length) return '';

    var html = '<div class="hc-cal__panel">';
    html += '<div class="hc-cal__panel-head">' +
      '<p class="hc-eyebrow">' + c.esc(c.formatDate(selected)) + '</p>' +
      '<button type="button" class="hc-cal__panel-close" data-action="cal-day-close" ' +
        'aria-label="Close ' + c.esc(c.formatDate(selected)) + '">' +
        c.icon('close', 'hc-cal__panel-close-icon') +
      '</button>' +
    '</div>';

    list.forEach(function (evt) {
      html += '<div class="hc-cal__panel-event">' +
        '<p class="hc-row__title">' + c.esc(evt.title) + '</p>' +
        (metaLine(evt) ? '<p class="hc-caption">' + c.esc(metaLine(evt)) + '</p>' : '') +
        (evt.blurb ? '<p class="hc-body-serif hc-event__blurb">' + c.esc(evt.blurb) + '</p>' : '') +
        '<div class="hc-event__action">' + c.addToCalendar(evt.id) + '</div>' +
      '</div>';
    });

    return html + '</div>';
  }

  /* ------------------------------------------------------------- the list */

  /* "12:30 PM · The Loft, upstairs", or whichever half exists.

     Connect joined these with a middot unconditionally, which printed a
     leading dot on an event with no location. Both halves are optional
     columns in the table, so both have to be allowed to be missing. */
  function metaLine(evt) {
    return [evt.time, evt.location].filter(Boolean).join(' · ');
  }

  function isAdmin() {
    return !!(HC.admin && HC.admin.isAdmin());
  }

  /* The two controls in the corner of an event, for an admin.

     They are in the row's top right, together, because they are the same kind
     of thing: what this row is, and whether it should be here at all. The x is
     the same x that takes a picture off an announcement in the Admin form, so
     "remove this" is one gesture wherever somebody meets it in this app. */
  function adminControls(evt) {
    return '' +
      '<div class="hc-event__admin">' +
        '<button type="button" class="hc-event__admin-btn" data-action="cal-event-edit" ' +
          'data-id="' + c.esc(evt.id) + '" ' +
          'aria-label="Edit ' + c.esc(evt.title) + '">' +
          c.icon('pencil', 'hc-event__admin-icon') +
        '</button>' +
        '<button type="button" class="hc-event__admin-btn hc-event__admin-btn--x" ' +
          'data-action="cal-event-delete" data-id="' + c.esc(evt.id) + '" ' +
          (busy === 'delete:' + evt.id ? 'disabled aria-busy="true" ' : '') +
          'aria-label="Delete ' + c.esc(evt.title) + '">' +
          c.icon('close', 'hc-event__admin-icon') +
        '</button>' +
      '</div>';
  }

  function eventRow(evt) {
    var meta = metaLine(evt);
    return '' +
      '<div class="hc-event' + (isAdmin() ? ' hc-event--managed' : '') + '">' +
        (isAdmin() ? adminControls(evt) : '') +
        '<p class="hc-eyebrow">' + c.esc(c.formatDate(evt.date)) + '</p>' +
        '<p class="hc-row__title">' + c.esc(evt.title) + '</p>' +
        (meta ? '<p class="hc-caption">' + c.esc(meta) + '</p>' : '') +
        /* The paragraph, not the date, the time, the place or the title. An
           event's when and where are what the Add to calendar button writes
           into somebody's phone, and a description that has drifted is a much
           smaller problem than a calendar entry that has. The other four are
           edited in the form above, where the whole event is in view. */
        HC.edit.wrap(
          evt.blurb ? '<p class="hc-body-serif hc-event__blurb">' + c.esc(evt.blurb) + '</p>' : '',
          { table: 'events', id: evt.id, column: 'description',
            target: evt, field: 'blurb',
            value: evt.blurb, label: evt.title + ', the description', rows: 4 }
        ) +
        '<div class="hc-event__action">' +
          c.addToCalendar(evt.id) +
        '</div>' +
      '</div>';
  }

  /* --------------------------------------------------------- the admin form */

  function blankDraft() {
    return { id: null, title: '', date: '', time: '', timeLabel: '',
             location: '', blurb: '' };
  }

  /* A draft built from the row as the table holds it, not as the app draws it.

     THIS IS WHY EDITING FETCHES. js/content.js maps time_label and a formatted
     clock time into one field called `time`, because that is all a screen ever
     needs to print. Editing needs them apart: writing the app's copy back
     would turn "All three services" into a time nobody can parse, or a real
     6:00 PM into a label that stops moving when the date does. So the edit
     button asks Supabase for the row and this builds the draft from it. */
  function draftFromRow(row) {
    var when = row.starts_at ? new Date(row.starts_at) : null;
    return {
      id: row.id,
      title: row.title || '',
      date: when ? isoDate(when.getFullYear(), when.getMonth(), when.getDate()) : '',
      // The 24 hour value <input type="time"> wants, from the same Date the
      // app formats for the screen, so both are in the phone's zone.
      time: when ? c.pad2(when.getHours()) + ':' + c.pad2(when.getMinutes()) : '',
      timeLabel: row.time_label || '',
      location: row.location || '',
      blurb: row.description || ''
    };
  }

  function field(opts) {
    var value = opts.value == null ? '' : String(opts.value);
    return '' +
      '<label class="hc-field">' +
        '<span class="hc-field__label">' + c.esc(opts.label) + '</span>' +
        '<input class="hc-input" type="' + c.esc(opts.type || 'text') + '" ' +
          'data-cal-field="' + c.esc(opts.name) + '" autocomplete="off" ' +
          (opts.placeholder ? 'placeholder="' + c.esc(opts.placeholder) + '" ' : '') +
          'value="' + c.esc(value) + '">' +
        (opts.help ? '<span class="hc-caption hc-field__help">' + c.esc(opts.help) + '</span>' : '') +
      '</label>';
  }

  /* Six fields and no more. An event also has a signup link, a capacity and a
     category, and none of them is here: they are filled in by /new-event where
     there is room to think about them, and migration 0042 leaves all three
     alone on an edit, so a correction typed on a phone cannot blank the
     registration link on a serve day. */
  function eventForm() {
    var d = draft;
    var html = '<form class="hc-form hc-cal__form" novalidate>';

    html += '<p class="hc-eyebrow hc-eyebrow--legible">' +
      (d.id ? 'Editing an event' : 'A new event') + '</p>';

    html += field({ name: 'title', label: 'What it is called', value: d.title,
      placeholder: 'City Serve Day' });

    html += field({ name: 'date', label: 'Date', value: d.date, type: 'date' });

    html += field({ name: 'time', label: 'Time', value: d.time, type: 'time',
      help: 'Leave it empty if the event has no clock time.' });

    html += field({ name: 'timeLabel', label: 'Or what to call the time',
      value: d.timeLabel, placeholder: 'All three services',
      help: 'Shown instead of the clock time when there is one.' });

    html += field({ name: 'location', label: 'Where', value: d.location,
      placeholder: '216 Giuffrias Ave' });

    html += '<label class="hc-field">' +
      '<span class="hc-field__label">What it is</span>' +
      '<textarea class="hc-input hc-textarea" rows="4" data-cal-field="blurb" ' +
        'placeholder="Two or three warm sentences.">' + c.esc(d.blurb) + '</textarea>' +
    '</label>';

    html += '<div class="hc-cal__form-actions">' +
      c.button(d.id ? 'Save the changes' : 'Add it to the calendar',
        { action: 'cal-event-save', busy: busy === 'save' }) +
      c.button('Cancel', { action: 'cal-event-cancel', variant: 'tertiary' }) +
    '</div>';

    return html + '</form>';
  }

  /* ------------------------------------------------------------- the screen */

  function render() {
    var html = '<div class="hc-screen hc-cal-screen">';

    html += c.sectionHeader('Every date in one place', 'Cal',
      { flush: true, tag: 'h1', eyebrowSlot: 'cal.eyebrow' });

    html += calendarBlock();
    html += dayPanel();

    html += c.sectionHeader('On the calendar', 'Upcoming',
      { eyebrowSlot: 'cal.events-eyebrow' });

    if (isAdmin() && !draft) {
      html += '<div class="hc-cal__add">' +
        c.button('Add an event', { action: 'cal-event-new', icon: 'plus',
          variant: 'secondary', small: true }) +
      '</div>';
    }

    if (draft) html += eventForm();

    var list = upcoming();
    if (list.length) {
      html += '<div class="hc-event-list">';
      list.forEach(function (e) { html += eventRow(e); });
      html += '</div>';
    } else {
      /* Unlike every list on Connect, this section does not drop when it is
         empty. It is what the screen is for, and a Cal tab that draws a month
         and then stops says less than one that says there is nothing on it
         yet. */
      var empty = HC.data.copy('cal.events-empty', NOTHING_YET);
      html += HC.edit.wrap(
        empty ? c.emptyState(empty) : '',
        { slot: 'cal.events-empty', value: empty,
          label: 'what the calendar says when nothing is coming up' }
      );
    }

    html += '</div>';
    return c.el(html);
  }

  /* ------------------------------------------------------------- the hooks
     Everything js/app.js reaches for. The handlers there change one of these
     and repaint; nothing in this file listens for a tap itself, which is the
     same split every other screen keeps.
     ---------------------------------------------------------------------- */

  function step(kind, delta) {
    var v = viewMonth();
    var d = new Date(v.year, v.month, 1);
    if (kind === 'year') d.setFullYear(d.getFullYear() + delta);
    else d.setMonth(d.getMonth() + delta);
    view = { year: d.getFullYear(), month: d.getMonth() };
    // The open day is somewhere else now, and a panel describing a day that
    // is not in the grid above it is a panel nobody can close by tapping the
    // day again.
    selected = '';
  }

  function today() {
    var d = new Date();
    view = { year: d.getFullYear(), month: d.getMonth() };
    selected = '';
  }

  // Tapping the open day closes it, which is what aria-pressed on the button
  // says it will do.
  function selectDay(iso) {
    selected = (selected === iso) ? '' : iso;
  }

  function closeDay() {
    selected = '';
  }

  /* Put the grid on the month a date is in. Called when an event is opened
     for editing and again when one is saved, so the month on screen is the
     month the thing you just wrote is in rather than wherever you happened to
     have scrolled to. */
  function showMonth(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return;
    var parts = String(iso).split('-');
    view = { year: +parts[0], month: (+parts[1]) - 1 };
    selected = '';
  }

  function startDraft(row) {
    draft = row ? draftFromRow(row) : blankDraft();
    if (draft.date) showMonth(draft.date);
  }

  function setField(name, value) {
    if (draft && name in draft) draft[name] = value;
  }

  /* What the Save button hands migration 0042.

     starts_at is built in the phone's own zone and sent as UTC, which is the
     same conversion js/content.js undoes on the way back in. The nine in the
     morning fallback is eventStart's, on purpose: an event with no clock time
     still has to sort into the right day, and the two guesses agreeing is what
     stops "All three services" landing on the calendar at midnight. */
  function startsAtIso(d) {
    var parts = String(d.date).split('-');
    var hour = 9;
    var min = 0;
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(d.time || '').trim());
    if (m) { hour = parseInt(m[1], 10); min = parseInt(m[2], 10); }
    return new Date(+parts[0], (+parts[1]) - 1, +parts[2], hour, min, 0, 0).toISOString();
  }

  HC.screens = HC.screens || {};
  HC.screens.cal = render;
  HC.screens.calHelpers = {
    eventStart: eventStart,
    monthMatrix: monthMatrix,
    eventsByDay: eventsByDay,
    upcoming: upcoming,
    metaLine: metaLine,
    startsAtIso: startsAtIso,
    isoDate: isoDate,
    todayIso: todayIso,

    step: step,
    today: today,
    showMonth: showMonth,
    selectDay: selectDay,
    closeDay: closeDay,
    selectedDay: function () { return selected; },

    startDraft: startDraft,
    clearDraft: function () { draft = null; },
    getDraft: function () { return draft; },
    setField: setField,
    setBusy: function (token) { busy = token || ''; }
  };

})(window.HC = window.HC || {});
