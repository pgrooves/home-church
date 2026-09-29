-- ===========================================================================
-- Home Church, telling everybody what the pinned banner says
--
-- WHAT THIS IS FOR. The pinned banner at the top of Home is for the thing
-- that cannot wait for an announcement: the building is closed Sunday, the
-- service has moved. Until now it only reached people who opened the app.
-- This lets the admin who saves it also put it on every phone's lock screen,
-- with a "Notify everyone" switch beside the Save button on App settings.
--
-- WHO IT GOES TO. Every active phone, the same list `test` uses, and not the
-- phones that asked for announcements. The banner is the church saying
-- "everybody needs to know this", and the admin who flips the switch has
-- decided exactly that. A phone whose owner turned notifications off in iOS
-- still hears nothing, because Apple decides that and not us.
--
-- WHAT IT SAYS. Whatever the banner says at the moment send-push reads it,
-- not what it said when the button was pressed. The two are the same thing a
-- few hundred milliseconds apart, and reading the row means the notification
-- can never say something Home does not.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0026 (app_settings) and 0043 (hc_send_push as it last stood).
--   Then redeploy send-push, which learns the `banner` topic in the same
--   change:  supabase functions deploy send-push --no-verify-jwt
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. push_log knows the topic
--
-- send-push writes one row per send, and without this the row for a banner
-- would be refused and the send would leave no trace.
-- ---------------------------------------------------------------------------

alter table public.push_log drop constraint if exists push_log_topic_known;

alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review',
                   'banner'));


-- ---------------------------------------------------------------------------
-- 2. hc_send_push learns `banner`
--
-- Same signature and body as 0043 left it. Only the list of topics changes.
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 3. The admin's button
--
-- Takes no arguments, on purpose. The only thing it can send is the banner
-- that is on Home right now, so there is nothing a caller can pass that would
-- put different words on the lock screen. Refuses when the banner is off or
-- empty, because a notification about a banner nobody can see is a
-- notification about nothing.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_send_banner()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_on boolean;
  v_message text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select value_bool into v_on
    from public.app_settings where key = 'home_banner_on';
  select btrim(coalesce(value_text, '')) into v_message
    from public.app_settings where key = 'home_banner_message';

  if not coalesce(v_on, false) then
    raise exception 'The banner is off. Turn it on before telling anybody about it.';
  end if;

  if coalesce(v_message, '') = '' then
    raise exception 'The banner is empty. Write it before telling anybody about it.';
  end if;

  return public.hc_send_push('banner', false, null);
end;
$$;

revoke all on function public.hc_admin_send_banner() from public, anon, authenticated;
grant execute on function public.hc_admin_send_banner() to authenticated;

comment on function public.hc_admin_send_banner() is
  'Sends the pinned banner, as it stands, to every active phone. Admins only, and only while the banner is on and says something. Called by the Notify everyone switch on Admin -> App settings.';
