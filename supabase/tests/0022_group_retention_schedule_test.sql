-- ===========================================================================
-- The retention schedule.
--
-- pg_cron is not installed on the throwaway Postgres these tests run against,
-- and installing it would test pg_cron rather than this project. So what is
-- checked here is the thing that actually goes wrong: a migration that
-- schedules a job must not blow up, and must not quietly half apply, on a
-- database where the extension is missing. That is the state of the Supabase
-- project until somebody ticks the box, and a migration that errors there is
-- one nobody finishes running.
--
-- The sweep itself is tested in 0016. This is about the wiring.
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

-- run.sh applies every migration twice before any test runs, so reaching this
-- line at all is the first assertion: it applied, twice, with no pg_cron.
select t_check('the migration applies on a database with no pg_cron',
  true, true);

select t_check('and did not leave a half made extension behind',
  (select count(*)::int from pg_extension where extname = 'pg_cron'), 0);

-- The sweep is still there and still callable by the only role that should.
select t_check('the sweep survived',
  (select count(*)::int from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'hc_purge_group_rooms'), 1);

select t_check('and still belongs to service_role alone',
  (select coalesce(string_agg(r.role, ', ' order by r.role), 'none')
     from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where has_function_privilege(r.role, 'public.hc_purge_group_rooms(integer)', 'EXECUTE')),
  'service_role');

-- And it still does the thing, on a room old enough to go. Built here rather
-- than reused, because 0016's test already swept its own room away.
insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-00000000000f', 'oldhost@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_host, terms_accepted_at) values
  ('f0000000-0000-0000-0000-00000000000f', 'Opal', true, now())
  on conflict (id) do update set can_host = excluded.can_host,
                                 terms_accepted_at = excluded.terms_accepted_at;

create table if not exists t_ret (k text primary key, v text);
delete from t_ret;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-00000000000f"}';
  insert into t_ret select 'room', (public.hc_room_open(
    'g-old', 'A guide', 'Old', '[{"heading":"h","body":"A question"}]'::jsonb)).id::text;
  select public.hc_room_post((select v from t_ret where k='room')::uuid,
    (select id from public.group_room_questions
      where room_id = (select v from t_ret where k='room')::uuid limit 1),
    'answer', 'Something written in March.');
commit;

update public.group_rooms set opened_at = now() - interval '91 days'
 where id = (select v from t_ret where k = 'room')::uuid;

select t_check('a room past ninety days is swept',
  public.hc_purge_group_rooms(90), 1);
select t_check('and what was written in it went with it',
  (select count(*)::int from public.group_room_notes
    where body = 'Something written in March.'), 0);
