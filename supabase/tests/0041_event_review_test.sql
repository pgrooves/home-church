-- ===========================================================================
-- Events get their own approval.
--
-- WHAT IS WORTH TESTING. 0040's test proved the pair moved together. This
-- migration deliberately breaks that, so the assertions are the opposite ones:
--
--   they move APART      approving an announcement must no longer publish its
--                        event. If it still did, the second queue would be
--                        decoration and a date would reach the calendar on a
--                        tap that was about the wording.
--
--   the date is gated    an event reaches the Connect tab through
--                        hc_admin_approve_event and through nothing else, and
--                        a member cannot call it.
--
--   nothing else moved   events written by hand carry a null review_state and
--                        are published exactly as they always were. This is a
--                        queue for what a model wrote, not a new step in front
--                        of the church's own calendar.
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
  ('ab000000-0000-0000-0000-000000000001', 'evadmin@example.com'),
  ('ab000000-0000-0000-0000-000000000002', 'evmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ab000000-0000-0000-0000-000000000001', 'Ada'),
  ('ab000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ab000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ab000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'rev-test-%';
delete from public.events        where id like 'rev-test-%';

-- ------------------------------------------------------------- the column ---

select t_check('an unknown review_state is refused on events',
  (select count(*)::int from pg_constraint
    where conname = 'events_review_state_known'), 1);

select t_check('and the pending index is there',
  (select count(*)::int from pg_indexes
    where schemaname = 'public' and indexname = 'events_review_idx'), 1);

-- --------------------------------------------- what the intake now writes ---

begin;
  set local role service_role;

  insert into public.events (id, title, starts_at, published, review_state)
  values ('rev-test-event', 'Homecoming', '2026-10-23T18:00:00-05:00', false, 'pending');

  insert into public.announcements (id, title, published, review_state, source, event_id)
  values ('rev-test-announce', 'Homecoming', false, 'pending', 'newsletter', 'rev-test-event');
commit;

-- --------------------------------------------------------- they move apart ---
-- The assertion this migration exists for.

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_approve_announcement('rev-test-announce');
end
$$;

reset role;

select t_check('approving the announcement puts it on Home',
  (select published from public.announcements where id = 'rev-test-announce'), true);

select t_check('and does NOT put its date on the calendar',
  (select published from public.events where id = 'rev-test-event'), false);

select t_check('the date is still waiting',
  (select review_state from public.events where id = 'rev-test-event'), 'pending');

-- Still invisible to the app, which is the whole point of it still waiting.
begin;
  set local role anon;
  select t_check('so a signed out phone still cannot see the date',
    (select count(*)::int from public.events where id = 'rev-test-event'), 0);
commit;

-- ------------------------------------------------------- approving the date ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_approve_event('rev-test-event');
  raise warning 'FAIL  a member cannot approve a date';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot approve a date';
end
$$;

reset role;

select t_check('so it did not move',
  (select published from public.events where id = 'rev-test-event'), false);

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_approve_event('rev-test-event');
  raise notice 'PASS  an admin can approve a date';
exception when others then
  raise warning 'FAIL  an admin can approve a date (%)', sqlerrm;
end
$$;

reset role;

select t_check('and now it is on the calendar',
  (select published and review_state = 'approved'
     from public.events where id = 'rev-test-event'), true);

begin;
  set local role anon;
  select t_check('where a signed out phone can finally see it',
    (select count(*)::int from public.events where id = 'rev-test-event'), 1);
commit;

-- ------------------------------------------------------ discarding a date ---

begin;
  set local role service_role;
  insert into public.events (id, title, starts_at, published, review_state)
  values ('rev-test-drop', 'Wrong date', '2026-12-01T18:00:00-06:00', false, 'pending');
  insert into public.announcements (id, title, published, review_state, source, event_id)
  values ('rev-test-keep', 'Wrong date', true, 'approved', 'newsletter', 'rev-test-drop');
commit;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_discard_event('rev-test-drop');
  raise notice 'PASS  an admin can discard a date';
exception when others then
  raise warning 'FAIL  an admin can discard a date (%)', sqlerrm;
end
$$;

reset role;

select t_check('the date is gone rather than marked',
  (select count(*)::int from public.events where id = 'rev-test-drop'), 0);

/* The announcement survives with everything except its calendar button. Losing
   a date somebody rejected is the intended outcome; losing the announcement
   with it would not be. */
select t_check('the announcement it belonged to is untouched',
  (select published from public.announcements where id = 'rev-test-keep'), true);

select t_check('minus its Add to calendar button',
  (select event_id from public.announcements where id = 'rev-test-keep'), null);

-- An approved date is not discardable: it is on the calendar and coming down
-- is a deliberate delete, not a queue action.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_discard_event('rev-test-event');
  raise warning 'FAIL  a date already on the calendar is not discardable';
exception
  when insufficient_privilege then
    raise warning 'FAIL  a date already on the calendar is not discardable (wrong refusal)';
  when others then
    raise notice 'PASS  a date already on the calendar is not discardable';
end
$$;

reset role;

-- ------------------------------------------- the church's own events ---
-- Written by hand or by a slash command, with no review_state. They must be
-- published on arrival exactly as they were before this migration.

begin;
  set local role service_role;
  insert into public.events (id, title, starts_at)
  values ('rev-test-byhand', 'Sunday gathering', '2026-09-06T10:00:00-05:00');
commit;

select t_check('an event written by hand has no review state',
  (select review_state from public.events where id = 'rev-test-byhand'), null);

select t_check('and is published, exactly as before 0041',
  (select published from public.events where id = 'rev-test-byhand'), true);

begin;
  set local role anon;
  select t_check('and a signed out phone sees it straight away',
    (select count(*)::int from public.events where id = 'rev-test-byhand'), 1);
commit;

-- ---------------------------------------------------------------- grants ---

select t_check('anon cannot approve a date',
  has_function_privilege('anon', 'public.hc_admin_approve_event(text)', 'EXECUTE'), false);

select t_check('and events still take no writes from any client role',
  (select bool_or(has_table_privilege(r.role, 'public.events', p.priv))
     from unnest(array['anon', 'authenticated']) as r(role),
          unnest(array['INSERT', 'UPDATE', 'DELETE']) as p(priv)),
  false);

delete from public.announcements where id like 'rev-test-%';
delete from public.events        where id like 'rev-test-%';
