-- ===========================================================================
-- Home Church, keeping the Instagram rail current on its own
--
-- 0059 gave the rail a way in: hand hc_fetch_instagram a list of post links
-- and it mirrors them. That still needed somebody to open Instagram, copy a
-- link, and come back, every week, forever. This is the part that removes the
-- person from the loop.
--
-- WHAT CHANGED TO MAKE THIS POSSIBLE. Nothing about Instagram, and nothing
-- about the API. `INSTAGRAM_SYNC_SETUP.md` and 0015 both say that listing an
-- account's posts without credentials is impossible, and 0059's own function
-- takes links precisely because of that. It turns out that was true of a
-- browser and false of a crawler. Asked for the way a link preview crawler
-- asks, a profile page is a document with about a dozen recent posts in it,
-- each carrying its numeric media id. And a media id IS its shortcode: the
-- two are the same number, one written in base64. So the profile gives ids,
-- the ids give links, and the links are what 0059 already knew how to do.
--
-- WHAT STILL HAS TO BE FETCHED PER POST. The date. A profile page carries no
-- `taken_at`, and `posted_at` is the one field that must never be guessed:
-- js/screens/connect.js reads it into each tile's aria-label, so it is never
-- drawn on screen and it is read aloud, and js/screens/home.js sorts on it to
-- decide which photograph it calls "Latest on Instagram" in front of a
-- congregation. So discovery yields links, and each link is still fetched for
-- its own page. That is why this is nine requests and not one.
--
-- WHY EVERY SIX HOURS AND NOT HOURLY. The rail is a row of photographs from a
-- church that posts a few times a week; hourly would be ninety nine percent
-- no-op. It is also the throttle: Instagram rate limits by IP, and the way to
-- stay far from that line is to be nowhere near it. Six hours means a Sunday
-- morning post is on the rail by lunchtime, which is the actual requirement.
--
-- Runs are cheap when nothing has changed: the function reads the ids already
-- in instagram_posts and skips them before downloading anything, so a tick
-- with no new posts is one profile fetch and nothing else.
--
-- UNLIKE 0012, THE CLOCK HERE IS SIMPLE. That migration ticks hourly and
-- decides in Postgres because it sends push notifications and the hour
-- matters to a human being asleep in Louisiana. Nothing here reaches anybody:
-- it writes a table. So UTC is fine and there is no DST trap to sidestep.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to run more than once: the schedule is dropped and recreated.
--
-- TO TURN IT OFF, and it is one line:
--   select cron.unschedule('hc-instagram-sync');
-- ===========================================================================


-- 1. The sync --------------------------------------------------------------
--
-- Same door as 0059, and deliberately a separate function rather than a null
-- argument to that one. "Fetch these links" and "go and see what is new" are
-- different jobs with different failure modes, and a reader should not have
-- to work out which one an empty array meant.

create or replace function public.hc_sync_instagram(p_limit int default 9)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_limit is null or p_limit < 1 or p_limit > 12 then
    raise exception 'hc_sync_instagram: p_limit must be between 1 and 12, got %', p_limit;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'hc_instagram_secret';

  if v_secret is null then
    raise exception 'hc_sync_instagram: hc_instagram_secret is missing from the vault. Re-run migration 0059.';
  end if;

  -- No `links` key at all is what asks the function to go and find them.
  select net.http_post(
    url     := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/instagram-fetch',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-hc-instagram-secret', v_secret
               ),
    body    := jsonb_build_object('limit', p_limit),
    -- One profile fetch plus up to nine posts, each with an image download and
    -- an upload, paced apart on purpose.
    timeout_milliseconds := 180000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function public.hc_sync_instagram(int) from public, anon, authenticated;

comment on function public.hc_sync_instagram(int) is
  'Finds the newest posts on the church''s Instagram profile and mirrors any that are not already on the rail. Returns a pg_net request id; the reply lands in net._http_response. Not callable by anon or authenticated, deliberately.';


-- 2. The clock -------------------------------------------------------------

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hc-instagram-sync') then
    perform cron.unschedule('hc-instagram-sync');
  end if;
end $$;

select cron.schedule(
  'hc-instagram-sync',
  '17 */6 * * *',   -- every six hours, off the hour so it does not queue behind
                    -- hc-push-tick, which runs at :00
  $cron$select public.hc_sync_instagram(9);$cron$
);


-- 3. Reading what happened -------------------------------------------------
--
-- pg_net keeps replies for a while, so this is how to see what the last few
-- ticks actually did. The `content` column holds the function's own report:
-- what it discovered, what it wrote, and a reason per post it skipped.
--
--   select r.created, r.status_code, r.content
--   from net._http_response r
--   order by r.created desc limit 5;
--
-- And whether the job itself is running, as opposed to what it found:
--
--   select jobname, schedule, active from cron.job where jobname = 'hc-instagram-sync';
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'hc-instagram-sync')
--   order by start_time desc limit 5;


select 'hc-instagram-sync scheduled, every six hours' as status;
