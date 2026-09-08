---
description: Put the church's latest Instagram posts on the Connect rail. Paste the links, it fetches the pictures and captions, confirms, then writes.
---

# /new-posts

Fills `instagram_posts`, which is what the rail across the top of Connect
reads. Run it with the links to the posts that should be on the rail, newest
first:

```
/new-posts
https://www.instagram.com/p/DcHwSuzCUYq/
https://www.instagram.com/reel/DcEDXxvjLJW/
https://www.instagram.com/p/Db1vWdDCXWb/
```

$ARGUMENTS

---

## Why this is links and not a sync

`INSTAGRAM_SYNC_SETUP.md` describes an hourly job that reads the account and
fills this table by itself. That job needs Instagram's API, the API needs a
Professional account, and the church declined to switch. This command is the
whole of the fallback: the same table, the same bucket, the same rail, filled
by a person on a Sunday afternoon instead of by `pg_cron` on the hour.

**It cannot find the posts for you, and that is the actual limitation.**
Listing an account's posts without credentials is the part that does not work.
Everything downstream of a link is automatic; getting the links is somebody
opening Instagram and tapping share.

## Step 0. Check the plumbing, and check where you are

Read **`supabase/ACCESS.md`** for the two transports.

**This command needs a real machine, and it is one of the few that does.**
Two independent reasons, either of which is enough:

- **Storage.** Neither transport reaches it. `ACCESS.md` is explicit: there is
  no MCP tool for Storage and no upload verb on the script, so a web session
  cannot put a picture in a bucket. A row without its picture is a row Connect
  drops.
- **The fetch.** Instagram refuses datacenter IPs, which is what a web session
  runs on. The links will resolve from a laptop on a normal connection and
  return nothing from a browser tab.

So if `.env` is not at the repo root, **stop and say so** rather than writing
rows whose pictures never made it. The rail is better empty than half drawn.

## Step 1. Read the links

Pass them straight through. The script reads them however they were pasted:
numbered, bulleted, with prose in between, with Instagram's own
`?utm_source=ig_web_copy_link` still attached. Two things it reads on purpose
rather than stripping:

| In the link | What it means |
|---|---|
| `/reel/` or `/tv/` | video, so the tile gets a play badge |
| `?img_index=` | a multi image post, which is the only carousel signal there is without the API |

**Order is the rail, left to right.** Newest first is the convention, and the
rows sort by date anyway, so the order only matters for reading the
confirmation back.

**A `/share/` link is not a post link.** It redirects, and following it to find
out what somebody actually sent is guessing. Ask for the real one.

## Step 2. Fetch and mirror

```bash
printf '%s\n' \
  'https://www.instagram.com/p/DcHwSuzCUYq/' \
  'https://www.instagram.com/reel/DcEDXxvjLJW/' \
  | node scripts/fetch_instagram_posts.js --out /tmp/ig.json
```

The rows go to stdout and to `--out`; a line per post goes to stderr. Add
`--dry-run` to see what it would do without uploading anything, which is the
right first move when somebody is not sure the links are the ones they meant.

It asks two public things, in order, and **needs no token for either**:

1. **the embed page**, the one that exists to be put on other people's
   websites. It carries the picture, the caption, the type and the real date.
2. **the post's og: tags**, the ones every link preview on the internet reads.
   Picture and caption, and **no date**, which is what Step 3 is about.

Then it downloads each picture and puts it in the `instagram` bucket. **The
bucket is the point, not an optimisation.** Instagram's CDN links are signed
and expire within days, so a stored one goes blank on its own, and pointing
phones at them would hand Meta every congregant's IP address on every visit to
Connect. Migration `0015` is the long version.

Exit codes: `0` every post came back whole, `2` at least one is thin or held
back so say which, `1` nothing was written so do not publish. On `1`, a message
about `403` from instagram.com means Step 0 — you are on a datacenter IP.

## Step 3. The date, which is the one thing not to guess

**`posted_at` is not just a sort key, whatever `0015` and the demo seed say.**
`js/screens/connect.js:599` reads it into the tile's `aria-label`. It is never
drawn on screen and it is read aloud, as fact, to exactly the people who cannot
see the picture and check it.

So a post whose real date could not be found is **held back**, not published on
a plausible guess:

```
! DcHwSuzCUYq  no date, via og tags. Add one on the line to publish it.
```

Two ways forward, and **the first is better**:

1. **Re-run it.** A missing date nearly always means the embed did not answer,
   which is usually transient. Run it again before doing anything else.
2. **Ask what day it was posted** and put the date on the line:

   ```
   https://www.instagram.com/p/DcHwSuzCUYq/   2026-08-16
   ```

   A date given this way is only used when the post's own could not be read. It
   never overrules a real one.

**Do not make one up, and do not use today's date to get the run finished.**

## Step 4. Confirm before writing

**Always show the posts and wait for a yes.** This is a required step, not a
courtesy. Show the caption's first line, because that is what a screen reader
announces, and say which source answered, because og tags mean no date and a
lower quality picture.

```
1. DcHwSuzCUYq   image      16 Aug 2026   via embed json
   "Sunday morning. All are welcome, every week."

2. DcEDXxvjLJW   video      14 Aug 2026   via embed json
   "Baptism Sunday. Six of them."

3. Db1vWdDCXWb   carousel    9 Aug 2026   via embed json
   "Serve day in Metairie."

! DbRvCcwCTzI   held back, no date. Which Sunday was this one?

Write it?
```

**Every `!` line is a question, not a footnote.** Do not write a set with one
still unanswered. Re-run Step 2 with the answer rather than editing
`/tmp/ig.json` by hand, so what gets published is what actually came back.

## Step 5. Write it

```bash
python3 scripts/hc_supabase.py upsert instagram_posts /tmp/ig.json
```

The id is the post's **shortcode**, the `DcHwSuzCUYq` out of the permalink, so
running this again over the same post updates it rather than adding a second
one. That is a deliberate departure from `0015`, which specifies Instagram's
numeric media id: the shortcode does the same job and is the only id anybody
has without the API. The script's header says so too, so the two do not drift.

**The five demo rows upgrade themselves, and nothing needs deleting.**
`demo-instagram/seed-demo-posts.sql` keyed its rows by the same shortcodes,
because those five permalinks are real; what was invented is the captions,
which describe the photographs rather than saying what the church wrote, and
the dates, which were chosen only to fix the left to right order. So running
this command over those same five links replaces all of it with the real
thing, in place, on the same ids:

```
DcHwSuzCUYq  DcEDXxvjLJW  Db1vWdDCXWb  DbRvCcwCTzI  Da_oiYwiYeA
```

**Doing that once is the best first run of this command**, and it is worth
offering: it turns five rows of stand-in text into five true ones without
touching anything else.

The only leftovers are the five hand named pictures in the bucket,
`01gathering.jpg` through `05ridgewood.jpg`. Nothing points at them once the
rows carry `DcHwSuzCUYq.jpg` and the rest, and they are a few hundred KB
against a 1 GB free tier, so they can be tidied from the Storage browser
whenever or left alone.

## Step 6. Keep the rail short

The rail draws every published row, and it scrolls, but a rail of forty posts
is a different thing from a rail of nine. Nine was the number `0015` had in
mind. After writing, unpublish anything past the newest nine:

```sql
update public.instagram_posts set published = false
where id not in (
  select id from public.instagram_posts
  order by posted_at desc limit 9
) returning id;
```

Unpublished rather than deleted, so a post can come back without being fetched
again. **A post the church actually deleted from Instagram is different**: take
that row out properly, because the tile would otherwise open a dead link.

## Step 7. Read it back, then say what happened

```bash
python3 scripts/hc_supabase.py select instagram_posts --order posted_at.desc \
  --limit 10 --columns id,media_type,posted_at,image_path,published
```

Two or three lines and stop, no postamble:

```
Published  3 posts, newest 16 August
The rail shows on Connect the next time the app is opened
```

**If anything was held back, say so on its own line** rather than letting
"published" imply the week is complete:

```
Published  3 posts, newest 16 August
DbRvCcwCTzI is not up, nothing would give a date for it
```

## What not to do

- **Do not edit `js/data.js`.** It is the cold start seed, a frozen snapshot.
  `instagramPosts` is `[]` there on purpose. Posts written there show up for
  nobody and put the rail in two places.
- **Do not put an instagram.com URL in `image_path`.** It is an object path in
  the bucket. Their CDN links expire and pointing phones at them hands Meta
  every congregant's IP.
- **Do not go looking for a way to list the account's posts.** Every route
  needs either a credential the church will not create or a scraper that breaks
  every few weeks. The links are the input to this command, by design.
- **Do not log in as the church to fetch anything.** Everything here reads what
  Instagram publishes to anybody. Scraping while signed in as the church puts
  their account at risk, and it buys nothing this command needs.

---

**This reaches phones on its own.** Connect reads `HC.data.instagramPosts`, and
`js/content.js` fills that from the `instagram_posts` table on every app open.
So posts written here show up on the next open, with no App Store build, no
`?v=` bump in `index.html`, and no matching edit in `js/data.js`.
