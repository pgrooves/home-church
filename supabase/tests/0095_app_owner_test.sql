-- ===========================================================================
-- The owner, against the real functions and the real trigger.
--
-- The question: can another admin take the owner's role away? And the one
-- that matters as much: does everything an admin could do before still work
-- on everybody who is not the owner?
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

create or replace function t_raises(label text, stmt text, want_sqlstate text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  %  (it was allowed)', label;
exception
  when others then
    if want_sqlstate is null or sqlstate = want_sqlstate then
      raise notice 'PASS  %', label;
    else
      raise warning 'FAIL  %  (refused with % rather than %)', label, sqlstate, want_sqlstate;
    end if;
end;
$$;

-- Owner, a second admin, and a member.
insert into auth.users (id, email) values
  ('ab000000-0000-0000-0000-000000000001', 'owner@example.com'),
  ('ab000000-0000-0000-0000-000000000002', 'pastor@example.com'),
  ('ab000000-0000-0000-0000-000000000003', 'member@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ab000000-0000-0000-0000-000000000001', 'Owen'),
  ('ab000000-0000-0000-0000-000000000002', 'Paul'),
  ('ab000000-0000-0000-0000-000000000003', 'Mia')
  on conflict (id) do update set first_name = excluded.first_name;

-- No session: the bootstrap path from the migration's header.
update public.profiles set role = 'admin'
 where id in ('ab000000-0000-0000-0000-000000000001',
              'ab000000-0000-0000-0000-000000000002');
update public.profiles set role = 'member'
 where id = 'ab000000-0000-0000-0000-000000000003';

insert into public.app_owners (user_id)
values ('ab000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- --------------------------------------------------- another admin acting ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000002"}';

  select t_raises('0095: another admin cannot demote the owner',
    $$select public.hc_admin_set_role(
        'ab000000-0000-0000-0000-000000000001', 'member')$$,
    '42501');

  -- Making the owner an admin, which they already are, changes nothing and
  -- is not worth an error.
  select public.hc_admin_set_role('ab000000-0000-0000-0000-000000000001', 'admin');

  select public.hc_admin_set_role('ab000000-0000-0000-0000-000000000003', 'admin');
  select t_check('0095: but can still promote a member',
    (select role from public.hc_admin_list_users()
      where id = 'ab000000-0000-0000-0000-000000000003'),
    'admin');

  select public.hc_admin_set_role('ab000000-0000-0000-0000-000000000003', 'member');
  select t_check('0095: and demote them again',
    (select role from public.hc_admin_list_users()
      where id = 'ab000000-0000-0000-0000-000000000003'),
    'member');

  select t_check('0095: an admin is told who the owner is',
    (select array_agg(o.id)::text from public.hc_admin_owner_ids() o),
    '{ab000000-0000-0000-0000-000000000001}');

  select t_raises('0095: an admin cannot read the table itself',
    $$select * from public.app_owners$$, '42501');

  select t_raises('0095: nor name themselves owner',
    $$insert into public.app_owners (user_id)
      values ('ab000000-0000-0000-0000-000000000002')$$, '42501');

  select t_raises('0095: nor ask hc_is_owner directly',
    $$select public.hc_is_owner('ab000000-0000-0000-0000-000000000001')$$, '42501');
commit;

-- The trigger on its own. A session belonging to the second admin, with RLS
-- out of the way, which is what a SECURITY DEFINER function written later
-- would look like if it forgot to ask.
begin;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000002"}';

  select t_raises('0095: the trigger refuses the same thing to a direct update',
    $$update public.profiles set role = 'member'
       where id = 'ab000000-0000-0000-0000-000000000001'$$,
    '42501');
commit;

select t_check('0095: after all that, the owner is still an admin',
  (select role from public.profiles where id = 'ab000000-0000-0000-0000-000000000001'),
  'admin');

-- ------------------------------------------------------------ the owner ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';

  select public.hc_admin_set_role('ab000000-0000-0000-0000-000000000002', 'member');
  select t_check('0095: the owner can still demote another admin',
    (select role from public.hc_admin_list_users()
      where id = 'ab000000-0000-0000-0000-000000000002'),
    'member');

  select public.hc_admin_set_role('ab000000-0000-0000-0000-000000000002', 'admin');
  select t_check('0095: and promote them back',
    (select role from public.hc_admin_list_users()
      where id = 'ab000000-0000-0000-0000-000000000002'),
    'admin');

  select t_raises('0095: the owner still cannot demote themselves',
    $$select public.hc_admin_set_role(
        'ab000000-0000-0000-0000-000000000001', 'member')$$,
    '42501');
commit;

-- ------------------------------------------------------------ the rest ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000003"}';

  select t_raises('0095: a member is not told who the owner is',
    $$select * from public.hc_admin_owner_ids()$$, '42501');
commit;

begin;
  set local role anon;

  select t_raises('0095: nor is anybody signed out',
    $$select * from public.hc_admin_owner_ids()$$, '42501');
  select t_raises('0095: who cannot read the table either',
    $$select * from public.app_owners$$, '42501');
commit;

-- The way back: no session can still change it.
update public.profiles set role = 'member'
 where id = 'ab000000-0000-0000-0000-000000000001';
select t_check('0095: a session-less caller can still change the owner''s role',
  (select role from public.profiles where id = 'ab000000-0000-0000-0000-000000000001'),
  'member');
update public.profiles set role = 'admin'
 where id = 'ab000000-0000-0000-0000-000000000001';

-- And the row goes with the account.
delete from auth.users where id = 'ab000000-0000-0000-0000-000000000001';
select t_check('0095: deleting the owner''s account clears the row',
  (select count(*)::int from public.app_owners
    where user_id = 'ab000000-0000-0000-0000-000000000001'),
  0);
