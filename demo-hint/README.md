# The first launch hint — mockup

A standalone rendering of the pointer a signed out phone gets a couple of
seconds after the greeting lifts, made to be looked at, and tapped, before
anything in `js/` or `css/` is touched.

**Not built.** `HINTS.md` at the repo root is the map this drawing belongs to.
Nothing here has shipped, and §9 of that document lists what is still open.
This folder exists to close one of those lines: whether the ring is enough on
its own, which is the one judgment reading cannot settle.

## What it shows

The splash lifts, Home is on the glass, and 2500ms later the avatar in the top
right corner is pointed at. Three ways:

- **A. Ring only.** A soft gold ring grows out of the disc's own edge and
  fades, twice, 1400ms apiece with a beat between. The disc's hairline warms
  while they run and cools back after. Nothing is written.
- **B. Ring and caption.** The same, with one line of caption type under the
  bar, right aligned to the 20px gutter so its right edge lands under the disc.
  No nub, no caret, no arrow.
- **C. Caption only.** The words with nothing lit.

Then it goes away, on any of the nine deaths in `HINTS.md` §3c, and the phone
says which one out loud.

The phone is real: the tokens from `css/tokens.css` unedited in both
appearances, the 52px bar, the 42px disc, the 20px gutter, the tab bar built
the way `css/components.css` builds it. What the hint has to sit next to is
the thing it will really have to sit next to.

## The switches in the page

- **Study** — A, B or C above.
- **The words** — the three candidates from `HINTS.md` §4. Narrow the window to
  an SE and watch which one wraps first.
- **The phone** — light and dark, both from the shipped tokens. Carried on
  `[data-hc]` on `.stage` rather than on `:root`, so the page around the phone
  cannot move it and the phone cannot move the page.
- **Motion** — Full, or the Reduce Motion version: no ring, no travel, the
  caption simply present and held 7500ms instead of 6000ms because there is no
  movement to draw the eye.
- **The caption's footprint** — draws the rectangle the caption occupies. It is
  not a shipping style. It is here because "it does not take taps" is a claim
  about a rectangle you cannot see.
- **Open it** — straight to Home, or with the splash in front of it.

## The log is the point

Every rule in `HINTS.md` §3 is invisible when it works, which is exactly why
they are the ones that get quietly broken. A hint that stops dying on scroll
is not a crash, it is a hint that sits there through a page of reading, and
nobody files that. So the panel on the right says what ended the hint and what
the tap that ended it went on to do.

Worth doing in this order:

1. **Tap the avatar while the ring is running.** The log says the hint ended on
   `pointerdown`, that the tap landed on the avatar, and that the route changed
   to Profile. All three. The rings are pseudo elements on a button, and this
   is the tap that would be swallowed if they ever took a pointer.
2. **Turn on the rectangle and tap inside it.** What goes through is bare
   paper: on Home the caption lands in the gap between the bar and the
   greeting, so nothing tappable is under it anyway. That is a good sign about
   the placement and a poor demonstration, which is why 1 comes first.
3. **Scroll.** Gone before the second card clears the bar.

## What is faked

- **The splash is abbreviated** to 1500ms. The shipping floor is 2750ms plus a
  420ms fade, and a study that costs three seconds a replay is a study nobody
  replays.
- **Home is a sketch.** A greeting, a carousel and three cards, there to give
  the hint something to sit over and be tapped through. Not a Home redesign.
- **The three launch counter of §3d is not modelled.** This phone hints every
  time you ask it to, because a study you have to reinstall to see twice is a
  study nobody sees twice.

Everything else, the tokens, the geometry, the durations, the death list and
`pointer-events: none` on the layer and every child, is the shipping thing.

## What it is for deciding

| | |
|---|---|
| **Is A enough** | Watch it once without knowing where to look. If your eye does not go to the corner, A is not the answer however much nicer it is. A also has nothing left to show under Reduce Motion, which is an argument against shipping it alone. |
| **Which words** | Three candidates, one line each, and the one that wraps on a 375pt phone is out. |
| **How gold** | `--hc-gold` deepens to `#CBAC74` on charcoal so it glows rather than glares. The ring is the only gold thing on the screen in either appearance, which is what makes it findable. |

## What it cannot settle

Whether 2500ms is the right wait and six seconds the right hold. Both are
opening guesses, and both feel different in a hand, at arm's length, in the
sun, held by somebody who has not seen the app before. Take it outside.

## Building it

`mockup.src.html` carries placeholders for the three brand PNGs. `build.js`
inlines them into a single self-contained file:

    cd demo-hint && node build.js

Output is `mockup.html`, which opens directly in a browser with no server.
