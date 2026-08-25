-- ===========================================================================
-- Home Church, the songs we sang on Sunday
--
-- WHAT THIS HOLDS. One row per Sunday: the date, the songs in the order the
-- band played them, and a link to the message that was preached after them.
-- The Worship screen behind ••• is the only thing that reads it.
--
-- WHAT IT DELIBERATELY DOES NOT HOLD: the sermon's name. That is written in
-- exactly one place, `podcasts.title`, and everything else in this schema
-- resolves it rather than copying it. `guides.theme_title` stays null for the
-- same reason, and NEW_PODCAST_PROCESS.md exists because a title copied into
-- a second table is a title that is wrong the first time somebody renames a
-- message. So the header on the Worship screen reads through to the podcast
-- row, and /new-podcast renaming Sunday's message renames it here too,
-- without touching this table at all.
--
-- WHY served_on AND sermon_id BOTH. The setlist is usually published on the
-- Sunday afternoon and the episode does not post until Monday, so `sermon_id`
-- is null for a day or so on almost every row and the screen finds the message
-- by date meanwhile. Which would be enough, except that the date is not
-- unique: the catalogue already has two messages preached on one Sunday, The
-- Table of Grace twice with two different preachers. So the id is the exact
-- answer when there is one, and the date is the answer until then.
--
-- WHY THE SONGS ARE jsonb AND NOT A CHILD TABLE. A set is four songs, give or
-- take one, read all at once and never queried across weeks. The house rule
-- says lists and nested shapes go in a jsonb column with an array guard, the
-- way guides stores its sections, and a child table would buy a join and a
-- sort_order column to hold four rows nobody asks about individually.
--
-- Each element looks like this, in the order the band played them:
--
--   {
--     "title":     "Oceans (Where Feet May Fail)",
--     "artist":    "Hillsong UNITED",
--     "artUrl":    "https://.../600x600bb.jpg",   -- album art, external host
--     "lyricsUrl": "https://...",                 -- optional, see below
--     "links": {                                  -- every key optional
--       "youtube": "...", "spotify": "...", "apple": "...", "amazon": "...",
--       "youtubeMusic": "...", "tidal": "...", "pandora": "...",
--       "all": "https://song.link/..."
--     }
--   }
--
-- Only `title` is load bearing. A song with no art draws the house cover the
-- way a series with no art does, a song with no links draws no buttons, and a
-- song with no lyrics link draws no Lyrics. Half a row is a quiet gap rather
-- than a broken screen, which is the same promise every mapper in
-- js/content.js makes.
--
-- MEDIA STAYS ON SOMEBODY ELSE'S HOST. Album art is an https link to Apple's
-- CDN, nothing is uploaded to Supabase storage. Same decision podcasts made
-- about audio and instagram_posts made about photographs, and it is still a
-- cost decision rather than a taste one.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Or mcp__Supabase__apply_migration, which is what /new-content-type says to
--   use for anything that creates a table.
--   Needs 0001 (hc_set_updated_at) and the podcasts table it points at.
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.worship_sets (
  id          text primary key,            -- 'worship-2026-08-23'
  served_on   date not null,
  sermon_id   text references public.podcasts(id) on delete set null,
  songs       jsonb not null default '[]'::jsonb,

  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint worship_sets_songs_is_array check (jsonb_typeof(songs) = 'array')
);

comment on table public.worship_sets is
  'One Sunday''s worship setlist, in the order it was played. Read by the Worship screen behind the ••• tile, written by /new-worship.';
comment on column public.worship_sets.served_on is
  'The Sunday the set was played. Sorts the week carousel, and finds the message when sermon_id is still null.';
comment on column public.worship_sets.sermon_id is
  'The message preached that morning. Null until the episode is published, which is normally the Monday after, and the screen matches on served_on meanwhile. Never carries the sermon''s title: podcasts.title is the only place a message is named.';
comment on column public.worship_sets.songs is
  'The songs, in play order, as an array of objects. Only `title` is required of each; art, links and lyrics are optional and a missing one draws nothing rather than a hole. See the header of this migration for the shape.';


-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
-- The screen reads this table newest first and nothing else ever filters it.

create index if not exists worship_sets_served_on_idx
  on public.worship_sets (served_on desc);

-- One set per Sunday. The id is derived from the date so a second set for the
-- same morning would already collide on the primary key most of the time, but
-- only most of the time, and two setlists stacked on one slide of the carousel
-- is the kind of thing that is found by a congregation rather than by a test.
create unique index if not exists worship_sets_served_on_key
  on public.worship_sets (served_on);

-- Finding the set for a message, which is the direction /new-podcast reads it
-- when it fills in the link it was published too early to have.
create index if not exists worship_sets_sermon_id_idx
  on public.worship_sets (sermon_id);


-- ---------------------------------------------------------------------------
-- 3. The updated_at trigger
-- ---------------------------------------------------------------------------
-- The shared function from 0001. Do not write a second copy of it.

drop trigger if exists worship_sets_set_updated_at on public.worship_sets;

create trigger worship_sets_set_updated_at
  before update on public.worship_sets
  for each row execute function public.hc_set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------
-- Public read of published rows, and no write policy at all. The service role
-- bypasses RLS, so leaving the write policies out is exactly what makes this
-- table service-role-write-only. The long version is in 0001, section 7.

alter table public.worship_sets enable row level security;

drop policy if exists "worship sets are publicly readable" on public.worship_sets;

create policy "worship sets are publicly readable"
  on public.worship_sets for select
  to anon, authenticated
  using (published);


-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

grant select on public.worship_sets to anon, authenticated;
revoke insert, update, delete on public.worship_sets from anon, authenticated;
grant all on public.worship_sets to service_role;
