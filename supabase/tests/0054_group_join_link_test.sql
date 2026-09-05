-- ===========================================================================
-- The way into a group, as a link of its own.
--
-- WHAT IS WORTH TESTING HERE, and none of it is that a column exists.
--
--   the length      The link this church actually posts is 355 characters of
--                   query string. It is the reason this migration exists —
--                   it could not fit in the 300 character paragraph the old
--                   version made it live in — so it is stored here whole and
--                   read back whole. A ceiling added later "to be tidy" would
--                   break the feature again in a new place, silently.
--
--   the scheme      This column ends up as the href of a button on a public
--                   screen, handed to the phone's browser. `javascript:` is
--                   not a destination, and refusing it in the database is the
--                   half of that promise a phone cannot get around.
--
--   the whole card  0054 replaced hc_admin_set_group_note with a four
--                   argument version and dropped the two argument one, so
--                   that "the caller said nothing about the button" can never
--                   be read as "take the button off". Both halves are
--                   asserted: the new one is there, and the old one is gone.
--
--   the season      A season that ends takes its button with it. A live
--                   "Join a group" under a paragraph saying groups are back
--                   in the spring is the contradiction 0049 was written to
--                   end, except this one takes people to a closed form.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function t_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  %', label;
  else raise warning 'FAIL  %  (got %, want %)', label, got, want; end if;
end;
$$;

insert into auth.users (id, email) values
  ('ee000000-0000-0000-0000-000000000001', 'ladmin@example.com'),
  ('ee000000-0000-0000-0000-000000000002', 'lmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ee000000-0000-0000-0000-000000000001', 'Ada'),
  ('ee000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ee000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ee000000-0000-0000-0000-000000000002';

update public.church_profile
   set groups_in_season = false,
       groups_note_in_season = false,
       groups_note_image_url = null,
       groups_note_link_url = null,
       groups_note_link_label = null,
       groups_off_season_note = 'Home groups are between seasons right now.',
       groups_between_seasons_note = 'Home groups are between seasons right now.'
 where published;

-- --------------------------------------------------------------- the shape ---

select t_check('the card carries a way in of its own',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'church_profile'
      and column_name in ('groups_note_link_url', 'groups_note_link_label')), 2);

select t_check('and the run log remembers the button on both sides of a run',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'group_status_runs'
      and column_name in ('previous_link_url', 'previous_link_label',
                          'new_link_url', 'new_link_label')), 4);

-- -------------------------------------------------------------- the grants ---

select t_check('the two argument version of the save is gone',
  (select count(*)::int from pg_proc
    where proname = 'hc_admin_set_group_note' and pronargs = 2), 0);

select t_check('and the one that writes the whole card is here',
  (select count(*)::int from pg_proc
    where proname = 'hc_admin_set_group_note' and pronargs = 4), 1);

select t_check('anon cannot write the card',
  has_function_privilege('anon',
    'public.hc_admin_set_group_note(text, text, text, text)', 'EXECUTE'), false);

select t_check('authenticated can, and hc_is_admin narrows that inside',
  has_function_privilege('authenticated',
    'public.hc_admin_set_group_note(text, text, text, text)', 'EXECUTE'), true);

/* The button is a URL, and 0031 keeps phone-writable columns to prose for
   exactly this reason: a column grant here would let any admin session point
   the card at anywhere on the internet without passing the check below. */
select t_check('no client role may write the button''s columns directly',
  (select bool_or(has_column_privilege(r.role, 'public.church_profile',
                                       c.col, 'UPDATE'))
     from unnest(array['anon', 'authenticated']) as r(role),
          unnest(array['groups_note_link_url', 'groups_note_link_label']) as c(col)),
  false);

-- ------------------------------------------------------------- as a member ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_set_group_note('Groups are open.', null,
    'https://example.com/groups', 'Join a group');
  raise warning 'FAIL  a member cannot write the home groups card';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot write the home groups card';
end
$$;

reset role;

-- -------------------------------------------------------------- as an admin ---
-- The real link, character for character. This is the one the church posted in
-- September and the one every earlier version of this feature choked on.

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note(
    'Find your people and claim your spot. Over 100 spots are open across 19 groups.',
    null,
    'https://homechurchnola.groupvitals.com/groupFinder?childcare-check=&group-location-check=&group-type%5B%5D=all&groupmodel-check=&grouptopic-check=&grouptype-check=&lifestage-check=&meeting-day%5B%5D=all&meeting-location%5B%5D=all&meeting-time=all&meetingday-check=&meetingtime-check=&timezone-check=&tld=.com%2FgroupFinder%3Fcampus-check%3D&view_type=list',
    'JOIN A GROUP');
end
$$;

reset role;

select t_check('a 355 character group finder link is stored whole',
  (select length(groups_note_link_url)
     from public.church_profile where id = 'church-home'), 355);

select t_check('and the church''s own words are on the button',
  (select groups_note_link_label
     from public.church_profile where id = 'church-home'), 'JOIN A GROUP');

-- A link with no words takes the fallback rather than being drawn wordless.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note('Groups are open.', null,
    'https://example.com/groups', '   ');
end
$$;

reset role;

select t_check('a button with no words says the obvious thing',
  (select groups_note_link_label
     from public.church_profile where id = 'church-home'), 'Join a group');

-- And words with nowhere to go are not a state the card can draw, so they are
-- not a state it can be left in either.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note('Groups are open.', null, '', 'Join a group');
end
$$;

reset role;

select t_check('a label with nothing to point at is not kept',
  (select groups_note_link_label is null and groups_note_link_url is null
     from public.church_profile where id = 'church-home'), true);

-- ------------------------------------------------------------- the scheme ---
-- The half of the promise a phone cannot get around. js/screens/connect.js
-- refuses to draw one of these too; this is what stops it being stored.

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note('Groups are open.', null,
    'javascript:alert(1)', 'Join a group');
  raise warning 'FAIL  a scheme that is not the web is refused';
exception when others then
  raise notice 'PASS  a scheme that is not the web is refused';
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note('Groups are open.', null,
    'homechurchnola.com/groups', 'Join a group');
  raise warning 'FAIL  a bare host somebody typed is refused';
exception when others then
  raise notice 'PASS  a bare host somebody typed is refused';
end
$$;

reset role;

select t_check('and nothing was written by either of those',
  (select groups_note_link_url is null
     from public.church_profile where id = 'church-home'), true);

-- ------------------------------------------------------ a season that ends ---

/* The season flag goes on FIRST, and the order is the point rather than
   housekeeping. 0049's trigger copies the card's words into the evergreen
   sentence on every write made while the card is NOT in season, so a card
   written before the flag is set would quietly become the sentence that comes
   back at the end of the season. That is the trigger doing its job; it just
   means the season has to start before this season's words are written, which
   is also the order the Edge Function writes them in — one update carrying
   both. */
update public.church_profile
   set groups_note_in_season = true,
       groups_between_seasons_note = 'Home groups are between seasons right now.'
 where published;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_set_group_note(
    'Groups open this Sunday.',
    'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/2026-09/flyer.jpg',
    'https://example.com/groups', 'Join a group');
end
$$;

reset role;

select t_check('mid-season the card carries all four parts',
  (select groups_note_in_season and groups_note_link_url = 'https://example.com/groups'
     and groups_note_image_url is not null and groups_off_season_note = 'Groups open this Sunday.'
     from public.church_profile where id = 'church-home'), true);

select t_check('and the sentence underneath is untouched by any of it',
  (select groups_between_seasons_note from public.church_profile where id = 'church-home'),
  'Home groups are between seasons right now.');

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_end_group_season();
end
$$;

reset role;

select t_check('ending a season takes the button down with the flyer',
  (select groups_note_link_url is null and groups_note_link_label is null
     and groups_note_image_url is null
     from public.church_profile where id = 'church-home'), true);

select t_check('and the words that come back are the church''s own',
  (select groups_off_season_note from public.church_profile where id = 'church-home'),
  'Home groups are between seasons right now.');

-- THE ONE THAT MATTERS MOST, and it is asserted in every file that touches
-- this card: nothing here may flip the switch that draws the finder, because
-- the rows behind it are still the placeholders from 0008.
select t_check('and none of it touched the season switch that draws the finder',
  (select groups_in_season from public.church_profile where id = 'church-home'), false);
