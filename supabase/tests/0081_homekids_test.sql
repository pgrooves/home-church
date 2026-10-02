-- ===========================================================================
-- HomeKids.
--
-- THE PROMISES, asserted as the real roles rather than read off the policy:
--
--   a draft from the emails is invisible to a signed out phone, which is the
--   role the app's content sync runs as, and to a member;
--   an admin sees the queue, and approving is the only thing that puts an item
--   on the page; a member cannot approve;
--   nobody but the service role writes either table;
--   the shapes the page depends on are refused at the door when they are wrong.
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

insert into auth.users (id, email) values
  ('ee000000-0000-0000-0000-000000000001', 'kadmin@example.com'),
  ('ee000000-0000-0000-0000-000000000002', 'kmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ee000000-0000-0000-0000-000000000001', 'Ada'),
  ('ee000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'  where id = 'ee000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member' where id = 'ee000000-0000-0000-0000-000000000002';

delete from public.homekids_updates where id like 'hk-test-%';
delete from public.homekids_lessons where id like 'hk-test-%';

-- ------------------------------------------------------------- shapes ---

do $$
begin
  insert into public.homekids_updates (id, audience, title) values ('hk-test-bad', 'staff', 'Nope');
  raise warning 'FAIL  an unknown audience is refused';
exception when check_violation then
  raise notice 'PASS  an unknown audience is refused';
end
$$;

do $$
begin
  insert into public.homekids_lessons (id, taught_on, title, checklist)
  values ('hk-test-bad', '2000-01-02', 'Nope', '"read the story"');
  raise warning 'FAIL  a checklist that is not a list is refused';
exception when check_violation then
  raise notice 'PASS  a checklist that is not a list is refused';
end
$$;

do $$
begin
  insert into public.homekids_lessons (id, taught_on, title, groups)
  values ('hk-test-bad2', '2000-01-02', 'Nope', '[]');
  raise warning 'FAIL  groups that are not keyed by group are refused';
exception when check_violation then
  raise notice 'PASS  groups that are not keyed by group are refused';
end
$$;

select t_check('the switch is there and on',
  (select value_bool from public.app_settings where key = 'homekids_on'), true);

-- ------------------------------------------------- what gets written ---

begin;
  set local role service_role;
  insert into public.homekids_lessons (id, taught_on, title, checklist)
  values ('hk-test-lesson', '2000-01-09', 'Jesus Calms the Storm',
          '[{"id":"story","text":"Read the story together"}]');
  insert into public.homekids_updates (id, audience, title, published, review_state)
  values ('hk-test-draft', 'parents', 'Fall Festival', false, 'pending'),
         ('hk-test-vol',   'volunteers', 'Huddle', false, 'pending');
commit;

-- ------------------------------------------------------------- anon ---

begin;
  set local role anon;
  select t_check('a signed out phone reads a published lesson',
    (select count(*)::int from public.homekids_lessons where id = 'hk-test-lesson'), 1);
  select t_check('and cannot see a draft from the emails',
    (select count(*)::int from public.homekids_updates where id like 'hk-test-%'), 0);
commit;

select t_check('no client role can write either table',
  (select bool_or(has_table_privilege(r.role, t.tab, p.priv))
     from unnest(array['anon', 'authenticated']) as r(role),
          unnest(array['public.homekids_lessons', 'public.homekids_updates']) as t(tab),
          unnest(array['INSERT', 'UPDATE', 'DELETE']) as p(priv)),
  false);

-- ----------------------------------------------------------- a member ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000002"}';
  select t_check('a member cannot see a draft either',
    (select count(*)::int from public.homekids_updates where id like 'hk-test-%'), 0);
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"ee000000-0000-0000-0000-000000000002"}', true);
  perform public.hc_admin_approve_homekids_update('hk-test-draft');
  raise warning 'FAIL  a member cannot approve';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot approve';
end
$$;

reset role;

-- ----------------------------------------------------------- an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  select t_check('an admin sees the queue',
    (select count(*)::int from public.homekids_updates
      where id like 'hk-test-%' and review_state = 'pending'), 2);
  select public.hc_admin_approve_homekids_update('hk-test-draft');
  select public.hc_admin_discard_homekids_update('hk-test-vol');
commit;

select t_check('approving publishes',
  (select published and review_state = 'approved' from public.homekids_updates where id = 'hk-test-draft'), true);
select t_check('discarding keeps the row, off the page',
  (select not published and review_state = 'discarded' from public.homekids_updates where id = 'hk-test-vol'), true);

begin;
  set local role anon;
  select t_check('and now the approved one reaches a signed out phone, and only that one',
    (select string_agg(id, ',') from public.homekids_updates where id like 'hk-test-%'), 'hk-test-draft');
commit;

delete from public.homekids_updates where id like 'hk-test-%';
delete from public.homekids_lessons where id like 'hk-test-%';
