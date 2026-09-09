# The guide highlighting hint — seven studies

The hint that fires the first time somebody opens a folded section in a guide.
A sentence highlights itself, and something says why. Seven drawings of the
"something", side by side on the real thing, made to be looked at and tapped
before anything in `js/` or `css/` is touched.

**Chosen: D, at two seconds, and built.** The card under the line plus the
docked bar ghosted in where the offer really lands, held two seconds after the
words arrive and then faded. The page opens on it, and the other six stay
because the argument for D is only legible next to them.

**What ships differs from this study in one way**, and the study is left as it
was rather than quietly corrected: here a tap ends the hint early, and in the
app it does not. The layer still never takes a tap in either. See `HINTS.md`
for why the two rules came apart.

**Not built.** `HINTS.md` at the repo root is the map this belongs to, and
§12 of it is why nothing here has shipped. `demo-hint/` is the same exercise
for the account hint on Home. This folder is the second kind of hint in
`HINTS.md` §7: a **screen hint**, fired on arrival rather than on launch, and
retired by use rather than by an account.

## What it shows

The guide reader, Sermon Summary folded. Open it, the fold settles, and a beat
later the first sentence of the section marks itself. Then, depending on the
study, something says what that means, or nothing does.

**The marker, and words.** These hold and then fade.

- **A. A line of type.** One line of caption type on bare paper, at the left
  gutter. Nothing drawn around it.
- **B. A paper card.** The guides' signature left edge rule on a cream card.
  A word bubble in this app's own hand, with no tail.
- **C. A bubble with a tail.** The literal reading of the brief: ink, a caret,
  pointing at the line, and it turns over when the words sit above. `HINTS.md`
  §9 rules tails out; this is the drawing that either confirms that or
  overturns it.
- **D. The card and the bar.** B, plus the docked Note this / Highlight pill
  ghosted in where it actually lives, above the plinth. The only study that
  says what *and* shows where. **This is the one.**

**The marker alone, moving.** No words at all: the movement is the whole
hint, so these play once and are gone.

- **E. Drawn on, lifted off.** Rolls on from the left and straight back off to
  the right.
- **F. A band passes over.** A soft band travels each line and leaves nothing
  behind, twice.
- **G. On, held, then off.** Rolls on, sits about a second fully marked, wipes
  away.

The three sweeps cost two things, and the page says so rather than hiding it:
a hint made only of movement cannot wait to be answered, so somebody looking
at the heading they just tapped misses all of it with no trace it ran; and it
has no still version, so Reduce Motion gets a different hint wearing the same
name.

## The highlight is a change to the app, not to the hint

What the app draws today is a wash in the bottom of the line, closer to an
underline than a marker: `.hc-hl` in `css/components.css`. Every study here
draws a block behind the whole of the words instead, painted *under* the prose
on its own layer so the ink stays on top of the marker rather than behind a
film of it.

**The highlight** switch in the rail runs the two side by side, and the
existing highlight in the Overview changes with it, because shipping this
means changing `.hc-hl` and therefore restyling every highlight anybody has
already made.

## The switches in the page

- **The study** — A through G, in two racks. Picking from one lets go of the
  other; it is one choice.
- **Where the words go** — above the line or below it. Below leaves the
  sentence clear and covers the one after it; above covers whatever the
  paragraph was under. There is no placement that touches nothing.
- **How long it stays** — 2s, 3s, 4.5s, or until tapped. Counted from the
  moment the words land, not from the tap, because the marker spends about a
  second drawing first. Two seconds of reading is about three seconds of hint.
- **The words** — four candidates, one line each. Narrow the window to an SE
  and watch which one wraps first. Voice rules from the design system §2b
  apply: second person, invitational, one sentence, no em-dash.
- **The highlight** — the block behind the words, or the wash the app draws
  today. See above; this one is a change to `.hc-hl`.
- **The phone** — light and dark, both from `css/tokens.css` unedited, carried
  on `[data-hc]` on `.stage` so the page around the phone cannot move it.
- **Motion** — Full, or Reduce Motion: nothing draws itself, the marker and
  the words are simply present. It degrades, it never refuses, because this
  hint is information rather than decoration. A sweep under Reduce Motion has
  nothing left to be.
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
   would have done anyway. `pointer-events: none` on both layers and every
   child.
2. **Let it run out instead.** The log names the clock rather than the tap,
   and it leaves at 450ms rather than 200: a tap is an answer and the hint
   should get out of its way at once, while a clock nobody set should leave
   the way the toast does.
3. **Turn on the footprint and tap inside it.** The rectangle sits over live
   prose, which is exactly why this study exists and the account hint's did
   not: on Home the caption landed on bare paper.
4. **Scroll while it is up.** It stays, and it travels with the sentence,
   because both layers are drawn in the scroller's own coordinates. Reading on
   is not an answer.
5. **Turn Hints off in Your account, then open a section.** The log says
   *Hints is off*, by name. A hint that fails to appear looks exactly like a
   hint that is switched off, and not being able to tell those apart is what
   cost the last attempt a revert.

### The bug this page found, which the app would have had too

The listener that ends a hint on any tap was bound to `document`, which is
correct in the app, where the document is the app. In a study embedded in a
web page it also caught the touch that scrolls that page, so on a phone the
hint died under the finger scrolling down to look at it, every time, and the
words looked as though they never came. Twice reported as "I don't see any
text bubble".

It is bound to the phone here, with the reason written above the listener.
Worth remembering when this is built for real: in the app the equivalent
listener does belong on `document`, and the near miss is a hint layer that
lives inside something else that scrolls.

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
background. The marker is one absolutely positioned box per line box of the
sentence, each scaled from its left edge on `transform`; the travelling band
in F is an element translated inside an `overflow: hidden` box; and the words
arrive on `opacity` and `translateY`. That claim still has to be measured on a
phone rather than repeated in a comment, but the shape is at least the right
shape.

## What it cannot settle

Whether the beat after the fold is right, and whether two seconds is. D asks
for two readings in two places, the card under the line and the bar at the
bottom of the screen, and two seconds is comfortable for the first and tight
for the round trip. Somebody who glanced away at the wrong moment gets
nothing, with no way to ask for it back until the next launch.

Both feel different in a hand, at arm's length, in the sun, held by somebody
who has not seen the app before. The last attempt was green in a headless
browser three times and wrong on the first real phone. Open it on the phone
before building it.

## Still to decide before any of this ships

- **Whether `.hc-hl` changes**, which is the block-behind-the-words question
  above and the only part of this that touches guides people have already
  written in.
- **How this hint is retired.** The rule in `HINTS.md` §7 is retire on use:
  the first highlight anybody makes ends it for good on that phone. Nothing
  here draws that, because a study cannot show you a thing not happening.
- **What happens on launch one**, where `HINTS.md` §7 says no screen hint
  fires at all: somebody opening this app for the first time is looking at a
  church, not learning a piece of software.
- **The scheduler**, which does not exist. §7 lists the three things
  `js/hints.js` would need before it could run a screen hint at all: separate
  budgets from the launch hint, arming on a view change rather than at boot,
  and persistence, which §3d deliberately removed.

## Building it

    cd demo-guide-hint && node build.js

`mockup.src.html` carries no page wrapper, because the same file is published
as an Artifact where the wrapper is supplied. `build.js` adds one back and
writes `mockup.html`, which opens directly in a browser with no server.
