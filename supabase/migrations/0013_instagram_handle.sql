-- ===========================================================================
-- Home Church, the Instagram link points at the church
--
-- The Instagram row in church_profile.social shipped as
-- instagram.com/homechurchnola. The church's Instagram is
-- instagram.com/homechurch.nola. One dot, and the "Instagram" row on the
-- Profile screen has been opening an account that is not theirs on every
-- phone since 0006 seeded it.
--
-- Everything else the church owns really is homechurchnola with no dot,
-- Facebook, YouTube, X, TikTok, the website, Overflow, Church Center. That is
-- exactly why this one slipped through: the wrong value is the right value
-- everywhere else, so it reads as correct in a diff and in the dashboard.
--
-- WHY A MIGRATION AND NOT A DASHBOARD EDIT. The live row is what phones read,
-- so the dashboard edit is the part that actually fixes anything. This file
-- exists so a project seeded from scratch tomorrow does not reintroduce the
-- same broken link, the way 0007 corrected 0006 rather than editing it.
-- js/data.js carries the same fix for the copy baked into the binary.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. Safe to run more than once.
-- ===========================================================================


-- Rebuilds the array in place rather than overwriting it, so a handle added
-- to this list later, X and TikTok being the obvious candidates, survives a
-- re-run of this file instead of being silently dropped. `with ordinality`
-- plus `order by` keeps the links in the order the Profile screen renders
-- them; jsonb_agg without it is free to hand them back in any order at all.
update public.church_profile
set social = (
  select jsonb_agg(
           case
             when entry->>'label' = 'Instagram'
               then jsonb_set(entry, '{url}',
                      to_jsonb('https://www.instagram.com/homechurch.nola'::text))
             else entry
           end
           order by ord
         )
  from jsonb_array_elements(social) with ordinality as t(entry, ord)
)
where social @> '[{"label": "Instagram"}]'::jsonb;


-- Proves the fix landed rather than trusting that it did. A zero row result
-- here means the update matched nothing and the link is still wrong.
select entry->>'label' as label, entry->>'url' as url
from public.church_profile,
     jsonb_array_elements(social) as entry
where entry->>'label' = 'Instagram';
