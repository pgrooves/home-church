-- ===========================================================================
-- Home Church, making the Instagram sync's failures visible
--
-- THE BUG THIS EXISTS FOR, which is worse than no monitoring at all.
--
-- `hc_sync_instagram` posts through pg_net, and pg_net returns a request id
-- the instant the request is queued rather than when it completes. pg_cron
-- records the outcome of the statement it ran, which is "a bigint came back".
-- So the six hourly job records `succeeded` whether the sync worked or not.
--
-- It has already done exactly that. The 00:17 run on 9 September is recorded
-- in cron.job_run_details as `succeeded`, `1 row`. Sixty one milliseconds
-- later its actual reply landed in net._http_response as:
--
--     503 {"error":"rate limited by Instagram while reading the profile"}
--
-- The rail did not move and the scheduler said it was fine. Anything built on
-- cron status as a health signal would have reported green through a feature
-- that was doing nothing, which is a worse position than having no signal:
-- a missing check gets noticed, a lying one does not.
--
-- The other two places to look are no better, and both are somebody else's
-- retention policy rather than a decision anybody here made. cron.job_run_
-- details is purged on this project and held exactly one row when it was
-- checked. net._http_response held about eighty minutes. Neither is a record
-- of whether this feature has been working.
--
-- WHAT THIS DOES ABOUT IT. The same thing 0012 does for push and 0048 does for
-- the group status card: the function writes its own outcome, to a table this
-- project owns and does not purge. One row per run, success or failure, with
-- the reason when it failed. The rail's health becomes a question with an
-- answer:
--
--   select ran_at, ok, discovered, wrote, error from public.instagram_sync_runs
--   order by ran_at desc limit 10;
--
-- and "has it worked at all today" becomes:
--
--   select count(*) filter (where ok) as good, count(*) as runs
--   from public.instagram_sync_runs where ran_at > now() - interval '24 hours';
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
-- ===========================================================================


-- 1. The table -------------------------------------------------------------
--
-- Counts and a reason, nothing per post. A run that wrote nothing because
-- nothing was new is not a failure and must not read as one, which is what
-- `ok` is for: it says the run completed, not that it changed anything.

create table if not exists public.instagram_sync_runs (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),

  ok          boolean not null,
  trigger     text not null default 'cron',   -- cron | links
  discovered  integer not null default 0,     -- posts seen on the profile
  wrote       integer not null default 0,
  skipped     integer not null default 0,

  -- Null on a good run. On a bad one this is the sentence a human reads, and
  -- the distinct ones matter: a throttled profile fetch is not the same
  -- problem as a media object that stopped parsing.
  error       text
);

comment on table public.instagram_sync_runs is
  'One row per instagram-fetch run, success or failure. Exists because pg_cron records this job as succeeded even when the sync fails: pg_net returns a request id the moment the request is queued, so the cron layer never sees the outcome. This table is the only honest record of whether the rail is being kept current.';
comment on column public.instagram_sync_runs.ok is
  'The run completed. Not the same as having written anything: a run that found nothing new is ok with wrote = 0.';
comment on column public.instagram_sync_runs.discovered is
  'Posts found on the profile page. Zero on a run given explicit links, which does not read the profile at all.';
comment on column public.instagram_sync_runs.error is
  'Null when ok. The distinct failures mean different things: a throttled profile fetch clears by itself, a media object that stopped parsing does not.';


-- 2. Keeping it small ------------------------------------------------------
-- Four runs a day is about fifteen hundred rows a year, which is nothing, but
-- there is no reason to keep three year old runs either.

create index if not exists instagram_sync_runs_recent_idx
  on public.instagram_sync_runs (ran_at desc);


-- 3. Row level security ----------------------------------------------------
-- No policies at all, the same posture as push_log in 0012. Only the service
-- role, which the Edge Function runs as and which bypasses RLS, has any
-- business here. Nothing in the app reads it.

alter table public.instagram_sync_runs enable row level security;

revoke all on public.instagram_sync_runs from anon, authenticated;
grant all on public.instagram_sync_runs to service_role;


-- 4. Is the rail actually being kept current? ------------------------------
--
-- The question somebody will want answered in three months, as one call, so
-- that it does not have to be reconstructed from two purged system tables.
-- Returns one row: how many runs in the window, how many completed, how many
-- posts they wrote between them, and when the last good one was.

create or replace function public.hc_instagram_health(p_hours int default 48)
returns table (
  runs          bigint,
  completed     bigint,
  posts_written bigint,
  last_ok_at    timestamptz,
  last_error    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where ok),
    coalesce(sum(wrote), 0),
    max(ran_at) filter (where ok),
    (select error from public.instagram_sync_runs
      where not ok and ran_at > now() - make_interval(hours => p_hours)
      order by ran_at desc limit 1)
  from public.instagram_sync_runs
  where ran_at > now() - make_interval(hours => p_hours);
$$;

revoke all on function public.hc_instagram_health(int) from public, anon, authenticated;
grant execute on function public.hc_instagram_health(int) to service_role;

comment on function public.hc_instagram_health(int) is
  'Whether the Instagram rail is being kept current, over the last p_hours. completed = 0 with runs > 0 means the job is firing and failing, which is the state pg_cron reports as success.';


select 'instagram_sync_runs ready' as status;
