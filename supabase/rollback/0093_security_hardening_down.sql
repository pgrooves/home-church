-- ===========================================================================
-- Undoes 0093. Puts the room list back open to anon, which is the hole 0093
-- closed: run this only to get a broken build working while a real fix is
-- found, and say so somewhere.
--
-- device_tokens' policies are restored exactly as 0010 wrote them. They still
-- do nothing without a grant, and this does not add one.
-- ===========================================================================

grant select on public.group_rooms to anon;
alter policy "members read the room they are in" on public.group_rooms
  rename to "a live room can be found by its code";
alter policy "a live room can be found by its code" on public.group_rooms
  to anon, authenticated
  using (closed_at is null and closes_at > now());

grant select on public.group_room_questions to anon;
alter policy "questions follow the room" on public.group_room_questions
  to anon, authenticated
  using (public.hc_room_is_live(room_id) or public.hc_room_is_member(room_id));

grant execute on function public.hc_room_is_live(uuid)   to anon;
grant execute on function public.hc_room_is_member(uuid) to anon;

alter policy "clients do not write device_tokens directly" on public.device_tokens
  rename to "a phone can register itself";
alter policy "a phone can register itself" on public.device_tokens
  with check (true);
alter policy "clients do not update device_tokens directly" on public.device_tokens
  rename to "a phone can update its own row";
alter policy "a phone can update its own row" on public.device_tokens
  using (true) with check (true);

alter function public.hc_cafe_today() reset search_path;

drop trigger if exists profiles_guard_insert on public.profiles;
drop function if exists public.hc_guard_profile_insert();
