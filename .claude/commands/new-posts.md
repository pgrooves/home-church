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

**This command needs a real machine. There is a second route that does not,
and from a phone it is the one to use.**

The reason is Storage, and only Storage. `ACCESS.md` is explicit: no MCP tool
reaches a bucket and the script has no upload verb, so a web session can write
the row and not the picture, and a row without its picture is one Connect
drops. So if `.env` is not at the repo root, **do not run this command** and
do not write rows whose pictures never made it.

Use the Edge Function instead, which puts the picture where the service role
key already is:

```sql
select public.hc_fetch_instagram(array[
  'https://www.instagram.com/p/DcHwSuzCUYq/'
]);
-- then, a moment later, the reply:
select status_code, content from net._http_response where id = <the id above>;
```

It does the same job as everything below and reports per post what it wrote
and what it skipped. `supabase/functions/instagram-fetch/index.ts` and
migrations `0059`/`0060` are the whole of it, and it runs from the SQL editor,
which works on a phone.

**A note on a claim this file used to make.** It said Instagram refuses
datacenter IPs, and that is wrong: it refuses *browsers* it does not want to
serve. Asked as a link preview crawler, which is what both the script and the
function do, Instagram served a datacenter IP and Supabase's Deno Deploy the
complete post. Worth re-testing occasionally, since one clean run is not proof
it holds forever, but it is not a reason to reach for a laptop.

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
back so say which, `1` nothing was written so do not publish.

> **The extraction has never run against a real post.** Everything downstream
> of it is tested and everything around it is confirmed, but the two shapes it
> looks for in a page, the media blob and the embed markup, were written from
> how Instagram has served these pages historically and could not be checked
> from a web session, because a web session only ever gets the empty shell. So
> **expect the first run on a laptop to need one round of selector fixing**,
> and use `--save-html` on that run so it is a ten minute job rather than a
> guessing game. Once it has worked once, delete this paragraph.

### The three ways it fails, which need three different fixes

**"Instagram sent a page with no post in it, only its own JavaScript."**

You are on a datacenter IP. Instagram answers `200` with about 600KB that is
80% script, no `og:` tags, and not one mention of the account: the post is
fetched later by code that never runs here. This is confirmed behaviour, not a
guess — it is what a web session gets every time, and it is why Step 0 says to
run this from a laptop. Nothing to fix in the script. Move to a normal
connection.

**"The page had a post in it but nothing matched."**

The opposite failure, and the more interesting one. Instagram sent real
content and the selectors did not recognise it, which means they have renamed
something. Re-run with `--save-html DIR`, keep the file, and hand it to a
session: fixing a selector against a real page is a ten minute job, and
guessing at one without the page is how this breaks twice.

```bash
node scripts/fetch_instagram_posts.js --dry-run --save-html /tmp/ig < links.txt
```

**"The Graph API declined to embed it."**

**This one means nothing on its own, and the wording is a trap.** Meta's
literal text is "The requested media is private", and it says that about
`@homechurch.nola`, which is a public account anyone can read in a logged out
browser. The likeliest reading is that the Graph API will not embed posts from
accounts that are not Professional, which is every account this command exists
to serve. **Do not send anybody to change a privacy setting on the strength of
it.** Open the post in a private browser window and see for yourself.

### One thing worth asking before the first run

The `instagram` bucket is public-read by design (`0015` section 6), so a
picture mirrored into it is reachable by anyone with the URL, not only by the
app. For posts the church already published to the open internet that changes
nothing. It is worth a sentence to whoever runs the account anyway, because
"it is on our Instagram" and "it is on a public URL with no login at all" are
not quite the same promise.

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

The id is Instagram's **numeric media id**, `3965350390354495018` and the
like, exactly as `0015` specifies. It comes out of the media object on the
page, so re-running over the same post updates it rather than adding a second
one, and rows written here are the same rows a future API sync would write.

**A post that came back without a media object has no id and no date, and is
held back rather than keyed on its shortcode.** One table with two id
conventions in it is worse than a rail that is one post short this week. An
earlier draft of this command did key on shortcodes; that is why the five
demo rows were keyed that way, and why they had to be deleted rather than
updated when the real ones arrived.

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
