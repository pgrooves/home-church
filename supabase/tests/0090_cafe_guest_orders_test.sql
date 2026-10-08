-- ===========================================================================
-- Happy Lion Cafe: guest orders.
--
-- A guest order has no account, so the questions are who can reach it (only
-- cafe-checkout, with the key, which is not checked here because it is not in
-- the database), that the table still refuses an order belonging to nobody,
-- that the counter and the push still see it, and that guest orders, and only
-- guest orders, delete themselves.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function t_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  %', label;
  else raise warning 'FAIL  %  (got %, want %)', label, got, want; end if;
end;
$$;

create or replace function t_raises_like(label text, stmt text, want_fragment text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  %  (it was allowed)', label;
exception
  when others then
    if position(lower(want_fragment) in lower(sqlerrm)) > 0 then
      raise notice 'PASS  %', label;
    else
      raise warning 'FAIL  %  (refused with "%" rather than "%")', label, sqlerrm, want_fragment;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('cf900000-0000-0000-0000-000000000001', 'gbarista@example.com'),
  ('cf900000-0000-0000-0000-000000000002', 'gmember@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_run_cafe) values
  ('cf900000-0000-0000-0000-000000000001', 'Gus', true),
  ('cf900000-0000-0000-0000-000000000002', 'Gia', false)
  on conflict (id) do update set can_run_cafe = excluded.can_run_cafe;

-- The hash of a key, as cafe-checkout stores it.
\set guest_hash '''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''

-- ------------------------------------------------------------- the table ---

select t_raises_like('an order has to belong to somebody',
  $$insert into public.cafe_orders (user_id, service_day, slot_id, pickup_at, cup_name, items,
      drinks, subtotal_cents, total_cents, square_env)
    values (null, current_date, 'pick', now(), 'Nobody', '[]', 1, 300, 300, 'sandbox')$$,
  'cafe_orders_has_owner');

select t_raises_like('a guest key hash is a sha-256 in hex, not the key itself',
  $$insert into public.cafe_orders (user_id, guest_key_hash, service_day, slot_id, pickup_at,
      cup_name, items, drinks, subtotal_cents, total_cents, square_env)
    values (null, 'the-raw-key', current_date, 'pick', now(), 'Raw', '[]', 1, 300, 300, 'sandbox')$$,
  'cafe_orders_guest_key_shape');

insert into public.cafe_orders (id, user_id, guest_key_hash, sender_hash, service_day, slot_id,
    pickup_at, cup_name, items, drinks, subtotal_cents, total_cents, square_env, square_order_id,
    status, ticket_no, paid_at)
values
  ('cf900000-0000-0000-0000-0000000000a1', null, :guest_hash, 'net-1', public.hc_cafe_today(),
   'pick', now() + interval '30 minutes', 'Guest', '[]', 1, 300, 300, 'sandbox', 'sq-guest-1',
   'paid', 901, now()),
  ('cf900000-0000-0000-0000-0000000000a2', 'cf900000-0000-0000-0000-000000000002', null, null,
   public.hc_cafe_today(), 'pick', now() + interval '40 minutes', 'Gia', '[]', 2, 600, 600,
   'sandbox', 'sq-member-1', 'paid', 902, now());

-- An old guest order and an old member order, for the sweep.
insert into public.cafe_orders (id, user_id, guest_key_hash, service_day, slot_id, pickup_at,
    cup_name, items, drinks, subtotal_cents, total_cents, square_env, status, created_at)
values
  ('cf900000-0000-0000-0000-0000000000b1', null, :guest_hash, current_date - 100, 'pick',
   now() - interval '100 days', 'Old guest', '[]', 1, 300, 300, 'sandbox', 'picked_up',
   now() - interval '100 days'),
  ('cf900000-0000-0000-0000-0000000000b2', 'cf900000-0000-0000-0000-000000000002', null,
   current_date - 100, 'pick', now() - interval '100 days', 'Old member', '[]', 1, 300, 300,
   'sandbox', 'picked_up', now() - interval '100 days');

-- ---------------------------------------------------------- who can read ---

begin;
  set local role anon;
  select t_raises_like('signed out, the table is closed',
    $$select count(*) from public.cafe_orders$$, 'permission denied');
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cf900000-0000-0000-0000-000000000002"}';
  select t_check('a member sees their own order and not the guest''s',
    (select count(*)::int from public.cafe_orders
      where id in ('cf900000-0000-0000-0000-0000000000a1', 'cf900000-0000-0000-0000-0000000000a2')), 1);
  select t_check('hc_cafe_ahead tells a member nothing about a guest order',
    public.hc_cafe_ahead('cf900000-0000-0000-0000-0000000000a1'), null::integer);
  select t_check('and still answers for their own (the guest is ahead with one drink)',
    public.hc_cafe_ahead('cf900000-0000-0000-0000-0000000000a2'), 1);
rollback;

begin;
  set local role service_role;
  select t_check('hc_cafe_ahead answers nobody for a guest order, not even the server',
    public.hc_cafe_ahead('cf900000-0000-0000-0000-0000000000a1'), null::integer);
rollback;

-- ----------------------------------------------------------- the counter ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cf900000-0000-0000-0000-000000000001"}';
  select t_check('the counter sees the guest order',
    (select count(*)::int from public.hc_cafe_queue()
      where id = 'cf900000-0000-0000-0000-0000000000a1'), 1);
  select t_check('and can make it',
    (public.hc_cafe_set_status('cf900000-0000-0000-0000-0000000000a1', 'making')).status, 'making');
rollback;

-- ------------------------------------------------------------- the sweep ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cf900000-0000-0000-0000-000000000002"}';
  select t_raises_like('a member cannot run the sweep',
    $$select public.hc_purge_cafe_guest_orders(0)$$, 'permission denied');
rollback;

begin;
  set local role service_role;
  select t_check('the sweep removes the one old guest order',
    public.hc_purge_cafe_guest_orders(90), 1);
rollback;

select public.hc_purge_cafe_guest_orders(90);
select t_check('the old guest order is gone',
  (select count(*)::int from public.cafe_orders where id = 'cf900000-0000-0000-0000-0000000000b1'), 0);
select t_check('an old order on an account is not the sweep''s to take',
  (select count(*)::int from public.cafe_orders where id = 'cf900000-0000-0000-0000-0000000000b2'), 1);
select t_check('a recent guest order stays',
  (select count(*)::int from public.cafe_orders where id = 'cf900000-0000-0000-0000-0000000000a1'), 1);
