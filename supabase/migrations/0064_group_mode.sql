-- ===========================================================================
-- Home Church, group mode becomes a switch the church holds
--
-- THIS FILE IS A CONVENIENCE, NOT A PREREQUISITE. The App settings screen
-- draws the Group mode switch by name whether or not this has ever been run,
-- and the first tap upserts exactly the row below, label and help included.
-- That is deliberate: a church that cannot find the switch cannot turn the
-- feature on, and "run this SQL first" is not an answer anybody at a church
-- should need. Running this only means the row is there, explicitly off, from
-- day one rather than from the first tap. See saveSwitch in js/admin.js.
--
-- ONE ROW, AND THE TAB IS BEHIND IT. `group_mode_on` decides whether the
-- Group tab exists at all: its tile in the ••• sheet, its stop on the
-- sideways swipe, its row on the More screen, and the screen itself. Off, and
-- there is no Group in this app for anybody, leaders included; the tiles
-- below it simply move up a slot. On, and everything is exactly as it was.
--
-- WHY IT SHIPS OFF. The Group tab is a room a leader opens on a Thursday
-- night with a six digit code, and the church is not running that yet. A
-- feature nobody has been told about is worse than a missing one: somebody
-- finds the tile, opens a room, hands the code to four people, and now there
-- is a room the church did not know existed. `false` here is the church
-- saying "not yet", and the app takes it at its word.
--
-- WHY IT IS ONE SWITCH AND NOT A COLUMN PER LEADER. Group mode is a season,
-- not a permission. When the church starts running rooms it starts running
-- them for every leader at once, and the question an admin actually has on a
-- Tuesday is "are we doing this yet", which is one switch in one place.
-- Who may *host* a room once it is on is still `can_host`, set per person
-- from Admin -> Manage users, and 0036 is the long version of that. The two
-- do not overlap: this decides whether the room exists, that decides who can
-- open one.
--
-- WHAT A PHONE WITH NO SIGNAL DOES. It hides the tab. The app reads this
-- through HC.data.setting('group_mode_on', false), and a fallback is required
-- rather than optional there for exactly this case. Off is the honest answer
-- for a phone that has never reached Supabase: showing a room somebody cannot
-- join is the worse of the two mistakes, and it is also the default the
-- church asked for.
--
-- NOTHING IS DELETED WHEN IT GOES OFF. Every room, every answer and every
-- prayer stays in its table untouched. This is a switch over what the app
-- draws, not a teardown, so turning it back on a season later finds the rooms
-- where they were left. The row is read by name in js/app.js and is not
-- offered for deletion on the App settings screen for that reason.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once: `on conflict do nothing`, so re-running it
--   never flips the switch back under a church that has since turned it on.
-- ===========================================================================

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('group_mode_on',
   'Group mode',
   'Off hides the Group tab from everybody, leaders included: its icon leaves the ••• menu and the rest move up a slot. Nothing is deleted — rooms, answers and prayer requests stay where they are and come back exactly as they were when this goes on again.',
   'boolean', false, null, 30)
on conflict (key) do nothing;

-- Read it back.
select key, kind, value_bool, sort_order
from public.app_settings
where key = 'group_mode_on';
