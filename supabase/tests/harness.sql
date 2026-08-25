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
  id         uuid primary key default gen_random_uuid(),
  email      text,
  -- Real auth.users has this and hc_admin_list_users (0025) reads it, so the
  -- stub needs it or that function fails at run time rather than at review.
  created_at timestamptz not null default now()
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
  last_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "people can read their own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);

/* The UPDATE policy from 0009, which 0016 does not need and 0025 very much
   does. It is the reason the role guard in 0025 section 3 exists at all:
   everybody can already write their own profile row, and `role` is a column
   on that row, so without the trigger any member could promote themselves
   with one PATCH. Leaving this out of the harness would make 0025's test file
   pass while testing nothing. */
create policy "people can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

-- From 0003, which 0026 alters rather than creates.
create table public.announcements (
  id          text primary key,
  eyebrow     text,
  title       text not null,
  body        text,
  starts_on   date,
  ends_on     date,
  priority    integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.announcements enable row level security;
grant select on public.announcements to anon, authenticated;

-- From 0010 and 0012, which 0027 alters rather than creates.
create table public.device_tokens (
  token       text primary key,
  platform    text not null default 'ios',
  active      boolean not null default true,
  wants_new_guide       boolean not null default true,
  wants_sunday_reminder boolean not null default true,
  wants_group_day       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.push_log (
  id         bigint generated always as identity primary key,
  topic      text not null,
  ran_at     timestamptz not null default now(),
  recipients integer not null default 0,
  delivered  integer not null default 0,
  failed     integer not null default 0,
  retired    integer not null default 0,
  skipped    boolean not null default false,
  note       text,
  constraint push_log_topic_known
    check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test'))
);

/* ---------------------------------------------------------------------------
   A stand-in for Supabase Storage.

   0026 creates a bucket and four policies on storage.objects, and a bare
   Postgres has neither. These two tables carry only the columns the migration
   names, which is enough for the policies to be created and therefore for the
   SQL to be proven valid.

   WHAT THIS DOES NOT TEST, said plainly so nobody reads more into a green run
   than is there: Storage's own API is a Go service in front of these tables,
   and nothing here exercises it. The policies are checked for syntax and for
   referring to columns that exist. That an upload by a member is actually
   refused is a claim about the real project, and the only honest way to check
   it is to try it there.
   --------------------------------------------------------------------------- */
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text,
  owner     uuid
);
alter table storage.objects enable row level security;

/* Supabase's own vault, near enough for 0027 to run. The real one decrypts
   through an extension; this one just has to exist and hold a row, because
   what 0027's test asks is whether hc_send_push refuses an unknown topic and
   whether hc_admin_send_announcement refuses a draft, and both of those are
   decided before the secret is ever read. */
create schema if not exists vault;
create table vault.decrypted_secrets (
  name             text primary key,
  decrypted_secret text
);
create schema if not exists net;

/* ---------------------------------------------------------------------------
   The content tables 0030 opens to an admin, from 0001, 0006 and 0007.

   Only the columns that migration names, plus enough of the rest for the
   claim it makes to be worth checking. `published`, `title`, `giving_url` and
   `service_times` are not decoration here: the point of the column level
   grants in 0030 section 3 is that an admin phone can write the prose and
   cannot write those, and a stub without them could not tell the difference.

   Closed the way every content table in this project starts: RLS on, a public
   read of published rows, and no write policy at all. 0030 is what adds one.
   --------------------------------------------------------------------------- */

create table public.serve_teams (
  id          text primary key,
  name        text not null,
  commitment  text,
  requirement text,
  blurb       text,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table public.next_steps (
  id          text primary key,
  title       text not null,
  blurb       text,
  url         text,
  cta_label   text,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table public.podcast_show (
  id          text primary key,
  name        text not null,
  blurb       text,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table public.events (
  id          text primary key,
  title       text not null,
  description text,
  starts_at   timestamptz not null default now(),
  signup_url  text,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table public.church_profile (
  id                  text primary key,
  name                text not null,
  tagline             text,
  giving_url          text,
  service_times       jsonb not null default '[]'::jsonb,
  serve_signup_blurb  text,
  groups_off_season_note text,
  groups_in_season    boolean not null default true,
  published           boolean not null default true,
  updated_at          timestamptz not null default now()
);

insert into public.church_profile (id, name, tagline, giving_url, serve_signup_blurb)
values ('church-home', 'Home Church', 'Built from New Orleans.',
        'https://donate.overflow.co/homechurchnola',
        'Tap below and a member of our team will be in touch.');

do $$
declare t text;
begin
  foreach t in array array['serve_teams', 'next_steps', 'podcast_show',
                           'events', 'church_profile']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format($p$create policy %I on public.%I for select
                        to anon, authenticated using (published)$p$,
                   t || ' are publicly readable', t);
  end loop;
end;
$$;

/* ---------------------------------------------------------------------------
   The rest of the content tables, from 0001 and 0004, for 0031.

   Same rule as the block above: only the columns the migration names, plus
   the ones whose refusal is the point. guides.reflection_questions and
   podcasts.title are here so "an admin cannot write these" is a real
   assertion rather than a claim about a column that does not exist and would
   have been refused for the wrong reason.
   --------------------------------------------------------------------------- */

create table public.series (
  id          text primary key,
  title       text not null,
  subtitle    text,
  blurb       text,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table public.podcasts (
  id          text primary key,
  title       text not null,
  description text,
  summary     text[],
  episode_url text,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table public.guides (
  id                   text primary key,
  subtitle             text,
  theme_title          text,
  reflection_questions jsonb not null default '[]'::jsonb,
  published            boolean not null default true,
  updated_at           timestamptz not null default now()
);

create table public.reading_plans (
  id          text primary key,
  title       text not null,
  subtitle    text,
  this_week   text,
  total_weeks integer not null default 1,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table public.groups (
  id           text primary key,
  name         text not null,
  day          text,
  neighborhood text,
  blurb        text,
  published    boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table public.instagram_posts (
  id         text primary key,
  caption    text,
  posted_at  timestamptz
);

insert into public.groups (id, name, day, neighborhood, blurb)
values ('group-uptown', 'Uptown', 'Thursday', 'Uptown', 'Come as you are.');
insert into public.series (id, title, subtitle, blurb)
values ('series-david', 'The Life of David', 'A man after God''s heart', 'Eight weeks.');
insert into public.podcasts (id, title, description)
values ('sermon-test', 'The Weight of a Crown', 'What David carried.');
insert into public.guides (id, subtitle, reflection_questions)
values ('guide-test', 'Week one', '[]'::jsonb);
insert into public.reading_plans (id, title, subtitle, this_week)
values ('plan-test', 'The Gospels', 'Ninety days', 'Matthew 1 to 4');

do $$
declare t text;
begin
  foreach t in array array['series', 'podcasts', 'guides', 'reading_plans',
                           'groups', 'instagram_posts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;

  foreach t in array array['series', 'podcasts', 'guides', 'reading_plans', 'groups']
  loop
    execute format($p$create policy %I on public.%I for select
                        to anon, authenticated using (published)$p$,
                   t || ' are publicly readable', t);
  end loop;
end;
$$;
