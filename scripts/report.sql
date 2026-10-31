-- The /report numbers. One read-only query, one JSON object back.
--
-- COUNTS ONLY. The privacy policy says the app does not track anybody, so
-- this never returns a name, an email, a row about one person, or anything
-- anybody wrote. Journal and group notes are counted, never read. Keep it
-- that way: a report that names people is a different thing and needs asking.
--
-- The period is the 14 days up to now; "prev" is the 14 days before that.
-- The two App Review demo accounts are left out of every account count.
-- Cafe counts Square production orders only; sandbox orders are tests.
-- Notifications count what went to the church, not admin review alerts.

with
p as (
  select now() as e, now() - interval '14 days' as s, now() - interval '28 days' as ps
),
u as (
  select id, created_at, last_sign_in_at from auth.users
  where coalesce(email, '') not in ('homechurchappleader@outlook.com',
                                    'homechurchappreview@outlook.com')
),
pl as (
  select * from push_log
  where topic not in ('test', 'instagram_sync')
    and topic not like '%review%'
),
co as (
  select * from cafe_orders
  where square_env = 'production' and paid_at is not null
),
ann as (
  select * from announcements
  where published and deleted_at is null
    and coalesce(review_state, 'approved') = 'approved'
),
ev as (
  select * from events
  where published and coalesce(review_state, 'approved') = 'approved'
),
runs as (
  select 'Instagram' as feed, ran_at, ok from instagram_sync_runs
  union all select 'TikTok', ran_at, ok from tiktok_sync_runs
  union all select 'Newsletter', ran_at, ok from newsletter_runs
)
select json_build_object(
  'generated_at',   (select e from p),
  'period_start',   (select s from p),

  'accounts_total',     (select count(*) from u),
  'accounts_new',       (select count(*) from u, p where u.created_at >= p.s),
  'accounts_new_prev',  (select count(*) from u, p where u.created_at >= p.ps and u.created_at < p.s),
  'signins',            (select count(*) from u, p where u.last_sign_in_at >= p.s),

  'phones_ios',      (select count(*) from device_tokens where active and platform = 'ios'),
  'phones_android',  (select count(*) from device_tokens where active and platform = 'android'),
  'phones_new',      (select count(*) from device_tokens, p where created_at >= p.s),
  'phones_new_prev', (select count(*) from device_tokens, p where created_at >= p.ps and created_at < p.s),

  'notif_delivered',      (select coalesce(sum(delivered), 0) from pl, p where ran_at >= p.s),
  'notif_delivered_prev', (select coalesce(sum(delivered), 0) from pl, p where ran_at >= p.ps and ran_at < p.s),

  'rooms',            (select count(*) from group_rooms, p where created_at >= p.s),
  'rooms_prev',       (select count(*) from group_rooms, p where created_at >= p.ps and created_at < p.s),
  'room_joins',       (select count(*) from group_room_members, p where joined_at >= p.s),
  'room_joins_prev',  (select count(*) from group_room_members, p where joined_at >= p.ps and joined_at < p.s),
  'room_notes',       (select count(*) from group_room_notes, p where created_at >= p.s and removed_at is null),
  'room_notes_prev',  (select count(*) from group_room_notes, p where created_at >= p.ps and created_at < p.s and removed_at is null),

  'journal_people',      (select count(distinct user_id) from journal_entries, p where created_at >= p.s and deleted_at is null),
  'journal_people_prev', (select count(distinct user_id) from journal_entries, p where created_at >= p.ps and created_at < p.s and deleted_at is null),

  'cafe_orders',      (select count(*) from co, p where paid_at >= p.s),
  'cafe_orders_prev', (select count(*) from co, p where paid_at >= p.ps and paid_at < p.s),
  'cafe_cents',       (select coalesce(sum(total_cents), 0) from co, p where paid_at >= p.s),

  'contact',       (select count(*) from contact_messages, p where created_at >= p.s),
  'contact_prev',  (select count(*) from contact_messages, p where created_at >= p.ps and created_at < p.s),

  'pub_guides',    (select count(*) from guides, p where published and created_at >= p.s),
  'pub_sermons',   (select count(*) from podcasts, p where published and created_at >= p.s),
  'pub_ann',       (select count(*) from ann, p where created_at >= p.s),
  'pub_worship',   (select count(*) from worship_sets, p where published and created_at >= p.s),
  'pub_homekids',  (select count(*) from homekids_lessons, p where published and created_at >= p.s),
  'pub_events',    (select count(*) from ev, p where created_at >= p.s),

  'groups_listed', (select count(*) from groups where published),
  'upcoming_count', (select count(*) from ev, p where starts_at >= p.e and starts_at < p.e + interval '14 days'),
  'upcoming', (
    select coalesce(json_agg(x order by x.starts_at), '[]'::json) from (
      select title, starts_at from ev, p
      where starts_at >= p.e and starts_at < p.e + interval '14 days'
      order by starts_at limit 4
    ) x
  ),

  'feeds', (
    select json_agg(f order by f.feed) from (
      select feed,
             count(*) filter (where ran_at >= (select s from p)) as runs,
             count(*) filter (where ran_at >= (select s from p) and ok) as ok,
             max(ran_at) filter (where ok) as last_ok
      from runs group by feed
    ) f
  )
) as report;
