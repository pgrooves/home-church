-- ===========================================================================
-- Home Church, group rooms
--
-- The Group tab. A leader opens a room, the app mints a six digit code, the
-- group joins with it, and everyone answers this week's guide questions in
-- the same place. Answers stay shut until the leader opens them.
--
-- THIS FILE DOES NOT LOOK LIKE THE OTHER MIGRATIONS, AND THAT IS ON PURPOSE.
-- Every content table in this schema is church authored and world readable:
-- `select using (published)`, no write policy at all, and the whole security
-- model fits in two lines. Nothing here is church authored. This is the first
-- table in the project where one person writes a row and a different person
-- reads it, which is a different problem and needs a different shape. The
-- precedent to read first is 0009, the profiles table, not
-- TEMPLATE_new_content_type.sql.
--
-- THE ONE RULE THIS FILE EXISTS TO ENFORCE. A closed answer must not leave
-- the database. It is tempting to fetch a room's answers and let the screen
-- decline to draw the shut ones, and it would be much less code. It would
-- also be a lie: anybody could open the network tab, or read the app's own
-- cache off the phone, and have the whole room. People write about their
-- marriage and their job in these boxes. So `opened_at` is a column, the
-- select policy honours it, and the screen is only ever drawing what the
-- server was already willing to hand over.
--
-- WHY EVERY WRITE GOES THROUGH A FUNCTION. There are no insert or update
-- policies on these tables. Writes go through the `hc_room_*` functions
-- below, which are SECURITY DEFINER, so each one is a single place that
-- checks the caller is in the room, is the host where that matters, and has
-- agreed to the terms. Three things follow from that: the display name on a
-- note comes from the caller's own profile rather than from whatever the
-- client claimed, the host can open an answer without being able to rewrite
-- it, and a reviewer asking "what stops a member editing somebody else's
-- answer" gets a one word answer, which is: nothing can, there is no policy
-- that would let it.
--
-- WHAT THIS PULLS IN. Answers and prayer requests are shown to other people,
-- which makes them user generated content under App Store guideline 1.2.
-- APP_STORE_COMPLIANCE.md section 2.5 named this exact feature as the thing
-- that would break its no-UGC claim. The reporting, blocking and terms
-- acceptance in this file are the database half of the answer to that.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Two columns on profiles
--
-- `can_host` is not self service. A host edits the questions everybody sees
-- and can take down anything anybody wrote, which is real authority over
-- other people's words, and `leaderMode` in js/store.js is a switch in
-- Profile that anyone can flip for themselves. That switch stays exactly as
-- it is, because what it turns on is a private roster and a presentation
-- mode. Hosting a room is a different thing and the church sets it:
--
--   python3 scripts/hc_supabase.py host someone@example.com on
--
-- which looks the account up by email and does this, so nobody has to find a
-- uuid or write SQL by hand:
--
--   update public.profiles set can_host = true where id = '<uuid>';
--
-- `terms_accepted_at` is guideline 1.2's requirement that people agree to
-- terms forbidding objectionable content before they can post. It is checked
-- in hc_room_post below, so it cannot be skipped by a client that decides not
-- to show the screen.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists can_host          boolean not null default false;
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.can_host is
  'Set by the church, never by the app. Lets this person open and host a group room.';
comment on column public.profiles.terms_accepted_at is
  'When they agreed to the group terms. Null means they have never posted and cannot yet.';


-- ---------------------------------------------------------------------------
-- 2. The room
--
-- `code` is six digits and lives for one evening. Uniqueness is enforced
-- only among rooms that are still open, by the partial index below, so last
-- Thursday's 486217 is free to be somebody else's tonight. A million codes
-- is plenty when only a handful are live at once.
--
-- `closes_at` is set by the opening function to the end of the day. A room
-- past that is over whether or not anybody pressed the button, which matters
-- because leaders forget to close rooms and a code that answers forever is a
-- code somebody eventually guesses.
-- ---------------------------------------------------------------------------

create table if not exists public.group_rooms (
  id           uuid primary key default gen_random_uuid(),

  code         text not null,
  host_id      uuid not null references auth.users (id) on delete cascade,

  group_name   text,                      -- 'Lakeview Thursday', for the header
  guide_id     text,                      -- the guide the questions came from
  guide_title  text,                      -- denormalized, so a closed room still reads right

  opened_at    timestamptz not null default now(),
  closes_at    timestamptz not null,
  closed_at    timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint group_rooms_code_is_six_digits check (code ~ '^[0-9]{6}$')
);

comment on table public.group_rooms is
  'One room, one evening, one six digit code. The Group tab.';
comment on column public.group_rooms.code is
  'Six digits. Unique among live rooms only, see group_rooms_live_code_idx.';
comment on column public.group_rooms.guide_title is
  'Copied at open time so a room still reads correctly after the guide is edited or unpublished.';

-- The load bearing index. Two live rooms cannot share a code.
create unique index if not exists group_rooms_live_code_idx
  on public.group_rooms (code)
  where closed_at is null;

create index if not exists group_rooms_host_idx
  on public.group_rooms (host_id, opened_at desc);


-- ---------------------------------------------------------------------------
-- 3. Who is in the room
--
-- `display_name` is copied from the person's profile when they join, not read
-- through to it. Two reasons. The profiles policy from 0009 is "you can see
-- your own row and nobody else's", which is the right policy and which means
-- one member cannot read another member's name through a join. And a name on
-- something you said last month should not silently change because you edited
-- your profile since.
-- ---------------------------------------------------------------------------

create table if not exists public.group_room_members (
  room_id      uuid not null references public.group_rooms (id) on delete cascade,
  person_id    uuid not null references auth.users (id) on delete cascade,

  display_name text not null,
  is_host      boolean not null default false,
  joined_at    timestamptz not null default now(),

  primary key (room_id, person_id)
);

comment on table public.group_room_members is
  'Who is in a room. display_name is a copy of the profile first name taken at join time.';


-- ---------------------------------------------------------------------------
-- 4. The questions
--
-- Copied out of the guide when the room opens, never referenced back to it.
-- A leader rewording a question for his living room must not rewrite the
-- guide for the other three groups meeting that week, and the guide can be
-- edited or unpublished afterwards without changing what happened in a room.
-- ---------------------------------------------------------------------------

create table if not exists public.group_room_questions (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.group_rooms (id) on delete cascade,

  heading     text,                       -- 'Getting started', from the guide section
  body        text not null,
  sort_order  integer not null default 0,
  added_by_host boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.group_room_questions is
  'A room''s questions. Copied from the guide at open time, then owned by the room.';

create index if not exists group_room_questions_room_idx
  on public.group_room_questions (room_id, sort_order, created_at);


-- ---------------------------------------------------------------------------
-- 5. What people wrote
--
-- One table for two things, separated by `kind`. An answer hangs off a
-- question and starts shut. A prayer request hangs off nothing and is never
-- shut, because a room does not sit on what it is being asked to pray about.
-- They share a table because they share everything that matters: an author, a
-- display name, a takedown, a report, and a retention clock.
--
-- `opened_at` is the whole feature. Null means the room cannot see it.
-- ---------------------------------------------------------------------------

create table if not exists public.group_room_notes (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.group_rooms (id) on delete cascade,
  question_id  uuid references public.group_room_questions (id) on delete cascade,

  kind         text not null default 'answer',
  author_id    uuid not null references auth.users (id) on delete cascade,
  author_name  text not null,             -- copied from the profile, see members above

  body         text not null,

  -- Null until the host opens it. Prayer requests are opened on insert.
  opened_at    timestamptz,

  -- Set when the host takes it down. Kept rather than deleted so a report can
  -- still be looked at afterwards, and swept by the retention function below.
  removed_at   timestamptz,
  removed_by   uuid references auth.users (id) on delete set null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint group_room_notes_kind
    check (kind in ('answer', 'prayer')),
  -- An answer belongs to a question. A prayer request does not.
  constraint group_room_notes_question_matches_kind
    check ((kind = 'answer' and question_id is not null)
        or (kind = 'prayer' and question_id is null)),
  constraint group_room_notes_body_not_empty
    check (length(btrim(body)) > 0)
);

comment on table public.group_room_notes is
  'Answers and prayer requests. opened_at null means the room cannot see it yet, and the select policy enforces that.';
comment on column public.group_room_notes.opened_at is
  'The reveal. Null means only the author can read this row. Set by the host through hc_room_open_answer.';
comment on column public.group_room_notes.author_name is
  'Copied from the profile at post time. Never read through to profiles, which are private to their owner.';

create index if not exists group_room_notes_room_idx
  on public.group_room_notes (room_id, question_id, created_at);
create index if not exists group_room_notes_author_idx
  on public.group_room_notes (author_id);


-- ---------------------------------------------------------------------------
-- 6. Reports and blocks
--
-- Guideline 1.2 wants a way to report content and a way to block a person.
-- Reports go to the room's host, who is the one who can act inside the hour,
-- and hello@homechurchnola.com is published in the app as the route that
-- still works when the host is the problem.
--
-- A block is one directional and personal: it stops their writing reaching
-- you. It does not remove anything for anybody else, which is the host's job.
-- ---------------------------------------------------------------------------

create table if not exists public.group_note_reports (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.group_room_notes (id) on delete cascade,
  room_id      uuid not null references public.group_rooms (id) on delete cascade,

  reporter_id  uuid not null references auth.users (id) on delete cascade,
  reason       text,

  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id) on delete set null,

  unique (note_id, reporter_id)
);

comment on table public.group_note_reports is
  'Guideline 1.2 reporting. One row per person per note. Read by the room host.';

create index if not exists group_note_reports_open_idx
  on public.group_note_reports (room_id, created_at desc)
  where resolved_at is null;

create table if not exists public.group_blocks (
  blocker_id   uuid not null references auth.users (id) on delete cascade,
  blocked_id   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint group_blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.group_blocks is
  'Guideline 1.2 blocking. One directional: their writing stops reaching you.';


-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- Reuses the shared function from 0001, no second copy.
-- ---------------------------------------------------------------------------

drop trigger if exists group_rooms_set_updated_at on public.group_rooms;
create trigger group_rooms_set_updated_at
  before update on public.group_rooms
  for each row execute function public.hc_set_updated_at();

drop trigger if exists group_room_questions_set_updated_at on public.group_room_questions;
create trigger group_room_questions_set_updated_at
  before update on public.group_room_questions
  for each row execute function public.hc_set_updated_at();

drop trigger if exists group_room_notes_set_updated_at on public.group_room_notes;
create trigger group_room_notes_set_updated_at
  before update on public.group_room_notes
  for each row execute function public.hc_set_updated_at();


-- ---------------------------------------------------------------------------
-- 8. Helpers the policies lean on
--
-- Marked STABLE and SECURITY DEFINER so a policy can ask "is the caller in
-- this room" without the caller needing to be able to read the members table
-- for rooms they are not in.
-- ---------------------------------------------------------------------------

create or replace function public.hc_room_is_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_room_members m
    where m.room_id = p_room and m.person_id = auth.uid()
  );
$$;

create or replace function public.hc_room_is_host(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_rooms r
    where r.id = p_room and r.host_id = auth.uid()
  );
$$;

create or replace function public.hc_room_is_live(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_rooms r
    where r.id = p_room and r.closed_at is null and r.closes_at > now()
  );
$$;


-- ---------------------------------------------------------------------------
-- 9. Row level security
--
-- Select policies only. There is no insert, update or delete policy on any
-- table in this file, which is what forces every write through the functions
-- in section 10.
--
-- On the one thing worth reading twice, the notes policy. Three clauses, in
-- the order they matter:
--
--   * you are in the room. Not "you have the code". The code gets you into
--     the room, membership is what lets you read what people wrote in it.
--   * it is open, or you wrote it. This is the reveal, and it is here rather
--     than in JavaScript for the reason in the file header.
--   * you have not blocked the author.
--
-- A note the host took down is gone for everybody including its author, which
-- is what a takedown has to mean.
-- ---------------------------------------------------------------------------

alter table public.group_rooms          enable row level security;
alter table public.group_room_members   enable row level security;
alter table public.group_room_questions enable row level security;
alter table public.group_room_notes     enable row level security;
alter table public.group_note_reports   enable row level security;
alter table public.group_blocks         enable row level security;

-- 9a. The room itself. Readable while live so that typing the code can find
-- it, and readable afterwards by the people who were in it.
drop policy if exists "a live room can be found by its code" on public.group_rooms;
create policy "a live room can be found by its code"
  on public.group_rooms for select
  to anon, authenticated
  using (closed_at is null and closes_at > now());

drop policy if exists "members keep reading a room after it closes" on public.group_rooms;
create policy "members keep reading a room after it closes"
  on public.group_rooms for select
  to authenticated
  using (public.hc_room_is_member(id));

-- 9b. Members. You can see who else is in a room you are in.
drop policy if exists "members can see the room they are in" on public.group_room_members;
create policy "members can see the room they are in"
  on public.group_room_members for select
  to authenticated
  using (public.hc_room_is_member(room_id));

-- 9c. Questions. These are the guide's words, not anybody's private writing,
-- so they follow the room: readable while it is live, and afterwards to the
-- people who were there.
drop policy if exists "questions follow the room" on public.group_room_questions;
create policy "questions follow the room"
  on public.group_room_questions for select
  to anon, authenticated
  using (public.hc_room_is_live(room_id) or public.hc_room_is_member(room_id));

-- 9d. The notes. The one that matters.
drop policy if exists "open answers, and your own" on public.group_room_notes;
create policy "open answers, and your own"
  on public.group_room_notes for select
  to authenticated
  using (
    removed_at is null
    and public.hc_room_is_member(room_id)
    and (opened_at is not null or author_id = auth.uid())
    and not exists (
      select 1 from public.group_blocks b
      where b.blocker_id = auth.uid() and b.blocked_id = group_room_notes.author_id
    )
  );

-- 9e. Reports. The reporter sees their own, the host sees their room's.
drop policy if exists "your reports and your room's reports" on public.group_note_reports;
create policy "your reports and your room's reports"
  on public.group_note_reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.hc_room_is_host(room_id));

-- 9f. Blocks. Yours only.
drop policy if exists "your own blocks" on public.group_blocks;
create policy "your own blocks"
  on public.group_blocks for select
  to authenticated
  using (blocker_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 10. Every write, one function each
--
-- SECURITY DEFINER, so each is the single place a rule is checked, and each
-- raises rather than returning quietly when a rule is broken. `set search_path`
-- on every one of them, because a SECURITY DEFINER function without it is the
-- classic Postgres privilege escalation.
-- ---------------------------------------------------------------------------

-- Agreeing to the terms. Called once, before a first post.
create or replace function public.hc_room_accept_terms()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_when timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  update public.profiles
     set terms_accepted_at = coalesce(terms_accepted_at, now())
   where id = auth.uid()
  returning terms_accepted_at into v_when;

  if v_when is null then
    raise exception 'No profile to agree with.' using errcode = 'P0002';
  end if;
  return v_when;
end;
$$;


-- Opening a room. Hosts only, and the caller does not get to choose the code.
create or replace function public.hc_room_open(
  p_guide_id    text,
  p_guide_title text,
  p_group_name  text,
  p_questions   jsonb        -- [{heading, body}, ...] in order, from the guide
)
returns public.group_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room  public.group_rooms;
  v_name  text;
  v_host  boolean;
  v_code  text;
  v_try   integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select p.can_host, coalesce(nullif(btrim(p.first_name), ''), 'The host')
    into v_host, v_name
    from public.profiles p where p.id = auth.uid();

  if not coalesce(v_host, false) then
    raise exception 'Only a leader the church has marked can open a room.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Questions must be an array.' using errcode = '22023';
  end if;

  -- Six digits, retried on the astronomically unlikely collision with a live
  -- room. Ten tries and then we would rather fail loudly than loop.
  loop
    v_try := v_try + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.group_rooms (code, host_id, group_name, guide_id, guide_title, closes_at)
      values (
        v_code, auth.uid(), nullif(btrim(p_group_name), ''), p_guide_id, p_guide_title,
        -- End of the day, so a room nobody closed is still over by morning.
        date_trunc('day', now()) + interval '1 day'
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_try >= 10 then raise; end if;
    end;
  end loop;

  insert into public.group_room_members (room_id, person_id, display_name, is_host)
  values (v_room.id, auth.uid(), v_name, true);

  insert into public.group_room_questions (room_id, heading, body, sort_order)
  select v_room.id,
         nullif(btrim(q ->> 'heading'), ''),
         btrim(q ->> 'body'),
         (ord * 10)::int
    from jsonb_array_elements(p_questions) with ordinality as t(q, ord)
   where length(btrim(coalesce(q ->> 'body', ''))) > 0;

  return v_room;
end;
$$;


-- Joining with a code.
create or replace function public.hc_room_join(p_code text)
returns public.group_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.group_rooms;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into v_room from public.group_rooms
   where code = btrim(p_code) and closed_at is null and closes_at > now();

  if v_room.id is null then
    raise exception 'No room with that code tonight.' using errcode = 'P0002';
  end if;

  select coalesce(nullif(btrim(p.first_name), ''), 'Someone')
    into v_name from public.profiles p where p.id = auth.uid();

  insert into public.group_room_members (room_id, person_id, display_name, is_host)
  values (v_room.id, auth.uid(), coalesce(v_name, 'Someone'), v_room.host_id = auth.uid())
  on conflict (room_id, person_id) do update set display_name = excluded.display_name;

  return v_room;
end;
$$;


-- Posting an answer or a prayer request.
create or replace function public.hc_room_post(
  p_room     uuid,
  p_question uuid,          -- null for a prayer request
  p_kind     text,
  p_body     text
)
returns public.group_room_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note   public.group_room_notes;
  v_name   text;
  v_agreed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.hc_room_is_member(p_room) then
    raise exception 'Join the room first.' using errcode = '42501';
  end if;
  if not public.hc_room_is_live(p_room) then
    raise exception 'That room is closed.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Nothing to post.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(p.first_name), ''), 'Someone'), p.terms_accepted_at
    into v_name, v_agreed
    from public.profiles p where p.id = auth.uid();

  -- Guideline 1.2: agreement before a first post, checked here rather than on
  -- the screen so that skipping the screen does not skip the rule.
  if v_agreed is null then
    raise exception 'Agree to the group terms before posting.' using errcode = '42501';
  end if;

  insert into public.group_room_notes
    (room_id, question_id, kind, author_id, author_name, body, opened_at)
  values (
    p_room,
    case when p_kind = 'prayer' then null else p_question end,
    case when p_kind = 'prayer' then 'prayer' else 'answer' end,
    auth.uid(),
    coalesce(v_name, 'Someone'),
    btrim(p_body),
    -- A prayer request is never held back. An answer waits for the host.
    case when p_kind = 'prayer' then now() else null end
  )
  returning * into v_note;

  return v_note;
end;
$$;


-- Editing and deleting your own.
create or replace function public.hc_room_edit_note(p_note uuid, p_body text)
returns public.group_room_notes
language plpgsql
security definer
set search_path = public
as $$
declare v_note public.group_room_notes;
begin
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;

  update public.group_room_notes
     set body = btrim(p_body)
   where id = p_note and author_id = auth.uid() and removed_at is null
  returning * into v_note;

  if v_note.id is null then
    raise exception 'That is not yours to edit.' using errcode = '42501';
  end if;
  return v_note;
end;
$$;

create or replace function public.hc_room_delete_note(p_note uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.group_room_notes
   where id = p_note and author_id = auth.uid();
  if not found then
    raise exception 'That is not yours to delete.' using errcode = '42501';
  end if;
end;
$$;


-- The reveal. Host only, and note what it cannot do: this function touches
-- `opened_at` and nothing else, so hosting a room never becomes a licence to
-- rewrite what somebody said in it.
create or replace function public.hc_room_open_answer(p_note uuid, p_open boolean)
returns public.group_room_notes
language plpgsql
security definer
set search_path = public
as $$
declare v_note public.group_room_notes;
begin
  select n.* into v_note from public.group_room_notes n where n.id = p_note;
  if v_note.id is null then
    raise exception 'No such answer.' using errcode = 'P0002';
  end if;
  if not public.hc_room_is_host(v_note.room_id) then
    raise exception 'Only the host opens answers.' using errcode = '42501';
  end if;

  update public.group_room_notes
     set opened_at = case when p_open then coalesce(opened_at, now()) else null end
   where id = p_note
  returning * into v_note;

  return v_note;
end;
$$;

-- The same switch thrown for a whole question, or a whole room. One call
-- rather than one per answer, because a leader running a room should not be
-- waiting on a dozen round trips.
create or replace function public.hc_room_open_all(
  p_room     uuid,
  p_question uuid,          -- null means the whole room
  p_open     boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.hc_room_is_host(p_room) then
    raise exception 'Only the host opens answers.' using errcode = '42501';
  end if;

  update public.group_room_notes
     set opened_at = case when p_open then coalesce(opened_at, now()) else null end
   where room_id = p_room
     and kind = 'answer'
     and removed_at is null
     and (p_question is null or question_id = p_question);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- The host's questions: add, reword, remove.
create or replace function public.hc_room_add_question(p_room uuid, p_body text)
returns public.group_room_questions
language plpgsql
security definer
set search_path = public
as $$
declare v_q public.group_room_questions;
begin
  if not public.hc_room_is_host(p_room) then
    raise exception 'Only the host changes the questions.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Nothing to add.' using errcode = '22023';
  end if;

  insert into public.group_room_questions (room_id, heading, body, sort_order, added_by_host)
  select p_room, null, btrim(p_body),
         coalesce(max(sort_order), 0) + 10, true
    from public.group_room_questions where room_id = p_room
  returning * into v_q;

  return v_q;
end;
$$;

create or replace function public.hc_room_edit_question(p_question uuid, p_body text)
returns public.group_room_questions
language plpgsql
security definer
set search_path = public
as $$
declare v_q public.group_room_questions;
begin
  select q.* into v_q from public.group_room_questions q where q.id = p_question;
  if v_q.id is null then
    raise exception 'No such question.' using errcode = 'P0002';
  end if;
  if not public.hc_room_is_host(v_q.room_id) then
    raise exception 'Only the host changes the questions.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'A question cannot be empty.' using errcode = '22023';
  end if;

  update public.group_room_questions set body = btrim(p_body)
   where id = p_question returning * into v_q;
  return v_q;
end;
$$;

create or replace function public.hc_room_remove_question(p_question uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_room uuid;
begin
  select room_id into v_room from public.group_room_questions where id = p_question;
  if v_room is null then
    raise exception 'No such question.' using errcode = 'P0002';
  end if;
  if not public.hc_room_is_host(v_room) then
    raise exception 'Only the host changes the questions.' using errcode = '42501';
  end if;
  delete from public.group_room_questions where id = p_question;
end;
$$;


-- Guideline 1.2, the three controls.
create or replace function public.hc_room_report(p_note uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_note public.group_room_notes;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select n.* into v_note from public.group_room_notes n where n.id = p_note;
  if v_note.id is null then
    raise exception 'No such note.' using errcode = 'P0002';
  end if;
  if not public.hc_room_is_member(v_note.room_id) then
    raise exception 'You are not in that room.' using errcode = '42501';
  end if;

  insert into public.group_note_reports (note_id, room_id, reporter_id, reason)
  values (p_note, v_note.room_id, auth.uid(), nullif(btrim(p_reason), ''))
  on conflict (note_id, reporter_id) do update set reason = excluded.reason;
end;
$$;

-- The host's takedown. Removes it for everybody, its author included, and
-- resolves any report against it in the same breath.
create or replace function public.hc_room_take_down(p_note uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_note public.group_room_notes;
begin
  select n.* into v_note from public.group_room_notes n where n.id = p_note;
  if v_note.id is null then
    raise exception 'No such note.' using errcode = 'P0002';
  end if;
  if not public.hc_room_is_host(v_note.room_id) then
    raise exception 'Only the host takes something down.' using errcode = '42501';
  end if;

  update public.group_room_notes
     set removed_at = now(), removed_by = auth.uid()
   where id = p_note;

  update public.group_note_reports
     set resolved_at = now(), resolved_by = auth.uid()
   where note_id = p_note and resolved_at is null;
end;
$$;

create or replace function public.hc_room_block(p_person uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_person = auth.uid() then
    raise exception 'You cannot block yourself.' using errcode = '22023';
  end if;

  if p_blocked then
    insert into public.group_blocks (blocker_id, blocked_id)
    values (auth.uid(), p_person)
    on conflict do nothing;
  else
    delete from public.group_blocks
     where blocker_id = auth.uid() and blocked_id = p_person;
  end if;
end;
$$;


-- Closing the room.
create or replace function public.hc_room_close(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_room_is_host(p_room) then
    raise exception 'Only the host closes the room.' using errcode = '42501';
  end if;
  update public.group_rooms set closed_at = now()
   where id = p_room and closed_at is null;
end;
$$;


-- ---------------------------------------------------------------------------
-- 11. Retention
--
-- Ninety days, then it deletes itself. Long enough that a group can look back
-- at a night, short enough that a hard season somebody wrote about in March is
-- not still sitting in a database in December. This is also the answer the
-- privacy policy gives, so if the number changes here it changes there.
--
-- The function is safe to call as often as you like. Schedule it whichever way
-- this project ends up with:
--
--   pg_cron, if the extension is enabled on the project:
--     select cron.schedule('hc-purge-rooms', '0 4 * * *',
--                          $$select public.hc_purge_group_rooms()$$);
--
--   or a Supabase scheduled Edge Function calling it once a day.
--
-- Until one of those is set up nothing deletes itself, so do not consider the
-- retention promise kept just because this function exists.
-- ---------------------------------------------------------------------------

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

  return v_count;
end;
$$;

comment on function public.hc_purge_group_rooms is
  'Deletes rooms older than p_days, default 90, and closes rooms whose evening has passed. Schedule it, see migration 0016 section 11.';


-- ---------------------------------------------------------------------------
-- 12. Grants
--
-- Select only on the tables, so the policies in section 9 are the whole read
-- story, and execute on the functions, which are the whole write story. anon
-- gets exactly enough to type a code and see what a room is about, and nothing
-- that anybody wrote.
-- ---------------------------------------------------------------------------

grant select on public.group_rooms          to anon, authenticated;
grant select on public.group_room_questions to anon, authenticated;
grant select on public.group_room_members   to authenticated;
grant select on public.group_room_notes     to authenticated;
grant select on public.group_note_reports   to authenticated;
grant select on public.group_blocks         to authenticated;

revoke insert, update, delete on public.group_rooms          from anon, authenticated;
revoke insert, update, delete on public.group_room_members   from anon, authenticated;
revoke insert, update, delete on public.group_room_questions from anon, authenticated;
revoke insert, update, delete on public.group_room_notes     from anon, authenticated;
revoke insert, update, delete on public.group_note_reports   from anon, authenticated;
revoke insert, update, delete on public.group_blocks         from anon, authenticated;

grant all on public.group_rooms          to service_role;
grant all on public.group_room_members   to service_role;
grant all on public.group_room_questions to service_role;
grant all on public.group_room_notes     to service_role;
grant all on public.group_note_reports   to service_role;
grant all on public.group_blocks         to service_role;

grant execute on function public.hc_room_accept_terms()                      to authenticated;
grant execute on function public.hc_room_open(text, text, text, jsonb)       to authenticated;
grant execute on function public.hc_room_join(text)                          to authenticated;
grant execute on function public.hc_room_post(uuid, uuid, text, text)        to authenticated;
grant execute on function public.hc_room_edit_note(uuid, text)               to authenticated;
grant execute on function public.hc_room_delete_note(uuid)                   to authenticated;
grant execute on function public.hc_room_open_answer(uuid, boolean)          to authenticated;
grant execute on function public.hc_room_open_all(uuid, uuid, boolean)       to authenticated;
grant execute on function public.hc_room_add_question(uuid, text)            to authenticated;
grant execute on function public.hc_room_edit_question(uuid, text)           to authenticated;
grant execute on function public.hc_room_remove_question(uuid)               to authenticated;
grant execute on function public.hc_room_report(uuid, text)                  to authenticated;
grant execute on function public.hc_room_take_down(uuid)                     to authenticated;
grant execute on function public.hc_room_block(uuid, boolean)                to authenticated;
grant execute on function public.hc_room_close(uuid)                         to authenticated;

-- The purge runs as a scheduled job, not as anybody's session.
--
-- WRONG, AND FIXED IN 0017. This revoke does nothing. Postgres grants EXECUTE
-- on every new function to PUBLIC, PUBLIC cannot be named in a revoke list of
-- roles, and every role kept inheriting execute through it. For a while this
-- meant anybody holding the app's publishable key could delete every group
-- room over PostgREST. 0017_group_rooms_grants.sql revokes from public by name
-- on all nineteen functions and grants back precisely. Do not copy this line.
revoke execute on function public.hc_purge_group_rooms(integer) from anon, authenticated;
grant  execute on function public.hc_purge_group_rooms(integer) to service_role;
