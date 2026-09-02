-- ===========================================================================
-- Home Church, who posted this announcement
--
-- WHAT THIS ADDS. One line, on the announcements the church's own staff are
-- looking at: "by Ada Lovelace", or "from the email newsletter". Admins and
-- leaders see it beside the date the announcement went up. Everybody else sees
-- the announcement exactly as it is today, because everybody else is reading a
-- notice from their church and not an audit trail.
--
-- WHY IT EXISTS. There are four doors into this table now: the Post an
-- announcement form on a phone, /new-announcement from Claude Code, the
-- newsletter intake's review queue, and a migration. Once more than one person
-- can post, "who wrote this" stops being obvious and starts being a question
-- somebody asks out loud on a Sunday morning about a card that is already on
-- four hundred phones. 0043 answered the same question for approvals and this
-- is that answer said about writing rather than about approving.
--
-- ---------------------------------------------------------------------------
-- WHY A TABLE AND NOT TWO COLUMNS ON announcements
-- ---------------------------------------------------------------------------
--
-- This is 0043 section 7's argument, unchanged, and it is the whole reason
-- this file is longer than an `alter table`. The app's content sync reads
-- announcements with the publishable key, no session, and `select=*`. A column
-- called author_name on that table is a name every phone in the church
-- downloads with the announcement itself, whether or not any screen draws it,
-- and RLS cannot help: it decides rows, not columns. Revoking the column
-- instead breaks `select=*` for the same sync, on every phone, including the
-- signed out ones.
--
-- A table of its own is the only shape where "admins and leaders" is true of
-- the data and not just of the rendering. There is no read path to this one
-- that does not go through hc_is_leader().
--
-- WHY THE NAME IS COPIED IN rather than joined to profiles on read. Both of
-- 0043's reasons, and they are unchanged here. The profiles select policy from
-- 0009 is `auth.uid() = id`, so one admin cannot read another's name at all,
-- and widening that so a leader can read the whole congregation's names to put
-- one line on one card is a trade nobody should take. And a note about a card
-- posted in October should still say who posted it after they have left the
-- church and the row is gone, which is why author_id is `on delete set null`
-- and the name beside it is not.
--
-- WHY source IS COPIED IN TOO, which 0043 had no equivalent of.
-- announcements.source already says 'newsletter', and reading it would mean
-- teaching the app's public payload one more column so that a line only
-- leaders see can be drawn. Copying it here keeps the whole of this feature
-- inside the one table only leaders can read, and keeps it a record of how the
-- row arrived rather than of what the row says today.
--
-- WHAT A LEADER CAN LEARN FROM THIS THAT THEY CANNOT SEE ELSEWHERE, said
-- plainly rather than left for somebody to find. A leader cannot read an
-- unpublished announcement, 0026 saw to that, but they can read the note on
-- one: an id, a name, and a source. That is a byline with no announcement
-- attached to it, and it is a smaller thing than the alternative, which is a
-- policy whose subquery re-reads announcements under their own RLS every time
-- a leader opens Home.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run,
--   or mcp__Supabase__apply_migration. See supabase/ACCESS.md.
--   Needs 0003 (announcements), 0036 (hc_is_leader), 0038 (source) and 0043
--   (hc_admin_display_name).
--   Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The note
--
-- One row per announcement, written by the trigger in section 3 rather than by
-- anything that posts. author_name is null on everything the service role
-- wrote, which is every announcement from /new-announcement and every draft
-- the newsletter intake parsed: nobody was signed in, so there is no person to
-- name, and inventing one would be worse than saying nothing.
--
-- `on delete cascade` here where review_approvals has no foreign key at all,
-- and the difference is that this table points at exactly one other. Ids in
-- this project are permanent and derived from titles, so the same id genuinely
-- does come back: an announcement deleted from the Admin screen and written
-- again next year is a new announcement wearing an old id, and a note that
-- outlived the first one would put the wrong name on the second. Cascading is
-- what stops that.
-- ---------------------------------------------------------------------------

create table if not exists public.announcement_authors (
  announcement_id text primary key
    references public.announcements (id) on delete cascade,
  author_id       uuid references auth.users (id) on delete set null,
  author_name     text,
  source          text not null default 'admin',
  wrote_at        timestamptz not null default now()
);

comment on table public.announcement_authors is
  'Who posted each announcement, for the line admins and leaders see beside the date on the card. Read through hc_is_leader() and by nothing else: this is the church''s own note, not part of the announcement. Written only by the trigger in migration 0045 section 3.';
comment on column public.announcement_authors.author_name is
  'Copied in at write time rather than joined to profiles on read, for 0043''s two reasons: nobody can read anybody else''s profile row, and a note about October should still name the person after they have left. Null when nobody was signed in, which is every row the service role wrote.';
comment on column public.announcement_authors.source is
  'A copy of announcements.source as it was when the row was written. Here rather than read from the announcement itself so that the whole of this feature stays inside the one table only leaders can read: see migration 0045''s header.';


-- ---------------------------------------------------------------------------
-- 2. Row level security
--
-- Leaders and admins read; nobody writes. Shaped like review_approvals in 0043
-- with hc_is_leader() in place of hc_is_admin(), which is the one deliberate
-- difference: an approval note is about a decision only admins make, and a
-- byline is about a card the leaders of this church are asked about on the way
-- into the building.
--
-- The trigger is the entire write surface, and it holds the service role's
-- privileges rather than the caller's, so there is no write policy here for
-- the same reason 0003 has none: the missing policy IS the mechanism.
--
-- anon gets no grant and no policy, which is two independent things wrong
-- rather than one for a signed out phone that goes looking. It also matters
-- which one it meets first: hc_is_leader() is revoked from anon on purpose
-- (0036 section 3), and a policy expression runs with the caller's own
-- privileges, so an anon SELECT that reached the policy would raise rather
-- than return nothing. It never reaches it, because the missing table grant
-- refuses it first.
-- ---------------------------------------------------------------------------

alter table public.announcement_authors enable row level security;

drop policy if exists "leaders read who posted an announcement"
  on public.announcement_authors;

create policy "leaders read who posted an announcement"
  on public.announcement_authors for select
  to authenticated
  using (public.hc_is_leader());

revoke all on public.announcement_authors from anon, authenticated;
grant select on public.announcement_authors to authenticated;
grant all on public.announcement_authors to service_role;


-- ---------------------------------------------------------------------------
-- 3. The trigger that writes it
--
-- ON THE TABLE RATHER THAN IN THE FORM, and that is the point of doing it this
-- way. There are four doors into announcements and there will be a fifth; a
-- byline written by the admin form is a byline that is missing from every
-- other one, and nobody notices, because the failure is a line that is not
-- there. A trigger cannot be forgotten by a caller that does not know about
-- it.
--
-- auth.uid() AND NOT A PARAMETER, for hc_set_admin_device_token's reason in
-- 0043 section 4: there is no id to pass, so there is no id to pass wrongly.
-- Nothing that posts an announcement can decide whose name goes on it.
--
-- SECURITY DEFINER is load bearing twice over. hc_admin_display_name reads a
-- profiles row the caller is not allowed to read, and is revoked from every
-- client role precisely so it cannot be used as a directory; and this table
-- has no insert grant for anybody. So the trigger runs as its owner, which is
-- the only role that can do either.
--
-- INSERT ONLY. Editing an announcement does not change who posted it, and an
-- update trigger would quietly rewrite the byline of somebody else's card the
-- first time an admin fixed a typo in it.
--
-- `on conflict do update` for the reason every file here is re-runnable: the
-- cascade in section 1 means a re-created id normally arrives with no note at
-- all, and if one is somehow already there the newer write is the true one.
-- ---------------------------------------------------------------------------

create or replace function public.hc_note_announcement_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  insert into public.announcement_authors
    (announcement_id, author_id, author_name, source)
  values (
    new.id,
    v_uid,
    -- Null rather than hc_admin_display_name's 'an admin' fallback: the
    -- service role is not an anonymous admin, it is the church's own scripts,
    -- and section 4 of this file is what says so on screen.
    case when v_uid is null then null
         else public.hc_admin_display_name(v_uid) end,
    coalesce(new.source, 'admin')
  )
  on conflict (announcement_id) do update
    set author_id   = excluded.author_id,
        author_name = excluded.author_name,
        source      = excluded.source,
        wrote_at    = now();

  return new;
end;
$$;

revoke all on function public.hc_note_announcement_author() from public, anon, authenticated;

comment on function public.hc_note_announcement_author() is
  'Writes down who posted an announcement, on insert, from auth.uid() rather than from anything the caller hands it. On the table rather than in the form because there are four doors into announcements and a byline written by one of them is a byline missing from the other three.';

drop trigger if exists announcements_note_author on public.announcements;

create trigger announcements_note_author
  after insert on public.announcements
  for each row execute function public.hc_note_announcement_author();


-- ---------------------------------------------------------------------------
-- 4. Everything already in the table
--
-- Every announcement that exists before this file runs gets a note with no
-- name on it, carrying the source it was written with. That is worth doing for
-- one of the two cases and honest about the other:
--
--   The newsletter drafts, of which there are many, immediately read "from the
--   email newsletter" rather than waiting for the next Tuesday's email.
--
--   Everything a person wrote by hand reads as nothing at all, because this
--   database never recorded who they were and guessing would be worse than a
--   blank. The first announcement posted after this migration is the first one
--   that can carry a name.
--
-- The left join makes it a no-op on the second run, which is what every file
-- in this project promises.
-- ---------------------------------------------------------------------------

insert into public.announcement_authors (announcement_id, author_id, author_name, source, wrote_at)
select a.id, null, null, coalesce(a.source, 'admin'), a.created_at
  from public.announcements a
  left join public.announcement_authors n on n.announcement_id = a.id
 where n.announcement_id is null;


-- ---------------------------------------------------------------------------
-- 5. What the security advisor will say about this, and why it is fine
--
-- Nothing new. hc_note_announcement_author is SECURITY DEFINER and revoked
-- from every client role, so it does not appear under
-- 0029_authenticated_security_definer_function_executable at all: it is
-- reachable only as a trigger on a table whose insert policy already asks
-- hc_is_admin(). It is named here because somebody reading the list of definer
-- functions in this project should find a sentence about each one, which is
-- the rule 0043 set.
-- ---------------------------------------------------------------------------
