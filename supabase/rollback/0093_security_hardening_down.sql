-- ===========================================================================
-- Undoes 0093.
--
-- device_tokens' policies are restored exactly as 0010 wrote them. They still
-- do nothing without a grant, and this does not add one.
-- ===========================================================================

drop trigger if exists profiles_guard_insert on public.profiles;
drop function if exists public.hc_guard_profile_insert();

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
