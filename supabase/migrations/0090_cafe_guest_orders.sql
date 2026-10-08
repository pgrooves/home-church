-- ===========================================================================
-- Happy Lion Cafe: ordering without signing in
--
-- WHY. Apple turns away shops that make somebody create an account before
-- they can buy (Guideline 5.1.1), and nothing about a cup of coffee needs one.
-- A guest orders, pays on Square's page, follows the ticket, and is told it is
-- ready, the same as anybody signed in. The reasoning, and the limits that stop
-- a guest from holding every pickup time without paying, are at "guests" in
-- supabase/functions/_shared/cafe.mjs; cafe-checkout is the only writer.
--
-- WHAT CHANGES HERE
--   cafe_orders.user_id may be empty, for a guest. Every order still belongs
--   to somebody: an account, or the phone holding the key whose SHA-256 is
--   guest_key_hash. The check below says it has to be one or the other.
--
--   sender_hash is the peppered hash of the network a guest order came from,
--   the same kind the contact form keeps (0047). It is what limits unpaid
--   guest orders per network, and nothing else reads it.
--
--   Nothing new is readable. The read policy is still `user_id = auth.uid()`,
--   which no guest order can match, so a guest's order is reachable only
--   through cafe-checkout with its key. hc_cafe_ahead is rewritten to say so
--   in as many words rather than leaning on how a null compares.
--
--   Guest orders delete themselves after ninety days. An account's orders go
--   when the account does (the cascade from 0085); a guest has no account to
--   delete, so this is the line in the privacy policy that keeps them from
--   lasting forever. Square keeps its own record of the payment regardless.
--
-- Safe to run twice. Undone by supabase/rollback/0085_happy_lion_cafe_down.sql
-- with the rest of the cafe.
--
-- DEPLOY cafe-checkout WITH --no-verify-jwt AFTER THIS, see its header. Until
-- both are live, a phone with guest ordering gets "Sign in to order" back from
-- the server, and nothing else changes.
-- ===========================================================================

alter table public.cafe_orders alter column user_id drop not null;

alter table public.cafe_orders add column if not exists guest_key_hash text;
alter table public.cafe_orders add column if not exists sender_hash text;

alter table public.cafe_orders drop constraint if exists cafe_orders_has_owner;
alter table public.cafe_orders add constraint cafe_orders_has_owner
  check (user_id is not null or guest_key_hash is not null);

alter table public.cafe_orders drop constraint if exists cafe_orders_guest_key_shape;
alter table public.cafe_orders add constraint cafe_orders_guest_key_shape
  check (guest_key_hash is null or guest_key_hash ~ '^[0-9a-f]{64}$');

comment on column public.cafe_orders.guest_key_hash is
  'A guest order''s owner: SHA-256, in hex, of the key only the ordering phone holds. Empty for an order placed signed in.';
comment on column public.cafe_orders.sender_hash is
  'Peppered SHA-256 of the network a guest order came from, for the unpaid guest order limit in cafe-checkout. Never read for anything else.';

-- What the limit counts: unpaid guest orders from the last twenty minutes.
create index if not exists cafe_orders_guest_unpaid_idx
  on public.cafe_orders (created_at)
  where user_id is null and status = 'pending_payment';


-- Where am I in line, for a signed in phone. A guest asks cafe-checkout, which
-- checks the key; here an order with no account is nobody's.
create or replace function public.hc_cafe_ahead(p_order uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order public.cafe_orders;
begin
  select * into v_order from public.cafe_orders where id = p_order;
  if not found or v_order.user_id is null or auth.uid() is null
     or v_order.user_id <> auth.uid() then
    return null;
  end if;
  if v_order.status not in ('paid', 'making') then
    return 0;
  end if;

  return (
    select coalesce(sum(o.drinks), 0)::integer
      from public.cafe_orders o
     where o.service_day = v_order.service_day
       and o.status in ('paid', 'making')
       and o.id <> v_order.id
       and (o.pickup_at < v_order.pickup_at
            or (o.pickup_at = v_order.pickup_at and o.ticket_no < v_order.ticket_no))
  );
end;
$$;

revoke all on function public.hc_cafe_ahead(uuid) from public, anon;
grant execute on function public.hc_cafe_ahead(uuid) to authenticated;


-- Ninety days, then gone, for guest orders only.
create or replace function public.hc_purge_cafe_guest_orders(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.cafe_orders
   where user_id is null
     and created_at < now() - make_interval(days => greatest(coalesce(p_days, 90), 1));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.hc_purge_cafe_guest_orders(integer) from public, anon, authenticated;
grant execute on function public.hc_purge_cafe_guest_orders(integer) to service_role;

-- Nightly, the way 0022 schedules the group room sweep: only if pg_cron is
-- there, and loudly when it is not, because then the ninety days in the
-- privacy policy are not true until somebody turns it on.
do $$
declare
  v_jobid bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice '--------------------------------------------------------------';
    raise notice 'NOT SCHEDULED. pg_cron is not enabled on this project, so';
    raise notice 'guest cafe orders will not delete themselves after ninety';
    raise notice 'days. Enable it under Database -> Extensions -> pg_cron, then';
    raise notice 'run this migration again.';
    raise notice '--------------------------------------------------------------';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'hc-purge-cafe-guest-orders';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'hc-purge-cafe-guest-orders',
    '20 9 * * *',
    $cron$select public.hc_purge_cafe_guest_orders(90)$cron$
  );
  raise notice 'Scheduled hc-purge-cafe-guest-orders nightly at 09:20 UTC.';
end $$;
