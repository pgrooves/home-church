# Launch todo, things only you can do

Everything on this list is outside the codebase. I cannot do any of it for you.
Kept running through all phases, newest phase at the bottom.

Status key: **[ ]** not started, **[~]** in progress, **[x]** done.

-----

## Schedule risks, start these first

- [ ] **Apple Developer Program enrollment.** $99 a year. If you enroll as an
      organization, which is what you want if the app is published as Home
      Church rather than as a person, you need a **D-U-N-S number** for the
      church. Getting one usually takes one to two weeks, sometimes longer.
      This is the longest lead time item in the whole project and it is not a
      code problem. Start it this week.
      Registered nonprofits may qualify for a **fee waiver**, which is worth
      applying for at the same time but should not hold up enrollment.

- [ ] **Confirm the church's nonprofit status and paperwork.** I need to know
      whether Home Church is a registered 501(c)(3) and whether it holds a
      **Candid Seal of Transparency**. Apple's approved nonprofit process for
      US organizations runs through Candid. This decides whether Apple Pay
      giving is available to us at all, and Apple may ask for documentation
      during review of the Give tab either way.

- [ ] **Xcode 26 and a Mac.** Capacitor 8.5 requires Xcode 26. Confirm you have
      a Mac that can run it, or decide who will do the build.

-----

## Questions

Answered on August 11:

- [x] ~~Nonprofit status~~ **Holding off.** Giving stays an external handoff to
      Overflow, which does not depend on the answer. Revisit only if we ever
      want native Apple Pay giving.
- [x] ~~Are Connect's groups, teams, events, next steps real?~~ **Placeholders,
      to be removed before submission.** See the open question this creates,
      below.
- [x] ~~Should Leader Mode data leave the phone?~~ **No, staying local.** This
      keeps Guideline 1.2 out of scope entirely.
- [x] ~~Who hears about a group or serve team tap?~~ **A designated church email
      address, not yet chosen.** I am building the capture so the destination is
      one row of configuration rather than a code change.

Still open:

- [ ] Who is the **data controller** of record for the privacy policy? The
      church itself, or a specific legal entity name?
- [ ] Is there an existing privacy policy or terms page on homechurchnola.com
      that I should be consistent with?
- [ ] **What is the designated email address** for Connect form submissions?
      Not blocking, I am building around it, but the app cannot notify anyone
      until it exists.
- [ ] **What does the Connect tab hold at launch?** Removing the placeholders
      leaves it as a title over nothing, because every section drops its header
      when empty. Best answer is real groups and real events. See
      `APP_STORE_COMPLIANCE.md` section 2.7.
- [ ] **Accounts in v1, yes or no?** My recommendation is no, with the
      infrastructure built and dormant. See `APP_STORE_COMPLIANCE.md` section 0.
- [ ] Three real user accounts exist in the live project with no data. I
      recommend deleting them before launch. Tell me if one of them is you or
      the Daigles.

-----

## Supabase dashboard work

- [ ] **Move off Supabase's default auth email sender before launch.** The
      built in SMTP is rate limited hard and is explicitly not for production.
      A reviewer who requests a sign in code and never receives it will reject
      the app. Set up Resend or SendGrid under Project Settings, Authentication,
      SMTP Settings. I will give you the exact steps in Phase 4.

- [ ] **Magic Link email template.** Per `README.md` step 4, the stock template
      shows a clickable link and not the code, so the app's "enter your code"
      screen has nothing to type in. Confirm this was actually done in the live
      project, because I cannot see email templates from here.

- [ ] **Auth URL configuration.** Site URL and Redirect URLs need to include the
      Capacitor origin once the app is wrapped, not just the GitHub Pages URL.

- [ ] Three real user accounts already exist in the live project with no
      profile rows. Decide whether to keep or clear them before launch.

-----

## Legal

- [ ] **Louisiana attorney review** of the privacy policy and terms of service
      once I have drafted them. Particularly the sections on minors and on
      prayer requests and pastoral notes, which are sensitive in a way ordinary
      app data is not. My drafts will be drafts, not legal advice.

-----

## App Store Connect and Xcode

- [ ] **Support URL.** A required App Store Connect field, and it has to
      resolve to something that actually addresses app support. The
      homechurchnola.com homepage is not enough on its own. A short page saying
      what the app is and how to get help is fine.

- [ ] **Validate `PrivacyInfo.xcprivacy` in Xcode before submission.** Apple's
      canonical required-reason API page would not load from my sandbox, so the
      reason codes in my draft manifest come from Apple Developer Forums rather
      than first hand from the docs. Xcode reports the codes it expects. Do not
      take my draft on faith.

- [ ] **Answer the new age rating questionnaire.** Apple overhauled it in 2025.
      Tiers are now 4+, 9+, 13+, 16+, 18+, and there are new required sections
      on in-app controls, capabilities, medical topics, and violent themes. The
      **social media questions become required for new submissions in September
      2026**, which is next month, so we will be answering those too. My drafted
      answers are in `APP_STORE_COMPLIANCE.md` section 2.6. Target rating: 4+.

-----

## Assets you or a designer need to produce

- [ ] **App icon set with no alpha channel.** All seven PNGs in the repo today
      are RGBA. Apple rejects app icons containing transparency. These need to
      be re-exported flattened onto a solid background at the full set of iOS
      sizes.

- [ ] **Screenshots.** 1320 x 2868 for the 6.9 inch iPhone is the only required
      size in 2026, and Apple scales it down for everything smaller. Add
      2064 x 2752 only if we ship iPad support. I will give you a shot list and
      an order in Phase 7.

- [ ] **Real photography**, eventually. Not a launch blocker, the cream
      placeholder blocks are a deliberate choice and they hold up.
