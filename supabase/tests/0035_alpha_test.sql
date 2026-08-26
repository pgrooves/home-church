-- ===========================================================================
-- Alpha, in season and out of it.
--
-- 0035 adds three columns to a table whose reads and writes were settled in
-- 0006 and 0026, so "can the world read this" is not the interesting question.
-- What is left is the handful of things whose wrong answer is silent rather
-- than loud, which is the only kind this app is afraid of:
--
--   the default     alpha_in_season has to answer "is Alpha running" for the
--                   row that existed before this migration, and answer it the
--                   same way js/content.js answers it for a column that is
--                   not there at all. If those two ever disagree, a phone with
--                   a stale schema and a phone with a fresh one show different
--                   screens and nothing anywhere says why.
--
--   the pencil      alpha_off_season_note is a paragraph on a screen and joins
--                   the columns an admin may reword in place. The two beside
--                   it are a switch and a destination and must stay shut, and
--                   a grant that is written but never asserted is a grant
--                   somebody widens by accident. 0031's own test asserts the
--                   whole church_profile list; this asserts what each of the
--                   three actually does under an admin session.
--
--   re-running      every migration here promises to be safe twice, and this
--                   one carries an update. Running it again must not put the
--                   church back in season after somebody has taken it out,
--                   which is the one way a re-run of this file could reopen a
--                   registration that closed.
--
-- The screen's own decisions, which sentence it draws and which button, live
-- in js/screens/alpha.js and are exercised by tests/e2e/editable-content.js.
-- Postgres holds the switch; the app reads it.
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
  ('fa000000-0000-0000-0000-000000000001', 'alphadmin@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('fa000000-0000-0000-0000-000000000001', 'Ada')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'fa000000-0000-0000-0000-000000000001';


-- --------------------------------------------------------------- defaults ---

select t_check('the row that already existed comes out in season',
  (select alpha_in_season from public.church_profile where id = 'church-home'), true);

select t_check('and cannot come out null, which the app has no reading for',
  (select alpha_in_season is not null from public.church_profile where id = 'church-home'), true);

-- A second row, inserted without naming the column, is the case a project gets
-- when somebody adds a campus after this migration ran. Same answer.
insert into public.church_profile (id, name, published)
values ('church-test-alpha', 'Test Campus', false)
  on conflict (id) do nothing;

select t_check('a row written without an opinion is in season too',
  (select alpha_in_season from public.church_profile where id = 'church-test-alpha'), true);

-- The migration writes the published row and only the published row, so the
-- draft beside it must still be holding nothing.
select t_check('and the migration left the unpublished row alone',
  (select alpha_signup_url from public.church_profile where id = 'church-test-alpha'), null);

select t_check('the live row got this season''s registration',
  (select alpha_signup_url like 'https://homechurchnola.churchcenter.com/%'
     from public.church_profile where id = 'church-home'), true);

select t_check('and something to say between seasons',
  (select alpha_off_season_note is not null and alpha_off_season_note <> ''
     from public.church_profile where id = 'church-home'), true);


-- ------------------------------------------------------------- the pencil ---
-- One sentence an admin may fix where they are reading it, and two things they
-- may not touch from inside the app. 42501 is Postgres refusing on the column
-- grant, before any policy is consulted, which is the half that actually
-- holds: js/edit-mode.js keeps a matching list and a list is not a fence.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"fa000000-0000-0000-0000-000000000001"}';

  update public.church_profile
     set alpha_off_season_note = 'Alpha is resting. The next one starts in the fall.'
   where id = 'church-home';

  select t_check('an admin rewords the between seasons note',
    (select alpha_off_season_note from public.church_profile where id = 'church-home'),
    'Alpha is resting. The next one starts in the fall.');

  select t_raises('but cannot flip the season from a text box',
    $$update public.church_profile set alpha_in_season = false where id = 'church-home'$$,
    '42501');

  select t_raises('and cannot repoint the only button on the screen',
    $$update public.church_profile set alpha_signup_url = 'https://example.com/'
       where id = 'church-home'$$,
    '42501');
commit;


-- ------------------------------------------------------- safe to run twice ---
-- run.sh applies every migration twice before any test runs, so the assertions
-- above have already survived a second pass. What that does not reach is the
-- case that actually matters, and it is the reason section 2 of the migration
-- is guarded: a re-run months later, after somebody has closed the season and
-- pointed the button at next spring's registration.
--
-- So this is the closed season, staged and then re-run against, in the order
-- it would really happen. If any of the three assertions below stops holding,
-- 0035 has quietly become a file that reopens a registration that closed, and
-- it would do it on a Tuesday with nobody watching.

update public.church_profile set
  alpha_in_season  = false,
  alpha_signup_url = 'https://homechurchnola.churchcenter.com/registrations/events/9999999'
where id = 'church-home';

alter table public.church_profile
  add column if not exists alpha_in_season       boolean not null default true,
  add column if not exists alpha_signup_url      text,
  add column if not exists alpha_off_season_note text;

update public.church_profile
   set alpha_signup_url = 'https://homechurchnola.churchcenter.com/registrations/events/3798127'
 where published
   and (alpha_signup_url is null or alpha_signup_url = '');

select t_check('re-running does not put Alpha back in season',
  (select alpha_in_season from public.church_profile where id = 'church-home'), false);

select t_check('and does not repoint the button at a closed registration',
  (select alpha_signup_url from public.church_profile where id = 'church-home'),
  'https://homechurchnola.churchcenter.com/registrations/events/9999999');

-- The other half of the same promise: a column somebody has emptied on purpose
-- does get seeded again, which is what makes this a seed rather than a one
-- time write. Emptying a url is not a way to say "no signup", the switch is.
update public.church_profile set alpha_signup_url = '' where id = 'church-home';

update public.church_profile
   set alpha_signup_url = 'https://homechurchnola.churchcenter.com/registrations/events/3798127'
 where published
   and (alpha_signup_url is null or alpha_signup_url = '');

select t_check('an emptied url is seeded again rather than left blank',
  (select alpha_signup_url like '%/3798127' from public.church_profile where id = 'church-home'),
  true);

-- Left as it was found, so a later test file reading this row sees the shipped
-- state rather than this one's leftovers.
update public.church_profile set alpha_in_season = true where id = 'church-home';
