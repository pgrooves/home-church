-- ===========================================================================
-- Home Church, group rooms, actually keeping the ninety day promise
--
-- 0016 wrote hc_purge_group_rooms and then said, in its own comment: "Until
-- one of those is set up nothing deletes itself, so do not consider the
-- retention promise kept just because this function exists." Nothing was set
-- up. The privacy policy has been telling people their writing is deleted
-- after ninety days, and a function nobody calls deletes nothing.
--
-- This schedules it, nightly, with pg_cron.
--
-- WHY IT MIGHT NOT. pg_cron is an extension, and on a Supabase project it has
-- to be enabled before any SQL can use it. Rather than failing the migration
-- with a message about an extension, which is the kind of error somebody
-- retries twice and then gives up on, this checks first and says plainly what
-- to do. Run it again after enabling the extension and it schedules the job.
--
-- Read the output. If it says the job is scheduled, the promise is kept. If
-- it says pg_cron is not available, it is not, and the app is still telling
-- people something that is not true.
--
-- FOUR IN THE MORNING, central time, is 09:00 or 10:00 UTC depending on the
-- season. The schedule below is UTC and set to 09:00, which is between three
-- and four in the morning here all year. Nothing about this is time critical:
-- what matters is that it runs while nobody is in a room.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or apply_migration. See supabase/ACCESS.md. Safe to run more than once.
-- ===========================================================================

do $$
declare
  v_have  boolean;
  v_jobid bigint;
begin
  -- Is the extension installed, or installable without leaving this session?
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_have;

  if not v_have then
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      begin
        create extension pg_cron;
        v_have := true;
      exception when others then
        raise notice 'pg_cron is available but could not be created here: %', sqlerrm;
      end;
    end if;
  end if;

  if not v_have then
    raise notice '--------------------------------------------------------------';
    raise notice 'NOT SCHEDULED. pg_cron is not enabled on this project.';
    raise notice 'Enable it under Database -> Extensions -> pg_cron, then run';
    raise notice 'this migration again. Until then nothing deletes itself and';
    raise notice 'the ninety day line in the privacy policy is not true.';
    raise notice '--------------------------------------------------------------';
    return;
  end if;

  -- Idempotent by hand. cron.unschedule raises when the job is not there, so
  -- look before removing rather than wrapping a begin/exception around it.
  select jobid into v_jobid from cron.job where jobname = 'hc-purge-group-rooms';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'hc-purge-group-rooms',
    '0 9 * * *',
    $cron$select public.hc_purge_group_rooms(90)$cron$
  );

  raise notice 'Scheduled hc-purge-group-rooms nightly at 09:00 UTC.';
end $$;

-- What the sweep needs in order to run as the cron job's owner rather than as
-- a session. Restated here so a project that schedules this is not relying on
-- a grant made three migrations ago for a different reason.
grant execute on function public.hc_purge_group_rooms(integer) to service_role;
