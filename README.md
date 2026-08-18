# Home Church

A mobile web app for Home Church, Metairie, Louisiana. Sermons, small group
guides, and a way in.

It is plain HTML, CSS, and vanilla JavaScript. No framework, no bundler, no
transpiler. Open `index.html` in a browser and the whole thing runs.

Two qualifications to that, both added when the app was prepared for the App
Store. There is a `package.json`, but only for Capacitor and its plugins,
nothing in `js/` or `css/` is compiled or processed. And there are two small
Node scripts, `npm run stamp` and `npm run sync`, which respectively write the
cache busting stamps into `index.html` and `manifest.webmanifest` and copy the
app's files into `www/` for Capacitor. Neither transforms a line of code. You
can still read every file in this project without learning a tool.

There are two stamps and they are hashed from different places. `?v=` comes
from `css/` and `js/` and rides the code. `?i=` comes from `assets/icons/` and
rides the artwork. They are separate because the app icon was once redrawn
without either its filename or its stamp changing, and Safari, which caches
icons apart from pages and holds them past a reinstall, kept showing the old
one. See the comment at the top of `scripts/stamp_assets.js`.

Content lives in Supabase, with `js/data.js` as the cold start floor. See
"Publishing content" below.

-----

## Running it

**The quick way.** Open `index.html` in a browser. Everything works from the
file system, including navigation and saved notes.

**The better way.** Serve the folder, which lets deep links and the browser
back button behave exactly as they will in production:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works. So does GitHub Pages: point Pages at the default
branch, root folder, and the app is live. Every path in the project is
relative, so it runs from a subdirectory without changes.

To see it the way it is designed, open your browser's device toolbar and set
the viewport to 390 x 844.

**Fonts.** Cormorant and Poppins ship with the app, in `assets/fonts`, latin
subset only, six files and 185KB. They used to load from Google Fonts on every
cold launch, which was a render blocking third party request that also handed
Google every user's network address for no functional gain. Inside a packaged
app there was never a reason for it. Both families are SIL Open Font License
1.1, which permits bundling. See `css/fonts.css`.

That leaves Supabase as the only network request the app makes on its own.

-----

## How it is put together

```
index.html            entry point, meta tags, script order
css/
  tokens.css          design tokens, custom properties only
  base.css            reset, typography, safe areas, utilities
  components.css      reusable component classes
  screens.css         screen specific layout
  fonts.css           @font-face for the two bundled families
js/
  data.js             cold start seed, the floor under a fresh install
  store.js            localStorage wrapper, app state, tiny pub/sub, erase
  config.js           Supabase URL and publishable key
  auth.js             sign in and profile sync, DORMANT, see "Accounts" below
  content.js          fills HC.data from Supabase, cache first, never blocks
  native.js           share sheet, calendar, haptics, notifications
  print-guide.js      the printable guide, and the standalone file for sharing
  router.js           pushState routing, query string, no hash
  date-rail.js        the month strip under the header on Listen
  swipe.js            drag sideways to move between the five tabs
  components.js       render functions returning HTML strings
  screens/            one file per screen, including legal.js
  app.js              boot, route table, delegated event handling
assets/fonts          Cormorant and Poppins, latin subset, plus the OFL
assets/icons          the mark, favicon, app icons, all without alpha
assets/img            placeholder note, real photography goes here later
ios-config/           hand written files for the generated Xcode project
scripts/              publishing, icons, cache stamps, the www/ copy
manifest.webmanifest
capacitor.config.json
```

**Scripts are classic, not modules.** ES modules fail over `file://` because
of origin rules, and the brief calls for the app to run by opening the file.
Everything hangs off one `HC` global, and each file adds its own namespace.
Load order is in `index.html` and matters.

**Screens return HTML strings.** `app.js` mounts them and runs one delegated
listener per event type. Taps are wired through `data-action` attributes that
map to the `actions` table in `app.js`. Adding a new interaction means adding
a `data-action` in the markup and a matching function in that table, never a
new listener.

**State.** `js/store.js` wraps `localStorage`. Every key is prefixed `hc:` and
every read and write is inside a try/catch, so private browsing degrades to an
in memory session instead of crashing. Profile also surfaces a quiet note when
storage is unavailable.

What persists: your profile and preferences, dark mode, text size, leader
mode, per guide question checkmarks, per guide journal entries, dismissed
announcements, the roster, and prayer requests. **All of it stays on the
device.** Nothing a person writes in this app is transmitted anywhere, which
is what keeps Guideline 1.2, the user generated content rule, entirely out of
scope, and it is a property worth defending. `store.eraseEverything()` wipes
the lot, and the Your data screen is where somebody does that themselves.

-----

## Adding a guide

Guides are the point of this app. Add one with `/new-guide`, which writes a
row to the `guides` table plus a matching row in `podcasts` linked by
`guide_id`. Nothing else needs to change and nothing needs a build. The index,
the reader, the Home card, and leader presentation mode all pick it up the
next time the app opens.

Full instructions, the exact object shape, section-by-section content
quotas, and the voice rules, live in **`NEW_GUIDE_PROCESS.md`** at the repo
root, written so it can be handed to a fresh Claude Code session alongside
a sermon PDF and triggered by saying "new guide." That file is the source
of truth for this, kept as one document rather than duplicated here so the
two can't drift out of sync.

-----

## Adding the week's podcast episode

The guide gets written within a day or two of Sunday. The episode posts to
Spotify the Monday or Tuesday after, carrying the church's own title for the
message, which is usually not the title proposed when the guide was written.
Saying **"new podcast"** runs **`NEW_PODCAST_PROCESS.md`**, which matches the
episode to its Sunday by date, attaches the episode link and notes, and
replaces the provisional title with the real one.

That rename is one field. `sermon.title` is the only place a message's name
is written, and the guide inherits it through `HC.data.guideTitle()`, so
Home, the guide index, the reader, the PDF, leader mode, and every shared
one-liner all follow automatically. `guide.themeTitle` exists only to
override that, is `null` on every guide today, and should stay that way.

Ids never move with a title. A leader's checkmarks and journal entries live
in `localStorage` keyed by `guide.id`, so renaming a slug to match a new
title would orphan their notes on their own phone. A slug that no longer
matches its title is fine and nobody sees it.

-----

## Publishing content without an App Store build

Guides, events, podcast episodes, and future content types have a home in
Supabase, so publishing and editing happen without touching app code and
without waiting on a review. Full documentation is in
**`supabase/README.md`**, kept there rather than duplicated here so the two
cannot drift.

The short version. Eleven tables, publicly readable with the anon key and
writable only with the service role key: `series`, `guides`, `podcasts`,
`events`, `announcements`, `reading_plans`, `groups`, `serve_teams`,
`next_steps`, `church_profile`, and `podcast_show`. Between them they hold
everything the app renders, so no content change needs a build. Six slash
commands drive them:

| Command | Does |
|---|---|
| `/new-guide` | Sermon PDF to a full guide, written to `guides` and `podcasts` |
| `/new-event` | Asks for what is missing, confirms, writes to `events` |
| `/new-podcast` | Episode to `podcasts`, links its guide, puts the real title on the message |
| `/new-announcement` | The announcement card on Home, dated so it retires itself |
| `/edit-content` | Plain language fix to any row, current versus proposed, writes after you confirm |
| `/new-content-type` | Scaffolds another content type, table and command |

There are two ways they reach the project, and **`supabase/ACCESS.md`** is the
one place that says which to use. On a machine with `.env`, they shell out to
`scripts/hc_supabase.py`, standard library Python, no pip install, which keeps
the no build step promise above intact. From a phone or a web session, where
there is no `.env` and the egress proxy blocks `supabase.co`, they use the
Supabase MCP server instead. Most of this app is edited from a phone, so that
second path is the normal one rather than the fallback.

Credentials for the script come from `.env` at the repo root, which is git
ignored and never committed. You do not need `.env` to edit content, and you
never need the service role key on a phone.

**The app reads these tables**, through `js/content.js`. It applies the cached
copy before the first paint, falls back to `js/data.js` on a fresh install
with no signal, and fetches in the background after the first paint, redrawing
in place only if something changed. The app is never blank and never waits on
the network, which matters in a building with concrete walls.

`js/data.js` still ships and still matters, it is the floor under a brand new
install with no signal. But it is a frozen cold start seed now, not a second
catalogue: **the publishing commands write to Supabase only.** Do not hand
edit content into it, that is how two copies drift apart. Let it go stale, and
regenerate it from Supabase if you ever want the floor raised.

Deleting the last row of a table is honored too, so content can be removed and
not just added. Two exceptions, both deliberate. A project where *every* table
is empty is an unconfigured project rather than an intent, so the bundled
content stays and the app does not blank. And `church_profile` and
`podcast_show` are never cleared, because four screens read the church's
address without checking it exists. Edit those two, do not empty them.

-----

## Accounts

**Sign in is switched off, on purpose, and the app is better for it.**

`js/auth.js` has always read and written a table called `public.profiles`.
That table was never created. Three real people signed in and every profile
save quietly 404'd while the Profile screen told them their information would
follow them to any phone. The feature had never once worked.

Turning it off was cheaper and more honest than turning it on in a hurry, and
it removed three separate things from the path to the App Store: Apple's
requirement that account deletion be possible inside the app, the demo account
a reviewer would otherwise need, and a hard dependency on production email
before launch, since Supabase's built in sender is rate limited and a reviewer
who never receives a sign in code rejects the app.

There is a fourth reason, and it is the one worth remembering. A row that
associates a named person with a church is special category data under GDPR
and lands in Apple's **Sensitive Info** bucket, the most scrutinized part of
the privacy label. Stacked with birthdate, gender, marital status, and a home
address, which is what the Profile form collects, that is a lot of sensitive
data to hold on a free tier project for a feature nobody was using.

**What still works.** Everything. The identity form saves to the phone exactly
as v1 shipped. No screen in the app is behind a login, and none should be.

**What is ready and unrun**, so the day accounts are wanted the work is done
and reviewed rather than written against a deadline:

- `supabase/migrations/0009_accounts_dormant.sql`, the profiles table with row
  level security that lets a person read only their own row, the signup
  trigger, and an export function.
- `supabase/functions/delete-account/index.ts`, the Edge Function that deletes
  an account. It has to be a server function because removing a row from
  `auth.users` needs the service role key, which must never ship in the app.

**Before switching it on**, read the note in `0009` about data minimization.
Of the twelve fields in that table the app itself reads exactly one.

### The sign in email has to be edited by hand

`js/auth.js` asks Supabase for a one time code and the Profile screen asks the
person to type six digits. Out of the box Supabase emails a **magic link**
instead. Nothing is wrong with the request, email OTP and magic link are the
same endpoint and the same token, the only difference is what the email says,
and the default templates say it with a link. So the app waits for a code that
was never printed. Worse, the link is not a usable second path: it redirects to
the Site URL and no screen in this app handles that, so clicking it consumes
the token and leaves the person signed out.

**Custom SMTP has to be set up first, there is no way around it.** On the
built in sender the dashboard shows both fields read only, "Set up custom SMTP
to edit templates". And the deeper reason to do it anyway: that sender
delivers only to members of the Supabase org and answers every other address
with `Email address not authorized`. It is a try-it-out service, not a small
email budget. Sign in cannot work for the congregation until a real SMTP
provider is connected, whatever the emails say.

Then fix it in **Authentication -> Emails**. Two templates, because Supabase picks a
different one depending on whether the address already exists in `auth.users`:
**Magic Link** for anyone signing in again, **Confirm signup** for a first
time. Editing only one leaves half the church stuck. Both get the same body,
and `{{ .ConfirmationURL }}` comes out entirely.

Subject:

```
{{ .Token }} is your Home Church sign in code
```

Body:

```html
<h2>Your sign in code</h2>
<p>Enter this code in the Home Church app to finish signing in:</p>
<p style="font-size:28px;letter-spacing:6px;"><strong>{{ .Token }}</strong></p>
<p>The code can only be used once. If you did not ask to sign in, ignore this
email and nothing will happen, nobody can use the code but you.</p>
<p style="color:#767676;font-size:13px;">You are receiving this because this
address was entered on the sign in screen of the Home Church app. This is not
a mailing list and there is nothing to unsubscribe from.</p>
```

The closing footer is not decoration. A very short, link free, code only email
from a domain nobody has seen before is close to the shape spam filters are
built to catch, and saying plainly why the message arrived is one of the few
content signals that helps. The rest of staying out of junk is not something
the template can fix, see below.

### Junk folder, what actually moves it

In rough order of effect, learned the first day this sent real mail:

1. **Age and volume of the sending domain.** A subdomain that sent its first
   message this morning has no reputation, and filters treat that as a risk
   until real people receive mail and do not complain. This mostly fixes
   itself over days of ordinary use.
2. **SPF, DKIM and DMARC passing at the far end**, which is not the same claim
   as "verified" in the sending provider. `mail-tester.com` gives a free score
   and a per check breakdown, and takes about two minutes: request a code to
   the address it shows you, then read the report.
3. **People marking it Not Junk.** Worth asking the first few members to do it
   rather than hoping.
4. **The content**, which is the block above, and the smallest of the four.

Do not chase this by rewriting the email repeatedly. It reads as churn to the
filters and the first item is doing most of the work.

Putting the code in the subject line is the part people notice. It is what
lets a phone show the six digits on the lock screen, and it is why iOS offers
to autofill them, which is what the `autocomplete="one-time-code"` on the
Profile form is waiting for.

While you are on that page, set the OTP expiry under **Authentication ->
Providers -> Email** to something shorter than the one hour default. An hour
is a long time for a code sitting in an inbox.

-----


## Wrapping for iOS

This is a packaging step, not a rewrite. Paths are all relative, safe area
insets are respected, routing puts its state in the query string rather than
the path so a cold launch under Capacitor's local origin resolves, and every
outbound link goes through one `openExternal()` helper.

`package.json` and `capacitor.config.json` are already written.

```bash
npm install
npx cap add ios
npm run ios:open      # stamp, sync www/, cap sync, open Xcode
```

**`webDir` is `www`, not the repo root.** An earlier version of this file
suggested the root, which works right up until you run `npm install`, at which
point every `cap sync` copies `node_modules`, `.git`, the Supabase migrations,
and the Python scripts into the shipping app. `npm run sync` assembles `www/`
from the five things the app actually needs. It is a file copy, not a build.

In Xcode: copy `ios-config/PrivacyInfo.xcprivacy` into `ios/App/App/` and add
it to the App target, run `npm run icons` and drag `ios-icons/` into the
AppIcon set, set `ITSAppUsesNonExemptEncryption` to `NO`, pick a team, and run
on a device.

**Everything else about submitting is in `SUBMISSION_KIT.md`**, and everything
that needs a human rather than a commit is in `LAUNCH_TODO.md`.

**Worth knowing before you start.** An Apple Developer account is $99 a year.
A personal account can be created in a few minutes. An organization account,
which is what you want if the app is published as Home Church rather than as a
person, requires a D-U-N-S number for the church, and obtaining one usually
takes a week or two. Start that early, it is the long pole.

**Optional once wrapped.** Install `@capacitor/browser` so `openExternal()`
opens giving and scripture links in an in-app browser instead of leaving the
app. No code change is needed, the helper already checks for it.

-----

## Brand assets

Everything under `assets/icons` and `assets/img/logo-lockup*.png` is cropped
directly from the church's own logo file, not redrawn. `assets/icons/mark.png`
is the house and cross alone, used on Profile and as the app icon.
`assets/img/logo-lockup.png` is the full "Home Church" lockup exactly as
supplied, white text, meant for a dark ground. `logo-lockup-ink.png` is the
same file with only the wordmark pixels lifted to near-black, so it stays
legible on the paper background, the gold house is untouched in both.

The square icons, `favicon` through `icon-512`, are that same mark on the
app's own dark, `#1A1918`, and they are meant to stay dark on a light Home
Screen as well as a dark one. Gold on paper is the weakest pairing the brand
has at icon size, gold on dark is the strongest, and the icon does not need to
agree with the wallpaper. `index.html` names the same file for both
appearances so nothing has to be inferred from the artwork. Regenerate with
`npm run icons`, then `npm run stamp` so the URL moves with the picture.

The lockup lives top-left in the header on every tab, sliding to center once
the screen scrolls and the screen title takes the left edge. Pushed views
(Guide reader, Profile, Leader) show no logo, back arrow and title fill that
role instead. That gold, sampled from the source file, is a mark color only,
it is not part of the UI palette and no interface element should adopt it.

-----

## Decisions worth not undoing

- **Five tabs and one Profile screen.** No drawer, no More sheet. Two
  navigation systems is one too many.
- **No shadows.** Surfaces separate with color and 0.5px hairlines.
- **No streaks, badges, day counters, or completion percentages.** The reading
  plan shows position, not pressure.
- **`--hc-accent` is decorative only.** It fails contrast on paper at roughly
  2.4:1. Anything a user has to read uses `--hc-ink`, `--hc-mid`, or
  `--hc-accent-deep`.
- **Cormorant Light never goes below 16px**, and below 20px it is set in
  Regular.
- **No stock photography, ever.** Cream placeholder blocks until real
  photographs of real people exist. Podcast cover art is the one drawn
  exception, the church lockup on a dark panel, which is what the show wears
  on Spotify anyway. It ships with the app and never fetches.
- **No in-app payment.** Giving hands off to Overflow, in a system browser.
- **Nothing a person writes ever leaves their phone.** Notes, roster,
  attendance, prayer requests. The day one of those becomes visible to another
  user, the app needs content filtering, reporting, and user blocking under
  Guideline 1.2, and this becomes a different and much harder submission.
- **No accounts in v1.** See "Accounts" above.
- **`--hc-accent` is for ornament, and the eyebrow default is not it.** The
  default eyebrow color is `--hc-accent-deep`, and `--ornament` is the opt
  out, so forgetting the modifier gives you readable text rather than 2.12:1
  uppercase.
- **No analytics, no crash reporting, no advertising, no third party SDK**
  beyond Capacitor. That absence is why the privacy label is three lines long.
  Every addition costs a signed manifest and a new disclosure.

-----

## Still to confirm before launch

These are marked in the code where they appear:

1. The per-episode Spotify links. Every message currently links to its own
   episode page on the podcast host, which works, and `podcast.showUrl` points
   at the show on Spotify. Swapping `episodeUrl` to the matching
   `open.spotify.com/episode/...` link is a per-row change, and the Listen
   button relabels itself to "Listen on Spotify" automatically when it sees a
   Spotify URL.
2. The 28 messages with no preacher recorded and the 43 with no passage, both
   because the episode notes do not state them. They render cleanly without,
   the byline just gets shorter. Fill them in as you know them.
3. Whether a licensed display typeface should replace Cormorant.
4. ~~Which church management system holds groups, serve teams, and events.~~
   **Answered.** The church runs **Planning Center**, through Church Center,
   and **Group Vitals**. The Connect tab now sends people to both rather than
   duplicating their forms, so there is no second source of truth to keep in
   step. Worth remembering the next time somebody proposes building a form.
5. Who publishes a guide every week. The app's value depends on that pipeline
   more than on anything in this repo.
6. ~~Whether phone sign-in matters enough to pay for an SMS provider.~~
   **Moot for v1.** Sign in is switched off entirely, see "Accounts" above.
   The question comes back the day accounts do.

The `podcasts` and `series` tables hold the real Home Church NOLA catalogue,
87 messages from November 2024 forward, transcribed from the podcast feed. Groups, events, and serve teams are still plausible
placeholders. The three guides are complete and written in the real voice,
and they are the thing to look at.
