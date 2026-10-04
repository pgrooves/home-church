-- ===========================================================================
-- When the new guide notice is due.
--
-- Nothing here reaches APNs. What is checked is the clock: Sunday at 1pm
-- hands back the noon cutoff, Monday at 8am hands back "no cutoff", every
-- other hour hands back nothing, and all of it in Chicago time across a
-- daylight saving change. Plus the backfill: guides the old watermark already
-- announced stay announced.
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

-- ------------------------------------------------------------- the clock ---

-- 2026-10-04 is a Sunday, Chicago is on CDT (UTC-5).
select t_check('Sunday 1pm Chicago: cutoff is noon that day',
  public.hc_new_guide_cutoff('2026-10-04 18:20:00+00'),
  '2026-10-04 17:00:00+00'::timestamptz);

select t_check('Sunday noon Chicago: not yet',
  public.hc_new_guide_cutoff('2026-10-04 17:00:00+00'), null::timestamptz);

select t_check('Sunday 2pm Chicago: already past',
  public.hc_new_guide_cutoff('2026-10-04 19:00:00+00'), null::timestamptz);

select t_check('Monday 8am Chicago: no cutoff, take everything waiting',
  public.hc_new_guide_cutoff('2026-10-05 13:05:00+00'), 'infinity'::timestamptz);

select t_check('Monday 9am Chicago: nothing',
  public.hc_new_guide_cutoff('2026-10-05 14:00:00+00'), null::timestamptz);

-- 2026-12-06 is a Sunday on CST (UTC-6): 1pm is 19:00 UTC, noon is 18:00 UTC.
select t_check('winter Sunday 1pm: cutoff is noon CST',
  public.hc_new_guide_cutoff('2026-12-06 19:00:00+00'),
  '2026-12-06 18:00:00+00'::timestamptz);

select t_check('winter Monday 8am',
  public.hc_new_guide_cutoff('2026-12-07 14:00:00+00'), 'infinity'::timestamptz);

select t_check('Saturday 1pm is not Sunday',
  public.hc_new_guide_cutoff('2026-10-03 18:00:00+00'), null::timestamptz);

-- ---------------------------------------------------------- the column ---

select t_check('guides has push_announced_at',
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'guides'
      and column_name = 'push_announced_at'), 1);

-- ---------------------------------------------------------- the backfill ---
-- Replays section 1 of 0089 against rows written here, which is what a first
-- run on the real project does to the rows already there.

insert into public.guides (id, published, created_at) values
  ('g-0089-old', true, '2026-09-27 15:00:00+00'),
  ('g-0089-new', true, '2026-10-04 15:00:00+00')
  on conflict (id) do nothing;

insert into public.push_log (topic, ran_at, skipped)
values ('new_guide', '2026-09-28 13:00:00+00', false);

update public.guides g
   set push_announced_at = w.ran_at
  from (select max(ran_at) as ran_at
          from public.push_log
         where topic = 'new_guide' and not skipped) w
 where w.ran_at is not null
   and g.push_announced_at is null
   and g.created_at <= w.ran_at;

select t_check('a guide the old Monday send covered stays announced',
  (select push_announced_at from public.guides where id = 'g-0089-old'),
  '2026-09-28 13:00:00+00'::timestamptz);

select t_check('a guide posted after it is still waiting',
  (select push_announced_at from public.guides where id = 'g-0089-new'),
  null::timestamptz);

-- --------------------------------------------------------------- the tick ---

select t_check('hc_push_tick still runs at an ordinary hour',
  (select 1 from (select public.hc_push_tick()) t), 1);

select t_check('the tick is not callable by the app',
  has_function_privilege('authenticated', 'public.hc_push_tick()', 'execute'), false);

select t_check('nor is the clock',
  has_function_privilege('anon', 'public.hc_new_guide_cutoff(timestamptz)', 'execute'), false);
