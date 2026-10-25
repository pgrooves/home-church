-- ===========================================================================
-- Home Church, the app's owner
--
-- WHAT THIS IS FOR. Until now every admin could demote or remove every other
-- admin. That was fine while there was one. The day a second admin arrives,
-- the person who builds and ships the app is one "Make a member" or "Remove"
-- away from being locked out of it, and the confirm in front of those buttons
-- is the only thing in the way. A confirm is a speed bump for a thumb, not a
-- rule. This is the rule.
--
-- WHAT AN OWNER IS. An admin whose role nobody can take away from inside the
-- app, and whose account nobody can remove from inside the app. Nothing else.
-- An owner sees the same Admin screen, has the same powers, and can still
-- demote or remove any other admin. Other admins keep every power they had,
-- including over each other; they lose only the ability to act on the owner.
--
-- A TABLE OF ITS OWN, not a column on profiles. 0009 lets everybody update
-- their own profile row, so a column there needs a trigger to stop a member
-- naming themselves owner (which would make them unremovable). A table no
-- client role can read or write needs nothing: the guard is the absence of
-- a grant.
--
-- HOW THE OWNER IS SET. By hand, once, with no session (the SQL editor or
-- Claude Code), and deliberately not in this file, so no email address is
-- committed to the repository:
--
--   insert into public.app_owners (user_id)
--   select id from auth.users where email = '<the owner''s email>'
--   on conflict do nothing;
--
-- Changing the owner later is the same: delete the row, insert another. A
-- session-less caller can also still change an owner's role directly, which
-- is the way back if one is ever needed.
--
-- SAFE FOR EVERY BUILD ALREADY INSTALLED. Nothing a shipped build reads is
-- renamed or removed. hc_admin_set_role keeps its signature and every answer
-- it gave before, plus one new refusal, which an installed app shows as a
-- toast in the database's own words. hc_admin_owner_ids() is new and only a
-- later build calls it. The admin-remove-user Edge Function learns the same
-- refusal; deploy it after this has run, since it reads the table.
--
-- Written without DROP, like 0094. Re-runnable.
--
-- Rollback: supabase/rollback/0095_app_owner_down.sql
-- Tests:    supabase/tests/0095_app_owner_test.sql
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.app_owners (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

comment on table public.app_owners is
  'Admins whose role and account cannot be changed from inside the app. Written only with no session. See migration 0095.';

alter table public.app_owners enable row level security;

-- No policies, and no privileges for either client role. service_role keeps
-- its own for the Edge Function's read.
revoke all on public.app_owners from public, anon, authenticated;
grant all on public.app_owners to service_role;


-- ---------------------------------------------------------------------------
-- 2. hc_is_owner(uuid)
--
-- Asked by the two guards below. Not granted to either client role: nothing
-- the app runs needs it, and the admin screen asks hc_admin_owner_ids().
-- ---------------------------------------------------------------------------

create or replace function public.hc_is_owner(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_owners where user_id = p_user);
$$;

revoke all on function public.hc_is_owner(uuid) from public, anon, authenticated;

comment on function public.hc_is_owner(uuid) is
  'True when this person is in app_owners. Used by hc_admin_set_role and hc_guard_role_change. See migration 0095.';


-- ---------------------------------------------------------------------------
-- 3. Changing a role, as 0025 wrote it, plus the owner
--
-- The refusal names what to do instead, because the person reading it is an
-- admin who tapped a button and expected it to work.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_role not in ('member', 'admin') then
    raise exception 'Unknown role: %', p_role;
  end if;

  if p_user = auth.uid() then
    raise exception 'You cannot change your own role.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role <> 'admin' and public.hc_is_owner(p_user) then
    raise exception 'That is the app''s owner. Their role cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles set role = p_role where id = p_user;

  if not found then
    raise exception 'That person has no profile row.';
  end if;
end;
$$;

revoke all on function public.hc_admin_set_role(uuid, text) from public, anon, authenticated;
grant execute on function public.hc_admin_set_role(uuid, text) to authenticated;

comment on function public.hc_admin_set_role(uuid, text) is
  'Promote or demote somebody. Admins only, never yourself, and never the owner (0095). The trigger from 0025 enforces the same rules against a direct UPDATE.';


-- ---------------------------------------------------------------------------
-- 4. The trigger on the column, as 0025 wrote it, plus the owner
--
-- The half that holds even for a SECURITY DEFINER function written later that
-- forgets to ask. A caller with no session still passes untouched: that is
-- the service role, and the way back.
-- ---------------------------------------------------------------------------

create or replace function public.hc_guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is not distinct from old.role then
    return new;                                  -- the ordinary profile save
  end if;

  if auth.uid() is null then
    return new;                                  -- service role, see 0025
  end if;

  if not public.hc_is_admin() then
    raise exception 'Only an admin can change a role.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.id = auth.uid() then
    raise exception 'An admin cannot change their own role.'
      using errcode = 'insufficient_privilege';
  end if;

  if old.role = 'admin' and public.hc_is_owner(new.id) then
    raise exception 'That is the app''s owner. Their role cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function public.hc_guard_role_change() from public, anon, authenticated;

comment on function public.hc_guard_role_change() is
  'Refuses any change to profiles.role that did not come from an admin acting on somebody else who is not the owner, or from a session-less caller holding the service role. See migrations 0025 section 3 and 0095.';


-- ---------------------------------------------------------------------------
-- 5. Who the owners are, for the Admin screen
--
-- So a build that knows about owners can draw "Owner" on that row instead of
-- two buttons that would only be refused. Admins only; ids and nothing else.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_owner_ids()
returns table (id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  return query select o.user_id from public.app_owners o;
end;
$$;

revoke all on function public.hc_admin_owner_ids() from public, anon, authenticated;
grant execute on function public.hc_admin_owner_ids() to authenticated;

comment on function public.hc_admin_owner_ids() is
  'The owners'' user ids, for the people list on the Admin screen. Admins only, checked inside. See migration 0095.';
