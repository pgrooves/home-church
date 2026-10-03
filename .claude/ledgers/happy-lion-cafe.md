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
| Mockups | Done, signed off by Trey 2026-10-03 (`demo-happy-lion-cafe/mockup.src.html`) |
| Code: database, functions, app screens, admin | **Built** on branch `claude/happy-lion-cafe-ordering-y8zove` |
| Tests | `tests/cafe.test.js` (57), `supabase/tests/0085_happy_lion_cafe_test.sql` (26); full `npm test` green |
| Real app render | `node demo-happy-lion-cafe/render.js` (7 screens, sample data, no network) |
| Migration 0085 applied to the live project | **Not yet** (needs Trey or a session with Supabase access) |
| Functions deployed | **Not yet** |
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
