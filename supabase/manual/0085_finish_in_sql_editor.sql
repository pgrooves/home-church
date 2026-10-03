-- ===========================================================================
-- Happy Lion Cafe, the last two statements of 0085, to paste into the
-- Supabase SQL Editor (dashboard -> SQL Editor -> New query -> Run).
--
-- WHY THESE TWO ARE HERE. 0085 went into the live project on 2026-10-03
-- through the Supabase connector, which holds anything that drops for a
-- confirmation that cannot reach this session. Everything else in 0085 went
-- in; these two each replace something that already exists, so they need a
-- person to run them.
--
--   1. push_log may record the "coffee ready" notification. Until this runs
--      the notification is still sent, it just leaves no line in push_log.
--   2. Manage users learns who has Cafe mode. Until this runs the Cafe mode
--      switch draws as off for everybody (turning it on still works).
--
-- Safe to run more than once. Undone by supabase/rollback/0085_happy_lion_cafe_down.sql.
-- ===========================================================================

begin;

alter table public.push_log drop constraint if exists push_log_topic_known;
alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review',
                   'banner', 'cafe_ready'));

drop function if exists public.hc_admin_list_users();

create or replace function public.hc_admin_list_users()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  last_name   text,
  role        text,
  is_leader   boolean,
  is_barista  boolean,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select u.id,
           u.email::text,
           p.first_name,
           p.last_name,
           coalesce(p.role, 'member'),
           coalesce(p.can_host, false),
           coalesce(p.can_run_cafe, false),
           u.created_at
      from auth.users u
      left join public.profiles p on p.id = u.id
     order by (coalesce(p.role, 'member') = 'admin') desc,
              coalesce(p.can_host, false) desc,
              lower(coalesce(nullif(p.first_name, ''), u.email::text));
end;
$$;

revoke all on function public.hc_admin_list_users() from public, anon, authenticated;
grant execute on function public.hc_admin_list_users() to authenticated;

commit;
