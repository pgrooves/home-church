# The swipe hint

The screen leans toward the next tab and comes back, twice, on the clock the
index rail already hints on. One drawing with dials on it, made to be looked at
and swiped before anything in `js/` or `css/` is touched.

**Chosen: 64px, twice with the second much smaller, unhurried, with the next
screen really drawn behind it. Built.** The page opens on those settings.

It got there in two passes, and the first one was wrong in a way worth keeping
on the record. **22px over empty paper shipped first**, on the reasoning that
the movement alone says the screens move and that rendering a whole screen to
show twenty pixels of it is a cost you feel in a hand and not on a desk. In the
app it read as *this screen wobbled*, not as *there is another screen over
there*. The fix was not a bigger wobble. A lean over paper says nothing at any
depth, because paper on paper has nothing in it to recognise.

So the lean goes deep enough to clear the 20px page gutter with about 44px to
spare, and the next screen is really rendered behind it. Somebody sees a word
that is not on this page. That is the whole claim the hint makes, and it is the
first version that actually makes it.

**Which retires the seam question rather than answering it.** Real content is
its own edge, in both themes, so the dark-mode problem below stops mattering
for this hint. The finding still stands about the shadow itself and the switch
stays on this page, because the reasoning is only legible next to the two
things it replaced.

`demo-hint/` is the same exercise for the account hint on Home, which is still
not built, and `demo-guide-hint/` is the one for the highlighting hint.

## What is hidden, and what this points at

The five tabs swipe. The row carries on past Connect into the modules behind
the ••• tile, and then one further into Settings. Nothing on any screen says
so. `HINTS.md` §8 has it in Tier 1 as the third row: *"`js/swipe.js` is a whole
navigation model nothing announces."*

The shape §8 assigned it was **travel across the tab bar**, and that is the
shape that failed. §12 blames the revert's stutter on it: it animated
`background-position` across the plinth, which has `backdrop-filter: blur(22px)
saturate(150%)` on it, so a live blur re-composited every frame for three
seconds at a time on a phone GPU. §12 asks for that shape to be *"rebuilt, or
dropped"*.

This is the rebuild, and it drops the shape rather than repairing it. Nothing
is drawn over the tab bar at all. The screen itself leans, which is a transform
on `#hc-view` and is exactly what `place()` in `js/swipe.js` already does sixty
times a second while a finger is down. The hint is the gesture performing a
little of itself, which is the house style `HINTS.md` §2 takes off the index
rail: *"the hint is the thing itself moving."*

## One drawing, not seven

`demo-guide-hint/` drew seven candidates because there were seven ways to say
the same thing. There is only one way to draw this one. What reading cannot
settle is how far it leans, how many times, how fast, and whether the seam at
its leading edge is necessary or fussy. Those are the switches, and everything
else on the page is there so those four questions can be asked against the real
thing.

### What is behind the lean, which is the question the page exists for

Three answers, and the page still draws all three because the one that won is
only legible next to the two it beat.

**Nothing.** Paper slides over paper. `--hc-paper` moves and `--hc-paper` is
behind it, so there is nothing in the uncovered strip to recognise, and the
lean reads as the app hiccupping. *This does not improve with depth*, which was
the thing worth learning: 64px of blank margin is the same non-statement as
22px of it, only louder.

**Paper and the seam.** The shadow `.hc-swipe__pane` already draws during a
real swipe:

```css
.hc-swipe__pane {
  /* The leading edge of a sheet of paper sliding over another one. Soft and
     narrow, so it is the seam that shows rather than a drop shadow. */
  box-shadow: 0 0 22px rgba(28, 24, 20, 0.10);
```

Better, and it fails in the dark. That shadow is a fixed near-black tuned
against cream, and on a dark phone it is not subtle, it is gone. In a real
swipe that barely matters, because a whole screen arrives behind it and the
content is its own edge. Where the seam is the *only* thing there, the hint
loses the one element that made it legible. The hairline variant is the
candidate fix and it is not in the app.

**The next screen, really drawn.** What ships. The lean clears the 20px page
gutter with about 44px to spare and there is a heading in that strip, so
somebody sees a word that is not on this page. Content is its own edge in both
themes, which is what takes the dark-mode problem off the table rather than
solving it.

It costs one screen render per hint. That is the cost a single swipe already
pays, once a minute, and the first draft of this hint spent a paragraph
avoiding it for a version that said nothing. The sum was right and the question
was wrong: twenty pixels of paper is not worth rendering a screen for, and it
is not worth leaning for either.

## The numbers, and where they come from

| | |
|---|---|
| **64px** | The first depth that clears the 20px page gutter with enough left over, about 44px, to show the first few characters of the next screen's heading. `LOCK_SLOP` is 10, the travel a real swipe eats before the screen moves at all. `COMMIT_PART` is 0.26, about 102px on this phone, so 64 is still clearly an offer rather than the app changing tabs and thinking better of it. |
| **Twice, the second much smaller** | The first lean teaches, the second is the echo that says it was a gesture rather than a glitch. At 0.35 the second is about 22px, which is where this started. Two deep shoves in a row read as the app struggling. |
| **300ms out, 380ms back** | Out quicker than back. Leaving is deliberate, returning is a release. Both longer than the first draft's, because the same duration over three times the distance is a much brisker movement. |
| **No overshoot** | Design system §3g rules out springs. Out and back already feels elastic without the wobble, and the return eases to rest rather than past it. The distinction is worth keeping: the *return* is the hint, the *overshoot* is the thing the rule forbids. |
| **Left, unless left is the end** | It leans toward whatever is actually there, off `HC.router.lane()` and `laneIndex()`. On the last stop there is nothing further left, so it leans right. |

## Taking turns with the rail

`js/index-rail.js` hints two seconds after the greeting lifts and every thirty
seconds after that, on whatever screen you are on, until the rail is used. This
shares that clock rather than starting a second one, and alternates on it: the
rail, then the swipe, then the rail. One thing moves at a time.

The rail keeps the first of those beats. It is the harder of the two to stumble
onto by accident, and `HINTS.md` §12 says as much about this one: *"a sideways
drag is discovered by accident more than anything else in the app."*

**A first launch opens on both, three seconds apart.** The swell at two seconds,
the lean at five. It is the one place the *one hint at a time* rule is spent on
two in a row, and it is worth it on the launch where somebody knows neither
direction. The swell takes 1.15s, so there is nearly two seconds of stillness
between them: two sentences rather than one busy moment.

The two opening timers are independent. A thumb on the notches does not call the
lean off, because touching the rail is not swiping to another page. The only
thing that calls it off is having already swiped, and `js/swipe.js` refuses that
for itself rather than the timer knowing about it.

**Both at once** is on the page so the argument against it is legible rather
than asserted. Two things moving is a tutorial, and the page sliding under the
notches drags the swell with it.

## The phone really swipes

The gesture underneath is `js/swipe.js` in miniature carrying its actual
numbers: `LOCK_SLOP`, `AXIS_BIAS`, `EDGE_PULL`, `COMMIT_PART`, `FLICK_SPEED`,
the settle duration and its easing. Without it the hint could only be watched
against a description of the movement it is teaching.

It is also the only way to see two of the rules work:

**Retire on use.** Swipe once and the hint stops for this launch, because you
have found the thing it was pointing at. That is the rail's rule. Replay puts
it back; on a real phone only relaunching does.

**The handover.** Put a finger down in the middle of a lean and drag. The
gesture takes the offset over from wherever the hint had the screen rather than
snapping to zero and starting again. `stopHint(keep)` in `js/index-rail.js`
already does this for the rail's swell, for the same reason: a hint that drops
what it was holding the moment you answer it is a hint you feel glitch.

## Worth doing in this order

1. **Watch it with *Nothing* behind it, then with the next screen drawn.** That
   is the whole question this page exists for, and the answer changed once it
   was watched in the app rather than here.
2. **Try 22px with the screen drawn behind it.** Almost all of what you see is
   the 20px gutter, which is why depth and content had to change together.
3. **Switch the phone to Dark on *Paper and the seam*.** The shipping seam is a
   shadow tuned against cream.
4. **Swipe the phone.** The hint retires, because you have found the thing it
   was pointing at. Replay puts it back; on a real phone only relaunching does.
5. **Put a finger down mid lean and drag.** The gesture takes the offset over
   from where the hint had it, and in the app it takes the rendered screen over
   too rather than tearing it down and building it again a frame later.
6. **Set it to *Inside a guide*.** Nothing happens, and the log says why by
   name.

## What is faked

- **Five screens, sketched**, plus four names standing in for the modules
  behind ••• and Settings at the end of the line.
- **The gesture reads pointers, not touches.** The real one reads touches,
  because `js/index-rail.js` and `js/pull.js` are reading the same finger and a
  pointer stream does not survive a page that is already moving. This is the
  largest thing in here that is not the shipping build.
- **The rail's notches are drawn, not live.** The swell is the real gaussian at
  the real numbers; what it does not do is read the headings off the page.
- **Nothing is retired across launches**, because a study cannot show you a
  thing not happening.

## What this cannot settle

**Whether it is worth building at all.** `HINTS.md` §12 says the sideways drag
is discovered by accident more than anything else in the app, and that is a
real argument for leaving it alone. This page can tell you whether the drawing
is good. It cannot tell you whether the hint is needed.

**Whether it stutters.** Nothing here animates a background and nothing is
drawn over the plinth, which is the shape §12 asks for. That is a shape
argument, not a measurement, and §12 is explicit that the measurement is the
part that was owed: *"Profiled on a real phone, not asserted in a comment."*
Every claim in this file about cost is still a claim.

**How it feels on the twentieth time.** Thirty seconds apart, for as long as
somebody has not swiped, is a lot of leaning. A week in a pocket answers that
and an afternoon at a desk does not.

## Where it went

`js/swipe.js`, not `js/hints.js`. The rail's precedent: a hint about a gesture
lives with the gesture, because it needs the mount, `place()`, `lane()`, and
already knows the moment a real drag happened, which makes retire on use one
line in `begin()`. `js/hints.js` is deliberately not a framework and
`HINTS.md` §12 asks for one hint at a time rather than a registry.

The clock is `js/index-rail.js`'s, shared rather than copied. `beat()` over
there alternates between the two and hands a turn to whichever one has
something to say. That file's `noteUse()` no longer clears the interval, which
it used to: the rail being finished is no longer the end of the clock.

`tests/swipe-hint.test.js` covers the policy and `tests/e2e/swipe-hint.js`
covers the drawing in the real app: that it leans, puts the screen back, drops
the compositor layer it asked for, leans the other way on the last stop, and
retires on a real drag.

## Building it

    cd demo-swipe-hint && node build.js

`mockup.src.html` carries no page wrapper, because the same file is published
as an Artifact where the wrapper is supplied. `build.js` inlines the brand PNGs
and adds a wrapper back, and writes `mockup.html`, which opens directly in a
browser with no server.
