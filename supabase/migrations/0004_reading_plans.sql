-- ===========================================================================
-- Home Church, reading plans
--
-- The "Reading together" row on Home. It was the last weekly thing still
-- hardcoded: `currentWeek` and `thisWeek` change every Sunday, and changing
-- them meant editing js/data.js, committing, and merging to main. Every week.
-- The sermon it sits next to has been publishable from Supabase for a while,
-- which made this the odd one out on its own screen.
--
-- Built from supabase/migrations/TEMPLATE_new_content_type.sql without
-- deviating from it, same as 0003.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Then `python3 scripts/hc_supabase.py verify`, if you are on a machine
--   that has .env. From a phone, the Table Editor will show the row.
-- ===========================================================================


-- 1. The table -------------------------------------------------------------
--
-- Home shows one plan, so this follows the `series` pattern rather than the
-- announcements one: keep every plan you have ever run, and flip is_current
-- when a new one starts. Finishing David and starting Philippians is then two
-- updates and no deletion, and last year's plan is still on record.
--
-- current_week is the only column that changes most weeks. That is the whole
-- point of the table, so it is worth keeping the row small enough that
-- editing it from a phone in the Supabase Table Editor is not a chore.

create table if not exists public.reading_plans (
  id            text primary key,            -- 'plan-david'
  title         text not null,               -- 'The Life of David'
  subtitle      text,                        -- 'A twenty week walk through the whole story'

  total_weeks   integer not null,            -- 20
  current_week  integer not null default 1,  -- the one field that moves weekly
  this_week     text,                        -- '2 Samuel 11 and 12, plus Psalm 51'

  -- [{ "label": "...", "url": "..." }], same shape as the guide sections
  resources     jsonb not null default '[]'::jsonb,

  is_current    boolean not null default false,  -- exactly one plan should be true

  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint reading_plans_resources_is_array
    check (jsonb_typeof(resources) = 'array'),

  -- A plan on week 0, or on week 25 of 20, is a typo rather than a state.
  -- Catching it here beats rendering a progress bar past 100% on Home.
  constraint reading_plans_week_in_range
    check (current_week >= 1 and current_week <= total_weeks)
);

comment on table public.reading_plans is
  'The Reading together row on Home. One plan is current at a time.';
comment on column public.reading_plans.is_current is
  'Home shows the current plan. Exactly one row should be true.';
comment on column public.reading_plans.current_week is
  'Bump this every week. It is the reason this table exists.';


-- 2. Indexes ---------------------------------------------------------------
-- Home asks for the current one, and that is the only query there is.

create index if not exists reading_plans_current_idx
  on public.reading_plans (is_current);


-- 3. The updated_at trigger ------------------------------------------------
-- Reuses the shared function from 0001, no second copy.

drop trigger if exists reading_plans_set_updated_at on public.reading_plans;

create trigger reading_plans_set_updated_at
  before update on public.reading_plans
  for each row execute function public.hc_set_updated_at();


-- 4. Row level security ----------------------------------------------------
-- Public read of published rows, and no write policy at all. The service role
-- bypasses RLS, so the missing write policies are the mechanism, not an
-- oversight. See 0001, section 7.

alter table public.reading_plans enable row level security;

drop policy if exists "reading plans are publicly readable" on public.reading_plans;

create policy "reading plans are publicly readable"
  on public.reading_plans for select
  to anon, authenticated
  using (published);


-- 5. Grants ----------------------------------------------------------------

grant select on public.reading_plans to anon, authenticated;
revoke insert, update, delete on public.reading_plans from anon, authenticated;
grant all on public.reading_plans to service_role;


-- 6. Seed the plan that is running right now --------------------------------
-- Lifted from js/data.js so the table starts out matching what is on phones
-- today. Upsert, so running this file twice is safe.

insert into public.reading_plans
  (id, title, subtitle, total_weeks, current_week, this_week, resources, is_current, published)
values (
  'plan-david',
  'The Life of David',
  'A twenty week walk through the whole story',
  20,
  8,
  '2 Samuel 11 and 12, plus Psalm 51',
  '[{"label": "The Bible Project, 2 Samuel", "url": "https://bibleproject.com/explore/video/2-samuel/"},
    {"label": "Robert Alter, The David Story", "url": "https://www.google.com/search?q=Robert+Alter+The+David+Story"}]'::jsonb,
  true,
  true
)
on conflict (id) do nothing;
