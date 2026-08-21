# The side rail — mockup

A standalone rendering of the scroll index on the right edge, made to be looked
at, and dragged, before anything in `js/` or `css/` was touched.

**Built.** It shipped as `js/index-rail.js` and the `.hc-index` block in
`css/components.css`, with the notches always on the glass and the headings
only under a thumb — the last state this drawing carries. This folder stays as
the drawing it was decided from.

Three things the shipped one does differently, all found by building it:

- **It listens on `.hc-scroll`, not on a strip of its own.** A strip with
  `touch-action: none` down the right edge works, and silently takes the right
  34px away from `js/swipe.js`, because a touch landing outside the scroller
  never reaches the swipe listeners at all. The shipped rail reads the same
  gesture swipe.js reads and simply does not claim it when it is sideways, so
  you can still swipe to the next tab from the right edge. The mockup keeps its
  strip; it has no tabs to swipe to.
- **A foldable section is not always a stop.** `.hc-section` is a part of a
  page on a guide and one item in a list on Connect, and nothing in the markup
  tells them apart, so `collapsible()` took an `index: false` and Connect's
  serve teams and next steps pass it. Without that the index of Connect was a
  list of serve teams.
- **The elements do not last.** Several screens re-render in place rather than
  mounting again — the Group room replaces its whole subtree on every poll —
  and a detached node's rectangle is all zeros, so every heading measured to
  the same place and every notch scrolled to the same nothing. The shipped rail
  re-reads the page on a `MutationObserver`, keeps the notches it has when the
  headings have not changed, and defers the re-read while a thumb is down. The
  mockup's page never changes underneath it, so it never had to learn this.
  This is what the Group tab's notches were failing on: the room is the one
  screen in the app that redraws itself every eight seconds whether or not
  anybody has touched it.

## What it shows

The browser's scrollbar comes off `.hc-scroll`, and the right edge becomes an
index of the page's own headings. A faint ruler of notches stays on that edge
at all times, one per heading, alternating long and short so it reads as
something you slide along rather than a list. Press inside the last 34px on the
right and the page's whole contents fades up beside it, every heading written
out. Drag, and the notch under the finger
swells with its name brought forward onto a card while the page glides to that
section; its neighbours swell part way; the rest stay small and faint behind,
so you can see where else there is to go without letting go. Tap without
dragging and it jumps. Let go and it fades a second later.

The phone in the page is real: the tokens from `css/tokens.css` unedited, the
top bar, the gold disc and the tab bar built the way `css/components.css`
builds them, so what the rail has to sit next to is the thing it will really
have to sit next to.

## The seven things asked for, and where each one is

| | | |
|---|---|---|
| 1 | Native scrollbar hidden | `scrollbar-width: none` plus a zero-width `::-webkit-scrollbar` on `.hc-scroll`. Wheel, trackpad, thumb and momentum untouched. |
| 2 | The ruler stays, the reading appears on touch | The notches are always drawn at 0.20 ink, 9px and 6px alternating. The headings, the card and the veil wait for a pointer in the 34px strip, hold **1000ms** after the thumb lifts, and relax out over about half a second. |
| 3 | Fisheye | `exp(-(d/46)²)`, from 9px or 6px at rest to the same 30px under the finger, ink 0.20 → 1. The same `f` drives the written headings: scale 0.78 → 1, ink 0.26 → 1. One curve, so the swell travels through them rather than hopping. |
| 4 | Offset preview | Every heading is written out at its notch's height, right-aligned 46px clear of the edge — inside the screen, outside the thumb. The focused one is full size and full ink on a card of tab-bar glass sized to it; the rest stay faint behind. Section-header type, one size down. |
| 5 | Both directions | Scrub → the nearest notch is the target and the page eases toward it each frame. Scroll → the last heading past the reading line, 72px down, takes the highlight. |
| 6 | Smooth | One `requestAnimationFrame` loop writing `transform` and `opacity` only. Measured 61fps scrubbing in Chromium. |
| 7 | In the app's style | The app's own section-header type at low opacity, one card of tab-bar glass, and paper drawn back over the page. No track, no groove, no thumb, no panel, and nothing borrowed from the gold disc. |

## How it is put together

Three elements: a transparent strip that listens, a track of notches that never
takes a pointer of its own, and one label. Every pointer arrives through the
strip, so there is one gesture path and not two that can disagree.

- **Measured once per gesture.** Every heading's offset and every notch's
  centre are taken on `pointerdown`. After that the loop makes no reads.
- **Two properties per notch, two per heading.** Width is `scaleX` off a fixed
  30px, never `width`; the headings are `translate3d` + `scale`; the card and
  the veil are `transform` and `opacity`. No frame of the animation touches
  layout — each heading's width is read once at build, and the card is sized
  from that. Writes that would move a value less than 0.004 are skipped.
  Fourteen headings is 60 writes a frame, and it holds 60fps.

- **Paper comes back over the page.** A gradient with no edge to it, faded in
  with the swell. Without it the page's own headings and the rail's are the
  same words in the same face on top of each other and neither reads. It is
  also what lets the faint headings be genuinely faint.

- **The column squeezes with the notches.** Under about 26px of pitch the
  unfocused headings scale down with the gap, so a long guide's contents stay a
  column rather than a pile.

- **A short contents sits in the middle.** The notches spread to fill the
  track, but never further apart than 64px: six headings across the whole
  height of a phone is a thumb travelling the whole screen to see six things.
  The strip outside the block is not dead — the finger is held to the block's
  own range, so a thumb past the last notch swells the last notch rather than
  swelling nothing.
- **The finger is eased, not followed.** The drawn centre chases the pointer at
  0.35 per frame, which takes the tremor out of the swell without adding lag
  you can feel. The page chases its target at 0.22, the swell fades in and out
  at 0.14.
- **The loop stops itself** when the finger is still and the page has arrived.
  A rail waiting to fade is a `setTimeout`, not a held frame.
- **Reduced motion** keeps the gesture and drops the easing: the swell and the
  page both land in one frame.

- **Letting go is the one moment that needs a kick.** A finger held still stops
  the loop, because a still finger changes nothing. Release is then something
  to animate with nothing running to animate it, so `hideSoon()` restarts the
  loop; without that the swell freezes at full and blinks out a second later.

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
- **Theme** — light and dark, both from the shipped tokens.

## Still open

- How faint is faint. The unfocused headings are at 0.26 ink over a veil at
  0.94; on a photograph that is the thinnest it can safely go. The resting
  notches are at 0.20 over whatever the page is showing, and over a photograph
  they may want the halo the disc's arrow has.
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
