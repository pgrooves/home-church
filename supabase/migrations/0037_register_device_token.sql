-- ===========================================================================
-- Home Church, the push registration that never registered
--
-- WHAT WAS WRONG. Not one row has ever reached device_tokens. Everything else
-- in the chain is built and correct: the app asks for permission at the right
-- moment, the Capacitor listener fires, the token arrives, the columns exist,
-- the sender exists, the cron tick exists. The registration request itself was
-- refused by Postgres every single time, silently, and the app's catch turned
-- the refusal into `false` and said nothing.
--
-- The refusal, exactly. js/native.js upserts by POSTing with
-- `Prefer: resolution=merge-duplicates`, which PostgREST turns into
--
--   insert into device_tokens (...) values (...)
--   on conflict (token) do update set ...
--
-- and `on conflict do update` requires SELECT on the table, on top of INSERT
-- and UPDATE. Postgres needs to read the conflicting row to decide the
-- conflict, so the arbiter columns have to be readable. 0010 revoked SELECT
-- from anon on purpose, and that revoke is the right call for the reason 0010
-- gives at length: a readable token table is a downloadable list of every
-- phone with this app installed. So the upsert came back
--
--   42501: permission denied for table device_tokens
--   HINT: Grant the required privileges to the current role with:
--         GRANT SELECT ON public.device_tokens TO anon;
--
-- which PostgREST returns as 403, which `if (!res.ok) return false` swallows.
--
-- TAKING THE HINT WOULD BE THE BUG. Granting anon SELECT is precisely the
-- thing 0010 refused, and doing it to satisfy an ON CONFLICT clause would trade
-- the whole privacy argument for one line of convenience. RLS would still have
-- to hold the line alone, and 0010's "two separate things have to be wrong"
-- would become one.
--
-- WHAT THIS DOES INSTEAD. One SECURITY DEFINER function that performs the
-- upsert as its owner, and is the only thing anon may call. The table keeps
-- exactly the grants 0010 gave it, anon still has no SELECT, and the single
-- statement that needed to read a row is the single statement that runs
-- privileged. The registration path stops going through PostgREST's upsert
-- and starts going through /rest/v1/rpc/hc_register_device_token.
--
-- The two other writes are untouched and need nothing. Turning a switch off
-- and deregistering are both PATCH, which is a plain UPDATE, which anon has
-- and which never needed SELECT. They only looked broken because they run off
-- a token the app never got to store.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0010, 0012 and 0027, which created the table and its four switches.
--   Safe to run more than once.
-- ===========================================================================


create or replace function public.hc_register_device_token(
  p_token             text,
  p_platform          text    default 'ios',
  p_new_guide         boolean default true,
  p_sunday_reminder   boolean default true,
  p_group_day         boolean default false,
  p_announcements     boolean default true
)
returns void
language plpgsql
security definer
-- Pinned for the reason 0011 and 0012 both spell out: an unpinned search_path
-- on a SECURITY DEFINER function is how a privilege escalation gets written by
-- accident.
set search_path = public
as $$
begin
  /* The guards are here rather than in the app because the app is not the only
     thing that can call this. Anybody with the publishable key can, which was
     already true of the INSERT this replaces. What that person can do is
     unchanged: write a row keyed by a token they invented. A token nobody's
     phone owns is a row APNs answers 410 for and the sender retires. */
  if p_token is null or btrim(p_token) = '' then
    raise exception 'hc_register_device_token: a token is required';
  end if;

  -- An APNs token is 64 hex characters. The bound is loose on purpose, because
  -- Apple has changed that length before and a future platform will not match
  -- it at all, but it stops the column being used as free storage.
  if length(p_token) > 512 then
    raise exception 'hc_register_device_token: that is not a device token';
  end if;

  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'hc_register_device_token: unknown platform %', p_platform;
  end if;

  insert into public.device_tokens (
    token, platform, active,
    wants_new_guide, wants_sunday_reminder, wants_group_day, wants_announcements
  ) values (
    btrim(p_token), p_platform, true,
    coalesce(p_new_guide, false),
    coalesce(p_sunday_reminder, false),
    coalesce(p_group_day, false),
    coalesce(p_announcements, false)
  )
  on conflict (token) do update set
    platform              = excluded.platform,
    -- Always true. Re-registering is how somebody who switched everything off
    -- and later changed their mind comes back, and the row was left inactive.
    active                = true,
    wants_new_guide       = excluded.wants_new_guide,
    wants_sunday_reminder = excluded.wants_sunday_reminder,
    wants_group_day       = excluded.wants_group_day,
    wants_announcements   = excluded.wants_announcements,
    -- A token that just re-registered belongs to a phone that is awake, so the
    -- soft failures counted against it are stale. 0012 retires a hard 410
    -- immediately and counts the rest here; this is what clears the count.
    failure_count         = 0,
    last_error            = null;
end;
$$;

revoke all on function public.hc_register_device_token(text, text, boolean, boolean, boolean, boolean)
  from public;
grant execute on function public.hc_register_device_token(text, text, boolean, boolean, boolean, boolean)
  to anon, authenticated;

comment on function public.hc_register_device_token(text, text, boolean, boolean, boolean, boolean) is
  'The only way a phone registers for push. SECURITY DEFINER because the upsert has to read the conflicting row, and anon must never have SELECT on device_tokens. See 0010 for why that matters.';


-- ---------------------------------------------------------------------------
-- What the security advisor will say about this, and why it is fine
--
-- One more of the shape 0016, 0025 and 0036 already carry:
--
--   0028_anon_security_definer_function_executable
--     hc_register_device_token
--
-- Same answer as the ones before it. In this project a SECURITY DEFINER
-- function IS the permission boundary, so the ones that matter are exactly the
-- ones that have to be callable. This one writes a single row keyed by a value
-- the caller already holds, returns void, and reads nothing back. It is a
-- strictly smaller opening than the anon INSERT policy 0010 already grants,
-- because that policy allows any column shape and this allows one.
-- ---------------------------------------------------------------------------
