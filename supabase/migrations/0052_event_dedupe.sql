-- ===========================================================================
-- Home Church, the same night twice in the calendar
--
-- WHAT THIS IS FOR. 0051 taught the announcements queue that the newsletter
-- says the same thing more than once, and it works: a reminder about Homecoming
-- now offers to update the Homecoming card instead of posting a second one.
-- The dates the same newsletter carries got none of that. So the Cal tab has
-- "Ladies Night" and "Women's Night" on one evening, and "Homecoming" sitting
-- next to "Homecoming Gala", because three emails about one night parsed into
-- three events and somebody approved each of them on a different morning.
--
-- This gives events the same three columns, the same pass, and the same two
-- buttons: duplicate_of, duplicate_note, dedupe_checked_at, written by the
-- event-dedupe Edge Function, decided by a person tapping Merge or Keep both.
--
-- WHERE IT DELIBERATELY GOES FURTHER THAN 0051. The announcements pass only
-- ever looks at drafts nobody has reviewed yet, because an announcement that is
-- already on Home has been read by the church and a second card is a nuisance
-- rather than a lie. A calendar is not like that. Two events are two entries in
-- the month grid, two rows in Upcoming, two Add to calendar buttons and, once
-- somebody taps them, two things in a phone's own calendar that this app can
-- never reach again. The duplicate the church needs to hear about is usually
-- one that was approved a fortnight ago, which is exactly the pair this church
-- has today. So the pass looks at every event in the window, approved ones
-- included, and the review card can appear under a date that is already live.
--
-- IT STILL MERGES NOTHING. Same line as 0051 and 0038, and the reason gets
-- stronger the closer the robot gets to a published row: the pass writes three
-- columns and stops. The merge is hc_admin_apply_event_update below, it is
-- reached by a button, and the button confirms and names both dates first.
--
-- WHICH ROW SURVIVES A MERGE, decided here rather than by the model, because
-- it is a rule and not a judgement: the one people already have. An event on
-- the calendar beats one in the queue, and between two of the same kind the
-- one written first wins. The survivor keeps its id, so every announcement
-- pointing at it keeps its Add to calendar button, and every phone that has
-- already added it is talking about the same event afterwards.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0001 (events), 0025 (hc_is_admin), 0038 (the vault secret),
--   0040 (announcements.event_id), 0041 (review_state) and 0043
--   (review_approvals). Safe to re-run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. What an event knows about the event it may be a second copy of
--
--   duplicate_of      the event this one appears to be another go at, or null.
--   duplicate_note    one sentence on how the two differ, written by the pass
--                     that found the pair, so an admin can decide from the
--                     card without opening the calendar.
--   dedupe_checked_at when the pass last looked at this row. Null is what
--                     makes the tick in section 5 spend a model call, so it
--                     is null on every row in the table the day this runs —
--                     which is the backfill, and it is the point.
--
-- `on delete set null`, the fourth time in this project (0038, 0040, 0051),
-- and it is what keeps chains safe: merging the middle of A -> B -> C leaves A
-- pointing at nothing rather than at a row that is gone. Section 3 repoints it
-- properly before the delete; this is the floor under that, not the plan.
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists duplicate_of      text,
  add column if not exists duplicate_note    text,
  add column if not exists dedupe_checked_at timestamptz;

do $$
begin
  alter table public.events
    add constraint events_duplicate_fk
    foreign key (duplicate_of) references public.events (id)
    on delete set null;
exception
  when duplicate_object then null;   -- already there, this file re-runs
end
$$;

/* A row may not be its own duplicate, for the reason 0051 gives about
   announcements and one more that is specific to this table: applying a row
   onto itself here would copy its fields over its fields and then delete it,
   and unlike an announcement there is no Deleted section to find it in. */
do $$
begin
  alter table public.events
    add constraint events_duplicate_not_self
    check (duplicate_of is null or duplicate_of <> id);
exception
  when duplicate_object then null;
end
$$;

comment on column public.events.duplicate_of is
  'The event this one appears to be a second copy of, found by the event-dedupe function. Advisory only: nothing merges until an admin taps Merge. Points at the row that survives a merge — the published one, or the older of two of the same kind.';
comment on column public.events.duplicate_note is
  'One sentence on how this row differs from the one it duplicates, so the decision can be made from the card without opening two screens.';
comment on column public.events.dedupe_checked_at is
  'When the dedupe pass last looked at this row. Null means it has not been checked, which is the only thing that makes the tick spend a model call. Null on every row the day 0052 runs, which is how the calendar that is already there gets swept once.';

/* The tick's question, asked every few minutes: is there anything unchecked.
   Partial on the null, so it holds the backlog on the day this migration runs
   and nearly nothing forever after.

   NOT PARTIAL ON THE DATE as well, which the announcements one could afford to
   be: now() is not immutable and cannot go in the predicate. The date lives in
   the query instead, and the index is small enough that it does not matter. */
create index if not exists events_dedupe_todo_idx
  on public.events (starts_at)
  where dedupe_checked_at is null;


-- ---------------------------------------------------------------------------
-- 2. Which window anything is compared in
--
-- A fortnight back, and everything ahead. Said here as a comment rather than
-- as a view, because the Edge Function asks for it and the tick asks whether
-- it is empty, and two places is already one too many to have it written down
-- differently.
--
-- WHY THE PAST IS IN AT ALL. A newsletter that lands on the Thursday of an
-- event week is still describing something the calendar has, and an admin who
-- merges the day after has lost nothing. Past that, two rows about a night
-- that has been and gone are two rows nobody will ever look at, and asking a
-- model about them every time somebody adds an event would be paying to tidy
-- history.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 3. Merging one into the other
--
-- The button under "Looks like the same night as Homecoming, October 23". It
-- writes what this row knows onto the row that survives, moves everything
-- pointing at it across, and deletes it.
--
-- WHY A FUNCTION. Same answer as 0051 and the same shape: it moves rows in
-- three tables and they have to move together. An announcement still pointing
-- at a deleted event would lose its Add to calendar button silently, and a
-- second event left behind because the delete did not land is the bug this
-- whole file exists to fix.
--
-- WHAT IT COPIES. The things a later email actually corrects: the wording, the
-- place, the sign-up link, the end time. A null in the duplicate never erases
-- what the survivor has, exactly as in 0051 — a reminder that mentions no
-- location leaves the location alone.
--
-- WHAT IT WILL NOT DO, and this is the one rule here that is not obvious:
--
--   IT NEVER REPLACES A TIME SOMEBODY VOUCHED FOR WITH A GUESS. starts_at is
--   not null on this table, so a parsed event whose email gave no hour still
--   carries one — nine in the morning, with time_label saying "Time to be
--   announced" so the Cal tab does not print it as a fact. See the intake.
--   Copying that across would move a seven o'clock service to nine because a
--   reminder email did not repeat the time. So the duplicate's date and time
--   are taken only when the duplicate actually knows an hour, which is exactly
--   when its time_label is null. Otherwise the survivor keeps the date it has.
--
--   published and review_state are not touched. Merging is tidying the
--   calendar, not approving anything: a pending row merged into a published
--   one does not publish anything new, and a published survivor stays where it
--   is. The one thing in this project that puts an event on the calendar is
--   still hc_admin_approve_event.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_apply_event_update(p_duplicate_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dup    public.events%rowtype;
  v_keep   public.events%rowtype;
  v_target text;
  v_starts timestamptz;
  v_label  text;
  v_ends   timestamptz;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_dup from public.events where id = p_duplicate_id;

  if not found then
    raise exception 'That date is not there any more.';
  end if;

  v_target := v_dup.duplicate_of;

  if v_target is null then
    raise exception 'That one is not marked as the same as anything.';
  end if;

  select * into v_keep from public.events where id = v_target;

  if not found then
    raise exception 'The date it would merge into is not there any more.';
  end if;

  /* When the date moves and when it does not. The duplicate's hour is taken
     only when it has one, which is exactly when its time_label is null. */
  if v_dup.time_label is null then
    v_starts := v_dup.starts_at;
    v_label  := null;
  else
    v_starts := v_keep.starts_at;
    v_label  := v_keep.time_label;
  end if;

  /* And the end time, dropped rather than kept when the start it belonged to
     has just moved past it. Without this the merge can fail on 0001's
     events_ends_after_starts check, which is a true thing to enforce and a
     terrible thing for a person to read after tapping Merge. */
  v_ends := coalesce(v_dup.ends_at, v_keep.ends_at);
  if v_ends is not null and v_ends < v_starts then
    v_ends := null;
  end if;

  update public.events set
    title       = coalesce(nullif(btrim(v_dup.title), ''), title),
    description = coalesce(nullif(btrim(coalesce(v_dup.description, '')), ''), description),
    location    = coalesce(nullif(btrim(coalesce(v_dup.location, '')), ''), location),
    signup_url  = coalesce(nullif(btrim(coalesce(v_dup.signup_url, '')), ''), signup_url),
    capacity    = coalesce(v_dup.capacity, capacity),
    starts_at   = v_starts,
    time_label  = v_label,
    ends_at     = v_ends
  where id = v_target;

  /* The survivor's own dedupe columns are deliberately left alone. If it is
     itself flagged as a copy of a third row, that is a different pair and a
     different decision, and clearing it here would throw away a match nobody
     answered. Chains resolve by being merged twice. */

  /* Everything that pointed at the row about to go now points at the one that
     stays. Both of these are the difference between a merge and a deletion:

       the announcement   keeps its Add to calendar button, and it points at
                          the date the church is actually keeping. Without this
                          line the foreign key from 0040 would quietly null it.
       another duplicate  a third copy that was pointing at this one is still a
                          duplicate of something, and it should be offered
                          against the row that survived rather than lost. */
  update public.announcements set event_id = v_target where event_id = p_duplicate_id;
  update public.events set duplicate_of = v_target where duplicate_of = p_duplicate_id;

  /* Deleted rather than marked, which is 0041's rule for events and it holds
     here: an unpublished event is on no screen in this app, so a merged one
     left behind is a row nobody could ever find. The note about who approved
     it goes too, for the reason 0043 section 10 gives — ids here are derived
     from titles and come back, and a stale note names somebody who never saw
     the row that inherited it. */
  delete from public.events where id = p_duplicate_id;
  delete from public.review_approvals where kind = 'event' and row_id = p_duplicate_id;

  return v_target;
end;
$$;

revoke all on function public.hc_admin_apply_event_update(text) from public, anon, authenticated;
grant execute on function public.hc_admin_apply_event_update(text) to authenticated;

comment on function public.hc_admin_apply_event_update(text) is
  'Merges one event into the one it duplicates: copies what it knows onto the survivor, moves any announcement and any third copy across, then deletes it. Never replaces a known time with the parser''s nine o''clock guess, and never publishes anything. Admins only, checked inside. See migration 0052.';


-- ---------------------------------------------------------------------------
-- 4. Saying they are two different nights
--
-- The other button. Clears the flag so the pair stops being offered, and
-- leaves both rows exactly as they are.
--
-- WHY THIS IS A FUNCTION when the announcements version of it is a PATCH from
-- the phone. Because events have no write policy for any client role and have
-- not had one since 0026, which 0040, 0041 and 0042 each restated. Two columns
-- on one row is not a reason to break that, so it is a fifth narrow function
-- instead.
--
-- It does not clear dedupe_checked_at, so the pass does not look at this row
-- again and re-suggest what a person has just refused.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_keep_event_separate(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  update public.events
     set duplicate_of   = null,
         duplicate_note = null,
         dedupe_checked_at = coalesce(dedupe_checked_at, now())
   where id = p_id;

  if not found then
    raise exception 'No event with that id.';
  end if;
end;
$$;

revoke all on function public.hc_admin_keep_event_separate(text) from public, anon, authenticated;
grant execute on function public.hc_admin_keep_event_separate(text) to authenticated;

comment on function public.hc_admin_keep_event_separate(text) is
  'Says two events that look alike are two different nights, and stops the pair being offered. Clears the flag and nothing else. Admins only, checked inside. A function rather than a PATCH because events still have no write policy for any client role.';


-- ---------------------------------------------------------------------------
-- 5. Asking the pass to look
--
-- Same shape as hc_dedupe_tick from 0051, and the guard does the same work:
-- it returns without calling anything unless there is an event nobody has
-- checked, so the ordinary five minutes is one index lookup and a return.
--
-- WHAT MAKES A ROW UNCHECKED HERE is wider than in 0051, and worth knowing
-- before the first bill: it is any event, however it was written. A date typed
-- into the Cal tab by hand, or published by a slash command, is checked once
-- like everything else. That is deliberate — "Homecoming" typed on a Tuesday
-- next to the "Homecoming Gala" the newsletter parsed on Monday is the pair
-- this church actually has — and it costs one model call for one new event.
-- ---------------------------------------------------------------------------

create or replace function public.hc_event_dedupe_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret  text;
  v_request bigint;
begin
  if not exists (
    select 1 from public.events
     where dedupe_checked_at is null
       and starts_at >= now() - interval '14 days'
  ) then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';

  if v_secret is null then
    raise exception 'hc_event_dedupe_tick: hc_newsletter_cron_secret is missing from the vault. Re-run migration 0038.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/event-dedupe',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_event_dedupe_tick() from public, anon, authenticated;

comment on function public.hc_event_dedupe_tick() is
  'Asks the event-dedupe Edge Function to look at any event nobody has checked yet. Called by pg_cron every five minutes and returns immediately when there is nothing, which is nearly always. Revoked from every client role: it reads the vault.';


-- ---------------------------------------------------------------------------
-- 6. The clock
--
-- Every five minutes like 0051's, and deliberately not at the same minute.
-- Both ticks are woken by the same arriving newsletter, both call the same
-- Gemini key, and two of them starting in the same second is how one of them
-- meets a 429 and does nothing for five minutes. Two minutes past is enough
-- for the announcements pass to have finished.
-- ---------------------------------------------------------------------------

do $$
declare
  v_have  boolean;
  v_jobid bigint;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_have;

  if not v_have then
    raise notice 'NOT SCHEDULED. pg_cron is not enabled on this project.';
    raise notice 'Enable it under Database -> Extensions -> pg_cron, then run';
    raise notice '  select cron.schedule(''hc-event-dedupe'', ''2-59/5 * * * *'', $c$select public.hc_event_dedupe_tick();$c$);';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'hc-event-dedupe';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'hc-event-dedupe',
    '2-59/5 * * * *',
    $c$select public.hc_event_dedupe_tick();$c$
  );

  raise notice 'Scheduled hc-event-dedupe, every five minutes, two minutes behind the announcements one.';
end
$$;


-- ---------------------------------------------------------------------------
-- 7. What the advisor will say, and why it is fine
--
-- Two more 0039_authenticated_security_definer_function_executable, on
-- hc_admin_apply_event_update and hc_admin_keep_event_separate, joining the
-- list 0025 section 6 keeps and 0051 section 7 last added to. Same answer
-- every time: in this project a SECURITY DEFINER function IS the permission
-- boundary, so the ones that matter are exactly the ones that have to be
-- callable, and the advisor cannot see the hc_is_admin() check on the first
-- line of each.
--
-- hc_event_dedupe_tick is revoked from every client role and is called only by
-- cron, like its neighbour in 0051.
-- ---------------------------------------------------------------------------
