# The App Store preview

A minute and fourteen seconds of Home Church for the website, and a thirty
second cut of the same run for the video slot on the store page. Built with
[Remotion](https://www.remotion.dev), which renders React to video by drawing
the composition in a browser one frame at a time.

```bash
cd video
npm install
npm run render              # out/home-church-app-store.mp4, 1320 x 2868, 29.6s
npm run render:marketing    # out/home-church-marketing.mp4, 1080 x 1920, 73.6s
```

**Both cuts need `public/music.m4a`, which is not in the repository.** It is a
licensed track, and a licence is something somebody holds rather than
something a git history should carry a copy of. `prepare.mjs` says so out loud
if it is absent. Everything below about the grid depends on that particular
track; see **Cut to the music**.

Both scripts run `npm run stage` first, which copies the app into `public/app`
and reads the church's live content into it. That needs the network; the render
itself does not.

The first render downloads a headless Chrome, once. Behind a network that will
not allow that, point it at one already on the machine:

```bash
HC_CHROME=/path/to/chrome-headless-shell npm run render
```

To work on it, `npm run studio` opens the timeline with a scrubber, and every
save reloads. It is the only sane way to change the choreography.

-----

## What is actually in the frames

**The app.** Not a recording of it, not a rebuild of its screens in React, not
a slideshow of the six stills in `screenshots/`. The composition mounts an
iframe, loads the shipping `index.html` into it, and drives the running app
with the frame number: the same HTML, the same CSS, the same JavaScript,
painting live inside the video.

So every movement in it is the app's own. The discussion questions unfold
because the guide reader unfolds them. The calendar opens a day because the
day was tapped. *Note this* comes up over a sentence in the Overview because
`js/highlight.js` saw a selection and put it there, and the sentence is
underlined afterwards because there is now a real row in the journal anchored
to those characters — the same row the Journal screen draws a card from thirty
seconds later.

**Including the navigation, where there is one.** A change of page is the round
button in the corner, the full screen list behind it, and the destination going
gold as it is pressed. A change of *section* is not: the take-home sections,
the Overview and the note written in it are one screen and three of its parts,
and opening the navigation between them says a thumb went somewhere and
then it does not go anywhere, which is a lie small enough to be confusing
rather than wrong. The list only comes up where the destination changes. Around
the guide the other hand-overs are taps: a row in the index, which pushes the
reader, and *My journal* at the foot of it, which pushes the Journal. That is the navigation the app ships with, `navStyle:
'button'` in `js/store.js`; the tab bar is still in there for anybody who wants
it back, and it is not what this shows. The list is built by the app at the
moment of the tap, so the video taps the app's own button rather than setting
an attribute, and only the fade is taken over frame by frame.

**And this week's content.** `prepare.mjs` reads the live tables once, before
the render, downloads every picture they point at, and writes the lot into
`public/app` as one file per table at the path `js/content.js` builds its
requests from. `config.js` then points the project at that folder, so the app
fetches this week's content with its own fetch, maps it with its own twenty
mapping functions and caches it with its own cache. Nothing is reached around
and no mapper is copied in here to go stale. The series on screen is the series
being preached, the setlist is Sunday's, and the noticeboard is the
noticeboard.

**Baked rather than fetched at render time** because Remotion renders with
several browser tabs at once and each one boots its own copy of the app. Eight
tabs asking the church's project for everything, mid shot, is eight chances to
disagree, and frames that disagree are frames that tear. Baked once, every tab
reads the same bytes off disk, the render needs no network, and the video is
reproducible. Re-running prepare is how it gets the next Sunday.

**A picture it cannot download becomes no picture.** Left as a link it would
be a hole on the screen: a broken-image box the height of a photograph in the
middle of Home. Emptied, every screen falls back to what it already draws for
a row that never had one, which on a series is the house cover. Every host
that failed is named in prepare's output, so it is obvious which one to allow
and re-run.

**It goes out through curl when fetch cannot.** Behind an egress proxy Node's
own fetch does not use it, because undici reads no proxy environment
variable, so a host the proxy would have reached comes back as ENOTFOUND
while curl fetches it fine. What that looks like is artwork that silently does
not arrive, from some hosts and not others, which is a confusing afternoon.
fetch first, because it is built in and it is what works on a laptop, and curl
second.

**The only thing edited on the way in is the featured video**, in both the
places it comes from. `app_settings.home_featured_video` is emptied: it puts a
YouTube embed under the greeting and starts it muted the moment the app opens,
and there is no YouTube in a render, so what Home draws instead is a black
rectangle with "Tap for sound" on it. The link in the staged copy of
`js/featured-video.js` is blanked for the same reason one layer down — the app
paints Home once off the bundled seed before any content arrives, and that
seed has no row for this, so every render tab would ask youtube.com for an
embed in the first second of its life. Nothing of that reaches a frame. It is
still eight requests to the internet from a render that needs none.

**And one thing added**: a `::selection` colour, in `AppStage`'s boot CSS.
Chromium draws a selection in its default blue, which is a colour nothing else
in a warm charcoal app comes near, and a scene about keeping a line out of a
sermon would have a stripe of Windows across it. A phone draws this in the
system accent, so there is no one right answer to copy; it is the app's own
gold at the weight its own marks use.

## What is in it

**Phase one only.** The church is launching in stages, and this shows what is
in the first one: Home, Calendar, Listen, Guide and Connect, and Settings,
Give, Services, Worship and Journal behind the ••• button. The group room and
Leader mode were in an earlier version of this video and are out of it now: a
store page that shows a later phase is a store page making a promise the
download does not keep.

| | Frames | | |
|---|---|---|---|
| Opening | 0 – 48 | The lockup, assembling | |
| Home | 48 – 240 | Down the noticeboard, past the service times, to this week's message | *Home* |
| Calendar | 240 – 432 | Two days opened, then everything coming up | *Calendar* |
| Listen | 432 – 600 | Past this week into the archive, one message opened for its notes | *Listen* |
| Guides | 600 – 720 | Every Sunday the church has written up | *Guides* |
| Self-Reflection Questions | 720 – 1056 | Opened, read down, one of them answered, then the one-liners | *Self-Reflection Questions* |
| Overview | 1056 – 1272 | Sunday's message in writing, then the fuller summary under it | *Overview* |
| Notetaking | 1272 – 1560 | A line highlighted, a note written on it, saved | *Notetaking* |
| Journal | 1560 – 1800 | Both of them under their sermon, then every sermon | *Journal* |
| Worship | 1800 – 1920 | A pass down Sunday's setlist | *Worship* |
| Connect | 1920 – 2040 | Get in touch, and the serve teams | *Connect* |
| Give | 2040 – 2136 | A thank you and one button | *Give* |
| Closing | 2136 – 2208 | The name, the service times and the address | |

**Every caption is the app's own words.** The line is the name of the page or
the section on screen, as the app writes it, the eyebrow above it is that
screen's own eyebrow, and under both is one sentence saying what the page is
for. Nothing in here is a slogan: an earlier version had lines like *all the
way back to 2024* over Listen, and a caption that advertises a page is a
caption telling somebody what to think about a screen they can see for
themselves.

**The Guide and the Journal are over half the running time**, in five scenes.
That is the brief: they are what the church most wants somebody to find first.
Worship, Connect and Give follow them and close the tour, Give last because
that is where a tour of a church ends.

**The guide is not shown in the order it is written in.** A guide opens on the
Overview, and an earlier cut read it straight down: summary, summary,
questions, one-liners, scripture, done. What that missed is that the summary
is the thing somebody reads and then *does* something with, so it belongs next
to the doing rather than three minutes before it. The index first, then the
half of the guide that is a take-home, then back up to the Overview, and the
last three scenes live there: a sentence out of it is highlighted, a note is
written on that line, the note is saved, and the Journal opens with it filed
under the sermon it came out of.

**Each scene opens on the thing its caption names.** The take-home scene is
the one that had to be fixed for it: an earlier cut arrived the way a guide
arrives, with the Overview out, and spent its first two seconds folding that
away before it got near a take-home question — so the words
*Self-Reflection Questions* sat over a screen of summary. Every section is
shut from the first frame now and the heading the caption names is the one in
the middle of the glass. The tap that opens it comes as the caption clears.

**Half the running time is somebody putting something *into* the app.**
Everything else in the video is the church's writing being read. Two scenes
are not. One of the take-home questions gets answered in the box underneath
it, with *Saved on this phone* appearing under the box on the last letter,
which is where `js/app.js` puts it. And a line of the Overview is highlighted:
*Note this* over the selection, the sheet, the words going in, *Done*, and the
line underlined in the page from then on.

**Both of them land in the Journal, which is the scene after.** It opens
scoped to that sermon, the way the pill at the foot of a guide opens it, with
the answer and the note under one heading. Then it taps *All* — the app's own
pill, in the app's own row — and the list widens to every sermon somebody has
written under, each shut into its own heading, and one folds back open. That
is the feature in a sentence: notes do not pile up in a list, they pile up
under the Sunday they came out of.

**Nothing in it is about running a group**, and that is a decision rather than
an oversight. The guide's best known half is the discussion questions, with a
checkbox on each one and an eyebrow reading FOR THE GROUP, and the Group tab
that makes them worth having is not in the first launch. Selling a group night
to somebody downloading the app on day one is selling them something that
needs seven other people and a Thursday. So the guide is shown the way one
person uses it on a Tuesday: the message written down, the questions to sit
with on your own, the lines worth keeping, and every passage that was read.
The discussion questions are still on the screen, because they are in the app.
They are just not what the words point at.

**Apple caps an app preview at thirty seconds.** That is the whole reason there
are two cuts. The store cut is the four pages the church leads with, Home,
Calendar, Listen and the Guide, with the Guide still the longest thing in it.
The note and the Journal are in the long cut only: the whole beat needs twenty
seconds to read, and twenty of thirty seconds would cost three of those four.

**A scene opens under whatever it was reached through.** The navigation, which
fades off the new page; a short dip, where a row was tapped and a view pushed;
or nothing at all, where the screen simply carried on. Then the caption comes
up over a dim and clears. The change of screen happens while the cover is
opaque, so a re-render never shows as a jump, and the scroll starts while the
caption is still up, so the dim lifts on something already moving.

**The sentence under each name is the thing that has to be readable**, and the
first cut of it was not: set in `--hc-mid` at the size the app sets a
timestamp, it was eight words going past at thirty frames a second, half the
size again inside the drawn phone. It carries weight rather than colour now,
near the ink of the line above at 500, and the sentences came down to about
seven words each, because a caption that needs three seconds is a caption that
is too long for a video.

**Every scene is a function of its own length.** The beats are fractions of the
time a scene has, so one description of what happens plays at both lengths
rather than two that drift. Caption timing is absolute, because reading speed
does not scale.

**A minute and fourteen is the length the church asked for, and getting back
to it was mostly one number.** Every scene used to hold still for 74 frames
before anything moved, which is two and a half seconds times eleven scenes:
twenty seconds of a video in which nothing happens. It is 56 now where the
navigation has to clear out of the way first and 40 where nothing does, and
that alone is seven seconds — without a caption being on screen for a frame
less than it was. The page simply starts moving while its name is still up,
which is better anyway: the dim lifts on something in motion rather than on a
photograph. The rest came an inch at a time, a second off nearly every scene
with the same beats still in it, and one thing cut outright — the Scripture
Index, which was the last second of the take-home scene, a list of references
unfolding under a screen already on its way out. It is still in the app. It is
not in the tour.

**What that costs is honest to say: this is a brisk minute and fourteen.** The
lever if it turns out to be the wrong trade is in `src/scenes.js`, and it is
not the pacing — it is the number of scenes. Dropping Worship and Connect
would buy ten seconds back for the nine screens that remain.

## Cut to the music

**The track is 75 BPM, which at thirty frames a second is 24 frames a beat and
96 a bar, exactly.** That is luck and it is the whole reason this is on the
grid rather than near it. A tempo that came out at 23.6 frames a beat would
drift a frame every third beat and a second across the piece, and the only
cures are resampling the music or letting the cuts wander. 75 at 30 divides.

**So every scene length is a count of beats** — `BEAT * 8`, `BEAT * 14` — and
every boundary lands on one by construction, with nothing to round off and
nothing to accumulate. The track is staged with its first 0.376 seconds
trimmed, which is where its own first beat falls, so beat one of the music is
frame zero of the video.

**The cut is not the boundary, on seven of the eleven.** A change of page here
is the full screen list coming up over the old screen, the route changing
behind it, and the list clearing on the new one, so what the eye registers is
the moment the list goes opaque rather than the frame the scene counter
changes. `MENU_OUT` is one beat and it now reaches full opacity *on* the
boundary rather than ten frames early, so the hit is on the beat; the list
clears over the half beat after. The four that are dips bottom out on the
boundary already, and the two that are not cuts at all — the take-home into
the Overview, the Overview into the note — are left alone, because snapping a
transition that does not exist only shoves a caption around.

**Four of the cuts landed on the track's own turns** without being asked to:
at 24, 64, 68 and 71 seconds the music changes gear and so does the picture.
That is the grid being right rather than anything clever.

**Changing the track means redoing this.** Measure the new tempo and the
offset of its first beat, and if the beat is not a whole number of frames,
pick a different track or accept drift. `BEAT` at the top of `src/scenes.js`
is the one number to change, and the eleven scene lengths under it are counts
against it.

## The two compositions

| id | Renders at | Runs | For |
|---|---|---|---|
| `AppStorePreview` | 1320 x 2868 | 29.6s | The store page. The app fills the frame, no device around it. |
| `Marketing` | 1080 x 1920 | 73.6s | The website and the socials. Every scene, inside a drawn phone on a warm ground. |

Both are built from the same scene functions, listed in `src/scenes.js` as
`APP_STORE` and `FULL`. A cut is a list of scenes with a length each, so adding
one to a cut adds its length rather than squeezing its neighbours, and the same
scene can run at two speeds in the two cuts without being written twice.

Both are laid out in logical points, 440 x 956 and 360 x 640, and rasterised at
three times that. 440 x 956 is the 6.9 inch iPhone's own coordinate space, the
one the app's CSS is written against, so the arrangement of pixels is the one
the phone draws rather than a narrow layout stretched to fill a tall frame.
`scripts/make_screenshots.js` writes the stills the same way.

App Store Connect also takes 1290 x 2796 for the same display class, which is
430 x 932 at three times. Two numbers in `src/Root.jsx` if the upload ever
wants it.

## Files

| | |
|---|---|
| `prepare.mjs` | Copies the app into `public/app`, reads the live content into it, downloads the artwork. Run by every npm script here. |
| `src/stage.js` | Finishes the content load, switches the refresh off so no tab goes back for more mid render, and writes the few weeks of journal the Journal scene needs. |
| `src/scenes.js` | The timeline. What happens, when, and the captions. |
| `src/drive.js` | The hands: every function that reaches into the running app. |
| `src/AppStage.jsx` | The iframe, and everything done to the app once it has booted. |
| `src/Preview.jsx` | The piece: the app, the veil, the words, the cards, and the music. |
| `src/Type.jsx` | The captions and the two cards. |
| `src/timing.js` | Keyframes and easings. |
| `src/theme.js` | The dark palette, copied from `css/tokens.css`. |

## Six things to know before changing it

**Scenes state positions, never steps.** Remotion renders with several browser
tabs at once and a tab can be handed frame 640 as the first thing it ever does,
so `on frame 300, tap the checkbox` renders correctly in the studio and comes
out of a real render with the box unchecked, or checked twice. Every line in
`src/scenes.js` says *at this frame this is the state*, and every function in
`src/drive.js` is written to be safe to call with the same answer sixty times
in a row. The header of `drive.js` has the long version.

**The app's own animation is switched off, and redrawn from the frame number.**
A CSS transition runs on the wall clock and a render has nothing of the sort:
frame 41 might be drawn eight seconds after frame 40 or eight milliseconds
after it, so anything mid-transition when the shutter opens is luck. `boot()`
kills every transition and animation in the iframe, and the movements that
matter are driven by hand instead. The collapsing sections are the nicest case:
the app animates them from `grid-template-rows: 0fr` to `1fr`, so a fraction of
an `fr` is a section caught halfway open.

**Anything staged needs a fixed sort key.** `src/stage.js` once let the app
stamp its own timestamps on three staged rows, and three calls in a row landed
in the same millisecond most of the time and straddled one occasionally. The
app sorts those rows on that timestamp and returns 0 on a tie, so their order
came down to whether the clock ticked between two lines of setup. Every frame
was correct on its own; the video tore between two different rows several times
a second, because Remotion renders in several browser tabs and each one boots
the app and gets its own answer. Date anything you stage, by hand. The two
entries the video writes on camera are the same rule one step further on: each
carries a stated id as well as a stated date, because `HC.journal.create`
mints a uuid otherwise, and eight tabs each minting one is eight different
entries with eight different timestamps — and the underline in the paragraph
is keyed on that id, so the tabs would not even agree about which words were
marked. Both go through the app's own create, with both facts supplied. See
`setNote` in `drive.js`, which has the long version, and `applyFrame`, which
states them once for the whole timeline rather than inside the scenes that
write them: the Journal scene shows both and is neither of them, and a tab
handed the Journal as the first frame it ever draws has never run a frame of
the guide.

**A timer the app sets is swallowed, and run by hand instead.**
`js/highlight.js` waits a fifth of a second after a selection changes before
it puts *Note this* up, which on a phone is what stops the bar flickering
under a thumb that is still moving the grab handles. A render has no fifth of
a second — but it does have real milliseconds between frames, so those timers
*do* fire, just not at any frame you can name. One landing between a frame
being driven and the shutter opening is the bar appearing early in one tab and
not in another. `boot()` drops that one timer on the floor and `setHighlightBar`
calls the same handler on the frame that asks for it. It is the same decision
as switching the transitions off: the app's behaviour is right, its timing
cannot be used.

**It has to work with the sound off.** App previews autoplay muted on the
store page, which is the one Apple guideline that bites here: there is a bed
under both cuts now and not a word of narration, and nothing in the piece
depends on hearing it. The music is a licence somebody has to keep track of —
see the note at the top about why it is not committed.

## What is not identical between two renders

Two things, both on purpose.

The app reads the clock, so Home says good morning, good afternoon or good
evening depending on when the render ran, and the calendar opens on the month
it is. And `npm run stage` reads the church's live tables, so a render made
after a new guide is published is a video with that guide in it.

That is the same decision `scripts/make_screenshots.js` made: a preview showing
a series that finished in the spring is a small lie on the store page, and the
fix is to re-render, which takes a few minutes. Re-run it the morning you
submit.

## Uploading it

App Store Connect, the app's version page, Previews and Screenshots, the 6.9
inch iPhone tab. One preview per size is plenty. It wants the poster frame
chosen from inside the video: pick the last one, which is the lockup, held
still for that reason.
