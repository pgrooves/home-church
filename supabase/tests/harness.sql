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
