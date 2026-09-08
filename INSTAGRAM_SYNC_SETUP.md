# Turning on the Instagram rail

The rail across the top of Connect is already built and already shipped. It
shows nothing because `instagram_posts` has no rows in it. This is how you get
rows into it.

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
it straight into Supabase:

> Supabase dashboard → **Edge Functions** → **Secrets** → new secret
> named `INSTAGRAM_ACCESS_TOKEN`, value pasted in.

If it does leak, it can read the church's own public posts and nothing else, and
you can invalidate it by regenerating. Still, treat it like a password.

---

## Step 4. Come back and say so

Open a session in this repo and say:

> The Instagram account is Professional and `INSTAGRAM_ACCESS_TOKEN` is set in
> Supabase. Build the sync.

That is genuinely all the information needed. What gets built then:

- an Edge Function that reads the latest 9 posts,
- mirrors each image into the `instagram` Storage bucket that already exists,
- writes rows into `instagram_posts`, which already exists,
- deletes rows for posts removed from Instagram, which Meta's terms require,
- refreshes its own token before the 60-day expiry,
- plus one `pg_cron` line to run it hourly.

**None of that needs an App Store build.** The app already reads the table. The
rail appears on every phone that already has the app, on its next refresh.

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

Build the sync in Step 4 and it supersedes the command. One thing to carry
across: `/new-posts` keys rows by the post's **shortcode**, since that is the
only id available without the API, while Step 4 and migration `0015` specify
Instagram's numeric media id. Migrate the ids in one pass rather than letting
both conventions sit in the table.

---

## The state of things as of this writing

Already built, merged, and live in Supabase:

- `instagram_posts` table, with public read and no write policy
- the public `instagram` Storage bucket
- the rail on Connect, which renders nothing while the table is empty
- migrations `0015_instagram_posts.sql`, and `0013`/`0014` which fixed the
  Instagram handle from `homechurchnola` to `homechurch.nola` and added X and
  TikTok to the Profile links

Also built, and what actually fills the rail today:

- `scripts/fetch_instagram_posts.js`, links in, rows and mirrored pictures out
- `.claude/commands/new-posts.md`, the `/new-posts` command around it
- `tests/instagram-posts.test.js`, its parsers, against fixtures and no network

Not built: the API sync. That is Step 4, and it stays unbuilt while the account
is Personal.

**One correction to `0015` and to the demo seed, which both say `posted_at`
only sorts the rail.** It does not: `js/screens/connect.js:599` reads it into
each tile's `aria-label`, so it is never drawn on screen and it is read aloud.
That is why `/new-posts` holds a post back rather than publishing it under a
guessed date, and why the demo rows' invented dates are worth replacing with
real ones.
