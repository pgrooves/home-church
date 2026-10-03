-- ===========================================================================
-- ROLLBACK for 0085_happy_lion_cafe.sql
--
-- Puts the database back exactly as it was on 2026-10-03, before the Happy
-- Lion Cafe was applied. The functions restored below are copied from the
-- live project as it stood that day (hc_admin_list_users as 0036 left it,
-- hc_send_push and the push_log topics as 0078 left them), checked against
-- the live definitions before 0085 went in.
--
-- WHAT IT THROWS AWAY: every cafe order, the menu and pickup times, who had
-- Cafe mode, and the cafe settings. Square keeps its own record of every
-- payment, so nothing about money is lost, only the app's copy of the queue.
--
-- HOW TO RUN IT: Supabase dashboard -> SQL Editor -> paste -> Run. One
-- transaction: it all happens or none of it does. Then delete the three
-- cafe Edge Functions and redeploy send-push from the tag pre-happy-lion-cafe
-- (see .claude/ledgers/happy-lion-cafe.md, Rollback).
-- ===========================================================================

begin;

-- The notification type goes first, so the constraint below can be put back.
delete from public.push_log where topic = 'cafe_ready';

alter table public.push_log drop constraint if exists push_log_topic_known;
alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review',
                   'banner'));

create or replace function public.hc_send_push(
  p_topic   text,
  p_dry_run boolean default false,
  p_ref     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_topic not in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                     'announcement', 'announcement_review', 'event_review',
                     'banner') then
    raise exception 'hc_send_push: unknown topic %', p_topic;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_push_cron_secret';

  if v_secret is null then
    raise exception 'hc_send_push: hc_push_cron_secret is missing from the vault. Re-run migration 0012.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('topic', p_topic, 'dry_run', p_dry_run, 'ref', p_ref),
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_send_push(text, boolean, text) from public, anon, authenticated;
grant execute on function public.hc_send_push(text, boolean, text) to service_role;

-- The users list, without is_barista.
drop function if exists public.hc_admin_list_users();

create or replace function public.hc_admin_list_users()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  last_name   text,
  role        text,
  is_leader   boolean,
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
           u.created_at
      from auth.users u
      left join public.profiles p on p.id = u.id
     -- Admins first, then leaders, then everybody by name. Spelled out rather
     -- than left to the fact that 'admin' happens to sort before 'member'.
     order by (coalesce(p.role, 'member') = 'admin') desc,
              coalesce(p.can_host, false) desc,
              lower(coalesce(nullif(p.first_name, ''), u.email::text));
end;
$$;

revoke all on function public.hc_admin_list_users() from public, anon, authenticated;
grant execute on function public.hc_admin_list_users() to authenticated;

-- Everything the cafe added.
drop function if exists public.hc_cafe_set_open(text);
drop function if exists public.hc_cafe_set_open(boolean);
drop function if exists public.hc_cafe_set_taking_orders(boolean);
drop function if exists public.hc_cafe_set_status(uuid, text);
drop function if exists public.hc_cafe_queue(date);
drop function if exists public.hc_cafe_ahead(uuid);
drop function if exists public.hc_cafe_mark_paid(text, text, integer, integer);
drop function if exists public.hc_cafe_slot_load(date);
drop function if exists public.hc_cafe_today();
drop function if exists public.hc_admin_set_barista(uuid, boolean);
drop function if exists public.hc_is_barista();

drop trigger if exists profiles_guard_cafe_change on public.profiles;
drop function if exists public.hc_guard_cafe_change();

drop table if exists public.cafe_square_events;
drop table if exists public.cafe_orders;
drop table if exists public.cafe_slots;
drop table if exists public.cafe_menu_items;

alter table public.profiles drop column if exists can_run_cafe;

delete from public.app_settings where key like 'cafe\_%';

commit;
