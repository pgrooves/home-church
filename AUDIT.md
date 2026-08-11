# Home Church, structural audit

Written against commit `f4f28ef`, branch `claude/home-church-app-store-launch-ikiv5v`,
on August 11, 2026. Every claim below was checked against the files in this
repository or against the live Supabase project, not against the README.

Where the README and the code disagree, this document follows the code. Where
the code and the live database disagree, it follows the database and says so.

-----

## 1. File inventory

### Root

| File | Purpose | Notes |
|---|---|---|
| `index.html` | Entry point. Meta tags, font link, ordered classic script tags. 76 lines. | Every local asset carries `?v=6`. Load order is load bearing. |
| `manifest.webmanifest` | PWA manifest. Name, icons, `display: standalone`, portrait. | Irrelevant to the App Store build, harmless to keep for the web version. |
| `README.md` | Developer documentation. 18KB. | Contains the `profiles` table SQL that was never run. See section 4. |
| `NEW_GUIDE_PROCESS.md` | The full guide authoring spec, voice rules, section quotas. | Source of truth for `/new-guide`. |
| `NEW_PODCAST_PROCESS.md` | Weekly episode matching and retitling process. | Source of truth for `/new-podcast`. |
| `Home Church app design system.md` | 24KB. Palette, type, components, screen specs. | The constraint document. |
| `.env.example` | Template for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. | `.env` itself is gitignored and absent here. |
| `.gitignore` | Excludes `.env*`, generated seed JSON, scratch files, OS noise. | Correct. |
| `.mcp.json` | Points the Supabase MCP server at `https://supabase.com`. | Used by the slash commands from a phone. |

### `css/` (2,292 lines total)

| File | Purpose |
|---|---|
| `tokens.css` (124) | Custom properties only. Palette, type scale, spacing, shape, motion, chrome. Light `:root` plus `:root[data-theme="dark"]`. No selectors beyond those two. |
| `base.css` (232) | Reset, the fixed app frame, type primitives (`.hc-display-*`, `.hc-body-serif`, `.hc-eyebrow`, `.hc-caption`), safe area padding on `.hc-screen`, utilities, the reduced motion block. |
| `components.css` (999) | Top bar, tab bar, buttons, cards, rows, sections, checks, quote cards, media and cover blocks, switches, pills, forms, banners, toast, empty states. |
| `screens.css` (635) | Per screen layout only. Home, Listen, Guide reader, Present, Connect, Give, Profile, Leader. |
| `print.css` (302) | `@media print` sheet used by `js/print-guide.js`. Hides the app, shows the generated pages. |

### `js/` (5,977 lines total)

| File | Purpose |
|---|---|
| `data.js` (2,345) | Frozen cold start seed. The whole catalogue as plain objects, shaped like the API response. Exports `HC.data` with the arrays plus ~18 helper functions (`latestGuide`, `guideMeta`, `guideTitle`, `sermonsByDate`, `episodeUrl`, and so on). |
| `store.js` (344) | `localStorage` wrapper with an availability probe, the app state object, a tiny pub/sub, profile, guide checkmarks and journal, dismissed banners, roster, prayers, theme and text scale application. |
| `config.js` (30) | `HC.config.SUPABASE_URL` and `SUPABASE_ANON_KEY`. Currently filled in and pointed at a live project. |
| `auth.js` (348) | OTP sign in over Supabase's HTTP API with `fetch`, no SDK. Session storage and refresh, identifier classification (email or phone), profile push and pull. |
| `content.js` (552) | The three layer content strategy. Cache, then bundled seed, then network. Table specs, snake to camel mappers, in place array mutation, cache read and write, a change fingerprint, and the post paint refresh. |
| `components.js` (409) | HTML string builders and shared helpers. `esc`, date formatting, `openExternal`, `bibleUrl`, the icon set, `sectionHeader`, `quoteCard`, `checkRow`, `button`, `card`, `row`, `collapsible`, `emptyState`, `media`, `cover`, `toast`. |
| `print-guide.js` (226) | Builds a paginated print sheet for one guide, appends it to the body, calls `window.print()`. |
| `router.js` (147) | In memory route state plus `history.pushState`. Query string routing, scroll memory, aliases. |
| `app.js` (606) | Boot, the shell markup, the route table, the `actions` map, three delegated listeners (click, input, submit), the theme media query watcher. |

### `js/screens/` (1,364 lines)

| File | Purpose |
|---|---|
| `home.js` (196) | Greeting, next gathering card, this week's guide card, one announcement, reading plan row. |
| `listen.js` (168) | Latest message, current series hero, archive grouped by series with in place episode notes, the show card. |
| `guide.js` (330) | Guide index grouped by series, the six section reader, and presentation mode. |
| `connect.js` (207) | Your group, group finder with day and neighborhood filters, serve teams, events, next step forms. |
| `give.js` (38) | One paragraph, one button to Overflow. |
| `profile.js` (308) | Sign in block, identity form, address row, notification switches, display preferences, leader mode toggle, help and about. |
| `leader.js` (125) | This week card, roster with attendance and private notes, prayer request capture. |

### `supabase/`

| File | Purpose |
|---|---|
| `README.md` | Full CMS documentation. |
| `ACCESS.md` | Which transport the slash commands use, script versus MCP. |
| `migrations/0001_content_cms.sql` (358) | `series`, `guides`, `podcasts`, `events`. Tables, indexes, `updated_at` triggers, RLS, grants. |
| `migrations/0002_optional_migration_runner.sql` (50) | `hc_exec_sql`, service role only. **Not applied to the live project.** |
| `migrations/0003_announcements.sql` (85) | `announcements`. |
| `migrations/0004_reading_plans.sql` (123) | `reading_plans`. |
| `migrations/0005_groups.sql` (123) | `groups`. |
| `migrations/0006_church_config.sql` (237) | `serve_teams`, `next_steps`, `church_profile`, `podcast_show`. |
| `migrations/TEMPLATE_new_content_type.sql` (88) | Scaffold for `/new-content-type`. |

### `scripts/`

| File | Purpose |
|---|---|
| `hc_supabase.py` (516) | Standard library Python client for the publishing commands. Needs `.env`. |
| `export_seed.js` (284) | Regenerates seed JSON from `js/data.js`. |

### `assets/`

`icons/`: `favicon.png` 64x64, `apple-touch-icon-180.png` 180x180, `icon-192.png`,
`icon-512.png`, `mark.png` 246x226. `img/`: `logo-lockup.png` and
`logo-lockup-ink.png`, both 1461x230.

**Every one of these seven PNGs is colortype 6, meaning RGBA with an alpha
channel.** That is correct for the web and wrong for an iOS app icon, which
Apple rejects if it contains transparency. See section 5.

### `.claude/commands/`

Six slash commands: `new-guide`, `new-event`, `new-podcast`, `new-announcement`,
`edit-content`, `new-content-type`.

-----

## 2. Architecture

### 2.1 Routing

**It is pushState, not hash, and it encodes state in the query string rather
than the path.** `js/router.js:31` builds `?v=home&id=guide-slow-burn&i=3`.
`fromLocation()` at line 38 reads it back with `URLSearchParams`.

This matters more than it looks. A path based pushState router (`/guide/slow-burn`)
would need a server rewrite rule, and under Capacitor's local origin a cold
launch at a deep path would 404 against the bundled file system. A query string
router does not have that problem: the document is always `index.html`, and the
query is just a parameter the app reads. **The current design is already
Capacitor safe.** This is the single best architectural decision in the repo
from a packaging standpoint.

Three things about it are still worth flagging:

1. **`back()` uses `window.history.length > 1`** (`router.js:111`). `history.length`
   is not a reliable measure of whether there is anywhere to go back to. Under
   Capacitor the web view starts with a history entry already, and `start()`
   adds a `replaceState`, so length can read as 1 when the user is two views
   deep, or as greater than 1 on the very first screen. The fallback is benign
   (it goes home) but the back button can misbehave at the edges.
2. **The alias translation is applied in `render()` but not in `go()`**
   (`router.js:67` versus `router.js:96`). A `go({name:'watch'})` call pushes
   `?v=watch` into history and renders `listen`. The URL and the view disagree.
   Nothing calls `go('watch')` today, so this is latent rather than live.
3. **The iOS edge swipe back gesture is off by default in WKWebView.** Capacitor
   does not enable `allowsBackForwardNavigationGestures`, and even when enabled
   it drives web view history, which this app does use. This needs to be tested
   on a device, not assumed.

### 2.2 Data flow

Three layers, resolved in this order, in `js/content.js`:

```
boot (app.js:552)
  └─ HC.content.primeFromCache()      synchronous, localStorage read
       └─ apply(payload)              mutates HC.data arrays in place
  └─ renderShell(); router.start()    FIRST PAINT happens here
  └─ HC.auth.init()                   async session restore, best effort
  └─ HC.content.refresh()             async, 11 parallel fetches, 12s timeout each
       └─ apply(payload); writeCache(); signature() compare; redraw() if changed
```

The trick that makes this work without touching `data.js` is documented at
`content.js:20` and implemented in `fill()` at line 286: the arrays are mutated
in place rather than reassigned, so every helper closed over the original array
keeps working.

**Where it fails when the network is unavailable: nowhere, by design, and I
believe the design.** `getTable()` catches everything and returns `null`
(`content.js:422`). `refresh()` counts how many tables answered and, if none
did, leaves the cache and the bundled seed exactly as they were
(`content.js:494`). The first paint never waits on the network because
`primeFromCache` is synchronous and `refresh` runs after `router.start`.

The one real risk is not offline, it is partial. If three of eleven tables
answer and eight time out, `apply()` runs with a partial payload. It only
touches targets present in the payload, so the other eight keep their cached
values, which is correct. But `writeCache(payload)` at line 504 then writes the
**partial** payload over the full cached one. The next cold start primes from a
cache missing eight tables and falls back to the bundled seed for those. The app
still renders, so this is a Medium quality bug, not a blocker, but it means a
bad Sunday connection can silently roll a phone back to build time content for
part of the app.

### 2.3 Paths

**No leading slash absolute paths exist anywhere.** I grepped `src="/`, `href="/`,
`url("/`, and `url(/` across HTML, CSS, and JS. Zero hits. Every asset reference
is relative (`assets/icons/mark.png`, `css/tokens.css?v=6`). The README's claim
that the app runs from a subdirectory unchanged is accurate, and it is the same
property that makes it work from `capacitor://localhost`.

### 2.4 Remote assets and network calls

| What | Where | When |
|---|---|---|
| Google Fonts CSS | `index.html:31`, `fonts.googleapis.com` | Every launch, render blocking |
| Google Fonts files | `fonts.gstatic.com` (preconnected at `index.html:30`) | Every launch |
| Supabase REST, 11 tables | `content.js:397` | After first paint, every launch |
| Supabase Auth `/otp`, `/verify`, `/token`, `/logout` | `auth.js:92` | On sign in, sign out, and session refresh |
| Supabase REST `/profiles` | `auth.js:270`, `auth.js:308` | On sign in and on every profile field edit |

Everything else leaves the app through `openExternal()` (`components.js:90`):
Overflow (`donate.overflow.co`), BibleGateway, Buzzsprout episode pages, Spotify,
Apple Maps, `mailto:hello@homechurchnola.com`, Instagram, Facebook, YouTube.

**Google Fonts is the one thing I would change before shipping.** It is a
render blocking request to a third party on every cold launch, it puts every
user's IP address in front of Google for no functional gain, and it is a
privacy disclosure the app would otherwise not have to make. Cormorant and
Poppins are both open licensed and can be bundled as two woff2 files, roughly
40KB total. That is a small change with a real payoff in launch speed, offline
fidelity, and a shorter privacy policy.

### 2.5 State

**In memory only:** `HC.data` and everything it holds, the router's `current`
and `scrollMemory`, Connect's `filters` (`connect.js:13`), Profile's
`authIdentifier` and `authStep` (`profile.js:21`), the toast timer.

**localStorage, all keys prefixed `hc:`:**

| Key | Contents | Written by |
|---|---|---|
| `hc:profile` | First and last name, email, phone, gender, birthdate, campus, marital status, street, unit, city, state, ZIP, photo URL, notification toggles, text scale, theme, leader mode flag | `store.js:143` |
| `hc:guideState` | Per guide `{checked:{}, journal:{}}`. The journal is free text the user wrote. | `store.js:165` |
| `hc:dismissed` | Announcement ids | `store.js:220` |
| `hc:roster` | Group member names, attendance flags, private per member notes | `store.js:247` |
| `hc:prayers` | Prayer requests: who, text, timestamp | `store.js:279` |
| `hc:session` | Supabase access token, refresh token, expiry, user id, email, phone | `auth.js:43` |
| `hc:content` | The whole content payload, cache version, project URL, fetch timestamp | `content.js:386` |

Every access is inside a try/catch and gated on an availability probe
(`store.js:17`), so private browsing degrades to an in memory session. Profile
surfaces a quiet note when storage is unavailable (`profile.js:290`).

**Supabase:** the 11 content tables, read only, plus `auth.users`.

-----

## 3. Auth and data

### 3.1 What is collected, where it lives, who can read it

| Data | Collected where | Stored where | Readable by |
|---|---|---|---|
| Email or phone | Sign in form, `profile.js:89` | `auth.users` (Supabase, us-east-2) and `hc:session` | The user, and anyone with the service role key |
| First name, last name | Your information, `profile.js:116` | `hc:profile`, **and nowhere else, see 3.3** | Only this device |
| Gender, birthdate, campus, marital status | `profile.js:120` | `hc:profile` | Only this device |
| Street, unit, city, state, ZIP | `profile.js:130` | `hc:profile` | Only this device |
| Guide checkmarks and journal entries | Guide reader, `guide.js:148` | `hc:guideState` | Only this device |
| Group roster, attendance, private notes | Leader, `leader.js:25` | `hc:roster` | Only this device |
| Prayer requests | Leader, `leader.js:104` | `hc:prayers` | Only this device |
| Name, contact, note on a next step form | Connect, `connect.js:113` | **Nowhere. Discarded.** See 5.2 | Nobody |

Three auth users exist in the live project today.

### 3.2 The schema as the code expects it

Eleven content tables, all present and all matching the migrations. Verified
live:

```
series          4 rows    guides           3 rows    podcasts     87 rows
events          3 rows    announcements    2 rows    reading_plans 1 row
groups          4 rows    serve_teams      4 rows    next_steps    4 rows
church_profile  1 row     podcast_show     1 row
```

Relationships: `guides.series_id` and `podcasts.series_id` both reference
`series(id)`. `podcasts.guide_id` references `guides(id)`. `guides.sermon_id`
is deliberately **not** a foreign key, because the guide is written days before
the episode row exists (`0001_content_cms.sql:139`).

Plus one table the code expects and that does not exist. See next.

### 3.3 The `profiles` table does not exist

**This is the most consequential finding in the audit.**

`js/auth.js` reads and writes `public.profiles` at lines 270, 274, and 308. The
SQL to create it, along with its RLS policies and the `on_auth_user_created`
trigger, is in `README.md` at lines 215 to 255. I queried the live project:

```
auth.users        3
profiles table    0        <- does not exist
signup trigger    0        <- does not exist
public functions  1        <- only hc_set_updated_at
```

The consequences, in order of severity:

1. **Every profile sync silently fails.** `fetchOrCreateRemoteProfile` gets a
   404 on the GET, falls into its `.catch`, tries a POST, gets a 404 again.
   `syncAfterSignIn` swallows that in a comment that says "offline, or the table
   is not there yet" (`auth.js:294`). `saveProfile` catches and toasts "Saved on
   this phone. We will sync it once you are back online," which is false: there
   is nothing to sync to, and there never will be until the table exists.
2. **The app tells users their data follows them to another phone, and it does
   not.** `profile.js:88` says "Sign in and your information follows you to any
   phone." `profile.js:109` says "Synced to your account." Both are untrue
   today. A reviewer who signs in on one device, fills the form, and signs in on
   a second device will see an empty form. That reads as a broken feature.
3. **Three real accounts exist with no profile rows and no deletion path.**

This one gap sits underneath the account deletion work, the privacy policy, and
the RLS audit, because all three describe a table that is not there. It needs to
be fixed first or removed first, and which of those it should be is a question
for Phase 2.

### 3.4 Row Level Security

I did not have to guess. RLS is **enabled on all eleven content tables**, and
`pg_policies` returns exactly eleven policies, one per table, all identical in
shape:

```
for select, to anon+authenticated, using (published)
```

No INSERT, UPDATE, or DELETE policies exist on any table. That is deliberate
and correct: the service role bypasses RLS at the Postgres level, so
service-role-write-only is expressed by turning RLS on and writing no write
policy. The migrations also `revoke insert, update, delete` from `anon` and
`authenticated` outright, so two independent things have to be wrong before
anonymous traffic can write. This is genuinely well done and I would not change
it.

The Supabase security advisor returns two warnings, neither of them a data
exposure:

- `hc_set_updated_at` has a mutable `search_path`. Low severity, worth a
  one line fix (`set search_path = ''`).
- Leaked password protection is off. Irrelevant here, since the app uses OTP
  and never sets a password.

There are no policies for user owned data because there is no user owned data
in the database. That whole layer is Phase 4 work.

### 3.5 What is gated behind login

**Nothing.** This is worth stating plainly because it is the app's strongest
compliance position and it was arrived at by accident rather than design.

- Home, Listen, Guide, Connect, Give: all render with no session.
- The guide reader, presentation mode, and the PDF: no session.
- Leader mode: a **local boolean** in `hc:profile` (`store.js:106`). Anyone can
  flip the switch on Profile and get the roster, prayer capture, and presentation
  mode. No account required.
- The only thing sign in changes is the intent to sync the identity form, which
  currently does nothing (see 3.3).

Two implications. Good: Apple's 5.1.1(v) objection to gating content behind an
account cannot apply, because nothing is gated. Bad: Leader Mode has no
server-side identity, so there is no notion of "this leader's group" for RLS to
protect, and a reviewer cannot be shown a Leader account because accounts do not
do anything yet.

-----

## 4. Quality and completeness

### 4.1 Features that do nothing

These are the audit's real findings. Each is a control a user can operate that
produces no effect beyond a reassuring message.

| Where | What it says | What it does |
|---|---|---|
| `app.js:284` `join-group` | "We will pass your name to the host. Expect a text this week." | Shows a toast. Nothing is sent. Nobody is told. No name is even captured, the card has no input. |
| `app.js:288` `serve` | "Noted. Someone from that team will find you on Sunday." | Shows a toast. Nothing is recorded. |
| `app.js:292` `submit-step` | "Got it. This one waits on your phone until the church system is connected." | Calls `form.reset()`. The name, contact, and note the user typed are **discarded**, not stored. The copy implies they are held on the phone. They are not. |
| `profile.js:218-238` notification switches | "A new guide is posted, Monday morning, once a week." Plus a Sunday reminder and a group day reminder. | Writes a boolean to `localStorage`. There is no push infrastructure in this repo at all. No notification will ever arrive. |
| `guide.js:236` Download guide | Opens a print sheet. | `print-guide.js:221` calls `window.print()`, which **is a no-op in WKWebView on iOS**. Works in Safari, does nothing inside a Capacitor app. |
| `auth.js:317` `sendPasswordReset` | Exported, rejects with a message. | Dead code. Never called. |

The first four are the serious ones. Three of them make a factual promise to a
user about an action the church will take, and the church is not told. That is
a completeness problem before it is a compliance problem.

### 4.2 Placeholder content

- **The roster ships with six invented people.** `store.js:229` seeds Anna,
  Marcus, Dee, Jasmine, Paul, and Renee on first read. Any user who opens Leader
  mode sees a fake group. A reviewer certainly will.
- **Groups, events, serve teams, and next steps are described by the repo's own
  README as "still plausible placeholders."** They are in Supabase and they look
  real, which is worse than looking fake. These need to be confirmed as the
  church's actual groups and events, or replaced, before submission.
- `assets/img/README.md` is a note that real photography goes there later.
- `profile.js:287` hardcodes "Version 1.0" in the About block, disconnected from
  any build number.

### 4.3 Empty and error states

Empty states are genuinely good and consistently applied. `emptyState()`
(`components.js:286`) is used on: no guides (`guide.js:37`), guide not found
(`guide.js:204`), no sermons (`listen.js:123`), no matching groups
(`connect.js:63`), empty roster (`leader.js:81`), no prayers (`leader.js:111`),
no latest guide on Home (`home.js:55`). Sections whose data is empty drop their
header entirely rather than standing over nothing (`connect.js:166`,
`home.js:183`). This is careful work.

Error states are thinner:

- Network failure has warm copy (`auth.js:104`) and a `TypeError` check to
  distinguish "no network path" from "the API said no." Good.
- Content refresh failure is invisible by design, which is right, and Profile
  carries one honest line about where the content came from
  (`profile.js:162`). Also good.
- **There is no error state for a Supabase auth call that returns a real 4xx
  other than the toast.** A wrong code, an expired code, and a rate limit all
  produce the same anonymous toast text from `friendlyError`.
- **There is no offline indicator anywhere in the UI.** The app degrades
  silently, which is correct, but a user on a dead connection has no way to know
  why sign in failed twice.

### 4.4 Console errors

Static reading, no browser run in this sandbox. Two things will log:

- `store.js:75` logs subscriber failures. Correct behavior.
- The `profiles` 404s in section 3.3 will appear in the network tab on every
  sign in and every profile keystroke for a signed in user. They are caught in
  JS so they do not throw, but they are visible and they look broken.

One redundancy worth noting, not an error: `app.js:87` sets
`disc.textContent = text` and then immediately `disc.innerHTML = c.esc(text)`.
The first line is dead.

### 4.5 Accessibility

**What is already right**, and it is more than most:

- The decorative numerals in `numberedRow` are `aria-hidden` (`components.js:186`),
  exactly as the design system asks.
- All icons are `aria-hidden` and `focusable="false"` (`components.js:137`).
- `:focus-visible` is defined globally with a 2px outline and offset
  (`base.css:74`).
- `prefers-reduced-motion` is respected (`base.css:223`).
- Collapsible sections use real `aria-expanded` and `aria-controls`
  (`components.js:264`).
- Check rows use `aria-pressed`, switches use `role="switch"` with `aria-checked`.
- The toast is `role="status"` with `aria-live="polite"`.
- Journal textareas and member note inputs have visually hidden labels
  (`guide.js:147`, `leader.js:24`).
- Touch targets: `--hc-tap-min: 44px` is applied at 14 sites in `components.css`,
  covering buttons, rows, tabs, pills, switches, inputs, and the banner dismiss.

**What is wrong:**

1. **Contrast. This is the real gap.** I computed every foreground and
   background pair in `tokens.css`:

   | Pair | Ratio | Verdict |
   |---|---|---|
   | `--hc-ink` on paper | 17.21 | Pass |
   | `--hc-mid` on paper | **4.16** | **Fails AA for normal text (needs 4.5)** |
   | `--hc-mid` on cream (cards) | **3.74** | **Fails** |
   | `--hc-accent-deep` on paper | **3.42** | **Fails** |
   | `--hc-accent-deep` on cream | **3.07** | **Fails** |
   | `--hc-accent` on paper | 2.12 | Documented as decorative |
   | `--hc-warning` on paper | 3.59 | Fails |
   | Dark mode, every pair | 5.28 to 15.18 | All pass |

   `--hc-mid` is `.hc-caption`, which is 13px and carries real content
   everywhere: bylines, dates, meta lines, service times, the coverage counter,
   card subtitles. At 4.16 on paper and 3.74 on a card, that is a fail on the
   most common text style in the app after the body serif.

   `--hc-accent-deep` is `.hc-eyebrow--legible`, the class whose entire purpose
   is "an eyebrow a user must read." It is at 3.42. The class exists because
   someone already noticed this problem and did not push the value far enough.

   Plain `--hc-eyebrow` at 2.12 is a harder call. The design system says accent
   is decorative and that is a legitimate position, but it is currently carrying
   meaningful text: the scripture passage on every guide row (`guide.js:21`),
   "Next gathering" on Home, the series name on the reader masthead, "One thing"
   on announcements, the day and time on every group card (`connect.js:49`).
   Group meeting times are not ornament.

2. **The dark mode palette passes everything.** Only light mode has this problem.

3. `role="application"` on the app div (`index.html:47`) is heavy handed. It
   tells screen readers to hand nearly all keystrokes to the app, which is
   appropriate for a canvas editor and not for a reading app. `role="main"` or
   nothing would serve better.

4. **Dynamic Type is not supported.** The app has its own three step text scale
   in Profile, which is good, but it does not read the system setting. iOS users
   who have already enlarged text everywhere will open this app at its default.

5. Two decorative images carry alt text that duplicates adjacent content: the
   two logo lockups in the top bar both have `alt="Home Church"` (`app.js:45`),
   so VoiceOver announces the church name twice in one header. One should be
   `alt=""`.

6. The progress bar (`home.js:157`) is `role="presentation"` with no accessible
   value. The "Week 8 of 12" caption next to it carries the information, so this
   is arguably fine, but a `role="progressbar"` with `aria-valuenow` would be
   more honest.

-----

## 5. Capacitor specific observations

Recorded here because they change what Phase 2 has to weigh, even though the
iOS project does not exist yet.

1. **There is no Capacitor project in this repo.** No `package.json`, no
   `capacitor.config.json`, no `ios/`. The README documents the commands to
   create one. Nothing has been run. Current Capacitor is 8.5.0 (July 31, 2026),
   which requires **Xcode 26** and an **iOS 15 deployment target**.
2. **Routing is already compatible** (section 2.1). This is the good news.
3. **`window.print()` does not work in WKWebView.** The Download guide button is
   dead in the packaged app (section 4.1).
4. **All seven PNGs have alpha channels.** Apple rejects app icons containing
   transparency. New flattened assets are needed at the full icon set of sizes.
5. **`openExternal()` already prefers the Capacitor Browser plugin**
   (`components.js:93`) and falls back to `window.open`. This is the right
   shape for the giving handoff, and the plugin is not installed yet.
6. **Safe areas are handled** in 10 places across the three CSS files, covering
   the top bar, tab bar, screen padding, toast, and presentation mode.
7. `user-scalable=no` in the viewport meta (`index.html:8`) disables pinch zoom.
   iOS Safari has ignored this since iOS 10, but WKWebView honors it, so it will
   actually take effect in the packaged app and remove a zoom affordance some
   users rely on.
8. **No service role key exists anywhere in the client or in git history.** I
   grepped the full history for `service_role`, `sb_secret`, and the JWT header
   prefix. Every hit is documentation or SQL grant text. The key in
   `js/config.js` is `sb_publishable_...`, which is the correct publishable key,
   and the project ref in it matches the live project.

-----

## 6. What this app actually is right now

It is a genuinely well built static reading app for one church, with a real
catalogue of 87 sermons and three carefully written small group guides behind
it, wired to a content backend that lets the church publish without a build. The
craft in the parts that are finished is high: the offline strategy is correct,
the empty states are warm, the RLS on content is right, and the routing happens
to be exactly what a Capacitor wrapper needs. But the interactive half is a
prototype wearing the finished half's clothes: four separate controls tell users
something will happen and then nothing happens, the roster ships with six
invented people, notification switches toggle a boolean into an app with no push
capability, and the accounts feature writes to a database table that was never
created, so three real users have signed in to a sync that cannot work. Nothing
here is unfixable, and none of it is architectural, but as it stands the app
would be submitted describing behavior it does not have.

-----

## 7. Open questions I need answered before Phase 2

These are things I will not invent. Several of them change what Phase 2
recommends.

1. **Is Home Church a registered 501(c)(3), and does it hold a Candid Seal of
   Transparency?** This decides whether Apple Pay giving is even available as an
   option, and it is the long pole if the answer is "not yet."
2. **Who is the data controller of record?** The church itself, or an entity
   name I should use in the privacy policy?
3. **Are the four groups, four serve teams, three events, and four next steps
   currently in Supabase the church's real ones?** The README says they are
   plausible placeholders. If they are, they are 2.1 rejection material.
4. **What is supposed to happen when someone taps a group card or a serve team?**
   Is there an email address, a form, or a person who should receive it? This
   decides whether the fix is "wire it up" or "remove the promise."
5. **Should Leader Mode data ever leave the phone?** Right now roster,
   attendance, prayer requests, and per member notes are all local. Keeping them
   local is by far the strongest privacy and App Review position. Syncing them
   makes leaders custodians of other people's sensitive information and pulls in
   the whole of Guideline 1.2. I would keep them local, and I want to know if
   that conflicts with what the church expects.
6. **Is there an existing homechurchnola.com privacy policy or terms page?** If
   so I should be consistent with it rather than contradict it.
7. **Is the Apple Developer account going to be an organization?** If yes, the
   D-U-N-S number needs to be started now, not in Phase 7.

-----

*Phase 1 of the App Store launch brief. Phase 2, the compliance gap analysis,
is not started and is waiting on the answers above.*
