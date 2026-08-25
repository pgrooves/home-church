-- ===========================================================================
-- Home Church, an announcement that can carry more than a sentence
--
-- WHAT THIS ADDS. Five columns, and between them they turn an announcement
-- from a card with one paragraph and one photograph into something an admin
-- can actually build from a phone: formatted words, a video that plays in the
-- app, as many pictures as the thing needs, and a link with a thumbnail.
--
--   body_html       the words, as markup, written in the rich text editor on
--                   the Admin form. `body` stays and is the plain text mirror
--                   of it, which is the column the push notification reads.
--   image_urls      every picture, in the order they are shown. image_url
--                   from 0026 stays and is kept equal to the first of them.
--   link_url        one link attached to the announcement.
--   link_title      what the link card calls it. Optional.
--   link_image_url  the link card's thumbnail. Null is a real value and it
--                   means "no thumbnail", which is what the x on the form's
--                   preview writes.
--
-- WHY body IS NOT REPLACED BY body_html. Three things read the plain text and
-- none of them can read markup: hc_admin_send_announcement hands `body` to the
-- send-push function, which puts the first sentence of it on four hundred lock
-- screens; the Admin list draws it under each row; and Home's card shows it as
-- a snippet under the title, inside a button, where an <a> would be a tap
-- target inside a tap target. So `body` is a mirror the app writes on every
-- save, the same arrangement js/journal.js has kept between bodyHtml and
-- bodyText since the Journal shipped, and for the same reason.
--
-- A row written before this migration has body and no body_html, and the app
-- draws it exactly as it drew it yesterday. A row written after has both. That
-- is what makes this safe to run against a table that already has
-- announcements in it, and it is why nothing here is `not null`.
--
-- WHY image_urls IS jsonb AND NOT text[]. content_pages.sections is already
-- jsonb and the client already knows how to send and read one; a Postgres
-- array over PostgREST is a second encoding for the same shape, and one
-- encoding in this project is worth more than the tidier column type.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0003 (the table) and 0026 (image_url, video_url, the admin writes).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

alter table public.announcements
  add column if not exists body_html      text,
  add column if not exists image_urls     jsonb not null default '[]'::jsonb,
  add column if not exists link_url       text,
  add column if not exists link_title     text,
  add column if not exists link_image_url text;

comment on column public.announcements.body_html is
  'The announcement''s words as markup, from the rich text editor on the Admin form. Sanitized by the app before it is sent and again before it is drawn, against the allowlist in js/richtext.js. Null means this row predates the editor and `body` is the whole of it.';
comment on column public.announcements.image_urls is
  'Every picture on the announcement, in order, as an array of https URLs. image_url is kept equal to the first one so a phone running an older build still shows a photograph.';
comment on column public.announcements.link_url is
  'One link attached to the announcement, shown as a card that opens in the phone''s browser.';
comment on column public.announcements.link_title is
  'What the link card is called. Null falls back to the link''s own host.';
comment on column public.announcements.link_image_url is
  'The link card''s thumbnail. Null means the card is drawn without one, which is what the x on the admin form''s preview writes.';

-- video_url was a link out when 0026 added it and is embedded now, so its own
-- comment no longer describes what the app does with it.
comment on column public.announcements.video_url is
  'A YouTube link. The app pulls the video id out of it and plays it in an iframe on the announcement''s own page, behind a poster, so nothing is requested from Google until somebody taps it. See js/screens/announcement.js.';


-- ---------------------------------------------------------------------------
-- 2. The one constraint worth having
--
-- image_urls is read with a loop over it on every draw of Home. jsonb will
-- happily hold a string or a number in that column, and the failure that
-- causes is a screen that draws nothing rather than an error anybody sees, so
-- the shape is asserted here where it cannot be forgotten.
--
-- Nothing checks what is inside the array. The app only ever writes URLs it
-- built or an admin pasted, every one of them goes through the same escaping
-- as any other value on a card, and a check constraint over the contents of an
-- array is a validator that has to be kept in step with a client. See the note
-- on the same decision for content_pages.sections in 0026.
-- ---------------------------------------------------------------------------

alter table public.announcements
  drop constraint if exists announcements_image_urls_is_array;

alter table public.announcements
  add constraint announcements_image_urls_is_array
  check (jsonb_typeof(image_urls) = 'array');


-- ---------------------------------------------------------------------------
-- 3. Bringing the pictures across
--
-- Every row that already has a photograph gets a one item list, so the day
-- this runs no announcement loses its picture and no admin has to go and
-- re-attach one. Guarded on the list being empty rather than on the migration
-- never having run, which is what makes it safe to run twice: a row somebody
-- has since given three pictures to is left exactly as it is.
-- ---------------------------------------------------------------------------

update public.announcements
   set image_urls = jsonb_build_array(image_url)
 where image_url is not null
   and image_url <> ''
   and image_urls = '[]'::jsonb;


-- ---------------------------------------------------------------------------
-- 4. Policies and grants: nothing to do
--
-- Said out loud so nobody goes looking for the section that is missing, the
-- same way 0028 section 3 does.
--
-- Reads are row level: the public select policy from 0003 hands the whole row
-- to anon and authenticated, these columns included. Writes are the admin
-- insert and update from 0026 section 4, which are written against the table
-- and not a column list, so an admin can write these five the moment they
-- exist.
--
-- The column level grants in 0031 are Edit mode's, and none of these five join
-- it. Edit mode is a textarea over one sentence; body_html is markup and the
-- other four are URLs and a list, and all five are edited on the Admin form
-- where the whole announcement is in view. js/edit-mode.js keeps the matching
-- half of that decision in its ALLOWLIST, which this migration does not widen.
-- ---------------------------------------------------------------------------
