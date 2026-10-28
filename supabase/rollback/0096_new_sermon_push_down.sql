-- ===========================================================================
-- Undoes 0096. Takes the "sermon audio is up" topic away again.
--
-- Run it only after every build that shows the "New sermon audio" switch is
-- gone, or that switch writes to a function that no longer exists (the app
-- logs it and carries on, but the switch then does nothing).
-- ===========================================================================

drop function if exists public.hc_announce_new_sermon(text);
drop function if exists public.hc_set_device_new_sermon(text, boolean);

-- hc_deactivate_device_token as 0043 wrote it.
create or replace function public.hc_deactivate_device_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'hc_deactivate_device_token: a token is required';
  end if;

  update public.device_tokens
     set active                    = false,
         wants_new_guide           = false,
         wants_sunday_reminder     = false,
         wants_group_day           = false,
         wants_announcements       = false,
         admin_user_id             = null,
         wants_announcement_review = false,
         wants_event_review        = false
   where token = btrim(p_token);
end;
$$;

-- hc_send_push as 0092 left it.
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
                     'banner', 'cafe_ready', 'instagram_sync') then
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

-- push_log keeps its new_sermon rows, so the constraint has to keep the word
-- until those are deleted. Delete them first if the vocabulary must shrink.
delete from public.push_log where topic = 'new_sermon';

alter table public.push_log drop constraint if exists push_log_topic_known;
alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review',
                   'banner', 'cafe_ready', 'instagram_sync'));

drop index if exists public.device_tokens_new_sermon_idx;
alter table public.device_tokens drop column if exists wants_new_sermon;
alter table public.podcasts drop column if exists push_announced_at;
