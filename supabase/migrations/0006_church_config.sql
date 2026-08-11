-- ===========================================================================
-- Home Church, the last of the hardcoded content
--
-- Four tables in one migration, the way 0001 did it, because these are the
-- remainder rather than a new idea: serve teams, next steps, the church's own
-- details, and the podcast show card. None of them change weekly, which is why
-- they waited, but all of them change, and every one was a code edit and a
-- merge to main.
--
-- The one that dates fastest is next_steps. Its baptism row currently reads
-- "The next one is August 23", which is a date sitting in the app binary.
--
-- Built from supabase/migrations/TEMPLATE_new_content_type.sql.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
-- ===========================================================================


-- 1. Serve teams -------------------------------------------------------------

create table if not exists public.serve_teams (
  id          text primary key,            -- 'team-kids'
  name        text not null,               -- 'Home Kids'
  commitment  text,                        -- 'Two Sundays a month'
  blurb       text,
  sort_order  integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.serve_teams is
  'The Lend a hand list on Connect.';


-- 2. Next steps --------------------------------------------------------------

create table if not exists public.next_steps (
  id          text primary key,            -- 'step-baptism'
  title       text not null,               -- 'I want to be baptized'
  blurb       text,
  sort_order  integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.next_steps is
  'The next step cards on Connect. Watch for dates going stale in the blurbs.';


-- 3. The church itself -------------------------------------------------------
--
-- One row. Service times and social links are lists, so they are jsonb with
-- the usual array guard.
--
-- Unlike every other table here, an empty church_profile does NOT clear the
-- app's copy. Home, Profile, Give, and the printed guide all read
-- church.address.city and friends without checking, and a church with no name
-- or address is not a state anyone means to express. js/content.js marks this
-- table neverEmpty for that reason. Deleting the row is not how you edit it.

create table if not exists public.church_profile (
  id             text primary key,         -- 'church-home'
  name           text not null,
  tagline        text,
  pastors        text,

  address_line1  text,
  address_city   text,
  address_state  text,
  address_zip    text,
  maps_url       text,

  service_day    text,                     -- 'Sunday'
  service_times  jsonb not null default '[]'::jsonb,   -- ["8:00 AM", ...]

  giving_url     text,
  website_url    text,
  social         jsonb not null default '[]'::jsonb,   -- [{label, url}]

  published      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint church_profile_service_times_is_array
    check (jsonb_typeof(service_times) = 'array'),
  constraint church_profile_social_is_array
    check (jsonb_typeof(social) = 'array')
);

comment on table public.church_profile is
  'The church''s own details. One row. Read by Home, Profile, Give, and the PDF.';


-- 4. The podcast show --------------------------------------------------------
-- Show level, not episode level. The episodes are in `podcasts`.

create table if not exists public.podcast_show (
  id          text primary key,            -- 'show-home-church-nola'
  name        text not null,
  platform    text,                        -- 'Spotify', rendered in button copy
  show_url    text,
  blurb       text,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.podcast_show is
  'The show card on Listen. One row. Episodes live in `podcasts`.';


-- 5. Indexes -----------------------------------------------------------------

create index if not exists serve_teams_sort_idx on public.serve_teams (sort_order, name);
create index if not exists next_steps_sort_idx  on public.next_steps  (sort_order, title);


-- 6. The updated_at triggers -------------------------------------------------
-- All four reuse the shared function from 0001.

drop trigger if exists serve_teams_set_updated_at on public.serve_teams;
create trigger serve_teams_set_updated_at before update on public.serve_teams
  for each row execute function public.hc_set_updated_at();

drop trigger if exists next_steps_set_updated_at on public.next_steps;
create trigger next_steps_set_updated_at before update on public.next_steps
  for each row execute function public.hc_set_updated_at();

drop trigger if exists church_profile_set_updated_at on public.church_profile;
create trigger church_profile_set_updated_at before update on public.church_profile
  for each row execute function public.hc_set_updated_at();

drop trigger if exists podcast_show_set_updated_at on public.podcast_show;
create trigger podcast_show_set_updated_at before update on public.podcast_show
  for each row execute function public.hc_set_updated_at();


-- 7. Row level security ------------------------------------------------------
-- Public read of published rows, no write policy at all. See 0001, section 7.

alter table public.serve_teams    enable row level security;
alter table public.next_steps     enable row level security;
alter table public.church_profile enable row level security;
alter table public.podcast_show   enable row level security;

drop policy if exists "serve teams are publicly readable" on public.serve_teams;
create policy "serve teams are publicly readable" on public.serve_teams
  for select to anon, authenticated using (published);

drop policy if exists "next steps are publicly readable" on public.next_steps;
create policy "next steps are publicly readable" on public.next_steps
  for select to anon, authenticated using (published);

drop policy if exists "church profile is publicly readable" on public.church_profile;
create policy "church profile is publicly readable" on public.church_profile
  for select to anon, authenticated using (published);

drop policy if exists "podcast show is publicly readable" on public.podcast_show;
create policy "podcast show is publicly readable" on public.podcast_show
  for select to anon, authenticated using (published);


-- 8. Grants ------------------------------------------------------------------

grant select on public.serve_teams, public.next_steps,
                public.church_profile, public.podcast_show
  to anon, authenticated;
revoke insert, update, delete on public.serve_teams, public.next_steps,
                                 public.church_profile, public.podcast_show
  from anon, authenticated;
grant all on public.serve_teams, public.next_steps,
             public.church_profile, public.podcast_show
  to service_role;


-- 9. Seed from js/data.js ----------------------------------------------------
-- In the order they appear there, so nothing moves on a phone until somebody
-- edits a row. Upsert, so running this twice is safe.

insert into public.serve_teams (id, name, commitment, blurb, sort_order, published) values
  ('team-kids', 'Home Kids', 'Two Sundays a month',
   $hc$Birth through fifth grade. Loud, joyful, and the most important room in the building.$hc$, 10, true),
  ('team-welcome', 'Welcome Team', 'One Sunday a month',
   $hc$Doors, coffee, and being the first face somebody sees. If you are good at remembering names, this is you.$hc$, 20, true),
  ('team-worship', 'Worship and Production', 'Weekly rehearsal, two Sundays a month',
   $hc$Band, vocals, sound, lights, and cameras. Auditions are casual and we will train you on the technical side.$hc$, 30, true),
  ('team-care', 'Care Team', 'As needed',
   $hc$Meals after a baby, rides to appointments, showing up when a family is in the hardest week of their year.$hc$, 40, true)
on conflict (id) do nothing;

insert into public.next_steps (id, title, blurb, sort_order, published) values
  ('step-new', $hc$I’m new here$hc$,
   $hc$Tell us a little about yourself and we will find you on Sunday.$hc$, 10, true),
  ('step-baptism', $hc$I want to be baptized$hc$,
   $hc$The next one is August 23. We will walk you through it.$hc$, 20, true),
  ('step-prayer', $hc$I need prayer$hc$,
   $hc$Send it to us. A real person reads every one of these.$hc$, 30, true),
  ('step-group', $hc$I want to lead a group$hc$,
   $hc$We will train you and hand you a guide every week.$hc$, 40, true)
on conflict (id) do nothing;

insert into public.church_profile
  (id, name, tagline, pastors, address_line1, address_city, address_state,
   address_zip, maps_url, service_day, service_times, giving_url, website_url,
   social, published)
values (
  'church-home',
  'Home Church',
  $hc$A church of the city. Built from New Orleans. Built for New Orleans.$hc$,
  'Stephen and Laura Daigle',
  '216 Giuffrias Ave', 'Metairie', 'LA', '70001',
  'https://maps.apple.com/?address=216%20Giuffrias%20Ave,%20Metairie,%20LA%2070001',
  'Sunday',
  $hc$["8:00 AM", "9:30 AM", "11:00 AM"]$hc$::jsonb,
  'https://donate.overflow.co/homechurchnola',
  'https://www.homechurchnola.com',
  $hc$[{"label": "Instagram", "url": "https://www.instagram.com/homechurchnola"},
      {"label": "Facebook", "url": "https://www.facebook.com/homechurchnola"},
      {"label": "YouTube", "url": "https://www.youtube.com/@homechurchnola"}]$hc$::jsonb,
  true
)
on conflict (id) do nothing;

insert into public.podcast_show (id, name, platform, show_url, blurb, published)
values (
  'show-home-church-nola',
  'Home Church NOLA',
  'Spotify',
  'https://open.spotify.com/show/7iJGZvY5MVm7CjPggvvPOa',
  $hc$Every Sunday message, on Spotify by Monday. Follow the show and the next one lands in your feed.$hc$,
  true
)
on conflict (id) do nothing;
