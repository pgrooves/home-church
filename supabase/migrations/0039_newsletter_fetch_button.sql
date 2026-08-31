-- ===========================================================================
-- Home Church, checking the mailbox on purpose
--
-- WHAT THIS ADDS. One function, so an admin can tap a button and have the
-- newsletter read now rather than within the next twenty minutes.
--
-- WHY A FUNCTION AND NOT A FETCH FROM THE APP. The Edge Function proves its
-- caller with hc_newsletter_cron_secret, which lives in the vault and must
-- never reach a phone: a secret shipped to a client is a secret published. So
-- the app cannot call the intake directly and should not be able to. This is
-- the narrow door instead, exactly the shape hc_admin_send_announcement took
-- in 0027 for the same reason: hc_newsletter_tick() stays revoked from every
-- client role, and this wrapper is the only thing an admin can reach.
--
-- WHAT THE BUTTON CANNOT DO, which is the point of it being this small. It
-- cannot publish anything, it cannot choose a mailbox, and it takes no
-- arguments at all. The most a leaked session can cause is a mailbox being
-- read slightly more often than every twenty minutes, and the cooldown below
-- bounds even that.
--
-- THE COOLDOWN, and what it honestly does and does not prevent. It refuses a
-- second check within fifteen seconds of the last one FINISHING, which stops
-- the ordinary failure: somebody taps the button, nothing appears within two
-- seconds because a mailbox and a language model are involved, and they tap it
-- another six times. It does not prevent two genuinely concurrent runs, since
-- a run is logged when it completes and an in-flight one is invisible here.
-- That case is already safe rather than merely tolerable: newsletter_emails is
-- unique on message_id, so the second run loses the insert race, catches the
-- 23505 and skips. Duplicate drafts are impossible by construction, and this
-- only exists to stop us spending Gemini calls on the same email twice.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0025 (hc_is_admin) and 0038 (the tick and the run log).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The button an admin actually presses
--
-- Returns the pg_net request id, which the app does not use and is worth
-- returning anyway: it is the only handle on the request that exists, and it
-- is what you join to net._http_response with when a check is behaving oddly.
--
-- SECURITY DEFINER with a pinned search_path, for the reasons 0011 sets out at
-- length. It has to be definer because hc_newsletter_tick() reads the vault,
-- which authenticated cannot.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_fetch_newsletter()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_last timestamptz;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select max(ran_at) into v_last from public.newsletter_runs;

  -- Said in the app's own voice rather than as a constraint violation,
  -- because it is a thing a person did and not a thing that went wrong.
  if v_last is not null and v_last > now() - interval '15 seconds' then
    raise exception 'The mailbox was just checked. Give it a few seconds.';
  end if;

  return public.hc_newsletter_tick();
end;
$$;

revoke all on function public.hc_admin_fetch_newsletter() from public, anon, authenticated;
grant execute on function public.hc_admin_fetch_newsletter() to authenticated;

comment on function public.hc_admin_fetch_newsletter() is
  'Asks the newsletter-intake Edge Function to check the mailbox now instead of at the next twenty minute tick. Admins only, checked inside. Takes no arguments: the most it can cause is a mailbox being read. See migration 0039.';


-- ---------------------------------------------------------------------------
-- 2. What the advisor will say, and why it is fine
--
-- 0039_authenticated_security_definer_function_executable on
-- hc_admin_fetch_newsletter, which is the same warning 0025 section 6 already
-- records for hc_admin_list_users, hc_admin_set_role and
-- hc_admin_send_announcement, and it is fine for the same reason: in this
-- project a SECURITY DEFINER function IS the permission boundary, so the ones
-- that matter are exactly the ones that have to be callable. The advisor flags
-- the grant and cannot see the hc_is_admin() check on the first line.
-- ---------------------------------------------------------------------------
