-- ===========================================================================
-- The pinned announcement.
--
-- WHAT IS WORTH TESTING HERE, given that 0028 adds one boolean and everything
-- about who may write it was already settled in 0026. Two things:
--
--   the default   every row that existed before this migration has to answer
--                 "am I pinned" with no, without a backfill having guessed.
--                 A migration that left this nullable would put `undefined`
--                 into the app's flag, and the app draws a strip on truthy.
--
--   the boundary  the strip is the most insistent thing in the app, it is
--                 drawn from a column any signed in member can now name in a
--                 PATCH, and the only thing between them and a banner on
--                 every phone in the church is the admin policy from 0026.
--                 That claim is asserted here as a real member rather than
--                 read off the migration and believed.
--
-- Reading is not a separate question: the select policy from 0003 is row
-- level, so the column arrives with the rest of a published row. The anon
-- assertion below is what makes that concrete, because a signed out phone is
-- how most people will see the strip.
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
  ('cc000000-0000-0000-0000-000000000001', 'padmin@example.com'),
  ('cc000000-0000-0000-0000-000000000002', 'pmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('cc000000-0000-0000-0000-000000000001', 'Ada'),
  ('cc000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'cc000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'cc000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'pin-test-%';

-- ------------------------------------------------------------ the column ---

select t_check('the column exists and is not null',
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements'
      and column_name = 'pinned'), 'NO');

select t_check('and the partial index is there',
  (select count(*)::int from pg_indexes
    where schemaname = 'public' and indexname = 'announcements_pinned_idx'), 1);

-- ------------------------------------------------------------- as an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  -- An announcement written the way every announcement before 0028 was
  -- written: without mentioning this column at all.
  insert into public.announcements (id, title)
  values ('pin-test-quiet', 'Potluck after the second service');

  select t_check('an announcement is not pinned unless somebody says so',
    (select pinned from public.announcements where id = 'pin-test-quiet'), false);

  insert into public.announcements (id, title, pinned)
  values ('pin-test-loud', 'No gathering Sunday, the building is flooded', true);

  select t_check('an admin can pin one',
    (select pinned from public.announcements where id = 'pin-test-loud'), true);

  -- Unpinning is an ordinary edit, which is what makes the switch on the form
  -- a switch rather than a one-way door.
  update public.announcements set pinned = false where id = 'pin-test-loud';
  select t_check('and unpin it again',
    (select pinned from public.announcements where id = 'pin-test-loud'), false);
  update public.announcements set pinned = true where id = 'pin-test-loud';

  -- More than one is allowed on purpose: the app shows the top one. See the
  -- note in the migration about why a unique index is the worse answer.
  update public.announcements set pinned = true where id = 'pin-test-quiet';
  select t_check('two pinned rows is not an error',
    (select count(*)::int from public.announcements where pinned), 2);
  update public.announcements set pinned = false where id = 'pin-test-quiet';
commit;

-- --------------------------------------------------------------- as a member ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000002"}';

  select t_check('a member reads the flag on a published announcement',
    (select pinned from public.announcements where id = 'pin-test-loud'), true);

  /* No exception expected, and 0026's test file explains why at length: an
     UPDATE refused by a USING clause is a filter, not an error. The statement
     succeeds against zero visible rows. What has to be asserted is that
     nothing moved. */
  update public.announcements set pinned = true where id = 'pin-test-quiet';
  select t_check('but cannot pin an announcement',
    (select pinned from public.announcements where id = 'pin-test-quiet'), false);

  update public.announcements set pinned = false where id = 'pin-test-loud';
  select t_check('nor take the church''s banner down for everybody',
    (select pinned from public.announcements where id = 'pin-test-loud'), true);
commit;

-- ---------------------------------------------------------------- as anon ---
-- The signed out phone, which is how a good part of the congregation reads
-- Home. The strip has to reach it, which means the column has to come back
-- with the row.

begin;
  set local role anon;

  select t_check('signed out, the pinned announcement is readable',
    (select pinned from public.announcements where id = 'pin-test-loud'), true);
commit;

delete from public.announcements where id like 'pin-test-%';
