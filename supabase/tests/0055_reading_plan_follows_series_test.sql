-- ===========================================================================
-- The reading plan follows the series.
--
-- WHAT THIS IS ASKING. 0055 moves a date on a row that nobody looks at, and
-- the consequence of moving it wrongly is a card on Home that looks entirely
-- correct: a real week number, a real passage, a bar drawn to a plausible
-- width, next to a sermon about something else. That is the same failure
-- 0032's test was written for, one step further out, so the questions are the
-- same shape. Does the plan land on the week of the sermon. Does it stay there
-- when the guide it lands on is edited. Does it stay off the plans that never
-- asked to be moved.
--
-- The two hazards specific to this file are the ones a careless version gets
-- wrong quietly. Anchoring to the guide that was written rather than to the
-- latest one in the series, which drags the plan backwards when somebody fixes
-- a typo in week 1 in the middle of week 3. And a trigger that fires on the
-- writer's own permissions, which would turn an admin rewording a guide's
-- subtitle from their phone into a permission error on a table they have never
-- heard of.
--
-- The arithmetic that turns starts_on into a week number and a sentence still
-- lives in the client and is still asserted in tests/reading-plan.test.js.
-- This file is only about which day starts_on is.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function t_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  %', label;
  else raise warning 'FAIL  %  (got %, want %)', label, got, want; end if;
end;
$$;

create or replace function t_raises(label text, stmt text, want_sqlstate text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  %  (it was allowed)', label;
exception
  when others then
    if want_sqlstate is null or sqlstate = want_sqlstate then
      raise notice 'PASS  %', label;
    else
      raise warning 'FAIL  %  (refused with % rather than %)', label, sqlstate, want_sqlstate;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('ff000000-0000-0000-0000-000000000001', 'jadmin@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ff000000-0000-0000-0000-000000000001', 'Ada')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ff000000-0000-0000-0000-000000000001';


-- ------------------------------------------------------- what 0055 shipped ---
-- Section 4 of the migration is content, and content that did not land is the
-- failure mode 0032 spent four months in. Ask for it rather than trusting it.

select t_check('the Jonah plan is the current one',
  (select id from public.reading_plans where is_current), 'plan-jonah');

select t_check('four weeks, and a schedule for all four',
  (select total_weeks || ' of ' || jsonb_array_length(weeks)
     from public.reading_plans where id = 'plan-jonah'), '4 of 4');

select t_check('and it knows which series it walks beside',
  (select series_id from public.reading_plans where id = 'plan-jonah'), 'series-jonah');

-- 0004 keeps every plan the church has ever run and flips the flag, so the
-- one that matters is that exactly one of them is wearing it.
select t_check('and it is the only plan wearing that flag',
  (select count(*)::int from public.reading_plans where is_current), 1);


-- ---------------------------------------------------- publishing a sermon ---
-- Week 1. The plan starts the day the first sermon is preached, whatever date
-- a person typed into the row when they made it.

insert into public.guides (id, series_id, subtitle, preached_on, published)
values ('guide-jonah-1', 'series-jonah', 'Boats to Tarshish', '2026-09-06', true);

select t_check('the first sermon starts the plan on its own day',
  (select starts_on::text || ', week ' || current_week
     from public.reading_plans where id = 'plan-jonah'),
  '2026-09-06, week 1');

-- Week 2, preached a week later, which is the ordinary case and the one where
-- nothing has to move: the calendar and the pulpit already agree.

insert into public.guides (id, series_id, subtitle, preached_on, published)
values ('guide-jonah-2', 'series-jonah', 'Grace at the bottom', '2026-09-13', true);

select t_check('a sermon a week later leaves the start date where it was',
  (select starts_on::text || ', week ' || current_week
     from public.reading_plans where id = 'plan-jonah'),
  '2026-09-06, week 2');

-- And the case this migration exists for. The third sermon comes two weeks
-- after the second, because of a guest speaker or a fifth Sunday. On the
-- calendar the plan would be on week 4 of 4 with a week of the series still to
-- preach. It is on week 3, starting the day week 3 was preached.

insert into public.guides (id, series_id, subtitle, preached_on, published)
values ('guide-jonah-3', 'series-jonah', 'The second chance', '2026-09-27', true);

select t_check('a skipped Sunday moves the plan with the sermons, not past them',
  (select starts_on::text || ', week ' || current_week
     from public.reading_plans where id = 'plan-jonah'),
  '2026-09-13, week 3');

-- What it reports back is what the slash command says out loud afterwards, so
-- the week number and the words beside it come from the same call. A week
-- number on its own is what 0032 was written about.

select t_check('and it reports the week it moved to, with the reading',
  (select week_no || ' of ' || weeks_total || ', ' || reading
     from public.hc_reading_plan_follow_series('series-jonah')),
  '3 of 4, Jonah 3, the second chance');


-- ------------------------------------------------------------ not backwards ---
-- The hazard. Fixing week 1's guide in the middle of week 3 must not put the
-- church back in week 1, so the anchor is taken from the latest sermon in the
-- series and never from the guide that was written to.

update public.guides set preached_on = '2026-09-06', published = true
 where id = 'guide-jonah-1';

select t_check('editing the first guide in week 3 leaves the plan in week 3',
  (select starts_on::text || ', week ' || current_week
     from public.reading_plans where id = 'plan-jonah'),
  '2026-09-13, week 3');

select t_check('and asking twice gives the same answer as asking once',
  (select count(distinct anchored_on)::int from (
     select anchored_on from public.hc_reading_plan_follow_series('series-jonah')
     union all
     select anchored_on from public.hc_reading_plan_follow_series('series-jonah')
   ) both_of_them), 1);

-- Two sermons on one Sunday, a morning and an evening, are one week of the
-- plan. Counting rows rather than days would put the church a week ahead of
-- itself for the rest of the series.

insert into public.guides (id, series_id, subtitle, preached_on, published)
values ('guide-jonah-3-pm', 'series-jonah', 'The second chance, evening',
        '2026-09-27', true);

select t_check('two sermons on one Sunday are one week of the plan',
  (select starts_on::text || ', week ' || current_week
     from public.reading_plans where id = 'plan-jonah'),
  '2026-09-13, week 3');

delete from public.guides where id = 'guide-jonah-3-pm';

-- Past the end of the schedule. A series that runs longer than the plan beside
-- it is an ordinary thing, and 0004 constrains current_week to the length of
-- the plan, so this has to clamp rather than fail the write. Home holds on the
-- last week for the same reason.

insert into public.guides (id, series_id, subtitle, preached_on, published)
values ('guide-jonah-4', 'series-jonah', 'The heart behind it', '2026-10-04', true),
       ('guide-jonah-5', 'series-jonah', 'One more Sunday',     '2026-10-11', true);

select t_check('a series longer than its plan holds on the last week',
  (select current_week || ' of ' || total_weeks
     from public.reading_plans where id = 'plan-jonah'), '4 of 4');

select t_check('and falls back to this_week for a week the schedule has not got',
  (select reading from public.hc_reading_plan_follow_series('series-jonah')),
  'Jonah 1:1 to 10');

-- Put the plan back where the rest of this file left it. A delete is the one
-- thing the trigger does not listen for, so ask directly.
delete from public.guides where id in ('guide-jonah-4', 'guide-jonah-5');
select * from public.hc_reading_plan_follow_series('series-jonah');

select t_check('and the plan is back on the last sermon still published',
  (select starts_on::text || ', week ' || current_week
     from public.reading_plans where id = 'plan-jonah'),
  '2026-09-13, week 3');


-- ------------------------------------------------ and only where invited ---
-- Every plan in the table until somebody opts one in. A plan with no series on
-- it counts days off the calendar exactly as 0024 built it to, and no guide
-- being published anywhere touches it.

update public.reading_plans set starts_on = '2026-01-04', series_id = null
 where id = 'plan-test';

insert into public.guides (id, series_id, subtitle, preached_on, published)
values ('guide-david-1', 'series-david', 'A shepherd', '2026-10-04', true);

select t_check('a plan with no series is left alone',
  (select starts_on::text from public.reading_plans where id = 'plan-test'),
  '2026-01-04');

select t_check('a plan whose series is not the current one is left alone',
  (select starts_on::text from public.reading_plans where id = 'plan-jonah'),
  '2026-09-13');

select t_check('a series no plan follows is not an error, it is no rows',
  (select count(*)::int from public.hc_reading_plan_follow_series('series-david')), 0);

select t_check('and neither is a series that does not exist',
  (select count(*)::int from public.hc_reading_plan_follow_series('series-nothing')), 0);

-- A guide belonging to no series at all, which the seed catalogue is full of,
-- must not reach for a plan or raise on the way past. ON_ERROR_STOP is on, so
-- the statement running at all is half the assertion.
update public.guides set published = true where id = 'guide-test';

select t_check('a guide belonging to no series publishes without complaint',
  (select starts_on::text from public.reading_plans where id = 'plan-jonah'),
  '2026-09-13');


-- ------------------------------------------------------- and only when asked ---
-- The trigger listens to three columns and not to the table. Rewording a
-- guide's subtitle is the commonest write this table takes and it has nothing
-- to say about which week it is, so it should not reach the reading plan at
-- all. Asserted against the catalog, because the difference between listening
-- to three columns and listening to all of them is invisible from the outside
-- until the day the two disagree.

select t_check('the trigger listens to three columns, not to the table',
  (select count(*)::int from pg_trigger t
     join pg_attribute a
       on a.attrelid = t.tgrelid and a.attnum = any (t.tgattr)
    where t.tgrelid = 'public.guides'::regclass
      and t.tgname = 'guides_advance_reading_plan'
      and a.attname in ('series_id', 'preached_on', 'published')), 3);

select t_check('and to nothing else',
  (select array_length(t.tgattr, 1) from pg_trigger t
    where t.tgrelid = 'public.guides'::regclass
      and t.tgname = 'guides_advance_reading_plan'), 3);


-- --------------------------------------------------- and from an admin phone ---
-- 0031 gives an admin phone three columns of this table and none of the ones
-- 0055 writes, and that stays true: the plan moves because a sermon was
-- published, never because somebody typed a date.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';

  update public.guides set subtitle = 'The second chance, again'
   where id = 'guide-jonah-3';

  select t_check('an admin rewording a guide saves',
    (select subtitle from public.guides where id = 'guide-jonah-3'),
    'The second chance, again');

  select t_raises('and cannot move the plan by hand',
    $$update public.reading_plans set starts_on = '2020-01-01' where id = 'plan-jonah'$$,
    '42501');

  select t_raises('or point a plan at a different series',
    $$update public.reading_plans set series_id = 'series-david' where id = 'plan-jonah'$$,
    '42501');
commit;

select t_check('the plan is where the sermons left it',
  (select starts_on::text from public.reading_plans where id = 'plan-jonah'),
  '2026-09-13');
