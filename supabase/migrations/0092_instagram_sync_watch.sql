-- ===========================================================================
-- Home Church, the Instagram sync tells somebody when it stops
--
-- WHAT HAPPENED. Between the 13:23 and 14:23 UTC runs on 15 October 2026,
-- the church deleted or archived its newest post, Def2mNnRUiO, posted the
-- night before. That post's page had been the sync's only way into the feed
-- since 13 September: Instagram had stopped answering a crawler's request
-- for the profile page, and a post page lists two dozen others from the same
-- account, so the sync read the newest stored post's page instead. With the
-- post gone its page was the empty JavaScript app, and Instagram's oEmbed
-- called it Media Not Found. Nothing in this project had changed. Every
-- hourly sync after that failed, and instagram_sync_runs recorded each
-- failure faithfully. Nobody reads that table, so the rail sat still for
-- three and a half days and the first anybody knew was a post missing from
-- Connect.
--
-- The door is mended in the Edge Function: three of them now, and the
-- official API ahead of all three. (The public profile JSON, tried as a way
-- round, was no help: on 18 October it answered "Asset asset://laser.
-- provider/ig_business_category_subvertical has been deleted" for every
-- account with a business category that was tried, the church's included.)
--
-- 0062 made the failure visible. This makes it audible, and gives the
-- official API somewhere to keep its token.
--
-- WHAT THIS ADDS
--   1. instagram_sync_runs.note: what a run had to work around.
--   2. A home for the official API's access token, in the vault, and the two
--      functions the Edge Function reads and renews it through. Nothing uses
--      it until somebody stores a token; INSTAGRAM_SYNC_SETUP.md says how.
--   3. hc_instagram_watch, hourly at :53: after six hours without a good run,
--      during the day in Chicago, one push to the admins' phones saying so,
--      again every three days while it lasts, and one when it is over.
--   4. hc_instagram_status: the whole picture, as one row, for a person.
--   5. hc_send_push and push_log learn the `instagram_sync` topic.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0062 (instagram_sync_runs) and 0085 (hc_send_push as it now is).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. What a run had to work around
--
-- A good run can still be news: the API token was refused and a crawler page
-- covered for it, or a door into the feed had been deleted. `error` is for
-- runs that failed; this is for the ones that got there anyway.
--
-- `add column if not exists` rather than relying on the table being new,
-- for the reason 0062's own header gives: a column that only exists in the
-- create statement never reaches a database that already has the table.
-- ---------------------------------------------------------------------------

alter table public.instagram_sync_runs
  add column if not exists note text;

comment on column public.instagram_sync_runs.note is
  'What the run worked around, when anything: a source that failed before another answered, an API token renewed or refused. Null on an ordinary run.';


-- ---------------------------------------------------------------------------
-- 2. The official API's token
--
-- WHY THE VAULT AND NOT A FUNCTION SECRET, which is what INSTAGRAM_SYNC_
-- SETUP.md first said. The token lasts sixty days from its last renewal and
-- the Edge Function renews it every week, which means the function has to
-- write the new one somewhere, and a function cannot write its own secrets.
-- The vault it can write through these two, and a person can store the first
-- token from the SQL Editor without touching the dashboard's secrets page:
--
--   select public.hc_instagram_save_token('IGAA...');
--
-- Neither is callable by anon or authenticated. The first hands back a
-- credential in the clear, the second replaces one, and the only caller of
-- either is the Edge Function, as service_role.
-- ---------------------------------------------------------------------------

create or replace function public.hc_instagram_token()
returns table (token text, saved_at timestamptz)
language sql
stable
security definer
set search_path = vault, public
as $$
  select decrypted_secret, updated_at
    from vault.decrypted_secrets
   where name = 'hc_instagram_token'
     and coalesce(decrypted_secret, '') <> ''
   limit 1;
$$;

revoke all on function public.hc_instagram_token() from public, anon, authenticated;
grant execute on function public.hc_instagram_token() to service_role;

comment on function public.hc_instagram_token() is
  'The Instagram API access token, and when it was last stored, for the instagram-fetch Edge Function. No row means no token, and the function then reads crawler pages only. service_role only: this returns a credential in plaintext.';


create or replace function public.hc_instagram_save_token(p_token text)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_id uuid;
begin
  if v_token = '' then
    raise exception 'hc_instagram_save_token: paste the token between the quotes.';
  end if;
  -- A long-lived Instagram token is a couple of hundred characters with no
  -- spaces. Anything else is a paste that caught the wrong thing.
  if v_token ~ '\s' or length(v_token) < 40 then
    raise exception 'hc_instagram_save_token: that does not look like an Instagram access token.';
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'hc_instagram_token';

  if v_id is null then
    perform vault.create_secret(
      v_token,
      'hc_instagram_token',
      'Instagram API access token for the instagram-fetch Edge Function, which renews it weekly. Replace it with hc_instagram_save_token().'
    );
  else
    -- update_secret stamps updated_at, which is how the function knows when
    -- the token was last renewed.
    perform vault.update_secret(v_id, v_token);
  end if;

  return 'stored';
end;
$$;

revoke all on function public.hc_instagram_save_token(text) from public, anon, authenticated;
grant execute on function public.hc_instagram_save_token(text) to service_role;

comment on function public.hc_instagram_save_token(text) is
  'Stores or replaces the Instagram API access token in the vault. Run once by a person from the SQL Editor, and weekly by instagram-fetch as it renews the token. Not callable by anon or authenticated.';


-- ---------------------------------------------------------------------------
-- 3. The watch
--
-- WHAT COUNTS AS STUCK. Six hours without a good run from the hourly job,
-- either because its runs are failing or because they have stopped arriving
-- at all, which is what a crashed function or a broken door looks like from
-- here. Six because one or two refused hours are Instagram being Instagram,
-- and the rail is never more than an hour behind when it works: six hours of
-- nothing is a fault, not weather. Runs by hand (trigger = 'links') are not
-- counted; somebody was watching those.
--
-- WHO IS TOLD, AND WHEN. The admins, through send-push, which looks up who
-- is an admin at the moment it sends (0043). Between eight in the morning
-- and nine at night in Chicago, because this is never worth waking anybody
-- for: an outage that crosses the line at 3am is reported at 8. Once when it
-- starts, again every three days while it lasts, so a forgotten outage is
-- not a silent one, and once when it is over.
--
-- WHY THE STATE IS HERE AND NOT IN push_log, which is the watermark the new
-- guide notice used to read. push_log's topic list is a constraint, and if
-- section 5 has not reached a database yet, the push still goes out and
-- push_log refuses the line about it. A watch that read push_log would then
-- see nothing sent and send again, every hour. This table is written before
-- the push is asked for, in the same transaction.
-- ---------------------------------------------------------------------------

create table if not exists public.instagram_sync_watch (
  id             boolean primary key default true,
  -- The first failing run of the outage the admins were last told about.
  -- Null when no outage is open. It identifies the outage: a new value is a
  -- new outage, and a new push.
  stalled_since  timestamptz,
  alerted_at     timestamptz,
  told           text,
  updated_at     timestamptz not null default now(),
  constraint instagram_sync_watch_one_row check (id),
  constraint instagram_sync_watch_told_known check (told is null or told in ('stalled', 'recovered'))
);

insert into public.instagram_sync_watch (id) values (true) on conflict (id) do nothing;

comment on table public.instagram_sync_watch is
  'One row: the Instagram outage the admins were last told about, if one is open, and when. Written by hc_instagram_watch only.';

alter table public.instagram_sync_watch enable row level security;
revoke all on public.instagram_sync_watch from anon, authenticated;
grant all on public.instagram_sync_watch to service_role;


create or replace function public.hc_instagram_watch(p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheduled  boolean := true;
  v_last_run   timestamptz;
  v_last_ok    timestamptz;
  v_fail_since timestamptz;
  v_since      timestamptz;
  v_open       timestamptz;
  v_alerted    timestamptz;
  v_hour       int := extract(hour from (p_now at time zone 'America/Chicago'))::int;
  v_awake      boolean;
begin
  v_awake := v_hour between 8 and 20;

  /* Switched off on purpose is not an outage. Read through EXECUTE so this
     function can exist on a database without pg_cron, which is every test
     database this project has. */
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = $1 and active)'
       into v_scheduled using 'hc-instagram-sync';
    if not v_scheduled then return 'the sync is switched off'; end if;
  end if;

  select max(ran_at), max(ran_at) filter (where ok)
    into v_last_run, v_last_ok
    from public.instagram_sync_runs
   where trigger = 'cron';

  if v_last_run is null then return 'no runs yet'; end if;

  select min(ran_at) into v_fail_since
    from public.instagram_sync_runs
   where trigger = 'cron'
     and not ok
     and ran_at > coalesce(v_last_ok, '-infinity'::timestamptz);

  if v_fail_since is not null and v_fail_since <= p_now - interval '6 hours' then
    v_since := v_fail_since;
  elsif v_last_run <= p_now - interval '6 hours' then
    v_since := coalesce(v_fail_since, v_last_run);
  end if;

  insert into public.instagram_sync_watch (id) values (true) on conflict (id) do nothing;
  select stalled_since, alerted_at into v_open, v_alerted
    from public.instagram_sync_watch where id for update;

  if v_since is not null then
    if v_open is distinct from v_since then
      if not v_awake then
        return 'stuck since ' || v_since || '; telling the admins at 8am';
      end if;
      update public.instagram_sync_watch
         set stalled_since = v_since, alerted_at = p_now, told = 'stalled', updated_at = p_now
       where id;
      perform public.hc_send_push('instagram_sync', false, 'stalled');
      return 'told the admins: stuck since ' || v_since;
    end if;

    if v_alerted is null or v_alerted <= p_now - interval '3 days' then
      if not v_awake then
        return 'still stuck since ' || v_since || '; reminding the admins at 8am';
      end if;
      update public.instagram_sync_watch
         set alerted_at = p_now, told = 'stalled', updated_at = p_now
       where id;
      perform public.hc_send_push('instagram_sync', false, 'stalled');
      return 'reminded the admins: stuck since ' || v_since;
    end if;

    return 'stuck since ' || v_since || '; the admins know';
  end if;

  -- Not stuck. If an outage the admins were told about is still open, and the
  -- latest run is good, it is over and they should hear that too.
  if v_open is not null and v_fail_since is null then
    if not v_awake then return 'working again; telling the admins at 8am'; end if;
    update public.instagram_sync_watch
       set stalled_since = null, alerted_at = p_now, told = 'recovered', updated_at = p_now
     where id;
    perform public.hc_send_push('instagram_sync', false,
      'recovered:' || to_char(v_open at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    return 'told the admins: working again';
  end if;

  return case when v_fail_since is null then 'working'
              else 'failing since ' || v_fail_since || ', under six hours' end;
end;
$$;

revoke all on function public.hc_instagram_watch(timestamptz) from public, anon, authenticated;
grant execute on function public.hc_instagram_watch(timestamptz) to service_role;

comment on function public.hc_instagram_watch(timestamptz) is
  'Hourly: tells the admins'' phones when the Instagram sync has gone six hours without a good run, every three days while it lasts, and when it is working again. Daytime in Chicago only. Returns what it decided, in words. p_now is for tests.';


-- The clock. Thirty minutes after the sync at :23, so a slow run has long
-- since written its row, and clear of the jobs on :00, :07, :20, :40 and :47.
do $$
declare
  v_jobid bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'NOT SCHEDULED. pg_cron is not enabled. Then run:';
    raise notice '  select cron.schedule(''hc-instagram-watch'', ''53 * * * *'', $c$select public.hc_instagram_watch();$c$);';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'hc-instagram-watch';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule('hc-instagram-watch', '53 * * * *',
    $c$select public.hc_instagram_watch();$c$);
  raise notice 'Scheduled hc-instagram-watch, hourly at :53.';
end
$$;


-- ---------------------------------------------------------------------------
-- 4. The whole picture, as one row
--
--   select * from public.hc_instagram_status();
--
-- For a person in the SQL Editor, or a session asked "is the rail working",
-- so the answer does not have to be reassembled from three tables and the
-- vault. It says when the token was stored, never what it is.
-- ---------------------------------------------------------------------------

create or replace function public.hc_instagram_status()
returns table (
  working           boolean,
  last_good_run     timestamptz,
  latest_run        timestamptz,
  latest_via        text,
  latest_error      text,
  latest_note       text,
  api_token_stored  timestamptz,
  admins_told       text,
  admins_told_at    timestamptz,
  open_outage_since timestamptz
)
language sql
stable
security definer
set search_path = public, vault
as $$
  with latest as (
    select ran_at, ok, via, error, note
      from public.instagram_sync_runs
     where trigger = 'cron'
     order by ran_at desc
     limit 1
  )
  select
    coalesce((select ok and ran_at > now() - interval '2 hours' from latest), false),
    (select max(ran_at) from public.instagram_sync_runs where trigger = 'cron' and ok),
    (select ran_at from latest),
    (select via from latest),
    (select error from latest),
    (select note from latest),
    (select updated_at from vault.decrypted_secrets
      where name = 'hc_instagram_token' and coalesce(decrypted_secret, '') <> ''),
    w.told,
    w.alerted_at,
    w.stalled_since
  from public.instagram_sync_watch w
  where w.id;
$$;

revoke all on function public.hc_instagram_status() from public, anon, authenticated;
grant execute on function public.hc_instagram_status() to service_role;

comment on function public.hc_instagram_status() is
  'Is the Instagram rail being kept current, and what is it waiting on: one row, for a person. Says when the API token was stored, never the token.';


-- ---------------------------------------------------------------------------
-- 5. The topic
--
-- hc_send_push as 0085 left it, with one more word. The function is a plain
-- replace: same signature, same body.
-- ---------------------------------------------------------------------------

create or replace function public.hc_send_push(
  p_topic   text,
  p_dry_run boolean default false,
  p_ref     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_topic not in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                     'announcement', 'announcement_review', 'event_review',
                     'banner', 'cafe_ready', 'instagram_sync') then
    raise exception 'hc_send_push: unknown topic %', p_topic;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_push_cron_secret';

  if v_secret is null then
    raise exception 'hc_send_push: hc_push_cron_secret is missing from the vault. Re-run migration 0012.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('topic', p_topic, 'dry_run', p_dry_run, 'ref', p_ref),
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_send_push(text, boolean, text) from public, anon, authenticated;
grant execute on function public.hc_send_push(text, boolean, text) to service_role;

/* push_log's vocabulary, last because it is the one statement here that
   drops something, and the Supabase connector holds those for a person to
   confirm (see supabase/manual/0085_finish_in_sql_editor.sql). Everything
   above works without it: the push is sent either way, and only its line in
   push_log is refused until this has run. 'cafe_ready' is here because 0085
   added it and this is the whole list. */
alter table public.push_log drop constraint if exists push_log_topic_known;

alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review',
                   'banner', 'cafe_ready', 'instagram_sync'));


select 'instagram sync watch ready' as status;
