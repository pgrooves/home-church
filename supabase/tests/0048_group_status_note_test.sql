-- ===========================================================================
-- The home groups box.
--
-- WHAT IS WORTH TESTING HERE, and it is not the shortening. What Gemini
-- writes is judged by a person reading it, and the check that it kept every
-- link and date lives in the Edge Function where the announcement and the
-- answer are both in hand. What this file is for is the part of the feature
-- that is a permission boundary, which is all of it that Postgres owns:
--
--   who       both functions are the door. hc_admin_set_group_note writes a
--             column no client role has a grant on, and
--             hc_admin_refresh_group_status reads a vault secret that must
--             never reach a phone. If either opened for a member then the
--             narrow grants 0030 and 0031 spent two migrations building would
--             be decorative. Asserted as a real signed in member.
--
--   the URL   the one check that is a rule rather than a role. An admin may
--             put a picture in this box; an admin may not point it at
--             somewhere else on the internet, because that is a tracking
--             pixel on the Connect tab. Asserted as an admin, which is the
--             only way to reach the refusal at all.
--
--   how often the cooldown, the only thing between a frustrated thumb and
--             eight model calls. Tested by moving the log's clock rather than
--             by sleeping.
--
--   the log   admins read it, nobody else does, and nobody writes it from a
--             session. It carries the previous note, which is the undo.
--
-- The pg_net call is stubbed by harness.sql, which is the right seam:
-- everything this migration adds happens before a request leaves the database.
--
-- WHY hc_admin_set_group_note IS CALLED WITH FOUR ARGUMENTS BELOW when this
-- migration gave it two. 0054 added the button under the card and replaced the
-- function with one that writes all four parts of it, dropping the old
-- signature rather than defaulting the new parameters — see its section 3 for
-- why a default there would silently delete a link. These tests run against
-- the schema every migration has finished with, so they call what is actually
-- there. Everything they assert is still this migration's: who may write the
-- card, that a picture has to be ours, and that clearing it stores nothing.
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
  ('cc000000-0000-0000-0000-000000000001', 'gadmin@example.com'),
  ('cc000000-0000-0000-0000-000000000002', 'gmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('cc000000-0000-0000-0000-000000000001', 'Ada'),
  ('cc000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'cc000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'cc000000-0000-0000-0000-000000000002';

-- The button reads this before it posts anything, and the harness vault starts
-- empty. Without it every call below fails on the secret rather than on the
-- thing being tested.
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_newsletter_cron_secret', 'test-secret')
on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;

delete from public.group_status_runs;

-- --------------------------------------------------------------- the shape ---

select t_check('the column is there for the flyer',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'church_profile'
      and column_name = 'groups_note_image_url'), 1);

select t_check('and no client role may write it directly',
  (select bool_or(has_column_privilege(r.role, 'public.church_profile',
                                       'groups_note_image_url', 'UPDATE'))
     from unnest(array['anon', 'authenticated']) as r(role)), false);

/* The paragraph beside it keeps the grant 0030 gave it. Edit mode still turns
   it into a text box on Connect, and this migration must not have quietly
   taken that away by moving the write into a function. */
select t_check('while the paragraph is still writable where it is read',
  has_column_privilege('authenticated', 'public.church_profile',
                       'groups_off_season_note', 'UPDATE'), true);

select t_check('both functions are security definer',
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname in ('hc_admin_set_group_note', 'hc_admin_refresh_group_status')), 2);

select t_check('with pinned search_paths, per 0011',
  (select bool_and(p.proconfig is not null)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hc_admin_set_group_note', 'hc_admin_refresh_group_status')), true);

select t_check('and the button takes no arguments, so there is nothing to point it at',
  (select pronargs::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_admin_refresh_group_status'), 0);

-- -------------------------------------------------------------- the grants ---

select t_check('anon cannot call either of them',
  (select bool_or(has_function_privilege('anon', f, 'EXECUTE'))
     from unnest(array['public.hc_admin_set_group_note(text, text, text, text)',
                       'public.hc_admin_refresh_group_status()']) as t(f)), false);

select t_check('authenticated can, and hc_is_admin narrows that inside',
  (select bool_and(has_function_privilege('authenticated', f, 'EXECUTE'))
     from unnest(array['public.hc_admin_set_group_note(text, text, text, text)',
                       'public.hc_admin_refresh_group_status()']) as t(f)), true);

-- ------------------------------------------------------------- as a member ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_set_group_note('Groups are open, come along.', null, null, null);
  raise warning 'FAIL  a member cannot write the home groups box';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot write the home groups box';
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_refresh_group_status();
  raise warning 'FAIL  a member cannot press the button';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot press the button';
end
$$;

reset role;

select t_check('and nothing they did reached the box',
  (select groups_off_season_note is distinct from 'Groups are open, come along.'
     from public.church_profile where id = 'church-home'), true);

-- ------------------------------------------------------------ as an admin ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note(
    'Home groups open Sunday, September 6 at 9:00am. Text Season 3 to (833) 801-3857.',
    'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/2026-09/flyer.jpg',
    null, null);
end
$$;

reset role;

select t_check('an admin can write the paragraph',
  (select groups_off_season_note from public.church_profile where id = 'church-home'),
  'Home groups open Sunday, September 6 at 9:00am. Text Season 3 to (833) 801-3857.');

select t_check('and the flyer with it, in the same call',
  (select groups_note_image_url from public.church_profile where id = 'church-home'),
  'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/2026-09/flyer.jpg');

-- --------------------------------------------------------- the picture rule ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note('Groups are open.',
                                         'https://example.com/tracker.gif',
                                         null, null);
  raise warning 'FAIL  a picture from somewhere else is refused';
exception
  when insufficient_privilege then
    raise warning 'FAIL  a picture from somewhere else is refused (refused as an admin, not as a link)';
  when others then
    raise notice 'PASS  a picture from somewhere else is refused';
end
$$;

reset role;

select t_check('and the refusal left the flyer that was there alone',
  (select groups_note_image_url like '%supabase.co/storage/%'
     from public.church_profile where id = 'church-home'), true);

-- An empty note and an empty picture are how the box is cleared, and they are
-- stored as null rather than as ''. The screen tells them apart: no note and
-- no flyer draws no card at all.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note('  ', '', '', '');
end
$$;

reset role;

select t_check('clearing it stores nothing rather than an empty string',
  (select groups_off_season_note is null and groups_note_image_url is null
     from public.church_profile where id = 'church-home'), true);

-- Put the seed sentence back, so a re-run of this file starts where it did.
update public.church_profile
   set groups_off_season_note = 'Home groups are between seasons right now. When the next one starts this is where you will find it, and we will make sure you hear about it before it fills up.'
 where published;

-- -------------------------------------------------------------- the button ---

do $$
declare
  v_request bigint;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  v_request := public.hc_admin_refresh_group_status();
  if v_request is null then
    raise warning 'FAIL  an admin can press the button';
  else
    raise notice 'PASS  an admin can press the button';
  end if;
end
$$;

reset role;

-- ------------------------------------------------------------ the cooldown ---
-- A run that has just finished. The clock is moved rather than slept against,
-- so this asserts the rule instead of asserting that time passes.

insert into public.group_status_runs (ok, ran_at) values (true, now());

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_refresh_group_status();
  raise warning 'FAIL  a second press straight away is refused';
exception
  when insufficient_privilege then
    raise warning 'FAIL  a second press straight away is refused (refused as an admin, not as a repeat)';
  when others then
    raise notice 'PASS  a second press straight away is refused';
end
$$;

reset role;

update public.group_status_runs set ran_at = now() - interval '1 minute';

do $$
declare
  v_request bigint;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  v_request := public.hc_admin_refresh_group_status();
  if v_request is null then
    raise warning 'FAIL  and allowed again once the cooldown has passed';
  else
    raise notice 'PASS  and allowed again once the cooldown has passed';
  end if;
end
$$;

reset role;

-- ----------------------------------------------------------------- the log ---
-- The undo lives in here, so who can read it matters as much as who can write
-- it: previous_note is a sentence the church has already published, but the
-- table is an admin's working record and there is nothing in it for anybody
-- else.

delete from public.group_status_runs;

insert into public.group_status_runs (ok, changed, announcement_id, previous_note, new_note, note)
values (true, true, null, 'What it said before.', 'What it says now.', 'Shortened from a test.');

do $$
declare v_seen int;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000002"}';
  select count(*)::int into v_seen from public.group_status_runs;
  if v_seen = 0 then raise notice 'PASS  a member sees no runs at all';
  else raise warning 'FAIL  a member sees no runs at all  (saw %)', v_seen; end if;
end
$$;

reset role;

do $$
declare v_seen int;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  select count(*)::int into v_seen from public.group_status_runs;
  if v_seen = 1 then raise notice 'PASS  an admin sees the last run';
  else raise warning 'FAIL  an admin sees the last run  (saw %)', v_seen; end if;
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';
  insert into public.group_status_runs (ok) values (true);
  raise warning 'FAIL  not even an admin writes the log from a session';
exception when insufficient_privilege then
  raise notice 'PASS  not even an admin writes the log from a session';
end
$$;

reset role;

delete from public.group_status_runs;
delete from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';
