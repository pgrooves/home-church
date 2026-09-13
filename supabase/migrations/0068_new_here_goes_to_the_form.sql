-- ===========================================================================
-- Home Church, "I'm new here" gets somewhere to go
--
-- Migration 0007 gave every next step a real destination except this one, and
-- said so in a comment: step-new was left with a null url on purpose, so that
-- it rendered as a description rather than as a button that went nowhere.
-- That was the right call then. What it looked like on a phone is a section
-- you tap open to find one sentence and nothing under it, which is what the
-- church reported: the one step aimed at the person with the least idea what
-- to do next was the one step you could not act on.
--
-- The destination it wanted turned out to be on the same screen. The contact
-- form at the top of Connect (migration 0058, the contact Edge Function) goes
-- to the church office and a real person answers, which is exactly what
-- "tell us a little about yourself and we will find you on Sunday" is asking
-- for. So this points the step at that form instead of at a seventh outside
-- system nobody would have to watch.
--
-- 'app:contact' IS NOT AN ADDRESS, and that is deliberate. The app reads the
-- url column, and a value beginning 'app:' names a place inside the app
-- rather than a page on the web: this one scrolls to the contact form and
-- says so to a screen reader. The whole list of them is INTERNAL_STEPS in
-- js/screens/connect.js. A build that has never heard of 'app:contact'
-- matches nothing there and draws the step as a description, exactly as it
-- does today, so an older phone loses nothing by this row arriving.
--
-- No new column, for the same reason: a phone already in somebody's pocket
-- syncs the columns it knows about, and url is one of them.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The step itself
--
-- cta_label says where the button lands, the way every other step's does, and
-- it stays editable from Edit mode afterwards. Only written where the url is
-- still null: if somebody has since pointed this step at a Church Center form
-- or anything else real, that is a better destination than a scroll and this
-- file must not take it away on a re-run.
-- ---------------------------------------------------------------------------

update public.next_steps set
  url       = 'app:contact',
  cta_label = coalesce(nullif(cta_label, ''), 'Tell us you’re here')
where id = 'step-new'
  and url is null;


-- ---------------------------------------------------------------------------
-- 2. What the column is allowed to hold
--
-- 0007 described url as an external destination. It is that plus one sentence
-- now, and the comment is what an admin reading the table sees.
-- ---------------------------------------------------------------------------

comment on column public.next_steps.url is
  'Where the step sends people. An https address opens outside the app. A value beginning app: names a place inside it instead, and the app knows a fixed list of them (today: app:contact, the contact form at the top of Connect). Null renders the step as a description with no button, which is honest. Never point this at a page that does not exist.';


-- Read it back.
select id, title, url, cta_label
from public.next_steps
where id = 'step-new';
