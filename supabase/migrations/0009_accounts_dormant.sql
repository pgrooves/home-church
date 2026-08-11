-- ===========================================================================
-- Home Church, accounts
--
-- READ THIS BEFORE RUNNING IT. This migration is deliberately ahead of the
-- app. Version 1 ships with sign in switched off, and running this file
-- changes nothing that anybody can see. It exists so that the day accounts
-- are turned on, the database side is already correct and already reviewed,
-- rather than being written in a hurry against a deadline.
--
-- WHY ACCOUNTS ARE OFF IN V1, in one paragraph, because whoever runs this
-- later deserves the reasoning. js/auth.js has always read and written a
-- table called public.profiles. That table was never created. Three real
-- people signed in and every profile save quietly 404'd while the app told
-- them their information would follow them to another phone. Turning the
-- feature off was cheaper and more honest than turning it on in a hurry, and
-- it also removed Apple's in-app account deletion requirement, the demo
-- account a reviewer would need, and a hard dependency on production email
-- before launch. See APP_STORE_COMPLIANCE.md section 0.
--
-- A WORD ON WHAT AN ACCOUNT HERE MEANS. A row in this table associates a
-- named person with a church. Under GDPR that is special category data, and
-- under Apple's privacy labels it lands in Sensitive Info. That is not a
-- reason never to do it. It is a reason to collect less than feels natural,
-- and to be able to delete all of it on request, which is what the rest of
-- this file is for.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. profiles
--
-- Column for column what js/auth.js FIELD_MAP already writes, so switching
-- accounts on needs no client change.
--
-- ON DATA MINIMIZATION. Apple's guideline 5.1.1(iii) says an app should only
-- collect what its core functionality needs. Of the twelve fields below, the
-- app itself reads exactly one, first_name, to say good morning and to draw
-- the initials in the avatar. The rest exist for the church's own records.
-- That is a legitimate purpose but it is not this app's purpose, and a church
-- management system is a better home for it. Before switching accounts on,
-- decide deliberately which of these the app should ask for. Deleting a
-- column here is easier than explaining it in a privacy review.
--
-- The cascade is the load bearing part of deletion. Remove the auth user and
-- the profile goes with it, in the same transaction, without the Edge
-- Function having to remember to do it.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,

  first_name     text,
  last_name      text,
  gender         text,
  birthdate      date,
  campus         text,
  marital_status text,
  street         text,
  unit           text,
  city           text,
  state          text,
  zip            text,
  photo_url      text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.profiles is
  'One row per signed in person. Dormant in v1, sign in is switched off. Cascades from auth.users so deleting the account deletes this.';
comment on column public.profiles.first_name is
  'The only field the app itself reads. Everything else is for the church records, see the note in migration 0009 about minimization.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.hc_set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. Row level security
--
-- The whole rule: you can see your own row and nobody else's. Not "everyone
-- authenticated can read profiles", which is the mistake that turns a church
-- directory into a data breach. auth.uid() is the signed in user's id, taken
-- from the JWT, so it cannot be spoofed from the client.
--
-- No DELETE policy on purpose. Deleting your row is not the operation anybody
-- wants, because it would leave the auth user behind with no profile, which
-- is exactly the broken half-state this app was already in. Deletion goes
-- through the Edge Function, which removes the auth user and lets the cascade
-- above take the profile.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "people can read their own profile"   on public.profiles;
drop policy if exists "people can insert their own profile" on public.profiles;
drop policy if exists "people can update their own profile" on public.profiles;

create policy "people can read their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "people can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "people can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- ---------------------------------------------------------------------------
-- 3. Grants
--
-- anon gets nothing at all here. A signed out visitor has no business
-- touching this table, and the content tables are the only thing the app
-- reads without a session.
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;
revoke delete on public.profiles from authenticated;
grant all on public.profiles to service_role;


-- ---------------------------------------------------------------------------
-- 4. A blank row on signup
--
-- So the app never has to handle "signed in but there is no row yet". The
-- function is security definer because it writes a table the new user cannot
-- yet write to themselves, and it pins search_path, which the Supabase
-- security advisor flags when it is left mutable and which is a genuine
-- privilege escalation route on a definer function.
-- ---------------------------------------------------------------------------

create or replace function public.hc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.hc_handle_new_user() is
  'Creates the blank profile row alongside every new auth user.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.hc_handle_new_user();


-- ---------------------------------------------------------------------------
-- 5. Export, for the privacy story
--
-- Cheap to provide and it strengthens the answer to "how do I get my data".
-- Returns the caller's own row as json and nothing else. Not security
-- definer, so it runs as the caller and the policies above are still what
-- decides what comes back. A signed out caller gets null rather than an
-- error, which is the honest answer to "what do you have on me".
-- ---------------------------------------------------------------------------

create or replace function public.hc_export_my_data()
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'exported_at', now(),
    'account', (
      select json_build_object('id', u.id, 'email', u.email, 'phone', u.phone,
                               'created_at', u.created_at)
      from auth.users u where u.id = auth.uid()
    ),
    'profile', (select to_json(p) from public.profiles p where p.id = auth.uid()),
    'note', 'Notes, guide checkmarks, group rosters, and prayer requests are not here because they never leave your phone. Erase them from Your account inside the app.'
  );
$$;

comment on function public.hc_export_my_data() is
  'Everything the server holds about the caller, as json. Runs as the caller, so RLS is what limits it.';

revoke all on function public.hc_export_my_data() from public, anon;
grant execute on function public.hc_export_my_data() to authenticated;


-- ---------------------------------------------------------------------------
-- 6. The search_path warning on the old function
--
-- Unrelated to accounts, and this is the natural place to fix it. The Supabase
-- security advisor flags hc_set_updated_at for a mutable search_path. It is a
-- trigger function rather than a definer one so the risk is small, but there
-- is no reason to leave it.
-- ---------------------------------------------------------------------------

create or replace function public.hc_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
