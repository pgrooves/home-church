# Hints

Where a new phone gets pointed on its first launch, and the one piece of
machinery that has to exist before that question has a good answer.

This is a map, not a record. Nothing in here is built yet.

Read `Home Church app design system.md` §2b (voice), §3g (motion) and §7
(accessibility) alongside it. The precedent in code is `js/index-rail.js`,
which already ships the only hint this app has, and `js/splash.js`, which
already owns the moment a hint would go.

`demo-hint/` draws it. Three studies, both appearances, the shipping tokens,
and a log that says what ended the hint and what the tap that ended it went on
to do. Build it with `cd demo-hint && node build.js`.

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
distinction settles most of the decisions below: it is why there is no scrim,
no wall, no button to press, and why every tap in the app ends it.

It sits at an angle to §3d, which stops the hint on sign-in and on nothing
else, and the angle is worth naming rather than smoothing over. The account is
the stopping condition because it is the only *observable* one, not because
signing up is the goal. What we actually want to stop on is "they know where
it is", and no app can see that. An account is the one proxy the phone has,
and a proxy is what it stays: the hint never asks, never blocks, and never
counts. If it had a button, or a scrim, or a second sentence, this reading
would collapse and the rule in §3d would have to go with it.

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

**Every launch, until there is an account.** One showing per launch, on Home,
a couple of seconds after the greeting lifts, for as long as the phone is
signed out. Signing in is the only thing that ends it.

That is a deliberate change from what this document proposed first, and the
reasoning it replaces is worth keeping visible rather than deleting, because
it is the argument somebody will make again in six months.

The original proposal was three launches, with any visit to Profile retiring
the hint permanently: somebody who has opened the app three times and never
touched the top right corner has decided, and a fourth showing is the app not
listening. The counter-argument, which is the one that won: the hint exists to
answer a question the app never otherwise answers, and a person who has not
made an account still has that question. Retiring the pointer while the thing
it points at is still undone is the app deciding on their behalf that they
were not interested, on evidence no stronger than three launches.

It is also the rule the app already uses next door. `js/index-rail.js` hints
until the rail is used, then stops, and a new launch starts it over. This is
the same shape with a longer clock: hint until the thing is done, and the
thing here is an account rather than a scrub.

**What still ends it, and what no longer does.**

| | |
|---|---|
| Signing in | Retires it permanently. The only terminal condition. |
| Opening Profile without signing in | **No longer retires it.** It is shown again next launch. |
| Three showings | No longer a limit. There is no limit. |
| Tapping away, scrolling, the timer, all of §3c | Ends *this* showing, as before. Never the hint itself. |

**The cost of this, stated plainly.** Somebody who reads sermons signed out for
a year sees the same sentence a couple of hundred times. That is defensible
only because of what §3a and §3c make true: it is one line for six seconds, it
takes no taps, it is gone the moment they touch anything, and it never blocks
a thing. If any of those three ever softens, this rule has to be revisited on
the same commit. A hint that repeats forever and can be tapped is not a hint,
it is a banner.

**The one case still worth watching.** Somebody who opens Profile, reads the
sign-in copy, and closes it has told us something a person who never went
there has not. Pointing at that same door next launch is the closest this
design comes to not listening. It is not enough to hold the feature up, and
the answer if it ever grates is not to retire the hint but to quieten it:
after a Profile visit, drop to the ring alone with no caption, which still
answers "where" for somebody who forgot and says much less to somebody who
remembers. That is a two line change to the registration in §5 and it is
written down here so it does not have to be re-derived.

**Nothing increments any more, so nothing can be miscounted.** The counter and
the show-not-dismiss rule it needed both go away with the limit. The stored
state is one flag, and it is derived rather than written: signed in or not.
Which means there is no persisted hint state at all on the happy path, and
`hc:hints` exists only if the quietening above is ever built.

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

**What §3d does to this rule, which is the one thing that change costs.**
While the account hint retired itself after three launches, the slot came free
on launch four and any second hint inherited it. It does not any more: a
signed out phone spends its one hint on the account, every launch, forever. So
for as long as somebody stays signed out, **no other hint can ever run.**

That is a real trade and not a theoretical one, though it costs nothing today
because there is exactly one hint. It comes due the moment a second is
registered, and there is no need to pick the answer now. The three that will
be on the table, written down so the decision starts from here rather than
from scratch:

1. **Let it starve.** A signed out phone is a phone that has not started, and
   the account is the only thing worth pointing at until it has. Honest, and
   it means §7's list only ever reaches people with accounts.
2. **The account hint stands aside every third launch.** Keeps "every launch"
   in spirit, gives the registry a slot to breathe, and costs one line in the
   scheduler.
3. **Two slots on a launch, never two hints on a screen.** The most work and
   the most ways to get wrong. Not without a reason.

Whichever it is, `HC.hints` should keep deciding it. The moment a hint starts
reasoning about whether another hint got its turn, §5's split is gone and
every hint has to know about every other one.

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
  limit: 0,                       // 0 = no limit. `when` is the whole policy.
  delay: 2500,                    // ms after the splash lifts
  hold: 6000,                     // ms before it fades on its own

  /* Is this worth showing right now. Asked once, at the moment it would go.

     This is the whole of §3d. There is no counter beside it and no stored
     flag behind it: the hint runs while the phone is signed out and stops
     when it is not, and !isSignedIn() is that sentence in code. A policy you
     can read in one line is a policy that cannot drift from the document. */
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

Nowhere, which is the happiest consequence of §3d.

The three launch limit needed a per hint record on the phone, a counter that
had to increment on show rather than on dismiss, and a retirement flag that
two different events could set. All of it existed to answer "has this hint had
its turns yet", and §3d no longer asks. The question is now "is this phone
signed out", `HC.auth.isSignedIn()` already answers it, and the answer is
already correct across launches because the session is already persisted.

So there is no `hc:hints` key, no `hintState`, no `noteHint`, and no new lines
in `js/store.js` at all. The failure mode that came with them, a counter that
gets miscounted on a launch where the hint was never eligible, cannot happen
in a design that does not count.

If the quietening in §3d is ever built, that is the one thing that needs
storage: a single flag saying Profile has been opened. Worth noticing that it
would be the *only* reason to add persistence here, which is a good reason to
be sure it is wanted before adding it.

### The one pure function, and the one test

```js
function shouldShow(ctx) // -> true | false
```

`ctx` is `{ signedIn, configured, route, splashUp, sheetOpen, hidden,
alreadyRanThisLaunch }`. No stored state argument any more, because §3d left
none. No DOM, no clock, no globals.

Which means `tests/hints.test.js` can cover the entire policy the way
`tests/announcements.test.js` covers its seams: node, `vm`, no jsdom, no
browser, and now no faked `localStorage` either. The cases are the ones a
person would get wrong in six months:

- signed in never shows, which is the only terminal condition there is
- unconfigured auth never shows, because pointing at a sign-in that is not
  wired up is worse than saying nothing
- not on Home never shows
- the splash still up never shows
- two eligible hints in one launch yields one
- **a hundredth launch, still signed out, still shows.** The test that stops
  somebody adding a limit back as a kindness.

That last one is the point of having a test here at all. The old draft of this
section ended by saying that a hint which comes back forever is a bug nobody
files. Under §3d it is not a bug, it is the feature, and the thing nobody would
file is the opposite: a well meaning cap added later, by somebody who found the
repetition and assumed it was an oversight. A test is how a deliberate decision
survives contact with a reasonable person who was not in the room.

The drawing is not tested and does not need to be. The policy is where the
bugs that matter live.

### Files touched

| File | What |
|---|---|
| `js/hints.js` | New. The registry, the scheduler, the layer, the death list. Perhaps 200 lines, most of it the rules. |
| `js/store.js` | Nothing. §5 explains why the counters went away. |
| `js/app.js` | One `HC.hints.arm()` after `HC.splash.ready()`, and the account hint's registration next to it. The existing `auth` subscriber already fires on sign-in, and ending the hint there is one line inside it. |
| `js/index-rail.js` | Its opening swell asks `HC.hints.busy()` first. Four lines. |
| `css/components.css` | `.hc-hint`, `.hc-hint__caption`, and the ring on `.hc-avatar__disc`. Under the sheets at 55 and the toast at 60, over every other piece of chrome. z-index 48 is free. |
| `index.html` | One script tag with the shell chrome, after `js/index-rail.js`. Then `npm run stamp`. |
| `tests/hints.test.js` | The policy table above, wired into `npm test`. |

---

## 6. Build order

**Phase 0. The policy, with nothing drawn.**
`shouldShow`, and `tests/hints.test.js` around it, including the hundredth
launch case. Green before a single pixel exists. Smaller than it was: with no
stored state there is no store work and no faked `localStorage`.

**Phase 1. The layer and the account hint.**
`js/hints.js`, the CSS, the registration, the rail's four line deference. Ship
it and watch one real first launch on a real phone, in sun, at arm's length,
held by somebody who has not seen it before.

**Phase 2. Sign-in ends it.**
One line in the `auth` subscriber `js/app.js` already has. It was a whole phase
when there were two retirement paths and a stored flag behind them; now it is
the only one, and it is the difference between a hint and a permanent fixture,
so it is still written down rather than assumed.

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
- **Every launch until there is an account. Signing in is the only thing that
  ends it, and there is no limit and no stored counter.** §3d, decided after
  the first draft proposed three launches and lost the argument.
- Reduce Motion degrades it rather than refusing it.
- The policy is pure and tested; the drawing is neither.

**Still open, and yours:**

- The words. §4 has three and a recommendation.
- Six seconds, and 2500ms after the splash lifts. Both are opening guesses
  that want a real phone.
- Whether the ring is enough on its own without the caption. It is the more
  minimal answer and it may simply be too quiet to mean anything to somebody
  who has never seen the app. This is the one judgment in here that reading
  cannot settle, so `demo-hint/` draws all three and you look at them. What the
  drawing already turned up: study A has nothing left to show under Reduce
  Motion, which is an argument against shipping it on its own.

- Where the caption actually lands. Building it showed that on Home the
  rectangle sits in the gap between the bar and the greeting, with nothing
  tappable under it. Good news for the placement, and it means `pointer-events:
  none` earns its keep on the ring rather than on the caption: the rings are
  pseudo elements on the avatar *button*, and that is the tap that would be
  swallowed if they ever took a pointer.
- Whether the index rail's own hint should move into the registry in phase 3.
  It works, it is delicate, and "it is now consistent" is not by itself a
  reason to open it.

- **Which of the three answers in §3e a second hint gets**, since a signed out
  phone now spends its one slot on the account hint every launch and nothing
  else can run. Nothing to decide until a second hint exists, and the options
  are written down so it starts from there.

- **Whether the Profile visit case ever needs quietening.** §3d keeps showing
  the full hint to somebody who opened Profile and chose not to sign in, which
  is the one place this design comes closest to not listening. The fix, if it
  grates, is the ring alone without the caption, not a retirement. It is the
  only thing in the whole design that would need something stored, so it is
  worth being sure before building it.
