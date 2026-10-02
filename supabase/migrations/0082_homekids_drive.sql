-- ===========================================================================
-- Home Church, HomeKids lessons straight from the director's Drive folder
--
-- WHAT THIS ADDS. The director writes each Sunday's lesson as a Google Doc in
-- a shared folder, one doc per group bundle ("Champions & Heroes", "Legends &
-- Warriors"). Every hour the homekids-drive Edge Function looks in that folder
-- for anything new or changed, has Gemini turn the teacher's plan into the
-- family guide the HomeKids page draws, and leaves it here as a DRAFT. An
-- admin approves it from Admin -> HomeKids, and only then does it reach
-- homekids_lessons and the page.
--
--   homekids_lesson_drafts   One proposed lesson per Sunday, built up as the
--                            Sunday's docs arrive: the Champions & Heroes doc
--                            fills two groups, the Legends doc fills the
--                            third. Admins only. Never readable by the app's
--                            own content sync.
--
--   homekids_drive_files     Every doc the watcher has read, and the version
--                            it read (Drive's modifiedTime). A doc edited
--                            after it was read is read again. Same job the
--                            newsletter_emails ledger does for email.
--
-- WHY A SEPARATE DRAFTS TABLE rather than an unpublished row in
-- homekids_lessons. Half the time a draft is a change to a lesson that is
-- already live: the Legends doc lands on Wednesday after Champions & Heroes
-- was approved on Monday. Writing that change onto the live row would publish
-- it without anybody approving it, and a second "pending" copy of the row in
-- the same table would collide on taught_on. So the live table only ever holds
-- what a person said yes to, and the proposal waits beside it.
--
-- THE CALLER. pg_cron, hourly, through hc_homekids_drive_tick(), with the same
-- vault secret the newsletter reader uses: one secret proving "this came from
-- the database's own schedule" is enough for both jobs.
--
-- Needs 0025 (hc_is_admin), 0038 (the cron secret) and 0081 (homekids_lessons).
-- Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Drafts
-- ---------------------------------------------------------------------------

create table if not exists public.homekids_lesson_drafts (
  id            text primary key,              -- 'homekids-2026-10-04', the lesson it becomes
  taught_on     date not null,
  lesson        jsonb not null default '{}'::jsonb,   -- the proposed homekids_lessons row
  files         jsonb not null default '[]'::jsonb,   -- [{ id, name, groups }] the docs it came from
  note          text,                          -- anything an admin should check, e.g. two dates
  review_state  text not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint homekids_lesson_drafts_lesson_obj check (jsonb_typeof(lesson) = 'object'),
  constraint homekids_lesson_drafts_files_arr  check (jsonb_typeof(files) = 'array'),
  constraint homekids_lesson_drafts_review     check (review_state in ('pending', 'approved', 'discarded'))
);

comment on table public.homekids_lesson_drafts is
  'A HomeKids lesson written by the homekids-drive watcher from the director''s Drive folder, waiting for an admin. Approving copies it into homekids_lessons. Admins only.';

drop trigger if exists homekids_lesson_drafts_set_updated_at on public.homekids_lesson_drafts;
create trigger homekids_lesson_drafts_set_updated_at
  before update on public.homekids_lesson_drafts
  for each row execute function public.hc_set_updated_at();

alter table public.homekids_lesson_drafts enable row level security;

drop policy if exists "homekids drafts are for admins" on public.homekids_lesson_drafts;
create policy "homekids drafts are for admins"
  on public.homekids_lesson_drafts for select
  to authenticated
  using (public.hc_is_admin());

revoke all on public.homekids_lesson_drafts from anon, authenticated;
grant select on public.homekids_lesson_drafts to authenticated;
grant all on public.homekids_lesson_drafts to service_role;


-- ---------------------------------------------------------------------------
-- 2. The file ledger
-- ---------------------------------------------------------------------------

create table if not exists public.homekids_drive_files (
  file_id       text primary key,              -- Drive's id for the doc
  name          text,
  modified_time timestamptz,                   -- the version that was read
  status        text not null default 'read',  -- read, skipped, failed, deferred
  draft_id      text,                          -- the draft it went into
  attempts      integer not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint homekids_drive_files_status check (status in ('read', 'skipped', 'failed', 'deferred'))
);

comment on table public.homekids_drive_files is
  'Every doc in the HomeKids Drive folder the watcher has read, and which version. Delete a row to have that doc read again on the next hour.';

drop trigger if exists homekids_drive_files_set_updated_at on public.homekids_drive_files;
create trigger homekids_drive_files_set_updated_at
  before update on public.homekids_drive_files
  for each row execute function public.hc_set_updated_at();

alter table public.homekids_drive_files enable row level security;

drop policy if exists "homekids drive ledger is for admins" on public.homekids_drive_files;
create policy "homekids drive ledger is for admins"
  on public.homekids_drive_files for select
  to authenticated
  using (public.hc_is_admin());

revoke all on public.homekids_drive_files from anon, authenticated;
grant select on public.homekids_drive_files to authenticated;
grant all on public.homekids_drive_files to service_role;


-- ---------------------------------------------------------------------------
-- 3. Approve and discard
--
-- Approve copies the draft into homekids_lessons, published, on the Sunday the
-- admin confirms. p_taught_on is there because the docs do not always agree
-- with themselves about the date (the first one read said "Oct 4th" in its
-- name and "September 27" in its header), and the admin is the one who knows.
-- Null keeps the draft's own date.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_approve_homekids_lesson(p_id text, p_taught_on date default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d      public.homekids_lesson_drafts%rowtype;
  v_day  date;
  v_id   text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into d from public.homekids_lesson_drafts where id = p_id;
  if not found then
    raise exception 'No HomeKids draft with that id.';
  end if;
  if coalesce(d.lesson->>'title', '') = '' then
    raise exception 'This draft has no title yet, so it cannot go on the page.';
  end if;

  v_day := coalesce(p_taught_on, d.taught_on);
  v_id  := 'homekids-' || to_char(v_day, 'YYYY-MM-DD');

  insert into public.homekids_lessons
    (id, taught_on, title, passage, big_idea, memory_verse, story, groups,
     checklist, prayer, parent_note, source_url, published)
  values
    (v_id, v_day,
     d.lesson->>'title',
     nullif(d.lesson->>'passage', ''),
     nullif(d.lesson->>'big_idea', ''),
     case when jsonb_typeof(d.lesson->'memory_verse') = 'object' then d.lesson->'memory_verse' end,
     case when jsonb_typeof(d.lesson->'story') = 'array' then d.lesson->'story' else '[]'::jsonb end,
     case when jsonb_typeof(d.lesson->'groups') = 'object' then d.lesson->'groups' else '{}'::jsonb end,
     case when jsonb_typeof(d.lesson->'checklist') = 'array' then d.lesson->'checklist' else '[]'::jsonb end,
     nullif(d.lesson->>'prayer', ''),
     nullif(d.lesson->>'parent_note', ''),
     nullif(d.lesson->>'source_url', ''),
     true)
  on conflict (id) do update set
     taught_on = excluded.taught_on, title = excluded.title, passage = excluded.passage,
     big_idea = excluded.big_idea, memory_verse = excluded.memory_verse,
     story = excluded.story, groups = excluded.groups, checklist = excluded.checklist,
     prayer = excluded.prayer, parent_note = excluded.parent_note,
     source_url = excluded.source_url, published = true;

  update public.homekids_lesson_drafts
     set review_state = 'approved', taught_on = v_day
   where id = p_id;

  return v_id;
end;
$$;

revoke all on function public.hc_admin_approve_homekids_lesson(text, date) from public, anon, authenticated;
grant execute on function public.hc_admin_approve_homekids_lesson(text, date) to authenticated;

create or replace function public.hc_admin_discard_homekids_lesson(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;
  update public.homekids_lesson_drafts set review_state = 'discarded' where id = p_id;
  if not found then
    raise exception 'No HomeKids draft with that id.';
  end if;
end;
$$;

revoke all on function public.hc_admin_discard_homekids_lesson(text) from public, anon, authenticated;
grant execute on function public.hc_admin_discard_homekids_lesson(text) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. The hourly tick
-- ---------------------------------------------------------------------------

create or replace function public.hc_homekids_drive_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret  text;
  v_request bigint;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';

  if v_secret is null then
    raise exception 'hc_homekids_drive_tick: hc_newsletter_cron_secret is missing from the vault. Run migration 0038.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/homekids-drive',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 120000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_homekids_drive_tick() from public, anon, authenticated;

do $$
declare
  v_jobid bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'NOT SCHEDULED. pg_cron is not enabled. Then run:';
    raise notice '  select cron.schedule(''hc-homekids-drive'', ''7 * * * *'', $c$select public.hc_homekids_drive_tick();$c$);';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'hc-homekids-drive';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  -- Seven minutes past every hour, off the top of the hour where everybody
  -- else's jobs pile up, and clear of the newsletter's twenty minute marks.
  perform cron.schedule('hc-homekids-drive', '7 * * * *',
    $c$select public.hc_homekids_drive_tick();$c$);
  raise notice 'Scheduled hc-homekids-drive, hourly.';
end
$$;
