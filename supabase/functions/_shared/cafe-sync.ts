/**
 * Home Church, copying the Happy Lion Cafe's menu out of the owner's Square.
 *
 * Shared by cafe-square-sync (the Admin button) and cafe-square-webhook
 * (Square saying the library changed), so both write the menu the same way.
 * What a row looks like is decided in menuFromCatalog in cafe.mjs, which is
 * tested; this file is the fetching and the writing around it.
 *
 * TWO CATEGORIES. cafe_square_category is the drinks, cafe_square_food_category
 * the food. No food category in Square (or none set) is fine: the drinks
 * sync and the food is left as it was.
 *
 * NEVER EMPTIES THE MENU. A drinks category that is missing, or has nothing
 * in it that can be sold here, leaves the menu exactly as it was and says why
 * in cafe_square_synced. A food category that is there but empty takes the
 * food off, since that is how the owner says "no food this week".
 */

import { menuFromCatalog, squareBase, SQUARE_VERSION } from './cafe.mjs';

// deno-lint-ignore no-explicit-any
type Db = any;

export type SyncResult = {
  ok: boolean;
  skipped?: boolean;
  message: string;
  items?: { id: string; name: string; sizes: string[] }[];
  hidden?: string[];
  notes?: string[];
};

export function squareConfig() {
  const env = (Deno.env.get('SQUARE_ENV') ?? 'sandbox').trim().toLowerCase();
  const token = (Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '').trim();
  const location = (Deno.env.get('SQUARE_LOCATION_ID') ?? '').trim();
  return { env, token, location, base: squareBase(env) };
}

export async function squareGet(cfg: ReturnType<typeof squareConfig>, path: string) {
  const res = await fetch(cfg.base + path, {
    headers: {
      'Square-Version': SQUARE_VERSION,
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
  });
  const payload = await res.json().catch(() => ({}));
  const errors: string[] = Array.isArray(payload?.errors)
    ? payload.errors.map((e: { code?: string; detail?: string }) => `${e.code}: ${e.detail}`)
    : [];
  return { ok: res.ok, status: res.status, payload, errors };
}

function churchClock(d = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d);
}

/** What Admin shows under "Sync menu now". */
async function remember(db: Db, text: string) {
  const { error } = await db.from('app_settings').update({ value_text: text }).eq('key', 'cafe_square_synced');
  if (error) console.error('cafe-sync: could not record the result', error.message);
}

export async function syncMenu(db: Db): Promise<SyncResult> {
  const cfg = squareConfig();
  if (!cfg.token || !cfg.location) {
    return { ok: false, message: 'The Square keys are not set on the functions.' };
  }

  const { data: settings } = await db
    .from('app_settings').select('key, value_text')
    .in('key', ['cafe_square_category', 'cafe_square_food_category']);
  const named = (key: string) =>
    String(((settings ?? []) as { key: string; value_text: string | null }[])
      .find((r) => r.key === key)?.value_text ?? '').trim();
  const category = named('cafe_square_category');
  const foodCategory = named('cafe_square_food_category');
  if (!category) {
    return { ok: true, skipped: true, message: 'No Square category is set, so the menu is kept by hand.' };
  }

  // deno-lint-ignore no-explicit-any
  const objects: any[] = [];
  let cursor = '';
  for (let page = 0; page < 50; page++) {
    const r = await squareGet(cfg,
      `/v2/catalog/list?types=ITEM,CATEGORY,MODIFIER_LIST${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!r.ok) {
      console.error('cafe-sync: Square refused the catalog', r.status, r.errors.join('; '));
      const message = `Square would not hand over the menu (${r.status}). Nothing was changed.`;
      await remember(db, `${churchClock()} · ${message}`);
      return { ok: false, message };
    }
    objects.push(...(r.payload.objects ?? []));
    cursor = r.payload.cursor ?? '';
    if (!cursor) break;
  }

  const { data: existing, error: readError } = await db.from('cafe_menu_items').select('*');
  if (readError) throw readError;

  const drinks = menuFromCatalog({
    objects, locationId: cfg.location, category, existing: existing ?? [], kind: 'drink',
  });
  const food = foodCategory
    ? menuFromCatalog({ objects, locationId: cfg.location, category: foodCategory, existing: existing ?? [], kind: 'food' })
    : { rows: [], notes: [], categoryFound: false };
  const { categoryFound } = drinks;
  const notes = [...drinks.notes, ...food.notes];

  // A food item with a drink's name would share its id; it keeps its own.
  const taken = new Set(drinks.rows.map((r) => r.id));
  for (const r of food.rows) if (taken.has(r.id)) r.id = `${r.id}-food`;
  const rows = [...drinks.rows, ...food.rows];

  if (!categoryFound || !drinks.rows.length) {
    const message = categoryFound
      ? `“${category}” in Square has no drinks sold at this location. The menu was left as it was.`
      : `Square has no category called “${category}”. The menu was left as it was.`;
    await remember(db, `${churchClock()} · ${message}`);
    return { ok: false, message, notes };
  }

  const { error: writeError } = await db.from('cafe_menu_items').upsert(rows, { onConflict: 'id' });
  if (writeError) throw writeError;

  // Off the menu: whatever is no longer in its category. Food only when the
  // food category was found, so a food category not made yet hides nothing.
  const keep = new Set(rows.map((r) => r.id));
  const hidden = ((existing ?? []) as { id: string; name: string; published: boolean; kind?: string }[])
    .filter((r) => r.published && !keep.has(r.id) && (r.kind !== 'food' || food.categoryFound));
  if (hidden.length) {
    const { error } = await db.from('cafe_menu_items')
      .update({ published: false }).in('id', hidden.map((r) => r.id));
    if (error) throw error;
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const message = `${plural(drinks.rows.length, 'drink')} from “${category}”` + (
    !foodCategory ? ''
      : food.categoryFound ? `, ${plural(food.rows.length, 'food item')} from “${foodCategory}”`
      : `; no “${foodCategory}” category in Square yet, so no food`);
  await remember(db, `${churchClock()} · ${message}`);
  return {
    ok: true,
    message,
    items: rows.map((r) => ({ id: r.id, name: r.name, sizes: r.sizes.map((s: { label: string; price_cents: number }) => `${s.label} $${(s.price_cents / 100).toFixed(2)}`) })),
    hidden: hidden.map((r) => r.name),
    notes,
  };
}
