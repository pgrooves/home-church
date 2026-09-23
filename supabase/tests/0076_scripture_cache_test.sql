-- ===========================================================================
-- The verse sheet's cache.
--
-- One claim worth testing, and it is the one in the migration's header: this
-- is licensed text, and nothing holding the publishable key, signed in or
-- not, can read a word of it or put one in. The function writes as the
-- service role and that has to keep working too.
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

delete from public.scripture_cache where bible_id = 111;

-- Written the way the function writes it.
insert into public.scripture_cache (bible_id, passage_id, reference, content)
  values (111, 'JHN.3.16', 'John 3:16', 'For God so loved the world');

select t_check('the service role can write a passage and read it back',
  (select content from public.scripture_cache
    where bible_id = 111 and passage_id = 'JHN.3.16'),
  'For God so loved the world');

select t_raises_like('an empty passage is refused',
  $$insert into public.scripture_cache (bible_id, passage_id, content)
    values (111, 'JHN.3.17', '')$$,
  'scripture_cache_content_check');

select t_raises_like('and so is an id that is not one',
  format($$insert into public.scripture_cache (bible_id, passage_id, content)
    values (111, %L, 'x')$$, repeat('J', 41)),
  'scripture_cache_passage_id_check');

-- ------------------------------------------------- nobody else may see it ---

begin;
  set local role anon;
  select t_raises_like('anon cannot read the cache',
    'select count(*) from public.scripture_cache', 'permission denied');
rollback;

begin;
  set local role anon;
  select t_raises_like('anon cannot write to it',
    $$insert into public.scripture_cache (bible_id, passage_id, content)
      values (111, 'GEN.1.1', 'In the beginning')$$,
    'permission denied');
rollback;

begin;
  set local role authenticated;
  select t_raises_like('a signed in member cannot read it either',
    'select count(*) from public.scripture_cache', 'permission denied');
rollback;

delete from public.scripture_cache where bible_id = 111;
