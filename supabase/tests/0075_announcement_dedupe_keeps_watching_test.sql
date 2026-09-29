-- ===========================================================================
-- The same announcement, twice, and the two ways out of it.
--
-- WHY THIS FILE EXISTS. The church posted Homecoming Gala twice and the Jonah
-- reading plan twice, approved both, and was never offered a merge. 0051 was
-- supposed to catch exactly that. What Postgres owns of the fix is four
-- things, and every one of them fails quietly:
--
--   the guard       a title contained in another title is paired the instant
--                   the second row is written, with no model and no HTTP
--                   request. Two things that merely share a word are not.
--                   Too loose and Home is covered in flags; too tight and this
--                   whole file changed nothing.
--
--   the tick looks  the question it asks is no longer "is there a DRAFT nobody
--   at posted rows  has checked". A pair that only becomes visible once both
--                   are on Home had no path at all before this.
--
--   who can merge   a merge writes over one announcement and retires another.
--                   Asserted as a real signed in member, not read off a policy.
--
--   what moves      the date, the chain, and nothing else. published, pinned
--                   and priority are the church's decisions about where a card
--                   sits, and no merge — automatic or by hand — may touch them.
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
  ('ae000000-0000-0000-0000-000000000001', 'madmin@example.com'),
  ('ae000000-0000-0000-0000-000000000002', 'mmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ae000000-0000-0000-0000-000000000001', 'Ada'),
  ('ae000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin'
 where id = 'ae000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member'
 where id = 'ae000000-0000-0000-0000-000000000002';

delete from public.announcements where id like 'test-merge-%';
delete from public.events        where id like 'test-merge-%';
delete from public.review_approvals where row_id like 'test-merge-%';

-- ---------------------------------------------------------------- the words ---

select t_check('a title keeps the words that say which thing it is',
  public.hc_announcement_words('Homecoming Gala'),
  array['gala','homecoming']::text[]);

select t_check('and drops the month, the weekday and the filler',
  public.hc_announcement_words('Join us Sunday, October 23 for the Gala'),
  array['gala']::text[]);

select t_check('a title of nothing but filler has no words at all',
  public.hc_announcement_words('Come and join us this week'),
  '{}'::text[]);

-- ---------------------------------------------------------------- the guard ---

/* The card the church already has. Written first, and posted, so it is the one
   the survivor rule keeps. */
insert into public.announcements (id, title, body, published, review_state,
                                  created_at)
values ('test-merge-gala', 'Homecoming', 'Save the date.', true, 'approved',
        now() - interval '10 days');

/* And the second go at it, arriving out of the newsletter a fortnight later
   under a longer name. {homecoming} is contained in {homecoming, gala}, so
   the guard pairs them the moment this row lands — before any model has run,
   and before anybody has read the notification. */
insert into public.announcements (id, title, body, published, review_state)
values ('test-merge-gala-2', 'Homecoming Gala', 'Tickets are live, $25.',
        false, 'pending');

select t_check('a longer name for something already here is flagged at once',
  (select duplicate_of from public.announcements where id = 'test-merge-gala-2'),
  'test-merge-gala');

select t_check('and the card the church already has is the one that stands',
  (select duplicate_of is null from public.announcements
    where id = 'test-merge-gala'), true);

select t_check('with a note saying why, so the screen has something to draw',
  (select duplicate_note is not null from public.announcements
    where id = 'test-merge-gala-2'), true);

/* The pair that must NOT be flagged. Two men's things sharing one word is the
   shape the calendar's guard can afford to be wrong about, because it has a
   day to lean on, and this one cannot. */
insert into public.announcements (id, title, body, published, review_state)
values ('test-merge-mens-a', 'Mens Breakfast', 'Saturday, early.', true, 'approved'),
       ('test-merge-mens-b', 'Mens Retreat', 'A weekend away.', true, 'approved');

select t_check('two different things sharing one word are left alone',
  (select duplicate_of is null from public.announcements
    where id = 'test-merge-mens-b'), true);

/* A pair somebody has already refused does not come back. dedupe_checked_at is
   what says "answered", and the guard must read it. */
insert into public.announcements (id, title, body, published, review_state,
                                  dedupe_checked_at)
values ('test-merge-settled', 'Baptism', 'Sign up.', true, 'approved', now());

insert into public.announcements (id, title, body, published, review_state)
values ('test-merge-settled-2', 'Baptism Class', 'The class before it.',
        true, 'approved');

do $$
begin
  update public.announcements set dedupe_checked_at = now()
   where id = 'test-merge-settled-2';
end
$$;

insert into public.announcements (id, title, body, published, review_state)
values ('test-merge-settled-3', 'Baptism', 'A third go.', true, 'approved');

select t_check('a row nobody has answered for is still flagged',
  (select duplicate_of from public.announcements where id = 'test-merge-settled-3'),
  'test-merge-settled');

-- -------------------------------------------------------------- the tick ---

/* THE HOLE 0051 LEFT. Its guard asked whether a PENDING draft was unchecked,
   so a pair of posted cards asked nothing of anybody. Read here as the
   question the tick actually asks rather than as the request it makes, because
   the request goes to a stub in this harness. */
select t_check('an unchecked posted announcement is something to look at',
  (select exists (
     select 1 from public.announcements
      where dedupe_checked_at is null
        and deleted_at is null
        and review_state <> 'pending')), true);

select t_check('and the index that makes asking free matches that question',
  (select count(*)::int from pg_indexes
    where indexname = 'announcements_dedupe_todo_idx'
      and indexdef like '%dedupe_checked_at IS NULL%'
      and indexdef not like '%review_state%'), 1);

select t_check('an insert on the table wakes the pass',
  (select count(*)::int from pg_trigger
    where tgname = 'announcements_ask_dedupe' and not tgisinternal), 1);

-- --------------------------------------------------------- as a member ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_keep_announcement_separate('test-merge-gala-2');
  raise warning 'FAIL  a member cannot say two announcements are different things';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot say two announcements are different things';
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_merge_announcement('test-merge-gala-2', 'test-merge-gala',
    '{"body":"Anything at all."}'::jsonb);
  raise warning 'FAIL  nor merge one into another';
exception when insufficient_privilege then
  raise notice 'PASS  nor merge one into another';
end
$$;

reset role;

select t_check('and both announcements are still exactly as they were',
  (select body from public.announcements where id = 'test-merge-gala'),
  'Save the date.');

-- ------------------------------------------------------- merging by hand ---

/* The date each card carries. The Gala draft parsed one out of the newsletter;
   the card already on Home has none. Merging has to move it, or the card the
   church keeps quietly loses its Add to calendar button. */
insert into public.events (id, title, starts_at, published, review_state)
values ('test-merge-night', 'Homecoming Gala', '2030-10-23 23:30:00+00',
        false, 'pending');

update public.announcements set event_id = 'test-merge-night'
 where id = 'test-merge-gala-2';

-- And a third copy, pointing at the one about to go.
insert into public.announcements (id, title, body, published, review_state)
values ('test-merge-gala-3', 'Homecoming Gala Tickets', 'A third go.',
        false, 'pending');

update public.announcements
   set duplicate_of = 'test-merge-gala-2', dedupe_checked_at = now()
 where id = 'test-merge-gala-3';

-- Where the card sits on Home, which no merge may touch.
update public.announcements set pinned = true, priority = 40
 where id = 'test-merge-gala';

do $$
declare v_target text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000001"}';
  v_target := public.hc_admin_merge_announcement(
    'test-merge-gala-2', 'test-merge-gala',
    jsonb_build_object(
      'title', 'Homecoming Gala',
      'body',  'Save the date. Tickets are live, $25.',
      'link_url', 'https://example.com/gala',
      'published', false,          -- not on the list, so it writes nothing
      'priority', 0                -- likewise
    ));
  if v_target = 'test-merge-gala' then
    raise notice 'PASS  an admin can merge two announcements they picked themselves';
  else
    raise warning 'FAIL  an admin can merge two announcements they picked themselves  (got %)', v_target;
  end if;
end
$$;

reset role;

select t_check('the merged words are on the card the church keeps',
  (select body from public.announcements where id = 'test-merge-gala'),
  'Save the date. Tickets are live, $25.');

select t_check('and the longer name with them',
  (select title from public.announcements where id = 'test-merge-gala'),
  'Homecoming Gala');

select t_check('and the link only the second one had',
  (select link_url from public.announcements where id = 'test-merge-gala'),
  'https://example.com/gala');

/* THE HALF THAT WOULD BE QUIETLY DESTRUCTIVE. A jsonb naming published and
   priority writes neither, because the function takes only the columns it
   lists. Where a card sits on Home is not something a merge gets a vote on. */
select t_check('a merge cannot take a card off Home',
  (select published from public.announcements where id = 'test-merge-gala'), true);

select t_check('nor unpin it',
  (select pinned from public.announcements where id = 'test-merge-gala'), true);

select t_check('nor move it down the page',
  (select priority from public.announcements where id = 'test-merge-gala'), 40);

select t_check('the date moves to the card that stays',
  (select event_id from public.announcements where id = 'test-merge-gala'),
  'test-merge-night');

select t_check('and the third copy points at it rather than at the drawer',
  (select duplicate_of from public.announcements where id = 'test-merge-gala-3'),
  'test-merge-gala');

select t_check('the one that went is in the Deleted drawer, not gone',
  (select deleted_at is not null and review_state = 'discarded'
     from public.announcements where id = 'test-merge-gala-2'), true);

select t_check('and the pass will not offer this pair again',
  (select dedupe_checked_at is not null and duplicate_of is null
     from public.announcements where id = 'test-merge-gala'), true);

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_merge_announcement('test-merge-gala', 'test-merge-gala',
    '{}'::jsonb);
  raise warning 'FAIL  an announcement cannot be merged into itself';
exception when others then
  raise notice 'PASS  an announcement cannot be merged into itself';
end
$$;

reset role;

-- --------------------------------------------------- both carried a date ---

/* The case nothing is allowed to decide on its own. Two announcements, two
   different evenings on the calendar, merged. The words come together; the
   two dates are flagged against each other so the calendar's own Merge offers
   the choice, with the survivor rule 0052 wrote. */
insert into public.announcements (id, title, body, published, review_state,
                                  created_at)
values ('test-merge-serve-a', 'City Serve Day', 'Bring gloves.', true, 'approved',
        now() - interval '5 days'),
       ('test-merge-serve-b', 'City Serve Day Signup', 'Sign up here.', true,
        'approved', now() - interval '1 day');

insert into public.events (id, title, starts_at, published, review_state, created_at)
values ('test-merge-serve-1', 'City Serve Day', '2030-09-12 14:00:00+00', true,
        'approved', now() - interval '5 days'),
       ('test-merge-serve-2', 'City Serve Day', '2030-09-19 14:00:00+00', false,
        'pending', now() - interval '1 day');

update public.announcements set event_id = 'test-merge-serve-1' where id = 'test-merge-serve-a';
update public.announcements set event_id = 'test-merge-serve-2' where id = 'test-merge-serve-b';

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_merge_announcement('test-merge-serve-b', 'test-merge-serve-a',
    '{"body":"Bring gloves. Sign up here."}'::jsonb);
end
$$;

reset role;

select t_check('the card that stays keeps its own date',
  (select event_id from public.announcements where id = 'test-merge-serve-a'),
  'test-merge-serve-1');

select t_check('and the other evening is flagged rather than silently dropped',
  (select duplicate_of from public.events where id = 'test-merge-serve-2'),
  'test-merge-serve-1');

select t_check('both evenings are still on the calendar until somebody decides',
  (select count(*)::int from public.events where id like 'test-merge-serve-%'), 2);

-- ------------------------------------------------------ merging two dates ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000002"}';
  perform public.hc_admin_merge_event('test-merge-serve-2', 'test-merge-serve-1',
    '{}'::jsonb);
  raise warning 'FAIL  a member cannot merge two dates they picked';
exception when insufficient_privilege then
  raise notice 'PASS  a member cannot merge two dates they picked';
end
$$;

reset role;

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_merge_event('test-merge-serve-2', 'test-merge-serve-1',
    jsonb_build_object('title', 'City Serve Day',
                       'location', '216 Giuffrias Ave',
                       'also_on', jsonb_build_array('2030-09-19')));
end
$$;

reset role;

select t_check('one date is left',
  (select count(*)::int from public.events where id like 'test-merge-serve-%'), 1);

select t_check('and it is on both Saturdays',
  (select public.hc_event_days(starts_at, also_on)
     from public.events where id = 'test-merge-serve-1'),
  array['2030-09-12','2030-09-19']::date[]);

select t_check('with the place only the second one knew',
  (select location from public.events where id = 'test-merge-serve-1'),
  '216 Giuffrias Ave');

select t_check('and nothing new was published by merging',
  (select published from public.events where id = 'test-merge-serve-1'), true);

-- ------------------------------------------------ two flagged at each other ---

/* The pair that would leave a flag nobody can see. Two rows pointing at each
   other — which a loose guard and a model disagreeing about which one survives
   can produce — merged one way. The survivor must not be left aimed at
   something in the Deleted drawer, where the screen draws nothing for it and
   the merge refuses because the card it names is gone. */
insert into public.announcements (id, title, body, published, review_state,
                                  created_at)
values ('test-merge-loop-a', 'Baptism Sunday', 'Get in the water.', true,
        'approved', now() - interval '3 days'),
       ('test-merge-loop-b', 'Baptism', 'Sign up by Sunday.', true,
        'approved', now() - interval '2 days');

update public.announcements set duplicate_of = 'test-merge-loop-b',
       duplicate_note = 'one way', dedupe_checked_at = now()
 where id = 'test-merge-loop-a';
update public.announcements set duplicate_of = 'test-merge-loop-a',
       duplicate_note = 'and the other', dedupe_checked_at = now()
 where id = 'test-merge-loop-b';

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_apply_announcement_update('test-merge-loop-a');
end
$$;

reset role;

select t_check('the card that stays is not left pointing at the drawer',
  (select duplicate_of is null and duplicate_note is null
     from public.announcements where id = 'test-merge-loop-b'), true);

select t_check('and it is answered for, so the pass does not raise it again',
  (select dedupe_checked_at is not null
     from public.announcements where id = 'test-merge-loop-b'), true);

select t_check('the other one went to the drawer',
  (select deleted_at is not null and review_state = 'discarded'
     from public.announcements where id = 'test-merge-loop-a'), true);

-- ---------------------------------------------------------- keep both ---

do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ae000000-0000-0000-0000-000000000001"}';
  perform public.hc_admin_keep_announcement_separate('test-merge-gala-3');
end
$$;

reset role;

select t_check('an admin can say two announcements are two things',
  (select duplicate_of is null and duplicate_note is null
     from public.announcements where id = 'test-merge-gala-3'), true);

select t_check('and the pass does not come back to ask again',
  (select dedupe_checked_at is not null
     from public.announcements where id = 'test-merge-gala-3'), true);

select t_check('saying so deleted nothing',
  (select count(*)::int from public.announcements where id = 'test-merge-gala-3'), 1);

-- ---------------------------------------------------------------- tidying ---

delete from public.announcements where id like 'test-merge-%';
delete from public.events        where id like 'test-merge-%';
delete from public.review_approvals where row_id like 'test-merge-%';
delete from public.profiles where id in (
  'ae000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-000000000002');
delete from auth.users where id in (
  'ae000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-000000000002');
