-- ===========================================================================
-- Home Church, the reading plan follows the series
--
-- THE PROBLEM. 0024 and 0032 between them made the plan advance on its own,
-- and they made it advance on a calendar. Seven days pass, the week number
-- moves, the reading under it moves with it. That is right until the church's
-- calendar and the pulpit's disagree, which they do: a fifth Sunday with a
-- guest speaker, a week off at Christmas, a series that starts on the Sunday
-- after the plan's start date because somebody set the date before the first
-- sermon was scheduled. Every one of those leaves Home printing the week of
-- the plan next to the sermon of a different week, and neither number is
-- obviously wrong on its own.
--
-- The reading plan for Jonah is a four week devotional beside a four week
-- series. The two are the same four weeks, and the church only ever thinks of
-- them that way: week 2 of the plan is the week Stephen preaches Jonah 2. The
-- plan should be counting sermons, not days.
--
-- THE FIX. Give a plan the series it walks alongside, and re-anchor `starts_on`
-- whenever a guide in that series is published, so that the week of the plan is
-- the week of the sermon:
--
--     starts_on = (the latest sermon's date) - (its number in the series - 1) * 7
--
-- Nothing about how Home reads a plan changes. It still counts days from
-- `starts_on` and still takes `weeks[n]` for the week it counted, because that
-- arithmetic is what makes the reading right on a Wednesday as well as on a
-- Sunday. This only moves the day it counts from, and only when the sermons
-- say it moved.
--
-- WHY IT IS A TRIGGER AND NOT A STEP IN THE SLASH COMMAND. Because a step in a
-- slash command is a thing to remember, and this whole corner of the schema is
-- a monument to what happens to those: 0004 shipped a column with "bump this
-- every week" written on it, 0024 replaced it because nobody did, 0032 fixed
-- the half of the same chore 0024 left behind. Publishing a guide is already
-- the moment the church says which sermon is this week's. The plan can just
-- listen for it.
--
-- WHAT IT WILL NOT DO. It anchors to the LATEST published sermon in the
-- series, never to the guide that happened to be written to, so fixing a typo
-- in week 1's guide in the middle of week 3 does not drag the plan back to
-- week 1. Running it twice on the same series gives the same answer as running
-- it once. And a plan with no `series_id` on it is never touched by any of
-- this, which is every plan in the table until somebody opts one in: a plan
-- the church is reading alongside no series at all keeps counting days, which
-- is what 0024 built and what it should still do.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0001, 0004, 0024, 0031 and 0032. Safe to run twice.
--
--   Then prove it landed, because a merged migration proves nothing. 0032 is
--   in this folder because of the four months it spent looking done:
--     select id, series_id, starts_on, current_week, total_weeks
--       from public.reading_plans where is_current;
--   A row for the plan the church is actually reading, with the series it
--   walks beside and a start date the sermons chose, is the whole test.
-- ===========================================================================


-- 1. The series a plan walks beside -----------------------------------------
--
-- THIS COLUMN IS ALREADY THERE, on the real project, and this file is where it
-- finally gets written down. It was applied on August 20th as
-- `reading_plan_series`, a migration with no file in this folder, and then
-- nothing was built on it: `js/content.js` does not map it, `planWeek` in
-- js/screens/home.js has never read it, and the comment it left on the column
-- describes a design where Home counts the plan's week by counting messages,
-- which was never written. So the column has sat on the table for two weeks
-- meaning nothing.
--
-- Worth naming, because it is 0032's failure with the ends swapped. 0032 was
-- merged and never run, and looked done from the repo. This was run and never
-- merged, and looks absent from the repo while being present in production,
-- which is the harder one to notice: a fresh project built from this folder
-- would not have had the column at all. Both are the same mistake, which is
-- believing one of the two is the record. Ask the project for the column, and
-- put the file in the folder.
--
-- The shape below is the shape that is live, so this is a no-op there and a
-- faithful copy anywhere else. Nullable, and null is the honest default rather
-- than a gap to be filled in later: a reading plan is not required to have
-- anything to do with what is being preached, and a plan through the Psalms in
-- a season of topical messages should keep counting its own weeks off the
-- calendar with nothing listening in.

alter table public.reading_plans
  add column if not exists series_id text;

do $$ begin
  alter table public.reading_plans
    add constraint reading_plans_series_id_fkey
    foreign key (series_id) references public.series (id)
    on update cascade on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists reading_plans_series_id_idx
  on public.reading_plans (series_id);

comment on column public.reading_plans.series_id is
  'The sermon series this plan walks beside, or null. When set, publishing a '
  'guide in that series re-anchors starts_on so the plan is on the week of '
  'the sermon rather than the week of the calendar. See 0055.';

comment on column public.reading_plans.starts_on is
  'The first day of week 1. Home counts the weeks from here, so nothing has '
  'to be bumped on a Sunday. Null falls back to current_week. Written by '
  'hc_reading_plan_follow_series when the plan follows a series.';

-- The plan that has already run its course gets the series it ran beside, for
-- the record. It is not is_current, so nothing below will ever move it.
update public.reading_plans set series_id = 'series-david'
 where id = 'plan-david'
   and series_id is null
   and exists (select 1 from public.series where id = 'series-david');


-- 2. The arithmetic ---------------------------------------------------------
--
-- One function, so the trigger below and a person at the SQL editor cannot
-- come to two different answers. It is safe to call by hand at any time, on
-- any series, and answering "nothing follows this series" by returning no rows
-- rather than by raising is deliberate: the caller that most often asks is a
-- guide being published in a series no plan is tied to, which is not a
-- problem and should not read like one.
--
-- What it returns is what to say out loud afterwards: which plan moved, which
-- week it is on, and the sentence Home will now print. `reading` is worked out
-- the same way js/screens/home.js works it out, weeks[n - 1] and this_week
-- underneath it, because a function that reports a week number without the
-- words beside it is how 0032 happened.
--
-- SECURITY DEFINER, and pinned search_path, for the reason 0011 and 0012 spell
-- out at length. The definer part is what keeps the trigger from turning a
-- grant on `guides` into a refusal on `reading_plans`. Nobody but the service
-- role can write the three columns it listens to today, so nothing depends on
-- it yet; the day somebody grants an admin phone a way to publish a guide, a
-- trigger running on the writer's own privileges would fail that write against
-- a table they never asked to touch and never heard of, and the error would
-- name neither. That is a bad afternoon to schedule for a future migration.

create or replace function public.hc_reading_plan_follow_series(p_series_id text)
returns table (plan_id text, week_no integer, weeks_total integer,
               anchored_on date, reading text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  latest_on date;
  n         integer;
begin
  if p_series_id is null then return; end if;

  -- The latest sermon in the series, and its number within it. Both come from
  -- the same set of rows, so a series with nothing published yet falls out
  -- here and the plan keeps whatever start date a person gave it.
  select max(preached_on) into latest_on
    from public.guides
   where series_id = p_series_id
     and published
     and preached_on is not null;

  if latest_on is null then return; end if;

  -- Counted over distinct dates: two guides preached on the same Sunday, a
  -- morning and an evening, are one week of the plan rather than two.
  select count(distinct preached_on) into n
    from public.guides
   where series_id = p_series_id
     and published
     and preached_on is not null
     and preached_on <= latest_on;

  return query
    update public.reading_plans p
       set starts_on    = latest_on - ((n - 1) * 7),
           -- The fallback, kept honest for a row someone reads in the Table
           -- Editor. Clamped, because 0004 constrains it to the plan's length
           -- and a five sermon series beside a four week plan is a real thing.
           current_week = least(greatest(n, 1), p.total_weeks)
     where p.is_current
       and p.series_id = p_series_id
    returning p.id,
              n,
              p.total_weeks,
              p.starts_on,
              coalesce(nullif(btrim(p.weeks ->> (n - 1)), ''), p.this_week);
end;
$fn$;

comment on function public.hc_reading_plan_follow_series(text) is
  'Move the current reading plan tied to this series onto the week of the '
  'series latest published sermon. Idempotent. Returns nothing when no plan '
  'follows the series.';

-- Nobody calls this from a phone. The trigger below calls it as its owner, and
-- a person at the SQL editor or the service role calls it directly.
--
-- `from public, anon, authenticated`, all three, and not just public: Supabase
-- hands the two client roles a default execute privilege on every function
-- created in this schema, so revoking the PUBLIC grant alone leaves a
-- SECURITY DEFINER function that rewrites a table sitting at /rest/v1/rpc/
-- for a signed out phone to call. 0011 is the whole story, and
-- 0017_group_rooms_grants_test.sql is what notices.
revoke all on function public.hc_reading_plan_follow_series(text)
  from public, anon, authenticated;
grant execute on function public.hc_reading_plan_follow_series(text) to service_role;


-- 3. The listening ----------------------------------------------------------
--
-- `update of` and not a bare `update`, so rewording a guide's subtitle does
-- not go anywhere near the reading plan. Only the three columns that could
-- change the answer wake this up: which series a guide belongs to, when it was
-- preached, and whether it is published at all.
--
-- An after trigger returning null, because nothing here has an opinion about
-- the row being written. It is a guide's publication being overheard, not a
-- condition of it.

create or replace function public.hc_guides_advance_reading_plan()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.hc_reading_plan_follow_series(new.series_id);
  return null;
end;
$fn$;

-- Same three roles, same reason. A trigger function needs no execute grant to
-- fire, so the default one is nothing but a way in.
revoke all on function public.hc_guides_advance_reading_plan()
  from public, anon, authenticated;

drop trigger if exists guides_advance_reading_plan on public.guides;

create trigger guides_advance_reading_plan
  after insert or update of series_id, preached_on, published on public.guides
  for each row execute function public.hc_guides_advance_reading_plan();


-- 4. The plan the church is reading right now -------------------------------
--
-- READ THIS BEFORE RUNNING, it is the only part of this file that is content
-- rather than schema, the same warning section 3 of 0032 carries.
--
-- Four weeks of Jonah beside the four week Jonah series. The weeks are the
-- devotional's own, twenty eight days in four sevens, and the resource link is
-- the devotional itself: Home turns the card into a button when a plan has one,
-- so the reading on the front door opens the day's reading.
--
-- `starts_on` here is a value with a short life. Section 5 hands it to the
-- sermons a few lines down and they have owned it ever since.
--
-- Deliberately `do nothing` shaped, so running the file twice cannot overwrite
-- a week the church has since reworded from Home.

insert into public.reading_plans
  (id, title, subtitle, total_weeks, current_week, this_week, weeks,
   resources, series_id, starts_on, is_current, published)
select
  'plan-jonah',
  'The Book of Jonah',
  'A four week devotional through running, repenting, obeying, and learning to want what God wants',
  4,
  1,
  'Jonah 1:1 to 10',
  '[
     "Jonah 1:1 to 10, the call you already know",
     "Jonah 1:11 to 2:10, grace at the bottom",
     "Jonah 3, the second chance",
     "Jonah 4, the heart behind the obedience"
   ]'::jsonb,
  '[{"label": "The devotional, a day at a time",
     "url": "https://brianaguillory.github.io/jonah-homechurch/"}]'::jsonb,
  'series-jonah',
  '2026-09-06',
  true,
  true
where exists (select 1 from public.series where id = 'series-jonah')
on conflict (id) do nothing;

-- One plan is current at a time, and David finished in September. Not a
-- deletion: 0004 keeps every plan the church has ever run.
update public.reading_plans set is_current = false
 where id <> 'plan-jonah'
   and is_current
   and exists (select 1 from public.reading_plans where id = 'plan-jonah');


-- 5. Hand it to the sermons -------------------------------------------------
--
-- The trigger only fires on a guide being written, and the Jonah guides that
-- exist were written before this file did. So ask once, here, for the answer
-- the trigger would have given, and from the next `/new-guide` onwards nobody
-- asks again.

select * from public.hc_reading_plan_follow_series('series-jonah');
