# The swipe hint

The screen leans toward the next tab and comes back, twice, on the clock the
index rail already hints on. One drawing with dials on it, made to be looked at
and swiped before anything in `js/` or `css/` is touched.

**Chosen: 22px, twice with the second smaller, unhurried, and no seam. Built.**
The page opens on those settings. It is the second hint the app has.

The seam lost, which is the one result reading would not have predicted and is
the reason this page exists. At 22px the movement is unambiguous on its own,
and every argument for the seam was an argument about 16px not being legible
enough. Dropping it takes an element, a parked pane and the dark-mode problem
below out of the build in one go: what ships draws nothing at all, and is one
transform on `#hc-view`. The seam switch stays on this page because the case
for 22 is only legible next to the thing it replaced.

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

### The seam, which is the question the page exists for

Paper slides over paper. `--hc-paper` moves sixteen pixels and `--hc-paper` is
behind it, so with nothing at the edge the lean can read as the app hiccupping
rather than as a page underneath.

The real gesture already solved this, in `css/components.css`:

```css
.hc-swipe__pane {
  /* The leading edge of a sheet of paper sliding over another one. Soft and
     narrow, so it is the seam that shows rather than a drop shadow. */
  box-shadow: 0 0 22px rgba(28, 24, 20, 0.10);
```

So the hint parks a pane one screen width away, the way a drag does, and lets
that same shadow ride in on the transform.

**The pane is empty, and that is deliberate.** A real pane renders the whole of
the next screen. The hint shows sixteen pixels of it, and rendering a screen
every thirty seconds to show sixteen pixels of it is the kind of cost that is
invisible on a desk and audible in a hand. Paper and the seam is all those
sixteen pixels contain either way.

**What building it turned up, which reading would not have.** That shadow is
`rgba(28, 24, 20, 0.10)`, a fixed near-black tuned against cream, and on a dark
phone it is not merely subtle, it is gone. In the real gesture that barely
matters: a whole screen arrives behind it and the content is its own edge. In
the hint the seam is the only thing there is, so in Dark the hint loses the one
element that makes it legible. The **Paper edge and a hairline** switch is the
candidate fix and it is not in the app today. Look at both in Dark before
deciding whether this ships at all.

## The numbers, and where they come from

| | |
|---|---|
| **16px** | The default lean. `LOCK_SLOP` in `js/swipe.js` is 10, the travel a real swipe eats before the screen starts moving, so a hint at 10 shows less movement than the gesture's own dead zone. `COMMIT_PART` is 0.26, about 102px on this phone, so 16 is nowhere near looking like a commit. |
| **Twice, the second smaller** | Once reads as a glitch. Evenly twice reads as a machine ticking. Decaying reads as a thumb testing and settling, which is the thing being described. |
| **260ms out, 340ms back** | Out quicker than back. Leaving is deliberate, returning is a release. |
| **No overshoot** | Design system §3g rules out springs. Out and back already feels elastic without the wobble, and the return eases to rest rather than past it. The distinction is worth keeping: the *return* is the hint, the *overshoot* is the thing the rule forbids. |
| **Left, unless left is the end** | It leans toward whatever is actually there, off `HC.router.lane()` and `laneIndex()`. On the last stop there is nothing further left, so it leans right. |

## Taking turns with the rail

`js/index-rail.js` hints two seconds after the greeting lifts and every thirty
seconds after that, on whatever screen you are on, until the rail is used. This
shares that clock rather than starting a second one, and alternates on it: the
rail, then the swipe, then the rail. One thing moves at a time.

The rail keeps the first beat. It is the harder of the two to stumble onto by
accident, and `HINTS.md` §12 says as much about this one: *"a sideways drag is
discovered by accident more than anything else in the app."*

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

1. **Watch it once with the seam off, then once with the paper edge on.** That
   is the whole question this page exists for.
2. **Switch the phone to Dark and do it again.** See above. This is the finding
   the build turned up.
3. **Swipe the phone.** The hint retires. The log says so by name.
4. **Put a finger down mid lean.** The log says how many pixels were handed
   over.
5. **Set it to *Inside a guide*.** Nothing happens, and the log says *a pushed
   view: nothing swipes here*. A hint that does not appear is otherwise
   indistinguishable from a hint that is broken, from the switch being off, and
   from a stale bundle, and not being able to tell those apart is what cost the
   last attempt a revert. `HINTS.md` §12, point 3.

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
