-- ===========================================================================
-- Home Church, what an admin can write
--
-- The second half of 0025. That migration taught the database who an admin
-- is; this one is every table they are allowed to write, and it is the first
-- time in this project that anything other than the service role can write a
-- content table.
--
-- THE PATTERN THAT CHANGES, and it is worth being explicit because 0001
-- section 7 argued the opposite at length. Every content table so far has RLS
-- on, one SELECT policy, and deliberately no write policy at all, because the
-- only writer was the service role and the service role does not consult
-- policies. That is still true of series, guides, podcasts and events, and
-- this migration does not touch them. What changes here is that three tables
-- gain a second writer, a signed in admin holding nothing but their own
-- session, and a second writer needs a policy. The service role path is
-- untouched and still works, so `/new-announcement` from Claude Code and the
-- Post Announcement form on a phone are two doors into the same table.
--
-- WHY THE DRAFT STATE STILL WORKS. `published` has always doubled as a draft
-- flag, and the SELECT policies below keep it: the world sees published rows
-- only. Admins additionally see their own drafts, which is new and is the
-- thing that makes "save it now, publish it Sunday" possible from the phone.
-- The app's content sync reads with the publishable key and no session, so a
-- draft can never reach Home by accident even on an admin's own device.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0025 to have run first, it leans on hc_is_admin().
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. announcements grows a picture and a video
--
-- Both are external URLs, which is the same call podcasts.episode_url made in
-- 0001 and for the same reasons. image_url is the exception: it usually will
-- point into this project's own Storage, because an announcement's photograph
-- is taken on the phone that is writing the announcement and there is nowhere
-- else for it to go. See section 5.
--
-- video_url is a YouTube link and is rendered as a link out rather than
-- played in place. Home already plays video inline for homeMedia, where the
-- file is an mp4 the church hosts; a YouTube URL is not that, and embedding
-- one would put an iframe from Google on the screen the app opens to, which
-- is the trade this project has refused twice already, once for fonts and
-- once for the Instagram rail.
-- ---------------------------------------------------------------------------

alter table public.announcements
  add column if not exists image_url text,
  add column if not exists video_url text;

comment on column public.announcements.image_url is
  'Usually an object in this project''s `announcements` Storage bucket, uploaded from the admin form. Any https URL works.';
comment on column public.announcements.video_url is
  'A YouTube or Vimeo link. Drawn as a button that leaves the app, never as an embedded player. See migration 0026 section 1.';

-- Home lists announcements newest first now rather than showing one, so the
-- sort it actually runs wants an index of its own.
create index if not exists announcements_recent_idx
  on public.announcements (created_at desc);


-- ---------------------------------------------------------------------------
-- 2. content_pages
--
-- A page of the church's own words, written in the app instead of in a source
-- file. The Give screen's paragraph is the first one that moves here; the
-- point is that the next one does not need a build either.
--
-- WHAT IS DELIBERATELY NOT IN HERE: the nine Practices. Those words and
-- videos are Practicing the Way's work, not this church's, and
-- js/practices.js sets out at length why they are generated once by
-- scripts/build_practices.js, read by a person, and committed rather than
-- edited in a table at midnight. Nothing about this table changes that, and
-- the Content Management screen says so where somebody would otherwise go
-- looking.
--
-- WHY sections IS jsonb AND NOT A CHILD TABLE. Same answer as guides in 0001:
-- a page is always read whole and never queried by individual heading, and a
-- form that edits it should not have to think about joins. The shape is
-- [{heading, body}], deliberately the simplest thing an editor can draw as a
-- text field and a textarea, because the alternative, a rich block model, is
-- how a content editor turns into a project.
--
-- body inside a section is one string. Blank lines in it become paragraphs at
-- render time. Nobody typing an announcement on a phone should be composing
-- an array of strings, which is what the guides tables ask of the publishing
-- scripts and is right there and wrong here.
-- ---------------------------------------------------------------------------

create table if not exists public.content_pages (
  id          text primary key,           -- 'page-give', permanent, see 0001
  title       text not null,              -- 'Give'
  eyebrow     text,                        -- 'Thank you', the tracked caps label
  blurb       text,                        -- the opening paragraph, before any section
  sections    jsonb not null default '[]'::jsonb,   -- [{heading, body}]

  published   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The one mistake that actually happens, per 0001: a single value sent
  -- where the app expects a list, which renders as nothing at all.
  constraint content_pages_sections_is_array check (jsonb_typeof(sections) = 'array')
);

comment on table public.content_pages is
  'Static prose the church owns, editable from Settings -> Admin -> Content instead of from a source file. Not the Practices, see migration 0026 section 2.';
comment on column public.content_pages.sections is
  '[{heading, body}]. body is one string; blank lines in it become paragraphs when the page is drawn.';

drop trigger if exists content_pages_set_updated_at on public.content_pages;
create trigger content_pages_set_updated_at
  before update on public.content_pages
  for each row execute function public.hc_set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. app_settings
--
-- Switches the church can flip without a build. Deliberately not a jsonb blob
-- with a config object in it: every setting is a row that carries its own
-- label, its own help text and its own type, so the Admin screen can draw the
-- right control for it without knowing anything about what the setting means.
-- That is what makes "toggles and text fields, never raw JSON" true in the UI
-- rather than aspirational.
--
-- TWO TYPED COLUMNS RATHER THAN ONE TEXT COLUMN. `value_bool` and
-- `value_text`, with `kind` naming which one is live. A single text column
-- holding 'true' works right up until somebody writes 'True', or 'yes', or a
-- space, and then a feature flag is on when it reads as off. Postgres already
-- has a boolean type and the cost of using it is one nullable column.
--
-- Rows can be added from the app, which is the difference between a settings
-- screen and a settings screen that needs a migration every time. `kind` is
-- constrained to the two controls the UI can actually draw, so a row that
-- would render as nothing cannot be created.
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key         text primary key,            -- 'home_banner_message'
  label       text not null,               -- 'Pinned banner message'
  help        text,                        -- the caption under the control
  kind        text not null default 'boolean',
  value_bool  boolean,
  value_text  text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint app_settings_kind_known check (kind in ('boolean', 'text'))
);

comment on table public.app_settings is
  'App-wide switches and short strings, edited from Settings -> Admin -> App settings. One row per setting, carrying its own label and type so the UI can draw it without a lookup table in the client.';
comment on column public.app_settings.kind is
  'boolean draws a switch and reads value_bool. text draws a field and reads value_text. Constrained to what the Admin screen can actually render.';

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.hc_set_updated_at();

-- The three this ships with. `on conflict do nothing` so re-running the file
-- never resets a switch somebody has since flipped, which is the whole reason
-- these are seeded here rather than upserted.
insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('home_banner_on',
   'Pinned banner',
   'Shows a single line at the very top of Home, above everything else. Use it for the thing that cannot wait for an announcement.',
   'boolean', false, null, 10),

  ('home_banner_message',
   'Banner message',
   'One sentence. It only appears while the switch above is on.',
   'text', null, '', 20),

  ('announcement_push_default',
   'Notify on new announcements',
   'When this is on, posting an announcement offers to send a notification. Turn it off for a season of small updates nobody needs on their lock screen.',
   'boolean', true, null, 30)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------
-- 4. Row level security
--
-- Read is unchanged from every other content table: anon and authenticated
-- see published rows. Write is new, and it is the same three policies on each
-- of the three tables, so they are written as one loop rather than nine
-- near-identical blocks that can drift.
--
-- `to authenticated` and not `to anon, authenticated` on every write policy.
-- A signed out phone holds the publishable key, and hc_is_admin() is false
-- for it, so anon would already be refused; naming only authenticated means
-- two independent things have to be wrong rather than one, which is the same
-- belt and braces reasoning as the revokes in 0001 section 8.
--
-- The SELECT policies say `published or hc_is_admin()`, which is what lets an
-- admin see their own drafts on the admin screen. Note the ordering: for a
-- published row Postgres short circuits on the first operand and never calls
-- the function at all, so the common path costs nothing.
--
-- That short circuit is also why hc_is_admin() must be callable by anon, and
-- why 0025 grants it there. On an unpublished row the function IS called, by
-- whoever is asking, and a role without EXECUTE gets an error rather than
-- zero rows. See 0025 section 2, which has the whole story.
-- ---------------------------------------------------------------------------

alter table public.content_pages enable row level security;
alter table public.app_settings  enable row level security;
-- announcements already had it from 0003.

do $$
declare
  t text;
begin
  foreach t in array array['announcements', 'content_pages', 'app_settings']
  loop
    execute format('drop policy if exists %I on public.%I',
                   t || ' are publicly readable', t);
    execute format('drop policy if exists %I on public.%I',
                   'admins write ' || t, t);
    execute format('drop policy if exists %I on public.%I',
                   'admins update ' || t, t);
    execute format('drop policy if exists %I on public.%I',
                   'admins delete ' || t, t);

    execute format($f$
      create policy %I on public.%I for select
        to anon, authenticated
        using (%s)
    $f$, t || ' are publicly readable', t,
         -- app_settings has no published column: a setting is either there or
         -- it is not, and a draft switch is not a thing.
         case when t = 'app_settings' then 'true' else 'published or public.hc_is_admin()' end);

    execute format($f$
      create policy %I on public.%I for insert
        to authenticated
        with check (public.hc_is_admin())
    $f$, 'admins write ' || t, t);

    execute format($f$
      create policy %I on public.%I for update
        to authenticated
        using (public.hc_is_admin())
        with check (public.hc_is_admin())
    $f$, 'admins update ' || t, t);

    execute format($f$
      create policy %I on public.%I for delete
        to authenticated
        using (public.hc_is_admin())
    $f$, 'admins delete ' || t, t);
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- 5. Grants
--
-- The mirror of 0001 section 8, run in the other direction. There the revoke
-- of write privileges from authenticated was the load bearing line; here
-- authenticated genuinely needs them, and RLS is what narrows "authenticated"
-- to "an admin". anon keeps read and nothing else on all three.
--
-- This is the trade being made, stated plainly so nobody has to reconstruct
-- it: these three tables now depend on RLS alone to stop a signed in member
-- writing them, where the other content tables depend on RLS and a missing
-- grant. That is one layer rather than two, and it is the unavoidable cost of
-- letting anybody write from a phone. It is why the write policies are
-- generated from one loop, why hc_is_admin() is the only condition in any of
-- them, and why 0026's test file asserts the refusal as a member rather than
-- reading the policy and nodding.
-- ---------------------------------------------------------------------------

grant select on public.announcements, public.content_pages, public.app_settings
  to anon, authenticated;

revoke insert, update, delete on public.announcements, public.content_pages, public.app_settings
  from anon;

grant insert, update, delete on public.announcements, public.content_pages, public.app_settings
  to authenticated;

grant all on public.announcements, public.content_pages, public.app_settings
  to service_role;


-- ---------------------------------------------------------------------------
-- 6. Somewhere to put the photograph
--
-- A bucket, created here rather than clicked in the dashboard, because the
-- whole point of this pass is that the church never has to open the
-- dashboard. `public = true` means reads need no signature, which is what
-- lets Home draw the image with the publishable key and lets the file survive
-- being cached on a phone. Writes are a different question and are gated
-- below.
--
-- WHY IT IS SEPARATE FROM THE instagram BUCKET, which already exists and is
-- also public. That one is written only by the sync job holding the service
-- role key and is full of somebody else's photographs mirrored off Meta's
-- CDN. This one is written by a person on a phone. Different writers and
-- different provenance want different policies, and merging them would mean
-- the loosest of the two policies applies to both.
--
-- The 5MB cap and the mime list are the bucket's own, enforced by Storage
-- before a byte lands, so a mis-typed upload fails at the door rather than
-- filling the project with a video somebody meant to link.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcements', 'announcements', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "announcement images are publicly readable" on storage.objects;
drop policy if exists "admins upload announcement images"          on storage.objects;
drop policy if exists "admins replace announcement images"         on storage.objects;
drop policy if exists "admins delete announcement images"          on storage.objects;

create policy "announcement images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'announcements');

create policy "admins upload announcement images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'announcements' and public.hc_is_admin());

create policy "admins replace announcement images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'announcements' and public.hc_is_admin())
  with check (bucket_id = 'announcements' and public.hc_is_admin());

create policy "admins delete announcement images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'announcements' and public.hc_is_admin());


-- ---------------------------------------------------------------------------
-- 7. The Give page, moved out of the source
--
-- js/screens/give.js had one paragraph hardcoded in it. It is the church's
-- own writing about its own giving, it is the kind of sentence somebody wants
-- to soften at 10pm, and there was no way to change it without a build and an
-- App Store review. So it is the first row in content_pages and the Give
-- screen reads it from there, falling back to the same words still in the
-- source file when the table has not been reached yet.
--
-- `on conflict do nothing` for the same reason as the settings above: this
-- file re-runs, and a re-run must not overwrite an edit.
-- ---------------------------------------------------------------------------

insert into public.content_pages (id, title, eyebrow, blurb, sections, sort_order)
values (
  'page-give',
  'Give',
  'Thank you',
  'Everything we do here runs on people who decided this place was worth it. Kids rooms, meals after a baby, the lights, the guides, the doors staying open on a Tuesday when somebody needs to talk. That is you.',
  '[]'::jsonb,
  10
)
on conflict (id) do nothing;
