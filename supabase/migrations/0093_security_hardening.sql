-- ===========================================================================
-- Home Church, three loose ends from a security pass
--
-- From a pass on 20 October 2026, against the live project rather than the
-- migrations, because the live project is what answers a stranger. Nothing
-- here was open; each is a second lock on a door that already had one.
--
-- 1. Nobody creates their own profile with a tier already on it.
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
-- 2. device_tokens' two dead policies.
--
--    "a phone can register itself" and "a phone can update its own row" from
--    0010 are `true` for anon: any row, any column. They do nothing today,
--    because anon and authenticated hold no privilege on the table at all and
--    every write goes through hc_register_device_token and its siblings. But a
--    policy that says yes to everybody is one stray GRANT from being the rule,
--    and 0017 is the record of how easily a grant comes back. Dropped, so the
--    table is closed by two things rather than one.
--
-- 3. hc_cafe_today had no search_path, the one function the advisor named.
--    Not SECURITY DEFINER, so low risk; pinned anyway.
--
-- NOT HERE: the live group room listing the same pass found (anon can read
-- every live room and its code). Left as it is for now, by choice.
--
-- Rollback: supabase/rollback/0093_security_hardening_down.sql
-- Tests:    supabase/tests/0093_security_hardening_test.sql
-- ===========================================================================

-- 1. A client inserting a profile gets the defaults or nothing.
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

-- 2. device_tokens: no policy says yes to a client role.
drop policy if exists "a phone can register itself"    on public.device_tokens;
drop policy if exists "a phone can update its own row" on public.device_tokens;
revoke all on public.device_tokens from anon, authenticated;

-- 3. A fixed search_path.
alter function public.hc_cafe_today() set search_path = public;
