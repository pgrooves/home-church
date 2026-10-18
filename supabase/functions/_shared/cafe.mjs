/**
 * Home Church, the Happy Lion Cafe's arithmetic.
 *
 * Plain JavaScript in its own file, the way tiktok-fetch/parse.mjs is, so the
 * two cafe Edge Functions and tests/cafe.test.js run the same lines. Nothing
 * here touches the network or the database: every function takes values and
 * returns values. The fetches live in the functions' index.ts files.
 *
 * THE RULE THIS FILE KEEPS: a price comes from the menu row, never from the
 * phone. priceCart() is handed what somebody tapped and the menu as the
 * database has it, and anything it cannot find on the menu is refused rather
 * than guessed at.
 */

export const MAX_DRINKS = 10;
export const CHURCH_TZ = 'America/Chicago';

export class CafeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------------------ menu */

function optionText(option, value) {
  const name = option.short || option.label;
  if (option.type === 'level') return `${name}, ${value}`;
  return `${value} ${name}`;
}

/**
 * One line of the cart, priced and described.
 *
 * `line` is { item_id, size, options: { [key]: value } }. Levels are a word
 * from the option's own list, counts a whole number up to its max. "none"
 * and 0 are the same as not choosing, and are left out of the summary.
 */
export function priceLine(menu, line) {
  const item = (menu || []).find((m) => m && m.id === line?.item_id);
  if (!item || item.available === false || item.published === false) {
    throw new CafeError('Something in your order is not on the menu right now.');
  }

  const size = (item.sizes || []).find((s) => s.key === line.size);
  if (!size) throw new CafeError(`Pick a size for the ${item.name}.`);

  const picked = line.options && typeof line.options === 'object' ? line.options : {};
  for (const key of Object.keys(picked)) {
    if (!(item.options || []).some((o) => o.key === key)) {
      throw new CafeError(`The ${item.name} does not come with that option.`);
    }
  }

  let price = Number(size.price_cents) || 0;
  const choices = [];

  for (const option of item.options || []) {
    const raw = picked[option.key];
    if (raw == null || raw === '') continue;

    if (option.type === 'level') {
      const levels = option.levels || [];
      if (!levels.includes(raw)) throw new CafeError(`Pick how much ${option.label} you want.`);
      if (raw === 'none') continue;
      choices.push({ key: option.key, label: option.label, value: raw, qty: 1, text: optionText(option, raw) });
      price += Number(option.price_cents) || 0;
    } else if (option.type === 'count') {
      const n = Number(raw);
      const max = Number(option.max) || 0;
      if (!Number.isInteger(n) || n < 0 || n > max) {
        throw new CafeError(`${option.label} is 0 to ${max}.`);
      }
      if (n === 0) continue;
      choices.push({ key: option.key, label: option.label, value: n, qty: n, text: optionText(option, n) });
      price += (Number(option.price_cents) || 0) * n;
    }
  }

  return {
    item_id: item.id,
    name: item.name,
    size: size.key,
    size_label: size.label,
    square_variation_id: size.square_variation_id || null,
    choices,
    summary: choices.map((c) => c.text).join(' · '),
    price_cents: price,
  };
}

export function priceCart(menu, lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CafeError('Your order is empty.');
  }
  if (lines.length > MAX_DRINKS) {
    throw new CafeError(`Up to ${MAX_DRINKS} drinks in one order.`);
  }
  const priced = lines.map((l) => priceLine(menu, l));
  return {
    lines: priced,
    drinks: priced.length,
    subtotal_cents: priced.reduce((sum, l) => sum + l.price_cents, 0),
  };
}

/** Tax on a subtotal, rounded half up to the cent the way a register does. */
export function taxCents(subtotalCents, percentText) {
  const pct = parseFloat(String(percentText ?? '').replace('%', '').trim());
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round(subtotalCents * pct / 100);
}

export function cleanName(name) {
  const flat = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) throw new CafeError('Put a name on the cup so we know it is yours.');
  return flat.slice(0, 40);
}

/* ------------------------------------------------------------------ time */

function parts(date, tz) {
  const out = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(date).forEach((p) => { out[p.type] = p.value; });
  return out;
}

/** The church's calendar date right now, as YYYY-MM-DD. */
export function churchDay(now = new Date(), tz = CHURCH_TZ) {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

function minutesOf(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes past midnight on the church clock. */
export function churchMinutes(now = new Date(), tz = CHURCH_TZ) {
  const p = parts(now, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

/**
 * Open or closed, and why.
 *
 * THE SCHEDULE: on Sunday (or every day, while cafe_every_day is on for
 * testing) from opensAt to closesAt, church time. By default 7:50, ten
 * minutes before the 8:00 service, to 11:20, twenty after the 11:00.
 *
 * THE COUNTER: cafe_open_override is "open YYYY-MM-DD" or "closed
 * YYYY-MM-DD", from the Open and Closed buttons, and it beats the schedule
 * for that date only. Anything else, including yesterday's, is ignored, so
 * an off day never carries over to the next Sunday.
 *
 * Returns { open, by: 'counter' | 'schedule', opensAt, closesAt }.
 */
export function openState({ override, day, minutes, sunday, everyDay = false, opensAt = '07:50', closesAt = '11:20' }) {
  const o = /^(open|closed)\s+(\d{4}-\d{2}-\d{2})$/.exec(String(override ?? '').trim());
  if (o && o[2] === day) return { open: o[1] === 'open', by: 'counter', opensAt, closesAt };
  const from = minutesOf(opensAt);
  const to = minutesOf(closesAt);
  const open = (sunday || everyDay) && from != null && to != null && minutes >= from && minutes < to;
  return { open, by: 'schedule', opensAt, closesAt };
}

export function isSunday(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

/**
 * A wall clock time on a church date, as an instant. Worked out by asking
 * what the church's clock reads at a first guess and correcting by the
 * difference, which handles daylight saving without a timezone library.
 */
export function churchInstant(day, time, tz = CHURCH_TZ) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess), tz);
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += wanted - seen;
  }
  return new Date(guess);
}

/**
 * "As soon as it's ready", offered only while the counter has opened the
 * cafe by hand (see openState). The 'asap' row in cafe_slots exists so an
 * order can point at it; it is inactive so it never shows on its own.
 */
export const ASAP_SLOT = 'asap';
export const ASAP_MINUTES = 10;

export function asapProblem(open) {
  if (!open || !open.open) return 'The cafe is closed right now. Ordering ahead opens when it does.';
  if (open.by !== 'counter') return 'That pickup time is not offered.';
  return null;
}

/** Minutes before a pickup time that ordering for it closes. */
export const SLOT_CUTOFF_MINUTES = 5;

/**
 * Whether a pickup time can be ordered for right now, and why not.
 * Returns null when it can, or the sentence to show when it cannot.
 */
export function slotProblem({ slot, day, now = new Date(), everyDay = false, load = 0, capacity = 0, closesAt = '' }) {
  if (!slot || slot.active === false) return 'That pickup time is not offered.';
  if (!everyDay && !isSunday(day)) return 'Ordering opens Sunday morning.';
  const close = minutesOf(closesAt);
  if (close != null && minutesOf(slot.pickup_time) > close) {
    return 'That pickup time is after the cafe closes. Pick an earlier one.';
  }
  const at = churchInstant(day, slot.pickup_time);
  if (at.getTime() - now.getTime() < SLOT_CUTOFF_MINUTES * 60000) {
    return 'That pickup time has passed. Pick a later one.';
  }
  if (capacity > 0 && load >= capacity) return 'That pickup time is full. Pick another.';
  return null;
}

/* --------------------------------------------------------- chosen times */

/**
 * PICKUP AT A TIME SOMEBODY CHOOSES. Rather than a short list of fixed times,
 * the phone offers every five minutes the cafe is open for, and the order
 * points at the 'pick' row in cafe_slots (inactive, like 'asap', migration
 * 0087) with the time itself in pickup_at.
 *
 * THE WINDOW. Run by the schedule it is cafe_opens_at to cafe_closes_at (ten
 * minutes before the first service to twenty after the last), and never
 * sooner than SLOT_CUTOFF_MINUTES from now. Opened by hand at the counter it
 * starts from now, and runs to closing or an hour out, whichever is later, so
 * an off day has times to pick too.
 *
 * pickupTimes is the list, in minutes past midnight, church time; js/cafe.js
 * has the same function and tests/cafe.test.js holds the two together.
 */
export const PICK_SLOT = 'pick';
export const PICK_STEP = 5;
export const PICK_REACH_MINUTES = 60;

export function pickupTimes({ open, minutes }) {
  if (!open || !open.open) return [];
  const opens = minutesOf(open.opensAt);
  const closes = minutesOf(open.closesAt);
  let from = minutes + SLOT_CUTOFF_MINUTES;
  let to;
  if (open.by === 'schedule') {
    if (opens != null) from = Math.max(from, opens);
    to = closes ?? -1;
  } else {
    to = Math.max(closes ?? 0, from + PICK_REACH_MINUTES);
  }
  from = Math.ceil(from / PICK_STEP) * PICK_STEP;
  to = Math.min(to, 24 * 60 - PICK_STEP);
  const out = [];
  for (let m = from; m <= to; m += PICK_STEP) out.push(m);
  return out;
}

/** 570 as '09:30', the way cafe-checkout is sent a chosen time. */
export function hhmm(m) {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/**
 * Whether a chosen time can be ordered for, and why not. `load` is drinks
 * already due within five minutes either side of it, this order included.
 */
export function pickupProblem({ time, open, minutes, load = 0, capacity = 0 }) {
  if (!open || !open.open) return 'The cafe is closed right now. Ordering ahead opens when it does.';
  const m = /^\d{1,2}:\d{2}$/.test(String(time ?? '').trim()) ? minutesOf(time) : null;
  if (m == null) return 'Pick a time to pick it up.';
  const times = pickupTimes({ open, minutes });
  if (!times.includes(m)) {
    if (times.length && m > times[times.length - 1]) return 'That pickup time is after the cafe closes. Pick an earlier one.';
    if (!times.length || m < times[0]) return 'That pickup time has passed. Pick a later one.';
    return 'That pickup time is not offered.';
  }
  if (capacity > 0 && load > capacity) return 'That time is busy. Pick one a little earlier or later.';
  return null;
}

/* ---------------------------------------------------------------- square */

export const SQUARE_VERSION = '2024-10-17';

export function squareBase(env) {
  return env === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

function money(cents) {
  return { amount: cents, currency: 'USD' };
}

/**
 * The CreatePaymentLink request for one order.
 *
 * Each drink is a line item, named the way the counter says it, with what
 * was picked as modifiers so it reads right on the owner's Square receipts
 * and order screen too. A size that has been linked to his Square item
 * library goes by its catalog id; until then it is an ad hoc line with the
 * price from our menu.
 */
export function paymentLinkBody({
  orderId, locationId, priced, cupName, pickupAt, taxPercent, tips, redirectUrl, email,
}) {
  const lineItems = priced.lines.map((l) => {
    const item = {
      quantity: '1',
      note: l.summary || undefined,
      modifiers: l.choices.length
        ? l.choices.map((c) => ({
            name: c.qty > 1 || typeof c.value === 'number' ? c.label : `${c.label} (${c.value})`,
            quantity: String(c.qty),
            base_price_money: money(0),
          }))
        : undefined,
    };
    if (l.square_variation_id) {
      item.catalog_object_id = l.square_variation_id;
    } else {
      item.name = `${l.name}, ${l.size_label}`;
      item.base_price_money = money(l.price_cents);
    }
    return item;
  });

  const pct = parseFloat(String(taxPercent ?? '').trim());
  const order = {
    location_id: locationId,
    reference_id: orderId,
    line_items: lineItems,
    fulfillments: [{
      type: 'PICKUP',
      state: 'PROPOSED',
      pickup_details: {
        recipient: { display_name: cupName },
        pickup_at: pickupAt.toISOString(),
        note: `Happy Lion Cafe, ordered in the Home Church app`,
      },
    }],
  };
  if (Number.isFinite(pct) && pct > 0) {
    order.taxes = [{ uid: 'sales-tax', name: 'Sales tax', percentage: String(pct), scope: 'ORDER' }];
  }

  const body = {
    idempotency_key: orderId,
    description: 'Happy Lion Cafe',
    order,
    checkout_options: {
      allow_tipping: !!tips,
      ask_for_shipping_address: false,
    },
  };
  if (redirectUrl) body.checkout_options.redirect_url = redirectUrl;
  // Square refuses buyer_email in pre_populated_data on an order that has a
  // fulfillment (CONFLICTING_PARAMETERS), so the email rides on the pickup's
  // recipient instead, where it still reaches the owner's order screen.
  if (email) order.fulfillments[0].pickup_details.recipient.email_address = email;
  return body;
}

/** Totals from Square's answer, falling back to ours if it left one out. */
export function totalsFromLink(response, fallback) {
  const order = response?.related_resources?.orders?.[0] || {};
  const total = order.total_money?.amount;
  const tax = order.total_tax_money?.amount;
  return {
    total_cents: Number.isInteger(total) ? total : fallback.total_cents,
    tax_cents: Number.isInteger(tax) ? tax : fallback.tax_cents,
  };
}

/**
 * A webhook delivery, reduced to the one thing this cares about: a payment
 * for an order that has gone through. Anything else is null.
 */
export function completedPayment(event) {
  const type = event?.type || '';
  if (type !== 'payment.created' && type !== 'payment.updated') return null;
  const p = event?.data?.object?.payment;
  if (!p || p.status !== 'COMPLETED' || !p.order_id) return null;
  return {
    payment_id: p.id || null,
    order_id: p.order_id,
    total_cents: Number.isInteger(p.total_money?.amount) ? p.total_money.amount : null,
    tip_cents: Number.isInteger(p.tip_money?.amount) ? p.tip_money.amount : 0,
  };
}

/* ------------------------------------------------------------ the menu */

/**
 * The add-ins every drink starts with, the same four 0085 seeded. Free, and
 * not in the owner's Square: they ride on the order as ad hoc modifiers so
 * the counter sees them. A drink the sync has seen before keeps whatever
 * options its row already has.
 */
const LEVELS = ['none', 'light', 'regular', 'extra'];
export const HOUSE_OPTIONS = [
  { key: 'half_and_half', label: 'Half & half', short: 'Half & half', group: 'Milk', type: 'level', levels: LEVELS },
  { key: 'two_percent', label: '2% milk', short: '2% milk', group: 'Milk', type: 'level', levels: LEVELS },
  { key: 'sugar', label: 'Sugar', short: 'sugar', group: 'Sweetener', type: 'count', max: 4, unit: 'Packets' },
  { key: 'splenda', label: 'Splenda', short: 'Splenda', group: 'Sweetener', type: 'count', max: 4, unit: 'Packets' },
];

const COLD_WORDS = /\b(cold|iced?|shaken|frapp\w*|smoothie|lemonade|vietnamese|vsc)\b/i;

function slug(text) {
  return String(text).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * ".Hot Coffee 08oz" as { base: 'Hot Coffee', oz: 8 }. The owner's register
 * names lead with a dot to sort them, and carry the size in the name because
 * each size is its own Square item. Either is optional.
 */
export function splitDrinkName(name) {
  const flat = String(name ?? '').replace(/^[\s.·•*_-]+/, '').replace(/\s+/g, ' ').trim();
  const m = /^(.*?)[\s,(-]*(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\.?\)?$/i.exec(flat);
  if (m) return { base: m[1].trim(), oz: Number(m[2]) };
  return { base: flat, oz: null };
}

function sizeOf(oz, fallbackName) {
  if (oz != null) return { key: `${oz}oz`, label: `${oz} oz`, oz };
  const label = String(fallbackName || 'Regular').trim() || 'Regular';
  return { key: slug(label) || 'regular', label, oz: null };
}

function presentAt(object, locationId) {
  if (!object || object.is_deleted) return false;
  if ((object.absent_at_location_ids || []).includes(locationId)) return false;
  return object.present_at_all_locations === true ||
    (object.present_at_location_ids || []).includes(locationId);
}

/**
 * The owner's Square library, as rows for cafe_menu_items.
 *
 * WHAT COMES FROM SQUARE: which drinks (every item in the category named
 * `category`, sold at this location, not archived), their names, sizes and
 * prices, the order he has them in, a description if he wrote one, and sold
 * out. Each size carries its variation id, so checkout sends Square his own
 * item and his reports are itemized.
 *
 * SIZES, TWO WAYS. One item per size, the way his register is set up
 * (".Hot Coffee 08oz", ".Hot Coffee 12oz"), is grouped into one drink by
 * name. One item with several variations is one drink with those sizes.
 *
 * WHAT STAYS OURS: the icon, the add-ins, and a blurb when Square has no
 * description, kept from the row if the drink is already on the menu
 * (`existing`), so a sync never undoes something set by hand. Square modifier
 * lists are not read yet; a drink that has some is named in `notes`.
 *
 * Returns { rows, notes, categoryFound }. Pure: no network, no database.
 */
export function menuFromCatalog({ objects, locationId, category, existing = [] }) {
  const notes = [];
  const want = String(category ?? '').trim().toLowerCase();
  const all = Array.isArray(objects) ? objects : [];
  const categoryIds = all
    .filter((o) => o?.type === 'CATEGORY' && !o.is_deleted &&
      String(o.category_data?.name ?? '').trim().toLowerCase() === want)
    .map((o) => o.id);
  if (!want || !categoryIds.length) return { rows: [], notes, categoryFound: false };

  const groups = new Map();
  for (const item of all) {
    if (item?.type !== 'ITEM' || !presentAt(item, locationId)) continue;
    const data = item.item_data || {};
    if (data.is_archived) continue;
    const cats = (data.categories || []).filter((c) => categoryIds.includes(c.id));
    if (!cats.length && !categoryIds.includes(data.category_id)) continue;

    const variations = (data.variations || []).filter((v) => {
      const vd = v.item_variation_data || {};
      return presentAt(v, locationId) && vd.sellable !== false &&
        vd.pricing_type !== 'VARIABLE_PRICING' && Number.isInteger(vd.price_money?.amount);
    });
    if (!variations.length) {
      notes.push(`${data.name || item.id} has no fixed price here, so it was left off.`);
      continue;
    }
    if ((data.modifier_list_info || []).some((m) => m.enabled !== false)) {
      notes.push(`${data.name || item.id} has add-ins in Square, which the app does not read yet.`);
    }

    const split = splitDrinkName(data.name);
    if (!split.base) split.base = String(data.name ?? '').trim() || item.id;
    const key = slug(split.base) || item.id.toLowerCase();
    const ordinal = cats.length ? Math.min(...cats.map((c) => Number(c.ordinal) || 0)) : 0;
    const g = groups.get(key) || { id: key, name: split.base, items: [], sizes: [], ordinal, blurb: null };
    g.ordinal = Math.min(g.ordinal, ordinal);
    g.items.push(item.id);
    const text = String(data.description_plaintext ?? '').trim();
    if (text && !g.blurb) g.blurb = text.slice(0, 160);

    for (const v of variations) {
      const vd = v.item_variation_data;
      const size = variations.length === 1 && split.oz != null
        ? sizeOf(split.oz)
        : sizeOf(splitDrinkName(vd.name).oz, vd.name);
      if (g.sizes.some((s) => s.key === size.key)) {
        notes.push(`${split.base} has two ${size.label} sizes in Square; the first one is used.`);
        continue;
      }
      const here = (vd.location_overrides || []).find((o) => o.location_id === locationId) || {};
      g.sizes.push({
        key: size.key,
        label: size.label,
        price_cents: Number.isInteger(here.price_money?.amount) ? here.price_money.amount : vd.price_money.amount,
        square_variation_id: v.id,
        oz: size.oz,
        ordinal: Number(vd.ordinal) || 0,
        sold_out: here.sold_out === true,
      });
    }
    groups.set(key, g);
  }

  const before = new Map((existing || []).map((r) => [r.id, r]));
  const rows = [...groups.values()]
    .filter((g) => g.sizes.length)
    .sort((a, b) => a.ordinal - b.ordinal || a.name.localeCompare(b.name))
    .map((g, i) => {
      const old = before.get(g.id);
      const sizes = g.sizes
        .sort((a, b) => (a.oz ?? Infinity) - (b.oz ?? Infinity) || a.ordinal - b.ordinal)
        .map(({ key, label, price_cents, square_variation_id }) => ({ key, label, price_cents, square_variation_id }));
      return {
        id: g.id,
        name: g.name,
        blurb: g.blurb || old?.blurb || null,
        icon: old?.icon || (COLD_WORDS.test(g.name) ? 'cold' : 'hot'),
        sizes,
        // Kept once set: a synced drink whose add-ins were cleared on purpose
        // stays without them.
        options: Array.isArray(old?.options) && (old.options.length || old.square_item_id != null)
          ? old.options : HOUSE_OPTIONS,
        square_item_id: g.items.join(','),
        sort_order: (i + 1) * 10,
        available: !g.sizes.every((s) => s.sold_out),
        published: true,
      };
    });

  return { rows, notes, categoryFound: true };
}

/* -------------------------------------------------------------- webhooks */

function toBase64(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Square signs HMAC-SHA256 over the notification URL, exactly as it is
 * written in the subscription, followed by the raw body, base64 encoded, in
 * x-square-hmacsha256-signature. Compared in constant time.
 */
export async function squareSignature(signatureKey, notificationUrl, rawBody) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(signatureKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(notificationUrl + rawBody));
  return toBase64(sig);
}

export async function verifySquareSignature(signatureKey, notificationUrl, rawBody, presented) {
  if (!signatureKey || !notificationUrl || !presented) return false;
  const want = await squareSignature(signatureKey, notificationUrl, rawBody);
  if (want.length !== presented.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ presented.charCodeAt(i);
  return diff === 0;
}
