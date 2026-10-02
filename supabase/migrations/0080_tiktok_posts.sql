-- ===========================================================================
-- Home Church, the TikTok frame on Home, kept current on its own
--
-- Home's Socials block shows the church's latest Instagram post in a 4:3
-- frame, and now the latest TikTok in a second frame of the same size right
-- under it, above the row of social links. This migration is everything the
-- TikTok half needs on the database side, in one file, because it is the same
-- machinery Instagram took six migrations to arrive at and there is no reason
-- to make it take six again:
--
--   0015  the table and the public bucket        -> sections 1 and 2
--   0059  the vault secret that is the door      -> section 3
--   0060  the doorbell the function reads it by  -> section 3
--   0062  the run log that does not lie          -> section 4
--   0061  the sync call, and 0070 its hourly clock -> sections 5 and 6
--
-- HOW THE POSTS ARE FOUND, WITHOUT A TOKEN. Asked as a browser, TikTok's
-- profile page comes back with an empty `itemList` when nobody is logged in.
-- Its creator embed, https://www.tiktok.com/embed/@homechurch.nola, does not:
-- that is the widget a website pastes to show somebody's recent videos, and it
-- is server rendered with a `videoList` of about a dozen of them, each with
-- its id, caption, cover picture and the account that posted it. One request
-- per run, and nothing per post except the cover download. The edge function
-- `tiktok-fetch` holds the long version.
--
-- THE DATE IS NOT GUESSED. The embed carries no timestamp field, but a TikTok
-- video id carries one: the top 32 bits of the id are the Unix second it was
-- posted. That is TikTok's own id scheme, not an estimate, so posted_at is as
-- true here as Instagram's taken_at is in 0015.
--
-- SAME RULE AS INSTAGRAM ABOUT THE CDN. Cover URLs are signed and expire, and
-- loading them on a phone would hand TikTok every congregant's IP address. The
-- function mirrors the bytes into the `tiktok` bucket and the phone only ever
-- talks to Supabase.
--
-- SAFE TO SHIP AHEAD OF THE APP, AND THE APP AHEAD OF THIS. An empty table is
-- an invisible frame, and a phone running an older build never asks for this
-- table at all. A newer build asking before this has run gets a 404 for one
-- table, which content.js already treats as "nothing new" for that table only.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once: the secret is created only if absent, and the
--   schedule is dropped and recreated.
--
-- TO TURN THE SYNC OFF, one line:
--   select cron.unschedule('hc-tiktok-sync');
-- ===========================================================================


-- 1. The table -------------------------------------------------------------
--
-- Same shape as instagram_posts, minus CAROUSEL_ALBUM, which TikTok does not
-- have. A photo-mode post is IMAGE; everything else is VIDEO, and VIDEO is
-- what earns the play badge. `id` is TikTok's own video id, so a re-run
-- updates a post rather than duplicating it.

create table if not exists public.tiktok_posts (
  id            text primary key,            -- TikTok's video id

  permalink     text not null,               -- where a tap goes, on tiktok.com
  image_path    text,                        -- object path inside the bucket below
  media_type    text not null default 'VIDEO',   -- VIDEO | IMAGE
  caption       text,                        -- trimmed, used for the accessible name
  posted_at     timestamptz not null,        -- from the id itself, drives the order

  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint tiktok_posts_media_type_known
    check (media_type in ('VIDEO', 'IMAGE'))
);

comment on table public.tiktok_posts is
  'Latest posts from tiktok.com/@homechurch.nola, mirrored hourly by the tiktok-fetch Edge Function. Home shows the newest one under the Instagram frame.';
comment on column public.tiktok_posts.id is
  'TikTok''s own video id. Its top 32 bits are the Unix second it was posted, which is where posted_at comes from.';
comment on column public.tiktok_posts.image_path is
  'Object path inside the tiktok Storage bucket, never a tiktokcdn URL. Those are signed and expire, and pointing phones at them would hand TikTok every congregant''s IP address.';

create index if not exists tiktok_posts_recent_idx
  on public.tiktok_posts (published, posted_at desc);

drop trigger if exists tiktok_posts_set_updated_at on public.tiktok_posts;

create trigger tiktok_posts_set_updated_at
  before update on public.tiktok_posts
  for each row execute function public.hc_set_updated_at();

-- Public read of published rows and no write policy at all, as 0015. The
-- function writes as the service role, which bypasses RLS.
alter table public.tiktok_posts enable row level security;

drop policy if exists "tiktok posts are publicly readable" on public.tiktok_posts;

create policy "tiktok posts are publicly readable"
  on public.tiktok_posts for select
  to anon, authenticated
  using (published);

grant select on public.tiktok_posts to anon, authenticated;
revoke insert, update, delete on public.tiktok_posts from anon, authenticated;
grant all on public.tiktok_posts to service_role;


-- 2. Where the covers live -------------------------------------------------
-- Public means readable, not writable: select for anon and nothing else.

insert into storage.buckets (id, name, public)
values ('tiktok', 'tiktok', true)
on conflict (id) do update set public = true;

drop policy if exists "tiktok images are publicly readable" on storage.objects;

create policy "tiktok images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'tiktok');


-- 3. The door --------------------------------------------------------------
--
-- Its own secret rather than Instagram's, so either can be rotated without
-- the other going dark. Read by the function through a doorbell in `public`
-- because the Data API does not serve the vault schema; 0060 is the long
-- version of why.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hc_tiktok_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'hc_tiktok_secret',
      'Shared secret for the tiktok-fetch Edge Function. Read by that function at run time and by hc_sync_tiktok below, and by nothing else.'
    );
  end if;
end $$;

create or replace function public.hc_tiktok_secret()
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where name = 'hc_tiktok_secret';
$$;

revoke all on function public.hc_tiktok_secret() from public, anon, authenticated;
grant execute on function public.hc_tiktok_secret() to service_role;

comment on function public.hc_tiktok_secret() is
  'Returns the hc_tiktok_secret vault value to the tiktok-fetch Edge Function. service_role only, deliberately: this returns a secret in plaintext.';


-- 4. The run log -----------------------------------------------------------
--
-- pg_cron records a pg_net call as succeeded the moment the request is
-- queued, whatever the function then says. 0062 is the story of that lying
-- for a week. The function writes its own outcome here instead.

create table if not exists public.tiktok_sync_runs (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),

  ok          boolean not null,
  trigger     text not null default 'cron',
  discovered  integer not null default 0,     -- posts seen in the embed
  wrote       integer not null default 0,
  skipped     integer not null default 0,
  error       text                            -- null when ok
);

comment on table public.tiktok_sync_runs is
  'One row per tiktok-fetch run, success or failure. The only honest record of whether the TikTok frame is being kept current: pg_cron reports this job as succeeded even when the sync fails.';

create index if not exists tiktok_sync_runs_recent_idx
  on public.tiktok_sync_runs (ran_at desc);

alter table public.tiktok_sync_runs enable row level security;

revoke all on public.tiktok_sync_runs from anon, authenticated;
grant all on public.tiktok_sync_runs to service_role;

create or replace function public.hc_tiktok_health(p_hours int default 48)
returns table (
  runs          bigint,
  completed     bigint,
  posts_written bigint,
  last_ok_at    timestamptz,
  last_error    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where ok),
    coalesce(sum(wrote), 0),
    max(ran_at) filter (where ok),
    (select error from public.tiktok_sync_runs
      where not ok and ran_at > now() - make_interval(hours => p_hours)
      order by ran_at desc limit 1)
  from public.tiktok_sync_runs
  where ran_at > now() - make_interval(hours => p_hours);
$$;

revoke all on function public.hc_tiktok_health(int) from public, anon, authenticated;
grant execute on function public.hc_tiktok_health(int) to service_role;

comment on function public.hc_tiktok_health(int) is
  'Whether the TikTok frame is being kept current, over the last p_hours. completed = 0 with runs > 0 means the job is firing and failing, which is the state pg_cron reports as success.';


-- 5. The sync call ---------------------------------------------------------

create or replace function public.hc_sync_tiktok(p_limit int default 9)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_limit is null or p_limit < 1 or p_limit > 12 then
    raise exception 'hc_sync_tiktok: p_limit must be between 1 and 12, got %', p_limit;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_tiktok_secret';

  if v_secret is null then
    raise exception 'hc_sync_tiktok: hc_tiktok_secret is missing from the vault. Re-run migration 0080.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/tiktok-fetch',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-tiktok-secret', v_secret
               ),
    body    := jsonb_build_object('limit', p_limit),
    -- One embed fetch plus up to nine cover downloads and uploads.
    timeout_milliseconds := 120000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_sync_tiktok(int) from public, anon, authenticated;

comment on function public.hc_sync_tiktok(int) is
  'Reads the church''s TikTok creator embed and mirrors any posts not already stored. Returns a pg_net request id; the outcome lands in tiktok_sync_runs. Not callable by anon or authenticated, deliberately.';


-- 6. The clock -------------------------------------------------------------
-- Hourly, as Instagram is since 0070. A run that finds nothing new is one
-- request and no writes, so there is no reason to be slower than that.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hc-tiktok-sync') then
    perform cron.unschedule('hc-tiktok-sync');
  end if;
end $$;

select cron.schedule(
  'hc-tiktok-sync',
  '47 * * * *',   -- hourly at :47. Clear of hc-push-tick at :00, the Instagram
                  -- sync at :23, and the newsletter intake at :20 and :40.
  $cron$select public.hc_sync_tiktok(9);$cron$
);


-- Reading what happened:
--
--   select ran_at, ok, discovered, wrote, skipped, error
--   from public.tiktok_sync_runs order by ran_at desc limit 12;
--
--   select * from public.hc_tiktok_health(24);

select 'tiktok_posts ready, hc-tiktok-sync hourly at :47' as status;
