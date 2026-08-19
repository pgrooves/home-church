-- ===========================================================================
-- Home Church, group rooms, telling the host there is something to open
--
-- THE BUG THIS FIXES, and how it hid for five migrations.
--
-- 0016's rule is that a closed answer does not leave the database, for
-- anybody, the host included. That rule is right and it is the whole feature.
-- What nobody noticed is that it also takes away the one thing the host needs
-- in order to run the reveal: knowing that an answer exists.
--
-- The host's desk is a row of names, one per answer, and you tap a name to
-- open it. It was built from the notes the phone had. Under the real policy
-- the phone has none of them, so the desk read "Nothing written here yet"
-- while four people sat in the room waiting for their answers to come up,
-- and there was no chip to tap. The same hole made the member's line, "3
-- answers are in, your leader opens them when the group gets here", never
-- appear either, because that count came from the same place.
--
-- It survived every test because every test so far handed the screen a
-- snapshot with all the notes in it. Only a browser talking to a real
-- PostgREST over the real policies shows it, which is what finally did.
--
-- THE FIX. A function that returns the answers without their bodies. Not a
-- policy change: the policy is correct and this migration does not touch it.
-- The index has no body column at all, so no future edit to it can leak the
-- text, which is a stronger guarantee than remembering not to select one.
--
-- WHO SEES A NAME. The host, always, because the desk is a list of names. A
-- member, only for answers that are already open or their own. Everybody else
-- gets the row with the name nulled, which is exactly enough to count and not
-- enough to work out who has not answered yet. That decision is made here
-- rather than in the screen, because "the screen only draws what it should"
-- is the kind of promise this feature has already learned not to make.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or apply_migration. See supabase/ACCESS.md. Safe to run more than once.
-- ===========================================================================

create or replace function public.hc_room_answer_index(p_room uuid)
returns table (
  id          uuid,
  question_id uuid,
  kind        text,
  author_id   uuid,
  author_name text,
  opened_at   timestamptz,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.question_id,
    n.kind,
    case when public.hc_room_is_host(p_room)
           or n.opened_at is not null
           or n.author_id = auth.uid()
         then n.author_id end,
    case when public.hc_room_is_host(p_room)
           or n.opened_at is not null
           or n.author_id = auth.uid()
         then n.author_name end,
    n.opened_at,
    n.created_at
  from public.group_room_notes n
  where n.room_id = p_room
    and n.removed_at is null
    -- Membership is checked here rather than left to a policy, because a
    -- security definer function has no policy over it.
    and public.hc_room_is_member(p_room)
    -- Somebody you have blocked does not reappear as a chip on the desk.
    and not exists (
      select 1 from public.group_blocks b
      where b.blocker_id = auth.uid() and b.blocked_id = n.author_id
    );
$$;

comment on function public.hc_room_answer_index is
  'Who has answered and whether it is open, with no bodies. The host runs the reveal from this; a member counts with it.';

revoke execute on function public.hc_room_answer_index(uuid) from public, anon, authenticated;
grant  execute on function public.hc_room_answer_index(uuid) to authenticated;
