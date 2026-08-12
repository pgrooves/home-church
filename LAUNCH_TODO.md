# Launch todo, everything only you can do

Nothing on this list is code. It is the running list of things I cannot do from
here, kept current as I work so you can come back at the end and clear it in
one sitting.

**Status key:** `[ ]` not started, `[x]` done, `[!]` blocking submission.

Last updated at the end of Phase 7. **All phases are complete.** Everything
below is what is left, and none of it is code.

> **Sign in went live, and that moved several things on this page.** Accounts
> are no longer dormant: email one time codes are working with Resend as the
> sender. Three items below were parked with the words "when you turn accounts
> on" or "moot while sign in is off," and they are now live items rather than
> future ones. The account deletion function is deployed and wired into the
> app, because Guideline 5.1.1(v) is a rejection, not a nicety. The privacy
> policy has been rewritten, because the old one said your name never left the
> phone and that stopped being true the moment the first person signed in.
>
> **The attorney item moved with them.** See the note further down: the
> document's own advice was to get a review before accounts turn on. They are
> on.

-----

## Migrations, all four done

Applied to `ibqkumxfltfiuqevviji` and verified. **The Supabase security report
is clean** apart from Leaked Password Protection, which is a dashboard toggle
and moot while sign in is off.

- [x] `0008_real_serve_teams.sql`. Seven real serve teams, requirement set on
      Home Kids and Worship Team only, the four invented ones gone.
      `groups_in_season` is false, so the finder hides.
- [x] `0009_accounts_dormant.sql`. `profiles` with RLS scoped to
      `auth.uid() = id`, no DELETE policy, signup trigger live, export function
      restricted to `authenticated`. Also cleared the pre-existing
      `hc_set_updated_at` search_path warning.
- [x] `0010_device_tokens.sql`. RLS on, and the load bearing part holds:
      `anon` has INSERT and UPDATE and **no SELECT**, so the token list cannot
      be read with the publishable key.

- [x] **`0011_lock_down_signup_trigger.sql`** applied and proven, August 12.
      Both SECURITY DEFINER advisor warnings on `hc_handle_new_user` are gone.
      The security report is now clean except for Leaked Password Protection,
      which is a dashboard toggle and moot while sign in is off.

      Worth knowing, because it is the kind of thing that gets re-litigated
      later: **the obvious test of this migration proves nothing.** Creating a
      user from the dashboard or over MCP inserts as `postgres`, which owns the
      function, so a privilege check could never have blocked it. My original
      verification steps had that flaw and the session that ran it caught it.

      What settled it was a throwaway replica in a separate schema, inserting
      as a role confirmed to have `EXECUTE = false`. The trigger fired. That
      matters because `supabase_auth_admin`, the role GoTrue inserts as during
      a real signup, held EXECUTE only through the PUBLIC grant this migration
      removed. The full reasoning is in the migration file's header.

- [x] **Deploy the account deletion function.** Done, August 12, now that
      accounts are on. `delete-account` is deployed to
      `ibqkumxfltfiuqevviji`, version 1, ACTIVE, with `verify_jwt` on. The app
      calls it from Your account and from Your data.

      **One thing I could not test from here and you should test on device.**
      The sandbox network policy blocks `supabase.co`, so I could not confirm
      that the CORS preflight survives `verify_jwt`. The function handles
      `OPTIONS` itself and this is the shape Supabase's own CORS guide uses,
      so it should be fine, but a browser sends no `Authorization` header on a
      preflight and that is exactly the kind of thing that works in testing
      and fails for a reviewer. Sign in on a real device, delete a throwaway
      account, and watch it succeed before you submit.

- [ ] **Leaked Password Protection** is still off in the Auth dashboard, and
      the advisor still flags it. **No longer moot, but still low priority:**
      sign in is email one time codes, so there is no password for anybody to
      reuse. It is one toggle under Authentication. Flip it and stop thinking
      about it.

- [ ] **Delete the three test accounts** when you are done testing.
      `teebacca@hotmail.com`, `treytim@gmail.com`, and `trey@pgrooves.com` are
      all yours, none are the Daigles, so nothing here needs a conversation
      first. The cleanest way to check your own work is to delete one of them
      from inside the app with the new button rather than from the dashboard.

-----

## Schedule risks, the long poles

- [!] **Apple Developer Program enrollment.** $99 a year. Enrolling as an
      organization, which is what you want if the app is published as Home
      Church and not as a person, requires a **D-U-N-S number** for the church.
      That usually takes one to two weeks. **This is the single longest lead
      time in the project.** Start it before anything else on this page.
      Registered nonprofits may qualify for a **fee waiver**, worth applying
      for at the same time but do not let it hold up enrollment.

- [ ] **Xcode 26 and a Mac.** Capacitor 8.5 requires Xcode 26. Confirm you have
      a machine that can run it, or decide who does the build.

- [ ] **Nonprofit status, when you are ready.** Parked at your request. It does
      not block launch, because giving hands off to Overflow and that does not
      depend on the answer. It only decides whether native Apple Pay giving is
      ever possible. For US churches the route is a **Candid Seal of
      Transparency**.

-----

## Before submission

- [x] ~~Support URL.~~ **Written and merged to `main`.** Should be live at
      `https://pgrooves.github.io/home-church/legal/support.html`. Nothing left
      but to open it once and confirm it renders.

- [ ] **Open both pages once and confirm they render.** They are on `main`
      now, so GitHub Pages should be serving them:

          https://pgrooves.github.io/home-church/legal/privacy.html
          https://pgrooves.github.io/home-church/legal/support.html

      Right looks like a formatted page: small caps eyebrow, serif body, warm
      off white background, same as the in app screen. Wrong looks like a 404,
      which means Pages has not built yet or its source is not set to `main`
      and root folder, or raw HTML source on screen, which means the wrong URL.

      I cannot load them from here, the sandbox proxy blocks `github.io`.

      These two go in the **Privacy Policy URL** and **Support URL** fields in
      App Store Connect. A `github.io` address is fine, Apple has no domain
      requirement. Moving them to homechurchnola.com later is a nicety.

- [x] ~~App icon set with no alpha channel.~~ **Done.** Every icon PNG carried
      an alpha channel with nothing actually transparent in it, so stripping
      was lossless. `npm run icons` regenerates the full iOS set into
      `ios-icons/` plus the web icons, and it is a script rather than a one
      time fix so it keeps being true. The logo lockups and `mark.png` were
      left alone, they use transparency for real.

      One thing to know: the largest square source in the repo is 512px, so
      the 1024 App Store icon is upscaled. It passes. If the church's original
      logo still exists as vector art, export a real 1024 and drop it in as
      `assets/icons/icon-1024.png`, which the script prefers automatically.

- [ ] **A Louisiana attorney on the privacy policy and terms. Deferred, and
      that is a reasonable call.** I had this marked as blocking submission and
      that was wrong of me.

      **Apple will approve you without it.** Review checks that a privacy
      policy exists, is reachable in the app and at a public URL, and honestly
      describes what the app does. All three are true. Nobody at Apple assesses
      legal quality.

      What an attorney protects is **your** exposure, not your approval.

      **That exposure just grew, and this item should move up your list.** The
      previous version of this note said the risk was small because there were
      no accounts and everything stayed on the phone, and that the day it
      changed was the day accounts turned on. Accounts are on. You are now
      holding names, email addresses, birthdays, and home addresses for a
      congregation that includes minors, on your own server.

      Apple still does not care and will still approve you without it. This is
      not a submission blocker and I am not marking it as one. But the
      liability section and the children's paragraph in your policy stopped
      being theoretical this week, and the honest read is that this is now the
      most valuable unchecked box on this page even though nothing enforces
      it.

- [ ] **Confirm the effective date on both legal screens.** It reads
      **August 11, 2026** right now. Change `EFFECTIVE` at the top of
      `js/screens/legal.js` to the real launch date before you submit, then
      re-run `node scripts/make_legal_pages.js` so the public pages match.

      The policy itself has been rewritten for accounts and the pages under
      `legal/` are already regenerated, so the date is the only thing left in
      them. Re-read the new "Signing in" section once before you submit: it
      describes what actually syncs, and you are the one who has to stand
      behind it.

- [!] **Decide what happens to the three notification switches.** They are
      inert. In the home screen web app the handler returns before it reaches
      any native code, and even in a native build nothing sends, because there
      is no APNs sender, no scheduled job, and no Edge Function reading
      `device_tokens`. That table has zero rows.

      Two honest options: build the sending side, or hide the switches until
      you do. What you cannot do is ship a switch labelled "Monday morning,
      once a week" that has never delivered anything. This is not me being
      pedantic about Guideline 2.7, it is that the first person who turns it
      on and waits will conclude the app is broken.

- [ ] **Validate `PrivacyInfo.xcprivacy` in Xcode.** Apple's own required
      reason API page would not load from my sandbox, so the reason codes in my
      draft manifest come from Apple Developer Forums rather than first hand
      from the docs. Xcode reports the codes it expects. Do not take my draft
      on faith.

- [ ] **Answer the age rating questionnaire.** Apple overhauled it in 2025.
      Tiers are now 4+, 9+, 13+, 16+, 18+, with new required sections on in-app
      controls, capabilities, medical topics, and violent themes. The **social
      media questions become required for new submissions in September 2026**,
      so you will be answering those. My drafted answers are in
      `APP_STORE_COMPLIANCE.md` section 2.6. Target rating: **4+**.

- [x] ~~Screenshots.~~ **Generated.** Six of them in `screenshots/`, at exactly
      1320 x 2868, no alpha channel, in the order that leads with the guide and
      Leader mode rather than with Home. Captions are in
      `screenshots/CAPTIONS.txt`. `node scripts/make_screenshots.js` rebuilds
      them, which matters because the content changes weekly and a stale
      screenshot on the store page is a small lie.

      They are Chromium renders using the same bundled fonts and the same CSS,
      which is honest and is accepted. If you want the last few percent of
      fidelity, retake them in the iOS simulator using the same order and
      captions. Do not ship a mix of both.

*(The orphaned accounts item that used to sit here moved up under Migrations,
since those three accounts are no longer orphaned. The effective date item is
above, under Before submission.)*

-----

## Supabase dashboard

- [x] **Move off Supabase's default auth email sender.** Done, Resend is
      wired in and codes are arriving. This was the right call and it was on
      the critical path the moment sign in went live.

- [!] **Auth URL configuration, and this is the one most likely to bite you.**
      Sign in works today from the GitHub Pages origin. A native build does
      not run on that origin, it runs on `capacitor://localhost`, and Site URL
      and Redirect URLs in the Supabase Auth dashboard have to know about it.

      Your six digit code flow is more forgiving here than a magic link would
      be, because typing a code back into the app needs no redirect at all, so
      there is a good chance this just works. **Do not take that on faith.**
      This is the classic failure where everything is fine in your home screen
      web app and the reviewer cannot get past the first screen. Test sign in
      on a real device from the Xcode build, not from Safari, before you
      submit.

-----

## Xcode, once you are enrolled

**`XCODE.md` is a full step by step walkthrough written for somebody who has
never shipped an app.** Every step says where to click. Use that on the day,
not the summary below.

Steps 1 to 6 of it work **without** an Apple Developer account, so you can
rehearse the whole build now and find any surprises early. Only signing,
notifications, and uploading need the paid account.

The short list:

- [ ] `npm install && npm run ios:open`
- [ ] Copy `ios-config/PrivacyInfo.xcprivacy` into `ios/App/App/` and add it to
      the App target. It lives outside `ios/` because that folder is generated
      and gitignored, and a hand written file in there gets destroyed the next
      time somebody runs `npx cap add ios`.
- [ ] `npm run icons`, then drag `ios-icons/` into the AppIcon set.
- [ ] `ITSAppUsesNonExemptEncryption` to `NO` in `Info.plist`.
- [ ] Deployment target **iOS 15**, devices **iPhone only**, version `1.0.0`,
      build `1`.
- [ ] Push Notifications capability on, and an APNs key created.
- [ ] **Test on a real device**, not just the simulator: cold start, airplane
      mode, back gesture, the giving handoff, the share sheet, add to
      calendar, and a test notification.

-----

## Content I still need from you

Neither of these blocks anything. Both render honestly as they are, they are
just quieter than they could be.

- [ ] **A destination for "I'm new here."** The only next step with no link.
      It shows as a description with no button, which is honest, but it is the
      one a first time visitor is most likely to tap. Is there a Church Center
      connect card for it?

- [ ] **What happens when someone wants to join a group, not host one?** The
      Group Vitals link you sent is the leader form. Group cards are
      information only now, because the old behavior claimed it would pass your
      name to the host from a card with nowhere to type a name. This is the
      last thing on Connect with no destination.

-----

## Decisions already made, for the record

- [x] **Accounts are off in v1.** Infrastructure gets built and ships dormant.
      Removes the account deletion requirement, the demo account, and the SMTP
      dependency. See `APP_STORE_COMPLIANCE.md` section 0.
- [x] **Home groups ship out of season**, so the placeholder groups never
      render. One boolean brings them back.
- [x] **Leader Mode data stays on the phone.** Keeps Guideline 1.2 entirely out
      of scope.
- [x] **The Linktree is not in the app.** A link to a link aggregator, inside an
      app that already carries a Guideline 4.2 risk, is the most on the nose
      version of "a collection of links" I could hand a reviewer. Everything on
      it that matters is a next step now.
- [x] **Connect points at Church Center, Group Vitals, Google Forms, Flodesk,
      and your SMS keyword** rather than a form capture pipeline in Supabase.
- [x] **The real serve teams are in**, all seven, from your screenshots.
- [x] **utm parameters stripped** from all six links. They claimed the traffic
      came from Instagram, which was true of a link in a bio and is not true of
      a tap inside the app.

-----

## Worth a second look later, not now

- [ ] **The prayer request Google Form.** It works and it ships. But prayer
      requests are often the most sensitive thing anyone tells a church, and
      routing them through Google Forms means naming Google as a processor in
      the privacy policy, which I have done. Church Center has forms too, if
      you would rather keep it in one system.

- [ ] **Real photography.** Not a blocker. The cream placeholder blocks are a
      deliberate choice and they hold up.
