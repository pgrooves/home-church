-- ===========================================================================
-- Home Church, editing a sentence where it is written
--
-- WHAT THIS IS FOR. 0026 moved the church's own prose out of source files and
-- into tables, and it moved it to a form on the Admin screen: you go to
-- Settings -> Admin -> Content, find the page, edit the field, save. That is
-- the right shape for writing a page. It is the wrong shape for the thing
-- that actually happens, which is somebody reading Give on a Sunday, noticing
-- one sentence lands badly, and wanting to fix that sentence right there.
--
-- This migration is the database half of Edit mode: an admin flips a switch,
-- every editable sentence in the app outlines itself, and tapping one turns
-- it into a text box with Save under it. Two kinds of sentence are reachable
-- that way and they need two different things from Postgres.
--
-- ONE: PROSE THAT IS ALREADY A ROW. A next step's blurb, a serve team's
-- blurb, the church's tagline, the podcast show's blurb, an event's
-- description. These already live in tables, and the only reason an admin
-- cannot write them from a phone is that those tables were built when the
-- service role was the only writer, so they have no write policy at all.
-- Section 3 gives them one, narrowly.
--
-- TWO: PROSE THAT IS STILL A STRING IN A SOURCE FILE. "Opens Overflow in
-- your browser. Cash, card, and stock, all in one place." is in
-- js/screens/give.js, and there are a couple of dozen more like it: captions,
-- notes under buttons, the line an empty list draws. Every one of them is a
-- build and an App Store review to change one word. Section 1 is a table of
-- overrides keyed by a slot name the app assigns, so the string in the source
-- file becomes the default rather than the only copy.
--
-- WHY AN OVERRIDE TABLE AND NOT A COLUMN PER SENTENCE. Because the set of
-- sentences changes with the app, not with the church, and every one of them
-- has to keep working on a phone that has never reached Supabase. A row here
-- says "this slot reads differently now"; no row means the app draws what
-- shipped in the binary. So a slot that is retired in a later version leaves
-- behind a row nothing reads rather than a screen with a hole in it, and a
-- brand new install with no signal is unaffected by any of this.
--
-- WHAT IS DELIBERATELY NOT REACHABLE. Headings, button labels, tab names,
-- and anything the code compares against are not slots, and no amount of
-- flipping the switch will outline them: an editable button label is a
-- broken button one typo later. Neither are the nine Practices, for the same
-- reason as always, see the header of js/practices.js. Neither is anything
-- anybody wrote in the Journal or a group room, which is theirs. The app
-- decides that by which sentences it wraps; this table only stores what came
-- back.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0025 to have run first, it leans on hc_is_admin().
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. text_overrides
--
-- One row per sentence the church has rewritten. The slot is the primary key
-- and it is assigned by the app, in js/edit-mode.js, in the form
-- 'screen.what-it-is': 'give.note', 'listen.empty'. Naming it after the
-- screen and the role rather than after the words means the slot survives the
-- rewording, which is the entire point.
--
-- `value` is not null and may be empty, and those are different states on
-- purpose. No row at all means "the app's own words"; a row holding '' means
-- an admin deliberately cleared the line, and the app draws nothing. Losing
-- that distinction would make "take that sentence off the screen" impossible
-- to express, and it is a thing people want on a week when a note under a
-- button is no longer true.
--
-- THE LENGTH CAP IS NOT ARBITRARY. These are captions and short paragraphs
-- rendered into layouts built for captions and short paragraphs. 2000
-- characters is far more than any of them needs and far less than the wall of
-- text that turns one screen into an unscrollable mess for everybody at once.
-- A page that wants to be long is a content_pages row, which has sections and
-- a screen built to draw them.
-- ---------------------------------------------------------------------------

create table if not exists public.text_overrides (
  slot        text primary key,
  value       text not null,

  -- Who last changed it, so a sentence nobody remembers agreeing to has a
  -- name attached. Defaulted from the session rather than sent by the client,
  -- which is what stops it being a field somebody can put anything in. Null
  -- when the service role wrote the row, which is the Claude Code path and is
  -- honest about having no user behind it.
  updated_by  uuid references auth.users (id) on delete set null default auth.uid(),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Slots are assigned in code, so anything that does not look like one got
  -- here by accident or by hand.
  constraint text_overrides_slot_shape
    check (slot ~ '^[a-z0-9]+(\.[a-z0-9-]+)+$'),
  constraint text_overrides_value_length
    check (char_length(value) <= 2000)
);

comment on table public.text_overrides is
  'The church''s replacement for a sentence that ships inside the app, keyed by the slot the app assigns it. No row means the app draws its own words. Written from Edit mode, see js/edit-mode.js.';
comment on column public.text_overrides.slot is
  'screen.what-it-is, e.g. give.note. Assigned in code and named after the role of the sentence, not its words, so it survives a rewrite.';
comment on column public.text_overrides.value is
  'May be empty, which means the church took the line off the screen. That is different from no row, which means the app''s own words.';

drop trigger if exists text_overrides_set_updated_at on public.text_overrides;
create trigger text_overrides_set_updated_at
  before update on public.text_overrides
  for each row execute function public.hc_set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. Row level security on the new table
--
-- Read is open to the world, like every other content table, because the app
-- pulls this with the publishable key and no session: a signed out phone has
-- to see the same words as everybody else. There is no `published` column
-- here and there should not be. A half written caption is not a draft state
-- worth modelling, it is a reason to press Cancel.
--
-- Write is admins only, checked by hc_is_admin() from 0025, and named `to
-- authenticated` rather than `to anon, authenticated` for the belt and braces
-- reason 0026 gives: a signed out phone would already fail the function, and
-- naming the role means two independent things have to be wrong instead of
-- one.
-- ---------------------------------------------------------------------------

alter table public.text_overrides enable row level security;

drop policy if exists "text overrides are publicly readable" on public.text_overrides;
create policy "text overrides are publicly readable" on public.text_overrides
  for select to anon, authenticated using (true);

drop policy if exists "admins write text overrides" on public.text_overrides;
create policy "admins write text overrides" on public.text_overrides
  for insert to authenticated with check (public.hc_is_admin());

drop policy if exists "admins update text overrides" on public.text_overrides;
create policy "admins update text overrides" on public.text_overrides
  for update to authenticated
  using (public.hc_is_admin()) with check (public.hc_is_admin());

-- Delete is how "Reset to original" works: the row goes away and the app
-- falls back to the words in the binary. It is not a destructive act, which
-- is why it is offered as a button rather than behind a confirmation.
drop policy if exists "admins delete text overrides" on public.text_overrides;
create policy "admins delete text overrides" on public.text_overrides
  for delete to authenticated using (public.hc_is_admin());

grant select on public.text_overrides to anon, authenticated;
grant insert, update, delete on public.text_overrides to authenticated;
grant all on public.text_overrides to service_role;

/* THE REVOKE IS NOT REDUNDANT, and leaving it out is a mistake this project
   has already made once. A new table in the public schema on a Supabase
   project does not start closed: the project's default privileges hand anon
   and authenticated ALL privileges on it the moment it is created, so without
   this line a signed out phone holds INSERT, UPDATE and DELETE on the
   church's words and the only thing between it and them is RLS. RLS does hold
   here, because every write policy above names `authenticated` and anon
   matches none of them. This is the second lock, per 0001 section 8: two
   independent things now have to be wrong rather than one. */
revoke insert, update, delete on public.text_overrides from anon;


-- ---------------------------------------------------------------------------
-- 3. The prose that is already a row
--
-- Five tables that until now had exactly one writer, the service role, and
-- therefore no write policy at all. Edit mode needs a signed in admin to be
-- able to change the blurb on a next step from the Connect screen, so each
-- one gains a policy and a privilege.
--
-- COLUMN LEVEL GRANTS, WHICH ARE NEW IN THIS PROJECT AND ARE THE POINT.
-- `grant update (blurb)` rather than `grant update`. RLS decides which rows a
-- statement may touch; it has nothing to say about which columns, so a policy
-- alone would let a phone holding an admin session PATCH signup_url, or
-- published, or the church's giving link. Edit mode is a way to fix a
-- sentence, and this is what makes that sentence the only thing it can reach.
-- An UPDATE naming any other column is refused by Postgres with 42501 before
-- a policy is ever consulted.
--
-- The service role is unaffected by all of it and still writes every column,
-- so the publishing scripts and the slash commands do not change.
--
-- WHAT THIS COSTS, said plainly. Before this migration these five tables were
-- protected twice over: RLS with no write policy, AND no write privilege for
-- authenticated at all. Six columns now have the privilege, so for those six,
-- RLS is the only thing narrowing "any signed in person" to "an admin". That
-- is the same single layer 0026 accepted for announcements and content pages
-- and it is the price of editing from a phone. It is also why a member's
-- UPDATE here does not raise: RLS filters the rows rather than refusing the
-- statement, so a member writing a blurb succeeds and changes nothing, which
-- is what the test file asserts.
--
-- NOTE ON church_profile. 0006 marked this table neverEmpty in the app
-- because four screens dereference it, and nothing here changes that: the
-- grant is on two prose columns, the tagline and the serve signup blurb.
-- The address, the service times and the giving URL are not sentences and are
-- not reachable from Edit mode.
-- ---------------------------------------------------------------------------

do $$
declare
  spec record;
  t    text;
begin
  for spec in
    select * from (values
      ('serve_teams',    'blurb'),
      ('next_steps',     'blurb'),
      ('podcast_show',   'blurb'),
      ('events',         'description'),
      ('church_profile', 'tagline'),
      ('church_profile', 'serve_signup_blurb'),
      -- The sentence Connect draws in place of the whole group finder between
      -- seasons, which is a sentence about a season and therefore wrong twice
      -- a year by construction. The boolean beside it, groups_in_season, is
      -- not granted: that one takes the finder down for the whole church and
      -- is a decision, not a wording.
      ('church_profile', 'groups_off_season_note')
    ) as v(tbl, col)
  loop
    -- Skip a table or a column a project has not migrated to yet rather than
    -- failing the whole file. serve_signup_blurb arrived in 0007, and a
    -- project running these in order has every one of these tables by 0008.
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = spec.tbl
         and column_name = spec.col
    ) then
      execute format('grant update (%I) on public.%I to authenticated', spec.col, spec.tbl);
    end if;
  end loop;

  foreach t in array array['serve_teams', 'next_steps', 'podcast_show',
                           'events', 'church_profile']
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

do $$
declare
  t text;
begin
  foreach t in array array['serve_teams', 'next_steps']
  loop
    continue when to_regclass('public.' || t) is null;
    execute format($c$comment on column public.%I.blurb is %L$c$, t,
      'Editable in place from Edit mode as well as from the publishing ' ||
      'scripts. See migration 0030 section 3.');
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. What Edit mode itself is, and where it is not
--
-- There is deliberately no `edit_mode_on` row in app_settings, and this
-- section exists to say why, because its absence looks like an oversight.
--
-- Edit mode is not a property of the church, it is a property of the phone in
-- somebody's hand for the next half hour. It turns itself off when the app is
-- closed and after thirty minutes of nobody touching anything, which is a
-- promise only the device can keep. A row in app_settings would be a
-- statement about every admin's phone at once, would survive the app being
-- closed by definition, and would sit there reading `true` long after the
-- session it described had ended. The switch is drawn on the Admin screen,
-- the state behind it lives in js/edit-mode.js, and nothing about it is
-- written down anywhere.
--
-- What is written down is every sentence it changed, in this table, with a
-- name and a timestamp on it.
-- ---------------------------------------------------------------------------
