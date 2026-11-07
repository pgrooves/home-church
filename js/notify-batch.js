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

   While one is waiting, the Announcements screen shows it, with Send now and
   Don't send. See strip().

   IN DEMO MODE nothing reaches the server, so the batch is kept here, on the
   page, by the same rules, and "sending" it is a toast saying it would have.
   ========================================================================== */

(function (HC) {
  'use strict';

  var FIVE_MIN = 5 * 60 * 1000;
  var HOLD_MIN = 30 * 60 * 1000;

  var state = { open: false, items: [], held: false, due_at: null };
  var fetchedAt = 0;
  var inflight = false;
  var asking = null;     // { kind, id, title, before: [items] }
  var busy = '';
  var timer = null;

  function c() { return HC.components; }

  function demoOn() { return !!(HC.demo && HC.demo.on); }

  function emit() {
    if (HC.store && HC.store.emit) HC.store.emit('admin', null);
  }

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
     9 pm and 8 am goes at 8 am. The server's answer is the one that counts;
     this is for the demo and for the line under the question. */
  function dueAt(sendAt, lastActivity) {
    var due = sendAt ? new Date(sendAt) : new Date(new Date(lastActivity).getTime() + HOLD_MIN);
    var p = churchParts(due);
    var minutes = 0;
    if (p.h >= 21) minutes = (24 - p.h + 8) * 60 - p.m;
    else if (p.h < 8) minutes = (8 - p.h) * 60 - p.m;
    if (!minutes) return due;
    return new Date(due.getTime() + minutes * 60000 - p.s * 1000);
  }

  function clock(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit'
    }).format(new Date(iso));
  }

  /* ------------------------------------------------------------- words */

  function noun(kind, many) {
    if (kind === 'event') return many ? 'events' : 'event';
    return many ? 'announcements' : 'announcement';
  }

  /* What the prompt asks, from what was already waiting before this one. */
  function question(before) {
    var others = (before || []);
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
    return { announcements: a, events: e };
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
    var clean = next && next.open
      ? { open: true, items: Array.isArray(next.items) ? next.items : [],
          held: !!next.held, due_at: next.due_at || null,
          send_at: next.send_at || null, last: next.last || null }
      : { open: false, items: [], held: false, due_at: null };
    var changed = JSON.stringify(clean) !== JSON.stringify(state);
    state = clean;
    fetchedAt = Date.now();
    watch();
    if (changed) emit();
  }

  /* Look again just after it is due, so the strip comes down on its own. */
  function watch() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!state.open || !state.due_at) return;
    var wait = new Date(state.due_at).getTime() - Date.now() + (demoOn() ? 500 : 65000);
    timer = setTimeout(function () {
      timer = null;
      if (demoOn()) return demoTick();
      refresh(true);
    }, Math.max(1000, Math.min(wait, 2147483000)));
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
    var now = new Date();
    var s = state.open ? state : { open: true, items: [] };
    var items = s.items.slice();
    if (!items.some(function (i) { return i.kind === kind && i.id === id; })) {
      items.push({ kind: kind, id: id });
    }
    var sendAt = hold ? null : new Date(now.getTime() + FIVE_MIN).toISOString();
    setState({ open: true, items: items, held: !!hold, send_at: sendAt,
      last: now.toISOString(), due_at: dueAt(sendAt, now.toISOString()).toISOString() });
    return Promise.resolve(state);
  }

  function demoTick() {
    if (!state.open) return;
    if (new Date(state.due_at).getTime() > Date.now()) return watch();
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
    var today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
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
      asking = { kind: kind, id: row.id, title: row.title || '', before: before };
      draw();
    });
  }

  function sheet() {
    var esc = c().esc;
    var soon = new Date(Date.now() + FIVE_MIN);
    var note = isQuiet(soon)
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
          '<p class="hc-batch-ask__q">' + esc(question(asking.before)) + '</p>' +
          '<div class="hc-batch-ask__buttons">' +
            c().button('Yes', { action: 'notify-batch-yes', busy: busy === 'yes' }) +
            c().button('More', { action: 'notify-batch-more', variant: 'secondary', busy: busy === 'more' }) +
            c().button('No', { action: 'notify-batch-no', variant: 'tertiary' }) +
          '</div>' +
          '<p class="hc-caption hc-sheet__note">' + esc(note) + '</p>' +
        '</div>' +
      '</div>';
  }

  function close() {
    var el = document.querySelector('[data-sheet="notify-batch"]');
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
        ? 'Left out. The waiting notification goes out at ' + clock(state.due_at) + '.'
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
      c().toast(hold
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

  function strip() {
    if (!state.open || !state.items.length) return '';
    var esc = c().esc;
    var when = clock(state.due_at);
    var line;
    if (state.held) {
      line = 'Held while you add more. It goes out at ' + when +
        ' if nothing else is approved, or tap Yes on the next one.';
    } else if (state.due_at && isQuiet(new Date(new Date(state.due_at).getTime() - 60000))) {
      line = 'Waiting for the morning. It goes out at ' + when + '.';
    } else {
      line = 'Goes out at ' + when + ', 5 minutes after the last Yes.';
    }

    return '<div class="hc-admin__batch" role="status">' +
      '<p class="hc-eyebrow">Notification waiting</p>' +
      '<p class="hc-row__title">' + esc(countWords(state.items)) + '</p>' +
      '<p class="hc-caption">' + esc(line) + '</p>' +
      '<div class="hc-admin__item-actions">' +
        c().button('Send now', { action: 'notify-batch-send-now', variant: 'secondary',
          small: true, busy: busy === 'send' }) +
        c().button('Don’t send', { action: 'notify-batch-cancel', variant: 'tertiary',
          small: true, busy: busy === 'cancel' }) +
      '</div>' +
    '</div>';
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
    if (!window.confirm('Don’t send this notification? Everything you approved stays up.')) return;
    busy = 'cancel';
    emit();
    var call = demoOn()
      ? Promise.resolve({ open: false })
      : HC.auth.rpc('hc_admin_notify_batch_cancel', {});
    call.then(function (s) {
      busy = '';
      setState(s);
      emit();
      c().toast('Not sent. Nobody was notified.');
    }, function (err) {
      busy = '';
      refresh(true);
      emit();
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
    state: function () { return state; },
    // For tests.
    _question: question,
    _dueAt: dueAt,
    _isQuiet: isQuiet
  };

})(window.HC = window.HC || {});
