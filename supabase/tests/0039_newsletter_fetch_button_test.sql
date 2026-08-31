-- ===========================================================================
-- Fetch Announcements.
--
-- WHAT IS WORTH TESTING. The function is four lines of guard around a call
-- that already exists, so the guard is the whole of it:
--
--   who        hc_newsletter_tick is revoked from every client role on
--              purpose, because it reads a vault secret. This wrapper is the
--              one door an admin can reach, and if it opened for a member then
--              the revoke on the tick would be decorative. Asserted as a real
--              signed in member rather than read off the grant and believed.
--
--   how often  the cooldown, which is the only thing standing between a
--              frustrated thumb and eight mailbox reads. Tested by moving the
--              run log's clock rather than by sleeping, so the test says what
--              it means and runs instantly.
--
-- The tick itself is stubbed at the pg_net boundary by harness.sql. That is
-- the right seam: everything this migration adds happens before a request
-- would leave the database, and a test that actually posted to an Edge
-- Function would be testing Supabase rather than us.
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
  ('ee000000-0000-0000-0000-000000000001', 'fadmin@example.com'),
  ('ee000000-0000-0000-0000-000000000002', 'fmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ee000000-0000-0000-0000-000000000001', 'Ada'),
  ('ee000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ee000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ee000000-0000-0000-0000-000000000002';

-- The tick reads this before it does anything, and the harness vault starts
-- empty. Without it every call below fails on the secret rather than on the
-- thing being tested.
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_newsletter_cron_secret', 'test-secret')
on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;

delete from public.newsletter_runs;

-- ------------------------------------------------------------- the shape ---

select t_check('the function is security definer',
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_fetch_newsletter'), true);

select t_check('with a pinned search_path, per 0011',
  (select proconfig is not null from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_fetch_newsletter'), true);

select t_check('and it takes no arguments, so there is nothing to point it at',
  (select pronargs::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_fetch_newsletter'), 0);

-- ------------------------------------------------------------- the grants ---

select t_check('anon cannot call it',
  has_function_privilege('anon', 'public.hc_admin_fetch_newsletter()', 'EXECUTE'), false);

select t_check('authenticated can, and RLS narrows that to an admin inside',
  has_function_privilege('authenticated', 'public.hc_admin_fetch_newsletter()', 'EXECUTE'), true);

/* The thing this wrapper exists to keep shut. If the tick were reachable
   directly then the wrapper's guard would be a suggestion, so this is asserted
   here rather than assumed to have survived from 0038. */
select t_check('and the tick underneath is still nobody''s to call',
  (select bool_or(has_function_privilege(r.role, 'public.hc_newsletter_tick()', 'EXECUTE'))
     from unnest(array['anon', 'authenticated']) as r(role)), false);

-- ------------------------------------------------------------ as a member ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_fetch_newsletter();
  raise warning 'FAIL  a member cannot check the mailbox';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot check the mailbox';
end
$$;

reset role;

select t_check('and nothing they did reached the run log',
  (select count(*)::int from public.newsletter_runs), 0);

-- ------------------------------------------------------------ as an admin ---

do $$
declare
  v_request bigint;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  v_request := public.hc_admin_fetch_newsletter();
  if v_request is null then
    raise warning 'FAIL  an admin can check the mailbox';
  else
    raise notice 'PASS  an admin can check the mailbox';
  end if;
end
$$;

reset role;

-- ------------------------------------------------------------ the cooldown ---
-- A run that has just finished. The clock is moved rather than slept against,
-- so this asserts the rule instead of asserting that time passes.

insert into public.newsletter_runs (ok, ran_at) values (true, now());

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_fetch_newsletter();
  raise warning 'FAIL  a second check straight away is refused';
exception
  when insufficient_privilege then
    raise warning 'FAIL  a second check straight away is refused (refused as an admin, not as a repeat)';
  when others then
    raise notice 'PASS  a second check straight away is refused';
end
$$;

reset role;

-- Sixteen seconds later, in the only sense that matters here.
update public.newsletter_runs set ran_at = now() - interval '1 minute';

do $$
declare
  v_request bigint;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  v_request := public.hc_admin_fetch_newsletter();
  if v_request is null then
    raise warning 'FAIL  and allowed again once the cooldown has passed';
  else
    raise notice 'PASS  and allowed again once the cooldown has passed';
  end if;
end
$$;

reset role;

delete from public.newsletter_runs;
delete from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';
