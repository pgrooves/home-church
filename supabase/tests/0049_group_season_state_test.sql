-- ===========================================================================
-- Which season the home groups card thinks it is in.
--
-- WHAT IS WORTH TESTING. Three things, and the first one is the one that would
-- do real damage:
--
--   the blast radius  This migration adds a flag about a CARD. There is a
--                     boolean one column over, groups_in_season from 0007,
--                     that decides whether the Connect tab draws the group
--                     finder at all — from a table still holding the four
--                     placeholder groups 0008 left there. Nothing here may
--                     touch it. That is asserted rather than reviewed,
--                     because the two names are one word apart and the
--                     failure is four fictional home groups on a Sunday.
--
--   the restore       Ending a season has to put back the sentence the church
--                     last used, not the one that shipped in the app, and it
--                     has to take the flyer off with it. A season that ends
--                     leaving last season's poster over the between seasons
--                     sentence is the bug this button exists to avoid.
--
--   the trigger       Which is what keeps that sentence true. The card can be
--                     edited three ways — this migration's function, 0048's,
--                     and a long press on Connect that PATCHes the column
--                     directly under 0031's grant — and only the third one
--                     goes near no function of ours at all. So the trigger is
--                     tested as a plain UPDATE, which is what Edit mode sends.
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
  ('dd000000-0000-0000-0000-000000000001', 'sadmin@example.com'),
  ('dd000000-0000-0000-0000-000000000002', 'smember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('dd000000-0000-0000-0000-000000000001', 'Ada'),
  ('dd000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'dd000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'dd000000-0000-0000-0000-000000000002';

-- The state this church is actually in the day this ships: between seasons,
-- with the sentence 0007 wrote.
update public.church_profile
   set groups_in_season = false,
       groups_note_in_season = false,
       groups_note_image_url = null,
       groups_off_season_note = 'Home groups are between seasons right now.',
       groups_between_seasons_note = 'Home groups are between seasons right now.'
 where published;

-- --------------------------------------------------------------- the shape ---

select t_check('the card carries its own season flag',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'church_profile'
      and column_name in ('groups_note_in_season', 'groups_between_seasons_note')), 2);

select t_check('and it defaults to between seasons, not to open',
  (select column_default like '%false%' from information_schema.columns
    where table_schema = 'public' and table_name = 'church_profile'
      and column_name = 'groups_note_in_season'), true);

/* 0049 seeds the evergreen sentence from whatever the card said when it ran,
   which is the only correct seed: the card was between seasons, so its words
   were the between seasons words. */
select t_check('the evergreen sentence was seeded rather than left null',
  (select groups_between_seasons_note is not null
     from public.church_profile where id = 'church-home'), true);

select t_check('the run log remembers which way a parse went',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'group_status_runs'
      and column_name = 'in_season'), 1);

-- -------------------------------------------------------------- the grants ---

select t_check('anon cannot end a season',
  has_function_privilege('anon', 'public.hc_admin_end_group_season()', 'EXECUTE'), false);

select t_check('authenticated can, and hc_is_admin narrows that inside',
  has_function_privilege('authenticated', 'public.hc_admin_end_group_season()', 'EXECUTE'), true);

select t_check('no client role may write the card''s season flag directly',
  (select bool_or(has_column_privilege(r.role, 'public.church_profile',
                                       'groups_note_in_season', 'UPDATE'))
     from unnest(array['anon', 'authenticated']) as r(role)), false);

-- ------------------------------------------------------------- as a member ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_end_group_season();
  raise warning 'FAIL  a member cannot end a season';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot end a season';
end
$$;

reset role;

-- ------------------------------------------------------------ a season on ---
-- What the button in 0048 does when the parse says groups are open: the words
-- and the flag in one write, which is what the service role sends.

update public.church_profile
   set groups_off_season_note = 'Home groups open Sunday, September 6 at 9:00am. Text Season 3 to (833) 801-3857.',
       groups_note_in_season = true,
       groups_note_image_url = 'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/2026-09/flyer.jpg'
 where published;

select t_check('the card is open now, with the announcement in it',
  (select groups_note_in_season and groups_off_season_note like 'Home groups open Sunday%'
     from public.church_profile where id = 'church-home'), true);

/* The whole point of the second column. The card is carrying a temporary
   paragraph, and the sentence it goes back to is untouched underneath it. */
select t_check('and the between seasons sentence underneath is untouched',
  (select groups_between_seasons_note from public.church_profile where id = 'church-home'),
  'Home groups are between seasons right now.');

-- THE ONE THAT MATTERS MOST. Nothing in this feature may flip the switch that
-- draws the finder, because the rows behind it are placeholders.
select t_check('and none of it touched the season switch that draws the finder',
  (select groups_in_season from public.church_profile where id = 'church-home'), false);

-- ------------------------------------------------------------ a season off ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_end_group_season();
end
$$;

reset role;

select t_check('an admin can put the card back to between seasons',
  (select groups_note_in_season from public.church_profile where id = 'church-home'), false);

select t_check('and the words that come back are the church''s own',
  (select groups_off_season_note from public.church_profile where id = 'church-home'),
  'Home groups are between seasons right now.');

select t_check('and last season''s flyer comes off with them',
  (select groups_note_image_url is null
     from public.church_profile where id = 'church-home'), true);

select t_check('the finder switch is still where it was',
  (select groups_in_season from public.church_profile where id = 'church-home'), false);

-- Safe to press twice, which is what a button on a phone with a bad connection
-- is going to be.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_end_group_season();
end
$$;

reset role;

select t_check('pressing it again changes nothing',
  (select groups_off_season_note from public.church_profile where id = 'church-home'),
  'Home groups are between seasons right now.');

-- ------------------------------------------------------------- the trigger ---
-- Edit mode's write: a plain UPDATE of one column, sent by an admin's phone
-- under the grant from 0031, with no function of ours involved.

update public.church_profile
   set groups_off_season_note = 'Home groups are resting until the spring.'
 where published;

select t_check('a fix typed on Connect becomes the sentence that comes back',
  (select groups_between_seasons_note from public.church_profile where id = 'church-home'),
  'Home groups are resting until the spring.');

-- And the other half of the rule: while the card is in season, the same write
-- is a temporary paragraph and must not overwrite the evergreen one.
update public.church_profile
   set groups_note_in_season = true,
       groups_off_season_note = 'Groups are open, come along on Sunday.'
 where published;

select t_check('but a paragraph written while a season is on does not',
  (select groups_between_seasons_note from public.church_profile where id = 'church-home'),
  'Home groups are resting until the spring.');

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_end_group_season();
end
$$;

reset role;

select t_check('so ending the season brings back the fix rather than the old words',
  (select groups_off_season_note from public.church_profile where id = 'church-home'),
  'Home groups are resting until the spring.');

-- Put the seed sentence back, so a re-run starts where this one did.
update public.church_profile
   set groups_off_season_note = 'Home groups are between seasons right now. When the next one starts this is where you will find it, and we will make sure you hear about it before it fills up.',
       groups_between_seasons_note = 'Home groups are between seasons right now. When the next one starts this is where you will find it, and we will make sure you hear about it before it fills up.'
 where published;
