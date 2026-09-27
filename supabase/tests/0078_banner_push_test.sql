-- ===========================================================================
-- Telling everybody what the pinned banner says.
--
-- Same limits as 0027's test: nothing here reaches APNs. What is checked is
-- who may ask, and that a banner nobody can see is refused before anything
-- is sent.
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
  ('ee000000-0000-0000-0000-000000000001', 'badmin@example.com'),
  ('ee000000-0000-0000-0000-000000000002', 'bmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ee000000-0000-0000-0000-000000000001', 'Ada'),
  ('ee000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin' where id = 'ee000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member' where id = 'ee000000-0000-0000-0000-000000000002';

insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_push_cron_secret', 'harness-secret')
on conflict (name) do nothing;

-- ------------------------------------------------------------- the topic ---

insert into public.push_log (topic, note) values ('banner', 'harness');

select t_check('push_log accepts the banner topic',
  (select count(*)::int from public.push_log
    where topic = 'banner' and note = 'harness'), 1);

delete from public.push_log where topic = 'banner' and note = 'harness';

select t_check('there is still one hc_send_push, not two',
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_send_push'), 1);

-- --------------------------------------------------------- who may ask ---

update public.app_settings set value_bool = true where key = 'home_banner_on';
update public.app_settings set value_text = 'No service Sunday.' where key = 'home_banner_message';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000002"}';

  select t_raises_like('a member cannot send the banner',
    $$select public.hc_admin_send_banner()$$,
    'Admins only');
commit;

begin;
  set local role anon;

  select t_raises_like('and neither can a signed out phone',
    $$select public.hc_admin_send_banner()$$,
    'permission denied');
commit;

-- ------------------------------------------ a banner nobody can see ---

update public.app_settings set value_bool = false where key = 'home_banner_on';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';

  select t_raises_like('an admin cannot send a banner that is off',
    $$select public.hc_admin_send_banner()$$,
    'banner is off');
commit;

update public.app_settings set value_bool = true where key = 'home_banner_on';
update public.app_settings set value_text = '   ' where key = 'home_banner_message';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';

  select t_raises_like('nor one that says nothing',
    $$select public.hc_admin_send_banner()$$,
    'banner is empty');
commit;

update public.app_settings set value_text = 'No service Sunday.' where key = 'home_banner_message';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';

  select t_check('but one that is on and says something reaches the sender',
    (select public.hc_admin_send_banner()) is not null, true);
commit;

-- ----------------------------------------------------------------- tidy ---

update public.app_settings set value_bool = false where key = 'home_banner_on';
update public.app_settings set value_text = '' where key = 'home_banner_message';
