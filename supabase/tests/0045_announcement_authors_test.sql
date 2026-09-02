-- ===========================================================================
-- Who posted the announcement, and who is allowed to know.
--
-- WHAT THIS FILE IS ABOUT. Migration 0045 makes two claims and both of them
-- fail quietly if they are wrong.
--
-- The first is that the byline is written from auth.uid() by a trigger on the
-- table, so it cannot be forgotten by a door that does not know about it and
-- cannot be dictated by a caller that does. A byline nobody can set wrongly is
-- the only kind worth putting on a card.
--
-- The second is the privacy half, and it is the reason this is a table of its
-- own rather than two columns on announcements: there is no read path to a
-- name here that does not go through hc_is_leader(). A signed out phone is
-- refused, a member reads nothing, and a leader reads the note. That claim is
-- about what the database hands to a role, so it is asked as the roles rather
-- than read off the migration and nodded at.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function t_check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  %', label;
  else raise warning 'FAIL  %  (got %, want %)', label, got, want; end if;
end;
$$;

create or replace function t_raises_like(label text, stmt text, want_fragment text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  %  (it was allowed)', label;
exception
  when others then
    if position(lower(want_fragment) in lower(sqlerrm)) > 0 then
      raise notice 'PASS  %', label;
    else
      raise warning 'FAIL  %  (refused with "%" rather than "%")', label, sqlerrm, want_fragment;
    end if;
end;
$$;

create or replace function t_allows(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'PASS  %', label;
exception
  when others then
    raise warning 'FAIL  %  (refused with "%")', label, sqlerrm;
end;
$$;


-- Four people, because this feature is the first one in the project whose
-- audience is "admins and leaders" rather than admins: a leader who cannot
-- read the note is the feature half missing, and a member who can read it is
-- the feature being wrong in the other direction.
insert into auth.users (id, email) values
  ('ee000000-0000-0000-0000-000000000001', 'ada@example.com'),
  ('ee000000-0000-0000-0000-000000000002', 'mo@example.com'),
  ('ee000000-0000-0000-0000-000000000003', 'lee@example.com'),
  ('ee000000-0000-0000-0000-000000000004', 'sam@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name, last_name) values
  ('ee000000-0000-0000-0000-000000000001', 'Ada', 'Lovelace'),
  ('ee000000-0000-0000-0000-000000000002', 'Mo',  'Chen'),
  ('ee000000-0000-0000-0000-000000000003', 'Lee', 'Okafor'),
  ('ee000000-0000-0000-0000-000000000004', 'Sam', 'Rivers')
  on conflict (id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name;

update public.profiles set role = 'admin', can_host = false
  where id in ('ee000000-0000-0000-0000-000000000001',
               'ee000000-0000-0000-0000-000000000002');
-- A leader is a member with the column, which is the whole of what 0036 made
-- Leader mode mean.
update public.profiles set role = 'member', can_host = true
  where id = 'ee000000-0000-0000-0000-000000000003';
update public.profiles set role = 'member', can_host = false
  where id = 'ee000000-0000-0000-0000-000000000004';

delete from public.announcements where id like 'by-test-%';


-- ------------------------------------------------------- posting from a phone

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';

  select t_allows('an admin can post an announcement',
    $$insert into public.announcements (id, title, body)
      values ('by-test-hand', 'Serve Day', 'Bring a chair.')$$);
commit;

select t_check('and the note says who did',
  (select author_name from public.announcement_authors
    where announcement_id = 'by-test-hand'), 'Ada Lovelace');

select t_check('with their own id beside it',
  (select author_id from public.announcement_authors
    where announcement_id = 'by-test-hand'),
  'ee000000-0000-0000-0000-000000000001'::uuid);

select t_check('and it came from a person, not the newsletter',
  (select source from public.announcement_authors
    where announcement_id = 'by-test-hand'), 'admin');

/* The claim that makes the byline worth trusting: it is auth.uid() and not
   anything the insert carried. There is no column on announcements to put a
   name in, so the only way to try is to write the note directly, which section
   2 of the migration refuses outright. */
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000002"}';

  select t_raises_like('and nobody can post a card under somebody else''s name',
    $$insert into public.announcement_authors (announcement_id, author_id, author_name)
      values ('by-test-hand', 'ee000000-0000-0000-0000-000000000002', 'Mo Chen')$$,
    'permission denied');

  select t_raises_like('nor rewrite the name on one that exists',
    $$update public.announcement_authors set author_name = 'Mo Chen'
       where announcement_id = 'by-test-hand'$$,
    'permission denied');

  -- Editing somebody else's announcement is an ordinary admin thing to do, and
  -- it must not quietly move the byline onto whoever fixed the typo.
  select t_allows('another admin can fix a typo in it',
    $$update public.announcements set title = 'City Serve Day'
       where id = 'by-test-hand'$$);
commit;

select t_check('and the byline still names who posted it',
  (select author_name from public.announcement_authors
    where announcement_id = 'by-test-hand'), 'Ada Lovelace');


-- -------------------------------------------------- posting from a script

/* The newsletter intake and /new-announcement both write as the service role,
   with no session at all, so there is nobody to name. The line the app draws
   for the first of those is "from the email newsletter", and it is `source`
   that carries it, which is why the note keeps its own copy. */

insert into public.announcements (id, title, published, review_state, source)
  values ('by-test-parsed', 'Homecoming', false, 'pending', 'newsletter');
insert into public.announcements (id, title, source)
  values ('by-test-script', 'Baptism Sunday', 'admin');

select t_check('a parsed draft has no name on it',
  (select author_name from public.announcement_authors
    where announcement_id = 'by-test-parsed'), null);

select t_check('and says where it came from instead',
  (select source from public.announcement_authors
    where announcement_id = 'by-test-parsed'), 'newsletter');

select t_check('one written by a slash command has no name either',
  (select author_name from public.announcement_authors
    where announcement_id = 'by-test-script'), null);

select t_check('and nothing to say about where it came from',
  (select source from public.announcement_authors
    where announcement_id = 'by-test-script'), 'admin');

/* Section 4's backfill, asserted as the invariant it establishes rather than
   by re-running it: every announcement in the table has a note, whether it was
   written before this migration or after it. */
select t_check('every announcement in the table has a byline row',
  (select count(*)::int from public.announcements a
     left join public.announcement_authors n on n.announcement_id = a.id
    where n.announcement_id is null), 0);


-- ------------------------------------------------------------ who can read

begin;
  set local role anon;

  -- Two things wrong rather than one: no grant, and no policy. The grant is
  -- what refuses this, which is deliberate — hc_is_leader() is revoked from
  -- anon, so a policy this ever reached would raise rather than return
  -- nothing, and PostgREST would turn that into a 500.
  select t_raises_like('a signed out phone cannot read the notes',
    $$select author_name from public.announcement_authors$$,
    'permission denied');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000004"}';

  select t_check('a member is answered with nothing at all',
    (select count(*)::int from public.announcement_authors), 0);
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000003"}';

  -- The half that is new in this migration. Every internal note before it was
  -- admins only; this one is the church's leaders too.
  select t_check('a leader sees the byline',
    (select author_name from public.announcement_authors
      where announcement_id = 'by-test-hand'), 'Ada Lovelace');

  select t_raises_like('but cannot write one',
    $$insert into public.announcement_authors (announcement_id, author_name)
      values ('by-test-parsed', 'Lee Okafor')$$,
    'permission denied');

  select t_raises_like('nor take one away',
    $$delete from public.announcement_authors where announcement_id = 'by-test-hand'$$,
    'permission denied');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';

  select t_check('and an admin sees them all',
    (select count(*)::int from public.announcement_authors
      where announcement_id like 'by-test-%'), 3);

  -- The reason hc_admin_display_name is revoked from every client role: it
  -- reads a profiles row the caller may not read, and it exists to write a
  -- name down rather than to look one up.
  select t_raises_like('and still cannot use the name helper as a directory',
    $$select public.hc_admin_display_name('ee000000-0000-0000-0000-000000000003')$$,
    'permission denied');
commit;


-- ------------------------------------------------------- and when it goes

/* Ids in this project are permanent and derived from titles, so the same id
   comes back: an announcement deleted from the Admin screen and written again
   next year is a new announcement wearing an old id. The cascade is what stops
   the old byline landing on it. */

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000001"}';

  select t_allows('an admin can delete an announcement',
    $$delete from public.announcements where id = 'by-test-hand'$$);
commit;

select t_check('and the note goes with it',
  (select count(*)::int from public.announcement_authors
    where announcement_id = 'by-test-hand'), 0);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ee000000-0000-0000-0000-000000000002"}';

  select t_allows('so the same id written again is a new announcement',
    $$insert into public.announcements (id, title) values ('by-test-hand', 'Serve Day')$$);
commit;

select t_check('carrying whoever wrote it this time',
  (select author_name from public.announcement_authors
    where announcement_id = 'by-test-hand'), 'Mo Chen');


-- --------------------------------------------------------- the write surface

select t_check('no client role can write the notes at all',
  (select bool_or(has_table_privilege(r.role, 'public.announcement_authors', p.priv))
     from unnest(array['anon', 'authenticated']) as r(role),
          unnest(array['insert', 'update', 'delete']) as p(priv)), false);

select t_check('and anon cannot even read them',
  has_table_privilege('anon', 'public.announcement_authors', 'select'), false);

delete from public.announcements where id like 'by-test-%';
