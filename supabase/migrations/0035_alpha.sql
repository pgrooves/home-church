-- ===========================================================================
-- Home Church, Alpha
--
-- WHAT THIS IS FOR. There is a new screen behind •••, js/screens/alpha.js,
-- which is a single page on what Alpha is and a button at the bottom that
-- takes a signup. Everything on that page is written in the source file or in
-- text_overrides already. Three things about it are not, because all three
-- change on the church's calendar rather than on the app's:
--
--   whether Alpha is running at all right now
--   where a signup goes this season
--   what the page says when it is not running
--
-- WHY THIS IS THE SAME SHAPE AS GROUPS. 0007 gave church_profile
-- groups_in_season and groups_off_season_note for exactly this problem on the
-- Connect tab, and the reasoning there holds word for word here: a signup
-- button standing over a registration that closed in March is worse than no
-- button, and it is the failure this page walks into on its own, quietly, the
-- first season nobody thinks about it. One boolean, flipped twice a year, is
-- cheaper than remembering to unpublish something.
--
-- WHY THE URL IS A COLUMN AND NOT A CONSTANT. A Church Center registration is
-- a registration for one specific run of Alpha, and its number changes every
-- time a new one opens. The number that ships inside the app is right on the
-- day it ships and wrong a year later, and an app binary is an App Store
-- review away from being fixed. This column is the answer that can change on
-- a Tuesday.
--
-- THE OTHER PLACE THIS URL LIVES, said out loud so nobody discovers it the
-- hard way: next_steps.step-alpha carries the same registration, because "I
-- have questions about faith" on the Connect tab is a different invitation to
-- the same room and has its own row, its own title and its own button label.
-- Two rows, one destination, and when the season turns both want changing.
-- They are not resolved through one another on purpose: a next step is one
-- line in a list a church curates and may retire, and the Alpha screen's only
-- button must not disappear because somebody tidied that list.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
--   Needs 0006 (church_profile) and 0007 (the group season columns it copies).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The three columns
--
-- alpha_in_season defaults true, and the default is a decision rather than a
-- shrug. A church that has not touched this column is far more likely to be
-- running Alpha than to be between seasons, and hiding a live signup is the
-- worse of the two mistakes. js/content.js reads a missing column the same
-- way, `r.alpha_in_season !== false`, so the app and the schema agree about
-- what silence means.
-- ---------------------------------------------------------------------------

alter table public.church_profile
  add column if not exists alpha_in_season       boolean not null default true,
  add column if not exists alpha_signup_url      text,
  add column if not exists alpha_off_season_note text;

comment on column public.church_profile.alpha_in_season is
  'False between runs of Alpha. Takes the signup button off the Alpha screen entirely and shows alpha_off_season_note in its place. Flip it the day a registration closes, not the day somebody notices.';
comment on column public.church_profile.alpha_signup_url is
  'Where the button at the bottom of the Alpha screen goes. A Church Center registration, and a different one every season. Null falls back to the url that shipped inside the app, which is last season''s.';
comment on column public.church_profile.alpha_off_season_note is
  'What the Alpha screen says while alpha_in_season is false. Warm, and honest that it is coming back.';


-- ---------------------------------------------------------------------------
-- 2. Fill them in
--
-- The registration below is the one that is open as this ships, and it is the
-- same one next_steps.step-alpha already points at. The between seasons note
-- is the group one from 0007 with the noun changed, deliberately: a person
-- who has read one of these should recognise the other, and this church says
-- the same thing about a season either way.
--
-- `where published` for the same reason 0007 uses it: church_profile holds one
-- live row and this must not write over a draft sitting beside it.
--
-- GUARDED ON STILL BEING EMPTY, which is the difference between this and the
-- unconditional update 0007 does, and it is not fussiness. 0007 writes a
-- number and a keyword that do not change; this writes a registration that
-- closes and a switch somebody turns off the day it does. An unconditional
-- update here means that re-running this file next spring, which every
-- migration in this project promises is safe, puts a closed registration back
-- on the screen and turns the season back on underneath it. So this seeds an
-- empty column and never argues with an answer somebody has since given.
--
-- alpha_in_season is not in the update at all. The column default has already
-- said true for every row that existed, which is the seed; saying it a second
-- time here is the exact statement that would undo a closed season on a
-- re-run. 0026 makes the same choice with `on conflict do nothing` on its
-- three settings, for the same reason.
-- ---------------------------------------------------------------------------

update public.church_profile
   set alpha_signup_url = 'https://homechurchnola.churchcenter.com/registrations/events/3798127'
 where published
   and (alpha_signup_url is null or alpha_signup_url = '');

update public.church_profile
   set alpha_off_season_note = 'Alpha is between seasons right now. When the next one opens this is where you will find it, and we will make sure you hear about it before it fills up.'
 where published
   and (alpha_off_season_note is null or alpha_off_season_note = '');


-- ---------------------------------------------------------------------------
-- 3. Policies and grants: nothing to do
--
-- Said out loud so nobody goes looking for the section that is missing, the
-- same way 0028 section 3 and 0033 section 4 do.
--
-- Reads are row level. The public select policy from 0006 hands the whole
-- church_profile row to anon and authenticated, and a new column arrives with
-- it. Writes stay with the service role, which is where every column on this
-- table already sits.
--
-- EDIT MODE GETS ONE OF THE THREE, and only one. 0031 grants an admin column
-- level update on the handful of sentences the app lets somebody rewrite
-- where they are reading them, and alpha_off_season_note belongs in that set
-- for the same reason groups_off_season_note does: it is a paragraph on a
-- screen, it goes stale, and it is exactly what a pencil beside it is for.
--
-- The other two do not. alpha_in_season is a decision, not a sentence, and
-- the app's rule for a switch is that it never moves from inside a text box:
-- 0030 section 4 draws that line for the banner and it is the same line here.
-- alpha_signup_url is a destination, and a URL typed into a textarea over a
-- paragraph is how a button ends up pointing somewhere nobody checked. Both
-- change from the Supabase dashboard, deliberately.
-- ---------------------------------------------------------------------------

-- Same plain form 0032 uses for reading_plans.weeks, and for the same reason
-- it is here rather than back in 0031: a later migration that opens a column
-- grants it where it adds it, which is where the argument for opening it
-- belongs. tests/edit-mode.test.js reads every migration in this folder for
-- exactly this line and asserts it against the ALLOWED list in
-- js/edit-mode.js, in both directions, so the two cannot drift.
--
-- Additive and repeatable: granting a privilege already held is a no-op, which
-- is what keeps this file safe to run twice. The UPDATE policy 0031 created on
-- church_profile already covers the row half, so there is no second policy.

grant update (alpha_off_season_note) on public.church_profile to authenticated;
