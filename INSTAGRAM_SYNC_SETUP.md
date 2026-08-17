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

## If Step 1 is a dead end

If the account cannot be switched to Professional, the automatic sync is
impossible. Instagram publishes no credential-free feed, and scraping the public
page does not survive contact with a datacenter IP, which is what a Supabase
function runs on.

The fallbacks, in order of how much they cost you:

1. **A scraping service** (Apify and similar), roughly $20–50/month. Works, is
   against Meta's terms, and breaks when Instagram changes their markup.
2. **A manual command** — a `/new-post` slash command like the ones this repo
   already has for guides and events. Free, but somebody runs it every week.
3. **Leave the rail off.** It renders nothing and costs nothing. This is a real
   option, not a failure state.

---

## The state of things as of this writing

Already built, merged, and live in Supabase:

- `instagram_posts` table, with public read and no write policy
- the public `instagram` Storage bucket
- the rail on Connect, which renders nothing while the table is empty
- migrations `0015_instagram_posts.sql`, and `0013`/`0014` which fixed the
  Instagram handle from `homechurchnola` to `homechurch.nola` and added X and
  TikTok to the Profile links

Not built: the sync. That is Step 4.
