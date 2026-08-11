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

- [x] ~~Designated email address for form submissions~~ **No longer needed.**
      The six links you sent mean every next step goes to a system the church
      already runs. No Supabase capture table, no Edge Function, no second copy
      of anyone's contact details.
- [x] ~~What does Connect hold at launch?~~ **Solved.** Groups are season
      gated, and everything else on the tab now goes somewhere real.
- [x] ~~Accounts in v1?~~ **No.** Infrastructure built and dormant.

Still open:

- [ ] Who is the **data controller** of record for the privacy policy? The
      church itself, or a specific legal entity name?
- [ ] Is there an existing privacy policy or terms page on homechurchnola.com
      that I should be consistent with?
- [ ] Three real user accounts exist in the live project with no data. I
      recommend deleting them before launch. Tell me if one of them is you or
      the Daigles.

-----

## Content I need from you, for the Connect tab

The structure is built and working. These are content swaps, each one row in
Supabase, none of them code.

- [x] ~~The real serve team names and descriptions.~~ **Done, from your
      screenshots.** All seven, in the church's own words, in the site's order:
      Home Kids, Greeters, Set Up, Tear Down, Parking, Prayer Team, Worship
      Team. The two asterisked conditions, the background check and the
      training process, got their own field rather than being folded into the
      description.

- [x] ~~In season or out of season?~~ **Out of season**, per your sign off. The
      four placeholder groups never render.

- [ ] **RUN THIS ONE YOURSELF:
      `supabase/migrations/0008_real_serve_teams.sql`.** Supabase dashboard,
      SQL Editor, New query, paste the whole file, Run. My connection to the
      project started requiring an approval I cannot answer from this session,
      so `0007` went in but `0008` did not. Until you run it, the app still
      shows the old four invented teams **on any phone that has signal**,
      because Supabase wins over the bundled copy. The version bundled in the
      app is already correct.

- [ ] **A destination for "I'm new here."** The only next step with no link. It
      renders as a description with no button right now, which is honest but it
      is the one a first time visitor is most likely to tap. Is there a Church
      Center connect card for this?

- [ ] **What happens when someone wants to join a group, not host one?** The
      Group Vitals link you sent is the leader form. Group cards are now
      information only, because the old behavior claimed it would pass your
      name to the host from a card with nowhere to type a name. **This is the
      last thing on Connect with no destination.**

- [ ] **Decide whether we submit in season or out of season.** Out of season,
      the four placeholder groups never render and there is nothing for a
      reviewer to object to. In season, those four rows need to be the real
      groups with real hosts. Either works. See `APP_STORE_COMPLIANCE.md` 2.7.

- [ ] **`step-baptism` had a hardcoded date** in its blurb, "The next one is
      August 23." I removed it, because a date in a content blurb goes stale
      silently. The Events list is where dates belong.

-----

## Two recommendations on the links you sent

- [ ] **I left the Linktree out, on purpose.** Guideline 4.2.2 names "content
      aggregators, or a collection of links" as the thing an app must not
      primarily be. A link to a link aggregator, inside an app that already has
      a 4.2 risk, is the most on the nose version of that I could put in front
      of a reviewer. The app should *be* the link tree, and better. Everything
      on it that matters is now a next step. Tell me if you disagree and I will
      add it, but I would rather not.

- [ ] **The prayer request Google Form is worth a second thought, later.** It
      works and it ships. Two things to know. Prayer requests are often the
      most sensitive thing anyone tells a church, health, marriage, money, and
      routing them through Google Forms means naming Google as a processor in
      the privacy policy. And the app already has something called "prayer
      requests" in Leader Mode that is private, local, and goes to nobody. Two
      different things with the same name is a trust problem, so I will make
      the wording distinguish them clearly. Church Center has forms too, if you
      would rather keep it in one system.

- [ ] **utm parameters stripped from all six links.** They said the traffic came
      from Instagram, which was true of a link in a bio and is not true of a tap
      inside the app. The Linktree URL also carried a share session id.

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
