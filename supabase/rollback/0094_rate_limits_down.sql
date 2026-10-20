-- ===========================================================================
-- Undoes 0094. Takes the size caps, the journal count, the push registration
-- checks and the rate counter away again.
-- ===========================================================================

drop trigger if exists journal_entries_cap on public.journal_entries;
drop function if exists public.hc_journal_cap();

do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
      from pg_constraint
     where conrelid in ('public.journal_entries'::regclass, 'public.profiles'::regclass,
                        'public.group_note_reports'::regclass)
       and conname like '%\_size'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- hc_register_device_token as 0037 wrote it.
create or replace function public.hc_register_device_token(
  p_token           text,
  p_platform        text    default 'ios',
  p_new_guide       boolean default true,
  p_sunday_reminder boolean default true,
  p_group_day       boolean default false,
  p_announcements   boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'hc_register_device_token: a token is required';
  end if;
  if length(p_token) > 512 then
    raise exception 'hc_register_device_token: that is not a device token';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'hc_register_device_token: unknown platform %', p_platform;
  end if;
  insert into public.device_tokens (
    token, platform, active,
    wants_new_guide, wants_sunday_reminder, wants_group_day, wants_announcements
  ) values (
    btrim(p_token), p_platform, true,
    coalesce(p_new_guide, false), coalesce(p_sunday_reminder, false),
    coalesce(p_group_day, false), coalesce(p_announcements, false)
  )
  on conflict (token) do update set
    platform              = excluded.platform,
    active                = true,
    wants_new_guide       = excluded.wants_new_guide,
    wants_sunday_reminder = excluded.wants_sunday_reminder,
    wants_group_day       = excluded.wants_group_day,
    wants_announcements   = excluded.wants_announcements,
    failure_count         = 0,
    last_error            = null;
end;
$$;

drop function if exists public.hc_rate_take(text, integer, integer);
drop table if exists public.hc_rate_counts;
