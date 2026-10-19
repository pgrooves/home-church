# Submission kit

Everything needed to put Home Church in front of App Review, written to be
executed against rather than read. Phase 7 of the launch brief.

Companion documents: `AUDIT.md` for what the app is, `APP_STORE_COMPLIANCE.md`
for why each decision was made, `LAUNCH_TODO.md` for what only you can do.

-----

## 1. Pre-submission checklist, in dependency order

Each block depends on the one above it. Working out of order mostly wastes
time, except where noted, where it costs weeks.

### Run this first, and again the morning you submit

```bash
npm run preflight
```

Everything on this page that a machine can check, checked in a second, with no
browser, no network, and no Mac: the public legal pages against the app's own
screens, the privacy manifest against section 5 below, the icons against
ITMS-90717, the screenshots against the 6.9 inch spec, and the bundle list
against what `index.html` actually loads. It runs inside `npm test` too, so it
cannot be forgotten, only overruled.

**It exists because one of these had already gone wrong.** The public privacy
policy and terms at the URL Apple checks most reliably had been sitting on
`main` for weeks describing an app with no group rooms, no journal leaving the
phone, and no reporting or blocking, while the app on the phone had all three.
The generator was there. Nothing failed when nobody ran it. Now something
fails.

### Blocked on nothing, start immediately

- [ ] **Apple Developer Program enrollment.** Organization enrollment needs a
      **D-U-N-S number**, which takes one to two weeks. Nothing below can ship
      without this and no amount of code changes that. Start it first.
- [x] Migrations 0008, 0009, and 0010 applied and verified.
- [x] `0011_lock_down_signup_trigger.sql` applied and proven. The Supabase
      security report is clean apart from Leaked Password Protection, which is
      a dashboard toggle and moot while sign in is off.
- [x] Support URL written, `legal/support.html`. Live once merged to `main`.

### Code, done

- [x] Every inert control removed or given a real destination. **True again as
      of August 12, and it was not for a while.** The notification switches
      wrote a boolean and nothing else. There is now a real sender:
      `send-push` signs an APNs token and delivers, migration 0012 schedules
      it hourly and decides in Louisiana local time, and the app writes your
      preferences to the server so per-topic filtering can happen where the
      push is actually addressed. The third switch, which needed group
      membership the app does not model, is season gated off rather than
      shipped inert.
- [x] Push notifications wired end to end in code. **Still needs the APNs
      credentials, which need the Apple Developer account.** Runbook in
      `LAUNCH_TODO.md`.
- [x] Account deletion, in app, Guideline 5.1.1(v). `delete-account` Edge
      Function deployed, reachable from Your account and from Your data.
- [x] Placeholder serve teams replaced with the church's own seven.
- [x] Home groups season gated, so placeholder groups do not render.
- [x] Privacy policy, terms, and the data screen, reachable in the app.
- [x] Typefaces bundled, Google Fonts removed.
- [x] App icons regenerated with no alpha channel.
- [x] Native share sheet, add to calendar, haptics, push registration.
- [x] Download guide fixed for WKWebView.
- [x] Contrast raised to AA across the light palette.
- [x] `role="application"` and `user-scalable=no` removed.
- [x] Dynamic Type respected.
- [x] Partial cache overwrite fixed.
- [x] Cache stamps automated.
- [x] **The public legal pages regenerated against the app's own screens.**
      `legal/privacy.html` and `legal/terms.html` were stale by two features.
      The privacy policy did not mention group rooms, a journal that syncs, or
      the ninety day sweep; the terms did not carry the objectionable content
      rules, the reporting and blocking paragraph, or the note about the sheet
      a host sends at the end of the night. The in-app screens said all of it.
      Since the public policy is a Guideline 5.1.1 field and the terms are
      what Guideline 1.2 wants people agreeing to, the two files Apple can
      reach were the two that were wrong. Both regenerated and both now
      checked by `npm run preflight`.
- [x] **`ios-config/PrivacyInfo.xcprivacy` brought back in line with section
      5.** It declared five data types and section 5 declares eight. Physical
      Address, Other Data, and User ID were all missing, all three arriving
      when sign in went live and Your information started syncing to
      `profiles`. Xcode builds the privacy report from that manifest and the
      App Store label is typed from section 5, so a reviewer comparing them
      was comparing a report that under-declared against a label that did
      not. Preflight now fails when the two lists disagree.

### Xcode, once enrolled

**Full beginner walkthrough with every click is in `XCODE.md`.** The list below
is the summary.

- [ ] `npm install && npm run ios:open`
- [ ] Copy `ios-config/PrivacyInfo.xcprivacy` into `ios/App/App/`, add to the
      App target.
- [ ] Drag `ios-icons/` into the AppIcon set. Run `npm run icons` first.
- [ ] Set `ITSAppUsesNonExemptEncryption` to `NO` in `Info.plist`.
- [ ] Deployment target **iOS 15**. Devices **iPhone only**.
- [ ] Version `1.0.0`, build `1`.
- [ ] Push Notifications capability on, APNs key created.
- [ ] Xcode privacy report reviewed, reason codes confirmed.
- [ ] Run on a physical device. Cold start, airplane mode, back gesture,
      giving handoff, share sheet, calendar, a test notification.

### App Store Connect

- [ ] Metadata from section 3.
- [x] Screenshots, already generated in `screenshots/`.
- [ ] App Privacy answers from section 5.
- [ ] Age rating answers from section 6.
- [ ] Review notes from section 7, pasted verbatim.
- [ ] Export compliance from section 8.

### The two demo accounts, which the review notes depend on

Group rooms are the one part of the app a reviewer cannot fully test without
signing in, and the host's moderation queue needs an account the church has
marked as a group leader. Set this up before you submit, or section 7 has two
blanks in it and a reviewer with no way to check the Guideline 1.2 controls.

> **September 20: this section was rewritten, because the version before it
> described a feature that does not exist and submission 1.0 (8) was rejected
> on September 17 for exactly that gap.**
>
> It told you to set up **email test OTPs** in the Supabase dashboard, fixed
> codes that always work with no email sent. Supabase has that for phone
> numbers and has never had it for email; it is an open feature request
> against GoTrue and nothing more. So there was no way to follow this page,
> and what went to Apple instead was the login for an Outlook mailbox with
> the demo account's codes in it. The reviewer could not get into the
> mailbox, or the code never arrived in it, and so they never got into the
> app at all. Guideline 2.1, and a fortnight.
>
> The app now has a password path for a short list of addresses, in
> `js/config.js`. What follows sets that up. **The mailbox is no longer in
> the loop: nothing is ever sent to these addresses and nobody needs to be
> able to read their mail.**

Both addresses are already in `PASSWORD_ACCOUNTS` in `js/config.js`:

| | Address | What it is for |
|---|---|---|
| Host | `homechurchappleader@outlook.com` | Leader mode, the moderation queue, and the App Store Connect demo credential fields |
| Member | `homechurchappreview@outlook.com` | The second seat the Guideline 1.2 walkthrough needs, so Report and Block appear |

They differ by five letters in the middle and nothing else. Copy them, from
here or from the config file; do not retype them anywhere.

- [ ] **Set a password on each one.** Both users already exist in Supabase
      and are confirmed, which is the easy half. The hard half is that the
      dashboard has no way to set a password on a user who already has an
      account: the only button offers to *email* a reset link, which is the
      mailbox this whole exercise exists to get out of. Two ways round it,
      and the first is simpler:
      - **Delete the user and add it again.** Authentication → Users, the
        `...` menu → Delete user, then **Add user → Create new user** with
        the same address, a password you choose, and **Auto Confirm User**
        ticked. A demo account holds nothing worth keeping, and this way
        there are no keys to handle. Ticking Auto Confirm is not optional:
        an unconfirmed user cannot use the password grant, and a reviewer
        meeting "Email not confirmed" is a reviewer who is not getting in.
        Note that deleting the user takes its `profiles` row with it, so
        Leader mode has to be granted again afterwards, below.
      - **Or set it in place, from the SQL editor**, if you would rather not
        delete anything. Supabase keeps pgcrypto in the `extensions` schema,
        so both functions need naming in full:
        ```sql
        update auth.users
        set encrypted_password = extensions.crypt(
              'THE PASSWORD', extensions.gen_salt('bf'))
        where email in ('homechurchappleader@outlook.com',
                        'homechurchappreview@outlook.com');
        ```
        This writes straight into an `auth` table, which Supabase discourages
        as a habit and which is fine as a one-off for two accounts nobody
        depends on. Give the two accounts different passwords by running it
        twice, one address at a time.
- [ ] Check that **Authentication → Sign In / Providers → Email** still has
      password sign-in enabled. It is on by default. If it was ever turned
      off to make this a code-only church, the password path 400s on every
      attempt and the whole of this section is decoration.
- [ ] Sign in once as each, in the app, so the `profiles` row exists.
- [ ] Turn Leader mode on for the host account. From an admin's phone that is
      Admin → Manage users → the Leader mode switch on their row, which is how
      the church does it. By hand it is still one column:
      `update public.profiles set can_host = true where id = (select id from
      auth.users where email = 'homechurchappleader@outlook.com');`
      Only the host account. The member account is a member on purpose:
      half of what the Guideline 1.2 walkthrough shows is what somebody
      without Leader mode sees.
      This is what the reviewer's Leader mode walkthrough in section 7 needs,
      not only the moderation queue: since migration 0036 the leader tools and
      the presentation view belong to the account rather than to the phone.
- [ ] Fill both addresses and both passwords into the review notes in
      section 7, and put the **host** pair into the App Store Connect demo
      credential fields. That field takes one account; the member one lives
      in the notes.
- [ ] **Copy and paste the address into App Store Connect rather than typing
      it.** The app matches what is typed against `PASSWORD_ACCOUNTS`
      ignoring case and surrounding spaces and nothing else, and there is no
      "have a password?" link on the sign-in screen to recover with: one was
      considered and dropped, because it would be shown to a whole
      congregation to help one person who was sent written instructions. A
      mismatch means the reviewer is emailed a code at an address nobody is
      watching, which is the September 17 rejection happening twice.
- [ ] **Then prove it on a real device**, which is what replaces that link.
      Type the address exactly as it now appears in the App Store Connect
      field, confirm the panel that comes up asks for a password rather than
      a code, and confirm the password gets you in. Two minutes, and it is
      the only check that catches a typo in either place.
- [ ] Walk the seven steps in section 7 yourself, on a device, exactly as
      written. If any step does not do what it says, fix the step or fix the
      app before a reviewer finds the difference.
- [ ] Leave both accounts in place after approval. Apple re-reviews updates.
      The password path is ordinary app behaviour and stays shipped; there
      is nothing here to take back out of a later build, deliberately.

-----

## 2. Apple Developer Program

**$99 a year.** Two paths and they are not equivalent.

**Individual.** Minutes to set up. The app is published under a person's legal
name, which appears on the store listing. For a church this is the wrong
answer unless you are in a genuine hurry.

**Organization.** The app is published as **Home Church**, which is what you
want. Requires a **D-U-N-S number** for the legal entity, free from Dun &
Bradstreet, typically one to two weeks and occasionally longer. Apple also
verifies you have authority to bind the organization.

**This is the schedule risk in the whole project.** It is not a code problem
and no amount of engineering shortens it. Start it before you read the rest of
this document.

**Fee waiver.** Nonprofits in good standing may qualify for a waived
membership fee. Worth applying for in parallel. Do not let it hold up
enrollment, since a waiver denial after a month of waiting is the worst of
both.

-----

## 3. App Store Connect metadata

### Name, 30 characters

**Recommended: `Home Church NOLA`** (16)

The church's brand is "Home Church", and I would still not use it alone.
"Home Church" is a generic phrase, other apps use it, and App Store names are
first come first served. If the exact string is taken you find out at
submission, and searching "home church" returns a page of results your
congregation has to pick you out of. `NOLA` is how the church already refers
to itself in the podcast and the social handles, so it costs nothing in
recognition and buys uniqueness.

### Subtitle, 30 characters

```
Sermons, guides, and a way in
```
(29) Lifted from the repo's own one line description, which was already the
best sentence anybody has written about this app.

### Promotional text, 170 characters

Editable without a new build, so use it for what is actually happening.

```
The guide for this week's message is up. Open it before your group meets, or
bring it with you. It works with no signal.
```
(122)

### Description

**Describe only what is switched on.** This field is public, and it is the
first place somebody would read about a page the church has not launched.
Rewritten for 1.1 (October 19) to match what a member sees on launch day:
Group, HomeKids, Practices, Alpha and Coffee are in the build but switched
off, so none of them is named here. The guide-notes line about staying on
your phone came out too: the Journal now saves to your account when you are
signed in. Add a page's section back the week it is switched on; the
description can only change with a new submission, so the promotional text
above is where a launch goes first.

```
Home Church is a church in Metairie, Louisiana. This is our app.

THE GUIDE

Every Sunday message becomes a small group guide, published the same week.
Six parts, always in the same order, so you know where you are: an overview,
a fuller summary of where the message went, discussion questions for your
group, self-reflection questions to take home, the lines worth repeating, and
every passage referenced from the stage.

Check questions off as your group covers them. Write your own notes beside
the reflection questions.

FOR PEOPLE WHO LEAD GROUPS

Ask your church to turn on Leader mode and every guide gains a presentation
view: one question at a time, large type, readable across a living room
without anybody hunching over a screen.

YOUR JOURNAL

Everything you have written down, from a guide or on your own, in one place.
It is saved on your phone, and in your account if you sign in, so it follows
you to a new one. Only you can see it.

IT WORKS WITH NO SIGNAL

Guides, sermons, and your notes are saved on your phone. Church buildings and
living rooms are not known for reception. The app opens to this week's
material whether or not you have bars.

EVERYTHING ELSE

Every message we have preached since November 2024, with the notes for each
one. The songs from Sunday, and where to hear them again. Service times and
directions. What is coming up, and a button to put it on your calendar. Serve
teams and how to join one. And a way to give, which is what keeps the doors
open on a Tuesday when somebody needs to talk.

216 Giuffrias Ave, Metairie, LA 70001
Sundays at 8:00, 9:30, and 11:00
Stephen and Laura Daigle, lead pastors
```
(1644)

### What's New in This Version, 4000 characters

Public, and shown in the Updates list on every phone. Name only what members
can see. Nothing about a page that is switched off.

```
Improvements and fixes throughout the app.
```

### Keywords, 100 characters, comma separated, no spaces after commas

```
church,sermon,small group,bible study,metairie,new orleans,nola,devotional,group leader,notes
```
(93)

Do not add "home church", the name field already indexes. Do not pad with
competitor names, which is a 2.3.7 rejection.

### Category

**Primary: Lifestyle.** Where church apps live and where people look.
**Secondary: Reference.** The guide catalogue genuinely is one.

### URLs

- **Support URL** (required): use
  `https://pgrooves.github.io/home-church/legal/support.html`, which is
  written and ships with the repo. It answers the questions somebody actually
  has, where their notes live, why a guide has not appeared, and how to reach
  a person. A homepage alone is thin and reviewers do check.
- **Marketing URL** (optional): `https://www.homechurchnola.com`
- **Privacy Policy URL** (required): must be reachable on the open web **in
  addition to** the in-app screen. Both, not either.

  Use `https://pgrooves.github.io/home-church/legal/privacy.html`. The repo is
  public and Pages is already enabled, so this goes live the moment
  `legal/privacy.html` lands on `main`. No hosting to arrange.

  **Do not use a `raw.githubusercontent.com` link.** Raw serves `text/plain`,
  so a reviewer clicking it gets HTML source instead of a policy, which reads
  as a broken link on the field Apple checks most reliably.

### Copyright

```
2026 Home Church
```

-----

## 4. Screenshot plan

**Only one size is required: 6.9 inch iPhone, 1320 x 2868 portrait.** Apple
scales it down for every smaller device. No alpha channel. Up to 10, and I
would use 6.

Since we ship iPhone only, no iPad screenshots are needed.

**Order matters more than the images do.** Most people see the first two and
scroll no further, so the differentiator goes first. Do not lead with Home.
Home is the weakest screen for this purpose because it looks like every other
church app.

| # | Screen | Caption | Why here |
|---|---|---|---|
| 1 | Guide reader, discussion questions open, two checked | **This week's guide, ready before your group meets** | The thing no other church app does well |
| 2 | Presentation mode, one question, large type | **Leader mode reads across a living room** | The differentiator, and it also shows a reviewer that Leader mode exists |
| 3 | Guide index with the offline line visible | **Saved on your phone. Works with no signal.** | The native capability, made visible |
| 4 | Listen, latest message with notes expanded | **Every message since 2024, with the notes** | Depth of the catalogue |
| 5 | Connect, serve teams with one open | **Find your people, and a place to serve** | Breadth |
| 6 | Home, morning greeting, next gathering | **Sunday, and everything before it** | The warm close |

**These are already generated**, in `screenshots/`, at exactly 1320 x 2868
with no alpha channel, in the order above, with captions in
`screenshots/CAPTIONS.txt`. Rebuild them any time with:

```bash
npx http-server -p 8770 -s &
node scripts/make_screenshots.js
```

Regenerating matters more than it sounds: the content changes weekly, and a
screenshot showing a guide the app no longer has is a small lie on the store
page that a reviewer can catch by comparing the two.

They are Chromium renders using the same bundled typefaces and the same CSS,
which is honest and is accepted. If you want the last few percent of fidelity,
retake them in the iOS simulator following the same order and captions. Do not
ship a mix of both, the tonal difference shows.

-----

## 5. App Privacy questionnaire, filled in

**Answer as of v1: accounts ON**, email one time codes with Resend as the
sender, fonts bundled, push registration present but no sender behind it.

**This section was rewritten when sign in went live.** The previous version
answered for an app with no accounts and it is preserved nowhere, on purpose,
because a stale privacy answer is worse than no draft at all. If sign in is
ever switched back off, this table shrinks rather than being restored from
memory.

**Does this app collect data? Yes.**

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| **Name** | Yes | Yes | No | App Functionality |
| **Email Address** | Yes | Yes | No | App Functionality |
| **Phone Number** | Yes | Yes | No | App Functionality |
| **Physical Address** | Yes | Yes | No | App Functionality |
| **Other Data** | Yes | Yes | No | App Functionality |
| **User ID** | Yes | Yes | No | App Functionality |
| **Device ID** | Yes | Yes | No | App Functionality |
| **Other User Content** | Yes | Yes | No | App Functionality |
| **Purchase History** | Yes | Yes | No | App Functionality |

Everything else: **Not Collected.** Specifically no Health, no Financial Info,
no Location, no Sensitive Info, no Contacts, no Browsing History, no Search
History, no Usage Data, no Diagnostics. Purchases is Purchase History only.

**Notes on each one that needs explaining:**

- **Name, Physical Address, and Other Data** are the fields under Your
  information. They sync to `public.profiles` the moment somebody signs in,
  through `FIELD_MAP` in `js/auth.js`. Physical Address is the street, unit,
  city, state, and zip. Other Data is birthday, campus, and marital status.
  **None of these were declared before sign in went live and all of them have
  to be now.** Filling any of them in is optional and the app works without.
- **Email Address** is what sign in is built on, so it is unavoidable.
- **Phone Number** is declared because `classify()` in `js/auth.js` still
  accepts a phone number and would create a phone account. No SMS provider is
  connected, so in practice this path fails today. Declared anyway, because
  over-declaring costs nothing and the code path exists.
- **User ID** is the Supabase auth uuid. It is the primary key of the profile
  row, so it is unambiguously collected and linked.
- **Device ID** is the APNs push token. It is **linked** since 1.1, because a
  Coffee order stores the token of the phone it was placed from next to the
  account that placed it (`cafe_orders.push_token`), so the counter can say
  the drink is ready. The church-wide registrations in `device_tokens` are
  still not linked, but one linked path makes the answer Linked. The token is
  only ever registered in a native build.
- **Other User Content** is the one line in this table that grew. It now
  covers three different things and the last two are the substantial ones.
    - The Connect forms, which open in the system browser and post to Church
      Center, Group Vitals, Flodesk, or a Google form. The app never handles
      those values. Apple offers an optional exemption for data volunteered in
      a customer service context and these plausibly qualify, but declare them
      anyway.
    - **What people write in a group room.** Answers to discussion questions
      and prayer requests are stored on our server, under the author's first
      name, and shown to the other people in that room. This is real collected
      content, linked to the account, and the only place in the app where
      something a person typed is shown to another person. It is deleted with
      the account and swept after ninety days. See section 2.5 of
      APP_STORE_COMPLIANCE.md.
  Guide notes and Journal entries **are** part of this answer for somebody
  who is signed in: the Journal saves them to the account so they follow the
  person to a new phone, linked to the account and shown to nobody else.
  Question checkmarks, the leader's roster, attendance marks, and locally
  saved prayer requests are not. They never leave the device and Apple does
  not ask you to declare what does not leave.

- **Purchase History**, added for 1.1 with Coffee. Every order is stored
  with the account that placed it: what was ordered, the totals, the pickup
  time and the name for the cup (Name is already declared). Declared now
  although Coffee ships switched off, because the code is in the build.
  **Card details are not declared, and correctly so.** Payment happens on
  Square's own checkout page; the app and our server never see a card
  number, and Apple's guidance is that payment information a payment
  service collects without the developer having access to it is not
  collected by the app.

**This table is also the privacy manifest.** The nine rows above are the same
nine entries in `ios-config/PrivacyInfo.xcprivacy`, including which ones are
Linked, and `npm run preflight` fails if they stop matching. Change one and
change all three: the table, the manifest, and the `DECLARED` list in
`scripts/preflight.js` that holds them together.

**Sensitive Info: No.** Worth stating because it gets asked. Apple's Sensitive
Info category means racial or ethnic data, sexual orientation, pregnancy,
disability, religious or philosophical beliefs, union membership, political
opinion, genetic, or biometric data. Marital status and birthday are not on
that list and belong under Other Data. Religious belief is not collected from
anybody: this is a church's app, which says something about the publisher, not
about a data field in it.

Group rooms do not change that answer, and it is worth being able to say why
in one breath. The question is about data types an app collects, not about
what a person might choose to type into a free text box. We do not ask for
anything on that list, do not have a field for anything on that list, and do
not read, categorize, or derive anything from what is written in a room.

**Tracking: No.** No ATT prompt should ever appear. No analytics SDK, no ad
network, no attribution. If a prompt appears, something was added that should
not have been.

-----

## 6. Age rating questionnaire, filled in

**Target: 4+, but answer honestly and take what the questionnaire gives.**

Apple overhauled this in 2025. Tiers are now 4+, 9+, 13+, 16+, 18+, and there
are new required sections. The **social media questions became required for
new submissions in September 2026**, so you will be answering those too.

| Question | Answer |
|---|---|
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Sexual content or nudity | None |
| Profanity or crude humor | None |
| Alcohol, tobacco, or drug use | None |
| Simulated gambling | None |
| Horror or fear themes | None |
| Mature or suggestive themes | None |
| Medical or wellness topics | None |
| Violent themes | None |
| In-app purchases | No |
| User generated content | **Yes**, Group tab only, moderated |
| Social media capabilities | **No** |
| Unrestricted web access | **No**, see below |
| Age assurance / parental controls | Not applicable |

**Three answers worth understanding before you click them.**

**User generated content: Yes.** This answer used to be No, and the old text
here said that if a future version ever showed one person's writing to another
person, the answer would change and so would the whole submission. The Group
tab does exactly that, on purpose, and so this is now Yes.

Be precise about the scope when the questionnaire lets you: it is the Group
tab and nothing else. Guide notes, the roster, attendance, and locally saved
prayer requests still never leave the phone. Room content is moderated, and
section 2.5 of APP_STORE_COMPLIANCE.md lists every Guideline 1.2 control and
where it lives.

**This may push the rating above 4+.** Take whatever the questionnaire
returns. A church app rated 9+ or 13+ costs nothing; answering No to a UGC
question to protect a 4+ is the kind of thing that unravels a whole
submission, and it would be a lie.

**Social media capabilities: still No.** A group room is not a social network.
There is no feed, no messaging, no direct contact between two people, no
discovery, no profile visible to anybody outside a room, and no way to find a
room without a six digit code handed to you by your group's leader. It exists
for one evening and is gone.

**Unrestricted web access: No.** The app opens specific known URLs in
`SFSafariViewController`. A person can navigate onward from there, so this is
defensible either way, but the question is aimed at apps that embed a browser
as a feature. Answering Yes would push the rating to 17+ or 18+ for nothing.

**Do not use the Kids Category.** Families use this app, but it is not
directed at children, and the Kids Category carries heavy restrictions on
analytics, external links, and data collection that buy us nothing.

-----

## 7. App Review notes

Paste this into the Notes for Review field, which caps at 4000 characters.
This is 3059, which leaves room for CRLF line endings if App Store Connect
counts them; check the count again if you edit it.

**Rewritten for 1.1 (October 19), when Group went behind its switch for the
phased rollout.** The old walkthrough sent the reviewer to GROUP to open a
room, which is not in the menu while Group mode is off. Leader mode is now
shown through presentation mode, which needs no switch. The old Group and
Guideline 1.2 section is condensed into the list of switched-off pages, and
the note about the 1.0 build 8 rejection is gone because it no longer
applies.

**THE SWITCHED-OFF LIST IS NOT OPTIONAL.** Guideline 2.3.1 forbids hidden or
dormant features, and staged rollouts pass review when they are disclosed.
Code Apple was never shown, found later, is the rejection. Attach a short
screen recording of each page from a TestFlight build with its switch on
(App Review Information, Attachment), and keep the list in step with the
switches: a page that has launched comes off it, and a new page that ships
switched off goes on.

Promotional text, the description and screenshots are public. These notes
are not, so this is the only place the unlaunched pages are named.

```
Home Church is the app for a single church in Metairie, Louisiana.

HOW TO SIGN IN — PLEASE READ THIS FIRST
Type the email address, tap "Send me a code", and the app asks you for a
PASSWORD rather than a code. Nothing is emailed and you need no mailbox.

  Host account (a group leader)
    Email: homechurchappleader@outlook.com
    Password: __________________
  Member account
    Email: homechurchappreview@outlook.com
    Password: __________________

GETTING AROUND
There is no tab bar. The round button in the bottom right opens the
navigation, a full screen list. The circle in the top right opens Your
account.

LEADER MODE
Almost everything works signed out. Leader mode does not: it belongs to a
person rather than a phone, so the church grants it to whoever leads a
group.

  1. Circle in the top right, sign in with the Host account.
  2. Round button in the bottom right, then GUIDE.
  3. Open any guide and tap "Start presentation mode": one question at a
     time in large type, the view leaders use while running a meeting.

  (As the Member account, or signed out, the button is not there. That is
  the feature working, not an error.)

PAGES IN THIS BUILD THAT ARE SWITCHED OFF
We are releasing new pages to our congregation in phases. This build
contains five that church staff turn on, one at a time over the coming
months, from an admin screen inside the app. Until then each is absent from
every menu and from search, for everybody. Turning one on changes a setting,
not code; everything that runs is in this build.

  * Group: rooms a leader opens with a six digit code, where the group
    answers the week's questions. Moderation: terms agreed before the first
    post, server-side filtering, Report and Block on every note by someone
    else, and a host queue for reports. Rooms expire that night.
  * HomeKids: the week's Bible story for children, and family news.
  * Practices: a nine-part course on the practices of Jesus.
  * Alpha: what the Alpha course is, and how to sign up.
  * Coffee: order ahead from the cafe in our lobby, paid through Square.
    These are physical goods, collected at the counter, so in-app purchase
    does not apply (3.1.3(e)).

A screen recording of each is attached. If you would rather see any of them
live, tell us which and we will switch it on for the review.

DELETING AN ACCOUNT, GUIDELINE 5.1.1(v)
Two places, both in-app, neither needing an email to us or a website:
"Delete my account" under Sign out in Your account, and again in Your data.
Two taps, the second confirming. It deletes rather than deactivates. The
separate "Erase everything on this phone" clears local data only and is
deliberately not the same control.

GIVE TAKES NO PAYMENT IN THE APP
It opens our giving provider, Overflow, in SFSafariViewController. No
purchase or functionality is unlocked by giving and nothing is gated behind
it — a charitable donation handoff, not a circumvention of in-app purchase.
Course signups and sermon audio open in the system browser too.

Anything else, hello@homechurchnola.com.
```

-----

## 8. Export compliance

**Answer: the app does not use non-exempt encryption.**

The app makes HTTPS requests and nothing more. No custom cryptography, no
encryption beyond what the OS provides for transport.

Set this in `Info.plist` so you are not asked on every single upload:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

No CCATS, no year-end self classification report, no French declaration.

-----

## 9. The five ways this app is most likely to be rejected

Ordered by how likely I think each one is. Where I am guessing, I say so.

### 1. Guideline 4.2, minimum functionality. **Most likely by a wide margin.**

**Why it could happen.** A church app in a web wrapper is a shape reviewers
see constantly. Two of five tabs hand off to external sites. If the reviewer
never finds Leader mode, they are looking at a sermon list and some links.

**What we have done.** Push notifications, offline reading made visible on
screen, a native share sheet, add to calendar, and haptics. The guide reader
is stateful, local, and genuinely not a website.

**Prepared response, if rejected:**

> Home Church is not a wrapped website. There is no corresponding site for
> this content: the small group guides are published to the app first, are
> read and annotated inside it, and are stored on the device for offline use.
> The app includes leader presentation mode, per question progress tracking,
> a private journal, push notifications for new content, calendar
> integration, and native sharing. We would particularly ask that Leader mode
> be reviewed: sign in with the Host account and open any guide. We would
> welcome a call to demonstrate it.

**Escalation if that fails:** background audio with lock screen controls. It
is the strongest possible answer to 4.2 and the largest piece of work, which
is why it is not in v1.

### 2. Guideline 2.1, app completeness. **Second most likely, and avoidable.**

**Why it could happen.** Any placeholder that survives to submission. The four
home groups still have invented host names.

**What we have done.** Groups ship out of season and never render. Every inert
control is gone.

**Before submitting, verify:** every button either does something or is not
there. Tap all of them on a real device.

### 3. Guideline 5.1.1, privacy. **Unlikely but cheap to get wrong.**

**Most common cause:** the Privacy Policy URL in App Store Connect returning a
404, or pointing at a homepage that does not mention the app. The in-app
screen is not a substitute. Both are required.

### 4. Guideline 3.2.1, giving. **Unlikely, and pre-empted.**

**Why it could happen.** A reviewer sees a Give button in an app and reaches
for the in-app purchase rule without reading further.

**What we have done.** The explanation is already in the review notes above,
unprompted. Donations to a nonprofit are not digital content and do not
require IAP, the handoff is to a system browser, and nothing in the app is
unlocked by giving.

**If they ask for documentation**, they will want proof of nonprofit status
and confirmation that tax receipts are available to donors. Have someone from
the church's finance side able to answer that in one sentence.

### 5. Guideline 2.3.7, name or keywords. **Low, and worth five minutes.**

Check `Home Church NOLA` is available before you build the listing around it.
Do not put the name in the keywords field.

-----

## 10. If you only do five things

1. Start D-U-N-S enrollment today. Everything else waits on it.
2. Paste the review notes verbatim. The Leader mode walkthrough is the single
   highest leverage paragraph in this kit.
3. Lead the screenshots with the guide and presentation mode, not with Home.
4. Make the Privacy Policy URL resolve before you submit.
5. Tap every button on a real device first.
