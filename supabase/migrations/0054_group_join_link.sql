-- ===========================================================================
-- Home Church, the way into a group is a button and not a sentence
--
-- WHAT THIS ADDS. Two columns on church_profile, so the home groups card on
-- Connect can carry the link people tap to join a group as a link of its own:
--
--   groups_note_link_url     where it goes
--   groups_note_link_label   what the button says, "Join a group" by default
--
-- Connect draws it across the bottom of the card, under the words and under
-- the flyer, centred. That is where a thumb looks for the one thing a card is
-- asking it to do, and it is the same place every other card in this app puts
-- its action.
--
-- WHY IT IS NOT JUST LEFT IN THE PARAGRAPH, which is where 0048 put it. Two
-- reasons, and the second one is why this migration exists at all rather than
-- being a change to a stylesheet.
--
--   A URL IS NOT PROSE. The shortened note is read aloud in a person's head.
--   An address sitting in the middle of it is a thing to squint at, and one at
--   the end is a sentence that stops mid-thought. Nobody types one off a phone
--   screen; they tap.
--
--   AND IT DID NOT FIT. The link on the announcement this church posted in
--   September is a group finder URL with eleven query parameters and 380
--   characters in it. The note it has to survive into holds 300. So every run
--   of the button either dropped it and was refused by the check that exists
--   to stop exactly that, or spent the model's whole output budget spelling it
--   out and came back as `Unterminated string in JSON at position 395` — which
--   is what an admin actually read, twice, on the Admin screen. A link the app
--   copies out of the announcement row itself cannot be mistyped, cannot be
--   truncated, and costs the model nothing to choose: it answers with a
--   number. See supabase/functions/group-status/index.ts.
--
-- WHY THE LABEL IS A COLUMN AND NOT A CONSTANT. Because the church writes it.
-- "JOIN A GROUP" is what the September announcement's own button says, and a
-- card that says the same words as the email it came from is a card people
-- recognise. The fallback when there are no words to take is "Join a group".
--
-- WHAT THIS DOES NOT TOUCH, and the answer is the same as it was in 0048 and
-- 0049: `groups_in_season`, the boolean that draws the group finder out of the
-- `groups` table, which still holds the placeholder rows 0008 left there.
-- Nothing in this file goes near it.
--
-- RUN THIS FIRST AND DEPLOY THE FUNCTION SECOND, which is the opposite of the
-- order 0050 asked for and the order matters both times. 0050 changed a URL
-- the database posts to, so the function had to exist before anything pointed
-- at it. This adds columns the function writes: a group-status deployed ahead
-- of these would fail on its own update, log a run row into columns that are
-- not there either, and leave the button on the Admin screen spinning until it
-- gave up. The other way round nothing breaks — the columns simply sit there,
-- null, until the deploy lands:
--
--   1. this file, in the SQL editor
--   2. supabase functions deploy group-status --no-verify-jwt
--   3. Settings -> Admin -> Announcements -> Update from the latest announcement
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0048, 0049 and 0050. Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The columns
--
-- Both nullable, and null is the ordinary state: most of the year the card is
-- a sentence about a season that has not started and there is nothing to tap.
-- Connect draws no button at all rather than a dead one.
--
-- The URL is not length-capped and the label is. A group finder link with
-- eleven query parameters on it is a real URL that this church really posts,
-- and refusing it here is how the feature breaks again in a different place.
-- A label longer than a phrase is a model writing a sentence where a button
-- goes, and it wraps onto three lines on a phone.
-- ---------------------------------------------------------------------------

alter table public.church_profile
  add column if not exists groups_note_link_url   text,
  add column if not exists groups_note_link_label text;

comment on column public.church_profile.groups_note_link_url is
  'Where the button under the home groups card on Connect goes: the link people tap to join or sign up for a group. Copied character for character out of the announcement the card was shortened from, never retyped by the model. Null draws no button, which is the ordinary state between seasons. See migration 0054.';
comment on column public.church_profile.groups_note_link_label is
  'What that button says. Taken from the church''s own words in the announcement when it has any ("JOIN A GROUP"), and "Join a group" when it does not. Ignored when the URL beside it is null.';


-- ---------------------------------------------------------------------------
-- 2. The run log remembers the button too
--
-- Same reasoning as previous_image in 0048 and for the same failure: an undo
-- that puts the words back and leaves the button pointing at last season's
-- sign-up form is half an undo, and the half it left behind is the half that
-- takes somebody somewhere wrong.
-- ---------------------------------------------------------------------------

alter table public.group_status_runs
  add column if not exists previous_link_url   text,
  add column if not exists previous_link_label text,
  add column if not exists new_link_url        text,
  add column if not exists new_link_label      text;

comment on column public.group_status_runs.previous_link_url is
  'The button under the card before this run wrote over it, so Put back what it said before puts back all of it. Null when there was none, which is its own state and not the same as unknown.';
comment on column public.group_status_runs.new_link_url is
  'Where the button points after this run. Null on a run that wrote nothing, and also on one that found an announcement with no way in — an announcement can be about home groups and offer only a flyer.';


-- ---------------------------------------------------------------------------
-- 3. Saving all four together
--
-- 0048's function wrote the words and the flyer in one call, for the reason
-- 0040 gives about announcements and events: a picture saved without the words
-- that explain it, because the second PATCH failed on a bad connection, is a
-- screen nobody meant to publish. A button is the same argument with a sharper
-- edge — it is the one part of this card that takes somebody somewhere else.
--
-- THE OLD TWO ARGUMENT SIGNATURE IS DROPPED RATHER THAN LEFT BESIDE THIS ONE,
-- and it is worth saying why, because the tempting alternative is to give the
-- two new parameters defaults and keep both doors open.
--
-- The two doors would be the same door. PostgREST resolves an RPC by the
-- argument names in the body, so a phone still running the JavaScript from
-- before this shipped — an admin whose app has not reloaded yet — would send
-- {p_note, p_image_url}, land in this function, and take the defaults for the
-- other two. The default for "a parameter that was not sent" and the default
-- for "take the button off" cannot be told apart, so the save would silently
-- delete a link nobody asked it to touch, and the person would not find out
-- until somebody on Connect had nowhere to tap.
--
-- With the old signature gone, that same stale phone gets a 404 naming a
-- function it cannot find. That is a bad half-second and a reload fixes it,
-- which is a much better trade than a link quietly disappearing off a public
-- screen. Nothing else in the project calls this function.
--
-- No parameter here has a default, for the same reason: every caller says what
-- it means about all four, including "none".
-- ---------------------------------------------------------------------------

drop function if exists public.hc_admin_set_group_note(text, text);

create or replace function public.hc_admin_set_group_note(
  p_note       text,
  p_image_url  text,
  p_link_url   text,
  p_link_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_image text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_link  text := nullif(btrim(coalesce(p_link_url, '')), '');
  v_label text := nullif(btrim(coalesce(p_link_label, '')), '');
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  -- The same ceiling text_overrides carries in 0030, and for the same reason:
  -- this is a paragraph in a layout built for a paragraph.
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'That note is longer than the box can hold. 2000 characters is the ceiling.';
  end if;

  /* Ours or nothing. The prefix is this project's public storage, so an
     uploaded flyer passes and a link somebody pasted from an email does not.
     Said as a sentence because an admin will read it in a toast. */
  if v_image is not null
     and v_image not like 'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/%' then
    raise exception 'That picture has to be one uploaded here, not a link to somewhere else.';
  end if;

  /* The button, and the check is a different one from the flyer's on purpose.
     A flyer has to be ours because we are publishing a picture; a way into a
     group is by definition somewhere else — Group Vitals, Church Center, a
     Google form — and an allowlist of hosts would be a list somebody has to
     remember to add to on a Sunday morning. What is refused is a scheme that
     is not a web address, because the app hands this to the phone's browser
     and `javascript:` is not a destination.

     Web addresses only, and the app agrees: js/screens/connect.js draws a
     button only for http and https, so a row that somehow held anything else
     would draw nothing rather than something worse. */
  if v_link is not null and v_link !~* '^https?://[^[:space:]]+$' then
    raise exception 'That link has to be a web address starting with http:// or https://.';
  end if;

  if v_label is not null and length(v_label) > 40 then
    raise exception 'That is a sentence, not a button. Keep it under 40 characters.';
  end if;

  update public.church_profile
     set groups_off_season_note = v_note,
         groups_note_image_url  = v_image,
         groups_note_link_url   = v_link,
         /* A label with nothing to point at is not a state the card can draw,
            and one left over from a link that has been taken off is how a
            button comes back next season saying the wrong thing. */
         groups_note_link_label = case when v_link is null then null
                                       else coalesce(v_label, 'Join a group') end
   where published;
end;
$$;

revoke all on function public.hc_admin_set_group_note(text, text, text, text) from public, anon, authenticated;
grant execute on function public.hc_admin_set_group_note(text, text, text, text) to authenticated;

comment on function public.hc_admin_set_group_note(text, text, text, text) is
  'Writes the home groups card on Connect whole: the paragraph, the flyer above it and the button under it. Admins only, checked inside. The image must be an upload in this project''s announcements bucket; the link must be an http or https address. See migrations 0048 and 0054.';


-- ---------------------------------------------------------------------------
-- 4. A season that ends takes its button with it
--
-- 0049's function put the card back to the between seasons sentence and took
-- the flyer off. It now takes the button off too, and that is the whole of the
-- change: a live "Join a group" under a paragraph saying groups are not
-- running until the spring is the same contradiction 0049 was written to end,
-- except that this one takes people to a sign-up form for a season that is
-- over.
--
-- Reproduced whole rather than patched, the same way 0050 reproduced the
-- button: `create or replace function` has no patch, and two files that can be
-- read side by side are worth the repetition.
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
         groups_note_image_url = null,
         groups_note_link_url = null,
         groups_note_link_label = null
   where published;
end;
$$;

revoke all on function public.hc_admin_end_group_season() from public, anon, authenticated;
grant execute on function public.hc_admin_end_group_season() to authenticated;

comment on function public.hc_admin_end_group_season() is
  'Puts the home groups card on Connect back to the way it reads between seasons: the evergreen sentence, no flyer, no button, and the label to match. Admins only, checked inside. Takes no arguments, so it can only ever write words the church has already published. See migrations 0049 and 0054.';


-- ---------------------------------------------------------------------------
-- 5. What the advisor will say, and why it is fine
--
-- 0039_authenticated_security_definer_function_executable on both functions,
-- which is the note 0025 section 6, 0039 section 2, 0048 section 6 and 0049
-- section 6 have all already recorded: in this project a SECURITY DEFINER
-- function IS the permission boundary, so the ones that matter are exactly the
-- ones that have to be callable, and the advisor can see the grant but not the
-- hc_is_admin() check on the first line of each.
--
-- 0011_function_search_path_mutable: not raised, both pin it.
-- ---------------------------------------------------------------------------
