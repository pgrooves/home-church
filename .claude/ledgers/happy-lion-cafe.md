# Happy Lion Cafe, working ledger

The running context for the lobby cafe ordering page ("Coffee" in the •••
menu). Not shipped in the app (`scripts/sync_web.js` only copies index.html,
css, js, assets, data). Any session picking this up should read this file
top to bottom first, then update it before ending.

**THIS REPOSITORY IS PUBLIC.** Nothing secret goes in this file or anywhere in
git: no Square access tokens, no webhook signature keys, no OAuth client
secrets. Those live only as Supabase Edge Function secrets (names below).

---

## Status

| Step | State |
|---|---|
| Logo vectorized | Done, `assets/img/happy-lion-cafe.svg` |
| Logo walks on the Coffee page | Done 2026-10-08, `assets/img/happy-lion-cafe-walking.svg` |
| Mockups | Done, signed off by Trey 2026-10-03 (`demo-happy-lion-cafe/mockup.src.html`) |
| Code: database, functions, app screens, admin | **Built** on branch `claude/happy-lion-cafe-ordering-y8zove` |
| Tests | `tests/cafe.test.js` (57), `supabase/tests/0085_happy_lion_cafe_test.sql` (26); full `npm test` green |
| Real app render | `node demo-happy-lion-cafe/render.js` (7 screens, sample data, no network) |
| Migration 0085 applied to the live project | **Done 2026-10-03, except 2 statements** (see "Live state") |
| Functions deployed | **Done 2026-10-03**: cafe-checkout v1, cafe-square-webhook v1, send-push v21 |
| Square sandbox secrets set (Trey's account) | **Waiting on Trey** |
| End to end sandbox test order | Not yet |
| Swap to cafe owner's production account | Not yet, needs owner |

Last updated: 2026-10-03, first build.

---

## What was built

**Customer (Coffee page, `js/screens/cafe.js`, logic in `js/cafe.js`):**
- Menu with the logo, today's status line, "Your order #N" card if you have
  one open today, a "Behind the counter" card for baristas, drink cards.
- Drink sheet: size (12/16 oz), half & half and 2% (None/Light/Regular/
  Extra), sugar and Splenda packets 0 to 4. Add or Save changes.
- Your order: lines with Edit/Remove, pickup time chips grouped by service
  (past and full times disabled), name for the cup (remembered), subtotal,
  tax, total, Pay button. Signed out people are sent to sign in.
- Pay creates the order server side, opens Square's hosted checkout in the
  in-app browser, and goes to the ticket.
- Ticket: waits for payment (polls the `refresh` action every 5s and on
  return to the app), then ticket number, place in line, Paid / In the
  queue / Making / Ready tracker. Toast and haptic when it turns ready.
- Push "Your coffee's ready" to the phone the order was placed from.

**Open / Closed (Trey, 2026-10-03):** under the logo everybody sees
"Cafe Is Open!" (green) or "Cafe is Closed." (red), his exact words.
- **Schedule (default):** open Sundays from `cafe_opens_at` 07:50 (10 min
  before the 8:00 service) to `cafe_closes_at` 11:20, church time.
  ASSUMPTION: Trey said "20 minutes after the third service"; read as after
  the 11:00 service *starts*. If he meant after it ends, change
  `cafe_closes_at` in Admin, App settings (no code change). The 11:45 pickup
  time was replaced with 11:15 so no pickup falls after closing; pickups
  after `cafe_closes_at` are refused on a scheduled day.
- **Off day override:** Cafe mode people get Open / Closed buttons (Coffee
  page card and top of the queue). Tapping the opposite of the schedule
  writes `cafe_open_override` = "open YYYY-MM-DD" / "closed YYYY-MM-DD",
  which wins for that date only; tapping the one the schedule already says,
  or "Back to the schedule now", clears it. Opened by hand on an off day,
  any pickup time is allowed. `hc_cafe_set_open('open'|'closed'|'schedule')`.
- Same rule in `openState` (`_shared/cafe.mjs`, enforced by cafe-checkout)
  and `HC.cafe.openState` (app); `tests/cafe.test.js` checks they agree.
  Phones re-ask every 30s on the menu and order screens and repaint when
  the clock crosses open/close time.
- Replaced the earlier "Taking orders" switch and the one-day `cafe_open_on`
  draft (0085 deletes both rows if a draft was ever applied).

**Counter (`cafe` route, id `queue`):** stats, Open / Closed (schedule note),
orders grouped by pickup time, Start / Ready, notify <name> / Picked up, undo
links, recent picked up list. Polls every 8s. Visible to `can_run_cafe` or
admins.

**Admin:** Pages has "Happy Lion Cafe page" (`cafe_on`, OFF by default).
Manage users has a **Cafe mode** switch per member, beside Leader mode
(Trey's name for it, 2026-10-03). Cafe mode = `profiles.can_run_cafe`;
admins have it implicitly. It grants the queue, Start / Ready (the push to
the customer) / Picked up / undo, and pausing orders. People in Cafe mode
see Coffee in their menu even while `cafe_on` is off, with a line saying
nobody else can see it, so the owner can set up before launch. The users
list tags them "Cafe" (or "Leader · Cafe"). App settings lists the
other cafe settings (taking orders, every day for testing, tips, tax
percent, drinks per pickup time).

**Navigation:** Coffee is in the ••• menu between Give and Settings (Admin
also sits between them on an admin's phone). Only shows when `cafe_on`.

**Files:**
- `supabase/migrations/0085_happy_lion_cafe.sql` (tables, RLS, RPCs, seeds,
  `cafe_ready` push topic). Test: `supabase/tests/0085_happy_lion_cafe_test.sql`.
- `supabase/functions/_shared/cafe.mjs` (pricing, time, Square body,
  signature) shared by:
  - `supabase/functions/cafe-checkout/index.ts` (`create`, `refresh`)
  - `supabase/functions/cafe-square-webhook/index.ts`
- `supabase/functions/send-push/index.ts` learned `cafe_ready` (one phone).
- `cafe-return.html` at the repo root: Square's redirect after paying,
  served from GitHub Pages at
  `https://pgrooves.github.io/home-church/cafe-return.html`. **Only live
  once this branch is on the branch Pages publishes.** Until then, set
  `CAFE_RETURN_URL` to any https page, or ignore (closing the sheet works).
- App: `js/cafe.js`, `js/screens/cafe.js`, styles at the end of
  `css/screens.css`, icons `coffee`/`iced` in `js/components.js`, bundled
  menu in `js/data.js`, sync in `js/content.js`, wiring in `js/app.js`,
  `js/router.js`, `js/admin.js`, `js/screens/admin.js`, `js/auth.js`,
  `js/store.js`, `index.html`.

**How it works:**
- Prices always come from `cafe_menu_items` on the server. The phone's total
  is display only; `tests/cafe.test.js` checks both agree.
- Square Payment Link (Checkout API) with the order inline: line items are
  ad hoc ("Hot Coffee, 16 oz") with modifiers, a PICKUP fulfillment
  (recipient = cup name, pickup_at), an ORDER scoped tax from
  `cafe_tax_percent`, `reference_id` = our order id, idempotency key = our
  order id. A size with `square_variation_id` set goes by catalog id instead.
- Paid = webhook `payment.created/updated` with status COMPLETED, or the
  `refresh` action reading the Square order's tenders and payments. Both
  call `hc_cafe_mark_paid`, which assigns the day's ticket number once.
- Ready = `hc_cafe_set_status(..., 'ready')`, which calls
  `hc_send_push('cafe_ready', false, order_id)`.
- Ordering day: Sunday only (church time, America/Chicago), or every day
  when `cafe_every_day` is on (for testing). A time closes 5 minutes before.
- Capacity: drinks per time from `cafe_slots.capacity` or
  `cafe_slot_capacity` (default 8, 0 = unlimited). Unpaid orders hold their
  drinks for 20 minutes.
- Sign in required to order.

**Defaults chosen without an answer from Trey (change any time):**
- Prices $3.00/$3.50 hot, $4.00/$4.75 cold brew (`cafe_menu_items`).
- Pickup times 7:40, 7:50, 8:45 / 9:10, 9:20, 10:15 / 10:40, 10:50, 11:15
  (`cafe_slots`). Note 7:40 is before the 7:50 opening, so it can only be
  picked on a day the counter opened early by hand; drop or move it once the
  real times are known.
- 8 drinks per time. Tips off. Tax 0% until set (Admin, App settings).
- Cancellations and refunds: done by the owner in Square. There is no
  Cancel button in the queue yet.

---

## Config swap (the plug-and-play part)

Everything account specific is a secret on the functions. Switching from
Trey's sandbox to the owner's production account = change these, redeploy
nothing:

| Secret | Used by | Sandbox (Trey) | Production (owner) |
|---|---|---|---|
| `SQUARE_ENV` | cafe-checkout | `sandbox` | `production` |
| `SQUARE_ACCESS_TOKEN` | cafe-checkout | Sandbox access token | Owner's production token |
| `SQUARE_LOCATION_ID` | cafe-checkout | Sandbox location id | The cafe's location id |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | cafe-square-webhook | From the sandbox webhook subscription | From the production one |
| `SQUARE_WEBHOOK_URL` | cafe-square-webhook | `https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/cafe-square-webhook` | same |
| `CAFE_RETURN_URL` (optional) | cafe-checkout | defaults to the GitHub Pages page | same |

Not needed by the code: the Square Application ID (hosted checkout does not
use it). Orders record which environment they were made in (`square_env`), so
sandbox orders are never refreshed against production.

Commands (from a machine with the Supabase CLI linked to the project):

    supabase db push            # or paste 0085 into the SQL editor
    supabase functions deploy cafe-checkout
    supabase functions deploy cafe-square-webhook --no-verify-jwt
    supabase functions deploy send-push --no-verify-jwt
    supabase secrets set SQUARE_ENV=sandbox SQUARE_ACCESS_TOKEN=... SQUARE_LOCATION_ID=...
    supabase secrets set SQUARE_WEBHOOK_URL=https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/cafe-square-webhook
    supabase secrets set SQUARE_WEBHOOK_SIGNATURE_KEY=...

Square developer dashboard, Webhooks, Add subscription: URL exactly as
`SQUARE_WEBHOOK_URL`, events `payment.created` and `payment.updated`, API
version 2024-10-17 or later. Copy its Signature Key into the secret.

**Owner's account later, two options:**
- A. Owner (or Trey with him) creates an application at
  developer.squareup.com under his login and copies the Production access
  token and location id; adds the production webhook. Simplest, but that
  token can do anything in his account.
- B. OAuth "Connect Square" button (recommended, NOT BUILT YET): owner
  approves only ORDERS_READ/WRITE, PAYMENTS_READ/WRITE, ITEMS_READ,
  MERCHANT_PROFILE_READ. Needs a `cafe-square-oauth` function, a token table
  readable only by the service role, refresh before the 30 day expiry, and
  `cafe-checkout` reading the token from there instead of the secret.

---

## Waiting on Trey

To test in sandbox:
- [ ] Apply migration 0085 and deploy the three functions (commands above),
      or let a session with Supabase access do it. (The Supabase MCP server
      failed to connect in the 2026-10-03 sessions, proxy 403.)
- [ ] Set `SQUARE_ENV`, `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` from his
      sandbox app. Do not paste tokens into GitHub or chat if avoidable.
- [ ] Sandbox webhook subscription + `SQUARE_WEBHOOK_SIGNATURE_KEY` and
      `SQUARE_WEBHOOK_URL`. (Optional for a first test: the ticket screen's
      refresh confirms payment without it.)
- [ ] In the app as an admin: turn on Happy Lion Cafe page, turn on "Cafe:
      orders every day" to test on a weekday, set tax percent.
- [ ] Place an order, pay with a Square sandbox test card (4111 1111 1111
      1111, any future date, CVV 111, any ZIP), check the ticket, turn on
      Cafe mode for an account, mark it ready, confirm the push.

Decisions still open:
- [ ] Real prices, pickup times, capacity, tips, tax rate.
- [ ] When orders open (now: any time on Sunday). Want Saturday evening?
- [ ] Cancel/refund button in the queue, or keep it in Square.
- [ ] Owner connection: A or B.
- [ ] Higher resolution logo from the owner, if he has one.

Go live with the owner:
- [ ] Owner's full menu (items, sizes, prices, options). Can be rows in
      `cafe_menu_items` now; mapping sizes to his Square catalog variation ids
      (`sizes[].square_variation_id`) makes his reports itemized properly.
- [ ] Owner's account connected (A or B), production webhook + key.
- [ ] Turn `cafe_every_day` off. Turn on Cafe mode for the owner's account.
- [ ] A real $1 order end to end, then refund it in Square.

---

## Ideas not built
- Mark the Square order's fulfillment PREPARED/COMPLETED when the counter
  taps Ready/Picked up, so it matches in the owner's Square dashboard.
- Realtime instead of polling for the queue.
- Cancel + refund from the queue (Square Refunds API).
- Read the menu from the owner's Square catalog instead of `cafe_menu_items`.

## Decision log
- 2026-10-03: Hosted checkout over Web Payments SDK (CSP, Apple Pay domain
  verification, PCI scope, App Store 3.1.3(e) allows outside payment for
  physical goods). Trey approved the plan and mockups.
- 2026-10-03: `cafe_on` defaults off.
- 2026-10-03: Nav label "Coffee", between Give and Settings (Trey).
- 2026-10-03: Sign in required to order.
- 2026-10-03: One route `cafe` with ids `order`, `t-<uuid>`, `queue`;
  `js/router.js` treats cafe-with-id as a pushed view, like admin.
- 2026-10-03: Push goes to the token stored on the order, and only if that
  token is still active in `device_tokens`.
- 2026-10-03: Logo: lion is a potrace of the supplied 180x216 JPEG at the
  threshold matching the original ink coverage; the lettering was redrawn as
  paths from measured strokes. Swap in a higher resolution original if one
  turns up; keep the file name.
- 2026-10-08: The lion walks in place and sips on the Coffee page.
  History, all Trey's calls the same day: a few degrees of rocking ("I said
  walk in place"), a knee lift and back kick, a stride cut from the logo's
  own legs (shipped, then "it looks like he's just dragging his left foot,
  both feet need to take a full stride extending from back to front"). The
  logo's legs could not do that: the near leg is one long pants leg with a
  shoe as long as the leg, and the far leg is folded back with its knee
  behind it, too long to swing under the hip. Trey chose redrawn legs, saw
  them in a preview artifact, and approved. `happy-lion-cafe-walking.svg`:
  - Original ink, cut by masks: head (nods for the sip), arm from the
    shoulder with sleeve and cup, tail, shorts (pelvis), shirt, words.
  - Redrawn: the pant legs, long as in the drawing (Trey, 2026-10-09: "the
    pants lining should sit above the ankles. Look at the original image";
    shorts were a stopgap). Each leg starts where the drawing's pant leg
    starts (the far leg's back edge out of the side line at (76.6,102.4),
    the near leg's front edge out of the zigzag at (99.45,104.1), the near
    leg's back seam from (85,104.75)), bends at a knee (hip (88.5,102),
    thigh and shin 13.9, knee solved from the ankle, bending forward), and
    ends in a cuff square to the shin that sits on the shoe's opening. The
    logo's shoe at 0.82, trimmed below the old shin line's stubs and closed
    with a smooth collar. The top of the pants stays the drawing's ink; it
    is cut where its side lines are single strokes, filled to exactly that
    cut, with a small round joint at each side so the new lines run out of
    the old ones without notches. Each ankle follows a planned path, heel
    strike out front, flat and back along the ground, forward through the
    air lifted 7; the shoe's own outline sets its height. 1.8s a stride, 20
    frames, SMIL animate d.
  - Sip every 7.2s: arm up 30 degrees, head 6, cup at his mouth; steam
    fades. While the arm is up, one curve carries the sleeve's underside from
    the arm's cut down into the armpit and into the shirt's side line, worked
    out frame by frame with the arm's turn (both sampled, 90 steps), and a
    paper patch covers the shirt line's little nub above the armpit. Both
    switch on the instant the arm starts to move, when they still match the
    still drawing (Trey, 2026-10-09: the arm "comes weirdly disconnected at
    the armpit" with the earlier two loose lines).
  - Steam: an S snaking straight up, 32 shapes on its own 3.6s loop.
  - Shirt, shorts, legs, shoes, sleeve and cup are filled with
    var(--hc-paper), so the page draws the file inline (fetched once in
    `js/screens/cafe.js`; the still logo stands in until it arrives and for
    reduced motion). When walking, his lower half no longer matches the
    still logo; the still logo itself is unchanged.
  The generator lives outside the repo; the SVG's comment says how it is
  built. The phone app only gets it after a rebuild (`npm run ios:open`);
  the web app on GitHub Pages gets it on push.

---

## Rollback (to the app as it was before the cafe, 2026-10-03)

Marker: branch **`rollback/pre-happy-lion-cafe`** on GitHub, pinned to
`main` at `cae68a1` ("Navigation: centre the whole block on the screen"),
which is the app code and the Supabase function code that were live before
any cafe change. The cafe was never merged into `main`, so the app itself
needs nothing; only Supabase changed.

Live before the cafe went in (checked 2026-10-03): last migration in the
list `blocked_signin_emails`; 13 Edge Functions; `send-push` at version 20,
identical to `supabase/functions/send-push/index.ts` on the marker;
`hc_admin_list_users` as 0036 left it; `hc_send_push` and the
`push_log_topic_known` check as 0078 left them.

To roll back Supabase:
1. SQL Editor: run `supabase/rollback/0085_happy_lion_cafe_down.sql` (on the
   cafe branch). One transaction. Tested: removes every cafe table, function,
   setting and the `can_run_cafe` column, restores the two functions and the
   check exactly, and is safe to run twice. It deletes cafe orders (Square
   keeps its own payment records).
2. Edge Functions: delete `cafe-checkout` and `cafe-square-webhook`.
3. Redeploy `send-push` from the marker branch's
   `supabase/functions/send-push/index.ts`, verify_jwt OFF.
4. Optional: remove the `SQUARE_*` and `CAFE_RETURN_URL` secrets.


---

## Live state (2026-10-03, after applying)

Applied through the Supabase connector (claude.ai "Supabase" MCP; the
repo's `.mcp.json` "supabase" server still fails with a proxy 403). The
connector holds any DROP/DELETE for a confirmation that never reaches the
session and times out after 60s, so 0085 went in as six non-destructive
migrations: `0085a_cafe_mode_column`, `0085b_cafe_mode_functions`,
`0085c_cafe_mode_grants`, `0085d_cafe_tables`, `0085e_cafe_functions`,
`0085f_cafe_push_sender`. Same SQL as 0085, with `create or replace trigger`
in place of drop + create, and without the draft-cleanup deletes (nothing to
clean on a fresh project).

**Still to run, by a person, in the SQL Editor:**
`supabase/manual/0085_finish_in_sql_editor.sql` (push_log learns
`cafe_ready`; `hc_admin_list_users` gains `is_barista`). Until then the
coffee-ready push still sends but is not logged, and the Cafe mode switch in
Manage users draws as off (setting it still works).

Checked after: 4 cafe tables, 2 menu items, 9 pickup times, 8 settings
(`cafe_on` false), 10 cafe functions; `cafe-square-webhook` answers "Not
configured" (no secrets yet); `cafe-checkout` refuses a caller with no
sign-in; `hc_send_push('test', true)` dry run reached send-push v21 and
counted 37 phones, nothing sent.

Nothing is visible in the live app: the app code is not merged, and the
Coffee page is off.


## 2026-10-04: "As soon as it's ready" (0086)

Trey tested on a Saturday evening after tapping Open: the page said Open but
"That's it for ordering ahead today", because every pickup time is a Sunday
morning time. His rule: **when the cafe is opened by hand, it is fully
working.** So while the counter has opened it (override "open <today>"), the
order screen offers **As soon as it's ready** first (pickup = now + 10 min,
set by cafe-checkout), and the "that's it for today" line never shows.
Scheduled Sundays are unchanged.

- `cafe_slots` row `asap` (inactive, so it never lists itself), migration
  `0086_cafe_asap_slot.sql`, applied live 2026-10-04.
- `asapProblem` in `_shared/cafe.mjs`; cafe-checkout deployed with it.
- Ticket says "Ready as soon as it's made"; queue groups it "As soon as it's
  ready".

Note on function version numbers: setting secrets bumps every function's
version without changing its code (all went +5 when the five SQUARE_*
secrets were set on 2026-10-03). Compare `ezbr_sha256`, not the version.

## 2026-10-04: chosen pickup times, Square email fix, cart bar (0087)

- **Square keys verified.** Webhook answers 401 "Bad signature." (both
  webhook secrets set). A real checkout attempt on 2026-10-04 03:18 UTC
  reached Square and was refused with `CONFLICTING_PARAMETERS: Only one of
  [fulfillment, buyer_email]`, which proves the access token and location
  are good. Fixed: the email now goes on the pickup recipient
  (`recipient.email_address`), never `pre_populated_data.buyer_email`.
- **Pickup times are chosen, not fixed.** Trey: "i want the user to select
  which time limited to 10 minutes before first service and 20 minutes after
  the last". The order screen is a dropdown of every 5 minutes from
  `cafe_opens_at` to `cafe_closes_at` (7:50 to 11:20), never sooner than 5
  minutes out, each labelled against the nearest service ("9:20, before the
  9:30 service"). Opened by hand: "As soon as it's ready" first, then from
  now to closing or an hour out, whichever is later. Same rule on both sides
  (`pickupTimes` in `_shared/cafe.mjs` and `js/cafe.js`, parity-tested).
  The phone sends `pickup_time: 'HH:MM'`; the order points at the inactive
  `'pick'` slot row (`0087_cafe_chosen_pickup.sql`, applied live) with the
  time in `pickup_at`. Capacity (`cafe_slot_capacity`) now counts drinks due
  within 5 minutes either side. Fixed slot ids still accepted from old phones.
- **Cart bar vs. the way-up arrow.** While "View order" is on screen the
  to-top disc stands down (`#app:has(.hc-cafe-cartbar) .hc-disc--top`), the
  same way it does for the highlight bar.
- cafe-checkout deployed v8.
