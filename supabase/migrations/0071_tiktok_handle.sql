-- ===========================================================================
-- Home Church, the TikTok link points at the church
--
-- 0014 added TikTok to church_profile.social as
-- tiktok.com/@homechurchnola. The church's TikTok is
-- tiktok.com/@homechurch.nola. One dot, and the TikTok icon on Home and the
-- TikTok row on Profile have been opening an account that is not theirs on
-- every phone since 0014 seeded it.
--
-- This is the same fault 0013 fixed for Instagram, and it slipped through the
-- same way: 0013's own comment said everything except Instagram was
-- homechurchnola with no dot, TikTok named among them. That was wrong about
-- TikTok. Two of the five handles carry the dot, not one.
--
-- WHY A MIGRATION AND NOT A DASHBOARD EDIT. The live row is what phones read,
-- so the dashboard edit is the part that actually fixes anything. This file
-- exists so a project seeded from scratch tomorrow does not reintroduce the
-- same broken link, the way 0013 corrected 0006 rather than editing it.
-- js/data.js carries the same fix for the copy baked into the binary.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. Safe to run more than once.
-- ===========================================================================


-- Rebuilds the array in place rather than overwriting it, so a platform added
-- to this list later survives a re-run of this file instead of being silently
-- dropped. `with ordinality` plus `order by` keeps the links in the order the
-- Home and Profile screens render them; jsonb_agg without it is free to hand
-- them back in any order at all.
update public.church_profile
set social = (
  select jsonb_agg(
           case
             when entry->>'label' = 'TikTok'
               then jsonb_set(entry, '{url}',
                      to_jsonb('https://www.tiktok.com/@homechurch.nola'::text))
             else entry
           end
           order by ord
         )
  from jsonb_array_elements(social) with ordinality as t(entry, ord)
)
where social @> '[{"label": "TikTok"}]'::jsonb;


-- Proves the fix landed rather than trusting that it did. A zero row result
-- here means the update matched nothing and the link is still wrong.
select entry->>'label' as label, entry->>'url' as url
from public.church_profile,
     jsonb_array_elements(social) as entry
where entry->>'label' = 'TikTok';
