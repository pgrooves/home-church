-- ===========================================================================
-- Edit mode, as the three roles that touch it.
--
-- WHY THIS FILE IS THE IMPORTANT HALF. js/edit-mode.js decides which
-- sentences the app offers to edit, and it is not a security boundary and
-- does not claim to be: a member who makes those outlines appear on their own
-- phone can send whatever they like to PostgREST. What actually stops them is
-- here, and there are two separate claims to check.
--
--   1. A member cannot write an override or a content row. That is RLS, and
--      it is the same argument 0026 makes for the three tables it opened.
--
--   2. An admin can write ONLY the prose columns. That is not RLS at all,
--      and it is the claim most likely to be quietly wrong, because policies
--      say nothing about columns. It is the column level grants in 0030
--      section 3, and if they are ever widened to a plain `grant update`,
--      every test below still passes except the four that exist for exactly
--      this: an admin phone would be able to unpublish a serve team or move
--      the church's giving link, from a screen whose whole promise is that it
--      only edits sentences.
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
  ('cc000000-0000-0000-0000-000000000001', 'eadmin@example.com'),
  ('cc000000-0000-0000-0000-000000000002', 'emember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('cc000000-0000-0000-0000-000000000001', 'Ada'),
  ('cc000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'cc000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'cc000000-0000-0000-0000-000000000002';

delete from public.text_overrides where slot like 'test.%';
delete from public.next_steps where id = 'step-test-edit';

insert into public.next_steps (id, title, blurb, published)
values ('step-test-edit', 'I want to be baptized', 'The next one is August 23.', true)
on conflict (id) do update
  set blurb = excluded.blurb, published = true;


-- ----------------------------------------------------------- the shape of it ---

begin;
  select t_check('an override slot has to look like one',
    (select count(*) from information_schema.check_constraints
      where constraint_name = 'text_overrides_slot_shape'), 1::bigint);

  select t_raises('a slot with no screen in front of it is refused',
    $$insert into public.text_overrides (slot, value) values ('nonsense', 'x')$$,
    '23514');

  select t_raises('a wall of text is refused',
    $$insert into public.text_overrides (slot, value)
      values ('test.long', repeat('x', 2001))$$,
    '23514');
commit;


-- --------------------------------------------------------------- as a member ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000002"}';

  select t_raises('a member cannot rewrite a sentence in the app',
    $$insert into public.text_overrides (slot, value)
      values ('test.member', 'I run this church now')$$,
    '42501');

  /* THESE TWO DO NOT RAISE, AND THAT IS THE CORRECT ANSWER, which is worth
     writing down because "no error" reads like a hole.

     A member now genuinely holds the UPDATE privilege on these columns: 0030
     grants it to `authenticated`, because that is the only role a signed in
     admin has. What narrows it to an admin is the policy, and a restrictive
     USING clause on an UPDATE does not refuse the statement, it removes every
     row from what the statement can see. So the member's UPDATE succeeds,
     touches nothing, and the church's words are exactly as they were. The
     assertion is therefore about the row, not about the error. */
  update public.next_steps set blurb = 'Mine' where id = 'step-test-edit';
  update public.church_profile set tagline = 'Mine' where id = 'church-home';
commit;

select t_check('a member''s rewrite of a next step changes nothing',
  (select blurb from public.next_steps where id = 'step-test-edit'),
  'The next one is August 23.');

select t_check('nor of the church''s tagline',
  (select tagline from public.church_profile where id = 'church-home') = 'Mine', false);


-- ---------------------------------------------------------------- as an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  insert into public.text_overrides (slot, value)
    values ('test.give-note', 'Opens Overflow. Card or bank.');

  select t_check('an admin rewrites a sentence',
    (select value from public.text_overrides where slot = 'test.give-note'),
    'Opens Overflow. Card or bank.');

  select t_check('and the row remembers who did it',
    (select updated_by from public.text_overrides where slot = 'test.give-note'),
    'cc000000-0000-0000-0000-000000000001'::uuid);

  -- The app never sends this column, and an admin who does is not stopped by
  -- anything here. Worth knowing rather than assuming: the honest claim is
  -- "the row says who the session was unless somebody went out of their way",
  -- not "this cannot be forged".
  update public.text_overrides set value = 'Opens Overflow. Card, bank, or stock.'
   where slot = 'test.give-note';

  select t_check('and can write it again, which is what Save does every time',
    (select value from public.text_overrides where slot = 'test.give-note'),
    'Opens Overflow. Card, bank, or stock.');

  -- Empty is a real state: the church took the line off the screen.
  update public.text_overrides set value = '' where slot = 'test.give-note';
  select t_check('an admin can clear a line off a screen',
    (select value from public.text_overrides where slot = 'test.give-note'), '');

  delete from public.text_overrides where slot = 'test.give-note';
  select t_check('and Reset to original takes the row away',
    (select count(*) from public.text_overrides where slot = 'test.give-note'), 0::bigint);

  -- The prose columns on the content tables.
  update public.next_steps set blurb = 'The next one is November 2.'
   where id = 'step-test-edit';
  select t_check('an admin rewrites a next step where it is read',
    (select blurb from public.next_steps where id = 'step-test-edit'),
    'The next one is November 2.');

  update public.church_profile set tagline = 'A church of the city.'
   where id = 'church-home';
  select t_check('and the church''s tagline',
    (select tagline from public.church_profile where id = 'church-home'),
    'A church of the city.');
commit;


-- ------------------------------------------- what an admin still cannot touch ---
--
-- The four that make Edit mode a way to fix a sentence rather than a way to
-- run the church from a caption. All four are 42501 from the column grants,
-- before any policy is consulted.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  select t_raises('an admin cannot unpublish a next step from Edit mode',
    $$update public.next_steps set published = false where id = 'step-test-edit'$$,
    '42501');

  select t_raises('nor retitle one',
    $$update public.next_steps set title = 'Something else' where id = 'step-test-edit'$$,
    '42501');

  select t_raises('nor move the church''s giving link',
    $$update public.church_profile set giving_url = 'https://example.com'
       where id = 'church-home'$$,
    '42501');

  select t_raises('nor change a service time',
    $$update public.church_profile set service_times = '["4:00 AM"]'::jsonb
       where id = 'church-home'$$,
    '42501');

  -- The pair on Connect that reads like one thing and is two. The sentence is
  -- a wording and is granted; the switch beside it takes the group finder off
  -- the screen for the whole church and is not.
  update public.church_profile set groups_off_season_note = 'Back in September.'
   where id = 'church-home';
  select t_check('an admin rewrites the between seasons note',
    (select groups_off_season_note from public.church_profile where id = 'church-home'),
    'Back in September.');

  select t_raises('but cannot take the group finder down from Edit mode',
    $$update public.church_profile set groups_in_season = false
       where id = 'church-home'$$,
    '42501');
commit;


-- ------------------------------------------------------------- as a stranger ---
--
-- A signed out phone holds the publishable key and reads as anon. It has to
-- see the rewritten sentence, because it is what the church now says, and it
-- has to be refused every write.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  insert into public.text_overrides (slot, value)
    values ('test.public', 'Everybody sees this.');
commit;

begin;
  set local role anon;

  select t_check('a signed out phone reads the church''s new words',
    (select value from public.text_overrides where slot = 'test.public'),
    'Everybody sees this.');

  select t_raises('and cannot write any',
    $$insert into public.text_overrides (slot, value) values ('test.anon', 'x')$$,
    '42501');

  -- This one does raise, unlike the member's UPDATE above, and the difference
  -- is the revoke in 0030 section 2: anon does not hold the privilege at all,
  -- so Postgres refuses the statement before RLS is ever consulted. Both
  -- locks are being checked here, one in each direction.
  select t_raises('and cannot delete one either',
    $$delete from public.text_overrides where slot = 'test.public'$$,
    '42501');

  /* TRUNCATE, which is the one write RLS has nothing to say about. There is
     no policy that applies to it and no row filter that softens it: holding
     the privilege is the whole of the check, and the statement empties the
     table. Supabase's default privileges hand it to anon on every new table
     in the public schema, so this passes only because 0030 revokes it by
     name. Nothing in PostgREST can issue one today; this is about the role
     not being able to, rather than the API happening not to ask. */
  select t_raises('and cannot empty the table wholesale',
    $$truncate public.text_overrides$$,
    '42501');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  -- Nor can an admin, who has every other write on this table.
  select t_raises('nor can an admin, who can write every row in it one by one',
    $$truncate public.text_overrides$$,
    '42501');
commit;

select t_check('the sentence survived the stranger',
  (select count(*) from public.text_overrides where slot = 'test.public'), 1::bigint);

delete from public.text_overrides where slot like 'test.%';
delete from public.next_steps where id = 'step-test-edit';
