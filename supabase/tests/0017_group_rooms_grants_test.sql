-- ===========================================================================
-- Grants, and the hole 0016 left.
--
-- 0016's test file asked "can this role read that row" and never once asked
-- "can this role call that function". Everything in it passed while a signed
-- out stranger could delete every room in the database. This file is the
-- other half of the question, and the first check in it is the regression.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so a privilege
-- check has to be the default assumption for anything reachable over
-- PostgREST, not an afterthought.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

-- 0016's test file leaves these behind; recreate them when this file is run
-- on its own.
create or replace function t_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then
    raise notice 'PASS  %', label;
  else
    raise warning 'FAIL  %  (got %, want %)', label, got, want;
  end if;
end;
$$;

create or replace function t_refuses(label text, sql text)
returns void language plpgsql as $$
begin
  execute sql;
  raise warning 'FAIL  % (it was allowed)', label;
exception when others then
  raise notice 'PASS  % (refused: %)', label, left(sqlerrm, 46);
end;
$$;

-- Only refused for the right reason. A function that raises "Sign in first."
-- is safe by its body; this asks whether the privilege itself is gone, which
-- is what survives somebody rewriting the body later.
create or replace function t_no_privilege(label text, sql text)
returns void language plpgsql as $$
begin
  execute sql;
  raise warning 'FAIL  % (it was allowed)', label;
exception
  when insufficient_privilege then
    raise notice 'PASS  %', label;
  when others then
    raise warning 'FAIL  % (refused, but by its body rather than its grant: %)',
      label, left(sqlerrm, 40);
end;
$$;

-- ------------------------------------------------------------ the regression
--
-- Somebody signed out, holding nothing but the publishable anon key that
-- ships inside the app, asking the database to delete every room in it.

begin;
  set local role anon;
  select t_no_privilege('a signed out stranger cannot run the retention sweep',
    'select public.hc_purge_group_rooms(1)');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select t_no_privilege('and neither can somebody who merely signed in',
    'select public.hc_purge_group_rooms(1)');
commit;

-- ------------------------------------------- every write, from a signed out client
--
-- These all refused before this migration too, but by raising inside their
-- own bodies. Now they are not callable at all, which is a guarantee that
-- does not depend on anybody keeping the first three lines of a function.

begin;
  set local role anon;
  select t_no_privilege('anon cannot agree to the terms',
    'select public.hc_room_accept_terms()');
  select t_no_privilege('anon cannot open a room',
    'select public.hc_room_open(''g'', ''t'', ''n'', ''[]''::jsonb)');
  select t_no_privilege('anon cannot join a room',
    'select public.hc_room_join(''123456'')');
  select t_no_privilege('anon cannot post',
    'select public.hc_room_post(gen_random_uuid(), gen_random_uuid(), ''answer'', ''x'')');
  select t_no_privilege('anon cannot edit a note',
    'select public.hc_room_edit_note(gen_random_uuid(), ''x'')');
  select t_no_privilege('anon cannot delete a note',
    'select public.hc_room_delete_note(gen_random_uuid())');
  select t_no_privilege('anon cannot open an answer',
    'select public.hc_room_open_answer(gen_random_uuid(), true)');
  select t_no_privilege('anon cannot open every answer',
    'select public.hc_room_open_all(gen_random_uuid(), null, true)');
  select t_no_privilege('anon cannot add a question',
    'select public.hc_room_add_question(gen_random_uuid(), ''x'')');
  select t_no_privilege('anon cannot edit a question',
    'select public.hc_room_edit_question(gen_random_uuid(), ''x'')');
  select t_no_privilege('anon cannot remove a question',
    'select public.hc_room_remove_question(gen_random_uuid())');
  select t_no_privilege('anon cannot report',
    'select public.hc_room_report(gen_random_uuid(), ''x'')');
  select t_no_privilege('anon cannot take anything down',
    'select public.hc_room_take_down(gen_random_uuid())');
  select t_no_privilege('anon cannot block anybody',
    'select public.hc_room_block(gen_random_uuid(), true)');
  select t_no_privilege('anon cannot close a room',
    'select public.hc_room_close(gen_random_uuid())');
  select t_no_privilege('anon cannot ask whether it hosts a room',
    'select public.hc_room_is_host(gen_random_uuid())');
commit;

-- --------------------------------------- and the signed out read path still works
--
-- The reason this is not simply "revoke everything from anon". Two of the
-- helpers are called inside the policy that lets a signed out phone read a
-- room's questions by its code, and a policy expression runs with the
-- privileges of whoever is asking. Revoke these by accident and joining a
-- room starts failing with a permission error rather than an empty screen.

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'grants-host@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_host, terms_accepted_at)
values ('55555555-5555-5555-5555-555555555555', 'Grantsy', true, now())
  on conflict (id) do update set can_host = true;

create table if not exists t_grants (k text primary key, v text);
grant select, insert on t_grants to anon, authenticated;
delete from t_grants;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
  insert into t_grants
  select 'room', (public.hc_room_open(
    'guide-grants', 'A guide', 'A group',
    '[{"heading":"Getting started","body":"Does the signed out read path still work?"}]'::jsonb
  )).id::text;
commit;

insert into t_grants select 'code', code from public.group_rooms
 where id = (select v from t_grants where k = 'room')::uuid;

begin;
  set local role anon;
  select t_check('a signed out phone can still find a room by its code',
    (select count(*)::int from public.group_rooms
      where code = (select v from t_grants where k = 'code')), 1);
  select t_check('and can still read its questions, which needs the helpers',
    (select count(*)::int from public.group_room_questions
      where room_id = (select v from t_grants where k = 'room')::uuid), 1);
commit;

-- ------------------------------------------------------------- the catalog
--
-- Asked as "can this role execute this function", not by pattern matching the
-- ACL text. The first draft of these checks did the latter and was worthless:
-- a brand new function has proacl NULL, NULL means the built-in default, and
-- the built-in default for a function is that PUBLIC may execute it. So the
-- most exposed function in the schema is exactly the one whose ACL column is
-- empty, and a regex over that column reads it as clean. Verified by adding a
-- careless function and watching the check pass when it should have failed.
--
-- has_function_privilege resolves defaults, so it cannot be fooled that way.

select t_check('anon cannot execute the sweep',
  has_function_privilege('anon', 'public.hc_purge_group_rooms(integer)', 'EXECUTE'), false);
select t_check('authenticated cannot execute the sweep',
  has_function_privilege('authenticated', 'public.hc_purge_group_rooms(integer)', 'EXECUTE'), false);
select t_check('but service_role can, because something has to run it',
  has_function_privilege('service_role', 'public.hc_purge_group_rooms(integer)', 'EXECUTE'), true);

-- Every hc_ function anon is allowed to call, named. All three are policy
-- helpers rather than anything that writes, which is the property that matters
-- rather than the count: a policy expression runs with the caller's
-- privileges, so a policy anon evaluates needs the functions in it to be
-- callable by anon.
--
-- hc_room_is_live and hc_room_is_member are read by the `questions follow the
-- room` policy while a signed out phone is reading a room by its code.
--
-- hc_is_admin arrived with migration 0025 and is read by the SELECT policies
-- in 0026, which say `published or hc_is_admin()`. It is on this list on
-- purpose and the first version of 0025 left it off, which is worth recording
-- because the failure was not the one anybody would predict. Postgres short
-- circuits `or`, so the function is only reached on an unpublished row; a role
-- without EXECUTE therefore does not see fewer rows, it gets
-- `permission denied for function hc_is_admin` and PostgREST returns a 500.
-- One saved draft would have taken announcements off Home for every signed out
-- phone. It leaks nothing: with no session auth.uid() is null, so it can only
-- ever answer false.
--
-- hc_register_device_token, from 0037, is the fourth and is the odd one out:
-- it is not a policy helper, it writes. It is on this list because registering
-- a phone for push happens with the publishable key and no session, and the
-- upsert it performs needs SELECT on device_tokens, which anon must never have
-- for the reason 0010 gives. A SECURITY DEFINER function anon may call is what
-- lets the table keep that revoke. What it can do is smaller than the anon
-- INSERT policy 0010 already grants: one row, keyed by a value the caller
-- passes in, returning void, reading nothing back.
select t_check('anon can execute exactly the four functions it needs',
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), 'none')
     from pg_proc p
     join pg_type t on t.oid = p.prorettype
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'hc\_%'
      and t.typname <> 'trigger'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'hc_is_admin, hc_register_device_token, hc_room_is_live, hc_room_is_member');

-- The standing guard, and the reason migration 0017 does not try to solve this
-- with ALTER DEFAULT PRIVILEGES. Postgres hands PUBLIC an EXECUTE grant on
-- every new function and there is no way to switch that off ahead of time, so
-- the next person to add an hc_ function to this schema has to revoke it from
-- public by name. This is what tells them they forgot: it lists anything anon
-- can reach that is not one of the four named above. Trigger functions are
-- exempt, PostgREST does not expose them.
select t_check('and nothing else in the schema is reachable by a signed out client',
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), 'none')
     from pg_proc p
     join pg_type t on t.oid = p.prorettype
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'hc\_%'
      and t.typname <> 'trigger'
      and p.proname not in ('hc_room_is_live', 'hc_room_is_member', 'hc_is_admin',
                            'hc_register_device_token')
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'none');
