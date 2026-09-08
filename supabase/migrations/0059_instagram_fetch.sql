-- ===========================================================================
-- Home Church, the way in to the instagram-fetch Edge Function
--
-- Migration 0015 built the rail, the table and the bucket, and left the
-- fetching for a sync that needs Instagram's API, which needs a Professional
-- account. The church declined to switch, so the rail has sat on five
-- hand-entered demo rows.
--
-- This is the way in to the fallback. `instagram-fetch` takes links to the
-- church's own posts, mirrors each picture into the `instagram` bucket, and
-- upserts a row. It reads what Instagram serves to a link preview crawler,
-- which is the one thing that still hands over a whole public post without a
-- credential of any kind.
--
-- WHY A SHARED SECRET AND NOT hc_is_admin(). Same reason as 0012, and this
-- follows that pattern deliberately. The function writes to a public table
-- with the service role, so it must not be callable by anybody holding the
-- anon key, which is every copy of the app. It is also not something a
-- congregant ever triggers: there is no button for it. So the door is a
-- secret in the vault, and the function is the only thing that ever reads it.
--
-- THE ONE DIFFERENCE FROM 0012. `send-push` reads its expected secret from a
-- function secret, `HC_PUSH_CRON_SECRET`, set in the dashboard. This one reads
-- the vault directly at run time instead. A function secret cannot be set from
-- a web session and a vault secret can, and this whole feature exists because
-- the person who needs to run it is holding a phone.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once: the secret is created only if absent, so
--   re-running does not rotate it out from under a caller.
-- ===========================================================================


-- 1. The secret ------------------------------------------------------------
-- gen_random_uuid() twice, so it is long enough to be worth nothing to guess
-- and short enough to paste. Never printed by anything below.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hc_instagram_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'hc_instagram_secret',
      'Shared secret for the instagram-fetch Edge Function. Read by that function at run time and by hc_fetch_instagram below, and by nothing else.'
    );
  end if;
end $$;


-- 2. The call --------------------------------------------------------------
--
-- Unlike hc_send_push this is NOT fire and forget. That one is a cron job
-- whose outcome lands in push_log, so the reply is genuinely uninteresting.
-- Here the entire point of a run is which posts made it, so the request id
-- comes back and the reply lands in net._http_response:
--
--   select public.hc_fetch_instagram(array[
--     'https://www.instagram.com/p/DcHwSuzCUYq/'
--   ]);
--
--   -- then, a moment later
--   select status_code, content from net._http_response
--   where id = <the id returned above>;
--
-- The function caps at twelve links per call, which is more than a rail holds.

create or replace function public.hc_fetch_instagram(p_links text[])
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_links is null or array_length(p_links, 1) is null then
    raise exception 'hc_fetch_instagram: give it at least one post link';
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_instagram_secret';

  if v_secret is null then
    raise exception 'hc_fetch_instagram: hc_instagram_secret is missing from the vault. Re-run migration 0059.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/instagram-fetch',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-instagram-secret', v_secret
               ),
    body    := jsonb_build_object('links', to_jsonb(p_links)),
    -- Generous, because a run is a dozen page fetches, a dozen image
    -- downloads and a dozen uploads, paced apart on purpose.
    timeout_milliseconds := 120000
  ) into v_request;

  return v_request;
end;
$$;


-- 3. Who can call it -------------------------------------------------------
-- Nobody through the app. This is security definer and it writes a public
-- table, so the grants matter more than usual. Same posture as 0012.

revoke all on function public.hc_fetch_instagram(text[]) from public, anon, authenticated;

comment on function public.hc_fetch_instagram(text[]) is
  'Asks the instagram-fetch Edge Function to mirror these posts onto the Connect rail. Returns a pg_net request id; the reply lands in net._http_response. Not callable by anon or authenticated, deliberately.';


select 'hc_fetch_instagram ready, secret in the vault' as status;
