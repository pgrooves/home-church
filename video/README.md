# The App Store preview

A minute and fourteen seconds of Home Church for the website, and a thirty
second cut of the same run for the video slot on the store page. Built with
[Remotion](https://www.remotion.dev), which renders React to video by drawing
the composition in a browser one frame at a time.

```bash
cd video
npm install
npm run render              # out/home-church-app-store.mp4, 1320 x 2868, 29.8s
npm run render:marketing    # out/home-church-marketing.mp4, 1080 x 1920, 74.0s
```

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
because the guide reader unfolds them. Two questions tick because the video
clicks them and `js/app.js` handles the click, which is why the count above
them repaints from *18 in all* to *1 of 18 covered* to *2 of 18 covered* as
they land. The calendar opens a day because the day was tapped.

**Including the navigation.** Every change of screen in the piece is the round
button in the corner, the full screen list behind it, and the destination going
gold as it is pressed. That is the navigation the app ships with, `navStyle:
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

**The one thing that is edited on the way in** is `app_settings.
home_featured_video`, emptied. It puts a YouTube embed under the greeting and
starts it muted the moment the app opens, and there is no YouTube in a render:
what Home draws instead is a black rectangle with "Tap for sound" on it.

## What is in it

**Phase one only.** The church is launching in stages, and this shows what is
in the first one. The group room, Leader mode and the journal were in an
earlier version of this video and are out of it now: a store page that shows a
later phase is a store page making a promise the download does not keep.

| | Frames | | |
|---|---|---|---|
| Opening | 0 – 54 | The lockup, assembling | |
| Home | 54 – 288 | Down the noticeboard, past the service times, to this week's message | *Home* |
| Calendar | 288 – 558 | Two days opened, then everything coming up | *Calendar* |
| Listen | 558 – 768 | Past this week into the archive, one message opened for its notes | *Listen* |
| Guides | 768 – 876 | Every Sunday the church has written up | *Guides* |
| Discussion Questions | 876 – 1254 | Opened, read down, two ticked off | *Discussion Questions* |
| Self-Reflection Questions | 1254 – 1608 | And the one-liners and the scripture index under them | *Self-Reflection Questions* |
| Worship | 1608 – 1794 | A pass down Sunday's setlist | *Worship* |
| Connect | 1794 – 1980 | Get in touch, and the seven serve teams | *Connect* |
| Give | 1980 – 2124 | A thank you and one button | *Give* |
| Closing | 2124 – 2220 | The name, the service times and the address | |

**Every caption is the app's own words.** The line is the name of the page or
the section on screen, as the app writes it, the eyebrow above it is that
screen's own eyebrow, and under both is one sentence saying what the page is
for. Nothing in here is a slogan: an earlier version had lines like *all the
way back to 2024* over Listen, and a caption that advertises a page is a
caption telling somebody what to think about a screen they can see for
themselves.

**The Guide is more than a third of the running time**, in three scenes. That
is the brief: it is the thing the church most wants somebody to find first, so
it gets the index, the reader, and the half of a guide people do not discover
on their own. Worship, Connect and Give follow it and close the tour, Give
last because that is where a tour of a church ends.

**Apple caps an app preview at thirty seconds.** That is the whole reason there
are two cuts. The store cut is the four pages the church leads with, Home,
Calendar, Listen and the Guide, with the Guide still the longest thing in it.

**A scene opens under the navigation it was reached through**, which fades off
the new page, and then the caption comes up over a dim and clears. The change
of screen happens while the list is opaque, so a re-render never shows as a
jump, and the scroll starts while the caption is still up, so the dim lifts on
something already moving rather than on a still.

**Every scene is a function of its own length.** The beats are fractions of the
time a scene has, so one description of what happens plays at both lengths
rather than two that drift. Caption timing is absolute, because reading speed
does not scale.

## The two compositions

| id | Renders at | Runs | For |
|---|---|---|---|
| `AppStorePreview` | 1320 x 2868 | 29.8s | The store page. The app fills the frame, no device around it. |
| `Marketing` | 1080 x 1920 | 74.0s | The website and the socials. Every scene, inside a drawn phone on a warm ground. |

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
| `src/stage.js` | Finishes the content load and switches the refresh off, so no tab goes back for more mid render. |
| `src/scenes.js` | The timeline. What happens, when, and the captions. |
| `src/drive.js` | The hands: every function that reaches into the running app. |
| `src/AppStage.jsx` | The iframe, and everything done to the app once it has booted. |
| `src/Type.jsx` | The captions and the two cards. |
| `src/timing.js` | Keyframes and easings. |
| `src/theme.js` | The dark palette, copied from `css/tokens.css`. |

## Four things to know before changing it

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
the app and gets its own answer. Date anything you stage, by hand.

**No sound.** App previews autoplay muted on the store page and the one Apple
guideline that matters here is that it has to work without audio. Nothing in
this needs a voice over, and a music bed is a licence to keep track of.

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
