-- ===========================================================================
-- Home Church, Maintenance mode
--
-- WHAT THIS IS FOR. A switch an admin throws when something has gone wrong
-- (a bug that is showing people the wrong thing, a room somebody is abusing,
-- anything that looks like an attack) and the church needs the app out of
-- everybody's hands while it is fixed. On, and every phone that is not an
-- admin's is covered by the same screen the app opens on, the gold house on
-- the paper, with "We'll be back soon." where the welcome would be. It does
-- not fade and it does not time out. It comes off when an admin turns this
-- off, and not before.
--
-- WHO IT COVERS. Everybody who is not an admin: members, leaders, and phones
-- nobody has signed in on. Admins see the app exactly as they always do,
-- which is the whole point: they are the ones fixing it.
--
-- THIS FILE IS A CONVENIENCE, NOT A PREREQUISITE, for the same reason 0064
-- is. The App settings screen draws the Maintenance mode switch by name
-- whether or not this has run, and the first tap upserts exactly this row.
-- A switch meant for a bad afternoon must not depend on somebody having run
-- SQL on a good one. See saveSwitch in js/admin.js.
--
-- WHAT A PHONE WITH NO SIGNAL DOES. Whatever it last heard. The app reads
-- this through HC.data.setting('maintenance_mode_on', false), off when it has
-- never heard anything, and from the cached content otherwise, so a phone
-- that was covered stays covered through a cold start in airplane mode.
-- Open phones check the one row every minute while they are on screen, and
-- again the moment they come back to the foreground, so the cover arrives
-- and leaves without anybody having to close the app. See js/maintenance.js.
--
-- WHAT IT IS NOT. A server lockdown. It is a cover over the app, drawn by the
-- app. Every write an admin could make is still guarded by the policies it
-- was always guarded by, and those are what stand between the database and
-- somebody who does not go through the app at all.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once: `on conflict do nothing`, so re-running it
--   never lifts a cover an admin has put up.
-- ===========================================================================

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('maintenance_mode_on',
   'Maintenance mode',
   'On covers the whole app for everybody except admins, with the house and “We’ll be back soon.” It stays up until an admin turns this off.',
   'boolean', false, null, 5)
on conflict (key) do nothing;

-- Read it back.
select key, kind, value_bool, sort_order
from public.app_settings
where key = 'maintenance_mode_on';
