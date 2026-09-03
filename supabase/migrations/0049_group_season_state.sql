-- ===========================================================================
-- Home Church, the home groups box knows which season it is in
--
-- WHAT 0048 LEFT HALF DONE. The button shortens the church's most recent home
-- groups announcement into the box on Connect, and the box draws it under the
-- words "Between seasons". So the week groups open, that card says how to join
-- a group underneath a label saying there are none. The words were current and
-- the heading over them was not.
--
-- So the parse now answers a second question — is this announcement saying
-- groups are ON or that they have finished — and the card says the same thing
-- its words do. And because a season ends as well as starts, there is a button
-- that puts the whole card back to how it reads between seasons.
--
-- THE THING THIS DELIBERATELY DOES NOT TOUCH, and it is the one that would
-- look like the obvious column to use: `groups_in_season`, from 0007. That
-- boolean does something much bigger than a label. False hides the group
-- finder and shows this paragraph; true takes the paragraph away and draws the
-- finder, filter chips and all, from the `groups` table — which still holds
-- the four placeholder rows with invented hosts that 0008 left there. Flipping
-- it from a parse would publish four fictional home groups on a Sunday
-- morning. It would also put back the notification switch that LAUNCH_TODO
-- gates on that same boolean, the one with no group picker behind it.
--
-- `groups_note_in_season` below is therefore a fact about the CARD and not
-- about the season: which of its two faces it is wearing. The season switch
-- stays where it is, flipped by a person who has real groups to show.
--
-- WHY THE BETWEEN SEASONS SENTENCE NEEDS A COLUMN OF ITS OWN. Because putting
-- the card back has to put something back, and until now the only copy of
-- those words was the card itself — which the button overwrites the first time
-- it runs. Keeping the evergreen sentence beside the live one is what makes
-- "back to between seasons" a restore rather than a blank.
--
-- And it is kept in step by a trigger rather than by remembering to write it
-- twice. Whatever the card says while it is NOT in season is, by definition,
-- what it says between seasons — including a wording somebody fixed in place
-- with Edit mode on the Connect tab, which never goes near a function this
-- migration wrote. Section 3.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0007, 0025 (hc_is_admin) and 0048. Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The two columns
--
-- `groups_note_in_season` defaults false, and the default is a decision. A
-- church that has not run this yet is a church whose card says what it has
-- always said, and reading a missing column as "in season" would put "Open
-- now" over the between-seasons sentence on every phone at once. The app reads
-- it the same defensive way, `r.groups_note_in_season === true`, so the schema
-- and the client agree about what missing means.
--
-- `groups_between_seasons_note` is seeded from whatever the card says today,
-- which for this church is the sentence 0007 wrote. That is the correct seed
-- by construction: today the card is between seasons, so today's words are the
-- between-seasons words.
-- ---------------------------------------------------------------------------

alter table public.church_profile
  add column if not exists groups_note_in_season       boolean not null default false,
  add column if not exists groups_between_seasons_note text;

comment on column public.church_profile.groups_note_in_season is
  'Which face the home groups card on Connect is wearing: true while it carries a current announcement about groups being open, false while it carries the between seasons sentence. NOT the season switch — that is groups_in_season, which decides whether the finder is drawn at all. See migration 0049.';
comment on column public.church_profile.groups_between_seasons_note is
  'What the home groups card says when there is nothing running: the sentence hc_admin_end_group_season puts back. Kept in step with the live note by a trigger whenever the card is not in season, so a wording fixed in Edit mode is the wording that comes back.';

update public.church_profile
   set groups_between_seasons_note = groups_off_season_note
 where groups_between_seasons_note is null;


-- ---------------------------------------------------------------------------
-- 2. What the two notes are for, said once
--
-- groups_off_season_note is now "what the card says", whichever season it is
-- in. The name is from 0007 and is left alone on purpose: it is granted to
-- `authenticated` by 0031, named in the ALLOWLIST in js/edit-mode.js, read by
-- js/content.js, seeded in js/data.js and asserted in three test files.
-- Renaming a column to improve a noun is how a paragraph disappears off a
-- screen on a Sunday.
-- ---------------------------------------------------------------------------

comment on column public.church_profile.groups_off_season_note is
  'What the home groups card on Connect says today: the between seasons sentence, or the current announcement shortened into it by the button from 0048. Editable in place with Edit mode, which is why it keeps its 0031 grant.';


-- ---------------------------------------------------------------------------
-- 3. Keeping the evergreen sentence in step
--
-- WHY A TRIGGER AND NOT A SECOND WRITE IN EACH FUNCTION. Because there are
-- three doors onto this column and only two of them are functions this project
-- controls. The third is Edit mode: a long press on the paragraph on Connect
-- PATCHes the column straight from the phone, under the narrow grant 0030 and
-- 0031 built, and no function of ours is involved at all. A rule that lives in
-- the functions would be a rule that a fix typed on the Connect tab quietly
-- escapes, and the wording would come back wrong a season later — the exact
-- shape of bug nobody reports because nobody remembers what it used to say.
--
-- The condition is the whole rule: while the card is not in season, whatever
-- it says IS the between seasons sentence. While it is in season, this does
-- nothing at all, so the shortened announcement never overwrites the words it
-- is meant to be temporarily standing in for.
-- ---------------------------------------------------------------------------

create or replace function public.hc_sync_between_seasons_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.groups_note_in_season, false) = false
     and new.groups_off_season_note is distinct from old.groups_off_season_note then
    new.groups_between_seasons_note := new.groups_off_season_note;
  end if;
  return new;
end;
$$;

comment on function public.hc_sync_between_seasons_note() is
  'Keeps groups_between_seasons_note equal to the card''s words whenever the card is not in season, so the sentence that comes back is the one that was last true. See migration 0049 section 3.';

drop trigger if exists church_profile_sync_between_seasons on public.church_profile;

create trigger church_profile_sync_between_seasons
  before update on public.church_profile
  for each row execute function public.hc_sync_between_seasons_note();


-- ---------------------------------------------------------------------------
-- 4. Ending the season
--
-- One function, one act: the card goes back to the between seasons sentence,
-- the flyer for a season that is over comes off, and the label above it stops
-- saying groups are open. Doing that as three PATCHes from a phone is three
-- ways to end up with a poster over a sentence that contradicts it.
--
-- IT IS NOT A TOGGLE AND IT DOES NOT TAKE THE WORDS AS AN ARGUMENT. Both are
-- deliberate. The words come from the column, so the button can never write a
-- sentence somebody has not already agreed to; and marking the card in season
-- by hand is not a thing anybody needs, because the only way a card should
-- claim groups are open is that the church posted an announcement saying so.
-- That path is the button from 0048.
--
-- Safe to press twice. A card already between seasons is set to what it
-- already says, which is why this returns void rather than pretending to
-- report a change.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_end_group_season()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  update public.church_profile
     set groups_note_in_season = false,
         groups_off_season_note = coalesce(groups_between_seasons_note, groups_off_season_note),
         groups_note_image_url = null
   where published;
end;
$$;

revoke all on function public.hc_admin_end_group_season() from public, anon, authenticated;
grant execute on function public.hc_admin_end_group_season() to authenticated;

comment on function public.hc_admin_end_group_season() is
  'Puts the home groups card on Connect back to the way it reads between seasons: the evergreen sentence, no flyer, and the label to match. Admins only, checked inside. Takes no arguments, so it can only ever write words the church has already published. See migration 0049.';


-- ---------------------------------------------------------------------------
-- 5. The run log remembers which way it went
--
-- So the line under the button can say "and marked groups as in season", which
-- is the difference between a run that changed a paragraph and one that
-- changed what the card claims. Null on every row written before this ran, and
-- on any run that wrote nothing.
-- ---------------------------------------------------------------------------

alter table public.group_status_runs
  add column if not exists in_season boolean;

comment on column public.group_status_runs.in_season is
  'What the parse concluded about the season from the announcement it read: true for one saying groups are open or opening, false for one saying a season has finished. Null when the run wrote nothing.';


-- ---------------------------------------------------------------------------
-- 6. What the advisor will say, and why it is fine
--
-- 0039_authenticated_security_definer_function_executable on
-- hc_admin_end_group_season, the same note 0048 section 6 and 0039 section 2
-- already record: in this project a SECURITY DEFINER function IS the
-- permission boundary, and the advisor can see the grant but not the
-- hc_is_admin() check on the first line.
--
-- hc_sync_between_seasons_note is SECURITY DEFINER with a pinned search_path
-- for the reason 0011 sets out, and it is not granted to anybody: a trigger
-- function is called by the table, not by a session, and it can only ever copy
-- one column of the row being written to another column of the same row.
-- ---------------------------------------------------------------------------
