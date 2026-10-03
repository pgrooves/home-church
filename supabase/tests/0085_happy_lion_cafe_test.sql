-- ===========================================================================
-- Happy Lion Cafe.
--
-- Nothing here reaches Square or APNs. What is checked is who can read and
-- move an order, that payment gives tickets in order and only once, and that
-- nobody hands themselves the counter.
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
  ('cf000000-0000-0000-0000-000000000001', 'cadmin@example.com'),
  ('cf000000-0000-0000-0000-000000000002', 'cbarista@example.com'),
  ('cf000000-0000-0000-0000-000000000003', 'ccustomer@example.com'),
  ('cf000000-0000-0000-0000-000000000004', 'cother@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('cf000000-0000-0000-0000-000000000001', 'Ada'),
  ('cf000000-0000-0000-0000-000000000002', 'Bo'),
  ('cf000000-0000-0000-0000-000000000003', 'Cy'),
  ('cf000000-0000-0000-0000-000000000004', 'Di')
  on conflict (id) do nothing;

update public.profiles set role = 'admin' where id = 'cf000000-0000-0000-0000-000000000001';

insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_push_cron_secret', 'harness-secret')
on conflict (name) do nothing;

-- ---------------------------------------------------------------- seeds ---

select t_check('two drinks on the menu',
  (select count(*)::int from public.cafe_menu_items), 2);
select t_check('nine pickup times',
  (select count(*)::int from public.cafe_slots), 9);
select t_check('the page ships switched off',
  (select value_bool from public.app_settings where key = 'cafe_on'), false);

-- -------------------------------------------------------------- the role ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cf000000-0000-0000-0000-000000000002"}';
  select t_raises_like('nobody gives themselves the counter',
    $$update public.profiles set can_run_cafe = true where id = 'cf000000-0000-0000-0000-000000000002'$$,
    'only an admin');
  select t_check('a member is not a barista', public.hc_is_barista(), false);
  select t_raises_like('a member cannot read the queue',
    $$select * from public.hc_cafe_queue()$$, 'counter only');
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cf000000-0000-0000-0000-000000000001"}';
  select public.hc_admin_set_barista('cf000000-0000-0000-0000-000000000002', true);
  select t_raises_like('an admin cannot set their own',
    $$select public.hc_admin_set_barista('cf000000-0000-0000-0000-000000000001', true)$$,
    'own tier');
  select t_check('the roster says who runs the counter',
    (select is_barista from public.hc_admin_list_users() where email = 'cbarista@example.com'), true);
commit;

-- ------------------------------------------------------------- an order ---

insert into public.cafe_orders (id, user_id, service_day, slot_id, pickup_at, cup_name,
  items, drinks, subtotal_cents, total_cents, square_env, square_order_id, push_token)
values
  ('cf100000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000003',
   public.hc_cafe_today(), '0920', now() + interval '1 hour', 'Cy',
   '[{"name":"Hot Coffee"}]', 1, 350, 350, 'sandbox', 'sq-1', 'tok-cy'),
  ('cf100000-0000-0000-0000-000000000002', 'cf000000-0000-0000-0000-000000000004',
   public.hc_cafe_today(), '0920', now() + interval '1 hour', 'Di',
   '[{"name":"Cold Brew"},{"name":"Cold Brew"}]', 2, 800, 800, 'sandbox', 'sq-2', null);

select t_check('the first paid order is ticket 1',
  (select ticket_no from public.hc_cafe_mark_paid('sq-2', 'pay-2')), 1);
select t_check('the second is ticket 2',
  (select ticket_no from public.hc_cafe_mark_paid('sq-1', 'pay-1')), 2);
select t_check('paying twice changes nothing',
  (select ticket_no from public.hc_cafe_mark_paid('sq-1', 'pay-1')), 2);
select t_check('an unknown Square order is nothing',
  (select id from public.hc_cafe_mark_paid('sq-nope', 'pay-x')), null::uuid);

select t_check('both count against 9:20',
  (select drinks from public.hc_cafe_slot_load(public.hc_cafe_today()) where slot_id = '0920'), 3);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cf000000-0000-0000-0000-000000000003"}';
  select t_check('a customer sees their own order only',
    (select count(*)::int from public.cafe_orders), 1);
  select t_check('two drinks are ahead of Cy',
    public.hc_cafe_ahead('cf100000-0000-0000-0000-000000000001'), 2);
  select t_check('nobody else''s place in line',
    public.hc_cafe_ahead('cf100000-0000-0000-0000-000000000002'), null::integer);
  select t_raises_like('a customer cannot mark it ready',
    $$select public.hc_cafe_set_status('cf100000-0000-0000-0000-000000000001', 'ready')$$,
    'counter only');
  select t_raises_like('a customer cannot pay for it',
    $$select public.hc_cafe_mark_paid('sq-1', 'x')$$, 'permission denied');
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cf000000-0000-0000-0000-000000000002"}';
  select t_check('the barista sees both',
    (select count(*)::int from public.hc_cafe_queue()), 2);
  select t_check('the barista reads no orders directly',
    (select count(*)::int from public.cafe_orders), 0);
  select t_check('start making',
    (select status from public.hc_cafe_set_status('cf100000-0000-0000-0000-000000000001', 'making')), 'making');
  select t_check('ready',
    (select status from public.hc_cafe_set_status('cf100000-0000-0000-0000-000000000001', 'ready')), 'ready');
  select t_raises_like('ready cannot jump back to paid',
    $$select public.hc_cafe_set_status('cf100000-0000-0000-0000-000000000001', 'paid')$$,
    'cannot go to');
  select public.hc_cafe_set_taking_orders(false);
commit;

select t_check('ready is stamped',
  (select ready_at is not null from public.cafe_orders where id = 'cf100000-0000-0000-0000-000000000001'), true);
select t_check('the counter paused orders',
  (select value_bool from public.app_settings where key = 'cafe_taking_orders'), false);

begin;
  set local role anon;
  select t_raises_like('a stranger reads no orders',
    $$select count(*) from public.cafe_orders$$, 'permission denied');
rollback;
