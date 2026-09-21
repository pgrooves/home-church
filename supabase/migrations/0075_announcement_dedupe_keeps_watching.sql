-- ===========================================================================
-- Home Church, the announcement dedupe that stops looking away
--
-- WHAT WENT WRONG, in the church's own words: "Homecoming Gala and the Jonah
-- reading plan posted twice. I approved both, so you can see they arrived
-- separately and offered no option to merge." Both are exactly the pair 0051
-- was written for, and 0051 never saw either of them. Three holes, and a
-- duplicate only has to find one:
--
--   1. THE PASS ONLY EVER LOOKED AT THE QUEUE. Its candidate list was
--      `review_state <> 'pending'`, so two drafts sitting in the queue
--      together were invisible to each other — a newsletter that mentions
--      Homecoming twice, or two fetches before anybody approved anything, and
--      neither draft is ever compared with the other. Approve them both and
--      there are two cards, with nothing left that will ever look again.
--
--   2. ONCE APPROVED, NOTHING LOOKED AGAIN, ever. dedupe_checked_at is stamped
--      and the row leaves the queue, and there is no equivalent of the "same
--      night, twice" section the calendar has had since 0052. A duplicate that
--      becomes visible the moment both are on Home had no path at all.
--
--   3. THE FLAG COULD ARRIVE AFTER THE DECISION. 0051 runs on a five minute
--      clock. Fetch Announcements is a button somebody is standing in front
--      of, so the ordinary sequence was: drafts written, admin reads the
--      queue, admin approves, and the pass looks four minutes later at a queue
--      that is now empty. 0053 fixed precisely this for events, with an insert
--      trigger and a guard that needs no model. Announcements never got either.
--
-- So this file gives the announcements side the three things the calendar side
-- has had since 0053, and one thing neither has had: a way for a person to
-- merge two rows by hand when the robot has missed them anyway.
--
--   Section 1-2   a guard that needs no model, fired the moment a row is written
--   Section 3     the tick wakes on an insert, and watches posted rows too
--   Section 4     Keep both becomes a function, because it now has to persist
--   Section 5     applying an update also moves the date and the chain across
--   Section 6-7   MERGE WITH: pick the other row yourself, for both tables
--
-- WHAT STILL MERGES NOTHING ON ITS OWN. The line 0038 drew and 0051, 0052 and
-- 0053 each kept: everything here writes advisory flags, and every merge is a
-- person tapping a button having read what would change. Section 6 makes the
-- model's involvement larger, not smaller — it now writes the merged words
-- rather than just pointing at a pair — so the button in front of it shows
-- the result first and writes only what was on screen.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0003, 0025, 0040, 0041, 0043, 0051, 0052, 0053 and 0074.
--   Safe to re-run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The words in an announcement title worth comparing
--
-- 0053's hc_event_words with two changes, and it is a separate function rather
-- than a shared one on purpose: an event title is a thing and a date, and an
-- announcement title is a sentence. The stopword list has to be longer here,
-- and coupling the two means the day somebody adds "join" to this list they
-- have quietly changed which dates the calendar flags.
-- ---------------------------------------------------------------------------

create or replace function public.hc_announcement_words(p_title text)
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
       'join','come','sign','signup','register','info','more','about','week',
       'weekend','day','days','night','time','times','church','home','here',
       'january','february','march','april','may','june','july','august',
       'september','october','november','december',
       'sunday','monday','tuesday','wednesday','thursday','friday','saturday'
     );
$$;

revoke all on function public.hc_announcement_words(text) from public, anon, authenticated;

comment on function public.hc_announcement_words(text) is
  'The words in an announcement title worth comparing: lowercased, three letters or more, no months, no weekdays, no numbers, and none of the words every church announcement contains. Used by the guard in migration 0075 and by nothing else.';


-- ---------------------------------------------------------------------------
-- 2. The guard that needs no model
--
-- Fired on every announcement written, however it was written, and it asks one
-- deliberately narrow question: is one of these two titles CONTAINED IN the
-- other, once the noise words are gone.
--
-- WHY CONTAINMENT AND NOT A SHARED WORD, which is the rule the calendar uses.
-- Because the calendar's version has a day in it. "Same day AND a word in
-- common" is tight because the day does most of the work; most announcements
-- carry no date at all, so "a word in common" on its own would pair the men's
-- breakfast with the men's retreat and put a flag on half of Home.
--
-- Containment is the shape the real pairs actually have, and both of the ones
-- this church lost are it:
--
--   {homecoming}              in {homecoming, gala}          -> flagged
--   {jonah, reading, plan}    in {jonah, reading, plan}      -> flagged
--   {mens, breakfast}         vs {mens, retreat}             -> left alone
--
-- SIXTY DAYS, matching the window the pass itself compares in, so the guard
-- and the model do not disagree about what is even a candidate.
--
-- IT NEVER OVERWRITES AN ANSWER, and it can NEVER STOP AN ANNOUNCEMENT BEING
-- WRITTEN. Both are 0053's rules and both matter more here, because this table
-- is written by the newsletter intake in the middle of a longer job.
-- ---------------------------------------------------------------------------

create or replace function public.hc_announcement_same_thing_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_words text[];
  v_other public.announcements%rowtype;
  v_lose  text;
  v_keep  text;
begin
  begin
    v_words := public.hc_announcement_words(new.title);
    if v_words = '{}'::text[] then
      return null;
    end if;

    select a.* into v_other
      from public.announcements a
     where a.id <> new.id
       and a.deleted_at is null
       and a.duplicate_of is null
       and a.created_at >= new.created_at - interval '60 days'
       and public.hc_announcement_words(a.title) <> '{}'::text[]
       and (public.hc_announcement_words(a.title) <@ v_words
         or public.hc_announcement_words(a.title) @> v_words)
     order by (a.review_state <> 'pending') desc, a.created_at asc, a.id asc
     limit 1;

    if not found then
      return null;
    end if;

    /* The survivor rule, said in the same order the Edge Function says it and
       the same order 0053 says it for events: the row people already have
       wins. Posted beats waiting, and between two of a kind the older one
       stands. */
    if (new.review_state <> 'pending') <> (v_other.review_state <> 'pending') then
      v_keep := case when new.review_state <> 'pending' then new.id else v_other.id end;
    elsif new.created_at <> v_other.created_at then
      v_keep := case when new.created_at < v_other.created_at then new.id else v_other.id end;
    else
      v_keep := least(new.id, v_other.id);
    end if;

    v_lose := case when v_keep = new.id then v_other.id else new.id end;

    update public.announcements
       set duplicate_of   = v_keep,
           duplicate_note = 'Nearly the same title as one already here. Being looked at.'
     where id = v_lose
       and duplicate_of is null
       and dedupe_checked_at is null
       and id <> v_keep;

  exception when others then
    -- Never the reason an announcement cannot be written.
    raise warning 'hc_announcement_same_thing_guard: %', sqlerrm;
  end;

  return null;
end;
$$;

drop trigger if exists announcements_same_thing_guard on public.announcements;

create trigger announcements_same_thing_guard
  after insert on public.announcements
  for each row
  execute function public.hc_announcement_same_thing_guard();

revoke all on function public.hc_announcement_same_thing_guard() from public, anon, authenticated;

comment on function public.hc_announcement_same_thing_guard() is
  'Flags a newly written announcement against one already here whose title contains it or is contained by it, with no model and no HTTP request, so a duplicate is caught before the pass has run. Advisory only, never overwrites a row already answered for, and can never stop an announcement being written. See migration 0075.';


-- ---------------------------------------------------------------------------
-- 3. The tick, woken on an insert and no longer blind to what is posted
--
-- TWO CHANGES, AND THE SECOND ONE IS THE EXPENSIVE-SOUNDING ONE, so it is
-- worth being plain about the cost. The guard below asks "is there an
-- announcement nobody has checked", and it no longer adds "and it is waiting
-- in the queue". The day this migration runs that is true of every row in the
-- table, which is the backfill and is the point — it is how the pair already
-- on Home gets found. Afterwards it is true of exactly the rows written since
-- the last tick, which is a handful a week, and the partial index in section 3
-- of this file makes asking free.
--
-- The index from 0051 had `review_state = 'pending'` in its predicate, which
-- no longer matches the question, so it is replaced rather than added to.
-- ---------------------------------------------------------------------------

drop index if exists public.announcements_dedupe_todo_idx;

create index if not exists announcements_dedupe_todo_idx
  on public.announcements (created_at)
  where dedupe_checked_at is null and deleted_at is null;

create or replace function public.hc_dedupe_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret  text;
  v_request bigint;
begin
  if not exists (
    select 1 from public.announcements
     where dedupe_checked_at is null
       and deleted_at is null
  ) then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_newsletter_cron_secret';

  if v_secret is null then
    raise exception 'hc_dedupe_tick: hc_newsletter_cron_secret is missing from the vault. Re-run migration 0038.';
  end if;

  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/announcement-dedupe',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_dedupe_tick() from public, anon, authenticated;

comment on function public.hc_dedupe_tick() is
  'Asks the announcement-dedupe Edge Function to look at any announcement nobody has checked yet, posted ones included since 0075. Called by pg_cron every five minutes and by an insert on the table, and returns immediately when there is nothing, which is nearly always. Revoked from every client role: it reads the vault.';


/* And the insert trigger, which is the half of 0053 the announcements side
   never got. A STATEMENT trigger, because the intake writes a newsletter's
   announcements in one insert and five rows should wake the pass once.

   Wrapped, so the vault being unreachable is never the reason an announcement
   cannot be saved. pg_net queues inside the transaction and sends after it
   commits, so the function on the other end reads rows that are there. */
create or replace function public.hc_announcements_ask_dedupe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.hc_dedupe_tick();
  exception when others then
    raise warning 'hc_announcements_ask_dedupe: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists announcements_ask_dedupe on public.announcements;

create trigger announcements_ask_dedupe
  after insert on public.announcements
  for each statement
  execute function public.hc_announcements_ask_dedupe();

revoke all on function public.hc_announcements_ask_dedupe() from public, anon, authenticated;

comment on function public.hc_announcements_ask_dedupe() is
  'Wakes hc_dedupe_tick() when announcements are written, so the flags are there before the intake''s notification is read rather than up to five minutes after it. One call per insert statement, and it can never stop an announcement being written. See migration 0075.';


-- ---------------------------------------------------------------------------
-- 4. Keep both, as a function
--
-- It was a PATCH from the phone, which was right while the flag only ever sat
-- on a draft nobody had decided about. It is not right any more: the pass now
-- looks at posted rows too, so a pair somebody has refused would be raised
-- again on the next sweep unless the refusal is remembered. Remembering it is
-- what dedupe_checked_at is for, and a PATCH that has to set three columns
-- consistently is a rule living in a screen.
--
-- Same shape and same sentence as hc_admin_keep_event_separate from 0052.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_keep_announcement_separate(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  update public.announcements
     set duplicate_of      = null,
         duplicate_note    = null,
         dedupe_checked_at = coalesce(dedupe_checked_at, now())
   where id = p_id;

  if not found then
    raise exception 'No announcement with that id.';
  end if;
end;
$$;

revoke all on function public.hc_admin_keep_announcement_separate(text) from public, anon;
grant execute on function public.hc_admin_keep_announcement_separate(text) to authenticated;

comment on function public.hc_admin_keep_announcement_separate(text) is
  'Says two announcements that look alike are two different things, and stops the pair being offered. Clears the flag and stamps the row as answered, so the pass does not raise it again. Admins only, checked inside. See migration 0075.';


-- ---------------------------------------------------------------------------
-- 5. Applying an update, now that the loser can be a posted row
--
-- 0051's function assumed the flagged row was a fresh draft: copy its words
-- onto the card, discard the draft, done. Since section 3 the flagged row can
-- be an announcement that has been on Home for a fortnight, and such a row has
-- two things a draft does not — a date on the church's calendar, and possibly
-- a third copy pointing at it. Both have to move, or merging loses them.
--
--   THE DATE. If the row going away carries an event and the one staying does
--   not, the event moves across, exactly as 0052 moves an announcement when an
--   event is merged. If BOTH carry one, nothing is moved and the two events
--   are flagged against each other instead, so the same evening turns up in
--   the calendar's own "same night, twice" section with its own Merge button.
--   Quietly picking one would be this file deciding which night the church is
--   keeping, which is the one decision 0052 says out loud must be a person's.
--
--   THE CHAIN. A third announcement flagged against the row going away is
--   repointed at the row that stays, so three copies converge rather than
--   leaving a flag aimed at something in the Deleted drawer.
--
-- Everything else is 0051's, restated rather than patched.
-- ---------------------------------------------------------------------------

/* The date, moved or flagged, in one place because both merges need it and
   they must not each have an opinion. Used by the function below and by the
   Merge with button in section 6.

   NOT GRANTED to anybody: it is reachable only from inside two functions that
   have already asked who is calling. */
create or replace function public.hc_carry_announcement_date(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_to   text;
  v_a    public.events%rowtype;
  v_b    public.events%rowtype;
  v_win  text;
  v_lose text;
begin
  select event_id into v_from from public.announcements where id = p_from;
  select event_id into v_to   from public.announcements where id = p_to;

  if v_from is null or v_from = coalesce(v_to, '') then
    return;
  end if;

  if v_to is null then
    -- The one staying has no date. It gets this one, and the Add to calendar
    -- button follows the words.
    update public.announcements set event_id = v_from where id = p_to;
    update public.announcements set event_id = null    where id = p_from;
    return;
  end if;

  /* Both carry a date, and they are not the same date. NOTHING IS CHOSEN
     HERE. The two events are flagged against each other so the calendar's own
     "same night, twice" section offers the merge, with the survivor rule 0052
     wrote and 0053 restated: published beats pending, then the older one, then
     the lesser id. Quietly picking one would be this function deciding which
     night the church is keeping, which is the one decision 0052 says out loud
     must be a person's. */
  select * into v_a from public.events where id = v_from;
  if not found then return; end if;

  select * into v_b from public.events where id = v_to;
  if not found then return; end if;

  if v_a.published <> v_b.published then
    v_win := case when v_a.published then v_a.id else v_b.id end;
  elsif v_a.created_at <> v_b.created_at then
    v_win := case when v_a.created_at < v_b.created_at then v_a.id else v_b.id end;
  else
    v_win := least(v_a.id, v_b.id);
  end if;

  v_lose := case when v_win = v_a.id then v_b.id else v_a.id end;

  update public.events
     set duplicate_of   = v_win,
         duplicate_note = 'The two announcements about this were merged. Same thing, two dates.'
   where id = v_lose
     and duplicate_of is null
     and id <> v_win;
end;
$$;

revoke all on function public.hc_carry_announcement_date(text, text) from public, anon, authenticated;

comment on function public.hc_carry_announcement_date(text, text) is
  'Moves the calendar date from an announcement being merged away onto the one that stays, or — when both carry one — flags the two events against each other so the calendar offers its own Merge rather than this function picking a night. Reachable only from the two merge functions in migration 0075.';


create or replace function public.hc_admin_apply_announcement_update(p_draft_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft  public.announcements%rowtype;
  v_keep   public.announcements%rowtype;
  v_target text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_draft from public.announcements where id = p_draft_id;

  if not found then
    raise exception 'That draft is not there any more.';
  end if;

  v_target := v_draft.duplicate_of;

  if v_target is null then
    raise exception 'That one is not marked as an update to anything.';
  end if;

  select * into v_keep from public.announcements
   where id = v_target and deleted_at is null;

  if not found then
    raise exception 'The announcement it would update is not there any more.';
  end if;

  update public.announcements set
    title       = coalesce(nullif(btrim(v_draft.title), ''), title),
    body        = coalesce(nullif(btrim(coalesce(v_draft.body, '')), ''), body),
    body_html   = coalesce(nullif(btrim(coalesce(v_draft.body_html, '')), ''), body_html),
    eyebrow     = coalesce(nullif(btrim(coalesce(v_draft.eyebrow, '')), ''), eyebrow),
    starts_on   = coalesce(v_draft.starts_on, starts_on),
    ends_on     = coalesce(v_draft.ends_on, ends_on),
    link_url    = coalesce(nullif(btrim(coalesce(v_draft.link_url, '')), ''), link_url),
    link_title  = coalesce(nullif(btrim(coalesce(v_draft.link_title, '')), ''), link_title),
    image_url   = coalesce(nullif(btrim(coalesce(v_draft.image_url, '')), ''), image_url),
    image_urls  = case when jsonb_array_length(coalesce(v_draft.image_urls, '[]'::jsonb)) > 0
                       then v_draft.image_urls else image_urls end
  where id = v_target;

  perform public.hc_carry_announcement_date(p_draft_id, v_target);

  -- A third copy flagged against the row going away now points at the one
  -- that stays, so three copies converge on one card.
  update public.announcements
     set duplicate_of = v_target
   where duplicate_of = p_draft_id
     and id <> v_target;

  /* AND THE ROW THAT STAYS CANNOT POINT AT THE ROW THAT WENT, which two rows
     flagged at each other would otherwise leave behind: the survivor keeps a
     flag aimed at something now in the Deleted drawer, the screen draws
     nothing for it because the card it names is gone, and the merge refuses
     for the same reason. A flag nobody can see and nobody can clear is worse
     than no flag. The line above cannot do this one, because it deliberately
     excludes the survivor from the repointing — a row may not be its own
     duplicate. */
  update public.announcements
     set duplicate_of      = null,
         duplicate_note    = null,
         dedupe_checked_at = coalesce(dedupe_checked_at, now())
   where id = v_target
     and duplicate_of = p_draft_id;

  /* The draft leaves the queue the same way a discarded one does, and lands in
     the Deleted section rather than the Posted list: it is not a draft anybody
     will want to post later, it is a duplicate whose words are now on the card
     it duplicated. Recoverable, because everything on this screen now is. */
  update public.announcements
     set review_state   = 'discarded',
         deleted_at     = now(),
         duplicate_of   = null,
         duplicate_note = null
   where id = p_draft_id;

  return v_target;
end;
$$;

revoke all on function public.hc_admin_apply_announcement_update(text) from public, anon;
grant execute on function public.hc_admin_apply_announcement_update(text) to authenticated;

comment on function public.hc_admin_apply_announcement_update(text) is
  'Copies one announcement''s words, dates, link and picture onto the announcement it duplicates, carries its calendar date and any third copy across, then takes it out of the queue. Admins only, checked inside. Never touches published, pinned or priority: where a card sits on Home is the church''s decision, not a reminder email''s. See migrations 0051 and 0075.';


-- ---------------------------------------------------------------------------
-- 6. Merge with: an announcement, and the other one YOU pick
--
-- THE BACKUP THE CHURCH ASKED FOR, and the reason it exists is worth writing
-- down rather than treating as a gap to be closed later. Everything above is
-- the robot getting better at noticing, and the robot will still miss one: two
-- titles with no word in common, a pair sixty-one days apart, a newsletter
-- that renames a thing completely. When it does, the answer has to be a button
-- and not a support request, because the person looking at the two cards on
-- Home already knows the thing the model could not work out.
--
-- HOW IT DIFFERS FROM SECTION 5, which is the automatic path:
--
--   THE TARGET IS AN ARGUMENT, not duplicate_of. Nothing needs to have flagged
--   anything. Two rows an admin picked are two rows an admin picked.
--
--   THE WORDS ARE HANDED IN. Section 5 copies field by field with coalesce,
--   which is right for "a reminder email adds a ticket link" and much too
--   blunt for "these two cards were written by two people about one night".
--   So the merged wording is worked out by the model in the content-merge
--   Edge Function, shown to the admin field by field, and passed here as the
--   jsonb they approved. This function writes what it is given and nothing
--   else — the preview and the write are the same values, because the write is
--   the preview.
--
--   AND IT TAKES ONLY THE COLUMNS IT NAMES. A jsonb full of keys this list
--   does not mention writes nothing, which is what keeps `published`, `pinned`
--   and `priority` out of reach of anything but a person on the Admin screen,
--   exactly as 0051 promised.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_merge_announcement(
  p_source_id text,
  p_target_id text,
  p_fields    jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception 'Pick two different announcements.';
  end if;

  if not exists (select 1 from public.announcements where id = p_source_id) then
    raise exception 'That announcement is not there any more.';
  end if;

  if not exists (select 1 from public.announcements
                  where id = p_target_id and deleted_at is null) then
    raise exception 'The announcement it would merge into is not there any more.';
  end if;

  /* Every field optional, and a key that is absent leaves the column alone.
     An explicit null is not a way to clear one: a merge adds what the other
     card knew, and a merge that can empty a field is a merge that will. */
  update public.announcements set
    title      = coalesce(nullif(btrim(v_fields->>'title'), ''), title),
    body       = coalesce(nullif(btrim(v_fields->>'body'), ''), body),
    body_html  = coalesce(nullif(btrim(v_fields->>'body_html'), ''), body_html),
    eyebrow    = coalesce(nullif(btrim(v_fields->>'eyebrow'), ''), eyebrow),
    starts_on  = coalesce((nullif(v_fields->>'starts_on', ''))::date, starts_on),
    ends_on    = coalesce((nullif(v_fields->>'ends_on', ''))::date, ends_on),
    link_url   = coalesce(nullif(btrim(v_fields->>'link_url'), ''), link_url),
    link_title = coalesce(nullif(btrim(v_fields->>'link_title'), ''), link_title),
    image_url  = coalesce(nullif(btrim(v_fields->>'image_url'), ''), image_url),
    image_urls = case
                   when jsonb_typeof(v_fields->'image_urls') = 'array'
                    and jsonb_array_length(v_fields->'image_urls') > 0
                   then v_fields->'image_urls'
                   else image_urls
                 end
  where id = p_target_id;

  perform public.hc_carry_announcement_date(p_source_id, p_target_id);

  update public.announcements
     set duplicate_of = p_target_id
   where duplicate_of = p_source_id
     and id <> p_target_id;

  update public.announcements
     set review_state   = 'discarded',
         deleted_at     = coalesce(deleted_at, now()),
         duplicate_of   = null,
         duplicate_note = null,
         dedupe_checked_at = coalesce(dedupe_checked_at, now())
   where id = p_source_id;

  /* The row that stays is answered for too. Without this the pass would look
     at the pair again on its next sweep, find the merged card and whatever
     else is near it, and offer the admin the tidying they have just done. */
  update public.announcements
     set duplicate_of      = null,
         duplicate_note    = null,
         dedupe_checked_at = now()
   where id = p_target_id;

  return p_target_id;
end;
$$;

revoke all on function public.hc_admin_merge_announcement(text, text, jsonb) from public, anon;
grant execute on function public.hc_admin_merge_announcement(text, text, jsonb) to authenticated;

comment on function public.hc_admin_merge_announcement(text, text, jsonb) is
  'Merges one announcement into another the admin picked by hand, writing the merged wording they were shown. Carries the date and any third copy across, then retires the source into the Deleted drawer. Writes only the ten columns it names, so published, pinned and priority stay the church''s decision. Admins only, checked inside. See migration 0075.';


-- ---------------------------------------------------------------------------
-- 7. And the same button for a date
--
-- The calendar has had an automatic Merge since 0052 and it has the same gap:
-- it only appears when something flagged the pair. This is the hand-picked
-- version, and it ends the same way 0052's does — everything pointing at the
-- row moves across, and the row goes, because an unpublished event is on no
-- screen in this app and a merged one left behind is a row nobody could find.
--
-- THE DAYS ARE UNIONED, per 0074. Two rows about one retreat that each knew
-- about a different night come out as one retreat on both nights.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_merge_event(
  p_source_id text,
  p_target_id text,
  p_fields    jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_src    public.events%rowtype;
  v_keep   public.events%rowtype;
  v_starts timestamptz;
  v_ends   timestamptz;
  v_days   date[];
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception 'Pick two different dates.';
  end if;

  select * into v_src from public.events where id = p_source_id;
  if not found then
    raise exception 'That date is not there any more.';
  end if;

  select * into v_keep from public.events where id = p_target_id;
  if not found then
    raise exception 'The date it would merge into is not there any more.';
  end if;

  /* The start, which the admin may have been shown as moving. An absent or
     unparseable value leaves the survivor's own, which is 0052's rule about
     never replacing a time somebody vouched for with a guess. */
  v_starts := coalesce((nullif(v_fields->>'starts_at', ''))::timestamptz, v_keep.starts_at);

  v_ends := coalesce((nullif(v_fields->>'ends_at', ''))::timestamptz,
                     v_src.ends_at, v_keep.ends_at);
  if v_ends is not null and v_ends < v_starts then
    v_ends := null;
  end if;

  /* Every day either row was on, minus the one the start has landed on. The
     admin can have added or removed days in the preview; when they have said
     nothing, both rows' days survive. */
  if jsonb_typeof(v_fields->'also_on') = 'array' then
    select array_agg(value::date) into v_days
      from jsonb_array_elements_text(v_fields->'also_on')
     where nullif(btrim(value), '') is not null;
  else
    v_days := public.hc_event_days(v_keep.starts_at, v_keep.also_on)
           || public.hc_event_days(v_src.starts_at, v_src.also_on);
  end if;

  update public.events set
    title       = coalesce(nullif(btrim(v_fields->>'title'), ''), title),
    description = coalesce(nullif(btrim(v_fields->>'description'), ''), description),
    location    = coalesce(nullif(btrim(v_fields->>'location'), ''), location),
    signup_url  = coalesce(nullif(btrim(v_fields->>'signup_url'), ''), signup_url),
    capacity    = coalesce((nullif(v_fields->>'capacity', ''))::integer, v_src.capacity, capacity),
    /* Said explicitly or not at all. The preview always names time_label when
       it moves the start, so "the key is absent" means "the hour did not
       change" and the survivor keeps whatever it had — which is 0052's rule
       about never replacing a time somebody vouched for with a guess. */
    time_label  = case
                    when v_fields ? 'time_label'
                    then nullif(btrim(coalesce(v_fields->>'time_label', '')), '')
                    else time_label
                  end,
    starts_at   = v_starts,
    ends_at     = v_ends,
    also_on     = public.hc_event_also_on(v_starts, v_days)
  where id = p_target_id;

  update public.announcements set event_id = p_target_id where event_id = p_source_id;
  update public.events set duplicate_of = p_target_id where duplicate_of = p_source_id;

  delete from public.events where id = p_source_id;
  delete from public.review_approvals where kind = 'event' and row_id = p_source_id;

  update public.events
     set duplicate_of      = null,
         duplicate_note    = null,
         dedupe_checked_at = now()
   where id = p_target_id;

  return p_target_id;
end;
$$;

revoke all on function public.hc_admin_merge_event(text, text, jsonb) from public, anon;
grant execute on function public.hc_admin_merge_event(text, text, jsonb) to authenticated;

comment on function public.hc_admin_merge_event(text, text, jsonb) is
  'Merges one event into another the admin picked by hand, writing the merged wording they were shown and unioning the days both rows were on. Moves any announcement and any third copy across, then deletes the source. Admins only, checked inside. See migrations 0052, 0074 and 0075.';


-- ---------------------------------------------------------------------------
-- 8. What the advisor will say, and why it is fine
--
-- Four more 0039_authenticated_security_definer_function_executable, on
-- hc_admin_keep_announcement_separate, hc_admin_merge_announcement,
-- hc_admin_merge_event, and the unchanged grant on
-- hc_admin_apply_announcement_update. Same answer as every other entry on the
-- list 0025 section 6 keeps: in this project a SECURITY DEFINER function IS
-- the permission boundary, so the ones that matter are exactly the ones that
-- have to be callable, and the advisor cannot see the hc_is_admin() check on
-- the first line of each.
--
-- hc_announcement_words, hc_announcement_same_thing_guard,
-- hc_announcements_ask_dedupe, hc_carry_announcement_date and hc_dedupe_tick
-- are revoked from every client role, per 0053 section 6: Postgres grants
-- EXECUTE on a new function to PUBLIC unless told otherwise, and 0025's test
-- asserts the exact list a signed out client can reach.
-- ---------------------------------------------------------------------------
