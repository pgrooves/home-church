-- ===========================================================================
-- Home Church, five demo posts for the Connect rail
--
-- TEMPORARY. This is hand-entered content so the team can see the Instagram
-- rail working before the real sync exists. It is not the sync, and it is not
-- a fixture anything depends on. Delete it when the real posts arrive:
--
--   delete from public.instagram_posts;
--
-- The five images are already in Supabase Storage, in the `instagram` bucket
-- at the root. This only writes the rows that point at them.
--
-- WHAT IS INVENTED HERE, so nobody mistakes it for record. The dates are five
-- consecutive Sundays working back from 16 August 2026, chosen only to fix the
-- left to right order; no date is displayed anywhere in the app, it only sorts
-- the rail and feeds the screen reader label. The captions are descriptions of
-- the photographs, not what the church actually wrote on the posts. The
-- permalinks and the images are real.
--
-- Posts 1 and 2 are CAROUSEL_ALBUM because their links carried ?img_index=,
-- which is what Instagram puts on a multi image post. Nothing here is marked
-- VIDEO, so no tile draws a play badge, which is correct: a play badge is a
-- promise about what a tap does.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once, the conflict clause updates rather than
--   duplicating.
-- ===========================================================================


-- 1. Confirm the images actually landed, and under these exact names --------
-- Five rows, no folder prefix. If this returns anything else, fix it before
-- running the insert or the tiles will render as empty cream blocks.

select name from storage.objects
where bucket_id = 'instagram'
order by name;


-- 2. The rows --------------------------------------------------------------

insert into public.instagram_posts
  (id, permalink, image_path, media_type, caption, posted_at, published)
values
  ('DcHwSuzCUYq', 'https://www.instagram.com/p/DcHwSuzCUYq/', '01-gathering.jpg',
   'CAROUSEL_ALBUM', 'Gathering outside before the service.',
   '2026-08-16T15:00:00Z', true),

  ('DcEDXxvjLJW', 'https://www.instagram.com/p/DcEDXxvjLJW/', '02-welcome.jpg',
   'CAROUSEL_ALBUM', 'A wave hello at the door on Sunday morning.',
   '2026-08-09T15:00:00Z', true),

  ('Db1vWdDCXWb', 'https://www.instagram.com/p/Db1vWdDCXWb/', '03-worship.jpg',
   'IMAGE', 'Hands raised in worship.',
   '2026-08-02T15:00:00Z', true),

  ('DbRvCcwCTzI', 'https://www.instagram.com/p/DbRvCcwCTzI/', '04-teaching.jpg',
   'IMAGE', 'Sunday teaching.',
   '2026-07-26T15:00:00Z', true),

  ('Da_oiYwiYeA', 'https://www.instagram.com/p/Da_oiYwiYeA/', '05-ridgewood.jpg',
   'IMAGE', 'Families walking in under the Ridgewood arch.',
   '2026-07-19T15:00:00Z', true)

on conflict (id) do update set
  permalink  = excluded.permalink,
  image_path = excluded.image_path,
  media_type = excluded.media_type,
  caption    = excluded.caption,
  posted_at  = excluded.posted_at,
  published  = excluded.published;


-- 3. What the rail will show, in the order it will show it ------------------

select posted_at::date as posted, image_path, media_type, permalink
from public.instagram_posts
where published
order by posted_at desc;
