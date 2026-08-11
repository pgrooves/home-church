-- ===========================================================================
-- Home Church, the church's real serve teams
--
-- The four teams that shipped with the app were plausible inventions: Home
-- Kids, Welcome Team, Worship and Production, Care Team. Only one of them was
-- real. These seven are the church's own, in the church's own words, in the
-- order homechurchnola.com/serve lists them.
--
-- WHAT CHANGED IN THE SHAPE. Two teams carry a condition before somebody can
-- serve on them, a background check for Home Kids and a training process for
-- Worship. The site prints those as an asterisked footnote under the
-- description, and they matter enough to a person deciding whether to sign up
-- that they should not be buried inside the blurb where they would read as
-- part of the sales pitch. So `requirement` is its own column, rendered as its
-- own line, and null on the five teams that do not have one.
--
-- Ids are new readable slugs. Serve team ids are not referenced from
-- localStorage the way guide ids are, so renaming them orphans nothing.
--
-- GROUPS ARE ALSO SWITCHED OFF HERE, which is a content decision and not a
-- schema one, but it belongs in the same run. Home groups are between seasons,
-- so the finder hides and the between seasons card shows. Flip
-- groups_in_season back to true the day the next season starts, one row, no
-- app update.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Somewhere to put the condition
-- ---------------------------------------------------------------------------

alter table public.serve_teams add column if not exists requirement text;

comment on column public.serve_teams.requirement is
  'What has to happen before somebody can serve here, a background check or a training process. Null on most teams. Kept out of the blurb so it reads as a condition and not as a feature.';


-- ---------------------------------------------------------------------------
-- 2. Out with the inventions
--
-- team-kids is deleted along with the rest rather than renamed, so the whole
-- list comes from one place and there is no half migrated row to reason about.
-- ---------------------------------------------------------------------------

delete from public.serve_teams
where id in ('team-kids', 'team-welcome', 'team-worship', 'team-care');


-- ---------------------------------------------------------------------------
-- 3. In with the real ones
--
-- Descriptions are verbatim from the church's site. commitment is only set on
-- the two teams that publish one, and the app drops the line when it is empty
-- rather than printing a gap.
-- ---------------------------------------------------------------------------

insert into public.serve_teams (id, name, commitment, requirement, blurb, sort_order, published)
values
  ('team-home-kids', 'Home Kids', null, 'Background check required',
   'Our team invests in the lives of children through worship, Biblical teaching, videos, small groups, and games.',
   10, true),

  ('team-greeters', 'Greeters', null, null,
   'Our team plays a vital role in creating a warm and inviting atmosphere for everyone who walks through our doors.',
   20, true),

  ('team-set-up', 'Set Up', 'Saturdays at 4:00 PM, weekly', null,
   'Our team works behind the scenes to create a welcoming and functional space for worship and fellowship. This includes assembling the stage, curtains, and chairs.',
   30, true),

  ('team-tear-down', 'Tear Down', 'Sundays after service, weekly', null,
   'Our team helps with the transition of our worship space by taking down the stage, curtains, and chairs after the Sunday Service.',
   40, true),

  ('team-parking', 'Parking', null, null,
   'Our team serves as the first impression for those coming to Home Church by welcoming people on and off the property and by providing a safe and efficient parking experience.',
   50, true),

  ('team-prayer', 'Prayer Team', null, null,
   'Our team provides prayer covering for services, teams and ministries at Home Church. We meet to pray in person and online via Zoom.',
   60, true),

  ('team-worship', 'Worship Team', null, 'Training process required',
   'Our team facilitates a powerful worship experience through vocals, instruments, and audio engineering.',
   70, true)

on conflict (id) do update set
  name        = excluded.name,
  commitment  = excluded.commitment,
  requirement = excluded.requirement,
  blurb       = excluded.blurb,
  sort_order  = excluded.sort_order,
  published   = excluded.published;


-- ---------------------------------------------------------------------------
-- 4. Home groups, between seasons
--
-- The four groups in the table are still placeholders with invented hosts.
-- With the season off they never render, so there is nothing in the app for
-- anyone, reviewer included, to mistake for real. Replace them with the real
-- groups before flipping this back to true.
-- ---------------------------------------------------------------------------

update public.church_profile set groups_in_season = false where published;
