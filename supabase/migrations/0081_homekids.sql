-- ===========================================================================
-- Home Church, HomeKids
--
-- WHAT THIS HOLDS. Two tables behind the HomeKids page in the ••• overlay:
--
--   homekids_lessons   One row per Sunday. The kids guide: the Bible story
--                      retold for children, the big idea, the memory verse,
--                      a few questions per age group, and the checklist a
--                      family ticks off during the week and shows the
--                      teacher the next Sunday for a prize. Written by
--                      /new-homekids from the director's lesson plan sheet.
--
--   homekids_updates   What the weekly HomeKids emails say, one row per item.
--                      `audience` says which email it came from: the one to
--                      parents, or the one to volunteers. Written by the
--                      newsletter-intake Edge Function as unpublished drafts,
--                      and put on the page by an admin tapping Approve, the
--                      same rule announcements have lived by since 0038.
--
-- THE THREE GROUPS ARE NOT A TABLE. Champions (3-4), Heroes (5-6) and
-- Legends + Warriors (7-12) are how the church splits Sunday morning, they
-- change about as often as the service times do, and the app needs their
-- names on a phone with no signal. So the keys are a check constraint and the
-- names and ages live in js/data.js. A lesson's `groups` column is keyed by
-- the same three words, which is what lets one guide carry all three.
--
-- WHY THE CHECKLIST IS ON THE LESSON AND THE TICKS ARE NOT IN THE DATABASE.
-- The ticks belong to a family, and a family should not need an account to
-- earn a sticker. They live on the phone, keyed by the lesson id, exactly the
-- way a leader's checkmarks on a guide do. The teacher sees them on the
-- phone, which is the whole point of the reward: a parent and a kid walking
-- up on Sunday holding the thing they did together.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Or mcp__Supabase__apply_migration.
--   Needs 0001 (hc_set_updated_at), 0025 (hc_is_admin) and 0038
--   (newsletter_emails). Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The lessons
-- ---------------------------------------------------------------------------

create table if not exists public.homekids_lessons (
  id            text primary key,           -- 'homekids-2026-10-04'
  taught_on     date not null,              -- the Sunday it is taught
  title         text not null,              -- 'Jesus Calms the Storm'
  passage       text,                       -- 'Mark 4:35-41'
  big_idea      text,                       -- one sentence a four year old can say back
  memory_verse  jsonb,                      -- { "text": "...", "reference": "..." }
  story         jsonb not null default '[]'::jsonb,   -- short paragraphs, read aloud
  groups        jsonb not null default '{}'::jsonb,   -- { champions: {...}, heroes: {...}, legends: {...} }
  checklist     jsonb not null default '[]'::jsonb,   -- [{ "id": "read", "text": "..." }]
  prayer        text,                       -- a short prayer a family can pray together
  parent_note   text,                       -- one line for the grown ups
  source_url    text,                       -- the director's sheet, for whoever writes the next one

  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint homekids_lessons_story_is_array     check (jsonb_typeof(story) = 'array'),
  constraint homekids_lessons_checklist_is_array check (jsonb_typeof(checklist) = 'array'),
  constraint homekids_lessons_groups_is_object   check (jsonb_typeof(groups) = 'object'),
  constraint homekids_lessons_verse_is_object    check (memory_verse is null or jsonb_typeof(memory_verse) = 'object')
);

comment on table public.homekids_lessons is
  'One Sunday''s HomeKids lesson, written as a kids guide for the week that follows. Read by the HomeKids page behind •••, written by /new-homekids.';
comment on column public.homekids_lessons.groups is
  'Per age group: { "champions": { "questions": [...], "activity": "..." }, "heroes": {...}, "legends": {...} }. A missing group draws the shared guide on its own, never a gap.';
comment on column public.homekids_lessons.checklist is
  'What a family ticks off during the week to show the teacher on Sunday. Item ids are permanent once published: they key the ticks stored on people''s phones.';

create unique index if not exists homekids_lessons_taught_on_key
  on public.homekids_lessons (taught_on);

drop trigger if exists homekids_lessons_set_updated_at on public.homekids_lessons;
create trigger homekids_lessons_set_updated_at
  before update on public.homekids_lessons
  for each row execute function public.hc_set_updated_at();

alter table public.homekids_lessons enable row level security;

drop policy if exists "homekids lessons are publicly readable" on public.homekids_lessons;
create policy "homekids lessons are publicly readable"
  on public.homekids_lessons for select
  to anon, authenticated
  using (published);

grant select on public.homekids_lessons to anon, authenticated;
revoke insert, update, delete on public.homekids_lessons from anon, authenticated;
grant all on public.homekids_lessons to service_role;


-- ---------------------------------------------------------------------------
-- 2. The updates from the weekly emails
-- ---------------------------------------------------------------------------

create table if not exists public.homekids_updates (
  id              text primary key,         -- 'homekids-parents-fall-festival'
  audience        text not null,            -- 'parents' or 'volunteers'
  title           text not null,
  summary         text,
  details         jsonb not null default '[]'::jsonb,   -- short facts, one per line
  links           jsonb not null default '[]'::jsonb,   -- [{ "label": "...", "url": "..." }]
  happens_on      date,                     -- the day the thing is, when it is a thing
  ends_on         date,                     -- the day it leaves the page; null stays
  sent_on         date,                     -- the day the email went out
  source_email_id bigint references public.newsletter_emails(id) on delete set null,
  review_state    text not null default 'approved',

  published       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint homekids_updates_audience    check (audience in ('parents', 'volunteers')),
  constraint homekids_updates_review      check (review_state in ('pending', 'approved', 'discarded')),
  constraint homekids_updates_details_arr check (jsonb_typeof(details) = 'array'),
  constraint homekids_updates_links_arr   check (jsonb_typeof(links) = 'array')
);

comment on table public.homekids_updates is
  'One item from a weekly HomeKids email, to parents or to volunteers. The intake writes these unpublished and pending; an admin approving one is the only thing that puts it on the HomeKids page.';

create index if not exists homekids_updates_feed_idx
  on public.homekids_updates (audience, sent_on desc);
create index if not exists homekids_updates_pending_idx
  on public.homekids_updates (review_state) where review_state = 'pending';

drop trigger if exists homekids_updates_set_updated_at on public.homekids_updates;
create trigger homekids_updates_set_updated_at
  before update on public.homekids_updates
  for each row execute function public.hc_set_updated_at();

alter table public.homekids_updates enable row level security;

-- Published rows for everybody, and every row for an admin, which is how the
-- review queue on the Admin screen reads the drafts. The content sync reads
-- with no session, so a pending draft cannot reach the page even on the phone
-- of the admin reviewing it. Same shape as announcements in 0026.
drop policy if exists "homekids updates are publicly readable" on public.homekids_updates;
create policy "homekids updates are publicly readable"
  on public.homekids_updates for select
  to anon, authenticated
  using (published or public.hc_is_admin());

grant select on public.homekids_updates to anon, authenticated;
revoke insert, update, delete on public.homekids_updates from anon, authenticated;
grant all on public.homekids_updates to service_role;


-- ---------------------------------------------------------------------------
-- 3. Approve and discard
--
-- The only two ways a draft leaves the queue, and both check the role on the
-- first line. Discard keeps the row, unpublished, so a mis-tap is a row an
-- admin can still find rather than a lost email.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_approve_homekids_update(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  update public.homekids_updates
     set published = true, review_state = 'approved'
   where id = p_id;

  if not found then
    raise exception 'No HomeKids update with that id.';
  end if;
end;
$$;

revoke all on function public.hc_admin_approve_homekids_update(text) from public, anon, authenticated;
grant execute on function public.hc_admin_approve_homekids_update(text) to authenticated;

create or replace function public.hc_admin_discard_homekids_update(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  update public.homekids_updates
     set published = false, review_state = 'discarded'
   where id = p_id;

  if not found then
    raise exception 'No HomeKids update with that id.';
  end if;
end;
$$;

revoke all on function public.hc_admin_discard_homekids_update(text) from public, anon, authenticated;
grant execute on function public.hc_admin_discard_homekids_update(text) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. The switch
--
-- The page is in the ••• overlay from the day this ships, and it says so
-- honestly while it is empty. This row is here for the other case: a season
-- with no HomeKids, where the church would rather the tile were not there at
-- all. Off hides it, the same way group_mode_on hides Group.
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('homekids_on',
   'HomeKids page',
   'Off takes HomeKids out of the ••• menu for everybody. Nothing is deleted: lessons, updates and every family''s checkmarks come back exactly as they were when this goes on again.',
   'boolean', true, null, 35)
on conflict (key) do nothing;
