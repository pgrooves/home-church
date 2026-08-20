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

## Building it

Each `*.src.html` carries placeholders for the brand PNGs. `build.js` inlines
them and writes two files per source, none of them committed:

    cd demo-splash && node build.js

- `NAME.html` — a whole document, for opening off disk.
- `NAME.artifact.html` — the same thing as a fragment, for publishing.

## Not decided yet

Soft, bright, or no glimmer at all, and whether it runs on every launch or only
the first of the day. Then the two timings in the notes on both pages: the floor
that keeps a fast launch from turning the splash into a flicker, and the ceiling
that gets a phone with no signal to Home anyway.
