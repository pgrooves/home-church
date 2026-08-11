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

## Questions I need answered before I can finish Phase 2

These are in `AUDIT.md` section 7 as well. Answering them changes what I
recommend, so I would rather ask than guess.

- [ ] Is Home Church a registered 501(c)(3)? Candid seal, yes or no?
- [ ] Who is the **data controller** of record for the privacy policy? The
      church itself, or a specific legal entity name?
- [ ] Are the groups, serve teams, events, and next steps currently in Supabase
      the church's **real** ones, or the placeholders the README says they are?
- [ ] When someone taps a group card or a serve team, **who should hear about
      it**? An email address, a form, a person? Right now nobody does.
- [ ] Should Leader Mode data (roster, attendance, prayer requests, private
      notes) ever leave the phone? My recommendation is no. I want to know if
      that conflicts with what you expect.
- [ ] Is there an existing privacy policy or terms page on homechurchnola.com
      that I should be consistent with?

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
