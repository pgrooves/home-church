-- ===========================================================================
-- Closing a report without deleting somebody's writing.
--
-- The interesting case is the one 0016 could not express: a host looks at a
-- report, decides the note is fine, and says so. Before this the only way to
-- empty the queue was to remove the note, which teaches hosts to delete or to
-- ignore the queue entirely.
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

-- A host, a member, a room, an answer, and a report against it.
insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'rhost@example.com'),
  ('77777777-7777-7777-7777-777777777777', 'rmember@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_host, terms_accepted_at) values
  ('66666666-6666-6666-6666-666666666666', 'Rhoda', true,  now()),
  ('77777777-7777-7777-7777-777777777777', 'Rob',   false, now())
  on conflict (id) do update set can_host = excluded.can_host,
                                 terms_accepted_at = excluded.terms_accepted_at;

create table if not exists t_rep (k text primary key, v text);
grant select, insert on t_rep to anon, authenticated;
delete from t_rep;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666"}';
  insert into t_rep select 'room', (public.hc_room_open(
    'g-reports', 'A guide', 'Reports', '[{"heading":"h","body":"A question"}]'::jsonb)).id::text;
commit;

insert into t_rep select 'code', code from public.group_rooms
 where id = (select v from t_rep where k = 'room')::uuid;
insert into t_rep select 'q', id::text from public.group_room_questions
 where room_id = (select v from t_rep where k = 'room')::uuid;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777"}';
  select public.hc_room_join((select v from t_rep where k = 'code'));
  insert into t_rep select 'note', (public.hc_room_post(
    (select v from t_rep where k='room')::uuid,
    (select v from t_rep where k='q')::uuid,
    'answer', 'Something somebody objected to.')).id::text;
commit;

-- The host reports it. Any member can, the host included.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666"}';
  select public.hc_room_report((select v from t_rep where k='note')::uuid, 'Looked wrong');
  select t_check('the host sees an open report',
    (select count(*)::int from public.group_note_reports
      where room_id = (select v from t_rep where k='room')::uuid and resolved_at is null), 1);
commit;

insert into t_rep select 'report', id::text from public.group_note_reports
 where note_id = (select v from t_rep where k='note')::uuid;

-- A member cannot close it.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777"}';
  select t_refuses('a member cannot close a report',
    'select public.hc_room_resolve_report((select v from t_rep where k=''report'')::uuid)');
commit;

-- The host decides the note is fine. This is the case 0016 had no verb for.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666"}';
  select public.hc_room_resolve_report((select v from t_rep where k='report')::uuid);
  select t_check('closing it empties the queue',
    (select count(*)::int from public.group_note_reports
      where room_id = (select v from t_rep where k='room')::uuid and resolved_at is null), 0);
  select t_check('and says who closed it',
    (select resolved_by::text from public.group_note_reports
      where id = (select v from t_rep where k='report')::uuid),
    '66666666-6666-6666-6666-666666666666');
commit;

-- And the writing is still there, which is the whole point.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777"}';
  select t_check('the note it was about is untouched',
    (select body from public.group_room_notes
      where id = (select v from t_rep where k='note')::uuid),
    'Something somebody objected to.');
commit;

-- Privileges, the same question 0018 taught us to ask of every new function.
select t_check('anon cannot resolve a report',
  has_function_privilege('anon', 'public.hc_room_resolve_report(uuid)', 'EXECUTE'), false);
select t_check('and PUBLIC holds nothing on it',
  has_function_privilege('authenticated', 'public.hc_room_resolve_report(uuid)', 'EXECUTE'), true);
