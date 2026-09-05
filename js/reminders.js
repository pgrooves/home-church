/* ==========================================================================
   Home Church, event reminders

   "Get notified", the button beside Add to calendar under every event on the
   Cal tab, and everything behind it: the sheet that asks when, the record this
   phone keeps, and the housekeeping that stops a reminder outliving the thing
   it is about.

   WHY IT EXISTS. Add to calendar is a good answer to "I want to remember
   this" and it is not the only one. It hands the event to whichever calendar
   somebody keeps, which is the right home for it and is also a place a person
   has to go and look. A reminder is the opposite bargain: nothing to open, one
   tap on the shoulder at a time they chose, and then it is gone. Most people
   want one or the other for any given event, and which one is not something
   the app can guess, so both are offered and neither is default.

   THE REMINDER NEVER LEAVES THE PHONE. It is a local notification, held by
   iOS, delivered whether or not the app is running and whether or not there
   is a network. The church is not told that somebody set it, because the
   church has no use for that and every reason not to hold it: a table of who
   wants reminding about which event is a membership list of everybody's
   interests, built from taps nobody thought were being recorded. The long
   note above canRemind() in js/native.js has the rest of that reasoning,
   including why a browser gets no button at all rather than a button that
   quietly does nothing.

   THE ONE PIECE OF STATE. `pick` is the sheet on screen: which event, and the
   day and time in its two boxes. It lives here rather than in the DOM for the
   same reason the announcement draft does — a content refresh landing while
   somebody is choosing must not take the choice with it — and for one more
   that is particular to this sheet: the preset pills write into the same two
   boxes, so there has to be somewhere for "the day before" to mean something
   before anybody presses Remind me.

   WHAT IS STORED, per event, under `hc:reminders`:

     { at: <epoch ms>, id: <notification id>, offset: <ms before the event> }

   `at` is what was scheduled. `offset` is why. Keeping both is what lets
   sweep() do the one genuinely fiddly thing in this file: when the church
   moves an event, a reminder set for the day before follows it, rather than
   going off on the day the event used to be on. See sweep().
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var MINUTE = 60 * 1000;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;

  /* How far ahead a time has to be before it is worth offering. A preset that
     resolves to ninety seconds from now is a preset that will have expired by
     the time somebody has read the sheet. */
  var SOON = 5 * MINUTE;

  // The sheet on screen, or null. { eventId, date: 'YYYY-MM-DD', time: 'HH:MM' }
  var pick = null;

  /* ---------------------------------------------------------- the plumbing */

  function cal() {
    return (HC.screens && HC.screens.calHelpers) || null;
  }

  function eventOf(eventId) {
    return (HC.data.events || []).filter(function (e) {
      return e && e.id === eventId;
    })[0] || null;
  }

  function startOf(evt) {
    var helpers = cal();
    return helpers ? helpers.eventStart(evt) : new Date(evt.date);
  }

  /* A stable notification id for an event, because iOS wants a number and the
     events table hands out uuids.

     WHY THE HASH RATHER THAN A COUNTER. The id has to survive the app being
     closed, the phone being restarted and the record being written and read
     back, and it has to be the same number next time so that changing a
     reminder replaces the one already queued instead of adding a second. A
     counter would need its own stored high water mark and would drift the
     moment two devices ever shared a record. A hash of the id needs nothing:
     the same event is the same number forever, on any phone.

     djb2, masked into a positive 32 bit integer, because iOS rejects anything
     larger and Android has historically rejected negatives. A collision would
     mean two events sharing one reminder, which needs two uuids to agree in
     31 bits, and the alternative costs more than the risk. */
  function notificationId(eventId) {
    var hash = 5381;
    var text = String(eventId || '');
    for (var i = 0; i < text.length; i++) {
      hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
    }
    // Never zero: some plugin versions treat 0 as "no id given".
    return (hash & 0x7fffffff) || 1;
  }

  /* --------------------------------------------------------- the two boxes */

  function isoDay(d) {
    return d.getFullYear() + '-' + c.pad2(d.getMonth() + 1) + '-' + c.pad2(d.getDate());
  }

  function clockValue(d) {
    return c.pad2(d.getHours()) + ':' + c.pad2(d.getMinutes());
  }

  // The two <input> values back into a Date, in the phone's own zone, or null
  // if either box is empty or nonsense. A reminder is a wall clock promise:
  // nothing here converts anything.
  function atFrom(date, time) {
    var day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
    var clock = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
    if (!day || !clock) return null;

    var d = new Date(+day[1], (+day[2]) - 1, +day[3],
                     parseInt(clock[1], 10), parseInt(clock[2], 10), 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  /* ------------------------------------------------------------ the presets

     Three, and they are the three answers people actually give. The day
     before is first and is the default, because a church event is something
     you have to arrange your evening around rather than something you turn up
     to on the way past.

     Each one is a real time or it is not offered: an event tomorrow morning
     has no "the day before" left, and a pill that sets a reminder for
     yesterday is worse than a pill that is not there. offerings() drops them
     rather than disabling them, because a greyed pill invites a tap that
     explains nothing.

     A REMINDER AFTER THE THING IT REMINDS YOU OF IS NOT A REMINDER, which is
     the second half of that filter and was missing at first. "That morning" is
     eight o'clock on the event's own day, and an event at half past six in the
     morning is earlier than that: the pill sat there offering to tap somebody
     on the shoulder ninety minutes after the doors opened. Being in the future
     is not enough. It has to be in the future AND at or before the event, and
     tests/reminders.test.js only caught it because it happened to run before
     eight in the morning. */

  var PRESETS = [
    { id: 'day-before', label: 'The day before',
      at: function (start) { return new Date(start.getTime() - DAY); } },
    { id: 'morning-of', label: 'That morning',
      at: function (start) {
        var d = new Date(start.getTime());
        d.setHours(8, 0, 0, 0);
        return d;
      } },
    { id: 'hour-before', label: 'An hour before',
      at: function (start) { return new Date(start.getTime() - HOUR); } }
  ];

  function offerings(evt) {
    var start = startOf(evt);
    var floor = Date.now() + SOON;
    return PRESETS.map(function (preset) {
      return { id: preset.id, label: preset.label, when: preset.at(start) };
    }).filter(function (option) {
      var when = option.when.getTime();
      return when > floor && when <= start.getTime();
    });
  }

  /* Where the sheet opens. The day before, which is what the button promises,
     unless that has already gone — which is true of every event inside the
     next twenty four hours, and those are exactly the events somebody is most
     likely to want a reminder about. So it walks down the same three offers a
     person would, and lands on ten minutes from now rather than on a time it
     would then refuse to accept. */
  function defaultAt(evt) {
    var options = offerings(evt);
    if (options.length) return options[0].when;

    var soon = new Date(Date.now() + 10 * MINUTE);
    soon.setSeconds(0, 0);
    return soon;
  }

  /* ------------------------------------------------------------ the record */

  /* What this phone has set for an event, or null. A reminder whose time has
     passed answers null: it has already gone off, and the button under the
     event is an offer again rather than a receipt for something that has
     happened. sweep() is what actually clears the record; this is what keeps
     the screen honest in between. */
  function get(eventId) {
    var record = HC.store.getReminder(eventId);
    if (!record || !record.at || record.at <= Date.now()) return null;
    return record;
  }

  // "Reminding you Sep 11, 6:30 PM", for the button under the event.
  function shortLabel(eventId) {
    var record = get(eventId);
    if (!record) return '';
    var at = new Date(record.at);
    return 'Reminding you ' + c.formatDateShort(isoDay(at)) + ', ' + c.formatClock(at);
  }

  // "Friday, September 11 at 6:30 PM", for the sheet and the toast, where
  // there is room for the day name and the year.
  function longLabel(at) {
    return c.dayName(at) + ', ' + c.formatDate(isoDay(at)) +
      ' at ' + c.formatClock(at);
  }

  /* --------------------------------------------------------------- the sheet

     The same panel as the scripture and link sheets in js/editor.js, because
     it is the same kind of moment: one question, asked over whatever screen
     you were on, answered or dismissed without going anywhere. */

  function presetPills(evt) {
    var options = offerings(evt);
    if (!options.length) return '';

    var current = atFrom(pick.date, pick.time);
    var html = '<p class="hc-eyebrow hc-eyebrow--legible hc-filters__label">When</p>';
    html += '<div class="hc-pills">';

    options.forEach(function (option) {
      var on = !!current && current.getTime() === option.when.getTime();
      html += '<button type="button" class="hc-pill" data-action="remind-preset" ' +
        'data-id="' + c.esc(option.id) + '" ' +
        'aria-pressed="' + (on ? 'true' : 'false') + '">' +
        c.esc(option.label) + '</button>';
    });

    return html + '</div>';
  }

  function box(name, label, type, value) {
    return '' +
      '<label class="hc-field">' +
        '<span class="hc-field__label">' + c.esc(label) + '</span>' +
        '<input class="hc-input" type="' + type + '" data-remind="' + name + '" ' +
          'value="' + c.esc(value) + '">' +
      '</label>';
  }

  function sheet(evt) {
    var existing = get(evt.id);
    var meta = cal() ? cal().metaLine(evt) : '';

    var html = '' +
      '<div class="hc-sheet" data-sheet="remind" role="dialog" aria-modal="true" ' +
          'aria-label="Get notified about ' + c.esc(evt.title) + '">' +
        '<button type="button" class="hc-sheet__scrim" data-action="remind-close" ' +
          'tabindex="-1" aria-hidden="true"></button>' +
        '<div class="hc-sheet__panel">' +
          '<div class="hc-sheet__head">' +
            '<p class="hc-eyebrow">' +
              (existing ? 'Your reminder' : 'Get notified') + '</p>' +
            '<button type="button" class="hc-sheet__close" data-action="remind-close" ' +
              'aria-label="Close">' + c.icon('close') + '</button>' +
          '</div>' +

          /* The event, said back. Somebody arrives here from a list of six
             things on one screen, and a sheet that only asks "when?" is a
             sheet you have to close to find out what you are answering. */
          '<p class="hc-sheet__preview">' + c.esc(evt.title) + '</p>' +
          '<p class="hc-caption">' + c.esc(c.formatDate(evt.date)) +
            (meta ? ' · ' + c.esc(meta) : '') + '</p>';

    html += '<div class="hc-remind__presets">' + presetPills(evt) + '</div>';

    html += '<div class="hc-sheet__verses">' +
      box('date', 'Day', 'date', pick.date) +
      box('time', 'Time', 'time', pick.time) +
    '</div>';

    html += '<div class="hc-sheet__foot">' +
      c.button(existing ? 'Save the change' : 'Remind me',
        { action: 'remind-save', icon: 'bell' }) +
    '</div>';

    if (existing) {
      html += '<div class="hc-remind__off">' +
        c.button('Turn it off', { action: 'remind-clear', variant: 'tertiary',
          id: evt.id }) +
      '</div>';
    }

    /* Says exactly what it does and where it lives, because a notification
       arriving in three weeks from an app somebody has not opened since is
       the moment they wonder what else it knows. */
    html += '<p class="hc-caption hc-sheet__note">The reminder is set on this ' +
      'phone and stays on it. The church is not told, and nothing is sent ' +
      'anywhere.</p>';

    return html + '</div></div>';
  }

  /* ------------------------------------------------------------- the hooks */

  function draw() {
    close();
    var evt = pick && eventOf(pick.eventId);
    if (!evt) { pick = null; return; }
    document.getElementById('app').appendChild(c.el(sheet(evt)));
  }

  function open(eventId) {
    var evt = eventOf(eventId);
    if (!evt) return;

    if (!HC.native.canRemind()) {
      /* Should be unreachable: the button is not drawn where this is false.
         Kept because "unreachable" and "not reachable today" are different
         claims, and the second one is the true one. */
      c.toast('Reminders need the Home Church app on your phone.');
      return;
    }

    var existing = get(eventId);
    var at = existing ? new Date(existing.at) : defaultAt(evt);

    pick = { eventId: eventId, date: isoDay(at), time: clockValue(at) };
    draw();
  }

  function close() {
    var el = document.querySelector('[data-sheet="remind"]');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function dismiss() {
    close();
    pick = null;
  }

  function isOpen() {
    return !!document.querySelector('[data-sheet="remind"]');
  }

  /* Every keystroke in the two boxes. Draws nothing, for the reason on
     linkPick in js/editor.js: a repaint mid-choice takes the picker down with
     it, and on iOS a <input type="date"> picker is a wheel over the screen. */
  function setField(name, value) {
    if (!pick) return;
    if (name === 'date' || name === 'time') pick[name] = String(value == null ? '' : value);
    paintPills();
  }

  /* A preset writes into the same two boxes rather than replacing them, so
     "the day before" and "6:30 on the Thursday" are the same answer given two
     ways and either can be adjusted after the other.

     The boxes are written in place rather than through a redraw, because a
     redraw of the panel replays its slide up animation for a tap that changed
     two fields inside it. */
  function preset(id) {
    if (!pick) return;
    var evt = eventOf(pick.eventId);
    if (!evt) return;

    var option = offerings(evt).filter(function (o) { return o.id === id; })[0];
    if (!option) return;

    pick.date = isoDay(option.when);
    pick.time = clockValue(option.when);

    var dateBox = document.querySelector('[data-remind="date"]');
    var timeBox = document.querySelector('[data-remind="time"]');
    if (dateBox) dateBox.value = pick.date;
    if (timeBox) timeBox.value = pick.time;

    paintPills();
    HC.native.tap('Light');
  }

  /* Which pill reads as chosen. Set from whatever is in the two boxes rather
     than from which pill was last pressed, so typing a time that happens to be
     the day before lights the day before, and nudging one field away from a
     preset puts it out. */
  function paintPills() {
    if (!pick) return;
    var evt = eventOf(pick.eventId);
    if (!evt) return;

    var current = atFrom(pick.date, pick.time);
    var options = offerings(evt);

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-action="remind-preset"]'),
      function (el) {
        var option = options.filter(function (o) {
          return o.id === el.getAttribute('data-id');
        })[0];
        var on = !!(option && current && current.getTime() === option.when.getTime());
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    );
  }

  /* What the notification says when it goes off, which may be weeks after
     anybody last thought about it. The title is the event and the body is when
     and where, in full: "tomorrow" would be written now and read then. */
  function bodyFor(evt) {
    var start = startOf(evt);
    var when = c.dayName(start) + ', ' + c.formatDate(evt.date);
    var meta = cal() ? cal().metaLine(evt) : '';
    return meta ? when + ' · ' + meta : when;
  }

  function busy(on) {
    var btn = document.querySelector('[data-action="remind-save"]');
    if (!btn) return;
    btn.disabled = !!on;
    if (on) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
  }

  /* Sets it, or says why not and leaves the sheet open with the answer still
     in it. Nothing is written to storage until iOS has actually taken the
     notification: a record with no notification behind it is a button that
     says "Reminding you Friday" about a Friday nobody will be reminded of. */
  function save() {
    if (!pick) return;
    var evt = eventOf(pick.eventId);
    if (!evt) { dismiss(); return; }

    var at = atFrom(pick.date, pick.time);
    if (!at) {
      c.toast('Pick a day and a time.');
      return;
    }
    if (at.getTime() <= Date.now()) {
      c.toast('That has already gone by. Pick a time still to come.');
      return;
    }

    busy(true);

    var id = notificationId(evt.id);
    HC.native.scheduleReminder({
      id: id,
      eventId: evt.id,
      title: evt.title,
      body: bodyFor(evt),
      at: at
    }).then(function (ok) {
      if (!ok) {
        busy(false);
        /* The one failure worth naming, because it is the one somebody can
           do something about. A phone that has said no to notifications says
           no to this too, and iOS will not ask twice: the only way back is
           Settings. */
        c.toast('Your phone would not take that one. Check that notifications ' +
                'are on for Home Church in Settings.');
        return;
      }

      HC.store.setReminder(evt.id, {
        at: at.getTime(),
        id: id,
        // Why, not just when. See sweep().
        offset: startOf(evt).getTime() - at.getTime()
      });

      dismiss();
      HC.native.tap('Light');
      c.toast('Set. ' + longLabel(at) + '.');
      repaint();
    });
  }

  /* Turning one off. The notification goes first and the record second, in
     that order and not the other: a record removed before a cancel that fails
     is a notification nobody can reach any more. */
  function remove(eventId) {
    var record = HC.store.getReminder(eventId);
    if (!record) { dismiss(); return; }

    HC.native.cancelReminder(record.id || notificationId(eventId)).then(function () {
      HC.store.clearReminder(eventId);
      dismiss();
      c.toast('Reminder off.');
      repaint();
    });
  }

  function repaint() {
    var route = HC.router && HC.router.current();
    if (!route || route.name !== 'cal') return;
    HC.router.go({ name: 'cal', restore: true }, { force: true });
  }

  /* ------------------------------------------------------------ housekeeping

     Three things go wrong to a reminder without anybody touching it, and all
     three are somebody else's edit rather than a bug:

     THE EVENT IS TAKEN OFF THE CALENDAR. An admin deletes it, and iOS is
     still holding a notification about a thing that is not happening. Cancel
     and forget.

     THE EVENT MOVES. An admin corrects a date, which migration 0042 exists to
     let them do from a phone on a Sunday, and every reminder anybody set is
     now pointing at the day the event used to be on. This is what the stored
     `offset` is for: the person asked to be told a day before, not at 6pm on
     the eleventh, so the reminder is rescheduled a day before wherever the
     event went. If that has already passed, it goes rather than firing late.

     THE REMINDER HAS BEEN AND GONE. Nothing is wrong, but the record is spent
     and the button under the event should be an offer again.

     There is a fourth that is nobody's edit: iOS forgets. A restore from
     backup brings this app's localStorage back and not its scheduled
     notifications, so anything this phone remembers wanting that the system is
     not holding is scheduled again. That is what the getPending() comparison
     at the end is for, and it is why sweep runs at launch rather than only
     after a content refresh.
     ------------------------------------------------------------------- */

  function sweep() {
    if (!HC.native.canRemind()) return Promise.resolve();

    var records = HC.store.getReminders();
    var ids = Object.keys(records);
    if (!ids.length) return Promise.resolve();

    var wanted = {};   // notification id -> the record that wants it

    ids.forEach(function (eventId) {
      var record = records[eventId] || {};
      var evt = eventOf(eventId);
      var id = record.id || notificationId(eventId);

      /* HC.data.events is empty until the first content load lands, and an
         empty list is not the same claim as "this event is gone". Sweeping on
         it would cancel every reminder on the phone every launch, so a sweep
         with nothing to compare against does the honest thing and waits for
         the next one. */
      if (!(HC.data.events || []).length) return;

      if (!evt) {
        HC.native.cancelReminder(id);
        HC.store.clearReminder(eventId);
        return;
      }

      // Where it should be now, which is only different if the event moved.
      var offset = typeof record.offset === 'number' ? record.offset : null;
      var due = offset === null ? record.at : startOf(evt).getTime() - offset;

      if (!due || due <= Date.now()) {
        HC.native.cancelReminder(id);
        HC.store.clearReminder(eventId);
        return;
      }

      if (due !== record.at) {
        HC.store.setReminder(eventId, { at: due, id: id, offset: offset });
        HC.native.scheduleReminder({
          id: id, eventId: eventId, title: evt.title,
          body: bodyFor(evt), at: new Date(due)
        });
        return;
      }

      wanted[id] = { eventId: eventId, at: due, evt: evt };
    });

    // Everything the phone still wants and the system is no longer holding.
    return HC.native.pendingReminderIds().then(function (pending) {
      var held = {};
      pending.forEach(function (id) { held[id] = true; });

      Object.keys(wanted).forEach(function (id) {
        if (held[id]) return;
        var want = wanted[id];
        HC.native.scheduleReminder({
          id: parseInt(id, 10), eventId: want.eventId, title: want.evt.title,
          body: bodyFor(want.evt), at: new Date(want.at)
        });
      });
    });
  }

  /* ---------------------------------------------------------------- the boot

     Called once from js/app.js. Everything in here is a no-op in a browser,
     where canRemind() is false and there is no plugin to listen to. */

  function boot() {
    /* Tapping the notification opens the Cal tab with the event's own day
       already open under the grid, which is the screen the notification was
       about. Anything else means arriving in an app that has forgotten what
       it just said to you. */
    HC.native.onReminderTapped(function (eventId) {
      var evt = eventOf(eventId);
      HC.router.go({ name: 'cal' });
      if (evt && cal()) {
        cal().showMonth(evt.date);
        cal().selectDay(evt.date);
        HC.router.go({ name: 'cal', restore: false }, { force: true });
      }
    });

    // Leaving takes the sheet with it, the same rule the overflow sheet keeps
    // in js/app.js: a modal that outlives the screen under it is a modal
    // nobody asked for.
    HC.store.on('view', function () {
      if (isOpen()) dismiss();
    });

    // And so does Escape, for the keyboard this app mostly does not have and
    // for the reviewer who will try it anyway.
    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && isOpen()) dismiss();
    });

    /* Erasing everything erases these too, and the notifications they stand
       for. The record is already gone by the time this runs, which is why it
       cannot name them and cancels whatever the system is holding instead.
       See eraseEverything() in js/store.js. */
    HC.store.on('erased', function () {
      HC.native.cancelAllReminders();
    });

    // Every content refresh is a chance the church moved or removed something
    // somebody is waiting on. See sweep().
    HC.store.on('content', function () { sweep(); });

    sweep();
  }

  HC.reminders = {
    boot: boot,
    sweep: sweep,

    get: get,
    shortLabel: shortLabel,

    open: open,
    close: dismiss,
    isOpen: isOpen,
    setField: setField,
    preset: preset,
    save: save,
    remove: remove,

    // Pure, and exported, because these are the parts a test can hold still.
    notificationId: notificationId,
    defaultAt: defaultAt,
    offerings: offerings,
    atFrom: atFrom,
    longLabel: longLabel
  };

})(window.HC = window.HC || {});
