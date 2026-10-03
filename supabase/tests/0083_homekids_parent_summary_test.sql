-- ===========================================================================
-- HomeKids, two notes to parents.
--
--   approving a draft carries parent_summary onto the live lesson beside
--   parent_note, and a signed out phone can read it.
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

delete from public.homekids_lessons where id = 'homekids-2001-11-04';
delete from public.homekids_lesson_drafts where id = 'homekids-2001-11-04';

begin;
  set local role service_role;
  insert into public.homekids_lesson_drafts (id, taught_on, lesson, files, note)
  values ('homekids-2001-11-04', '2001-11-04',
    '{"title":"Jesus Sees Nathanael","story":["Jesus saw Nathanael under a tree."],
      "parent_summary":"This week the kids learned that Jesus knows them.",
      "parent_note":"At bedtime, ask: where did Jesus see you today?"}',
    '[]', null);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  select public.hc_admin_approve_homekids_lesson('homekids-2001-11-04', null);
commit;

select t_check('approving carries both notes to parents onto the live lesson',
  (select parent_summary || ' / ' || parent_note from public.homekids_lessons where id = 'homekids-2001-11-04'),
  'This week the kids learned that Jesus knows them. / At bedtime, ask: where did Jesus see you today?');

begin;
  set local role anon;
  select t_check('and a signed out phone can read the first one',
    (select parent_summary from public.homekids_lessons where id = 'homekids-2001-11-04'),
    'This week the kids learned that Jesus knows them.');
commit;

delete from public.homekids_lessons where id = 'homekids-2001-11-04';
delete from public.homekids_lesson_drafts where id = 'homekids-2001-11-04';
