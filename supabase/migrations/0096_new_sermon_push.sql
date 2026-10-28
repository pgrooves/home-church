-- ===========================================================================
-- Home Church, "the sermon audio is up"
--
-- WHAT THIS ADDS. A topic, `new_sermon`, sent once a week at the end of
-- /new-podcast, when that Sunday's episode has been attached to its message
-- and the Listen tab can play it. And a switch for it in Your account, between
-- "A new guide is posted" and "Sunday reminder".
--
-- OFF UNLESS SOMEBODY TURNS IT ON. Every other topic defaults on, because a
-- yes to notifications at all is taken as a yes to them. This one does not:
-- the church asked for it to be something a person chooses. So the column
-- defaults false, the first-launch "turn everything on" in js/native.js leaves
-- it alone, and the only thing that ever writes true is somebody tapping it.
--
-- WHY IT IS SENT BY A PERSON'S COMMAND AND NOT BY A TRIGGER ON podcasts. A
-- trigger would fire on every write to that table, and most of them are not
-- news: a typo fixed in a summary, the title rename, a backfill of last
-- year's catalogue. The one moment that is news is the end of a successful
-- /new-podcast run, so that is the one caller, through
-- hc_announce_new_sermon() below. A run that fails anywhere sends nothing.
--
-- WHY ITS OWN DOOR FOR THE SWITCH, not a seventh argument to
-- hc_register_device_token. Adding a parameter changes the function's
-- signature, which is a DROP and CREATE (see 0027 section 3). Without the
-- drop there would be two hc_register_device_token functions, and PostgREST
-- refuses a call that matches both, which is every call an installed build
-- makes on launch. With it, the connection the live project is changed
-- through holds the drop for a person. Neither is worth it for one boolean.
-- So the registration is untouched, and hc_set_device_new_sermon() sets this
-- one column on a row the registration already made.
--
-- SAFE FOR EVERY BUILD ALREADY INSTALLED. Nothing a shipped build reads or
-- calls is renamed or removed. An installed build has no switch, so its
-- phones keep wants_new_sermon false and are never sent this. Its launch
-- re-register does not name the column, so it cannot turn it off either.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0012, 0043 and 0092. Safe to run more than once.
--   Deploy the send-push Edge Function AFTER this has run: it reads the new
--   column, and a send-push that knows the topic before the column exists
--   fails that one send and nothing else.
--
-- Rollback: supabase/rollback/0096_new_sermon_push_down.sql
-- Tests:    supabase/tests/0096_new_sermon_push_test.sql
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The switch, server side
-- ---------------------------------------------------------------------------

alter table public.device_tokens
  add column if not exists wants_new_sermon boolean not null default false;

comment on column public.device_tokens.wants_new_sermon is
  'The "New sermon audio" switch in Your account. Default false, unlike the others: the church wants this one chosen, not assumed. Written only by hc_set_device_new_sermon. See 0096.';

create index if not exists device_tokens_new_sermon_idx
  on public.device_tokens (wants_new_sermon) where active and wants_new_sermon;


-- ---------------------------------------------------------------------------
-- 2. Told once
--
-- The same idea as guides.push_announced_at: a message is announced at most
-- once, whether or not anybody had the switch on, so running /new-podcast
-- again after a correction does not buzz everybody a second time.
-- ---------------------------------------------------------------------------

alter table public.podcasts
  add column if not exists push_announced_at timestamptz;

comment on column public.podcasts.push_announced_at is
  'When the "sermon audio is up" notification went out for this message. Null means never. Stamped by hc_announce_new_sermon before it sends, so two runs cannot both send.';


-- ---------------------------------------------------------------------------
-- 3. A phone says yes or no
--
-- Called by the app straight after hc_register_device_token, and again
-- whenever the switch moves. Updates a row the registration made and never
-- creates one, so it is not a second way in: a token with no registration
-- behind it is a miss, and a miss is silent, the same as
-- hc_deactivate_device_token.
--
-- Anon may call it for the reason every phone-side push door here is anon:
-- there are no accounts on most phones. What a caller can do with it is
-- what 0010 already states for the table: somebody who holds a token can
-- change what that phone hears. Nobody else can.
-- ---------------------------------------------------------------------------

create or replace function public.hc_set_device_new_sermon(p_token text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'hc_set_device_new_sermon: a token is required';
  end if;

  update public.device_tokens
     set wants_new_sermon = coalesce(p_on, false)
   where token = btrim(p_token);
end;
$$;

revoke all on function public.hc_set_device_new_sermon(text, boolean) from public;
grant execute on function public.hc_set_device_new_sermon(text, boolean) to anon, authenticated;

comment on function public.hc_set_device_new_sermon(text, boolean) is
  'Sets the "New sermon audio" switch for one registered phone. Never creates a row: hc_register_device_token does that. See 0096.';


-- ---------------------------------------------------------------------------
-- 4. Every switch off means this one too
--
-- hc_deactivate_device_token as 0043 left it, plus the new column. Current
-- builds no longer call it, older ones still do, and "turn everything off"
-- has to keep meaning everything.
-- ---------------------------------------------------------------------------

create or replace function public.hc_deactivate_device_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'hc_deactivate_device_token: a token is required';
  end if;

  update public.device_tokens
     set active                    = false,
         wants_new_guide           = false,
         wants_sunday_reminder     = false,
         wants_group_day           = false,
         wants_announcements       = false,
         wants_new_sermon          = false,
         admin_user_id             = null,
         wants_announcement_review = false,
         wants_event_review        = false
   where token = btrim(p_token);
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. The topic
--
-- hc_send_push as 0092 left it, with one more word. Same signature, so a
-- plain replace.
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
                     'banner', 'cafe_ready', 'instagram_sync', 'new_sermon') then
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


-- ---------------------------------------------------------------------------
-- 6. The one caller: the last step of /new-podcast
--
-- Checks the row before anything is sent, for the reason 0027 gives for
-- announcements: a lock screen cannot be taken back. So it refuses a message
-- that is unpublished, that has no episode to play (Listen would still say
-- "Audio coming soon!"), that was preached more than two weeks ago (a
-- backfill is not news), or that has been announced already.
--
-- The stamp is written before the send, in the same statement that checks
-- it, so two runs at once cannot both get past the check. If the send then
-- fails, nobody is told, which is the outcome the church asked for when
-- anything goes wrong.
--
-- service_role only. The slash command runs with that key; no phone and no
-- signed-in person can reach it.
-- ---------------------------------------------------------------------------

create or replace function public.hc_announce_new_sermon(p_id text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_row   public.podcasts%rowtype;
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  select * into v_row from public.podcasts where id = p_id;

  if not found then
    raise exception 'No message with id %.', p_id;
  end if;

  if not v_row.published then
    raise exception 'That message is not published. Nobody was told.';
  end if;

  if v_row.episode_url is null or btrim(v_row.episode_url) = '' then
    raise exception 'That message has no episode link yet, so there is nothing to listen to. Nobody was told.';
  end if;

  if v_row.preached_on is null or v_row.preached_on < v_today - 14 then
    raise exception 'That message is from % and this only announces the last two weeks. Nobody was told.',
      coalesce(v_row.preached_on::text, 'an unknown date');
  end if;

  update public.podcasts
     set push_announced_at = now()
   where id = p_id and push_announced_at is null;

  if not found then
    raise exception 'Everybody who asked was already told about this message. Nothing was sent again.';
  end if;

  return public.hc_send_push('new_sermon', false, p_id);
end;
$$;

revoke all on function public.hc_announce_new_sermon(text) from public, anon, authenticated;
grant execute on function public.hc_announce_new_sermon(text) to service_role;

comment on function public.hc_announce_new_sermon(text) is
  'The last step of /new-podcast: tells the phones that asked that this message can be listened to. Refuses an unpublished row, one with no episode, one older than two weeks, or one already announced. service_role only. See 0096.';


-- ---------------------------------------------------------------------------
-- 7. push_log's vocabulary
--
-- Last, because it is the one statement here that drops something, and the
-- Supabase connector holds those for a person to confirm (see
-- supabase/manual/0085_finish_in_sql_editor.sql). Everything above works
-- without it: the push is sent either way, and only its line in push_log is
-- refused until this has run.
-- ---------------------------------------------------------------------------

alter table public.push_log drop constraint if exists push_log_topic_known;

alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review',
                   'banner', 'cafe_ready', 'instagram_sync', 'new_sermon'));


select 'new sermon push ready' as status;
