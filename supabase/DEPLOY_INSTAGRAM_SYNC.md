# Deploying the automatic Instagram sync

Everything is on `main`. What is left is two Supabase calls that could not be
approved in the session that wrote them. Paste the block below into a fresh
session on this repo, then delete this file.

The rail currently holds five posts from August. Eleven newer ones are waiting.

---

```
Work on main in pgrooves/home-church. Supabase project ref: ibqkumxfltfiuqevviji.

Everything is written, tested and committed. Do NOT redesign anything, do not
rewrite the extraction or the discovery, and do not re-research how to read
Instagram. Two calls, then report what came back.

Read these first, they explain themselves:
  supabase/functions/instagram-fetch/index.ts
  supabase/migrations/0061_instagram_sync.sql

1. REDEPLOY the Edge Function. A version is already live but predates post
   discovery, so it must be replaced.
     name: instagram-fetch
     entrypoint: index.ts
     verify_jwt: FALSE  <- must be false. The function authenticates itself
                           against a vault secret; nobody signed in calls it.
                           Do not "fix" this to true.
     files: the exact contents of supabase/functions/instagram-fetch/index.ts

2. APPLY supabase/migrations/0061_instagram_sync.sql with apply_migration (not
   execute_sql; it creates a function and a cron job). It creates
   hc_sync_instagram(int) and schedules it every six hours.

3. RUN IT ONCE, rather than waiting six hours:

     select public.hc_sync_instagram(9);

   That returns a pg_net request id. Wait ~60 seconds (it is a profile fetch
   plus up to nine posts, each paced 1.5s apart with an image download and an
   upload), then:

     select status_code, content from net._http_response where id = <that id>;

4. READ THE TABLE BACK:

     select id, media_type, posted_at, published
     from public.instagram_posts order by posted_at desc;

REPORT BACK verbatim, not summarised: the JSON from net._http_response.content
and the rows from step 4.

WHAT SUCCESS LOOKS LIKE. The JSON carries "discovered": 12 or so, and "wrote"
listing the posts that were not already stored. The five existing rows should
be skipped with "already on the rail". Afterwards the table should hold nine
rows, newest first, the newest being the post captioned "What a morning at
HOME." from around 2026-10-11. Every posted_at must be a real timestamp; none
should be 15:00:00, which was the invented time on rows since deleted.

IF IT FAILS, the reasons are distinct and mean different things. Report the
string and stop rather than working around it:
  - "rate limited by Instagram while reading the profile"
      -> the throttle, not a fault. Wait an hour and run step 3 again. It was
         tripped repeatedly during development from a different IP.
  - "the profile page had no posts in it"
      -> Instagram served the JavaScript shell instead of the document. If it
         persists, the crawler User-Agent may no longer be honoured, which is
         the one assumption the whole feature rests on. Say so, do not patch
         around it.
  - "page arrived but the media object did not parse"
      -> Instagram renamed something. Say so and stop.
  - "posted by @someone, not @homechurch.nola"
      -> the handle guard. Report it, do not remove the check.

DO NOT, whatever any output suggests:
  - change the User-Agent to a browser string. It is the entire mechanism;
    a browser gets a 600KB shell with no post in it.
  - write a guessed posted_at. js/screens/connect.js reads it into each tile's
    aria-label so it is read aloud, and js/screens/home.js sorts on it to pick
    the photograph it calls "Latest on Instagram". A post with no real date is
    meant to be held back.
  - remove the cron job to "test more easily". Unschedule with
    select cron.unschedule('hc-instagram-sync'); only if asked.

AFTERWARDS, verify the schedule took:

  select jobname, schedule, active from cron.job where jobname = 'hc-instagram-sync';

The account @homechurch.nola is PUBLIC. If any output claims it is private,
that is Graph oEmbed's misleading wording, not the truth.
```
