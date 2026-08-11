-- ===========================================================================
-- Home Church, groups
--
-- The Find a group list on Connect. Hosts move, nights change, and `openings`
-- goes stale the week a group fills up, which is the one that matters: a group
-- showing "Room for more" when it is full sends somebody to a door that cannot
-- take them. That was a code change and a merge to main until now.
--
-- Built from supabase/migrations/TEMPLATE_new_content_type.sql without
-- deviating from it, same as 0003 and 0004.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
-- ===========================================================================


-- 1. The table -------------------------------------------------------------
--
-- `time_label` rather than `time`, matching events, because these are display
-- strings the church writes ("6:30 PM") and not values anything computes on.
-- A real time type would invite formatting decisions the app does not want to
-- make.
--
-- `sort_order` exists because Connect shows the first group as "your group"
-- and PostgREST returns rows in no guaranteed order. Without it, which group
-- that is would change between fetches.

create table if not exists public.groups (
  id            text primary key,            -- 'group-lakeview-thu'
  name          text not null,               -- 'Lakeview Thursday'

  day           text,                        -- 'Thursday', a filter pill
  time_label    text,                        -- '6:30 PM', display only
  neighborhood  text,                        -- 'Lakeview', a filter pill
  host          text,                        -- 'Trey and Anna'
  life_stage    text,                        -- 'Young families'
  blurb         text,                        -- two sentences, what a night is like

  -- The field that goes stale fastest, and the reason this table exists.
  openings      boolean not null default true,

  sort_order    integer not null default 0,

  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.groups is
  'Small groups, the Find a group list on Connect.';
comment on column public.groups.openings is
  'False renders "Full for now" instead of "Room for more". Keep it honest.';
comment on column public.groups.sort_order is
  'Connect shows the lowest as "your group". Ties fall back to name.';


-- 2. Indexes ---------------------------------------------------------------
-- The list is ordered by this on every load, and it is the only query.

create index if not exists groups_sort_idx
  on public.groups (sort_order, name);


-- 3. The updated_at trigger ------------------------------------------------
-- Reuses the shared function from 0001, no second copy.

drop trigger if exists groups_set_updated_at on public.groups;

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.hc_set_updated_at();


-- 4. Row level security ----------------------------------------------------
-- Public read of published rows, and no write policy at all. See 0001,
-- section 7.

alter table public.groups enable row level security;

drop policy if exists "groups are publicly readable" on public.groups;

create policy "groups are publicly readable"
  on public.groups for select
  to anon, authenticated
  using (published);


-- 5. Grants ----------------------------------------------------------------

grant select on public.groups to anon, authenticated;
revoke insert, update, delete on public.groups from anon, authenticated;
grant all on public.groups to service_role;


-- 6. Seed the four groups that are running now ------------------------------
-- Lifted from js/data.js, in the order they appear there, so the table starts
-- out matching what is on phones today. Upsert, so running this twice is safe.

insert into public.groups
  (id, name, day, time_label, neighborhood, host, life_stage, blurb, openings, sort_order, published)
values
  ('group-lakeview-thu', 'Lakeview Thursday', 'Thursday', '6:30 PM', 'Lakeview',
   'Trey and Anna', 'Young families',
   $hc$Dinner first, guide second, kids welcome and loud. We eat at 6:30 and start the guide around 7:15.$hc$,
   true, 10, true),

  ('group-metairie-tue', 'Metairie Tuesday', 'Tuesday', '7:00 PM', 'Metairie',
   'Marcus and Dee', 'Empty nesters',
   $hc$Coffee, the week’s guide, and a group that has been doing this together for six years. New people fit in fast.$hc$,
   true, 20, true),

  ('group-uptown-wed', 'Uptown Wednesday', 'Wednesday', '7:30 PM', 'Uptown',
   'Jasmine', 'Young adults',
   $hc$Mostly twenties, mostly transplants, all of us figuring out this city. We meet in the back room at the house on Freret.$hc$,
   true, 30, true),

  ('group-westbank-sun', 'West Bank Sunday', 'Sunday', '5:00 PM', 'Algiers',
   'Paul and Renee', 'All ages',
   $hc$Sunday evening, big table, everybody brings something. Currently full, but tell us you are interested and we will start the next one.$hc$,
   false, 40, true)

on conflict (id) do nothing;
