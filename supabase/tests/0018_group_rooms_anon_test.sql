-- ===========================================================================
-- The privilege matrix, stated as a table rather than as prose.
--
-- 0016's tests asked what rows come back. 0017's asked what functions can be
-- called. Neither asked what a role is granted on a table, which is how anon
-- kept SELECT on group_room_notes through two migrations that were both about
-- privileges. This file asserts the whole matrix at once so there is one place
-- to read the intended answer and one place that fails when it drifts.
--
-- Nothing here depends on a room existing. It is about grants, not rows.
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

-- ------------------------------------------------------------- the tables
--
-- Two are readable signed out, because typing a six digit code has to be able
-- to find a room and show what the group is discussing. The other four hold
-- what people wrote about their marriage and their job, and need an account
-- before the policies from 0016 even get a say.

select t_check('anon can read a room, to find one by its code',
  has_table_privilege('anon', 'public.group_rooms', 'SELECT'), true);
select t_check('anon can read its questions, which are the guide''s words',
  has_table_privilege('anon', 'public.group_room_questions', 'SELECT'), true);

select t_check('anon cannot read what anybody wrote',
  has_table_privilege('anon', 'public.group_room_notes', 'SELECT'), false);
select t_check('anon cannot read who is in a room',
  has_table_privilege('anon', 'public.group_room_members', 'SELECT'), false);
select t_check('anon cannot read reports',
  has_table_privilege('anon', 'public.group_note_reports', 'SELECT'), false);
select t_check('anon cannot read blocks',
  has_table_privilege('anon', 'public.group_blocks', 'SELECT'), false);

-- Signing in gets you the tables. Which rows is the policies' business.
select t_check('signing in gets you all six tables to select from',
  (select count(*)::int from unnest(array[
     'public.group_rooms', 'public.group_room_members', 'public.group_room_questions',
     'public.group_room_notes', 'public.group_note_reports', 'public.group_blocks'
   ]) as t(n) where has_table_privilege('authenticated', n, 'SELECT')), 6);

-- Not one write anywhere, for either role, on any of the six. Every write in
-- this feature goes through an hc_room_ function. `revoke all` rather than
-- naming four verbs, because grant all included TRUNCATE, REFERENCES and
-- TRIGGER and nobody remembers those.
select t_check('and no write privilege of any kind, for anybody but service_role',
  (select coalesce(string_agg(t.n || ' ' || r.role || ' ' || p.priv, ', '), 'none')
     from unnest(array[
       'public.group_rooms', 'public.group_room_members', 'public.group_room_questions',
       'public.group_room_notes', 'public.group_note_reports', 'public.group_blocks'
     ]) as t(n)
     cross join unnest(array['anon', 'authenticated']) as r(role)
     cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
    where has_table_privilege(r.role, t.n, p.priv)), 'none');

-- ----------------------------------------------------------- the functions
--
-- The regression from 0017, restated here so this file stands alone, plus the
-- explicit anon grant that 0017 could not see.

select t_check('anon can execute exactly the two policy helpers, and nothing else',
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), 'none')
     from pg_proc p
     join pg_type ty on ty.oid = p.prorettype
    where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'hc\_room%' or p.proname = 'hc_purge_group_rooms')
      and ty.typname <> 'trigger'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'hc_room_is_live, hc_room_is_member');

-- Stated as an invariant rather than a count. The first version asserted
-- "18", which was true until 0019 added a nineteenth and then failed for a
-- reason that had nothing to do with anything being wrong. A number here has
-- to be edited every time the feature grows; this does not, and it still
-- catches the thing worth catching, which is an hc_room_ function that
-- somebody forgot to grant.
select t_check('every hc_room_ function is callable by somebody signed in',
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), 'none')
     from pg_proc p
     join pg_type ty on ty.oid = p.prorettype
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'hc\_room%'
      and ty.typname <> 'trigger'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')), 'none');

select t_check('and the sweep belongs to service_role alone',
  (select coalesce(string_agg(r.role, ', ' order by r.role), 'none')
     from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where has_function_privilege(r.role, 'public.hc_purge_group_rooms(integer)', 'EXECUTE')),
  'service_role');
