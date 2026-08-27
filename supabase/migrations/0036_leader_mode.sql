-- ===========================================================================
-- Home Church, Leader mode becomes something the church grants
--
-- WHAT CHANGED AND WHY. Leader mode shipped as a switch in Your account that
-- anybody could flip for themselves. That was honest when all it did was put
-- a presentation button in the guide and a private roster on the phone that
-- turned it on: nothing there is authority over anybody else.
--
-- It is not honest any more. Leader mode is the word this app uses for the
-- person who runs a group, and running a group now means opening a room,
-- editing the questions the whole group sees, and taking down anything
-- anybody wrote in it. Migration 0016 already saw that coming and put the
-- hosting half behind `can_host`, a column the church sets and the app never
-- writes, while leaving the switch alone. So the app has spent several
-- releases with two words for one person: a switch anybody could turn on that
-- said "leader", and a column only the church could set that decided whether
-- the leader could actually do anything.
--
-- This migration collapses those into one. `can_host` is the whole of it: it
-- is what Leader mode now means, an admin turns it on from Admin -> Manage
-- users, and it is the only thing the app reads before drawing leader tools.
-- The switch in Your account is gone.
--
-- WHY THE COLUMN IS STILL CALLED can_host. Renaming it would read better and
-- would be a bad trade. Every migration in this project promises to be safe
-- to run again, supabase/tests/run.sh applies each one twice to prove it, and
-- 0016 both creates `can_host` and defines hc_room_open against it. Rename the
-- column here and a re-run of 0016 quietly adds a second one, defaulted to
-- false, and puts hosting back behind it: every leader in the church loses
-- their room on a Thursday evening because somebody re-applied an old file.
-- The name is a small cost, paid once, in the comment below. What the column
-- means is set out there and in section 1.
--
-- WHO CAN HOST NOW, which is the second half of the change: leaders and
-- admins. An admin can already grant themselves the column in two taps, so a
-- check that made them do it first would be ceremony rather than a boundary,
-- and an admin locked out of the room they are meant to be helping with is a
-- worse outcome than the one being defended against. Section 3.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. What the column means now
--
-- The column itself is 0016's and does not change. Its comment does, because
-- the comment is where somebody reading the schema finds out that this is the
-- thing the app calls Leader mode, and that there is no second switch
-- anywhere that also has an opinion.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists can_host boolean not null default false;

comment on column public.profiles.can_host is
  'Leader mode. Set by an admin from Admin -> Manage users, or by the service role; never by the person the row belongs to, see the trigger in migration 0036 section 2. A leader gets the leader tools in the app and can open and host a group room. Admins can host without it, see hc_is_leader().';


-- ---------------------------------------------------------------------------
-- 2. The guard on the column
--
-- THE HOLE THIS CLOSES. It is the same one migration 0025 section 3 closed
-- for `role`, and it has been open on this column since 0016: migration 0009
-- gives every signed in person an UPDATE policy on their own profile row, and
-- `can_host` is a column on that row. "Not self service" was true of the app
-- and had nothing enforcing it underneath, so one PATCH to
-- /rest/v1/profiles?id=eq.<their own id> made anybody a host. That mattered
-- less while hosting was the only thing it bought and the app never mentioned
-- it; it matters now that this column is the app's whole answer to "is this
-- person a leader".
--
-- A separate trigger from 0025's rather than a rewrite of it, deliberately.
-- Each one guards one column and says so in its name, and re-applying 0025
-- (which every migration here invites) cannot silently take this one away.
--
-- THE THREE CASES, in the order the trigger takes them, and they are 0025's
-- three minus one:
--
--   auth.uid() is null    The service role, the SQL editor, a migration,
--                         scripts/hc_supabase.py host. Allowed, and this is
--                         the path that still works when nobody is an admin
--                         yet or the app is on fire.
--
--   not hc_is_admin()     Anybody signed in who is not an admin, including
--                         a leader trying to keep themselves one. Refused.
--
--   an admin              Allowed, on anybody's row including their own.
--                         0025 refuses an admin their own `role` because an
--                         app whose only admin demotes themselves at 11pm has
--                         no way back in. Nothing like that is true here:
--                         an admin can host without the column (section 3),
--                         so setting it on themselves changes nothing they
--                         could not already do, and any admin can put it back.
-- ---------------------------------------------------------------------------

create or replace function public.hc_guard_leader_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.can_host is not distinct from old.can_host then
    return new;                                  -- the ordinary profile save
  end if;

  if auth.uid() is null then
    return new;                                  -- service role, see above
  end if;

  if not public.hc_is_admin() then
    raise exception 'Only an admin can turn Leader mode on or off.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function public.hc_guard_leader_change() from public, anon, authenticated;

comment on function public.hc_guard_leader_change() is
  'Refuses any change to profiles.can_host that did not come from an admin or from a session-less caller holding the service role. The app half of the same rule is hc_admin_set_leader. See migration 0036 section 2.';

drop trigger if exists profiles_guard_leader_change on public.profiles;

create trigger profiles_guard_leader_change
  before update on public.profiles
  for each row execute function public.hc_guard_leader_change();

/* INSERT is not guarded, for the reason spelled out at the end of 0025
   section 3: the only insert a signed in person can make is their own row,
   under 0009's `with check (auth.uid() = id)`, and the signup trigger has
   already created that row with the column at its default. An insert naming
   can_host loses to the primary key, and an update afterwards meets the
   trigger above. */


-- ---------------------------------------------------------------------------
-- 3. hc_is_leader()
--
-- One place that answers "may this person run a group", so the room function
-- below and anything added later cannot drift apart on it. Shaped like
-- hc_is_admin() from 0025 and for the same reasons: SECURITY DEFINER so that
-- reading profiles from something that may itself be under a profiles policy
-- cannot recurse, search_path pinned, EXECUTE granted to the roles that have
-- to be able to call it.
--
-- `or role = 'admin'` is the second half of this migration. See the header.
--
-- anon IS NOT GRANTED, which is where this parts company with hc_is_admin.
-- That one had to be, and 0025 section 2 spends a page on why: it is named in
-- the SELECT policies from 0026, a policy expression runs with the caller's
-- own privileges, and a revoked grant there does not return fewer rows, it
-- raises and PostgREST turns the whole read into a 500. Nothing anon
-- evaluates mentions this function. Its only caller is hc_room_open, which is
-- SECURITY DEFINER and refuses a caller with no session on its first line, so
-- a grant to anon would widen the signed out surface for nothing.
--
-- The test in supabase/tests/0017_group_rooms_grants_test.sql keeps that list
-- exact and will fail the day somebody adds to it by accident, which is the
-- point of it.
-- ---------------------------------------------------------------------------

create or replace function public.hc_is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (can_host or role = 'admin')
  );
$$;

revoke all on function public.hc_is_leader() from public, anon;
grant execute on function public.hc_is_leader() to authenticated;

comment on function public.hc_is_leader() is
  'True when the signed in person is a leader (profiles.can_host) or an admin, and always false with no session. What Leader mode means, asked in one place. See migration 0036.';


-- ---------------------------------------------------------------------------
-- 4. Opening a room
--
-- 0016's function, with two lines changed: it asks hc_is_leader() instead of
-- reading can_host itself, so an admin can open a room, and the refusal says
-- what to do about it. Everything else, the code retry loop included, is
-- 0016's and is repeated here rather than patched because a function is
-- replaced whole.
--
-- If 0016 is ever re-applied after this file, hosting narrows back to
-- can_host alone until this one is run again. That is the deliberate shape of
-- the trade in the header: the failure is an admin who has not been made a
-- leader losing the Host tonight section, which somebody can fix from their
-- phone, rather than every leader in the church losing it at once.
-- ---------------------------------------------------------------------------

create or replace function public.hc_room_open(
  p_guide_id    text,
  p_guide_title text,
  p_group_name  text,
  p_questions   jsonb        -- [{heading, body}, ...] in order, from the guide
)
returns public.group_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room  public.group_rooms;
  v_name  text;
  v_code  text;
  v_try   integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  if not public.hc_is_leader() then
    raise exception 'Leader mode is off for this account. An admin turns it on under Manage users.'
      using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(p.first_name), ''), 'The host')
    into v_name
    from public.profiles p where p.id = auth.uid();

  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Questions must be an array.' using errcode = '22023';
  end if;

  -- Six digits, retried on the astronomically unlikely collision with a live
  -- room. Ten tries and then we would rather fail loudly than loop.
  loop
    v_try := v_try + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.group_rooms (code, host_id, group_name, guide_id, guide_title, closes_at)
      values (
        v_code, auth.uid(), nullif(btrim(p_group_name), ''), p_guide_id, p_guide_title,
        -- End of the day, so a room nobody closed is still over by morning.
        date_trunc('day', now()) + interval '1 day'
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_try >= 10 then raise; end if;
    end;
  end loop;

  insert into public.group_room_members (room_id, person_id, display_name, is_host)
  values (v_room.id, auth.uid(), coalesce(v_name, 'The host'), true);

  insert into public.group_room_questions (room_id, heading, body, sort_order)
  select v_room.id,
         nullif(btrim(q ->> 'heading'), ''),
         btrim(q ->> 'body'),
         (ord * 10)::int
    from jsonb_array_elements(p_questions) with ordinality as t(q, ord)
   where length(btrim(coalesce(q ->> 'body', ''))) > 0;

  return v_room;
end;
$$;

comment on function public.hc_room_open(text, text, text, jsonb) is
  'Opens a room and seats the caller as its host. Leaders and admins only, checked with hc_is_leader(). Redefined from 0016 by migration 0036.';


-- ---------------------------------------------------------------------------
-- 5. Reading the roster
--
-- Manage users draws a Leader switch on every row, so the roster has to carry
-- the column. Dropped and recreated rather than replaced: Postgres will not
-- let CREATE OR REPLACE change a function's OUT columns, and this adds one.
--
-- `is_leader` rather than `can_host` in the result, because this is the
-- screen's vocabulary and the screen is the only caller. The column keeps its
-- name in the table, where the argument in the header applies; nothing forces
-- that name onto a name the app has to read.
--
-- Still four kinds of thing about a person and no more: who they are, how to
-- recognise them, what they can do, and when they turned up. An admin
-- changing what somebody is allowed to do has no business reading their
-- address, which is the reason this is a function and not a policy. See 0025
-- section 4, which says the rest of it.
-- ---------------------------------------------------------------------------

drop function if exists public.hc_admin_list_users();

create or replace function public.hc_admin_list_users()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  last_name   text,
  role        text,
  is_leader   boolean,
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
           coalesce(p.can_host, false),
           u.created_at
      from auth.users u
      left join public.profiles p on p.id = u.id
     -- Admins first, then leaders, then everybody by name. Spelled out rather
     -- than left to the fact that 'admin' happens to sort before 'member'.
     order by (coalesce(p.role, 'member') = 'admin') desc,
              coalesce(p.can_host, false) desc,
              lower(coalesce(nullif(p.first_name, ''), u.email::text));
end;
$$;

revoke all on function public.hc_admin_list_users() from public, anon, authenticated;
grant execute on function public.hc_admin_list_users() to authenticated;

comment on function public.hc_admin_list_users() is
  'Every account, for the Manage Users screen. Admins only, checked inside. Returns five columns rather than the whole profile: an admin changing what somebody can do has no business reading their address.';


-- ---------------------------------------------------------------------------
-- 6. Turning Leader mode on and off
--
-- The app's only write path to the column, the same shape hc_admin_set_role
-- gives `role`: the trigger in section 2 is the boundary, and this is the
-- thing that turns a refusal into a sentence and keeps the app's whole
-- leader-writing surface at one named call.
--
-- No self check, unlike hc_admin_set_role. Section 2 says why: an admin is
-- already a leader by role, so this cannot take anything away from them and
-- cannot lock anybody out. The screen does not draw the switch on any admin's
-- row all the same, their own included, because a switch that changes nothing
-- anybody can see is a switch somebody will tap twice wondering what is
-- broken. The column keeps whatever it held while it is hidden, so demoting
-- an admin brings their row's switch back showing the truth rather than a
-- default.
--
-- The row has to exist. A person who has never opened the app has no profile
-- row to mark, and saying so is better than an update that matches nothing
-- and reports success.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_set_leader(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_on is null then
    raise exception 'On or off, not neither.' using errcode = '22023';
  end if;

  update public.profiles set can_host = p_on where id = p_user;

  if not found then
    raise exception 'That person has no profile row.';
  end if;
end;
$$;

revoke all on function public.hc_admin_set_leader(uuid, boolean) from public, anon, authenticated;
grant execute on function public.hc_admin_set_leader(uuid, boolean) to authenticated;

comment on function public.hc_admin_set_leader(uuid, boolean) is
  'Turn Leader mode on or off for somebody. Admins only. The trigger in 0036 section 2 enforces the same rule against a direct PATCH.';


-- ---------------------------------------------------------------------------
-- 7. What the security advisor will say about this, and why it is fine
--
-- One more of the shape 0025 section 6 and 0016 already carry:
--
--   0029_authenticated_security_definer_function_executable
--     hc_is_leader, hc_admin_set_leader
--
-- The same answer as the eighteen before it. In this project a SECURITY
-- DEFINER function IS the permission boundary, so the ones that matter are
-- exactly the ones that have to be callable, and the advisor can see the
-- grant but not the check on the first line of the body. hc_is_leader reads
-- only the caller's own row and answers a question they can already answer by
-- selecting it; hc_admin_set_leader opens with
-- `if not public.hc_is_admin() then raise` and is useless to anybody else.
--
-- Nothing new appears under 0028_anon_..., because section 3 does not grant
-- anon anything.
--
-- hc_admin_list_users is dropped and recreated above, so its existing warning
-- of the same kind survives this file rather than being a new one.
-- ---------------------------------------------------------------------------
