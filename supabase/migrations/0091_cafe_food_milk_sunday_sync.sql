-- ===========================================================================
-- 0091: the cafe's food, a milk choice, and a Sunday morning sync
--
-- Three things Trey asked for on 2026-10-18, on top of 0090.
--
-- FOOD. cafe_menu_items.kind is 'drink' or 'food', and the Coffee page draws
-- them under two headers, Drinks and Food, each of which folds away. Food
-- comes from its own category in the cafe's Square, cafe_square_food_category,
-- "Home Church Food" unless changed; until that category exists the sync
-- leaves food alone. Food has its own icon, a muffin, so `icon` may now be
-- 'food' as well as 'hot' and 'cold'.
--
-- MILK OR OAT MILK, AND NOTHING ELSE. The add-ins 0085 seeded (half & half
-- and 2% by how much, sugar and Splenda by the packet) are gone from every
-- drink: there is a condiment station for that. In their place one choice,
-- None, Milk or Oat milk, free. A 'pick' is a 'level' that reads as the word
-- picked ("Oat milk") rather than "Milk, oat milk". Food has no options.
-- Orders already placed keep what they were bought with, in their own items.
--
-- SUNDAY AT 6AM. The menu is copied from Square every Sunday at 6:00 church
-- time, on top of the webhook and the Admin button, so a webhook that went
-- missing during the week is put right before the doors open. pg_cron keeps
-- UTC and the church does not, so the job is at both 11:00 and 12:00 UTC on
-- Sunday and only goes through when it is 6 o'clock in America/Chicago, which
-- is exactly one of the two whether or not daylight saving is on.
--
-- The job reaches cafe-square-sync the way hc_sync_instagram reaches
-- instagram-fetch: a random secret in the vault, presented in a header, read
-- back by the function through a doorbell only service_role can ring.
--
-- Safe to run twice.
-- ===========================================================================


-- 1. Food -------------------------------------------------------------------

alter table public.cafe_menu_items
  add column if not exists kind text not null default 'drink';

alter table public.cafe_menu_items drop constraint if exists cafe_menu_items_kind;
alter table public.cafe_menu_items
  add constraint cafe_menu_items_kind check (kind in ('drink', 'food'));

alter table public.cafe_menu_items drop constraint if exists cafe_menu_items_icon;
alter table public.cafe_menu_items
  add constraint cafe_menu_items_icon check (icon in ('hot', 'cold', 'food'));

comment on column public.cafe_menu_items.kind is
  'drink or food: which header it sits under on the Coffee page. Set by the Square sync from the category it came from. 0091.';

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('cafe_square_food_category', 'Cafe: Square food category',
   'The category in the cafe’s Square whose items are the Food on the Coffee page, spelled as it is in Square. Until Square has it, the app shows drinks only.',
   'text', null, 'Home Church Food', 65)
on conflict (key) do nothing;


-- 2. Milk or oat milk -------------------------------------------------------

update public.cafe_menu_items
   set options = '[{"key":"milk","label":"Milk","group":"","type":"pick","levels":["none","Milk","Oat milk"]}]'::jsonb
 where kind = 'drink';

update public.cafe_menu_items
   set options = '[]'::jsonb
 where kind = 'food';

comment on column public.cafe_menu_items.options is
  '[{ "key": "milk", "label": "Milk", "group": "", "type": "pick", "levels": ["none","Milk","Oat milk"] }]. type is level (how much: "Half & half, light"), pick (which one: "Oat milk") or count (how many: "2 sugar", up to max). Free unless an entry carries price_cents. 0091.';


-- 3. Sunday at 6am ----------------------------------------------------------

do $$
begin
  -- The migration tests' stand-in vault has no secrets table to write to.
  if to_regclass('vault.secrets') is null then
    raise notice 'No vault.secrets here, so no hc_cafe_sync_secret. Fine in the migration tests.';
    return;
  end if;
  if not exists (select 1 from vault.secrets where name = 'hc_cafe_sync_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'hc_cafe_sync_secret',
      'Shared secret for the cafe-square-sync Edge Function. Read by that function at run time and by hc_cafe_sync_menu below, and by nothing else.'
    );
  end if;
end $$;

create or replace function public.hc_cafe_sync_secret()
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where name = 'hc_cafe_sync_secret';
$$;

-- Hands back a secret in the clear, so the grant is the whole boundary.
revoke all on function public.hc_cafe_sync_secret() from public, anon, authenticated;
grant execute on function public.hc_cafe_sync_secret() to service_role;

comment on function public.hc_cafe_sync_secret() is
  'Returns the hc_cafe_sync_secret vault value to the cafe-square-sync Edge Function, which cannot reach the vault schema over the Data API. service_role only: this returns a secret in plaintext. 0091.';

create or replace function public.hc_cafe_sync_menu()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_cafe_sync_secret';

  if v_secret is null then
    raise exception 'hc_cafe_sync_menu: hc_cafe_sync_secret is missing from the vault. Re-run migration 0091.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/cafe-square-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cafe-secret', v_secret
               ),
    body    := jsonb_build_object('action', 'sync'),
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_cafe_sync_menu() from public, anon, authenticated;
grant execute on function public.hc_cafe_sync_menu() to service_role;

comment on function public.hc_cafe_sync_menu() is
  'Asks cafe-square-sync to copy the menu from the cafe''s Square. Run by the hc-cafe-menu-sync job, Sundays at 6:00 church time. 0091.';

do $$
declare
  v_jobid bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'NOT SCHEDULED. pg_cron is not enabled. Then run:';
    raise notice '  select cron.schedule(''hc-cafe-menu-sync'', ''0 11,12 * * 0'', $c$select public.hc_cafe_sync_menu() where extract(hour from now() at time zone ''America/Chicago'') = 6;$c$);';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'hc-cafe-menu-sync';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  -- 11:00 UTC is 6:00 in Metairie while daylight saving is on, 12:00 UTC
  -- while it is off. Both are scheduled; the clock check lets one through.
  perform cron.schedule('hc-cafe-menu-sync', '0 11,12 * * 0',
    $c$select public.hc_cafe_sync_menu() where extract(hour from now() at time zone 'America/Chicago') = 6;$c$);
  raise notice 'Scheduled hc-cafe-menu-sync, Sundays at 6:00 church time.';
end
$$;
