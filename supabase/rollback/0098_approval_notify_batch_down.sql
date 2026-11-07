-- ===========================================================================
-- Undoes 0098. Takes the approval notification batch away again.
--
-- THE FAST UNDO IS ONE LINE, and it is usually all that is wanted: stop the
-- clock, and nothing waiting will ever send.
--
--   select cron.unschedule('hc-notify-batch');
--
-- This file is the whole way back. Builds that show the Yes / More / No
-- prompt then get "that did not go through" when an admin answers it, and the
-- approval itself is unaffected.
-- ===========================================================================

do $$
declare
  v_jobid bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_jobid from cron.job where jobname = 'hc-notify-batch';
    if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  end if;
end
$$;

drop function if exists public.hc_notify_batch_tick(timestamptz);
drop function if exists public.hc_admin_notify_batch_cancel();
drop function if exists public.hc_admin_notify_batch_send_now();
drop function if exists public.hc_notify_batch_close_and_send(bigint);
drop function if exists public.hc_admin_notify_batch_add(text, text, boolean);
drop function if exists public.hc_admin_notify_batch();
drop function if exists public.hc_notify_batch_json(bigint);
drop function if exists public.hc_notify_batch_due(timestamptz, timestamptz);
drop function if exists public.hc_push_wording_turn(text);

drop table if exists public.notify_batch_items;
drop table if exists public.notify_batches;
drop table if exists public.push_wording_turns;

-- hc_send_push as 0096 left it.
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
                     'banner', 'cafe_ready', 'instagram_sync', 'new_sermon') then
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

-- push_log keeps any approved_batch rows it already has, so the vocabulary is
-- left as 0098 widened it. Narrowing it would refuse to validate those rows.
