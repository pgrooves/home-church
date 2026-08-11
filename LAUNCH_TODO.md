# Launch todo, everything only you can do

Nothing on this list is code. It is the running list of things I cannot do from
here, kept current as I work so you can come back at the end and clear it in
one sitting.

**Status key:** `[ ]` not started, `[x]` done, `[!]` blocking submission.

Last updated at the end of Phase 3.

-----

## Right now, one thing

- [!] **Run `supabase/migrations/0008_real_serve_teams.sql`.**

  My connection to the Supabase project started requiring an approval this
  session cannot answer, so `0007` went in and `0008` did not.

  Until it runs, any phone **with signal** shows the four old invented serve
  teams and the placeholder home groups, because Supabase wins over the copy
  bundled in the app. The bundled copy is already correct, so this only
  affects live devices. Nothing is broken, the content is just wrong.

  Three ways in, easiest first:

  1. **Approve the Supabase tool call** if Claude Code offers you the prompt.
     This unblocks every future content change too, not just this one.
  2. **Safari, aA in the address bar, Request Desktop Website**, then paste
     into the SQL Editor. The editor fights mobile paste. If it still refuses,
     tap once to place the cursor, then tap the same spot again for the Paste
     bubble. Long press usually does nothing there.
  3. **Table Editor, no SQL.** Open `serve_teams`, delete the four old rows,
     add the seven new ones from the migration file. Then open
     `church_profile` and set `groups_in_season` to false. Slow but reliable.

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

- [!] **App icon set with no alpha channel.** All seven PNGs in the repo are
      RGBA today. Apple rejects icons containing transparency. Re-export
      flattened onto a solid background at the full iOS size set.

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

- [ ] **Screenshots.** 1320 x 2868 for the 6.9 inch iPhone is the only required
      size, and Apple scales it down for everything smaller. No alpha channel.
      Shot list comes in Phase 7.

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
