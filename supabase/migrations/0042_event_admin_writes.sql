-- ===========================================================================
-- Home Church, the calendar becomes something an admin can keep
--
-- WHAT THIS ADDS. Two functions, hc_admin_save_event and hc_admin_delete_event,
-- so an event can be written, corrected and taken down from inside the app.
--
-- WHY NOW. Events moved out of the Connect tab and onto a screen of their own,
-- the Cal tab, which opens with a month grid and the upcoming list underneath
-- it. That screen is where the church now looks at its own calendar, so it is
-- also where a wrong date has to be fixable. Until this migration the only
-- ways to change one were a slash command on somebody's laptop and the
-- Supabase dashboard, neither of which is available to the person who notices
-- the mistake on a Sunday morning.
--
-- WHY THIS IS STILL NOT A WRITE POLICY. 0026 gave admins policies on
-- announcements, content_pages and app_settings and deliberately left events
-- alone; 0040 and 0041 both restated that and added one narrow function each
-- instead. The reasoning has not changed: a policy is a standing grant on a
-- whole table, and what an admin actually needs is six columns on a row, with
-- the church's own rules about them enforced in one place rather than in a
-- form on a phone. So this is two more named, admin-checked functions, and
-- events still has no write policy at all.
--
-- WHAT THE FUNCTIONS WILL NOT DO, which is the interesting half:
--
--   published        is not a parameter. Anything written here is written to
--                    be seen, and taking something down is deleting it, which
--                    is the button the screen actually offers. An admin cannot
--                    reach in and unpublish a row into the state 0041 calls
--                    "on no screen in this app".
--   review_state     is never set and never cleared. An event a model parsed
--                    is approved through hc_admin_approve_event and nowhere
--                    else, and correcting the wording of one that is already
--                    on the calendar must not quietly re-open that decision.
--   signup_url,      are not touched on an update. The Cal form has no field
--   capacity,        for them, and a function that wrote every column would
--   category         blank the three the slash commands fill in.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0001 (events), 0025 (hc_is_admin) and 0041 (review_state).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The id for a new event
--
-- The slash commands name a row after what it is, `event-baptism`, and reading
-- a table of those beats reading a table of uuids. A form on a phone has
-- nobody to ask, so the slug is derived from the title the same way a person
-- would derive it, and a number is added only when the plain form is taken.
--
-- The suffix loop is what makes "City Serve Day" safe to hold twice: the
-- second one becomes event-city-serve-day-2 rather than failing on a primary
-- key nobody outside this file knows exists.
-- ---------------------------------------------------------------------------

create or replace function public.hc_event_slug(p_title text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_try  text;
  v_n    integer := 1;
begin
  v_base := regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  v_base := left(v_base, 48);
  if v_base = '' then
    -- A title of nothing but punctuation. Refused upstream, but a slug
    -- function that can return 'event-' is a slug function that will.
    v_base := to_char(now(), 'YYYY-MM-DD');
  end if;

  v_try := 'event-' || v_base;
  while exists (select 1 from public.events where id = v_try) loop
    v_n := v_n + 1;
    v_try := 'event-' || v_base || '-' || v_n;
  end loop;

  return v_try;
end;
$$;

revoke all on function public.hc_event_slug(text) from public, anon, authenticated;

comment on function public.hc_event_slug(text) is
  'The id a new event gets when it is written from the app: event- plus the title, kebab cased, with a number on the end if that is taken. Called only by hc_admin_save_event.';


-- ---------------------------------------------------------------------------
-- 2. Writing one
--
-- One function for both halves, because from the screen they are one act: the
-- form that adds an event is the form that corrects one, and a save that
-- behaved differently depending on which is a save with two ways to go wrong.
--
-- p_id null means new. p_id given means that row, and a p_id that names no row
-- raises rather than quietly inserting: an edit whose row has been deleted
-- underneath it should say so, not create a second one.
--
-- The checks are here rather than in the form for the ordinary reason: the
-- form is a suggestion and this is the rule. A phone with a stale copy of the
-- app, or a session with curl, meets the same two conditions everybody else
-- does.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_save_event(
  p_id          text,
  p_title       text,
  p_starts_at   timestamptz,
  p_time_label  text,
  p_location    text,
  p_description text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    text;
  v_title text := trim(coalesce(p_title, ''));
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if v_title = '' then
    raise exception 'An event needs a title.';
  end if;
  if p_starts_at is null then
    raise exception 'An event needs a date.';
  end if;

  if p_id is null or trim(p_id) = '' then
    v_id := public.hc_event_slug(v_title);
    insert into public.events (id, title, description, starts_at, time_label,
                               location, published)
    values (v_id, v_title, nullif(trim(coalesce(p_description, '')), ''),
            p_starts_at, nullif(trim(coalesce(p_time_label, '')), ''),
            nullif(trim(coalesce(p_location, '')), ''), true);
    return v_id;
  end if;

  update public.events
     set title       = v_title,
         description = nullif(trim(coalesce(p_description, '')), ''),
         starts_at   = p_starts_at,
         time_label  = nullif(trim(coalesce(p_time_label, '')), ''),
         location    = nullif(trim(coalesce(p_location, '')), '')
   where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'No event with that id.';
  end if;

  return v_id;
end;
$$;

revoke all on function public.hc_admin_save_event(text, text, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.hc_admin_save_event(text, text, timestamptz, text, text, text)
  to authenticated;

comment on function public.hc_admin_save_event(text, text, timestamptz, text, text, text) is
  'Writes one event from the Cal tab: a new one when p_id is null, otherwise that row. Six columns and no others, so signup_url, capacity, category, published and review_state survive an edit made on a phone. Admins only, checked inside.';


-- ---------------------------------------------------------------------------
-- 3. Taking one down
--
-- The x in the corner of an event on the Cal tab. It deletes, and there is no
-- softer state to put the row in: an unpublished event is on no screen in this
-- app, so hiding one would be losing it somewhere nobody can look.
--
-- An announcement pointing at it keeps everything else it has and stops
-- offering an Add to calendar button, which is what the `on delete set null`
-- from 0040 already arranges. Nothing here has to null the column by hand, and
-- deliberately does not: doing it in two places is how the two get to disagree.
--
-- UNLIKE hc_admin_discard_event, this one will take down a published event.
-- That is the whole point of it. Discard is for a date in the review queue that
-- nobody has vouched for yet, and it refuses anything already on the calendar;
-- this is the church deciding, on purpose, that something is not happening.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_delete_event(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  delete from public.events where id = p_id;

  if not found then
    raise exception 'No event with that id.';
  end if;
end;
$$;

revoke all on function public.hc_admin_delete_event(text) from public, anon, authenticated;
grant execute on function public.hc_admin_delete_event(text) to authenticated;

comment on function public.hc_admin_delete_event(text) is
  'Takes one event off the calendar for good, from the x on the Cal tab. Any announcement pointing at it keeps its words and loses its Add to calendar button, through the foreign key from 0040. Admins only, checked inside.';


-- ---------------------------------------------------------------------------
-- 4. What the advisor will say
--
-- Two more 0029_authenticated_security_definer_function_executable, on
-- hc_admin_save_event and hc_admin_delete_event, joining the list 0025
-- section 6 keeps. Same answer as every other one on it: in this project a
-- SECURITY DEFINER function IS the permission boundary, so the ones that
-- matter are exactly the ones that have to be callable, and the advisor can
-- see the grant but not the hc_is_admin() check on the first line.
--
-- hc_event_slug is not on that list, because nothing was granted EXECUTE on
-- it. It is reachable only from inside hc_admin_save_event, which has already
-- asked who is calling.
-- ---------------------------------------------------------------------------
