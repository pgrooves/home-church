-- ===========================================================================
-- Home Church, the Instagram rail on Connect
--
-- A horizontal strip of the church's latest Instagram posts at the top of
-- Connect. This migration builds everywhere the posts will live. It does not
-- fetch anything, and on purpose: the account is still a Personal account,
-- which Instagram's API does not serve at all, so there is nothing to connect
-- to yet.
--
-- WHY IT IS SAFE TO SHIP THIS EMPTY. Connect drops any section whose list came
-- back empty rather than rendering a header over nothing, which is the rule
-- that screen already keeps for groups, serve teams, events, and next steps.
-- An empty instagram_posts table is therefore invisible, not broken. No
-- feature flag, no dead placeholder, nothing to remember to turn on. The day
-- the first sync writes rows, the rail appears on every phone with no App
-- Store build, because the app reads this table through the same content
-- pipeline as everything else.
--
-- THE ONE THING THAT WOULD BE WRONG TO DO HERE. Do not point the app at
-- Instagram's CDN. Those media URLs are signed and expire within days, so a
-- stored one goes blank on its own, and fetching them from the phone would
-- hand Meta every congregant's IP address on every visit to Connect. That is
-- the exact trade the project already refused when it pulled Google Fonts out
-- of index.html. The sync job mirrors the bytes into Storage instead, so the
-- phone only ever talks to Supabase, which it already talks to.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
-- ===========================================================================


-- 1. The table -------------------------------------------------------------
--
-- One row per post, holding only what a tile needs to draw itself and open
-- the real thing. Deliberately not a mirror of Instagram's payload: no like
-- counts, no comments, no usernames. The rail is a doorway to Instagram, not
-- a copy of it, and every field stored is a field that has to be kept true.
--
-- `id` is Instagram's own media id, so a re-sync updates a post rather than
-- duplicating it, and a caption edited on Instagram lands here on the next run.

create table if not exists public.instagram_posts (
  id            text primary key,            -- Instagram's media id

  permalink     text not null,               -- where a tap goes, on instagram.com
  image_path    text,                        -- object path inside the bucket below
  media_type    text not null default 'IMAGE',   -- IMAGE | VIDEO | CAROUSEL_ALBUM
  caption       text,                        -- trimmed, used for the accessible name
  posted_at     timestamptz not null,        -- Instagram's timestamp, drives the order

  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A row whose image never made it into Storage would draw an empty tile, so
  -- the app filters those out and this makes the intent explicit rather than
  -- leaving it as a convention somebody could miss.
  constraint instagram_posts_media_type_known
    check (media_type in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'))
);

comment on table public.instagram_posts is
  'Latest posts from instagram.com/homechurch.nola, mirrored by the sync job. The rail at the top of Connect. Empty until the account is a Professional account and the sync is connected.';
comment on column public.instagram_posts.id is
  'Instagram''s own media id, so a re-sync updates a post instead of duplicating it.';
comment on column public.instagram_posts.image_path is
  'Object path inside the instagram Storage bucket, never an instagram.com URL. Their CDN links are signed and expire, and pointing phones at them would hand Meta every congregant''s IP address.';
comment on column public.instagram_posts.media_type is
  'VIDEO and CAROUSEL_ALBUM both render as a single still. Video tiles get a play badge so the tile does not promise inline playback it will not do.';


-- 2. Indexes ---------------------------------------------------------------
-- The app asks for published posts newest first and nothing else, so this is
-- the only access pattern worth an index.

create index if not exists instagram_posts_recent_idx
  on public.instagram_posts (published, posted_at desc);


-- 3. The updated_at trigger ------------------------------------------------
-- Reuses the shared function from 0001, no second copy.

drop trigger if exists instagram_posts_set_updated_at on public.instagram_posts;

create trigger instagram_posts_set_updated_at
  before update on public.instagram_posts
  for each row execute function public.hc_set_updated_at();


-- 4. Row level security ----------------------------------------------------
-- Public read of published rows, and no write policy at all. The sync job runs
-- as the service role, which bypasses RLS, so the missing write policies are
-- the mechanism rather than an oversight. See 0001, section 7.

alter table public.instagram_posts enable row level security;

drop policy if exists "instagram posts are publicly readable" on public.instagram_posts;

create policy "instagram posts are publicly readable"
  on public.instagram_posts for select
  to anon, authenticated
  using (published);


-- 5. Grants ----------------------------------------------------------------

grant select on public.instagram_posts to anon, authenticated;
revoke insert, update, delete on public.instagram_posts from anon, authenticated;
grant all on public.instagram_posts to service_role;


-- 6. Where the images live -------------------------------------------------
--
-- A public bucket, because these are images the church already published to
-- the open internet and a signed URL per tile would mean the app could not
-- cache them or render them offline.
--
-- Public means readable, not writable. The policies below grant select to
-- anon and nothing else, so the bucket cannot be used as an anonymous dumping
-- ground. Only the service role, which the sync job runs as, can put objects
-- in it.

insert into storage.buckets (id, name, public)
values ('instagram', 'instagram', true)
on conflict (id) do update set public = true;

drop policy if exists "instagram images are publicly readable" on storage.objects;

create policy "instagram images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'instagram');


-- 7. What is left ----------------------------------------------------------
--
-- Nothing here fetches. When the account becomes a Professional account and a
-- long lived token exists, the remaining work is an Edge Function that:
--
--   1. reads /me/media for the latest 9 posts,
--   2. downloads each image and puts it in the instagram bucket,
--   3. upserts rows here and deletes rows whose posts are gone from Instagram,
--      which Meta's platform terms require rather than merely suggest,
--   4. refreshes its own token, because a long lived token is good for 60 days
--      and dies silently, freezing the rail on old posts with no error anywhere,
--
-- plus one pg_cron entry to run it hourly, following the pattern 0012 already
-- established for push. All of that is backend: none of it needs an App Store
-- build, and none of it changes a line of app code.

select 'instagram_posts ready, 0 rows, rail stays hidden until the sync fills it' as status;
