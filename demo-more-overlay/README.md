# More, as an overflow sheet — mockup

A standalone rendering of the proposed ••• behaviour, made to be looked at
before anything in `js/` or `css/` is touched. Nothing here is wired into the
app.

**Built.** It shipped as *fill the width* and *flush*, the two defaults below,
with the modules kept at `?v=more` for old links. It lives in `js/app.js`
(the sheet, the peek, and the one `MODULES` array), `js/router.js` (the stops),
`js/swipe.js` (the longer row and the clamped tile) and the `.hc-oversheet`
block in `css/components.css`. This folder stays as the drawing it was decided
from, four across and one column included, so the alternatives are still here
if the grid ever needs revisiting.

## What it shows

Tapping ••• stops pushing the More list and lifts an overflow panel out of the
tab bar instead. The two modules behind it, Journal and Give, join the sideways
swipe, so Connect carries straight on into them rather than dead-ending.

The phone in the page is real, and you can use it:

- **tap •••** — the sheet comes up out of the plinth over 400ms, and tapping
  ••• again puts it back
- **drag the handle down** — the panel tracks the finger, the scrim fades with
  it, and past a third of the panel or on a flick it goes; let go early and it
  springs back
- **tap the paper behind it, or press Esc** — same thing
- **drag the page sideways** — the whole row runs under your thumb, Home
  through Connect and on into Journal and Give, with the raised tile parking on
  ••• once it gets past Connect
- **land on a module by swipe** — the sheet shows itself for a second with that
  module raised, then fades; no scrim, nothing dimmed. It is a label, not a
  menu: ••• on its own cannot say *which* module you are in. Swipe on and the
  second restarts; swipe back to a tab and it goes at once
- **tap another tab** — the scrim stops short of the bar on purpose, so the bar
  never goes dead under an open sheet

It runs the tokens from `css/tokens.css` unedited, the icons from `PATHS` in
`js/components.js`, and a tab bar built the way `css/components.css` builds it:
a plinth with the tile as a pseudo element placed by `--hc-tab-index`.

## The claim

**The sheet is the plinth again.** Same skin, same hairline, same sheen, same
26px corner, and exactly the bar's width: 351pt on a 375pt phone, inset the
same 12px from both edges, measured rather than eyeballed. It sits 8px above
the bar it came out of. Not a modal card in the app's paper, because that would
stack two different objects at the bottom of the screen and only one of them
would look like navigation.

**Slots only for what is there.** Two modules is one row, or two rows in the
column. Nothing is reserved for a third, and nothing reads as a hole waiting to
be filled. The grid caps at four across, so eight modules is the 2×4 it was
drawn as and the sheet never grows past two rows.

## The four things to decide

The page carries all of them behind controls, so they can be looked at rather
than argued about:

- **Layout.** *Fill the width* (default) fits the columns to the count, capped
  at four, so two modules make two wide tiles that span the sheet. *Four
  across* keeps the tile size fixed forever and leaves two of four standing
  empty today. *One column* stacks the slots instead: 58px each, so two is 21%
  of the screen, four is 36%, eight is 67% — and it is the only layout with
  room for the line that says what each module is.
- **Tiles.** *Flush* (default) puts the modules on the glass the way the five
  tabs sit on it, and spends the raised tile on the one you are in, which is
  the bar's own rule carried upward. *Raised* gives every module the tile.
- **Modules.** 2 is what ships. 4 is the full row, or the full column. 6 and 8
  are the same sheet a year from now, so the rule gets chosen once rather than
  renegotiated at every addition.
- **Theme.** Both, because the sheet is the plinth and the plinth already
  works in both.

## Building it

`mockup.src.html` carries placeholders for the two brand lockups. `build.js`
inlines them into a single self-contained file:

    cd demo-more-overlay && node build.js

Output is `mockup.html`, which opens directly in a browser with no server.

## If it is built

Five files, and the geometry of the bar is not one of them:

| File | Change |
| --- | --- |
| `js/router.js` | Split `TABS` into the five that show in the bar and the modules behind •••, and have the swipe run the concatenation. `isTab` answers for both. |
| `js/app.js` | The ••• tile opens the sheet instead of routing. The module list moves next to `TAB_META` so one array feeds the sheet, the swipe order, and the lit tile. The peek is one branch here: a view change onto a module, when the swipe was what brought you, shows the sheet for a second without its scrim. |
| `js/swipe.js` | Nothing structural. It already renders the neighbour into a pane and hands it to the router; it just has a longer list to index into, and the tile position clamps at five. |
| `css/components.css` | One new block, `.hc-oversheet`, reusing the `--hc-tabbar-*` tokens. No new colours. |
| `js/screens/more.js` | Keeps its route so old history entries and links still land, and stops being the thing ••• opens. |

Two open questions the mockup states rather than answers: whether the More
screen survives at `?v=more` for old links (leader mode is the only thing on it
that is not in the grid), and whether the sheet is a true modal or the
non-modal panel drawn here, where focus moves in, Esc closes, and the bar stays
reachable.
