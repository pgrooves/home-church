-- ===========================================================================
-- One night in the calendar twice, and what merging the two does.
--
-- WHAT IS WORTH TESTING. Not whether the model spots that "Ladies Night" and
-- "Women's Night" are one evening — that is judged by a person reading the
-- card. What Postgres owns is four things, and every one of them is a quiet
-- failure:
--
--   who          the merge deletes a row from the church's calendar and writes
--                over another. If a member could call it, a model's opinion
--                plus a stolen session would be enough to make a date
--                disappear. Asserted as a real signed in member.
--
--   what moves   a merge must not replace a time somebody vouched for with the
--                nine in the morning the parser invents when an email gives no
--                hour, and must not clear a location the newer row is simply
--                silent about. Both are losses nobody notices until somebody
--                turns up at the wrong time.
--
--   what follows the announcement pointing at the row that goes has to end up
--                pointing at the row that stays, or a card quietly loses its
--                Add to calendar button. Same for a third copy pointing at it.
--
--   what stays   merging is tidying, not approving. A pending row merged into
--                a published one must not put anything new on the calendar.
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
  ('ac000000-0000-0000-0000-000000000001', 'eadmin@example.com'),
  ('ac000000-0000-0000-0000-000000000002', 'emember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ac000000-0000-0000-0000-000000000001', 'Ada'),
  ('ac000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ac000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ac000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'test-evdupe-%';
delete from public.events        where id like 'test-evdupe-%';
delete from public.review_approvals where row_id like 'test-evdupe-%';

-- The night the church already has: approved a fortnight ago, at a time
-- somebody actually knew, with a location, and with an announcement on Home
-- pointing at it.
insert into public.events
  (id, title, description, starts_at, time_label, location, published, review_state)
values
  ('test-evdupe-keep', 'Ladies Night', 'An evening for the women of the church.',
   '2030-10-23 23:30:00+00', null, 'The Loft, upstairs', true, 'approved');

-- The same night, parsed out of a later newsletter under the other name. No
-- hour in the email, so it carries the parser's nine in the morning and says
-- so; a blurb it does not repeat; and a sign-up link the first one never had.
insert into public.events
  (id, title, description, starts_at, time_label, location, signup_url,
   published, review_state, duplicate_of, duplicate_note, dedupe_checked_at)
values
  ('test-evdupe-copy', 'Women''s Night', null,
   '2030-10-23 14:00:00+00', 'Time to be announced', null,
   'https://example.com/rsvp', false, 'pending',
   'test-evdupe-keep', 'same Friday, this one adds an RSVP link', now());

-- A third copy, pointing at the one about to be merged away.
insert into public.events
  (id, title, starts_at, time_label, published, review_state, duplicate_of)
values
  ('test-evdupe-third', 'Ladies Night 2030', '2030-10-23 23:30:00+00', null,
   false, 'pending', 'test-evdupe-copy');

insert into public.announcements (id, title, body, published, event_id)
values ('test-evdupe-card', 'Ladies Night', 'Join us.', true, 'test-evdupe-copy');

-- Somebody approved the copy before anybody noticed it was a copy, which is
-- how this church got here in the first place.
insert into public.review_approvals (kind, row_id, approved_by, approved_by_name)
values ('event', 'test-evdupe-copy', 'ac000000-0000-0000-0000-000000000001', 'Ada');

-- --------------------------------------------------------------- the shape ---

select t_check('an event can point at the one it duplicates',
  (select duplicate_of from public.events where id = 'test-evdupe-copy'),
  'test-evdupe-keep');

do $$
begin
  update public.events set duplicate_of = id where id = 'test-evdupe-copy';
  raise warning 'FAIL  and never at itself';
exception when check_violation then
  raise notice 'PASS  and never at itself';
end
$$;

select t_check('the flag is a foreign key, so it cannot point at nothing',
  (select count(*)::int from information_schema.table_constraints
    where constraint_name = 'events_duplicate_fk'), 1);

-- ------------------------------------------------------------- as a member ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_apply_event_update('test-evdupe-copy');
  raise warning 'FAIL  a member cannot merge two dates';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot merge two dates';
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_keep_event_separate('test-evdupe-copy');
  raise warning 'FAIL  nor say two dates are different nights';
exception when insufficient_privilege then
  raise notice 'PASS  nor say two dates are different nights';
end
$$;

reset role;

select t_check('and both dates are still there',
  (select count(*)::int from public.events where id like 'test-evdupe-%'), 3);

-- ------------------------------------------------------------ as an admin ---

do $$
declare v_target text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  v_target := public.hc_admin_apply_event_update('test-evdupe-copy');
  if v_target = 'test-evdupe-keep' then
    raise notice 'PASS  an admin can merge one into the other';
  else
    raise warning 'FAIL  an admin can merge one into the other  (got %)', v_target;
  end if;
end
$$;

reset role;

select t_check('one date is left',
  (select count(*)::int from public.events where id like 'test-evdupe-%'), 2);

select t_check('and it is the one the church already had',
  (select count(*)::int from public.events where id = 'test-evdupe-keep'), 1);

select t_check('the newer name is on it',
  (select title from public.events where id = 'test-evdupe-keep'), 'Women''s Night');

select t_check('and the link the newer one carried',
  (select signup_url from public.events where id = 'test-evdupe-keep'),
  'https://example.com/rsvp');

/* The half that would be quietly destructive, and the reason section 3 of the
   migration is as long as it is. The copy said nothing about a location and
   nothing about what the evening is; both must survive. */
select t_check('a location the newer one did not mention is still there',
  (select location from public.events where id = 'test-evdupe-keep'),
  'The Loft, upstairs');

select t_check('and so is the blurb',
  (select description from public.events where id = 'test-evdupe-keep'),
  'An evening for the women of the church.');

/* THE TIME THE CHURCH VOUCHED FOR. The copy carried nine in the morning and a
   label saying the hour was not known. Taking that across would have moved a
   half past six in the evening to a nine o'clock nobody chose. */
select t_check('the evening does not move to the parser''s guess',
  (select starts_at from public.events where id = 'test-evdupe-keep'),
  '2030-10-23 23:30:00+00'::timestamptz);

select t_check('and it is still a known time rather than a label',
  (select time_label is null from public.events where id = 'test-evdupe-keep'), true);

-- --------------------------------------------------------- what followed it ---

select t_check('the announcement points at the date that stayed',
  (select event_id from public.announcements where id = 'test-evdupe-card'),
  'test-evdupe-keep');

select t_check('and so does the third copy, rather than at nothing',
  (select duplicate_of from public.events where id = 'test-evdupe-third'),
  'test-evdupe-keep');

select t_check('the note about who approved the row that went is gone with it',
  (select count(*)::int from public.review_approvals
    where kind = 'event' and row_id = 'test-evdupe-copy'), 0);

-- ------------------------------------------------------------ what stayed ---
-- Merging is tidying, not approving. Nothing new reached the calendar.

select t_check('merging did not publish anything',
  (select published and review_state = 'approved'
     from public.events where id = 'test-evdupe-keep'), true);

select t_check('and the third copy is still waiting on somebody',
  (select published = false and review_state = 'pending'
     from public.events where id = 'test-evdupe-third'), true);

-- Pressed twice, which is what a button on a phone with a bad connection is.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_apply_event_update('test-evdupe-copy');
  raise warning 'FAIL  merging the same one twice says so rather than merging something else';
exception when others then
  raise notice 'PASS  merging the same one twice says so rather than merging something else';
end
$$;

reset role;

-- ---------------------------------------------------- two different nights ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ac000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_keep_event_separate('test-evdupe-third');
end
$$;

reset role;

select t_check('an admin can say they are two different nights',
  (select duplicate_of is null and duplicate_note is null
     from public.events where id = 'test-evdupe-third'), true);

select t_check('and the pass does not come back to ask again',
  (select dedupe_checked_at is not null
     from public.events where id = 'test-evdupe-third'), true);

select t_check('saying so did not delete anything',
  (select count(*)::int from public.events where id like 'test-evdupe-%'), 2);

-- ------------------------------------------------------ nothing else writes ---
-- events still has no write policy for any client role, which 0026 decided and
-- 0040, 0041, 0042 and now 0052 have each restated. The three columns this
-- migration adds are not a way in.

select t_check('a session cannot write the flag directly',
  has_column_privilege('authenticated', 'public.events', 'duplicate_of', 'UPDATE'), false);

select t_check('nor the checked stamp',
  has_column_privilege('authenticated', 'public.events', 'dedupe_checked_at', 'UPDATE'), false);

-- And the tick reads the vault, so it is revoked from everybody.
select t_check('the tick is not callable from a session',
  has_function_privilege('authenticated', 'public.hc_event_dedupe_tick()', 'EXECUTE'), false);

select t_check('and neither is it callable signed out',
  has_function_privilege('anon', 'public.hc_event_dedupe_tick()', 'EXECUTE'), false);
