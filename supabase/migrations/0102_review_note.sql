-- ===========================================================================
-- 0102: what the newsletter reader wants checked before a draft is approved
--
-- Named after Christmas Eve Eve. The newsletter of the 20th of November 2026
-- carried it on two flyers saying 5pm and 6:30pm; the draft the reader made
-- said "Services at 5:30pm and 7:00pm", it was approved, and a member texted
-- the church to ask which was right. The calendar had said 5:00pm for five
-- days. Nothing compared the card with the email or with the calendar.
--
-- newsletter-intake now does, with no model in it (factCheck, and
-- tests/newsletter-facts.test.js): every time a draft states must be printed
-- in the email or on one of its flyers, the day it lands on must be one the
-- email names, and the calendar must not already say a different hour for the
-- same night. What it finds goes here, and the Needs review and Dates to
-- review cards draw it in orange over Approve.
--
--   review_note   on announcements and on events. Null when the check found
--                 nothing, which is most drafts. Plain sentences, for a
--                 person. Never shown on Home or the Cal tab.
--
-- Nobody writes it but the intake, with the service role. No grant is added:
-- the app reads it with the rest of the row and cannot change it. It changes
-- nothing about what any installed build shows: a build that does not know
-- the column never asks for it by name.
--
-- RUN THIS BEFORE deploying the newsletter-intake that writes it. If it is
-- run after, the intake still works: it notices the missing column and writes
-- the drafts without the note, and the run note still carries every finding.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0003 (announcements) and 0001 (events). Safe to run twice.
-- ===========================================================================

alter table public.announcements
  add column if not exists review_note text;

alter table public.events
  add column if not exists review_note text;

comment on column public.announcements.review_note is
  'What the newsletter reader''s fact check wants looked at before this draft is approved: a time not in the email, a day it worked out, a clash with the calendar. Null when it found nothing. Written by newsletter-intake; shown on the review card. See migration 0102.';
comment on column public.events.review_note is
  'What the newsletter reader''s fact check wants looked at before this date is approved. Null when it found nothing. Written by newsletter-intake; shown on the Dates to review card. See migration 0102.';
