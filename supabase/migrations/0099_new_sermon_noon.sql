-- ===========================================================================
-- Home Church, "the sermon audio is up" goes out at noon
--
-- WHAT THIS CHANGES. 0096 sent the notification the moment /new-podcast
-- finished, which on the Tuesday routine is seven in the evening and on a
-- late run could be any hour. Now the run books it for noon, church time:
--
--   run before 12:00   ->  noon that same day
--   run at 12:00 or later  ->  noon the next day
--
-- Exactly 12:00 counts as past noon, so a run can never book a time that has
-- already gone by the time it is written down.
--
-- WHAT THE RUN STILL DOES STRAIGHT AWAY is every check 0096 made: the message
-- is published, has an episode, is from the last two weeks, and has not been
-- announced. A refusal comes back during the run, in the same words, so the
-- person (or the routine) hears about it while it can still be fixed.
--
-- WHAT HAPPENS AT NOON. A clock in the noon hour (pg_cron) sends every booked
-- message that is due. Right before it sends it checks the row again: still
-- published, still has its episode. If not, it sends nothing and unbooks it.
-- send-push checks a third time when it builds the words, as it always has.
--
-- TOLD ONCE, STILL. Booking does not stamp push_announced_at; sending does,
-- in the same statement that checks it is unstamped, so the clock and a
-- manual "send it now" cannot both send. Running /new-podcast twice before
-- noon leaves the first booking as it was and says when it goes.
--
-- SEND IT NOW ANYWAY. hc_announce_new_sermon is untouched and still sends
-- immediately. Called on a booked message, it sends now and the noon clock
-- then finds it already told and skips it.
--
-- CANCEL A BOOKING. update public.podcasts set push_send_at = null
--                    where id = 'sermon-your-slug' and push_announced_at is null;
--
-- SAFE FOR EVERY BUILD ALREADY INSTALLED. No app build reads or calls
-- anything here. One column and four functions are added; nothing a shipped
-- build reads is renamed or removed. send-push needs no deploy: the topic,
-- the ref and the words are exactly 0096's.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0096 (and 0098's hc_send_push, which knows new_sermon either way).
--   Safe to run more than once.
--
-- Rollback: supabase/rollback/0099_new_sermon_noon_down.sql
-- Tests:    supabase/tests/0099_new_sermon_noon_test.sql
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. When it is booked for
-- ---------------------------------------------------------------------------

alter table public.podcasts
  add column if not exists push_send_at timestamptz;

comment on column public.podcasts.push_send_at is
  'When the "sermon audio is up" notification is booked to go out: noon church time on the day /new-podcast ran, or the next day if it ran at noon or later. Null means not booked. push_announced_at, not this, says whether it went. See 0099.';

create index if not exists podcasts_push_send_at_idx
  on public.podcasts (push_send_at)
  where push_send_at is not null and push_announced_at is null;


-- ---------------------------------------------------------------------------
-- 2. The next noon
--
-- Before 12:00 in Metairie, noon today; 12:00 or later, noon tomorrow. Done
-- in local time and turned back into an instant, so daylight saving is the
-- time zone database's problem and noon is always noon on the wall.
-- ---------------------------------------------------------------------------

create or replace function public.hc_new_sermon_noon(p_at timestamptz default now())
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (
    case when (p_at at time zone 'America/Chicago')::time < time '12:00'
         then (p_at at time zone 'America/Chicago')::date
         else (p_at at time zone 'America/Chicago')::date + 1
    end + time '12:00'
  ) at time zone 'America/Chicago';
$$;

revoke all on function public.hc_new_sermon_noon(timestamptz) from public, anon, authenticated;
grant execute on function public.hc_new_sermon_noon(timestamptz) to service_role;

comment on function public.hc_new_sermon_noon(timestamptz) is
  'Noon church time today if p_at is before noon, otherwise noon tomorrow. When /new-podcast''s notification goes out. See 0099.';


-- ---------------------------------------------------------------------------
-- 3. What /new-podcast calls now
--
-- The same checks and the same refusals as hc_announce_new_sermon, then a
-- booking instead of a send. Returns, so the run can say it in its receipt:
--
--   { "send_at": "...", "day": "today" | "tomorrow",
--     "says": "noon today, Friday, November 13", "already_booked": false }
--
-- A second call for a booked message changes nothing and returns the same
-- time with already_booked true.
-- ---------------------------------------------------------------------------

create or replace function public.hc_schedule_new_sermon(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.podcasts%rowtype;
  v_today   date := (now() at time zone 'America/Chicago')::date;
  v_at      timestamptz;
  v_already boolean := false;
  v_local   timestamp;
  v_day     text;
begin
  select * into v_row from public.podcasts where id = p_id for update;

  if not found then
    raise exception 'No message with id %.', p_id;
  end if;

  if not v_row.published then
    raise exception 'That message is not published. Nobody was told.';
  end if;

  if v_row.episode_url is null or btrim(v_row.episode_url) = '' then
    raise exception 'That message has no episode link yet, so there is nothing to listen to. Nobody was told.';
  end if;

  if v_row.preached_on is null or v_row.preached_on < v_today - 14 then
    raise exception 'That message is from % and this only announces the last two weeks. Nobody was told.',
      coalesce(v_row.preached_on::text, 'an unknown date');
  end if;

  if v_row.push_announced_at is not null then
    raise exception 'Everybody who asked was already told about this message. Nothing was sent again.';
  end if;

  if v_row.push_send_at is not null then
    v_at := v_row.push_send_at;
    v_already := true;
  else
    v_at := public.hc_new_sermon_noon(now());
    update public.podcasts set push_send_at = v_at where id = p_id;
  end if;

  v_local := v_at at time zone 'America/Chicago';
  v_day := case v_local::date - v_today
             when 0 then 'today'
             when 1 then 'tomorrow'
             else 'on ' || to_char(v_local, 'FMDay') end;

  return jsonb_build_object(
    'send_at',        v_at,
    'day',            v_day,
    'says',           'noon ' || v_day || ', ' || to_char(v_local, 'FMDay, FMMonth FMDD'),
    'already_booked', v_already);
end;
$$;

revoke all on function public.hc_schedule_new_sermon(text) from public, anon, authenticated;
grant execute on function public.hc_schedule_new_sermon(text) to service_role;

comment on function public.hc_schedule_new_sermon(text) is
  'The last step of /new-podcast: books the "sermon audio is up" notification for the next noon church time, after the same checks hc_announce_new_sermon makes. A second call leaves the booking alone. service_role only. See 0099.';


-- ---------------------------------------------------------------------------
-- 4. The noon clock
--
-- Sends every booked message that is due and not yet told, checking each row
-- again first. A row that is no longer published, or lost its episode, is
-- unbooked and not sent, so it cannot go out some later noon by surprise.
-- Returns what it decided, in words. p_now is for tests.
-- ---------------------------------------------------------------------------

create or replace function public.hc_new_sermon_tick(p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_row   public.podcasts%rowtype;
  v_today date := (p_now at time zone 'America/Chicago')::date;
  v_said  text[] := '{}';
begin
  for v_row in
    select * from public.podcasts
     where push_send_at is not null
       and push_send_at <= p_now
       and push_announced_at is null
     order by push_send_at, id
     for update skip locked
  loop
    if not v_row.published
       or v_row.episode_url is null or btrim(v_row.episode_url) = ''
       or v_row.preached_on is null or v_row.preached_on < v_today - 14 then
      update public.podcasts set push_send_at = null where id = v_row.id;
      v_said := v_said || ('not sent, no longer ready: ' || v_row.id);
      continue;
    end if;

    update public.podcasts
       set push_announced_at = now()
     where id = v_row.id and push_announced_at is null;

    if found then
      perform public.hc_send_push('new_sermon', false, v_row.id);
      v_said := v_said || ('sent ' || v_row.id);
    end if;
  end loop;

  if cardinality(v_said) = 0 then return 'nothing due'; end if;
  return array_to_string(v_said, '; ');
end;
$$;

revoke all on function public.hc_new_sermon_tick(timestamptz) from public, anon, authenticated;
grant execute on function public.hc_new_sermon_tick(timestamptz) to service_role;

comment on function public.hc_new_sermon_tick(timestamptz) is
  'The noon clock: sends each booked "sermon audio is up" notification once it is due, after checking the message is still published with its episode. Returns what it did, in words. See 0099.';


-- ---------------------------------------------------------------------------
-- 5. The clock itself
--
-- Every minute of 17:00 to 18:59 UTC, which holds noon Central in both
-- daylight time (17:00 UTC) and standard time (18:00 UTC). Outside that
-- window it never runs, so a booking can only ever go out around noon.
-- ---------------------------------------------------------------------------

do $$
declare
  v_jobid bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'NOT SCHEDULED. pg_cron is not enabled. Then run:';
    raise notice '  select cron.schedule(''hc-new-sermon-noon'', ''* 17-18 * * *'', $c$select public.hc_new_sermon_tick();$c$);';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'hc-new-sermon-noon';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule('hc-new-sermon-noon', '* 17-18 * * *',
    $c$select public.hc_new_sermon_tick();$c$);
  raise notice 'Scheduled hc-new-sermon-noon, every minute 17:00-18:59 UTC.';
end
$$;


select 'new sermon noon ready' as status;
