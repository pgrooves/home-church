-- ===========================================================================
-- Home Church, the admin role
--
-- WHAT THIS IS FOR. Everything the church publishes, an announcement, a
-- guide, an event, has until now been written with the service role key from
-- Claude Code or the SQL editor. That works and it is not going away, but it
-- means the one person who runs this church app has to be at a computer with
-- a secret on it to change a sentence on Home. This migration is the first
-- half of doing it from the phone instead: a way for the database to know
-- that a particular signed in person is allowed to write.
--
-- ONE COLUMN, NOT A ROLES TABLE. There are two roles and there is no
-- foreseeable third. A join table would buy nothing here except a join on
-- every policy evaluation, and policies are evaluated per row.
--
-- HOW THE FIRST ADMIN IS MADE. By hand, once, from the SQL editor or from
-- Claude Code with the service role key:
--
--   update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'you@example.com');
--
-- After that admins promote each other from inside the app and nobody needs
-- to open the dashboard again. Section 3 is what makes that bootstrap work
-- while still refusing the same UPDATE to a signed in member.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The column
--
-- not null with a default, so every row that already exists becomes a member
-- the moment this runs and nothing anywhere has to handle a null role. The
-- check constraint is the whole vocabulary: a typo like 'Admin' is refused by
-- the database rather than quietly granting nothing, which is the failure
-- that would take an afternoon to find.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'member';

do $$
begin
  alter table public.profiles
    add constraint profiles_role_known check (role in ('member', 'admin'));
exception
  when duplicate_object then null;   -- already there, this file re-runs
end
$$;

comment on column public.profiles.role is
  'member or admin. Admins write announcements, content pages and app settings, and set other people''s roles. Never writable by the person the row belongs to, see the trigger in section 3.';

-- Admins are a handful of rows in a table of everybody, so the index is
-- partial. It is read by hc_is_admin() on every policy evaluation.
create index if not exists profiles_admin_idx on public.profiles (id) where role = 'admin';


-- ---------------------------------------------------------------------------
-- 2. hc_is_admin()
--
-- The one question every policy in 0026 asks. It exists as a function rather
-- than as an inline subquery for a reason that is not style: a policy ON
-- public.profiles that selects FROM public.profiles re-enters that table's
-- policies and Postgres raises 42P17, infinite recursion. A SECURITY DEFINER
-- function is evaluated as its owner, which bypasses RLS, so the recursion
-- never starts.
--
-- WHY EXECUTE IS GRANTED TO authenticated, which migration 0011 spent a page
-- arguing against for a different function. A policy is evaluated as the role
-- running the query, so `authenticated` genuinely has to be able to call this
-- or every policy that uses it fails closed for everybody. The exposure it
-- buys is nil: it takes no arguments, reads only the caller's own row, and
-- answers a question the caller can already answer by selecting their own
-- profile, which the policy from 0009 has always allowed. Contrast
-- hc_export_my_data or the signup trigger, where the grant bought a caller
-- something they did not otherwise have.
--
-- anon IS GRANTED TOO, which looks wrong and is load bearing. The first draft
-- of this migration revoked it, on the reasoning that a signed out phone has
-- no business asking and that every write policy in 0026 should fail closed
-- for it. Both halves of that were true and the conclusion was still a bug,
-- caught by supabase/tests/0026_admin_content_test.sql before it shipped.
--
-- The SELECT policies in 0026 read `published or public.hc_is_admin()`.
-- Postgres short circuits `or`, so on a published row the function is never
-- called and a revoked grant is never noticed. On an UNPUBLISHED row it is
-- called, by whoever is asking, including anon. Without the grant that read
-- does not return fewer rows, it raises:
--
--   ERROR:  permission denied for function hc_is_admin
--
-- and PostgREST turns the whole request into a 500. So the moment an admin
-- saved their first draft, every signed out phone would stop being able to
-- read announcements at all, and Home would quietly lose the section. A
-- failure that is invisible until somebody uses the feature, and then hits
-- everybody who is not signed in.
--
-- Granting it costs nothing. auth.uid() is null with no session, so the
-- subquery is `where id = null`, which is false for every row: anon can call
-- this and can only ever be told no. The write side is unaffected and still
-- has two independent things wrong before anon could write, the policy and
-- the revoked privileges in 0026 section 5.
--
-- search_path is pinned for the reason spelled out at length in 0011.
-- ---------------------------------------------------------------------------

create or replace function public.hc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.hc_is_admin() from public;
grant execute on function public.hc_is_admin() to anon, authenticated;

comment on function public.hc_is_admin() is
  'True when the signed in person has role = admin, and always false with no session. Called from the policies in 0026. A function rather than a subquery because a profiles policy selecting from profiles recurses. anon needs EXECUTE or reads of any table whose SELECT policy mentions this raise rather than filtering, see migration 0025 section 2.';


-- ---------------------------------------------------------------------------
-- 3. The guard on the column
--
-- THE HOLE THIS CLOSES, which is easy to miss. Migration 0009 gave everybody
-- an UPDATE policy on their own profile row, because that is how the Your
-- information form saves. `role` is now a column on that row. Without what
-- follows, any signed in person could make themselves an admin with one
-- PATCH to /rest/v1/profiles?id=eq.<their own id>. Nothing in the app would
-- do that, and the app is not what is being defended against.
--
-- Postgres RLS cannot express "you may update this row but not that column",
-- so the rule lives in a trigger, which is the only place it can be complete.
-- It runs on every update and it only ever has an opinion about one column.
--
-- THE THREE CASES, in the order the trigger takes them:
--
--   auth.uid() is null    No session at all: the service role, the SQL
--                         editor, a migration, psql. This is the bootstrap
--                         path from the file header, and it is also the only
--                         way the very first admin can exist, since by
--                         definition nobody is an admin yet. A caller with no
--                         session already holds the service role key, which
--                         bypasses RLS on every table in the project, so
--                         there is nothing here left to protect from it.
--
--   not hc_is_admin()     A signed in member trying to change any role,
--                         including their own. Refused.
--
--   new.id = auth.uid()   An admin trying to change their own role. Refused,
--                         which is the last-admin guard: an app whose only
--                         admin demotes themselves at 11pm on a Saturday has
--                         no way back in without the dashboard. The app
--                         refuses this too and says why, and this is the half
--                         that is true even if somebody bypasses the app.
--
-- Raised as errors rather than silently reverting the value, because a write
-- that quietly does nothing is how you spend an evening wondering whether the
-- form is broken.
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
    return new;                                  -- service role, see above
  end if;

  if not public.hc_is_admin() then
    raise exception 'Only an admin can change a role.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.id = auth.uid() then
    raise exception 'An admin cannot change their own role.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function public.hc_guard_role_change() from public, anon, authenticated;

comment on function public.hc_guard_role_change() is
  'Refuses any change to profiles.role that did not come from an admin acting on somebody else, or from a session-less caller holding the service role. See migration 0025 section 3.';

drop trigger if exists profiles_guard_role_change on public.profiles;

create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function public.hc_guard_role_change();

/* INSERT is not guarded and does not need to be. The only insert path a
   signed in person has is the policy from 0009, `with check (auth.uid() =
   id)`, so the row they can create is their own, and its role comes from the
   column default, 'member'. Naming a role in that insert body is possible and
   pointless: the trigger above catches the update that would follow, and the
   signup trigger from 0009 has already created the row before the app ever
   tries, so the insert loses to the primary key anyway. */


-- ---------------------------------------------------------------------------
-- 4. Reading the roster
--
-- Manage Users has to show a name, an email, and a role. The email lives in
-- auth.users, which no client role can read and none should be able to: a
-- readable auth.users is the whole congregation's contact list behind one
-- publishable key. And profiles is deliberately private to its owner, per the
-- policy in 0009, which is exactly the property that should not be relaxed
-- with a blanket "admins can read every profile" policy.
--
-- So the roster is a function instead of a view or a policy. It is SECURITY
-- DEFINER, it checks hc_is_admin() before it returns a single row, and it
-- returns four columns rather than select *. An admin needs to know who
-- somebody is and what they can do. They do not need their birthdate and
-- home address to change a role, and this is the difference between an admin
-- screen and a directory nobody agreed to be in.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_list_users()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  last_name   text,
  role        text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.id,
           u.email::text,
           p.first_name,
           p.last_name,
           coalesce(p.role, 'member'),
           u.created_at
      from auth.users u
      left join public.profiles p on p.id = u.id
     -- Admins first, then everybody by name. 'admin' sorts before 'member'
     -- on its own, which is a happy accident rather than something to lean
     -- on, so it is spelled out rather than left to the reader.
     order by (coalesce(p.role, 'member') = 'admin') desc,
              lower(coalesce(nullif(p.first_name, ''), u.email::text));
end;
$$;

revoke all on function public.hc_admin_list_users() from public, anon, authenticated;
grant execute on function public.hc_admin_list_users() to authenticated;

comment on function public.hc_admin_list_users() is
  'Every account, for the Manage Users screen. Admins only, checked inside. Returns four columns rather than the whole profile: an admin changing a role has no business reading somebody''s address.';


-- ---------------------------------------------------------------------------
-- 5. Changing a role
--
-- The app's only write path to the column. The trigger in section 3 would
-- catch a direct PATCH on its own, so this is not the security boundary; it
-- is the thing that turns a refusal into a sentence somebody can read, and it
-- keeps the app's whole role-writing surface at one named call, which is the
-- shape 0016 settled on for the Group tab.
--
-- The self check is here as well as in the trigger on purpose. Duplicated
-- guards on an irreversible action are worth their cost, and this one can say
-- why in the app's own voice.
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

  update public.profiles set role = p_role where id = p_user;

  if not found then
    raise exception 'That person has no profile row.';
  end if;
end;
$$;

revoke all on function public.hc_admin_set_role(uuid, text) from public, anon, authenticated;
grant execute on function public.hc_admin_set_role(uuid, text) to authenticated;

comment on function public.hc_admin_set_role(uuid, text) is
  'Promote or demote somebody. Admins only, and never yourself. The trigger in 0025 section 3 enforces the same two rules against a direct PATCH.';


-- ---------------------------------------------------------------------------
-- 6. What the security advisor will say about this, and why it is fine
--
-- Migration 0011 spent a page arguing that an unexplained warning sitting on
-- the table that holds member records is the thing you do not want to be
-- explaining during a privacy review. That argument still holds, so the four
-- warnings this migration and 0027 add are written down here rather than left
-- for somebody to work out from scratch in six months.
--
--   0028_anon_security_definer_function_executable
--     hc_is_admin
--   0029_authenticated_security_definer_function_executable
--     hc_is_admin, hc_admin_list_users, hc_admin_set_role,
--     hc_admin_send_announcement
--
-- All four are the same shape as the eighteen the Group tab already carries
-- from 0016, and for the same reason: in this project a SECURITY DEFINER
-- function IS the permission boundary, so the ones that matter are exactly
-- the ones that have to be callable. The advisor flags the grant; it cannot
-- see the check on the first line of each body.
--
-- Unlike 0011's case, these cannot be quietly revoked. hc_is_admin is read by
-- the policies in 0026 and by both client roles, and revoking it from anon is
-- the bug 0026's test file caught, described in section 2 above. The other
-- three each open with `if not public.hc_is_admin() then raise` and are
-- useless to anybody who is not an admin.
--
-- The three admin functions are also the reason there is no blanket "admins
-- can read every profile" or "admins can update any profile" policy, which is
-- the more obvious way to build this. A policy cannot be restricted to
-- particular columns, so an admin UPDATE policy on profiles would hand every
-- admin the ability to rewrite anybody's home address as a side effect of
-- being able to change a role. Narrow functions can say exactly what they
-- touch. profiles therefore gains no new policy at all in this migration:
-- the whole role-writing surface is hc_admin_set_role, and the trigger in
-- section 3 is what makes that true even for a client that skips it.
