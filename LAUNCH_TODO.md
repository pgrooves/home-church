# Launch todo, everything only you can do

Nothing on this list is code. It is the running list of things I cannot do from
here, kept current as I work so you can come back at the end and clear it in
one sitting.

**Status key:** `[ ]` not started, `[x]` done, `[!]` blocking submission.

Last updated at the end of Phase 7. **All phases are complete.** Everything
below is what is left, and none of it is code.

-----

## Migrations, done

All three applied to `ibqkumxfltfiuqevviji` on August 11 and verified.

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

### One left, and it is mine to own

- [ ] **`supabase/migrations/0011_lock_down_signup_trigger.sql`**

      Applying `0009` raised two new advisor warnings, and they are my fault.
      That migration revoked EXECUTE on one of the two functions it created
      and not the other, so `hc_handle_new_user` kept Postgres's default grant
      to public and shows up at `/rest/v1/rpc/`.

      **Not exploitable.** A function returning `trigger` cannot be called
      directly whatever privileges you hold, Postgres raises `0A000` before
      the body runs. That was probed against the live project rather than
      assumed. But an unexplained security warning sitting on the table that
      holds member records is the last thing you want to be explaining during
      a privacy review, so it should be closed.

      **Verify after running it**, because it is a claim about how Postgres
      treats trigger functions and it deserves a test:

      1. Dashboard, Authentication, Add user. Create a test user.
      2. `select id from public.profiles order by created_at desc limit 1;`
         A row should be there.
      3. Delete the test user.

      If step 2 comes back empty, the migration is wrong and reverting is one
      line. Nothing in v1 depends on it working, since sign in is off and no
      new auth users are being made, which makes now the cheap time to find
      out.

- [ ] **Deploy the account deletion function**, when you turn accounts on:
      `supabase functions deploy delete-account`. Not needed for v1.

- [ ] **Leaked Password Protection** is still off in the Auth dashboard.
      Unchanged and moot while sign in is off. Turn it on the day accounts go
      live.

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

- [!] **Support URL.** A required App Store Connect field that has to resolve to
      something addressing app support. The homechurchnola.com homepage is not
      enough. A short page saying what the app is and how to get help is fine.

- [!] **Publish `legal/privacy.html` and put its URL in the Privacy Policy URL
      field in App Store Connect.** Apple requires the policy both inside the
      app, which is done, and as a public link. A 404 there, or a link to a
      homepage that never mentions the app, is a 5.1.1 rejection and it is one
      of the most common ones.

      **GitHub Pages already covers this, no hosting needed.** The repo is
      public and Pages is enabled, so once this file is on `main` it is live
      at:

          https://pgrooves.github.io/home-church/legal/privacy.html

      Three things have to be true, and only the first is outstanding:

      1. **The file has to be on `main`.** It is on the feature branch right
         now, so it is not live yet. Merging is what publishes it.
      2. **Use the Pages URL, not the raw file link.** A
         `raw.githubusercontent.com` URL serves as `text/plain`, so a reviewer
         clicking it sees HTML source rather than a policy. That reads as a
         broken link.
      3. **Pages source set to `main`, root folder.** Already how the app
         itself is served, so almost certainly already right. Worth confirming
         in Settings, Pages.

      I could not load the URL from here, the sandbox proxy blocks
      `github.io`, so open it once after merging and check it renders.

      A `github.io` address is perfectly acceptable to Apple, which has no
      domain requirement. Moving it to homechurchnola.com later is a nicety,
      not a fix. `terms.html` sits beside it and is optional.

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

- [!] **Have a Louisiana attorney read the privacy policy and terms.** I wrote
      both in Phase 3 and they are in the app now, at
      `js/screens/legal.js`. **They are drafts, not legal advice.** They
      describe accurately what the app does, but I am not a lawyer. Have
      someone look at the liability section, the Louisiana governing law
      clause, and the children's data paragraph in particular.

- [ ] **Confirm the effective date on both legal screens.** It reads
      **August 11, 2026** right now. Change `EFFECTIVE` at the top of
      `js/screens/legal.js` to the real launch date before you submit.

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

- [ ] **Delete the three orphaned accounts** in the Supabase project. They have
      no data, they signed in to a sync that never worked, and starting
      production at zero is cleaner. Tell me if one is you or the Daigles.

-----

## Supabase dashboard

- [ ] **Move off Supabase's default auth email sender.** Only matters when
      accounts are switched on, which is not v1, so this is no longer on the
      critical path. When you do turn accounts on, the built in sender is rate
      limited and not for production, and a reviewer who never receives a
      sign in code rejects the app. Resend or SendGrid, under Project Settings,
      Authentication, SMTP Settings.

- [ ] **Auth URL configuration**, same condition. Site URL and Redirect URLs
      will need the Capacitor origin, not just the GitHub Pages URL.

-----

## Xcode, once you are enrolled

The full ordered version is in `SUBMISSION_KIT.md` section 1. The short list:

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
