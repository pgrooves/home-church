# When & Where — mockup

A standalone drawing of a proposed page, made to be looked at before anything
in `js/` or `css/` is touched. Nothing here is wired into the app. Open
`mockup.html` in a browser; there is no build step, because nothing needs
inlining.

**Not built yet.** This folder is the drawing the decision gets made from.

## What it shows

The **Sunday Gatherings** block from homechurchnola.com, brought into the app
as a fourth stop behind •••, between Worship and Practices. Same words, same
two labelled facts, set in the app's own type rather than the website's.

Down the screen:

- **Sunday Gatherings**, under a *When & Where* eyebrow. The website's heading
  is kept; the tile in the ••• sheet still says *When & Where*, because that is
  what somebody is looking for in a menu.
- **The two paragraphs**, lifted from the site word for word, both editable
  slots. *Everyone is welcome. Everyone is family.* is bold on the site and
  stays bold.
- **Service times**, from `church_profile.service_day` and `service_times` —
  the same columns Home's gathering card reads. The site writes them on one
  line; here they are separated items, so a fourth service is a row in Supabase
  and nothing else.
- **Location**, from `address_line1` and the town / state / zip beside it, with
  `maps_url` behind *Get directions*: Apple Maps on a phone, the web map
  everywhere else. This is the one thing the app can do that the website page
  does not.
- **Three photographs**, drawn as empty frames. The arrangement is the site's;
  the pictures would have to go into Supabase Storage first, the same as the
  group flyer on Connect.

The phone in the page is real tokens, lifted unedited from `css/tokens.css` and
carried on `[data-hc]`, so what you are looking at is the app rather than an
impression of it. The bench around it has its own palette on purpose: the
annotation layer is the spec and should never be mistaken for the product.
The **Light / Dark** buttons switch the phone between the two themes the app
ships; the bench stays a drawing board in both.

## Nothing on it is typed in

Every value on the screen is a column on the one `church_profile` row. That is
the point of putting this in the app rather than linking out to the website: the
Sunday a service moves, this page moves with it, and nobody has to ship a build.

## Open questions

1. **The photographs** — in, and three files go into Storage; or out, and the
   page ends on the address.
2. **Not white on black.** The site sets this section in white on near-black.
   The app has one paper and one dark theme and they follow the phone, so this
   page wears whichever the reader is already in. Inverting one screen inside
   the app would read as a mistake rather than as the website.
3. **Home keeps its gathering card** — same times, same Directions button, still
   on the first screen. This is the fuller answer behind •••, not a replacement.
