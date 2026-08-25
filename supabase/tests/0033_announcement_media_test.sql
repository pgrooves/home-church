-- ===========================================================================
-- An announcement that carries more than a sentence.
--
-- WHAT IS WORTH TESTING HERE. 0033 adds five columns to a table whose writes
-- were settled in 0026, so "can an admin write these" is not the interesting
-- question and "can a member" is. What is left is the handful of things whose
-- wrong answer is silent rather than loud:
--
--   the default     image_urls has to answer "which pictures" for every row
--                   that existed before this migration, and answer it with an
--                   empty list rather than with null. The app loops over it on
--                   every draw of Home, and a null there is a screen that
--                   draws nothing with no error anywhere to say why.
--
--   the shape       jsonb will hold a string or a number in that column just
--                   as happily as an array. The check constraint is the only
--                   thing that stops it, and a constraint nobody asserts is a
--                   constraint somebody drops.
--
--   the backfill    every row that already had a photograph has to come out of
--                   this migration with that photograph in the list, or the
--                   day it runs is the day a dozen announcements lose their
--                   picture. Asserted by running the backfill's own condition
--                   against a row inserted the old way.
--
--   the boundary    body_html is markup that every phone in the church renders
--                   into a page. The app sanitizes it twice, on the way in and
--                   on the way out, and this asserts the other half: that a
--                   signed in member cannot put markup there in the first
--                   place. That is 0026's policy, tested here because these
--                   are the columns that make it matter.
--
-- Reading is not a separate question: the select policy from 0003 is row
-- level, so all five arrive with the rest of a published row. The anon
-- assertion at the end is what makes that concrete.
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

insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-000000000001', 'madmin@example.com'),
  ('dd000000-0000-0000-0000-000000000002', 'mmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('dd000000-0000-0000-0000-000000000001', 'Ada'),
  ('dd000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'dd000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'dd000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'media-test-%';

-- ----------------------------------------------------------- the columns ---

select t_check('every new column is there',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements'
      and column_name in ('body_html', 'image_urls', 'link_url',
                          'link_title', 'link_image_url')), 5);

select t_check('image_urls is the one that cannot be null',
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements'
      and column_name = 'image_urls'), 'NO');

-- The other four are nullable on purpose: null on link_image_url is the x on
-- the admin form, and null on body_html is a row written before the editor.
select t_check('and the other four are nullable, which is how they say "none"',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements'
      and column_name in ('body_html', 'link_url', 'link_title', 'link_image_url')
      and is_nullable = 'YES'), 4);

-- ------------------------------------------------------------ as an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000001"}';

  -- An announcement written the way every announcement before 0033 was
  -- written: without mentioning any of these columns.
  insert into public.announcements (id, title, body, image_url)
  values ('media-test-old', 'Potluck after the second service',
          'Bring something warm.', 'https://example.test/potluck.jpg');

  select t_check('a row that names no pictures has an empty list, not null',
    (select image_urls from public.announcements where id = 'media-test-old'),
    '[]'::jsonb);

  select t_check('and no markup, which is how it says the words are plain',
    (select body_html from public.announcements where id = 'media-test-old'), null);

  -- The backfill in section 3 of the migration, run against a row inserted
  -- after it. Same condition, so what is asserted is the statement that will
  -- run on the church's own table and not a paraphrase of it.
  update public.announcements
     set image_urls = jsonb_build_array(image_url)
   where image_url is not null and image_url <> '' and image_urls = '[]'::jsonb;

  select t_check('the backfill gives an old photograph a list of one',
    (select image_urls from public.announcements where id = 'media-test-old'),
    '["https://example.test/potluck.jpg"]'::jsonb);

  -- Twice, because the migration promises to be safe to re-run and this is
  -- the only statement in it that changes data.
  update public.announcements
     set image_urls = jsonb_build_array(image_url)
   where image_url is not null and image_url <> '' and image_urls = '[]'::jsonb;

  select t_check('and running it again leaves it exactly as it was',
    (select image_urls from public.announcements where id = 'media-test-old'),
    '["https://example.test/potluck.jpg"]'::jsonb);

  insert into public.announcements
    (id, title, body, body_html, image_url, image_urls,
     video_url, link_url, link_title, link_image_url)
  values ('media-test-new', 'City Serve Day',
          'Four sites, one Saturday.',
          '<p>Four sites, one <strong>Saturday</strong>.</p>',
          'https://example.test/one.jpg',
          '["https://example.test/one.jpg","https://example.test/two.jpg"]'::jsonb,
          'https://youtu.be/dQw4w9WgXcQ',
          'https://example.test/signup',
          'Sign up for Serve Day',
          'https://example.test/thumb.jpg');

  select t_check('an admin writes the whole announcement',
    (select jsonb_array_length(image_urls) from public.announcements
      where id = 'media-test-new'), 2);

  -- The x on the form. It has to be a value the PATCH actually carries, or
  -- "this link has no thumbnail" is indistinguishable from "nobody said".
  update public.announcements set link_image_url = null where id = 'media-test-new';
  select t_check('and can take the thumbnail off the link without losing the link',
    (select link_url is not null and link_image_url is null
       from public.announcements where id = 'media-test-new'), true);
commit;

-- --------------------------------------------------------------- the shape ---
-- jsonb holds anything. The constraint is what makes image_urls a list.

do $$
begin
  update public.announcements set image_urls = '"one.jpg"'::jsonb
   where id = 'media-test-new';
  raise warning 'FAIL  a string cannot be smuggled into the picture list';
exception when check_violation then
  raise notice 'PASS  a string cannot be smuggled into the picture list';
end;
$$;

select t_check('and the list is untouched afterwards',
  (select jsonb_array_length(image_urls) from public.announcements
    where id = 'media-test-new'), 2);

-- ------------------------------------------------------------- as a member ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-000000000002"}';

  select t_check('a member reads the markup on a published announcement',
    (select body_html from public.announcements where id = 'media-test-new'),
    '<p>Four sites, one <strong>Saturday</strong>.</p>');

  /* No exception expected, and 0026's test file explains why at length: an
     UPDATE refused by a USING clause is a filter, not an error. The statement
     succeeds against zero visible rows. What has to be asserted is that
     nothing moved. */
  update public.announcements
     set body_html = '<p>Give here instead: <a href="https://evil.test">tap</a></p>'
   where id = 'media-test-new';

  select t_check('but cannot put markup on the church''s announcement',
    (select body_html from public.announcements where id = 'media-test-new'),
    '<p>Four sites, one <strong>Saturday</strong>.</p>');

  update public.announcements set link_url = 'https://evil.test'
   where id = 'media-test-new';
  select t_check('nor point its link somewhere else',
    (select link_url from public.announcements where id = 'media-test-new'),
    'https://example.test/signup');
commit;

-- ---------------------------------------------------------------- as anon ---
-- The signed out phone, which is how a good part of the congregation reads
-- Home. All five have to reach it with the row.

begin;
  set local role anon;

  select t_check('signed out, the pictures come with the announcement',
    (select jsonb_array_length(image_urls) from public.announcements
      where id = 'media-test-new'), 2);

  select t_check('and so does the link',
    (select link_title from public.announcements where id = 'media-test-new'),
    'Sign up for Serve Day');
commit;

delete from public.announcements where id like 'media-test-%';
