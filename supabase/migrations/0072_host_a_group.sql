-- ===========================================================================
-- Home Church, the group step asks you to host, not to lead
--
-- The Connect step that recruits group leaders has read "I want to lead a
-- group" since migration 0006 seeded it. The church asks for hosts: opening
-- your house on a weeknight is the commitment, and "lead" reads like a
-- qualification somebody has to already have. Its button has said "Sign up to
-- host" since 0007, so the card has been asking for two different things in
-- two different places. This settles it on the church's word.
--
-- Title only. The blurb ("We will train you and hand you a guide every week.")
-- and the cta_label are both editable from Edit mode, so this file leaves
-- them where the church last put them. js/data.js carries the same title as
-- the bundled fallback, changed in the same commit, so a phone with no signal
-- and a phone that has synced say the same thing.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The step's title
--
-- Written only where the title is still the seeded one. If somebody has since
-- renamed this step from Edit mode or in the dashboard, that is a deliberate
-- choice by the church and a re-run of this file must not undo it.
-- ---------------------------------------------------------------------------

update public.next_steps set
  title = $hc$I want to host a group$hc$
where id = 'step-group'
  and title = $hc$I want to lead a group$hc$;


-- Read it back.
select id, title, cta_label
from public.next_steps
where id = 'step-group';
