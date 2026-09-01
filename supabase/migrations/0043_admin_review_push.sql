-- ===========================================================================
-- Home Church, telling the admins there is something waiting on them
--
-- WHAT THIS ADDS. Two more topics, `announcement_review` and `event_review`,
-- and they are the first two in this project that go to some phones rather
-- than to all of them. The newsletter intake writes drafts every twenty
-- minutes and nothing has ever said so. An admin finds out there is a queue by
-- opening the app and looking, which means the fastest a parsed announcement
-- can reach Home is however long it takes somebody to think of checking. Most
-- weeks that is Sunday, for a newsletter that arrived on Tuesday.
--
-- WHY TWO TOPICS AND NOT ONE. 0041 split the queues on the argument that
-- approving the wording of a card is not the same act as vouching for a date
-- that lands in four hundred calendars. A single "3 things need you" push
-- would put those two decisions back into one notification, and the whole
-- point of the split is that the second one deserves to be noticed on its own.
-- Two topics, two switches, and an admin who wants to be woken for dates and
-- not for wording can have exactly that.
--
-- ---------------------------------------------------------------------------
-- THE PART WORTH ARGUING WITH: device_tokens learns who somebody is
-- ---------------------------------------------------------------------------
--
-- 0010 built this table with no user column and wrote three paragraphs about
-- why. 0012 moved the per-topic switches onto it and wrote three more about
-- what that cost. Both of those arguments were about the same thing, that a
-- row here should describe a phone and not a person, and this migration is the
-- first one that breaks it. So it says why, at the same length, rather than
-- adding a column and hoping nobody reads the file.
--
-- The question these two topics ask is "which phones belong to the people who
-- can approve this", and there is no answer to it that does not name a person.
-- Every other topic in this project is addressed to a preference: a phone that
-- wants the Monday guide notice is any phone that asked, and the church never
-- learns whose. A phone that should hear about the review queue is a phone
-- belonging to somebody the church has made an admin, which is a fact about a
-- person, held in profiles.role, and no amount of shuffling makes it a fact
-- about hardware. The alternatives are worse in ways worth naming:
--
--   Send it to everybody and let the app hide it. No. The lock screen has
--   already drawn it, which is 0012's whole argument, and this one would tell
--   the congregation what the church has not published yet.
--
--   Let the phone claim to be an admin. That is a boolean anybody with the
--   publishable key can set, and the reward for setting it is the title of
--   every unpublished draft. This is the design this migration deliberately
--   does not have, and section 3 is what stops it.
--
-- WHAT IT COSTS, exactly. One nullable uuid, set on the phones of the handful
-- of people who run this church, by a function that will only write the id of
-- the person calling it and only if the database agrees they are an admin.
-- Every other row in this table is untouched and stays as anonymous as 0010
-- built it: a member's phone has null here and always will, because there is
-- no path in the app or the API that puts anything else there.
--
-- The people it does name are the church's own staff, they are named to the
-- church itself and to nobody else, and the thing it says about them is
-- something the church already knows and set by hand: that they are an admin.
-- That is a much smaller statement than the one 0010 refused to make, which
-- was a list of every phone with this app installed, readable by anybody
-- holding a key that ships in the bundle.
--
-- ---------------------------------------------------------------------------
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Needs 0010 and 0012 (device_tokens), 0025 (hc_is_admin), 0027
--   (hc_send_push and the fourth switch), 0038 (review_state), and 0041 (the
--   two approve functions this replaces).
--   Safe to run more than once.
--
-- NOTHING NEW HAS TO BE SET UP AFTER IT. The two topics travel the road 0012
-- and 0027 already built: the same vault secret, the same Edge Function, the
-- same APNs keys. Deploy send-push and newsletter-intake again and that is the
-- whole of it.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The two new topics
--
-- push_log's check constraint is a closed vocabulary, which is the right shape
-- and does mean adding to it is a drop and recreate. 0027 did the same and
-- said so; this is that again with two more words in the list.
-- ---------------------------------------------------------------------------

alter table public.push_log drop constraint if exists push_log_topic_known;

alter table public.push_log
  add constraint push_log_topic_known
  check (topic in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                   'announcement', 'announcement_review', 'event_review'));


-- ---------------------------------------------------------------------------
-- 2. The columns
--
-- admin_user_id is the whole of the change argued in the header. `on delete
-- set null` rather than cascade: deleting the person should not delete the
-- phone's row, because the phone may still want the Sunday reminder and the
-- three switches that have nothing to do with any of this. Losing the identity
-- is the correct and complete consequence of losing the account.
--
-- The two switches are shaped exactly like the four before them, including the
-- partial indexes the sender's one query shape wants, and default true for the
-- reason 0027 gives about announcements: somebody who has notifications on at
-- all, and who is an admin, wants to know the queue has something in it. The
-- default only ever reaches a row through section 3, so it is a default for
-- admins and unreachable for everybody else.
-- ---------------------------------------------------------------------------

alter table public.device_tokens
  add column if not exists admin_user_id uuid
    references auth.users (id) on delete set null,
  add column if not exists wants_announcement_review boolean not null default true,
  add column if not exists wants_event_review        boolean not null default true;

comment on column public.device_tokens.admin_user_id is
  'Null on every phone in the congregation, and that is the design: see 0010. Set only on an admin''s own phone, only by hc_set_admin_device_token, and only to the id of the person calling it. It exists because "which phones can approve a draft" is a question about people and there is no honest way to ask it of a table that holds only devices.';
comment on column public.device_tokens.wants_announcement_review is
  'Mirrors the Announcements waiting switch, which only an admin is shown. Meaningless on a row with no admin_user_id, because the sender addresses this topic by identity first.';
comment on column public.device_tokens.wants_event_review is
  'The same for dates. Its own switch rather than sharing the one above, because 0041 split the queues on the argument that a date is a different decision from the wording of a card.';

create index if not exists device_tokens_admin_idx
  on public.device_tokens (admin_user_id) where active and admin_user_id is not null;

create index if not exists device_tokens_announcement_review_idx
  on public.device_tokens (wants_announcement_review)
  where active and wants_announcement_review and admin_user_id is not null;

create index if not exists device_tokens_event_review_idx
  on public.device_tokens (wants_event_review)
  where active and wants_event_review and admin_user_id is not null;


-- ---------------------------------------------------------------------------
-- 3. The client stops writing this table at all
--
-- THIS IS THE SECTION THAT MAKES THE HEADER TRUE, and without it the feature
-- is a lie told confidently. 0010 grants anon INSERT and UPDATE here, table
-- wide, which was harmless while every column was a preference: the worst
-- somebody with the publishable key could do was register a token nobody owns,
-- or switch off a notification for a token they already knew.
--
-- The moment admin_user_id exists, that same grant means anybody holding the
-- key that ships in the app bundle can PATCH a row and claim to be an admin.
-- The reward is every unpublished draft title on their lock screen, which is
-- precisely what this whole pipeline exists to keep behind a person's
-- judgement.
--
-- THE FIRST DRAFT OF THIS SECTION USED COLUMN LEVEL GRANTS, naming the five
-- columns a phone may write and leaving out the three above. That is a real
-- mechanism and it would have worked. Writing the test for it is what found
-- out that it was solving a problem this table no longer has, on top of one
-- nobody had noticed:
--
--   THE TWO REMAINING CLIENT WRITES HAVE NEVER WORKED EITHER. 0037 found that
--   registration was refused on every phone, forever, because PostgREST's
--   upsert needs SELECT and 0010 revoked it. Its header then says the other
--   two writes are fine, because "turning a switch off and deregistering are
--   both PATCH, which is a plain UPDATE, which anon has and which never needed
--   SELECT". That last clause is wrong. PostgREST turns `?token=eq.X` into a
--   WHERE clause, and Postgres requires SELECT on every column a WHERE clause
--   reads. So both of them have come back
--
--     42501: permission denied for table device_tokens
--
--   since the day they were written, and js/native.js swallowed both, exactly
--   as it swallowed the registration. Nobody noticed for the same reason:
--   turning a switch off looks like it worked, because the switch moves.
--
-- Which leaves nothing at all that a client role needs this table for. The
-- registration goes through hc_register_device_token, the preference change
-- goes through the same function (re-registering IS the update, which is what
-- 0037 built it to be), and section 3b below is the one remaining verb. So the
-- grants do not get narrower, they go away, and this table joins group_rooms
-- and events as one nothing writes except through a named function.
--
-- That is a strictly stronger answer than the column list. A column level
-- grant is a promise that every future column is considered; a table with no
-- grants at all cannot be got wrong by adding one.
--
-- THE POLICIES STAY, and they are not vestigial. A policy and a grant are the
-- two independent things this project has always wanted wrong before something
-- gets through, and 0010's argument is explicitly built on that. If a later
-- migration ever hands a client role INSERT or UPDATE back, these are what
-- decides what it can do with it.
-- ---------------------------------------------------------------------------

revoke insert, update on public.device_tokens from anon, authenticated;

-- Restated rather than assumed, so this file is the whole picture of the
-- grants on this table rather than a diff against 0010 that has to be read
-- alongside it. Still no SELECT and no DELETE for anybody, which is the line
-- 0010 drew and 0037 refused to cross.
grant all on public.device_tokens to service_role;


-- ---------------------------------------------------------------------------
-- 3b. Turning it off
--
-- The one verb hc_register_device_token does not cover. Everything else a
-- phone does to this table is a re-registration: the app sends the four
-- switches and the function writes them, which is both how a phone registers
-- and how it changes its mind.
--
-- Deactivating is the exception because it is the one write that has to happen
-- when the phone wants nothing, and re-registering with every switch off would
-- leave `active = true` and keep the phone on the list for the `test` topic,
-- which goes to every active phone on purpose.
--
-- The admin columns go with it, for the reason section 5 gives about a name on
-- a row that receives nothing. This one does not check who is asking, and does
-- not need to: it is the same shape as the UPDATE anon has had since 0010, on
-- a row keyed by a 64 character token that the caller must already hold. 0010
-- states that residual risk in full and it is unchanged here: somebody who
-- already knows a token can stop that phone being notified. The way to fix
-- that properly is accounts on every phone, which is the thing v1 does not
-- have.
-- ---------------------------------------------------------------------------

create or replace function public.hc_deactivate_device_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'hc_deactivate_device_token: a token is required';
  end if;

  update public.device_tokens
     set active                    = false,
         wants_new_guide           = false,
         wants_sunday_reminder     = false,
         wants_group_day           = false,
         wants_announcements       = false,
         admin_user_id             = null,
         wants_announcement_review = false,
         wants_event_review        = false
   where token = btrim(p_token);

  -- Silent on a miss. A phone that never registered asking to stop being sent
  -- to has got the outcome it wanted, and the app calls this on a path where
  -- there is nobody to tell.
end;
$$;

revoke all on function public.hc_deactivate_device_token(text) from public;
grant execute on function public.hc_deactivate_device_token(text) to anon, authenticated;

comment on function public.hc_deactivate_device_token(text) is
  'The last notification switch went off. Stops every send to one phone and gives the row its anonymity back. SECURITY DEFINER because the client has no privileges on device_tokens at all since 0043, and because an UPDATE with a WHERE clause needs SELECT, which anon must never have. See 0010.';


-- ---------------------------------------------------------------------------
-- 4. An admin says which phone is theirs
--
-- Called after hc_register_device_token, never instead of it: registering a
-- phone and saying whose it is are two different statements, and only the
-- second one needs a session. A signed out phone, or a member's, never reaches
-- this at all.
--
-- THE TWO GUARDS ARE THE WHOLE FUNCTION. auth.uid() rather than a parameter,
-- so there is no id to pass and therefore no id to pass wrongly, and
-- hc_is_admin() so that being signed in is not the same as being allowed. A
-- member who calls this by hand with a token they own gets an exception and a
-- row that is exactly as it was.
--
-- It updates and never inserts, deliberately. A token that is not in the table
-- has not registered, which means either the phone has not been granted push
-- permission or the registration failed, and writing a row here would paper
-- over both with a row that no phone will ever receive anything for. The
-- caller gets told rather than getting a silent success.
-- ---------------------------------------------------------------------------

create or replace function public.hc_set_admin_device_token(
  p_token               text,
  p_announcement_review boolean default true,
  p_event_review        boolean default true
)
returns void
language plpgsql
security definer
-- Pinned for the reason 0011, 0012 and 0037 all spell out: an unpinned
-- search_path on a SECURITY DEFINER function is how a privilege escalation
-- gets written by accident.
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hc_set_admin_device_token: sign in first.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'hc_set_admin_device_token: a token is required';
  end if;

  update public.device_tokens
     set admin_user_id             = v_uid,
         wants_announcement_review = coalesce(p_announcement_review, false),
         wants_event_review        = coalesce(p_event_review, false)
   where token = btrim(p_token);

  if not found then
    raise exception 'hc_set_admin_device_token: this phone has not registered for notifications yet.';
  end if;
end;
$$;

revoke all on function public.hc_set_admin_device_token(text, boolean, boolean)
  from public, anon;
grant execute on function public.hc_set_admin_device_token(text, boolean, boolean)
  to authenticated;

comment on function public.hc_set_admin_device_token(text, boolean, boolean) is
  'Marks one already-registered phone as belonging to the admin calling it, and sets the two review switches. The only path that writes device_tokens.admin_user_id, and it writes auth.uid() rather than anything it was handed.';


-- ---------------------------------------------------------------------------
-- 5. And takes it back
--
-- Signing out is the ordinary caller. The phone stops being an admin's phone
-- and goes back to being a phone, which is what the row said before section 4
-- ever touched it, and the three switches a member has keep working.
--
-- NO hc_is_admin() CHECK HERE, and that is not an oversight. Somebody who has
-- just been demoted must still be able to clear their own phone, and requiring
-- the role they no longer have to give up the row that names them would be
-- exactly backwards. The guard is ownership instead: the row must already
-- carry the caller's own id. Nobody can clear anybody else's phone and
-- everybody can clear their own.
--
-- This is a courtesy rather than a security boundary, and the difference
-- matters: a demoted admin who never opens the app again leaves a row here
-- with their id on it forever. What actually stops that phone receiving
-- anything is the sender, which checks profiles.role at send time on every
-- run. See supabase/functions/send-push. A stale row is a stale row and not a
-- door.
-- ---------------------------------------------------------------------------

create or replace function public.hc_clear_admin_device_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hc_clear_admin_device_token: sign in first.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Silent when it matches nothing. Unlike section 4 there is nothing useful
  -- to tell anybody: this is called on the way out of a session, from a phone
  -- that may never have been an admin's, and an exception on the sign out path
  -- would be an error message about a row nobody asked about.
  update public.device_tokens
     set admin_user_id             = null,
         wants_announcement_review = false,
         wants_event_review        = false
   where token = btrim(coalesce(p_token, ''))
     and admin_user_id = v_uid;
end;
$$;

revoke all on function public.hc_clear_admin_device_token(text) from public, anon;
grant execute on function public.hc_clear_admin_device_token(text) to authenticated;

comment on function public.hc_clear_admin_device_token(text) is
  'Gives one phone its anonymity back, on sign out. Guarded by ownership rather than by hc_is_admin, so somebody who has just been demoted can still clear the row that names them.';


-- ---------------------------------------------------------------------------
-- 6. hc_send_push learns the two topics
--
-- Same signature as 0027 left it, so this is a plain replace rather than the
-- drop and recreate that migration needed. Only the vocabulary changes.
--
-- AND service_role IS NAMED EXPLICITLY, which it did not need to be before.
-- Every topic until now was started by pg_cron through hc_push_tick, or by an
-- admin through hc_admin_send_announcement, and both of those are database
-- side and run as the owner. These two are started by the newsletter intake
-- Edge Function at the end of a parse, which talks to Postgres as service_role
-- like every other Edge Function in this project.
--
-- Supabase's default privileges already grant service_role EXECUTE on
-- functions created in public, so this line changes nothing today. It is here
-- because a dependency that works by default is a dependency that breaks
-- silently the day somebody tightens the defaults, and because the intake now
-- has a reason to call this and that reason should be written down where the
-- grant is.
-- ---------------------------------------------------------------------------

create or replace function public.hc_send_push(
  p_topic   text,
  p_dry_run boolean default false,
  p_ref     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_topic not in ('new_guide', 'sunday_reminder', 'group_day', 'test',
                     'announcement', 'announcement_review', 'event_review') then
    raise exception 'hc_send_push: unknown topic %', p_topic;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_push_cron_secret';

  if v_secret is null then
    raise exception 'hc_send_push: hc_push_cron_secret is missing from the vault. Re-run migration 0012.';
  end if;

  -- Fire and forget, unchanged since 0012. The Edge Function writes the
  -- outcome to push_log, which is the thing worth reading later.
  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-cron-secret', v_secret
               ),
    body    := jsonb_build_object('topic', p_topic, 'dry_run', p_dry_run, 'ref', p_ref),
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_send_push(text, boolean, text) from public, anon, authenticated;
grant execute on function public.hc_send_push(text, boolean, text) to service_role;

comment on function public.hc_send_push(text, boolean, text) is
  'Asks the send-push Edge Function to deliver one topic. p_ref names the row a topic is about, which only `announcement` uses. Callable by the database and by service_role, never by a session: it takes a free text topic and would otherwise let anybody send the Sunday reminder on a Tuesday.';


-- ---------------------------------------------------------------------------
-- 7. Who approved it
--
-- A push means several people can be looking at the same queue at the same
-- time, which has never been true of this screen before. Two admins tap
-- Approve on the same card, one of them wins, and the other should be told who
-- rather than shown an error about a row that is no longer pending.
--
-- WHY A TABLE OF ITS OWN AND NOT TWO COLUMNS ON EACH ROW, which was the first
-- draft. Because "visible only to admins" has to survive the app's own content
-- sync, and that sync reads announcements and events with the publishable key
-- and `select=*`. Columns named approved_by_name on those tables are columns
-- every phone in the congregation downloads with the announcement itself, and
-- a revoke aimed at them breaks `select=*` for the same sync. A separate table
-- with its own policy is the only shape where the note is genuinely internal:
-- there is no read path to it that does not go through hc_is_admin().
--
-- WHY THE NAME IS COPIED IN rather than joined to profiles when it is read.
-- Two reasons and both are load bearing. The profiles select policy from 0009
-- is `auth.uid() = id`, so one admin cannot read another admin's name at all,
-- and widening that to read the whole congregation's names to put one line on
-- one card is a bad trade. And a note about something that happened in
-- October should still say who did it after they have left the church and the
-- row is gone, which is why approved_by is `on delete set null` and the name
-- beside it is not.
-- ---------------------------------------------------------------------------

create table if not exists public.review_approvals (
  -- What was approved. 'announcement' or 'event', matching the two queues.
  kind             text not null,
  -- The row's own id, which is text in both tables. No foreign key: the two
  -- kinds point at two different tables, and a discarded event is deleted
  -- outright by 0041 while the note about approving it, if there ever were
  -- one, would be about something that happened.
  row_id           text not null,
  approved_by      uuid references auth.users (id) on delete set null,
  approved_by_name text not null,
  approved_at      timestamptz not null default now(),

  primary key (kind, row_id),
  constraint review_approvals_kind_known check (kind in ('announcement', 'event'))
);

comment on table public.review_approvals is
  'One row per thing an admin has approved out of the newsletter queues, and the name of the admin who did it. Read by the Admin screen and by nobody else: this is an internal note, not part of the announcement.';
comment on column public.review_approvals.approved_by_name is
  'Copied in at approval time rather than joined on read. 0009 lets nobody read anybody else''s profile, and a note about October should still name the person after they have left.';

create index if not exists review_approvals_at_idx
  on public.review_approvals (approved_at desc);

alter table public.review_approvals enable row level security;

drop policy if exists "admins can read the approval notes" on public.review_approvals;

create policy "admins can read the approval notes"
  on public.review_approvals for select
  to authenticated
  using (public.hc_is_admin());

/* No insert, update or delete policy for any client role, and no SELECT for
   anon. The two functions in section 9 are the entire write surface, the same
   way 0026 left events, and an admin's session is the entire read surface. */
revoke all on public.review_approvals from anon, authenticated;
grant select on public.review_approvals to authenticated;
grant all on public.review_approvals to service_role;


-- ---------------------------------------------------------------------------
-- 8. What to call somebody
--
-- First and last name off profiles, then the email, then a shrug. Its own
-- function because both approve functions want it and a copied query is a
-- query that gets fixed in one place.
--
-- SECURITY DEFINER because it reads a profiles row that the caller is not
-- allowed to read, which is the point: it is called by the approve functions
-- to write down a name for other admins, and it is revoked from every client
-- role so it cannot be used as a way to look people up.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_display_name(p_uid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_uid is null then return 'an admin'; end if;

  select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into v_name
    from public.profiles p where p.id = p_uid;

  if v_name is not null and v_name <> '' then return v_name; end if;

  select u.email into v_name from auth.users u where u.id = p_uid;

  return coalesce(nullif(btrim(coalesce(v_name, '')), ''), 'an admin');
end;
$$;

revoke all on function public.hc_admin_display_name(uuid)
  from public, anon, authenticated;

comment on function public.hc_admin_display_name(uuid) is
  'The name to write on an approval note. Revoked from every client role on purpose: it reads a profiles row the caller may not read, and it exists to be called by the approve functions rather than as a directory.';


-- ---------------------------------------------------------------------------
-- 9. Approving, now that more than one person is watching
--
-- Both functions are 0041's, with two things added and nothing taken away.
--
-- THE ROW IS CLAIMED BEFORE IT IS PUBLISHED. `and review_state is distinct
-- from 'approved'` is what makes two simultaneous taps settle: the first one
-- matches and the second one does not, so exactly one of them writes the note.
-- Without that clause both would succeed, both would write a note, and the
-- name on the card would be whichever transaction committed second.
--
-- WHY `is distinct from 'approved'` AND NOT `= 'pending'`, which is the
-- shorter way to say almost the same thing and is wrong. review_state is null
-- on everything written by hand, by the slash commands, or before 0038 ran,
-- and 0040's own test approves an event in exactly that state. Claiming only
-- pending rows would refuse those, which is a behaviour change nobody asked
-- for, in a function whose job is to publish. Null is not a reason to say no;
-- already approved is.
--
-- AND A MISS IS EXPLAINED RATHER THAN REPORTED. The second admin's tap comes
-- back naming the first, because "Ada already approved this one" is a complete
-- answer and "No announcement with that id" is a bug report about a row that
-- is fine. The app refreshes the queue on the way past either way, so the card
-- leaves their screen too.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_approve_announcement(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_who   text;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  v_name := public.hc_admin_display_name(v_uid);

  update public.announcements
     set published = true, review_state = 'approved'
   where id = p_id
     and review_state is distinct from 'approved';

  if not found then
    /* Two ways to get here, and they are different sentences. The row is gone,
       which is the same answer 0041 gave. Or somebody got there first, which
       is the answer this migration exists to give: named when there is a note
       to read a name from, and plainly when there is not, because a row
       approved before this table existed has no note. */
    if not exists (select 1 from public.announcements where id = p_id) then
      raise exception 'No announcement with that id.';
    end if;

    select approved_by_name into v_who
      from public.review_approvals
     where kind = 'announcement' and row_id = p_id;

    raise exception '% already approved this one.', coalesce(v_who, 'Another admin');
  end if;

  insert into public.review_approvals (kind, row_id, approved_by, approved_by_name)
  values ('announcement', p_id, v_uid, v_name)
  on conflict (kind, row_id) do update
    set approved_by = excluded.approved_by,
        approved_by_name = excluded.approved_by_name,
        approved_at = now();
end;
$$;

revoke all on function public.hc_admin_approve_announcement(text) from public, anon;
grant execute on function public.hc_admin_approve_announcement(text) to authenticated;

comment on function public.hc_admin_approve_announcement(text) is
  'Puts one parsed announcement on Home and writes down who did it. Admins only, checked inside. Claims the row by refusing one already approved, so two admins tapping at once settle rather than race. Does NOT publish its event: since 0041 an event is approved separately.';


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
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  v_name := public.hc_admin_display_name(v_uid);

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
  'Puts one parsed event on the Connect calendar and writes down who did it. Admins only, checked inside, and claims the row by refusing one already approved, so two admins tapping at once settle rather than race.';


-- ---------------------------------------------------------------------------
-- 10. Discarding says so too
--
-- A discarded event is deleted outright by 0041, so its note would point at
-- nothing. This drops the note rather than leaving one behind, which matters
-- for a reason that is not tidiness: ids in this project are derived from
-- titles and are permanent, so the same id can come back on a later parse of
-- the same recurring event, and a stale note would then claim somebody
-- approved a row they have never seen.
-- ---------------------------------------------------------------------------

create or replace function public.hc_admin_discard_event(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.events where id = p_id) then
    raise exception 'No event with that id.';
  end if;

  -- Refuses to take down something already on the calendar. Discard is for the
  -- queue; an approved event comes down by being deleted on purpose.
  if exists (select 1 from public.events where id = p_id and published) then
    raise exception 'That event is already on the calendar.';
  end if;

  -- The announcement lets go first, so the foreign key has nothing to say.
  update public.announcements set event_id = null where event_id = p_id;
  delete from public.events where id = p_id;
  delete from public.review_approvals where kind = 'event' and row_id = p_id;
end;
$$;

revoke all on function public.hc_admin_discard_event(text) from public, anon, authenticated;
grant execute on function public.hc_admin_discard_event(text) to authenticated;

comment on function public.hc_admin_discard_event(text) is
  'Throws away one parsed event that has not been approved. Deletes rather than marks, because an unpublished event is on no screen in this app and a marked one could never be found again. Admins only.';


-- ---------------------------------------------------------------------------
-- What the security advisor will say about this, and why it is fine
--
-- Three more of the shape 0016, 0025, 0036 and 0037 already carry:
--
--   0028_anon_security_definer_function_executable
--     hc_set_admin_device_token, hc_clear_admin_device_token,
--     hc_deactivate_device_token
--
-- Same answer as every one before them, and it is the answer this project has
-- given consistently: in this design a SECURITY DEFINER function IS the
-- permission boundary, so the ones that matter are exactly the ones that have
-- to be callable.
--
-- The first two are revoked from anon and granted to authenticated only. One
-- checks hc_is_admin() on its third line and writes auth.uid() rather than
-- anything it is handed; the other writes only over a row that already carries
-- the caller's own id. Neither returns anything and neither reads anything
-- back to the caller.
--
-- hc_deactivate_device_token is the one anon can reach, and it has to be:
-- turning notifications off is something a signed out phone does, and this app
-- is signed out far more often than in. It names one row by a token the caller
-- must already hold and sets every switch on it to false. That is strictly
-- less than hc_register_device_token, which anon has had since 0037, and it is
-- the same residual risk 0010 wrote down and accepted.
--
-- hc_admin_display_name is SECURITY DEFINER and revoked from every client
-- role, so it does not appear in that advisor at all. It is named here because
-- somebody reading the list of definer functions in this project should find a
-- sentence about each one.
-- ---------------------------------------------------------------------------
