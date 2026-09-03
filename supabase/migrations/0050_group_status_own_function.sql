-- ===========================================================================
-- Home Church, the home groups button gets its own Edge Function
--
-- WHAT CHANGES. One URL. hc_admin_refresh_group_status() posted to
-- newsletter-intake, which 0048 put the group_status mode inside; it now posts
-- to a function of its own called group-status. Nothing else about the button
-- moves: same guard, same cooldown, same secret, same log table, same app.
--
-- WHY, and it is worth writing down because 0048's header argues the opposite
-- at length. That argument was about setup cost — one deployment, one secret,
-- no second place for the two to drift — and it was right about all three. It
-- was wrong about the thing that turned out to matter, which is who can ship a
-- fix.
--
-- newsletter-intake is a hundred kilobytes, most of it a hand written IMAP
-- client, and every change to this feature meant redeploying the church's
-- mailbox reader to change a prompt. The first time that bill came due, the
-- button had already shipped and the deployed function did not know the flag:
-- it ignored `group_status`, ran an ordinary mailbox check, answered 200 and
-- wrote a newsletter_runs row, so from the app it looked exactly like a model
-- that never finished. Nothing was broken and nothing could be diagnosed from
-- the app either.
--
-- The two jobs were never one job. That function opens a mailbox; this one
-- reads a table. Splitting them costs a second deployment and buys a function
-- small enough to read in one sitting and safe to redeploy on a Saturday.
--
-- WHAT IT DOES NOT COST: a second secret. Edge Function secrets are project
-- wide, so group-status reads the same HC_NEWSLETTER_CRON_SECRET and the same
-- GEMINI_API_KEY that are already set. There is nothing to configure.
--
-- BEFORE RUNNING THIS, deploy the function, or the button will post to a URL
-- that is not there and every press will log a run that never happened:
--
--   supabase functions deploy group-status --no-verify-jwt
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0048. Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The same button, pointed at its own function
--
-- Reproduced whole rather than patched, because `create or replace function`
-- has no patch: this is the definition from 0048 with one string changed, and
-- keeping the two files readable side by side is worth the repetition.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_refresh_group_status()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_last    timestamptz;
  v_secret  text;
  v_request bigint;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select max(ran_at) into v_last from public.group_status_runs;

  -- A person, not a constraint violation. Same wording as 0039.
  if v_last is not null and v_last > now() - interval '15 seconds' then
    raise exception 'That was just done. Give it a few seconds.';
  end if;

  /* The same secret the newsletter intake uses, and deliberately so: Edge
     Function secrets are project wide, so both functions already see it and
     there is nothing new to set up. What it proves is unchanged — that the
     caller is this database. */
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';

  if v_secret is null then
    raise exception 'hc_admin_refresh_group_status: hc_newsletter_cron_secret is missing from the vault. Re-run migration 0038.';
  end if;

  /* Fire and forget, like every other pg_net call in this project. The
     function writes its own outcome to group_status_runs because the response
     to this request goes nowhere at all. 60 seconds: one Gemini call and two
     small queries, with no mailbox in the way. */
  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/group-status',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('source', 'admin'),
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_admin_refresh_group_status() from public, anon, authenticated;
grant execute on function public.hc_admin_refresh_group_status() to authenticated;

comment on function public.hc_admin_refresh_group_status() is
  'Asks the group-status Edge Function to shorten the most recent home groups announcement into the card on Connect. Admins only, checked inside. Takes no arguments: the most it can cause is that card changing, and group_status_runs keeps what it said before. See migrations 0048 and 0050.';
