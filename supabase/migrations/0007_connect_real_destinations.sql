-- ===========================================================================
-- Home Church, Connect gets real destinations
--
-- Before this migration, three things on the Connect tab told a person that
-- something would happen and then nothing happened. Tapping a serve team
-- said "someone from that team will find you on Sunday" and told nobody.
-- Tapping a group said "we will pass your name to the host" and passed
-- nothing, from a card with no input to pass. The next step forms collected
-- a name, a contact, and a note, and then called form.reset() and threw all
-- three away.
--
-- The church already runs real infrastructure for every one of those: Church
-- Center for baptism and Alpha, Group Vitals for group hosting, a Google Form
-- for prayer, Flodesk for the email list, and an SMS keyword for serving. So
-- the fix is not to build a form capture pipeline in Supabase. It is to point
-- the app at the systems that already exist and already have somebody
-- watching them.
--
-- That is a smaller change and a better one. No new table, no Edge Function,
-- no second copy of a member's contact details sitting in a project nobody
-- checks.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. next_steps gets somewhere to send people
--
-- A next step without a url is a description and nothing more, which is a
-- legitimate state and renders as one. A next step with a url gets a button
-- labeled by cta_label, and the button says where it lands before it goes.
-- ---------------------------------------------------------------------------

alter table public.next_steps add column if not exists url       text;
alter table public.next_steps add column if not exists cta_label text;

comment on column public.next_steps.url is
  'External destination. Null renders the step as a description with no button, which is honest. Never point this at a page that does not exist.';
comment on column public.next_steps.cta_label is
  'The button text. Say where it lands, not "Learn more". Defaults to "Open" in the app when null.';


-- ---------------------------------------------------------------------------
-- 2. church_profile gets the serve signup block and the group season switch
--
-- SERVE SIGNUP. The church's own page does not have a per team form. Every
-- team funnels through one SMS keyword, which is why serve_teams has no url
-- column. The number and the keyword live here so they are one row edit.
--
-- GROUP SEASON. Home groups run in seasons. Between seasons there are no
-- groups to join, and a filter strip over an empty list reads as a bug rather
-- than as a season. groups_in_season false hides the whole group finder and
-- shows groups_off_season_note in its place. One boolean, flipped twice a
-- year, rather than unpublishing four rows one at a time and remembering to
-- put them back.
-- ---------------------------------------------------------------------------

alter table public.church_profile
  add column if not exists serve_signup_number  text,
  add column if not exists serve_signup_keyword text,
  add column if not exists serve_signup_title   text,
  add column if not exists serve_signup_blurb   text,
  add column if not exists groups_in_season     boolean not null default true,
  add column if not exists groups_off_season_note text;

comment on column public.church_profile.serve_signup_number is
  'The SMS number every serve team funnels through. Digits and dashes as a human would read them, the app builds the sms: link.';
comment on column public.church_profile.groups_in_season is
  'False between group seasons. Hides the group finder entirely and shows groups_off_season_note instead.';
comment on column public.church_profile.groups_off_season_note is
  'What Connect says when groups are out of season. Warm, and honest that they are coming back.';


-- ---------------------------------------------------------------------------
-- 3. Fill them in
--
-- The serve blurb is the church's own copy from homechurchnola.com/serve,
-- with two edits: "click the button below" became "tap below", because this
-- is a phone and there is no button below on a website sense, and the two
-- exclamation marks came out to sit with the rest of the app's register.
-- Both are one edit away from being put back.
--
-- Every url below has had its utm parameters stripped. They said the traffic
-- came from Instagram, which was true of a link in a bio and is not true of
-- a tap inside the app.
-- ---------------------------------------------------------------------------

update public.church_profile set
  serve_signup_number  = '833-801-3857',
  serve_signup_keyword = 'SERVE',
  serve_signup_title   = 'Sign up to serve',
  serve_signup_blurb   = 'Interested in serving with Home Church? Tap below and a member of our team will be in touch. We cannot wait to serve with you.',
  groups_in_season     = true,
  groups_off_season_note = 'Home groups are between seasons right now. When the next one starts this is where you will find it, and we will make sure you hear about it before it fills up.'
where published;


-- The four that already existed, now pointed somewhere real.
update public.next_steps set
  url = 'https://homechurchnola.churchcenter.com/people/forms/953766',
  cta_label = 'Sign up for baptism'
where id = 'step-baptism';

update public.next_steps set
  url = 'https://docs.google.com/forms/d/e/1FAIpQLSexkC8J_AhOtQUCH1lNaE5tIP5bXAjmB36iXubtWxQY0ymgGQ/viewform',
  cta_label = 'Tell us how to pray'
where id = 'step-prayer';

update public.next_steps set
  url = 'https://homechurchnola.groupvitals.com/leaderform',
  cta_label = 'Sign up to host'
where id = 'step-group';

-- step-new has no destination yet. Left with a null url on purpose, so it
-- renders as a description rather than as a button that goes nowhere.


-- Two the app did not have at all.
insert into public.next_steps (id, title, blurb, url, cta_label, sort_order, published)
values
  ('step-alpha',
   'I have questions about faith',
   'Alpha is a few weeks of dinner, a short talk, and honest conversation. No question is too basic and nobody is going to put you on the spot.',
   'https://homechurchnola.churchcenter.com/registrations/events/3798127',
   'Save your spot',
   35, true),
  ('step-email',
   'Keep me in the loop',
   'The occasional email with what is coming up. Not many, and you can leave whenever you want.',
   'https://lively-breeze-89532.myflodesk.com/g7ga3zf20y',
   'Join the email list',
   50, true)
on conflict (id) do update set
  title     = excluded.title,
  blurb     = excluded.blurb,
  url       = excluded.url,
  cta_label = excluded.cta_label,
  sort_order= excluded.sort_order,
  published = excluded.published;


-- ---------------------------------------------------------------------------
-- 4. Grants
--
-- New columns on existing tables inherit the table's policies and grants, so
-- there is nothing to add. Restated only so this file can be read alone and
-- understood: the world reads published rows, nobody writes but the service
-- role. See 0001_content_cms.sql section 7 for why that needs no policy.
-- ---------------------------------------------------------------------------
