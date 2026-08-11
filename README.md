# Home Church

A mobile web app for Home Church, Metairie, Louisiana. Sermons, small group
guides, and a way in.

It is plain HTML, CSS, and vanilla JavaScript. There is no build step, no npm
install, and no backend. All content lives in one seed file shaped like a
future API response.

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

**Fonts.** Cormorant loads from Google Fonts. If it fails, a serif fallback
stack takes over and nothing breaks. It's the only network request the app
makes until Supabase is connected, see Supabase setup below, at which point
sign-in and profile sync add calls to your own project.

-----

## How it is put together

```
index.html            entry point, meta tags, script order
css/
  tokens.css          design tokens, custom properties only
  base.css            reset, typography, safe areas, utilities
  components.css      reusable component classes
  screens.css         screen specific layout
js/
  data.js             seed content, shaped like a future API payload
  store.js            localStorage wrapper, app state, tiny pub/sub
  config.js           Supabase URL and anon key, empty until you fill them in
  auth.js             sign in, session, profile sync, see Supabase setup below
  router.js           pushState routing, no hash
  components.js       render functions returning HTML strings
  screens/            one file per screen
  app.js              boot, route table, delegated event handling
assets/icons          the mark, favicon, app icons
assets/img            placeholder note, real photography goes here later
manifest.webmanifest
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
announcements, the roster, and prayer requests. All of it stays local, except
the profile fields once Supabase is connected and you're signed in, see
Supabase setup below.

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
| `/new-announcement` | The One thing card on Home, dated so it retires itself |
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

## Supabase setup

Accounts are prepped but not connected. Nothing changes for anyone using the
app until a real project exists and its two keys are pasted into
`js/config.js`. Until then, Profile's identity form still works, it just
saves to the phone only, exactly like v1 shipped.

**What's already built**, in `js/auth.js`:

- Sign in with either an email address or a phone number, verified by a one
  time code, no password to set or reset. Supabase calls this OTP.
- Session storage and refresh, so a signed-in visit does not quietly drop
  back to guest after an hour.
- Profile sync. Every field in Your Information autosaves locally first,
  then, once signed in, pushes the same change to Supabase in the
  background. Sign in once and the remote copy of the profile wins, so
  edits made from another phone are the ones a person sees.
- Talks to Supabase's own HTTP API directly with `fetch`, no SDK. That
  keeps the no-build-step, no-npm-install promise above intact.

**What is not built**: guide checkmarks and journal entries are still
localStorage only. Syncing those needs a second table and is a reasonable
next step once accounts are live, but it is a separate piece of work from
login and was left out of this pass on purpose.

### To turn it on

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run this once, it creates the table the profile
   form reads and writes, locks it down so a person can only ever see or
   change their own row, and backfills a blank row automatically the moment
   someone signs up for the first time:

   ```sql
   create table public.profiles (
     id uuid primary key references auth.users on delete cascade,
     first_name text,
     last_name text,
     gender text,
     birthdate date,
     campus text,
     marital_status text,
     street text,
     unit text,
     city text,
     state text,
     zip text,
     photo_url text,
     updated_at timestamptz default now()
   );

   alter table public.profiles enable row level security;

   create policy "Individuals can view their own profile"
     on public.profiles for select using (auth.uid() = id);

   create policy "Individuals can update their own profile"
     on public.profiles for update using (auth.uid() = id);

   create policy "Individuals can insert their own profile"
     on public.profiles for insert with check (auth.uid() = id);

   create function public.handle_new_user()
   returns trigger as $$
   begin
     insert into public.profiles (id) values (new.id);
     return new;
   end;
   $$ language plpgsql security definer;

   create trigger on_auth_user_created
     after insert on auth.users
     for each row execute procedure public.handle_new_user();
   ```

3. **Authentication -> Providers**, confirm Email is on (it is by default).
   For phone sign-in, turn on Phone there too and connect an SMS provider,
   Supabase does not send text messages itself, Twilio is the common
   choice. Email sign-in needs nothing extra here.
4. **Authentication -> Email Templates -> Magic Link**, required, and easy
   to miss. Supabase generates a one time code for every sign-in email
   whether you ask for it or not, but the stock template only shows a
   clickable link, not the code, so nobody sees it unless the template is
   changed. Replace the template body with something that prints
   `{{ .Token }}`, for example:

   ```html
   <h2>Your code</h2>
   <p>Here's your sign-in code for Home Church:</p>
   <h1 style="letter-spacing:4px;">{{ .Token }}</h1>
   <p>It expires shortly. If it's been a while, just ask the app for a new one.</p>
   ```

   Skip this and people get a link instead of a code, and the app's "enter
   your code" screen has nothing to type in.
5. **Authentication -> URL Configuration**, set Site URL to where the app
   actually lives, `https://pgrooves.github.io/home-church/` once GitHub
   Pages is on. A fresh project defaults this to `http://localhost:3000`,
   which is why the very first test of this sent a link that Safari
   couldn't connect to, nothing on this phone is listening on localhost.
   Add the same URL under Redirect URLs.
6. **Project Settings -> API**, copy the Project URL and the Publishable
   key (Supabase's current name for what used to be called the anon key)
   into `js/config.js`. It's safe to ship in client code, the row level
   security policies above are what actually restrict it.
7. Reload the app. Sign in appears on Profile automatically.

**A note on trust.** The endpoint shapes in `js/auth.js` match Supabase's
documented Auth and REST APIs, but code written against documentation and
code proven against a live project are different claims. The first live
test against this church's own project (see steps 4 and 5) found a real
gap, the stock email template hides the code behind a link, and a fresh
project's Site URL points at localhost until someone sets it. Both are one
time dashboard settings, not app bugs, and are now folded into the steps
above. If something else does not match, the network tab will show which
call failed and what came back, that is the fastest way to find it.

-----

## Wrapping for iOS

The app is built so this is a packaging step, not a rewrite. Paths are all
relative, safe area insets are already respected, routing uses `pushState`, and
every outbound link goes through one `openExternal()` helper in
`js/components.js` that already prefers the Capacitor Browser plugin when it
is present.

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Home Church" com.homechurchnola.app
```

Set `webDir` to the repo root in `capacitor.config.json`:

```json
{
  "appId": "com.homechurchnola.app",
  "appName": "Home Church",
  "webDir": "."
}
```

Then:

```bash
npx cap add ios
npx cap sync
npx cap open ios
```

That opens Xcode. Set the app icon from `assets/icons/`, pick a team, and run
on a device.

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
- **No in-app payment.** Giving hands off to Overflow.

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
4. Which church management system holds groups, serve teams, and events, which
   decides whether that content can be pulled live. Planning Center is a
   strong fit if the church already uses it, it can also hold the profile
   fields the Supabase setup above tracks, worth weighing before leaning too
   far into a second source of truth for the same information.
5. Who publishes a guide every week. The app's value depends on that pipeline
   more than on anything in this repo.
6. Whether phone sign-in matters enough to pay for an SMS provider. Email
   sign-in is free and already works once Supabase is connected, phone does
   not until a provider like Twilio is wired up in the Supabase dashboard.

The `podcasts` and `series` tables hold the real Home Church NOLA catalogue,
87 messages from November 2024 forward, transcribed from the podcast feed. Groups, events, and serve teams are still plausible
placeholders. The three guides are complete and written in the real voice,
and they are the thing to look at.
