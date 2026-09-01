-- ===========================================================================
-- An announcement that is also a date in the calendar.
--
-- WHAT IS WORTH TESTING. The promise this feature makes is that nothing the
-- robot writes is visible until a person approves it, and 0040 is the first
-- migration where that promise covers two tables at once. So:
--
--   the pair is invisible   an unapproved announcement AND its event are both
--                           hidden from a signed out phone. The event is the
--                           new half and the easy one to get wrong, because it
--                           lands on a screen the review queue does not show.
--
--   the pair moves together  approving publishes both, in one transaction. A
--                           card on Home promising a date the Connect tab does
--                           not have is the failure this replaced two PATCHes
--                           to avoid.
--
--   discarding cleans up    the announcement stays as a draft and the event
--                           goes, because an unpublished event is on no screen
--                           in this app and nobody could ever tidy it by hand.
--
--   admins can still see    the review card has to say "this also adds an
--                           event", and 0040 widens the events select policy
--                           so it can. That widening is the one thing here
--                           that could leak, so it is checked from all three
--                           roles rather than assumed.
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
  ('ff000000-0000-0000-0000-000000000001', 'eadmin@example.com'),
  ('ff000000-0000-0000-0000-000000000002', 'email@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ff000000-0000-0000-0000-000000000001', 'Ada'),
  ('ff000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ff000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ff000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'evt-test-%';
delete from public.events        where id like 'evt-test-%';

-- ------------------------------------------------- what the intake writes ---

begin;
  set local role service_role;

  insert into public.events (id, title, starts_at, location, published)
  values ('evt-test-homecoming', 'Homecoming, October 23',
          '2026-10-23T18:00:00-05:00', 'The building', false);

  insert into public.announcements (id, title, published, review_state, source, event_id)
  values ('evt-test-announce', 'Homecoming, October 23',
          false, 'pending', 'newsletter', 'evt-test-homecoming');

  select t_check('the pair is written unpublished',
    (select bool_or(published) from public.events where id = 'evt-test-homecoming'), false);

  select t_check('and the announcement points at the event',
    (select event_id from public.announcements where id = 'evt-test-announce'),
    'evt-test-homecoming');
commit;

-- --------------------------------------------------------------- as anon ---
-- The role the app's content sync runs as. If the event reaches this query
-- then Connect has a calendar entry for something nobody approved.

begin;
  set local role anon;

  select t_check('a signed out phone cannot see the unapproved event',
    (select count(*)::int from public.events where id = 'evt-test-homecoming'), 0);

  select t_check('nor the announcement',
    (select count(*)::int from public.announcements where id = 'evt-test-announce'), 0);
commit;

-- ------------------------------------------------------------ as a member ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000002"}';

  select t_check('a member cannot see it either',
    (select count(*)::int from public.events where id = 'evt-test-homecoming'), 0);

  -- The write path stays exactly as closed as 0001 left it. 0040 widened the
  -- read and nothing else, and this is what says so.
  select t_check('and no client role may write events',
    (select bool_or(has_table_privilege(r.role, 'public.events', p.priv))
       from unnest(array['anon', 'authenticated']) as r(role),
            unnest(array['INSERT', 'UPDATE', 'DELETE']) as p(priv)),
    false);
commit;

-- ------------------------------------------------------------ as an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';

  select t_check('an admin can see the unapproved event, so the card can say so',
    (select count(*)::int from public.events where id = 'evt-test-homecoming'), 1);
commit;

-- ------------------------------------------------------------- approving ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_approve_announcement('evt-test-announce');
  raise warning 'FAIL  a member cannot approve';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot approve';
end
$$;

reset role;

select t_check('so nothing moved',
  (select published from public.events where id = 'evt-test-homecoming'), false);

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_approve_announcement('evt-test-announce');
  raise notice 'PASS  an admin can approve';
exception when others then
  raise warning 'FAIL  an admin can approve (%)', sqlerrm;
end
$$;

reset role;

select t_check('the announcement is on Home',
  (select published from public.announcements where id = 'evt-test-announce'), true);

select t_check('and the event went with it, in the same breath',
  (select published from public.events where id = 'evt-test-homecoming'), true);

select t_check('and it left the review queue',
  (select review_state from public.announcements where id = 'evt-test-announce'), 'approved');

-- Now a signed out phone can see both, which is the whole point of approving.
begin;
  set local role anon;
  select t_check('a signed out phone now gets the calendar entry',
    (select count(*)::int from public.events where id = 'evt-test-homecoming'), 1);
commit;

-- ------------------------------------------------------------- discarding ---

begin;
  set local role service_role;
  insert into public.events (id, title, starts_at, published)
  values ('evt-test-gone', 'Something else', '2026-11-01T18:00:00-05:00', false);
  insert into public.announcements (id, title, published, review_state, source, event_id)
  values ('evt-test-drop', 'Something else', false, 'pending', 'newsletter', 'evt-test-gone');
commit;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_discard_announcement('evt-test-drop');
  raise notice 'PASS  an admin can discard';
exception when others then
  raise warning 'FAIL  an admin can discard (%)', sqlerrm;
end
$$;

reset role;

select t_check('the announcement stays, as a draft in the Posted list',
  (select review_state from public.announcements where id = 'evt-test-drop'), 'discarded');

select t_check('and it is not published',
  (select published from public.announcements where id = 'evt-test-drop'), false);

/* The event is gone rather than orphaned. Nothing in this app draws an
   unpublished event, so one left behind is a row nobody could ever find. */
select t_check('but the event it would have made is gone',
  (select count(*)::int from public.events where id = 'evt-test-gone'), 0);

select t_check('and the announcement no longer points at anything',
  (select event_id from public.announcements where id = 'evt-test-drop'), null);

-- --------------------------------------------- an announcement with no date ---
-- The ordinary case, and it must not have been broken by any of the above.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';

  insert into public.announcements (id, title, review_state, published, source)
  values ('evt-test-plain', 'Kids volunteers needed', 'pending', false, 'newsletter');
commit;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_approve_announcement('evt-test-plain');
  raise notice 'PASS  an announcement with no event approves fine';
exception when others then
  raise warning 'FAIL  an announcement with no event approves fine (%)', sqlerrm;
end
$$;

reset role;

select t_check('and goes up with no event attached',
  (select published and event_id is null
     from public.announcements where id = 'evt-test-plain'), true);

-- --------------------------------------------------------- a missing row ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_approve_announcement('evt-test-nope');
  raise warning 'FAIL  approving something that is not there says so';
exception
  when insufficient_privilege then
    raise warning 'FAIL  approving something that is not there says so (refused as admin)';
  when others then
    raise notice 'PASS  approving something that is not there says so';
end
$$;

reset role;

delete from public.announcements where id like 'evt-test-%';
delete from public.events        where id like 'evt-test-%';
