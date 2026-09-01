-- ===========================================================================
-- Home Church, an announcement that is also a date in the calendar
--
-- WHAT THIS ADDS. A newsletter that says "Homecoming on Friday, October 23"
-- describes two things at once: a card on Home, and a date somebody wants in
-- the calendar on their phone. Until now the intake made the first and threw
-- the second away, and adding the event meant retyping the whole thing into
-- the Connect tab by hand.
--
-- So a parsed announcement can now carry an event, the Connect tab draws it
-- with the Add to calendar button it has always had, and the announcement's
-- own page carries the same button.
--
-- WHY THE EVENT IS NOT PUBLISHED WHEN IT IS PARSED. Everything in this feature
-- turns on one promise: nothing the robot writes is visible until a person
-- approves it. An event written published would break that promise on a screen
-- the announcement review queue does not even show, which is the worst way to
-- break it. So the intake writes `published = false` on both rows, and
-- approving the announcement is what publishes the pair.
--
-- WHY APPROVING IS A FUNCTION NOW RATHER THAN A PATCH. Because it moves two
-- tables, and they have to move together. An announcement on Home whose event
-- never appeared in the calendar is a card promising a date that the Connect
-- tab does not have, and the two halves failing separately is exactly what a
-- pair of PATCHes from a phone on a bad connection produces. One function, one
-- transaction, both or neither.
--
-- It also has to be SECURITY DEFINER, and that is not a convenience. 0026 gave
-- admins write policies on announcements, content_pages and app_settings and
-- deliberately left events alone: events are written by the service role and
-- by the slash commands, and widening that to every admin session was not a
-- trade worth making for a table nobody was editing from a phone. That
-- reasoning still holds, so this does not add an events write policy. It adds
-- one function that publishes one event, checks hc_is_admin() on its first
-- line, and can do nothing else to the table.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0001 (events), 0025 (hc_is_admin) and 0038 (review_state).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The link between the two rows
--
-- `on delete set null` for the same reason 0038's source_email_id has it: an
-- announcement that outlives its event is fine and ordinary, and an event that
-- cannot be deleted because an announcement points at it is not. The card is
-- the thing worth keeping.
-- ---------------------------------------------------------------------------

alter table public.announcements
  add column if not exists event_id text;

do $$
begin
  alter table public.announcements
    add constraint announcements_event_fk
    foreign key (event_id) references public.events (id)
    on delete set null;
exception
  when duplicate_object then null;   -- already there, this file re-runs
end
$$;

comment on column public.announcements.event_id is
  'The event this announcement is about, when it is about a dated thing. Drawn as the Add to calendar button on the announcement''s own page, and published alongside the announcement by hc_admin_approve_announcement. Null on an announcement with no date in it.';


-- ---------------------------------------------------------------------------
-- 2. An admin can see an unpublished event
--
-- The one policy change, and it is a read. The review card has to be able to
-- say "approving this also puts an event in the calendar on October 23", and
-- it cannot say that about a row it is not allowed to see. Without this the
-- queue would be quietly hiding the second half of what the button does.
--
-- Shaped exactly like the announcements policy from 0026, including the order
-- of the operands: Postgres short circuits `or`, so on a published event the
-- function is never called and the common path costs nothing. anon keeps
-- EXECUTE on hc_is_admin for the reason 0025 section 2 sets out at length —
-- without it this read raises for a signed out phone rather than returning
-- fewer rows, and the Connect tab loses its calendar the day the first
-- unpublished event exists.
--
-- Writes are untouched. events still has no write policy at all, and section 3
-- is the only thing in this project that publishes one from a session.
-- ---------------------------------------------------------------------------

drop policy if exists "events are publicly readable" on public.events;

create policy "events are publicly readable"
  on public.events for select
  to anon, authenticated
  using (published or public.hc_is_admin());


-- ---------------------------------------------------------------------------
-- 3. Approving
--
-- Replaces the two column PATCH js/admin.js used to send. Same outcome for an
-- announcement with no event, and the whole point for one with an event.
--
-- The event is published without any further checking of its own. It was
-- written by the intake in the same breath as the announcement and it is
-- reachable only through this column, so "is this event allowed to go live" is
-- the same question as "is this announcement allowed to go live", and it has
-- just been answered by a person.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_approve_announcement(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  update public.announcements
     set published = true, review_state = 'approved'
   where id = p_id
  returning event_id into v_event;

  if not found then
    raise exception 'No announcement with that id.';
  end if;

  if v_event is not null then
    update public.events set published = true where id = v_event;
  end if;
end;
$$;

revoke all on function public.hc_admin_approve_announcement(text) from public, anon, authenticated;
grant execute on function public.hc_admin_approve_announcement(text) to authenticated;

comment on function public.hc_admin_approve_announcement(text) is
  'Puts one parsed announcement on Home, and its event in the calendar with it. Admins only, checked inside. One transaction, because a card promising a date the Connect tab does not have is worse than neither.';


-- ---------------------------------------------------------------------------
-- 4. Discarding
--
-- The announcement stays, unpublished, and drops out of the review queue: that
-- is 0038's decision and it is what makes Discard a single tap with nothing
-- irreversible behind it.
--
-- The EVENT is deleted rather than left behind, and the asymmetry is
-- deliberate. The announcement is still visible to an admin in the Posted list
-- below the queue, where the Delete button can finish the job, so leaving it is
-- leaving something somebody can find. An unpublished event is on no screen in
-- this app at all — the Connect tab draws published rows and the Admin screen
-- has no events section — so leaving one behind is leaving a row that nothing
-- can ever show and nobody will ever tidy.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_discard_announcement(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  /* READ FIRST, THEN UPDATE, and not the other way round. The obvious version
     of this nulls the column and takes `returning event_id` — which hands back
     the value AFTER the update, so it is always null, so the delete below
     never runs and every discarded announcement leaves its event behind
     forever. That is what the first draft did, and 0040's test is what caught
     it. RETURNING is post-update by definition; the old value has to be
     collected before it is thrown away. */
  select event_id into v_event from public.announcements where id = p_id;

  if not found then
    raise exception 'No announcement with that id.';
  end if;

  update public.announcements
     set published = false, review_state = 'discarded', event_id = null
   where id = p_id;

  -- The column is nulled above before the row goes, so the foreign key has
  -- nothing to say about this either way. Guarded on `not published` so a
  -- discard can never take down an event that is already live on Connect.
  if v_event is not null then
    delete from public.events where id = v_event and not published;
  end if;
end;
$$;

revoke all on function public.hc_admin_discard_announcement(text) from public, anon, authenticated;
grant execute on function public.hc_admin_discard_announcement(text) to authenticated;

comment on function public.hc_admin_discard_announcement(text) is
  'Takes one parsed announcement out of the review queue, leaving it as a draft in the Posted list. Deletes the event it would have created, which is on no screen in this app and so cannot be tidied by hand. Admins only, checked inside.';


-- ---------------------------------------------------------------------------
-- 5. What the advisor will say
--
-- Two more 0029_authenticated_security_definer_function_executable, on
-- hc_admin_approve_announcement and hc_admin_discard_announcement, joining the
-- list 0025 section 6 keeps. Same answer as every other one on it: in this
-- project a SECURITY DEFINER function IS the permission boundary, so the ones
-- that matter are exactly the ones that have to be callable, and the advisor
-- can see the grant but not the hc_is_admin() check on the first line.
-- ---------------------------------------------------------------------------
