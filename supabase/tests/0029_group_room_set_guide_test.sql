-- ===========================================================================
-- Pointing a live room at another guide.
--
-- Four things have to be true at once, and three of them are about what is
-- NOT destroyed: the carried questions are replaced, the host's own question
-- survives and lands at the bottom, the prayer requests survive, and nobody
-- but the host can do any of it.
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

create or replace function t_refuses(label text, sql text)
returns void language plpgsql as $$
begin
  execute sql;
  raise warning 'FAIL  % (it was allowed)', label;
exception when others then
  raise notice 'PASS  % (refused: %)', label, left(sqlerrm, 46);
end;
$$;

insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999', 'shost@example.com'),
  ('a9999999-9999-9999-9999-999999999999', 'smember@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_host, terms_accepted_at) values
  ('99999999-9999-9999-9999-999999999999', 'Sam',  true,  now()),
  ('a9999999-9999-9999-9999-999999999999', 'Tess', false, now())
  on conflict (id) do update set can_host = excluded.can_host,
                                 terms_accepted_at = excluded.terms_accepted_at;

create table if not exists t_swap (k text primary key, v text);
grant select, insert on t_swap to anon, authenticated;
delete from t_swap;

-- A room on last week's guide, with two questions from it.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999"}';
  insert into t_swap select 'room', (public.hc_room_open(
    'g-old', 'Last week', 'Swap',
    '[{"heading":"Getting started","body":"Old question one"},
      {"heading":"Getting started","body":"Old question two"}]'::jsonb)).id::text;
  -- And one of the host's own, which is the row that must outlive the swap.
  insert into t_swap select 'mine', (public.hc_room_add_question(
    (select v from t_swap where k='room')::uuid, 'Something I wanted to ask')).id::text;
commit;

insert into t_swap select 'code', code from public.group_rooms
 where id = (select v from t_swap where k = 'room')::uuid;
insert into t_swap select 'q1', id::text from public.group_room_questions
 where room_id = (select v from t_swap where k = 'room')::uuid
   and body = 'Old question one';

-- A member joins, answers, and leaves a prayer request.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"a9999999-9999-9999-9999-999999999999"}';
  select public.hc_room_join((select v from t_swap where k = 'code'));
  insert into t_swap select 'note', (public.hc_room_post(
    (select v from t_swap where k='room')::uuid,
    (select v from t_swap where k='q1')::uuid,
    'answer', 'What Tess said about the old question.')).id::text;
  insert into t_swap select 'prayer', (public.hc_room_post(
    (select v from t_swap where k='room')::uuid, null,
    'prayer', 'My sister, on Thursday.')).id::text;

  -- A member cannot move the room, however much they would like to.
  select t_refuses('a member cannot change the guide',
    'select public.hc_room_set_guide((select v from t_swap where k=''room'')::uuid,
       ''g-new'', ''This week'', ''[]''::jsonb)');
commit;

-- The host swaps it for this week's guide.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999"}';
  select public.hc_room_set_guide(
    (select v from t_swap where k='room')::uuid,
    'g-new', 'This week',
    '[{"heading":"Into it","body":"New question one"},
      {"heading":"Into it","body":"New question two"},
      {"heading":"Into it","body":"New question three"}]'::jsonb);

  select t_check('the room now names the new guide',
    (select guide_id from public.group_rooms
      where id = (select v from t_swap where k='room')::uuid), 'g-new');
  select t_check('and carries its title',
    (select guide_title from public.group_rooms
      where id = (select v from t_swap where k='room')::uuid), 'This week');

  select t_check('the old guide''s questions are gone',
    (select count(*)::int from public.group_room_questions
      where room_id = (select v from t_swap where k='room')::uuid
        and body like 'Old question%'), 0);
  select t_check('the new guide''s questions are in',
    (select count(*)::int from public.group_room_questions
      where room_id = (select v from t_swap where k='room')::uuid
        and added_by_host = false), 3);
  select t_check('with their headings',
    (select distinct heading from public.group_room_questions
      where room_id = (select v from t_swap where k='room')::uuid
        and added_by_host = false), 'Into it');

  -- The host's own question stays, and stays at the bottom.
  select t_check('the host''s own question survives',
    (select body from public.group_room_questions
      where id = (select v from t_swap where k='mine')::uuid),
    'Something I wanted to ask');
  select t_check('and is last in the list',
    (select body from public.group_room_questions
      where room_id = (select v from t_swap where k='room')::uuid
      order by sort_order desc, created_at desc limit 1),
    'Something I wanted to ask');

  -- The answer went with the question it answered. This is the cost, checked
  -- rather than hoped for: a row left behind here would turn up on the sheet
  -- at the end of the night under a guide nobody discussed.
  select t_check('the answer under the old question went with it',
    (select count(*)::int from public.group_room_notes
      where id = (select v from t_swap where k='note')::uuid), 0);

  -- The prayer requests did not, which is the point of them hanging off
  -- nothing.
  select t_check('the prayer request stayed',
    (select body from public.group_room_notes
      where id = (select v from t_swap where k='prayer')::uuid),
    'My sister, on Thursday.');

  -- Asking for the guide it is already on does nothing at all, rather than
  -- rebuilding the list and taking tonight's answers with it.
  select public.hc_room_set_guide(
    (select v from t_swap where k='room')::uuid,
    'g-new', 'This week', '[]'::jsonb);
  select t_check('setting the same guide again changes nothing',
    (select count(*)::int from public.group_room_questions
      where room_id = (select v from t_swap where k='room')::uuid), 4);
commit;

-- A closed room is a record, not a room.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999"}';
  select public.hc_room_close((select v from t_swap where k='room')::uuid);
  select t_refuses('a closed room cannot be repointed',
    'select public.hc_room_set_guide((select v from t_swap where k=''room'')::uuid,
       ''g-older'', ''Older'', ''[]''::jsonb)');
commit;

-- Privileges, the same question 0018 taught us to ask of every new function.
select t_check('anon cannot change a room''s guide',
  has_function_privilege('anon', 'public.hc_room_set_guide(uuid, text, text, jsonb)', 'EXECUTE'), false);
select t_check('a signed in person can call it',
  has_function_privilege('authenticated', 'public.hc_room_set_guide(uuid, text, text, jsonb)', 'EXECUTE'), true);
