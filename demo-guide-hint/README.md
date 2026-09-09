# The guide highlighting hint — five studies

The hint that fires the first time somebody opens a folded section in a guide.
A sentence highlights itself, and something says why. Five drawings of the
"something", side by side on the real thing, made to be looked at and tapped
before anything in `js/` or `css/` is touched.

**Not built.** `HINTS.md` at the repo root is the map this belongs to, and
§12 of it is why nothing here has shipped. `demo-hint/` is the same exercise
for the account hint on Home. This folder is the second kind of hint in
`HINTS.md` §7: a **screen hint**, fired on arrival rather than on launch, and
retired by use rather than by an account.

## What it shows

The guide reader, Sermon Summary folded. Open it, the fold settles, and a beat
later the first sentence of the section washes itself in the app's own
highlight treatment. Then, depending on the study, something says what that
means:

- **A. The wash alone.** No words. The sentence lights and lets go. The
  quietest answer, and the one that may say nothing at all to somebody who has
  never seen the app.
- **B. A line under it.** One line of caption type on bare paper, at the left
  gutter. Nothing drawn around it.
- **C. A paper card.** The guides' signature left edge rule on a cream card.
  A word bubble in this app's own hand, with no tail.
- **D. A bubble with a tail.** The literal reading of the brief: ink, a caret,
  pointing up at the line. Drawn so the tail can be judged in place rather
  than argued about. `HINTS.md` §9 rules tails out; this is the drawing that
  either confirms that or overturns it.
- **E. The real bar, ghosted.** The docked Note this / Highlight pill fades in
  where it actually lives, above the plinth. The only study that shows the
  mechanism instead of describing it.

## The switches in the page

- **The study** — A through E.
- **The words** — four candidates, one line each. Narrow the window to an SE
  and watch which one wraps first. Voice rules from the design system §2b
  apply: second person, invitational, one sentence, no em-dash.
- **The phone** — light and dark, both from `css/tokens.css` unedited, carried
  on `[data-hc]` on `.stage` so the page around the phone cannot move it.
- **Motion** — Full, or Reduce Motion: no draw, the wash simply present, the
  words simply present, held 7500ms instead of 6000ms because there is no
  movement to draw the eye. It degrades, it never refuses, because this hint
  is information rather than decoration.
- **Its footprint** — draws the rectangle the words occupy. Not a shipping
  style. It is here because "it does not take taps" is a claim about a
  rectangle you cannot see.
- **The switch in Your account** — flips the phone to Display, where the one
  Hints switch lives.

## The log is the point

Every rule in `HINTS.md` §3 is invisible when it works. The panel on the right
says what ended the hint and what the tap that ended it went on to do.

Worth doing in this order:

1. **Tap the words while the card is up.** The log says the hint ended on a
   pointerdown, and that the tap landed on the paragraph, which is what it
   would have done anyway. `pointer-events: none` on the layer and every child.
2. **Turn on the footprint and tap inside it.** The rectangle sits over live
   prose, which is exactly why this study exists and the account hint's did
   not: on Home the caption landed on bare paper.
3. **Scroll.** Gone before the next paragraph clears the bar.
4. **Turn Hints off in Your account, then open a section.** The log says
   *Hints is off*, by name. A hint that fails to appear looks exactly like a
   hint that is switched off, and not being able to tell those apart is what
   cost the last attempt a revert.

## What is faked

- **Three sections, not six**, and the second one is the target every time.
- **The sentence the hint picks is fixed.** In the app it would be the first
  `[data-hl-path]` block in the section that was just opened.
- **The tab bar does not navigate**, and the index rail is drawn rather than
  live.

Everything else is the shipping thing: the tokens, the 20px gutter, the 52px
bar, the fold animation, the wash, the tap target sizes, and the docked bar's
true position above the plinth.

## One thing this fixes from last time

`HINTS.md` §12 blames the revert's stutter on a shape that animated
`background-position` over the blurred plinth. Nothing here animates a
background. The wash is one absolutely positioned box per line box of the
sentence, each scaled from its left edge on `transform`, and the words arrive
on `opacity` and `translateY`. That claim still has to be measured on a phone
rather than repeated in a comment, but the shape is at least the right shape.

## What it cannot settle

Whether the beat after the fold is right, and whether six seconds is. Both
feel different in a hand, at arm's length, in the sun, held by somebody who has
not seen the app before. The last attempt was green in a headless browser three
times and wrong on the first real phone. Open it on the phone before picking.

## Building it

    cd demo-guide-hint && node build.js

`mockup.src.html` carries no page wrapper, because the same file is published
as an Artifact where the wrapper is supplied. `build.js` adds one back and
writes `mockup.html`, which opens directly in a browser with no server.
