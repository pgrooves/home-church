# Security posture, and the three things still open

Checked on 22 September 2026, against the live project (`ibqkumxfltfiuqevviji`)
rather than against the migrations alone, because the two can drift and only one
of them is what a stranger actually reaches.

This file exists for the version of you who comes back in six months, sees a
linter warning with the word SECURITY next to it, and has to decide in ten
minutes whether it is an emergency. Most of them are not, and the reasons are
written down here so they do not have to be worked out twice.

---

## The first thing to understand, before any of the rest

**The repository being public is not the attack surface.**

The app ships with the Supabase URL and the publishable key inside it. Anyone
who downloads Home Church from the App Store can pull both out of the bundle in
about five minutes with free tools. That is not a flaw, it is how the key is
designed to work, and `js/config.js` says so at the top.

What follows from it is the part worth keeping: **every endpoint a stranger
could find by reading this repository, they can find by downloading the app.**
Making the repository private would hide the source, and would not close a
single door. The doors are held shut by row level security and by the checks
inside each function, which is where the effort has gone and where it should
stay.

So: private is tidying, not defence. Do it when it is convenient, not because
it is load-bearing. See "If the repository ever goes private" below, which is
about what breaks, not about what it protects.

---

## What was verified, and what it means

**Supabase's own security advisor reports no findings at ERROR level.** The
warnings it does report are below, each with what it is and why it is or is not
a problem here.

### The 22 admin functions, every one of them gated

The advisor flags that any signed-in account can *call* `hc_admin_*` over the
REST API. That is true and it is the expected shape: these are `security
definer` functions, and the protection is the check on the inside, which the
advisor cannot see.

All 22 were audited by hand. Twenty-one call `hc_is_admin()` in the body. The
twenty-second, `hc_admin_display_name`, does not — because it is revoked from
every client role and is only reachable from other functions. It reads
`auth.users.email`, so that revoke is doing real work. Both answers are correct.
Nothing is missing a lock.

**If you add another `hc_admin_*` function, it needs one of those two things:**
an `hc_is_admin()` check in the body, or a revoke from `anon` and
`authenticated`. A function with neither is a privilege escalation, and it will
not look like one in the advisor output, because the advisor already flags all
49 of them the same way.

### The four tables with RLS on and no policies

`group_filter_terms`, `group_join_attempts`, `instagram_sync_runs`, `push_log`.

The advisor reports this at INFO because it is *sometimes* a mistake. Here it is
deliberate: each one revokes everything from `anon` and `authenticated` and
grants only to `service_role` (see `0056_group_join_throttle.sql`, lines 87-90,
for the pattern). RLS enabled with no policy is deny-all. That is the most
closed a table gets. Leave them alone.

### Leaked password protection is disabled

A real warning, and the smallest one on the list. It checks passwords against
HaveIBeenPwned at signup and password change. The only two password accounts in
this project are the Apple review accounts in `js/config.js`. Turn it on, but
see the timing note below — not while a build is in review.

### The rest, which held up

- **`send-push` runs without JWT verification** and proves itself with a
  dedicated shared secret compared in constant time. The blast radius is
  deliberately small: a leak of that secret sends spam, it does not reach the
  database. See the header of `supabase/functions/send-push/index.ts`.
- **The contact form** caps at five an hour per sender, with hard length limits
  (120 / 200 / 4000), a honeypot, and the sender recorded as a peppered SHA-256
  of the IP that is not reversible to an address. The pepper lives as a function
  secret, never in this repo.
- **Group room codes** are six digits, which is only enough because of the
  throttle: ten misses an hour, wrong guesses not stored, codes dead by the end
  of the evening.
- **Storage** — the `announcements` bucket carries a file size limit, a MIME
  allowlist, and admin-only write. Public read is only on buckets whose contents
  the church already published.
- **No secret has ever been committed.** The full history was grepped for
  `service_role`, `sb_secret`, and the JWT header prefix. Every hit is prose or
  SQL grant text.

### The scheduled jobs are actually scheduled

Worth its own heading, because this is the one that fails silently.

Several migrations schedule `pg_cron` jobs and are written to *print a notice
and carry on* if `pg_cron` is unavailable, rather than to fail. That is the
right call for a migration and it means a missing scheduler would never announce
itself. The privacy policy promises group rooms are gone at 90 days and contact
messages at 180, so a scheduler that quietly never ran would put the app in
breach of its own published policy with nothing on fire.

All seven jobs exist and are active:

| Job | Schedule |
| --- | --- |
| `hc-push-tick` | hourly |
| `hc-purge-group-rooms` | daily, 09:00 UTC |
| `hc-purge-contact-messages` | daily, 09:20 UTC |
| `hc-newsletter-intake` | every 20 minutes |
| `hc-announcement-dedupe` | every 5 minutes |
| `hc-event-dedupe` | every 5 minutes, offset |
| `hc-instagram-sync` | hourly, at :23 |

**Re-check this after any project restore, migration replay, or plan change**,
with `select jobname, schedule, active from cron.job order by jobname;`. Two of
those rows are the retention promises in the privacy policy.

---

## The three open items, and when each becomes safe

None of these require an App Store resubmission. None of them touch the binary.
What they do touch is the live backend, and **the backend under review is the
production backend** — there is no separate review environment, so a reviewer
holding build 16 is using the same database and the same settings these items
would change.

Submission 1.0 (8) was rejected on 17 September because the reviewer could not
sign in. That is the failure mode to keep in mind below.

### 1. Auth rate limits — look now, change later

Anyone can type any address into the sign-in screen and cause mail to be sent.
Two ways that hurts: one person's inbox buried in codes, or the church's email
allowance spent so real people cannot sign in on a launch Sunday.

Supabase, Authentication → Rate Limits. `LAUNCH_TODO.md` notes a default of 30
an hour on newly connected SMTP.

*Looking* is free at any time. *Changing* it while a build is in review is not,
even though the review accounts use passwords and never trigger an email at all.
The sign-in screen has already cost one rejection; do not touch it while
somebody is standing on it.

### 2. Leaked password protection — after the build clears

One toggle, Authentication → Providers → Password. Thirty seconds.

The riskiest of the three to do early, for a reason specific to this project:
the review accounts sign in *with a password*, which is the entire reason they
exist. Adding a new check to the password path while a reviewer is on the
password path, to fix a warning about two throwaway Outlook accounts, is a bad
trade at any odds.

### 3. A rate limit on `hc_register_device_token` — after the build clears

The one place a stranger can write to the database without an account. That is
intentional and it is a privacy feature: it is why notification tokens are
anonymous and carry no identity, which is what the privacy policy promises.

The cost of it is that the endpoint takes junk. The realistic damage is rows in
a table, since APNs rejects invalid tokens anyway, so this is a tidiness item
rather than an urgent one. The natural shape is the contact form's: a count over
a window, refusing past a generous limit.

A migration against the live project while a reviewer's phone might be
registering for notifications is a feature broken mid-review to fix junk rows.
It waits.

---

## The `frame-src` line, which is free on the next build and expensive after

`index.html` names the hosts the app may frame, and it ships inside the binary:

```
frame-src https://www.youtube.com https://player.vimeo.com https://pgrooves.github.io https://ibqkumxfltfiuqevviji.supabase.co;
```

`app_settings.home_embed_base` (migration `0066`) exists so the video wrapper can
move without a submission — but only to a host already on that list. Today the
list contains a personal GitHub account. Rename the repository, change the
username, lose the account, or go private without a paid plan, and every YouTube
player in every installed copy goes quiet, with a new submission as the only fix.

**Adding a second host costs one line and changes no behaviour.** A host on the
list that nothing points at is a permission, not an instruction. Something like
`embed.homechurchnola.com`, on a domain the church owns, alongside the github.io
entry rather than replacing it.

It cannot go on a build that is already in review. It is free to add to whatever
the next build is — 1.0.1, or the fix build if this one comes back. Do not spend
a review cycle on it by itself.

Files that would change: `index.html`, and the expectations in
`tests/featured-video.test.js`.

---

## If the repository ever goes private

Not a security matter, which is the point of the first section. It is a
breakage matter, and there are three things to handle first.

GitHub Pages does not serve private repositories on the Free plan. Making this
repository private on the current plan takes the Pages site down, and with it:

1. **`embed.html`** — video in every installed copy, as above.
2. **`legal/privacy.html`** — the Privacy Policy URL in App Store Connect.
   Apple checks this one.
3. **`legal/support.html`** — the Support URL in App Store Connect.

So: either GitHub Pro, which keeps the current URLs working and changes nothing
else, or move the three files to a host that serves private repositories for
free, which needs the `frame-src` line above to have shipped first.

**Never do it while a build is in review.** The reviewer will very likely open
the privacy policy URL.
