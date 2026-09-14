-- ===========================================================================
-- Home Church, the TikTok link gets its dot
--
-- Migration 0014 added TikTok as https://www.tiktok.com/@homechurchnola, on
-- the reasonable assumption that every handle except Instagram is spelled
-- without the dot. TikTok is the second exception: the church's account is
-- @homechurch.nola, and the link as shipped points at an account that is not
-- theirs. Home and Profile both draw church_profile.social, so the one wrong
-- URL is two wrong buttons on a phone.
--
-- Only the URL changes. The label stays TikTok, and the entry stays fifth, so
-- the row of icons looks exactly as it does today.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once.
-- ===========================================================================


-- Rebuilds the array in place rather than appending, because TikTok is already
-- present and its position is what Profile renders. `with ordinality` plus the
-- ordered jsonb_agg is what holds that order across the rewrite.
--
-- The where clause names the old URL exactly, so this is idempotent and, more
-- to the point, cannot overwrite a link somebody has since corrected by hand
-- in the dashboard to something else again.
update public.church_profile
set social = (
  select jsonb_agg(
           case
             when entry->>'label' = 'TikTok'
               then jsonb_set(entry, '{url}', '"https://www.tiktok.com/@homechurch.nola"'::jsonb)
             else entry
           end
           order by ord)
  from jsonb_array_elements(social) with ordinality as t(entry, ord)
)
where social @> '[{"label": "TikTok", "url": "https://www.tiktok.com/@homechurchnola"}]'::jsonb;


-- Every link the Profile screen will show, in the order it will show them.
select ord, entry->>'label' as label, entry->>'url' as url
from public.church_profile,
     jsonb_array_elements(social) with ordinality as t(entry, ord)
order by ord;
