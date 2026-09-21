-- ===========================================================================
-- Home Church, one event that happens on more than one day
--
-- WHAT THIS IS FOR. A membership class runs on two Sundays. A retreat runs
-- Friday to Sunday. A serve week has three shifts on three evenings. Until
-- this file every one of those had exactly two shapes available to it, and
-- both were wrong:
--
--   ONE ROW, ONE DAY. The class goes on the calendar on the 5th and is not on
--   the calendar on the 12th, so the person who checks the grid on the Monday
--   in between sees nothing and assumes it is over.
--
--   TWO ROWS. The class is on both days and is now two events, which means two
--   Add to calendar buttons, two cards to correct when the room changes, two
--   things for the dedupe pass to flag against each other, and an announcement
--   that can only point at one of them.
--
-- So an event grows a list of the OTHER days it also happens on. One row, one
-- title, one blurb, one place, one announcement, one thing to merge — drawn on
-- the grid on every day it names.
--
-- WHY A COLUMN AND NOT A TABLE. An occurrences table is the textbook answer
-- and it is the wrong size for this church. Every screen that draws an event
-- would grow a join, the content sync in js/content.js would grow a second
-- fetch and a stitch, and `select *` would stop being the whole event — which
-- is the assumption the Admin screen, the Cal tab, both dedupe passes and the
-- merge functions all quietly rest on. A short array of dates keeps the whole
-- event in the row, which is what every reader here already expects.
--
-- WHAT starts_at STILL IS, and this is the part not to lose. It is the FIRST
-- day and the only clock time. The array carries days and no hours, because a
-- class that meets at 6:30 meets at 6:30 on both Sundays, and a church that
-- genuinely needs two different times on two days has two events. Keeping
-- starts_at load bearing is what lets every existing query, index, sort and
-- constraint in this project go on working untouched.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0001 (events), 0025 (hc_is_admin), 0042 (hc_admin_save_event) and
--   0052 (hc_admin_apply_event_update). Safe to re-run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The other days
--
-- `also_on` is a list of dates in the church's own calendar sense — plain
-- days, no timezone, because "the 12th" is the 12th in Metairie whatever a
-- phone in another state thinks. It never contains the day starts_at is on:
-- that day is already said, and saying it twice is how a grid draws an event
-- on one day two times.
--
-- NULL AND '{}' MEAN THE SAME THING and both are ordinary. Every event in the
-- table today gets null and behaves exactly as it did yesterday, which is the
-- whole test of whether this column was added carefully.
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists also_on date[];

/* A ceiling, because the array lives in the row every screen reads and an
   accidental loop writing a year of Tuesdays into one event should fail at
   the database rather than land. Thirty is a term of anything this church
   runs; a weekly gathering that outgrows it is a recurring event and wants a
   different answer than a list. */
do $$
begin
  alter table public.events
    add constraint events_also_on_sane
    check (also_on is null or array_length(also_on, 1) <= 30);
exception
  when duplicate_object then null;   -- already there, this file re-runs
end
$$;

comment on column public.events.also_on is
  'The OTHER days this same event also happens on, as plain church dates, never including the day starts_at falls on. One event, drawn on the Cal grid on every day it names. Null or empty is the ordinary case. Times live on starts_at and nowhere else: two days at two different hours are two events. See migration 0074.';


-- ---------------------------------------------------------------------------
-- 2. Every day one event is on, as one list
--
-- The first day and the others, sorted, unique, with the first day first.
-- Written once here because four things need the same answer and they must
-- not each have an opinion about it: the same-day guard below, the merge in
-- 0052, the Edge Function that compares two events, and anybody reading this
-- table by hand.
--
-- STABLE RATHER THAN IMMUTABLE, because `at time zone` on a timestamptz reads
-- the session's own timezone tables. That is why there is no index on this
-- and why the guard below still leans on 0053's expression index for the
-- first day: the array overlap is checked on the handful of rows that index
-- hands back, not on the table.
-- ---------------------------------------------------------------------------

create or replace function public.hc_event_days(p_starts_at timestamptz, p_also_on date[])
returns date[]
language sql
stable
set search_path = public
as $$
  select array_agg(d order by d)
    from (
      select distinct d
        from unnest(
               array[(p_starts_at at time zone 'America/Chicago')::date]
               || coalesce(p_also_on, '{}'::date[])
             ) as d
    ) days;
$$;

revoke all on function public.hc_event_days(timestamptz, date[]) from public, anon, authenticated;

comment on function public.hc_event_days(timestamptz, date[]) is
  'Every church day one event falls on: the day starts_at is on, plus also_on, sorted and deduplicated. The one answer to "which days is this event on", so the guard, the merge and the dedupe pass cannot disagree. See migration 0074.';


-- ---------------------------------------------------------------------------
-- 3. Tidying the list on the way in
--
-- The array a form hands over is whatever somebody tapped: possibly out of
-- order, possibly with the first day in it because they picked it twice,
-- possibly with a blank in it from a date box nobody filled. This is the one
-- place that is dealt with, so every writer below gets the same treatment and
-- the column's promise in section 1 is true of every row rather than of the
-- rows written by careful callers.
-- ---------------------------------------------------------------------------

create or replace function public.hc_event_also_on(p_starts_at timestamptz, p_also_on date[])
returns date[]
language sql
stable
set search_path = public
as $$
  select case when count(*) = 0 then null else array_agg(d order by d) end
    from (
      select distinct d
        from unnest(coalesce(p_also_on, '{}'::date[])) as d
       where d is not null
         and d <> (p_starts_at at time zone 'America/Chicago')::date
    ) days;
$$;

revoke all on function public.hc_event_also_on(timestamptz, date[]) from public, anon, authenticated;

comment on function public.hc_event_also_on(timestamptz, date[]) is
  'What actually goes in events.also_on: sorted, deduplicated, no nulls, and never the day starts_at is already on. Called by every function in this project that writes the column. See migration 0074.';


-- ---------------------------------------------------------------------------
-- 4. Writing one, with its days
--
-- A seventh argument on hc_admin_save_event rather than a second function,
-- because it is the same act: the form that adds an event is the form that
-- corrects one, and now it is also the form that adds a second Sunday to one.
--
-- THE SIX ARGUMENT VERSION FROM 0042 STAYS, and it stays for a real reason
-- rather than out of politeness. A phone holding a cached copy of the app
-- calls it by name with six named arguments, and PostgREST resolves an RPC by
-- the argument names it was given. Dropping it would break Save on every
-- phone that had not reloaded, silently, until somebody tried to fix a date on
-- a Sunday morning. It now forwards, so there is still one implementation.
--
-- WHAT THE SIX ARGUMENT VERSION DOES TO also_on, which is the only question it
-- raises: nothing. An old client editing a multi-day event leaves its days
-- alone rather than clearing them, the same promise 0042 already makes about
-- signup_url, capacity and category. A form that cannot see a field must never
-- be able to erase it.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_save_event(
  p_id          text,
  p_title       text,
  p_starts_at   timestamptz,
  p_time_label  text,
  p_location    text,
  p_description text,
  p_also_on     date[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    text;
  v_title text := trim(coalesce(p_title, ''));
  v_days  date[];
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if v_title = '' then
    raise exception 'An event needs a title.';
  end if;
  if p_starts_at is null then
    raise exception 'An event needs a date.';
  end if;

  v_days := public.hc_event_also_on(p_starts_at, p_also_on);

  if p_id is null or trim(p_id) = '' then
    v_id := public.hc_event_slug(v_title);
    insert into public.events (id, title, description, starts_at, time_label,
                               location, also_on, published)
    values (v_id, v_title, nullif(trim(coalesce(p_description, '')), ''),
            p_starts_at, nullif(trim(coalesce(p_time_label, '')), ''),
            nullif(trim(coalesce(p_location, '')), ''), v_days, true);
    return v_id;
  end if;

  update public.events
     set title       = v_title,
         description = nullif(trim(coalesce(p_description, '')), ''),
         starts_at   = p_starts_at,
         time_label  = nullif(trim(coalesce(p_time_label, '')), ''),
         location    = nullif(trim(coalesce(p_location, '')), ''),
         also_on     = v_days
   where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'No event with that id.';
  end if;

  return v_id;
end;
$$;

revoke all on function public.hc_admin_save_event(text, text, timestamptz, text, text, text, date[])
  from public, anon, authenticated;
grant execute on function public.hc_admin_save_event(text, text, timestamptz, text, text, text, date[])
  to authenticated;

comment on function public.hc_admin_save_event(text, text, timestamptz, text, text, text, date[]) is
  'Writes one event from the Cal tab, days and all: a new one when p_id is null, otherwise that row. Seven columns and no others, so signup_url, capacity, category, published and review_state survive an edit made on a phone. Admins only, checked inside. See migration 0074.';


/* The 0042 signature, kept working and now forwarding. `null` for the days is
   read by the seven argument version as "leave them alone" on an update, which
   is the promise above. */
create or replace function public.hc_admin_save_event(
  p_id          text,
  p_title       text,
  p_starts_at   timestamptz,
  p_time_label  text,
  p_location    text,
  p_description text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days date[];
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_id is not null and trim(p_id) <> '' then
    select also_on into v_days from public.events where id = p_id;
  end if;

  return public.hc_admin_save_event(p_id, p_title, p_starts_at, p_time_label,
                                    p_location, p_description, v_days);
end;
$$;

comment on function public.hc_admin_save_event(text, text, timestamptz, text, text, text) is
  'The six argument save from 0042, kept so a phone holding a cached copy of the app goes on working. Forwards to the seven argument version in 0074 and leaves also_on exactly as it found it: a form that cannot see a field must not be able to erase it.';


-- ---------------------------------------------------------------------------
-- 5. What a merge does with two lists of days
--
-- 0052 merges one event into the one it duplicates by copying across what the
-- duplicate knows and leaving alone what it does not. Days are the same idea
-- with one difference worth stating: two rows about one event can each know
-- about a day the other does not — the newsletter's first email named the 5th,
-- the reminder named the 12th — so the days are UNIONED rather than chosen
-- between. Losing a day in a merge is exactly the failure this whole file is
-- about.
--
-- Everything else here is 0052's, unchanged and restated rather than patched,
-- because a `create or replace` that people have to diff against a file three
-- migrations back is a function nobody will read again.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_apply_event_update(p_duplicate_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dup    public.events%rowtype;
  v_keep   public.events%rowtype;
  v_target text;
  v_starts timestamptz;
  v_label  text;
  v_ends   timestamptz;
  v_days   date[];
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_dup from public.events where id = p_duplicate_id;

  if not found then
    raise exception 'That date is not there any more.';
  end if;

  v_target := v_dup.duplicate_of;

  if v_target is null then
    raise exception 'That one is not marked as the same as anything.';
  end if;

  select * into v_keep from public.events where id = v_target;

  if not found then
    raise exception 'The date it would merge into is not there any more.';
  end if;

  /* When the date moves and when it does not. The duplicate's hour is taken
     only when it has one, which is exactly when its time_label is null. */
  if v_dup.time_label is null then
    v_starts := v_dup.starts_at;
    v_label  := null;
  else
    v_starts := v_keep.starts_at;
    v_label  := v_keep.time_label;
  end if;

  /* And the end time, dropped rather than kept when the start it belonged to
     has just moved past it. Without this the merge can fail on 0001's
     events_ends_after_starts check, which is a true thing to enforce and a
     terrible thing for a person to read after tapping Merge. */
  v_ends := coalesce(v_dup.ends_at, v_keep.ends_at);
  if v_ends is not null and v_ends < v_starts then
    v_ends := null;
  end if;

  /* Every day either row knew about, minus whichever one the survivor's
     starts_at has just landed on. hc_event_days is asked about both rows
     rather than about their arrays, so a first day that is only a first day on
     one of them still survives the merge as a day. */
  v_days := public.hc_event_also_on(
    v_starts,
    public.hc_event_days(v_keep.starts_at, v_keep.also_on)
      || public.hc_event_days(v_dup.starts_at, v_dup.also_on)
  );

  update public.events set
    title       = coalesce(nullif(btrim(v_dup.title), ''), title),
    description = coalesce(nullif(btrim(coalesce(v_dup.description, '')), ''), description),
    location    = coalesce(nullif(btrim(coalesce(v_dup.location, '')), ''), location),
    signup_url  = coalesce(nullif(btrim(coalesce(v_dup.signup_url, '')), ''), signup_url),
    capacity    = coalesce(v_dup.capacity, capacity),
    starts_at   = v_starts,
    time_label  = v_label,
    ends_at     = v_ends,
    also_on     = v_days
  where id = v_target;

  /* The survivor's own dedupe columns are deliberately left alone. If it is
     itself flagged as a copy of a third row, that is a different pair and a
     different decision, and clearing it here would throw away a match nobody
     answered. Chains resolve by being merged twice. */

  update public.announcements set event_id = v_target where event_id = p_duplicate_id;
  update public.events set duplicate_of = v_target where duplicate_of = p_duplicate_id;

  delete from public.events where id = p_duplicate_id;
  delete from public.review_approvals where kind = 'event' and row_id = p_duplicate_id;

  return v_target;
end;
$$;

revoke all on function public.hc_admin_apply_event_update(text) from public, anon;
grant execute on function public.hc_admin_apply_event_update(text) to authenticated;

comment on function public.hc_admin_apply_event_update(text) is
  'Merges one event into the one it duplicates: copies what it knows onto the survivor, unions the days both rows knew about, moves any announcement and any third copy across, then deletes it. Never replaces a known time with the parser''s nine o''clock guess, and never publishes anything. Admins only, checked inside. See migrations 0052 and 0074.';


-- ---------------------------------------------------------------------------
-- 6. The same-day guard, now asking about every day
--
-- 0053 flags a newly written event against another on the same church day
-- whose title shares a word. With multi-day events "the same day" has to mean
-- "any day either of them is on", or a retreat entered twice — once as Friday
-- to Sunday and once as just the Saturday — walks straight past the guard.
--
-- THE FIRST DAY STILL DRIVES THE LOOKUP, through 0053's expression index, and
-- the array overlap is checked on top of it. So the common case costs exactly
-- what it cost before, and the extra rows considered are only those a
-- multi-day event reaches.
--
-- Everything else is 0053's and is restated rather than patched, for the
-- reason section 5 gives.
-- ---------------------------------------------------------------------------

create or replace function public.hc_event_same_day_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_words text[];
  v_days  date[];
  v_other public.events%rowtype;
  v_lose  text;
  v_keep  text;
begin
  begin
    v_words := public.hc_event_words(new.title);
    if v_words = '{}'::text[] then
      return null;
    end if;

    v_days := public.hc_event_days(new.starts_at, new.also_on);

    select e.* into v_other
      from public.events e
     where e.id <> new.id
       and public.hc_event_days(e.starts_at, e.also_on) && v_days
       and public.hc_event_words(e.title) && v_words
       and e.duplicate_of is null
       /* The window, so a table of years is not scanned to write an advisory
          flag. Wider than the day itself because the other row may be a
          multi-day event whose FIRST day is well before the one being
          written; a fortnight either side covers anything this church runs. */
       and e.starts_at >= new.starts_at - interval '45 days'
       and e.starts_at <= new.starts_at + interval '45 days'
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

    update public.events
       set duplicate_of   = v_keep,
           duplicate_note = 'Two dates on the same day, and a word in common. Being looked at.'
     where id = v_lose
       and duplicate_of is null
       and dedupe_checked_at is null
       and id <> v_keep;

  exception when others then
    -- Never the reason an event cannot be written. See 0053.
    raise warning 'hc_event_same_day_guard: %', sqlerrm;
  end;

  return null;
end;
$$;

revoke all on function public.hc_event_same_day_guard() from public, anon, authenticated;

comment on function public.hc_event_same_day_guard() is
  'Flags a newly written event against another sharing ANY day with it whose title shares a word, with no model and no HTTP request, so a duplicate is caught before the pass has run. Advisory only, never overwrites a row already answered for, and can never stop an event being written. See migrations 0053 and 0074.';


-- ---------------------------------------------------------------------------
-- 7. What the advisor will say
--
-- Two more 0039_authenticated_security_definer_function_executable, on the two
-- signatures of hc_admin_save_event, which are the two that already carried
-- one before this file, plus the unchanged note on hc_admin_apply_event_update.
-- Same answer as every other entry on the list 0025 section 6 keeps: in this
-- project a SECURITY DEFINER function IS the permission boundary.
--
-- hc_event_days, hc_event_also_on and hc_event_same_day_guard are revoked from
-- every client role, for the reason 0053 section 6 had to learn the hard way:
-- Postgres grants EXECUTE on a new function to PUBLIC unless told otherwise,
-- and 0025's test asserts the exact list a signed out client can reach.
-- ---------------------------------------------------------------------------
