-- ===========================================================================
-- Home Church, addresses that can never be emailed a sign-in code
--
-- WHY THIS EXISTS. homechurchapp+host@gmail.com was handed to a tester at
-- some point, and something on a test iPhone in a data center kept typing it
-- into the sign-in field once or twice a day. The account never finished
-- signing in, so every attempt landed in Supabase Auth's "unconfirmed
-- signup" path, which sends a fresh confirmation code each time and does not
-- look at banned_until at all. Banning the account stopped it signing in; it
-- did not stop the emails.
--
-- WHAT THIS DOES. Two things, and it takes both:
--   1. Moves the existing account off the address, to one that goes nowhere,
--      so a code request no longer finds an unconfirmed user to re-send to.
--   2. Refuses to create any new auth user whose email is on the list below.
--      The app asks for codes with create_user: true (js/auth.js), so without
--      this the next request would simply make a fresh account and email it.
--      The insert fails inside Auth's transaction, before any mail is sent,
--      and the phone sees the ordinary "could not send a code" error.
--
-- Every other address signs in exactly as before.
--
-- TO LET AN ADDRESS BACK IN, delete its row:
--   delete from public.hc_blocked_signin_emails where email = '...';
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once.
-- ===========================================================================


-- 1. The list --------------------------------------------------------------
--
-- Lowercase addresses. No policies, so with RLS on nobody reads or writes it
-- through the API; only the trigger below and the SQL editor touch it.

create table if not exists public.hc_blocked_signin_emails (
  email      text primary key check (email = lower(email)),
  reason     text,
  created_at timestamptz not null default now()
);

alter table public.hc_blocked_signin_emails enable row level security;

insert into public.hc_blocked_signin_emails (email, reason)
values ('homechurchapp+host@gmail.com',
        'Given to a tester; unwanted code emails once or twice a day.')
on conflict (email) do nothing;


-- 2. The refusal -----------------------------------------------------------
--
-- Security definer because it reads a table the auth role has no grant on,
-- with search_path pinned for the same reason as hc_handle_new_user in 0009.

create or replace function public.hc_refuse_blocked_signin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and exists (
    select 1 from public.hc_blocked_signin_emails b
    where b.email = lower(new.email)
  ) then
    raise exception 'sign-in is not available for this address'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function public.hc_refuse_blocked_signin() is
  'Stops Auth creating a user for an address in hc_blocked_signin_emails.';

drop trigger if exists hc_refuse_blocked_signin on auth.users;
create trigger hc_refuse_blocked_signin
  before insert on auth.users
  for each row execute function public.hc_refuse_blocked_signin();


-- 3. The existing account --------------------------------------------------
--
-- Kept, banned, and moved to an address that cannot receive mail, so nothing
-- that pointed at its id breaks. Only matches while it still holds a blocked
-- address, so a second run does nothing.

update auth.users u
set email = 'blocked+' || u.id::text || '@invalid.invalid',
    banned_until = 'infinity'
where lower(u.email) in (select email from public.hc_blocked_signin_emails);

update auth.identities i
set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email))
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and lower(i.identity_data->>'email') in
      (select email from public.hc_blocked_signin_emails);
