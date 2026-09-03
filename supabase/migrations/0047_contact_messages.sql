-- ===========================================================================
-- Home Church, the contact form on Connect
--
-- WHAT THIS TABLE IS FOR, and it is not what it looks like. The deliverable
-- of the contact form is an email in hello@homechurchnola.com. That inbox is
-- the record, it is where a reply gets written from, and it is the only part
-- of this a person at the church has to remember to look at. This table is
-- the backstop underneath it: every submission is written here BEFORE the
-- send is attempted, so a message cannot be lost to a Resend outage, an
-- expired API key, or a bounce nobody notices.
--
-- WHICH MEANS THE ROW IS NOT THE PROMISE. supabase/functions/contact reports
-- success to the app only when Resend accepts the message. A row with a null
-- delivered_at is a message the church has NOT seen, and the person who sent
-- it was told so and given the mailto as a way through. That asymmetry is
-- deliberate and it is the whole reason this file has a delivery_error column:
-- js/screens/connect.js opens with a long note about three controls on that
-- screen that used to promise something and deliver nothing, and a form that
-- says "we will get back to you" over a failed send is the fourth.
--
-- NOBODY CAN READ IT BUT AN ADMIN. anon and authenticated get no grants at
-- all, the same posture 0010 took with device_tokens and for a closer reason:
-- these rows are somebody's name, their email address, and whatever they
-- decided to tell the church. The Edge Function writes with the service role
-- key, which bypasses RLS, so the app never needs a grant here and does not
-- get one. Admins get SELECT, through the same hc_is_admin() every content
-- policy in 0026 reads, so there is a way to find a message the email lost.
--
-- WHAT sender_hash IS, and what it is not. It is sha-256 of the caller's IP
-- and a pepper held as an Edge Function secret. It exists for exactly one
-- purpose, which is counting recent submissions from the same source so a
-- public endpoint cannot be turned into a mail relay. It is not an IP address
-- and it does not become one: the pepper never leaves the function's
-- environment, so nothing in this database can be walked back to a person's
-- network. The privacy policy in js/screens/legal.js says so in words.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or apply_migration. See supabase/ACCESS.md. Safe to run more than once.
--   Needs 0025, which created hc_is_admin().
--
-- AND THEN THE FUNCTION. The table on its own does nothing. Deploy and
-- configure supabase/functions/contact, which is what the form actually
-- calls. CONTACT_FORM_SETUP.md is the whole list, secrets included.
-- ===========================================================================


create table if not exists public.contact_messages (
  id              uuid primary key default gen_random_uuid(),

  -- What the person typed. Bounded here as well as in the function, because
  -- the function is not the only thing holding the service role key and a
  -- text column with no ceiling is free storage for whoever finds that out.
  name            text not null check (length(btrim(name)) between 1 and 120),
  email           text not null check (length(btrim(email)) between 3 and 200),
  message         text not null check (length(btrim(message)) between 1 and 4000),

  -- Peppered hash of the caller's IP. Rate limiting only. See the header.
  sender_hash     text,

  -- Null until Resend accepts it. Null means the church has not seen this.
  delivered_at    timestamptz,
  delivery_error  text,

  created_at      timestamptz not null default now()
);

comment on table public.contact_messages is
  'Submissions from the contact form at the top of Connect. The email to '
  'hello@homechurchnola.com is the record; this is the backstop under it. '
  'A row with a null delivered_at was never delivered.';

comment on column public.contact_messages.sender_hash is
  'sha-256 of the sender IP and a pepper held only as an Edge Function '
  'secret. Used to rate limit a public endpoint. Not reversible to an IP.';

comment on column public.contact_messages.delivered_at is
  'When Resend accepted the message. Null means it did not go, and the '
  'person who sent it was told so rather than thanked.';

-- The rate limit counts rows by sender within a window, which is this index
-- and nothing else. Descending on created_at because the count is always of
-- the recent end.
create index if not exists contact_messages_sender_idx
  on public.contact_messages (sender_hash, created_at desc);

-- What an admin looking for a lost message sorts by.
create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);

-- And the one an admin actually wants: what has not been delivered. Partial,
-- because on a working project it indexes nothing.
create index if not exists contact_messages_undelivered_idx
  on public.contact_messages (created_at desc)
  where delivered_at is null;


-- --------------------------------------------------------------- the grants
-- The app has no business here at all. It does not read this table, it does
-- not write it, and the Edge Function that does neither uses nor needs a
-- policy, because the service role bypasses RLS entirely.

alter table public.contact_messages enable row level security;

revoke all on public.contact_messages from anon, authenticated;
grant all on public.contact_messages to service_role;

-- SELECT for admins, and only SELECT. Nothing in the app edits or deletes a
-- message: correspondence is not content, and the retention sweep below is
-- what removes it.
grant select on public.contact_messages to authenticated;

drop policy if exists contact_messages_admin_read on public.contact_messages;
create policy contact_messages_admin_read
  on public.contact_messages
  for select
  to authenticated
  using (public.hc_is_admin());


-- ------------------------------------------------------------- the sweep
-- Same argument as 0022 makes for group rooms. The church's copy of this
-- correspondence is the mailbox, which is where a reply gets written and
-- where it belongs. What is here is a safety net, and a safety net that keeps
-- somebody's name, email and message forever is a liability rather than a net.
--
-- A hundred and eighty days is long enough that a message lost to a failed
-- send in March is still findable in August, and short enough that this is not
-- quietly becoming a second CRM nobody audits.

create or replace function public.hc_purge_contact_messages(p_days integer default 180)
returns integer
language plpgsql
security definer
-- Pinned, for the reason 0011, 0012 and 0037 all give: an unpinned
-- search_path on a SECURITY DEFINER function is a privilege escalation
-- waiting to be written by accident.
set search_path = public
as $$
declare
  v_removed integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'hc_purge_contact_messages: p_days must be at least 1';
  end if;

  delete from public.contact_messages
  where created_at < now() - make_interval(days => p_days);

  get diagnostics v_removed = row_count;
  return v_removed;
end $$;

revoke all on function public.hc_purge_contact_messages(integer) from public, anon, authenticated;
grant execute on function public.hc_purge_contact_messages(integer) to service_role;

comment on function public.hc_purge_contact_messages(integer) is
  'Deletes contact form submissions older than p_days. Scheduled nightly '
  'where pg_cron is enabled; see the do block in migration 0047.';


-- Scheduling it, if pg_cron is here. Lifted from 0022 deliberately, including
-- the part where it says plainly what to do rather than failing: an extension
-- error is something people retry twice and then give up on.
--
-- 09:00 UTC is between three and four in the morning in Metairie all year.
-- Nothing about this is time critical.
do $$
declare
  v_have  boolean;
  v_jobid bigint;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_have;

  if not v_have then
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      begin
        create extension pg_cron;
        v_have := true;
      exception when others then
        raise notice 'pg_cron is available but could not be created here: %', sqlerrm;
      end;
    end if;
  end if;

  if not v_have then
    raise notice '--------------------------------------------------------------';
    raise notice 'NOT SCHEDULED. pg_cron is not enabled on this project.';
    raise notice 'Enable it under Database -> Extensions -> pg_cron, then run';
    raise notice 'this migration again. Until then contact messages are kept';
    raise notice 'indefinitely, which is not what the privacy policy says.';
    raise notice '--------------------------------------------------------------';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'hc-purge-contact-messages';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'hc-purge-contact-messages',
    '20 9 * * *',
    $cron$select public.hc_purge_contact_messages(180)$cron$
  );

  raise notice 'Scheduled hc-purge-contact-messages nightly at 09:20 UTC.';
end $$;
