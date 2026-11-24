-- ===========================================================================
-- 0102: the review note is there, is plain text, and a signed in member
-- cannot write one.
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

begin;

select t_check('0102: announcements.review_note is text',
  (select data_type::text from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements' and column_name = 'review_note'),
  'text');
select t_check('0102: events.review_note is text',
  (select data_type::text from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'review_note'),
  'text');

insert into public.announcements (id, title, review_note, published)
  values ('t102-draft', 'Christmas Eve Eve, December 23',
          '5:30pm and 7:00pm are not in the email or on its flyers.', false);
select t_check('0102: the intake can write a note',
  (select review_note from public.announcements where id = 't102-draft'),
  '5:30pm and 7:00pm are not in the email or on its flyers.');

-- A member signed in to the app, who is not an admin, cannot write one.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}', true);
do $$
begin
  update public.announcements set review_note = 'all fine' where id = 't102-draft';
exception when others then null;
end $$;
reset role;
select t_check('0102: a member cannot change it',
  (select review_note from public.announcements where id = 't102-draft'),
  '5:30pm and 7:00pm are not in the email or on its flyers.');

rollback;
