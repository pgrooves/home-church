-- ===========================================================================
-- Home Church, running the Instagram sync hourly instead of every six hours
--
-- WHY THIS CHANGES. 0061 chose six hours to stay well clear of Instagram's
-- rate limiter, because at that point every run fetched the profile page and
-- then fetched up to nine posts whether anything was new or not. That was an
-- expensive run, so it had to be a rare one.
--
-- Two things since have made a run cheap, and both are in the function rather
-- than here:
--
--   A post page lists about two dozen other posts from the same account, and
--   post pages are not throttled the way the profile page is. So discovery no
--   longer depends on the one endpoint that kept refusing.
--
--   Instagram's media ids increase with time, so a candidate can be compared
--   against the newest id already stored instead of being fetched to find out
--   how old it is. A run that finds nothing new now costs ONE request and
--   writes nothing.
--
-- A no-op is one fetch, so twenty four of them a day is lighter than the four
-- expensive runs it replaces, and the rail is at most an hour behind instead
-- of six. The church posts a few times a week; this is not a busy job.
--
-- WHY NOT MORE OFTEN THAN HOURLY. Nothing here is urgent enough to justify it,
-- and the throttle is real even if the new path avoids the worst of it. An
-- hour is already faster than anybody will notice.
--
-- WHAT WAS ACTUALLY WRONG, for the record. The six hourly job ran and did
-- nothing for days: its profile fetch was refused every time, and because
-- pg_net returns a request id as soon as the request is queued, pg_cron
-- recorded every one of those runs as `succeeded`. The rail sat on posts from
-- the 6th while two newer ones went unseen. 0062 makes the failure visible;
-- this and the function change make it far less likely.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once: the schedule is dropped and recreated.
--
-- TO TURN IT OFF, one line:
--   select cron.unschedule('hc-instagram-sync');
-- ===========================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hc-instagram-sync') then
    perform cron.unschedule('hc-instagram-sync');
  end if;
end $$;

select cron.schedule(
  'hc-instagram-sync',
  '23 * * * *',   -- hourly, at :23. Off the hour so it does not queue behind
                  -- hc-push-tick at :00, and off :20/:40 so it does not land
                  -- with the newsletter intake either.
  $cron$select public.hc_sync_instagram(9);$cron$
);


-- Reading what happened. cron.job_run_details is NOT the answer here: it
-- reports this job as succeeded even when the sync fails, for the pg_net
-- reason above. The honest record is the table 0062 adds:
--
--   select ran_at, ok, via, discovered, wrote, error
--   from public.instagram_sync_runs order by ran_at desc limit 12;
--
--   select * from public.hc_instagram_health(24);
--
-- completed = 0 with runs > 0 means it is firing and failing, which is the
-- exact state that went unnoticed for a week.

select 'hc-instagram-sync now hourly at :23' as status;
