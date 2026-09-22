# Splash, four studies — mockup

A standalone rendering of the screen the app would show between the tap and the
Home tab, made to be looked at before anything in `js/` or `css/` is touched.
Nothing here is wired into the app.

## What it shows

The gold house mark on its own, no lockup, then **Welcome home, Trey.** and, at
the bottom in small type, **Loading...** Signed out it says **Welcome home.**
and nothing more.

Four treatments of that one screen:

- **Front door** — paper ground, the greeting set in the same Poppins 800 at the
  same size the Home tab uses for its own greeting.
- **Kitchen table** — same paper, Cormorant instead, the guides' reading voice.
- **Porch light** — warm charcoal in both appearances with a low glow behind the
  house, matching the icon the tap just came from.
- **Threshold** — paper with light spilling from the top, the biggest mark, a
  short gold rule drawing itself in under it.

Every phone is drawn at real iPhone points, 393 x 852, and scaled to fit its
frame, so the sizes in the stylesheet are the sizes that would ship. The colors
are the real tokens from `css/tokens.css`, both themes.

The controls at the top switch between signed in and signed out, let you type a
different first name, flip the app's appearance, and replay the entrance.

## The second sheet, `glimmer.src.html`

**Front door was picked.** The second page carries it forward with the fade
eased out, 900ms and 8pt of travel instead of 560ms and 10, and the welcome
following a beat behind rather than stepping on it. The first sheet's timing is
still there behind a control, so the two can be watched against each other.

It also puts a glimmer across the gold, left to right, timed to land just as
the splash lifts off and Home comes up underneath. Three phones: no glimmer, a
soft wide pass over 1.1 seconds, and a brighter 780ms glint with a small bloom.
Each one plays the whole launch through to a sketch of the Home tab, because a
sweep timed to the handoff cannot be judged without the handoff.

The light is the mark's own silhouette used as a mask, so a band of warm white
with slightly deeper gold shoulders slides across and is clipped to the house.
No second asset, and nothing to keep in sync if the logo is ever redrawn.

## The third sheet, `sequence.src.html`

**When the welcome arrives, and nothing else.** What ships has the welcome
starting at 460ms, while the house still has half its rise left, so the two
come up as one block. This sheet puts the house on its own first and lets the
welcome follow: three phones, the shipping timing, the welcome at 980ms over
460ms from 10pt, and a quicker alternate at 1060ms over 360ms from 12pt.

Everything else is the shipping sequence, on every phone: the house, the
loading line, the light across the gold at 1.9s, the 2750ms hold and the 420ms
lift off. Each phone runs the whole launch through to Home, because the point
to check is that the later welcome is still read before the splash leaves. Under
each one is a track drawing the two rises against the same 3.2s window, with the
handoff marked. Half speed is a control, and it is a plain multiplier on every
number, so it is the same sequence rather than a different one.

The one thing the sheet argues for outside the animation itself: under Reduce
Motion, `css/base.css` collapses durations but not delays, and the still hold is
1200ms, so the welcome's delay goes back to the house's own 140ms there. No
house is rising, so there is nothing for it to follow.

## Building it

Each `*.src.html` carries placeholders for the brand PNGs. `build.js` inlines
them and writes two files per source, none of them committed:

    cd demo-splash && node build.js

- `NAME.html` — a whole document, for opening off disk.
- `NAME.artifact.html` — the same thing as a fragment, for publishing.

## Shipped

**Front door with the soft pass is in the app.** The layer lives in
`index.html` so it is on the glass at first paint, its styles are at the bottom
of `css/components.css`, and `js/splash.js` puts the name in and takes the
whole thing away once `boot()` says Home is painted. These two pages stay as
the drawings it was decided from.

One number moved between the drawing and the app: the greeting is 28px, not
32, because that is what `.hc-home__greeting` actually is, and matching it was
the whole point of this study.

## Not decided yet

Soft, bright, or no glimmer at all, and whether it runs on every launch or only
the first of the day. Then the two timings in the notes on both pages: the floor
that keeps a fast launch from turning the splash into a flicker, and the ceiling
that gets a phone with no signal to Home anyway.
