-- ===========================================================================
-- The Instagram sync telling somebody when it stops.
--
-- What is checked: who may read and store the API token, and that the watch
-- asks for exactly the pushes it should, at the hours it should, once per
-- outage, and not for a sync that is merely having a bad hour. Nothing here
-- reaches APNs or Instagram: net.http_post is swapped for a recorder, so
-- "a push was asked for" is a row in t_sent.
--
-- The clock is p_now, fixed. 18:00 UTC on 18 October 2026 is 1pm in Chicago.
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

insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_push_cron_secret', 'harness-secret')
on conflict (name) do nothing;

/* The real vault's two writers, with their real signatures, for as long as
   this file runs. Not in harness.sql, because earlier migrations take their
   presence to mean a real vault and go on to read vault.secrets. Nothing is
   encrypted, which is fine: what is asked is who may store a token and
   whether the stored one comes back. */
create or replace function vault.create_secret(
  new_secret text, new_name text default null,
  new_description text default '', new_key_id uuid default null
) returns uuid language sql as $$
  insert into vault.decrypted_secrets (name, decrypted_secret)
  values (new_name, new_secret)
  returning id;
$$;

create or replace function vault.update_secret(
  secret_id uuid, new_secret text default null, new_name text default null,
  new_description text default null, new_key_id uuid default null
) returns void language sql as $$
  update vault.decrypted_secrets
     set decrypted_secret = coalesce(new_secret, decrypted_secret),
         name = coalesce(new_name, name),
         updated_at = now()
   where id = secret_id;
$$;

-- What the watch asks send-push for, instead of asking it.
create table public.t_sent (n bigint generated always as identity, body jsonb);
create or replace function net.http_post(
  url                  text,
  body                 jsonb   default '{}'::jsonb,
  params               jsonb   default '{}'::jsonb,
  headers              jsonb   default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into public.t_sent (body) values (body) returning n;
$$;

delete from public.instagram_sync_runs;

-- A run of the hourly job, `hours` before the fixed clock.
create or replace function t_run(hours numeric, good boolean, how text default 'cron')
returns void language sql as $$
  insert into public.instagram_sync_runs (ran_at, ok, trigger, error)
  values (timestamptz '2026-10-18 18:00:00+00' - make_interval(secs => hours * 3600),
          good, how,
          case when good then null else 'Instagram is sending its app instead of the posts. the newest stored post: no posts, only JavaScript' end);
$$;

create or replace function t_watch(hours_later numeric default 0)
returns text language sql as $$
  select public.hc_instagram_watch(timestamptz '2026-10-18 18:00:00+00' + make_interval(secs => hours_later * 3600));
$$;

-- ------------------------------------------------------------ the token ---

select t_check('no token is no row', (select count(*)::int from public.hc_instagram_token()), 0);

select t_raises_like('an empty paste is refused',
  $$select public.hc_instagram_save_token('  ')$$, 'paste the token');
select t_raises_like('so is something that is not a token',
  $$select public.hc_instagram_save_token('IGAA and then some words')$$, 'does not look like');

select t_check('a token is stored',
  public.hc_instagram_save_token('IGAAfirst' || repeat('x', 60)), 'stored');
select t_check('and comes back',
  (select token from public.hc_instagram_token()), 'IGAAfirst' || repeat('x', 60));
select t_check('with when it was stored',
  (select saved_at is not null from public.hc_instagram_token()), true);

select public.hc_instagram_save_token('IGAAsecond' || repeat('y', 60));
select t_check('storing again replaces it rather than adding a second',
  (select count(*)::int from vault.decrypted_secrets where name = 'hc_instagram_token'), 1);
select t_check('and the new one is what comes back',
  (select token from public.hc_instagram_token()), 'IGAAsecond' || repeat('y', 60));

begin;
  set local role anon;
  select t_raises_like('the app cannot read the token',
    $$select * from public.hc_instagram_token()$$, 'permission denied');
commit;

begin;
  set local role authenticated;
  select t_raises_like('nor can somebody signed in',
    $$select * from public.hc_instagram_token()$$, 'permission denied');
  select t_raises_like('or replace it',
    $$select public.hc_instagram_save_token('IGAAevil' || repeat('z', 60))$$, 'permission denied');
  select t_raises_like('or set off the watch',
    $$select public.hc_instagram_watch()$$, 'permission denied');
commit;

begin;
  set local role service_role;
  select t_check('the Edge Function, as service_role, can read it',
    (select count(*)::int from public.hc_instagram_token()), 1);
commit;

-- ------------------------------------------------------------ the topic ---

select t_check('there is still one hc_send_push',
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_send_push'), 1);

select t_check('hc_send_push knows the topic',
  (select public.hc_send_push('instagram_sync', true, 'stalled') is not null), true);
select t_raises_like('and still refuses one it does not',
  $$select public.hc_send_push('instagram_sync_typo', true, null)$$, 'unknown topic');

insert into public.push_log (topic, note) values ('instagram_sync', 'harness'), ('cafe_ready', 'harness');
select t_check('push_log takes the topic, and still takes the cafe''s',
  (select count(*)::int from public.push_log where note = 'harness'), 2);
delete from public.push_log where note = 'harness';

delete from public.t_sent;

-- ------------------------------------------------------------ the watch ---

select t_check('with no runs yet there is nothing to say', t_watch(), 'no runs yet');

select t_run(1, true);
select t_check('a good run an hour ago is working', t_watch(), 'working');

-- Instagram has a bad afternoon: three refused hours.
select t_run(-1, false);
select t_run(-2, false);
select t_run(-3, false);
select t_check('three bad hours is not an outage yet',
  t_watch(3) like 'failing since % under six hours', true);
select t_check('and nobody is told', (select count(*)::int from public.t_sent), 0);

-- It goes on. Six hours after the first bad run is 8pm in Chicago.
select t_run(-4, false); select t_run(-5, false); select t_run(-6, false); select t_run(-7, false);
select t_check('six hours after the first bad run, the admins are told',
  t_watch(7) like 'told the admins: stuck since %', true);
select t_check('one push, the stalled one',
  (select array_agg(body->>'topic' || ' ' || coalesce(body->>'ref', '')) from public.t_sent),
  array['instagram_sync stalled']);
select t_check('it is a real send, not a dry run',
  (select (body->>'dry_run')::boolean from public.t_sent), false);
select t_check('the outage is dated from its first bad run',
  (select stalled_since from public.instagram_sync_watch),
  timestamptz '2026-10-18 18:00:00+00' + interval '1 hour');

select t_run(-8, false);
select t_check('an hour later they are not told again',
  t_watch(8) like '%the admins know', true);
select t_check('still one push', (select count(*)::int from public.t_sent), 1);

-- Three days on, at 1pm, still stuck.
select t_check('three days later they are reminded',
  t_watch(7 + 72) like 'reminded the admins:%', true);
select t_check('two pushes now', (select count(*)::int from public.t_sent), 2);
select t_check('and not a third the hour after',
  t_watch(8 + 72) like '%the admins know', true);

-- It comes back at 7am in Chicago on the 22nd, before anybody is up.
select t_run(-90, true);
select t_check('good news before 8am waits for 8am',
  t_watch(90) like 'working again; telling the admins at 8am', true);
select t_check('so nothing is sent before then', (select count(*)::int from public.t_sent), 2);
select t_check('and at noon it is',
  t_watch(95) like 'told the admins: working again', true);
select t_check('the recovery names when the outage began, so it can count what was caught up',
  (select body->>'ref' from public.t_sent order by n desc limit 1), 'recovered:2026-10-18T19:00:00Z');
select t_check('the outage is closed',
  (select (stalled_since is null and told = 'recovered') from public.instagram_sync_watch), true);
select t_run(-95, true);
select t_check('and with the job running there is nothing more to say', t_watch(96), 'working');

-- Runs by hand are somebody watching, not the hourly job failing.
select t_run(-97, false, 'links'); select t_run(-98, false, 'links');
select t_check('failed runs by hand are not an outage', t_watch(99), 'working');

/* Silence is an outage too. Six hours with no hourly run at all is what a
   crashed function or a broken door looks like from here, because neither
   writes a row. The last run heard was at 95 hours. */
select t_check('six silent hours at 10pm in Chicago wait for the morning',
  t_watch(105) like 'stuck since %telling the admins at 8am', true);
select t_check('and nothing is sent overnight', (select count(*)::int from public.t_sent), 3);
select t_check('at 8am the admins are told',
  t_watch(115) like 'told the admins: stuck since %', true);
select t_check('dated from the last run that was heard',
  (select stalled_since from public.instagram_sync_watch),
  timestamptz '2026-10-18 18:00:00+00' + interval '95 hours');

-- --------------------------------------------------------------- status ---

select t_check('status is one row', (select count(*)::int from public.hc_instagram_status()), 1);
select t_check('and says a token is stored, without saying what it is',
  (select api_token_stored is not null from public.hc_instagram_status()), true);
select t_check('and what the admins were last told',
  (select admins_told from public.hc_instagram_status()), 'stalled');

-- -------------------------------------------------------------- tidy up ---

delete from public.instagram_sync_runs;
delete from vault.decrypted_secrets where name = 'hc_instagram_token';
update public.instagram_sync_watch set stalled_since = null, alerted_at = null, told = null;
drop table public.t_sent;
drop function vault.create_secret(text, text, text, uuid);
drop function vault.update_secret(uuid, text, text, text, uuid);
create or replace function net.http_post(
  url                  text,
  body                 jsonb   default '{}'::jsonb,
  params               jsonb   default '{}'::jsonb,
  headers              jsonb   default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select 1::bigint $$;
