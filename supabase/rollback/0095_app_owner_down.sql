-- ===========================================================================
-- Undoes 0095. Puts hc_admin_set_role and hc_guard_role_change back as 0025
-- wrote them and takes the owner table away. Redeploy admin-remove-user from
-- the commit before 0095 first, since the 0095 version reads the table and
-- refuses every removal without it.
-- ===========================================================================

create or replace function public.hc_admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_role not in ('member', 'admin') then
    raise exception 'Unknown role: %', p_role;
  end if;

  if p_user = auth.uid() then
    raise exception 'You cannot change your own role.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles set role = p_role where id = p_user;

  if not found then
    raise exception 'That person has no profile row.';
  end if;
end;
$$;

create or replace function public.hc_guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not public.hc_is_admin() then
    raise exception 'Only an admin can change a role.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.id = auth.uid() then
    raise exception 'An admin cannot change their own role.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop function if exists public.hc_admin_owner_ids();
drop function if exists public.hc_is_owner(uuid);
drop table if exists public.app_owners;
