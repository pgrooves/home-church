-- ===========================================================================
-- The test the whole feature rests on.
--
-- Not "does the screen hide it" but "does the row come back at all". Every
-- check below runs as a real role with a real JWT claim, the way PostgREST
-- runs a request, so what these selects return is exactly what a phone could
-- get by ignoring the app and asking the API directly.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function t_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then
    raise notice 'PASS  %', label;
  else
    raise warning 'FAIL  %  (got %, want %)', label, got, want;
  end if;
end;
$$;

-- Anything that should be refused, run through this so a raise is a pass.
create or replace function t_refuses(label text, sql text)
returns void language plpgsql as $$
begin
  execute sql;
  raise warning 'FAIL  % (it was allowed)', label;
exception when others then
  raise notice 'PASS  % (refused: %)', label, left(sqlerrm, 46);
end;
$$;

-- --------------------------------------------------------------- the people
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'trey@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'priya@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'marcus@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.profiles (id, first_name, can_host, terms_accepted_at) values
  ('11111111-1111-1111-1111-111111111111', 'Trey',     true,  now()),
  ('22222222-2222-2222-2222-222222222222', 'Priya',    false, now()),
  ('33333333-3333-3333-3333-333333333333', 'Marcus',   false, now()),
  ('44444444-4444-4444-4444-444444444444', 'Stranger', false, null);

\set trey     '''11111111-1111-1111-1111-111111111111'''
\set priya    '''22222222-2222-2222-2222-222222222222'''
\set marcus   '''33333333-3333-3333-3333-333333333333'''
\set stranger '''44444444-4444-4444-4444-444444444444'''

create table t_state (k text primary key, v text);
-- Scratch pad for ids, shared across the role switches below.
grant select, insert on t_state to anon, authenticated;

-- ------------------------------------------------------- a leader opens one
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into t_state
  select 'room', (public.hc_room_open(
    'guide-seat-table', 'The Table of Grace', 'Lakeview Thursday',
    '[{"heading":"Getting started","body":"When you hear the word grace, what comes to mind?"},
      {"heading":"Lo-debar","body":"What is your Lo-debar?"}]'::jsonb
  )).id::text;
commit;

insert into t_state select 'code', code from public.group_rooms limit 1;
insert into t_state select 'q1', id::text from public.group_room_questions order by sort_order limit 1;

select t_check('the room minted a six digit code',
             (select v ~ '^[0-9]{6}$' from t_state where k = 'code'), true);
select t_check('both questions came across from the guide',
             (select count(*)::int from public.group_room_questions), 2);

-- A person the church has not marked cannot open a room at all.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  select t_refuses('someone without can_host cannot open a room',
                 'select public.hc_room_open(''g'', ''t'', ''n'', ''[]''::jsonb)');
commit;

-- ----------------------------------------------------------- the group joins
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  select public.hc_room_join((select v from t_state where k = 'code'));
  insert into t_state select 'n_priya', (public.hc_room_post(
    (select v from t_state where k='room')::uuid,
    (select v from t_state where k='q1')::uuid,
    'answer', 'A courtroom, and somebody paying my fine.')).id::text;
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  select public.hc_room_join((select v from t_state where k = 'code'));
  insert into t_state select 'n_marcus', (public.hc_room_post(
    (select v from t_state where k='room')::uuid,
    (select v from t_state where k='q1')::uuid,
    'answer', 'My grandmother''s kitchen.')).id::text;
commit;

select t_check('two answers are in the table',
             (select count(*)::int from public.group_room_notes), 2);

-- =========================================================================
-- THE ONE THAT MATTERS. Nothing has been opened yet.
-- =========================================================================

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  select t_check('a member reading the API directly gets only her own',
               (select count(*)::int from public.group_room_notes), 1);
  select t_check('and it is hers',
               (select author_name from public.group_room_notes), 'Priya');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select t_check('the host cannot read ahead either',
               (select count(*)::int from public.group_room_notes), 0);
  select t_check('but he can see who has answered',
               (select count(*)::int from public.group_room_members), 3);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  select t_check('someone signed in but not in the room gets nothing',
               (select count(*)::int from public.group_room_notes), 0);
commit;

begin;
  set local role anon;
  select t_check('a signed out phone can find the room by its code',
               (select count(*)::int from public.group_rooms
                where code = (select v from t_state where k='code')), 1);
  select t_check('and can read the questions',
               (select count(*)::int from public.group_room_questions), 2);
  -- Stronger than returning nothing: a signed out client is not granted the
  -- table at all, so it cannot even ask the question.
  select t_refuses('and cannot so much as ask for an answer',
               'select count(*) from public.group_room_notes');
commit;

-- ------------------------------------------------- one name at a time
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select public.hc_room_open_answer((select v from t_state where k='n_marcus')::uuid, true);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  select t_check('opening one name shows exactly that one, plus her own',
               (select count(*)::int from public.group_room_notes), 2);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select t_check('the host now sees the one he opened, and no more',
               (select count(*)::int from public.group_room_notes), 1);
  select public.hc_room_open_answer((select v from t_state where k='n_marcus')::uuid, false);
  select t_check('and closing it takes it back',
               (select count(*)::int from public.group_room_notes), 0);
commit;

-- ------------------------------------------------- a whole question at once
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select t_check('open all returns how many it opened',
    public.hc_room_open_all((select v from t_state where k='room')::uuid,
                            (select v from t_state where k='q1')::uuid, true), 2);
  select t_check('the host sees both once they are open',
               (select count(*)::int from public.group_room_notes), 2);
commit;

-- ------------------------------------------------------------ who can do what
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  select t_refuses('a member cannot open answers',
    'select public.hc_room_open_answer((select v from t_state where k=''n_marcus'')::uuid, true)');
  select t_refuses('a member cannot edit somebody else''s answer',
    'select public.hc_room_edit_note((select v from t_state where k=''n_marcus'')::uuid, ''rewritten'')');
  select t_refuses('a member cannot delete somebody else''s answer',
    'select public.hc_room_delete_note((select v from t_state where k=''n_marcus'')::uuid)');
  select t_refuses('a member cannot add a question',
    'select public.hc_room_add_question((select v from t_state where k=''room'')::uuid, ''mine'')');
  select t_refuses('a member cannot take something down',
    'select public.hc_room_take_down((select v from t_state where k=''n_marcus'')::uuid)');
  select t_refuses('a member cannot close the room',
    'select public.hc_room_close((select v from t_state where k=''room'')::uuid)');
  select t_refuses('nobody can write to the table directly',
    'insert into public.group_room_notes (room_id, question_id, kind, author_id, author_name, body)
     values ((select v from t_state where k=''room'')::uuid,
             (select v from t_state where k=''q1'')::uuid, ''answer'',
             ''22222222-2222-2222-2222-222222222222'', ''Priya'', ''direct'')');
  select t_refuses('and nobody can open one by updating the column',
    'update public.group_room_notes set opened_at = now()');
commit;

-- The host can open an answer but that is all he can do to it.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select t_refuses('the host cannot rewrite what somebody said',
    'select public.hc_room_edit_note((select v from t_state where k=''n_marcus'')::uuid, ''rewritten by the host'')');
commit;

-- ----------------------------------------------------------- terms, 1.2
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
  select public.hc_room_join((select v from t_state where k = 'code'));
  select t_refuses('no terms agreed means no posting',
    'select public.hc_room_post((select v from t_state where k=''room'')::uuid,
                                (select v from t_state where k=''q1'')::uuid, ''answer'', ''hello'')');
  select public.hc_room_accept_terms();
  select t_check('agreeing lets them post',
    (public.hc_room_post((select v from t_state where k='room')::uuid,
                         (select v from t_state where k='q1')::uuid,
                         'answer', 'hello')).author_name, 'Stranger');
commit;

-- ------------------------------------------------------------------ blocking
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  select t_check('before blocking, she can see Marcus',
    (select count(*)::int from public.group_room_notes where author_name = 'Marcus'), 1);
  select public.hc_room_block('33333333-3333-3333-3333-333333333333', true);
  select t_check('after blocking, she cannot',
    (select count(*)::int from public.group_room_notes where author_name = 'Marcus'), 0);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select t_check('and blocking did not remove it for anybody else',
    (select count(*)::int from public.group_room_notes where author_name = 'Marcus'), 1);
commit;

-- ------------------------------------------------------- reporting, takedown
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  select public.hc_room_report((select v from t_state where k='n_marcus')::uuid, 'Not ok');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select t_check('the host sees the report',
    (select count(*)::int from public.group_note_reports where resolved_at is null), 1);
  select public.hc_room_take_down((select v from t_state where k='n_marcus')::uuid);
  select t_check('the takedown resolved the report',
    (select count(*)::int from public.group_note_reports where resolved_at is null), 0);
  select t_check('and it is gone for the host',
    (select count(*)::int from public.group_room_notes where author_name = 'Marcus'), 0);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  select t_check('a takedown removes it from its author too',
    (select count(*)::int from public.group_room_notes where author_name = 'Marcus'), 0);
commit;

-- ------------------------------------------------------------ prayer requests
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  insert into t_state select 'prayer', (public.hc_room_post(
    (select v from t_state where k='room')::uuid, null, 'prayer',
    'My sister starts treatment Tuesday.')).id::text;
  select t_check('a prayer request is open the moment it is written',
    (select opened_at is not null from public.group_room_notes
      where id = (select v from t_state where k='prayer')::uuid), true);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select t_check('and the room can read it with no reveal',
    (select count(*)::int from public.group_room_notes where kind = 'prayer'), 1);
commit;

-- --------------------------------------------------------------- housekeeping
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select public.hc_room_close((select v from t_state where k='room')::uuid);
commit;

begin;
  set local role anon;
  select t_check('a closed room cannot be found by its code any more',
    (select count(*)::int from public.group_rooms), 0);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  select t_check('but the people who were there keep it',
    (select count(*)::int from public.group_rooms), 1);
  select t_refuses('and nobody can post into it once it is closed',
    'select public.hc_room_post((select v from t_state where k=''room'')::uuid,
                                (select v from t_state where k=''q1'')::uuid, ''answer'', ''late'')');
commit;

-- Retention. Age the room past ninety days and sweep.
update public.group_rooms set opened_at = now() - interval '91 days';
select t_check('the purge deletes a room past ninety days',
             public.hc_purge_group_rooms(90), 1);
select t_check('and everything in it went with it',
             (select count(*)::int from public.group_room_notes), 0);

select t_check('no orphan members left behind',
             (select count(*)::int from public.group_room_members), 0);

-- ===========================================================================
-- Deleting an account, which is Guideline 5.1.1(v) and also a promise.
--
-- supabase/functions/delete-account removes the row from auth.users and
-- nothing else, on the strength of the foreign keys below doing the rest.
-- Before group rooms that claim was easy: profiles was the only user owned
-- table. Now a person's writing sits in somebody else's room, and "it
-- cascades" is a thing to check rather than a thing to assume, because the
-- failure mode is an answer with somebody's first name on it outliving the
-- account by ninety days.
--
-- A fresh room, since the retention sweep above emptied the last one.
-- ===========================================================================

insert into auth.users (id, email) values
  ('88888888-8888-8888-8888-888888888888', 'leaver@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_host, terms_accepted_at) values
  ('88888888-8888-8888-8888-888888888888', 'Sam', false, now())
  on conflict (id) do update set terms_accepted_at = excluded.terms_accepted_at;

create table if not exists t_del (k text primary key, v text);
delete from t_del;

-- Trey hosts. Sam joins, answers, asks for prayer, and reports something.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into t_del select 'room', (public.hc_room_open(
    'g-del', 'A guide', 'Leaving', '[{"heading":"h","body":"A question"}]'::jsonb)).id::text;
commit;

insert into t_del select 'code', code from public.group_rooms
 where id = (select v from t_del where k = 'room')::uuid;
insert into t_del select 'q', id::text from public.group_room_questions
 where room_id = (select v from t_del where k = 'room')::uuid;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into t_del select 'hostnote', (public.hc_room_post(
    (select v from t_del where k='room')::uuid, (select v from t_del where k='q')::uuid,
    'answer', 'The host wrote this.')).id::text;
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888"}';
  select public.hc_room_join((select v from t_del where k = 'code'));
  select public.hc_room_post((select v from t_del where k='room')::uuid,
    (select v from t_del where k='q')::uuid, 'answer', 'Sam wrote this in Trey''s room.');
  select public.hc_room_post((select v from t_del where k='room')::uuid,
    null, 'prayer', 'Sam asked for this.');
  select public.hc_room_report((select v from t_del where k='hostnote')::uuid, 'Sam reported it');
  select public.hc_room_block('22222222-2222-2222-2222-222222222222', true);
commit;

select t_check('before deleting: two answers, one prayer',
  (select count(*)::int from public.group_room_notes
    where room_id = (select v from t_del where k='room')::uuid), 3);

-- What the Edge Function does, and the only thing it does.
delete from auth.users where id = '88888888-8888-8888-8888-888888888888';

select t_check('their answer in somebody else''s room is gone',
  (select count(*)::int from public.group_room_notes
    where body = 'Sam wrote this in Trey''s room.'), 0);
select t_check('their prayer request is gone',
  (select count(*)::int from public.group_room_notes where kind = 'prayer'
    and room_id = (select v from t_del where k='room')::uuid), 0);
select t_check('they are off the roster',
  (select count(*)::int from public.group_room_members
    where person_id = '88888888-8888-8888-8888-888888888888'), 0);
select t_check('the report they filed is gone',
  (select count(*)::int from public.group_note_reports
    where reporter_id = '88888888-8888-8888-8888-888888888888'), 0);
select t_check('and so is the block they set',
  (select count(*)::int from public.group_blocks
    where blocker_id = '88888888-8888-8888-8888-888888888888'), 0);
select t_check('their profile went with the account',
  (select count(*)::int from public.profiles
    where id = '88888888-8888-8888-8888-888888888888'), 0);

-- And the part that has to survive: leaving does not take the room down with
-- you, or delete what everybody else wrote.
select t_check('the room is still there for the people still in it',
  (select count(*)::int from public.group_rooms
    where id = (select v from t_del where k='room')::uuid), 1);
select t_check('and the host''s own answer is untouched',
  (select body from public.group_room_notes
    where id = (select v from t_del where k='hostnote')::uuid), 'The host wrote this.');
