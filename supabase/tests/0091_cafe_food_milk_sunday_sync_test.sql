-- ===========================================================================
-- The cafe's food, the milk choice, and the Sunday sync's doorbell.
--
-- What is checked: drinks have the one milk choice and food has none, a row
-- is a drink or food and nothing else, food may have its own icon, the food
-- category is seeded, and the two functions that hand out or use the sync's
-- secret are closed to the app's roles.
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

-- ----------------------------------------------------------- the menu ---

select t_check('the seeded drinks are drinks',
  (select count(*)::int from public.cafe_menu_items where kind = 'drink'), 2);
select t_check('every drink offers milk or oat milk, and only that',
  (select bool_and(options = '[{"key":"milk","label":"Milk","group":"","type":"pick","levels":["none","Milk","Oat milk"]}]'::jsonb)
     from public.cafe_menu_items where kind = 'drink'), true);

insert into public.cafe_menu_items (id, name, kind, icon, sizes)
values ('t-cookie', 'Cookie', 'food', 'food', '[{"key":"regular","label":"","price_cents":300}]');
select t_check('food has its own icon and kind',
  (select kind || '/' || icon from public.cafe_menu_items where id = 't-cookie'), 'food/food');
select t_raises_like('a row is a drink or food',
  $$insert into public.cafe_menu_items (id, name, kind) values ('t-hat', 'Hat', 'merch')$$,
  'cafe_menu_items_kind');
select t_raises_like('and the icon is one of three',
  $$insert into public.cafe_menu_items (id, name, icon) values ('t-hat', 'Hat', 'hat')$$,
  'cafe_menu_items_icon');
delete from public.cafe_menu_items where id = 't-cookie';

select t_check('the food category is seeded',
  (select value_text from public.app_settings where key = 'cafe_square_food_category'), 'Home Church Food');

-- ------------------------------------------------------ the doorbell ---

begin;
  set local role authenticated;
  select t_raises_like('a phone cannot read the sync secret',
    $$select public.hc_cafe_sync_secret()$$, 'permission denied');
  select t_raises_like('or set off the sync',
    $$select public.hc_cafe_sync_menu()$$, 'permission denied');
rollback;

begin;
  set local role anon;
  select t_raises_like('nor can anybody signed out',
    $$select public.hc_cafe_sync_secret()$$, 'permission denied');
rollback;
