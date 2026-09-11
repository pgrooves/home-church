-- ===========================================================================
-- Home Church, a newsletter the reader choked on comes back
--
-- WHAT WENT WRONG. On the 11th of September the weekly newsletter arrived,
-- the reader handed it to Gemini, and the answer came back cut off in the
-- middle of the JSON — the model ran out of output budget before it closed
-- the array. JSON.parse threw, and because a parse failure was classified as
-- permanent, the intake wrote `status = 'failed'`, marked the email read, and
-- moved on. The ledger's unique message_id then did exactly what it is for:
-- it skipped that email on every run afterwards, forever. One newsletter, five
-- announcements, silently gone, and the only trace was a note in a table no
-- screen in this app reads.
--
-- 0038 wrote that rule on purpose and the reasoning was sound as far as it
-- went: "an email Gemini choked on gets retried every twenty minutes forever,
-- and each retry costs a model call". What it missed is that the two cases are
-- not the same. An email we genuinely cannot read should be recorded and
-- dropped. An answer that arrived truncated is not a verdict on the email at
-- all — it is the same class of thing as a 503, and the next attempt may well
-- work. Treating the second as the first is how a week goes missing.
--
-- SO THE LEDGER LEARNS TO COUNT. Two new states and a counter:
--
--   parsing   claimed by a run that is working on it right now. This is what
--             stops two runs — the twenty minute tick and somebody tapping
--             Fetch Announcements — parsing one email into two sets of drafts.
--             0038 got that from the unique index on a single insert; a retry
--             needs a claim that can be taken more than once, so it is a
--             compare-and-swap on `attempts` instead. A claim whose run died
--             mid-flight goes stale and another run may take it.
--   deferred  an attempt failed in a way worth trying again. The email is NOT
--             marked read and the next tick picks it up.
--
--   attempts      how many times a run has claimed it. Bounded in the Edge
--                 Function, which flips the row to 'failed' when the budget is
--                 spent, so "retry until it works" cannot become "retry
--                 forever". Four attempts at twenty minutes apart is about an
--                 hour of trying before it gives up and says so.
--   attempted_at  when the current claim was taken, which is the only way to
--                 tell a run that is working from a run that died.
--
-- The terminal three are unchanged and still mean what they meant: parsed,
-- empty, failed. What changed is that 'failed' is now where an email lands
-- after the retries are spent, rather than the first time anything goes wrong.
--
-- WHAT THIS DOES NOT DO. It does not retry a failure that happened AFTER rows
-- were written. Those are left exactly as they were, recorded and settled,
-- because re-reading an email whose events are already in the table is how you
-- get the same evening in the calendar twice — and a second set of drafts is a
-- mess somebody has to clean up by hand, which is worse than the failure it
-- would be papering over. Only failures that happen before anything is written
-- are retried, where a second attempt is free of side effects by construction.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0038 (newsletter_emails).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The counter and the clock
--
-- Both default to something a row written before today satisfies: every
-- existing row is settled, so attempts 0 and a null clock are the truth about
-- them. No backfill, and nothing to undo if this is run twice.
-- ---------------------------------------------------------------------------

alter table public.newsletter_emails
  add column if not exists attempts integer not null default 0;

alter table public.newsletter_emails
  add column if not exists attempted_at timestamptz;

comment on column public.newsletter_emails.attempts is
  'How many times a run has claimed this email. The Edge Function stops at MAX_PARSE_ATTEMPTS and writes status failed, so a model that truncates its answer every time cannot cost a model call every twenty minutes forever.';
comment on column public.newsletter_emails.attempted_at is
  'When the current claim was taken. A row left in parsing by a run that died is reclaimable once this is old enough; without it a crashed run would hold an email hostage for good.';


-- ---------------------------------------------------------------------------
-- 2. The two new states
--
-- Dropped and recreated rather than altered, because a check constraint cannot
-- be widened in place. The window between the two statements is inside one
-- transaction, so nothing can slip through it.
-- ---------------------------------------------------------------------------

alter table public.newsletter_emails
  drop constraint if exists newsletter_emails_status_known;

alter table public.newsletter_emails
  add constraint newsletter_emails_status_known
  check (status in ('parsed', 'empty', 'failed', 'parsing', 'deferred'));

comment on column public.newsletter_emails.status is
  'parsing: a run has claimed it and is working on it. deferred: an attempt failed in a way worth retrying, and the email is deliberately still unread in the mailbox. parsed: drafts were written. empty: read fine, nothing in it looked like an announcement. failed: settled as unreadable, either outright or after the retries ran out, and `note` says why.';


-- ---------------------------------------------------------------------------
-- 3. Finding the work
--
-- Every run reads this table by message_id, which the unique index already
-- serves. What it does not serve is the other question this feature asks —
-- "is anything stuck?" — so one partial index on the two live states, which on
-- an ordinary week has no rows in it at all.
-- ---------------------------------------------------------------------------

create index if not exists newsletter_emails_unsettled_idx
  on public.newsletter_emails (attempted_at)
  where status in ('parsing', 'deferred');


-- ---------------------------------------------------------------------------
-- 4. Putting one email back
--
-- For the case this migration was written for: an email already buried by the
-- old rule, which a person wants read again. Admins only, and deliberately
-- narrow — it clears the counter and the note and leaves everything else
-- alone, so the next tick treats the email as new. It cannot touch an email
-- that produced drafts, because re-reading one of those is the duplicate mess
-- described at the top.
--
-- The mailbox side needs no help: the intake searches UNSEEN *and* everything
-- from the last fortnight, so an email that was marked read is still found.
-- Older than that and this returns false, which is the honest answer rather
-- than a row that will never be picked up.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_retry_newsletter_email(p_message_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.newsletter_emails;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.newsletter_emails where message_id = p_message_id;

  if not found then
    return false;
  end if;

  -- Drafts already came out of it. Reading it again would write a second set.
  if v_row.drafts > 0 or v_row.status = 'parsed' then
    return false;
  end if;

  -- Outside the fortnight the mailbox search covers, so resetting it would
  -- promise a retry that can never happen.
  if v_row.sent_at is not null and v_row.sent_at < now() - interval '14 days' then
    return false;
  end if;

  update public.newsletter_emails
     set status = 'deferred', attempts = 0, attempted_at = null, note = null
   where id = v_row.id;

  return true;
end;
$$;

revoke all on function public.hc_admin_retry_newsletter_email(text) from public, anon, authenticated;
grant execute on function public.hc_admin_retry_newsletter_email(text) to authenticated;

comment on function public.hc_admin_retry_newsletter_email(text) is
  'Puts one newsletter email back in front of the reader, for an email an older version of the intake buried. Refuses an email that already produced drafts, and one older than the fortnight the mailbox search covers. Admins only, checked inside.';


-- ---------------------------------------------------------------------------
-- 5. What the advisor will say
--
-- One more 0029_authenticated_security_definer_function_executable, on
-- hc_admin_retry_newsletter_email, joining the list 0025 section 6 keeps. Same
-- answer: the function IS the permission boundary, hc_is_admin() is its first
-- line, and the advisor can see the grant but not the check.
-- ---------------------------------------------------------------------------
