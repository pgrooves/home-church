-- ===========================================================================
-- 0088: the reading plan, hidden and relinked from App settings
--
-- A new series does not always arrive with its reading plan ready. Until now
-- the only way to take a finished plan off Home was SQL, so Home went on
-- showing the last series' plan, stuck on its final week, under a new series.
--
-- Two things, both reached from Admin -> App settings -> Reading plan:
--
--   reading_plan_on   an app_settings switch, the same shape as homekids_on
--                     in 0081. On unless an admin turns it off, and off takes
--                     the Reading plan card off Home for everybody. Nothing is
--                     deleted. js/screens/home.js falls back to on without a
--                     row, and the Admin switch writes the row on its first
--                     tap, so this only seeds what the app would write anyway.
--
--   hc_admin_set_reading_plan_link(p_url)
--                     rewrites where the card goes when tapped, on the plan
--                     that is current. A function rather than a column grant
--                     on reading_plans.resources, because 0031 deliberately
--                     keeps URLs out of what a phone can PATCH: this one takes
--                     only a link, refuses anything that is not http(s), and
--                     touches only the first resource's url, keeping its label.
--
-- Safe to run twice.
-- ===========================================================================

insert into public.app_settings (key, label, help, kind, value_bool, value_text, sort_order)
values
  ('reading_plan_on',
   'Reading plan on Home',
   'Off takes the Reading plan card off Home for everybody. Nothing is deleted, and it comes back exactly as it was when this goes on again.',
   'boolean', true, null, 39)
on conflict (key) do nothing;


create or replace function public.hc_admin_set_reading_plan_link(p_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := btrim(coalesce(p_url, ''));
  v_id text;
  v_resources jsonb;
begin
  if not public.hc_is_admin() then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;

  if v_url <> '' and v_url !~* '^https?://[^\s]+$' then
    raise exception 'That does not look like a link. Paste the whole address, starting with https://.';
  end if;

  -- The same row Home shows: the current one, or the first when nobody set
  -- is_current, which is what pickCurrent() in js/content.js falls back to.
  select id, coalesce(resources, '[]'::jsonb) into v_id, v_resources
    from public.reading_plans
   where published
   order by is_current desc, starts_on desc nulls last, id
   limit 1;

  if v_id is null then
    raise exception 'There is no reading plan to link yet.';
  end if;

  if v_url = '' then
    -- Empty means no link: the card stays, as a label rather than a button.
    v_resources := case when jsonb_array_length(v_resources) > 0
                        then v_resources - 0 else v_resources end;
  elsif jsonb_array_length(v_resources) = 0
        or jsonb_typeof(v_resources -> 0) <> 'object' then
    v_resources := jsonb_build_array(jsonb_build_object('url', v_url))
                   || case when jsonb_array_length(v_resources) > 0
                           then v_resources - 0 else '[]'::jsonb end;
  else
    v_resources := jsonb_set(v_resources, '{0,url}', to_jsonb(v_url));
  end if;

  update public.reading_plans
     set resources = v_resources
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.hc_admin_set_reading_plan_link(text) from public, anon, authenticated;
grant execute on function public.hc_admin_set_reading_plan_link(text) to authenticated;

comment on function public.hc_admin_set_reading_plan_link(text) is
  'Sets the link on the current reading plan (its first resource), or removes it when empty. Admins only. Called from Admin -> App settings -> Reading plan.';
