-- ===========================================================================
-- Home Church, closing the room list and three loose ends
--
-- From a security pass on 20 October 2026, against the live project rather
-- than the migrations, because the live project is what answers a stranger.
--
-- 1. THE ROOM LIST, which is the one that mattered.
--
--   0016 let anybody read a group room while it was live, so that typing a
--   code on a signed out phone could say "Lakeview Thursday, 5 here" before
--   asking anybody to sign in. The policy was keyed on the room being live,
--   not on knowing its code, and the code was a column anybody could select.
--   So `GET /group_rooms?select=code,group_name` with the publishable key
--   listed every room meeting tonight and the code to each one, which is the
--   whole of what 0056's throttle on guessing was protecting. A free account
--   and that list was a seat in every group, reading answers and prayer
--   requests written for eleven friends.
--
--   Nothing in the app needs it any more. The signed out look-up, peek() in
--   js/rooms.js, had no caller left and goes with this migration. Joining is
--   hc_room_join, which is SECURITY DEFINER, takes the code, and is
--   throttled; hosts and members read their own room through "members keep
--   reading a room after it closes", which covers it while it is open too,
--   because hc_room_open and hc_room_join both put the person on the roster.
--
--   The questions go the same way. Readable by anon while a room was live,
--   which listed every live room's id along with them, and a host can add
--   questions of their own. Members only now.
--
-- 2. device_tokens' two dead policies.
--
--   "a phone can register itself" and "a phone can update its own row" from
--   0010 are `true` for anon: any row, any column. They do nothing today,
--   because anon and authenticated hold no privilege on the table at all and
--   every write goes through hc_register_device_token and its siblings. But a
--   policy that says yes to everybody is one stray GRANT from being the rule,
--   and 0017 is the record of how easily a grant comes back. Turned to
--   `false`, so the table is closed by two things rather than one.
--
-- 3. hc_cafe_today had no search_path, the one function the advisor named.
--    Not SECURITY DEFINER, so low risk; pinned anyway.
--
-- 4. anon loses EXECUTE on hc_room_is_live and hc_room_is_member. They
--    answered nothing anon could use, and after (1) no policy anon is
--    subject to calls them.
--
-- 5. Nobody creates their own profile with a tier already on it.
--
--    0025, 0036 and 0085 guard role, can_host and can_run_cafe on UPDATE:
--    only an admin changes them, and never their own. INSERT had no guard,
--    and the "people can insert their own profile" policy lets a signed in
--    person insert their own row with any column set. Today that path is
--    shut by something else entirely: hc_handle_new_user creates the row in
--    the same transaction as the account, nobody may delete their own, so
--    an insert collides and an upsert becomes an UPDATE the guards see. But
--    "a row always already exists" is a property of a trigger on auth.users,
--    not of this table, and the day it stops holding, a fresh account could
--    insert itself as an admin. This makes INSERT answer the same as UPDATE.
--
-- Rollback: supabase/rollback/0093_security_hardening_down.sql
-- Tests:    supabase/tests/0093_security_hardening_test.sql, and the anon
--           block in 0016's test, which asserted the old behaviour.
-- ===========================================================================

-- ALTER POLICY, NOT DROP. This was applied to the live project through a
-- connection that would not run a DROP, so each policy is changed in place
-- and renamed for what it now does. The effect is the same as dropping them:
-- what anybody can read or write is identical, and these statements are
-- exactly what ran.

-- 1. Rooms and their questions, members only. The live-room policy becomes a
--    second copy of "members keep reading a room after it closes". Each
--    rename is skipped once done, so this file stays re-runnable.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename = 'group_rooms'
              and policyname = 'a live room can be found by its code') then
    alter policy "a live room can be found by its code" on public.group_rooms
      rename to "members read the room they are in";
  end if;
end $$;
alter policy "members read the room they are in" on public.group_rooms
  to authenticated
  using (public.hc_room_is_member(id));
revoke select on public.group_rooms from anon;

alter policy "questions follow the room" on public.group_room_questions
  to authenticated
  using (public.hc_room_is_member(room_id));
revoke select on public.group_room_questions from anon;

-- 2. device_tokens: no policy says yes to a client role.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename = 'device_tokens'
              and policyname = 'a phone can register itself') then
    alter policy "a phone can register itself" on public.device_tokens
      rename to "clients do not write device_tokens directly";
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename = 'device_tokens'
              and policyname = 'a phone can update its own row') then
    alter policy "a phone can update its own row" on public.device_tokens
      rename to "clients do not update device_tokens directly";
  end if;
end $$;
alter policy "clients do not write device_tokens directly" on public.device_tokens
  with check (false);
alter policy "clients do not update device_tokens directly" on public.device_tokens
  using (false) with check (false);
revoke all on public.device_tokens from anon, authenticated;

-- 3. A fixed search_path.
alter function public.hc_cafe_today() set search_path = public;

-- 4. Nothing anon is subject to calls these now.
revoke execute on function public.hc_room_is_live(uuid)   from anon;
revoke execute on function public.hc_room_is_member(uuid) from anon;

-- 5. A client inserting a profile gets the defaults or nothing.
create or replace function public.hc_guard_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The signup trigger and the service role have no auth.uid(), and insert
  -- only an id, so the defaults apply to them either way.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from 'member'
     or new.can_host is distinct from false
     or new.can_run_cafe is distinct from false then
    raise exception 'A new profile starts as a member. Only an admin can change that, afterwards.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function public.hc_guard_profile_insert() from public, anon, authenticated;

drop trigger if exists profiles_guard_insert on public.profiles;
create trigger profiles_guard_insert
  before insert on public.profiles
  for each row execute function public.hc_guard_profile_insert();
