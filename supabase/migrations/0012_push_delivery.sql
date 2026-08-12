-- ===========================================================================
-- Home Church, actually delivering the notifications
--
-- WHAT WAS WRONG. Migration 0010 created device_tokens and the app registered
-- into it, and that was the whole system. Nothing ever sent. Three switches in
-- Profile promised "Monday morning, once a week" to an app with no sender, no
-- schedule, and no way to know which of the three a given phone had asked for.
-- This migration is the missing half.
--
-- WHY THE PREFERENCES MOVED SERVER SIDE, reversing 0010's comment. That
-- comment argued the switches should stay on the phone because the church only
-- needs to know which phones want to hear anything at all, and that per topic
-- preferences could be handled "on the sending side". That reasoning does not
-- survive contact with push. The sending side IS the server. A push is composed
-- and addressed before the phone is involved, so a phone that wants the guide
-- notification but not the Sunday reminder cannot filter one out on arrival:
-- iOS has already drawn it on the lock screen by the time any of our code runs.
-- Either the server knows, or the switches are decorative.
--
-- What that costs in privacy is three booleans next to a token that still has
-- no name, no email, and no user id attached to it. A row here says "some phone
-- wants the Monday guide notice". It does not say whose phone. That is a real
-- change from 0010 and it is a small one, and it is written down here rather
-- than discovered later.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
--
-- AFTER RUNNING IT, two things must happen by hand before anything sends. Both
-- are in LAUNCH_TODO.md under "Push notifications":
--   1. Read the generated cron secret out of the vault and set it as the
--      HC_PUSH_CRON_SECRET secret on the send-push Edge Function.
--   2. Set the four APNS_* secrets on that same function, which needs an Apple
--      Developer account that exists.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Extensions
--
-- pg_net posts to the Edge Function without blocking the transaction, and
-- pg_cron is the clock. Both ship with Supabase and neither was enabled here.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;


-- ---------------------------------------------------------------------------
-- Per topic preferences, and enough bookkeeping to retire a dead token
-- ---------------------------------------------------------------------------

alter table public.device_tokens
  add column if not exists wants_new_guide       boolean not null default true,
  add column if not exists wants_sunday_reminder boolean not null default true,
  add column if not exists wants_group_day       boolean not null default false,
  add column if not exists last_push_at          timestamptz,
  add column if not exists failure_count         integer not null default 0,
  add column if not exists last_error            text;

comment on column public.device_tokens.wants_new_guide is
  'Mirrors the first switch in Profile. Server side because a push is addressed before the phone can filter it.';
comment on column public.device_tokens.wants_group_day is
  'The third switch. Always false in v1: it is season gated off in the app, because knowing the day your group meets requires knowing which group you are in, and nothing in the app models that yet.';
comment on column public.device_tokens.failure_count is
  'Consecutive APNs failures. A token that has gone away comes back 410 and is deactivated immediately; this counts the softer failures.';

-- The sender reads exactly one shape of query: active rows wanting one topic.
create index if not exists device_tokens_new_guide_idx
  on public.device_tokens (wants_new_guide) where active and wants_new_guide;
create index if not exists device_tokens_sunday_idx
  on public.device_tokens (wants_sunday_reminder) where active and wants_sunday_reminder;


-- ---------------------------------------------------------------------------
-- What was sent, and to how many
--
-- Small on purpose. It records that a topic went out, not who received it.
-- Joining this to device_tokens would rebuild the per person history that the
-- no-accounts design was there to avoid, so it stores counts and nothing that
-- identifies a phone.
--
-- It also carries the "did anything change" memory for the guide notice: the
-- Monday job asks whether a guide has appeared since the last successful
-- new_guide run, and skips rather than announcing a guide nobody wrote.
-- ---------------------------------------------------------------------------

create table if not exists public.push_log (
  id            bigint generated always as identity primary key,
  topic         text not null,
  ran_at        timestamptz not null default now(),
  recipients    integer not null default 0,
  delivered     integer not null default 0,
  failed        integer not null default 0,
  retired       integer not null default 0,
  skipped       boolean not null default false,
  note          text,

  constraint push_log_topic_known
    check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test'))
);

comment on table public.push_log is
  'One row per send attempt. Counts only, never recipients: this must not become a per phone delivery history.';
comment on column public.push_log.skipped is
  'True when the job ran and deliberately sent nothing, for instance a Monday with no new guide. Not a failure.';

create index if not exists push_log_topic_ran_idx on public.push_log (topic, ran_at desc);

alter table public.push_log enable row level security;

-- No policies at all, deliberately. Only the service role, which bypasses RLS,
-- has any business reading this, and the Edge Function runs as service_role.
revoke all on public.push_log from anon, authenticated;
grant all on public.push_log to service_role;


-- ---------------------------------------------------------------------------
-- The shared secret pg_cron uses to prove it is pg_cron
--
-- WHY NOT THE SERVICE ROLE KEY. The obvious way to let the database call an
-- Edge Function is to store the service role key and send it as a bearer token.
-- That key bypasses RLS on every table in the project, so a copy of it sitting
-- in the database is a copy that can be read by anything that ever gets to
-- read the database. This secret can do exactly one thing: cause a
-- notification to be sent. That is a much smaller blast radius for the same
-- convenience.
--
-- Generated here rather than written here, so the value never appears in git,
-- in a pull request, or in a chat transcript. Read it once from the dashboard
-- when you set the Edge Function secret, then leave it alone.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hc_push_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'hc_push_cron_secret',
      'Proves to the send-push Edge Function that a request came from pg_cron. Must match HC_PUSH_CRON_SECRET on the function.'
    );
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- Calling the sender
--
-- SECURITY DEFINER because pg_cron runs as the job owner and needs to read a
-- vault secret. search_path is pinned for the reason spelled out at length in
-- 0011: an unpinned search_path on a SECURITY DEFINER function is how a
-- privilege escalation gets written by accident.
-- ---------------------------------------------------------------------------

create or replace function public.hc_send_push(p_topic text, p_dry_run boolean default false)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_topic not in ('new_guide', 'sunday_reminder', 'group_day', 'test') then
    raise exception 'hc_send_push: unknown topic %', p_topic;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_push_cron_secret';

  if v_secret is null then
    raise exception 'hc_send_push: hc_push_cron_secret is missing from the vault. Re-run migration 0012.';
  end if;

  -- Fire and forget. pg_net queues the request and returns an id; the Edge
  -- Function writes the outcome to push_log, which is the thing worth reading
  -- later. Blocking a cron job on APNs would be the wrong trade.
  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('topic', p_topic, 'dry_run', p_dry_run),
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_send_push(text, boolean) from public, anon, authenticated;

comment on function public.hc_send_push(text, boolean) is
  'Asks the send-push Edge Function to deliver one topic. Call with p_dry_run => true to see who would receive it without sending anything.';


-- ---------------------------------------------------------------------------
-- The clock
--
-- WHY THIS TICKS HOURLY INSTEAD OF BEING THREE CRON ENTRIES. pg_cron schedules
-- in UTC. Louisiana is not in UTC and, more to the point, is not at a fixed
-- offset from it: America/Chicago is UTC-5 half the year and UTC-6 the other
-- half. A cron line that reads "Monday 13:00 UTC" is 8am in August and 7am in
-- December, which is the kind of bug nobody notices until somebody's phone
-- buzzes at seven in the morning in Advent.
--
-- So the schedule is hourly and the decision is made in Postgres, where the
-- time zone database lives and DST is somebody else's problem.
-- ---------------------------------------------------------------------------

create or replace function public.hc_push_tick()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_local timestamp := now() at time zone 'America/Chicago';
  v_dow   integer   := extract(isodow from v_local);   -- 1 = Monday, 7 = Sunday
  v_hour  integer   := extract(hour from v_local);
begin
  -- Monday morning, the new guide. The sender decides whether one actually
  -- exists; this only decides that Monday at 8am is when we would say so.
  if v_dow = 1 and v_hour = 8 then
    perform public.hc_send_push('new_guide');

  -- Saturday evening, the Sunday reminder. Early enough to change somebody's
  -- evening, late enough that it is not lost in a workday.
  elsif v_dow = 6 and v_hour = 18 then
    perform public.hc_send_push('sunday_reminder');
  end if;
end;
$$;

revoke all on function public.hc_push_tick() from public, anon, authenticated;

comment on function public.hc_push_tick() is
  'Runs hourly. Decides in America/Chicago local time whether this is a moment we send something, so daylight saving cannot drift the schedule.';

-- Re-running the migration should not stack duplicate jobs.
do $$
begin
  perform cron.unschedule('hc-push-tick');
exception
  when others then null;   -- not scheduled yet, which is the normal first run
end
$$;

select cron.schedule('hc-push-tick', '0 * * * *', $cron$select public.hc_push_tick();$cron$);
