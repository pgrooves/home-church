# The journal link — seven studies

One line of small gold caps, sat between the two discs above the plinth, that
takes you from a guide to your entries for that guide. Seven drawings of it on
the real thing, side by side, made to be looked at and tapped before anything
in `js/` or `css/` is touched.

**Not built, and nothing is chosen yet.** This is the page to pick from.

## What it shows

The guide reader for *The Seat at the Table*, opened, scrolled to where the
link lives, with Overview and the take-home questions unfolded so there is
real prose and a real answer passing behind it.

**It is chrome, not content.** The link is painted on the phone rather than in
the scroller: it holds its place, the guide runs underneath it, and it never
rides away under a thumb. Same layer the discs are on.

- **A. Bare caps.** Type and nothing else. The quietest thing that could work.
- **B. Caps with the halo.** A, plus the twin gold halo `.hc-disc__icon`
  already puts behind the arrows so they survive a photograph. **Opens on
  this one.**
- **C. The gold pill.** The discs' own material stretched into a capsule: the
  same skin, hairline edge, sheen and blur. Three gold objects reading as one
  set, and the only study where the gold stays literally `--hc-gold`.
- **D. The paper pill.** The tab bar's glass instead, with the gold kept to
  the type. Reads as a piece of the plinth that floated up.
- **E. The hairline capsule.** An outline in the same gold, nothing filled in.
- **F. Caps over a rule.** The eyebrow-and-rule move from every section header
  in the app, shrunk into the chrome.
- **G. Underlined caps.** The literal link. An underline says tappable in a
  way that gold, on its own, does not.

## The gold problem, which is the point of the page

**The discs are not gold type. They are gold objects.** `--hc-gold` is the
skin; the arrow drawn on it is `--hc-gold-ink`, near black in light and paper
in dark. Set type in `--hc-gold` on the guide's own paper and it measures
**1.70:1**. That fails at any size, and it fails in a way that is easy to miss
because in dark mode the same value is fine.

So "the same gold as the arrows" splits in two, and the studies split with it:

- **C and D** keep the literal gold by making it a surface again. C measures
  14.3:1 in light and 5.3:1 in dark.
- **A, B, E, F, G** keep gold as ink and have to deepen it until it reads.
  `#8A6A22` in light and `#E2C89A` in dark clear 4.5:1 with a little room
  (4.60 and 10.84). That pair is the **Deep** switch, and it would ship as a
  new token — call it `--hc-gold-text` — beside the disc's tokens in
  `css/tokens.css`, because nothing in the app sets type in gold today.

The measurements panel computes all of this live, against what is actually
behind the type in each study. C and D are measured against their own glass
composited over the guide, not against the paper.

## The switches in the page

- **The study** — A through G. One choice.
- **The words** — `TO MY JOURNAL`, `MY JOURNAL`, `TO YOUR JOURNAL`, and
  `THIS GUIDE IN MY JOURNAL`. The first is what was asked for. The third is
  the one the rest of the app's voice would write: the design system's §2b
  says second person, and the Journal already calls itself yours on every
  other screen it appears on. Read both in a hand before settling it.
- **The arrow** — the disc's own chevron, a plain arrow, the `→` glyph, or
  none. **The plain arrow does not exist in `js/components.js` today**;
  shipping that variant is one line in `PATHS`.
- **The gold** — Brand (`--hc-gold` itself), Deep, Deeper. Switch to Brand and
  watch the contrast go red.
- **The size** — 10, 11, or 12px. 11 is `--hc-eyebrow`, which is the size of
  every other tracked all-caps label in the app.
- **The phone** — light and dark, both from `css/tokens.css` unedited, carried
  on `[data-hc]` on `.stage` so the page around the phone cannot move it.
- **Its width** — SE at 320, 390, and Max at 430. The gap between the discs is
  the constraint: 172px on an SE against 242px at 390. `TO MY JOURNAL` clears
  it with 47px to spare at 11px; `THIS GUIDE IN MY JOURNAL` runs over on an SE
  at every size, truncates rather than sliding under a disc, and the panel
  says by how much.
- **When it shows** — always up, or arriving with the back-to-top disc at
  `TOTOP_AT = 240`. Always up is the sticky reading and the default.
- **Its footprint** — draws the 44px tap box, the slot, and both discs. Not a
  shipping style. Small type and a small target are two different decisions,
  and this is where you check they came apart.

## Where it sits, exactly

Bottom is `--hc-tabbar-space`, the same line the discs sit on, so the three
share a baseline rather than nearly sharing one. The slot runs the full width
between them less a disc and one `--hc-space-sm` at each end, so a thumb
aiming at the link can never clip an arrow. The link is centred in that slot,
not in the phone — the same number today, and not the same number the moment
anything else joins the row.

The paint and the target are separate rectangles in every study that draws a
capsule: the pill is 30 to 34px on a `::before`, and the button stays 44,
which is `--hc-tap-min`. The first draft shrank the button instead and lost
10px of target without anything looking wrong, which is exactly why the
footprint switch is in the page.

## What building it actually costs

1. **The reader draws it.** One element in `js/screens/guide.js`, or in the
   chrome in `js/app.js` beside the discs if it should survive a re-render the
   way they do. It goes down in presentation mode on the same `chromeless`
   line the discs use.
2. **A token for gold type**, unless C or D wins.
3. **The tap.** The Journal is a stop behind •••, and the router already
   carries an id: `HC.router.go({ name: 'journal', id: guide.id })`.
4. **The landing.** `js/screens/journal.js` groups by guide already, so this
   is a fourth entry in `FILTERS` plus a scroll to that group's header, not a
   new screen. Nobody should tap "to my journal" from one guide and arrive at
   the top of everything they have ever written.
5. **What it says when there is nothing there yet.** Every study here assumes
   entries exist. A guide you have not written in is the common case on
   Sunday afternoon, and the link either goes quiet, or goes anyway and lands
   on an empty group. That is a real decision and this page does not make it.

## What is faked

Three sections rather than six, two of them open. The index rail on the right
edge is drawn rather than live. The tab bar does not navigate, and the link
itself goes nowhere — it is here to be looked at and tapped, not followed.

Everything else is shipping: the tokens unedited, the 20px gutter, the 12px
insets, the 44px discs, the 52px bar, the six tiles, and the gold in both
themes.

## What it cannot settle

Whether a third gold thing costs the discs their findability. `css/tokens.css`
says being the only gold thing on the screen is what makes the back-to-top
disc work without a label, and every study here spends some of that. C spends
the most and looks the most like it belongs; A spends the least and is the
hardest to see.

And whether the middle of that row should be spoken for at all. It is the only
piece of the bottom of the screen that is currently empty, which is an argument
both ways.

## Building it

    cd demo-journal-link && node build.js

`mockup.src.html` carries no page wrapper, because the same file is published
as an Artifact where the wrapper is supplied. `build.js` adds one back and
writes `mockup.html`, which opens directly in a browser with no server, and
which `.gitignore` keeps out of the repository.
