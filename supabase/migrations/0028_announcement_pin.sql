-- ===========================================================================
-- Home Church, pinning an announcement to the top of the app
--
-- WHAT THIS ADDS. One boolean on announcements. With it on, the app draws a
-- strip under the top bar carrying that announcement's title, on every tab
-- rather than only on Home, and tapping the strip takes you to the card.
--
-- WHY IT IS A COLUMN ON THE ANNOUNCEMENT rather than a third app setting next
-- to home_banner_on and home_banner_message. Those two are a sentence with no
-- announcement behind it, which is exactly right for "the building is closed
-- on Sunday" and is why they stay. What they cannot be is tappable: a message
-- typed into a settings field has nowhere to go. Hanging the flag on the row
-- means the banner has an announcement behind it by construction, so the title
-- is always the announcement's own title, retiring the announcement retires
-- the banner, and the two can never drift apart. See js/app.js.
--
-- MORE THAN ONE PINNED ROW IS ALLOWED, and the app shows the top one, by the
-- same priority-then-newest order Home lists announcements in. A unique index
-- was the other option and it is worse: it turns pinning the Sunday notice
-- into an error somebody has to go and clear rather than a thing that quietly
-- takes over the strip, and it would have to be enforced from the form as
-- well, which is a second place for the rule to live.
--
-- Nothing about the window changes. starts_on and ends_on already decide when
-- an announcement is on screen, and the strip is drawn from the same live list
-- Home draws, so a pinned announcement that has come down takes its banner
-- with it with no second date to keep in step.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0003 (the table) and 0026 (the admin write policies).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The column
--
-- Default false, and not null, so every row already in the table answers the
-- question the app asks of it without a migration having to guess which
-- announcement somebody would have pinned.
-- ---------------------------------------------------------------------------

alter table public.announcements
  add column if not exists pinned boolean not null default false;

comment on column public.announcements.pinned is
  'Draws this announcement''s title as a tappable strip under the top bar, on every tab. Dismissed per phone, in localStorage, keyed on the id. See migration 0028.';


-- ---------------------------------------------------------------------------
-- 2. The index
--
-- Partial, and tiny: the app asks "which announcements are pinned" on every
-- content refresh and the answer is nearly always none or one. The same shape
-- as device_tokens_announcement_idx in 0027, for the same reason.
-- ---------------------------------------------------------------------------

create index if not exists announcements_pinned_idx
  on public.announcements (pinned) where pinned;


-- ---------------------------------------------------------------------------
-- 3. Policies and grants: nothing to do
--
-- Deliberately empty, so nobody goes looking for the section that is missing.
-- Reads are row level, not column level: the public select policy from 0003
-- already hands this column to anon and authenticated along with the rest of
-- the row, which is what lets a signed out phone see the strip. Writes are
-- covered by the admin insert/update policies from 0026 section 4, which are
-- written against the table rather than a column list.
-- ---------------------------------------------------------------------------
