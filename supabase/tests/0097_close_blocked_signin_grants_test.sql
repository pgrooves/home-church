-- ===========================================================================
-- 0097: the blocked sign-in list is closed to the app's roles, and the guard
-- on auth.users still fires without anybody holding EXECUTE on it.
--
-- The second half is the one that matters. If Postgres checked EXECUTE when
-- a trigger fires, taking it back would stop every new sign-up. It does not,
-- and this proves it with a role that has insert on auth.users and nothing
-- else, which is the shape of Supabase Auth's own connection.
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

-- ---------------------------------------------------------- the grants ---

select t_check('0097: anon holds nothing on the blocked list',
  has_table_privilege('anon', 'public.hc_blocked_signin_emails', 'SELECT')
    or has_table_privilege('anon', 'public.hc_blocked_signin_emails', 'INSERT'), false);
select t_check('0097: nor does a signed in person',
  has_table_privilege('authenticated', 'public.hc_blocked_signin_emails', 'SELECT')
    or has_table_privilege('authenticated', 'public.hc_blocked_signin_emails', 'DELETE'), false);
select t_check('0097: nobody outside the server can call the guard',
  has_function_privilege('anon', 'public.hc_refuse_blocked_signin()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.hc_refuse_blocked_signin()', 'EXECUTE'), false);

begin;
  set local role anon;
  select t_raises('0097: and reading the list as anon is refused outright',
    $$select * from public.hc_blocked_signin_emails$$, '42501');
commit;

-- ------------------------------------------- the guard still fires ---

create role hc_t_signup;
grant usage on schema auth to hc_t_signup;
grant insert, select on auth.users to hc_t_signup;

begin;
  set local role hc_t_signup;
  insert into auth.users (email) values ('somebody.new@example.com');
  select t_check('0097: an ordinary sign-up still goes through',
    (select count(*) from auth.users where email = 'somebody.new@example.com')::int, 1);
  select t_raises('0097: and a blocked address is still refused, by a role that cannot call the guard',
    $$insert into auth.users (email) values ('homechurchapp+host@gmail.com')$$, 'P0001');
commit;

drop owned by hc_t_signup;
drop role hc_t_signup;
