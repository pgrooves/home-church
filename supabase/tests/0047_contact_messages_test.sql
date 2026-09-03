-- ===========================================================================
-- The contact form's table.
--
-- WHAT IS WORTH TESTING HERE, said first so a green run is not read as more
-- than it is. Whether an email arrives at hello@homechurchnola.com is a
-- question about Resend and a real project, and CONTACT_FORM_SETUP.md is where
-- that gets checked off by a person. What this file is about is the claim
-- migration 0047 makes in its header: that these rows are somebody's name,
-- their email address and whatever they decided to tell the church, and that
-- nothing holding the publishable key can read a single one of them.
--
-- That is the whole privacy argument for putting a form on Connect at all. The
-- app is shipped with the publishable key inside it, so "anon cannot read
-- this" is a claim about what the API hands a stranger, and the only honest
-- way to check it is to be that stranger and ask. Reading the policy and
-- nodding is not the same thing.
--
-- The second half is the constraints, which are the reason the table can be
-- written by a function holding the service role key without that being a
-- blank cheque, and the retention sweep, which is what makes the sentence in
-- the privacy policy about a hundred and eighty days true.
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

create or replace function t_allows(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'PASS  %', label;
exception
  when others then
    raise warning 'FAIL  %  (refused with "%")', label, sqlerrm;
end;
$$;


-- One admin and one member. Which of the two is looking is the only thing that
-- decides what comes back from this table, so both have to be here.
insert into auth.users (id, email) values
  ('cc000000-0000-0000-0000-000000000001', 'ada@example.com'),
  ('cc000000-0000-0000-0000-000000000002', 'sam@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name, last_name) values
  ('cc000000-0000-0000-0000-000000000001', 'Ada', 'Lovelace'),
  ('cc000000-0000-0000-0000-000000000002', 'Sam', 'Rivers')
  on conflict (id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name;

update public.profiles set role = 'admin'
  where id = 'cc000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
  where id = 'cc000000-0000-0000-0000-000000000002';

delete from public.contact_messages where name like 'Harness%';

-- Two messages, written the way the Edge Function writes them: as the service
-- role, which bypasses RLS, which is why the function needs no policy.
insert into public.contact_messages (name, email, message, sender_hash) values
  ('Harness One', 'one@example.com', 'Where do I park on a Sunday?', 'aaaa'),
  ('Harness Two', 'two@example.com', 'Can somebody call me this week?', 'bbbb');


-- ------------------------------------------------------- the constraints ---
-- Bounded in the table as well as in the function, because the function is not
-- the only thing that will ever hold the service role key.

select t_raises_like('a message with no name is refused',
  $$insert into public.contact_messages (name, email, message)
    values ('   ', 'one@example.com', 'Hello')$$,
  'contact_messages_name_check');

select t_raises_like('and one with nothing in it',
  $$insert into public.contact_messages (name, email, message)
    values ('Harness Three', 'one@example.com', '  ')$$,
  'contact_messages_message_check');

select t_raises_like('and one long enough to be storage rather than a message',
  format($$insert into public.contact_messages (name, email, message)
    values ('Harness Three', 'one@example.com', %L)$$, repeat('x', 4001)),
  'contact_messages_message_check');

select t_check('a delivered_at starts null, because nothing has been sent yet',
  (select count(*)::int from public.contact_messages
    where name like 'Harness%' and delivered_at is null), 2);


-- ------------------------------------------------- nobody may read these ---
--
-- The section this whole file is for.

begin;
  set local role anon;

  select t_raises_like('a signed out phone cannot read the messages',
    $$select name from public.contact_messages$$,
    'permission denied');

  -- The one that would be easy to get wrong. The form posts to an Edge
  -- Function rather than to PostgREST precisely so that anon never needs a
  -- write here, and a grant added later "so the app can submit" would hand
  -- anybody with the key a table to fill.
  select t_raises_like('nor write one directly, bypassing the form',
    $$insert into public.contact_messages (name, email, message)
      values ('Harness Forged', 'forged@example.com', 'Hello')$$,
    'permission denied');

  select t_raises_like('nor delete somebody else''s',
    $$delete from public.contact_messages$$,
    'permission denied');
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000002"}';

  -- A member has the table grant, which is what makes this the interesting
  -- case: the door is open and the policy is what stops them, so a policy
  -- quietly dropped shows up here as rows rather than as an error.
  select t_check('a signed in member is handed no rows at all',
    (select count(*)::int from public.contact_messages), 0);

  select t_raises_like('and cannot write one either',
    $$insert into public.contact_messages (name, email, message)
      values ('Harness Forged', 'forged@example.com', 'Hello')$$,
    'permission denied');
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  select t_check('an admin can find a message the email may have lost',
    (select count(*)::int from public.contact_messages where name like 'Harness%'), 2);

  -- SELECT and nothing else. Correspondence is not content: there is no screen
  -- that edits one, and the sweep is what removes them.
  select t_raises_like('and still cannot rewrite what somebody wrote',
    $$update public.contact_messages set message = 'Something else'
      where name = 'Harness One'$$,
    'permission denied');

  select t_raises_like('nor delete it',
    $$delete from public.contact_messages where name = 'Harness One'$$,
    'permission denied');
rollback;


-- -------------------------------------------------------------- the sweep ---
-- What makes the hundred and eighty days in the privacy policy true.

begin;
  set local role anon;

  select t_raises_like('anon cannot run the sweep',
    $$select public.hc_purge_contact_messages(1)$$,
    'permission denied');
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  -- Not even an admin. Nothing in the app calls this, and a function that
  -- deletes correspondence should not be reachable from a phone at all.
  select t_raises_like('and neither can an admin',
    $$select public.hc_purge_contact_messages(1)$$,
    'permission denied');
rollback;

update public.contact_messages
  set created_at = now() - interval '200 days'
  where name = 'Harness One';

select t_check('the sweep takes a message older than the window',
  (select public.hc_purge_contact_messages(180)), 1);

select t_check('and leaves the one that is still inside it',
  (select count(*)::int from public.contact_messages where name like 'Harness%'), 1);

select t_raises_like('a window of zero days is refused rather than obeyed',
  $$select public.hc_purge_contact_messages(0)$$,
  'at least 1');

select t_check('so the message written this minute is still there',
  (select count(*)::int from public.contact_messages where name = 'Harness Two'), 1);

delete from public.contact_messages where name like 'Harness%';
