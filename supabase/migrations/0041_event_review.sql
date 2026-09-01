-- ===========================================================================
-- Home Church, events get their own approval
--
-- WHAT CHANGES. 0040 made approving an announcement publish its event too, in
-- one transaction, on the reasoning that the two were one decision. They are
-- not. An announcement is words on a card and an event is a date that lands in
-- the church's calendar and then in people's phones, and getting the words
-- right is not the same act as vouching for the date.
--
-- So an event now walks the same path an announcement has walked since 0038:
-- parsed as pending, sitting in a review queue, published only when somebody
-- taps Approve on it. Two queues, because there are two decisions.
--
-- WHAT THIS COSTS, said plainly because it is the trade being made. A
-- newsletter item that carries a date now needs two approvals rather than one.
-- That is more taps on a Monday morning, and it is the point: the failure this
-- prevents is a wrong date reaching somebody's calendar, where an app cannot
-- take it back, on the strength of a tap that was about the wording.
--
-- WHAT IS NOT TOUCHED. Events written by hand, by the slash commands, or by
-- the service role carry a null review_state and are published exactly as they
-- always were. This is a queue for the ones a model wrote, not a new step in
-- front of the church's own calendar.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0040. Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The column
--
-- Null on everything that already exists, and on everything a person writes,
-- which is what keeps this migration invisible to the Connect tab on the day
-- it runs. Same three states and the same vocabulary as announcements, so
-- there is one idea in this project called review_state rather than two.
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists review_state text;

do $$
begin
  alter table public.events
    add constraint events_review_state_known
    check (review_state is null or review_state in ('pending', 'approved', 'discarded'));
exception
  when duplicate_object then null;
end
$$;

comment on column public.events.review_state is
  'Null on every event a person wrote, which is all of them before 0041. An event parsed out of the newsletter starts pending and reaches the Connect calendar only when an admin approves it. See migration 0041.';

create index if not exists events_review_idx
  on public.events (review_state) where review_state = 'pending';


-- ---------------------------------------------------------------------------
-- 2. Approving an announcement stops publishing its event
--
-- The half of 0040 that this migration takes back. The link between the two
-- rows stays and is still what the announcement's Add to calendar button reads;
-- what goes is the assumption that one tap settles both.
--
-- Left as its own function rather than reverted to a PATCH, because it is now
-- the only place in the project that sets an announcement live and that is
-- worth keeping in one named, admin-checked place.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_approve_announcement(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  update public.announcements
     set published = true, review_state = 'approved'
   where id = p_id;

  if not found then
    raise exception 'No announcement with that id.';
  end if;
end;
$$;

comment on function public.hc_admin_approve_announcement(text) is
  'Puts one parsed announcement on Home. Admins only, checked inside. Does NOT publish its event: since 0041 an event is approved separately, because a date reaching somebody''s calendar is a different decision from the wording of a card.';


-- ---------------------------------------------------------------------------
-- 3. Approving an event
--
-- The mirror of the announcement one. Publishing is what puts it on the
-- Connect tab and gives it the Add to calendar button.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_approve_event(p_id text)
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
     set published = true, review_state = 'approved'
   where id = p_id;

  if not found then
    raise exception 'No event with that id.';
  end if;
end;
$$;

revoke all on function public.hc_admin_approve_event(text) from public, anon, authenticated;
grant execute on function public.hc_admin_approve_event(text) to authenticated;

comment on function public.hc_admin_approve_event(text) is
  'Puts one parsed event on the Connect calendar. Admins only, checked inside. The one thing in this project that publishes an event from a session: events still have no write policy, per 0026 and 0040.';


-- ---------------------------------------------------------------------------
-- 4. Discarding an event
--
-- UNLIKE DISCARDING AN ANNOUNCEMENT, this deletes rather than marking. 0040
-- gave the reason and it still holds: a discarded announcement is still
-- visible to an admin in the Posted list where Delete can finish it, and an
-- unpublished event is on no screen in this app at all, so one marked and left
-- is a row nobody could ever find again.
--
-- The announcement that pointed at it keeps everything else it has, and simply
-- stops offering an Add to calendar button. Losing a date somebody rejected is
-- the intended outcome.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_discard_event(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.events where id = p_id) then
    raise exception 'No event with that id.';
  end if;

  -- Refuses to take down something already on the calendar. Discard is for the
  -- queue; an approved event comes down by being deleted on purpose.
  if exists (select 1 from public.events where id = p_id and published) then
    raise exception 'That event is already on the calendar.';
  end if;

  -- The announcement lets go first, so the foreign key has nothing to say.
  update public.announcements set event_id = null where event_id = p_id;
  delete from public.events where id = p_id;
end;
$$;

revoke all on function public.hc_admin_discard_event(text) from public, anon, authenticated;
grant execute on function public.hc_admin_discard_event(text) to authenticated;

comment on function public.hc_admin_discard_event(text) is
  'Throws away one parsed event that has not been approved. Deletes rather than marks, because an unpublished event is on no screen in this app and a marked one could never be found again. Admins only.';


-- ---------------------------------------------------------------------------
-- 5. Reading the queue
--
-- Nothing to do. 0040 widened the events select policy to
-- `published or public.hc_is_admin()`, which is exactly what an admin needs to
-- see a pending event, and it is said here so nobody goes looking for the
-- section that is missing. Writes are still closed to every client role: the
-- two functions above are the whole surface.
-- ---------------------------------------------------------------------------
