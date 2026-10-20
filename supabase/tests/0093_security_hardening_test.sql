-- ===========================================================================
-- 0093: a stranger cannot list tonight's rooms, and members still can.
--
-- Asked as the real roles. A room is opened by a host and joined by one
-- member; then anon, a signed in stranger, the member and the host each ask
-- for the room and its questions. Plus the device_tokens policies being gone
-- and hc_cafe_today's search_path.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function t93_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  %', label;
  else raise warning 'FAIL  %  (got %, want %)', label, got, want; end if;
end;
$$;

create or replace function t93_refuses(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  % (it was allowed)', label;
exception when others then
  raise notice 'PASS  % (refused: %)', label, left(sqlerrm, 46);
end;
$$;

insert into auth.users (id, email) values
  ('93000000-0000-0000-0000-000000000001', 'host93@example.com'),
  ('93000000-0000-0000-0000-000000000002', 'member93@example.com'),
  ('93000000-0000-0000-0000-000000000003', 'stranger93@example.com')
on conflict do nothing;

insert into public.profiles (id, first_name, can_host, terms_accepted_at) values
  ('93000000-0000-0000-0000-000000000001', 'Host',     true,  now()),
  ('93000000-0000-0000-0000-000000000002', 'Member',   false, now()),
  ('93000000-0000-0000-0000-000000000003', 'Stranger', false, now())
on conflict (id) do update set can_host = excluded.can_host,
  terms_accepted_at = excluded.terms_accepted_at;

create table t93 (k text primary key, v text);
grant select, insert on t93 to anon, authenticated;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-000000000001"}';
  insert into t93 select 'room', (public.hc_room_open(
    'guide-93', 'Guide 93', 'Room 93',
    '[{"heading":"One","body":"A question"}]'::jsonb)).id::text;
commit;

insert into t93 select 'code', code from public.group_rooms
 where id = (select v from t93 where k = 'room')::uuid;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-000000000002"}';
  select public.hc_room_join((select v from t93 where k = 'code'));
commit;

-- A signed out phone: not granted the tables at all.
begin;
  set local role anon;
  select t93_refuses('0093: anon cannot list live rooms',
                   'select code from public.group_rooms');
  select t93_refuses('0093: anon cannot read room questions',
                   'select body from public.group_room_questions');
  select t93_refuses('0093: anon cannot call hc_room_is_live',
                   'select public.hc_room_is_live(gen_random_uuid())');
commit;

-- Signed in but in no room: sees no room and no question.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-000000000003"}';
  select t93_check('0093: a stranger with an account sees no live room',
                 (select count(*)::int from public.group_rooms), 0);
  select t93_check('0093: and no room''s questions',
                 (select count(*)::int from public.group_room_questions), 0);
commit;

-- The member and the host still read their own room, code and all.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-000000000002"}';
  select t93_check('0093: a member still reads their room',
                 (select count(*)::int from public.group_rooms
                   where id = (select v from t93 where k = 'room')::uuid), 1);
  select t93_check('0093: and its questions',
                 (select count(*)::int from public.group_room_questions
                   where room_id = (select v from t93 where k = 'room')::uuid), 1);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-000000000001"}';
  select t93_check('0093: the host still reads the code to read out',
                 (select code from public.group_rooms
                   where id = (select v from t93 where k = 'room')::uuid),
                 (select v from t93 where k = 'code'));
commit;

-- device_tokens: no policy left for a client role, and no grant.
select t93_check('0093: device_tokens has no client policies',
               (select count(*)::int from pg_policies
                 where schemaname = 'public' and tablename = 'device_tokens'), 0);
select t93_check('0093: anon holds nothing on device_tokens',
               has_table_privilege('anon', 'public.device_tokens', 'insert, update, select'), false);

select t93_check('0093: hc_cafe_today has a fixed search_path',
               (select proconfig from pg_proc where proname = 'hc_cafe_today'),
               array['search_path=public']);

-- A fresh account with no profile row yet cannot create one as an admin,
-- a leader or a barista. The ordinary insert, with the defaults, still works.
insert into auth.users (id, email) values
  ('93000000-0000-0000-0000-000000000009', 'fresh93@example.com')
on conflict do nothing;
delete from public.profiles where id = '93000000-0000-0000-0000-000000000009';

-- The live project's own insert policy and grant, from the accounts migration
-- that predates this harness, so the test asks what production would answer.
drop policy if exists "people can insert their own profile" on public.profiles;
create policy "people can insert their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);
grant insert on public.profiles to authenticated;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-000000000009"}';
  select t93_refuses('0093: a new account cannot insert itself as an admin',
    'insert into public.profiles (id, role) values (''93000000-0000-0000-0000-000000000009'', ''admin'')');
  select t93_refuses('0093: or as a leader',
    'insert into public.profiles (id, can_host) values (''93000000-0000-0000-0000-000000000009'', true)');
  select t93_refuses('0093: or as a barista',
    'insert into public.profiles (id, can_run_cafe) values (''93000000-0000-0000-0000-000000000009'', true)');
  insert into public.profiles (id, first_name) values ('93000000-0000-0000-0000-000000000009', 'Fresh');
  select t93_check('0093: the ordinary insert still works, as a member',
    (select role from public.profiles where id = '93000000-0000-0000-0000-000000000009'), 'member');
  select t93_refuses('0093: and the existing guard still stops promoting yourself',
    'update public.profiles set role = ''admin'' where id = ''93000000-0000-0000-0000-000000000009''');
commit;

select t93_check('0093: nobody became an admin along the way',
  (select role from public.profiles where id = '93000000-0000-0000-0000-000000000009'), 'member');
