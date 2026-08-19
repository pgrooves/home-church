-- ===========================================================================
-- Home Church, group rooms, the posting filter
--
-- WHY THIS EXISTS. Guideline 1.2 lists four things an app with user generated
-- content must have. Three of them were already built: a report control on
-- every note, blocking, and published contact information, plus agreement to
-- terms before a first post. The fourth is "a method for filtering
-- objectionable material from being posted to the app", and until this
-- migration there was not one. A reviewer reads that list literally.
--
-- WHAT IS ON THE LIST, AND WHAT DELIBERATELY IS NOT. Slurs, and nothing else.
-- Not ordinary profanity, and not the words that come up when somebody is
-- being honest. The whole point of a group room is a person typing the true
-- answer to "what is your Lo-debar", and the true answer sometimes involves
-- addiction, divorce, suicide, or a word they would not say from the stage. A
-- filter that swallowed those would do more damage to this app than anything
-- 1.2 is worried about, and it would teach people to write the safe answer,
-- which is the one nobody needs to read.
--
-- So the test for the list is narrow: a word whose only use is to degrade
-- somebody for what they are. Those have no honest use in a small group, and
-- refusing them costs nothing.
--
-- A TABLE RATHER THAN A CONSTANT, because the church will want to change it
-- and should not need a migration and an engineer to do it. Nobody but
-- service_role can read or write it: there is no reason for a phone to be
-- able to download the list, and every reason not to.
--
-- MATCHING. Word boundaries, case insensitive. Substring matching is how you
-- get the Scunthorpe problem, where a filter refuses a town, a surname, or
-- "class" and the person on the other end has no idea what they did wrong.
-- The message names the problem so a false positive is at least legible.
--
-- WHERE IT RUNS. Inside hc_room_post and hc_room_edit_note, which are the
-- only two ways text enters a room, so there is no path around it. Editing is
-- checked as well as posting, or the filter would be one edit deep.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or apply_migration. See supabase/ACCESS.md. Safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The list
-- ---------------------------------------------------------------------------

create table if not exists public.group_filter_terms (
  term       text primary key,
  added_at   timestamptz not null default now()
);

comment on table public.group_filter_terms is
  'Guideline 1.2 posting filter. Slurs only, never ordinary profanity: see migration 0020.';

alter table public.group_filter_terms enable row level security;
-- No policy at all, on purpose. RLS with no policy denies everything to
-- anon and authenticated, and service_role bypasses it. The list is the
-- church's and a phone has no business reading it.

-- Seeded, because a filter with an empty list is not a filter. Stored lower
-- case; the check lowers the text before matching.
insert into public.group_filter_terms (term) values
  ('nigger'), ('nigga'), ('niggers'),
  ('faggot'), ('faggots'), ('fag'), ('fags'),
  ('kike'), ('kikes'),
  ('spic'), ('spics'),
  ('chink'), ('chinks'),
  ('wetback'), ('wetbacks'),
  ('tranny'), ('trannies'),
  ('retard'), ('retards'), ('retarded'),
  ('coon'), ('coons'),
  ('gook'), ('gooks'),
  ('paki'), ('pakis'),
  ('towelhead'), ('towelheads'),
  ('raghead'), ('ragheads')
on conflict (term) do nothing;

-- Two words a general purpose list would carry and this one does not, both
-- for the same reason: this church is in New Orleans.
--
--   dyke   is how the levee is spelled about a third of the time, and a group
--          here will talk about the levee. Blocking it would refuse a sentence
--          about the city with no way for the person to work out why.
--   coon   stays, but note that the word boundary is doing real work: a
--          Louisianian writing coonass, which people here apply to themselves,
--          is not matched, because \M requires the word to end after coon.

-- ---------------------------------------------------------------------------
-- 2. The check
--
-- Returns the first term found, or null when the text is fine, so the caller
-- can decide what to say. Security definer because the table is closed to
-- everybody: the whole point is that the check runs without the caller being
-- able to read the list and work around it.
-- ---------------------------------------------------------------------------

create or replace function public.hc_text_offends(p_text text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f.term
    from public.group_filter_terms f
   -- Every non alphanumeric character in a term is escaped before it becomes
   -- part of a pattern, so a term somebody types into the table cannot turn
   -- into a regex that matches everything, or nothing.
   where lower(coalesce(p_text, '')) ~ ('\m' || regexp_replace(f.term, '([^a-z0-9])', '\\\1', 'g') || '\M')
   limit 1;
$$;

comment on function public.hc_text_offends is
  'Null when the text may be posted, otherwise the term that stopped it. Word boundaries, case insensitive.';

-- Nobody calls this from a phone. It runs inside hc_room_post and
-- hc_room_edit_note, which are security definer themselves and so do not
-- need a grant. Following the rule 0018 arrived at the hard way: revoke from
-- public AND anon AND authenticated by name, and grant nothing back.
revoke execute on function public.hc_text_offends(text) from public, anon, authenticated;

revoke all on public.group_filter_terms from public, anon, authenticated;
grant all on public.group_filter_terms to service_role;

-- ---------------------------------------------------------------------------
-- 3. The two doors text comes through
--
-- Both functions are restated in full rather than patched, because create or
-- replace is all Postgres offers and a half remembered copy is how the body
-- of one of these quietly loses a check. Everything below except the filter
-- block is 0016's, unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.hc_room_post(
  p_room     uuid,
  p_question uuid,          -- null for a prayer request
  p_kind     text,
  p_body     text
)
returns public.group_room_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note   public.group_room_notes;
  v_name   text;
  v_agreed timestamptz;
  v_bad    text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.hc_room_is_member(p_room) then
    raise exception 'Join the room first.' using errcode = '42501';
  end if;
  if not public.hc_room_is_live(p_room) then
    raise exception 'That room is closed.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Nothing to post.' using errcode = '22023';
  end if;

  -- Guideline 1.2, the filter. Before anything is written, not after.
  v_bad := public.hc_text_offends(p_body);
  if v_bad is not null then
    raise exception 'That reads as a slur, so it did not go in. Say it another way and the room will hear you.'
      using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(p.first_name), ''), 'Someone'), p.terms_accepted_at
    into v_name, v_agreed
    from public.profiles p where p.id = auth.uid();

  -- Guideline 1.2: agreement before a first post, checked here rather than on
  -- the screen so that skipping the screen does not skip the rule.
  if v_agreed is null then
    raise exception 'Agree to the group terms before posting.' using errcode = '42501';
  end if;

  insert into public.group_room_notes
    (room_id, question_id, kind, author_id, author_name, body, opened_at)
  values (
    p_room,
    case when p_kind = 'prayer' then null else p_question end,
    case when p_kind = 'prayer' then 'prayer' else 'answer' end,
    auth.uid(),
    coalesce(v_name, 'Someone'),
    btrim(p_body),
    -- A prayer request is never held back. An answer waits for the host.
    case when p_kind = 'prayer' then now() else null end
  )
  returning * into v_note;

  return v_note;
end;
$$;

create or replace function public.hc_room_edit_note(p_note uuid, p_body text)
returns public.group_room_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.group_room_notes;
  v_bad  text;
begin
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;

  -- The same gate as posting. Without this the filter is one edit deep.
  v_bad := public.hc_text_offends(p_body);
  if v_bad is not null then
    raise exception 'That reads as a slur, so the change did not go in. Say it another way and the room will hear you.'
      using errcode = '22023';
  end if;

  update public.group_room_notes
     set body = btrim(p_body)
   where id = p_note and author_id = auth.uid() and removed_at is null
  returning * into v_note;

  if v_note.id is null then
    raise exception 'That is not yours to edit.' using errcode = '42501';
  end if;
  return v_note;
end;
$$;

-- create or replace resets nothing about privileges on an existing function,
-- but these are restated so that a fresh database built by running the
-- migrations in order ends up in the same place as a patched one.
revoke execute on function public.hc_room_post(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.hc_room_post(uuid, uuid, text, text) to authenticated;
revoke execute on function public.hc_room_edit_note(uuid, text) from public, anon, authenticated;
grant  execute on function public.hc_room_edit_note(uuid, text) to authenticated;
