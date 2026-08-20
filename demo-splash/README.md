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

## Building it

`mockup.src.html` carries a placeholder for the gold mark. `build.js` inlines it
and writes two files, neither committed:

    cd demo-splash && node build.js

- `mockup.html` — a whole document, for opening off disk.
- `artifact.html` — the same thing as a fragment, for publishing.

## Not decided yet

Which of the four, and the two timings in the notes on the page: the floor that
keeps a fast launch from turning the splash into a flicker, and the ceiling that
gets a phone with no signal to Home anyway.
