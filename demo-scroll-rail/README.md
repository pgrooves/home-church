# The side rail — mockup

A standalone rendering of the proposed scroll index on the right edge, made to
be looked at, and dragged, before anything in `js/` or `css/` is touched.
Nothing here is wired into the app.

## What it shows

The browser's scrollbar comes off `.hc-scroll`, and the right edge becomes an
index of the page's own headings. Press inside the last 34px on the right and a
column of hairline notches fades up, one per heading. Drag: the notch under the
finger swells, its neighbours swell less, the page glides to that section, and
the section's name is held out to the left of the hand so the hand is not
covering the answer. Tap without dragging and it jumps. Let go and it fades a
second later.

The phone in the page is real: the tokens from `css/tokens.css` unedited, the
top bar, the gold disc and the tab bar built the way `css/components.css`
builds them, so what the rail has to sit next to is the thing it will really
have to sit next to.

## The seven things asked for, and where each one is

| | | |
|---|---|---|
| 1 | Native scrollbar hidden | `scrollbar-width: none` plus a zero-width `::-webkit-scrollbar` on `.hc-scroll`. Wheel, trackpad, thumb and momentum untouched. |
| 2 | Appears on touch, fades on release | A transparent 34px strip listens. Up in 120ms, held **1000ms** after the thumb lifts, then out over 380ms. |
| 3 | Fisheye | `exp(-(d/46)²)`, from 9px at rest to 30px under the finger, opacity 0.30 → 1. One curve, so the swell travels through the notches rather than hopping. |
| 4 | Offset preview | The title floats 46px left of the notch, centred on the finger, clamped inside the screen. Tab-bar glass, tab-bar radius, section-header type one size down. |
| 5 | Both directions | Scrub → the nearest notch is the target and the page eases toward it each frame. Scroll → the last heading past the reading line, 72px down, takes the highlight. |
| 6 | Smooth | One `requestAnimationFrame` loop writing `transform` and `opacity` only. Measured 61fps scrubbing in Chromium. |
| 7 | In the app's style | Ink at low opacity and the app's own glass. No track, no groove, no thumb, and nothing borrowed from the gold disc. |

## How it is put together

Three elements: a transparent strip that listens, a track of notches that never
takes a pointer of its own, and one label. Every pointer arrives through the
strip, so there is one gesture path and not two that can disagree.

- **Measured once per gesture.** Every heading's offset and every notch's
  centre are taken on `pointerdown`. After that the loop makes no reads.
- **Two properties per notch.** Width is `scaleX` off a fixed 30px, never
  `width`, so no frame of the animation touches layout. Writes that would move
  a value less than 0.004 are skipped.
- **The finger is eased, not followed.** The drawn centre chases the pointer at
  0.35 per frame, which takes the tremor out of the swell without adding lag
  you can feel. The page chases its target at 0.22, the swell fades in and out
  at 0.14.
- **The loop stops itself** when the finger is still and the page has arrived.
  A rail waiting to fade is a `setTimeout`, not a held frame.
- **Reduced motion** keeps the gesture and drops the easing: the swell and the
  page both land in one frame.

## What it does not take

- **A sideways drag.** Past 10px, with horizontal beating vertical by 1.2×, the
  rail releases the pointer so `js/swipe.js` can still take you to the next tab
  from the right edge. Those are the same two numbers `swipe.js` already uses.
- **The gold disc's corner.** The strip stops 44px short of the bottom so it
  never runs under the back-to-top button.
- **A page with one heading.** Under two stops the strip does not arm at all.

## Keyboard and VoiceOver

The notches are real buttons carrying the section title. Tab into the track and
the rail comes up; Enter jumps. The active section is announced through a
visually hidden live region, so the label is the sighted half of something that
is said either way.

## The switches in the page

- **Page** — Home (6 stops) or a sermon guide (14). The second is the case the
  fisheye exists for.
- **While the page itself is scrolled** — the rail stays hidden, or half-peeks
  at 50% for 900ms with no label. The brief says only-on-touch, so hidden is
  the default here; the variant is in the drawing because a scrollbar that
  never shows position is answering half the question.
- **Theme** — light and dark, both from the shipped tokens.

## Still open

- 34px of the right edge stops being content, and vertical travel there belongs
  to the rail. Cards have 20px of padding, so nothing tappable is under it
  today — but Home's full-bleed carousel is.
- Whether the half-peek ships.
- What a heading is, per screen. This mockup reads `[data-stop]` off the DOM,
  which is the same trick `js/date-rail.js` uses; the real one would stamp
  `.hc-section-header` and `.hc-section__heading` and let each screen opt out.

## Building it

`mockup.src.html` carries placeholders for the two brand PNGs. `build.js`
inlines them into a single self-contained file:

    cd demo-scroll-rail && node build.js

Output is `mockup.html`, which opens directly in a browser with no server.
