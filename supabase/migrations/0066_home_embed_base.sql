-- ===========================================================================
-- Home Church, where the video wrapper lives
--
-- One row, holding the folder that `embed.html` is published in. The app
-- frames that page on a phone and the page frames YouTube, because the
-- packaged app runs on capacitor://localhost, a document there sends no
-- referrer, and YouTube's player answers a request with no referrer with
-- "Video player configuration error. Error 153" instead of a video. That was
-- every YouTube player in the app on every phone -- Home's featured video,
-- the Practices sessions, Alpha, an announcement's video -- while the web
-- build played all of them. See embed.html and c.youtubeEmbedUrl().
--
-- WHY THIS IS A ROW AND NOT ONLY A CONSTANT. The constant is in
-- js/components.js and it is the floor. But a shipped app cannot be told a
-- new URL without an App Store submission, and this URL is the one thing in
-- the whole arrangement that lives outside the repo: turn GitHub Pages off,
-- rename the repository, move the file, and every video in every installed
-- copy goes quiet at once with no way to reach them. This row is that way.
--
-- WHAT IT HOLDS. The folder, with no trailing slash and no filename:
--
--   https://pgrooves.github.io/home-church
--
-- The app appends `/embed.html` and the query itself. An empty or malformed
-- value falls back to the constant rather than building a broken URL.
--
-- TWO THINGS TO KNOW BEFORE POINTING IT SOMEWHERE ELSE.
--
--   1. index.html's `frame-src` names the hosts the app is allowed to frame,
--      and it ships with the app. Today that is GitHub Pages and this
--      project's own Supabase, so a base on either host works; a base on any
--      other host is refused by the policy and draws nothing at all. Moving
--      to a third host needs a build, which is exactly the thing this row
--      exists to avoid, so prefer one of the two.
--   2. The page must answer over https and must be frameable, so no
--      X-Frame-Options: DENY in front of it.
--
-- An app that cannot reach the wrapper is not dark: after four seconds it
-- frames YouTube directly, which is error 153 again on a phone and a working
-- video everywhere else. Worth knowing when this looks half broken rather
-- than broken.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once.
-- ===========================================================================

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('home_embed_base',
   'Video wrapper URL',
   'Advanced. The folder holding embed.html, which is how videos play inside the app on a phone. Leave this alone unless video has stopped working everywhere at once and somebody has moved that page.',
   'text', null, 'https://pgrooves.github.io/home-church', 50)
on conflict (key) do nothing;

-- Read it back.
select key, kind, value_text, sort_order
from public.app_settings
where key in ('home_featured_video', 'home_embed_base')
order by sort_order;
