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

**Fonts.** Manrope and Poppins ship with the app, in `assets/fonts`, latin
subset only, two files and 32KB. They used to load from Google Fonts on every
cold launch, which was a render blocking third party request that also handed
Google every user's network address for no functional gain. Inside a packaged
app there was never a reason for it. Both families are SIL Open Font License
1.1, which permits bundling. See `css/fonts.css`.

The reading face was Cormorant, a Garamond revival, until it wasn't. It is a
display face and the guides are read at 17px for twenty minutes at a stretch,
where its hairlines thin out and, on the dark theme, wash out further. Manrope
replaced it. Poppins 800 still does the headers, unchanged. `--hc-serif` keeps
its name and no longer holds a serif; `css/tokens.css` says so where it is
declared.

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
  search.js           the index behind the magnifying glass in the top bar
  router.js           pushState routing, query string, no hash
  date-rail.js        the month strip under the header on Listen
  swipe.js            drag sideways to move between the five tabs
  components.js       render functions returning HTML strings
  screens/            one file per screen, including legal.js
  app.js              boot, route table, delegated event handling
assets/fonts          Manrope and Poppins, latin subset, plus the OFL
assets/icons          the mark, favicon, app icons, all without alpha
assets/img            placeholder note, real photography goes here later
ios-config/           hand written files for the generated Xcode project
scripts/              publishing, setlist resolving, icons, cache stamps, www/
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

## Search, and the two circles in the top bar

The right end of the header carries three circles now: light or dark, search,
and your initials, in that order.

**Light or dark** is the same preference as the Dark mode switch on Your
account and writes to the same place, so the two are always in step. The icon
says which mode you are in, a sun or a moon, rather than which one the tap
will give you; the button's label says the action in words, for VoiceOver and
for anybody who stops to think about it. A phone that has never chosen either
follows the system, and the disc follows it too.

**Search** opens one box that looks through the whole app. Two halves,
indexed two different ways, and `js/search.js` says so at length at the top of
the file:

- **What the church has published**, read straight out of `HC.data`: every
  message, every guide and every question inside it, announcements, events,
  groups, serve teams, next steps, setlists, content pages, the reading plan,
  the nine practices, and the church's own details, down to the service times.
  The records are walked generically rather than field by field, so a new
  column or a new key inside a JSON blob is searchable the day it lands and
  nobody has to remember this file.
- **What the screens say**, which is the ledes, the notes and the empty states
  that live as strings in `js/screens/*.js` rather than as rows. Nothing
  exports them, so the index draws each screen and reads its text. That
  happens inside a `<template>`, whose content is inert, which is what stops
  it pulling down every photograph in the app to count words nobody will read.
  The Group tab and Admin are deliberately not drawn: a room is a private
  conversation, and Admin fetches.

Your own journal is on the index because it is yours and it never leaves the
phone, and it comes straight back off the moment the journal lock is on. A
group room is not on it at all.

Nothing here reaches the internet. The index is built the first time somebody
searches, costs a few milliseconds, and is thrown away whenever the content
under it moves. Results are ranked with the thing itself above the screen it
is listed on, the matched words are marked in a line of the text they were
found in, and tapping a row opens exactly what it names.

Tests: `tests/search.test.js` for everything answerable without a page, and
`tests/e2e/search.js` for the rest, which is layout and traffic.

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

## Sunday's setlist

**Worship**, the first module behind •••, is what the band played, a week at
a time. The date and the message sit at the top as a carousel you swipe
between Sundays, and under it the songs in the order they were played, each
one its album art, its name, who sings it, and a way into it on YouTube,
Spotify or Apple Music, plus the lyrics. The current week is the slide it
opens on and older weeks are to the right, which is the direction the archive
runs everywhere else in this app.

Publish one with **`/new-worship`** and a list of the songs, however it was
typed. It reads the artists off the line and then runs
`scripts/resolve_songs.js`, which searches iTunes for each song and takes the
album art and the Apple Music link off the best match. That much needs no key
and no account. Spotify, YouTube and the lyrics each need one free credential
in `.env`, listed in `.env.example`, and a platform without one is left out of
the row rather than guessed at.

**The gap was only ever Spotify and YouTube.** Album art, the Apple Music
link and the canonical title and artist come from iTunes Search, which needs no
key and has picked the right recording every week. Those two links were the one
thing a published set was missing.

**They come from a web search, not an API.** The command runs
`WebSearch` scoped to one domain at a time and checks each result against
rules written down in `/new-worship` Step 3b: the URL has to be a `/track/` or
a `/watch?v=`, and on Spotify the artist has to match the half of the result
title that comes after "song and lyrics by", because `Holy Spirit (Jesus
Culture Cover)` and `Holy Spirit ... by Jesus Co.` are both real results for
this church's own setlist and both are the wrong record. No key, no account,
and nothing published that was not checked.

**One call used to do all of it.** Odesli answered for every platform at once,
unauthenticated, and then retired public access to that endpoint: it returns
401 `PUBLIC_API_ACCESS_DEPRECATED` to anybody without a key now. Had the
resolver kept leaning on it, every set would have quietly published with art
and an Apple link and nothing else, and the summary would have said "1 link"
as though the songs simply were not on Spotify. Keys are optional accelerators
now, listed in `.env.example`, and the church needs none of them.

**The resolver is a script rather than instructions, and that is the point.**
The first setlist went up with four titles and no art, because the pipeline
lived in prose, the egress proxy refused the calls, and prose has no way to
fail loudly. The script exits 2 when a song comes back thin and 1 when it
could not reach a service at all, so "published with gaps" and "nothing
resolved" stop looking the same. Nothing in it is ever invented: a song it
cannot match keeps its title and its artist and loses everything else, which
the screen draws as the house cover and no buttons.

It also reuses what earlier Sundays resolved, so a song played in June keeps
its links in August, and it refuses to choose when a line names two
recordings: `Holy Spirit: Jesus Culture or Bryan & Katie Torwalt` is flagged
for asking rather than settled by picking the first one and hoping.

**The setlist does not carry the sermon's title.** `worship_sets` has no
column for one. The header resolves it through `podcasts.title` every time it
draws, so the Monday rename in the section above reaches this screen too, with
nothing to keep in step. A set published on the Sunday afternoon has no
`sermon_id` yet either, and the screen finds the message by date until
`/new-podcast` fills the id in. On the rare Sunday with two messages preached
on it, a date has two answers, so the screen shows none and the id is what
settles it.

-----

## The Cal tab

Behind the ••• menu, next to Worship: a month you can walk through, the day
you tapped underneath it, and the church's upcoming events under that.

**It is where the events from the Connect tab went.** They were the fourth
section of Connect, below the group finder and the serve teams, which is a
long way down a screen about finding your people. Nothing about an event
changed in the move: the same rows, the same editable description, the same
Add to calendar button. What is new is the month above the list, because "what
is on, and when" is a question a list answers badly.

**Every date on it is one `events` row**, whether somebody typed it here, ran
`/new-event`, or approved one the newsletter intake parsed out of an email.
The screen never asks where a row came from, and the review queue in
`0038`–`0041` is untouched by it: a parsed event still reaches this calendar
through `hc_admin_approve_event` and nowhere else.

**A day with something on it is the only kind you can tap.** It carries a dot
and full strength ink; tapping it opens that day under the grid and tapping it
again closes it. Today wears a ring instead of a fill, so it never competes
with the day somebody actually opened. The list below the grid is upcoming
only, today included: anything that has already happened is looked up in the
month, which is a thing the old list could not do at all.

**An admin gets three more things**, and they are the reason
`0042_event_admin_writes.sql` exists: **Add an event**, a pencil in the corner
of each one, and an x beside it. Until that migration the only ways to fix a
wrong date were a laptop and the Supabase dashboard, neither of which is in
the hand of the person who spots it on a Sunday morning. The x asks first and
then deletes for good, because an unpublished event is on no screen in this
app and hiding one would be losing it somewhere nobody can look.

The pencil fetches the row rather than reading the copy on the glass, and that
is not caution for its own sake: `js/content.js` flattens `time_label` and the
formatted clock time into one field for drawing, so writing the app's own copy
back would turn "All three services" into a time nobody can parse. The form
writes six columns and leaves `signup_url`, `capacity` and `category` alone,
so a typo fixed on a phone cannot blank the registration link on a serve day.

`tests/calendar.test.js` holds the arithmetic still: a February that starts on
a Sunday, a leap one four years later, a month with a lead and a tail, and the
nine in the morning that an event with no clock time gets at both ends of the
trip.

-----

## The Practices

Nine practices behind the ••• menu: Sabbath, Prayer, Fasting, Solitude,
Scripture, Community, Generosity, Service, Witness. A grid of nine, and one
page that all nine are drawn with, so they stay in the same order and the same
shape as each other however much or little any one of them has to say.

**These are the one piece of content that does not live in Supabase.** The
words come from practicingtheway.org and the videos from their playlists.
Neither belongs to this church, neither changes weekly, and neither is
something anybody here should be editing in a table at midnight. So they are
generated once into `data/practices/*.json`, reviewed by a person, and
committed. The app reads those files and nothing else: it never scrapes that
site and never calls the YouTube API on anybody's phone.

To generate them:

```
export YOUTUBE_API_KEY=...              # or have yt-dlp on PATH
npm run practices -- --report           # propose the mapping, write nothing
npm run practices -- --write            # once the mapping looks right
```

`--report` is the default and `--write` has to be asked for on purpose. The
reason is the mapping. A playlist is not guaranteed to line up with the site's
sessions, and one of these has thirteen videos against four written sessions,
so the script proposes pairings, marks each one `certain` or `GUESSED`, lists
what did not map at all, and prints every flag it raised. A guessed pairing
baked into a data file is invisible from then on: it does not fail, it just
shows the wrong video under the wrong session forever. Read the report.

Flags also travel into the file itself, so whoever opens one in six months
sees the same warnings as the person who generated it. Promotional and
seasonal copy on the site, book preorders in particular, is flagged and kept
out of the data rather than pulled into the app verbatim.

If the site or YouTube cannot be reached from the machine doing the build,
both inputs can be handed over from disk instead:

```
yt-dlp --flat-playlist -J "https://www.youtube.com/playlist?list=PL..." > sabbath.pl.json
npm run practices -- --write sabbath --html sabbath.html --playlist-json sabbath.pl.json
```

`npm run practices -- --stub` writes placeholders with no content and no
network, which is what ships until a real run replaces them. The full
walkthrough, including how to fill a practice in by hand and what to check
before shipping one, is in **`PRACTICES_CONTENT_PROCESS.md`**. A practice with a
placeholder file says so on its page rather than rendering an empty one.

Video plays inside the app, in an iframe, and there is no link out to YouTube
anywhere on these screens. A video whose owner has disabled embedding is
dropped rather than degraded into one, and the build flags it so somebody can
still do something about it.

-----

## Alpha

One page behind the ••• menu, straight after Practices, for somebody who has
never done Alpha and is deciding whether to. What Alpha is, the three parts of
a night, the eleven questions it works through, two of Alpha's own films, the
four things people ask before they sign up, and a registration at the bottom.

It is deliberately not a course. Alpha publishes a film for every session, a
leader's handbook and a training track, and none of that belongs on a screen
somebody opens on a Tuesday night to decide whether to come to dinner. The rule
in `js/screens/alpha.js` is one shape in one order, and anything that would be
a twelfth section is a reason to cut.

**Whose work it is** gets the same treatment the Practices credit gets, in the
same place under the header: Alpha's course, Alpha's films, and a link to
alphausa.org. Home Church wrote the sentences *around* it and every one of
those is editable in place. The eleven questions are not, for the reason the
Practices teaching is not: they are the course, and rewriting one would put a
question on the screen that Alpha never asks.

Both videos play inside the app on the same poster and the same play badge as
everything else, and both ids were checked against YouTube's oEmbed before they
were written down, which is how a video whose owner has disabled embedding is
caught before it ships as a poster that does nothing.

**Alpha runs in seasons, and the switch is the point.** `church_profile`
carries `alpha_in_season`, `alpha_signup_url` and `alpha_off_season_note`, the
same three the group finder has had since `0007`. The registration is a Church
Center event whose number changes every time a new run opens, so it is a column
rather than a constant; turning the boolean off takes the button off the screen
entirely and puts the between seasons note in its place. A live signup button
over a registration that closed in March is the failure this page would
otherwise walk into on its own, quietly. Both are edited from the Supabase
dashboard, and only the note is editable in the app: a switch is a decision and
a URL is a destination, neither of which belongs in a textarea. See
`0035_alpha.sql`.

The same registration is also `next_steps.step-alpha` on the Connect tab, which
is a different invitation to the same room with its own title and its own
button. Two rows, one destination, and both want changing when the season
turns. They are deliberately not resolved through one another: a next step is a
line in a list the church curates and may retire, and the Alpha screen's only
button must not disappear because somebody tidied that list.

-----

## Publishing content without an App Store build

Guides, events, podcast episodes, and future content types have a home in
Supabase, so publishing and editing happen without touching app code and
without waiting on a review. Full documentation is in
**`supabase/README.md`**, kept there rather than duplicated here so the two
cannot drift.

The short version. Fourteen tables, publicly readable with the anon key:
`series`, `guides`, `podcasts`, `events`, `announcements`, `reading_plans`,
`worship_sets`, `groups`, `serve_teams`, `next_steps`, `church_profile`,
`podcast_show`, `content_pages`, and `app_settings`. Between them they hold
everything the app renders, so no content change needs a build.

Ten of them are writable only with the service role key. **Three are not:
`announcements`, `content_pages` and `app_settings` can also be written by a
signed in admin, from inside the app**, which is what the Admin dashboard is.
See "The admin dashboard" below. **`events` is the fourth and it is a different
shape**: it still has no write policy for any client role, and an admin reaches
it only through the named functions in `0042_event_admin_writes.sql`, which are
what the + , the pencil and the x on the Cal tab call. Six columns, checked
inside, and nothing else on the table can be touched from a phone. Seven slash
commands drive the rest:

| Command | Does |
|---|---|
| `/new-guide` | Sermon PDF to a full guide, written to `guides` and `podcasts` |
| `/new-event` | Asks for what is missing, confirms, writes to `events`, which the Cal tab draws |
| `/new-podcast` | Episode to `podcasts`, links its guide and that Sunday's setlist, puts the real title on the message |
| `/new-worship` | Sunday's songs to `worship_sets`, with their art, their links and their lyrics |
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

## The admin dashboard

Everything above is publishing from a keyboard with a secret on it. This is the
other door into the same tables: **Your account → Admin**, drawn only for a
signed in person whose `profiles.role` is `admin`. Nothing in it needs the
Supabase dashboard, a slash command, or a build.

Three sections.

| Section | Does |
|---|---|
| **Announcements** | Write, edit, delete the cards on Home. Title, the words in a rich text editor with bold, italic, underline, lists, hyperlinks and the scripture button, as many pictures as it needs, a YouTube link that plays inside the app, a link with a thumbnail, and the dates it goes up and comes down. Posting can send a push notification to everybody, and can pin the announcement as a banner. |
| **Users** | Everybody who has signed in, with their name, email and role. Promote to admin, demote to member, remove an account entirely. |
| **App settings** | The switch for **Edit mode**, below, and then the switches and short messages that change the whole app, drawn as real toggles and text fields rather than as JSON. Ships with a pinned Home banner and its message, and a default for whether posting an announcement offers to notify. |

**Content is hidden.** There was a fourth section, a form over `content_pages`
holding one paragraph on Give, and Edit mode does that job in the place the
words actually are. The section is still in `js/screens/admin.js` behind a
`hidden` flag on its row in `SECTIONS`; taking the flag off puts it back, and
the route draws the menu while it is on so an old history entry cannot land on
a screen with no way in. Edit mode's switch does not go back with it — it lives
in App settings now.

**The first admin is made by hand and only once**, because until one exists
there is nobody who can promote anybody:

```sql
update public.profiles set role = 'admin'
 where id = (select id from auth.users where email = 'you@example.com');
```

After that, admins promote each other from inside the app.

**Pinning an announcement** is the one control on that form whose effect is
outside Home. With it on, the announcement's title rides a strip under the top
bar on every tab, tapping the strip opens that announcement's own page, and an
x on the right of it puts the strip away on that phone for good. It is
deliberately the loudest thing the app can do, so it is off unless somebody
turns it on, and the strip retires when the announcement's own `ends_on` does
rather than on a second schedule of its own. It is a separate thing from the
pinned Home banner under App settings, which is a sentence with no announcement
behind it and so has nowhere to send anybody: that one stays, on Home, and is
not dismissible. The migration is `0028_announcement_pin.sql`.

**Three guards are worth knowing about**, because they are deliberate and will
otherwise read as bugs. An admin cannot change their own role and cannot remove
their own account from this screen, so the last admin cannot lock everybody
out; deleting your own account is under Your data, where it has always been.
And an announcement that is a draft, or dated for next month, or already
expired, has no Notify button, because a push cannot be unsent and pointing
somebody at a card they cannot see is worse than saying nothing.

**Hiding the Admin row is presentation and nothing more.** Every button behind
it is checked by the database: `hc_is_admin()` in the policies on those three
tables, and an explicit check on the first line of `hc_admin_set_role`,
`hc_admin_list_users` and `hc_admin_send_announcement`. A member who forged
their way to the screen would find that nothing on it works, which is the
outcome to want. `supabase/tests/0025_admin_role_test.sql` asserts that as a
real member against real policies rather than reading the migration and
nodding, including the one path that is easy to miss: everybody has always been
allowed to write their own profile row, and `role` is a column on it, so the
guard is a trigger rather than a policy.

**The review queue now says something.** The newsletter intake runs every
twenty minutes and used to write drafts in silence, so the only way to learn
there was a queue was to remember to look, which most weeks meant a newsletter
that arrived on Tuesday reached Home on Sunday. A run that adds anything now
sends a notification, and there are two of them because there are two queues:
**Announcements waiting** and **Dates waiting**, matching the split `0041` made
between approving the wording of a card and vouching for a date that lands in
four hundred calendars. Both are switches under Notifications in Your account,
both are on by default, and both are drawn for admins and for nobody else.

They are the first notifications in this project addressed to a person rather
than to whoever asked for them, which is a line `0010` and `0012` deliberately
did not cross and `0043` crosses on purpose, at length, in its header. Two
things make it safe rather than convenient. `device_tokens.admin_user_id` is
writable only by `hc_set_admin_device_token`, which writes `auth.uid()` rather
than anything it is handed and refuses anybody the database does not agree is
an admin. And the sender establishes who is an admin from `profiles` on every
single send, so the send after a demotion is the last one that phone gets, with
no cleanup job and no window.

**One admin approving settles it for the rest.** Everybody is told at once, so
more than one person can be looking at the same card, and the approve functions
claim the row by its review state: the first tap wins, and the second comes
back naming the person who got there first rather than reporting an error about
a row that is fine. Afterwards the Posted list carries an internal note,
**Approved by Ada Lovelace**, and its date underneath when the date was
approved too. The note lives in `review_approvals`, which is a table of its own
rather than two columns on `announcements` for one reason: the app's content
sync reads announcements with the publishable key, so a name stored there would
be a name downloaded by every phone in the church. There is no anon read path
to that table at all.

**And every announcement says who posted it, to the people who get asked.** An
admin or a leader reading a card on Home sees the line **Announcement 09/14/2026
· by Ada Lovelace**, and the announcement's own page carries the same note under
its title; one parsed out of the weekly email reads **from the email
newsletter** instead. Nobody else sees any of it, because to everybody else this
is a notice from their church and not an audit trail. The name is written by a
trigger on `announcements` from `auth.uid()`, so it cannot be forgotten by one
of the four doors into that table and cannot be dictated by whoever is walking
through one; an announcement written by `/new-announcement` carries no name at
all, because nobody was signed in and a guess would be worse than a blank. It
lives in `announcement_authors` for `review_approvals`' reason, said again in
`0045`'s header: a name on the announcements table is a name every phone in the
church downloads with the announcement. This is the first internal note in the
app that leaders see as well as admins, which is `hc_is_leader()` in the policy
where the others have `hc_is_admin()`.

The migrations are `0025_admin_role.sql`, `0026_admin_content.sql`,
`0027_announcement_push.sql`, `0028_announcement_pin.sql`,
`0033_announcement_media.sql`, `0043_admin_review_push.sql` and
`0045_announcement_authors.sql`, each with the full reasoning in its header.

### An announcement's own page

**A card on Home opens the announcement it summarises.** The card carries the
label, the title, the first picture, the opening of the words and a line saying
what else is behind it; tapping it pushes a page with the whole thing: the
words with their formatting, the video, every picture, and the link. It is a
pushed view like a guide or a journal entry, so it carries the arrow in the top
bar, the back disc at the bottom left, and no sideways drag.

The page holds an announcement whose dates have run out, on purpose, and says
so in a line under the title. A card comes off Home at midnight because Home is
what the church is saying today; a page is an address, in somebody's history
and behind a notification they left on their lock screen for a fortnight, and
emptying it under a reader would be worse than dating it.

**Three things about what an announcement can hold** are worth knowing:

  * **The words are two columns.** `body_html` is the markup the editor wrote
    and the page draws. `body` is its plain text mirror, written on every save,
    and it is what the push notification puts on a lock screen, what the Admin
    list shows under each row, and what the card on Home prints under the
    title. Nothing types into `body` directly.
  * **The video plays here.** A YouTube link becomes a poster with a play
    badge, and the iframe only exists once somebody has tapped it, which is the
    same arrangement the nine Practices use. Nothing is requested from Google
    until then. A playlist link is refused by name, because "videoseries" is a
    valid eleven character video id and would otherwise render an error player.
  * **A link's thumbnail is a choice, not a scrape.** The app fills one in for
    a YouTube link and for a link that is itself a photograph, and otherwise
    leaves it empty for an admin to paste or upload. There is no server that
    fetches URLs to read their `og:image`, and there is not going to be: that
    is a small open proxy pointed at the internet in exchange for a picture.
    The x in the thumbnail's top right corner takes it off and keeps the link.

Every link in an announcement, including the ones inside the words, opens in
the phone's own browser through the same `openExternal()` every other outbound
link in this app goes through. Markup somebody typed is sanitized against the
allowlist in `js/richtext.js` twice, once when it is saved and once before it
reaches the page, and only four schemes survive: `http`, `https`, `mailto` and
`tel`.

### Edit mode

**Admin → App settings → Edit mode**, the first switch on that screen, turns
the rest of the app into something an
admin can type into. Every sentence the app is willing to have changed outlines
itself with a pencil in the corner; tapping one turns it into a text box with
Save, Cancel, and sometimes Reset to original. Saving is live for everybody on
their next content sync, with no publish step and no build, the same as the
rest of Admin.

It exists because the form is the wrong shape for the thing that actually
happens, which is somebody reading Give on a Sunday, noticing one sentence
lands badly, and wanting to fix that sentence rather than navigate to a page
editor and find it.

**Where the line is.** Descriptions, subtitles, captions, eyebrows, empty
states, notes under buttons, and the words on a button are editable. Two things
are not, and the difference is navigation:

- **A screen's title and a section's heading.** They are how somebody finds
  their place, they are what the right-hand index rail lists, and the tab bar
  agrees with them. A church that renames "Serve teams" has renamed one of
  three places that phrase appears.
- **An item's own name** — a serve team's, an event's, a group's, a message's.
  That is what the thing is called on a Sunday, in a bulletin, and in
  somebody's calendar. Those stay on the Admin form, where the whole item is in
  view.

**What is editable.** Three kinds of sentence, saved three ways:

| | Where the words live | Examples |
|---|---|---|
| **Rows** | a column in a table the app already syncs | serve team descriptions, how often a team serves and what it asks first, next-step descriptions and their button labels, group descriptions, event descriptions, series subtitles and blurbs, the sentence under a message, a guide's subtitle, what the reading plan reads this week, the church's tagline and its invitation to serve, the between-seasons note, the podcast blurb, an announcement's label, and its words while they are still plain text, a content page's eyebrow, opening paragraph and section bodies |
| **Slots** | a string in a source file, overridden by a row in `text_overrides` | the line under the Give button, Home's "no guide yet", Listen's "nothing yet", the group finder's no-match line, the notes under the next-step and serve buttons, the lines under each module on More, the Journal's intro, and the words on the Give, Directions, Follow-the-show and Add-to-calendar buttons |
| **Settings** | the text half of an `app_settings` row | the pinned banner's sentence, edited on Home where it appears. The switch that puts it there stays in Admin → App settings: fixing a typo is a wording, taking the banner down is a decision |

A slot with no override draws the words that ship inside the app, so an offline
phone and a project without `0030` are unaffected. **Reset to original** deletes
the override rather than writing the old words back. Saving an empty slot is
allowed and means the church took that line off the screen; a database row
cannot be emptied, because there is nothing underneath it to fall back on.

**Nothing editable can break the app, and that is enforced rather than
promised.** Every editable column is named in one allowlist at the top of
`js/edit-mode.js`; a column not on it cannot be opened for editing however a
screen asks, and `tests/edit-mode.test.js` asserts that list matches the grants
in `0031` exactly, in both directions. Each exclusion was checked against what
actually reads the value:

| Not editable | Because |
|---|---|
| `groups.day`, `groups.neighborhood` | the finder's filter chips are built from these values and compared against them |
| `events.starts_at`, `time_label`, `location` | the Cal tab parses them back into a real Date for Add to calendar, and all three land in the entry a person keeps. They are edited as a whole event, in the form behind the pencil on that screen, where the date and the time are in view together |
| `announcements.title` | the notification already said it on every lock screen |
| `announcements.body_html` and its pictures, video and link | Edit mode is a textarea over one sentence, and a textarea over markup shows somebody their own `<strong>` tags. Edited on the Admin form, where the editor that made them is. An announcement still written in plain text is editable in place, which is what that feature is for |
| church address, service times, giving URL, SMS number and keyword | facts and destinations, not sentences |
| `guides.reflection_questions`, `group_sections` | a group room copies its questions when it opens, so an edit would change the next room and not tonight's |
| the guide reader's prose | `js/highlight.js` turns a selection there into a highlight and a note; a tap that might mean "edit" and might mean "highlight" does neither well |
| `reading_plans.total_weeks` | the progress bar divides by it |
| the Practices' teaching, sessions and videos | Practicing the Way's copyrighted material, generated by `scripts/build_practices.js` and reviewed before it ships. Home Church's own words *around* it — the opening line, the credit, the texting invitation, the empty states — are editable |
| Alpha's eleven questions | Alpha's session titles. Rewording one would put a question on the screen that the course never asks. The church's framing around them — the opening line, the credit, the three parts of a night, the four answers, the signup lead and note — is editable |
| `church_profile.alpha_in_season`, `alpha_signup_url` | a switch is a decision and a URL is a destination. The paragraph beside them, the between seasons note, is a sentence and is editable |
| `church_profile.groups_note_in_season` | a switch is a decision, the same answer as `alpha_in_season` above. It says which face the home groups card wears, and it is set by the parse that wrote the words or by the button that ends a season, never typed. Not to be confused with `groups_in_season` beside it, which draws the finder. Migration `0049` |
| `church_profile.groups_note_image_url` | a URL, and the same reasoning as `alpha_signup_url`, with a sharper edge: a picture column an admin session could write directly is a tracking pixel on the Connect tab one paste later. The flyer is uploaded and saved through `hc_admin_set_group_note`, which checks it is a file in this project's own bucket. The paragraph above it is a sentence and stays editable in place, as it has been since `0030`. Migration `0048` |
| the legal pages | App Review was shown those exact words |
| Journal entries, group rooms | people's own writing. The Group tab is also excluded for a mechanical reason: it rebuilds itself every eight seconds from its poll, so an editor opened there would lose focus mid-sentence |
| privacy and behaviour promises | "nobody else can see this", "saved on this phone", the warning before a guide swap. Rewording those would make the app describe itself wrongly, which is a different kind of mistake from a stale caption |
| the guide's coverage line | `repaintCoverage()` writes it straight into innerHTML on every checkmark, outside the router |

**Three promises about the switch**, all kept by the device rather than by the
database:

- Only an admin sees it, and only an admin can write. `hc_is_admin()` decides,
  and `supabase/tests/0030_text_overrides_test.sql` and
  `0031_editable_columns_test.sql` assert the refusals as a real member and a
  real signed out phone.
- It is on for **that phone only**, for as long as it is being used. There is
  deliberately no row anywhere recording that edit mode is on.
- It turns itself off when the app is closed, and after **30 minutes** with
  nothing touched. Closing the app reloads `js/edit-mode.js`, and a reloaded
  module is one with the switch off. A pill above the tab bar says it is on
  while it is, and is the fastest way out.

**The lock underneath all of it** is that migration `0031` grants an admin
session the individual prose *columns*, not the tables, so a phone in edit mode
cannot unpublish a message, rename a group, retitle a sermon, move the giving
link, change a service time or empty a table even if something asked it to.
Those are 42501 from Postgres before a policy is consulted, and the SQL test
asserts the exact set of updatable columns per table rather than a few
examples.

**And it is checked by changing things rather than by reasoning about them.**
`npm run test:content` rewrites every editable field in the app to something
hostile — emptied, `<script>` tags, unbalanced quotes, 2000 characters, emoji
and newlines — then draws all eight screens and asserts each one still paints,
does not push the layout sideways, and renders the words rather than running
them. It finishes by checking the two places that read a value back instead of
drawing it: the group finder still matches its own chips, and an event still
parses into a calendar entry. 132 assertions, no database needed.

Who last changed a sentence and when is recorded on `text_overrides`. The
migrations are `0030_text_overrides.sql` and `0031_editable_columns.sql`, the
module is `js/edit-mode.js`, `tests/edit-mode.test.js` covers the saving, the
failing, the allowlist and the clock, and `tests/e2e/editable-content.js` is
the one above.

Who last changed a sentence and when is recorded on `text_overrides`. The
migration is `0030_text_overrides.sql`, the module is `js/edit-mode.js`, and
`tests/edit-mode.test.js` covers the saving, the failing, and the clock.

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

### The way in, the screen between the greeting and Home

`js/gate.js`. On any launch where this church has accounts configured and this
phone is not signed in, the greeting does not leave when it is finished. The
house and "Welcome home." climb, and two buttons come up underneath them: **Log
in with email** and **Continue as guest**. Choosing the first slides them off
to the left and brings the address panel in from the right edge, and sending
the code slides that one away for the panel the six digits are typed into. The
code that arrives is the same code the Profile screen has always asked for,
from the same `requestCode` in `js/auth.js`. Signing in ends with light coming
out from behind the mark and the greeting changing its mind: *You're in!*

**It is drawn on the splash rather than being a screen of its own,** and that
is the whole design. A route would mean the greeting fading out and something
else fading in. What was wanted, and what this is, is one movement: the pieces
already on the glass make room. `js/splash.js` hands the layer and its own exit
to `js/gate.js` at the end of the greeting's hold, and takes it away again when
the gate says so.

**Continue as guest is not a courtesy, it is the reason this is allowed to
exist.** Nothing in the app is behind it, the choice is not written down, and
the next launch asks again at no cost to anybody who keeps saying no. If it
ever reads as nagging, `shouldGate()` is one function and the place to remember
an answer is `HC.store.updateProfile`. See 2.2 in `APP_STORE_COMPLIANCE.md` for
why the button's size and placement are a compliance question and not a taste
one, and `tests/e2e/gate.js` for the whole flow driven in a browser, sign in,
wrong code, guest, and Reduce Motion.

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

The lockup lives top-left in the header on every tab, sliding out of the way
once the screen scrolls and the screen title takes the left edge. It used to
slide to the centre of its slot; since light-or-dark and search joined the
initials it goes to the far end of the slot instead, and steps down from 20px
to 17px on the way, which is what keeps it clear of the longest tab title
("Practices") on the narrowest phone this design targets. The arithmetic is
asserted at three widths against every tab title in `tests/e2e/search.js`
rather than left to be eyeballed. Pushed views (Guide reader, Profile, Leader)
show no logo, back arrow and title fill that role instead. That gold, sampled from the source file, is a mark color only,
it is not part of the UI palette and no interface element should adopt it.

-----

## Decisions worth not undoing

- **One navigation system.** Five tabs, a ••• tile, and one Profile screen. No
  drawer. The overflow sheet that ••• lifts is not a second system and must
  never become one: it is the tab bar continued, made of the same plinth, and
  what is behind it is stops on the same sideways swipe rather than a menu of
  places you have to come back from. The moment it grows its own hierarchy it
  has stopped being that.
- **No shadows.** Surfaces separate with color and 0.5px hairlines.
- **No streaks, badges, day counters, or completion percentages.** The reading
  plan shows position, not pressure.
- **`--hc-accent` is decorative only.** It fails contrast on paper at roughly
  2.4:1. Anything a user has to read uses `--hc-ink`, `--hc-mid`, or
  `--hc-accent-deep`.
- **The reading face is set at 400 for text and 500 for titles.** Manrope has
  weights down to 200 and none of them belong in this app: a light sans is
  thin on paper stock and thinner still as light text on the dark theme.
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

1. The per-episode Spotify links. The back catalogue links each message to its
   own episode page on the podcast host, which works, and `podcast.showUrl`
   points at the show on Spotify. Swapping `episodeUrl` to the matching
   `open.spotify.com/episode/...` link is a per-row change, and the Listen
   button relabels itself to "Listen on Spotify" automatically when it sees a
   Spotify URL. The newer episodes are already published that way.

   A row with no `episodeUrl` at all is a different state and reads as one:
   the guide is published days before the audio posts, so from the Thursday
   to the Monday that message's link says "Audio coming soon!" and still
   opens the show, which is where the episode will appear. `/new-podcast`
   filling in `episode_url` is the only thing that changes it. One answer,
   `HC.data.episodeLabel`, read by both Listen and the Worship header, and
   the seam is covered in `tests/listen.test.js`.
2. The 28 messages with no preacher recorded and the 43 with no passage, both
   because the episode notes do not state them. They render cleanly without,
   the byline just gets shorter. Fill them in as you know them.
3. Whether a licensed display typeface should replace Manrope, and whether
   Poppins 800 is still the right partner for it in the headers.
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
