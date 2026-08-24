-- ===========================================================================
-- The three admin-writable tables, as the three roles that touch them.
--
-- WHY THIS FILE MATTERS MORE THAN THE OTHER CONTENT TABLES' DON'T. Every
-- content table before these depended on two independent things to stay safe:
-- RLS with no write policy, AND the write privileges revoked from
-- authenticated outright. Either one alone would hold. These three cannot
-- work that way, because a signed in admin has to write them from a phone, so
-- authenticated genuinely holds INSERT, UPDATE and DELETE and RLS is the only
-- thing narrowing that to an admin.
--
-- One layer instead of two is the cost of the whole feature. 0026 section 5
-- says so out loud. This file is the other half of saying it: the refusal is
-- asserted as a real member against real policies, not read off the migration
-- and believed.
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

create or replace function t_raises(label text, stmt text, want_sqlstate text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  %  (it was allowed)', label;
exception
  when others then
    if want_sqlstate is null or sqlstate = want_sqlstate then
      raise notice 'PASS  %', label;
    else
      raise warning 'FAIL  %  (refused with % rather than %)', label, sqlstate, want_sqlstate;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('bb000000-0000-0000-0000-000000000001', 'cadmin@example.com'),
  ('bb000000-0000-0000-0000-000000000002', 'cmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('bb000000-0000-0000-0000-000000000001', 'Ada'),
  ('bb000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'bb000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'bb000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'ann-test-%';
delete from public.content_pages  where id like 'page-test-%';
delete from public.app_settings   where key like 'test_%';

-- ------------------------------------------------------------- as a member ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-000000000002"}';

  select t_raises('a member cannot write an announcement',
    $$insert into public.announcements (id, title)
      values ('ann-test-member', 'I run this church now')$$,
    '42501');

  select t_raises('a member cannot write a content page',
    $$insert into public.content_pages (id, title)
      values ('page-test-member', 'Mine')$$,
    '42501');

  select t_raises('a member cannot add an app setting',
    $$insert into public.app_settings (key, label)
      values ('test_member', 'Mine')$$,
    '42501');
commit;

-- ------------------------------------------------------------- as an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-000000000001"}';

  insert into public.announcements (id, title, body, image_url, video_url)
  values ('ann-test-live', 'City Serve Day', 'Four sites, one Saturday.',
          'https://example.test/pic.jpg', 'https://youtube.test/watch?v=x');

  select t_check('an admin can post an announcement',
    (select count(*)::int from public.announcements where id = 'ann-test-live'), 1);

  select t_check('the picture and the video are on the row',
    (select image_url is not null and video_url is not null
       from public.announcements where id = 'ann-test-live'), true);

  -- The draft. This is the column that already existed, doing a new job: an
  -- admin writing on Thursday for Sunday needs somewhere to put it that Home
  -- cannot reach.
  insert into public.announcements (id, title, published)
  values ('ann-test-draft', 'Not ready yet', false);

  update public.announcements set body = 'Four sites, every hand we can get.'
   where id = 'ann-test-live';

  select t_check('and edit it',
    (select body from public.announcements where id = 'ann-test-live'),
    'Four sites, every hand we can get.');

  select t_check('an admin sees their own drafts',
    (select count(*)::int from public.announcements where id = 'ann-test-draft'), 1);

  insert into public.content_pages (id, title, blurb, sections)
  values ('page-test-give', 'Give', 'Thank you.',
          '[{"heading":"Where it goes","body":"Kids rooms and the lights."}]'::jsonb);

  select t_check('an admin can write a content page',
    (select count(*)::int from public.content_pages where id = 'page-test-give'), 1);

  -- The shape guard from 0001, reused here. The one mistake that actually
  -- happens is a single value sent where a list is expected, which renders as
  -- nothing at all and is invisible until somebody opens the page.
  select t_raises('but not one whose sections are not a list',
    $$insert into public.content_pages (id, title, sections)
      values ('page-test-bad', 'Bad', '{"heading":"nope"}'::jsonb)$$,
    '23514');

  insert into public.app_settings (key, label, kind, value_bool)
  values ('test_flag', 'A flag', 'boolean', true);

  select t_check('an admin can add an app setting',
    (select value_bool from public.app_settings where key = 'test_flag'), true);

  select t_raises('but not one the screen could not draw',
    $$insert into public.app_settings (key, label, kind)
      values ('test_weird', 'Weird', 'colour-picker')$$,
    '23514');
commit;

-- ------------------------------------- what a member can and cannot see ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-000000000002"}';

  select t_check('a member reads a published announcement',
    (select count(*)::int from public.announcements where id = 'ann-test-live'), 1);

  select t_check('and cannot see the draft at all',
    (select count(*)::int from public.announcements where id = 'ann-test-draft'), 0);

  /* THESE THREE DO NOT RAISE, AND THAT IS CORRECT. An INSERT refused by a
     WITH CHECK is an error, which is why the member's inserts above assert
     42501. An UPDATE or DELETE refused by a USING clause is not: the policy is
     a filter, so the statement runs against zero visible rows and reports
     success having changed nothing.

     The first version of this file asserted 42501 here and read "it was
     allowed" when it failed, which is alarming and wrong. What has to be
     asserted is the outcome, not the error: nothing changed, and nothing was
     removed. Written this way round because a test that asserts the wrong
     mechanism gets "fixed" by loosening the thing it was protecting. */
  update public.announcements set title = 'Cancelled' where id = 'ann-test-live';
  select t_check('a member''s edit of somebody else''s announcement touches nothing',
    (select count(*)::int from public.announcements where title = 'Cancelled'), 0);

  delete from public.announcements where id = 'ann-test-live';
  select t_check('and a member''s delete does not remove it either',
    (select count(*)::int from public.announcements where id = 'ann-test-live'), 1);

  update public.app_settings set value_bool = false where key = 'test_flag';
  select t_check('nor can a member flip an app setting',
    (select value_bool from public.app_settings where key = 'test_flag'), true);
commit;

select t_check('so the announcement is as the admin left it',
  (select title from public.announcements where id = 'ann-test-live'),
  'City Serve Day');

-- -------------------------------------------------------------- as anon ---
-- The signed out phone, which is how the app reads Home. It must see
-- published content and nothing else, and must not be able to write at all.
-- Two separate things are wrong before it could: hc_is_admin() is not
-- callable by anon, and the write privileges are revoked from it outright.

begin;
  set local role anon;

  select t_check('signed out, the published announcement is readable',
    (select count(*)::int from public.announcements where id = 'ann-test-live'), 1);

  select t_check('the draft is not',
    (select count(*)::int from public.announcements where id = 'ann-test-draft'), 0);

  /* THE REGRESSION THIS LINE EXISTS FOR. The SELECT policy is
     `published or hc_is_admin()`, and Postgres only calls the function when
     the first operand is false, which is to say only when there is a draft in
     the table. The first version of 0025 revoked EXECUTE from anon, so this
     read did not return fewer rows, it raised, and PostgREST turned it into a
     500. Announcements would have vanished from Home for every signed out
     phone the moment an admin saved their first draft.

     A plain count over the whole table is what catches that, because it is
     the shape js/content.js actually sends: select=* with no filter. Asking
     only for the published row would short circuit past the bug. */
  select t_check('signed out, a table containing a draft still reads',
    (select count(*)::int from public.announcements where id like 'ann-test-%'), 1);

  select t_check('and the admin question answers no rather than erroring',
    public.hc_is_admin(), false);

  select t_check('app settings are readable, which is how the banner works',
    (select count(*)::int from public.app_settings where key = 'test_flag'), 1);

  select t_raises('but nothing signed out can write an announcement',
    $$insert into public.announcements (id, title)
      values ('ann-test-anon', 'Free money')$$,
    '42501');

  select t_raises('nor a content page',
    $$insert into public.content_pages (id, title)
      values ('page-test-anon', 'Free money')$$,
    '42501');

  select t_raises('nor an app setting',
    $$update public.app_settings set value_bool = false where key = 'test_flag'$$,
    '42501');
commit;

-- ------------------------------------------------------------ the bucket ---
-- Syntax and column references only. Storage's own API is a service in front
-- of these tables and nothing here exercises it, which harness.sql says at
-- length next to the stub. Asserting the bucket exists with the right limits
-- is still worth doing: a bucket created public by accident is the failure
-- that would not show up until somebody's photograph was world readable.

select t_check('the announcements bucket exists',
  (select count(*)::int from storage.buckets where id = 'announcements'), 1);

select t_check('it is public read, which is how Home draws the picture',
  (select public from storage.buckets where id = 'announcements'), true);

select t_check('with a size limit, so a video cannot be uploaded as a photo',
  (select file_size_limit from storage.buckets where id = 'announcements'),
  5242880::bigint);

select t_check('and four policies on it',
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like '%announcement%'), 4);

-- ----------------------------------------------------------------- tidy ---

delete from public.announcements where id like 'ann-test-%';
delete from public.content_pages  where id like 'page-test-%';
delete from public.app_settings   where key like 'test_%';
