-- ===========================================================================
-- Home Church, three things the announcements screen was missing
--
-- All three come from the same week of using it for real, and they are in one
-- migration because they are one screen:
--
--   1. THE SAME THING, TWICE. The newsletter reminds people about Homecoming in
--      three consecutive emails, and each reminder parses into a new
--      announcement. Home ends up with "Homecoming, October 23" and "Homecoming
--      Gala, October 23" a fortnight apart, which is not two announcements, it
--      is one announcement and two attempts to write it. Sections 1 and 4.
--
--   2. THE ORDER THEY SIT IN. Home lists what is live, newest first, tie broken
--      by `priority` from 0003. Nothing in the app could set that column, so
--      "the important one is buried under a bake sale" had no answer short of
--      SQL. Section 2, which turns out to be a comment rather than a change:
--      the column is already there and already granted.
--
--   3. DELETING THE WRONG ONE. Delete was a DELETE. One mis-tap and an
--      announcement, its pictures, its byline and its link to an event were
--      gone with no way back. Section 3.
--
-- WHAT THE ROBOT IS STILL NOT ALLOWED TO DO, because section 1 gets close to
-- the line: the dedupe pass reads announcements and writes down which draft
-- looks like an update to which published card. It merges nothing. Applying an
-- update is a person tapping a button, exactly like approving one, and for the
-- same reason 0038 gives at length — a model that can quietly rewrite a card
-- the church has already seen is a different and much worse thing than a model
-- that fills a queue.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0003, 0025 (hc_is_admin), 0026, 0038 and 0045. Safe to re-run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. What a draft knows about the card it may be an update to
--
--   duplicate_of      the announcement this appears to be about, or null.
--   duplicate_note    one sentence on what is new in it, written by the pass
--                     that found the match, so an admin can decide without
--                     opening both.
--   dedupe_checked_at when the pass last looked at this row. The tick in
--                     section 5 only calls the model when something is
--                     unchecked, which is what keeps this free.
--
-- `on delete set null` for the third time in this project (0038, 0040): a
-- draft that outlives the card it was compared against is fine, and a card
-- that cannot be deleted because a draft points at it is not.
-- ---------------------------------------------------------------------------

alter table public.announcements
  add column if not exists duplicate_of      text,
  add column if not exists duplicate_note    text,
  add column if not exists dedupe_checked_at timestamptz;

do $$
begin
  alter table public.announcements
    add constraint announcements_duplicate_fk
    foreign key (duplicate_of) references public.announcements (id)
    on delete set null;
exception
  when duplicate_object then null;   -- already there, this file re-runs
end
$$;

/* A row may not be its own duplicate. Cheap to state, and it closes the one
   way the merge in section 4 could eat an announcement: applying a row onto
   itself would copy its words over its words and then discard it. */
do $$
begin
  alter table public.announcements
    add constraint announcements_duplicate_not_self
    check (duplicate_of is null or duplicate_of <> id);
exception
  when duplicate_object then null;
end
$$;

comment on column public.announcements.duplicate_of is
  'The announcement this draft appears to be a repeat or an update of, found by the announcement-dedupe function. Advisory only: nothing merges until an admin taps Update it. Null on everything else.';
comment on column public.announcements.duplicate_note is
  'One sentence on what is new in the draft compared with the card it matches, so the decision can be made from the review queue without opening both.';
comment on column public.announcements.dedupe_checked_at is
  'When the dedupe pass last looked at this row. Null means it has not been checked, which is the only thing that makes the tick spend a model call.';

-- The tick's question, asked every few minutes: is there anything unchecked.
-- Partial, so it is nearly always empty and costs nothing to keep.
create index if not exists announcements_dedupe_todo_idx
  on public.announcements (created_at)
  where dedupe_checked_at is null and review_state = 'pending';


-- ---------------------------------------------------------------------------
-- 2. The order they sit in on Home
--
-- No change, and the reason is worth writing down so nobody adds a second
-- column for it. `priority` has been on this table since 0003, Home already
-- sorts by it before falling back to newest first, and 0026 already grants an
-- admin UPDATE on every column of this table. So reordering was always one
-- PATCH away; what was missing was a control, and a control is not a migration.
--
-- The app writes whole numbers counting down from the top of the list, so the
-- order on Home is the order in the Manage Announcements list. See
-- reorderAnnouncement() in js/admin.js.
-- ---------------------------------------------------------------------------

comment on column public.announcements.priority is
  'Higher sorts first on Home, ahead of newest-first. Written by the up and down controls on the Manage Announcements screen, which renumber the live list from the top down. See migration 0051 section 2.';


-- ---------------------------------------------------------------------------
-- 3. Deleting, with a way back
--
-- WHY A COLUMN AND NOT A TABLE. A deleted_announcements table would need every
-- column this one has, would drift the day somebody adds a column to only one
-- of them, and would break the two foreign keys that point here: 0040's
-- event_id and 0045's authorship note both hang off this row's id, and moving
-- the row would either cascade them away or leave them pointing at nothing. A
-- column keeps the row exactly where it is, with everything still attached.
--
-- WHAT DELETED MEANS TO EACH READER, which is the whole of the policy change:
--
--   a phone       cannot see it at all. The public read is narrowed to
--                 `published and deleted_at is null` below.
--   an admin      sees it, because the Deleted section on the Admin screen is
--                 the point of the feature.
--   the app's
--   content sync  asks for `deleted_at=is.null` explicitly, even though an
--                 admin's session would be allowed the row. Without that, an
--                 admin's own Home would keep drawing a card they had just
--                 deleted, which is the bug that makes people tap Delete twice.
--
-- NOTHING EXPIRES ON ITS OWN. There is no sweeper deleting these after thirty
-- days, deliberately: this table is small, and a rule that quietly destroys
-- content on a timer is a rule that will one day destroy the announcement
-- somebody meant to restore. Delete for good is a button, pressed by a person.
-- ---------------------------------------------------------------------------

alter table public.announcements
  add column if not exists deleted_at timestamptz;

comment on column public.announcements.deleted_at is
  'When an admin deleted this. The row stays whole, with its pictures, byline and event still attached, and is drawn under Deleted on the Admin screen with Restore beside it. Null on everything a person can see.';

create index if not exists announcements_deleted_idx
  on public.announcements (deleted_at desc)
  where deleted_at is not null;

/* The public read, narrowed. Shaped exactly like 0026's and 0040's, including
   the order of the operands: Postgres short circuits `or`, so on a live
   announcement hc_is_admin() is never called and the common path costs
   nothing. */
drop policy if exists "announcements are publicly readable" on public.announcements;

create policy "announcements are publicly readable"
  on public.announcements for select
  to anon, authenticated
  using ((published and deleted_at is null) or public.hc_is_admin());


-- ---------------------------------------------------------------------------
-- 4. Applying an update instead of posting a second card
--
-- The button under "Looks like an update to Homecoming, October 23". It copies
-- what the newsletter said this time onto the card the church already has, and
-- takes the draft out of the queue.
--
-- WHY A FUNCTION. Because it moves two rows and they have to move together:
-- the card gains the new words and the draft leaves the queue. Two PATCHes
-- from a phone on a bad connection can do the first and not the second, which
-- leaves the same draft offering to update a card that already has its words —
-- and an admin who taps it twice, which is how the words get doubled.
--
-- WHAT IT COPIES, and what it deliberately does not. It copies the things a
-- reminder email actually changes: the words, the dates, the link and the
-- picture. It does not copy `published`, `pinned` or `priority` — where a card
-- sits on Home is a decision the church made about the card, not something a
-- reminder email gets to overrule. It does not touch the target's id, so every
-- phone that has dismissed the pinned strip for that announcement keeps having
-- dismissed it, and its page keeps its address.
--
-- A NULL IN THE DRAFT DOES NOT ERASE THE CARD. `coalesce` on every field, so a
-- reminder that mentions no picture leaves the picture, and one that mentions
-- no end date leaves the end date. The one thing a reminder can genuinely mean
-- to clear is a date that moved, and moving a date is writing a new date, which
-- this does carry.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_apply_announcement_update(p_draft_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft  public.announcements%rowtype;
  v_target text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_draft from public.announcements where id = p_draft_id;

  if not found then
    raise exception 'That draft is not there any more.';
  end if;

  v_target := v_draft.duplicate_of;

  if v_target is null then
    raise exception 'That one is not marked as an update to anything.';
  end if;

  if not exists (select 1 from public.announcements
                  where id = v_target and deleted_at is null) then
    raise exception 'The announcement it would update is not there any more.';
  end if;

  update public.announcements set
    title       = coalesce(nullif(btrim(v_draft.title), ''), title),
    body        = coalesce(nullif(btrim(coalesce(v_draft.body, '')), ''), body),
    body_html   = coalesce(nullif(btrim(coalesce(v_draft.body_html, '')), ''), body_html),
    eyebrow     = coalesce(nullif(btrim(coalesce(v_draft.eyebrow, '')), ''), eyebrow),
    starts_on   = coalesce(v_draft.starts_on, starts_on),
    ends_on     = coalesce(v_draft.ends_on, ends_on),
    link_url    = coalesce(nullif(btrim(coalesce(v_draft.link_url, '')), ''), link_url),
    link_title  = coalesce(nullif(btrim(coalesce(v_draft.link_title, '')), ''), link_title),
    image_url   = coalesce(nullif(btrim(coalesce(v_draft.image_url, '')), ''), image_url),
    image_urls  = case when jsonb_array_length(coalesce(v_draft.image_urls, '[]'::jsonb)) > 0
                       then v_draft.image_urls else image_urls end
  where id = v_target;

  /* The draft leaves the queue the same way a discarded one does, and lands in
     the Deleted section rather than the Posted list: it is not a draft anybody
     will want to post later, it is a duplicate whose words are now on the card
     it duplicated. Recoverable, because everything on this screen now is. */
  update public.announcements
     set review_state = 'discarded',
         deleted_at   = now()
   where id = p_draft_id;

  return v_target;
end;
$$;

revoke all on function public.hc_admin_apply_announcement_update(text) from public, anon, authenticated;
grant execute on function public.hc_admin_apply_announcement_update(text) to authenticated;

comment on function public.hc_admin_apply_announcement_update(text) is
  'Copies a draft''s words, dates, link and picture onto the announcement it duplicates, then takes the draft out of the queue. Admins only, checked inside. Never touches published, pinned or priority: where a card sits on Home is the church''s decision, not a reminder email''s. See migration 0051.';


-- ---------------------------------------------------------------------------
-- 5. Asking the dedupe pass to look
--
-- Same shape as every other pg_net caller here, and the same reasoning: the
-- secret lives in the vault, the response goes nowhere, and the function
-- writes what it found itself.
--
-- THE GUARD IS THE WHOLE POINT OF THE TICK. It returns without calling
-- anything unless there is a pending draft nobody has checked yet, so the
-- ordinary state of this job — every five minutes, all week — is one index
-- lookup and a return. The model is only ever spent on drafts that have just
-- arrived, which is a handful a week.
-- ---------------------------------------------------------------------------

create or replace function public.hc_dedupe_tick()
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
    select 1 from public.announcements
     where review_state = 'pending'
       and dedupe_checked_at is null
       and deleted_at is null
  ) then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';

  if v_secret is null then
    raise exception 'hc_dedupe_tick: hc_newsletter_cron_secret is missing from the vault. Re-run migration 0038.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/announcement-dedupe',
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

revoke all on function public.hc_dedupe_tick() from public, anon, authenticated;

comment on function public.hc_dedupe_tick() is
  'Asks the announcement-dedupe Edge Function to look at any draft nobody has checked yet. Called by pg_cron every five minutes and returns immediately when the queue is clean, which is nearly always. Revoked from every client role: it reads the vault.';


-- ---------------------------------------------------------------------------
-- 6. The clock
--
-- Five minutes, not twenty. This runs after the newsletter has already written
-- its drafts, and the person it is for is standing on the Admin screen looking
-- at them: a review card that grows "looks like an update to Homecoming" a
-- quarter of an hour after they opened it has already been decided without it.
-- Nearly all of those runs do nothing at all, per the guard above.
-- ---------------------------------------------------------------------------

-- Wrapped in the guard 0022 wrote and 0038 reused, which does the honest thing
-- when pg_cron is not there: says so, says what to run once it is, and lets the
-- rest of the file apply. The test harness has no pg_cron, so this branch is
-- also what keeps this migration runnable under supabase/tests/run.sh.

do $$
declare
  v_have  boolean;
  v_jobid bigint;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_have;

  if not v_have then
    raise notice 'NOT SCHEDULED. pg_cron is not enabled on this project.';
    raise notice 'Enable it under Database -> Extensions -> pg_cron, then run';
    raise notice '  select cron.schedule(''hc-announcement-dedupe'', ''*/5 * * * *'', $c$select public.hc_dedupe_tick();$c$);';
    return;
  end if;

  -- Idempotent by hand. cron.unschedule raises when the job is not there, so
  -- the id is looked up first rather than the error being swallowed. Same as
  -- 0022 and 0038.
  select jobid into v_jobid from cron.job where jobname = 'hc-announcement-dedupe';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'hc-announcement-dedupe',
    '*/5 * * * *',
    $c$select public.hc_dedupe_tick();$c$
  );

  raise notice 'Scheduled hc-announcement-dedupe, every five minutes.';
end
$$;


-- ---------------------------------------------------------------------------
-- 7. What the advisor will say, and why it is fine
--
-- 0039_authenticated_security_definer_function_executable on
-- hc_admin_apply_announcement_update, the same note 0025 section 6, 0039
-- section 2 and 0048 section 6 already record: in this project a SECURITY
-- DEFINER function IS the permission boundary, so the ones that matter are
-- exactly the ones that have to be callable, and the advisor cannot see the
-- hc_is_admin() check on the first line.
--
-- hc_dedupe_tick is revoked from every client role and is called only by cron.
-- ---------------------------------------------------------------------------
