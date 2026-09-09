# Prompt for a fresh session: get the current posts onto the rail

The app still shows a post from 17 August as the newest. The rail holds five
rows; it should hold nine, the newest from 6 September.

Everything needed is deployed. This is one call plus a tidy-up, and then some
reading that decides how the scheduler gets fixed.

Paste the block below into a fresh session on this repo, then delete this file.

---

```
Work on main in pgrooves/home-church. Supabase project ref: ibqkumxfltfiuqevviji.

The Instagram rail is stale: five rows, newest 2026-08-17, while the account's
newest post is 2026-09-06. Everything is deployed and working. Your job is to
get the current posts onto the rail and then report two things. Do not redesign
anything and do not re-research how to read Instagram.

BACKGROUND YOU NEED, because it decides which call to make. There are two ways
in, and only one of them works right now:

  hc_sync_instagram(9)     reads the PROFILE page to discover posts.
                           Instagram throttles that endpoint hard. It is what
                           the six-hourly cron job calls, and it has been
                           failing: profile fetches return 302/429 while post
                           pages return 200 from the same IP at the same second.

  hc_fetch_instagram(...)  takes explicit post links. Never touches the profile
                           endpoint. This one has succeeded before and post
                           pages are currently answering fine.

So use hc_fetch_instagram. Do not "improve" this by switching to the sync.

1. WRITE THE POSTS. These nine shortcodes were discovered from the live profile
   and verified to parse:

     select public.hc_fetch_instagram(array[
       'https://www.instagram.com/p/Dc9xLb9ic3f/',
       'https://www.instagram.com/p/Dc6IGoRjLys/',
       'https://www.instagram.com/p/Dc18VajiUGv/',
       'https://www.instagram.com/p/DctP_VzxADJ/',
       'https://www.instagram.com/p/DcrslkjCTAg/',
       'https://www.instagram.com/p/DcoGhmTjMRf/',
       'https://www.instagram.com/p/DcleW3XjJwZ/',
       'https://www.instagram.com/p/DcZx3DlCRFG/',
       'https://www.instagram.com/p/DcWuKHXCbLc/'
     ]);

   That returns a pg_net request id. Wait 45 seconds (nine posts paced 1.5s
   apart, each with an image download and a Storage upload), then:

     select status_code, content from net._http_response where id = <that id>;

   If it comes back "rate limited by Instagram", wait 15 minutes and run it
   again. That is the throttle, not a fault, and it clears.

2. TRIM THE RAIL to the newest nine, retiring the August rows:

     update public.instagram_posts set published = false
     where id not in (
       select id from public.instagram_posts order by posted_at desc limit 9
     ) returning id, posted_at;

3. CONFIRM what the app will now see:

     select id, media_type, posted_at, left(caption, 40) as caption
     from public.instagram_posts where published order by posted_at desc;

   Nine rows. Newest should be 2026-09-06, captioned "What a morning at HOME."
   Every posted_at a real timestamp; none at 15:00:00.

4. REPORT BACK, verbatim rather than summarised:
   - the JSON from step 1
   - the nine rows from step 3
   - and the cron history below, which is the evidence for fixing the scheduler:

     select status, start_time, return_message from cron.job_run_details
     where jobid = (select jobid from cron.job where jobname = 'hc-instagram-sync')
     order by start_time desc limit 8;

     select created, status_code, left(content, 200) from net._http_response
     order by created desc limit 8;

DO NOT CHANGE THE SCHEDULER. The six-hourly job depends on the profile endpoint
and that is the thing failing, but the fix should be chosen from the run history
above rather than guessed at. Report it; do not unschedule, reschedule, or
rewrite the function.

DO NOT, whatever any output suggests:
  - change the User-Agent to a browser string. It is the entire mechanism; a
    browser gets a ~600KB JavaScript shell with no post in it, and the failure
    looks exactly like a private account. The account is PUBLIC.
  - write a guessed posted_at. js/screens/connect.js reads it into each tile's
    aria-label so it is read aloud, and js/screens/home.js sorts on it to pick
    the photograph it labels "Latest on Instagram".
  - set verify_jwt true on the instagram-fetch function. It authenticates itself
    against a vault secret; nothing signed in calls it.
```
