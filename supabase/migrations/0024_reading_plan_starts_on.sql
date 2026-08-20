-- ===========================================================================
-- Home Church, the reading plan counts its own weeks
--
-- THE PROBLEM. 0004 shipped `current_week` with a comment on it that read
-- "Bump this every week. It is the reason this table exists." It is also the
-- reason it stopped being true: the row sat on week 9 while the church read
-- on, because remembering to open the Table Editor every Sunday is a chore
-- that loses to a busy week, every time. A row that has to be touched weekly
-- to stay honest is a row that will eventually lie on the front door of the
-- app, quietly, to everybody.
--
-- THE FIX. Store the day the plan started, which never changes, and let Home
-- do the arithmetic on every render. Week 1 is the seven days beginning
-- starts_on, so the count rolls over on whatever weekday the plan began, and
-- a plan dated in the future reads as week 1 until it starts.
--
-- current_week stays. It is the fallback for a row with no start date on it,
-- so nothing breaks the moment this runs, and it is the record of where a
-- finished plan ended up. It is no longer the thing Home reads.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run twice.
-- ===========================================================================


-- 1. The column -------------------------------------------------------------

alter table public.reading_plans
  add column if not exists starts_on date;

comment on column public.reading_plans.starts_on is
  'The first day of week 1. Home counts the weeks from here, so nothing has '
  'to be bumped on a Sunday. Null falls back to current_week.';

comment on column public.reading_plans.current_week is
  'Fallback only, for a row with no starts_on. Home derives the week from '
  'starts_on. Kept as the record of where a finished plan ended up.';


-- 2. Backfill ---------------------------------------------------------------
--
-- Every existing row gets the start date its own current_week implies, so the
-- number on the screen does not move the day this runs, it just starts
-- advancing on its own afterwards.
--
-- The plan's week is taken to have been correct when the row was last edited,
-- which for these rows is the Sunday of that week: back up updated_at to the
-- Sunday on or before it, in the church's own zone rather than UTC, then back
-- up another (current_week - 1) weeks to reach week 1.
--
-- Worth a look afterwards. If the church knows the actual first Sunday of the
-- plan, set it directly and this guess is gone:
--   update public.reading_plans set starts_on = '2026-06-14' where id = '...';

update public.reading_plans
   set starts_on =
         (((updated_at at time zone 'America/Chicago')::date
            - extract(dow from (updated_at at time zone 'America/Chicago')::date)::int)
          - ((current_week - 1) * 7))
 where starts_on is null;
