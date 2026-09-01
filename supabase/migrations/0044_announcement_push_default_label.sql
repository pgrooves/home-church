-- ===========================================================================
-- Home Church, saying what the announcement switch actually does
--
-- WHAT THIS CHANGES. The label and the help on one existing app_settings row,
-- `announcement_push_default`. No schema, no policies, no new keys. The row
-- keeps its key, its value and its history; only the words change.
--
-- WHY. It shipped as "Notify on new announcements", which is the same
-- sentence as the Announcements switch every member has in their own Profile,
-- and the two do opposite halves of the same thing. The member's switch is a
-- RECEIVE preference: whether that one phone is in the list send-push sends
-- to. This one is a SEND-SIDE DEFAULT: whether "Tell everybody" is already on
-- when an admin opens a new announcement. Read side by side, the old label
-- made this look like a second, church-wide copy of a personal choice, which
-- is the one thing it can never be. It cannot notify anybody, it cannot
-- override anybody, and it has no effect at all on an announcement being
-- edited rather than written.
--
-- WHY AN UPDATE AND NOT A NEW INSERT. 0026 seeded this row with
-- `on conflict do nothing`, precisely so re-running it never resets a switch
-- somebody has flipped. That is still what we want for the VALUE, and it is
-- also why a corrected label cannot arrive by re-running 0026: the insert is
-- skipped and the old words stay. So the words are updated by key here, and
-- the value is deliberately not touched.
--
-- WHERE IT IS DRAWN. Admin -> Announcements, under the two buttons, next to
-- the "Write an announcement" button whose behaviour it changes. It used to
-- be on Admin -> App settings among the banner rows, where nothing around it
-- explained which side of the send it was on. The App settings screen now
-- skips it by key. See DRAWN_ELSEWHERE in js/screens/admin.js.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0026 (the app_settings table and this row).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The words
--
-- Keyed on `key` and not on the old label, so a project where somebody has
-- already renamed this by hand is corrected rather than missed.
--
-- The help says what the switch does NOT do as well as what it does. That is
-- the half the old copy left out, and it is the half that made two unrelated
-- controls read as one.
-- ---------------------------------------------------------------------------

update public.app_settings
   set label = 'Start new announcements with notification on',
       help  = 'Sets how “Tell everybody” starts on a new announcement, ' ||
               'which you can still change before you post. Turn it off for a ' ||
               'season of small updates nobody needs on their lock screen. It ' ||
               'never overrides what a member chose in their own settings.'
 where key = 'announcement_push_default';


-- ---------------------------------------------------------------------------
-- 2. If the row is not there at all
--
-- A project that somehow never got 0026's seed, or one where the row was
-- deleted before the app started refusing to offer it for deletion. Inserted
-- with the shipping default of on, which is the behaviour the composer had
-- before the setting existed and the same value 0026 seeds.
--
-- Separate from the update above rather than an upsert, so the ordinary case
-- of a project that has this row touches only two columns and can never write
-- a value over a switch somebody flipped.
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('announcement_push_default',
   'Start new announcements with notification on',
   'Sets how “Tell everybody” starts on a new announcement, which you can ' ||
   'still change before you post. Turn it off for a season of small updates ' ||
   'nobody needs on their lock screen. It never overrides what a member ' ||
   'chose in their own settings.',
   'boolean', true, null, 30)
on conflict (key) do nothing;
