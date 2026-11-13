-- ===========================================================================
-- Undoes 0099. The sermon audio notification goes back to sending the moment
-- /new-podcast finishes.
--
-- THE FAST UNDO IS ONE LINE: stop the clock, and nothing booked will send.
--
--   select cron.unschedule('hc-new-sermon-noon');
--
-- Then put /new-podcast's last step back to hc_announce_new_sermon, or the
-- next run books a time nothing will ever send at. This file is the whole way
-- back. Anything booked and unsent is simply never sent; send it by hand with
-- hc_announce_new_sermon if it still should go.
-- ===========================================================================

do $$
declare
  v_jobid bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_jobid from cron.job where jobname = 'hc-new-sermon-noon';
    if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  end if;
end
$$;

drop function if exists public.hc_new_sermon_tick(timestamptz);
drop function if exists public.hc_schedule_new_sermon(text);
drop function if exists public.hc_new_sermon_noon(timestamptz);

drop index if exists public.podcasts_push_send_at_idx;
alter table public.podcasts drop column if exists push_send_at;
