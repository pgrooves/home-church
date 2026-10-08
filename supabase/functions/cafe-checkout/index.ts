/**
 * Home Church, ordering from the Happy Lion Cafe.
 *
 * THREE ACTIONS, AND TWO KINDS OF CALLER.
 *
 *   { action: 'create', lines, pickup_time | slot_id, cup_name, push_token?, guest? }
 *     Prices the order from cafe_menu_items (never from the phone), checks the
 *     pickup time is open and not full (a chosen 'HH:MM', or slot_id 'asap'
 *     for as soon as it is ready; a fixed slot id still works for a phone
 *     that has not picked up the new screen yet), asks Square for a payment
 *     link with the order on it, stores the order as pending_payment and hands back
 *     { order_id, checkout_url }. The phone opens that URL in the in-app
 *     browser; Square's own page takes the money.
 *
 *   { action: 'refresh', order_id }
 *     Asks Square whether the order has been paid, and if it has, marks it
 *     paid here. The webhook (cafe-square-webhook) normally gets there first;
 *     this is what makes a missed or not-yet-configured webhook a delay rather
 *     than a lost order, and it is what the phone calls when somebody comes
 *     back from the checkout page.
 *
 *   { action: 'status', order_id, guest_key }
 *     A guest's ticket: the order as the ticket screen draws it, and how many
 *     drinks are ahead of it. Signed in phones read their own orders straight
 *     from the table instead, through its row level security.
 *
 * WHO IS CALLING. Somebody signed in is their own token, verified against the
 * auth server, the same way delete-account does it. A user id in the body is
 * never read.
 *
 * A GUEST says so, with `guest: true`, and presents no account at all (the
 * phone sends the publishable key, which proves nothing). Saying so is what
 * makes it a guest order: a signed in phone whose session has lapsed still
 * gets "sign in again" rather than quietly becoming a guest. On create a guest
 * is handed `guest_key`, a random key only that phone keeps; refresh and status
 * need it, and the order id alone is never enough. Only the key's SHA-256 is
 * stored. Unpaid guest orders are limited per network and in total, because
 * an unpaid order holds its drinks against a pickup time. The reasoning is at
 * "guests" in _shared/cafe.mjs; migration 0090 is the database half.
 *
 * WHAT IT NEEDS. Secrets on this function, none of them in git (the
 * repository is public):
 *
 *   SQUARE_ENV            sandbox or production
 *   SQUARE_ACCESS_TOKEN   the access token for that environment
 *   SQUARE_LOCATION_ID    the cafe's location in that account
 *   CAFE_RETURN_URL       optional; where Square sends somebody after paying.
 *                         Defaults to cafe-return.html on the church's
 *                         GitHub Pages site.
 *   CAFE_IP_PEPPER        optional but wanted; any long random string. Mixed
 *                         into the network address hash that limits unpaid
 *                         guest orders. Falls back to CONTACT_IP_PEPPER, then
 *                         to none (the limit still works, the hash is weaker).
 *
 * Swapping Trey's sandbox for the cafe owner's live account is these values
 * and nothing else. See .claude/ledgers/happy-lion-cafe.md.
 *
 * DEPLOY, with the JWT check OFF since guest ordering: a guest presents the
 * publishable key, which is not a JWT, and the gateway would turn them away
 * before this code could. Nothing is lost by it, because a signed in caller
 * is verified here, against the auth server, on every request.
 *   supabase functions deploy cafe-checkout --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CafeError, priceCart, taxCents, cleanName, churchDay, churchInstant, churchMinutes, slotProblem,
  openState, isSunday, ASAP_SLOT, ASAP_MINUTES, asapProblem, PICK_SLOT, pickupProblem,
  paymentLinkBody, totalsFromLink, squareBase, SQUARE_VERSION,
  GUEST_HOLD_MINUTES, newGuestKey, isGuestKey, sha256Hex, guestKeyMatches, guestLimitProblem,
  drinksAhead,
} from '../_shared/cafe.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_RETURN_URL = 'https://pgrooves.github.io/home-church/cafe-return.html';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// The generated database types are not checked in, so the client is typed
// loosely here, the same as everywhere else in supabase/functions.
// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Row = any;

type Settings = Record<string, { value_bool: boolean | null; value_text: string | null }>;

function settingBool(s: Settings, key: string, fallback: boolean): boolean {
  const v = s[key]?.value_bool;
  return typeof v === 'boolean' ? v : fallback;
}

function settingText(s: Settings, key: string, fallback: string): string {
  const v = s[key]?.value_text;
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function squareConfig() {
  const env = (Deno.env.get('SQUARE_ENV') ?? 'sandbox').trim().toLowerCase();
  const token = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';
  const location = Deno.env.get('SQUARE_LOCATION_ID') ?? '';
  if (!token || !location || (env !== 'sandbox' && env !== 'production')) return null;
  return { env, token, location, base: squareBase(env) };
}

async function square(
  cfg: NonNullable<ReturnType<typeof squareConfig>>,
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await fetch(cfg.base + path, {
    method,
    headers: {
      'Square-Version': SQUARE_VERSION,
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(payload?.errors)
      ? payload.errors.map((e: { code?: string; detail?: string }) => `${e.code}: ${e.detail}`).join('; ')
      : `HTTP ${res.status}`;
    console.error(`cafe-checkout: Square ${method} ${path} failed: ${detail}`);
    throw new CafeError('Square could not take that order just now. Try again in a moment.', 502);
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    console.error('cafe-checkout: platform env vars missing');
    return json({ error: 'This is not set up correctly. Please tell the church.' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Body must be a JSON object.' }, 400);
  }

  const db: Db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // A guest, by their own say so. Nothing in the Authorization header is
  // read for them; see the header of this file.
  let caller: Caller;
  if (body.guest === true) {
    const pepper = Deno.env.get('CAFE_IP_PEPPER') ?? Deno.env.get('CONTACT_IP_PEPPER') ?? '';
    caller = { guest: true, senderHash: await senderHash(callerIp(req), pepper) };
  } else {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Sign in to order from the cafe.' }, 401);

    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who, error: whoError } = await asCaller.auth.getUser();
    if (whoError || !who?.user) {
      return json({ error: 'That sign in has expired. Sign in again and try once more.' }, 401);
    }
    caller = { guest: false, user: who.user };
  }

  try {
    const orderId = String(body.order_id ?? '');
    const key = body.guest_key;
    if (body.action === 'refresh') return json(await refresh(db, await ownOrder(db, caller, orderId, key)));
    if (body.action === 'status') {
      if (!caller.guest) return json({ error: 'Unknown action.' }, 400);
      return json(await status(db, await ownOrder(db, caller, orderId, key)));
    }
    if (body.action === 'create') return json(await create(db, caller, body));
    return json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    if (err instanceof CafeError) return json({ error: err.message }, err.status);
    console.error('cafe-checkout:', err);
    return json({ error: 'That did not go through. Try again in a moment.' }, 500);
  }
});

/* ---------------------------------------------------------------- caller */

type Caller =
  | { guest: false; user: { id: string; email?: string } }
  | { guest: true; senderHash: string | null };

/* The caller's address, as the platform reports it, read the way
   supabase/functions/contact reads it. Empty on a local invocation, which
   means "this network cannot be limited", never an identity. */
function callerIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0].trim();
  return first || (req.headers.get('x-real-ip') ?? '').trim();
}

async function senderHash(ip: string, pepper: string): Promise<string | null> {
  return ip ? await sha256Hex(`${pepper}:${ip}`) : null;
}

/* The order, if it is this caller's: their account's, or a guest order whose
   key they hold. Anything else is "No such order", the same words whether it
   does not exist or is somebody else's, so the answer says nothing about
   which ids are real. */
async function ownOrder(db: Db, caller: Caller, orderId: string, key: unknown): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new CafeError('No such order.', 404);
  if (caller.guest && !isGuestKey(key)) throw new CafeError('No such order.', 404);

  const { data: order }: { data: Row } = await db
    .from('cafe_orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) throw new CafeError('No such order.', 404);

  if (caller.guest) {
    if (order.user_id !== null || !(await guestKeyMatches(key, order.guest_key_hash))) {
      throw new CafeError('No such order.', 404);
    }
  } else if (order.user_id !== caller.user.id) {
    throw new CafeError('No such order.', 404);
  }
  return order;
}

/* Unpaid guest orders still holding drinks: from this network, and from
   everybody. */
async function guestLimit(db: Db, senderHashValue: string | null) {
  const since = new Date(Date.now() - GUEST_HOLD_MINUTES * 60000).toISOString();
  const { data, error } = await db
    .from('cafe_orders')
    .select('sender_hash')
    .is('user_id', null)
    .eq('status', 'pending_payment')
    .gte('created_at', since);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  return guestLimitProblem({
    fromSender: senderHashValue ? rows.filter((r) => r.sender_hash === senderHashValue).length : null,
    atOnce: rows.length,
  });
}

/* ---------------------------------------------------------------- create */

async function create(
  db: Db,
  caller: Caller,
  body: Record<string, unknown>,
) {
  const cfg = squareConfig();
  if (!cfg) {
    console.error('cafe-checkout: SQUARE_ENV, SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID not set');
    throw new CafeError('The cafe is not taking orders in the app yet.', 503);
  }

  const { data: rows, error: settingsError } = await db
    .from('app_settings')
    .select('key, value_bool, value_text')
    .like('key', 'cafe_%');
  if (settingsError) throw settingsError;
  const settings: Settings = {};
  ((rows ?? []) as Row[]).forEach((r) => { settings[r.key] = r; });

  if (!settingBool(settings, 'cafe_on', false)) {
    throw new CafeError('The cafe is not taking orders in the app right now.', 409);
  }
  const day = churchDay();
  const open = openState({
    override: settingText(settings, 'cafe_open_override', ''),
    day,
    minutes: churchMinutes(),
    sunday: isSunday(day),
    everyDay: settingBool(settings, 'cafe_every_day', false),
    opensAt: settingText(settings, 'cafe_opens_at', '07:50'),
    closesAt: settingText(settings, 'cafe_closes_at', '11:20'),
  });
  if (!open.open) {
    throw new CafeError('The cafe is closed right now. Ordering ahead opens when it does.', 409);
  }

  const cupName = cleanName(body.cup_name);

  // Before Square is asked for anything, so a refused guest costs nothing.
  if (caller.guest) {
    const limited = await guestLimit(db, caller.senderHash);
    if (limited) throw new CafeError(limited, 429);
  }

  const { data: menu, error: menuError } = await db
    .from('cafe_menu_items').select('*').eq('published', true);
  if (menuError) throw menuError;
  const priced = priceCart(menu ?? [], body.lines as unknown[]);

  const capacitySetting = parseInt(settingText(settings, 'cafe_slot_capacity', '0'), 10);
  const chosen = typeof body.pickup_time === 'string' && body.pickup_time.trim()
    ? body.pickup_time.trim() : null;
  const slotId = chosen ? PICK_SLOT : String(body.slot_id ?? '');

  const { data: slot }: { data: Row } = await db
    .from('cafe_slots').select('*').eq('id', slotId).maybeSingle();
  if (!slot) throw new CafeError('That pickup time is not offered.', 409);

  let problem: string | null;
  let pickupAt: Date;
  if (chosen) {
    // The time first, so nothing below is handed a time that is not one.
    const minutes = churchMinutes();
    problem = pickupProblem({ time: chosen, open, minutes });
    pickupAt = problem ? new Date() : churchInstant(day, chosen);
    if (!problem) {
      problem = pickupProblem({
        time: chosen, open, minutes,
        load: (await drinksAround(db, day, pickupAt)) + priced.drinks,
        capacity: Number.isFinite(capacitySetting) ? capacitySetting : 0,
      });
    }
  } else if (slot.id === ASAP_SLOT) {
    pickupAt = new Date(Date.now() + ASAP_MINUTES * 60000);
    problem = asapProblem(open);
  } else {
    const { data: loadRows } = await db.rpc('hc_cafe_slot_load', { p_day: day });
    const load = ((loadRows ?? []) as { slot_id: string; drinks: number }[])
      .find((r) => r.slot_id === slot.id)?.drinks ?? 0;
    const capacity = slot.capacity ?? capacitySetting;
    pickupAt = churchInstant(day, slot.pickup_time);
    problem = slotProblem({
      slot, day,
      everyDay: settingBool(settings, 'cafe_every_day', false) || open.by === 'counter',
      closesAt: open.by === 'schedule' ? open.closesAt : '',
      load: load + priced.drinks - 1,
      capacity: Number.isFinite(capacity) ? capacity : 0,
    });
  }
  if (problem) throw new CafeError(problem, 409);

  const taxPercent = settingText(settings, 'cafe_tax_percent', '0');
  const tax = taxCents(priced.subtotal_cents, taxPercent);

  const orderId = crypto.randomUUID();
  const link = await square(cfg, 'POST', '/v2/online-checkout/payment-links', paymentLinkBody({
    orderId,
    locationId: cfg.location,
    priced,
    cupName,
    pickupAt,
    taxPercent,
    tips: settingBool(settings, 'cafe_tips_on', false),
    redirectUrl: (Deno.env.get('CAFE_RETURN_URL') ?? '').trim() || DEFAULT_RETURN_URL,
    // A guest has given no email, and Square's own page asks for one if the
    // cafe wants it.
    email: caller.guest ? undefined : caller.user.email,
  }));

  const paymentLink = link?.payment_link;
  if (!paymentLink?.url || !paymentLink?.order_id) {
    console.error('cafe-checkout: Square answered without a link', JSON.stringify(link).slice(0, 500));
    throw new CafeError('Square could not take that order just now. Try again in a moment.', 502);
  }

  const totals = totalsFromLink(link, {
    total_cents: priced.subtotal_cents + tax,
    tax_cents: tax,
  });

  const pushToken = typeof body.push_token === 'string' && body.push_token.length < 300
    ? body.push_token : null;

  const guestKey = caller.guest ? newGuestKey() : null;

  const { error: insertError } = await db.from('cafe_orders').insert({
    id: orderId,
    user_id: caller.guest ? null : caller.user.id,
    guest_key_hash: guestKey ? await sha256Hex(guestKey) : null,
    sender_hash: caller.guest ? caller.senderHash : null,
    service_day: day,
    slot_id: slot.id,
    pickup_at: pickupAt.toISOString(),
    cup_name: cupName,
    items: priced.lines,
    drinks: priced.drinks,
    subtotal_cents: priced.subtotal_cents,
    tax_cents: totals.tax_cents,
    total_cents: totals.total_cents,
    square_env: cfg.env,
    square_order_id: paymentLink.order_id,
    square_payment_link_id: paymentLink.id ?? null,
    checkout_url: paymentLink.url,
    push_token: pushToken,
  });
  if (insertError) throw insertError;

  return {
    order_id: orderId,
    checkout_url: paymentLink.url,
    total_cents: totals.total_cents,
    ...(guestKey ? { guest_key: guestKey } : {}),
  };
}

/**
 * Drinks already due within five minutes either side of a chosen time, which
 * is what cafe_slot_capacity limits for chosen times. Counted the same way
 * hc_cafe_slot_load counts: paid or further on, or still being paid for.
 */
async function drinksAround(db: Db, day: string, at: Date): Promise<number> {
  const { data, error } = await db
    .from('cafe_orders')
    .select('drinks, status, created_at')
    .eq('service_day', day)
    .gte('pickup_at', new Date(at.getTime() - 5 * 60000).toISOString())
    .lte('pickup_at', new Date(at.getTime() + 5 * 60000).toISOString());
  if (error) throw error;
  const fresh = Date.now() - GUEST_HOLD_MINUTES * 60000;
  return ((data ?? []) as Row[])
    .filter((o) => ['paid', 'making', 'ready', 'picked_up'].includes(o.status) ||
      (o.status === 'pending_payment' && new Date(o.created_at).getTime() > fresh))
    .reduce((n, o) => n + (o.drinks || 0), 0);
}

/* --------------------------------------------------------------- refresh */

async function refresh(db: Db, order: Row) {
  if (order.status !== 'pending_payment' || !order.square_order_id) {
    return { status: order.status, ticket_no: order.ticket_no };
  }

  const cfg = squareConfig();
  if (!cfg || cfg.env !== order.square_env) {
    return { status: order.status, ticket_no: order.ticket_no };
  }

  const found = await square(cfg, 'GET', `/v2/orders/${encodeURIComponent(order.square_order_id)}`);
  const tenders: { payment_id?: string }[] = found?.order?.tenders ?? [];

  for (const tender of tenders) {
    if (!tender.payment_id) continue;
    const pay = await square(cfg, 'GET', `/v2/payments/${encodeURIComponent(tender.payment_id)}`);
    const p = pay?.payment;
    if (p?.status !== 'COMPLETED') continue;

    const { data: paid, error } = await db.rpc('hc_cafe_mark_paid', {
      p_square_order_id: order.square_order_id,
      p_payment_id: p.id,
      p_total_cents: Number.isInteger(p.total_money?.amount) ? p.total_money.amount : null,
      p_tip_cents: Number.isInteger(p.tip_money?.amount) ? p.tip_money.amount : 0,
    });
    if (error) throw error;
    return { status: paid?.status ?? 'paid', ticket_no: paid?.ticket_no ?? null };
  }

  return { status: order.status, ticket_no: order.ticket_no };
}

/* ---------------------------------------------------------------- status */

/* What the ticket screen draws, and nothing it does not: no Square ids, no
   push token, no hashes. The same columns ORDER_COLUMNS in js/cafe.js asks
   the table for when the phone is signed in. */
const TICKET_COLUMNS = ['id', 'status', 'ticket_no', 'cup_name', 'slot_id', 'pickup_at', 'items',
  'drinks', 'subtotal_cents', 'tax_cents', 'tip_cents', 'total_cents', 'checkout_url',
  'service_day', 'created_at', 'ready_at'];

async function status(db: Db, order: Row) {
  const ticket: Record<string, unknown> = {};
  TICKET_COLUMNS.forEach((k) => { ticket[k] = order[k] ?? null; });

  let ahead = 0;
  if (order.status === 'paid' || order.status === 'making') {
    const { data, error } = await db
      .from('cafe_orders')
      .select('id, status, pickup_at, ticket_no, drinks, service_day')
      .eq('service_day', order.service_day)
      .in('status', ['paid', 'making']);
    if (error) throw error;
    ahead = drinksAhead(order, (data ?? []) as Row[]);
  }
  return { order: ticket, ahead };
}
