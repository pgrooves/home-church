-- ===========================================================================
-- Home Church, the verse sheet's memory
--
-- WHAT THIS TABLE IS FOR. supabase/functions/bible-passage fetches the words
-- of a passage from YouVersion Platform for the verse sheet in js/verse.js.
-- Every guide sends a whole church to the same ten or twelve passages in the
-- same week, so without this each phone would cost YouVersion a request for
-- John 3:16 of its own. With it, the first phone does and the rest are
-- answered from here.
--
-- WHAT IS IN A ROW. A Bible id (111 is the NIV), a passage id in YouVersion's
-- own form (JHN.3.16-JHN.3.18), the reference written out, and the text. One
-- extra row per Bible, passage_id '_meta', holds that version's abbreviation
-- and copyright line as JSON, so the function is not asking for those on
-- every request either.
--
-- HOW LONG. The function ignores a row older than thirty days and fetches it
-- again, which is how a correction on YouVersion's side reaches the app. Old
-- rows are overwritten in place rather than piling up, so there is nothing to
-- sweep.
--
-- NOBODY BUT THE FUNCTION CAN SEE IT. anon and authenticated get no grants,
-- the same posture 0047 took with contact_messages, for a plainer reason:
-- this is licensed text, and a table the publishable key could read would be
-- a copy of the NIV for anybody who asked. The function holds the service
-- role key and needs no policy. The app never reads this directly.
--
-- IF YOUVERSION'S TERMS EVER SAY NO to keeping text on our side, set the
-- Edge Function secret YVP_CACHE=off and truncate this table. The function
-- works without it; it just asks YouVersion every time.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or apply_migration. See supabase/ACCESS.md. Safe to run more than once.
-- ===========================================================================

create table if not exists public.scripture_cache (
  bible_id    integer     not null,
  passage_id  text        not null,
  reference   text        not null default '',
  content     text        not null,
  fetched_at  timestamptz not null default now(),
  primary key (bible_id, passage_id),

  -- Bounded here as well as in the function, because the function is not the
  -- only thing that will ever hold the service role key. The longest thing it
  -- asks for is a few chapters; a hundred thousand characters is well past
  -- that and well short of the whole book.
  constraint scripture_cache_passage_id_check
    check (char_length(passage_id) between 1 and 40),
  constraint scripture_cache_content_check
    check (char_length(content) between 1 and 100000)
);

comment on table public.scripture_cache is
  'Passages fetched from YouVersion for the verse sheet. Written and read only by the bible-passage Edge Function. See migration 0076.';

-- --------------------------------------------------------------- the grants

alter table public.scripture_cache enable row level security;

revoke all on public.scripture_cache from anon, authenticated;
grant all on public.scripture_cache to service_role;
