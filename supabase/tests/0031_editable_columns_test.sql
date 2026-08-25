-- ===========================================================================
-- What an admin phone may reword, and everything it may not.
--
-- 0030's test asked whether the right ROLE can write. This one asks whether
-- the right COLUMNS can be written, which is the question Edit mode's whole
-- promise rests on now that it reaches nine tables. "It only edits sentences"
-- is not a property of the screen: a phone holding an admin session can send
-- any PATCH it likes to PostgREST, and what makes the promise true is that
-- Postgres refuses every column that is not a sentence.
--
-- THE FIRST BLOCK IS THE IMPORTANT ONE. It asserts the exact set of columns
-- `authenticated` may update, table by table, rather than checking a handful
-- of examples. An accidental `grant update` on a whole table, which is the
-- easy mistake to make in a later migration, fails this file loudly instead of
-- silently handing a phone the power to unpublish a sermon.
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

create or replace function t_raises(label text, stmt text, want_sqlstate text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  %  (it was allowed)', label;
exception
  when others then
    if want_sqlstate is null or sqlstate = want_sqlstate then
      raise notice 'PASS  %', label;
    else
      raise warning 'FAIL  %  (refused with % rather than %)', label, sqlstate, want_sqlstate;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-000000000001', 'wadmin@example.com'),
  ('dd000000-0000-0000-0000-000000000002', 'wmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('dd000000-0000-0000-0000-000000000001', 'Ada'),
  ('dd000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'dd000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'dd000000-0000-0000-0000-000000000002';


-- ------------------------------------------------- exactly these columns ---
--
-- Nine tables whose UPDATE privilege is column level. announcements and
-- content_pages are deliberately not here: they carry a full admin UPDATE from
-- 0026 because the Admin form writes every column of both, and Edit mode being
-- narrower than its privileges there is enforced in the client's ALLOWLIST
-- rather than by Postgres. Section 1 of 0031 says so too.

create or replace function t_columns(tbl text, want text)
returns void language plpgsql as $$
declare
  got text;
begin
  select coalesce(string_agg(column_name, ',' order by column_name), '')
    into got
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = tbl
     and grantee = 'authenticated'
     and privilege_type = 'UPDATE';

  if got = want then raise notice 'PASS  an admin may reword exactly % on %', want, tbl;
  else raise warning 'FAIL  % (got %, want %)', tbl, got, want; end if;
end;
$$;

select t_columns('serve_teams',    'blurb,commitment,requirement');
select t_columns('next_steps',     'blurb,cta_label');
select t_columns('groups',         'blurb');
select t_columns('events',         'description');
select t_columns('series',         'blurb,subtitle');
select t_columns('podcasts',       'description,summary');
select t_columns('guides',         'subtitle');
select t_columns('reading_plans',  'subtitle,this_week');
select t_columns('podcast_show',   'blurb');
select t_columns('church_profile', 'groups_off_season_note,serve_signup_blurb,tagline');


-- ------------------------------------------------------------- as an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  update public.groups set blurb = 'Loud, and there is always food.'
   where id = 'group-uptown';
  select t_check('an admin rewords a group''s description',
    (select blurb from public.groups where id = 'group-uptown'),
    'Loud, and there is always food.');

  update public.series set subtitle = 'Eight Sundays in 1 Samuel'
   where id = 'series-david';
  select t_check('and a series'' subtitle',
    (select subtitle from public.series where id = 'series-david'),
    'Eight Sundays in 1 Samuel');

  update public.podcasts set description = 'What David carried, and what he put down.'
   where id = 'sermon-test';
  select t_check('and the sentence under a message',
    (select description from public.podcasts where id = 'sermon-test'),
    'What David carried, and what he put down.');

  update public.podcasts set summary = array['One.', 'Two.']
   where id = 'sermon-test';
  select t_check('including the paragraph list version of it',
    (select array_length(summary, 1) from public.podcasts where id = 'sermon-test'), 2);

  update public.reading_plans set this_week = 'Matthew 5 to 9' where id = 'plan-test';
  select t_check('and what the plan reads this week',
    (select this_week from public.reading_plans where id = 'plan-test'), 'Matthew 5 to 9');

  update public.guides set subtitle = 'Week two' where id = 'guide-test';
  select t_check('and a guide''s subtitle',
    (select subtitle from public.guides where id = 'guide-test'), 'Week two');
commit;


-- ------------------------------------------ and everything it cannot touch ---
--
-- The six that would break something rather than read badly. All are 42501
-- from the column grants, before any policy is consulted.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_raises('an admin cannot reword the day a group meets, which the filter compares',
    $$update public.groups set day = 'Thursday evening' where id = 'group-uptown'$$,
    '42501');

  select t_raises('nor the neighborhood, for the same reason',
    $$update public.groups set neighborhood = 'Uptown-ish' where id = 'group-uptown'$$,
    '42501');

  select t_raises('nor rename a group',
    $$update public.groups set name = 'The Best Group' where id = 'group-uptown'$$,
    '42501');

  select t_raises('nor retitle a message, which is what it is called on Spotify',
    $$update public.podcasts set title = 'Something else' where id = 'sermon-test'$$,
    '42501');

  select t_raises('nor unpublish one',
    $$update public.podcasts set published = false where id = 'sermon-test'$$,
    '42501');

  select t_raises('nor touch a guide''s questions, which a room copies when it opens',
    $$update public.guides set reflection_questions = '[]'::jsonb where id = 'guide-test'$$,
    '42501');

  select t_raises('nor a guide''s theme title',
    $$update public.guides set theme_title = 'Mine' where id = 'guide-test'$$,
    '42501');

  select t_raises('nor the number of weeks a plan runs, which the progress bar divides by',
    $$update public.reading_plans set total_weeks = 1 where id = 'plan-test'$$,
    '42501');
commit;


-- --------------------------------------------------------------- as a member ---
-- The privilege is real for any signed in person, so RLS is the only thing
-- narrowing these to an admin. As in 0030, a member's UPDATE does not raise:
-- the policy removes every row from what the statement can see, so it succeeds
-- and changes nothing. The assertion is about the row.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';
  update public.groups set blurb = 'Mine now.' where id = 'group-uptown';
  update public.series set subtitle = 'Mine now.' where id = 'series-david';
commit;

select t_check('a member rewording a group changes nothing',
  (select blurb from public.groups where id = 'group-uptown'),
  'Loud, and there is always food.');
select t_check('nor a series',
  (select subtitle from public.series where id = 'series-david'),
  'Eight Sundays in 1 Samuel');


-- ------------------------------------------------------------------ truncate ---
-- Section 3 of the migration, asserted on a table that is not text_overrides.
-- RLS has nothing to say about TRUNCATE, so the revoke is the whole check.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  select t_raises('an admin cannot empty the sermon archive in one statement',
    $$truncate public.podcasts$$, '42501');
commit;

begin;
  set local role anon;
  select t_raises('and a signed out phone certainly cannot',
    $$truncate public.groups$$, '42501');
commit;
