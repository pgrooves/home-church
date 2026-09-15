-- ===========================================================================
-- Home Church, the When & Where page is called Services
--
-- The page behind ••• that answers what time we gather and where the building
-- is was called When & Where, on the website and in migration 0065. That is a
-- description of the question the page answers rather than a name for the
-- thing it is about, and it is two words and an ampersand in a bar that has
-- one line for them. It is Services now: the word the church uses out loud,
-- and the word somebody scanning a menu for a service time looks for.
--
-- THREE PLACES SAY IT AND ONLY ONE OF THEM IS A ROW. The tile in the ••• sheet
-- and the word the top bar carries are `js/app.js`; the fallback the screen
-- draws with no Supabase behind it is `js/screens/whenwhere.js`; and this, the
-- eyebrow over "Sunday Gatherings", is content_pages.eyebrow, which an admin
-- can rewrite from Admin -> Content. So the rename is not finished by a build
-- alone, and a project that has run 0065 keeps showing the old eyebrow until
-- this file runs.
--
-- THE CHURCH'S PROJECT HAS NOT RUN 0065, checked the day this was written:
-- there is no `page-when-where` row at all, so the screen draws the fallback
-- out of `js/screens/whenwhere.js` and already says Services. This file
-- changes nothing there today, and it is not wasted either — it is what keeps
-- the rename true on the day somebody does run 0065 and the row starts
-- winning. If neither has run, run them in that order: 0065 seeds the row
-- with the old eyebrow, this renames it.
--
-- WHAT DOES NOT CHANGE. The row's `title` stays "Sunday Gatherings", because
-- that is the church's own heading for this on homechurchnola.com and it is
-- what the screen prints in display type. The id stays `page-when-where` and
-- so does the app's route: an id is a key, not a label, and a saved link to
-- ?v=when-where still has to land on the page.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once.
-- ===========================================================================


-- The where clause names the old eyebrow exactly, which makes this idempotent
-- and, more to the point, means it cannot overwrite a line the church has
-- since written for itself. A church that has already renamed this eyebrow to
-- something of their own keeps it.
update public.content_pages
set eyebrow = 'Services'
where id = 'page-when-where'
  and eyebrow = 'When & Where';


-- Read it back. The eyebrow is the small line, the title is the heading under
-- it, and they are meant to differ.
select id, eyebrow, title, sort_order
from public.content_pages
where id = 'page-when-where';
