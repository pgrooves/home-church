-- ===========================================================================
-- 0094: the counter counts, push registration has a ceiling on new phones,
-- and journal entries, profiles and reports have a size.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function t94_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  %', label;
  else raise warning 'FAIL  %  (got %, want %)', label, got, want; end if;
end;
$$;

create or replace function t94_refuses(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  % (it was allowed)', label;
exception when others then
  raise notice 'PASS  % (refused: %)', label, left(sqlerrm, 46);
end;
$$;

-- ------------------------------------------------------------ the counter
select t94_check('0094: the first of three goes through',
  public.hc_rate_take('t94', 3, 60), true);
select public.hc_rate_take('t94', 3, 60);
select public.hc_rate_take('t94', 3, 60);
select t94_check('0094: the fourth in the window is refused',
  public.hc_rate_take('t94', 3, 60), false);
select t94_check('0094: and so is the fifth',
  public.hc_rate_take('t94', 3, 60), false);
select t94_check('0094: another bucket is untouched',
  public.hc_rate_take('t94-other', 3, 60), true);
select t94_check('0094: one row per bucket, however many requests',
  (select count(*)::int from public.hc_rate_counts where bucket = 't94'), 1);

update public.hc_rate_counts set window_start = now() - interval '2 minutes' where bucket = 't94';
select t94_check('0094: once the window has passed there is room again',
  public.hc_rate_take('t94', 3, 60), true);
select t94_check('0094: and the count starts again from one',
  (select n from public.hc_rate_counts where bucket = 't94'), 1);

begin;
  set local role anon;
  select t94_refuses('0094: anon cannot spend a bucket',
    'select public.hc_rate_take(''x'', 1, 60)');
  select t94_refuses('0094: or read the counter',
    'select count(*) from public.hc_rate_counts');
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"94000000-0000-0000-0000-000000000001"}';
  select t94_refuses('0094: nor can a signed in person',
    'select public.hc_rate_take(''x'', 1, 60)');
commit;

-- ---------------------------------------------------- push registration
delete from public.device_tokens where token like 't94-%';
insert into public.device_tokens (token, platform, active, created_at)
select 't94-fill-' || g, 'ios', true, now() from generate_series(1, 200) g;

begin;
  set local role anon;
  select t94_refuses('0094: the 201st new phone in ten minutes waits',
    $$select public.hc_register_device_token('t94-new-phone', 'ios', true, true, false, true)$$);
  -- Not wrapped: if this were refused, ON_ERROR_STOP would end the file.
  select public.hc_register_device_token('t94-fill-7', 'ios', false, false, false, false);
commit;

select t94_check('0094: but a phone already registered can still update',
  (select wants_new_guide from public.device_tokens where token = 't94-fill-7'), false);

update public.device_tokens set created_at = now() - interval '1 hour' where token like 't94-fill-%';
begin;
  set local role anon;
  select public.hc_register_device_token('t94-new-phone', 'ios', true, true, false, true);
commit;
select t94_check('0094: once the burst is ten minutes old, new phones register again',
  (select count(*)::int from public.device_tokens where token = 't94-new-phone'), 1);
delete from public.device_tokens where token like 't94-%';

-- ------------------------------------------------------------ the sizes
insert into auth.users (id, email) values
  ('94000000-0000-0000-0000-000000000001', 'journal94@example.com')
on conflict do nothing;
insert into public.profiles (id, first_name) values
  ('94000000-0000-0000-0000-000000000001', 'Journal')
on conflict (id) do nothing;

select t94_refuses('0094: a profile name cannot be a megabyte',
  $$update public.profiles set first_name = repeat('x', 201)
     where id = '94000000-0000-0000-0000-000000000001'$$);
update public.profiles set first_name = 'An ordinary name'
 where id = '94000000-0000-0000-0000-000000000001';
select t94_check('0094: an ordinary name is fine',
  (select first_name from public.profiles where id = '94000000-0000-0000-0000-000000000001'),
  'An ordinary name');

select t94_check('0094: every text column of journal_entries has a cap',
  (select count(*)::int from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'journal_entries'
      and c.data_type in ('text', 'ARRAY')
      and not exists (select 1 from pg_constraint k
                       where k.conname = 'journal_entries_' || c.column_name || '_size')), 0);
select t94_check('0094: and so does every one on profiles but role',
  (select count(*)::int from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'profiles'
      and c.data_type in ('text', 'ARRAY') and c.column_name <> 'role'
      and not exists (select 1 from pg_constraint k
                       where k.conname = 'profiles_' || c.column_name || '_size')), 0);
select t94_check('0094: and a report''s reason',
  exists (select 1 from pg_constraint where conname = 'group_note_reports_reason_size'), true);

-- The journal count: 5,000 is the ceiling, and saving an existing entry is
-- never refused by it. Asked as the person, because 0023's trigger sets the
-- owner from the session.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"94000000-0000-0000-0000-000000000001"}';
  insert into public.journal_entries (id, kind)
  select gen_random_uuid(), 'entry' from generate_series(1, 5000);

  select t94_refuses('0094: the 5,001st journal entry is refused',
    $$insert into public.journal_entries (id, kind) values (gen_random_uuid(), 'entry')$$);

  -- Naming somebody else as the owner does not dodge the count.
  select t94_refuses('0094: and claiming to be someone else does not get round it',
    $$insert into public.journal_entries (id, user_id, kind)
      values (gen_random_uuid(), '94000000-0000-0000-0000-000000000099', 'entry')$$);

  insert into public.journal_entries (id, kind)
  select id, kind from public.journal_entries limit 1
  on conflict (id) do update set kind = excluded.kind;
  select t94_check('0094: but saving one that exists still works at the ceiling',
    (select count(*)::int from public.journal_entries), 5000);
commit;

delete from public.journal_entries where user_id = '94000000-0000-0000-0000-000000000001';
