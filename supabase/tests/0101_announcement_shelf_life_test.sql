-- ===========================================================================
-- Every announcement comes down on its own.
--
-- What is checked: a new announcement with no end date gets one, 21 days on
-- from when it goes up; one with an end date keeps it; an edit that clears the
-- date keeps it cleared; the number in App settings is used, a bad one counts
-- as 21, and 0 turns it off.
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

begin;

-- Start from the shipped number, whatever an earlier test left behind.
update public.app_settings set value_text = '21' where key = 'announcement_shelf_days';

select t_check('0101: the setting ships at 21 days',
  (select value_text from public.app_settings where key = 'announcement_shelf_days'), '21');

insert into public.announcements (id, title) values ('t101-undated', 'No date given');
select t_check('0101: no end date comes down 21 days after today, church time',
  (select ends_on from public.announcements where id = 't101-undated'),
  (now() at time zone 'America/Chicago')::date + 21);

insert into public.announcements (id, title, starts_on)
values ('t101-later', 'Goes up later', date '2027-01-10');
select t_check('0101: a later start counts from the day it goes up',
  (select ends_on from public.announcements where id = 't101-later'), date '2027-01-31');

insert into public.announcements (id, title, ends_on)
values ('t101-dated', 'Event card', date '2027-03-02');
select t_check('0101: an end date that was given is left alone',
  (select ends_on from public.announcements where id = 't101-dated'), date '2027-03-02');

update public.announcements set ends_on = null where id = 't101-undated';
select t_check('0101: clearing the date on an edit keeps it up for good',
  (select ends_on from public.announcements where id = 't101-undated'), null::date);

update public.announcements set title = 'Retitled' where id = 't101-undated';
select t_check('0101: and a later edit does not put a date back',
  (select ends_on from public.announcements where id = 't101-undated'), null::date);

update public.app_settings set value_text = '14' where key = 'announcement_shelf_days';
insert into public.announcements (id, title, starts_on)
values ('t101-fourteen', 'Two weeks', date '2027-01-10');
select t_check('0101: the number in App settings is the one used',
  (select ends_on from public.announcements where id = 't101-fourteen'), date '2027-01-24');

update public.app_settings set value_text = 'three weeks' where key = 'announcement_shelf_days';
select t_check('0101: words instead of a number count as 21',
  public.hc_announcement_shelf_days(), 21);

update public.app_settings set value_text = '' where key = 'announcement_shelf_days';
select t_check('0101: an empty box counts as 21', public.hc_announcement_shelf_days(), 21);

update public.app_settings set value_text = '9999' where key = 'announcement_shelf_days';
select t_check('0101: an absurd number counts as 21', public.hc_announcement_shelf_days(), 21);

update public.app_settings set value_text = ' 0 ' where key = 'announcement_shelf_days';
insert into public.announcements (id, title) values ('t101-off', 'Switched off');
select t_check('0101: 0 turns it off, and an undated announcement stays undated',
  (select ends_on from public.announcements where id = 't101-off'), null::date);

delete from public.app_settings where key = 'announcement_shelf_days';
select t_check('0101: with the row missing it still means 21',
  public.hc_announcement_shelf_days(), 21);

rollback;

-- Posted from a phone: an admin inserts as `authenticated`, which cannot call
-- the reader itself, so this is the trigger's security definer at work.
insert into auth.users (id, email)
  values ('ee010100-0000-0000-0000-000000000001', 'shelf@example.com') on conflict do nothing;
insert into public.profiles (id, first_name, last_name)
  values ('ee010100-0000-0000-0000-000000000001', 'Shelf', 'Admin') on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = 'ee010100-0000-0000-0000-000000000001';

begin;
  update public.app_settings set value_text = '21' where key = 'announcement_shelf_days';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee010100-0000-0000-0000-000000000001"}';
  insert into public.announcements (id, title, starts_on)
    values ('t101-phone', 'From a phone', date '2027-02-01');
  reset role;
  select t_check('0101: an admin posting from a phone gets the date too',
    (select ends_on from public.announcements where id = 't101-phone'), date '2027-02-22');
rollback;
