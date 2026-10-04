/**
 * Home Church, ordering from the Happy Lion Cafe.
 *
 * TWO ACTIONS, ONE SIGNED IN CALLER.
 *
 *   { action: 'create', lines, slot_id, cup_name, push_token? }
 *     Prices the order from cafe_menu_items (never from the phone), checks the
 *     pickup time is open and not full, asks Square for a payment link with
 *     the order on it, stores the order as pending_payment and hands back
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
 * WHO IS CALLING is the caller's own token, verified against the auth server,
 * the same way delete-account does it. A user id in the body is never read.
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
 *
 * Swapping Trey's sandbox for the cafe owner's live account is these values
 * and nothing else. See .claude/ledgers/happy-lion-cafe.md.
 *
 * DEPLOY
 *   supabase functions deploy cafe-checkout
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CafeError, priceCart, taxCents, cleanName, churchDay, churchInstant, churchMinutes, slotProblem,
  openState, isSunday, ASAP_SLOT, ASAP_MINUTES, asapProblem,
  paymentLinkBody, totalsFromLink, squareBase, SQUARE_VERSION,
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
  const user = who.user;

  const db: Db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  try {
    if (body.action === 'refresh') return json(await refresh(db, user.id, String(body.order_id ?? '')));
    if (body.action === 'create') return json(await create(db, user, body));
    return json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    if (err instanceof CafeError) return json({ error: err.message }, err.status);
    console.error('cafe-checkout:', err);
    return json({ error: 'That did not go through. Try again in a moment.' }, 500);
  }
});

/* ---------------------------------------------------------------- create */

async function create(
  db: Db,
  user: { id: string; email?: string },
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

  const { data: menu, error: menuError } = await db
    .from('cafe_menu_items').select('*').eq('published', true);
  if (menuError) throw menuError;
  const priced = priceCart(menu ?? [], body.lines as unknown[]);

  const { data: slot }: { data: Row } = await db
    .from('cafe_slots').select('*').eq('id', String(body.slot_id ?? '')).maybeSingle();

  const { data: loadRows } = await db.rpc('hc_cafe_slot_load', { p_day: day });
  const load = ((loadRows ?? []) as { slot_id: string; drinks: number }[])
    .find((r) => r.slot_id === slot?.id)?.drinks ?? 0;
  const capacity = slot?.capacity ?? parseInt(settingText(settings, 'cafe_slot_capacity', '0'), 10);

  const asap = slot?.id === ASAP_SLOT;
  const problem = asap ? asapProblem(open) : slotProblem({
    slot, day,
    // Opened by hand on an off day, the counter is there for as long as it
    // says, so only the schedule's closing time limits the pickup times.
    everyDay: settingBool(settings, 'cafe_every_day', false) || open.by === 'counter',
    closesAt: open.by === 'schedule' ? open.closesAt : '',
    load: load + priced.drinks - 1,
    capacity: Number.isFinite(capacity) ? capacity : 0,
  });
  if (problem) throw new CafeError(problem, 409);

  const pickupAt = asap
    ? new Date(Date.now() + ASAP_MINUTES * 60000)
    : churchInstant(day, slot.pickup_time);
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
    email: user.email,
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

  const { error: insertError } = await db.from('cafe_orders').insert({
    id: orderId,
    user_id: user.id,
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

  return { order_id: orderId, checkout_url: paymentLink.url, total_cents: totals.total_cents };
}

/* --------------------------------------------------------------- refresh */

async function refresh(db: Db, userId: string, orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new CafeError('No such order.', 404);

  const { data: order }: { data: Row } = await db
    .from('cafe_orders').select('*').eq('id', orderId).maybeSingle();
  if (!order || order.user_id !== userId) throw new CafeError('No such order.', 404);

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
