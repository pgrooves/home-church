-- ===========================================================================
-- Undoes 0101. New announcements with no end date stay up until removed again.
--
-- THE FAST UNDO needs no rollback: set App settings -> "Announcements come
-- down after (days)" to 0, and the trigger leaves new rows alone.
--
-- This file removes it outright. Announcements already given a date by 0101
-- keep that date; it is an ordinary ends_on now, edited in Admin like any
-- other. To put one back up for good, clear its date there.
-- ===========================================================================

drop trigger if exists announcements_default_ends_on on public.announcements;
drop function if exists public.hc_announcement_default_ends_on();
drop function if exists public.hc_announcement_shelf_days();

delete from public.app_settings where key = 'announcement_shelf_days';
