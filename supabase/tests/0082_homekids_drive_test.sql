-- ===========================================================================
-- HomeKids lessons from Drive.
--
--   a drafted lesson is invisible to a signed out phone and to a member;
--   approving copies it into homekids_lessons on the Sunday the admin chose;
--   approving a second draft for a Sunday that is already live updates it
--   rather than failing on the date;
--   a member cannot approve.
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
  ('ff000000-0000-0000-0000-000000000001', 'dadmin@example.com'),
  ('ff000000-0000-0000-0000-000000000002', 'dmember@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name) values
  ('ff000000-0000-0000-0000-000000000001', 'Ada'),
  ('ff000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;
update public.profiles set role = 'admin'  where id = 'ff000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member' where id = 'ff000000-0000-0000-0000-000000000002';

delete from public.homekids_lessons where id in ('homekids-2001-10-07', 'homekids-2001-09-30');
delete from public.homekids_lesson_drafts where id like 'homekids-2001-%';

begin;
  set local role service_role;
  insert into public.homekids_lesson_drafts (id, taught_on, lesson, files, note)
  values ('homekids-2001-10-07', '2001-10-07',
    '{"title":"Jonah and the Plant","passage":"Jonah 4","big_idea":"God''s love is for everyone.",
      "story":["Jonah sat in the sun."],
      "groups":{"champions":{"questions":["Where did Jonah sit?"],"activity":"Grow like a plant."}},
      "checklist":[{"id":"story","text":"Read the story together"}],
      "_shared_from":"file-1"}',
    '[{"id":"file-1","name":"Oct 7th Champions & Heroes","groups":["champions","heroes"]}]',
    'The file name says October 7 but the header inside says September 30.');
commit;

select t_check('anon has no privilege on drafts or the ledger at all',
  has_table_privilege('anon', 'public.homekids_lesson_drafts', 'SELECT') or
  has_table_privilege('anon', 'public.homekids_drive_files', 'SELECT'), false);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000002"}';
  select t_check('a member cannot read drafts',
    (select count(*)::int from public.homekids_lesson_drafts), 0);
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"ff000000-0000-0000-0000-000000000002"}', true);
  perform public.hc_admin_approve_homekids_lesson('homekids-2001-10-07', null);
  raise warning 'FAIL  a member cannot approve a lesson';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot approve a lesson';
end
$$;
reset role;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  select t_check('an admin sees the draft',
    (select count(*)::int from public.homekids_lesson_drafts where id = 'homekids-2001-10-07'), 1);
  select t_check('approving on the date the admin picked returns that lesson id',
    public.hc_admin_approve_homekids_lesson('homekids-2001-10-07', '2001-09-30'), 'homekids-2001-09-30');
commit;

select t_check('the lesson is live on the corrected Sunday',
  (select title || ' ' || taught_on::text || ' ' || published::text
     from public.homekids_lessons where id = 'homekids-2001-09-30'),
  'Jonah and the Plant 2001-09-30 true');
select t_check('with its groups and checklist carried over',
  (select groups->'champions'->'questions'->>0 || ' / ' || (checklist->0->>'id')
     from public.homekids_lessons where id = 'homekids-2001-09-30'),
  'Where did Jonah sit? / story');
select t_check('and the draft is marked approved',
  (select review_state from public.homekids_lesson_drafts where id = 'homekids-2001-10-07'), 'approved');

-- The Legends doc arrives later: a new draft for the same Sunday, approved
-- over the live lesson.
update public.homekids_lesson_drafts
   set review_state = 'pending', taught_on = '2001-09-30',
       lesson = jsonb_set(lesson, '{groups,legends}', '{"questions":["Who is hard to love?"],"activity":"Write a note."}')
 where id = 'homekids-2001-10-07';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  select public.hc_admin_approve_homekids_lesson('homekids-2001-10-07', null);
commit;

select t_check('a second approval for a live Sunday updates it in place',
  (select count(*)::int || ' ' || coalesce(groups->'legends'->'questions'->>0, '')
     from public.homekids_lessons where taught_on = '2001-09-30' group by groups),
  '1 Who is hard to love?');

begin;
  set local role anon;
  select t_check('and a signed out phone now sees the approved lesson',
    (select count(*)::int from public.homekids_lessons where id = 'homekids-2001-09-30'), 1);
commit;

delete from public.homekids_lessons where id in ('homekids-2001-10-07', 'homekids-2001-09-30');
delete from public.homekids_lesson_drafts where id like 'homekids-2001-%';
