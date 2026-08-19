-- A minimum Supabase, enough to run and test 0016 for real.
-- Roles, auth.users, auth.uid() reading the JWT claim the way Supabase does,
-- plus the two things from earlier migrations that 0016 leans on.

-- Roles live on the cluster, not the database, so make them idempotent.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant anon, authenticated, service_role to postgres;

-- ---------------------------------------------------------------------------
-- Supabase's default privileges, which are the whole reason this block exists.
--
-- A bare Postgres gives a new function one grant: EXECUTE to PUBLIC. Supabase
-- adds explicit default grants on top, so a function created in the public
-- schema on a real project comes out carrying FOUR grants:
--
--   {=X/postgres, postgres=X/postgres, anon=X/postgres,
--    authenticated=X/postgres, service_role=X/postgres}
--
-- Without these lines this harness is a bare Postgres, migration 0017 passes
-- its own tests locally, and eighteen functions stay callable by anon in
-- production with every check green. That happened. The explicit anon grant
-- survives a revoke aimed at PUBLIC, because it did not come from PUBLIC.
--
-- Tables and sequences get the same treatment on a real project, which is why
-- 0016 revokes insert, update and delete rather than assuming a new table
-- starts closed.
--
-- Kept verbatim from what a Supabase project actually reports. If this block
-- and the real project ever drift, the tests go back to being theatre.
-- ---------------------------------------------------------------------------

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's own definition, near enough: the signed in user's id off the JWT.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

-- From 0001.
create or replace function public.hc_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- From 0009, the columns 0016 actually reads.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "people can read their own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);
grant select, insert, update on public.profiles to authenticated;
