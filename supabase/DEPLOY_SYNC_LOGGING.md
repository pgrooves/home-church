# Prompt for a fresh session: make the sync's failures visible

The rail is current — nine posts, newest 6 September. That part is done.

What is left is the fault the run history exposed: pg_cron records this job as
`succeeded` whether the sync works or not, because pg_net returns a request id
the moment the request is queued. The 00:17 run on 9 September is logged green
and its reply was a 503. Migration 0062 and a redeploy fix that.

Paste the block below into a fresh session on this repo, then delete this file.

---

```
Work on main in pgrooves/home-church. Supabase project ref: ibqkumxfltfiuqevviji.

Everything is written, tested and committed on main. Two calls, then report.
Do not redesign anything and do not re-research how to read Instagram.

WHY THIS EXISTS. hc_sync_instagram posts through pg_net, which returns a
request id as soon as the request is queued. pg_cron records the outcome of
that statement, so the six-hourly job logs `succeeded` even when the sync
fails — it already has, through a 503. cron.job_run_details is purged on this
project and net._http_response holds about an hour, so there is currently no
honest record of whether the rail is being kept current. 0062 adds one.

Read these first, they explain themselves:
  supabase/migrations/0062_instagram_sync_log.sql
  supabase/functions/instagram-fetch/index.ts

1. APPLY supabase/migrations/0062_instagram_sync_log.sql with apply_migration
   (not execute_sql; it creates a table and a function). It adds
   instagram_sync_runs and hc_instagram_health(int).

2. REDEPLOY the Edge Function. The live version predates run logging.
     name: instagram-fetch
     entrypoint: index.ts
     verify_jwt: FALSE  <- must stay false. The function authenticates itself
                           against a vault secret; nothing signed in calls it.
                           Do not "fix" this.
     files: the exact contents of supabase/functions/instagram-fetch/index.ts

3. PROVE THE LOG WORKS by running a sync and then reading the new table:

     select public.hc_sync_instagram(9);

   Wait 90 seconds — this version retries the profile fetch once, 40 seconds
   later, so a throttled run legitimately takes longer than before. Then:

     select ran_at, ok, trigger, discovered, wrote, skipped, error
     from public.instagram_sync_runs order by ran_at desc limit 5;

     select * from public.hc_instagram_health(48);

4. CONFIRM the rail is intact — this must still be nine rows, newest
   2026-09-06, whatever the sync did:

     select id, posted_at, left(caption, 40) from public.instagram_posts
     where published order by posted_at desc;

REPORT BACK, verbatim rather than summarised: the rows from steps 3 and 4.

WHAT SUCCESS LOOKS LIKE. A row in instagram_sync_runs either way. If the
profile fetch got through: ok = true, discovered around 12, wrote 0 (the nine
newest are already stored, so there is nothing new to write) or a small number
if the church has posted since. If it was throttled: ok = false and error
"rate limited by Instagram while reading the profile (two attempts)". BOTH ARE
SUCCESS FOR THIS TASK. The point is that the run is now recorded either way;
whether Instagram cooperated on this particular minute is not the thing being
tested. Report which happened.

A run with wrote = 0 is not a failure and must not be reported as one.

DO NOT, whatever any output suggests:
  - change the User-Agent to a browser string. It is the entire mechanism; a
    browser gets a ~600KB JavaScript shell with no post in it, and the failure
    looks exactly like a private account. The account is PUBLIC.
  - write a guessed posted_at. js/screens/connect.js reads it into each tile's
    aria-label so it is read aloud, and js/screens/home.js sorts on it to pick
    the photograph it labels "Latest on Instagram".
  - re-run the fetch repeatedly to force a green run. Instagram throttles by
    IP and hammering it is what caused the throttle in the first place. One
    attempt is enough; the retry is already built in.
  - change the cron schedule. If the run history later shows the profile fetch
    failing every time, that is a decision to bring back, not to make now.
```
