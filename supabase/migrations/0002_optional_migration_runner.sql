-- ===========================================================================
-- OPTIONAL. Read this whole header before running it.
--
-- What it does: adds an RPC that lets `scripts/hc_supabase.py apply` run a
-- migration file straight from the terminal, instead of you pasting SQL into
-- the dashboard.
--
-- What it costs: the service role key stops being "full access to your
-- content rows" and becomes "full access to your database, including the
-- ability to drop tables and rewrite policies." Supabase deliberately does
-- not expose a SQL endpoint over the REST API. This adds one.
--
-- THE RECOMMENDATION IS TO SKIP THIS FILE.
--
-- Adding a new content type happens maybe twice a year. Pasting a migration
-- into the SQL editor takes fifteen seconds and leaves the blast radius of a
-- leaked key where it should be. Run this only if you have decided you want
-- fully unattended schema changes and you understand what the key can do
-- afterward.
--
-- To undo it later:
--   drop function if exists public.hc_exec_sql(text);
-- ===========================================================================

create or replace function public.hc_exec_sql(query text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Belt and braces. The revokes below are what actually gates this, but if
  -- a future grant is added by mistake, this check still refuses the call.
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(
           (current_setting('request.jwt.claims', true)::json ->> 'role'),
           ''
         ) <> 'service_role' then
    raise exception 'hc_exec_sql is service_role only';
  end if;

  execute query;
end;
$$;

comment on function public.hc_exec_sql(text) is
  'Service role only. Runs a migration. Optional, see 0002 header for the tradeoff.';

revoke all on function public.hc_exec_sql(text) from public, anon, authenticated;
grant execute on function public.hc_exec_sql(text) to service_role;
