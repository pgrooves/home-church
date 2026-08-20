-- ===========================================================================
-- Home Church, the journal
--
-- Everything a person writes in the app: a note on something they highlighted
-- in a guide, an answer to a self-reflection question, or a blank page opened
-- in somebody's living room. One row per entry, and nobody but its author
-- ever reads it.
--
-- THIS IS NOT SHAPED LIKE 0016, AND THAT IS THE POINT. Group rooms needed
-- SECURITY DEFINER functions for every write, because in a room one person
-- writes a row and a different person reads it, and the rules about who may
-- see what are too important to leave to policies spread across five tables.
-- None of that applies here. There is exactly one reader and one writer of
-- any row and they are the same person, so four ordinary policies on
-- `auth.uid() = user_id` are the entire security model. The precedent to read
-- first is 0009, the profiles table, not 0016.
--
-- WHAT WE CAN HONESTLY PROMISE, because the privacy policy now says it. No
-- other account can read these rows: that is what the policies below enforce,
-- and there is no view, function or join anywhere in this schema that lets
-- one person reach another person's entries. What we cannot promise is that
-- the rows are unreadable by whoever administers the database. They are text
-- in a table. Encrypting them so that not even the church could read them
-- needs a key, sign-in here is a one time code with no password to derive one
-- from, and a key that lives on a single phone makes the sync pointless. So
-- the app says "only you can see it", which is true of every screen anybody
-- has, and the privacy policy says the longer version, which is that a
-- database administrator could read them and that nobody at this church has a
-- screen that shows them. See js/screens/legal.js.
--
-- NOT ON THE NINETY DAY SWEEP. Migration 0022 expires group room content,
-- because that is other people's writing sitting in a shared place and it
-- should not accumulate forever. A journal is the opposite of that. It
-- expires when its owner deletes it or deletes their account, and not before.
--
-- NO WORD FILTER. 0020 exists because a room is read by other people. Nothing
-- here is. A filter on a private diary would be an insult.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The table
--
-- ON THE PRIMARY KEY. `id` has no default and is never generated here. The
-- phone mints it, because an entry written on a plane with no signal is a
-- real entry the moment it is typed, and it has to keep the same identity
-- when it finally uploads three days later. That is also what makes the push
-- an idempotent upsert rather than a question about whether this row already
-- went up.
--
-- ON THE TWO BODIES. body_html is the sanitized subset the editor produces,
-- six tags and one attribute, see the allowlist in js/journal.js. body_text
-- is the same words with the markup taken out. Both are stored because they
-- are read in different places: the editor renders the first, and search, the
-- export, and anything that crosses into a group room use the second. Storing
-- one and deriving the other on read would mean running a sanitizer inside a
-- list of forty cards.
--
-- ON deleted_at. Deletes are soft on purpose. A hard delete syncs as an
-- absence, and an absence looks exactly like a row the other phone has not
-- been told about yet, so the other phone helpfully uploads it again, and
-- again. A tombstone is a row that says the thing is gone, and it travels
-- like any other row.
-- ---------------------------------------------------------------------------

create table if not exists public.journal_entries (
  id           uuid primary key,

  user_id      uuid not null references auth.users (id) on delete cascade,

  -- entry      a blank page somebody opened
  -- highlight  something selected in a guide, with or without a note
  -- reflection an answer to one of a guide's self-reflection questions
  -- night      what somebody kept from a group room before it expired
  kind         text not null default 'entry',

  guide_id     text,
  -- Denormalized for the same reason group_rooms.guide_title is: a guide can
  -- be renamed or unpublished, and an entry from last spring still has to
  -- read right.
  guide_title  text,

  -- The anchor, for a highlight or a reflection. path addresses a block of
  -- the guide ('shortSummary.2'), quote is the text that was selected, and
  -- the offsets are the fallback when the words have moved. See the note on
  -- locate() in js/journal.js.
  path         text,
  quote        text,
  range_start  int,
  range_end    int,

  title        text,
  body_html    text,
  body_text    text,

  -- Every Bible Gateway link in the body, as the references they name.
  refs         text[] not null default '{}',

  pinned       boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint journal_entries_kind_known
    check (kind in ('entry', 'highlight', 'reflection', 'night'))
);

comment on table public.journal_entries is
  'One person''s own writing. Nobody else ever reads a row here.';
comment on column public.journal_entries.id is
  'Minted on the phone, not here, so an entry written offline keeps its identity when it uploads.';
comment on column public.journal_entries.body_html is
  'The sanitized subset from js/journal.js. Never trust it; it is sanitized again on render.';
comment on column public.journal_entries.body_text is
  'The same words without markup. What search reads and what may cross into a group room.';
comment on column public.journal_entries.deleted_at is
  'A tombstone. Set rather than deleting the row, or the other phone uploads it again.';


-- ---------------------------------------------------------------------------
-- 2. Indexes
--
-- The pull is "everything of mine that changed since I last looked", which is
-- the first index. The second is the Group tab asking what this person has
-- already written about tonight's guide.
-- ---------------------------------------------------------------------------

create index if not exists journal_entries_user_updated
  on public.journal_entries (user_id, updated_at desc);

create index if not exists journal_entries_user_guide
  on public.journal_entries (user_id, guide_id)
  where guide_id is not null and deleted_at is null;


-- ---------------------------------------------------------------------------
-- 3. updated_at
--
-- Last write wins, per entry, on this column, so it has to be true. The phone
-- sends its own value and this trigger does not overwrite it: two devices
-- editing the same entry are compared on when each person typed, not on which
-- request happened to reach Postgres first over a slow connection.
--
-- What it does do is fill in a value that was not sent, so a row can never
-- sit at null and win or lose a comparison by accident.
-- ---------------------------------------------------------------------------

create or replace function public.hc_journal_touch()
returns trigger language plpgsql as $$
begin
  if new.updated_at is null then new.updated_at = now(); end if;
  if new.created_at is null then new.created_at = now(); end if;
  -- The owner is never something the client gets to assert. Whatever came in
  -- the payload, the row belongs to whoever is making the request.
  new.user_id = auth.uid();
  return new;
end;
$$;

drop trigger if exists journal_entries_touch on public.journal_entries;
create trigger journal_entries_touch
  before insert or update on public.journal_entries
  for each row execute function public.hc_journal_touch();


-- ---------------------------------------------------------------------------
-- 4. Row level security
--
-- Four policies, all the same sentence: this row is yours or it is not here.
--
-- The insert policy has a with check and no using clause because there is no
-- existing row to test. The update policy has both: `using` decides which
-- rows you may touch, `with check` stops you handing one to somebody else.
-- The trigger above already forces user_id to the caller, so the with check
-- is the second lock on the same door, which is the right number of locks for
-- the door that decides whether one person can read another person's diary.
-- ---------------------------------------------------------------------------

alter table public.journal_entries enable row level security;

drop policy if exists journal_entries_select_own on public.journal_entries;
create policy journal_entries_select_own
  on public.journal_entries for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists journal_entries_insert_own on public.journal_entries;
create policy journal_entries_insert_own
  on public.journal_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists journal_entries_update_own on public.journal_entries;
create policy journal_entries_update_own
  on public.journal_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists journal_entries_delete_own on public.journal_entries;
create policy journal_entries_delete_own
  on public.journal_entries for delete
  to authenticated
  using (auth.uid() = user_id);

-- anon gets nothing. Not a policy that returns no rows: no grant at all, so
-- a signed out request cannot even ask.
revoke all on public.journal_entries from anon;
grant select, insert, update, delete on public.journal_entries to authenticated;


-- ---------------------------------------------------------------------------
-- 5. Deleting an account
--
-- Nothing to add. `on delete cascade` on user_id means the delete-account
-- Edge Function removes somebody's whole journal in the same transaction that
-- removes the user, without knowing this table exists. Said out loud here
-- because the next person to add a table holding personal writing should copy
-- this line rather than remembering to edit that function.
-- ---------------------------------------------------------------------------
