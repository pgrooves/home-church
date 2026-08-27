-- ===========================================================================
-- Registering a phone for push.
--
-- WHAT THIS FILE IS REALLY FOR. The bug it exists to prevent was not a wrong
-- answer, it was no answer: device_tokens had never held a single row, and
-- nothing anywhere said so. The app posted an upsert, Postgres refused it for
-- want of SELECT, PostgREST returned 403, and `if (!res.ok) return false` in
-- js/native.js turned that into a quiet false on a path with no error surface.
-- Every switch in Profile looked right and no phone was ever reachable.
--
-- So the assertions below are shaped around the two halves of that. First,
-- that anon can complete a registration at all, including the second one,
-- because it was specifically the CONFLICT branch that needed the privilege
-- nobody had. Second, that it still cannot read the table, because granting
-- SELECT is the obvious fix and is the one 0010 spent a page refusing.
--
-- The old harness stub of device_tokens had no RLS and no revoke, so it would
-- have passed every one of these while production failed all of them. That
-- stub is fixed in harness.sql alongside this file.
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

-- Runs a statement as anon and says whether it got through, so a privilege
-- failure reads as a FAIL on the line that describes it rather than as an
-- ERROR that stops the file.
create or replace function t_as_anon(label text, stmt text)
returns void language plpgsql as $$
begin
  set local role anon;
  execute stmt;
  reset role;
  raise notice 'PASS  %', label;
exception
  when others then
    reset role;
    raise warning 'FAIL  %  (%)', label, sqlerrm;
end;
$$;

delete from public.device_tokens where token like 'reg-test-%';


-- --------------------------------------------------- the registration path --

/* The first one is a plain insert and would have passed before 0037 too. It is
   here so a failure tells you which of the two branches broke. */
select t_as_anon('a phone can register itself',
  $$select public.hc_register_device_token('reg-test-alpha', 'ios', true, true, false, true)$$);

select t_check('and the row is there, active',
  (select active from public.device_tokens where token = 'reg-test-alpha'), true);

/* THE ONE THAT WAS BROKEN. Registering again is the ON CONFLICT DO UPDATE
   branch, which needs SELECT on the table on top of INSERT and UPDATE, because
   Postgres reads the conflicting row to resolve the conflict. anon has never
   had SELECT here and never will, so this is exactly the statement that used
   to come back 42501. js/native.js re-registers on every launch, so this path
   ran more often than the one above. */
select t_as_anon('and can register again, which is the whole bug',
  $$select public.hc_register_device_token('reg-test-alpha', 'ios', false, false, false, false)$$);

select t_check('the second registration replaces the preferences',
  (select wants_new_guide or wants_sunday_reminder or wants_group_day or wants_announcements
     from public.device_tokens where token = 'reg-test-alpha'), false);

select t_check('and does not make a second row',
  (select count(*)::int from public.device_tokens where token = 'reg-test-alpha'), 1);


-- ------------------------------------------------------------ coming back --

/* Somebody turned every switch off, which set active false, and later changed
   their mind. Re-registering has to undo that or the phone stays silent while
   the app says otherwise. Same for the failure count: a token that just
   registered belongs to a phone that is awake. */
update public.device_tokens
   set active = false, failure_count = 4, last_error = 'BadDeviceToken'
 where token = 'reg-test-alpha';

select t_as_anon('a phone that was switched off can come back',
  $$select public.hc_register_device_token('reg-test-alpha', 'ios', true, true, false, true)$$);

select t_check('registering reactivates the row',
  (select active from public.device_tokens where token = 'reg-test-alpha'), true);

select t_check('and clears the stale failures against it',
  (select failure_count = 0 and last_error is null
     from public.device_tokens where token = 'reg-test-alpha'), true);


-- ------------------------------------------------------- what it will not do --

select t_raises_like('an empty token is refused',
  $$select public.hc_register_device_token('')$$,
  'a token is required');

select t_raises_like('a null token is refused',
  $$select public.hc_register_device_token(null)$$,
  'a token is required');

select t_raises_like('the column is not free storage',
  $$select public.hc_register_device_token(repeat('a', 513))$$,
  'not a device token');

select t_raises_like('and a platform nobody ships is refused',
  $$select public.hc_register_device_token('reg-test-beta', 'blackberry')$$,
  'unknown platform');

select t_check('so none of those left a row behind',
  (select count(*)::int from public.device_tokens where token like 'reg-test-b%'), 0);


-- ------------------------------------------------- and still no phone list --

/* The point of doing this with a function at all. If any of these three start
   passing by being allowed, the publishable key that ships in the app becomes
   a download link for every phone that has it installed. 0010 is the argument;
   this is the check. */
select t_check('anon has no SELECT on the table',
  has_table_privilege('anon', 'public.device_tokens', 'SELECT'), false);

select t_check('anon has no DELETE either',
  has_table_privilege('anon', 'public.device_tokens', 'DELETE'), false);

select t_raises_like('so anon cannot read the phone list',
  $$set local role anon; select token from public.device_tokens limit 1$$,
  'permission denied');

reset role;

select t_check('and the function anon does have is the only new opening',
  has_function_privilege('anon',
    'public.hc_register_device_token(text,text,boolean,boolean,boolean,boolean)',
    'EXECUTE'), true);

select t_check('it is security definer, or none of the above works',
  (select prosecdef from pg_proc where proname = 'hc_register_device_token'), true);

select t_check('with a pinned search_path, per 0011',
  (select proconfig is not null and 'search_path=public' = any(proconfig)
     from pg_proc where proname = 'hc_register_device_token'), true);

delete from public.device_tokens where token like 'reg-test-%';
