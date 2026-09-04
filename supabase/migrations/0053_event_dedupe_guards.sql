-- ===========================================================================
-- Home Church, closing the five minutes in which a duplicate could still land
--
-- WHAT 0052 LEFT OPEN. It gave the calendar a pass that finds one night
-- entered twice, and a queue card that offers Merge instead of Approve. Both
-- work. But the pass runs on a five minute clock and the newsletter intake
-- pushes a notification to every admin the moment it writes, so the ordinary
-- sequence is: the intake writes a second Homecoming, four hundred phones buzz,
-- an admin opens the queue, and the flag is not there yet. Approve is, and the
-- duplicate is on the calendar before the model has looked at it once.
--
-- Nothing in 0052 is wrong. It is a cleanup pass being asked to do a
-- prevention job, and this migration gives it the three things it needs:
--
--   1. ASK THE PASS WHEN AN EVENT IS WRITTEN, not only when the clock says so.
--      An insert on events now wakes hc_event_dedupe_tick() itself, so the
--      flags are usually there before the notification is read. Section 3.
--
--   2. A GUARD THAT NEEDS NO MODEL AT ALL. Two events on one day whose titles
--      share a real word are flagged the instant the second one is written,
--      in plain SQL, before any HTTP request has been made. Both pairs this
--      church actually had — "Ladies Night" beside "Women's Night", and
--      "Homecoming" beside "Homecoming Gala" — share a word and a day, so this
--      alone would have caught them in no time and for nothing. Section 2.
--
--   3. APPROVE REFUSES A FLAGGED DATE. 0052 takes the Approve button off a
--      flagged card, which is a statement about a screen. This is the same
--      rule where it cannot be got round: by a phone holding a list from
--      before the flag, by a second admin, or by curl. Section 4.
--
-- WHAT THIS DOES NOT DO, and the line is the same one 0038 drew and 0052 kept:
-- it still merges nothing, and it still refuses nothing that a person has
-- decided. The guard writes an advisory flag; Merge and Keep both are still
-- the only two ways a pair is settled, and both are taps.
--
-- THE COST, said plainly. The guard is deliberately a little loose — same day,
-- one shared word — so it will occasionally pair two things that are not the
-- same night, and while it stands, Approve on that date is withheld. That
-- costs one tap of Keep both. The pass clears its own false pairs within five
-- minutes anyway, because section 5 of this file teaches it to. The other way
-- round — a guard tight enough never to be wrong — is a guard that misses the
-- pair it was written for.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0052, and everything 0052 needs. Safe to re-run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The words in a title that are worth comparing
--
-- Lowercased, split on anything that is not a letter or a digit, and then the
-- words that carry no information about which night this is are dropped: the
-- articles, the months, the weekday names, and anything under three letters.
--
-- WHY THE MONTH GOES. Every event this intake writes carries the date in its
-- title — "Homecoming, October 23", "Ladies Night, September 11" — so leaving
-- the month in would make every October event share a word with every other
-- October event, and the guard would fire on the whole calendar.
--
-- WHY THREE LETTERS. It drops the possessive left behind by splitting
-- "Women's" into "women" and "s", which is the whole reason that rule is here
-- rather than a longer stopword list.
--
-- IMMUTABLE and no table access, so it can be used in the index below and read
-- twice per insert without costing anything.
-- ---------------------------------------------------------------------------

create or replace function public.hc_event_words(p_title text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct w), '{}'::text[])
    from unnest(regexp_split_to_array(lower(coalesce(p_title, '')), '[^a-z0-9]+')) as w
   where length(w) >= 3
     and w !~ '^[0-9]+$'
     and w not in (
       'the','and','for','our','all','new','you','your','from','this','that',
       'are','has','was','one','two','out','with','its','who','why','how','not',
       'january','february','march','april','may','june','july','august',
       'september','october','november','december',
       'sunday','monday','tuesday','wednesday','thursday','friday','saturday'
     );
$$;

/* REVOKED, like everything else in this project that is not a door.

   Not because this one is dangerous — it takes a string and returns the words
   in it, and reads no table. It is revoked because Postgres grants EXECUTE on
   a new function to PUBLIC unless told otherwise, and 0025's test asserts the
   exact list of functions a signed out client can reach. Adding a harmless
   function to that list is how the list stops being read carefully, and the
   list is the thing that makes the dangerous ones visible. */
revoke all on function public.hc_event_words(text) from public, anon, authenticated;

comment on function public.hc_event_words(text) is
  'The words in an event title worth comparing: lowercased, three letters or more, no months, no weekdays, no numbers, no articles. Used by the same-day guard in migration 0053 and by nothing else.';


-- ---------------------------------------------------------------------------
-- 2. The guard that needs no model
--
-- Fired on every event written, however it was written. It looks for another
-- event on the same day in the church's own timezone whose title shares one of
-- those words, and if it finds one it writes the flag immediately.
--
-- SAME DAY IN AMERICA/CHICAGO, not in UTC. A seven in the evening is the next
-- morning in UTC, and comparing the two in UTC would put the two halves of one
-- Friday night on different days, which is precisely the pair this is for.
--
-- WHICH ROW GETS THE FLAG is the rule 0052 wrote down and the Edge Function
-- follows: the one people already have survives — published beats pending, and
-- between two of the same kind the one written first wins. Said here a second
-- time in SQL rather than shared, because the two live in different languages
-- and a rule stated twice and tested twice is safer than a rule imported once.
--
-- IT NEVER OVERWRITES AN ANSWER. A row whose dedupe_checked_at is set has been
-- looked at, by the model or by somebody tapping Keep both, and the guard
-- leaves it exactly as it is. So a pair a person has already refused does not
-- come back the next time either of them is touched.
--
-- AND IT NEVER STOPS AN EVENT BEING WRITTEN. Everything below is wrapped, so a
-- guard that fails for any reason at all loses the flag and nothing else. An
-- event must always be writable; this is a convenience sitting on top of that
-- and it does not get a vote.
-- ---------------------------------------------------------------------------

create or replace function public.hc_event_same_day_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_words text[];
  v_other public.events%rowtype;
  v_lose  text;
  v_keep  text;
begin
  begin
    v_words := public.hc_event_words(new.title);
    if v_words = '{}'::text[] then
      return null;
    end if;

    select e.* into v_other
      from public.events e
     where e.id <> new.id
       and (e.starts_at at time zone 'America/Chicago')::date
         = (new.starts_at at time zone 'America/Chicago')::date
       and public.hc_event_words(e.title) && v_words
       and e.duplicate_of is null
     order by e.published desc, e.created_at asc, e.id asc
     limit 1;

    if not found then
      return null;
    end if;

    -- The survivor rule, in the same order the Edge Function states it.
    if new.published <> v_other.published then
      v_keep := case when new.published then new.id else v_other.id end;
    elsif new.created_at <> v_other.created_at then
      v_keep := case when new.created_at < v_other.created_at then new.id else v_other.id end;
    else
      v_keep := least(new.id, v_other.id);
    end if;

    v_lose := case when v_keep = new.id then v_other.id else new.id end;

    /* Written only on a row nobody has answered for yet. `dedupe_checked_at is
       null` is what makes that true: the model stamps it, and so does Keep
       both. Without this line, adding a third event to a busy Saturday could
       re-raise a pair somebody settled a fortnight ago. */
    update public.events
       set duplicate_of   = v_keep,
           duplicate_note = 'Two dates on the same day, and a word in common. Being looked at.'
     where id = v_lose
       and duplicate_of is null
       and dedupe_checked_at is null
       and id <> v_keep;

  exception when others then
    -- Never the reason an event cannot be written. See the note above.
    raise warning 'hc_event_same_day_guard: %', sqlerrm;
  end;

  return null;
end;
$$;

drop trigger if exists events_same_day_guard on public.events;

create trigger events_same_day_guard
  after insert on public.events
  for each row
  execute function public.hc_event_same_day_guard();

/* Revoked for the reason above, and safe to revoke: a trigger function's
   EXECUTE privilege is checked when the trigger is created, not each time it
   fires, so taking it away from the client roles stops it being called by hand
   without stopping it from firing. Asserted rather than assumed — the test for
   this migration writes an event as service_role, which is the role the
   newsletter intake uses, and checks the flag still appeared. */
revoke all on function public.hc_event_same_day_guard() from public, anon, authenticated;

comment on function public.hc_event_same_day_guard() is
  'Flags a newly written event against another on the same church day whose title shares a word, with no model and no HTTP request, so a duplicate is caught before the pass has run. Advisory only, never overwrites a row already answered for, and can never stop an event being written. See migration 0053.';

-- What the guard asks of the table on every insert: the events on one day.
-- Expression index, because the question is asked in the church's timezone and
-- an index on the raw column cannot answer it.
create index if not exists events_church_day_idx
  on public.events (((starts_at at time zone 'America/Chicago')::date));


-- ---------------------------------------------------------------------------
-- 3. Asking the pass to look, at the moment there is something to look at
--
-- The other half of the race. The guard above catches the pairs that share a
-- word; this is what gets the model to the rest of them before somebody reads
-- the notification the intake has just sent.
--
-- A STATEMENT TRIGGER, not a row one. The intake writes a newsletter's events
-- in a single insert, and five rows should wake the pass once.
--
-- IN A TRIGGER RATHER THAN IN THE INTAKE, deliberately. The obvious place for
-- this is the last line of supabase/functions/newsletter-intake, and that
-- function is a hundred kilobytes of hand written IMAP client that migration
-- 0050 moved a prompt out of precisely so nobody would have to redeploy the
-- church's mailbox reader to change something small. This is the same lesson
-- taken one step earlier: the database already knows when an event was
-- written, and it can do the asking without anybody touching that file.
--
-- IT ALSO COVERS THE CAL TAB, which the intake never would have. A date typed
-- in by hand next to one the newsletter parsed is the pair this church had.
--
-- pg_net QUEUES INSIDE THE TRANSACTION AND SENDS AFTER IT COMMITS, which is
-- the property this rests on: the request is written to net's own table by the
-- call below and posted by its background worker afterwards, so the function
-- on the other end reads rows that are already committed. If that ever stops
-- being true the symptom is a pass that reports nothing to check, and the five
-- minute cron from 0052 is still underneath it.
--
-- WRAPPED, for the same reason the guard is. The vault being unreachable must
-- not be the reason an event cannot be saved.
-- ---------------------------------------------------------------------------

create or replace function public.hc_events_ask_dedupe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.hc_event_dedupe_tick();
  exception when others then
    raise warning 'hc_events_ask_dedupe: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists events_ask_dedupe on public.events;

create trigger events_ask_dedupe
  after insert on public.events
  for each statement
  execute function public.hc_events_ask_dedupe();

revoke all on function public.hc_events_ask_dedupe() from public, anon, authenticated;

comment on function public.hc_events_ask_dedupe() is
  'Wakes hc_event_dedupe_tick() when events are written, so the flags are there before the intake''s notification is read rather than up to five minutes after it. One call per insert statement, and it can never stop an event being written. See migration 0053.';


-- ---------------------------------------------------------------------------
-- 4. Approve refuses a date that looks like one already in the calendar
--
-- 0052 takes the Approve button off a flagged card. That is a true thing to do
-- and it is not a guarantee: it is a statement about what one screen draws,
-- and the screen can be holding a list from before the flag was written, or
-- belong to the second admin of two, or not be a screen at all.
--
-- So the rule moves to where it cannot be got round, which is this project's
-- habit: 0026 put the church's rules in functions rather than in forms, and
-- every migration since has kept them there.
--
-- THE WAY THROUGH IS ALWAYS ONE TAP. This never refuses anything a person has
-- decided — Merge settles it, and so does Keep both, which is exactly what an
-- admin taps when the guard has paired two things that really are two nights.
-- The message names the other date so that tap is an informed one.
--
-- Everything else here is 0043's, unchanged: the claim that makes two admins
-- tapping at once settle rather than race, and the note saying who did it.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_approve_event(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_who   text;
  v_dup   text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  v_name := public.hc_admin_display_name(v_uid);

  /* The one line 0053 adds. Read before the claim below, so a refusal here
     leaves the row exactly as it was and the other admin's Approve still
     works the moment somebody settles the pair. */
  select k.title into v_dup
    from public.events e
    join public.events k on k.id = e.duplicate_of
   where e.id = p_id;

  if v_dup is not null then
    raise exception 'This looks like the same night as "%". Merge it, or tap Keep both first.', v_dup
      using errcode = 'raise_exception';
  end if;

  update public.events
     set published = true, review_state = 'approved'
   where id = p_id
     and review_state is distinct from 'approved';

  if not found then
    if not exists (select 1 from public.events where id = p_id) then
      raise exception 'No event with that id.';
    end if;

    select approved_by_name into v_who
      from public.review_approvals
     where kind = 'event' and row_id = p_id;

    raise exception '% already approved this date.', coalesce(v_who, 'Another admin');
  end if;

  insert into public.review_approvals (kind, row_id, approved_by, approved_by_name)
  values ('event', p_id, v_uid, v_name)
  on conflict (kind, row_id) do update
    set approved_by = excluded.approved_by,
        approved_by_name = excluded.approved_by_name,
        approved_at = now();
end;
$$;

revoke all on function public.hc_admin_approve_event(text) from public, anon;
grant execute on function public.hc_admin_approve_event(text) to authenticated;

comment on function public.hc_admin_approve_event(text) is
  'Puts one parsed event on the Connect calendar and writes down who did it. Admins only, checked inside. Since 0053 it refuses a date flagged as a copy of one already in the calendar, naming it: Merge or Keep both settles that in one tap. Claims the row by refusing one already approved, so two admins tapping at once settle rather than race.';


-- ---------------------------------------------------------------------------
-- 5. Nothing here changes what a merge does
--
-- Said so nobody goes looking. hc_admin_apply_event_update and
-- hc_admin_keep_event_separate are exactly as 0052 wrote them, and the pass
-- still merges nothing on its own. What this file changes is when the flag
-- appears and what Approve does while it is standing.
--
-- The Edge Function is the other half of the loose guard: when the model looks
-- at a pair the guard raised and says they are two different nights, it clears
-- the flag rather than leaving it, which is what keeps a false pair to five
-- minutes rather than to forever. That change ships with the function, not
-- with this file.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 6. What the advisor will say
--
-- Nothing new, and one thing that would have been. hc_admin_approve_event
-- keeps the grant and the note it has carried since 0043, on the list 0025
-- section 6 keeps, and no other function here is callable by any client role.
--
-- THAT LAST PART TOOK A CORRECTION, and it is worth leaving written down. All
-- three functions in this file were written with no grant at all, which is not
-- the same as being ungranted: Postgres gives EXECUTE on a new function to
-- PUBLIC unless told otherwise, so all three were quietly reachable by a
-- signed out client the moment they existed. 0025's test is what said so —
-- it asserts the exact list of functions anon can call, and hc_event_words
-- turned up in it. The three revokes above are that list being kept honest,
-- which is the only reason it is worth having.
-- ---------------------------------------------------------------------------
