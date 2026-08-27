-- ===========================================================================
-- Leader mode as something the church grants, against the real trigger and
-- the real functions.
--
-- The question this file exists for is 0025's question asked about a
-- different column: can somebody make themselves a leader? Leader mode used
-- to be a switch in Your account, so for most of this app's life the honest
-- answer was "yes, that is the feature". It is not the feature any more, and
-- the interesting part is that the obvious defence is not the one doing the
-- work: there is no policy saying "you may not set can_host", because 0009
-- already gave everybody UPDATE on their own profile row and RLS cannot
-- express a column. The guard is a trigger, and a trigger is only worth
-- as much as somebody being that role and trying it.
--
-- The other half is hosting. Leaders and admins, nobody else, checked where
-- it counts rather than where it is drawn.
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

-- Ada is the admin, Mo a member, Rae the one who gets made a leader.
insert into auth.users (id, email) values
  ('cc000000-0000-0000-0000-000000000001', 'ada@example.com'),
  ('cc000000-0000-0000-0000-000000000002', 'mo@example.com'),
  ('cc000000-0000-0000-0000-000000000003', 'rae@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name, terms_accepted_at) values
  ('cc000000-0000-0000-0000-000000000001', 'Ada', now()),
  ('cc000000-0000-0000-0000-000000000002', 'Mo',  now()),
  ('cc000000-0000-0000-0000-000000000003', 'Rae', now())
  on conflict (id) do update set first_name = excluded.first_name,
                                 terms_accepted_at = excluded.terms_accepted_at;

-- Whatever a previous run left behind: everyone a member, nobody a leader.
update public.profiles set role = 'member', can_host = false
 where id in ('cc000000-0000-0000-0000-000000000001',
              'cc000000-0000-0000-0000-000000000002',
              'cc000000-0000-0000-0000-000000000003');

update public.profiles set role = 'admin'
 where id = 'cc000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------ the default ---

select t_check('a new profile is not a leader',
  (select can_host from public.profiles where id = 'cc000000-0000-0000-0000-000000000003'),
  false);

-- --------------------------------------------------------- self promotion ---
-- The path this file exists for. Mo is signed in, is not an admin, and owns
-- the row.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000002"}';

  select t_check('a member is not a leader', public.hc_is_leader(), false);

  select t_raises('a member cannot make themselves a leader with a plain update',
    $$update public.profiles set can_host = true
       where id = 'cc000000-0000-0000-0000-000000000002'$$,
    '42501');

  -- What a tampered client would actually send: the fields the profile form
  -- writes, with one more riding along.
  select t_raises('nor by hiding it in a profile save',
    $$update public.profiles
         set first_name = 'Mo', last_name = 'Kirk', can_host = true
       where id = 'cc000000-0000-0000-0000-000000000002'$$,
    '42501');

  select t_raises('nor by calling the admin function directly',
    $$select public.hc_admin_set_leader(
        'cc000000-0000-0000-0000-000000000002', true)$$,
    '42501');

  select t_raises('nor by opening a room, which is what it was for',
    $$select public.hc_room_open('guide-1', 'A guide', 'Thursday', '[]'::jsonb)$$,
    '42501');

  -- The ordinary save still has to work, or this guard has broken the one
  -- thing every signed in person does with this table.
  update public.profiles set first_name = 'Mo' where id = 'cc000000-0000-0000-0000-000000000002';
  select t_check('an ordinary profile save is untouched by the guard',
    (select first_name from public.profiles where id = 'cc000000-0000-0000-0000-000000000002'),
    'Mo');
commit;

select t_check('after all that, still not a leader',
  (select can_host from public.profiles where id = 'cc000000-0000-0000-0000-000000000002'),
  false);

-- ------------------------------------------------------------- an admin ----
-- Ada grants it, which is the whole feature: a phone, not the SQL editor.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  select public.hc_admin_set_leader('cc000000-0000-0000-0000-000000000003', true);

  /* Whether it took is asked after this block, as the owner. Reading it here
     would answer NULL however well the grant worked: profiles is private to
     its owner under 0009, and an admin has no policy over anybody else's row
     on purpose, which is the whole reason the roster is a function. */

  select t_check('an admin is a leader without the column',
    public.hc_is_leader(), true);

  select t_check('and the roster says who is one',
    (select is_leader from public.hc_admin_list_users()
      where id = 'cc000000-0000-0000-0000-000000000003'),
    true);

  select t_raises('marking somebody who has never opened the app says so',
    $$select public.hc_admin_set_leader(
        '00000000-0000-0000-0000-0000000000ff', true)$$,
    null);

  /* Three tiers and one rule over all of them. An admin has no lockout to
     fear here, since being an admin is what makes them a leader, and it is
     still refused: a rule with a carve-out in it is a rule somebody has to
     check before they can trust it. Both halves, the named call and the
     direct write underneath it. */
  select t_raises('an admin cannot set Leader mode on themselves',
    $$select public.hc_admin_set_leader(
        'cc000000-0000-0000-0000-000000000001', true)$$,
    '42501');

  select t_raises('nor by writing their own column',
    $$update public.profiles set can_host = true
       where id = 'cc000000-0000-0000-0000-000000000001'$$,
    '42501');

  -- Admins host too, which is the second half of migration 0036.
  select t_check('an admin can open a room',
    (select code is not null from public.hc_room_open(
      'guide-1', 'A guide', 'Ada''s group', '[]'::jsonb)),
    true);
commit;

select t_check('an admin can turn Leader mode on for somebody else',
  (select can_host from public.profiles where id = 'cc000000-0000-0000-0000-000000000003'),
  true);

-- --------------------------------------------------------------- a leader ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000003"}';

  select t_check('the person they marked is a leader now', public.hc_is_leader(), true);

  select t_check('and can open a room',
    (select code is not null from public.hc_room_open(
      'guide-1', 'A guide', 'Rae''s group', '[]'::jsonb)),
    true);

  -- A leader is not an admin, and the one thing this migration must not do is
  -- turn the first into the second.
  select t_check('a leader is still not an admin', public.hc_is_admin(), false);

  select t_raises('a leader cannot make anybody else a leader',
    $$select public.hc_admin_set_leader(
        'cc000000-0000-0000-0000-000000000002', true)$$,
    '42501');

  /* The rule from the other side, and the case worth having: the guard is
     about the column changing, not about the direction it changes in. A
     leader writing the value it already holds is an ordinary profile save and
     passes, which is why this asks for the one write that is a change. */
  select t_raises('nor turn their own off, because the column is not theirs at all',
    $$update public.profiles set can_host = false
       where id = 'cc000000-0000-0000-0000-000000000003'$$,
    '42501');

  select t_raises('and the roster is not theirs to read',
    $$select * from public.hc_admin_list_users()$$,
    '42501');
commit;

-- ------------------------------------------------------------- taking it away

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  select public.hc_admin_set_leader('cc000000-0000-0000-0000-000000000003', false);
commit;

select t_check('an admin can take Leader mode away again',
  (select can_host from public.profiles where id = 'cc000000-0000-0000-0000-000000000003'),
  false);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000003"}';

  select t_check('and they stop being a leader the moment it is off',
    public.hc_is_leader(), false);

  select t_raises('a former leader cannot open another room',
    $$select public.hc_room_open('guide-1', 'A guide', 'Rae''s group', '[]'::jsonb)$$,
    '42501');
commit;

-- ----------------------------------------------------------- signed out -----
-- hc_is_admin has to be callable by anon, because a policy names it and a
-- policy anon evaluates and cannot call is a 500 rather than a no. Nothing
-- anon evaluates names hc_is_leader, so it is not granted, and the allowlist
-- in 0017's test is what keeps that honest. Asserted from the other end here:
-- the privilege, not the answer, because with no grant there is no answer.

select t_check('a signed out client cannot even call hc_is_leader',
  has_function_privilege('anon', 'public.hc_is_leader()', 'EXECUTE'), false);

select t_check('and a signed in one can, since hc_room_open is not the only ' ||
  'thing that will ever ask',
  has_function_privilege('authenticated', 'public.hc_is_leader()', 'EXECUTE'), true);

-- With no session the answer is false rather than an error, which is what
-- makes hc_room_open's refusal a refusal. Asked as the owner, since that is
-- the role that can call it with no auth.uid() to find.
select t_check('and with no session at all, nobody is a leader',
  public.hc_is_leader(), false);

-- ----------------------------------------------------------- the bootstrap --
-- No session, which is the service role, a migration, and
-- scripts/hc_supabase.py host. It has to keep working: it is the way back in
-- when there is no admin yet.

update public.profiles set can_host = true
 where id = 'cc000000-0000-0000-0000-000000000002';

select t_check('a session-less caller can still mark a leader',
  (select can_host from public.profiles where id = 'cc000000-0000-0000-0000-000000000002'),
  true);
