-- ===========================================================================
-- Home Church, group rooms, letting a host close a report
--
-- WHAT WAS MISSING. 0016 gave a host exactly one way to deal with a reported
-- note: hc_room_take_down, which removes it for everybody and resolves the
-- report in the same breath. That is the right tool when the report is right.
-- It is the only tool, which means a host who looks at a report and decides
-- the note is fine has nothing to press, and the report sits open forever.
--
-- Guideline 1.2 asks for a mechanism to report objectionable content and for
-- it to be acted on. "Acted on" includes deciding it was nothing. A queue
-- that can only be emptied by deleting somebody's writing is a queue that
-- teaches hosts to delete, or to ignore it, and both are worse than the thing
-- 1.2 was worried about.
--
-- So: one function, host only, that marks a report resolved and leaves the
-- note where it is. The app draws the open ones as a banner at the top of the
-- room, and now there are two buttons under each rather than one.
--
-- Privileges follow the rule 0018 arrived at the hard way, and follow it in
-- the file that creates the function rather than in a later one: revoke from
-- public AND anon AND authenticated by name, then grant back. On this project
-- a new function is world executable the moment it exists.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or apply_migration. See supabase/ACCESS.md. Safe to run more than once.
-- ===========================================================================

create or replace function public.hc_room_resolve_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_room uuid;
begin
  select room_id into v_room from public.group_note_reports where id = p_report;
  if v_room is null then
    raise exception 'No such report.' using errcode = 'P0002';
  end if;
  if not public.hc_room_is_host(v_room) then
    raise exception 'Only the host closes a report.' using errcode = '42501';
  end if;

  update public.group_note_reports
     set resolved_at = now(), resolved_by = auth.uid()
   where id = p_report and resolved_at is null;
end;
$$;

comment on function public.hc_room_resolve_report is
  'Marks a report handled and leaves the note alone. The other outcome is hc_room_take_down, which removes it.';

revoke execute on function public.hc_room_resolve_report(uuid) from public, anon, authenticated;
grant  execute on function public.hc_room_resolve_report(uuid) to authenticated;
