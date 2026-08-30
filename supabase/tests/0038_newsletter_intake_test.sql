-- ===========================================================================
-- The newsletter intake.
--
-- WHAT IS WORTH TESTING HERE. This migration hands a robot a write path into
-- the table that draws the front screen of the app, so the assertions are not
-- about the columns. They are about the two promises the feature makes:
--
--   nothing reaches Home   a parsed draft is invisible to a signed out phone,
--                          which is the role the app's own content sync runs
--                          as. If that is not true, the approval step is
--                          decoration and the church finds out when a half
--                          parsed announcement appears on Home.
--
--   the log is not public  newsletter_emails holds the subject and sender of
--                          the church's mail, and newsletter_runs holds error
--                          text. Neither is catastrophic and neither is
--                          anybody's business but an admin's, and both are new
--                          tables, which is exactly when a missing revoke goes
--                          unnoticed. See harness.sql on why a new table does
--                          not start closed on a real Supabase project.
--
-- The third thing asserted is the one that would be easiest to get wrong and
-- hardest to notice: that approving is the ONLY way published becomes true. A
-- member must not be able to approve, and the intake's own inserts must land
-- unpublished. Both are asserted as the real roles rather than read off the
-- policy and believed, which is this project's rule since 0016.
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
  ('dd000000-0000-0000-0000-000000000001', 'nadmin@example.com'),
  ('dd000000-0000-0000-0000-000000000002', 'nmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('dd000000-0000-0000-0000-000000000001', 'Ada'),
  ('dd000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'dd000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'dd000000-0000-0000-0000-000000000002';

delete from public.announcements    where id like 'news-test-%';
delete from public.newsletter_emails where message_id like '<news-test-%';
delete from public.newsletter_runs;

-- ---------------------------------------------------------- the schema ---

select t_check('source defaults to admin, so nothing written before today moved',
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements'
      and column_name = 'source'), '''admin''::text');

select t_check('the pending index is there',
  (select count(*)::int from pg_indexes
    where schemaname = 'public' and indexname = 'announcements_review_idx'), 1);

select t_check('the ledger is unique on message_id',
  (select count(*)::int from pg_indexes
    where schemaname = 'public' and tablename = 'newsletter_emails'
      and indexdef like '%UNIQUE%message_id%'), 1);

-- A closed vocabulary on both, so a typo is refused by the database rather
-- than quietly making a row invisible to every query that filters on it.
do $$
begin
  insert into public.announcements (id, title, review_state)
  values ('news-test-bad', 'Nope', 'approved-ish');
  raise warning 'FAIL  an unknown review_state is refused';
exception when check_violation then
  raise notice 'PASS  an unknown review_state is refused';
end
$$;

-- ------------------------------------------------ what the intake writes ---
-- The service role, which is what the Edge Function holds. It bypasses RLS,
-- so this is not testing permission, it is testing that the row the function
-- writes is the row the review queue expects to find.

begin;
  set local role service_role;

  insert into public.newsletter_emails (message_id, subject, from_addr, status, drafts)
  values ('<news-test-1@church.example>', 'Home Church Weekly', 'office@church.example', 'parsed', 2);

  -- One heartbeat, so the admin read below is asserting that a row comes back
  -- rather than that an empty table is empty.
  insert into public.newsletter_runs (ok, found, parsed, drafts) values (true, 1, 1, 2);

  insert into public.announcements
    (id, title, body, published, review_state, source, source_email_id)
  select 'news-test-serve', 'City Serve Day, September 12',
         'Meet at the building at 8am.', false, 'pending', 'newsletter', id
    from public.newsletter_emails where message_id = '<news-test-1@church.example>';

  insert into public.announcements
    (id, title, body, published, review_state, source, source_email_id)
  select 'news-test-members', 'Members Meeting, September 6',
         'Right after the second service.', false, 'pending', 'newsletter', id
    from public.newsletter_emails where message_id = '<news-test-1@church.example>';

  select t_check('a parsed draft is not published',
    (select bool_or(published) from public.announcements where id like 'news-test-%'), false);

  select t_check('and both are waiting for somebody',
    (select count(*)::int from public.announcements where review_state = 'pending'), 2);

  -- The dedupe. Not a nicety: it is what stops a second poll writing a second
  -- set of drafts for the same email while the first set is still unreviewed.
  do $$
  begin
    insert into public.newsletter_emails (message_id) values ('<news-test-1@church.example>');
    raise warning 'FAIL  the same email cannot be logged twice';
  exception when unique_violation then
    raise notice 'PASS  the same email cannot be logged twice';
  end
  $$;
commit;

-- ------------------------------------------------------------- as anon ---
-- The role that matters most in this file. js/content.js syncs with the
-- publishable key and no session, so this IS the app drawing Home. A pending
-- draft reaching this query is the whole feature failing open.

/* The two log tables are checked by privilege rather than by row count, and
   the difference is the point. announcements IS readable by anon, so a draft
   not coming back is RLS doing its job and a count is the honest way to ask.
   The log tables are not readable by anon at all: the revoke in 0038 section 6
   means the query raises rather than returning nothing, which is a refusal one
   layer earlier than the policy. Asking for a count there would be asserting
   the weaker of the two properties, and would have passed just as well if the
   revoke had been forgotten and only the policy were doing the work. */

select t_check('anon has no SELECT on the ledger',
  has_table_privilege('anon', 'public.newsletter_emails', 'SELECT'), false);

select t_check('nor on the run log',
  has_table_privilege('anon', 'public.newsletter_runs', 'SELECT'), false);

select t_check('and no write privilege on either, for either client role',
  (select bool_or(has_table_privilege(r.role, t.tab, p.priv))
     from unnest(array['anon', 'authenticated']) as r(role),
          unnest(array['public.newsletter_emails', 'public.newsletter_runs']) as t(tab),
          unnest(array['INSERT', 'UPDATE', 'DELETE']) as p(priv)),
  false);

begin;
  set local role anon;

  select t_check('a signed out phone cannot see a parsed draft',
    (select count(*)::int from public.announcements where id like 'news-test-%'), 0);
commit;

do $$
begin
  set local role anon;
  perform 1 from public.newsletter_emails;
  raise warning 'FAIL  anon reading the ledger is refused outright';
exception when insufficient_privilege then
  raise notice 'PASS  anon reading the ledger is refused outright';
end
$$;

reset role;

-- ----------------------------------------------------------- as a member ---
-- A signed in person who is not an admin. Same answers as anon, by a
-- different mechanism: hc_is_admin() returns false rather than the grant
-- being missing, which is why it is asserted separately rather than assumed
-- to follow.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';

  select t_check('a member cannot see a parsed draft either',
    (select count(*)::int from public.announcements where id like 'news-test-%'), 0);

  select t_check('a member cannot read the ledger',
    (select count(*)::int from public.newsletter_emails), 0);

  select t_check('nor the run log, though the grant lets them ask',
    (select count(*)::int from public.newsletter_runs), 0);

  /* The one that would actually hurt. An UPDATE refused by a USING clause is
     a filter and not an error, per 0026's test file, so the statement
     succeeds against zero visible rows and what has to be asserted is that
     nothing moved. */
  update public.announcements set published = true, review_state = 'approved'
   where id = 'news-test-serve';
commit;

begin;
  set local role service_role;
  select t_check('and a member cannot approve one',
    (select published from public.announcements where id = 'news-test-serve'), false);
commit;

-- ------------------------------------------------------------ as an admin ---
-- The person the queue is for. Reads the drafts, reads the log, and is the
-- only role in this file that can put one on Home.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_check('an admin sees both drafts',
    (select count(*)::int from public.announcements where review_state = 'pending'), 2);

  select t_check('an admin can read the run log',
    (select count(*)::int from public.newsletter_runs), 1);

  select t_check('and the ledger, which is how the notice knows what happened',
    (select count(*)::int from public.newsletter_emails), 1);

  -- Approve. One statement writing both columns, which is what js/admin.js
  -- sends, and the reason it sends one and not two.
  update public.announcements set published = true, review_state = 'approved'
   where id = 'news-test-serve';

  select t_check('an admin can approve one',
    (select published from public.announcements where id = 'news-test-serve'), true);

  -- Discard. Note what it is not: a delete. The row stays, unpublished, and
  -- drops out of the queue because the state moved rather than because the
  -- row went away. See migration 0038 section 4.
  update public.announcements set review_state = 'discarded'
   where id = 'news-test-members';

  select t_check('discarding leaves the row behind as a draft',
    (select published from public.announcements where id = 'news-test-members'), false);

  select t_check('and takes it out of the queue',
    (select count(*)::int from public.announcements where review_state = 'pending'), 0);

  /* The log tables are readable and not writable, which is the 0003
     arrangement rather than the 0026 one. An admin has no business inventing
     a run that did not happen, and the Edge Function does not need a policy
     because the service role does not consult them. */
  do $$
  begin
    insert into public.newsletter_runs (ok, note) values (false, 'made up');
    raise warning 'FAIL  even an admin cannot write the run log';
  exception when insufficient_privilege then
    raise notice 'PASS  even an admin cannot write the run log';
  end
  $$;
commit;

-- ------------------------------------------------ what nobody touched ---
-- An announcement written by a person, before any of this existed. It has to
-- come out the other side of the migration unchanged and outside the queue,
-- or every announcement in the table joins the review list on the day this
-- ships.

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  insert into public.announcements (id, title) values ('news-test-byhand', 'Potluck Sunday');

  select t_check('an announcement written by hand has no review state',
    (select review_state from public.announcements where id = 'news-test-byhand'), null);

  select t_check('and says it came from an admin',
    (select source from public.announcements where id = 'news-test-byhand'), 'admin');

  select t_check('and is published, exactly as it was before 0038',
    (select published from public.announcements where id = 'news-test-byhand'), true);
commit;

-- ------------------------------------------- the log survives the drafts ---
-- on delete set null, asserted rather than assumed: pruning the ledger must
-- not take the announcements with it.

begin;
  set local role service_role;

  delete from public.newsletter_emails where message_id = '<news-test-1@church.example>';

  select t_check('deleting the ledger row leaves the announcement standing',
    (select count(*)::int from public.announcements where id = 'news-test-serve'), 1);

  select t_check('with nothing to point at',
    (select source_email_id from public.announcements where id = 'news-test-serve'), null);
commit;

delete from public.announcements    where id like 'news-test-%';
delete from public.newsletter_emails where message_id like '<news-test-%';
delete from public.newsletter_runs;
