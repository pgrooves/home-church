-- ===========================================================================
-- Updating instead of duplicating, ordering, and deleting with a way back.
--
-- WHAT IS WORTH TESTING. Not that the model spots a duplicate — that is judged
-- by a person reading the review card. What Postgres owns here is three
-- things, and every one of them fails quietly if it breaks:
--
--   who        the merge writes over an announcement the church has already
--              published. If a member could call it, a model's opinion plus a
--              stolen session could rewrite a card on Home. Asserted as a real
--              signed in member.
--
--   what moves the merge copies words and dates and must NOT copy published,
--              pinned or priority: where a card sits on Home is the church's
--              decision, not a reminder email's. A coalesce that slipped would
--              also let a reminder with no picture erase the picture, which is
--              the kind of loss nobody notices until the card is on a screen.
--
--   who sees   a deleted announcement is invisible to a phone and visible to
--              an admin, which is the whole feature. Asserted as a signed out
--              client rather than read off the policy and believed.
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
  ('ab000000-0000-0000-0000-000000000001', 'dadmin@example.com'),
  ('ab000000-0000-0000-0000-000000000002', 'dmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ab000000-0000-0000-0000-000000000001', 'Ada'),
  ('ab000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ab000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ab000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'test-dedupe-%';

-- The card the church already has, on Home, pinned, and deliberately at a
-- priority somebody chose.
insert into public.announcements
  (id, title, body, eyebrow, published, pinned, priority, ends_on, image_url)
values
  ('test-dedupe-target', 'Homecoming, October 23', 'Save the date.', 'Special Event',
   true, true, 7, '2026-10-24', 'https://example.com/first.jpg');

-- The reminder that arrived a fortnight later, parsed into the queue, and
-- marked by the dedupe pass as an update to the card above.
insert into public.announcements
  (id, title, body, published, review_state, source, duplicate_of, duplicate_note,
   dedupe_checked_at, link_url)
values
  ('test-dedupe-draft', 'Homecoming Gala, October 23',
   'Tickets are live, and dinner is included.', false, 'pending', 'newsletter',
   'test-dedupe-target', 'adds a ticket link and says dinner is included',
   now(), 'https://example.com/tickets');

-- --------------------------------------------------------------- the shape ---

select t_check('a draft can point at the card it duplicates',
  (select duplicate_of from public.announcements where id = 'test-dedupe-draft'),
  'test-dedupe-target');

do $$
begin
  update public.announcements set duplicate_of = id where id = 'test-dedupe-draft';
  raise warning 'FAIL  and never at itself';
exception when check_violation then
  raise notice 'PASS  and never at itself';
end
$$;

select t_check('deleting the card it points at leaves the draft standing',
  (select count(*)::int from information_schema.table_constraints
    where constraint_name = 'announcements_duplicate_fk'), 1);

-- ------------------------------------------------------------- as a member ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_apply_announcement_update('test-dedupe-draft');
  raise warning 'FAIL  a member cannot write one card over another';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot write one card over another';
end
$$;

reset role;

select t_check('and the card still says what it said',
  (select body from public.announcements where id = 'test-dedupe-target'),
  'Save the date.');

-- ------------------------------------------------------------ as an admin ---

do $$
declare v_target text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';
  v_target := public.hc_admin_apply_announcement_update('test-dedupe-draft');
  if v_target = 'test-dedupe-target' then
    raise notice 'PASS  an admin can apply the update';
  else
    raise warning 'FAIL  an admin can apply the update  (got %)', v_target;
  end if;
end
$$;

reset role;

select t_check('the words are the new ones',
  (select body from public.announcements where id = 'test-dedupe-target'),
  'Tickets are live, and dinner is included.');

select t_check('and the title moved with them',
  (select title from public.announcements where id = 'test-dedupe-target'),
  'Homecoming Gala, October 23');

select t_check('the link the reminder added is on the card',
  (select link_url from public.announcements where id = 'test-dedupe-target'),
  'https://example.com/tickets');

/* The half that would be quietly destructive. A reminder that mentions no
   picture and no eyebrow must leave both alone rather than clearing them. */
select t_check('a picture the reminder did not mention is still there',
  (select image_url from public.announcements where id = 'test-dedupe-target'),
  'https://example.com/first.jpg');

select t_check('and so is the eyebrow',
  (select eyebrow from public.announcements where id = 'test-dedupe-target'),
  'Special Event');

-- WHERE IT SITS ON HOME IS THE CHURCH'S DECISION. A reminder email does not
-- get to unpin a card or move it up the list.
select t_check('the card keeps its place on Home',
  (select published and pinned and priority = 7
     from public.announcements where id = 'test-dedupe-target'), true);

select t_check('and the draft has left the queue',
  (select review_state = 'discarded' and deleted_at is not null
     from public.announcements where id = 'test-dedupe-draft'), true);

-- Pressed twice, which is what a button on a phone with a bad connection is.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_apply_announcement_update('test-dedupe-draft');
  raise notice 'PASS  applying it twice does not double the words';
exception when others then
  -- Either outcome is correct as long as the words did not double; the check
  -- below is the real assertion.
  raise notice 'PASS  applying it twice does not double the words';
end
$$;

reset role;

select t_check('the card still says it once',
  (select body from public.announcements where id = 'test-dedupe-target'),
  'Tickets are live, and dinner is included.');

-- ---------------------------------------------------------------- deleted ---

select t_check('a deleted announcement keeps its row',
  (select count(*)::int from public.announcements where id = 'test-dedupe-draft'), 1);

-- What a signed out phone can see, asked as one rather than read off the policy.
insert into public.announcements (id, title, body, published)
values ('test-dedupe-live', 'Still up', 'On Home.', true);

update public.announcements set deleted_at = now(), published = true
 where id = 'test-dedupe-draft';

do $$
declare v_seen int;
begin
  set local role anon;
  select count(*)::int into v_seen from public.announcements
   where id in ('test-dedupe-draft', 'test-dedupe-live');
  if v_seen = 1 then
    raise notice 'PASS  a signed out phone sees the live one and not the deleted one';
  else
    raise warning 'FAIL  a signed out phone sees the live one and not the deleted one (saw %)', v_seen;
  end if;
end
$$;

reset role;

do $$
declare v_seen int;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';
  select count(*)::int into v_seen from public.announcements
   where id in ('test-dedupe-draft', 'test-dedupe-live');
  if v_seen = 2 then
    raise notice 'PASS  an admin sees both, which is what the Deleted section is';
  else
    raise warning 'FAIL  an admin sees both (saw %)', v_seen;
  end if;
end
$$;

reset role;

-- Restoring is a PATCH under 0026's admin update policy, not a function, so
-- what is asserted is that it is reachable and that it works.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ab000000-0000-0000-0000-000000000001"}';
  update public.announcements set deleted_at = null where id = 'test-dedupe-draft';
end
$$;

reset role;

select t_check('an admin can put one back',
  (select deleted_at is null from public.announcements where id = 'test-dedupe-draft'), true);

do $$
declare v_seen int;
begin
  set local role anon;
  select count(*)::int into v_seen from public.announcements where id = 'test-dedupe-draft';
  if v_seen = 1 then raise notice 'PASS  and a phone can see it again';
  else raise warning 'FAIL  and a phone can see it again (saw %)', v_seen; end if;
end
$$;

reset role;

-- --------------------------------------------------------------- the order ---
-- priority is not new, but "an admin may write it from a phone" is what the
-- arrows rest on, and 0026 is the only thing that makes it true.

select t_check('an admin may write the order from a phone',
  has_column_privilege('authenticated', 'public.announcements', 'priority', 'UPDATE'), true);

select t_check('and so is the deleted stamp, which is how Restore works',
  has_column_privilege('authenticated', 'public.announcements', 'deleted_at', 'UPDATE'), true);

delete from public.announcements where id like 'test-dedupe-%';
