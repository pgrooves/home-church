/**
 * Home Church, the Happy Lion Cafe's menu, read from the owner's Square.
 *
 * TWO ACTIONS, ADMINS ONLY.
 *
 *   { action: 'check' }
 *     Asks Square who the keys on these functions belong to: the business,
 *     the location, whether it is live, and which categories its library
 *     has. Changes nothing. It is how anybody can see the keys are good
 *     without placing an order.
 *
 *   { action: 'sync' }
 *     (Built next.)
 *
 * WHO MAY CALL. A signed in admin, read fresh from profiles the way
 * admin-remove-user does it. The service role key is also accepted, so the
 * webhook and anybody with the dashboard can run it without a person.
 *
 * WHAT IT NEEDS. The same secrets as cafe-checkout: SQUARE_ENV,
 * SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID. See
 * .claude/ledgers/happy-lion-cafe.md.
 *
 * DEPLOY
 *   supabase functions deploy cafe-square-sync
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { squareBase, SQUARE_VERSION } from '../_shared/cafe.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function squareConfig() {
  const env = (Deno.env.get('SQUARE_ENV') ?? 'sandbox').trim().toLowerCase();
  const token = (Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '').trim();
  const location = (Deno.env.get('SQUARE_LOCATION_ID') ?? '').trim();
  return { env, token, location, base: squareBase(env) };
}

async function square(cfg: ReturnType<typeof squareConfig>, path: string) {
  const res = await fetch(cfg.base + path, {
    headers: {
      'Square-Version': SQUARE_VERSION,
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
  });
  const payload = await res.json().catch(() => ({}));
  const errors = Array.isArray(payload?.errors)
    ? payload.errors.map((e: { code?: string; detail?: string }) => `${e.code}: ${e.detail}`)
    : [];
  return { ok: res.ok, status: res.status, payload, errors };
}

/* The role a JWT claims. Only trusted because verify_jwt is ON for this
   function: the gateway has already checked the signature, so a token that
   reaches this line and says service_role is the project's own key. */
function jwtRole(token: string): string | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))).role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json({ error: 'Platform env missing.' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Admins only.' }, 401);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (token !== serviceKey && jwtRole(token) !== 'service_role') {
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who } = await asCaller.auth.getUser();
    if (!who?.user) return json({ error: 'That sign in has expired. Sign in again and try once more.' }, 401);
    const { data: me } = await db.from('profiles').select('role').eq('id', who.user.id).maybeSingle();
    if (me?.role !== 'admin') return json({ error: 'Admins only.' }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is a check */ }

  if ((body.action ?? 'check') === 'check') return json(await check());
  return json({ error: 'Unknown action.' }, 400);
});

async function check() {
  const cfg = squareConfig();
  const out: Record<string, unknown> = {
    env: cfg.env,
    token_set: !!cfg.token,
    token_looks_like: cfg.token ? cfg.token.slice(0, 4) + '…' : null,
    location_set: !!cfg.location,
  };
  if (!cfg.token || !cfg.location) return { ...out, ok: false, problem: 'A secret is missing.' };

  const loc = await square(cfg, `/v2/locations/${encodeURIComponent(cfg.location)}`);
  if (!loc.ok) {
    // Why, without ever showing the token: its shape, and whether the other
    // environment takes it (the usual mistake is a sandbox token here).
    const other = cfg.env === 'production' ? 'sandbox' : 'production';
    const there = await square({ ...cfg, base: squareBase(other) }, '/v2/locations');
    return {
      ...out, ok: false, problem: `Square refused (HTTP ${loc.status})`, errors: loc.errors,
      token_shape: {
        length: cfg.token.length,
        starts: cfg.token.slice(0, 4),
        has_quotes: /["']/.test(cfg.token),
        has_spaces: /\s/.test(cfg.token),
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
    city: l.address?.locality ?? null, capabilities: l.capabilities ?? [],
  };

  const cats = await square(cfg, '/v2/catalog/list?types=CATEGORY');
  out.categories = cats.ok
    ? (cats.payload.objects ?? []).map((o: { category_data?: { name?: string } }) => o.category_data?.name)
    : { refused: cats.status, errors: cats.errors };

  const items = await square(cfg, '/v2/catalog/list?types=ITEM');
  out.item_count_first_page = items.ok ? (items.payload.objects ?? []).length : { refused: items.status, errors: items.errors };

  return { ...out, ok: true };
}
