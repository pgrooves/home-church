/* ==========================================================================
   Home Church, telling everyone what was just approved

   An admin clears the newsletter queue in one short sitting. After each
   Approve, on an announcement or a date, this asks whether to tell the
   church, and everything they say yes to goes out as ONE notification:

     1st   "Notify everyone about this one, or add more?"
     2nd   "Add this to the notification with the first announcement and
            reset the 5 minute timer?"
     3rd+  "Add this to the batch notification for the other announcements
            and reset the 5 minute timer?"

     Yes   in it, and it sends 5 minutes after this tap
     More  in it, and the clock stops while you find the next one
     No    left out; anything already waiting keeps its clock

   The batch lives on the server (migration 0098), not on this phone, so it
   still sends if the phone is put down, and two admins approving at once add
   to the same one. A minute clock there sends it, 5 minutes after the last
   Yes, 30 after a More with nothing since, and never 9 pm to 8 am.

   WHILE ONE IS WAITING the Announcements screen shows it: a clock counting
   down to the push, "Schedule this instead" (or "this batch", for more than
   one thing) to pick a day and time for it, Send now, and Cancel push. A
   scheduled batch goes at the time picked, exactly; anything approved after
   that joins it without moving it, so the prompt asks only Yes or No.

   IN DEMO MODE nothing reaches the server, so the batch is kept here, on the
   page, by the same rules, and "sending" it is a toast saying it would have.
   ========================================================================== */

(function (HC) {
  'use strict';

  var FIVE_MIN = 5 * 60 * 1000;
  var HOLD_MIN = 30 * 60 * 1000;
  var RING = 2 * Math.PI * 28;   // the clock's circle, r = 28 in a 64 box

  var state = { open: false, items: [], held: false, scheduled: false, due_at: null };
  var skew = 0;          // server clock minus this phone's, from the last read
  var fetchedAt = 0;
  var inflight = false;
  var asking = null;     // { kind, id, title, before: [items] }
  var picking = null;    // { date, time } while the schedule sheet is open
  var busy = '';
  var timer = null;
  var ticker = null;

  function c() { return HC.components; }

  function demoOn() { return !!(HC.demo && HC.demo.on); }

  function emit() {
    if (HC.store && HC.store.emit) HC.store.emit('admin', null);
  }

  function now() { return Date.now() + skew; }

  /* --------------------------------------------------------- church clock */

  function churchParts(d) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit',
      second: '2-digit', hourCycle: 'h23'
    }).formatToParts(d);
    var get = function (t) {
      var p = parts.filter(function (x) { return x.type === t; })[0];
      return p ? parseInt(p.value, 10) : 0;
    };
    return { h: get('hour') % 24, m: get('minute'), s: get('second') };
  }

  function isQuiet(d) {
    var h = churchParts(d).h;
    return h >= 21 || h < 8;
  }

  /* The same rule as hc_notify_batch_due() in 0098: anything due between
     9 pm and 8 am goes at 8 am, unless somebody scheduled it. The server's
     answer is the one that counts; this is for the demo and for the line
     under the question. */
  function dueAt(sendAt, lastActivity, scheduled) {
    if (scheduled && sendAt) return new Date(sendAt);
    var due = sendAt ? new Date(sendAt) : new Date(new Date(lastActivity).getTime() + HOLD_MIN);
    var p = churchParts(due);
    var minutes = 0;
    if (p.h >= 21) minutes = (24 - p.h + 8) * 60 - p.m;
    else if (p.h < 8) minutes = (8 - p.h) * 60 - p.m;
    if (!minutes) return due;
    return new Date(due.getTime() + minutes * 60000 - p.s * 1000);
  }

  function churchDay(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  }

  function clock(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit'
    }).format(new Date(iso));
  }

  /* "today at 3:00 PM", "tomorrow at 9:00 AM", "Sunday, November 8 at 9:00 AM". */
  function whenWords(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var today = churchDay(new Date(now()));
    var tomorrow = churchDay(new Date(now() + 24 * 3600 * 1000));
    var day = churchDay(d);
    var lead = day === today ? 'today'
      : day === tomorrow ? 'tomorrow'
      : new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric'
        }).format(d);
    return lead + ' at ' + clock(iso);
  }

  /* What the middle of the clock says: 4:32 inside the hour, 18h 59m inside
     two days, then 3 days. Short enough to sit inside the ring. */
  function leftWords(ms) {
    if (ms <= 0) return 'Sending';
    var s = Math.ceil(ms / 1000);
    if (s >= 48 * 3600) return Math.round(s / 86400) + ' days';
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h) return h + 'h ' + m + 'm';
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  /* ------------------------------------------------------------- words */

  function noun(kind, many) {
    if (kind === 'event') return many ? 'events' : 'event';
    return many ? 'announcements' : 'announcement';
  }

  /* What the prompt asks, from what was already waiting before this one. */
  function question(before, scheduledAt) {
    var others = (before || []);
    if (others.length && scheduledAt) {
      return 'Add this to the notification scheduled for ' + whenWords(scheduledAt) + '?';
    }
    if (!others.length) return 'Notify everyone about this one, or add more?';
    if (others.length === 1) {
      return 'Add this to the notification with the first ' + noun(others[0].kind) +
        ' and reset the 5 minute timer?';
    }
    var hasA = others.some(function (i) { return i.kind === 'announcement'; });
    var hasE = others.some(function (i) { return i.kind === 'event'; });
    var what = hasA && hasE ? 'announcements and events' : noun(hasE ? 'event' : 'announcement', true);
    return 'Add this to the batch notification for the other ' + what +
      ' and reset the 5 minute timer?';
  }

  /* An announcement and its own date are one thing to the people being told,
     and send-push counts them once; so does the strip. */
  function counted(items) {
    var announcements = (HC.admin && HC.admin.announcements) ? HC.admin.announcements() : [];
    var eventOf = {};
    announcements.forEach(function (a) { if (a.event_id) eventOf[a.id] = a.event_id; });
    var covered = {};
    items.forEach(function (i) {
      if (i.kind === 'announcement' && eventOf[i.id]) covered[eventOf[i.id]] = true;
    });
    var a = 0, e = 0;
    items.forEach(function (i) {
      if (i.kind === 'announcement') a++;
      else if (!covered[i.id]) e++;
    });
    return { announcements: a, events: e, total: a + e };
  }

  function countWords(items) {
    var n = counted(items);
    var parts = [];
    if (n.announcements) parts.push(n.announcements + ' ' + noun('announcement', n.announcements !== 1));
    if (n.events) parts.push(n.events + ' ' + (n.events === 1 ? 'date' : 'dates'));
    return parts.join(' and ') || 'Nothing';
  }

  /* ------------------------------------------------------------- state */

  function setState(next) {
    if (next && next.now) {
      var server = new Date(next.now).getTime();
      if (!isNaN(server)) skew = server - Date.now();
    }
    var clean = next && next.open
      ? { open: true, items: Array.isArray(next.items) ? next.items : [],
          held: !!next.held, scheduled: !!next.scheduled, due_at: next.due_at || null,
          send_at: next.send_at || null, last: next.last || null }
      : { open: false, items: [], held: false, scheduled: false, due_at: null };
    var changed = JSON.stringify(clean) !== JSON.stringify(state);
    state = clean;
    fetchedAt = Date.now();
    watch();
    if (changed) emit();
  }

  /* Look again just after it is due, so the strip comes down on its own,
     and keep the clock on screen moving every second until then. */
  function watch() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (ticker && !state.open) { clearInterval(ticker); ticker = null; }
    if (!state.open) return;
    if (!ticker) ticker = setInterval(tick, 1000);
    tick();
    if (!state.due_at) return;
    var wait = new Date(state.due_at).getTime() - now() + (demoOn() ? 500 : 65000);
    timer = setTimeout(function () {
      timer = null;
      if (demoOn()) return demoTick();
      refresh(true);
    }, Math.max(1000, Math.min(wait, 2147483000)));
  }

  /* Moves the clock in place, without redrawing the screen around it. */
  function tick() {
    var clocks = document.querySelectorAll('[data-batch-clock]');
    if (!clocks.length || !state.open) return;
    var left = state.due_at ? new Date(state.due_at).getTime() - now() : 0;
    var counting = !state.held && !state.scheduled && left <= FIVE_MIN + 5000;
    var frac = state.held ? 1 : counting ? Math.max(0, Math.min(1, left / FIVE_MIN)) : 1;
    var words = state.held ? 'Paused' : leftWords(left);
    Array.prototype.forEach.call(clocks, function (el) {
      var arc = el.querySelector('[data-batch-arc]');
      var txt = el.querySelector('[data-batch-left]');
      if (arc) arc.setAttribute('stroke-dashoffset', String(RING * (1 - frac)));
      if (txt && txt.textContent !== words) txt.textContent = words;
      el.setAttribute('data-mode', state.held ? 'held' : counting ? 'counting' : 'later');
    });
  }

  function refresh(force) {
    if (demoOn()) return Promise.resolve(state);
    if (!HC.admin || !HC.admin.isAdmin || !HC.admin.isAdmin()) return Promise.resolve(state);
    if (inflight) return inflight;
    if (!force && Date.now() - fetchedAt < 30000) return Promise.resolve(state);
    inflight = HC.auth.rpc('hc_admin_notify_batch', {})
      .then(function (s) { setState(s); return state; },
            function () { fetchedAt = Date.now(); return state; })
      .then(function (s) { inflight = false; return s; });
    return inflight;
  }

  /* ----------------------------------------------- the demo, on the page */

  function demoAdd(kind, id, hold) {
    var at = new Date();
    var s = state.open ? state : { open: true, items: [] };
    var items = s.items.slice();
    if (!items.some(function (i) { return i.kind === kind && i.id === id; })) {
      items.push({ kind: kind, id: id });
    }
    if (s.open && s.scheduled) {
      setState(Object.assign({}, s, { items: items, last: at.toISOString() }));
      return Promise.resolve(state);
    }
    var sendAt = hold ? null : new Date(at.getTime() + FIVE_MIN).toISOString();
    setState({ open: true, items: items, held: !!hold, scheduled: false, send_at: sendAt,
      last: at.toISOString(), due_at: dueAt(sendAt, at.toISOString()).toISOString() });
    return Promise.resolve(state);
  }

  function demoTick() {
    if (!state.open) return;
    if (new Date(state.due_at).getTime() > now()) return watch();
    var words = countWords(state.items);
    setState({ open: false });
    c().toast('Demo: everyone would be notified now about ' + words.toLowerCase() + '.');
  }

  /* ------------------------------------------------------------ the ask */

  /* Is this row somewhere people can see it? The same questions the server
     asks before it will add one. A row it would refuse is not asked about. */
  function visible(kind, row) {
    if (!row) return false;
    if (row.published === false || row.deleted_at) return false;
    if (kind !== 'announcement') return true;
    var today = churchDay(new Date());
    if (row.starts_on && row.starts_on > today) return false;
    if (row.ends_on && row.ends_on <= today) return false;
    return true;
  }

  /* Called straight after an approval has gone through. Asks the server what
     is waiting first, so the question is right when another admin has been
     approving too; if that read fails, the last known answer is used. */
  function ask(kind, row) {
    if (!row || !row.id) return;
    if (kind === 'announcement' && !visible(kind, row)) return;
    refresh(true).then(function () {
      var before = state.open ? state.items.filter(function (i) {
        return !(i.kind === kind && i.id === row.id);
      }) : [];
      asking = { kind: kind, id: row.id, title: row.title || '', before: before,
                 scheduledAt: state.open && state.scheduled ? state.due_at : null };
      draw();
    });
  }

  function sheet() {
    var esc = c().esc;
    var scheduled = !!(asking.before.length && asking.scheduledAt);
    var soon = new Date(now() + FIVE_MIN);
    var note = scheduled
      ? 'It stays scheduled for ' + whenWords(asking.scheduledAt) + '. No leaves this one out.'
      : isQuiet(soon)
        ? 'It’s after 9 pm, so a Yes waits and goes out at 8 am.'
        : 'Yes sends it 5 minutes after your last Yes. More holds it while you approve the next one. No leaves this one out.';

    return '' +
      '<div class="hc-sheet hc-batch-ask' + (demoOn() ? ' hc-batch-ask--demo' : '') +
          '" data-sheet="notify-batch" role="dialog" aria-modal="true" ' +
          'aria-label="Notify everyone?">' +
        '<button type="button" class="hc-sheet__scrim" data-action="notify-batch-no" ' +
          'tabindex="-1" aria-hidden="true"></button>' +
        '<div class="hc-sheet__panel">' +
          '<div class="hc-sheet__head">' +
            '<p class="hc-eyebrow">Approved</p>' +
          '</div>' +
          '<p class="hc-sheet__preview">' + esc(asking.title) + '</p>' +
          '<p class="hc-batch-ask__q">' + esc(question(asking.before, asking.scheduledAt)) + '</p>' +
          '<div class="hc-batch-ask__buttons">' +
            c().button('Yes', { action: 'notify-batch-yes', busy: busy === 'yes' }) +
            (scheduled ? '' :
              c().button('More', { action: 'notify-batch-more', variant: 'secondary', busy: busy === 'more' })) +
            c().button('No', { action: 'notify-batch-no', variant: 'tertiary' }) +
          '</div>' +
          '<p class="hc-caption hc-sheet__note">' + esc(note) + '</p>' +
        '</div>' +
      '</div>';
  }

  function close(name) {
    var el = document.querySelector('[data-sheet="' + (name || 'notify-batch') + '"]');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function draw() {
    close();
    if (!asking) return;
    var el = c().el(sheet());
    el.setAttribute('data-settled', busy ? 'true' : 'false');
    document.getElementById('app').appendChild(el);
  }

  function answer(which) {
    if (!asking || busy) return;
    var a = asking;

    if (which === 'no') {
      asking = null;
      close();
      c().toast(state.open
        ? 'Left out. The waiting notification goes out ' + whenWords(state.due_at) + '.'
        : 'Nobody was notified.');
      return;
    }

    var hold = which === 'more';
    busy = which;
    draw();

    var call = demoOn()
      ? demoAdd(a.kind, a.id, hold)
      : HC.auth.rpc('hc_admin_notify_batch_add', { p_kind: a.kind, p_id: a.id, p_hold: hold })
          .then(function (s) { setState(s); return state; });

    call.then(function () {
      busy = '';
      asking = null;
      close();
      c().toast(state.scheduled
        ? 'Added. It goes out ' + whenWords(state.due_at) + '.'
        : hold
          ? 'Held. Approve the next one, then tap Yes to start the 5 minutes.'
          : 'Goes out at ' + clock(state.due_at) + ' unless you add more.');
    }, function (err) {
      busy = '';
      asking = null;
      close();
      c().toast((err && err.message) || 'That did not go through. Nobody was notified.');
    });
  }

  /* ----------------------------------------------- the waiting strip */

  function clockFace() {
    return '<div class="hc-batch-clock" data-batch-clock role="timer" aria-hidden="true">' +
      '<svg viewBox="0 0 64 64" focusable="false">' +
        '<circle class="hc-batch-clock__track" cx="32" cy="32" r="28"></circle>' +
        '<circle class="hc-batch-clock__arc" cx="32" cy="32" r="28" data-batch-arc ' +
          'stroke-dasharray="' + RING.toFixed(2) + '" stroke-dashoffset="0"></circle>' +
      '</svg>' +
      '<span class="hc-batch-clock__left" data-batch-left></span>' +
    '</div>';
  }

  function strip() {
    if (!state.open || !state.items.length) return '';
    var esc = c().esc;
    var when = clock(state.due_at);
    var line;
    if (state.scheduled) {
      line = 'Scheduled for ' + whenWords(state.due_at) + '.';
    } else if (state.held) {
      line = 'Held while you add more. It goes out at ' + when +
        ' if nothing else is approved, or tap Yes on the next one.';
    } else if (state.due_at && isQuiet(new Date(new Date(state.due_at).getTime() - 60000))) {
      line = 'Waiting for the morning. It goes out at ' + when + '.';
    } else {
      line = 'Until it goes out at ' + when + ', 5 minutes after the last Yes.';
    }

    var many = counted(state.items).total > 1;
    var scheduleLabel = state.scheduled ? 'Change the time'
      : many ? 'Schedule this batch instead' : 'Schedule this instead';

    var html = '<div class="hc-admin__batch" role="status">' +
      '<p class="hc-eyebrow">Notification waiting</p>' +
      '<p class="hc-row__title">' + esc(countWords(state.items)) + '</p>' +
      '<div class="hc-admin__batch-when">' +
        clockFace() +
        '<p class="hc-caption">' + esc(line) + '</p>' +
      '</div>' +
      '<div class="hc-admin__batch-schedule">' +
        c().button(scheduleLabel, { action: 'notify-batch-schedule', variant: 'secondary',
          icon: 'calendar' }) +
      '</div>' +
      '<div class="hc-admin__item-actions">' +
        c().button('Send now', { action: 'notify-batch-send-now', variant: 'secondary',
          small: true, busy: busy === 'send' }) +
        c().button('Cancel push', { action: 'notify-batch-cancel', variant: 'tertiary',
          small: true, busy: busy === 'cancel' }) +
      '</div>' +
    '</div>';

    // Drawn, then set going: the clock's numbers arrive on the next frame.
    setTimeout(tick, 0);
    return html;
  }

  function sendNow() {
    if (!state.open || busy) return;
    if (!window.confirm('Send it to everybody now? This cannot be undone.')) return;
    busy = 'send';
    emit();
    var words = countWords(state.items);
    var call = demoOn()
      ? Promise.resolve({ open: false })
      : HC.auth.rpc('hc_admin_notify_batch_send_now', {});
    call.then(function (s) {
      busy = '';
      setState(s);
      emit();
      c().toast(demoOn()
        ? 'Demo: everyone would be notified now about ' + words.toLowerCase() + '.'
        : 'Sent. Everybody has been told.');
    }, function (err) {
      busy = '';
      refresh(true);
      emit();
      c().toast((err && err.message) || 'That did not go through. Try again in a moment.');
    });
  }

  function cancel() {
    if (!state.open || busy) return;
    if (!window.confirm('Cancel this push? Nobody is notified, and everything you approved stays up.')) return;
    busy = 'cancel';
    emit();
    var call = demoOn()
      ? Promise.resolve({ open: false })
      : HC.auth.rpc('hc_admin_notify_batch_cancel', {});
    call.then(function (s) {
      busy = '';
      setState(s);
      emit();
      c().toast('Push cancelled. Nobody was notified.');
    }, function (err) {
      busy = '';
      refresh(true);
      emit();
      c().toast((err && err.message) || 'That did not go through. Try again in a moment.');
    });
  }

  /* --------------------------------------------- schedule this instead */

  function isoLocal(d) {
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return {
      date: d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()),
      time: two(d.getHours()) + ':' + two(d.getMinutes())
    };
  }

  /* The two times most often wanted: tomorrow morning, and Sunday morning
     before people leave for church. In this phone's own time, which for the
     church's admins is the church's. */
  function presets() {
    var t = new Date(now());
    var tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 9, 0);
    var toSunday = (7 - t.getDay()) % 7 || 7;
    var sunday = new Date(t.getFullYear(), t.getMonth(), t.getDate() + toSunday, 8, 0);
    var list = [{ id: 'tomorrow', label: 'Tomorrow, 9 AM', when: tomorrow }];
    if (toSunday !== 1) list.push({ id: 'sunday', label: 'Sunday, 8 AM', when: sunday });
    var evening = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 18, 0);
    if (evening.getTime() - t.getTime() > 30 * 60000) {
      list.unshift({ id: 'evening', label: 'This evening, 6 PM', when: evening });
    }
    return list;
  }

  function scheduleSheet() {
    var esc = c().esc;
    var box = function (name, label, type, value) {
      return '<label class="hc-field">' +
        '<span class="hc-field__label">' + esc(label) + '</span>' +
        '<input class="hc-input" type="' + type + '" data-batch-sched="' + name + '" ' +
          'value="' + esc(value) + '">' +
      '</label>';
    };
    var pills = presets().map(function (p) {
      var on = isoLocal(p.when);
      var pressed = picking && picking.date === on.date && picking.time === on.time;
      return '<button type="button" class="hc-pill" data-action="notify-batch-preset" ' +
        'data-id="' + esc(p.id) + '" aria-pressed="' + (pressed ? 'true' : 'false') + '">' +
        esc(p.label) + '</button>';
    }).join('');
    var many = counted(state.items).total > 1;

    return '' +
      '<div class="hc-sheet hc-batch-ask' + (demoOn() ? ' hc-batch-ask--demo' : '') +
          '" data-sheet="notify-batch-schedule" role="dialog" aria-modal="true" ' +
          'aria-label="Schedule the notification">' +
        '<button type="button" class="hc-sheet__scrim" data-action="notify-batch-schedule-close" ' +
          'tabindex="-1" aria-hidden="true"></button>' +
        '<div class="hc-sheet__panel">' +
          '<div class="hc-sheet__head">' +
            '<p class="hc-eyebrow">' + (many ? 'Schedule this batch' : 'Schedule this') + '</p>' +
            '<button type="button" class="hc-sheet__close" data-action="notify-batch-schedule-close" ' +
              'aria-label="Close">' + c().icon('close') + '</button>' +
          '</div>' +
          '<p class="hc-sheet__preview">' + esc(countWords(state.items)) + '</p>' +
          '<p class="hc-caption">Pick when everyone is notified. Anything else you ' +
            'approve before then joins it.</p>' +
          '<div class="hc-remind__presets">' + pills + '</div>' +
          '<div class="hc-sheet__verses">' +
            box('date', 'Day', 'date', picking.date) +
            box('time', 'Time', 'time', picking.time) +
          '</div>' +
          '<div class="hc-sheet__foot">' +
            c().button('Schedule it', { action: 'notify-batch-schedule-save', icon: 'calendar',
              busy: busy === 'schedule' }) +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function drawSchedule() {
    close('notify-batch-schedule');
    if (!picking) return;
    var el = c().el(scheduleSheet());
    el.setAttribute('data-settled', picking.settled ? 'true' : 'false');
    picking.settled = true;
    document.getElementById('app').appendChild(el);
  }

  function readPick() {
    var d = document.querySelector('[data-batch-sched="date"]');
    var t = document.querySelector('[data-batch-sched="time"]');
    if (d && picking) picking.date = d.value;
    if (t && picking) picking.time = t.value;
  }

  function openSchedule() {
    if (!state.open || busy) return;
    var start = state.scheduled && state.due_at ? new Date(state.due_at) : presets()[0].when;
    picking = isoLocal(start);
    drawSchedule();
  }

  function preset(id) {
    readPick();
    var p = presets().filter(function (x) { return x.id === id; })[0];
    if (!p || !picking) return;
    var at = isoLocal(p.when);
    picking.date = at.date;
    picking.time = at.time;
    drawSchedule();
  }

  function closeSchedule() {
    picking = null;
    close('notify-batch-schedule');
  }

  function saveSchedule() {
    if (!picking || busy) return;
    readPick();
    var at = new Date(picking.date + 'T' + picking.time);
    if (!picking.date || !picking.time || isNaN(at.getTime())) {
      c().toast('Pick a day and a time.');
      return;
    }
    if (at.getTime() < now() + 60000) {
      c().toast('Pick a time later than now.');
      return;
    }
    if (at.getTime() > now() + 30 * 24 * 3600 * 1000) {
      c().toast('Pick a time in the next thirty days.');
      return;
    }

    busy = 'schedule';
    drawSchedule();
    var iso = at.toISOString();
    var call = demoOn()
      ? Promise.resolve(Object.assign({}, state, { scheduled: true, held: false,
          send_at: iso, due_at: iso }))
      : HC.auth.rpc('hc_admin_notify_batch_schedule', { p_at: iso });
    call.then(function (s) {
      busy = '';
      setState(s);
      closeSchedule();
      emit();
      c().toast('Scheduled for ' + whenWords(state.due_at) + '.');
    }, function (err) {
      busy = '';
      drawSchedule();
      c().toast((err && err.message) || 'That did not go through. Try again in a moment.');
    });
  }

  HC.notifyBatch = {
    ask: ask,
    answer: answer,
    refresh: refresh,
    strip: strip,
    sendNow: sendNow,
    cancel: cancel,
    openSchedule: openSchedule,
    preset: preset,
    closeSchedule: closeSchedule,
    saveSchedule: saveSchedule,
    state: function () { return state; },
    // For tests.
    _question: question,
    _dueAt: dueAt,
    _isQuiet: isQuiet,
    _leftWords: leftWords
  };

})(window.HC = window.HC || {});
