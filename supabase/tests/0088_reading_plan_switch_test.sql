-- ===========================================================================
-- The reading plan, hidden and relinked from App settings.
--
-- What is checked: the switch row is seeded on, only an admin can relink the
-- plan, only a link is accepted, the link lands on the current plan and keeps
-- its label, and empty takes it off.
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

insert into auth.users (id, email) values
  ('ff000000-0000-0000-0000-000000000001', 'radmin@example.com'),
  ('ff000000-0000-0000-0000-000000000002', 'rmember@example.com')
  on conflict do nothing;

insert into public.profiles (id, first_name) values
  ('ff000000-0000-0000-0000-000000000001', 'Ada'),
  ('ff000000-0000-0000-0000-000000000002', 'Mo')
  on conflict (id) do update set first_name = excluded.first_name;

update public.profiles set role = 'admin' where id = 'ff000000-0000-0000-0000-000000000001';
update public.profiles set role = 'member' where id = 'ff000000-0000-0000-0000-000000000002';

-- --------------------------------------------------------- the switch ---

select t_check('the switch is seeded on',
  (select value_bool from public.app_settings where key = 'reading_plan_on'), true);

-- ----------------------------------------------------------- the plans ---

update public.reading_plans set is_current = false;
insert into public.reading_plans (id, title, total_weeks, is_current, published, resources)
values
  ('plan-t-old', 'Old plan', 4, false, true,
   '[{"url":"https://old.example.com","label":"Old"}]'),
  ('plan-t-now', 'Current plan', 4, true, true,
   '[{"url":"https://now.example.com","label":"The devotional"}]')
on conflict (id) do update set is_current = excluded.is_current,
  resources = excluded.resources, published = excluded.published;

-- --------------------------------------------------------- who may ask ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000002"}';
  select t_raises_like('a member cannot relink the plan',
    $$select public.hc_admin_set_reading_plan_link('https://evil.example.com')$$,
    'Admins only');
commit;

begin;
  set local role anon;
  select t_raises_like('and neither can a signed out phone',
    $$select public.hc_admin_set_reading_plan_link('https://evil.example.com')$$,
    'permission denied');
commit;

-- ----------------------------------------------------------- an admin ---

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';

  select t_raises_like('something that is not a link is refused',
    $$select public.hc_admin_set_reading_plan_link('javascript:alert(1)')$$,
    'does not look like a link');

  select t_check('a link lands on the current plan',
    (select public.hc_admin_set_reading_plan_link('https://new.example.com/plan')),
    'plan-t-now');
commit;

select t_check('with the new url',
  (select resources -> 0 ->> 'url' from public.reading_plans where id = 'plan-t-now'),
  'https://new.example.com/plan');
select t_check('and its label kept',
  (select resources -> 0 ->> 'label' from public.reading_plans where id = 'plan-t-now'),
  'The devotional');
select t_check('and the old plan untouched',
  (select resources -> 0 ->> 'url' from public.reading_plans where id = 'plan-t-old'),
  'https://old.example.com');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  select public.hc_admin_set_reading_plan_link('');
commit;

select t_check('empty takes the link off',
  (select jsonb_array_length(resources) from public.reading_plans where id = 'plan-t-now'), 0);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000001"}';
  select public.hc_admin_set_reading_plan_link('https://again.example.com');
commit;

select t_check('and a plan with no link can be given one',
  (select resources -> 0 ->> 'url' from public.reading_plans where id = 'plan-t-now'),
  'https://again.example.com');

-- ----------------------------------------------------------------- tidy ---

delete from public.reading_plans where id in ('plan-t-old', 'plan-t-now');
