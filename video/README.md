# The App Store preview

A minute and thirty nine of Home Church for the website, cut to a music bed,
and a thirty second cut of the same run for the video slot on the store page. Built with
[Remotion](https://www.remotion.dev), which renders React to video by drawing
the composition in a browser one frame at a time.

```bash
cd video
npm install
npm run render              # out/home-church-app-store.mp4, 1320 x 2868, 29.6s
npm run render:marketing    # out/home-church-marketing.mp4, 1080 x 1920, 100.8s
npm run render:sunday       # out/home-church-sunday.mp4,    1920 x 1080, 100.8s
```

**Two files are not in the repository and the render needs them.**
`public/music.wav` is the bed and `public/app-store-badge.svg` is Apple's
badge for the Sunday slide; `prepare.mjs` names whichever is missing.

**`public/music.wav` is not in the repository.** It is a
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
| Opening | 0 – 96 | The lockup, assembling, in the quiet | |
| Home | 96 – 384 | Down the noticeboard, past the service times, to this week's message | *Home* |
| Calendar | 384 – 576 | **The track comes in.** Two days opened, then everything coming up | *Calendar* |
| Listen | 576 – 864 | Past this week into the archive, one message opened for its notes | *Listen* |
| Guides | 864 – 1056 | **The top arrives.** Every Sunday the church has written up | *Guides* |
| Self-Reflection Questions | 1056 – 1440 | Opened, read down, one of them answered, then the one-liners | *Self-Reflection Questions* |
| Overview | 1440 – 1728 | Sunday's message in writing, then the fuller summary under it | *Overview* |
| Notetaking | 1728 – 2016 | A line highlighted, a note written on it, saved | *Notetaking* |
| Journal | 2016 – 2304 | Both of them under their sermon, then every sermon | *Journal* |
| Worship | 2304 – 2496 | A pass down Sunday's setlist | *Worship* |
| Connect | 2496 – 2688 | Get in touch, and the serve teams | *Connect* |
| Give | 2688 – 2880 | **The outro.** A thank you and one button | *Give* |
| Closing | 2880 – 2976 | The name, the service times and the address, into the last of the music | |

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

**The two cuts that play to a room open on black and silence**, for two
beats, and then the music lands on the frame the lockup begins to appear on.
Starting cold on a logo and a downbeat is how a slideshow opens; two beats of
nothing is the room going quiet first, and it costs a second and a half. The
lead is a whole number of beats so the music's grid is untouched — everything
downstream is the same timeline two beats later. The store cut does not get
it: Apple gives a preview thirty seconds and a person scrolling past gives it
about two, and the first of those cannot be black.

**A scene opens under whatever it was reached through.** The navigation, which
fades off the new page; a bloom, where a row was tapped and a view pushed; or
a breath, where the screen simply carried on. Then the caption comes up over
a defocus and clears. See **The hand-overs**. The change of screen happens while the cover is
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

## The hand-overs

**The transition is that the framing is different on the other side.** That
is the whole of the current idiom and it is worth stating plainly, because
the obvious thing to reach for is the opposite: a light leak, an exposure
flash, something smeared over the join. Those read as 2015. What reads as now
is a hard cut landing on the beat, with a camera that was already moving and
is somewhere else when it lands.

**So the device is never quite still.** It drifts, and it pushes in or pulls
back across the length of a shot — five percent of scale, a dozen pixels of
sideways. A phone pinned dead centre for ninety nine seconds was the single
most dated thing in this piece and it was doing exactly that. The ground
leans with it at a fifth of the rate, so there is parallax between the device
and the glow behind it rather than a sticker on a backdrop.

**A shot is not a scene.** Scenes joined by an `on` arrival are the same
screen carrying on, so the camera runs through them as one continuous move;
jumping there would claim a cut that did not happen. Everywhere else the
camera cuts with the content, on the frame. Nine shots, five moves,
alternating so no two in a row do the same thing.

**Nothing moves the app itself.** The footage stays square on and pixel
aligned — no tilt, no 3D, no perspective. It is an app preview and a tilted
UI is a soft UI. The camera moves the *device*, which is a drawn object, and
the store cut has no camera at all because Apple's slot wants the app rather
than a film about it.

**There is still a bloom, and it is now a whisper.** One iframe shows one
state at a time, so there is genuinely nothing to cross dissolve with, and a
little defocus through a join does real work — it just cannot be the whole
transition. It went from blur 19 and a quarter stop of wash down to blur 11
and a tenth once the camera arrived to carry the cut.

**Four strengths, because there are four kinds of hand-over**, and they are
not interchangeable:

| | |
|---|---|
| `card` | into and out of the lockup. The bloom runs under the veil, so the app blooms away and the card arrives on top of it. |
| `cut` | a row tapped, a view pushed. Nothing else covers these, so they carry the transition alone and get the most of it. |
| `nav` | the full screen list. **No blur here**, because the app already blurs the page beneath its own navigation — see the note by `.hc-navmenu` in `css/components.css`. Adding one would be two blurs in series on the one hand-over that needed none. It gets the exposure lift only. |
| `on` | the same screen carrying on, where the caption changes and the page does not. A breath, not a transition: enough to mark a chapter, not enough to claim the screen changed. |

**The dip at a cut went from 0.9 to 0.2 when the bloom arrived**, and that is
worth knowing before touching either. The old transition was a rectangle of
charcoal fading up and down — a dissolve to black with the lights on. Run
underneath the bloom it made the peak of every cut a flat grey field with
nothing in it: two full-strength covers in series, each of which had been
tuned on its own. What is left is a fifth of a stop, there to stop the warm
wash reading as a lamp coming on. The cards keep theirs, because the card
that follows is opaque and anything less than most of the way there pops on
the frame it arrives.

**The type masks in rather than fading up, in four staggered pieces.** A
caption that fades and slides ten pixels is the default every motion tool
ships with and it reads as one: the words are present the whole time at some
fraction of themselves, so there is no moment they arrive. Each piece is
clipped to nothing and the clip opens downwards while the words rise into it
and come out of a short defocus, eyebrow then line then sentence then rule, a
few frames apart. It is the move the lockup already makes on the opening
card, where the wordmark wipes out from behind the house. The way out is
deliberately not the way in reversed — a mask closing is a strong gesture and
doing it twice a scene makes the words the subject, when they are a label on
somebody else's screen.

**Grain, and it is not nostalgia.** A warm radial gradient across 1080 pixels
at eight bits a channel is about forty steps of tone over a very long ramp,
which is banding, and it was banding: faint concentric rings around the glow
behind the phone, the kind that only show up once the thing is encoded. Four
percent of moving noise dithers the ramp away and gives the encoder something
to spend bits on. It moves because still grain over moving pictures reads as
a dirty lens, and it moves by offsetting one 140 pixel tile per frame rather
than generating noise, because the first is free and the second is not.

**The caption defocuses the page rather than dimming it.** This was 0.74 of
flat charcoal, which is a dimmer switch: the screen underneath stayed sharp,
so thirty calendar numbers competed with eight words at full detail and the
only thing holding them apart was that one was darker. The caption layer
blurs its backdrop now, the way every sheet, plinth and disc in the app
already does, and the scrim came down to 0.6 because the blur is doing the
separating. The blur ramps on its radius rather than on the layer's opacity:
fading a backdrop-filter by opacity composites a blurred copy over a sharp
one, which at halfway is two pictures a few pixels apart, and that reads as a
double exposure rather than a focus pull.

## Cut to the music

**The track is 75 BPM, which at thirty frames a second is 24 frames a beat and
96 a bar, exactly.** That is luck and it is why this is on the grid rather
than near it. A tempo that came out at 23.6 frames a beat would drift a frame
every third beat and a second across the piece, and the only cures are
resampling the music or letting the cuts wander. 75 at 30 divides.

**But a grid is not an edit, and the first version of this was a metronome.**
Every cut landed on a beat and not one landed on a moment: of thirteen cuts,
two coincided with anything the music actually does, and both by accident. A
beat grid says when you are allowed to cut. It does not say where to.

**So the lengths come from the track's own shape.** Measured with a
beat-synchronous band analysis and a per-bar loudness and brightness reading,
it is:

| | |
|---|---|
| 0 – 12.8s | quiet, four bars of intro, building |
| **12.8s** | **it comes in** — +3.8 dB, the biggest thing in the track |
| **28.8s** | **the top arrives** — +313 Hz, the largest step in the body |
| 32 – 89.6s | a long, very even body |
| **89.6s** | **the outro** — −4.8 dB, the bottom goes |
| 97.6s | ends |

**The track is flatter than that table looks, and saying so matters more than
making it sound dramatic.** Between bar 4 and bar 20 it moves by less than a
decibel a bar and the brightness wanders by a hundred or two. There are two
decisive moments in it and one modest third. An earlier version of this file
claimed a +800 Hz lift at 25.6s; that came from sampling one window a beat
rather than averaging a bar, and measured properly the event is a bar later
and a third the size. Cutting to a moment that is not there is worse than not
cutting to it.

So three cuts are on the music and the other ten are on bar lines, which is
the right default rather than a consolation. Home hands over to Calendar as
the track comes in. The Guide opens as the top arrives. Give lands on the
outro. The closing card goes up with eight bars of music left and holds
through the last of it into a second of silence.

**Every length is in bars, not beats.** A bar is 96 frames, and cutting on bar
lines rather than beats is most of the difference between clean and busy: a
cut on any old beat is in time and still restless, because the music is not
changing there and the picture is.

**The bed is eight bars longer than the track the church sent.** That is where
the room came from, and it was the real problem: eleven screens in 73 seconds
is 5.7 seconds each however the cuts fall, and no amount of beat-matching
makes that unhurried. The eight bars are the track's own bars 11 to 19 played
twice. It is even enough through the middle that the join measures 0.9989
similarity, with a 20ms equal-power crossfade over the waveform
discontinuity; the step left at the join is 619 against a typical sample step
of 489, so there is nothing to hear. Every scene is longer than it was, most
by half as much again.

**The store cut is not cut to the song and does not pretend to be.** The track
takes four bars to come in and another four to open up, which is twenty six of
the thirty seconds Apple allows. So it stays on the beat grid, and the one
thing it takes from the music is where it starts: `musicFrom` puts the bed in
at bar four, so the preview opens on a page and a bed that have both already
arrived rather than on thirteen seconds of somebody clearing their throat.

**The bed is a wav, and it is trimmed by more than you would expect.** 0.4307
seconds, which is two numbers: 0.3880 is where the track's own first beat
falls, and 0.0427 is 2048 samples at 48kHz, which is what ffmpeg's AAC
encoder writes in front of whatever audio it is given. Nothing trims that
back off — the mp4 comes out with an audio stream 2048 samples longer than
the video and no edit list saying to skip them — so without the correction
every player starts the music a frame and a quarter late. It is a wav rather
than an m4a for a related reason: `-ss` on a compressed file seeks to a frame
boundary rather than to the sample you asked for, which is a second error on
top of the first.

**Measure that, do not trust it.** Render a few hundred frames, pull the audio
out, and cross correlate it against the untrimmed track; the answer should be
the first-beat offset to within a millisecond. Both signs of the correction
were wrong once before the probe caught them, which is the entire argument
for probing.

**Changing the track means redoing all of this.** Measure the new tempo and
the offset of its first beat, and if the beat is not a whole number of frames,
pick a different track or accept drift. `BEAT` at the top of `src/scenes.js`
is the one number to change, and the eleven scene lengths under it are counts
against it.

## Sunday morning, on the wall

A third composition, `Sunday`, at 1920 x 1080. The other two are 9:16 because
a phone is; a projector in a sanctuary is not, and a vertical video on a
sixteen by nine screen is two thirds of a wall doing nothing.

So the two thirds carry what the video cannot and a congregation needs: the
lockup top left, five things the app does down the right, and bottom left a
QR code with Apple's badge under it as one card. The phone rides the same
camera as the long cut and plays the same hundred seconds.

**The code is the point of the slide, so it is sized for the back row rather
than for the layout.** 128 of the frame's 640 points, which is a fifth of the
picture width — on a twelve foot screen that is about two feet of QR, and it
scans from the back of most rooms. It sits on a white card, which is not a
brand decision: the file the church supplied is dark modules on a
*transparent* ground, so on this charcoal it would be a dark square on a dark
wall. A scanner wants contrast more than it wants a palette.

**Apple's badge is Apple's own file**, fetched from their marketing
guidelines rather than drawn here. A hand-made one is a trademark somebody
traced, and their guidelines ask for the supplied artwork. The black variant,
because it is on a white card.

**Five features and not the eight the video shows.** The constraint is type
size, not coverage: six lines fit only by making every one too small to read
from forty feet, which is the whole job. Worship is the one that went — not
the least loved, the least needed.

## The three compositions

| id | Renders at | Runs | For |
|---|---|---|---|
| `AppStorePreview` | 1320 x 2868 | 29.6s | The store page. The app fills the frame, no device around it. |
| `Marketing` | 1080 x 1920 | 100.8s | The website and the socials. Every scene, inside a drawn phone on a warm ground. |
| `Sunday` | 1920 x 1080 | 100.8s | A projector or a television in the room before a service. The same phone, with the lockup, the feature list and the QR code around it. |

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
| `src/Preview.jsx` | The piece: the app, the grade, the words, the cards, the music, and the camera the device moves on. |
| `src/Type.jsx` | The captions and the two cards. The caption's backdrop defocus is here. |
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
