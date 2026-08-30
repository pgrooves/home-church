-- ===========================================================================
-- Home Church, the weekly newsletter becomes draft announcements
--
-- WHAT THIS ADDS. A mailbox that receives exactly one thing, a job that reads
-- it every twenty minutes, and a review queue on the Admin screen. The church
-- newsletter arrives once a week carrying four or five separate things, and
-- until now every one of them was retyped into the Post an announcement form
-- by hand. After this, they are already typed and waiting to be approved.
--
-- NOTHING HERE PUBLISHES ANYTHING. That is the whole design and it is worth
-- saying before the columns. Every row this pipeline writes is `published =
-- false`, which 0003 has always treated as the draft state and which 0026's
-- select policy narrows to admins only. The app's content sync reads with the
-- publishable key and no session, so a parsed draft cannot reach Home even on
-- the phone of the admin looking at it. Approving is a person tapping a
-- button, and it is the only thing in this file that sets published to true.
--
-- WHY THE TABLE ALREADY DOES MOST OF THIS. announcements gained a draft state
-- in 0003, admin writes in 0026, and an admin list that shows drafts in the
-- same pass. So this migration adds two columns to it and no more: the whole
-- review queue is `published = false and review_state = 'pending'`, drawn from
-- the list the Admin screen is already holding. A separate `announcement_drafts`
-- table was the other option and it is worse in the way that matters: it would
-- need its own copy of every column, its own policies, and a promotion step
-- that could disagree with the form. See 0003's header on why a sixth content
-- type that does not look like the other five is worth a second thought.
--
-- THE TWO LOG TABLES, and why there are two rather than one. They answer two
-- different questions and a single table would answer neither well.
--
--   newsletter_emails  One row per email ever seen, keyed on its Message-ID.
--                      This is the thing that makes "never parsed twice" true.
--   newsletter_runs    One row per poll, whether or not it found anything.
--                      This is the thing that makes a failure visible.
--
-- The second exists because of a failure the first cannot record. If the IMAP
-- login is refused there is no email, so there is no email row, so a broken
-- pipeline and a quiet week look identical from the ledger. push_log in 0012
-- exists for the same reason and this is deliberately shaped like it.
--
-- WHY DEDUPE IS ON Message-ID AND NOT ON THE \Seen FLAG. The IMAP flag is the
-- obvious answer and it is not durable: it lives in the mailbox, and anybody
-- who opens that inbox in a browser to check on it marks the message read and
-- the next poll skips a newsletter nobody has reviewed. Worse, the reverse is
-- one tap away too, and marking it unread again would re-parse it into a
-- second set of drafts. Message-ID is assigned by the sender, is required to
-- be globally unique by RFC 5322, and does not change when somebody reads
-- their mail. The flag is still set, as a cheap way to keep the common poll
-- from fetching bodies it has already parsed, but it is the optimisation and
-- this table is the rule.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0003 (announcements), 0025 (hc_is_admin) and 0026 (the admin writes).
--   Safe to run more than once.
--
-- AFTER RUNNING IT, the pipeline is still asleep until the secrets are set on
-- the Edge Function. NEWSLETTER_INTAKE_SETUP.md at the repo root is the whole
-- list and the reason for each one. Section 6 below prints the cron secret
-- this file generates, which is the first of them.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Extensions
--
-- Both already exist from 0012 and both are named again here, because a
-- migration that silently depends on an earlier one having been run is a
-- migration that fails at 11pm with a confusing error.
--
-- WHY THIS IS GUARDED RATHER THAN TWO BARE `create extension` LINES, which is
-- what 0012 has. Two reasons, and the second is the real one.
--
-- The first is 0022's argument: an extension is a thing a project may or may
-- not have, and a migration that dies on a missing one has told you less than
-- a migration that says which one and carries on. Everything in this file
-- except the schedule works without either extension; only the clock needs
-- them, and section 9 already knows how to say so.
--
-- The second is that this migration has a test file, and the test harness in
-- supabase/tests/ is a bare Postgres with neither extension in it. 0012 is
-- absent from the harness's migration list for exactly this reason and its
-- security claims have never been asserted against a real role as a result.
-- A migration that can only run on production is a migration nobody tests.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  else
    raise notice 'pg_net is not available here. The tick in section 8 will not be able to call out.';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  else
    raise notice 'pg_cron is not available here. See section 9.';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 2. newsletter_emails, the ledger
--
-- One row per email the poll has ever looked at, written whether the parse
-- worked or not. A failed parse is still a seen email: writing the row only on
-- success would mean an email Gemini choked on gets retried every twenty
-- minutes forever, and each retry costs a model call.
--
-- message_id is `not null unique` and that unique index is the actual dedupe
-- mechanism, not a nicety. The Edge Function checks the table before it parses
-- and inserts after, so the window between those two is closed by the
-- constraint rather than by hoping two polls never overlap. A poll that loses
-- that race gets a 23505 and skips, which is the correct outcome.
--
-- WHAT IS DELIBERATELY NOT STORED: the body. The parsed drafts carry the words
-- that matter, this table holds enough to recognise an email and say what
-- happened to it, and a table of full newsletter bodies is a copy of somebody
-- else's mailbox sitting in a database that never needed one. `note` holds the
-- reason a parse failed, which is a sentence, not a payload.
-- ---------------------------------------------------------------------------

create table if not exists public.newsletter_emails (
  id           bigint generated always as identity primary key,
  message_id   text not null unique,        -- the RFC 5322 header, verbatim
  imap_uid     bigint,                      -- for finding it again by hand
  subject      text,
  from_addr    text,
  sent_at      timestamptz,                 -- the email's own Date header
  status       text not null default 'parsed',
  drafts       integer not null default 0,  -- how many announcements came out
  note         text,
  created_at   timestamptz not null default now(),

  constraint newsletter_emails_status_known
    check (status in ('parsed', 'empty', 'failed'))
);

comment on table public.newsletter_emails is
  'One row per newsletter email ever read, keyed on its Message-ID. This is what stops an email being parsed into a second set of drafts. Never holds the body.';
comment on column public.newsletter_emails.status is
  'parsed: drafts were written. empty: read fine, nothing in it looked like an announcement. failed: could not be read or could not be parsed, and `note` says why.';
comment on column public.newsletter_emails.note is
  'Why a parse came back empty or failed, in a sentence. Read by the Admin screen, so it is written for a person and not for a log.';

create index if not exists newsletter_emails_recent_idx
  on public.newsletter_emails (created_at desc);


-- ---------------------------------------------------------------------------
-- 3. newsletter_runs, the heartbeat
--
-- Shaped like push_log from 0012 and read for the same reason: pg_net posts to
-- the Edge Function and forgets, so the function's return value goes nowhere
-- and the only record of what happened is the one the function writes itself.
--
-- `ok` is the column the Admin screen actually reads. A run that reached the
-- mailbox and found nothing new is the normal case six days out of seven and
-- is a success, so "nothing found" and "could not sign in" must not be the
-- same row shape. They are `ok = true, found = 0` and `ok = false, note = ...`
-- respectively.
-- ---------------------------------------------------------------------------

create table if not exists public.newsletter_runs (
  id         bigint generated always as identity primary key,
  ran_at     timestamptz not null default now(),
  ok         boolean not null default true,
  found      integer not null default 0,   -- unread messages the mailbox had
  parsed     integer not null default 0,   -- of those, ones we had not seen
  drafts     integer not null default 0,   -- announcements written
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.newsletter_runs is
  'One row per newsletter poll. Exists because an IMAP failure produces no email row at all, so without this a broken pipeline and a quiet week look identical.';
comment on column public.newsletter_runs.ok is
  'False only when the run itself failed: the mailbox was unreachable, the login was refused, or a secret is missing. A run that found nothing new is ok with found = 0.';

create index if not exists newsletter_runs_recent_idx
  on public.newsletter_runs (ran_at desc);


-- ---------------------------------------------------------------------------
-- 4. What an announcement now remembers about where it came from
--
-- Three columns, and every one of them is null or defaulted on the rows that
-- already exist, so nothing written by hand before today changes at all.
--
--   source          'admin' or 'newsletter'. Provenance, and what the review
--                   card's eyebrow says.
--   review_state    null on everything a person wrote. The parsed rows walk
--                   pending -> approved or pending -> discarded and stop.
--   source_email_id which email it came out of, for tracing a bad parse back
--                   to the thing that caused it.
--
-- WHY review_state EXISTS AND published IS NOT ENOUGH. Approving is
-- `published = true`, which published already says. Discarding is the case
-- that needs the column: a discarded draft and an unreviewed one are both
-- unpublished rows written by the robot, and without somewhere to record the
-- decision, discarding something would leave it in the queue forever. This is
-- also why discarding does not delete: the row drops out of the review queue
-- and lands in the ordinary Posted list as a draft, where the Delete button
-- that has been there since 0026 can remove it for good. One tap to get it out
-- of the way, and nothing irreversible behind an undefended tap.
--
-- WHY THE FOREIGN KEY IS `on delete set null`. newsletter_emails is a log and
-- logs get pruned. An announcement that outlives the record of the email it
-- came from is fine and normal; an announcement that cannot be deleted because
-- a log row points at it is not. The direction matters: the announcement is
-- the thing worth keeping.
-- ---------------------------------------------------------------------------

alter table public.announcements
  add column if not exists source          text not null default 'admin',
  add column if not exists review_state    text,
  add column if not exists source_email_id bigint;

do $$
begin
  alter table public.announcements
    add constraint announcements_source_known check (source in ('admin', 'newsletter'));
exception
  when duplicate_object then null;   -- already there, this file re-runs
end
$$;

do $$
begin
  alter table public.announcements
    add constraint announcements_review_state_known
    check (review_state is null or review_state in ('pending', 'approved', 'discarded'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.announcements
    add constraint announcements_source_email_fk
    foreign key (source_email_id) references public.newsletter_emails (id)
    on delete set null;
exception
  when duplicate_object then null;
end
$$;

comment on column public.announcements.source is
  'admin for anything a person wrote in the app or through a slash command, newsletter for anything the intake job parsed out of the weekly email. Drawn as the eyebrow on the review card.';
comment on column public.announcements.review_state is
  'Null on every announcement a person wrote. A parsed one starts pending, and approving or discarding it is the only thing that moves it. See migration 0038 section 4.';
comment on column public.announcements.source_email_id is
  'The newsletter_emails row this was parsed out of, for tracing a bad draft back to the email that produced it. Null once that log row is pruned.';

-- Partial, and nearly always empty or holding four rows. The Admin screen asks
-- "is anything waiting" on every draw of the announcements section, which is
-- the same shape as announcements_pinned_idx in 0028 and wants the same index.
create index if not exists announcements_review_idx
  on public.announcements (review_state) where review_state = 'pending';


-- ---------------------------------------------------------------------------
-- 5. Row level security on the two log tables
--
-- Read for admins, and no write policy at all. That is 0003's arrangement
-- rather than 0026's, on purpose: the only writer is the Edge Function holding
-- the service role key, which bypasses RLS, so the absent write policies are
-- the mechanism and not an oversight. Do not "fix" this by adding one.
--
-- These get an admin SELECT where push_log got no policy at all, and the
-- difference is who reads them. push_log is read by whoever is debugging a
-- send, from the dashboard. These two are read by the Admin screen, on a
-- phone, holding nothing but a session, which is exactly the case a policy is
-- for. A member gets zero rows rather than an error, because hc_is_admin()
-- returns false for them rather than raising. See 0025 section 2.
-- ---------------------------------------------------------------------------

alter table public.newsletter_emails enable row level security;
alter table public.newsletter_runs   enable row level security;

drop policy if exists "admins read newsletter emails" on public.newsletter_emails;
drop policy if exists "admins read newsletter runs"   on public.newsletter_runs;

create policy "admins read newsletter emails"
  on public.newsletter_emails for select
  to authenticated
  using (public.hc_is_admin());

create policy "admins read newsletter runs"
  on public.newsletter_runs for select
  to authenticated
  using (public.hc_is_admin());


-- ---------------------------------------------------------------------------
-- 6. Grants
--
-- The mirror of 0001 section 8. `authenticated` needs SELECT for the policy
-- above to have anything to narrow; anon gets nothing at all, on both tables,
-- which is two independent things wrong rather than one for a signed out phone
-- that goes looking. Writes are revoked from both client roles, so these
-- tables depend on a missing grant AND a missing policy, unlike announcements
-- which by 0026 depends on RLS alone.
-- ---------------------------------------------------------------------------

grant select on public.newsletter_emails, public.newsletter_runs to authenticated;
revoke select on public.newsletter_emails, public.newsletter_runs from anon;
revoke insert, update, delete on public.newsletter_emails, public.newsletter_runs
  from anon, authenticated;
grant all on public.newsletter_emails, public.newsletter_runs to service_role;


-- ---------------------------------------------------------------------------
-- 7. The shared secret the tick uses to prove it is the tick
--
-- Generated here rather than typed, and deliberately NOT the same secret
-- send-push uses. Two jobs, two secrets: a leak of this one causes an
-- unscheduled read of a mailbox, and a leak of that one causes a notification
-- on four hundred lock screens. Sharing it would make the smaller blast radius
-- into the larger one for free.
--
-- Same arrangement as 0012 section: the vault holds it, hc_newsletter_tick()
-- reads it, and it has to be copied by hand onto the Edge Function once. The
-- select at the end of this file prints it.
-- ---------------------------------------------------------------------------

do $$
begin
  /* Guarded for the reason in section 1: the test harness has a stub vault
     with no create_secret in it, and this file has to be runnable there. On a
     real project the function is present and this branch never fires.

     BY NAME AND NOT BY SIGNATURE, which is not fussiness. The first draft of
     this asked to_regprocedure for `vault.create_secret(text,text,text)`,
     which is exactly how 0012 calls it, and got null on the real project: the
     actual function is create_secret(new_secret text, new_name text,
     new_description text, new_key_id uuid) and the fourth argument merely has
     a default. to_regprocedure matches identity arguments, not call sites. So
     the migration ran green, generated nothing, and the first tick failed with
     "the secret is missing from the vault. Re-run migration 0038" — advice
     that would not have helped, because re-running it would have done nothing
     a second time. Asking whether the name exists is the question we actually
     have, and it survives Supabase adding a fifth argument. */
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'vault' and p.proname = 'create_secret'
  ) then
    raise notice 'The vault is not available here, so no cron secret was generated.';
    return;
  end if;

  if not exists (select 1 from vault.secrets where name = 'hc_newsletter_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'hc_newsletter_cron_secret',
      'Proves to the newsletter-intake Edge Function that a request came from pg_cron. Must match HC_NEWSLETTER_CRON_SECRET on the function.'
    );
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 8. The tick
--
-- Deliberately the same shape as hc_send_push in 0012 and 0027, down to the
-- fire and forget. net.http_post returns a request id and never the response,
-- which is exactly why sections 2 and 3 exist: the Edge Function writes its
-- own outcome, because nothing here can.
--
-- The timeout is 90 seconds rather than 0012's 30. This one talks to an IMAP
-- server and then to a model, in series, and a newsletter carrying five
-- announcements is a real amount of generation. Still well under pg_net's
-- own ceiling, and a timeout only abandons the response we were never going
-- to read.
--
-- The URL is written out rather than composed, matching 0027. There is one
-- project and its ref is in js/config.js, supabase/README.md and here.
-- ---------------------------------------------------------------------------

create or replace function public.hc_newsletter_tick()
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
    raise exception 'hc_newsletter_tick: hc_newsletter_cron_secret is missing from the vault. Re-run migration 0038.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/newsletter-intake',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 90000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_newsletter_tick() from public, anon, authenticated;

comment on function public.hc_newsletter_tick() is
  'Asks the newsletter-intake Edge Function to check the mailbox. Called by pg_cron every twenty minutes. Fire and forget: the function writes what happened to newsletter_runs, because nothing here can read the response.';


-- ---------------------------------------------------------------------------
-- 9. The clock
--
-- Every twenty minutes, which is 72 runs a day against a free tier allowance
-- of half a million invocations a month. The email arrives once a week, so
-- nearly every one of those runs opens a mailbox, finds nothing unread, writes
-- one small row and stops. That is the trade being made on purpose: polling is
-- cheap here and the alternative, a webhook, needs a mail provider that will
-- send us one.
--
-- WHY NOT HOURLY, like 0012's tick. Because this one is not on a clock the way
-- the push tick is. The push tick has to run at the top of the hour to decide
-- whether this is the hour it sends in; this one is a poll and its interval is
-- just how long a newsletter can sit unnoticed. Twenty minutes is short enough
-- that the drafts are waiting by the time somebody thinks to look, and long
-- enough to be free.
--
-- Wrapped in 0022's guard, which does the honest thing when pg_cron is not
-- available rather than failing the migration. It IS available on this project
-- and two jobs already run on it, so the notice branch should never print
-- here; it stays because this file is also the documentation of what to do if
-- it ever does.
-- ---------------------------------------------------------------------------

do $$
declare
  v_have  boolean;
  v_jobid bigint;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_have;

  if not v_have then
    raise notice 'NOT SCHEDULED. pg_cron is not enabled on this project.';
    raise notice 'Enable it under Database -> Extensions -> pg_cron, then run';
    raise notice '  select cron.schedule(''hc-newsletter-intake'', ''*/20 * * * *'', $c$select public.hc_newsletter_tick();$c$);';
    return;
  end if;

  -- Idempotent by hand. cron.unschedule raises when the job is not there, so
  -- the id is looked up first rather than the error being swallowed. Same as
  -- 0022.
  select jobid into v_jobid from cron.job where jobname = 'hc-newsletter-intake';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'hc-newsletter-intake',
    '*/20 * * * *',
    $c$select public.hc_newsletter_tick();$c$
  );

  raise notice 'Scheduled hc-newsletter-intake, every twenty minutes.';
end
$$;


-- ---------------------------------------------------------------------------
-- 10. The secret to copy, printed once
--
-- Run this by itself afterwards and paste the value into
-- Edge Functions -> newsletter-intake -> Secrets -> HC_NEWSLETTER_CRON_SECRET.
-- Until that matches, every run comes back 401 and newsletter_runs stays
-- empty, which is the failure NEWSLETTER_INTAKE_SETUP.md opens with.
--
--   select decrypted_secret from vault.decrypted_secrets
--    where name = 'hc_newsletter_cron_secret';
--
-- Left commented rather than run, so pasting this whole file into the SQL
-- editor does not print a secret into a query result somebody screenshots.
-- ---------------------------------------------------------------------------
