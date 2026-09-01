-- ===========================================================================
-- The review notifications, and the column that names a person.
--
-- WHAT IS WORTH TESTING HERE, said first so a green run is not read as more
-- than it is. Whether APNs delivers anything is a question about a real
-- project and a real phone, and LAUNCH_TODO.md is where that gets checked off.
-- What this file is about is the claim migration 0043 makes in its header:
-- that admin_user_id can only ever be written by a function that checks the
-- database's own answer to "is this person an admin", and that nothing holding
-- the publishable key can put anything there.
--
-- That claim is the entire privacy argument for the feature. If it is wrong,
-- anybody who can read the app bundle can have every unpublished draft title
-- pushed to their lock screen. So it is checked as the roles rather than read
-- off the migration and nodded at, which is what this harness exists for.
--
-- The second half is the approval note: that two admins tapping Approve on the
-- same card settle rather than race, that the loser is told who won, and that
-- the name is readable by admins and by nobody else.
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

/* Runs a statement as a role and reports that it did NOT raise. The mirror of
   t_raises_like, and it earns its place here because half of what 0043 does is
   take privileges away: a file full of refusals proves the door is shut and
   says nothing about whether anybody can still get through it. */
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


-- Three people: two admins, because the whole point of the approval note is
-- that there is more than one, and a member to be refused.
insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-000000000001', 'ada@example.com'),
  ('dd000000-0000-0000-0000-000000000002', 'mo@example.com'),
  ('dd000000-0000-0000-0000-000000000003', 'sam@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name, last_name) values
  ('dd000000-0000-0000-0000-000000000001', 'Ada', 'Lovelace'),
  ('dd000000-0000-0000-0000-000000000002', 'Mo',  'Chen'),
  ('dd000000-0000-0000-0000-000000000003', 'Sam', 'Rivers')
  on conflict (id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name;

update public.profiles set role = 'admin'
  where id in ('dd000000-0000-0000-0000-000000000001',
               'dd000000-0000-0000-0000-000000000002');
update public.profiles set role = 'member'
  where id = 'dd000000-0000-0000-0000-000000000003';

-- The vault secret 0012 generates on a real project, for the same reason
-- 0027's test file puts it here: without it hc_send_push stops at "the secret
-- is missing", which is a correct refusal and not the one being tested.
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_push_cron_secret', 'harness-secret')
on conflict (name) do nothing;

delete from public.review_approvals where row_id like 'rev-test-%';
delete from public.device_tokens where token like 'rev-test-%';
delete from public.announcements where id like 'rev-test-%';
delete from public.events where id like 'rev-test-%';
delete from public.push_log where note = 'harness-0043';

insert into public.announcements (id, title, body, published, review_state) values
  ('rev-test-ann',   'Homecoming',  'Bring a chair.', false, 'pending'),
  ('rev-test-ann-2', 'Serve Day',   null,             false, 'pending'),
  ('rev-test-hand',  'By hand',     null,             true,  null);

insert into public.events (id, title, starts_at, published, review_state) values
  ('rev-test-evt',   'Homecoming', now() + interval '10 days', false, 'pending'),
  ('rev-test-evt-2', 'Serve Day',  now() + interval '20 days', false, 'pending');


-- ------------------------------------------------------------ the topics ---

insert into public.push_log (topic, note) values
  ('announcement_review', 'harness-0043'),
  ('event_review', 'harness-0043');

select t_check('push_log accepts both review topics',
  (select count(*)::int from public.push_log where note = 'harness-0043'), 2);

select t_raises_like('and still refuses one nobody defined',
  $$insert into public.push_log (topic, note) values ('invented', 'harness-0043')$$,
  'push_log_topic_known');

select t_raises_like('hc_send_push refuses a topic it does not know',
  $$select public.hc_send_push('invented')$$,
  'unknown topic');

select t_check('and takes announcement_review all the way to the sender',
  (select public.hc_send_push('announcement_review')) is not null, true);

select t_check('and event_review',
  (select public.hc_send_push('event_review')) is not null, true);


-- ----------------------------------------------- the columns and defaults ---

select t_check('a phone registered before 0043 has no name on it',
  (select column_default from information_schema.columns
    where table_name = 'device_tokens' and column_name = 'admin_user_id'), null);

select t_check('and would want the announcements queue if it were an admin''s',
  (select column_default from information_schema.columns
    where table_name = 'device_tokens' and column_name = 'wants_announcement_review'),
  'true');

select t_check('and the dates queue',
  (select column_default from information_schema.columns
    where table_name = 'device_tokens' and column_name = 'wants_event_review'),
  'true');


-- ------------------------------------------- nobody claims to be an admin ---
--
-- The section this whole file is for. 0010 grants anon INSERT and UPDATE on
-- device_tokens, which was harmless while every column on it was a
-- preference. 0043 section 3 narrows both to a column list, and these are the
-- assertions that it worked: a phone can still register and still turn its own
-- switches, and cannot write the three columns that decide who hears about the
-- review queue.

begin;
  set local role anon;

  select t_raises_like('a signed out phone cannot name itself an admin',
    $$update public.device_tokens set admin_user_id = 'dd000000-0000-0000-0000-000000000001'$$,
    'permission denied');

  select t_raises_like('nor insert a row that arrives already named',
    $$insert into public.device_tokens (token, admin_user_id)
      values ('rev-test-forged', 'dd000000-0000-0000-0000-000000000001')$$,
    'permission denied');

  select t_raises_like('nor switch the review notifications on for itself',
    $$update public.device_tokens set wants_announcement_review = true$$,
    'permission denied');

  -- And nothing else either. Since 0043 no client role has any privilege on
  -- this table at all, so the three columns above are not a special case, they
  -- are the ordinary one.
  select t_raises_like('nor write anything else here by hand',
    $$update public.device_tokens set wants_sunday_reminder = false$$,
    'permission denied');
commit;

select t_check('and nothing was forged',
  (select count(*)::int from public.device_tokens where token = 'rev-test-forged'), 0);

select t_check('no client role can write device_tokens at all',
  (select bool_or(has_table_privilege(r.role, 'public.device_tokens', p.priv))
     from unnest(array['anon', 'authenticated']) as r(role),
          unnest(array['select', 'insert', 'update', 'delete']) as p(priv)), false);

/* The other half, and the half a file of refusals can quietly get wrong: a
   door that is shut is not the same as a door that is bricked up. Everything
   the app actually does with this table goes through the two functions below,
   and both have to work as anon, because a phone in this app is far more often
   signed out than signed in.

   THIS IS ALSO THE ASSERTION 0037 DID NOT MAKE. 0037 fixed registration and
   its header says the other two writes are fine, "a plain UPDATE, which anon
   has and which never needed SELECT". A PostgREST filter is a WHERE clause and
   a WHERE clause reads columns, so both of them had been refused on every
   phone since the day they were written. Writing this test is what found it. */

begin;
  set local role anon;

  select t_allows('a phone can register itself',
    $$select public.hc_register_device_token('rev-test-phone', 'ios', true, true, false, true)$$);

  select t_allows('and change its mind, which is the same call again',
    $$select public.hc_register_device_token('rev-test-phone', 'ios', true, false, false, true)$$);
commit;

select t_check('the registration landed',
  (select count(*)::int from public.device_tokens where token = 'rev-test-phone'), 1);

select t_check('and the switch it moved actually moved',
  (select wants_sunday_reminder from public.device_tokens where token = 'rev-test-phone'), false);

select t_check('and it is nobody''s phone',
  (select admin_user_id from public.device_tokens where token = 'rev-test-phone'), null);

begin;
  set local role anon;

  select t_allows('and it can turn everything off',
    $$select public.hc_deactivate_device_token('rev-test-phone')$$);
commit;

select t_check('which stops every send to it',
  (select active or wants_new_guide or wants_sunday_reminder
       or wants_group_day or wants_announcements
     from public.device_tokens where token = 'rev-test-phone'), false);

-- Put it back the way the app would have left it, since the sections below
-- need a registered phone.
begin;
  set local role anon;
  select public.hc_register_device_token('rev-test-phone', 'ios', true, true, false, true);
commit;


-- -------------------------------------------- who may say whose phone it is ---

begin;
  set local role anon;

  select t_raises_like('a signed out phone cannot call the admin registration',
    $$select public.hc_set_admin_device_token('rev-test-phone')$$,
    'permission denied');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000003"}';

  select t_raises_like('and neither can a signed in member',
    $$select public.hc_set_admin_device_token('rev-test-phone')$$,
    'Admins only');
commit;

select t_check('so the row is still anonymous',
  (select admin_user_id from public.device_tokens where token = 'rev-test-phone'), null);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_allows('an admin can say this phone is theirs',
    $$select public.hc_set_admin_device_token('rev-test-phone', true, false)$$);

  select t_raises_like('but not for a phone that never registered',
    $$select public.hc_set_admin_device_token('rev-test-unregistered')$$,
    'has not registered');
commit;

select t_check('and the id written is the caller''s own',
  (select admin_user_id from public.device_tokens where token = 'rev-test-phone'),
  'dd000000-0000-0000-0000-000000000001'::uuid);

select t_check('with the switches they asked for, not the defaults',
  (select wants_announcement_review::text || '/' || wants_event_review::text
     from public.device_tokens where token = 'rev-test-phone'), 'true/false');


-- ------------------------------------------------- and who may take it back ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';

  -- Runs without error and changes nothing, which is the shape 0043 section 5
  -- chose deliberately: this is called on the way out of a session and an
  -- exception there would be an error message about somebody else's row.
  select t_allows('another admin clearing it is not an error',
    $$select public.hc_clear_admin_device_token('rev-test-phone')$$);
commit;

select t_check('but it is also not a clear',
  (select admin_user_id from public.device_tokens where token = 'rev-test-phone'),
  'dd000000-0000-0000-0000-000000000001'::uuid);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_allows('the phone''s own admin can clear it',
    $$select public.hc_clear_admin_device_token('rev-test-phone')$$);
commit;

select t_check('and the phone is anonymous again',
  (select admin_user_id from public.device_tokens where token = 'rev-test-phone'), null);

select t_check('with both review switches off, so a stale row asks for nothing',
  (select wants_announcement_review or wants_event_review
     from public.device_tokens where token = 'rev-test-phone'), false);

-- A demotion has to be survivable: somebody who is no longer an admin must
-- still be able to give up the row that names them, or the only way out is a
-- role they no longer have. 0043 section 5 guards on ownership for this.
update public.device_tokens set admin_user_id = 'dd000000-0000-0000-0000-000000000003'
  where token = 'rev-test-phone';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000003"}';

  select t_allows('and somebody just demoted can still clear their own phone',
    $$select public.hc_clear_admin_device_token('rev-test-phone')$$);
commit;

select t_check('which worked',
  (select admin_user_id from public.device_tokens where token = 'rev-test-phone'), null);

/* And switching every notification off takes the name with it, which is the
   other way an admin phone stops being one. Worth its own assertion because
   the two paths are reached from opposite ends of the app: signing out is
   js/auth.js, and this is the last switch going off in Profile. */
update public.device_tokens set admin_user_id = 'dd000000-0000-0000-0000-000000000001',
       wants_announcement_review = true
  where token = 'rev-test-phone';

begin;
  set local role anon;
  select t_allows('turning everything off does not need a session',
    $$select public.hc_deactivate_device_token('rev-test-phone')$$);
commit;

select t_check('and it leaves no name behind either',
  (select admin_user_id from public.device_tokens where token = 'rev-test-phone'), null);

select t_check('nor a review switch still asking for something',
  (select wants_announcement_review or wants_event_review
     from public.device_tokens where token = 'rev-test-phone'), false);


-- ------------------------------------------------------- the approval note ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000003"}';

  select t_raises_like('a member cannot approve an announcement',
    $$select public.hc_admin_approve_announcement('rev-test-ann')$$,
    'Admins only');

  select t_raises_like('nor a date',
    $$select public.hc_admin_approve_event('rev-test-evt')$$,
    'Admins only');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_allows('an admin can',
    $$select public.hc_admin_approve_announcement('rev-test-ann')$$);
commit;

select t_check('the announcement is on Home',
  (select published::text || '/' || review_state
     from public.announcements where id = 'rev-test-ann'), 'true/approved');

select t_check('and the note says who put it there',
  (select approved_by_name from public.review_approvals
    where kind = 'announcement' and row_id = 'rev-test-ann'), 'Ada Lovelace');

/* The race. Both admins were told at once, both opened the queue, and the
   second one taps a card the first has already settled. The answer they get
   has to name the person rather than report a bug about a missing row. */
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';

  select t_raises_like('a second admin is told who got there first',
    $$select public.hc_admin_approve_announcement('rev-test-ann')$$,
    'Ada Lovelace already approved');

  /* A row with a null review_state is still approvable, which is the reason
     the claim clause reads `is distinct from 'approved'` rather than the
     shorter `= 'pending'`. Null is what everything written by hand carries,
     and 0040's own test approves an event in exactly that state: refusing
     those would be a behaviour change nobody asked for, in a function whose
     job is to publish. Already approved is a reason to say no. Null is not. */
  select t_allows('a row nobody parsed can still be approved',
    $$select public.hc_admin_approve_announcement('rev-test-hand')$$);

  select t_raises_like('but one that does not exist cannot',
    $$select public.hc_admin_approve_announcement('rev-test-missing')$$,
    'No announcement with that id');

  select t_allows('but the other card in the queue is still theirs to take',
    $$select public.hc_admin_approve_announcement('rev-test-ann-2')$$);
commit;

select t_check('and it carries the other name',
  (select approved_by_name from public.review_approvals
    where kind = 'announcement' and row_id = 'rev-test-ann-2'), 'Mo Chen');

-- The dates queue, which walks the same path for the same reasons.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';

  select t_allows('a date can be approved',
    $$select public.hc_admin_approve_event('rev-test-evt')$$);
commit;

select t_check('it is on the calendar',
  (select published::text || '/' || review_state
     from public.events where id = 'rev-test-evt'), 'true/approved');

select t_check('with its own note',
  (select approved_by_name from public.review_approvals
    where kind = 'event' and row_id = 'rev-test-evt'), 'Mo Chen');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_raises_like('and the second admin is told about that too',
    $$select public.hc_admin_approve_event('rev-test-evt')$$,
    'Mo Chen already approved');

  -- Discarding takes the note with it, because ids in this project are derived
  -- from titles and come back on a later parse of the same recurring event.
  select t_allows('discarding a date that was never approved still works',
    $$select public.hc_admin_discard_event('rev-test-evt-2')$$);
commit;

select t_check('and left no note behind',
  (select count(*)::int from public.review_approvals
    where kind = 'event' and row_id = 'rev-test-evt-2'), 0);


-- ------------------------------------------------ who may read the notes ---
--
-- "Visible only to admins" is the phrase the feature was asked for in, and
-- this is the whole of what makes it true. There is no anon read path at all,
-- which is why the name lives in a table of its own rather than in a column on
-- announcements: the app's content sync reads announcements with the
-- publishable key and no session.

begin;
  set local role anon;

  select t_raises_like('a signed out phone cannot read the notes',
    $$select count(*) from public.review_approvals$$,
    'permission denied');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000003"}';

  -- Not an error, and not an answer either. The policy is what empties it,
  -- which is the shape every read in this project uses: fewer rows, never a
  -- 500. See 0025 section 2 on why hc_is_admin stays executable by everybody.
  select t_check('a member is answered with nothing',
    (select count(*)::int from public.review_approvals where row_id like 'rev-test-%'), 0);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';

  select t_check('and an admin sees every note',
    (select count(*)::int from public.review_approvals where row_id like 'rev-test-%'), 4);

  select t_raises_like('but cannot write one by hand',
    $$insert into public.review_approvals (kind, row_id, approved_by_name)
      values ('announcement', 'rev-test-hand', 'Somebody Else')$$,
    'permission denied');

  select t_raises_like('nor change the name on one',
    $$update public.review_approvals set approved_by_name = 'Somebody Else'
       where row_id = 'rev-test-ann'$$,
    'permission denied');
commit;

-- hc_admin_display_name is not a directory. It reads a profiles row the caller
-- may not read, which is exactly why it is revoked from every client role: it
-- exists to be called by the two approve functions and by nothing else.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';

  select t_raises_like('and cannot look people up with the name helper',
    $$select public.hc_admin_display_name('dd000000-0000-0000-0000-000000000003')$$,
    'permission denied');
commit;

-- Nor may a session ask for a push directly. hc_send_push takes a free text
-- topic, so a session that could reach it could send the Sunday reminder on a
-- Tuesday. 0043 grants it to service_role, which is how the intake asks.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_raises_like('even an admin cannot ask for a push by topic',
    $$select public.hc_send_push('announcement_review')$$,
    'permission denied');
commit;

begin;
  set local role service_role;

  select t_allows('but the intake can, which is how the admins get told',
    $$select public.hc_send_push('announcement_review')$$);
commit;


-- ----------------------------------------------------------------- tidy ---

delete from public.review_approvals where row_id like 'rev-test-%';
delete from public.device_tokens where token like 'rev-test-%';
delete from public.announcements where id like 'rev-test-%';
delete from public.events where id like 'rev-test-%';
delete from public.push_log where note = 'harness-0043';
