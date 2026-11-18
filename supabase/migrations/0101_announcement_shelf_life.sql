-- ===========================================================================
-- Home Church, every announcement comes down on its own
--
-- WHAT THIS CHANGES. An announcement with an end date (ends_on) has always
-- taken itself down. One without stayed on Home until somebody remembered to
-- remove it, and by November Home was still carrying cards from September.
--
-- Now an announcement written with no end date gets one, the moment it is
-- written: the day it goes up (starts_on, or today if that is empty) plus the
-- number of days in App settings -> "Announcements come down after (days)".
-- That starts at 21, three Sundays of being seen.
--
--   written with an end date      ->  untouched, exactly as before
--   written with no end date      ->  ends_on = goes up + 21 days
--
-- ON INSERT ONLY, and that is the whole design. Admin writes a new
-- announcement with a POST and edits one with a PATCH, the newsletter reader
-- inserts its drafts, and /new-announcement creates new rows. So:
--
--   - to keep one up longer, edit its "Comes down" date;
--   - to keep one up for good, clear the date. An edit is an update, this
--     never runs on an update, and a cleared date stays cleared.
--
-- One caveat, said once: `hc_supabase.py upsert` is an INSERT ... ON CONFLICT,
-- and Postgres runs BEFORE INSERT triggers on that even when the row exists.
-- An upsert of an existing row with ends_on null comes back with the default.
-- Use `update` to clear a date, never `upsert`.
--
-- THE SETTING. A text row, because app_settings only draws switches and text
-- boxes. Anything that is not a whole number from 1 to 365 counts as 21, so a
-- typo cannot take every new announcement down the day it goes up. 0 turns the
-- whole thing off: new announcements with no date stay up, as before.
-- Changing the number affects announcements written after the change, not
-- ones already up, which keep the date they were given.
--
-- SAFE FOR EVERY BUILD ALREADY INSTALLED. Every build since announcements
-- existed already hides a card on its ends_on. Nothing a shipped build reads
-- is renamed or removed: one setting row, one function, one trigger.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
--
-- Rollback: supabase/rollback/0101_announcement_shelf_life_down.sql
-- Tests:    supabase/tests/0101_announcement_shelf_life_test.sql
-- ===========================================================================


-- 1. The setting -------------------------------------------------------------
-- `on conflict do nothing`, so re-running this never resets a number somebody
-- has since changed.

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('announcement_shelf_days',
   'Announcements come down after (days)',
   'A new announcement with no "Comes down" date leaves Home after this many days. 21 is three Sundays. To keep one up longer, edit its date; clear the date to keep it up for good. 0 turns this off.',
   'text', null, '21', 35)
on conflict (key) do nothing;


-- 2. The number, read safely -------------------------------------------------

create or replace function public.hc_announcement_shelf_days()
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when v ~ '^\s*\d{1,3}\s*$' and trim(v)::int between 0 and 365 then trim(v)::int
    else 21
  end
  from (
    select coalesce(
      (select value_text from public.app_settings where key = 'announcement_shelf_days'),
      '21') as v
  ) s;
$$;

-- Nobody calls this but the trigger below, which is security definer and so
-- calls it as the owner. No client role needs it, so every one is shut out.
revoke all on function public.hc_announcement_shelf_days() from public, anon, authenticated;

comment on function public.hc_announcement_shelf_days() is
  'How many days a new announcement with no end date stays on Home. Reads app_settings.announcement_shelf_days; anything unreadable is 21, and 0 means off. See 0101.';


-- 3. The trigger -------------------------------------------------------------
-- "Today" is church time, the same zone 0099 uses, so an announcement written
-- at 9pm on a Sunday is dated from Sunday and not from Monday in UTC.

-- SECURITY DEFINER because an admin posting from a phone inserts as the
-- `authenticated` role, and that role cannot execute the reader above. It does
-- one thing with that reach: read one app_settings row, which is public anyway.
create or replace function public.hc_announcement_default_ends_on()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := public.hc_announcement_shelf_days();
begin
  if new.ends_on is null and v_days > 0 then
    new.ends_on := coalesce(new.starts_on,
                            (now() at time zone 'America/Chicago')::date) + v_days;
  end if;
  return new;
end;
$$;

revoke all on function public.hc_announcement_default_ends_on() from public, anon, authenticated;

drop trigger if exists announcements_default_ends_on on public.announcements;

create trigger announcements_default_ends_on
  before insert on public.announcements
  for each row execute function public.hc_announcement_default_ends_on();

comment on trigger announcements_default_ends_on on public.announcements is
  'Gives a new announcement with no ends_on one, from the shelf life in app_settings. Insert only: clearing the date on an edit keeps it up for good. See 0101.';


-- Read it back.
select key, value_text from public.app_settings where key = 'announcement_shelf_days';
