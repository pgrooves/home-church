# Prompt for a fresh session: make the Instagram sync actually keep running

The rail stopped updating on 6 September. Two posts are missing. The cause is
found and fixed in code on `main`; what is left is two migrations and a
redeploy.

Paste the block below into a fresh session on this repo, then delete this file.

---

```
Work on main in pgrooves/home-church. Supabase project ref: ibqkumxfltfiuqevviji.

Everything is written, tested and committed on main (1059 tests pass). Your job
is three calls and a check. Do not redesign anything, do not rewrite the
extraction, and do not re-research how to read Instagram.

WHAT WENT WRONG, because it decides what "working" looks like at the end.
The six-hourly sync discovered posts by reading the PROFILE page. Instagram
throttles that endpoint hard — the same IP in the same second gets 302 for a
profile and 200 for a post — so the job failed every time for a week. And
because pg_net returns a request id the moment a request is queued, pg_cron
recorded every one of those failures as `succeeded`.

Both are fixed in code:
  - discovery now falls back to the newest post already on the rail. A post
    page lists ~24 others from the same account and is not throttled.
  - every run writes its outcome to a table, so failures stop being invisible.
  - media ids are compared instead of fetched, so an idle run is ONE request.

Read these first, they explain themselves:
  supabase/migrations/0062_instagram_sync_log.sql
  supabase/migrations/0070_instagram_sync_hourly.sql
  supabase/functions/instagram-fetch/index.ts

1. APPLY supabase/migrations/0062_instagram_sync_log.sql with apply_migration
   (not execute_sql; it creates a table and a function).

2. APPLY supabase/migrations/0070_instagram_sync_hourly.sql with
   apply_migration. It reschedules the cron job from six-hourly to hourly.

3. REDEPLOY the Edge Function. The live version predates all of this.
     name: instagram-fetch
     entrypoint: index.ts
     verify_jwt: FALSE  <- must stay false. The function authenticates itself
                           against a vault secret; nothing signed in calls it.
                           Setting this true makes it uncallable. Do not.
     files: the exact contents of supabase/functions/instagram-fetch/index.ts

4. RUN IT ONCE and read the new log:

     select public.hc_sync_instagram(9);

   Wait 60 seconds, then:

     select ran_at, ok, via, discovered, wrote, skipped, error
     from public.instagram_sync_runs order by ran_at desc limit 5;

     select id, posted_at, left(caption, 44) from public.instagram_posts
     where published order by posted_at desc;

     select jobname, schedule, active from cron.job
     where jobname = 'hc-instagram-sync';

REPORT BACK verbatim, not summarised: all three results.

WHAT SUCCESS LOOKS LIKE. These two posts are currently missing and should now
be on the rail:

  DdNHg-7ERMG  "HOMECOMING JERSEYS ARE HERE"   id 3984874298204558086
  DdMJoevtZLx  "CHURCH TOMORROW"               id 3984602134526399217

So: a row in instagram_sync_runs with ok = true and wrote = 2 (or more, if the
church has posted since), `via` naming whichever source answered, and the
schedule reading '23 * * * *'. The rail should hold 11 rows, newest being
HOMECOMING JERSEYS.

If ok = false, report the error string and STOP. Do not work around it:
  - "no source would answer" -> both the profile and the fallback were
    refused. Unusual. Wait 15 minutes and run step 4 once more, no more.
  - anything about a media object not parsing -> Instagram renamed something.
    Report it; the fix wants the saved page, not a guess.

DO NOT, whatever any output suggests:
  - change the User-Agent to a browser string. It is the entire mechanism; a
    browser gets a ~600KB JavaScript shell with no post in it, and the failure
    looks exactly like a private account. The account is PUBLIC.
  - write a guessed posted_at. connect.js:608 reads it into each tile's
    aria-label so it is read aloud, and home.js sorts on it to pick the
    photograph it labels "Latest on Instagram".
  - trust cron.job_run_details as a health signal. It reports this job as
    succeeded even when it fails; that is the whole reason 0062 exists. Read
    instagram_sync_runs instead.
  - re-run the fetch repeatedly to force a result. Instagram throttles by IP
    and hammering it is what caused the original problem.
  - trim the rail to nine. Eleven rows is correct; the rail scrolls.
```
