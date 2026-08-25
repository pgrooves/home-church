-- ===========================================================================
-- Home Church, the reading advances with the week
--
-- THE PROBLEM. 0024 taught the plan to count its own weeks from `starts_on`,
-- and stopped there. The number advanced and the reading beside it did not,
-- because `this_week` is one text cell that somebody has to retype every
-- Sunday, which is the same chore 0024 was written to abolish. Home has been
-- printing "Week 17 of 20" over a chapter the church finished in June. That is
-- worse than the stale number was: a number nobody bumped reads as neglect,
-- but a number that moves over a reading that does not reads as correct.
--
-- THE FIX. The same shape as 0024. Store the thing that does not change, the
-- whole schedule, and let Home index into it with the week it already derives.
-- One row, written once when a plan starts, and nothing to remember on a
-- Sunday for the next twenty of them.
--
--   weeks[1] is week 1, weeks[2] is week 2, and so on, in the order the church
--   reads them. Postgres counts jsonb arrays from 0 and Home subtracts 1;
--   everywhere a person looks at this, week 1 is the first entry.
--
-- this_week stays, and is still what Home draws when the schedule has nothing
-- for the current week: an empty `weeks`, a plan that ran past the end of its
-- list, a row nobody has filled in yet. So this migration changes nothing on
-- any screen until a schedule is actually written, and a plan with no schedule
-- keeps behaving exactly as it does today.
--
-- WHAT AN ADMIN MAY WRITE. `weeks` joins the column level grants from 0031, so
-- a phone in Edit mode can fix a typo in the current week's reading in place,
-- the same way it can fix any other sentence on Home. The client's copy of
-- that list is the ALLOWLIST at the top of js/edit-mode.js, and
-- supabase/tests/0031_editable_columns_test.sql asserts the two match.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0004 and 0031. Safe to run twice.
-- ===========================================================================


-- 1. The column -------------------------------------------------------------

alter table public.reading_plans
  add column if not exists weeks jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.reading_plans
    add constraint reading_plans_weeks_is_array
    check (jsonb_typeof(weeks) = 'array');
exception when duplicate_object then null;
end $$;

comment on column public.reading_plans.weeks is
  'The whole schedule, one entry per week, in order: ["1 Samuel 16 and 17", '
  '...]. Home reads the entry for the week it derives from starts_on, so the '
  'reading advances on its own. Empty falls back to this_week.';

comment on column public.reading_plans.this_week is
  'Fallback only, for a plan with no schedule in weeks, or one that has run '
  'past the end of it. Home prefers weeks.';


-- 2. What an admin phone may reword -----------------------------------------
--
-- Same form as 0031 section 1, and for the reason given at length there: RLS
-- decides rows and says nothing about columns, so the grant is the only thing
-- standing between a phone holding an admin session and a PATCH that
-- unpublishes a plan. The UPDATE policy 0031 created on this table already
-- covers the row half, so there is no second policy here.
--
-- A whole jsonb array for one sentence, which is the same trade
-- content_pages.sections makes: two admins rewording two different weeks in
-- the same minute is last one wins. Weeks are written once at the start of a
-- plan and read for twenty; the race is theoretical and a column per week is
-- not a table design.

grant update (weeks) on public.reading_plans to authenticated;


-- 3. The schedule for the plan that is running right now ---------------------
--
-- READ THIS BEFORE RUNNING, it is the only part of this file that is content
-- rather than schema. It fills in twenty weeks for `plan-david` so the plan
-- starts advancing the day this runs rather than the day somebody gets round
-- to typing a list. The anchors are the church's own: week 8 is the reading
-- 0004 seeded, week 9 is the one the row carries today, and the fifteen weeks
-- of narrative run 1 Samuel 16 to 1 Kings 2 with the Psalms of David after it.
--
-- If the church is reading something else, edit the array here before running,
-- or fix any single week afterwards from Home in Edit mode. Nothing else in
-- this migration depends on these words.
--
-- Deliberately not `on conflict do nothing` shaped: it only writes a row that
-- has no schedule yet, so running the file twice cannot overwrite a week the
-- church has since corrected.

update public.reading_plans
   set weeks = '[
         "1 Samuel 16 and 17",
         "1 Samuel 18 to 20",
         "1 Samuel 21 to 24",
         "1 Samuel 25 to 27",
         "1 Samuel 28 to 31",
         "2 Samuel 1 to 5",
         "2 Samuel 6 to 10",
         "2 Samuel 11 and 12, plus Psalm 51",
         "2 Samuel 13",
         "2 Samuel 14 and 15",
         "2 Samuel 16 to 18",
         "2 Samuel 19 and 20",
         "2 Samuel 21 and 22, plus Psalm 18",
         "2 Samuel 23 and 24",
         "1 Kings 1 and 2",
         "Psalms 3 to 8",
         "Psalms 22 to 25",
         "Psalms 27, 30 and 31",
         "Psalms 32, 34 and 37",
         "Psalms 138 to 145"
       ]'::jsonb
 where id = 'plan-david'
   and jsonb_array_length(weeks) = 0;
