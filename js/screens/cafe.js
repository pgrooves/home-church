/* ==========================================================================
   Home Church, Coffee
   The Happy Lion Cafe, in the lobby on Sunday mornings: order ahead, pick a
   time to grab it, pay through Square, and get told when it is ready. And,
   for whoever runs the counter, the queue they make drinks from.

   ONE ROUTE, FOUR VIEWS, the way Admin is one route with sections:

     cafe               the menu, with the cafe's logo at the top. A stop in
                        the ••• menu like Give, labelled Coffee, between Give
                        and Settings. Tapping a drink opens its sheet.
     cafe / order       what is in the order, when to pick it up, the name
                        for the cup, and the button to Square's checkout.
     cafe / t-<id>      one order, after paying: the ticket number, the place
                        in line, and Paid, In the queue, Making, Ready.
     cafe / queue       the counter. Today's paid orders by pickup time, and
                        the buttons that move them along. Drawn for somebody
                        with the cafe counter or an admin; the database checks.

   Everything that is not drawing is in js/cafe.js. Taps arrive as
   data-action="cafe" with data-cafe naming what to do, through one line in
   js/app.js, so this file owns its own verbs.

   THE PAGE IS OFF UNTIL THE CHURCH TURNS IT ON (cafe_on, migration 0085), and
   js/app.js leaves it out of the menu until then. Arriving here anyway, from
   an old link, says so rather than offering a till that will refuse.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  // The lion walks in place and sips. The walking file is drawn inline, not
  // as an img, because his shirt and near leg are filled with the page's own
  // colour (--hc-paper) to hide the leg passing behind them. Until it has
  // loaded, and always for reduced motion, the still logo stands in; it is
  // the same picture as his resting pose, so the swap does not show.
  var LOGO = 'assets/img/happy-lion-cafe-walking.svg?v=8';
  var LOGO_STILL = 'assets/img/happy-lion-cafe.svg';
  var lion = { svg: null, asked: false };
  var MENU_LEDE = 'Pick your drink, choose when you’ll grab it, and it’ll be waiting at the counter.';
  var OFF_LINE = 'The cafe isn’t taking orders in the app right now. Come say hi at the counter in the lobby.';

  /* ------------------------------------------------------------- state */

  var state = {
    sheet: null,        // { itemId, key, size, options } while a drink is open
    pickup: null,
    name: null,
    busy: false,
    error: '',
    openOrders: [],
    ticket: null,       // { id, order, ahead, error }
    queue: { rows: null, error: '', busy: '' },
    opening: false,
    shownOpen: null
  };

  var timers = { ticket: null, queue: null, open: null };

  function cafeOn() {
    return HC.data.setting('cafe_on', false) === true;
  }

  function route() {
    return HC.router && HC.router.current ? HC.router.current() : null;
  }

  function here(id) {
    var r = route();
    return !!r && r.name === 'cafe' && (r.id || '') === (id || '');
  }

  /* Repaint in place: the body of whichever view is on screen, without a
     new route, so the scroll position and a half typed name both survive.
     The walking lion is carried over too, at the same moment of his step,
     so a repaint doesn't start him again. */
  function paint() {
    var root = document.querySelector('[data-cafe-root]');
    if (!root) return;
    var r = route();
    var was = root.querySelector('.hc-cafe__logo svg');
    var at = was && was.getCurrentTime ? was.getCurrentTime() : 0;
    root.innerHTML = body(r || { name: 'cafe' });
    var now = root.querySelector('.hc-cafe__logo svg');
    if (was && now) {
      now.parentNode.replaceChild(was, now);
      if (was.setCurrentTime) was.setCurrentTime(at);
    }
    paintSheet();
  }

  /* ---------------------------------------------------------- pieces */

  function reduced() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Fetch the walking lion once, and swap him in for the still logo if it is
     on screen when he arrives. */
  function loadLion() {
    if (lion.asked || reduced() || !window.fetch) return;
    lion.asked = true;
    fetch(LOGO).then(function (res) {
      return res.ok ? res.text() : Promise.reject(new Error(String(res.status)));
    }).then(function (text) {
      var start = text.indexOf('<svg');
      if (start < 0) return;
      lion.svg = text.slice(start);
      var img = document.querySelector('[data-cafe-root] .hc-cafe__logo img');
      if (img && !reduced()) img.outerHTML = lion.svg;
    }).catch(function () { /* the still logo stays */ });
  }

  function logo(cls) {
    loadLion();
    var art = lion.svg && !reduced() ? lion.svg :
      '<img src="' + LOGO_STILL + '" alt="Happy Lion Cafe" width="150" height="180">';
    return '<div class="hc-cafe__logo ' + (cls || '') + '">' + art + '</div>';
  }

  function drinkIcon(item) {
    return '<span class="hc-cafe-item__art" aria-hidden="true">' +
      c.icon(item.icon === 'cold' ? 'iced' : 'coffee', 'hc-cafe-item__icon') + '</span>';
  }

  function dayLine() {
    var now = HC.cafe.churchNow();
    var bits = now.day.split('-').map(Number);
    var d = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2], 12));
    var label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    return now.sunday ? 'Taking orders for this ' + label : 'Taking orders for ' + label;
  }

  /* Open or closed, in green or red, straight under the logo. The words are
     the church's own. */
  var OPEN_LINE = 'Cafe Is Open!';
  var CLOSED_LINE = 'Cafe is Closed.';

  function openBadge() {
    var open = HC.cafe.isOpen();
    state.shownOpen = open;
    return '<p class="hc-cafe-status hc-cafe-status--' + (open ? 'open' : 'closed') + '" ' +
      'role="status" data-cafe-status>' +
      '<span class="hc-cafe-status__dot" aria-hidden="true"></span>' +
      c.esc(open ? OPEN_LINE : CLOSED_LINE) + '</p>';
  }

  /* The counter's two buttons. The same pair on the Coffee page and at the
     top of the queue, so whoever is behind the counter can flip it from
     either. */
  function openControl() {
    var open = HC.cafe.isOpen();
    var busy = state.opening;
    function btn(on, label) {
      var pressed = on === open;
      return '<button type="button" class="hc-cafe-oc__btn hc-cafe-oc__btn--' + (on ? 'open' : 'closed') + '" ' +
        'data-action="cafe" data-cafe="open-state" data-id="' + (on ? 'open' : 'closed') + '" ' +
        'aria-pressed="' + pressed + '"' + (busy ? ' disabled' : '') + '>' + label + '</button>';
    }
    return '<div class="hc-cafe-oc" role="group" aria-label="Is the cafe open?">' +
      btn(true, 'Open') + btn(false, 'Closed') + '</div>' +
      '<p class="hc-caption hc-cafe-oc__note">' + scheduleNote() + '</p>';
  }

  /* Under the two buttons: who decided, and for how long. */
  function scheduleNote() {
    var st = HC.cafe.currentState();
    var hours = HC.cafe.clockText(st.opensAt) + ' to ' + HC.cafe.clockText(st.closesAt);
    if (st.by === 'counter') {
      return c.esc((st.open ? 'Opened' : 'Closed') + ' by hand for today. The Sunday schedule, ' +
        hours + ', is back tomorrow. ') +
        '<button type="button" class="hc-cafe-oc__back" data-action="cafe" data-cafe="open-state" data-id="schedule">' +
        'Back to the schedule now</button>';
    }
    return c.esc('Following the Sunday schedule, ' + hours + '. Tap the other one for an off day.');
  }

  function cart() {
    return HC.cafe.cart();
  }

  function cartTotal() {
    return HC.cafe.subtotal(HC.cafe.menu(), cart());
  }

  /* An order's pickup time, '9:25', and the service it is nearest, '9:30'. */
  function pickupLabel(o) {
    return o && o.pickup_at ? HC.cafe.pickupClock(o.pickup_at) : '';
  }

  function pickupService(o) {
    var m = o ? HC.cafe.pickupMinutes(o.pickup_at) : null;
    var svc = m == null ? null : HC.cafe.nearestService(m);
    return svc == null ? '' : HC.cafe.clockText(HC.cafe.hhmm(svc));
  }

  /* ------------------------------------------------------------- menu */

  function menuView() {
    var html = logo();
    var closed = HC.cafe.closedReason();

    html += openBadge();
    html += '<p class="hc-caption hc-cafe__open">' +
      (!cafeOn()
        ? 'Only people in Cafe mode can see this page. ' +
          'An admin turns it on for everybody under App settings, Pages.'
        : c.esc(closed || dayLine())) +
    '</p>';

    // Somebody who paid and closed the app finds their ticket again here.
    state.openOrders.forEach(function (o) {
      html += '<button type="button" class="hc-card hc-card--edge hc-cafe-mine" data-action="cafe" ' +
        'data-cafe="ticket" data-id="' + c.esc(o.id) + '">' +
        '<span class="hc-eyebrow hc-eyebrow--legible">Your order' +
          (o.ticket_no ? ' #' + c.esc(o.ticket_no) : '') + '</span>' +
        '<span class="hc-cafe-mine__line">' + c.esc(statusLine(o)) + '</span>' +
      '</button>';
    });

    if (HC.cafe.isBarista()) {
      html += '<div class="hc-card hc-card--quiet hc-cafe-counter">' +
        '<span class="hc-eyebrow hc-eyebrow--legible">Cafe mode</span>' +
        openControl() +
        '<button type="button" class="hc-cafe-counter__queue" data-action="cafe" data-cafe="queue">' +
          '<span>Open the queue</span>' + c.icon('chevronRight', 'hc-cafe-counter__chev') +
        '</button>' +
      '</div>';
    }

    html += c.sectionHeader('In the lobby, Sunday mornings', 'Order ahead', { tag: 'h1' });
    html += '<p class="hc-body-serif hc-cafe__lede">' + c.esc(HC.data.copy('cafe.lede', MENU_LEDE)) + '</p>';

    var items = HC.cafe.menu();
    if (!items.length) {
      html += c.emptyState('The menu is on its way. Check back Sunday morning.', 'coffee');
    }
    items.forEach(function (item) {
      html += '<button type="button" class="hc-card hc-cafe-item" data-action="cafe" data-cafe="open" ' +
        'data-id="' + c.esc(item.id) + '"' + (closed ? ' aria-disabled="true"' : '') + '>' +
        drinkIcon(item) +
        '<span class="hc-cafe-item__body">' +
          '<span class="hc-cafe-item__name">' + c.esc(item.name) + '</span>' +
          '<span class="hc-cafe-item__price">' + c.esc(HC.cafe.priceLine(item)) + '</span>' +
        '</span>' +
        '<span class="hc-cafe-item__add" aria-hidden="true">+</span>' +
      '</button>';
    });

    html += '<p class="hc-caption hc-cafe__more">More of the menu is on its way.</p>';

    var lines = cart();
    if (lines.length) {
      html += '<button type="button" class="hc-cafe-cartbar" data-action="cafe" data-cafe="cart">' +
        '<span class="hc-cafe-cartbar__n">' + lines.length + '</span>' +
        '<span class="hc-cafe-cartbar__label">View order</span>' +
        '<span class="hc-cafe-cartbar__total">' + c.esc(HC.cafe.money(cartTotal())) + '</span>' +
      '</button>';
    }
    return html;
  }

  /* ------------------------------------------------------------ sheet */

  function blankOptions(item) {
    var out = {};
    (item.options || []).forEach(function (o) { out[o.key] = o.type === 'level' ? 'none' : 0; });
    return out;
  }

  function sheetHtml() {
    var s = state.sheet;
    if (!s) return '';
    var item = HC.cafe.menu().filter(function (m) { return m.id === s.itemId; })[0];
    if (!item) return '';

    var line = { item_id: item.id, size: s.size, options: s.options };
    var d = HC.cafe.describe(HC.cafe.menu(), line);

    var html = '<div class="hc-cafe-sheet" role="dialog" aria-modal="true" aria-label="' + c.esc(item.name) + '">' +
      '<button type="button" class="hc-cafe-sheet__scrim" data-action="cafe" data-cafe="close" aria-label="Close"></button>' +
      '<div class="hc-cafe-sheet__panel">' +
        '<div class="hc-cafe-sheet__grab" aria-hidden="true"></div>' +
        '<span class="hc-eyebrow hc-eyebrow--legible">Happy Lion Cafe</span>' +
        '<h2 class="hc-cafe-sheet__title">' + c.esc(item.name) + '</h2>' +
        (item.blurb ? '<p class="hc-caption hc-cafe-sheet__blurb">' + c.esc(item.blurb) + '</p>' : '');

    html += '<p class="hc-cafe__label">Size</p><div class="hc-cafe-seg" role="radiogroup" aria-label="Size">';
    (item.sizes || []).forEach(function (z) {
      var on = z.key === s.size;
      html += '<button type="button" role="radio" aria-checked="' + on + '" class="hc-cafe-seg__opt" ' +
        'data-action="cafe" data-cafe="size" data-id="' + c.esc(z.key) + '">' +
        c.esc(z.label) + '<span>' + c.esc(HC.cafe.money(z.price_cents)) + '</span></button>';
    });
    html += '</div>';

    var groups = [];
    (item.options || []).forEach(function (o) {
      var g = groups.filter(function (x) { return x.name === o.group; })[0];
      if (!g) { g = { name: o.group || '', options: [] }; groups.push(g); }
      g.options.push(o);
    });

    groups.forEach(function (g) {
      html += '<p class="hc-cafe__label">' + c.esc(g.name) + '</p><div class="hc-cafe-opts">';
      g.options.forEach(function (o) {
        var v = s.options[o.key];
        html += '<div class="hc-cafe-opt"><span class="hc-cafe-opt__name">' + c.esc(o.label) +
          (o.unit ? '<small>' + c.esc(o.unit) + '</small>' : '') + '</span>';
        if (o.type === 'level') {
          html += '<span class="hc-cafe-levels" role="radiogroup" aria-label="' + c.esc(o.label) + '">';
          (o.levels || []).forEach(function (lv) {
            var on = (v || 'none') === lv;
            html += '<button type="button" role="radio" aria-checked="' + on + '" class="hc-cafe-level" ' +
              'data-action="cafe" data-cafe="level" data-key="' + c.esc(o.key) + '" data-id="' + c.esc(lv) + '">' +
              c.esc(lv.charAt(0).toUpperCase() + lv.slice(1)) + '</button>';
          });
          html += '</span>';
        } else {
          var n = Number(v) || 0;
          html += '<span class="hc-cafe-step">' +
            '<button type="button" class="hc-cafe-step__btn" data-action="cafe" data-cafe="less" data-key="' +
              c.esc(o.key) + '" aria-label="One less ' + c.esc(o.label) + '"' + (n <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b aria-live="polite">' + n + '</b>' +
            '<button type="button" class="hc-cafe-step__btn" data-action="cafe" data-cafe="more" data-key="' +
              c.esc(o.key) + '" aria-label="One more ' + c.esc(o.label) + '"' + (n >= (o.max || 0) ? ' disabled' : '') + '>+</button>' +
          '</span>';
        }
        html += '</div>';
      });
      html += '</div>';
    });

    html += '<button type="button" class="hc-btn hc-btn--primary hc-cafe-wide" data-action="cafe" data-cafe="add">' +
      '<span>' + (s.key ? 'Save changes' : 'Add to order') + '</span>' +
      '<span>' + c.esc(HC.cafe.money(d ? d.price : 0)) + '</span></button>';

    html += '</div></div>';
    return html;
  }

  /* The sheet lives on <body>, above the top bar and the menu button, and is
     drawn and taken down here rather than inside the view. */
  function paintSheet() {
    var host = document.getElementById('hc-cafe-sheet-host');
    if (!state.sheet) {
      if (host) host.remove();
      document.documentElement.classList.remove('hc-cafe-sheet-open');
      return;
    }
    var fresh = !host;
    if (!host) {
      host = document.createElement('div');
      host.id = 'hc-cafe-sheet-host';
      document.body.appendChild(host);
    }
    var panel = host.querySelector('.hc-cafe-sheet__panel');
    var scroll = panel ? panel.scrollTop : 0;
    host.innerHTML = sheetHtml();
    var next = host.querySelector('.hc-cafe-sheet');
    if (next && !fresh) next.setAttribute('data-settled', 'true');
    var nextPanel = host.querySelector('.hc-cafe-sheet__panel');
    if (nextPanel) nextPanel.scrollTop = scroll;
    document.documentElement.classList.add('hc-cafe-sheet-open');
  }

  /* ------------------------------------------------------------ order */

  function orderView() {
    var html = c.sectionHeader('Happy Lion Cafe', 'Your order', { flush: true, tag: 'h1' });
    var list = HC.cafe.menu();
    var lines = cart();

    if (!lines.length) {
      html += c.emptyState('Nothing in your order yet. Pick a drink and it lands here.', 'coffee');
      html += '<div class="hc-cafe-actions">' +
        '<button type="button" class="hc-btn hc-btn--secondary" data-action="cafe" data-cafe="menu">' +
          '<span>Back to the menu</span></button>' +
      '</div>';
      return html;
    }

    html += '<div class="hc-cafe-lines">';
    lines.forEach(function (l) {
      var d = HC.cafe.describe(list, l);
      html += '<div class="hc-cafe-line">' +
        '<div class="hc-cafe-line__body">' +
          '<div class="hc-cafe-line__name">' + c.esc(d.name + ', ' + d.sizeLabel) + '</div>' +
          (d.summary ? '<div class="hc-cafe-line__mods">' + c.esc(d.summary) + '</div>' : '<div class="hc-cafe-line__mods">Black</div>') +
          '<div class="hc-cafe-line__edit">' +
            '<button type="button" data-action="cafe" data-cafe="edit" data-id="' + c.esc(l.key) + '">Edit</button>' +
            '<span aria-hidden="true">·</span>' +
            '<button type="button" data-action="cafe" data-cafe="remove" data-id="' + c.esc(l.key) + '">Remove</button>' +
          '</div>' +
        '</div>' +
        '<div class="hc-cafe-line__price">' + c.esc(HC.cafe.money(d.price)) + '</div>' +
      '</div>';
    });
    html += '</div>';

    html += '<button type="button" class="hc-cafe-addmore" data-action="cafe" data-cafe="menu">+ Add another drink</button>';

    var closed = HC.cafe.closedReason();
    if (closed) {
      html += '<p class="hc-body-serif hc-cafe-note">' + c.esc(closed) + '</p>';
      return html;
    }

    if (!HC.cafe.signedIn()) {
      html += '<div class="hc-card hc-card--edge hc-cafe-signin">' +
        '<p class="hc-body-serif">Sign in to order ahead, so your order is yours and we can tell you when it’s ready.</p>' +
        c.button('Sign in', { action: 'go-profile' }) +
      '</div>';
      return html;
    }

    var times = HC.cafe.pickupTimes();
    var asapOk = HC.cafe.asapOffered();
    var picks = times.map(HC.cafe.hhmm);
    if (asapOk) picks.unshift(HC.cafe.ASAP);
    if (picks.indexOf(state.pickup) < 0) state.pickup = null;

    html += '<label class="hc-cafe__label hc-cafe__label--gap" for="hc-cafe-pickup">When will you pick it up?</label>' +
      '<select id="hc-cafe-pickup" class="hc-input hc-select hc-cafe-pickup" data-cafe-field="pickup">' +
        '<option value=""' + (state.pickup ? '' : ' selected') + ' disabled>Choose a time</option>' +
        (asapOk ? '<option value="' + HC.cafe.ASAP + '"' + (state.pickup === HC.cafe.ASAP ? ' selected' : '') +
          '>As soon as it’s ready</option>' : '') +
        times.map(function (m) {
          var v = HC.cafe.hhmm(m);
          var svc = HC.cafe.nearestService(m);
          var at = svc == null ? '' : HC.cafe.clockText(HC.cafe.hhmm(svc)) + ' service';
          var note = !at ? '' : m < svc ? ', before the ' + at : m === svc ? ', as the ' + at + ' starts' : ', after the ' + at;
          return '<option value="' + v + '"' + (state.pickup === v ? ' selected' : '') + '>' +
            c.esc(HC.cafe.clockText(v) + note) + '</option>';
        }).join('') +
      '</select>';

    var name = state.name == null ? HC.cafe.cupName() : state.name;
    html += '<label class="hc-cafe__label hc-cafe__label--gap" for="hc-cafe-name">Name for the cup</label>' +
      '<input id="hc-cafe-name" class="hc-input hc-cafe-name" type="text" maxlength="40" autocomplete="given-name" ' +
        'data-cafe-field="name" value="' + c.esc(name) + '" placeholder="Your first name">';

    var sub = cartTotal();
    var tax = HC.cafe.tax(sub, HC.data.setting('cafe_tax_percent', '0'));
    html += '<div class="hc-cafe-totals">' +
      '<div><span>Subtotal</span><span>' + c.esc(HC.cafe.money(sub)) + '</span></div>' +
      (tax ? '<div><span>Tax</span><span>' + c.esc(HC.cafe.money(tax)) + '</span></div>' : '') +
      '<div class="hc-cafe-totals__big"><span>Total</span><span>' + c.esc(HC.cafe.money(sub + tax)) + '</span></div>' +
    '</div>';

    if (state.error) html += '<p class="hc-cafe-error" role="alert">' + c.esc(state.error) + '</p>';

    var ready = !!state.pickup && !!String(name || '').trim();
    html += '<button type="button" class="hc-btn hc-btn--primary hc-cafe-wide" data-action="cafe" data-cafe="pay"' +
      (!ready || state.busy ? ' disabled' : '') + (state.busy ? ' aria-busy="true"' : '') + '>' +
      '<span>' + (state.busy ? 'Opening Square…' : 'Pay and send to the cafe') + '</span>' +
      '<span>' + c.esc(HC.cafe.money(sub + tax)) + '</span></button>';
    if (!ready && !state.busy) {
      html += '<p class="hc-caption hc-cafe-hint">' +
        (state.pickup ? 'Add a name for the cup to keep going.' : 'Choose a time to keep going.') + '</p>';
    }
    html += '<p class="hc-caption hc-cafe-square">Secure checkout by Square. Apple Pay, card, or Cash App.</p>';
    return html;
  }

  /* ----------------------------------------------------------- ticket */

  function statusLine(o) {
    var at = pickupLabel(o);
    var asap = o.slot_id === HC.cafe.ASAP;
    if (o.status === 'pending_payment') return 'Waiting on payment';
    if (o.status === 'ready') return 'Ready now at the counter';
    if (o.status === 'picked_up') return 'Picked up. Enjoy.';
    if (o.status === 'cancelled') return 'Cancelled';
    if (o.status === 'making') return asap ? 'Being made now' : 'Being made now, for ' + at;
    return asap ? 'In the queue, ready as soon as it’s made' : 'In the queue for ' + at;
  }

  var STEPS = [
    { key: 'paid', label: 'Paid' },
    { key: 'queued', label: 'In the queue' },
    { key: 'making', label: 'Making' },
    { key: 'ready', label: 'Ready' }
  ];

  function stepIndex(status) {
    if (status === 'paid') return 1;
    if (status === 'making') return 2;
    if (status === 'ready' || status === 'picked_up') return 3;
    return -1;
  }

  function ticketView(id) {
    var t = state.ticket && state.ticket.id === id ? state.ticket : null;
    var html = logo('hc-cafe__logo--small');

    if (!t || (!t.order && !t.error)) {
      return html + '<p class="hc-caption hc-cafe__open">Finding your order…</p>';
    }
    if (!t.order) {
      return html + c.emptyState(t.error || 'We could not find that order.', 'coffee');
    }

    var o = t.order;
    var at = pickupLabel(o);
    var service = pickupService(o);

    if (o.status === 'pending_payment') {
      html += '<div class="hc-card hc-cafe-ticket">' +
        '<span class="hc-eyebrow hc-eyebrow--legible">Almost there</span>' +
        '<p class="hc-cafe-ticket__big hc-cafe-ticket__big--words">Finish paying on Square’s page</p>' +
        '<p class="hc-caption">As soon as Square says it’s paid, your drink joins the queue and this page shows your ticket number.</p>' +
        '<div class="hc-cafe-actions">' +
          (o.checkout_url ? '<button type="button" class="hc-btn hc-btn--primary" data-action="cafe" data-cafe="reopen"><span>Open the checkout again</span></button>' : '') +
          '<button type="button" class="hc-btn hc-btn--secondary" data-action="cafe" data-cafe="check"><span>I’ve paid, check again</span></button>' +
        '</div>' +
      '</div>';
    } else if (o.status === 'cancelled') {
      html += '<div class="hc-card hc-cafe-ticket"><span class="hc-eyebrow hc-eyebrow--legible">Cancelled</span>' +
        '<p class="hc-caption">This order was cancelled. If you were charged, find us at the counter and we’ll sort it out.</p></div>';
    } else {
      var ready = o.status === 'ready' || o.status === 'picked_up';
      var idx = stepIndex(o.status);
      html += '<div class="hc-card hc-cafe-ticket' + (ready ? ' hc-cafe-ticket--ready' : '') + '">' +
        '<span class="hc-eyebrow hc-eyebrow--legible">' +
          (o.status === 'picked_up' ? 'Enjoy' : ready ? 'It’s ready' : 'You’re in line') + '</span>' +
        '<p class="hc-cafe-ticket__big">#' + c.esc(o.ticket_no || '') + '</p>' +
        (ready
          ? '<p class="hc-body-serif hc-cafe-ticket__when">Waiting for you at the counter, ' + c.esc(o.cup_name) + '.</p>'
          : (o.slot_id === HC.cafe.ASAP
              ? '<p class="hc-body-serif hc-cafe-ticket__when">Ready <b>as soon as it’s made</b></p>'
              : '<p class="hc-body-serif hc-cafe-ticket__when">Ready at <b>' + c.esc(at) + '</b>' +
                (service ? ', around the ' + c.esc(service) + ' service' : '') + '</p>') +
            (t.ahead != null
              ? '<p class="hc-caption">' + (t.ahead === 0 ? 'You’re next.' : t.ahead === 1 ? '1 drink ahead of yours' : c.esc(t.ahead) + ' drinks ahead of yours') + '</p>'
              : '')) +
        '<ol class="hc-cafe-track">' +
          STEPS.map(function (s, i) {
            var cls = i < idx ? ' is-done' : i === idx ? ' is-done is-now' : '';
            if (i === 0) cls = ' is-done' + (idx === 0 ? ' is-now' : '');
            return '<li class="hc-cafe-track__s' + cls + '">' + c.esc(s.label) + '</li>';
          }).join('') +
        '</ol>' +
      '</div>';
    }

    html += '<p class="hc-cafe__label">What you ordered</p><div class="hc-cafe-lines">';
    (o.items || []).forEach(function (l) {
      html += '<div class="hc-cafe-line"><div class="hc-cafe-line__body">' +
        '<div class="hc-cafe-line__name">' + c.esc(l.name + ', ' + l.size_label) + '</div>' +
        '<div class="hc-cafe-line__mods">' + c.esc(l.summary || 'Black') + '</div>' +
      '</div></div>';
    });
    html += '</div>';
    html += '<div class="hc-cafe-totals"><div class="hc-cafe-totals__big"><span>Paid</span><span>' +
      c.esc(HC.cafe.money(o.total_cents)) + '</span></div></div>';

    if (o.status !== 'pending_payment' && o.status !== 'picked_up') {
      html += '<p class="hc-caption hc-cafe-hint">We’ll send a notification the moment it’s ready. ' +
        'Look for your name at the counter in the lobby.</p>';
    }
    html += '<div class="hc-cafe-actions">' +
      '<button type="button" class="hc-btn hc-btn--tertiary" data-action="cafe" data-cafe="menu"><span>Back to the menu</span></button>' +
    '</div>';
    return html;
  }

  function loadTicket(id, quiet) {
    if (!state.ticket || state.ticket.id !== id) state.ticket = { id: id, order: null, ahead: null, error: '' };
    var t = state.ticket;
    var before = t.order ? t.order.status : null;

    var first = t.order && t.order.status === 'pending_payment'
      ? HC.cafe.refresh(id).catch(function () { return null; })
      : Promise.resolve(null);

    return first.then(function () { return HC.cafe.order(id); }).then(function (o) {
      if (!state.ticket || state.ticket.id !== id) return;
      t.order = o;
      t.error = '';
      return (o.status === 'paid' || o.status === 'making') ? HC.cafe.ahead(id) : null;
    }).then(function (ahead) {
      if (!state.ticket || state.ticket.id !== id || !t.order) return;
      t.ahead = ahead;
      if (before && before !== 'ready' && t.order.status === 'ready') {
        HC.native.tap('Medium');
        c.toast('Your coffee’s ready. It’s waiting at the counter.');
      }
      if (here('t-' + id)) paint();
    }).catch(function (err) {
      if (!state.ticket || state.ticket.id !== id) return;
      if (!t.order) t.error = (err && err.message) || 'We could not find that order.';
      if (!quiet && here('t-' + id)) paint();
    });
  }

  /* ------------------------------------------------------------ queue */

  function queueView() {
    var html = c.sectionHeader('Happy Lion Cafe · Behind the counter', 'The queue', { flush: true, tag: 'h1' });
    if (!HC.cafe.isBarista()) {
      return html + c.emptyState('The queue is for whoever runs the cafe. An admin turns on Cafe mode for you under Manage users.', 'coffee');
    }
    var q = state.queue;
    if (q.error && !q.rows) return html + c.emptyState(q.error, 'coffee');
    if (!q.rows) return html + '<p class="hc-caption hc-cafe__open">Loading the queue…</p>';

    var rows = q.rows;
    var toMake = rows.filter(function (r) { return r.status === 'paid' || r.status === 'making'; });
    var waiting = rows.filter(function (r) { return r.status === 'ready'; });
    var done = rows.filter(function (r) { return r.status === 'picked_up'; });
    var drinks = function (list) { return list.reduce(function (n, r) { return n + (r.drinks || 1); }, 0); };

    html += '<div class="hc-cafe-stats">' +
      '<div class="hc-cafe-stat"><b>' + drinks(toMake) + '</b><span>to make</span></div>' +
      '<div class="hc-cafe-stat"><b>' + waiting.length + '</b><span>ready, not picked up</span></div>' +
      '<div class="hc-cafe-stat"><b>' + drinks(done) + '</b><span>done today</span></div>' +
    '</div>';

    html += '<div class="hc-cafe-pause">' + openBadge() + openControl() + '</div>';

    if (q.error) html += '<p class="hc-cafe-error" role="alert">' + c.esc(q.error) + '</p>';

    var live = toMake.concat(waiting);
    if (!live.length) {
      html += c.emptyState(done.length ? 'All caught up. Every order is out.' : 'No orders yet today. They show up here the moment somebody pays.', 'coffee');
    }

    var groups = [];
    live.slice().sort(function (a, b) {
      return String(a.pickup_at).localeCompare(String(b.pickup_at)) || (a.ticket_no - b.ticket_no);
    }).forEach(function (r) {
      var key = r.slot_id === HC.cafe.ASAP ? HC.cafe.ASAP : pickupLabel(r);
      var g = groups.filter(function (x) { return x.slot === key; })[0];
      if (!g) { g = { slot: key, rows: [] }; groups.push(g); }
      g.rows.push(r);
    });

    groups.forEach(function (g) {
      html += '<p class="hc-cafe-grp"><span>' +
        (g.slot === HC.cafe.ASAP ? 'As soon as it’s ready' : 'Due ' + c.esc(g.slot)) + '</span><span>' +
        g.rows.length + (g.rows.length === 1 ? ' order' : ' orders') + '</span></p>';
      g.rows.forEach(function (r) { html += ticketCard(r); });
    });

    if (done.length) {
      html += '<p class="hc-cafe-grp"><span>Picked up</span><span>' + done.length + '</span></p>';
      done.slice(-5).reverse().forEach(function (r) {
        html += '<div class="hc-cafe-done"><span>#' + c.esc(r.ticket_no) + ' ' + c.esc(r.cup_name) + '</span>' +
          '<button type="button" data-action="cafe" data-cafe="status" data-id="' + c.esc(r.id) + '" data-to="ready">Undo</button></div>';
      });
    }
    return html;
  }

  function ticketCard(r) {
    var busy = state.queue.busy === r.id;
    var cls = r.status === 'making' ? ' hc-cafe-tick--making' : r.status === 'ready' ? ' hc-cafe-tick--ready' : '';
    var tag = r.status === 'making' ? 'Making' : r.status === 'ready' ? 'Ready' : '';
    var html = '<div class="hc-cafe-tick' + cls + '">' +
      '<div class="hc-cafe-tick__top"><span class="hc-cafe-tick__who">' + c.esc(r.cup_name) +
        (tag ? ' <span class="hc-cafe-tag">' + tag + '</span>' : '') + '</span>' +
        '<span class="hc-cafe-tick__no">#' + c.esc(r.ticket_no) + '</span></div>' +
      '<ul class="hc-cafe-tick__d">' +
        (r.items || []).map(function (l) {
          return '<li>' + c.esc(l.name + ' ' + l.size_label) + '<small>' + c.esc(l.summary || 'Black') + '</small></li>';
        }).join('') +
      '</ul><div class="hc-cafe-tick__a">';

    function btn(label, to, variant) {
      return '<button type="button" class="hc-btn hc-btn--' + variant + '" data-action="cafe" data-cafe="status" ' +
        'data-id="' + c.esc(r.id) + '" data-to="' + to + '"' + (busy ? ' disabled aria-busy="true"' : '') + '>' +
        '<span>' + c.esc(label) + '</span></button>';
    }
    if (r.status === 'paid') {
      html += btn('Start', 'making', 'secondary') + btn('Ready, notify ' + r.cup_name, 'ready', 'primary hc-cafe-readybtn');
    } else if (r.status === 'making') {
      html += btn('Ready, notify ' + r.cup_name, 'ready', 'primary hc-cafe-readybtn');
    } else if (r.status === 'ready') {
      html += btn('Picked up', 'picked_up', 'secondary');
    }
    html += '</div>';
    if (r.status === 'making') {
      html += '<button type="button" class="hc-cafe-undo" data-action="cafe" data-cafe="status" data-id="' + c.esc(r.id) + '" data-to="paid">Not started yet</button>';
    } else if (r.status === 'ready') {
      html += '<button type="button" class="hc-cafe-undo" data-action="cafe" data-cafe="status" data-id="' + c.esc(r.id) + '" data-to="making">Not ready after all</button>';
    }
    return html + '</div>';
  }

  function loadQueue() {
    if (!HC.cafe.isBarista() || !HC.cafe.signedIn()) return Promise.resolve();
    return Promise.all([HC.cafe.queue(), HC.cafe.refreshOpen()]).then(function (got) {
      state.queue.rows = got[0] || [];
      state.queue.error = '';
    }).catch(function (err) {
      state.queue.error = (err && err.message) || 'Could not reach the queue.';
    }).then(function () {
      if (here('queue')) paint();
    });
  }

  /* ---------------------------------------------------------- polling */

  function stopTimers() {
    if (timers.ticket) { clearInterval(timers.ticket); timers.ticket = null; }
    if (timers.queue) { clearInterval(timers.queue); timers.queue = null; }
    if (timers.open) { clearInterval(timers.open); timers.open = null; }
  }

  /* Open or closed, asked again now and every thirty seconds while the menu
     or the order is on screen, so the counter opening at 7:30 turns the
     line green on a phone that was already looking. Repaints only when it
     changed. */
  function watchOpen(id) {
    // Repaints when the answer changed, whether the counter flipped it or the
    // clock crossed 7:50 or 11:20 while somebody was looking.
    function check() {
      if (state.opening) return;
      HC.cafe.refreshOpen().then(function () {
        if (here(id) && HC.cafe.isOpen() !== state.shownOpen) paint();
      });
    }
    check();
    timers.open = setInterval(check, 30000);
  }

  /* Live only while somebody is looking: a ticket every five seconds, the
     counter every eight, and nothing at all once you leave the page. */
  function onView(r) {
    stopTimers();
    if (!r || r.name !== 'cafe') {
      if (state.sheet) { state.sheet = null; paintSheet(); }
      return;
    }
    var id = r.id || '';
    if (id.indexOf('t-') === 0) {
      var orderId = id.slice(2);
      loadTicket(orderId);
      timers.ticket = setInterval(function () {
        var t = state.ticket;
        if (t && t.order && (t.order.status === 'picked_up' || t.order.status === 'cancelled')) return;
        loadTicket(orderId, true);
      }, 5000);
    } else if (id === 'queue') {
      loadQueue();
      timers.queue = setInterval(loadQueue, 8000);
    } else if (id === 'order') {
      watchOpen('order');
    } else {
      HC.cafe.myOpenOrders().then(function (rows) {
        state.openOrders = Array.isArray(rows) ? rows : [];
        if (here('')) paint();
      });
      watchOpen('');
    }
  }

  if (HC.store && HC.store.on) HC.store.on('view', onView);

  // Back from Square's page, or back to the app at all: look again now
  // rather than at the next tick.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var r = route();
    if (r && r.name === 'cafe' && r.id && r.id.indexOf('t-') === 0) loadTicket(r.id.slice(2), true);
  });
  try {
    var P = window.Capacitor && window.Capacitor.Plugins;
    if (P && P.Browser && P.Browser.addListener) {
      P.Browser.addListener('browserFinished', function () {
        var r = route();
        if (r && r.name === 'cafe' && r.id && r.id.indexOf('t-') === 0) loadTicket(r.id.slice(2), true);
      });
    }
  } catch (e) { /* the web build has no in-app browser */ }

  /* ---------------------------------------------------------- the taps */

  function openSheet(itemId, key) {
    var item = HC.cafe.menu().filter(function (m) { return m.id === itemId; })[0];
    if (!item) return;
    var line = key ? cart().filter(function (l) { return l.key === key; })[0] : null;
    state.sheet = {
      itemId: itemId,
      key: line ? line.key : null,
      size: line ? line.size : ((item.sizes || [])[0] || {}).key,
      options: Object.assign(blankOptions(item), line ? line.options : {})
    };
    paintSheet();
  }

  var VERBS = {
    open: function (el) {
      if (HC.cafe.closedReason()) { c.toast(HC.cafe.closedReason()); return; }
      openSheet(el.getAttribute('data-id'), null);
    },
    edit: function (el) {
      var line = cart().filter(function (l) { return l.key === el.getAttribute('data-id'); })[0];
      if (line) openSheet(line.item_id, line.key);
    },
    close: function () { state.sheet = null; paintSheet(); },
    size: function (el) { state.sheet.size = el.getAttribute('data-id'); paintSheet(); },
    level: function (el) { state.sheet.options[el.getAttribute('data-key')] = el.getAttribute('data-id'); paintSheet(); },
    more: function (el) {
      var k = el.getAttribute('data-key');
      state.sheet.options[k] = (Number(state.sheet.options[k]) || 0) + 1;
      paintSheet();
    },
    less: function (el) {
      var k = el.getAttribute('data-key');
      state.sheet.options[k] = Math.max(0, (Number(state.sheet.options[k]) || 0) - 1);
      paintSheet();
    },
    add: function () {
      var s = state.sheet;
      var line = { item_id: s.itemId, size: s.size, options: s.options };
      if (s.key) {
        HC.cafe.replaceLine(s.key, line);
      } else if (!HC.cafe.addLine(line)) {
        c.toast('Up to 10 drinks in one order.');
        return;
      }
      HC.native.tap('Light');
      state.sheet = null;
      paintSheet();
      paint();
      if (!s.key) c.toast('Added to your order.');
    },
    remove: function (el) {
      HC.cafe.removeLine(el.getAttribute('data-id'));
      paint();
    },
    cart: function () { HC.router.go({ name: 'cafe', id: 'order' }); },
    menu: function () {
      var r = route();
      if (r && r.name === 'cafe' && r.id === 'order') HC.router.back();
      else HC.router.go({ name: 'cafe' });
    },
    queue: function () { HC.router.go({ name: 'cafe', id: 'queue' }); },
    ticket: function (el) { HC.router.go({ name: 'cafe', id: 't-' + el.getAttribute('data-id') }); },
    pay: function () {
      if (state.busy) return;
      var name = String(state.name == null ? HC.cafe.cupName() : state.name).trim();
      if (!state.pickup || !name) return;
      state.busy = true;
      state.error = '';
      paint();
      HC.cafe.checkout(state.pickup, name).then(function (res) {
        state.busy = false;
        state.pickup = null;
        state.ticket = { id: res.order_id, order: null, ahead: null, error: '' };
        HC.router.go({ name: 'cafe', id: 't-' + res.order_id }, { replace: true });
        c.openExternal(res.checkout_url);
      }).catch(function (err) {
        state.busy = false;
        state.error = (err && err.message) || 'The cafe could not take that order. Try again in a moment.';
        paint();
      });
    },
    reopen: function () {
      var o = state.ticket && state.ticket.order;
      if (o && o.checkout_url) c.openExternal(o.checkout_url);
    },
    check: function () {
      var t = state.ticket;
      if (!t) return;
      c.toast('Checking with Square…');
      loadTicket(t.id);
    },
    status: function (el) {
      var id = el.getAttribute('data-id');
      var to = el.getAttribute('data-to');
      if (state.queue.busy) return;
      state.queue.busy = id;
      paint();
      HC.cafe.setStatus(id, to).then(function (row) {
        HC.native.tap(to === 'ready' ? 'Medium' : 'Light');
        (state.queue.rows || []).forEach(function (r) {
          if (r.id === id && row) r.status = row.status;
        });
        if (to === 'ready' && row) c.toast(row.cup_name + ' has been told it’s ready.');
      }).catch(function (err) {
        c.toast((err && err.message) || 'That did not go through.');
      }).then(function () {
        state.queue.busy = '';
        loadQueue();
      });
    },
    /* Open, Closed, or back to the schedule. Tapping whichever one the
       schedule would say anyway hands today back to the schedule rather than
       pinning it, so the counter never has to think about which it is. */
    'open-state': function (el) {
      var want = el.getAttribute('data-id');
      if (state.opening) return;
      var st = HC.cafe.currentState();
      var sched = HC.cafe.openState({
        override: '', day: HC.cafe.churchNow().day, minutes: HC.cafe.churchNow().minutes,
        sunday: HC.cafe.churchNow().sunday, everyDay: HC.data.setting('cafe_every_day', false) === true,
        opensAt: st.opensAt, closesAt: st.closesAt
      });
      var next = want === 'schedule' ? 'schedule'
        : ((want === 'open') === sched.open ? 'schedule' : want);
      if (next === 'schedule' && st.by === 'schedule') return;
      state.opening = true;
      paint();
      HC.cafe.setOpen(next).then(function (open) {
        HC.native.tap('Medium');
        c.toast(next === 'schedule'
          ? 'Back on the Sunday schedule. The cafe is ' + (open ? 'open.' : 'closed.')
          : open ? 'The cafe is open for today. Everybody can see it.' : 'The cafe is closed for today.');
      }).catch(function (err) {
        c.toast((err && err.message) || 'That did not go through.');
      }).then(function () {
        state.opening = false;
        paint();
      });
    }
  };

  function act(el) {
    var verb = VERBS[el.getAttribute('data-cafe')];
    if (verb) verb(el);
  }

  function input(el) {
    // The pickup time. A <select> reports both 'input' and 'change', and the
    // iOS wheel only the second, once; repaint once per actual change.
    if (el.getAttribute('data-cafe-field') === 'pickup') {
      if (el.value === (state.pickup || '')) return;
      state.pickup = el.value || null;
      state.error = '';
      paint();
      return;
    }
    if (el.getAttribute('data-cafe-field') !== 'name') return;
    var had = !!String(state.name == null ? HC.cafe.cupName() : state.name).trim();
    state.name = el.value;
    var has = !!el.value.trim();
    // Only the pay button cares, and only when the box goes empty or stops
    // being empty, so typing does not rebuild the field under the caret.
    if (had !== has) {
      var btn = document.querySelector('[data-cafe="pay"]');
      if (btn) btn.disabled = !(has && state.pickup) || state.busy;
      var hint = document.querySelector('.hc-cafe-hint');
      if (hint && has && state.pickup) hint.remove();
    }
  }

  /* ----------------------------------------------------------- render */

  function body(r) {
    var id = (r && r.id) || '';
    if (id === 'queue') return queueView();
    if (!cafeOn() && !HC.cafe.isBarista()) {
      return logo() + c.emptyState(OFF_LINE, 'coffee');
    }
    if (id === 'order') return orderView();
    if (id.indexOf('t-') === 0) return ticketView(id.slice(2));
    return menuView();
  }

  function render(r) {
    return c.el('<div class="hc-screen hc-cafe" data-cafe-root>' + body(r || {}) + '</div>');
  }

  HC.screens = HC.screens || {};
  HC.screens.cafe = render;
  HC.screens.cafeHelpers = {
    act: act,
    input: input,
    paint: paint,
    titleFor: function (r) {
      var id = (r && r.id) || '';
      if (id === 'order') return 'Your order';
      if (id === 'queue') return 'The queue';
      if (id.indexOf('t-') === 0) return 'Your coffee';
      return 'Coffee';
    }
  };

})(window.HC = window.HC || {});
