-- ===========================================================================
-- Home Church, group rooms, changing the guide a room is running
--
-- WHAT THIS IS FOR. A room is opened against one Sunday's guide and 0016 gave
-- it no way to run a different one. That was fine while the Group tab could
-- only ever open a room on the newest guide, and it stopped being fine the
-- moment the tab grew a carousel: a leader who can swipe to the Sunday before
-- last on the way in will swipe to it in the room too, and until now the only
-- way to act on that was to close the room, open another, and send six new
-- digits round a living room.
--
-- WHAT IT COSTS, and why the cost is right. Replacing the questions deletes
-- the answers written under them. group_room_notes.question_id references
-- group_room_questions on delete cascade, from 0016, and that cascade is not
-- being worked around here: an answer to a question the room is no longer
-- asking has nowhere left to be read, and leaving the rows behind would put
-- them on the sheet at the end of the night underneath a guide nobody
-- discussed. The screen says so in the sentence before the button, with the
-- number in it, and the app asks again when there is anything to lose.
--
-- WHAT SURVIVES. Prayer requests, which hang off no question at all and are
-- the one thing in a room that was never about the guide. Anything the host
-- added themselves, which they wrote rather than inherited: those questions
-- keep their text and are pushed below the new guide's, where they were.
-- Everybody in the room, the code, and the report queue.
--
-- WHO CAN DO IT. The host of that room, checked here rather than trusted from
-- the client, the same as every other write in this feature. There is still
-- no insert, update or delete policy on any of these tables.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or apply_migration. See supabase/ACCESS.md. Safe to run more than once.
-- ===========================================================================

create or replace function public.hc_room_set_guide(
  p_room        uuid,
  p_guide_id    text,
  p_guide_title text,
  p_questions   jsonb        -- [{heading, body}, ...] in order, from the guide
)
returns public.group_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.group_rooms;
  v_base integer;
begin
  select r.* into v_room from public.group_rooms r where r.id = p_room;
  if v_room.id is null then
    raise exception 'No such room.' using errcode = 'P0002';
  end if;

  if not public.hc_room_is_host(p_room) then
    raise exception 'Only the host changes tonight''s guide.' using errcode = '42501';
  end if;

  -- A closed room is a record of an evening, not a room. Nothing rewrites one.
  if v_room.closed_at is not null then
    raise exception 'That room is closed.' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_guide_id, ''))) = 0 then
    raise exception 'A room runs on a guide.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Questions must be an array.' using errcode = '22023';
  end if;

  -- Already there. Returning early rather than doing the work is not an
  -- optimisation: the work deletes the night's answers, and a second tap on
  -- the guide the room is already running must not be what does that.
  if v_room.guide_id is not distinct from p_guide_id then
    return v_room;
  end if;

  -- Out with the carried questions, and their answers with them. See the head
  -- of this file. added_by_host = false is exactly the set that came from a
  -- guide, because hc_room_add_question is the only other way a row gets in
  -- here and it sets the flag.
  delete from public.group_room_questions
   where room_id = p_room and added_by_host = false;

  insert into public.group_room_questions (room_id, heading, body, sort_order)
  select p_room,
         nullif(btrim(q ->> 'heading'), ''),
         btrim(q ->> 'body'),
         (ord * 10)::int
    from jsonb_array_elements(p_questions) with ordinality as t(q, ord)
   where length(btrim(coalesce(q ->> 'body', ''))) > 0;

  -- The host's own questions go back to the bottom of the list. They were
  -- added at the bottom of the old one, and a sort_order taken from that list
  -- would now interleave them with the new guide's, dropping "and one more
  -- thing I wanted to ask" into the middle of somebody else's section.
  select coalesce(max(sort_order), 0) into v_base
    from public.group_room_questions
   where room_id = p_room and added_by_host = false;

  with ranked as (
    select id, row_number() over (order by sort_order, created_at) as rn
      from public.group_room_questions
     where room_id = p_room and added_by_host = true
  )
  update public.group_room_questions q
     set sort_order = v_base + (ranked.rn * 10)::int
    from ranked
   where q.id = ranked.id;

  update public.group_rooms
     set guide_id    = p_guide_id,
         guide_title = nullif(btrim(p_guide_title), ''),
         updated_at  = now()
   where id = p_room
  returning * into v_room;

  return v_room;
end;
$$;

comment on function public.hc_room_set_guide is
  'Point a live room at another guide. Replaces the carried questions and their answers; prayer requests and the host''s own questions stay.';

revoke execute on function public.hc_room_set_guide(uuid, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.hc_room_set_guide(uuid, text, text, jsonb) to authenticated;
