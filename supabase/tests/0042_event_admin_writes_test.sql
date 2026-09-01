-- ===========================================================================
-- An admin can keep the calendar.
--
-- WHAT IS WORTH TESTING. 0042 is the first thing in this project that writes
-- an event from a session, so the assertions are about the boundary rather
-- than about the feature:
--
--   only an admin        both functions raise for a member, and the row does
--                        not move. The screen decides whether to draw the
--                        buttons; this decides whether they do anything.
--
--   still no policy      an admin holding a session cannot insert, update or
--                        delete an events row directly. That was true before
--                        0042 and adding two functions must not have widened
--                        it, which is the exact thing 0040's test checked and
--                        the exact thing a stray `grant` would break.
--
--   the columns it       an edit made on a phone writes six columns and
--   leaves alone         leaves signup_url, category, published and
--                        review_state where they were. This is the assertion
--                        that fails the day somebody "simplifies" the update
--                        into a whole-row upsert, and the damage that would
--                        do is invisible: an event that quietly loses its
--                        signup link the first time a typo is fixed.
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
  ('ac000000-0000-0000-0000-000000000001', 'caladmin@example.com'),
  ('ac000000-0000-0000-0000-000000000002', 'calmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ac000000-0000-0000-0000-000000000001', 'Ada'),
  ('ac000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ac000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ac000000-0000-0000-0000-000000000002';

delete from public.events where id like 'event-cal-test%';
delete from public.events where id like 'cal-test-%';

-- ------------------------------------------------------------- writing one ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_save_event(null, 'Cal Test Night',
    '2026-11-04T18:00:00-06:00', null, 'The Loft', 'Come and see.');
  raise warning 'FAIL  a member cannot write an event';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot write an event';
end
$$;

reset role;

select t_check('and nothing was written',
  (select count(*)::int from public.events where title = 'Cal Test Night'), 0);

do $$
declare v_id text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  v_id := public.hc_admin_save_event(null, 'Cal Test Night',
    '2026-11-04T18:00:00-06:00', null, 'The Loft', 'Come and see.');
  if v_id = 'event-cal-test-night' then
    raise notice 'PASS  an admin writes one, named after what it is';
  else
    raise warning 'FAIL  an admin writes one, named after what it is (got %)', v_id;
  end if;
end
$$;

reset role;

select t_check('and it is on the calendar the moment it is written',
  (select published from public.events where id = 'event-cal-test-night'), true);

/* Written by a person, so it carries no review state. An event that arrived
   here pending would be a date in a queue nobody is looking at. */
select t_check('with no review state on it',
  (select review_state from public.events where id = 'event-cal-test-night'), null);

-- The second one with the same name. The slug is taken, so it takes a number
-- rather than failing on a primary key nobody outside the function knows about.
do $$
declare v_id text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  v_id := public.hc_admin_save_event(null, 'Cal Test Night',
    '2027-11-04T18:00:00-06:00', 'All three services', null, null);
  if v_id = 'event-cal-test-night-2' then
    raise notice 'PASS  next year''s gets its own id';
  else
    raise warning 'FAIL  next year''s gets its own id (got %)', v_id;
  end if;
end
$$;

reset role;

-- An empty location and an empty description are null rather than '', so the
-- app's "drop the line when there is nothing in it" reads one falsy value.
select t_check('an empty field is null and not an empty string',
  (select location is null and description is null
     from public.events where id = 'event-cal-test-night-2'), true);

-- ------------------------------------------------------- what it refuses ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_save_event(null, '   ', '2026-11-04T18:00:00-06:00',
    null, null, null);
  raise warning 'FAIL  an event with no title is refused';
exception
  when insufficient_privilege then
    raise warning 'FAIL  an event with no title is refused (wrong refusal)';
  when others then
    raise notice 'PASS  an event with no title is refused';
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_save_event('event-not-here', 'Ghost',
    '2026-11-04T18:00:00-06:00', null, null, null);
  raise warning 'FAIL  editing a row that is gone raises rather than inserting';
exception
  when insufficient_privilege then
    raise warning 'FAIL  editing a row that is gone raises (wrong refusal)';
  when others then
    raise notice 'PASS  editing a row that is gone raises rather than inserting';
end
$$;

reset role;

select t_check('so no second row appeared',
  (select count(*)::int from public.events where id = 'event-not-here'), 0);

-- --------------------------------------------- what an edit leaves alone ---

begin;
  set local role service_role;
  update public.events
     set signup_url = 'https://homechurchnola.churchcenter.com/x',
         category   = 'serve'
   where id = 'event-cal-test-night';
commit;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_save_event('event-cal-test-night', 'Cal Test Evening',
    '2026-11-04T19:00:00-06:00', 'Doors at six thirty', 'The Loft, upstairs',
    'Come and see. Bring somebody.');
end
$$;

reset role;

select t_check('an edit writes the six columns it was given',
  (select title = 'Cal Test Evening'
      and time_label = 'Doors at six thirty'
      and location = 'The Loft, upstairs'
     from public.events where id = 'event-cal-test-night'), true);

select t_check('and leaves the signup link alone',
  (select signup_url from public.events where id = 'event-cal-test-night'),
  'https://homechurchnola.churchcenter.com/x');

select t_check('and the category with it',
  (select category from public.events where id = 'event-cal-test-night'), 'serve');

-- --------------------------------------------------------- taking one down ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_delete_event('event-cal-test-night');
  raise warning 'FAIL  a member cannot delete an event';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot delete an event';
end
$$;

reset role;

select t_check('so it is still there',
  (select count(*)::int from public.events where id = 'event-cal-test-night'), 1);

/* The announcement half. 0040 hung announcements.event_id off this table with
   `on delete set null`, so a deleted date takes the Add to calendar button off
   the card it belonged to and nothing else. */
begin;
  set local role service_role;
  insert into public.announcements (id, title, published, source, event_id)
  values ('cal-test-announce', 'Cal Test Evening', true, 'admin',
          'event-cal-test-night')
  on conflict (id) do update set event_id = excluded.event_id;
commit;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_delete_event('event-cal-test-night');
  raise notice 'PASS  an admin can take one down';
exception when others then
  raise warning 'FAIL  an admin can take one down (%)', sqlerrm;
end
$$;

reset role;

select t_check('and it is gone',
  (select count(*)::int from public.events where id = 'event-cal-test-night'), 0);

select t_check('the announcement it belonged to keeps its words',
  (select published from public.announcements where id = 'cal-test-announce'), true);

select t_check('minus its Add to calendar button',
  (select event_id from public.announcements where id = 'cal-test-announce'), null);

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_delete_event('event-cal-test-night');
  raise warning 'FAIL  deleting the same one twice raises';
exception
  when insufficient_privilege then
    raise warning 'FAIL  deleting the same one twice raises (wrong refusal)';
  when others then
    raise notice 'PASS  deleting the same one twice raises';
end
$$;

reset role;

-- ------------------------------------------------- and still no write policy ---
-- The property 0026, 0040 and 0041 each restated. Two functions are the whole
-- of what a session can do to this table; the table itself is as closed as it
-- was before this migration.

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  insert into public.events (id, title, starts_at)
  values ('cal-test-direct', 'Straight in', now());
  raise warning 'FAIL  an admin still cannot insert an event directly';
exception when others then
  raise notice 'PASS  an admin still cannot insert an event directly';
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  update public.events set title = 'Renamed' where id = 'event-cal-test-night-2';
  if found then
    raise warning 'FAIL  an admin still cannot update an event directly';
  else
    raise notice 'PASS  an admin still cannot update an event directly';
  end if;
exception when others then
  raise notice 'PASS  an admin still cannot update an event directly';
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  delete from public.events where id = 'event-cal-test-night-2';
  if found then
    raise warning 'FAIL  an admin still cannot delete an event directly';
  else
    raise notice 'PASS  an admin still cannot delete an event directly';
  end if;
exception when others then
  raise notice 'PASS  an admin still cannot delete an event directly';
end
$$;

reset role;

select t_check('the row that survived all of that is still there',
  (select count(*)::int from public.events where id = 'event-cal-test-night-2'), 1);

-- ------------------------------------------------------------------ tidy up ---

delete from public.announcements where id = 'cal-test-announce';
delete from public.events where id like 'event-cal-test%';
