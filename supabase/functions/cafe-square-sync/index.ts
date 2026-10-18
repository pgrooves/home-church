/**
 * Home Church, the Happy Lion Cafe's menu, read from the owner's Square.
 *
 * TWO ACTIONS, ADMINS ONLY.
 *
 *   { action: 'check' }
 *     Asks Square who the keys on these functions belong to: the business,
 *     the location, whether it is live, and which categories and items its
 *     library has. Changes nothing. It is how anybody can see the keys are
 *     good without placing an order, and when they are not, it says why
 *     without showing them (a sandbox token in production, a webhook key in
 *     the token's box).
 *
 *   { action: 'sync' }
 *     Copies the drinks in the Square category named by cafe_square_category
 *     onto cafe_menu_items, with Square's names, sizes and prices. See
 *     _shared/cafe-sync.ts. cafe-square-webhook does the same thing on its
 *     own whenever Square says the library changed; this is the button for
 *     the first time and for when a webhook went missing.
 *
 * WHO MAY CALL. A signed in admin, read fresh from profiles the way
 * admin-remove-user does it; the project's service role key; or the Sunday
 * morning job (hc_cafe_sync_menu, migration 0091), which presents the vault's
 * hc_cafe_sync_secret in x-hc-cafe-secret the way instagram-fetch is called.
 *
 * verify_jwt IS OFF, because that job has no JWT to present. Every caller is
 * checked here instead, and nothing is trusted from a token without asking
 * the auth server.
 *
 * WHAT IT NEEDS. The same secrets as cafe-checkout: SQUARE_ENV,
 * SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID. See
 * .claude/ledgers/happy-lion-cafe.md.
 *
 * DEPLOY
 *   supabase functions deploy cafe-square-sync --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { squareBase, priceLine, paymentLinkBody, SQUARE_VERSION } from '../_shared/cafe.mjs';
import { squareConfig, squareGet, syncMenu } from '../_shared/cafe-sync.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-hc-cafe-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* Same length and same characters, in time that does not depend on where
   they first differ. */
function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    console.error('cafe-square-sync: platform env vars missing');
    return json({ error: 'This is not set up correctly. Please tell the church.' }, 500);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const presented = req.headers.get('x-hc-cafe-secret') ?? '';
  let trusted = same(token, serviceKey);
  if (!trusted && presented) {
    const { data: secret, error } = await db.rpc('hc_cafe_sync_secret');
    if (error) console.error('cafe-square-sync: could not read hc_cafe_sync_secret', error.message);
    trusted = same(presented, String(secret ?? ''));
    if (!trusted) return json({ error: 'Not allowed.' }, 403);
  }
  if (!trusted && !token) return json({ error: 'You need to be signed in to do that.' }, 401);

  if (!trusted) {
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who, error: whoError } = await asCaller.auth.getUser();
    if (whoError || !who?.user) {
      return json({ error: 'That sign in has expired. Sign in again and try once more.' }, 401);
    }
    const { data: me } = await db.from('profiles').select('role').eq('id', who.user.id).maybeSingle();
    if (me?.role !== 'admin') return json({ error: 'Admins only.' }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body is a check */ }

  try {
    const action = body.action ?? 'check';
    if (action === 'check') return json(await check(db));
    if (action === 'sync') {
      const result = await syncMenu(db);
      return json(result, result.ok ? 200 : 409);
    }
    return json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('cafe-square-sync:', err);
    return json({ error: 'That did not go through. Try again in a moment.' }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function check(db: any) {
  const cfg = squareConfig();
  const out: Record<string, unknown> = {
    env: cfg.env,
    token_set: !!cfg.token,
    location_set: !!cfg.location,
  };
  if (!cfg.token || !cfg.location) return { ...out, ok: false, problem: 'A secret is missing.' };

  const loc = await squareGet(cfg, `/v2/locations/${encodeURIComponent(cfg.location)}`);
  if (!loc.ok) {
    // Why, without ever showing the token: its shape, and whether the other
    // environment takes it (the usual mistake is a sandbox token here).
    const other = cfg.env === 'production' ? 'sandbox' : 'production';
    const there = await squareGet({ ...cfg, base: squareBase(other) }, '/v2/locations');
    return {
      ...out, ok: false, problem: `Square refused (HTTP ${loc.status})`, errors: loc.errors,
      token_shape: {
        length: cfg.token.length,
        starts: cfg.token.slice(0, 4),
        has_quotes: /["']/.test(cfg.token),
        has_spaces: /\s/.test(cfg.token),
        // A webhook signature key pasted into the token's box is an easy slip.
        same_as_webhook_key: cfg.token === (Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') ?? '').trim(),
      },
      [`works_in_${other}`]: there.ok,
      [`${other}_locations`]: there.ok
        ? (there.payload.locations ?? []).map((x: { id?: string; name?: string }) => ({ id: x.id, name: x.name }))
        : undefined,
    };
  }
  const l = loc.payload.location ?? {};
  out.location = {
    name: l.name, business_name: l.business_name, status: l.status, currency: l.currency,
    city: l.address?.locality ?? null,
  };

  const cats = await squareGet(cfg, '/v2/catalog/list?types=CATEGORY');
  out.categories = cats.ok
    ? (cats.payload.objects ?? []).map((o: { category_data?: { name?: string } }) => o.category_data?.name)
    : { refused: cats.status, errors: cats.errors };

  // What checkout would be charged for the first drink on the menu, with an
  // add-in, asked of Square's calculator: the order checkout builds, priced
  // without creating anything in his account.
  const { data: menu } = await db.from('cafe_menu_items').select('*').eq('published', true).order('sort_order');
  const first = (menu ?? [])[0];
  if (first?.sizes?.length) {
    const option = (first.options ?? [])[0];
    const line = priceLine(menu, {
      item_id: first.id,
      size: first.sizes[0].key,
      options: option ? { [option.key]: option.type === 'level' ? option.levels?.[1] : 1 } : {},
    });
    const { order } = paymentLinkBody({
      orderId: crypto.randomUUID(), locationId: cfg.location,
      priced: { lines: [line], drinks: 1, subtotal_cents: line.price_cents },
      cupName: 'Check', pickupAt: new Date(), taxPercent: '0', tips: false, redirectUrl: '',
    });
    const res = await fetch(cfg.base + '/v2/orders/calculate', {
      method: 'POST',
      headers: { 'Square-Version': SQUARE_VERSION, Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    const calc = await res.json().catch(() => ({}));
    out.checkout = res.ok
      ? {
          drink: `${line.name}, ${line.size_label}${line.summary ? ` (${line.summary})` : ''}`,
          by_catalog_id: !!line.square_variation_id,
          app_price_cents: line.price_cents,
          square_total_cents: calc.order?.total_money?.amount ?? null,
          agrees: calc.order?.total_money?.amount === line.price_cents,
        }
      : { refused: res.status, errors: (calc.errors ?? []).map((e: { code?: string; detail?: string }) => `${e.code}: ${e.detail}`) };
  }

  return { ...out, ok: true };
}
