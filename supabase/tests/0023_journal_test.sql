-- ===========================================================================
-- The journal, against the real policies.
--
-- One thing is worth testing here and everything below is a way of asking it:
-- can one person reach another person's writing? Every path in, out and
-- sideways is tried as somebody who should not be able to.
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
  ('11111111-1111-1111-1111-111111111111', 'jwriter@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'jsnoop@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name) values
  ('11111111-1111-1111-1111-111111111111', 'Wren'),
  ('22222222-2222-2222-2222-222222222222', 'Sol')
  on conflict (id) do update set first_name = excluded.first_name;

delete from public.journal_entries
 where user_id in ('11111111-1111-1111-1111-111111111111',
                   '22222222-2222-2222-2222-222222222222');

-- --------------------------------------------------------------- writing ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

  insert into public.journal_entries (id, kind, guide_id, guide_title, body_text)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'entry', 'g-1', 'A guide',
          'Something I would not say out loud yet.');

  select t_check('an entry goes in',
    (select count(*)::int from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1);

  select t_check('and it belongs to whoever wrote it',
    (select user_id from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
    '11111111-1111-1111-1111-111111111111'::uuid);
commit;

-- A client that lies about who it is. The trigger overwrites the claim, so
-- the row lands on the caller rather than on the person they named.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

  insert into public.journal_entries (id, user_id, body_text)
  values ('aaaaaaaa-0000-0000-0000-000000000002',
          '11111111-1111-1111-1111-111111111111', 'Planted.');

  select t_check('a row cannot be written into somebody else''s journal',
    (select user_id from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
    '22222222-2222-2222-2222-222222222222'::uuid);
commit;

-- --------------------------------------------------------------- reading ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

  select t_check('somebody else cannot see it at all',
    (select count(*)::int from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0);

  select t_check('not even by asking for everything',
    (select count(*)::int from public.journal_entries
      where body_text = 'Something I would not say out loud yet.'), 0);

  select t_check('they see only their own',
    (select count(*)::int from public.journal_entries), 1);
commit;

-- Signed out, the table is not reachable at all: no grant, so the request
-- fails rather than returning an empty list.
begin;
  set local role anon;
  select t_check('anon is refused outright',
    (select has_table_privilege('anon', 'public.journal_entries', 'select')), false);
commit;

-- --------------------------------------------------------------- editing ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

  update public.journal_entries
     set body_text = 'Rewritten by a stranger.'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  select t_check('a stranger''s update touches nothing',
    (select count(*)::int from public.journal_entries
      where body_text = 'Rewritten by a stranger.'), 0);

  delete from public.journal_entries
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

  select t_check('and a stranger''s delete does not either',
    (select count(*)::int from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1);

  select t_check('the words are as they were written',
    (select body_text from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
    'Something I would not say out loud yet.');
commit;

-- ------------------------------------------------------------ the upsert ---
-- The phone pushes the same id twice, which is what an offline entry
-- uploading after a retry looks like.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

  insert into public.journal_entries (id, body_text, updated_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'The second version.',
          now() + interval '1 minute')
  on conflict (id) do update
    set body_text = excluded.body_text, updated_at = excluded.updated_at;

  select t_check('pushing the same entry twice updates rather than duplicating',
    (select count(*)::int from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1);

  select t_check('with the newer words',
    (select body_text from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'The second version.');

  select t_check('and the time the person typed, not the time it arrived',
    (select updated_at > now() from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'), true);
commit;

-- ------------------------------------------------------------- tombstones ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

  update public.journal_entries set deleted_at = now()
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  select t_check('a deleted entry is still a row, so the delete can travel',
    (select count(*)::int from public.journal_entries
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'
        and deleted_at is not null), 1);
commit;

-- ------------------------------------------------------------ constraints ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

  -- A DO block, because catching the violation needs plpgsql and a plain
  -- begin/exception at SQL level is a transaction, not a handler.
  do $t$
  begin
    insert into public.journal_entries (id, kind, body_text)
    values ('aaaaaaaa-0000-0000-0000-000000000009', 'diary', 'nope');
    raise warning 'FAIL  an unknown kind is refused';
  exception when check_violation then
    raise notice 'PASS  an unknown kind is refused';
  end
  $t$;
commit;

-- ---------------------------------------------------- deleting an account ---
-- The cascade is what the delete-account Edge Function relies on without
-- knowing this table exists.

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select t_check('deleting the account takes the whole journal with it',
  (select count(*)::int from public.journal_entries
    where user_id = '11111111-1111-1111-1111-111111111111'), 0);
