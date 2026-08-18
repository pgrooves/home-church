# Listen, sticky month rail — mockup

A standalone rendering of the proposed date carousel on the Listen tab, made to
be looked at before anything in `js/` or `css/` is touched. Nothing here is
wired into the app.

## What it shows

Past the Archive header, a second sticky strip slides in under the top bar
carrying the month each episode was preached. It tracks scroll, auto-centers
the month you are reading, and jumps the page when you tap one.

The phone in the page is real: it runs the tokens from `css/tokens.css`, the
Listen screen's own markup, and the actual catalogue, pulled out of
`js/data.js` into `listen.json`.

**Built.** The rail shipped as month + year, the first variant below. It lives
in `js/date-rail.js`; this folder stays as the drawing it was decided from.

## The thing that was decided

The archive is grouped by series first, so dates only run downward *inside* a
group. Down the page the months go Aug 2026 → May 2026 (David), back up to
Jun 2026 (Messages), down again, then back to Oct 2025 (Ephesians). A rail of
bare months appears to jump backwards three times.

The mockup carries both answers behind a toggle:

- **Months only** — literal month + year, in page order. This is what shipped.
- **Months + series** — the same chips with a hairline and the series name at
  each group seam, so the second "Jun 2026" reads as June in *Messages*. Still
  here if the repeated months ever start reading as a bug.

## Building it

`mockup.src.html` carries placeholders for the catalogue and the three brand
PNGs. `build.js` inlines all four into a single self-contained file:

    cd demo-listen-rail && node build.js

Output is `mockup.html`, which opens directly in a browser with no server.

To refresh the catalogue after the data file changes, re-export `listen.json`
from `js/data.js` — it holds the latest episode, the current series, the show
card, and the first three archive groups.
