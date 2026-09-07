-- ===========================================================================
-- Home Church, a limit on guessing at room codes
--
-- WHAT WAS WRONG. `hc_room_join` took a code, looked it up, and either
-- returned the room or raised. It did that as many times a second as somebody
-- cared to ask. A join code is six digits, `lpad((floor(random() * 1000000))`
-- in 0016, and it is unique only among rooms that are live right now, so on a
-- Wednesday evening perhaps twenty of the million are real. Nothing counted
-- the misses.
--
-- What that buys an attacker is not a room, it is every room: enumerate the
-- space and you are a member of every group meeting tonight, reading answers
-- and prayer requests written by people who believed they were writing to
-- eleven friends. That is the most private content this app holds, and 0016
-- says so at length.
--
-- WHAT ALREADY LIMITED IT, because it is worth being honest that this was
-- never wide open:
--
--   a real account       hc_room_join refuses auth.uid() is null, so guessing
--                        costs an email address and a sign in code
--   one evening          rooms carry closes_at and a code is meaningless the
--                        next morning
--   a visible name       joining inserts a row into group_room_members, so the
--                        group sees a stranger's name appear on the roster
--
-- That last one is the real defence and it is a good one. It is also entirely
-- after the fact: it tells the room they were joined, not that somebody spent
-- the afternoon guessing. This adds the part that happens first.
--
-- HOW IT WORKS. Every join that does NOT find a room writes one row to
-- `group_join_attempts`. Before the lookup, the misses from the last hour are
-- counted, and the eleventh is refused. A join that finds its room clears the
-- caller's misses, so a person who fat-fingered a code twice and then got it
-- right starts the evening fresh rather than carrying two strikes.
--
-- TEN AN HOUR is deliberately generous, and the shape of the number is the
-- same trade the contact form's five makes: high enough that a person reading
-- a code off a whiteboard across a dim room never once sees it, low enough
-- that a million guesses would take eleven years. The failure that matters is
-- the false positive, because it lands on somebody trying to join their own
-- small group.
--
-- WHAT IS NOT STORED. Not the code that was tried. A table of wrong guesses is
-- a table of nearly-right guesses, and if the wrong ones are worth keeping
-- then so is the reasoning that produced them. The row is a person and a
-- timestamp, which is all a counter needs.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0016, which created the rooms, and 0036, which last replaced
--   hc_room_join. Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Somewhere to count
-- ---------------------------------------------------------------------------

create table if not exists public.group_join_attempts (
  id           bigserial primary key,
  person_id    uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

comment on table public.group_join_attempts is
  'One row per join attempt that found no room. Counted over the last hour by hc_room_join, cleared on a successful join, purged nightly. Deliberately does not record the code that was tried.';

-- The only question ever asked of this table is "how many from this person
-- since then", so the index is exactly that pair.
create index if not exists group_join_attempts_person_time_idx
  on public.group_join_attempts (person_id, attempted_at desc);

-- Cascades with the account, same as every other user owned table in this
-- project. delete-account's header lists what goes when somebody leaves and
-- this belongs on that list, which is why the reference above is not just a
-- uuid column.

alter table public.group_join_attempts enable row level security;

-- No policy of any kind, and no grant to anon or authenticated. Nothing but
-- the definer function below and the service role ever touches this. A member
-- has no business reading their own miss count, let alone anybody else's, and
-- a table with no policies is the cheapest way to say so. Same shape as
-- push_log and group_filter_terms, both of which the advisor lists as
-- rls_enabled_no_policy and both of which are correct.
revoke all on public.group_join_attempts from anon, authenticated;
revoke all on sequence public.group_join_attempts_id_seq from anon, authenticated;
grant all on public.group_join_attempts to service_role;
grant all on sequence public.group_join_attempts_id_seq to service_role;


-- ---------------------------------------------------------------------------
-- 2. hc_room_join, with the counter in front of it
--
-- Replaced whole rather than patched, because 0036 replaced it whole and the
-- version that runs should be readable in one place. Everything below the
-- rate limit is 0036's body, unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.hc_room_join(p_code text)
returns public.group_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room   public.group_rooms;
  v_name   text;
  v_misses integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  /* The count first, before the lookup, so a refused caller learns nothing
     about whether the code they just tried was real. */
  select count(*) into v_misses
    from public.group_join_attempts
   where person_id = auth.uid()
     and attempted_at > now() - interval '1 hour';

  if v_misses >= 10 then
    /* Said the way a person who has genuinely mistyped would need to hear it.
       They are far more likely to be in the room than attacking it. */
    raise exception 'That is a lot of wrong codes. Wait an hour, or ask your host to read it out again.'
      using errcode = '42501';
  end if;

  select * into v_room from public.group_rooms
   where code = btrim(p_code) and closed_at is null and closes_at > now();

  if v_room.id is null then
    insert into public.group_join_attempts (person_id) values (auth.uid());
    raise exception 'No room with that code tonight.' using errcode = 'P0002';
  end if;

  /* Found it, so the misses were typos. Clearing them means the limit only
     ever accumulates against somebody who is not finding rooms at all. */
  delete from public.group_join_attempts where person_id = auth.uid();

  select coalesce(nullif(btrim(p.first_name), ''), 'Someone')
    into v_name from public.profiles p where p.id = auth.uid();

  insert into public.group_room_members (room_id, person_id, display_name, is_host)
  values (v_room.id, auth.uid(), coalesce(v_name, 'Someone'), v_room.host_id = auth.uid())
  on conflict (room_id, person_id) do update set display_name = excluded.display_name;

  return v_room;
end;
$$;

-- The grants 0016 and 0018 settled, restated rather than assumed: a
-- `create or replace` keeps the existing ACL, but this file should not need
-- reading alongside two others to know who may call it.
revoke all on function public.hc_room_join(text) from public, anon;
grant execute on function public.hc_room_join(text) to authenticated;

comment on function public.hc_room_join(text) is
  'Join a live room by its six digit code. Ten wrong codes in an hour and the caller waits, so the code space cannot be enumerated. A correct code clears the count.';


-- ---------------------------------------------------------------------------
-- 3. Sweeping up
--
-- An attempt older than the window is dead weight. hc_purge_group_rooms
-- already runs at 9am daily from pg_cron (job 2) and already owns the job of
-- taking down what the rooms feature left behind, so this goes there rather
-- than into a second schedule nobody remembers exists.
--
-- An hour is the window, a day is the purge. The gap is deliberate slack: the
-- count only reads the last hour, so rows between one hour and one sweep old
-- are inert, and sweeping them hourly would be a cron job earning nothing.
-- ---------------------------------------------------------------------------

create or replace function public.hc_purge_join_attempts(p_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gone integer;
begin
  delete from public.group_join_attempts
   where attempted_at < now() - make_interval(hours => greatest(p_hours, 1));
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;

revoke all on function public.hc_purge_join_attempts(integer) from public, anon, authenticated;
grant execute on function public.hc_purge_join_attempts(integer) to service_role;

comment on function public.hc_purge_join_attempts(integer) is
  'Drops join attempts older than p_hours. Called by hc_purge_group_rooms, which pg_cron already runs daily.';


-- hc_purge_group_rooms, replaced whole so the sweep actually happens rather
-- than being described above and scheduled nowhere. The body is 0016's, with
-- one line added. Its return value still counts rooms and not attempts,
-- because that is what job 2's history means and changing what a number
-- counts underneath a log is how a log starts lying.
create or replace function public.hc_purge_group_rooms(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  -- Rooms cascade to members, questions, notes and reports.
  delete from public.group_rooms
   where opened_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_count = row_count;

  -- A room nobody closed is over once its evening is.
  update public.group_rooms set closed_at = closes_at
   where closed_at is null and closes_at < now();

  -- Added by 0056. The rate limit reads one hour, so a day old row is inert.
  perform public.hc_purge_join_attempts(24);

  return v_count;
end;
$$;

revoke execute on function public.hc_purge_group_rooms(integer) from public, anon, authenticated;
grant  execute on function public.hc_purge_group_rooms(integer) to service_role;

comment on function public.hc_purge_group_rooms is
  'Deletes rooms older than p_days, default 90, closes rooms whose evening has passed, and sweeps stale join attempts. Scheduled as pg_cron job 2, daily at 9am.';
