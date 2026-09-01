# Hints

Where a new phone gets pointed on its first launch, and the one piece of
machinery that has to exist before that question has a good answer.

This is a map, not a record. Nothing in here is built yet.

Read `Home Church app design system.md` §2b (voice), §3g (motion) and §7
(accessibility) alongside it. The precedent in code is `js/index-rail.js`,
which already ships the only hint this app has, and `js/splash.js`, which
already owns the moment a hint would go.

---

## 1. What we are actually solving

Somebody installs the app. The gold house rises, "Welcome home." arrives, the
light crosses the mark, the layer lifts, and they are standing on Home with no
account and no idea that the small disc in the top right corner is where an
account comes from.

Everything on that screen works signed out. That is deliberate and it should
stay that way. It is also exactly why nothing on the screen tells them to sign
in: there is no wall, no gate, no blocked feature nagging them. The cost of
that generosity is that the one thing worth doing first is the one thing
nothing points at.

So the job is narrow. Point at the avatar once, early, quietly, and get out of
the way. Not a tour. Not a wall. Not a welcome modal.

**The hint's goal is to show them where, not to make them sign up.** That
distinction settles most of the decisions below.

---

## 2. The app already has a hint, and it sets the house style

`js/index-rail.js` shows its hand two seconds after the greeting lifts: one
swell travels down the notches on the right edge, as though a thumb went down
it without you. Still untouched thirty seconds later, it does it again, and
every thirty seconds after that until the rail is used. Then it stops for the
launch.

Four things about it are worth keeping, and one thing about it does not
transfer.

**Keep: the hint is the thing itself moving.** No overlay, no callout, no
label. The rail demonstrates the rail.

**Keep: it costs nothing to draw.** Transform and opacity, on a loop that
stops itself. No layout, no classes, no reads.

**Keep: it refuses.** Not over a thumb already down, not into a screen nobody
is looking at, not under Reduce Motion.

**Keep: using the thing ends the hints.** There is nothing left to hint at.

**Does not transfer: demonstration.** A scrub can be mimed. A tap on a 42px
disc cannot: a disc that pulses is a disc that looks like it has a
notification, not a disc that looks like it wants pressing. So the account
hint needs a second kind, a **pointer**, where the rail's is a
**demonstration**. Same rulebook, different drawing.

---

## 3. The five decisions to make first

### 3a. The hint layer never takes a tap. Ever.

This is the whole promise and it is one CSS line:

```css
.hc-hint, .hc-hint * { pointer-events: none; }
```

Not `pointer-events: auto` with a click-through handler. Not a transparent
scrim that forwards events. Actually `none`, on the layer and every child, so
there is no code path anywhere in which a tap lands on a hint instead of on
the app.

What this buys: tapping the avatar *through* the hint just opens Profile, and
the hint dies on the way. Tapping a card behind the caption opens the card.
There is nothing to dismiss because there is nothing in front of anything.

What it costs: no "Got it" button, no x, no tappable hint. Good. A hint you
have to dismiss is a modal wearing a smaller coat, and this app already
decided that the way you put something away is by going on with what you were
doing. The pinned announcement has an x because it is chrome that stays. A
hint is not chrome. It is a sentence said once.

**This line should never be traded away for a dismiss affordance.** If a
future hint seems to need one, the hint is wrong, not the rule.

### 3b. Tapping away ends it, and the tap still lands

The listener is capture phase, passive, and does exactly one thing:

```js
document.addEventListener('pointerdown', end, true);
```

It never calls `preventDefault`, never calls `stopPropagation`, never inspects
the target to decide whether the tap "counted". Every pointerdown anywhere is
the end of the hint, including the one on the avatar itself, and every one of
them continues to whatever it was going to do.

Capture phase rather than bubble so the hint is already leaving while the
tapped thing is still deciding what to do, which is what keeps the fade out
from starting after a screen has already changed underneath it.

### 3c. It goes away, and "away" means what it says

Every one of these ends the hint. There is no state in which it stays up
through any of them.

| What happens | Why it ends the hint |
|---|---|
| Any `pointerdown` | §3b. They are using the app. |
| Any scroll of `#hc-scroll` | Same. They are reading, not looking at the header. |
| A route or tab change | The screen it was anchored to is gone. |
| `focusin` | Keyboard or VoiceOver is driving. They are finding their own way. |
| The ••• sheet opens | Something else owns the glass. |
| `visibilitychange` to hidden | Nobody is there. |
| An `auth` event with `signedIn` | The job is done. |
| Its own timer, about 6 seconds | Long enough to read twice. |
| `resize` or orientation change | The anchor measurement is stale, and re-measuring is not worth the code. |

Six seconds is the number I would start at and the number I would expect to
change. It wants to be long enough to be read by somebody who looked away at
the wrong moment, short enough that it is gone before it becomes furniture.

### 3d. How many times, across how many launches

The user's instinct, "if they tap away it should go away, not persist", is
right about a session and leaves the launch question open. Two bad answers and
one good one.

**Bad: once, ever.** Somebody dismisses it on launch one because their thumb
was already moving. That was their only chance and they never get told.

**Bad: the rail's rule, every thirty seconds until used.** Right for a gesture
nobody can discover on their own, wrong for a pointer at a visible button.
Repeating it is nagging, and the design system already ruled: no guilt
mechanics, no fake urgency.

**Good: three strikes, and any visit to Profile retires it.**

- Launch 1, 2 and 3: shown once each, if still signed out.
- Opening Profile at all, signed in or not, retires it permanently. They found
  the door. Whether they walked through it is theirs to decide.
- Signing in retires it.
- After the third showing it retires itself.

Somebody who has opened this app three times and never once touched the top
right corner has decided, and a fourth showing is the app not listening.

**The counter increments on show, not on dismiss.** Otherwise a launch that
opened straight into a guide, where the hint was never eligible, burns a
strike for a hint nobody saw.

### 3e. One hint per launch, whatever else is registered

This is the rule that makes it safe to add a second and third hint later
without anybody having to re-audit the first.

A launch shows at most one hint. Everything else waits for another day. Two
hints on the same screen is a tour, and a tour is the thing we are not
building.

It also settles a collision that exists on day one: the index rail already
takes the 2000ms slot after the splash lifts, and the account hint wants
roughly the same moment. On a signed out first launch, the account hint should
win and the rail should skip its opening swell. Its standing thirty second
offer can stay, because by then the account hint is long gone.

---

## 4. What it looks like

Two parts, and the second one is optional in a way the first is not.

### The ring

A soft gold ring grows out of the avatar disc's edge and fades, twice, about
1400ms apiece with a beat between. Drawn on a pseudo element so it cannot
touch layout, animated on `transform` and `opacity` only, which is the same
discipline `js/index-rail.js` holds itself to.

Gold because `--hc-gold` is already the app's one findable color, and the
tokens file says so out loud: "being the only gold thing on the screen is what
makes it findable." The splash's gleam is the same idea, a warm light crossing
the mark, and a ring breathing out of the disc reads as a relative of it
rather than as a notification badge.

No bounce, no overshoot, no spring. §3g of the design system is explicit and
this is not the place it carves out for delight.

### The caption

One line of caption type on paper, sitting just under the top bar, right
aligned to the 20px page gutter so its right edge lands under the disc. It
fades up and settles about 4px, the same small unhurried arrival the toast
makes at the other end of the screen.

**No nub, no caret, no arrow.** Proximity plus the ring does the work, and a
nub is one more piece to get wrong against a notch, a Dynamic Island, and a
status bar that is a different height on every phone.

**Copy.** Voice rules apply: second person, invitational rather than
instructional, no em-dashes, one sentence.

- "Make it yours." Pairs with the little house that sits in the disc when
  nobody is signed in. Invitational. My recommendation.
- "Your account lives here." Plainer, says the actual noun, slightly longer.
- "Start here." Shortest and the most instructional, which is the one thing
  §2b asks us not to be.

The copy is yours. Whichever one it is, it should be one line at
`--hc-caption` and it should never wrap on a 375pt phone.

### Reduce Motion

The rail's hint refuses outright under Reduce Motion, and that is right for a
decoration. This one is information, and refusing it would take the
information away from the people who asked for stillness.

So it degrades rather than refuses, which is the call `js/splash.js` already
made with `FLOOR_STILL`: no ring, no travel on the caption, the caption simply
present, held a little longer because there is no motion to draw the eye, then
gone. Same words, same place, no movement.

### Screen readers

The whole layer is `aria-hidden="true"`. The avatar already announces itself
as "Your account", which is better than any hint we would write, and a
visual pointer read aloud is noise.

The `focusin` death in §3c is the other half of this: the moment somebody
starts navigating by keyboard or by VoiceOver, the hint stops. They are
walking the controls in order and will reach the avatar on their own.

---

## 5. The infrastructure

One file, one registry, one scheduler. The point of building it as
infrastructure rather than as forty lines inside `app.js` is not that we have
many hints. It is that the rules in §3 are the hard part, they are the same
for every hint, and the second hint should get them for free rather than
re-derive them badly.

### `js/hints.js`

```js
HC.hints = {
  register: function (spec) {},   // a hint declares itself
  arm: function () {},            // boot calls this once, after splash.ready()
  end: function () {},            // anything can end whatever is showing
  busy: function () {}            // is a hint on the glass right now
};
```

A hint is a plain object, and every field but `id` and `show` has a sane
default:

```js
HC.hints.register({
  id: 'account',                  // stable, and the persistence key
  order: 10,                      // lower goes first when several are eligible
  limit: 3,                       // showings across launches
  delay: 2500,                    // ms after the splash lifts
  hold: 6000,                     // ms before it fades on its own

  // Is this worth showing right now. Asked once, at the moment it would go.
  when: function () {
    return HC.auth.isConfigured() &&
           !HC.auth.isSignedIn() &&
           HC.router.current().name === 'home';
  },

  // Where it points, measured at show time. Null means do not show.
  anchor: function () { return document.getElementById('hc-avatar-disc'); },

  text: 'Make it yours.'
});
```

The scheduler owns everything else: the ordering, the one-per-launch rule, the
delay off `HC.splash.whenGone`, the anchoring maths, the layer, the fade, the
whole death list, and the counter.

That split is the whole design. **A hint says what and where. The scheduler
says whether, when, and how it ends.** Nothing that registers a hint can get
the annoying parts wrong, because nothing that registers a hint is allowed to
write them.

### Where the counters live

Straight into `js/store.js`, next to `dismissed` and `dismissedPins`, in the
same shape and for the same reasons:

```js
// hc:hints
{ account: { shown: 2, retired: false } }
```

Two functions on `HC.store`, `hintState(id)` and `noteHint(id, patch)`, so
`js/hints.js` never touches `localStorage` itself and private browsing on iOS
stays somebody else's problem, which is what the wrapper at the top of that
file exists for.

### The one pure function, and the one test

```js
function shouldShow(state, ctx) // -> true | false
```

`state` is the stored `{ shown, retired }`, `ctx` is
`{ signedIn, configured, route, splashUp, sheetOpen, hidden, alreadyRanThisLaunch }`.
No DOM, no clock, no globals.

Which means `tests/hints.test.js` can cover the entire policy the way
`tests/announcements.test.js` covers its seams: node, `vm`, a faked
`localStorage`, no jsdom, no browser. The table is small and the cases are
exactly the ones a person would get wrong in six months:

- retired stays retired, whatever else is true
- signed in never shows
- unconfigured auth never shows, because pointing at a sign-in that is not
  wired up is worse than saying nothing
- the fourth launch does not show
- a launch where it was never eligible does not spend a strike
- two eligible hints in one launch yields one

The drawing is not tested and does not need to be. The policy is where the
bugs that matter live, and they are quiet ones: a hint that comes back forever
is a bug nobody files, they just stop opening the app.

### Files touched

| File | What |
|---|---|
| `js/hints.js` | New. The registry, the scheduler, the layer, the death list. Perhaps 200 lines, most of it the rules. |
| `js/store.js` | `hintState` / `noteHint`, next to the dismissals. |
| `js/app.js` | One `HC.hints.arm()` after `HC.splash.ready()`, and the account hint's registration next to it. Retire on the `auth` subscriber it already has, and on a `view` change to `profile`. |
| `js/index-rail.js` | Its opening swell asks `HC.hints.busy()` first. Four lines. |
| `css/components.css` | `.hc-hint`, `.hc-hint__caption`, and the ring on `.hc-avatar__disc`. Under the sheets at 55 and the toast at 60, over every other piece of chrome. z-index 48 is free. |
| `index.html` | One script tag with the shell chrome, after `js/index-rail.js`. Then `npm run stamp`. |
| `tests/hints.test.js` | The policy table above, wired into `npm test`. |

---

## 6. Build order

**Phase 0. The policy, with nothing drawn.**
`shouldShow`, the store shape, and `tests/hints.test.js`. Green before a
single pixel exists. This is the part that is actually hard to get right and
the part that is cheapest to fix now.

**Phase 1. The layer and the account hint.**
`js/hints.js`, the CSS, the registration, the rail's four line deference.
Ship it and watch one real first launch on a real phone, in sun, at arm's
length, held by somebody who has not seen it before.

**Phase 2. The retirements.**
Profile visit and sign-in mark it done. Small, and easy to forget, which is
why it is its own line rather than a footnote to phase 1.

**Phase 3, optional and not soon. A second hint.**
Only once phase 1 has been out long enough to know whether anybody noticed the
first one.

---

## 7. What the second hint would be, when there is one

Listed so the registry is built with them in mind, not so they get built.

- **Swiping between tabs.** Five tabs swipe sideways and nothing says so. The
  strongest candidate, and the one most likely to be discovered by accident
  anyway, which is an argument both ways.
- **The ••• sheet.** Four modules live behind one tile.
- **Highlight to note, in a guide.** Select a line, keep it. Genuinely
  undiscoverable, and it needs a guide open and a paragraph on screen, so it
  cannot ride the launch slot. It would want a different trigger entirely,
  something like the third guide opened, which is a good reason not to
  generalise the scheduler for it until it is real.
- **The date rail on Listen.** Probably not. It appears on scroll, which is
  its own hint.

---

## 8. Ideas worth skipping, and why

- **A spotlight or scrim over everything else.** This is the exact thing the
  brief rules out. It is in the way by construction, it is the loudest
  possible reading of "minimalistic", and it turns a sentence into a
  checkpoint.
- **A multi step tour with next and back.** Five taps before anybody has seen
  the app. Every one of them is a tap not spent on the thing they opened the
  app for.
- **A welcome modal before Home.** We already have the screen before Home and
  it is very good. Putting a second one behind it would spend the goodwill the
  first one earns.
- **An arrow, a pointing hand, or an animated finger.** Not this app's
  drawing. §3h: thin line, drawn not engineered, and nothing in the icon set
  gestures at anything.
- **Anything that repeats on a timer.** Covered in §3d. The rail earns its
  repeat by hinting at something invisible. A visible button does not.
- **A hint that survives a tap.** The one line in §3a is the promise. Every
  request to soften it is a request to make this a modal.
- **Counting how many people tapped it.** There is no analytics in this app
  and this is not the feature that should introduce one.

---

## 9. Settled, and still open

**Settled, unless somebody argues:**

- The layer never takes a tap.
- Any pointerdown ends it, and lands anyway.
- One hint per launch.
- Three launches, and any Profile visit retires it.
- Reduce Motion degrades it rather than refusing it.
- The policy is pure and tested; the drawing is neither.

**Still open, and yours:**

- The words. §4 has three and a recommendation.
- Six seconds, and 2500ms after the splash lifts. Both are opening guesses
  that want a real phone.
- Whether the ring is enough on its own without the caption. It is the more
  minimal answer and it may simply be too quiet to mean anything to somebody
  who has never seen the app. Worth building both and looking at them, because
  this is the one judgment in here that reading cannot settle.
- Whether the index rail's own hint should move into the registry in phase 3.
  It works, it is delicate, and "it is now consistent" is not by itself a
  reason to open it.
