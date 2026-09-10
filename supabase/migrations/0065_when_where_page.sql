-- ===========================================================================
-- Home Church, the When & Where page
--
-- One row in content_pages, holding the two paragraphs at the top of the new
-- fourth stop behind •••. The times and the address on that screen are not
-- here: they are church_profile.service_day, service_times, address_* and
-- maps_url, the row Home's gathering card already reads. This is only the
-- prose over them.
--
-- WHERE THE WORDS COME FROM. The Sunday Gatherings block on
-- homechurchnola.com, word for word. They are the church's own sentences and
-- they have been public for a while, which is the point: somebody who read
-- them on the website and then downloaded the app should find the same
-- welcome, not a paraphrase of it.
--
-- WHY A ROW AND NOT A STRING IN THE SCREEN. Same answer as page-give in 0026.
-- Softening a sentence about a Sunday morning should not be an App Store
-- review. `js/screens/whenwhere.js` still carries these exact words as its
-- fallback, so a phone that has never reached Supabase, and a project where
-- nobody has run this file, both draw a real paragraph rather than a gap.
--
-- THE SECOND LINE IS NOT IN HERE. "Everyone is welcome. Everyone is family."
-- is bold on the website and bold on the screen, and `blurb` is drawn as
-- plain paragraphs, so putting it in this row would either lose the weight or
-- ask an admin to type markup. It is a text_overrides slot instead,
-- `whenwhere.welcome`, rewritten in place from Edit mode like every other
-- sentence in the app. See migration 0030.
--
-- sort_order 20, after page-give's 10, which is the order the Content screen
-- lists them in and nothing else.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once: `on conflict do nothing`, so a re-run never
--   puts these words back over an edit the church has since made.
-- ===========================================================================

insert into public.content_pages (id, title, eyebrow, blurb, sections, sort_order)
values (
  'page-when-where',
  'Sunday Gatherings',
  'When & Where',
  'Sunday gatherings are at the heart of our community — where we come together to worship, learn from Scripture, pray for one another, and make room to hear from the Spirit. It’s a time to praise, connect, and grow in a space that feels like home.',
  '[]'::jsonb,
  20
)
on conflict (id) do nothing;

-- Read it back.
select id, eyebrow, title, sort_order
from public.content_pages
where id = 'page-when-where';
