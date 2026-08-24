-- ===========================================================================
-- The admin role, against the real policies and the real trigger.
--
-- One thing is worth testing here and everything below is a way of asking it:
-- can somebody make themselves an admin? The obvious answer is "there is no
-- policy for that", and the obvious answer is wrong, which is the whole point
-- of this file. Migration 0009 gave every signed in person an UPDATE policy on
-- their own profile row, and 0025 puts `role` on that row, so the escalation
-- path is a single PATCH to a table they are already allowed to write. The
-- guard is a trigger, not a policy, because Postgres RLS cannot express "this
-- row but not that column".
--
-- Reading the trigger and nodding is not the same as being a member and
-- trying it, which is the standard supabase/tests/run.sh has kept since 0016.
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

/* Did that raise, and did it raise for the reason we meant? A test that only
   asserts "it failed" passes just as happily when the table does not exist,
   which is how a security test quietly stops testing anything. */
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
  ('aa000000-0000-0000-0000-000000000001', 'admin@example.com'),
  ('aa000000-0000-0000-0000-000000000002', 'member@example.com'),
  ('aa000000-0000-0000-0000-000000000003', 'other@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('aa000000-0000-0000-0000-000000000001', 'Ada'),
  ('aa000000-0000-0000-0000-000000000002', 'Mo'),
  ('aa000000-0000-0000-0000-000000000003', 'Rae')
  on conflict (id) do update set first_name = excluded.first_name;

-- Everybody starts a member, whatever a previous run left behind.
update public.profiles set role = 'member'
 where id in ('aa000000-0000-0000-0000-000000000001',
              'aa000000-0000-0000-0000-000000000002',
              'aa000000-0000-0000-0000-000000000003');

-- ------------------------------------------------------------ the default ---

select t_check('a new profile is a member',
  (select role from public.profiles where id = 'aa000000-0000-0000-0000-000000000002'),
  'member');

select t_raises('the column will not take a role nobody defined',
  $$update public.profiles set role = 'Admin'
     where id = 'aa000000-0000-0000-0000-000000000002'$$,
  '23514');   -- check_violation

-- ----------------------------------------------------------- the bootstrap ---
-- No session at all, which is the SQL editor, a migration, and the service
-- role. This is the only way the first admin can ever exist, so if it stops
-- working the whole feature is unreachable.

update public.profiles set role = 'admin'
 where id = 'aa000000-0000-0000-0000-000000000001';

select t_check('a session-less caller can make the first admin',
  (select role from public.profiles where id = 'aa000000-0000-0000-0000-000000000001'),
  'admin');

-- ------------------------------------------------------------- escalation ---
-- The path this file exists for.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aa000000-0000-0000-0000-000000000002"}';

  select t_check('a member is not an admin', public.hc_is_admin(), false);

  select t_raises('a member cannot promote themselves with a plain update',
    $$update public.profiles set role = 'admin'
       where id = 'aa000000-0000-0000-0000-000000000002'$$,
    '42501');   -- insufficient_privilege

  -- The same attempt dressed up as an ordinary profile save, which is what a
  -- client would actually send: every field the form writes, plus one more.
  select t_raises('nor by hiding it in a profile save',
    $$update public.profiles
         set first_name = 'Mo', last_name = 'Kirk', role = 'admin'
       where id = 'aa000000-0000-0000-0000-000000000002'$$,
    '42501');

  select t_raises('nor by calling the function directly',
    $$select public.hc_admin_set_role(
        'aa000000-0000-0000-0000-000000000002', 'admin')$$,
    '42501');

  select t_raises('and the roster is not theirs to read',
    $$select * from public.hc_admin_list_users()$$,
    '42501');
commit;

select t_check('after all that, still a member',
  (select role from public.profiles where id = 'aa000000-0000-0000-0000-000000000002'),
  'member');

-- An ordinary profile save still works, which is the thing the guard must not
-- break. A trigger that refuses every update would pass every test above and
-- take the Your information form down with it.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aa000000-0000-0000-0000-000000000002"}';

  update public.profiles set first_name = 'Moira'
   where id = 'aa000000-0000-0000-0000-000000000002';

  select t_check('a member can still save their own profile',
    (select first_name from public.profiles
      where id = 'aa000000-0000-0000-0000-000000000002'),
    'Moira');
commit;

-- ---------------------------------------------------------------- an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aa000000-0000-0000-0000-000000000001"}';

  select t_check('an admin is an admin', public.hc_is_admin(), true);

  select public.hc_admin_set_role('aa000000-0000-0000-0000-000000000003', 'admin');

  /* Read back through the roster function and not from profiles directly, and
     the reason is the property being tested two assertions further down: an
     admin cannot read another person's profile row. Asking profiles here
     would return NULL for a promotion that worked perfectly, which is a test
     that fails for the wrong reason and would be "fixed" by widening the
     policy it exists to protect. */
  select t_check('an admin can promote somebody else',
    (select role from public.hc_admin_list_users()
      where id = 'aa000000-0000-0000-0000-000000000003'),
    'admin');

  select public.hc_admin_set_role('aa000000-0000-0000-0000-000000000003', 'member');

  select t_check('and demote them again',
    (select role from public.hc_admin_list_users()
      where id = 'aa000000-0000-0000-0000-000000000003'),
    'member');

  -- The last-admin guard. Both halves: the function says why, and the trigger
  -- underneath refuses the same thing to a client that skips the function.
  select t_raises('an admin cannot demote themselves through the function',
    $$select public.hc_admin_set_role(
        'aa000000-0000-0000-0000-000000000001', 'member')$$,
    '42501');

  select t_raises('nor by updating their own row directly',
    $$update public.profiles set role = 'member'
       where id = 'aa000000-0000-0000-0000-000000000001'$$,
    '42501');

  select t_check('so they are still an admin',
    (select role from public.profiles where id = 'aa000000-0000-0000-0000-000000000001'),
    'admin');

  select t_check('the roster shows everybody',
    (select count(*)::int from public.hc_admin_list_users()
      where id in ('aa000000-0000-0000-0000-000000000001',
                   'aa000000-0000-0000-0000-000000000002',
                   'aa000000-0000-0000-0000-000000000003')),
    3);

  -- The reason the roster is a function and not a policy: an admin changing a
  -- role has no business reading somebody's address, so the function returns
  -- six columns and profiles stays private to its owner.
  select t_check('but an admin still cannot read another profile row',
    (select count(*)::int from public.profiles
      where id = 'aa000000-0000-0000-0000-000000000002'),
    0);
commit;

-- ------------------------------------------------------------------- anon ---

begin;
  set local role anon;

  /* Callable, and always no. The first version of 0025 revoked EXECUTE here,
     on the reasoning that a signed out phone has no business asking. That
     reasoning was right about the intent and wrong about the mechanism: the
     SELECT policies in 0026 call this function on any unpublished row, so
     revoking it made signed out reads raise rather than filter, and one saved
     draft would have taken announcements off Home for everybody not signed in.
     0026's test file caught it. See 0025 section 2.

     What actually keeps anon out is this answer, plus the write privileges
     revoked from it in 0026 section 5. auth.uid() is null with no session, so
     the subquery is `where id = null` and there is no row it can match. */
  select t_check('signed out, the admin question answers no', public.hc_is_admin(), false);

  select t_raises('and the roster is not reachable at all',
    $$select * from public.hc_admin_list_users()$$,
    '42501');
commit;
