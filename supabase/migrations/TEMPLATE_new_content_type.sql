-- ===========================================================================
-- TEMPLATE. Copy this file, do not run it as is.
--
-- This is step 1 of 3 for adding a fifth content type (announcements, staff
-- bios, serve teams, whatever comes next). The other two steps are in
-- `supabase/README.md`, and `/new-content-type` in Claude Code does all
-- three for you.
--
--   cp supabase/migrations/TEMPLATE_new_content_type.sql \
--      supabase/migrations/0003_announcements.sql
--
-- Then find-and-replace THING with your table name, fill in the columns,
-- and paste the result into the Supabase SQL editor.
--
-- Every content table in this schema looks the same on purpose. Same id
-- style, same three housekeeping columns, same trigger, same two RLS moves.
-- If your new table does not look like this one, that is worth a second
-- thought before you run it.
-- ===========================================================================


-- 1. The table -------------------------------------------------------------
--
-- Rules of the house:
--   * `id` is a readable, permanent text slug, prefixed with the singular
--     content type: 'announcement-serve-day', 'staff-laura-daigle'. Never a
--     uuid, never renamed. Ids key things stored on people's phones.
--   * `published` gates whether the app can see the row. It is what gives
--     you a draft state for free.
--   * `created_at` and `updated_at` on everything, no exceptions.

create table if not exists public.THING (
  id          text primary key,            -- 'thing-some-slug'
  title       text not null,

  -- ---- your columns go here ----------------------------------------
  -- Plain values as normal Postgres types. Anything that is a list or a
  -- nested shape goes in a jsonb column with a matching array guard down
  -- in the constraints, the way guides stores its sections.
  -- ------------------------------------------------------------------

  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()

  -- , constraint THING_somelist_is_array check (jsonb_typeof(somelist) = 'array')
);

comment on table public.THING is 'One sentence on what this holds and which screen reads it.';


-- 2. Indexes ---------------------------------------------------------------
-- Index whatever the app sorts or filters on. Usually a date, sometimes a
-- parent id.

-- create index if not exists THING_created_at_idx on public.THING (created_at desc);


-- 3. The updated_at trigger ------------------------------------------------
-- Reuses the shared function from 0001. Do not write a second copy of it.

drop trigger if exists THING_set_updated_at on public.THING;

create trigger THING_set_updated_at
  before update on public.THING
  for each row execute function public.hc_set_updated_at();


-- 4. Row level security ----------------------------------------------------
-- Public read of published rows, and no write policy at all. The service
-- role bypasses RLS, so leaving out the write policies is exactly what makes
-- the table service-role-write-only. See the long note in 0001, section 7.

alter table public.THING enable row level security;

drop policy if exists "THING are publicly readable" on public.THING;

create policy "THING are publicly readable"
  on public.THING for select
  to anon, authenticated
  using (published);


-- 5. Grants ----------------------------------------------------------------

grant select on public.THING to anon, authenticated;
revoke insert, update, delete on public.THING from anon, authenticated;
grant all on public.THING to service_role;
