-- ===========================================================================
-- Home Church, content management schema
--
-- Four content tables, series / guides / podcasts / events, plus the shared
-- pieces every future content type reuses. Running this file is safe more
-- than once, everything is written with IF NOT EXISTS or a drop-and-recreate
-- so re-running never destroys rows.
--
-- The whole point of this schema: content is published and edited from
-- Claude Code with the service role key, and read by the app with the anon
-- key. No app rebuild, no App Store submission, to fix a typo on a Saturday
-- night.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. Then `python3 scripts/hc_supabase.py verify` to confirm.
--
-- WHY IDS ARE TEXT, NOT UUID
--   The app already keys a leader's question checkmarks and private journal
--   entries in localStorage on the guide's id, and `js/data.js` has used
--   readable slugs (`guide-slow-burn`, `sermon-slow-burn`) since day one.
--   A uuid primary key would orphan every leader's notes on their own phone
--   the day the app switched to reading from Supabase. So the slug is the
--   key, and it is permanent. Titles move, ids never do.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Shared plumbing
--
-- One trigger function, reused by every content table now and later. When a
-- fifth content type shows up, it attaches to this, it does not write its
-- own copy.
-- ---------------------------------------------------------------------------

create or replace function public.hc_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.hc_set_updated_at() is
  'Stamps updated_at on every UPDATE. Attach to each content table with a before-update trigger.';


-- ---------------------------------------------------------------------------
-- 2. series
--
-- Lightweight. Guides and podcasts both point at it. A series is the shelf
-- everything else sits on, so it gets created first and deleted never.
-- ---------------------------------------------------------------------------

create table if not exists public.series (
  id          text primary key,            -- 'series-david'
  title       text not null,               -- 'The Life of David'
  subtitle    text,                         -- 'A shepherd, a king, a mess, a promise.'
  blurb       text,                         -- the longer paragraph on the Listen and Grow screens
  art_url     text,                         -- external cover art, not Supabase storage
  started_on  date,
  is_current  boolean not null default false,  -- exactly one series should be true
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.series is 'Sermon series. Parent of guides and podcasts.';
comment on column public.series.is_current is
  'The series running right now. Flip the old one false in the same transaction as flipping the new one true.';

create index if not exists series_started_on_idx on public.series (started_on desc);


-- ---------------------------------------------------------------------------
-- 3. guides
--
-- The small group guide. Column for column this is the Guide {} model in
-- section 6 of the design system doc, camelCase turned into snake_case
-- because that is what Postgres wants.
--
-- Everything that is a list or a shape in the design doc is stored as jsonb
-- rather than being shredded into child tables. Three reasons: the guide is
-- always read whole, never queried by individual question; jsonb round trips
-- straight into the app with no assembly step, which is what `js/data.js`
-- has always been shaped for; and a content editor should never have to
-- think about joins to fix a typo.
-- ---------------------------------------------------------------------------

create table if not exists public.guides (
  id                   text primary key,   -- 'guide-slow-burn', permanent
  sermon_id            text,               -- 'sermon-slow-burn', the podcast row's id
  series_id            text references public.series (id) on update cascade on delete set null,

  -- Identity. theme_title stays null unless a guide genuinely needs a
  -- different name than its message, which is rare. The name of a message
  -- is written in exactly one place, podcasts.title, and the guide inherits
  -- it. See NEW_GUIDE_PROCESS.md, "One name per message."
  theme_title          text,
  subtitle             text,
  primary_passage      text,               -- '2 Samuel 11 & 12'
  preacher             text,               -- 'Stephen Daigle', full name, used once
  preacher_short       text,               -- 'Stephen', first name only, used everywhere else
  preached_on          date,
  occasion             text,               -- "Father's Day", usually null

  -- The six rendered sections, in the order the reader draws them.
  short_summary        jsonb not null default '[]'::jsonb,  -- [paragraph], exactly 3
  full_summary         jsonb not null default '[]'::jsonb,  -- [paragraph], 8 to 10
  anchors              jsonb not null default '[]'::jsonb,  -- [{label, body}], exactly 3
  group_sections       jsonb not null default '[]'::jsonb,  -- [{heading, questions:[str]}], 7
  reflection_questions jsonb not null default '[]'::jsonb,  -- [str], exactly 8
  one_liners           jsonb not null default '[]'::jsonb,  -- [str], 12 to 15
  scriptures           jsonb not null default '[]'::jsonb,  -- [{reference, note}], 10 to 14
  closing_scripture    jsonb,                                -- {text, reference}

  published            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Shape guards. These catch the one mistake that actually happens, a
  -- single string sent where the app expects a list, which renders as
  -- nothing at all and is invisible until a leader opens the guide.
  constraint guides_short_summary_is_array        check (jsonb_typeof(short_summary) = 'array'),
  constraint guides_full_summary_is_array         check (jsonb_typeof(full_summary) = 'array'),
  constraint guides_anchors_is_array              check (jsonb_typeof(anchors) = 'array'),
  constraint guides_group_sections_is_array       check (jsonb_typeof(group_sections) = 'array'),
  constraint guides_reflection_questions_is_array check (jsonb_typeof(reflection_questions) = 'array'),
  constraint guides_one_liners_is_array           check (jsonb_typeof(one_liners) = 'array'),
  constraint guides_scriptures_is_array           check (jsonb_typeof(scriptures) = 'array')
);

comment on table public.guides is
  'Small group sermon guides. Matches the Guide {} model in section 6 of the app design system.';
comment on column public.guides.theme_title is
  'Null on almost every guide. The guide takes its name from its podcast row. Only set this when a guide must be called something different than the message.';
comment on column public.guides.sermon_id is
  'The matching podcasts.id. Deliberately not a foreign key, the guide is written days before the episode posts, so it names a row that does not exist yet.';

create index if not exists guides_series_id_idx   on public.guides (series_id);
create index if not exists guides_preached_on_idx on public.guides (preached_on desc);
create index if not exists guides_sermon_id_idx   on public.guides (sermon_id);


-- ---------------------------------------------------------------------------
-- 4. podcasts
--
-- One row per Sunday message, which is also one row per podcast episode.
-- This is the table the Listen tab reads.
--
-- Audio and video are external links, Spotify or YouTube, never files in
-- Supabase storage. That was a cost decision and it is also the right one,
-- the church already publishes to a podcast host that handles bandwidth,
-- transcoding, and the podcast directories for free.
-- ---------------------------------------------------------------------------

create table if not exists public.podcasts (
  id              text primary key,        -- 'sermon-slow-burn', permanent
  series_id       text references public.series (id) on update cascade on delete set null,

  -- The link back to the guide. This direction carries the foreign key,
  -- because the guide is written first and the episode posts after, so by
  -- the time this row exists its guide already does. Null is fine and
  -- normal, plenty of messages never get a guide.
  guide_id        text references public.guides (id) on update cascade on delete set null,

  title           text not null,           -- the church's own title, from the episode
  preacher        text,                    -- full name
  preacher_short  text,                    -- first name only, what the app shows
  preached_on     date,                    -- the Sunday, drives sort order everywhere
  published_on    date,                    -- the day the episode posted, usually the Monday after
  duration        text,                    -- '33 min', free text on purpose

  passage         text,                    -- primary passage, '2 Samuel 15-19'
  scripture_refs  jsonb not null default '[]'::jsonb,  -- [str], everything else cited

  episode_url     text,                    -- the external episode link, Spotify or YouTube
  platform        text default 'Spotify',  -- where episode_url points
  media_type      text default 'audio',    -- 'audio' or 'video'

  summary         jsonb not null default '[]'::jsonb,  -- episode notes, [paragraph]
  description     text,                    -- one line hook for the Listen list

  published       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint podcasts_scripture_refs_is_array check (jsonb_typeof(scripture_refs) = 'array'),
  constraint podcasts_summary_is_array        check (jsonb_typeof(summary) = 'array'),
  constraint podcasts_media_type_known        check (media_type in ('audio', 'video'))
);

comment on table public.podcasts is
  'Sunday messages as podcast episodes. The Listen tab reads this. Media lives on an external host, never in Supabase storage.';
comment on column public.podcasts.title is
  'The only place a message name is written. The guide inherits it. Changing it here changes it everywhere in the app.';
comment on column public.podcasts.episode_url is
  'External link. Null falls back to the show level link in the app, which is never wrong, only less specific.';

create index if not exists podcasts_series_id_idx   on public.podcasts (series_id);
create index if not exists podcasts_guide_id_idx    on public.podcasts (guide_id);
create index if not exists podcasts_preached_on_idx on public.podcasts (preached_on desc);


-- ---------------------------------------------------------------------------
-- 5. events
--
-- The Connect tab's calendar.
--
-- starts_at is timestamptz, so it is stored in UTC and rendered in whatever
-- zone the phone is in. The church is in America/Chicago, so a 6:30 PM event
-- in New Orleans is 23:30Z in summer and 00:30Z the next day in winter. The
-- publishing scripts do that conversion, nobody should be doing it by hand.
--
-- time_label exists because real church events do not always have a clock
-- time. "All three services" is a real value from the current calendar, and
-- it cannot be expressed as a timestamp. When it is set, the app shows it
-- instead of formatting starts_at.
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id           text primary key,           -- 'event-baptism'
  title        text not null,
  description  text,                       -- the warm paragraph, the app calls this the blurb
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  time_label   text,                       -- 'All three services', overrides the formatted time
  location     text,                       -- '216 Giuffrias Ave' or 'The Loft, upstairs'
  signup_url   text,                       -- external registration, null when you just show up
  capacity     integer,                    -- null means uncapped, which is most of them
  category     text default 'gathering',   -- gathering | serve | next-step | class | kids
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint events_ends_after_starts check (ends_at is null or ends_at >= starts_at),
  constraint events_capacity_positive check (capacity is null or capacity > 0)
);

comment on table public.events is 'The Connect tab events calendar.';
comment on column public.events.starts_at is
  'UTC. The church is America/Chicago, let the publishing script convert, do not hand roll it.';
comment on column public.events.time_label is
  'Free text shown instead of a formatted clock time when an event does not have one.';

create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_category_idx  on public.events (category);


-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
--
-- Drop and recreate so this file stays re-runnable.
-- ---------------------------------------------------------------------------

drop trigger if exists series_set_updated_at   on public.series;
drop trigger if exists guides_set_updated_at   on public.guides;
drop trigger if exists podcasts_set_updated_at on public.podcasts;
drop trigger if exists events_set_updated_at   on public.events;

create trigger series_set_updated_at
  before update on public.series
  for each row execute function public.hc_set_updated_at();

create trigger guides_set_updated_at
  before update on public.guides
  for each row execute function public.hc_set_updated_at();

create trigger podcasts_set_updated_at
  before update on public.podcasts
  for each row execute function public.hc_set_updated_at();

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.hc_set_updated_at();


-- ---------------------------------------------------------------------------
-- 7. Row level security
--
-- The rule for every content table: the world can read published rows,
-- nobody can write.
--
-- "Nobody can write" needs a word of explanation, because it looks like it
-- would lock out the publishing scripts too. It does not. The service_role
-- key bypasses row level security entirely, at the Postgres level, by
-- design. So the correct way to make a table service-role-write-only is to
-- turn RLS on and then simply never write an INSERT, UPDATE, or DELETE
-- policy. There is nothing to grant. Anon and authenticated fall through to
-- the default deny, and the service role never consults policies at all.
--
-- Writing an explicit `to service_role` policy would be noise at best and
-- misleading at worst, it would imply the service role is being gated by
-- something it is not.
--
-- The SELECT policies are scoped `using (published)`, which buys a draft
-- state for free. Set published = false and the row is invisible to the app
-- while staying fully visible to Claude Code and to you.
-- ---------------------------------------------------------------------------

alter table public.series   enable row level security;
alter table public.guides   enable row level security;
alter table public.podcasts enable row level security;
alter table public.events   enable row level security;

drop policy if exists "series are publicly readable"   on public.series;
drop policy if exists "guides are publicly readable"   on public.guides;
drop policy if exists "podcasts are publicly readable" on public.podcasts;
drop policy if exists "events are publicly readable"   on public.events;

create policy "series are publicly readable"
  on public.series for select
  to anon, authenticated
  using (published);

create policy "guides are publicly readable"
  on public.guides for select
  to anon, authenticated
  using (published);

create policy "podcasts are publicly readable"
  on public.podcasts for select
  to anon, authenticated
  using (published);

create policy "events are publicly readable"
  on public.events for select
  to anon, authenticated
  using (published);


-- ---------------------------------------------------------------------------
-- 8. Grants
--
-- Supabase already grants the anon, authenticated, and service_role roles
-- broad table privileges on the public schema through default privileges, and
-- leans on RLS to do the real gating. Spelling all three out here means this
-- migration does not depend on that default still being configured the way it
-- is today, and it means the file can be read on its own and understood.
--
-- The revoke is the load bearing line. It takes the write privileges away
-- from anon and authenticated outright, so even a SELECT-shaped mistake in a
-- future policy cannot open a write hole on its own. Two independent things
-- have to be wrong before anonymous traffic can write.
-- ---------------------------------------------------------------------------

grant select on public.series, public.guides, public.podcasts, public.events
  to anon, authenticated;

revoke insert, update, delete on public.series, public.guides, public.podcasts, public.events
  from anon, authenticated;

-- The publishing side. service_role also bypasses RLS, so it reads drafts and
-- writes every table regardless of the policies above.
grant all on public.series, public.guides, public.podcasts, public.events
  to service_role;
