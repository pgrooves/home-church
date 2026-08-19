-- ===========================================================================
-- The posting filter, and the much more important question of what it lets
-- through.
--
-- Guideline 1.2 wants a filter. A church small group wants to be able to say
-- the true thing, which is often the ugly thing. Most of the checks below are
-- about the second: a filter that refuses an honest sentence about addiction
-- or divorce would cost this app more than the slur it caught.
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

create or replace function t_refuses(label text, sql text)
returns void language plpgsql as $$
begin
  execute sql;
  raise warning 'FAIL  % (it was allowed)', label;
exception when others then
  raise notice 'PASS  % (refused: %)', label, left(sqlerrm, 46);
end;
$$;

-- ------------------------------------------------------- the check itself
--
-- Called directly, as the owner, because the two functions that use it are
-- security definer and this is the unit underneath them.

select t_check('an ordinary sentence passes',
  public.hc_text_offends('A courtroom. My dad practiced law.'), null);

-- The sentences this app exists for. If any of these ever start failing,
-- somebody has put ordinary profanity on the list and the fix is to take it
-- off, not to soften the test.
select t_check('so does the honest answer about drinking',
  public.hc_text_offends('I was drunk most nights that year and I hid it from her.'), null);
select t_check('and about wanting to die',
  public.hc_text_offends('There was a stretch where I did not want to be alive.'), null);
select t_check('and about a marriage coming apart',
  public.hc_text_offends('She left in March. I still have not told my mother.'), null);
select t_check('and anger, said plainly',
  public.hc_text_offends('Honestly? I hate him for it.'), null);

-- The Scunthorpe problem, which is the failure mode of every naive filter.
select t_check('a word that merely contains a term is not a term',
  public.hc_text_offends('We drove past Scunthorpe and the levee.'), null);
select t_check('coonass, which people here call themselves, is not caught',
  public.hc_text_offends('My grandfather was a proud coonass from Terrebonne.'), null);
select t_check('and dyke, which in this city is a levee',
  public.hc_text_offends('The dyke held through the storm.'), null);

-- And the thing it is for.
select t_check('a slur is caught',
  public.hc_text_offends('he called me a Faggot in the parking lot') is not null, true);
select t_check('case does not help',
  public.hc_text_offends('NIGGER') is not null, true);
select t_check('and it names which term, so a false positive is legible',
  public.hc_text_offends('what a retard'), 'retard');

-- ---------------------------------------------------------- through the door
--
-- The unit passing is not the same as the door being locked. These go through
-- hc_room_post and hc_room_edit_note as a real signed in member.

insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999', 'fhost@example.com'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fmember@example.com')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_host, terms_accepted_at) values
  ('99999999-9999-9999-9999-999999999999', 'Fran', true,  now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Finn', false, now())
  on conflict (id) do update set can_host = excluded.can_host,
                                 terms_accepted_at = excluded.terms_accepted_at;

create table if not exists t_filt (k text primary key, v text);
grant select, insert on t_filt to anon, authenticated;
delete from t_filt;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999"}';
  insert into t_filt select 'room', (public.hc_room_open(
    'g-filter', 'A guide', 'Filter', '[{"heading":"h","body":"A question"}]'::jsonb)).id::text;
commit;

insert into t_filt select 'code', code from public.group_rooms
 where id = (select v from t_filt where k = 'room')::uuid;
insert into t_filt select 'q', id::text from public.group_room_questions
 where room_id = (select v from t_filt where k = 'room')::uuid;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
  select public.hc_room_join((select v from t_filt where k = 'code'));

  select t_refuses('posting a slur is refused',
    'select public.hc_room_post((select v from t_filt where k=''room'')::uuid,
                                (select v from t_filt where k=''q'')::uuid,
                                ''answer'', ''you faggot'')');

  select t_refuses('and so is putting one in a prayer request',
    'select public.hc_room_post((select v from t_filt where k=''room'')::uuid,
                                null, ''prayer'', ''pray for that retard'')');

  insert into t_filt select 'note', (public.hc_room_post(
    (select v from t_filt where k='room')::uuid,
    (select v from t_filt where k='q')::uuid,
    'answer', 'A courtroom, and I was drunk for most of it.')).id::text;
commit;

select t_check('nothing refused was written',
  (select count(*)::int from public.group_room_notes
    where room_id = (select v from t_filt where k='room')::uuid), 1);

-- The gap that would make the whole thing decorative: post something clean,
-- then edit it into a slur.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
  select t_refuses('and the filter is not one edit deep',
    'select public.hc_room_edit_note((select v from t_filt where k=''note'')::uuid, ''actually, you faggot'')');
  select t_check('so the note still says what it said',
    (select body from public.group_room_notes where id = (select v from t_filt where k='note')::uuid),
    'A courtroom, and I was drunk for most of it.');

  -- An ordinary edit still works, which is the thing a broken filter breaks.
  select public.hc_room_edit_note((select v from t_filt where k='note')::uuid,
    'A courtroom. I have been sober fourteen months.');
  select t_check('an honest edit goes through',
    (select body from public.group_room_notes where id = (select v from t_filt where k='note')::uuid),
    'A courtroom. I have been sober fourteen months.');
commit;

-- --------------------------------------------------------------- privileges
--
-- The list is the one table in this feature that a phone must not be able to
-- read: a client holding the list is a client that can work around it.

select t_check('anon cannot read the list',
  has_table_privilege('anon', 'public.group_filter_terms', 'SELECT'), false);
select t_check('and neither can somebody signed in',
  has_table_privilege('authenticated', 'public.group_filter_terms', 'SELECT'), false);
select t_check('nobody but service_role can change it',
  (select coalesce(string_agg(r.role || ' ' || p.priv, ', '), 'none')
     from unnest(array['anon', 'authenticated']) as r(role)
     cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'SELECT']) as p(priv)
    where has_table_privilege(r.role, 'public.group_filter_terms', p.priv)), 'none');
select t_check('and the check is not callable from a phone either',
  (select coalesce(string_agg(r.role, ', ' order by r.role), 'none')
     from unnest(array['anon', 'authenticated']) as r(role)
    where has_function_privilege(r.role, 'public.hc_text_offends(text)', 'EXECUTE')), 'none');

-- Restated from 0018, because 0020 replaces two of those functions and
-- create or replace is exactly the kind of thing that quietly resets a grant.
select t_check('posting is still callable by somebody signed in',
  has_function_privilege('authenticated', 'public.hc_room_post(uuid, uuid, text, text)', 'EXECUTE'), true);
select t_check('editing too',
  has_function_privilege('authenticated', 'public.hc_room_edit_note(uuid, text)', 'EXECUTE'), true);
select t_check('and neither of them came back open to anon',
  (select coalesce(string_agg(f.n, ', ' order by f.n), 'none')
     from unnest(array['public.hc_room_post(uuid, uuid, text, text)',
                       'public.hc_room_edit_note(uuid, text)']) as f(n)
    where has_function_privilege('anon', f.n, 'EXECUTE')), 'none');
