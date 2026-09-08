# Prompt for a fresh session

Everything for the Instagram rail is built and pushed. What is left is four
Supabase calls that could not be approved in the session that wrote them.

Paste the block below into a new session on this repo. Delete this file once
the rail is filled.

---

```
Work on branch claude/instagram-feed-scraper-yx49i7 of pgrooves/home-church.
Supabase project ref: ibqkumxfltfiuqevviji.

Everything is already written and committed. Do NOT redesign it, do not
rewrite the extraction, and do not re-research how to read Instagram. Your
job is to run four things and report exactly what came back.

Read these two files first, they explain themselves:
  supabase/functions/instagram-fetch/index.ts
  supabase/migrations/0059_instagram_fetch.sql

Then:

1. Deploy the Edge Function, via the Supabase MCP server.
     name: instagram-fetch
     entrypoint: index.ts
     verify_jwt: FALSE  <- it must be false. The function does its own auth
                           against a vault secret; it is not called by anyone
                           signed in. Do not "fix" this to true.
     files: the contents of supabase/functions/instagram-fetch/index.ts

2. Apply supabase/migrations/0059_instagram_fetch.sql with apply_migration
   (not execute_sql, it creates a function). It puts a secret in the vault
   and creates public.hc_fetch_instagram(text[]).

3. Run it on the church's five real posts:

     select public.hc_fetch_instagram(array[
       'https://www.instagram.com/p/DcHwSuzCUYq/',
       'https://www.instagram.com/p/DcEDXxvjLJW/',
       'https://www.instagram.com/p/Db1vWdDCXWb/',
       'https://www.instagram.com/p/DbRvCcwCTzI/',
       'https://www.instagram.com/p/Da_oiYwiYeA/'
     ]);

   That returns a pg_net request id. Wait ~30 seconds, then read the reply:

     select status_code, content from net._http_response where id = <that id>;

4. Read the table back:

     select id, media_type, posted_at, image_path, published
     from public.instagram_posts order by posted_at desc;

REPORT BACK, verbatim rather than summarised:
  - the JSON in net._http_response.content (it lists what was written and
    what was skipped, with a reason per post)
  - the rows from step 4

WHAT SUCCESS LOOKS LIKE. Five new rows keyed by long numeric ids like
3965350390354495018, with real captions, and posted_at times that are NOT
15:00:00 (the five existing demo rows are keyed by shortcode with invented
15:00 timestamps, and are the thing being replaced). The first post's real
timestamp is 2026-08-17T00:30:02Z.

IF IT FAILS, the function says which failure it hit, and they mean different
things. Report the reason string and stop rather than working around it:
  - "rate limited by Instagram" or "the page had no post in it"
      -> Instagram is refusing Deno Deploy's IPs. This is the one open
         question in the whole design. Say so. The fallback is running
         scripts/fetch_instagram_posts.js from a laptop, which needs no
         Supabase function at all.
  - "page arrived but the media object did not parse"
      -> Instagram renamed something. Say so and stop; the fix wants the
         saved page, not a guess.
  - "posted by @someone, not @homechurch.nola"
      -> the handle check. Report it, do not remove the check.

AFTERWARDS, once real rows exist, delete the five demo rows, which are keyed
by shortcode and superseded:

  delete from public.instagram_posts
  where id in ('DcHwSuzCUYq','DcEDXxvjLJW','Db1vWdDCXWb','DbRvCcwCTzI','Da_oiYwiYeA');

Their five pictures in the instagram bucket (01gathering.jpg through
05ridgewood.jpg) are then unreferenced and can be removed from the Storage
browser whenever.

Two things worth knowing but not acting on:
  - The account @homechurch.nola is PUBLIC. If anything claims it is private,
    that is Graph oEmbed's misleading wording, not the truth.
  - posted_at is read into each tile's aria-label by js/screens/connect.js,
    so it is read aloud. Never write a guessed date into it.
```
