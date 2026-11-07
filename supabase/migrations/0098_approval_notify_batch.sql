-- ===========================================================================
-- Home Church, one notification for a sitting of approvals
--
-- WHAT THIS ADDS. A way for an admin approving the newsletter queue to tell
-- the church about what they just put up, without one buzz per card.
--
-- Approving an announcement or a date asks, on the admin's phone:
--
--   1st   "Notify everyone about this one, or add more?"
--   2nd   "Add this to the notification with the first ... and reset the
--          5 minute timer?"
--   3rd+  "Add this to the batch notification for the other ... and reset
--          the 5 minute timer?"
--
-- with Yes, More and No. What each answer does, here, on the server:
--
--   Yes   the row goes into the waiting batch, and the batch sends five
--         minutes from now. A later Yes starts the five minutes again.
--   More  the row goes into the batch and the clock stops, so somebody
--         reading the next card for six minutes does not send half a sitting.
--         The next Yes starts it again. If nothing happens for thirty minutes
--         after a More, it sends anyway, so a batch is never stranded by a
--         phone that was put down.
--   No    nothing is written. A batch already waiting keeps its clock, and
--         with nothing waiting, nothing is ever sent.
--
-- WHEN IT SENDS. A clock every minute (pg_cron) looks at the one open batch
-- and sends it once it is due. Due is the time above, except that anything
-- that would land between 9 pm and 8 am in Metairie waits until 8 am. "Send
-- now" on the admin screen is the one way past that, because a person asked.
--
-- WHAT IT SAYS is decided by send-push at the moment it sends, from the rows
-- as they are then: a card discarded or deleted inside the five minutes drops
-- out, an announcement and its own date count once, and a batch that has
-- emptied sends nothing. One thing gives the single-row wording, more than
-- one gives the batch wording. See supabase/functions/send-push.
--
-- ONE BATCH FOR THE CHURCH, NOT ONE PER PHONE. Two admins clearing the queue
-- at the same time add to the same batch, so the congregation still gets one
-- notification. The partial unique index is what makes "the open batch" a
-- single row, and an advisory lock is what makes two simultaneous first taps
-- settle on it rather than one of them failing.
--
-- WHO IT GOES TO. Phones with the Announcements switch on, the same list as
-- the one-row `announcement` topic. Dates ride on that switch too: members
-- have no separate one for the calendar, and a date out of the newsletter is
-- an announcement with a day attached.
--
-- SAFE FOR EVERY BUILD ALREADY INSTALLED. Everything here is new. Nothing a
-- shipped build reads or calls is renamed or removed. A shipped build approves
-- exactly as it did, asks nothing, and sends nothing, which is today.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0025 (hc_is_admin), 0026, 0040/0041 (events), 0051 (deleted_at)
--   and 0096 (hc_send_push as it last stood). Safe to run more than once.
--   Then deploy send-push, which learns `approved_batch` in the same change:
--     supabase functions deploy send-push --no-verify-jwt
--   Until it is deployed, a batch that comes due is closed and send-push
--   answers "Unknown topic", so nothing goes out. Deploy it first to be safe.
--
-- Rollback: supabase/rollback/0098_approval_notify_batch_down.sql
-- Tests:    supabase/tests/0098_approval_notify_batch_test.sql
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The batch, and what is in it
-- ---------------------------------------------------------------------------

create table if not exists public.notify_batches (
  id               bigint generated always as identity primary key,
  opened_at        timestamptz not null default now(),
  opened_by        uuid references auth.users (id) on delete set null,
  -- When a Yes said to send it. Null while a More is holding it.
  send_at          timestamptz,
  -- The last Yes or More, which is what the thirty minute fallback counts
  -- from when the clock is stopped.
  last_activity_at timestamptz not null default now(),
  closed_at        timestamptz,
  outcome          text,

  constraint notify_batches_outcome_known
    check (outcome is null or outcome in ('sent', 'cancelled')),
  constraint notify_batches_closed_has_outcome
    check ((closed_at is null) = (outcome is null))
);

comment on table public.notify_batches is
  'The "tell everyone" notification waiting after an admin approves announcements or dates. At most one open at a time, for the whole church. Written only by the hc_admin_notify_batch_* functions and the minute clock. See 0098.';

-- "The open batch" is one row or none, enforced rather than hoped for.
create unique index if not exists notify_batches_one_open
  on public.notify_batches ((true)) where closed_at is null;

create table if not exists public.notify_batch_items (
  batch_id  bigint not null references public.notify_batches (id) on delete cascade,
  kind      text not null,
  row_id    text not null,
  added_at  timestamptz not null default now(),
  added_by  uuid references auth.users (id) on delete set null,

  primary key (batch_id, kind, row_id),
  constraint notify_batch_items_kind_known check (kind in ('announcement', 'event'))
);

comment on table public.notify_batch_items is
  'What a batch is about: one row per announcement or date an admin said Yes or More to. No foreign key, because the two kinds point at two tables and a row deleted in the five minutes is simply left out when send-push reads it.';

-- Which of the three wordings went out last, per kind of notification, so
-- they take turns in order rather than at random. Read and moved by send-push.
create table if not exists public.push_wording_turns (
  key   text primary key,
  turns integer not null default 0
);

comment on table public.push_wording_turns is
  'How many notifications of each wording family have gone out, so the next one uses the next wording. send-push reads it and moves it with hc_push_wording_turn. See 0098.';

alter table public.notify_batches     enable row level security;
alter table public.notify_batch_items enable row level security;
alter table public.push_wording_turns enable row level security;

-- No policy for any client role and no grants: the functions below are the
-- whole surface, the same way 0043 left device_tokens.
revoke all on public.notify_batches     from anon, authenticated;
revoke all on public.notify_batch_items from anon, authenticated;
revoke all on public.push_wording_turns from anon, authenticated;
grant all on public.notify_batches     to service_role;
grant all on public.notify_batch_items to service_role;
grant all on public.push_wording_turns to service_role;


-- ---------------------------------------------------------------------------
-- 2. When a batch is due
--
-- Five minutes after the last Yes, or thirty minutes after the last activity
-- while a More is holding it, and never between 9 pm and 8 am church time:
-- anything due then moves to the next 8 am.
--
-- One function, read by the clock that sends and by the screen that says
-- "sends at 3:42", so the two cannot disagree.
-- ---------------------------------------------------------------------------

create or replace function public.hc_notify_batch_due(
  p_send_at       timestamptz,
  p_last_activity timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_due   timestamptz := coalesce(p_send_at, p_last_activity + interval '30 minutes');
  v_local timestamp;
begin
  if v_due is null then return null; end if;

  v_local := v_due at time zone 'America/Chicago';

  if v_local::time >= time '21:00' then
    return ((v_local::date + 1) + time '08:00') at time zone 'America/Chicago';
  elsif v_local::time < time '08:00' then
    return (v_local::date + time '08:00') at time zone 'America/Chicago';
  end if;

  return v_due;
end;
$$;

revoke all on function public.hc_notify_batch_due(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.hc_notify_batch_due(timestamptz, timestamptz) to service_role;


-- ---------------------------------------------------------------------------
-- 3. The batch as the admin screen sees it
--
-- { open, id, held, due_at, items: [{ kind, id }] }, or { open: false,
-- items: [] }. The screen works out the wording of its prompt from `items`,
-- and draws "sends at" from `due_at`.
-- ---------------------------------------------------------------------------

create or replace function public.hc_notify_batch_json(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
        'open',    true,
        'id',      b.id,
        'held',    b.send_at is null,
        'due_at',  public.hc_notify_batch_due(b.send_at, b.last_activity_at),
        'items',   coalesce((
          select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.row_id)
                           order by i.added_at, i.kind, i.row_id)
            from public.notify_batch_items i
           where i.batch_id = b.id), '[]'::jsonb))
       from public.notify_batches b
      where b.id = p_id and b.closed_at is null),
    jsonb_build_object('open', false, 'items', '[]'::jsonb));
$$;

revoke all on function public.hc_notify_batch_json(bigint) from public, anon, authenticated;

create or replace function public.hc_admin_notify_batch()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select id into v_id from public.notify_batches where closed_at is null;
  return public.hc_notify_batch_json(v_id);
end;
$$;

revoke all on function public.hc_admin_notify_batch() from public, anon, authenticated;
grant execute on function public.hc_admin_notify_batch() to authenticated;

comment on function public.hc_admin_notify_batch() is
  'The waiting approval notification, if there is one: what is in it and when it sends. Admins only. See 0098.';


-- ---------------------------------------------------------------------------
-- 4. Yes and More
--
-- p_hold false is Yes: send five minutes from now. p_hold true is More: stop
-- the clock until the next Yes, with the thirty minute fallback in section 2.
--
-- THE ROW IS CHECKED BEFORE IT IS ADDED, for the reason 0027 gives: a
-- notification cannot be unsent, so it refuses to point at a card nobody can
-- see. An announcement must be published, not deleted, and inside its own
-- date window; a date must be published. send-push checks again when it sends.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_notify_batch_add(
  p_kind text,
  p_id   text,
  p_hold boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_ann   public.announcements%rowtype;
  v_ok    boolean;
  v_id    bigint;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_kind = 'announcement' then
    select * into v_ann from public.announcements where id = p_id;
    if not found then
      raise exception 'No announcement with that id.';
    end if;
    if not v_ann.published or v_ann.deleted_at is not null then
      raise exception 'That announcement is not on Home, so nobody was told about it.';
    end if;
    if v_ann.starts_on is not null and v_ann.starts_on > v_today then
      raise exception 'That announcement does not go up until %, so nobody was told about it yet.', v_ann.starts_on;
    end if;
    if v_ann.ends_on is not null and v_ann.ends_on <= v_today then
      raise exception 'That announcement has already come down.';
    end if;
  elsif p_kind = 'event' then
    select published into v_ok from public.events where id = p_id;
    if not found then
      raise exception 'No date with that id.';
    end if;
    if not coalesce(v_ok, false) then
      raise exception 'That date is not on the calendar, so nobody was told about it.';
    end if;
  else
    raise exception 'hc_admin_notify_batch_add: unknown kind %', p_kind;
  end if;

  -- Two admins' first taps at the same moment settle on one batch.
  perform pg_advisory_xact_lock(hashtext('hc_notify_batch'));

  select id into v_id from public.notify_batches where closed_at is null;
  if v_id is null then
    insert into public.notify_batches (opened_by) values (v_uid) returning id into v_id;
  end if;

  insert into public.notify_batch_items (batch_id, kind, row_id, added_by)
  values (v_id, p_kind, p_id, v_uid)
  on conflict (batch_id, kind, row_id) do nothing;

  update public.notify_batches
     set last_activity_at = now(),
         send_at = case when coalesce(p_hold, false) then null
                        else now() + interval '5 minutes' end
   where id = v_id;

  return public.hc_notify_batch_json(v_id);
end;
$$;

revoke all on function public.hc_admin_notify_batch_add(text, text, boolean) from public, anon, authenticated;
grant execute on function public.hc_admin_notify_batch_add(text, text, boolean) to authenticated;

comment on function public.hc_admin_notify_batch_add(text, text, boolean) is
  'Yes (p_hold false) or More (p_hold true) after approving an announcement or a date: puts it in the one waiting notification and sets its clock. Admins only, and only for a row that is on Home or on the calendar. See 0098.';


-- ---------------------------------------------------------------------------
-- 5. Closing a batch: sending it, now or on the clock, or not at all
--
-- The batch is closed BEFORE the send is asked for, in the statement that
-- checks it is still open, so a clock tick and a Send now tap at the same
-- moment cannot both send it.
-- ---------------------------------------------------------------------------

create or replace function public.hc_notify_batch_close_and_send(p_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
begin
  update public.notify_batches
     set closed_at = now(), outcome = 'sent'
   where id = p_id and closed_at is null;

  if not found then return null; end if;

  return public.hc_send_push('approved_batch', false, p_id::text);
end;
$$;

revoke all on function public.hc_notify_batch_close_and_send(bigint) from public, anon, authenticated;

create or replace function public.hc_admin_notify_batch_send_now()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_id bigint;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('hc_notify_batch'));

  select id into v_id from public.notify_batches where closed_at is null;
  if v_id is null then
    raise exception 'Nothing is waiting to be sent. It may have just gone out.';
  end if;

  perform public.hc_notify_batch_close_and_send(v_id);
  return public.hc_notify_batch_json(null);
end;
$$;

revoke all on function public.hc_admin_notify_batch_send_now() from public, anon, authenticated;
grant execute on function public.hc_admin_notify_batch_send_now() to authenticated;

comment on function public.hc_admin_notify_batch_send_now() is
  'Sends the waiting approval notification now, quiet hours or not, because a person asked. Admins only. See 0098.';

create or replace function public.hc_admin_notify_batch_cancel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('hc_notify_batch'));

  -- Silent when nothing is open: the outcome somebody wanted already holds.
  update public.notify_batches
     set closed_at = now(), outcome = 'cancelled'
   where closed_at is null;

  return public.hc_notify_batch_json(null);
end;
$$;

revoke all on function public.hc_admin_notify_batch_cancel() from public, anon, authenticated;
grant execute on function public.hc_admin_notify_batch_cancel() to authenticated;

comment on function public.hc_admin_notify_batch_cancel() is
  'Don''t send: closes the waiting approval notification without sending it. The announcements and dates stay up. Admins only. See 0098.';


-- ---------------------------------------------------------------------------
-- 6. The clock
--
-- Every minute. Sends the open batch once it is due, and otherwise says what
-- it is waiting for. p_now is for tests.
-- ---------------------------------------------------------------------------

create or replace function public.hc_notify_batch_tick(p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_row public.notify_batches%rowtype;
  v_due timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('hc_notify_batch'));

  select * into v_row from public.notify_batches where closed_at is null;
  if not found then return 'nothing waiting'; end if;

  v_due := public.hc_notify_batch_due(v_row.send_at, v_row.last_activity_at);
  if v_due > p_now then
    return 'waiting until ' || v_due::text;
  end if;

  perform public.hc_notify_batch_close_and_send(v_row.id);
  return 'sent batch ' || v_row.id::text;
end;
$$;

revoke all on function public.hc_notify_batch_tick(timestamptz) from public, anon, authenticated;
grant execute on function public.hc_notify_batch_tick(timestamptz) to service_role;

comment on function public.hc_notify_batch_tick(timestamptz) is
  'Every minute: sends the waiting approval notification once it is due (five minutes after the last Yes, thirty after a More, never 9 pm to 8 am). Returns what it decided, in words. See 0098.';


-- ---------------------------------------------------------------------------
-- 7. Taking turns
--
-- send-push reads push_wording_turns to pick the wording, and calls this
-- after a real send so the next one uses the next wording.
-- ---------------------------------------------------------------------------

create or replace function public.hc_push_wording_turn(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turns integer;
begin
  insert into public.push_wording_turns as t (key, turns) values (p_key, 1)
  on conflict (key) do update set turns = t.turns + 1
  returning turns into v_turns;
  return v_turns;
end;
$$;

revoke all on function public.hc_push_wording_turn(text) from public, anon, authenticated;
grant execute on function public.hc_push_wording_turn(text) to service_role;


-- ---------------------------------------------------------------------------
-- 8. hc_send_push learns `approved_batch`
--
-- hc_send_push as 0096 left it, with one more word. Same signature.
-- ---------------------------------------------------------------------------

create or replace function public.hc_send_push(
  p_topic   text,
  p_dry_run boolean default false,
  p_ref     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_topic not in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                     'announcement', 'announcement_review', 'event_review',
                     'banner', 'cafe_ready', 'instagram_sync', 'new_sermon',
                     'approved_batch') then
    raise exception 'hc_send_push: unknown topic %', p_topic;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_push_cron_secret';

  if v_secret is null then
    raise exception 'hc_send_push: hc_push_cron_secret is missing from the vault. Re-run migration 0012.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('topic', p_topic, 'dry_run', p_dry_run, 'ref', p_ref),
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_send_push(text, boolean, text) from public, anon, authenticated;
grant execute on function public.hc_send_push(text, boolean, text) to service_role;


-- ---------------------------------------------------------------------------
-- 9. The minute clock
-- ---------------------------------------------------------------------------

do $$
declare
  v_jobid bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'NOT SCHEDULED. pg_cron is not enabled. Then run:';
    raise notice '  select cron.schedule(''hc-notify-batch'', ''* * * * *'', $c$select public.hc_notify_batch_tick();$c$);';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'hc-notify-batch';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule('hc-notify-batch', '* * * * *',
    $c$select public.hc_notify_batch_tick();$c$);
  raise notice 'Scheduled hc-notify-batch, every minute.';
end
$$;


-- ---------------------------------------------------------------------------
-- 10. push_log's vocabulary
--
-- Last, because it is the one statement here that drops something, and the
-- Supabase connector holds those for a person to confirm. Everything above
-- works without it: only the batch's line in push_log is refused until this
-- has run.
-- ---------------------------------------------------------------------------

alter table public.push_log drop constraint if exists push_log_topic_known;

alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review',
                   'banner', 'cafe_ready', 'instagram_sync', 'new_sermon',
                   'approved_batch'));


select 'approval notify batch ready' as status;
