-- ===========================================================================
-- Home Church, the rest of what an admin may reword
--
-- 0030 opened seven prose columns to Edit mode, which turned out to be the
-- wrong size of answer. The people who will run this app after launch are
-- going to want to fix a serve team's commitment line, a group's description,
-- a next step's button, the sentence under a sermon, without asking anybody
-- for a build. That is the whole point of the feature and seven columns is
-- not it.
--
-- So this migration is the same shape as 0030 section 3, wider, and it says
-- out loud what is still refused and why.
--
-- WHERE THE LINE IS, decided deliberately rather than by what was easy:
--
--   Editable       descriptions, subtitles, captions, eyebrows, the words on
--                  a button, the notes under one.
--
--   Not editable   a screen's title and a section's heading, because those are
--                  navigation: the index rail lists them and the tab bar
--                  agrees with them.
--
--   Not editable   an item's own name, a serve team's or an event's or a
--                  group's, because that is what the thing is called on a
--                  Sunday and in somebody's calendar. Edited from the Admin
--                  form, where the whole item is in view.
--
--   Not editable   anything the code reads back. Each of these was checked
--                  against what actually reads it rather than assumed:
--
--     groups.day, groups.neighborhood
--       The finder's filter chips are built from these values and compared
--       against them. Reword one and the chip that selected it matches
--       nothing.
--
--     events.starts_at, events.time_label, events.location
--       Connect parses the first two back into a real Date for Add to
--       calendar, and all three go into the entry a person keeps. A time that
--       reads well and does not parse puts the wrong hour in a calendar.
--
--     announcements.title
--       Already said on every lock screen in the church by the notification.
--
--     church_profile address, service times, giving_url, serve_signup_number,
--     serve_signup_keyword
--       Facts and destinations. The SMS pair in particular is assembled into
--       "Text KIDS to 833-801-3857" and dialled.
--
--     guides.group_sections, guides.reflection_questions
--       A group room copies its questions from the guide when it opens, so an
--       edit would change the next room and not the one sitting in a lounge
--       tonight. That is worth having and it is not a text box on a screen.
--
-- COLUMN LEVEL GRANTS, again, for the reason 0030 gives at length: RLS decides
-- rows and has nothing to say about columns, so the grant is the only thing
-- that stops a phone holding an admin session from PATCHing published, or a
-- URL, or a date. An UPDATE naming any other column is refused with 42501
-- before a policy is consulted.
--
-- THE CLIENT KEEPS THE SAME LIST, in the ALLOWLIST at the top of
-- js/edit-mode.js, and supabase/tests/0031_editable_columns_test.sql asserts
-- that the two are exactly equal. Two lists meant to match that are never
-- compared do not stay matching.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0025 (hc_is_admin) and 0030. Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The columns
--
-- Written as data rather than as fifty grant statements, so the list can be
-- read at a glance and compared against the client's copy of it. Re-running
-- is safe: a grant is idempotent, and a column a project has not migrated to
-- yet is skipped rather than failing the file.
-- ---------------------------------------------------------------------------

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      -- Already granted by 0030, repeated here so this file is the whole list.
      ('serve_teams',    'blurb'),
      ('next_steps',     'blurb'),
      ('podcast_show',   'blurb'),
      ('events',         'description'),
      ('church_profile', 'tagline'),
      ('church_profile', 'serve_signup_blurb'),
      ('church_profile', 'groups_off_season_note'),

      -- New here.
      ('serve_teams',    'commitment'),          -- 'Two Sundays a month'
      ('serve_teams',    'requirement'),         -- 'Background check required'
      ('next_steps',     'cta_label'),           -- the words on the button
      ('groups',         'blurb'),               -- what the group is like
      ('series',         'subtitle'),
      ('series',         'blurb'),
      ('podcasts',       'description'),         -- the sentence under a sermon
      ('podcasts',       'summary'),             -- the same thing as paragraphs
      ('guides',         'subtitle'),
      ('reading_plans',  'subtitle'),
      ('reading_plans',  'this_week'),           -- 'Psalms 1 to 8'
      ('announcements',  'eyebrow'),             -- the label over the title
      ('content_pages',  'eyebrow')
    ) as v(tbl, col)
  loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = spec.tbl
         and column_name = spec.col
    ) then
      execute format('grant update (%I) on public.%I to authenticated', spec.col, spec.tbl);
    end if;
  end loop;
end;
$$;

-- announcements and content_pages already carry a full admin UPDATE from 0026,
-- which is wider than the two columns above and stays that way: the Admin form
-- writes every column of both, and narrowing them now would break the screen
-- that has been writing them since 0026. Edit mode is narrower than its
-- privileges there by choice, enforced in the client's ALLOWLIST.


-- ---------------------------------------------------------------------------
-- 2. The policies
--
-- The five tables 0030 opened, plus the four that are new here. Same policy
-- text as 0030, same reasoning: `to authenticated` because that is the only
-- role a signed in admin has, hc_is_admin() because that is what narrows it.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['serve_teams', 'next_steps', 'podcast_show',
                           'events', 'church_profile',
                           'groups', 'series', 'podcasts', 'guides',
                           'reading_plans']
  loop
    continue when to_regclass('public.' || t) is null;

    execute format('drop policy if exists %I on public.%I',
                   'admins update ' || t, t);
    execute format($f$
      create policy %I on public.%I for update
        to authenticated
        using (public.hc_is_admin())
        with check (public.hc_is_admin())
    $f$, 'admins update ' || t, t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. TRUNCATE, on the tables this migration touches
--
-- The finding from applying 0030 to the project, applied to its neighbours.
-- Supabase's default privileges grant ALL on a table in the public schema, and
-- every revoke in this project since 0001 has named insert, update and delete
-- only, so anon holds TRUNCATE on all of them. RLS does not apply to TRUNCATE:
-- there is no policy that would stop it and no row filter that softens it, the
-- privilege is the whole of the check, and the statement empties the table.
--
-- Nothing in PostgREST can issue one today, which is why this has been
-- harmless since 0001. It stops being harmless the day somebody writes an RPC
-- that takes a table name. One line each, now, while it is cheap.
--
-- Deliberately every content table rather than only the ones above: a
-- half-swept floor is worse than an unswept one, because it reads as done.
-- The tables holding people's own writing, the group rooms and the journal,
-- are left exactly as their own migrations set them, which is where their
-- reasoning lives.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['series', 'guides', 'podcasts', 'events',
                           'announcements', 'reading_plans', 'groups',
                           'serve_teams', 'next_steps', 'church_profile',
                           'podcast_show', 'instagram_posts',
                           'content_pages', 'app_settings']
  loop
    continue when to_regclass('public.' || t) is null;
    execute format('revoke truncate on public.%I from anon, authenticated', t);
  end loop;
end;
$$;
