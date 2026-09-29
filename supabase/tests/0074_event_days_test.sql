-- ===========================================================================
-- One event on more than one day.
--
-- WHAT IS WORTH TESTING HERE. Not that a grid draws a thing twice — that is a
-- picture and js/screens/cal.js owns it. What Postgres owns is the promise the
-- column makes, and every way of breaking it is silent:
--
--   the list is clean      also_on never holds the day starts_at is already on,
--                          never holds a duplicate, never holds a null, and
--                          comes back in order. If any of those slips, the
--                          calendar draws one event on one day twice and
--                          nobody can tell why.
--
--   an old client cannot   the six argument save from 0042 is still callable by
--   erase what it cannot   a phone holding a cached copy of the app, and it
--   see                    must leave a two-Sunday class as a two-Sunday class.
--
--   a merge loses no day   two rows about one retreat, each knowing about a
--                          different night, come out as one retreat on both.
--                          A day lost in a merge is a night the church is
--                          quietly no longer meeting.
--
--   the guard can see      two events sharing any day, not just a first day,
--   every day              are still paired by the same-day guard from 0053.
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
  ('ad000000-0000-0000-0000-000000000001', 'dadmin@example.com'),
  ('ad000000-0000-0000-0000-000000000002', 'dmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ad000000-0000-0000-0000-000000000001', 'Ada'),
  ('ad000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ad000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ad000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'test-days-%';
delete from public.events        where id like 'test-days-%';
delete from public.events        where id like 'event-membership-class%';
delete from public.review_approvals where row_id like 'test-days-%';

-- --------------------------------------------------------------- the list ---

-- Half past six on the evening of Sunday 4 October 2026, church time, which is
-- the 4th in Metairie and the 4th in UTC either way at that hour. Written as
-- an offset rather than as a bare timestamp so the test says what it means.
select t_check('every day one event is on, first day first',
  public.hc_event_days('2026-10-04 18:30:00-05'::timestamptz,
                       array['2026-10-18','2026-10-11']::date[]),
  array['2026-10-04','2026-10-11','2026-10-18']::date[]);

select t_check('an event with no other days is one day',
  public.hc_event_days('2026-10-04 18:30:00-05'::timestamptz, null),
  array['2026-10-04']::date[]);

select t_check('the first day never lands in also_on',
  public.hc_event_also_on('2026-10-04 18:30:00-05'::timestamptz,
                          array['2026-10-04','2026-10-11']::date[]),
  array['2026-10-11']::date[]);

select t_check('nor does a day said twice',
  public.hc_event_also_on('2026-10-04 18:30:00-05'::timestamptz,
                          array['2026-10-11','2026-10-11']::date[]),
  array['2026-10-11']::date[]);

select t_check('and a list with nothing left in it is null, not an empty array',
  public.hc_event_also_on('2026-10-04 18:30:00-05'::timestamptz,
                          array['2026-10-04']::date[]),
  null::date[]);

/* Seven in the evening on the 4th is the 5th in UTC, and reading the day in
   UTC would put the two Sundays of a class on a Monday and a Sunday. The
   church clock is the only clock this column knows. */
select t_check('the day is the church''s day, not UTC''s',
  public.hc_event_days('2026-10-05 00:30:00+00'::timestamptz, null),
  array['2026-10-04']::date[]);

-- ----------------------------------------------------------- writing one ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_save_event(null, 'Members Only',
    '2026-10-04 18:30:00-05'::timestamptz, null, null, null,
    array['2026-10-11']::date[]);
  raise warning 'FAIL  a member cannot write an event with days on it';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot write an event with days on it';
end
$$;

reset role;

do $$
declare v_id text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  v_id := public.hc_admin_save_event(null, 'Membership Class',
    '2026-10-04 18:30:00-05'::timestamptz, null, 'The Loft, upstairs',
    'Two Sundays, one class.',
    array['2026-10-11','2026-10-04','2026-10-11']::date[]);
  if v_id = 'event-membership-class' then
    raise notice 'PASS  an admin can write a class that meets on two Sundays';
  else
    raise warning 'FAIL  an admin can write a class that meets on two Sundays  (got %)', v_id;
  end if;
end
$$;

reset role;

select t_check('the second Sunday is on it, once, and the first is not',
  (select also_on from public.events where id = 'event-membership-class'),
  array['2026-10-11']::date[]);

select t_check('and the event is on both days',
  (select public.hc_event_days(starts_at, also_on)
     from public.events where id = 'event-membership-class'),
  array['2026-10-04','2026-10-11']::date[]);

/* THE OLD CLIENT. A phone that has not reloaded since before this migration
   calls the six argument save by name, and it must not be able to take the
   second Sunday off a class it cannot see. Same promise 0042 already makes
   about signup_url, capacity and category. */
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_save_event('event-membership-class', 'Membership Class',
    '2026-10-04 18:30:00-05'::timestamptz, null, 'The Loft, upstairs',
    'Two Sundays, one class. Bring a pen.');
end
$$;

reset role;

select t_check('an old phone correcting the blurb keeps the second Sunday',
  (select also_on from public.events where id = 'event-membership-class'),
  array['2026-10-11']::date[]);

select t_check('and its correction landed',
  (select description from public.events where id = 'event-membership-class'),
  'Two Sundays, one class. Bring a pen.');

-- A day can be taken off, which is the other half of being able to add one.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_save_event('event-membership-class', 'Membership Class',
    '2026-10-04 18:30:00-05'::timestamptz, null, 'The Loft, upstairs',
    'Two Sundays, one class. Bring a pen.', '{}'::date[]);
end
$$;

reset role;

select t_check('a form that clears the list clears it',
  (select also_on from public.events where id = 'event-membership-class'), null::date[]);

-- Put it back, for the merge below.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_save_event('event-membership-class', 'Membership Class',
    '2026-10-04 18:30:00-05'::timestamptz, null, 'The Loft, upstairs',
    'Two Sundays, one class. Bring a pen.', array['2026-10-11']::date[]);
end
$$;

reset role;

do $$
begin
  update public.events
     set also_on = (select array_agg(('2026-01-01'::date + n)) from generate_series(1, 40) n)
   where id = 'event-membership-class';
  raise warning 'FAIL  a year of Tuesdays is refused rather than stored';
exception when check_violation then
  raise notice 'PASS  a year of Tuesdays is refused rather than stored';
end
$$;

-- ---------------------------------------------------------------- merging ---

/* The same class, entered again by somebody who only knew about the second
   Sunday, and flagged against the first. Merging must end with one class on
   both Sundays rather than one class on one. */
insert into public.events
  (id, title, starts_at, time_label, published, review_state, duplicate_of,
   duplicate_note, signup_url)
values
  ('test-days-copy', 'Membership Class', '2026-10-11 18:30:00-05'::timestamptz,
   null, false, 'pending', 'event-membership-class',
   'same class, this one names the second Sunday', 'https://example.com/class');

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_apply_event_update('test-days-copy');
end
$$;

reset role;

select t_check('merging leaves one class',
  (select count(*)::int from public.events
    where id like 'test-days-%' or id like 'event-membership-class%'), 1);

/* The start moved to the 11th, and that is 0052's rule rather than a surprise:
   the copy knew a real hour, so its date and time are the ones taken. What
   would be a bug is the 4th disappearing with it. */
select t_check('the first day is the one the copy vouched for',
  (select (starts_at at time zone 'America/Chicago')::date
     from public.events where id = 'event-membership-class'),
  '2026-10-11'::date);

select t_check('and still on both Sundays, because no day is lost in a merge',
  (select public.hc_event_days(starts_at, also_on)
     from public.events where id = 'event-membership-class'),
  array['2026-10-04','2026-10-11']::date[]);

select t_check('with the sign-up link the second row carried',
  (select signup_url from public.events where id = 'event-membership-class'),
  'https://example.com/class');

-- ------------------------------------------------------------- the guard ---

/* 0053 pairs two events on one day whose titles share a word. With multi-day
   events that has to mean any day either is on, or a retreat entered twice —
   once as the whole weekend and once as just the Saturday — walks past it.

   Written as service_role, which is the role the newsletter intake uses. */
delete from public.events where id like 'test-days-guard-%';

do $$
begin
  set local role service_role;
  insert into public.events (id, title, starts_at, also_on, published, review_state)
  values ('test-days-guard-weekend', 'Fall Retreat',
          '2026-11-06 17:00:00-06'::timestamptz,
          array['2026-11-07','2026-11-08']::date[], true, 'approved');
end
$$;

reset role;

do $$
begin
  set local role service_role;
  insert into public.events (id, title, starts_at, published, review_state)
  values ('test-days-guard-saturday', 'Fall Retreat Saturday',
          '2026-11-07 09:00:00-06'::timestamptz, false, 'pending');
end
$$;

reset role;

select t_check('a Saturday inside a weekend already on the calendar is flagged',
  (select duplicate_of from public.events where id = 'test-days-guard-saturday'),
  'test-days-guard-weekend');

select t_check('and the weekend the church already had is the one that stands',
  (select duplicate_of is null from public.events
    where id = 'test-days-guard-weekend'), true);

-- ---------------------------------------------------------------- tidying ---

delete from public.events where id like 'test-days-%';
delete from public.events where id like 'event-membership-class%';
delete from public.profiles where id in (
  'ad000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000002');
delete from auth.users where id in (
  'ad000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000002');
