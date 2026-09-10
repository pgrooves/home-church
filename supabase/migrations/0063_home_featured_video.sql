-- ===========================================================================
-- Home Church, the featured video on Home
--
-- One row in app_settings, holding one YouTube link. The app draws it in the
-- gap between the greeting and Announcements: a frame the width of the
-- screen, no heading over it and no caption under it, already playing on mute
-- by the time anybody has read their own name. The pill in its corner turns
-- the sound on. See js/featured-video.js.
--
-- WHY A ROW AND NOT A FILE. The same reason every other piece of content in
-- this project is in Postgres: a link in js/data.js reaches nobody's phone
-- without an App Store submission, and the whole point of a featured video is
-- that it changes on a Thursday. This row is read on every open, like the
-- rest of app_settings, with the publishable key, so a signed out phone sees
-- the video too.
--
-- WHY `text` AND NOT A SECOND `boolean` BESIDE IT. Emptying the box is how
-- the video comes off Home. A switch would be a second thing to remember and
-- a second way for the two to disagree, and an empty string already means
-- exactly one thing here.
--
-- ANY SHAPE OF LINK IS FINE. The app parses the eleven characters out of a
-- watch URL, a share URL, an embed URL, a /live/ URL, a /shorts/ URL or a
-- bare id, and refuses anything else by drawing nothing, so a half pasted
-- link is a quiet gap rather than an error player on the screen the app opens
-- to. A /shorts/ link is drawn upright rather than letterboxed.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once: `on conflict do nothing`, so re-running it
--   never puts an old video back over the one the church has since chosen.
-- ===========================================================================

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('home_featured_video',
   'Featured video',
   'A YouTube link. It sits under the greeting at the top of Home and starts playing on mute as soon as the app opens; the pill on it turns the sound on. Leave it empty for no video.',
   'text', null, 'https://youtu.be/p8aqXrP4wws', 40)
on conflict (key) do nothing;

-- Read it back.
select key, kind, value_text, sort_order
from public.app_settings
where key = 'home_featured_video';
