-- ===========================================================================
-- Home Church, telling everybody about an announcement
--
-- WHAT THIS ADDS. A fourth real topic, `announcement`, and a way for an admin
-- to fire it from inside the app. Until now every push was on a clock: the
-- Monday guide notice and the Saturday reminder, both decided by
-- hc_push_tick() in 0012. This is the first one a person causes, at the
-- moment they cause it, which is what an announcement is for.
--
-- WHY THE TOPIC GETS ITS OWN SWITCH rather than going to every active phone
-- the way `test` does. 0012 made the argument already and it holds: a push is
-- addressed before the phone is involved, so the only place a preference can
-- be honored is the sending side, and a notification a person cannot decline
-- without turning all of them off is a notification that costs you the other
-- two. Default true, because somebody who has notifications on at all almost
-- certainly wants to hear that the building flooded.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0025 (hc_is_admin) and 0026 (the announcement columns).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The fourth switch
--
-- Alongside the three from 0012, and shaped exactly like them, including the
-- partial index the sender's one query shape wants.
-- ---------------------------------------------------------------------------

alter table public.device_tokens
  add column if not exists wants_announcements boolean not null default true;

comment on column public.device_tokens.wants_announcements is
  'Mirrors the Announcements switch in Your account. Default true: a phone that has notifications on at all wants to hear the thing the church posted on purpose.';

create index if not exists device_tokens_announcement_idx
  on public.device_tokens (wants_announcements) where active and wants_announcements;


-- ---------------------------------------------------------------------------
-- 2. push_log learns the topic
--
-- The check constraint from 0012 is a closed vocabulary, which is the right
-- shape and does mean adding to it is a drop and recreate rather than an
-- alter. Written so re-running is a no-op either way.
-- ---------------------------------------------------------------------------

alter table public.push_log drop constraint if exists push_log_topic_known;

alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test', 'announcement'));


-- ---------------------------------------------------------------------------
-- 3. hc_send_push carries a reference
--
-- The three existing topics compose themselves: the sender works out what
-- this week's guide is, or reads the service times off church_profile. An
-- announcement cannot do that, because "the newest published announcement"
-- and "the one the admin just tapped Post on" are not reliably the same row.
-- They differ every time an announcement is written with a starts_on in the
-- future, which is the feature 0003 exists for.
--
-- So the topic needs to name its row, and the function needs a third
-- parameter. That is a DROP and CREATE rather than a CREATE OR REPLACE:
-- adding a defaulted parameter creates a second function rather than
-- replacing the first, and the two would then be ambiguous for every existing
-- two argument call, including the ones inside hc_push_tick(). Dropping first
-- is what keeps exactly one hc_send_push in the project.
--
-- hc_push_tick() calls this by name from plpgsql, which resolves at run time,
-- so it needs no change and gets none.
-- ---------------------------------------------------------------------------

drop function if exists public.hc_send_push(text, boolean);

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
  if p_topic not in ('new_guide', 'sunday_reminder', 'group_day', 'test', 'announcement') then
    raise exception 'hc_send_push: unknown topic %', p_topic;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_push_cron_secret';

  if v_secret is null then
    raise exception 'hc_send_push: hc_push_cron_secret is missing from the vault. Re-run migration 0012.';
  end if;

  -- Fire and forget, unchanged from 0012. The Edge Function writes the
  -- outcome to push_log, which is the thing worth reading later.
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

comment on function public.hc_send_push(text, boolean, text) is
  'Asks the send-push Edge Function to deliver one topic. p_ref names the row a topic is about, which only `announcement` uses. Call with p_dry_run => true to see who would receive it without sending anything.';


-- ---------------------------------------------------------------------------
-- 4. The button an admin actually presses
--
-- hc_send_push is revoked from every client role and stays that way: it takes
-- a free text topic and would let anybody who could reach it send the Sunday
-- reminder on a Tuesday. This is the narrow door instead. It sends one topic,
-- about one announcement, and only for an admin.
--
-- THE ROW IS CHECKED BEFORE THE SEND, and the checks are the interesting
-- part. A notification is the one thing in this project that cannot be taken
-- back: an announcement posted to the wrong date can be edited and the card
-- on Home fixes itself, but a lock screen has already lit up on four hundred
-- phones. So this refuses to announce a row that is not published, and
-- refuses one whose starts_on is in the future, because both of those are a
-- draft by another name and neither is on Home yet. Telling somebody to go
-- and look at a card they cannot see is worse than saying nothing.
--
-- America/Chicago rather than UTC for the same reason 0012's tick is hourly:
-- an announcement dated tomorrow is live at midnight in Metairie, not at
-- midnight in Greenwich.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_send_announcement(p_id text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_row public.announcements%rowtype;
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.announcements where id = p_id;

  if not found then
    raise exception 'No announcement with that id.';
  end if;

  if not v_row.published then
    raise exception 'That announcement is a draft. Publish it before telling anybody about it.';
  end if;

  if v_row.starts_on is not null and v_row.starts_on > v_today then
    raise exception 'That announcement does not go up until %. It will not be on Home yet.', v_row.starts_on;
  end if;

  if v_row.ends_on is not null and v_row.ends_on <= v_today then
    raise exception 'That announcement has already come down.';
  end if;

  return public.hc_send_push('announcement', false, p_id);
end;
$$;

revoke all on function public.hc_admin_send_announcement(text) from public, anon, authenticated;
grant execute on function public.hc_admin_send_announcement(text) to authenticated;

comment on function public.hc_admin_send_announcement(text) is
  'Sends the announcement notification for one row. Admins only, and only for a row that is published and inside its own date window: a push cannot be unsent, so it refuses to point at a card nobody can see.';
