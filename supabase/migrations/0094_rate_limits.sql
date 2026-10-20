-- ===========================================================================
-- Home Church, limits on what a flood of requests can do
--
-- From a pass on 20 October 2026 asking one question of every door in the
-- app: what happens if somebody sends a thousand of these in a minute. Most
-- doors already had an answer (the contact form's five an hour per address,
-- 0056's ten wrong room codes an hour, the admin buttons' cooldowns, the
-- cron functions' secrets). These are the ones that did not.
--
-- 1. A GENERAL COUNTER for the Edge Functions, hc_rate_take(bucket, max,
--    seconds): true if the bucket has room in its current window, false if
--    not. A fixed window per bucket, one row each, nothing ever deleted.
--    service_role only; the app never calls it.
--
--    First used by bible-passage, where every lookup the cache does not
--    have is a call against the church's YouVersion key. Unlimited, a script
--    could spend that allowance in an afternoon and every verse sheet in the
--    app would fail until it reset.
--
-- 2. PUSH REGISTRATION. hc_register_device_token is callable without
--    signing in, because that is who registers a phone, so it cannot count
--    per person. It now refuses NEW tokens past 200 in ten minutes across
--    everybody, which is far past any Sunday's real sign ups and stops a
--    script filling device_tokens with junk that every push run then walks.
--    Updating a phone that is already registered is never refused.
--
-- 3. SIZE CAPS. journal_entries and profiles had no length limit on any text
--    column, and group_note_reports.reason had none either. The free plan's
--    database is 500 MB and goes read-only when full, which takes the whole
--    app with it; one signed in account sending megabyte rows in a loop could
--    do that. Every text column on those tables now has a ceiling, generous
--    next to anything a person writes (a journal entry's body may be 100,000
--    characters, roughly fifteen thousand words), and a person may keep at
--    most 5,000 journal entries. Saving an entry that already exists is never
--    refused by the count.
--
--    The caps are added to whichever text columns exist, rather than named
--    one by one, so this runs the same on the live project and on the test
--    harness's smaller profiles table, and a column added later is not
--    silently uncapped because nobody remembered this file.
--
-- NOT HERE, because it is not the database: the cafe's limit on unpaid
-- orders lives in supabase/functions/cafe-checkout, and the YouVersion limit
-- in supabase/functions/bible-passage.
--
-- Written without DROP: the connection the live project was changed through
-- does not run one. Re-runnable.
--
-- Rollback: supabase/rollback/0094_rate_limits_down.sql
-- Tests:    supabase/tests/0094_rate_limits_test.sql
-- ===========================================================================

-- 1. The counter. One row per bucket: when its window started, and how many
--    requests it has counted since. A request after the window has passed
--    starts a fresh one. No row is ever deleted, so the table is one row per
--    bucket that has ever been used, which for the per-address buckets is one
--    small row per address.
create table if not exists public.hc_rate_counts (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  n            integer not null default 0
);
alter table public.hc_rate_counts enable row level security;
revoke all on public.hc_rate_counts from public, anon, authenticated;

comment on table public.hc_rate_counts is
  'One row per rate bucket: the start of its current window and how many requests it has counted in it. Written only by hc_rate_take. See migration 0094.';

create or replace function public.hc_rate_take(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_n      integer;
begin
  -- One statement, so two requests landing together are counted in turn by
  -- the row lock and cannot both take the last place.
  insert into public.hc_rate_counts as c (bucket, window_start, n)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    window_start = case when c.window_start <= now() - v_window then now() else c.window_start end,
    n            = case when c.window_start <= now() - v_window then 1 else c.n + 1 end
  returning n into v_n;

  return v_n <= p_max;
end;
$$;

revoke all on function public.hc_rate_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hc_rate_take(text, integer, integer) to service_role;

-- 2. Push registration: a ceiling on new phones.
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

  -- A phone already here is updated whatever the count; only new ones wait.
  if not exists (select 1 from public.device_tokens where token = btrim(p_token))
     and (select count(*) from public.device_tokens
           where created_at > now() - interval '10 minutes') >= 200 then
    raise exception 'hc_register_device_token: too many new phones at once, try again in a few minutes'
      using errcode = 'P0001';
  end if;

  insert into public.device_tokens (
    token, platform, active,
    wants_new_guide, wants_sunday_reminder, wants_group_day, wants_announcements
  ) values (
    btrim(p_token), p_platform, true,
    coalesce(p_new_guide, false),
    coalesce(p_sunday_reminder, false),
    coalesce(p_group_day, false),
    coalesce(p_announcements, false)
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

-- 3. Size caps on every text column of the three tables.
do $$
declare
  r     record;
  cname text;
  cap   integer;
  caps  jsonb := '{
    "journal_entries":    {"body_html": 100000, "body_text": 100000, "quote": 10000,
                           "title": 500, "guide_title": 500, "guide_id": 200,
                           "path": 500, "kind": 50, "_default": 2000},
    "profiles":           {"photo_url": 2000, "_default": 200},
    "group_note_reports": {"reason": 1000, "_default": 1000}
  }';
begin
  for r in
    select table_name, column_name, data_type
      from information_schema.columns
     where table_schema = 'public'
       and table_name in ('journal_entries', 'profiles', 'group_note_reports')
       and data_type in ('text', 'ARRAY')
       and not (table_name = 'profiles' and column_name = 'role')
  loop
    cname := r.table_name || '_' || r.column_name || '_size';
    if exists (select 1 from pg_constraint where conname = cname) then
      continue;
    end if;
    if r.data_type = 'ARRAY' then
      execute format('alter table public.%I add constraint %I check (cardinality(%I) <= 200)',
                     r.table_name, cname, r.column_name);
    else
      cap := coalesce((caps -> r.table_name ->> r.column_name)::integer,
                      (caps -> r.table_name ->> '_default')::integer);
      execute format('alter table public.%I add constraint %I check (length(%I) <= %s)',
                     r.table_name, cname, r.column_name, cap);
    end if;
  end loop;
end $$;

-- And a ceiling on how many journal entries one person keeps.
create or replace function public.hc_journal_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The caller, not new.user_id: 0023's journal_entries_touch forces the
  -- owner to auth.uid(), but it fires after this one (triggers run in name
  -- order), so new.user_id here is whatever the request claimed. Counting
  -- that would let anybody dodge the ceiling by naming somebody else.
  v_owner uuid := coalesce(auth.uid(), new.user_id);
begin
  -- An upsert of an entry that already exists is a save, not a new entry.
  if exists (select 1 from public.journal_entries where id = new.id) then
    return new;
  end if;
  if (select count(*) from public.journal_entries where user_id = v_owner) >= 5000 then
    raise exception 'That is the most journal entries one account can keep.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.hc_journal_cap() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'journal_entries_cap') then
    create trigger journal_entries_cap
      before insert on public.journal_entries
      for each row execute function public.hc_journal_cap();
  end if;
end $$;
