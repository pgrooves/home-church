-- ===========================================================================
-- "The sermon audio is up" goes out at noon.
--
-- Nothing here reaches APNs. What is checked: the noon rule, on both sides of
-- 12:00 and across daylight saving; that /new-podcast's call books and does
-- not send; that only the slash command's key can book; that the clock sends
-- once, at noon or after and never before; and that a message which stopped
-- being ready by noon is not sent.
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

insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hc_push_cron_secret', 'harness-secret')
on conflict (name) do nothing;

delete from public.podcasts where id like 'sermon-0099-%';

create temp table t_noon (label text, at_local timestamp, want_local timestamp);
insert into t_noon values
  ('a 9am run goes at noon that day',            '2026-11-17 09:00', '2026-11-17 12:00'),
  ('a 11:59 run still goes at noon that day',    '2026-11-17 11:59:59', '2026-11-17 12:00'),
  ('a run at exactly noon goes the next day',    '2026-11-17 12:00', '2026-11-18 12:00'),
  ('a 7pm Tuesday routine goes Wednesday noon',  '2026-11-17 19:00', '2026-11-18 12:00'),
  ('a 11:59pm run goes the next day',            '2026-11-17 23:59', '2026-11-18 12:00'),
  ('a 12:30am run goes that same day',           '2026-11-18 00:30', '2026-11-18 12:00'),
  ('the last day of the month rolls over',       '2026-11-30 15:00', '2026-12-01 12:00'),
  ('noon the day daylight time ends is noon',    '2026-10-31 20:00', '2026-11-01 12:00'),
  ('noon the day daylight time starts is noon',  '2027-03-13 20:00', '2027-03-14 12:00');

select t_check(label,
  (public.hc_new_sermon_noon(at_local at time zone 'America/Chicago') at time zone 'America/Chicago'),
  want_local)
from t_noon;

select t_check('noon in standard time is 18:00 UTC',
  public.hc_new_sermon_noon('2026-11-17 15:00+00'), '2026-11-17 18:00+00'::timestamptz);
select t_check('noon in daylight time is 17:00 UTC',
  public.hc_new_sermon_noon('2026-08-11 15:00+00'), '2026-08-11 17:00+00'::timestamptz);


-- ------------------------------------------------------------ who books ---

insert into public.podcasts (id, title, episode_url, preached_on, published) values
  ('sermon-0099-ready', 'Who''s In Your Corner?', 'https://open.spotify.com/episode/x',
     (now() at time zone 'America/Chicago')::date - 2, true),
  ('sermon-0099-later-pulled', 'Pulled Before Noon', 'https://open.spotify.com/episode/p',
     (now() at time zone 'America/Chicago')::date - 2, true),
  ('sermon-0099-manual', 'Sent By Hand', 'https://open.spotify.com/episode/m',
     (now() at time zone 'America/Chicago')::date - 2, true),
  ('sermon-0099-draft', 'A Draft', 'https://open.spotify.com/episode/y',
     (now() at time zone 'America/Chicago')::date - 2, false),
  ('sermon-0099-nolink', 'No Episode Yet', null,
     (now() at time zone 'America/Chicago')::date - 2, true),
  ('sermon-0099-old', 'From The Back Catalogue', 'https://open.spotify.com/episode/z',
     (now() at time zone 'America/Chicago')::date - 60, true);

begin;
  set local role anon;
  select t_raises_like('a phone cannot book it',
    $$select public.hc_schedule_new_sermon('sermon-0099-ready')$$, 'permission denied');
  select t_raises_like('nor run the clock',
    $$select public.hc_new_sermon_tick()$$, 'permission denied');
commit;

begin;
  set local role authenticated;
  select t_raises_like('nor can a signed in person book it',
    $$select public.hc_schedule_new_sermon('sermon-0099-ready')$$, 'permission denied');
commit;


-- ---------------------------------- the same refusals, during the run ---

begin;
  set local role service_role;
  select t_raises_like('an unpublished message is refused straight away',
    $$select public.hc_schedule_new_sermon('sermon-0099-draft')$$, 'not published');
  select t_raises_like('so is one with no episode to play',
    $$select public.hc_schedule_new_sermon('sermon-0099-nolink')$$, 'no episode link');
  select t_raises_like('and one from the back catalogue',
    $$select public.hc_schedule_new_sermon('sermon-0099-old')$$, 'last two weeks');
  select t_raises_like('and one that does not exist',
    $$select public.hc_schedule_new_sermon('sermon-0099-missing')$$, 'No message');
commit;

select t_check('none of those were booked',
  (select count(*)::int from public.podcasts
    where id in ('sermon-0099-draft', 'sermon-0099-nolink', 'sermon-0099-old')
      and push_send_at is not null), 0);


-- --------------------------------------------------------- booking ---

create temp table t_first (j jsonb);
grant all on t_first to service_role;
begin;
  set local role service_role;
  insert into t_first select public.hc_schedule_new_sermon('sermon-0099-ready');
  select public.hc_schedule_new_sermon('sermon-0099-later-pulled');
  select public.hc_schedule_new_sermon('sermon-0099-manual');
commit;

select t_check('this week''s message is booked for the next noon',
  (select push_send_at from public.podcasts where id = 'sermon-0099-ready'),
  public.hc_new_sermon_noon(now()));

select t_check('and booking it sends nothing yet',
  (select push_announced_at from public.podcasts where id = 'sermon-0099-ready'), null::timestamptz);

select t_check('the run hears when it goes',
  (select (j->>'send_at')::timestamptz from t_first), public.hc_new_sermon_noon(now()));

select t_check('in words it can put in the receipt',
  (select j->>'says' like 'noon ' || (j->>'day') || ', %' from t_first), true);

select t_check('today or tomorrow, never anything else',
  (select j->>'day' in ('today', 'tomorrow') from t_first), true);

select t_check('the first call is not already booked',
  (select (j->>'already_booked')::boolean from t_first), false);

/* Run /new-podcast again before noon: the booking stays put. */
update public.podcasts set push_send_at = '2026-11-18 18:00+00' where id = 'sermon-0099-ready';

create temp table t_again (j jsonb);
grant all on t_again to service_role;
begin;
  set local role service_role;
  insert into t_again select public.hc_schedule_new_sermon('sermon-0099-ready');
commit;

select t_check('a second run leaves the booking where it was',
  (select push_send_at from public.podcasts where id = 'sermon-0099-ready'),
  '2026-11-18 18:00+00'::timestamptz);

select t_check('and says it was already booked',
  (select (j->>'already_booked')::boolean from t_again), true);


-- ------------------------------------------------------------ the clock ---

update public.podcasts set push_send_at = '2026-11-18 18:00+00'
 where id in ('sermon-0099-later-pulled', 'sermon-0099-manual');

/* Somebody unpublishes one before noon, and sends another by hand. */
update public.podcasts set published = false where id = 'sermon-0099-later-pulled';

begin;
  set local role service_role;
  select public.hc_announce_new_sermon('sermon-0099-manual');
commit;

/* The clock is called with fake "nows" in November, so the 14 day window has
   to be measured from them too. */
update public.podcasts set preached_on = '2026-11-15'
 where id in ('sermon-0099-ready', 'sermon-0099-later-pulled', 'sermon-0099-manual');

begin;
  set local role service_role;
  select t_check('at 11:59 the clock sends nothing',
    public.hc_new_sermon_tick('2026-11-18 17:59+00'), 'nothing due');
commit;

select t_check('so nothing is stamped before noon',
  (select push_announced_at from public.podcasts where id = 'sermon-0099-ready'), null::timestamptz);

create temp table t_tick (said text);
grant all on t_tick to service_role;
begin;
  set local role service_role;
  insert into t_tick select public.hc_new_sermon_tick('2026-11-18 18:00+00');
commit;

select t_check('at noon the clock sends the ready one',
  (select said like '%sent sermon-0099-ready%' from t_tick), true);

select t_check('and stamps it as told',
  (select push_announced_at is not null from public.podcasts where id = 'sermon-0099-ready'), true);

select t_check('the one pulled before noon is not sent',
  (select said like '%not sent, no longer ready: sermon-0099-later-pulled%' from t_tick), true);

select t_check('nor stamped',
  (select push_announced_at from public.podcasts where id = 'sermon-0099-later-pulled'), null::timestamptz);

select t_check('and is unbooked, so it cannot go out some later noon',
  (select push_send_at from public.podcasts where id = 'sermon-0099-later-pulled'), null::timestamptz);

select t_check('the one already sent by hand is not sent twice',
  (select said not like '%sermon-0099-manual%' from t_tick), true);

update public.podcasts set preached_on = (now() at time zone 'America/Chicago')::date - 2
 where id = 'sermon-0099-ready';

begin;
  set local role service_role;
  select t_check('a minute later there is nothing left to send',
    public.hc_new_sermon_tick('2026-11-18 18:01+00'), 'nothing due');
  select t_raises_like('and /new-podcast again after noon refuses, already told',
    $$select public.hc_schedule_new_sermon('sermon-0099-ready')$$, 'already told');
commit;

/* A clock that was down at noon catches up on its next run, but the two week
   rule still holds, so a forgotten booking never surfaces weeks late. */
update public.podcasts
   set published = true, push_send_at = '2026-11-18 18:00+00', preached_on = '2026-11-15'
 where id = 'sermon-0099-later-pulled';

begin;
  set local role service_role;
  select t_check('a booking a month stale is not sent',
    public.hc_new_sermon_tick('2026-12-18 18:00+00'),
    'not sent, no longer ready: sermon-0099-later-pulled');
commit;

select t_check('there is still one hc_announce_new_sermon, not two',
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hc_announce_new_sermon'), 1);

delete from public.podcasts where id like 'sermon-0099-%';
