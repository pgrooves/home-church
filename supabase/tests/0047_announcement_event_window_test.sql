-- ===========================================================================
-- An announcement retires with the date it is about.
--
-- The database half of the rule in liveAnnouncements() (js/data.js): a card
-- with no ends_on of its own comes down the morning after its event, and the
-- Send button must not push one that has. Everything else about the send is
-- 0027's test and is not repeated here; this file only asks the question 0047
-- added, and asks it from both sides so a green run is not just "it refused
-- something".
--
-- The same caveat 0027 opens with still applies: actually reaching a phone is
-- APNs from an Edge Function and cannot happen in a throwaway Postgres. What
-- is tested is which rows are refused before anybody's phone lights up.
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

insert into auth.users (id, email) values
  ('cc000000-0000-0000-0000-000000000001', 'padmin@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('cc000000-0000-0000-0000-000000000001', 'Ada')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin' where id = 'cc000000-0000-0000-0000-000000000001';

delete from public.announcements where id like 'evwin-%';
delete from public.events where id like 'evwin-%';

-- The secret 0012 generates on a real project, for the same reason 0027's test
-- puts it here: without it the one row that should be allowed stops at "the
-- secret is missing", which is a real refusal and would hide the thing this
-- file is trying to prove.
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_push_cron_secret', 'harness-secret')
on conflict (name) do nothing;

/* Two events, one on either side of today, at a time of day that is yesterday
   in the church and today in Greenwich. 6:30 PM in Metairie is 23:30Z in
   summer and 00:30Z the next day in winter, so a UTC comparison would put this
   event on the wrong day for half the year — which is the bug the `at time
   zone` in 0047 exists to avoid, and this is the row that would catch it. */
insert into public.events (id, title, starts_at, published) values
  ('evwin-event-past',   'Serve day',  (current_date - 1) + time '18:30' at time zone 'America/Chicago', true),
  ('evwin-event-future', 'Homecoming', (current_date + 7) + time '18:30' at time zone 'America/Chicago', true),
  -- Past, and never approved out of the review queue, which 0041 allows. No
  -- phone has this row: js/content.js syncs with the anon key, so it holds
  -- published events and nothing else.
  ('evwin-event-hidden', 'Quiet one',  (current_date - 1) + time '18:30' at time zone 'America/Chicago', false);

insert into public.announcements (id, title, published, starts_on, ends_on, event_id) values
  -- The case this is all for: no end date, and its date has been and gone.
  ('evwin-past',        'Serve day',   true, null, null, 'evwin-event-past'),
  -- The same shape, still ahead of us. Nothing about it has changed.
  ('evwin-future',      'Homecoming',  true, null, null, 'evwin-event-future'),
  -- A person typed an end date. It wins, and the past event does not shorten
  -- it, which is the half of the rule that is easiest to get backwards.
  ('evwin-ends-later',  'Serve day',   true, null, current_date + 30, 'evwin-event-past'),
  -- No event at all. Still open ended, still sendable, as it was before 0047.
  ('evwin-no-event',    'Come along',  true, null, null, null),
  -- An event id pointing at nothing, which is what a deleted event leaves
  -- behind for as long as it takes the foreign key to null the column.
  ('evwin-lost-event',  'Orphan',      true, null, null, null),
  -- Approved, up on Home, and pointing at an event no phone can see. This one
  -- must still be sendable: the card is genuinely there.
  ('evwin-hidden-event', 'Quiet one',  true, null, null, 'evwin-event-hidden');

update public.announcements set event_id = 'evwin-event-past' where id = 'evwin-lost-event';
delete from public.events where id = 'evwin-event-past';

-- The delete above is the point: `on delete set null` from 0040 clears the
-- column, so the orphan case cannot actually be reached through the schema.
-- Assert that rather than pretend otherwise, then put the event back for the
-- rows that need it.
select t_check('deleting an event clears the column that pointed at it',
  (select event_id from public.announcements where id = 'evwin-lost-event'), null);

insert into public.events (id, title, starts_at, published) values
  ('evwin-event-past', 'Serve day', (current_date - 1) + time '18:30' at time zone 'America/Chicago', true);

update public.announcements set event_id = 'evwin-event-past'
 where id in ('evwin-past', 'evwin-ends-later');

-- ------------------------------------------------------- what is refused ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cc000000-0000-0000-0000-000000000001"}';

  select t_raises_like('an announcement whose date has passed cannot be sent',
    $$select public.hc_admin_send_announcement('evwin-past')$$,
    'came down with its date');

  -- Three rows that 0047 must not have caught in passing. Each one reaches the
  -- sender, which is the assertion: no refusal stood in the way.
  select t_check('one whose date is still ahead of us sends',
    (select public.hc_admin_send_announcement('evwin-future')) is not null, true);

  select t_check('an end date in the future wins over a past event',
    (select public.hc_admin_send_announcement('evwin-ends-later')) is not null, true);

  select t_check('an announcement with no event is untouched by any of this',
    (select public.hc_admin_send_announcement('evwin-no-event')) is not null, true);

  select t_check('and so is one whose event has been deleted',
    (select public.hc_admin_send_announcement('evwin-lost-event')) is not null, true);

  /* The one that is easy to get wrong in the other direction. An unpublished
     event is on no phone, so the card is on Home and refusing to announce it
     would be this function disagreeing with the app about what is on screen.
     Nothing is refused on the strength of a row nobody can see. */
  select t_check('an event no phone can see refuses nothing',
    (select public.hc_admin_send_announcement('evwin-hidden-event')) is not null, true);
commit;

-- ----------------------------------------------------------------- tidy ---

delete from public.announcements where id like 'evwin-%';
delete from public.events where id like 'evwin-%';
