-- ===========================================================================
-- One notification for a sitting of approvals.
--
-- Nothing here reaches APNs: net.http_post is the harness's stub. What is
-- checked: only an admin can add to, send or cancel the batch; Yes sets a
-- five minute clock and a later Yes resets it; More stops it with a thirty
-- minute fallback; nothing is sent between 9 pm and 8 am; the clock sends a
-- due batch once and closes it; a row nobody can see cannot be added; and no
-- client role can read the tables directly.
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

insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-000000000001', 'batch-admin@example.com'),
  ('dd000000-0000-0000-0000-000000000002', 'batch-member@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('dd000000-0000-0000-0000-000000000001', 'Ada'),
  ('dd000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do nothing;

update public.profiles set role = 'admin'  where id = 'dd000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member' where id = 'dd000000-0000-0000-0000-000000000002';

delete from public.notify_batches;
delete from public.announcements where id like 'batch-0098-%';
delete from public.events where id like 'batch-0098-%';

insert into public.announcements (id, title, body, published, starts_on, ends_on) values
  ('batch-0098-gala',   'Homecoming Gala, October 29', 'Dress up.', true,  null, null),
  ('batch-0098-market', 'Holiday Market, December 6',  'Shop.',     true,  null, null),
  ('batch-0098-draft',  'Not ready',                   null,        false, null, null),
  ('batch-0098-later',  'Christmas Eve',               null,        true,  current_date + 30, null);

insert into public.events (id, title, starts_at, published) values
  ('batch-0098-gala-date', 'Homecoming Gala', now() + interval '20 days', true),
  ('batch-0098-hidden',    'Hidden',          now() + interval '20 days', false);


-- ------------------------------------------------------------ who may ask ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';
  select t_raises_like('a member cannot add to the batch',
    $s$select public.hc_admin_notify_batch_add('announcement', 'batch-0098-gala', false)$s$,
    'Admins only');
  select t_raises_like('a member cannot read the batch',
    $s$select public.hc_admin_notify_batch()$s$, 'Admins only');
  select t_raises_like('a member cannot send it',
    $s$select public.hc_admin_notify_batch_send_now()$s$, 'Admins only');
  select t_raises_like('a member cannot cancel it',
    $s$select public.hc_admin_notify_batch_cancel()$s$, 'Admins only');
  select t_raises_like('a member cannot read the table',
    $s$select count(*) from public.notify_batches$s$, 'permission denied');
commit;

begin;
  set local role anon;
  select t_raises_like('anon cannot add to the batch',
    $s$select public.hc_admin_notify_batch_add('announcement', 'batch-0098-gala', false)$s$,
    'permission denied');
  select t_raises_like('anon cannot run the clock',
    $s$select public.hc_notify_batch_tick()$s$, 'permission denied');
  select t_raises_like('anon cannot read the items',
    $s$select count(*) from public.notify_batch_items$s$, 'permission denied');
commit;


-- --------------------------------------------- what can and cannot go in ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_check('nothing is waiting to begin with',
    (public.hc_admin_notify_batch() ->> 'open')::boolean, false);

  select t_raises_like('a draft cannot go in',
    $s$select public.hc_admin_notify_batch_add('announcement', 'batch-0098-draft', false)$s$,
    'not on Home');
  select t_raises_like('one dated for next month cannot go in',
    $s$select public.hc_admin_notify_batch_add('announcement', 'batch-0098-later', false)$s$,
    'does not go up until');
  select t_raises_like('an unpublished date cannot go in',
    $s$select public.hc_admin_notify_batch_add('event', 'batch-0098-hidden', false)$s$,
    'not on the calendar');
  select t_raises_like('an unknown kind is refused',
    $s$select public.hc_admin_notify_batch_add('podcast', 'x', false)$s$, 'unknown kind');
commit;

select t_check('the refusals opened no batch',
  (select count(*)::int from public.notify_batches), 0);


-- --------------------------------------------------------- Yes and More ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  select t_check('Yes on the first opens a batch with one thing in it',
    jsonb_array_length(public.hc_admin_notify_batch_add('announcement', 'batch-0098-gala', false) -> 'items'), 1);
commit;

select t_check('Yes sends five minutes from now',
  (select send_at between now() + interval '4 minutes 50 seconds'
                      and now() + interval '5 minutes 10 seconds'
     from public.notify_batches where closed_at is null), true);

-- Pretend the first Yes was three minutes ago, so a second Yes visibly resets.
update public.notify_batches set send_at = now() + interval '2 minutes'
 where closed_at is null;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  select t_check('a second Yes joins the same batch',
    jsonb_array_length(public.hc_admin_notify_batch_add('event', 'batch-0098-gala-date', false) -> 'items'), 2);
commit;

select t_check('and resets the clock to five minutes',
  (select send_at > now() + interval '4 minutes' from public.notify_batches where closed_at is null), true);
select t_check('there is still one batch',
  (select count(*)::int from public.notify_batches), 1);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  select t_check('the same row twice is still one item',
    jsonb_array_length(public.hc_admin_notify_batch_add('event', 'batch-0098-gala-date', false) -> 'items'), 2);
  select t_check('More adds it and says the clock is held',
    (public.hc_admin_notify_batch_add('announcement', 'batch-0098-market', true) ->> 'held')::boolean, true);
commit;

select t_check('More stops the clock',
  (select send_at from public.notify_batches where closed_at is null), null::timestamptz);

select t_check('the clock leaves a held batch alone inside thirty minutes',
  public.hc_notify_batch_tick(now() + interval '29 minutes') like 'waiting until%', true);


-- ------------------------------------------------------------- the clock ---

update public.notify_batches
   set send_at = '2026-11-07 15:00:00-06', last_activity_at = '2026-11-07 14:55:00-06'
 where closed_at is null;

select t_check('before it is due, the clock waits',
  public.hc_notify_batch_tick('2026-11-07 14:59:00-06') like 'waiting until%', true);
select t_check('once it is due, the clock sends it',
  public.hc_notify_batch_tick('2026-11-07 15:00:30-06') like 'sent batch%', true);
select t_check('and closes it as sent',
  (select outcome from public.notify_batches order by id desc limit 1), 'sent');
select t_check('the next tick finds nothing',
  public.hc_notify_batch_tick('2026-11-07 15:01:30-06'), 'nothing waiting');


-- ---------------------------------------------------------- quiet hours ---

select t_check('due in the afternoon stays in the afternoon',
  public.hc_notify_batch_due('2026-11-07 15:05:00-06', null), '2026-11-07 15:05:00-06'::timestamptz);
select t_check('due at 9:10 pm waits for 8 am the next day',
  public.hc_notify_batch_due('2026-11-07 21:10:00-06', null), '2026-11-08 08:00:00-06'::timestamptz);
select t_check('due at 3 am waits for 8 am that morning',
  public.hc_notify_batch_due('2026-11-08 03:00:00-06', null), '2026-11-08 08:00:00-06'::timestamptz);
select t_check('due at 8:59 pm still goes at 8:59 pm',
  public.hc_notify_batch_due('2026-11-07 20:59:00-06', null), '2026-11-07 20:59:00-06'::timestamptz);
select t_check('a held batch is due thirty minutes after the last activity',
  public.hc_notify_batch_due(null, '2026-11-07 14:00:00-06'), '2026-11-07 14:30:00-06'::timestamptz);
select t_check('a held batch whose thirty minutes end at night waits for 8 am',
  public.hc_notify_batch_due(null, '2026-11-07 20:45:00-06'), '2026-11-08 08:00:00-06'::timestamptz);


-- ---------------------------------------------- Don't send, and Send now ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  select t_check('after a send, the next Yes opens a new batch with one thing',
    jsonb_array_length(public.hc_admin_notify_batch_add('announcement', 'batch-0098-market', false) -> 'items'), 1);
  select t_check('Don''t send closes it',
    (public.hc_admin_notify_batch_cancel() ->> 'open')::boolean, false);
commit;

select t_check('closed as cancelled, not sent',
  (select outcome from public.notify_batches order by id desc limit 1), 'cancelled');
select t_check('and the clock has nothing to send',
  public.hc_notify_batch_tick(now() + interval '1 hour'), 'nothing waiting');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  select public.hc_admin_notify_batch_add('announcement', 'batch-0098-gala', true);
  select t_check('Send now sends a held batch straight away',
    (public.hc_admin_notify_batch_send_now() ->> 'open')::boolean, false);
  select t_raises_like('Send now with nothing waiting says so',
    $s$select public.hc_admin_notify_batch_send_now()$s$, 'Nothing is waiting');
commit;

select t_check('closed as sent',
  (select outcome from public.notify_batches order by id desc limit 1), 'sent');


-- ------------------------------------------------- schedule this instead ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';
  select t_raises_like('a member cannot schedule it',
    $s$select public.hc_admin_notify_batch_schedule(now() + interval '1 day')$s$, 'Admins only');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  select t_raises_like('scheduling with nothing waiting says so',
    $s$select public.hc_admin_notify_batch_schedule(now() + interval '1 day')$s$, 'Nothing is waiting');
  select public.hc_admin_notify_batch_add('announcement', 'batch-0098-gala', false);
  select t_raises_like('a time in the past is refused',
    $s$select public.hc_admin_notify_batch_schedule(now() - interval '1 hour')$s$, 'later than now');
  select t_raises_like('a time next year is refused',
    $s$select public.hc_admin_notify_batch_schedule(now() + interval '60 days')$s$, 'thirty days');
  select t_check('scheduling it says so',
    (public.hc_admin_notify_batch_schedule(now() + interval '2 days') ->> 'scheduled')::boolean, true);
commit;

select t_check('and moves its time to the one picked',
  (select send_at between now() + interval '47 hours' and now() + interval '49 hours'
     from public.notify_batches where closed_at is null), true);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  select t_check('a Yes after scheduling joins the batch',
    jsonb_array_length(public.hc_admin_notify_batch_add('announcement', 'batch-0098-market', false) -> 'items'), 2);
commit;

select t_check('and leaves the scheduled time alone',
  (select send_at > now() + interval '47 hours' and scheduled
     from public.notify_batches where closed_at is null), true);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  select public.hc_admin_notify_batch_add('event', 'batch-0098-gala-date', true);
commit;

select t_check('so does a More',
  (select send_at is not null and scheduled from public.notify_batches where closed_at is null), true);

select t_check('a scheduled time at 10 pm is kept, quiet hours or not',
  public.hc_notify_batch_due('2026-11-07 22:00:00-06', null, true), '2026-11-07 22:00:00-06'::timestamptz);

update public.notify_batches
   set send_at = '2026-11-07 22:00:00-06'
 where closed_at is null;

select t_check('the clock waits for the scheduled time',
  public.hc_notify_batch_tick('2026-11-07 21:59:00-06') like 'waiting until%', true);
select t_check('and sends at it',
  public.hc_notify_batch_tick('2026-11-07 22:00:30-06') like 'sent batch%', true);


-- ------------------------------------------------------- taking turns ---

select t_check('the first turn of a wording is 1',
  public.hc_push_wording_turn('test-0098'), 1);
select t_check('and the next is 2',
  public.hc_push_wording_turn('test-0098'), 2);
delete from public.push_wording_turns where key = 'test-0098';

begin;
  set local role anon;
  select t_raises_like('anon cannot move the turns',
    $s$select public.hc_push_wording_turn('test-0098')$s$, 'permission denied');
commit;

select t_check('push_log knows the topic',
  (select pg_get_constraintdef(oid) like '%approved_batch%'
     from pg_constraint where conname = 'push_log_topic_known'), true);

delete from public.notify_batches;
delete from public.announcements where id like 'batch-0098-%';
delete from public.events where id like 'batch-0098-%';
