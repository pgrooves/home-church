# Turning on the Instagram rail

The rail across the top of Connect is already built and already shipped. It
shows nothing because `instagram_posts` has no rows in it. This is how you get
rows into it. (That was true when this page was written. Where things stand
now, and what happened in October 2026, is at the end.)

**Everything below is free.** There is a section at the end listing every place
a cost could appear and why none of them do. If at any point something asks for
a credit card, stop and read that section, because you have wandered off this
path.

Total time, once you sit down to do it: **about twenty minutes**, most of it
waiting on Meta's dashboard to load.

---

## Step 1. Make the Instagram account Professional

Instagram serves no API at all to a Personal account. This is the one hard gate.

On the phone that is logged in to **@homechurch.nola**:

1. Profile → the three lines, top right → **Settings and privacy**
2. **Account type and tools** → **Switch to professional account**
3. Category: **Religious Organization**
4. When it asks Creator or Business, choose **Creator**

**Choose Creator, not Business.** Both work identically for this. The
difference is that Business accounts lose access to a chunk of Instagram's
commercial music library in Reels, because that catalog is licensed for
personal use only. Creator accounts keep much more of it. If the church posts
Reels with worship or popular tracks, Business will quietly break that and
nobody will connect it to this change months later.

**What this does not do:** it does not lose followers, posts, DMs, or the
handle. It is a setting, not a migration. Publicly the profile looks the same
apart from an optional category label, which can be switched off. It is
reversible from the same menu at any time.

**What it does do:** insights start from the switch date, with nothing
retroactive. That is a gain over Personal, which has none.

---

## Step 2. Create a Meta app

At **developers.facebook.com**, signed in as whoever administers the Instagram
account.

1. **My Apps** → **Create App**
2. When it asks what you are building, pick the option about **Instagram** /
   accessing Instagram data. Meta renames these boxes constantly, so match the
   intent rather than the exact wording.
3. Name it something like `Home Church App`. Nobody sees this but you.
4. In the app, add the **Instagram** product, and choose **API setup with
   Instagram login**.

**Leave the app in Development mode.** Do not submit it for App Review, and do
not start business verification. Both exist so an app can read *other people's*
Instagram accounts. We are only ever reading the church's own account, and a
development-mode app can do that indefinitely. Review is where the time and the
paperwork live, and we do not need it.

---

## Step 3. Add the church account and generate a token

Still in the Instagram product settings:

1. Find the section for **Instagram testers** or **connected accounts** and add
   **@homechurch.nola**.
2. Accept the invitation from the Instagram side: on the phone, Settings →
   **Apps and websites** → **Tester invites** → accept.
3. Back in the dashboard, **generate an access token** for that account.

You will get a long string starting with `IG`. That is the whole key.

**Do not paste that token into a chat, an email, or a file in this repo.** Put
it straight into Supabase, from the SQL Editor (dashboard → **SQL Editor** →
**New query**):

```sql
select public.hc_instagram_save_token('IGAA...the whole token...');
```

It answers `stored`, and the token is in the vault. Then delete the line from
the editor, so the token is not left sitting in a saved query.

**Not as an Edge Function secret**, which is what this page used to say. The
token lasts sixty days from its last renewal and the sync renews it every week,
and a function cannot write its own secrets, so it lives in the vault, which
the sync can write (migration `0092`).

If it does leak, it can read the church's own public posts and nothing else, and
you can invalidate it by regenerating. Still, treat it like a password.

---

## Step 4. Nothing: the sync is already built

The hourly job picks the token up on its next run, at 23 minutes past the hour.
To check, in the SQL Editor:

```sql
select public.hc_instagram_status();
```

`api_token_stored` should have a date in it, and after the next run
`latest_via` should say `the Instagram API`. What the sync does with the token:

- reads the newest 25 posts from `graph.instagram.com/me/media`, with their real
  dates, captions and pictures, and an album's first slide as its picture,
- mirrors each new picture into the `instagram` Storage bucket and writes its
  row into `instagram_posts`, keyed by the same numeric media id as every row
  already there,
- renews its own token every week, well inside the sixty days it lasts,
- refuses a token generated for some other account,
- and if the API fails, carries on through the crawler routes it ran on before,
  noting why in that run's `note`, so a lapsed token costs a new token, not the
  rail. If those fail too, the six-hour alert below leads with the token.

**Not built: taking a post off the rail when it is deleted on Instagram**, which
this page used to list and which Meta's terms ask of an API app. Until it is,
hide one by hand. A hidden row stays hidden, and the sync never brings it back:

```sql
update public.instagram_posts set published = false
 where permalink = 'https://www.instagram.com/p/SHORTCODE/';
```

**None of that needs an App Store build.** The app already reads the table, and
every phone that has the app sees the change on its next refresh.

---

## Why it is free, in full

| Thing | Cost | Why |
|---|---|---|
| Meta developer account | $0 | Free to create |
| Meta app, Development mode | $0 | Only App Review and business verification carry friction, and we skip both |
| Instagram API calls | $0 | No paid tier. Rate limit is ~200/hour; hourly sync uses 1 |
| Supabase Edge Function | $0 | ~720 runs/month against a free-tier allowance in the hundreds of thousands |
| Supabase Storage | $0 | 9 images, well under 1 MB, against a 1 GB free tier |
| Bandwidth to phones | $0 | Images are content-addressed and cache on the device; nowhere near the 5 GB free tier |
| App Store build | $0 | Not needed. This is all backend |

**Signs you have wandered onto a paid path.** Any of these means stop and
re-read the steps above:

- Something asks for a credit card or billing details.
- You are being walked through **App Review** or **Advanced Access**.
- You are being asked for **business verification** with documents.
- You have landed on a third-party feed widget (Behold, EmbedSocial,
  SnapWidget, Elfsight, rss.app). These are real products, they cost $8–50 a
  month, and they do the same one-time account connection anyway. There is no
  reason to pay one here.

---

## Step 1 was a dead end, and `/new-posts` is what happened instead

**This may have changed.** In October 2026 Instagram's own error for the
account named a business category, and only a Professional account has one. On
the phone: Settings and privacy → **Account type and tools**. If it offers
**Switch to personal account**, the account is Professional already, Step 1 is
done, and Steps 2 and 3 are all that stand between the rail and the API.

The church declined to switch to Professional, so the automatic sync above is
not available. **`/new-posts` is the fallback, it is built, and it is what to
use.** Paste the links to the posts that should be on the rail; it fetches each
picture and caption, mirrors the bytes into the same bucket, and writes the
same rows. Read `.claude/commands/new-posts.md` for it.

What that costs is somebody opening Instagram on a Sunday and copying a few
links. What it buys is that nothing here needs a token, an app, a review, or a
setting changed on the church's account.

### Why the listing is the gate, and the rendering is not

Worth understanding before anybody goes looking for a better answer, because
the two halves of this problem have completely different answers:

- **Listing an account's posts** without credentials does not work. Logged out
  instagram.com serves a login wall, datacenter IPs are refused on the first
  request, and Instagram rotates the GraphQL ids behind its own web app every
  few weeks. A scraper is not hard to write; it is hard to keep alive.
- **Rendering a post you already have the link for** got easier. Since **15
  June 2026** Meta's oEmbed endpoints take no access token, no app and no App
  Review for public content, and the embed page and the og: tags were always
  public. That is the whole mechanism `/new-posts` runs on.

So the command takes links as input because that is precisely the step no free
and durable method covers. Note that tokenless oEmbed no longer returns
`thumbnail_url`; Meta's own guidance is to read the post's `og:image`, which is
what the script does.

### The other routes, and why not

1. **A scraping service** (Apify and similar). **The $20–50/month this file
   used to quote here is out of date** — these are pay-per-result now, roughly
   $0.50–$2.30 per *thousand* posts, with free monthly credit that a daily sync
   of nine posts fits inside. Cost is no longer the objection. It still
   violates Meta's terms, still needs an account and a token, and still puts a
   third party between the church and its own pictures.
2. **A feed widget** (Elfsight, SociableKIT and similar), $6–25/month. They
   render from their servers or from Instagram's CDN, which breaks the two
   rules this rail was built on: phones never talk to Meta, and the bytes are
   mirrored because the CDN links are signed and expire.
3. **Leave the rail off.** It renders nothing and costs nothing. Still a real
   option, not a failure state.

**Never log in as the church to fetch any of this.** Everything `/new-posts`
reads is what Instagram publishes to anybody. Scraping while signed in as the
church risks their account and buys nothing.

### If the church ever does switch

Store the token (Step 3) and the hourly sync reads the API ahead of everything
else; `/new-posts` stays for adding a post by hand. The ids need nothing: every
row is keyed by Instagram's numeric media id, as `0015` specifies, and the API
route derives that same id from each post's permalink rather than using the
API's own.

---

## The state of things as of this writing

**The rail is live.** It carries the church's recent posts, mirrored from its
own Instagram, with real captions and the posts' own timestamps. Nothing on
this page is pending any more except a token for the API sync, which the rail
runs without but would be sturdier with.

Built, merged, and live in Supabase:

- `instagram_posts` table, with public read and no write policy
- the public `instagram` Storage bucket
- the rail on Connect
- migrations `0015_instagram_posts.sql`, and `0013`/`0014` which fixed the
  Instagram handle from `homechurchnola` to `homechurch.nola` and added X and
  TikTok to the Profile links

**It keeps itself current.** `hc_sync_instagram(9)` runs every hour at :23
(migration `0061` scheduled it every six hours, and `0070` made it hourly). It
finds the account's newest posts, skips the ones already stored, and mirrors
the rest, with nobody opening Instagram at all.
`select cron.unschedule('hc-instagram-sync');` turns it off.

Where it finds them, in order: the official API once a token is stored (Step
3), then the pages of the three newest posts already on the rail, then the
public profile JSON, then the profile page.

That is possible because the claim this page was built on turned out to be
half wrong. Listing an account's posts without credentials does not work *for
a browser*. Asked as a link preview crawler, a profile page is a document
listing about a dozen recent posts, and a post page lists two dozen others
from the same account, each carrying its numeric media id. An id is a
shortcode written in a different base, so it converts straight to a link with
no request at all. What those pages do not carry is the date, so each
discovered link is fetched for its own page.

**Why three doors, and an alert.** From 13 September Instagram refused
crawlers the profile page, so the sync found new posts through one door, the
newest stored post's page. On the morning of 15 October the church deleted or
archived that post. Its page turned into the empty app, every hourly run
failed, and nobody knew for three and a half days, until a post was noticed
missing from Connect. Three posts had gone up in the meantime; they were
caught up on the evening of 18 October. Since then:

- any of the three newest stored posts will do as the door, and the API, once
  it has a token, needs no door at all;
- a run that leaves a post behind counts as failed, and the next run goes back
  for anything it finds from the last 30 days that is not on the rail, rather
  than only for posts newer than the newest one stored;
- `hc_instagram_watch` (migration `0092`, hourly at :53) sends one push to the
  admins' phones after six hours without a good run, between 8am and 8pm in
  Chicago, reminds them every three days while it lasts, and sends one more
  when it is working again;
- `select public.hc_instagram_status();` is the whole picture in one row: when
  it last worked, how, what the latest run said, and whether the admins have
  been told.

Every run is recorded in `instagram_sync_runs` (`0062`): whether it worked,
where it found the posts (`via`), how many it found and wrote, `error` when it
failed, and `note` when it got there by working round something.

Two ways to fill it by hand as well, both reading what Instagram serves a link
preview crawler, neither needing a token:

- **From a phone**, `select public.hc_fetch_instagram(array[...])` in the SQL
  editor. `supabase/functions/instagram-fetch/` (`index.ts`, with the run in
  `sync.mjs` and the parsing in `parse.mjs`, under
  `tests/instagram-fetch.test.js`) plus migrations `0059` and `0060`. This is
  the one that works from anywhere, because the service
  role key is injected into the function and the upload happens where the key
  already is.
- **From a laptop**, `/new-posts`, wrapping `scripts/fetch_instagram_posts.js`,
  with `tests/instagram-posts.test.js` over its parsers. Better when somebody
  is at a keyboard: it confirms before writing and can be re-run offline.

They share an extraction and it is deliberately duplicated rather than shared,
because one is Node and the other is Deno on a different machine. **If one is
changed, change both.** The load bearing line in each is the crawler
User-Agent.

**Built, and waiting on a token: the API sync** (Steps 2 to 4). Since 15
October it is the one route that does not depend on what Instagram shows a
stranger, which makes it worth the twenty minutes.

**One correction to `0015` and to the demo seed, which both say `posted_at`
only sorts the rail.** It does not: `js/screens/connect.js:608` reads it into
each tile's `aria-label`, so it is never drawn on screen and it is read aloud.
That is why `/new-posts` holds a post back rather than publishing it under a
guessed date, and why the demo rows' invented dates are worth replacing with
real ones.
