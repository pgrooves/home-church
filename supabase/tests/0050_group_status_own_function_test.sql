-- ===========================================================================
-- The button points at its own function.
--
-- WHAT IS WORTH TESTING. One string, and it is worth a test because of how it
-- fails. A URL that is wrong does not raise: pg_net accepts the request, the
-- function returns a request id, the button spins for its minute and then says
-- nothing came back — which is also what a busy model looks like. That is the
-- exact failure this migration exists because of, in the other direction.
--
-- So this asserts what the function posts to, and that every guard 0048 put in
-- front of it survived being rewritten: the admin check, the cooldown, and the
-- grants. A copy-paste that dropped the hc_is_admin() line would otherwise be
-- invisible until somebody who is not an admin pressed a button they should
-- not have been able to reach.
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
  ('ff000000-0000-0000-0000-000000000001', 'uadmin@example.com'),
  ('ff000000-0000-0000-0000-000000000002', 'umember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ff000000-0000-0000-0000-000000000001', 'Ada'),
  ('ff000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ff000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ff000000-0000-0000-0000-000000000002';

insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_newsletter_cron_secret', 'test-secret')
on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;

delete from public.group_status_runs;

-- ----------------------------------------------------------------- the URL ---

select t_check('the button posts to the group-status function',
  (select prosrc like '%/functions/v1/group-status%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_refresh_group_status'), true);

/* And not to the mailbox reader any more, which is the half of this that
   actually broke: posting there is not an error, it is a mailbox check that
   writes to the wrong log and leaves this feature looking hung. */
select t_check('and not at the newsletter intake it used to share',
  (select prosrc like '%newsletter-intake%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_refresh_group_status'), false);

-- It still reads the newsletter's secret on purpose: Edge Function secrets are
-- project wide, so there is nothing new to set up. Asserted so that "it uses
-- its own function now" is never read as "it needs its own secret".
select t_check('while still proving itself with the secret already set',
  (select prosrc like '%hc_newsletter_cron_secret%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_refresh_group_status'), true);

-- -------------------------------------------------------------- the guards ---

select t_check('it is still security definer',
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_refresh_group_status'), true);

select t_check('with a pinned search_path, per 0011',
  (select proconfig is not null from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_refresh_group_status'), true);

select t_check('anon still cannot call it',
  has_function_privilege('anon', 'public.hc_admin_refresh_group_status()', 'EXECUTE'), false);

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_refresh_group_status();
  raise warning 'FAIL  a member still cannot press it';
exception when insufficient_privilege then
  raise notice 'PASS  a member still cannot press it';
end
$$;

reset role;

do $$
declare v_request bigint;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  v_request := public.hc_admin_refresh_group_status();
  if v_request is null then raise warning 'FAIL  an admin still can';
  else raise notice 'PASS  an admin still can'; end if;
end
$$;

reset role;

-- ------------------------------------------------------------ the cooldown ---

insert into public.group_status_runs (ok, ran_at) values (true, now());

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_refresh_group_status();
  raise warning 'FAIL  and the cooldown survived the rewrite';
exception
  when insufficient_privilege then
    raise warning 'FAIL  and the cooldown survived the rewrite (refused as an admin, not as a repeat)';
  when others then
    raise notice 'PASS  and the cooldown survived the rewrite';
end
$$;

reset role;

delete from public.group_status_runs;
delete from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';
