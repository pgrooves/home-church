-- ===========================================================================
-- 0089: which model drafted a newsletter card, when it was not Gemini
--
-- Gemini's free tier is busy often enough that the newsletter intake now has
-- a backup: when every Gemini model refuses, it asks Groq once with the same
-- prompt (supabase/functions/_shared/groq.mjs). Whatever the backup drafts
-- lands in the same review queue as always, unpublished and pending. What is
-- new is that the queue says so, so whoever approves it knows to read it
-- closely.
--
--   written_by   on announcements and on events. Null for everything Gemini
--                or a person wrote, which is nearly everything. 'Groq
--                (backup)' on a draft the backup wrote. Read by the Needs
--                review and Dates to review cards in js/screens/admin.js.
--
-- Nobody writes it but the intake, with the service role. No grant is added:
-- the app can read it with the rest of the row and cannot change it.
--
-- RUN THIS BEFORE deploying the newsletter-intake that writes it. If it is
-- run after, the intake still works: it notices the missing column and writes
-- the drafts without the label.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0003 (announcements) and 0001 (events). Safe to run twice.
-- ===========================================================================

alter table public.announcements
  add column if not exists written_by text;

alter table public.events
  add column if not exists written_by text;

comment on column public.announcements.written_by is
  'The model that drafted this card when it was not Gemini, e.g. ''Groq (backup)''. Null for everything else. Written by newsletter-intake; shown on the review card. See migration 0089.';
comment on column public.events.written_by is
  'The model that drafted this date when it was not Gemini, e.g. ''Groq (backup)''. Null for everything else. Written by newsletter-intake; shown on the review card. See migration 0089.';
