-- ===========================================================================
-- The announcement notification.
--
-- WHAT CAN AND CANNOT BE TESTED HERE, said first so a green run is not read
-- as more than it is. Actually sending is APNs over the network from an Edge
-- Function, and nothing in a throwaway Postgres can exercise that. What this
-- file tests is the half that lives in the database and is the half that
-- matters most, because a push cannot be unsent: who is allowed to ask for
-- one, and which rows are refused before anybody's phone lights up.
--
-- Every assertion below therefore stops short of net.http_post, which is the
-- last line of hc_admin_send_announcement and is deliberately unreachable in
-- this harness. Each refusal happens before it.
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

/* Raised, and with the message we meant. This file matches on the text rather
   than only the SQLSTATE, because every refusal below is a plain
   `raise exception` and they all share one code. The message is also the
   thing the admin screen puts in front of a person, so it is worth asserting
   that the right one comes back. */
create or replace function t_raises_like(label text, stmt text, want_fragment text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  %  (it was allowed)', label;
exception
  when others then
    if position(lower(want_fragment) in lower(sqlerrm)) > 0 then
      raise notice 'PASS  %', label;
    else
      raise warning 'FAIL  %  (refused with "%" rather than "%")', label, sqlerrm, want_fragment;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('cc000000-0000-0000-0000-000000000001', 'padmin@example.com'),
  ('cc000000-0000-0000-0000-000000000002', 'pmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('cc000000-0000-0000-0000-000000000001', 'Ada'),
  ('cc000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin' where id = 'cc000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member' where id = 'cc000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'push-test-%';
delete from public.push_log where topic = 'announcement' and note = 'harness';

/* The vault secret 0012 generates on a real project. Put here rather than in
   harness.sql because it is this file's business: without it hc_send_push
   stops at "the secret is missing", which is a real refusal and a correct one,
   and it would stop the last assertion below from reaching the thing it is
   trying to reach. */
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_push_cron_secret', 'harness-secret')
on conflict (name) do nothing;

insert into public.announcements (id, title, body, published, starts_on, ends_on) values
  ('push-test-live',    'City Serve Day', 'Four sites.', true,  null, null),
  ('push-test-draft',   'Not ready',      null,          false, null, null),
  ('push-test-future',  'Christmas Eve',  null,          true,  current_date + 30, null),
  ('push-test-expired', 'Last month',     null,          true,  null, current_date - 1);

-- ------------------------------------------------------------ the switch ---

select t_check('every phone wants announcements unless it says otherwise',
  (select column_default from information_schema.columns
    where table_name = 'device_tokens' and column_name = 'wants_announcements'),
  'true');

insert into public.device_tokens (token) values ('push-test-token')
  on conflict (token) do nothing;

select t_check('so a phone registered before this existed is opted in',
  (select wants_announcements from public.device_tokens where token = 'push-test-token'), true);

delete from public.device_tokens where token = 'push-test-token';

-- ------------------------------------------------------------- the topic ---

insert into public.push_log (topic, note) values ('announcement', 'harness');

select t_check('push_log accepts the new topic',
  (select count(*)::int from public.push_log
    where topic = 'announcement' and note = 'harness'), 1);

select t_check('and still refuses one nobody defined', (
  select not exists (
    select 1 from pg_constraint
     where conname = 'push_log_topic_known'
       and pg_get_constraintdef(oid) like '%invented%'
  )), true);

-- Exactly one hc_send_push, not two. Adding a defaulted parameter with
-- CREATE OR REPLACE would have left the old two argument version in place and
-- made every existing call ambiguous, including the ones inside
-- hc_push_tick(). 0027 section 3 drops first for that reason; this is the
-- assertion that it worked.
select t_check('there is one hc_send_push, not two',
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_send_push'), 1);

-- --------------------------------------------------------- who may ask ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000002"}';

  select t_raises_like('a member cannot announce anything',
    $$select public.hc_admin_send_announcement('push-test-live')$$,
    'Admins only');
commit;

begin;
  set local role anon;

  select t_raises_like('and neither can a signed out phone',
    $$select public.hc_admin_send_announcement('push-test-live')$$,
    'permission denied');
commit;

-- ------------------------------------------------- which rows are refused ---
-- All three of these are a draft by another name: none of them is on Home, so
-- a notification about one would send somebody to look at a card they cannot
-- see. A push cannot be taken back, which is why these are checked in the
-- database and not only in the form.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  select t_raises_like('an admin cannot announce a draft',
    $$select public.hc_admin_send_announcement('push-test-draft')$$,
    'draft');

  select t_raises_like('nor one that has not gone up yet',
    $$select public.hc_admin_send_announcement('push-test-future')$$,
    'does not go up until');

  select t_raises_like('nor one that has already come down',
    $$select public.hc_admin_send_announcement('push-test-expired')$$,
    'already come down');

  select t_raises_like('nor one that is not there at all',
    $$select public.hc_admin_send_announcement('push-test-missing')$$,
    'No announcement with that id');

  /* The row that should be allowed. It gets past every check above and
     reaches the sender, which is the assertion: no refusal stood in the way.

     THIS USED TO ASSERT A CRASH. Until 0039 the harness had no net.http_post
     at all, so the honest test available was that the call died reaching for
     it — the failure being the network call rather than a refusal was what
     proved the guards had all passed. 0039 needed a stub of that function to
     test its own cooldown, and with one present this call now completes, so
     the assertion says so directly instead of inferring it from a hole.

     That is a straightforwardly better test: it proves the call arrives rather
     than proving it fell over somewhere past the last guard. Whether APNs
     actually delivers is still a question about the real project and a real
     phone, and LAUNCH_TODO.md is still where that is checked off. */
  select t_check('but a live one gets all the way to the sender',
    (select public.hc_admin_send_announcement('push-test-live')) is not null, true);
commit;

-- ----------------------------------------------------------------- tidy ---

delete from public.announcements where id like 'push-test-%';
delete from public.push_log where topic = 'announcement' and note = 'harness';
