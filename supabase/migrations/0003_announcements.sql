-- ===========================================================================
-- Home Church, announcements
--
-- The "One thing" card on Home. It changes most weeks, which made it the one
-- real gap left after 0001: everything else that churns weekly already had a
-- table, and this did not, so a new announcement still meant a build.
--
-- Built from supabase/migrations/TEMPLATE_new_content_type.sql without
-- deviating from it, which is the point. If a sixth content type does not
-- come out looking like this, that is worth a second thought.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Then `python3 scripts/hc_supabase.py verify`.
-- ===========================================================================


-- 1. The table -------------------------------------------------------------
--
-- Home renders one announcement at most, on purpose, and the app already
-- keys "I dismissed this" in localStorage on the announcement id. So ids are
-- permanent here for the same reason they are permanent on guides: renaming
-- one un-dismisses it on every phone that already dismissed it.
--
-- starts_on and ends_on are what make this genuinely hands off. Write the
-- Christmas Eve announcement in November with an ends_on, and it takes itself
-- down on the 26th without anyone remembering to go and remove it.

create table if not exists public.announcements (
  id          text primary key,           -- 'announcement-serve-day'
  eyebrow     text,                        -- 'One thing', the tracked caps label
  title       text not null,               -- 'City Serve Day, September 12'
  body        text,                        -- one or two warm sentences

  starts_on   date,                        -- null shows immediately
  ends_on     date,                        -- null runs until unpublished
  priority    integer not null default 0,  -- higher wins when two are live

  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.announcements is
  'The single One thing card on Home. Dated so an announcement can retire itself.';
comment on column public.announcements.priority is
  'Home shows one announcement. When two are live on the same day, the higher priority wins.';


-- 2. Indexes ---------------------------------------------------------------

create index if not exists announcements_window_idx
  on public.announcements (starts_on, ends_on);


-- 3. The updated_at trigger ------------------------------------------------
-- Reuses the shared function from 0001, no second copy.

drop trigger if exists announcements_set_updated_at on public.announcements;

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.hc_set_updated_at();


-- 4. Row level security ----------------------------------------------------
-- Public read of published rows, and no write policy at all. The service role
-- bypasses RLS, so the missing write policies are the mechanism, not an
-- oversight. Do not "fix" this by adding one. See 0001, section 7.

alter table public.announcements enable row level security;

drop policy if exists "announcements are publicly readable" on public.announcements;

create policy "announcements are publicly readable"
  on public.announcements for select
  to anon, authenticated
  using (published);


-- 5. Grants ----------------------------------------------------------------

grant select on public.announcements to anon, authenticated;
revoke insert, update, delete on public.announcements from anon, authenticated;
grant all on public.announcements to service_role;
