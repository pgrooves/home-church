-- ===========================================================================
-- The index that lets a host run the reveal without reading ahead.
--
-- Two things have to be true at once and they pull against each other: the
-- host must know that Priya has answered, and must not be able to find out
-- what she said. Every check below is one or the other.
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
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ihost@example.com'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'imem1@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'imem2@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_host, terms_accepted_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Ida',   true,  now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Jonah', false, now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Kemi',  false, now())
  on conflict (id) do update set can_host = excluded.can_host,
                                 terms_accepted_at = excluded.terms_accepted_at;

create table if not exists t_idx (k text primary key, v text);
grant select, insert on t_idx to anon, authenticated;
delete from t_idx;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
  insert into t_idx select 'room', (public.hc_room_open(
    'g-index', 'A guide', 'Index', '[{"heading":"h","body":"A question"}]'::jsonb)).id::text;
commit;

insert into t_idx select 'code', code from public.group_rooms
 where id = (select v from t_idx where k = 'room')::uuid;
insert into t_idx select 'q', id::text from public.group_room_questions
 where room_id = (select v from t_idx where k = 'room')::uuid;

-- Two people answer. Nothing is opened.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
  select public.hc_room_join((select v from t_idx where k = 'code'));
  insert into t_idx select 'jonah', (public.hc_room_post(
    (select v from t_idx where k='room')::uuid, (select v from t_idx where k='q')::uuid,
    'answer', 'Jonah said a private thing.')).id::text;
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';
  select public.hc_room_join((select v from t_idx where k = 'code'));
  select public.hc_room_post((select v from t_idx where k='room')::uuid,
    (select v from t_idx where k='q')::uuid, 'answer', 'Kemi said one too.');
commit;

-- ------------------------------------------------------------- as the host
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

  -- The bug this migration exists for: before it, this was the only thing the
  -- host's screen could ask, and the answer was zero.
  select t_check('the host still cannot read a shut answer',
    (select count(*)::int from public.group_room_notes
      where room_id = (select v from t_idx where k='room')::uuid), 0);

  select t_check('but the index tells them two answers are in',
    (select count(*)::int from public.hc_room_answer_index(
      (select v from t_idx where k='room')::uuid)), 2);

  select t_check('and names both, which is what the desk draws',
    (select string_agg(author_name, ', ' order by author_name)
       from public.hc_room_answer_index((select v from t_idx where k='room')::uuid)),
    'Jonah, Kemi');

  select t_check('with both shown as shut',
    (select count(*)::int from public.hc_room_answer_index(
      (select v from t_idx where k='room')::uuid) where opened_at is null), 2);
commit;

-- The guarantee that makes the above safe. There is no body column on the
-- function at all, so this is not a promise about a select list.
select t_check('the index cannot return a body, because it has no such column',
  pg_get_function_result('public.hc_room_answer_index(uuid)'::regprocedure) like '%body%', false);

-- --------------------------------------------------------- as a member
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';

  select t_check('a member sees two rows as well, so they can be counted',
    (select count(*)::int from public.hc_room_answer_index(
      (select v from t_idx where k='room')::uuid)), 2);

  -- The line that matters for a member: they may know how many are in, and
  -- they may know their own is one of them, and that is all.
  select t_check('their own row carries their name',
    (select count(*)::int from public.hc_room_answer_index(
      (select v from t_idx where k='room')::uuid)
      where author_name = 'Jonah'), 1);
  select t_check('and somebody else''s shut answer is nameless to them',
    (select count(*)::int from public.hc_room_answer_index(
      (select v from t_idx where k='room')::uuid)
      where author_name is null and author_id is null), 1);
commit;

-- ------------------------------------------------------------ after a reveal
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
  select public.hc_room_open_answer((select v from t_idx where k='jonah')::uuid, true);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';
  select t_check('once it is open the room can read it',
    (select body from public.group_room_notes
      where id = (select v from t_idx where k='jonah')::uuid), 'Jonah said a private thing.');
  select t_check('and the index names them to everybody now',
    (select author_name from public.hc_room_answer_index(
      (select v from t_idx where k='room')::uuid)
      where id = (select v from t_idx where k='jonah')::uuid), 'Jonah');
commit;

-- ------------------------------------------------------------- outsiders
insert into auth.users (id, email) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'outsider@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Nobody') on conflict do nothing;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}';
  select t_check('somebody who is not in the room gets nothing at all',
    (select count(*)::int from public.hc_room_answer_index(
      (select v from t_idx where k='room')::uuid)), 0);
commit;

-- Blocking. Their writing is gone from the feed, and their chip is gone too,
-- or the block would be undone by the desk.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';
  select public.hc_room_block('cccccccc-cccc-cccc-cccc-cccccccccccc', true);
  select t_check('a blocked person is not in the index either',
    (select count(*)::int from public.hc_room_answer_index(
      (select v from t_idx where k='room')::uuid)), 1);
commit;

-- --------------------------------------------------------------- privileges
select t_check('anon cannot call it',
  has_function_privilege('anon', 'public.hc_room_answer_index(uuid)', 'EXECUTE'), false);
select t_check('somebody signed in can, and the function decides the rest',
  has_function_privilege('authenticated', 'public.hc_room_answer_index(uuid)', 'EXECUTE'), true);
