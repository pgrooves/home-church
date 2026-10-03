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

  /* OPEN OR CLOSED, set from the counter. cafe_open_on holds the church date
     the cafe was opened on and nothing when it is closed, so it is open only
     while that date is today: a counter that forgets to close is closed by
     midnight, and the page can never say open on a Tuesday. The same rule as
     isOpenToday in supabase/functions/_shared/cafe.mjs, which is what refuses
     an order when it is closed. */
  function openOn() {
    return String(HC.data.setting('cafe_open_on', '') || '').trim();
  }

  function isOpen() {
    var on = openOn();
    return !!on && on === churchNow().day;
  }

  /* Write a fresh answer into the settings this phone already holds, so the
     next draw reads it the same way it reads everything else. */
  function rememberOpen(value) {
    var rows = (HC.data && HC.data.appSettings) || [];
    var row = rows.filter(function (s) { return s.key === 'cafe_open_on'; })[0];
    if (row) row.value = value || '';
    else rows.push({ key: 'cafe_open_on', label: 'Cafe: open today', help: '', kind: 'text', value: value || '', sortOrder: 60 });
  }

  /* Ask the database straight away rather than waiting for the next content
     refresh, because open and closed change on a Sunday morning while
     somebody is looking at the page. Read like the rest of app_settings, with
     the publishable key and no session. Resolves to whether that changed
     anything, and quietly to false when offline. */
  function refreshOpen() {
    if (!HC.auth || !HC.auth.isConfigured()) return Promise.resolve(false);
    var before = isOpen();
    return HC.auth.publicGet('/app_settings?key=eq.cafe_open_on&select=value_text').then(function (rows) {
      if (!Array.isArray(rows)) return false;
      rememberOpen(rows[0] ? rows[0].value_text : '');
      return isOpen() !== before;
    }).catch(function () { return false; });
  }

  /* The counter's Open and Closed. */
  function setOpen(on) {
    return HC.auth.rpc('hc_cafe_set_open', { p_on: !!on }).then(function (value) {
      rememberOpen(typeof value === 'string' ? value : (on ? churchNow().day : ''));
      return isOpen();
    });
  }

  /* Whether this phone can order at all right now, and the warm sentence for
     when it cannot. The counter has to have opened the cafe, and ordering is
     for the morning of: on Sunday, or any day when the church has switched
     on cafe_every_day to test. */
  function closedReason() {
    if (!isOpen()) {
      return 'Ordering ahead opens when the cafe does.';
    }
    var now = churchNow();
    if (!now.sunday && !everyDay()) {
      return 'Ordering ahead opens Sunday morning. See you in the lobby.';
    }
    var open = slots().some(function (s) { return slotMinutes(s) - now.minutes >= 5; });
    if (!open) return 'That’s it for ordering ahead today. The counter is still open in the lobby.';
    return '';
  }

  /* The pickup times grouped under their service, each marked full or past.
     `load` is drinks already spoken for per slot, from hc_cafe_slot_load. */
  function slotGroups(load, drinks) {
    var now = churchNow();
    var cap = parseInt(HC.data.setting('cafe_slot_capacity', '8'), 10) || 0;
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
          past: slotMinutes(s) - now.minutes < 5,
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
    refreshOpen: refreshOpen,
    setOpen: setOpen
  };

})(window.HC = window.HC || {});
