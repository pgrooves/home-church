# Happy Lion Cafe, working ledger

The running context for the lobby cafe ordering page. Not shipped in the app
(`scripts/sync_web.js` only copies index.html, css, js, assets, data). Any
session picking this up should read this file top to bottom first, then update
it before ending.

**THIS REPOSITORY IS PUBLIC.** Nothing secret goes in this file or anywhere in
git: no Square access tokens, no webhook signature keys, no OAuth client
secrets. Those live only as Supabase Edge Function secrets (names below). IDs
that are not secret on their own (application ID, location ID) can still go in
secrets so swapping accounts is one place.

---

## Status

| Step | State |
|---|---|
| Logo vectorized | Done, `assets/img/happy-lion-cafe.svg` |
| Visual mockups | Done, `demo-happy-lion-cafe/` (7 screens) |
| User sign-off on mockups and open questions | **Waiting on Trey** |
| Square sandbox credentials (Trey's account) | **Waiting on Trey** |
| Build against sandbox | Not started |
| Swap to cafe owner's production account | Not started, needs owner |

Last updated: 2026-10-03, mockup round.

---

## What we're building

A page in the ••• menu, switched on and off under Admin,
App settings, Pages, the same way as HomeKids, Practices and Alpha
(`PAGE_SWITCHES` in `js/screens/admin.js`, `*_on` rows in `app_settings`,
seeded by a migration like `0084_page_switches.sql`). Key: `cafe_on`,
**default OFF** (unlike the others) so it never appears before it's ready.

**Navigation (Trey, 2026-10-03):** the ••• menu label is **COFFEE**, and it
sits between SETTINGS and GIVE in the small upper group (order top to
bottom: Settings, Coffee, Give, Alpha, ...). The page itself still shows the
Happy Lion Cafe logo at the top. Check `tests/nav.test.js` and
`tests/e2e/nav-overlay.js` when adding it; they assert the menu order.

Customer flow:
1. Menu, logo at top. v1 menu: Hot Coffee, Cold Brew, each 12 oz / 16 oz.
2. Tap a drink, bottom sheet: size, half & half (None/Light/Regular/Extra),
   2% (same), sugar packets (0 to 4 stepper), Splenda packets (0 to 4).
3. Cart, then pickup time chips grouped under the three services (8:00,
   9:30, 11:00), name for the cup, totals with tax.
4. Pay through Square hosted checkout (see "Payment approach").
5. Status screen: ticket number, place in line, Paid, In the queue, Making,
   Ready. Push notification when the barista marks it ready.

Barista flow (cafe owner, special login):
- A "Cafe queue" screen visible only to people with the cafe role.
- Orders grouped by pickup time, oldest due first. Start, then
  "Ready, notify <name>". Ready sends push and moves the order out of the way.
- Switch to pause ordering (sold out, slammed, closing early).

Admin:
- `cafe_on` page switch.
- "Who runs the counter": grant/revoke the cafe role to an account.
- Square connection status card: sandbox vs production, which account.

---

## Architecture plan (as of mockups, confirm before building)

**Payment approach: Square hosted checkout (Payment Links / Checkout API),
not the in-app Web Payments SDK.** Reasons:
- The app's CSP is strict (`script-src 'self'`, see index.html). The Web
  Payments SDK needs Square's CDN scripts and iframes allowed in.
- Apple Pay inside the Web Payments SDK needs domain verification, which
  can't work from the packaged app's `capacitor://localhost` origin.
- Hosted checkout gives Apple Pay, Google Pay, Cash App Pay and cards for
  free, keeps all card data off our servers (no PCI scope), and is the
  same code for sandbox and production.
- App Store: physical goods consumed outside the app must NOT use in-app
  purchase (guideline 3.1.3(e)), so an external checkout is allowed.
Opened with Capacitor `Browser.open` (already a dependency), returns to the
app via `redirect_url`.

**Pieces:**
- Migration `00NN_cafe.sql`:
  - `cafe_orders` (id, user_id, ticket_no, pickup_at, service_slot, name,
    status: pending_payment / paid / making / ready / picked_up / cancelled,
    square_order_id, square_payment_link_id, total_cents, created_at,
    ready_at). RLS: customer reads own rows; cafe role reads/updates all for
    today; nobody inserts directly (edge function only).
  - `cafe_order_items` (order_id, item_key, size, mods jsonb, price_cents).
  - `cafe_menu` cache table (or read Square Catalog live, see below).
  - `profiles.can_run_cafe boolean` (mirrors the existing `can_host`
    pattern; `hc_is_barista()` = `can_run_cafe or role = 'admin'`).
  - `app_settings` rows: `cafe_on` (default false), `cafe_taking_orders`,
    `cafe_slot_capacity`.
  - Realtime on `cafe_orders` so the queue updates live without refresh.
- Edge function `cafe-checkout`: validates cart against the menu server side
  (never trust client prices), creates a Square Order with a PICKUP
  fulfillment (`pickup_at`, recipient name), creates a Payment Link for it,
  writes `cafe_orders` as `pending_payment`, returns the checkout URL.
- Edge function `cafe-square-webhook`: verifies
  `x-square-hmacsha256-signature` (HMAC-SHA256 of notification URL + raw
  body with the signature key), on `payment.updated` COMPLETED flips the
  order to `paid` and assigns a ticket number. Idempotent on event_id.
- Edge function `cafe-status` (or RPC): barista marks making/ready; on
  ready, calls existing `send-push` to the customer and optionally updates
  the Square order fulfillment to PREPARED so it also shows ready in the
  owner's Square dashboard/POS.
- Client: `js/screens/cafe.js` (menu, sheet, cart, status),
  `js/screens/cafe-queue.js` (barista), styles in `css/screens.css`,
  route registration like homekids, switch in `PAGE_SWITCHES`.
- Tests mirroring `tests/homekids.test.js` and a `demo-happy-lion-cafe`
  render with sample rows.

**Menu source of truth:** v1 hardcodes the two drinks and modifiers in a
small menu table so we're not blocked. Plan for v2: read the Square Catalog
(items, variations = sizes, modifier lists) so the owner edits his menu in
Square and the app follows. Each local item stores its Square catalog
object ID once those exist in the owner's account.

**Modifiers in Square:** sizes as item variations (12 oz, 16 oz).
Half & half and 2% as a modifier list with options like "Half & half,
light". Sugar/Splenda as modifiers with quantity (order line item modifiers
support `quantity`). Prices $0 unless the owner says otherwise.

---

## Config swap (the plug-and-play part)

Everything account-specific is a Supabase secret. Switching from Trey's
sandbox to the owner's production account = change these, no code change:

| Secret | Sandbox (Trey) | Production (owner) |
|---|---|---|
| `SQUARE_ENV` | `sandbox` | `production` |
| `SQUARE_ACCESS_TOKEN` | Sandbox access token | Owner's token (OAuth or personal) |
| `SQUARE_LOCATION_ID` | Sandbox location | The cafe's location |
| `SQUARE_APPLICATION_ID` | Sandbox app ID | Production app ID |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | From sandbox webhook subscription | From production webhook subscription |
| `SQUARE_WEBHOOK_URL` | the `cafe-square-webhook` URL, exact string used for signing | same |

Base URL follows `SQUARE_ENV`: `https://connect.squareupsandbox.com` vs
`https://connect.squareup.com`. Pin a `Square-Version` header in code.

Set with `supabase secrets set NAME=value` (or the dashboard, Edge
Functions, Secrets). Never paste them into a file in this repo.

**How the owner's account gets connected, two options to offer:**
- A. Owner logs into developer.squareup.com with his Square login, creates
  an application, and shares the Production access token, application ID,
  location ID, and sets up the webhook. Simplest, but it's a full-power
  token and he has to do developer-site steps.
- B (recommended). OAuth. Trey's Square developer app gets a "Connect
  Square" button in Admin; the owner taps it, logs in to Square himself,
  approves only the scopes we need (ORDERS_READ, ORDERS_WRITE,
  PAYMENTS_READ, PAYMENTS_WRITE, ITEMS_READ, MERCHANT_PROFILE_READ). We store
  the access + refresh token server side and refresh before the 30 day
  expiry. Owner never shares a password or token. More code (an
  `cafe-square-oauth` function + token table), worth it.
  Needs from Trey: production application ID + application secret (secret,
  Supabase only) and the OAuth redirect URL registered in the Square app.

---

## Waiting on Trey, round 1 (sandbox build)

From developer.squareup.com, his application, **Sandbox** toggle:
- [ ] Sandbox Application ID
- [ ] Sandbox Access Token  (secret)
- [ ] Sandbox Location ID  (Locations page; default test location is fine)
- [ ] Either set the secrets himself, or approve me setting them via the
      Supabase CLI in a session. Do not paste tokens into GitHub.
- [ ] After I deploy `cafe-square-webhook`: add a sandbox webhook
      subscription to its URL for `payment.updated` (and `order.updated`),
      then give me the signature key (secret). I'll give the exact URL.

Decisions:
- [ ] Mockups OK? Changes?
- [ ] Prices for v1 (mockups use placeholders $3.00/$3.50 hot,
      $4.00/$4.75 cold brew).
- [ ] Pickup times: mockup offers 7:40, 7:50, 8:45 / 9:10, 9:20, 10:15 /
      10:40, 10:50, 11:45. Real list? How early do they open?
- [ ] Capacity per time slot (e.g. 8 drinks per 10 min) or unlimited?
- [ ] Order cutoff: same morning only? Earliest time orders open
      (e.g. Saturday 8pm, or Sunday 6am)?
- [ ] Must customers be signed in to order? (Recommended yes: push
      notifications and "my order" need an account. Guest checkout would
      have to fall back to "watch this screen".)
- [ ] Tips on the Square checkout page, yes or no?
- [ ] Tax: Square applies the location's tax setting. Confirm the
      owner's location has sales tax set up.
- [ ] Refunds/cancellations: owner handles in Square dashboard (default),
      or a Cancel button in the queue?
- [ ] OAuth (B) or shared token (A) for the owner later?

## Waiting on Trey, round 2 (go live with the owner)
- [ ] Owner's full menu (items, sizes, prices, modifiers), ideally built in
      his Square item library so we sync it.
- [ ] Owner's account connected (OAuth flow or the token list above).
- [ ] Production webhook subscription + signature key.
- [ ] Which app account(s) get the cafe role.
- [ ] A real $1 test order end to end, then refund it.

---

## Decision log
- 2026-10-03: Hosted checkout over Web Payments SDK (CSP, Apple Pay
  domain verification, PCI scope, App Store 3.1.3(e)). Pending Trey's OK.
- 2026-10-03: `cafe_on` defaults off.
- 2026-10-03: Nav label "Coffee", placed between Settings and Give (Trey).
- 2026-10-03: Logo: lion is a potrace of the supplied 180x216 JPEG at the
  threshold that matches the original ink coverage (lines not thickened or
  thinned); the "HAPPY LION / CAFE" lettering was too small to trace, so it
  was redrawn as paths from measured stroke positions and widths and
  overlay-checked against the original. A higher resolution original from
  the owner (PNG, PDF, AI or SVG) would allow an exact replacement; swap
  the file, keep the name.

## Session notes
- The Supabase MCP server failed to connect in the 2026-10-03 session
  (proxy 403). Not needed for mockups. Needed later for migrations and
  function deploys, or use `scripts/hc_supabase.py` / Supabase CLI per
  `supabase/ACCESS.md`.
