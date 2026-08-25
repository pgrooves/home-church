-- ===========================================================================
-- The reading advances with the week.
--
-- The bug 0032 fixes was not a crash, it was a screen that looked right: the
-- week number moved and the reading under it did not. So the questions here
-- are the ones whose wrong answers are silent. Does the column hold a real
-- array. Does the fallback stay untouched for a plan that has no schedule yet,
-- which is every plan in a project that has not written one. And can an admin
-- phone write one week without also being able to rewrite the plan.
--
-- The arithmetic that picks weeks[n] lives in the client and is asserted in
-- tests/reading-plan.test.js. Postgres stores the list; Home indexes it.
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
  ('ee000000-0000-0000-0000-000000000001', 'padmin@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ee000000-0000-0000-0000-000000000001', 'Ada')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ee000000-0000-0000-0000-000000000001';


-- ------------------------------------------------------------- the column ---

select t_check('a plan with no schedule starts empty rather than null',
  (select jsonb_array_length(weeks) from public.reading_plans where id = 'plan-test'), 0);

-- Not compared against a literal: 0031's test rewords this row as an admin,
-- and every file here runs against the same database in order. What 0032
-- promises about this column is that it is still there with the church's
-- words in it, which is what a plan with no schedule falls back to.
select t_check('and keeps the fallback the app has always drawn',
  (select this_week is not null and this_week <> ''
     from public.reading_plans where id = 'plan-test'), true);

select t_raises('the column refuses anything that is not an array',
  $$update public.reading_plans set weeks = '"Matthew 1"'::jsonb where id = 'plan-test'$$,
  '23514');

select t_raises('including null, which would be a third state for Home to handle',
  $$update public.reading_plans set weeks = null where id = 'plan-test'$$,
  '23502');


-- --------------------------------------------------- an admin writes a week ---
-- The whole array goes back on every save, which is the trade section 2 of the
-- migration names. What matters here is that the other nineteen weeks survive
-- the round trip, because the bug that would not survive review is the one
-- where fixing week 3 quietly empties weeks 4 to 20.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';

  update public.reading_plans
     set weeks = '["Matthew 1 to 4", "Matthew 5 to 9", "Matthew 10 to 13"]'::jsonb
   where id = 'plan-test';

  select t_check('an admin writes the schedule',
    (select jsonb_array_length(weeks) from public.reading_plans where id = 'plan-test'), 3);

  update public.reading_plans
     set weeks = jsonb_set(weeks, '{1}', '"Matthew 5 to 7, and 8"')
   where id = 'plan-test';

  select t_check('and rewords one week of it',
    (select weeks->>1 from public.reading_plans where id = 'plan-test'),
    'Matthew 5 to 7, and 8');

  select t_check('without disturbing the weeks either side',
    (select (weeks->>0) || ' | ' || (weeks->>2) from public.reading_plans where id = 'plan-test'),
    'Matthew 1 to 4 | Matthew 10 to 13');

  select t_raises('and still cannot change how long the plan runs',
    $$update public.reading_plans set total_weeks = 3 where id = 'plan-test'$$,
    '42501');
commit;
