-- ===========================================================================
-- Home Church, the home groups box says where home groups actually stand
--
-- WHAT THIS ADDS. Two things an admin can do to the paragraph on Connect that
-- stands where the group finder normally is:
--
--   a button   "Update from the latest announcement". It asks the
--              newsletter-intake Edge Function to find the most recent
--              announcement about home groups, shorten it into something the
--              size of that box, and write it there. One tap, no typing.
--
--   a form     the same paragraph, editable on the Admin screen, with a
--              flyer to go above it. Because the shortening is a starting
--              point and the person who runs this church is the one who knows
--              whether it is right.
--
-- WHY THE BOX AND NOT THE FINDER. groups_in_season stays false and this does
-- not touch it. The finder needs real rows in `groups`, and the four in there
-- are still placeholders with invented hosts (see 0008). More to the point,
-- the season that prompted this is joined by text message rather than by
-- picking a group in the app, so the paragraph IS the feature this season.
-- Flipping the boolean would publish four fictional groups and take the
-- paragraph off the screen, which is the opposite of what is wanted.
--
-- WHY THE BUTTON WRITES STRAIGHT TO THE COLUMN, when the newsletter intake
-- next door writes drafts nobody sees until they are approved. Those are two
-- different promises and the difference is who is standing there. The intake
-- runs every twenty minutes with nobody watching and writes a card that goes
-- to the whole church, so it queues. This runs only when an admin taps a
-- button that says what it will do, and the result lands in one paragraph
-- they are looking at and can edit in place a second later. The tap is the
-- review. What it must not be is unrecoverable, which is what
-- `previous_note` in the run log below is for: whatever the box said before
-- is kept, so a shortening somebody dislikes is one copy and paste from
-- being undone.
--
-- WHAT THE MODEL IS NOT ALLOWED TO LOSE. Every link, date, time and phone
-- number in the announcement has to survive into the shortened version. That
-- is enforced in the Edge Function, after the model answers and before
-- anything is written: a shortening that dropped the sign-up link is refused
-- and logged as a failure, and the box keeps the words it had. A paragraph
-- that reads beautifully and has lost the number you text to get in is worse
-- than the between-seasons sentence it replaced.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0007 (the note), 0025 (hc_is_admin), 0026 (the announcements
--   bucket) and 0038 (the vault secret and the Edge Function).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The flyer
--
-- A season usually comes with a piece of art, and until now the only place to
-- put one was an announcement card on Home. The paragraph on Connect is where
-- somebody goes looking for groups a week later, when the card has retired, so
-- it gets its own.
--
-- ONE URL AND NOT A LIST, unlike announcements (0033). A flyer is one image by
-- definition, and the second one on a card is a gallery — a different feature
-- with a different layout, and not one this box wants.
--
-- The image is drawn at whatever shape it actually is, capped so a tall
-- portrait flyer cannot swallow the screen. Nothing here records a shape,
-- deliberately: cropping a flyer is how the date at the bottom of it goes
-- missing. See .hc-group__flyer in css/screens.css.
-- ---------------------------------------------------------------------------

alter table public.church_profile
  add column if not exists groups_note_image_url text;

comment on column public.church_profile.groups_note_image_url is
  'A flyer above the home groups paragraph on Connect. Uploaded by an admin into the announcements bucket, or carried over from the picture on the announcement the note was shortened from. Null is the ordinary case and draws no frame at all.';


-- ---------------------------------------------------------------------------
-- 2. group_status_runs, the heartbeat
--
-- Shaped like newsletter_runs from 0038 and here for exactly the same reason:
-- pg_net posts to the Edge Function and throws the response away, so the only
-- record of what happened is the one the function writes about itself.
--
-- It carries more than a log needs, and the extra columns are the safety net:
--
--   previous_note   what the box said before this run. The undo.
--   new_note        what it says now. Null on a run that wrote nothing.
--   announcement_id which announcement was shortened, so a note that reads
--                   oddly can be compared against the words it came from.
--
-- `ok` means the run itself worked. A run that read every announcement and
-- found nothing about home groups is a success with changed = false and a
-- note saying so, which is a different row from Gemini being unreachable.
-- ---------------------------------------------------------------------------

create table if not exists public.group_status_runs (
  id              bigint generated always as identity primary key,
  ran_at          timestamptz not null default now(),
  ok              boolean not null default true,
  changed         boolean not null default false,
  announcement_id text,
  previous_note   text,
  previous_image  text,
  new_note        text,
  note            text
);

comment on table public.group_status_runs is
  'One row per tap of Update from the latest announcement. Holds what the box said before the run, so a shortening nobody likes can be put back.';
comment on column public.group_status_runs.changed is
  'True only when the paragraph on Connect actually moved. A run that found no home groups announcement is ok and changed = false.';
comment on column public.group_status_runs.previous_note is
  'What groups_off_season_note held immediately before this run wrote over it. The undo, and the reason this table is not just a log.';
comment on column public.group_status_runs.previous_image is
  'The flyer that was above the note before this run, so undoing puts the card back the way it was rather than half way back. Null when there was none, which is its own state and not the same as unknown.';

-- The announcement it read, and the log outlives it. Same reasoning as 0038's
-- source_email_id and 0040's event_id: a run that cannot be deleted because a
-- log row points at it is the worse of the two problems.
do $$
begin
  alter table public.group_status_runs
    add constraint group_status_runs_announcement_fk
    foreign key (announcement_id) references public.announcements (id)
    on delete set null;
exception
  when duplicate_object then null;   -- already there, this file re-runs
end
$$;

create index if not exists group_status_runs_recent_idx
  on public.group_status_runs (ran_at desc);


-- ---------------------------------------------------------------------------
-- 3. Who can read the log
--
-- Admins, and nobody else. The Admin screen draws the last run as a line under
-- the button ("Updated from Home Groups Open, September 6, four minutes ago"),
-- and there is nothing in here for a member: the outcome they care about is
-- the paragraph itself, which has been publicly readable since 0007.
--
-- No write policy at all, which is the mechanism rather than an oversight.
-- The Edge Function writes these rows with the service role, which bypasses
-- RLS; a phone has no business writing its own history.
-- ---------------------------------------------------------------------------

alter table public.group_status_runs enable row level security;

grant select on public.group_status_runs to authenticated;
revoke insert, update, delete on public.group_status_runs from anon, authenticated;

drop policy if exists "admins read the group status log" on public.group_status_runs;

create policy "admins read the group status log"
  on public.group_status_runs for select
  to authenticated
  using (public.hc_is_admin());


-- ---------------------------------------------------------------------------
-- 4. Saving the paragraph and the flyer together
--
-- WHY A FUNCTION AND NOT TWO COLUMN GRANTS. 0030 and 0031 built the narrow
-- thing on purpose: an admin's phone may write an allowlist of prose columns
-- and nothing else, and groups_off_season_note has been on that list since
-- 0030. A URL column is not prose. Handing `authenticated` a straight UPDATE
-- on one would let any admin session point that image anywhere on the
-- internet, which is a tracking pixel on the Connect tab and a picture the
-- church does not control on a screen it does.
--
-- So the column is written through here, and here checks that the URL is one
-- of ours before it lands: the public storage prefix of this project, which is
-- where uploadImage() in js/admin.js puts a file the admin just chose. Anything
-- else is refused in the app's own voice rather than stored.
--
-- The two move together for the reason 0040 gives about announcements and
-- events: a flyer saved without the words that explain it, because the second
-- PATCH failed on a bad connection, is a screen nobody meant to publish.
--
-- THE TEXT COLUMN KEEPS ITS 0031 GRANT and this does not replace it. Edit
-- mode still turns that paragraph into a text box where it is written on
-- Connect, and still PATCHes it directly. Both doors write the same column and
-- both check that the person is an admin; this one just also carries a
-- picture.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_set_group_note(
  p_note      text,
  p_image_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_image text := nullif(btrim(coalesce(p_image_url, '')), '');
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  -- The same ceiling text_overrides carries in 0030, and for the same reason:
  -- this is a paragraph in a layout built for a paragraph.
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'That note is longer than the box can hold. 2000 characters is the ceiling.';
  end if;

  /* Ours or nothing. The prefix is this project's public storage, so an
     uploaded flyer passes and a link somebody pasted from an email does not.
     Said as a sentence because an admin will read it in a toast. */
  if v_image is not null
     and v_image not like 'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/announcements/%' then
    raise exception 'That picture has to be one uploaded here, not a link to somewhere else.';
  end if;

  update public.church_profile
     set groups_off_season_note = v_note,
         groups_note_image_url  = v_image
   where published;
end;
$$;

revoke all on function public.hc_admin_set_group_note(text, text) from public, anon, authenticated;
grant execute on function public.hc_admin_set_group_note(text, text) to authenticated;

comment on function public.hc_admin_set_group_note(text, text) is
  'Writes the home groups paragraph on Connect and the flyer above it, together. Admins only, checked inside. The image must be an upload in this project''s announcements bucket. See migration 0048.';


-- ---------------------------------------------------------------------------
-- 5. The button
--
-- Shaped exactly like hc_admin_fetch_newsletter in 0039, including the
-- cooldown, and for the same three reasons: the Edge Function proves its
-- caller with a secret that lives in the vault and must never reach a phone;
-- an admin therefore cannot call it directly and should not be able to; and a
-- button whose result takes half a minute to appear gets tapped six times.
--
-- ONE FUNCTION HERE RATHER THAN 0039'S TWO. 0039 is a wrapper around
-- hc_newsletter_tick because pg_cron calls the tick every twenty minutes and
-- the wrapper is the door cut into it for a person. Nothing is on a clock
-- here — there is no reason to re-shorten the same announcement all day — so
-- there is one door and it is this, and the vault read lives behind the same
-- hc_is_admin() check rather than behind a second function nothing else calls.
--
-- IT REUSES THE NEWSLETTER'S SECRET AND ITS FUNCTION, on purpose. This is the
-- same Edge Function with another mode in it, the way `backfill` is, so there
-- is no second deployment, no second secret to set, and no second place for
-- the two to drift apart. See supabase/functions/newsletter-intake/index.ts.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_refresh_group_status()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_last    timestamptz;
  v_secret  text;
  v_request bigint;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select max(ran_at) into v_last from public.group_status_runs;

  -- A person, not a constraint violation. Same wording as 0039.
  if v_last is not null and v_last > now() - interval '15 seconds' then
    raise exception 'That was just done. Give it a few seconds.';
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';

  if v_secret is null then
    raise exception 'hc_admin_refresh_group_status: hc_newsletter_cron_secret is missing from the vault. Re-run migration 0038.';
  end if;

  /* Fire and forget, like every other pg_net call in this project. The
     function writes its own outcome to group_status_runs because the response
     to this request goes nowhere at all. 60 seconds: one Gemini call and two
     small queries, with no mailbox in the way. */
  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/newsletter-intake',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('group_status', true),
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_admin_refresh_group_status() from public, anon, authenticated;
grant execute on function public.hc_admin_refresh_group_status() to authenticated;

comment on function public.hc_admin_refresh_group_status() is
  'Asks the newsletter-intake Edge Function to shorten the most recent home groups announcement into the paragraph on Connect. Admins only, checked inside. Takes no arguments: the most it can cause is that paragraph changing, and group_status_runs keeps what it said before. See migration 0048.';


-- ---------------------------------------------------------------------------
-- 6. What the advisor will say, and why it is fine
--
-- 0011_function_search_path_mutable: not raised, both functions pin it.
--
-- 0039_authenticated_security_definer_function_executable on both
-- hc_admin_set_group_note and hc_admin_refresh_group_status, which is the same
-- warning 0025 section 6 and 0039 section 2 already record for every other
-- admin function in this project, and it is fine for the same reason: here a
-- SECURITY DEFINER function IS the permission boundary, so the ones that
-- matter are exactly the ones that have to be callable. The advisor sees the
-- grant and cannot see the hc_is_admin() check on the first line of each.
-- ---------------------------------------------------------------------------
