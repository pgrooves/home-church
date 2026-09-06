# The App Store preview

Thirty seconds of Home Church for the video slot on the store page, and a
longer cut of the same thing for the website. Built with
[Remotion](https://www.remotion.dev), which renders React to video by drawing
the composition in a browser one frame at a time.

```bash
cd video
npm install
npm run render              # out/home-church-app-store.mp4, 1320 x 2868, 29.8s
npm run render:marketing    # out/home-church-marketing.mp4, 1080 x 1920, 48.2s
```

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
with the frame number: the same HTML, the same CSS, the same JavaScript, the
same seed in `js/data.js`, painting live inside the video.

So every movement in it is the app's own. The discussion questions unfold
because the guide reader unfolds them. The tab bar's lit tile slides because the
bar slides it. Two questions tick because the video clicks them and `js/app.js`
handles the click, which is why the count above them repaints from *18 in all*
to *1 of 18 covered* to *2 of 18 covered* as they land. Dee's answer appears in
the room because `openedAt` was written on it and `js/screens/group.js` filters
on exactly that field, the same way it does when a host taps a name for real.

**Three things in it are furniture**, and they are all in `src/stage.js` with
the reasoning: the group room, two journal entries, and the account both of
those need. None of them are content the church publishes, they are things a
person has done on their own phone, so there is nothing in `js/data.js` to draw
and nobody signed in to draw it for. Everything that renders them is the
shipping screen, untouched. The five names in the room are invented and so is
every word they wrote, which is the other reason not to film a real one.

**That is the point of building it this way.** A video assembled from stills is
correct on the day it is made and quietly wrong forever after. This one cannot
drift: it opens whatever guide is first in the data, scrolls to wherever the
discussion questions actually are, and reads the serve teams off the Connect
screen. Change the app and re-render, and the video is about the new app. Break
a section and the video breaks with it, visibly.

## What is in it

| | Frames | | |
|---|---|---|---|
| Opening | 0 – 54 | The lockup, assembling | |
| The guide | 54 – 288 | Open the discussion questions, read down them, tick two off | *Sunday's message, ready for your group* |
| The room | 288 – 558 | The six digit code, the questions carried over, and the host opening one person's answer to the group | *Open a room and go through it together* |
| Worship | 558 – 684 | A slow pass down Sunday's setlist | *Sunday's songs, all week* |
| The journal | 684 – 810 | Three entries, and the line saying nobody else can see them | *Somewhere to put what you heard* |
| Closing | 810 – 894 | The name, the service times and the address | |

**Nine seconds of it is the room**, which is the longest scene and on purpose:
a host opens a room, texts a six digit code to the group, everybody answers on
their own phone, and nothing is visible until the host opens it, one answer at
a time, as the conversation gets there. That is the thing this app does that
nothing else does, and it takes a moment to read.

**Apple caps an app preview at thirty seconds.** That is the whole reason there
are two cuts. Four features at a pace a person can follow is worth more on a
store page than seven at a gallop, so Leader mode, Listen, Connect and Home are
not in the store cut. They are all in the long one, at exactly the same speed.

**Each scene opens dimmed under a warm charcoal veil with one line over it,
then the veil lifts and the app plays clean.** Three things fall out of that.
The change of screen happens while the veil is opaque, so a re-render never
shows as a jump. The scroll starts while the caption is still up, so the veil
lifts on something already moving rather than on a still. And the words are set
the way the app sets them, a tracked all-caps eyebrow over a large light line,
which the design system calls the most recognisable thing the brand does.

**The captions are written for somebody deciding whether to come on Sunday.**
Not one of them names a capability. There is nothing in here about offline
support or syncing or accounts, and the piece ends on when the church meets and
where it is rather than on a feature.

## The two compositions

| id | Renders at | Runs | For |
|---|---|---|---|
| `AppStorePreview` | 1320 x 2868 | 29.8s | The store page. The app fills the frame, no device around it. |
| `Marketing` | 1080 x 1920 | 48.2s | The website and the socials. Every scene, inside a drawn phone on a warm ground. |

Both are built from the same scenes at the same durations, listed in
`src/scenes.js` as `APP_STORE` and `FULL`. Moving a scene between the two cuts
is moving its name between two arrays; nothing else has to be retimed, because
adding a scene adds its length rather than squeezing its neighbours.

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
| `prepare.mjs` | Copies the app into `public/app` so the iframe can reach it, and empties `js/config.js` on the way. Run by every npm script here. |
| `src/stage.js` | The room, the journal entries and the account they need. What is furniture and what is the app, in its own header. |
| `src/scenes.js` | The timeline. What happens, when, and the captions. |
| `src/drive.js` | The hands: every function that reaches into the running app. |
| `src/AppStage.jsx` | The iframe, and everything done to the app once it has booted. |
| `src/Type.jsx` | The captions and the two cards. |
| `src/timing.js` | Keyframes and easings. |
| `src/theme.js` | The dark palette, copied from `css/tokens.css`. |

## Three things to know before changing it

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

**No sound.** App previews autoplay muted on the store page and the one Apple
guideline that matters here is that it has to work without audio. Nothing in
this needs a voice over, and a music bed is a licence to keep track of.

## What is not identical between two renders

The app reads the clock. Home says good morning, good afternoon or good evening
depending on when the render ran, and the gathering card names the next Sunday
from today's date. That is on purpose and it is the same decision
`scripts/make_screenshots.js` made: a preview showing a Sunday that has already
been is a small lie on the store page, and the fix is to re-render, which takes
two minutes.

Everything else is fixed. `prepare.mjs` empties the Supabase keys out of the
copy it stages, so the app runs off the seed bundled in `js/data.js` with no
network and no gate, exactly as it runs on a phone that has never signed in.

## Uploading it

App Store Connect, the app's version page, Previews and Screenshots, the 6.9
inch iPhone tab. One preview per size is plenty. It wants the poster frame
chosen from inside the video: pick the last one, which is the lockup, held
still for that reason.
