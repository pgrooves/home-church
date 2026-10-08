/* ==========================================================================
   Home Church, the Happy Lion Cafe
   Everything the Coffee page knows that is not drawing: the cart on this
   phone, what a drink costs and how it reads, and the calls that place an
   order, follow it, and work the queue at the counter.

   THE PHONE PRICES THE CART ONLY TO SHOW IT. The total under the pay button
   is worked out here so it appears before anybody waits on the network. What
   is charged is worked out again by the cafe-checkout Edge Function, from the
   menu in the database, and Square is the one that adds it up. The two are
   kept in step by tests/cafe.test.js, which runs both on the same cart.

   THE CART NEVER LEAVES THE PHONE until somebody pays. It is kept in
   localStorage under one key, so closing the app halfway through ordering
   does not lose the coffee, and it is emptied the moment an order is placed.

   NOBODY HAS TO SIGN IN. Signed out, an order is a guest order, and the
   server hands this phone a key for it (GUEST_KEY below). The key is the only
   way back to that order, so it is kept here, never sent anywhere but
   cafe-checkout, and goes with Erase everything like every other hc: key.
   Signed in, nothing about ordering changed. See the header of
   supabase/functions/cafe-checkout.

   No screens are drawn here. See js/screens/cafe.js.
   ========================================================================== */

(function (HC) {
  'use strict';

  var CART_KEY = 'cafeCart';
  var LAST_KEY = 'cafeLastOrder';
  var NAME_KEY = 'cafeCupName';
  var GUEST_KEY = 'cafeGuestOrders';   // { [order id]: { key, day } }
  var GUEST_KEEP = 20;

  function storage() {
    return (HC.store && HC.store.storage) || {
      get: function (k, d) { return d; }, set: function () { return false; }
    };
  }

  /* ---------------------------------------------------------------- menu */

  function menu() {
    var items = (HC.data && HC.data.cafeMenu) || [];
    return items.filter(function (m) { return m.available !== false; });
  }

  function slots() {
    return ((HC.data && HC.data.cafeSlots) || []).filter(function (s) { return s.active !== false; });
  }

  function find(list, id) {
    return (list || []).filter(function (m) { return m.id === id; })[0] || null;
  }

  function optionText(option, value) {
    var name = option.short || option.label;
    return option.type === 'level' ? name + ', ' + value : value + ' ' + name;
  }

  /* One line of the cart, as the phone reads it: its name, its size, what
     was picked in one line, and its price. The same reading as priceLine in
     supabase/functions/_shared/cafe.mjs, without the refusals: a line the
     menu no longer has comes back null and the cart drops it. */
  function describe(list, line) {
    var item = find(list, line && line.item_id);
    if (!item) return null;
    var size = (item.sizes || []).filter(function (s) { return s.key === line.size; })[0];
    if (!size) return null;

    var picked = line.options || {};
    var price = Number(size.price_cents) || 0;
    var parts = [];

    (item.options || []).forEach(function (o) {
      var v = picked[o.key];
      if (v == null || v === '' || v === 'none' || v === 0) return;
      if (o.type === 'level') {
        parts.push(optionText(o, v));
        price += Number(o.price_cents) || 0;
      } else if (o.type === 'count') {
        parts.push(optionText(o, v));
        price += (Number(o.price_cents) || 0) * Number(v);
      }
    });

    return {
      name: item.name,
      sizeLabel: size.label,
      summary: parts.join(' · '),
      price: price
    };
  }

  function subtotal(list, lines) {
    return (lines || []).reduce(function (sum, l) {
      var d = describe(list, l);
      return sum + (d ? d.price : 0);
    }, 0);
  }

  function tax(cents, percentText) {
    var pct = parseFloat(String(percentText == null ? '' : percentText).replace('%', '').trim());
    if (!isFinite(pct) || pct <= 0) return 0;
    return Math.round(cents * pct / 100);
  }

  function money(cents) {
    var n = Number(cents) || 0;
    return '$' + (n / 100).toFixed(2);
  }

  /* The cheapest size, for the line under a drink's name on the menu. */
  function priceLine(item) {
    return (item.sizes || []).map(function (s) {
      return s.label + ' ' + money(s.price_cents);
    }).join(' · ');
  }

  /* ---------------------------------------------------------------- cart */

  function cart() {
    var lines = storage().get(CART_KEY, []);
    return Array.isArray(lines) ? lines : [];
  }

  function saveCart(lines) {
    storage().set(CART_KEY, lines);
    if (HC.store && HC.store.emit) HC.store.emit('cafe', null);
  }

  /* Lines the menu still recognises. A drink taken off the menu since it was
     added quietly leaves the cart rather than failing at the till. */
  function liveCart() {
    var list = menu();
    return cart().filter(function (l) { return !!describe(list, l); });
  }

  function addLine(line) {
    var lines = liveCart();
    if (lines.length >= 10) return false;
    lines.push({
      key: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      item_id: line.item_id,
      size: line.size,
      options: line.options || {}
    });
    saveCart(lines);
    return true;
  }

  function replaceLine(key, line) {
    saveCart(liveCart().map(function (l) {
      return l.key === key
        ? { key: key, item_id: line.item_id, size: line.size, options: line.options || {} }
        : l;
    }));
  }

  function removeLine(key) {
    saveCart(liveCart().filter(function (l) { return l.key !== key; }));
  }

  function clearCart() {
    saveCart([]);
  }

  function cupName() {
    var saved = storage().get(NAME_KEY, '');
    if (saved) return saved;
    var p = HC.store && HC.store.getProfile ? HC.store.getProfile() : {};
    return (p && p.firstName) || '';
  }

  function setCupName(name) {
    storage().set(NAME_KEY, String(name || '').slice(0, 40));
  }

  /* -------------------------------------------------------------- the day */

  var TZ = 'America/Chicago';

  function churchNow() {
    var out = {};
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hourCycle: 'h23', weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).formatToParts(new Date()).forEach(function (p) { out[p.type] = p.value; });
    } catch (e) {
      var d = new Date();
      out = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
        hour: d.getHours(), minute: d.getMinutes(), weekday: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] };
    }
    return {
      day: out.year + '-' + ('0' + out.month).slice(-2) + '-' + ('0' + out.day).slice(-2),
      minutes: Number(out.hour) * 60 + Number(out.minute),
      sunday: out.weekday === 'Sun'
    };
  }

  function slotMinutes(slot) {
    var bits = String(slot.pickupTime || '').split(':');
    return Number(bits[0]) * 60 + Number(bits[1] || 0);
  }

  /* '9:20', from '09:20:00'. The church says times without a leading zero
     and without am or pm: everything here is Sunday morning. */
  function clock(slot) {
    var m = slotMinutes(slot);
    var h = Math.floor(m / 60), mm = m % 60;
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + ('0' + mm).slice(-2);
  }

  function everyDay() {
    return HC.data.setting('cafe_every_day', false) === true;
  }

  /* OPEN OR CLOSED.

     THE SCHEDULE: on Sunday, church time, from cafe_opens_at to
     cafe_closes_at, by default 7:50 (ten minutes before the 8:00 service) to
     11:20 (twenty after the 11:00). cafe_every_day stretches it to every day
     for testing.

     THE COUNTER: Open and Closed write cafe_open_override, "open 2026-10-04"
     or "closed 2026-10-04", for an off day. It beats the schedule for that one
     date and nothing after it, so the next Sunday is back on the schedule
     without anybody remembering to undo it.

     The same rule as openState in supabase/functions/_shared/cafe.mjs, which
     is what refuses an order while closed; tests/cafe.test.js runs both. */
  function minutesOf(time) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(time == null ? '' : time).trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function openState(o) {
    var hit = /^(open|closed)\s+(\d{4}-\d{2}-\d{2})$/.exec(String(o.override == null ? '' : o.override).trim());
    if (hit && hit[2] === o.day) {
      return { open: hit[1] === 'open', by: 'counter', opensAt: o.opensAt, closesAt: o.closesAt };
    }
    var from = minutesOf(o.opensAt), to = minutesOf(o.closesAt);
    var open = !!(o.sunday || o.everyDay) && from != null && to != null &&
      o.minutes >= from && o.minutes < to;
    return { open: open, by: 'schedule', opensAt: o.opensAt, closesAt: o.closesAt };
  }

  function setting(key, fallback) {
    var v = HC.data.setting(key, fallback);
    return v == null || v === '' ? fallback : v;
  }

  function currentState() {
    var now = churchNow();
    return openState({
      override: HC.data.setting('cafe_open_override', ''),
      day: now.day,
      minutes: now.minutes,
      sunday: now.sunday,
      everyDay: everyDay(),
      opensAt: setting('cafe_opens_at', '07:50'),
      closesAt: setting('cafe_closes_at', '11:20')
    });
  }

  function isOpen() {
    return currentState().open;
  }

  /* '7:50' from '07:50', for the sentences that say when. */
  function clockText(time) {
    var m = minutesOf(time);
    if (m == null) return String(time || '');
    var h = Math.floor(m / 60), mm = m % 60;
    return (h % 12 === 0 ? 12 : h % 12) + ':' + ('0' + mm).slice(-2);
  }

  var LIVE_KEYS = ['cafe_open_override', 'cafe_opens_at', 'cafe_closes_at', 'cafe_every_day'];

  /* Write fresh answers into the settings this phone already holds, so the
     next draw reads them the same way it reads everything else. */
  function remember(rows) {
    var held = (HC.data && HC.data.appSettings) || [];
    rows.forEach(function (r) {
      var value = typeof r.value_bool === 'boolean' && r.value_text == null ? r.value_bool : (r.value_text || '');
      var row = held.filter(function (s) { return s.key === r.key; })[0];
      if (row) row.value = value;
      else held.push({ key: r.key, label: '', help: '', kind: typeof value === 'boolean' ? 'boolean' : 'text', value: value, sortOrder: 60 });
    });
  }

  /* Ask the database straight away rather than waiting for the next content
     refresh, because the counter can open or close on a Sunday morning while
     somebody is looking at the page. Read like the rest of app_settings, with
     the publishable key and no session, and quietly nothing when offline. */
  function refreshOpen() {
    if (!HC.auth || !HC.auth.isConfigured()) return Promise.resolve();
    return HC.auth.publicGet('/app_settings?key=in.(' + LIVE_KEYS.join(',') +
      ')&select=key,value_bool,value_text').then(function (rows) {
      if (Array.isArray(rows)) remember(rows);
    }).catch(function () {});
  }

  /* The counter's Open and Closed, for today, or 'schedule' to hand it back. */
  function setOpen(state) {
    return HC.auth.rpc('hc_cafe_set_open', { p_state: state }).then(function (value) {
      remember([{ key: 'cafe_open_override', value_text: typeof value === 'string' ? value : '' }]);
      return isOpen();
    });
  }

  /* Whether this phone can order at all right now, and the warm sentence for
     when it cannot. The counter has to have opened the cafe, and ordering is
     for the morning of: on Sunday, or any day when the church has switched
     on cafe_every_day to test. */
  function closedReason() {
    var st = currentState();
    var now = churchNow();
    if (!st.open) {
      if (st.by === 'counter') return 'The cafe is closed today. See you next Sunday.';
      var from = minutesOf(st.opensAt);
      if ((now.sunday || everyDay()) && from != null && now.minutes < from) {
        return 'Ordering ahead opens at ' + clockText(st.opensAt) + '.';
      }
      return 'Ordering ahead opens Sunday at ' + clockText(st.opensAt) + '.';
    }
    // Opened by hand there is always "as soon as it's ready" to pick.
    if (asapOffered()) return '';
    if (!pickupTimes().length) return 'That’s it for ordering ahead today. The counter is still open in the lobby.';
    return '';
  }

  /* AS SOON AS IT'S READY. When the counter has opened the cafe by hand (an
     off day, an evening event, a test on a Saturday) the Sunday pickup times
     may all be behind it, which would leave Open with nothing to order. So
     whenever the counter has opened it, the first choice is "as soon as it's
     ready": a pickup roughly ten minutes out, decided by the server. On an
     ordinary Sunday, run by the schedule, it is not offered. The slot is the
     'asap' row in cafe_slots, inactive so it never joins the list on its own
     (migration 0086). */
  var ASAP = 'asap';

  function asapOffered() {
    var st = currentState();
    return st.open && st.by === 'counter';
  }

  /* PICKUP AT A TIME SOMEBODY CHOOSES. Every five minutes the cafe is open
     for: run by the schedule, cafe_opens_at to cafe_closes_at and never
     sooner than five minutes from now; opened by hand, from now to closing
     or an hour out, whichever is later. The same function as pickupTimes in
     supabase/functions/_shared/cafe.mjs, which is what the server holds an
     order to, and tests/cafe.test.js keeps the two the same. Minutes past
     midnight, church time. */
  var PICK_STEP = 5, PICK_REACH = 60, CUTOFF = 5;

  function pickupTimesFor(o) {
    var open = o.open;
    if (!open || !open.open) return [];
    var opens = minutesOf(open.opensAt), closes = minutesOf(open.closesAt);
    var from = o.minutes + CUTOFF, to;
    if (open.by === 'schedule') {
      if (opens != null) from = Math.max(from, opens);
      to = closes == null ? -1 : closes;
    } else {
      to = Math.max(closes == null ? 0 : closes, from + PICK_REACH);
    }
    from = Math.ceil(from / PICK_STEP) * PICK_STEP;
    to = Math.min(to, 24 * 60 - PICK_STEP);
    var out = [];
    for (var m = from; m <= to; m += PICK_STEP) out.push(m);
    return out;
  }

  function pickupTimes() {
    return pickupTimesFor({ open: currentState(), minutes: churchNow().minutes });
  }

  /* 570 as '09:30', what cafe-checkout is sent. */
  function hhmm(m) {
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  }

  /* The service a time is nearest, for the label beside it: '9:30'. */
  function nearestService(m) {
    var best = null;
    slots().forEach(function (s) {
      var svc = minutesOf(s.service);
      if (svc == null) return;
      if (best == null || Math.abs(svc - m) < Math.abs(best - m)) best = svc;
    });
    return best;
  }

  /* An order's pickup time on the church clock, from pickup_at: minutes past
     midnight, and as the church says it, '9:25'. */
  function pickupMinutes(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return null;
    try {
      var out = {};
      new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
        .formatToParts(d).forEach(function (p) { out[p.type] = p.value; });
      return Number(out.hour) * 60 + Number(out.minute);
    } catch (e) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }

  function pickupClock(iso) {
    var m = pickupMinutes(iso);
    return m == null ? '' : clockText(hhmm(m));
  }

  /* ----------------------------------------------------------------- calls */

  function signedIn() {
    return !!(HC.auth && HC.auth.isConfigured() && HC.auth.isSignedIn());
  }

  /* Guest orders this phone placed, newest last. Pruned to the last
     GUEST_KEEP so a year of Sundays is not a year of keys. */
  function guestOrders() {
    var saved = storage().get(GUEST_KEY, null);
    return saved && typeof saved === 'object' ? saved : {};
  }

  function rememberGuest(orderId, key) {
    var all = guestOrders();
    all[orderId] = { key: key, day: churchNow().day };
    var ids = Object.keys(all);
    ids.slice(0, Math.max(0, ids.length - GUEST_KEEP)).forEach(function (id) { delete all[id]; });
    storage().set(GUEST_KEY, all);
  }

  function guestKey(orderId) {
    var g = guestOrders()[orderId];
    return g && typeof g.key === 'string' ? g.key : null;
  }

  function guestCall(body, fallback) {
    return HC.auth.callPublicFunction('/cafe-checkout', Object.assign({ guest: true }, body), fallback);
  }

  /* A guest's ticket comes back with how many drinks are ahead of it, so the
     second question the ticket screen asks is answered from here rather than
     with a second call. */
  var guestAhead = {};

  /* `pickup` is ASAP or a chosen time, '09:25'. */
  function checkout(pickup, name) {
    var lines = liveCart().map(function (l) {
      return { item_id: l.item_id, size: l.size, options: l.options || {} };
    });
    setCupName(name);
    var body = {
      action: 'create',
      lines: lines,
      slot_id: pickup === ASAP ? ASAP : undefined,
      pickup_time: pickup === ASAP ? undefined : pickup,
      cup_name: name,
      push_token: storage().get('pushToken', null)
    };
    var fallback = 'The cafe could not take that order. Try again in a moment.';
    var call = signedIn()
      ? HC.auth.callFunction('/cafe-checkout', body, fallback)
      : guestCall(body, fallback);
    return call.then(function (res) {
      if (res.guest_key) rememberGuest(res.order_id, res.guest_key);
      storage().set(LAST_KEY, res.order_id);
      clearCart();
      return res;
    });
  }

  function refresh(orderId) {
    var key = guestKey(orderId);
    if (key) {
      return guestCall({ action: 'refresh', order_id: orderId, guest_key: key }, 'Could not reach the cafe.');
    }
    return HC.auth.callFunction('/cafe-checkout', { action: 'refresh', order_id: orderId },
      'Could not reach the cafe.');
  }

  var ORDER_COLUMNS = 'id,status,ticket_no,cup_name,slot_id,pickup_at,items,drinks,' +
    'subtotal_cents,tax_cents,tip_cents,total_cents,checkout_url,service_day,created_at,ready_at';

  function order(orderId) {
    var key = guestKey(orderId);
    if (key) {
      return guestCall({ action: 'status', order_id: orderId, guest_key: key },
        'We could not find that order.').then(function (res) {
        guestAhead[orderId] = res.ahead;
        return res.order;
      });
    }
    return HC.auth.restFetch('/cafe_orders?id=eq.' + encodeURIComponent(orderId) +
      '&select=' + ORDER_COLUMNS, {
      headers: { Accept: 'application/vnd.pgrst.object+json' }
    });
  }

  function ahead(orderId) {
    if (guestKey(orderId)) {
      return Promise.resolve(guestAhead[orderId] == null ? null : guestAhead[orderId]);
    }
    return HC.auth.rpc('hc_cafe_ahead', { p_order: orderId }).catch(function () { return null; });
  }

  /* Today's orders on this account that are still worth showing: paid and
     not yet picked up, newest first. What the menu screen puts at the top so
     somebody who closed the app can find their ticket again. */
  function myOpenOrders() {
    if (!signedIn()) return myOpenGuestOrders();
    return HC.auth.restFetch('/cafe_orders?service_day=eq.' + churchNow().day +
      '&status=in.(paid,making,ready)&select=' + ORDER_COLUMNS + '&order=created_at.desc')
      .catch(function () { return []; });
  }

  /* The same, for orders this phone placed as a guest: today's keys, asked
     about one at a time. A Sunday is one or two orders, not a list. */
  function myOpenGuestOrders() {
    var today = churchNow().day;
    var all = guestOrders();
    var ids = Object.keys(all).filter(function (id) { return all[id] && all[id].day === today; });
    return Promise.all(ids.map(function (id) {
      return order(id).catch(function () { return null; });
    })).then(function (rows) {
      return rows.filter(function (o) {
        return o && (o.status === 'paid' || o.status === 'making' || o.status === 'ready');
      }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    });
  }

  function lastOrderId() {
    return storage().get(LAST_KEY, null);
  }

  /* The counter. */
  function isBarista() {
    var p = HC.store && HC.store.getProfile ? HC.store.getProfile() : {};
    return !!(p && (p.canRunCafe || p.role === 'admin'));
  }

  function queue() {
    return HC.auth.rpc('hc_cafe_queue', {});
  }

  function setStatus(orderId, status) {
    return HC.auth.rpc('hc_cafe_set_status', { p_order: orderId, p_status: status });
  }


  HC.cafe = {
    menu: menu,
    slots: slots,
    describe: describe,
    subtotal: subtotal,
    tax: tax,
    money: money,
    priceLine: priceLine,
    cart: liveCart,
    addLine: addLine,
    replaceLine: replaceLine,
    removeLine: removeLine,
    clearCart: clearCart,
    cupName: cupName,
    setCupName: setCupName,
    churchNow: churchNow,
    clock: clock,
    closedReason: closedReason,
    pickupTimes: pickupTimes,
    pickupTimesFor: pickupTimesFor,
    pickupClock: pickupClock,
    pickupMinutes: pickupMinutes,
    nearestService: nearestService,
    hhmm: hhmm,
    signedIn: signedIn,
    checkout: checkout,
    refresh: refresh,
    order: order,
    ahead: ahead,
    myOpenOrders: myOpenOrders,
    lastOrderId: lastOrderId,
    isBarista: isBarista,
    queue: queue,
    setStatus: setStatus,
    isOpen: isOpen,
    ASAP: ASAP,
    asapOffered: asapOffered,
    openState: openState,
    currentState: currentState,
    clockText: clockText,
    refreshOpen: refreshOpen,
    setOpen: setOpen
  };

})(window.HC = window.HC || {});
