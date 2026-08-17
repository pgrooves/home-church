-- ===========================================================================
-- Home Church, X and TikTok join the social links
--
-- The church posts on five platforms and the app listed three. X and TikTok
-- were never wrong in the app, they were simply absent, so the Profile screen
-- quietly implied the church is not on either one.
--
-- They land after YouTube because Profile renders this array in order and
-- Instagram, Facebook, YouTube is the order it has always shown.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. Safe to run more than once.
-- ===========================================================================


-- Appends only what is missing, so a re-run cannot stack duplicate rows and
-- cannot disturb a link somebody edited in the dashboard. `not social @> ...`
-- tests on the label rather than the whole object for the same reason: a URL
-- corrected by hand later should still count as X already being present.
update public.church_profile
set social = social || '[{"label": "X", "url": "https://x.com/homechurchnola"}]'::jsonb
where not social @> '[{"label": "X"}]'::jsonb;

update public.church_profile
set social = social || '[{"label": "TikTok", "url": "https://www.tiktok.com/@homechurchnola"}]'::jsonb
where not social @> '[{"label": "TikTok"}]'::jsonb;


-- Every link the Profile screen will show, in the order it will show them.
select ord, entry->>'label' as label, entry->>'url' as url
from public.church_profile,
     jsonb_array_elements(social) with ordinality as t(entry, ord)
order by ord;
