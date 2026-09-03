-- ===========================================================================
-- Home Church, an announcement retires with the date it is about
--
-- WHAT CHANGED, AND WHERE. In the app, an announcement carrying an event_id
-- and no ends_on of its own now comes down the morning after that event.
-- 0003 gave announcements a window and 0040 gave them an event, and until now
-- those two facts had nothing to do with each other: a card announcing a serve
-- day on the 12th sat on Home in December unless somebody had remembered to
-- type an end date when it was written. The intake asks the model for one
-- (see supabase/functions/newsletter-intake, rule 8) and the model does not
-- always have one to give, and futureDate() nulls any that has already passed,
-- so "nobody typed an end date" is the ordinary case rather than the careless
-- one. The rule itself lives in liveAnnouncements() in js/data.js, which is
-- what Home and the pinned strip both read.
--
-- WHY THE DATABASE HAS TO KNOW. Only one thing in here reads the window, and
-- it is the one thing that cannot be taken back: hc_admin_send_announcement
-- refuses to send a notification for a row that is not on Home, because
-- telling a hundred people to go and look at a card that is not there is worse
-- than saying nothing. That refusal was written against ends_on alone, so the
-- day the app started retiring announcements by their event, the Send button
-- would have happily pushed one of them. This closes that, and nothing else:
-- the app decides what is on Home, and this function agrees with it.
--
-- WHY ends_on STILL WINS. It is a date a person typed into a form that told
-- them what it would do, and the admin list reads it back to them. An event
-- that quietly cut it short would make that line a lie. So the event is
-- consulted only when there is no end date at all, which is exactly the case
-- that used to run forever. Same order as the JavaScript, deliberately.
--
-- A DELETED, MISSING OR UNPUBLISHED EVENT CHANGES NOTHING, for the same reason
-- it changes nothing in the app: `select ... into` leaves the day null, the
-- check does not fire, and the announcement keeps the open window it has
-- always had. The safe direction to be wrong in is leaving a card up. See the
-- note on `and e.published` at the check itself, which is the line that keeps
-- this function looking at the same events a phone is.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0027 (the function) and 0040 (announcements.event_id).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- The one function, replaced whole
--
-- CREATE OR REPLACE with the same signature, so every grant, every comment on
-- anything else, and the admin screen's call all stand. The three checks above
-- the new one are unchanged, in the same order, and are still the same three
-- questions isLiveNow() asks in js/screens/admin.js.
--
-- America/Chicago on both sides of the comparison. v_today already is; the
-- event's starts_at is timestamptz, so it is dragged into the church's zone
-- before the date is taken off it, or a 6:30 PM event in New Orleans would be
-- the next day in UTC and would take its announcement down a morning early in
-- winter. That is the same conversion the publishing scripts do going the
-- other way. See 0001, section 5.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_send_announcement(p_id text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_row public.announcements%rowtype;
  v_event_day date;
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.announcements where id = p_id;

  if not found then
    raise exception 'No announcement with that id.';
  end if;

  if not v_row.published then
    raise exception 'That announcement is a draft. Publish it before telling anybody about it.';
  end if;

  if v_row.starts_on is not null and v_row.starts_on > v_today then
    raise exception 'That announcement does not go up until %. It will not be on Home yet.', v_row.starts_on;
  end if;

  if v_row.ends_on is not null and v_row.ends_on <= v_today then
    raise exception 'That announcement has already come down.';
  end if;

  /* The new one. Only when there is no end date to have answered already, and
     only when the event is really there: a null day is an event that was
     deleted, or one this announcement points at that never existed, and
     neither is a reason to refuse a send.

     `and e.published` is what keeps this function and the app looking at the
     same events. js/content.js syncs with the anon key and nothing else, so a
     phone holds published events and no others, whatever the reader's role —
     0040's policy widens the read for an admin session, and the content sync
     is not one. Without this line, an announcement whose event was approved
     separately and left unpublished (which 0041 allows) would still be on
     Home, correctly, and this function would refuse to announce it on the
     strength of a row nobody can see. Refusing a send for a card that is
     genuinely up is the one failure here that costs a person something. */
  if v_row.ends_on is null and v_row.event_id is not null then
    select (e.starts_at at time zone 'America/Chicago')::date
      into v_event_day
      from public.events e
     where e.id = v_row.event_id
       and e.published;

    if v_event_day is not null and v_event_day < v_today then
      raise exception 'That announcement came down with its date, which was %.', v_event_day;
    end if;
  end if;

  return public.hc_send_push('announcement', false, p_id);
end;
$$;

revoke all on function public.hc_admin_send_announcement(text) from public, anon, authenticated;
grant execute on function public.hc_admin_send_announcement(text) to authenticated;

comment on function public.hc_admin_send_announcement(text) is
  'Sends the announcement notification for one row. Admins only, and only for a row that is published and actually on Home: inside its own date window, and, when it has no end date of its own, not yet past the event it is about. A push cannot be unsent, so it refuses to point at a card nobody can see.';


-- ---------------------------------------------------------------------------
-- What the advisor will say
--
-- Nothing new. This replaces a function that was already on the
-- 0029_authenticated_security_definer_function_executable list 0025 section 6
-- keeps, with the same answer as every other entry on it: the grant is what
-- makes the permission boundary reachable, and hc_is_admin() on the first line
-- is what makes it a boundary.
-- ---------------------------------------------------------------------------
