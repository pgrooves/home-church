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

   No screens are drawn here. See js/screens/cafe.js.
   ========================================================================== */

(function (HC) {
  'use strict';

  var CART_KEY = 'cafeCart';
  var LAST_KEY = 'cafeLastOrder';
  var NAME_KEY = 'cafeCupName';

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
    var close = st.by === 'schedule' ? minutesOf(st.closesAt) : null;
    var left = slots().some(function (s) {
      var m = slotMinutes(s);
      return m - now.minutes >= 5 && (close == null || m <= close);
    });
    if (!left) return 'That’s it for ordering ahead today. The counter is still open in the lobby.';
    return '';
  }

  /* The pickup times grouped under their service, each marked full or past.
     `load` is drinks already spoken for per slot, from hc_cafe_slot_load. */
  function slotGroups(load, drinks) {
    var now = churchNow();
    var cap = parseInt(HC.data.setting('cafe_slot_capacity', '8'), 10) || 0;
    var st = currentState();
    var close = st.by === 'schedule' ? minutesOf(st.closesAt) : null;
    var groups = [];
    slots().slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); })
      .forEach(function (s) {
        var g = groups.filter(function (x) { return x.service === s.service; })[0];
        if (!g) { g = { service: s.service, slots: [] }; groups.push(g); }
        var limit = s.capacity == null ? cap : s.capacity;
        var taken = (load && load[s.id]) || 0;
        g.slots.push({
          id: s.id,
          label: clock(s),
          past: slotMinutes(s) - now.minutes < 5 || (close != null && slotMinutes(s) > close),
          full: limit > 0 && taken + (drinks || 1) > limit
        });
      });
    return groups;
  }

  /* ----------------------------------------------------------------- calls */

  function signedIn() {
    return !!(HC.auth && HC.auth.isConfigured() && HC.auth.isSignedIn());
  }

  function slotLoad() {
    if (!signedIn()) return Promise.resolve({});
    return HC.auth.rpc('hc_cafe_slot_load', { p_day: churchNow().day }).then(function (rows) {
      var out = {};
      (rows || []).forEach(function (r) { out[r.slot_id] = r.drinks; });
      return out;
    }).catch(function () { return {}; });
  }

  function checkout(slotId, name) {
    var lines = liveCart().map(function (l) {
      return { item_id: l.item_id, size: l.size, options: l.options || {} };
    });
    setCupName(name);
    return HC.auth.callFunction('/cafe-checkout', {
      action: 'create',
      lines: lines,
      slot_id: slotId,
      cup_name: name,
      push_token: storage().get('pushToken', null)
    }, 'The cafe could not take that order. Try again in a moment.').then(function (res) {
      storage().set(LAST_KEY, res.order_id);
      clearCart();
      return res;
    });
  }

  function refresh(orderId) {
    return HC.auth.callFunction('/cafe-checkout', { action: 'refresh', order_id: orderId },
      'Could not reach the cafe.');
  }

  var ORDER_COLUMNS = 'id,status,ticket_no,cup_name,slot_id,pickup_at,items,drinks,' +
    'subtotal_cents,tax_cents,tip_cents,total_cents,checkout_url,service_day,created_at,ready_at';

  function order(orderId) {
    return HC.auth.restFetch('/cafe_orders?id=eq.' + encodeURIComponent(orderId) +
      '&select=' + ORDER_COLUMNS, {
      headers: { Accept: 'application/vnd.pgrst.object+json' }
    });
  }

  function ahead(orderId) {
    return HC.auth.rpc('hc_cafe_ahead', { p_order: orderId }).catch(function () { return null; });
  }

  /* Today's orders on this account that are still worth showing: paid and
     not yet picked up, newest first. What the menu screen puts at the top so
     somebody who closed the app can find their ticket again. */
  function myOpenOrders() {
    if (!signedIn()) return Promise.resolve([]);
    return HC.auth.restFetch('/cafe_orders?service_day=eq.' + churchNow().day +
      '&status=in.(paid,making,ready)&select=' + ORDER_COLUMNS + '&order=created_at.desc')
      .catch(function () { return []; });
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
    slotGroups: slotGroups,
    signedIn: signedIn,
    slotLoad: slotLoad,
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
    openState: openState,
    currentState: currentState,
    clockText: clockText,
    refreshOpen: refreshOpen,
    setOpen: setOpen
  };

})(window.HC = window.HC || {});
