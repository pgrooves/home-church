-- ===========================================================================
-- Catching the duplicate before it reaches the calendar, rather than after.
--
-- WHAT IS WORTH TESTING. 0052's test covers what a merge does. This one covers
-- the three things that decide whether a merge is ever offered in time:
--
--   the words    what counts as a word two titles share. Get this wrong in
--                one direction and every October event pairs with every other
--                October event; wrong in the other and "Ladies Night" never
--                meets "Women's Night", which is the pair this exists for.
--
--   the guard    fires on the second event, points the right way round, and
--                never re-raises a pair somebody has already settled.
--
--   the refusal  Approve will not publish a flagged date, asserted as a real
--                admin rather than read off the function and believed. The
--                screen already hides the button; this is the half that holds
--                when the screen is stale, or is curl.
--
-- AND ONE THING THAT MUST NEVER BE TRUE: that any of this can stop an event
-- being written. The harness has no pg_net and no vault, so the tick fired by
-- the insert trigger genuinely fails here — which makes this file the honest
-- test of that wrapper rather than a hypothetical one.
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

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'gadmin@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ad000000-0000-0000-0000-000000000001', 'Ada')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ad000000-0000-0000-0000-000000000001';

delete from public.events where id like 'test-guard-%';

-- --------------------------------------------------------------- the words ---

select t_check('a title keeps the words that say which night it is',
  public.hc_event_words('Homecoming Gala, October 23'),
  array['gala','homecoming']);

select t_check('the month goes, or every October event pairs with every other',
  public.hc_event_words('Homecoming, October 23'),
  array['homecoming']);

select t_check('and the possessive left behind by splitting Women''s',
  public.hc_event_words('Women''s Night, September 11'),
  array['night','women']);

select t_check('the pair this was written for shares a word',
  public.hc_event_words('Ladies Night, September 11')
    && public.hc_event_words('Women''s Night, September 11'), true);

select t_check('and so does the other one',
  public.hc_event_words('Homecoming, October 23')
    && public.hc_event_words('Homecoming Gala, October 23'), true);

/* The false pair this is shaped to avoid. Two real things on one evening that
   share a date, an audience and the word "night" would be a bad flag; they
   share neither of the words that matter. */
select t_check('two different things on one night share nothing',
  public.hc_event_words('Men''s Breakfast, September 11')
    && public.hc_event_words('Women''s Night, September 11'), false);

select t_check('a title of nothing but a date has no words at all',
  public.hc_event_words('October 23'), '{}'::text[]);

-- --------------------------------------------------------------- the guard ---

-- The night the church already has, on the calendar. 6:30pm in Chicago, which
-- is the next day in UTC and is exactly why the guard compares church days.
insert into public.events (id, title, starts_at, published, review_state, created_at)
values ('test-guard-keep', 'Ladies Night, September 11',
        '2030-09-12 00:30:00+00', true, 'approved', now() - interval '3 days');

-- The same night, parsed out of a later newsletter under the other name and
-- waiting in the queue.
insert into public.events (id, title, starts_at, published, review_state)
values ('test-guard-copy', 'Women''s Night, September 11',
        '2030-09-11 23:00:00+00', false, 'pending');

select t_check('the second one is flagged the moment it is written',
  (select duplicate_of from public.events where id = 'test-guard-copy'),
  'test-guard-keep');

select t_check('with a note saying nobody has looked properly yet',
  (select duplicate_note is not null and dedupe_checked_at is null
     from public.events where id = 'test-guard-copy'), true);

select t_check('and the one already on the calendar is untouched',
  (select duplicate_of is null from public.events where id = 'test-guard-keep'), true);

-- The whole point of comparing in America/Chicago: both of the rows above are
-- the evening of the 11th there, and land on two different dates in UTC.
select t_check('the two are one day in the church''s timezone',
  (select count(distinct (starts_at at time zone 'America/Chicago')::date)::int
     from public.events where id like 'test-guard-%'), 1);

-- A different night with the same name is not a duplicate, however identical.
insert into public.events (id, title, starts_at, published, review_state)
values ('test-guard-next-month', 'Ladies Night, October 9',
        '2030-10-10 00:30:00+00', false, 'pending');

select t_check('the next one along is not a copy of this one',
  (select duplicate_of is null from public.events where id = 'test-guard-next-month'), true);

-- Same evening, nothing in common.
insert into public.events (id, title, starts_at, published, review_state)
values ('test-guard-other', 'Men''s Breakfast, September 11',
        '2030-09-11 23:00:00+00', false, 'pending');

select t_check('and neither is a different thing on the same evening',
  (select duplicate_of is null from public.events where id = 'test-guard-other'), true);

/* AN EVENT IS ALWAYS WRITABLE. Four inserts have now succeeded in a database
   with no pg_net and no vault, which means the tick fired by the statement
   trigger raised on every one of them and was swallowed. That is the wrapper
   doing its job, and it is the thing that would otherwise take the Cal tab and
   the newsletter intake down together. */
select t_check('every one of them was written, pass reachable or not',
  (select count(*)::int from public.events where id like 'test-guard-%'), 4);

-- ------------------------------------------------ what a person has settled ---

-- Keep both, on the pair the guard raised.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_keep_event_separate('test-guard-copy');
end
$$;

reset role;

select t_check('Keep both clears the flag and stamps the row',
  (select duplicate_of is null and dedupe_checked_at is not null
     from public.events where id = 'test-guard-copy'), true);

-- A third event on the same night, sharing a word with the row that was just
-- settled. The new row is fair game; the settled one must be left alone.
insert into public.events (id, title, starts_at, published, review_state)
values ('test-guard-third', 'Ladies Night Dessert, September 11',
        '2030-09-11 23:30:00+00', false, 'pending');

select t_check('a settled row is not dragged back into a new pair',
  (select duplicate_of is null and dedupe_checked_at is not null
     from public.events where id = 'test-guard-copy'), true);

select t_check('and the new one is flagged against the calendar''s own',
  (select duplicate_of from public.events where id = 'test-guard-third'),
  'test-guard-keep');

-- ------------------------------------------------------------- the refusal ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_approve_event('test-guard-third');
  raise warning 'FAIL  Approve refuses a date flagged as a copy';
exception when others then
  if sqlerrm like '%same night%' then
    raise notice 'PASS  Approve refuses a date flagged as a copy';
  else
    raise warning 'FAIL  Approve refuses a date flagged as a copy (said: %)', sqlerrm;
  end if;
end
$$;

reset role;

select t_check('and the date is still off the calendar',
  (select published = false and review_state = 'pending'
     from public.events where id = 'test-guard-third'), true);

-- The message has to name the other date, or the refusal is a dead end.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_approve_event('test-guard-third');
exception when others then
  if sqlerrm like '%Ladies Night, September 11%' then
    raise notice 'PASS  and says which date it is talking about';
  else
    raise warning 'FAIL  and says which date it is talking about (said: %)', sqlerrm;
  end if;
end
$$;

reset role;

-- One tap through it, either tap. Keep both, then Approve.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_keep_event_separate('test-guard-third');
  perform public.hc_admin_approve_event('test-guard-third');
end
$$;

reset role;

select t_check('Keep both is one tap through the refusal',
  (select published and review_state = 'approved'
     from public.events where id = 'test-guard-third'), true);

-- And an unflagged date approves exactly as it did before 0053.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_approve_event('test-guard-other');
end
$$;

reset role;

select t_check('an ordinary date is untouched by any of this',
  (select published and review_state = 'approved'
     from public.events where id = 'test-guard-other'), true);

select t_check('and it wrote down who approved it, as 0043 does',
  (select approved_by_name from public.review_approvals
    where kind = 'event' and row_id = 'test-guard-other'), 'Ada');

-- ------------------------------------------------------- nothing new is open ---
-- The trigger functions are not an API. Neither is callable by a session, and
-- the words function is harmless but is not granted either.

select t_check('the guard is not callable from a session',
  has_function_privilege('authenticated', 'public.hc_event_same_day_guard()', 'EXECUTE'), false);

select t_check('nor is the thing that wakes the pass',
  has_function_privilege('authenticated', 'public.hc_events_ask_dedupe()', 'EXECUTE'), false);

select t_check('nor the word splitter, which 0025''s test is the reason for',
  has_function_privilege('anon', 'public.hc_event_words(text)', 'EXECUTE'), false);

/* AND REVOKING THEM DID NOT STOP THEM FIRING, which is the half that would be
   a catastrophe to get wrong: a trigger the intake's own role cannot fire is
   an intake that cannot write an event at all. Postgres checks EXECUTE on a
   trigger function when the trigger is created rather than each time it runs,
   and this is that claim asserted as the role the newsletter actually uses
   rather than believed from the documentation. */
do $$
begin
  set local role service_role;
  insert into public.events (id, title, starts_at, published, review_state)
  values ('test-guard-intake', 'Ladies Night Supper, September 11',
          '2030-09-11 23:45:00+00', false, 'pending');
end
$$;

reset role;

select t_check('the intake''s own role can still write an event',
  (select count(*)::int from public.events where id = 'test-guard-intake'), 1);

select t_check('and the guard still fired for it',
  (select duplicate_of from public.events where id = 'test-guard-intake'),
  'test-guard-keep');
