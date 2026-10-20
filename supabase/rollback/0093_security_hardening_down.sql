-- ===========================================================================
-- Undoes 0093. Puts the room list back open to anon, which is the hole 0093
-- closed: run this only to get a broken build working while a real fix is
-- found, and say so somewhere.
--
-- device_tokens' policies are restored exactly as 0010 wrote them. They still
-- do nothing without a grant, and this does not add one.
-- ===========================================================================

grant select on public.group_rooms to anon;
drop policy if exists "a live room can be found by its code" on public.group_rooms;
create policy "a live room can be found by its code"
  on public.group_rooms for select
  to anon, authenticated
  using (closed_at is null and closes_at > now());

grant select on public.group_room_questions to anon;
drop policy if exists "questions follow the room" on public.group_room_questions;
create policy "questions follow the room"
  on public.group_room_questions for select
  to anon, authenticated
  using (public.hc_room_is_live(room_id) or public.hc_room_is_member(room_id));

grant execute on function public.hc_room_is_live(uuid)   to anon;
grant execute on function public.hc_room_is_member(uuid) to anon;

drop policy if exists "a phone can register itself"    on public.device_tokens;
drop policy if exists "a phone can update its own row" on public.device_tokens;
create policy "a phone can register itself"
  on public.device_tokens for insert
  to anon, authenticated
  with check (true);
create policy "a phone can update its own row"
  on public.device_tokens for update
  to anon, authenticated
  using (true) with check (true);

alter function public.hc_cafe_today() reset search_path;
