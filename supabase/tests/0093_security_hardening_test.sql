-- ===========================================================================
-- 0093: nobody creates their own profile with a tier on it, device_tokens
-- has no allow-everything policy left, and hc_cafe_today's search_path.
--
-- Asked as the real roles.
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
