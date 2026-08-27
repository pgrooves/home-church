# Submission kit

Everything needed to put Home Church in front of App Review, written to be
executed against rather than read. Phase 7 of the launch brief.

Companion documents: `AUDIT.md` for what the app is, `APP_STORE_COMPLIANCE.md`
for why each decision was made, `LAUNCH_TODO.md` for what only you can do.

-----

## 1. Pre-submission checklist, in dependency order

Each block depends on the one above it. Working out of order mostly wastes
time, except where noted, where it costs weeks.

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

- [ ] In Supabase, **Authentication → Sign In / Providers → Email**, add two
      **test OTPs**: one address for the host, one for the member, each with
      a fixed six digit code. A test OTP means the code always works and no
      email is sent, so a reviewer is never waiting on an inbox we control.
      Use addresses that read as what they are, `applereview.host@` and
      `applereview.member@` on the church domain.
- [ ] Sign in once as each so the `profiles` row exists.
- [ ] Turn Leader mode on for the host account. From an admin's phone that is
      Admin → Manage users → the Leader mode switch on their row, which is how
      the church does it. By hand it is still one column:
      `update public.profiles set can_host = true where id =
      (select id from auth.users where email = '…');`
      This is what the reviewer's Leader mode walkthrough in section 7 needs,
      not only the moderation queue: since migration 0036 the leader tools and
      the presentation view belong to the account rather than to the phone.
- [ ] Fill both addresses and both codes into the review notes in section 7.
- [ ] Walk the seven steps in section 7 yourself, on a device, exactly as
      written. If any step does not do what it says, fix the step or fix the
      app before a reviewer finds the difference.
- [ ] Leave both accounts in place after approval. Apple re-reviews updates.

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

```
Home Church is a church in Metairie, Louisiana. This is our app.

THE GUIDE

Every Sunday message becomes a small group guide, published the same week.
Six parts, always in the same order, so you know where you are: an overview,
a fuller summary of where the message went, discussion questions for your
group, self-reflection questions to take home, the lines worth repeating, and
every passage referenced from the stage.

Check questions off as your group covers them. Write your own notes beside
the reflection questions. All of it stays on your phone.

FOR PEOPLE WHO LEAD GROUPS

Ask your church to turn on Leader mode and the guide gains a presentation
view: one question at a time, large type, readable across a living room
without anybody hunching over a screen. Keep a roster, mark who came, and
write down what people asked you to pray for.

Your roster, your attendance marks, and the notes you keep beside a name stay
on your phone. Not to us, not to anyone. A group leader holds things people
said out loud in a room, and those belong to the room.

THE GROUP TAB

Open a room and the app gives you a six digit code to send your group. This
week's questions are already in it. Everybody answers on their own phone, the
answers stay hidden until you open them, and you open them one at a time as
the conversation gets there, so nobody reads ahead and nobody is put on the
spot. The last section is prayer requests. When the night is over, one button
puts the whole evening on a single sheet you can send to everyone.

A room needs an account, because your first name goes on what you write and
your group should know who said it. It lasts the evening.

IT WORKS WITH NO SIGNAL

Guides, sermons, and your notes are saved on your phone. Church buildings and
living rooms are not known for reception. The app opens to this week's
material whether or not you have bars.

EVERYTHING ELSE

Every message we have preached since November 2024, with the notes for each
one. Service times and directions. What is coming up. Serve teams and how to
join one. And a way to give, which is what keeps the doors open on a Tuesday
when somebody needs to talk.

216 Giuffrias Ave, Metairie, LA 70001
Sundays at 8:00, 9:30, and 11:00
Stephen and Laura Daigle, lead pastors
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
| **Device ID** | Yes | **No** | No | App Functionality |
| **Other User Content** | Yes | Yes | No | App Functionality |

Everything else: **Not Collected.** Specifically no Health, no Financial Info,
no Location, no Sensitive Info, no Contacts, no Browsing History, no Search
History, no Usage Data, no Diagnostics, no Purchases.

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
- **Device ID** is the APNs push token, not linked to the account. Note that
  the token is only ever registered in a native build, and nothing sends to it
  yet. See the notification note in section 7 before answering this one.
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
  Guide notes, question checkmarks, the leader's roster, attendance marks, and
  locally saved prayer requests are **not** part of this answer. They never
  leave the device and Apple does not ask you to declare what does not leave.

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

Paste this into the Notes for Review field. **The Leader mode walkthrough is
the most important thing in this entire document.** A reviewer who does not
find Leader mode is assessing a reading app with two tabs that link outward,
which is exactly the shape that fails Guideline 4.2.

```
Thanks for reviewing. Home Church is the app for a single church in Metairie,
Louisiana. A few notes to save you time.

ALMOST NOTHING NEEDS AN ACCOUNT
Every screen is available on first launch without signing in, including the
whole guide catalogue and every sermon. Two things are not. Writing in a
group room needs an account, described below, because what a person writes
there is shown to their group under their first name and that should not be
anonymous. And Leader mode belongs to a person rather than to a phone: it
lets somebody host a room and edit the questions their whole group answers,
so the church grants it to the people who lead a group instead of leaving it
as a switch anybody can turn on. We have supplied an account below that has
it, so everything in it is one sign-in away.

Signing in has no password. We send a six digit code to an email address and
the account is created on first use, so you can sign in with any address you
control. The two demo accounts below are configured so the codes never change
and no email is sent.

DELETING AN ACCOUNT, GUIDELINE 5.1.1(v)
Once signed in, account deletion is available in two places, both inside the
app and neither requiring an email to us or a visit to a website:

  1. Tap the circle in the top right corner to open Your account. "Delete my
     account" sits directly under Sign out.
  2. Or open Your account, then Your data, where the button sits beside the
     copy explaining exactly what is removed.

It takes two taps, the second confirming, and it deletes the account and
everything synced to it from our server rather than deactivating it. The
separate "Erase everything on this phone" button on that same screen clears
local device data and is deliberately not the same control.

HOW TO SEE LEADER MODE, WHICH IS THE HEART OF THE APP
This is not obvious and we would rather point you straight at it. Use the
Host account at the bottom of these notes: Leader mode is already on for it,
because the church turns it on for the people who lead a group.

  1. Tap the circle in the top right corner of any screen. This opens
     Your account.
  2. Sign in with the Host email and code from the bottom of these notes.
  3. Scroll to "Leader mode" and tap "Open leader tools" to see the roster
     and prayer capture.
  4. Then tap the Guide tab, open any guide, and tap "Start presentation
     mode" at the top. That is the one question at a time view group
     leaders use while running a meeting.

  (Signed in as the Member account, or signed out, that section says Leader
  mode is off and who turns it on. That is the feature working, not an
  error: it is what everybody who is not leading a group sees.)

THE GROUP TAB, AND GUIDELINE 1.2
One part of this app shows what a person writes to other people, and we want
to be direct about it and about how it is moderated.

A group room is a room a small group joins with a six digit code, given out
by whoever is hosting that evening. The room carries that week's discussion
questions. Each person types their own answer, the answers stay hidden until
the host opens them one at a time, and the last section is prayer requests.
The room expires the same night and is deleted after ninety days.

There is nothing else like it in the app. Guide notes, the leader's roster,
attendance, and locally saved prayer requests are still stored only on the
device and shown to nobody. There is no feed, no messaging, no way to contact
another user, no directory, and no way to find a room without being given its
code by a person.

The Guideline 1.2 controls are all one tap deep and all testable:

  * TERMS BEFORE THE FIRST POST. The first time anyone tries to write in a
    room, a screen states the rules against objectionable content and asks
    them to agree. There is no way past it. Our server refuses the post as
    well, so it cannot be skipped by anything.
  * FILTERING. Posts are checked against a slur list on our server before
    they are stored, on posting and on editing.
  * REPORTING. Every note written by somebody else has a Report button on it,
    in plain sight rather than behind a long press. Reporting asks why and
    confirms, and names hello@homechurchnola.com as a second route.
  * A HOST QUEUE. Reports appear immediately at the top of the room for
    whoever is hosting it, with two buttons on each: "Take it down", which
    removes it for everybody, and "Leave it up", which closes the report. We
    commit in our terms to acting on anything sent to that address within 24
    hours.
  * BLOCKING. Next to Report on every note. Blocking somebody stops their
    writing reaching you at all, enforced on our server rather than hidden on
    screen. An Unblock list sits at the bottom of the room.

TO TEST ALL OF THAT ON ONE DEVICE
Reporting and blocking only appear on writing that is not your own, so this
needs two accounts. Both are below, and both are configured as test accounts:
the codes never change and no email is actually sent. One device is enough,
because a room lives on our server and is still there when you sign back in.

  Host account (marked as a group leader)
    Email: __________________     Code: __________
  Member account
    Email: __________________     Code: __________

  1. Tap the circle in the top right and sign in as the HOST.
  2. Tap the Group tab, then "Open a room" under Leader mode. The app mints
     a six digit room code. Write it down.
  3. Scroll to Prayer requests at the bottom and add one. The terms screen
     appears first, which is the agreement gate. Prayer requests are visible
     to the room immediately, which is what makes the next step possible.
  4. While you are here: type a slur into an answer box and post it. It is
     refused with a message, and nothing is stored.
  5. Tap the circle, sign out, and sign in as the MEMBER.
  6. Group tab, type the room code, join. You will see the host's prayer
     request with Report and Block underneath it. Try both.
  7. Sign out, sign back in as the HOST, open the Group tab and type the same
     room code. The report is at the top of the room, with "Take it down" and
     "Leave it up".

  (Signing out clears the room from the phone, which is why step 7 asks for
  the code again. The room itself is on our server and unchanged.)

If you would rather we walk through it live, or you want a second device set
up, we are at hello@homechurchnola.com and will answer within the hour.

ABOUT THE GIVE TAB
Home Church is a church and the Give tab is how people donate. It takes no
payment inside the app. Tapping the button opens our giving provider,
Overflow, in SFSafariViewController, which is a system browser with its own
chrome and a Done button. No purchase, digital content, or app functionality
is unlocked by giving. Nothing is gated behind it. We are not circumventing
in-app purchase, we are handing off to a charitable donation platform
entirely outside the app.

Several other buttons behave the same way and open in the system browser:
baptism and course signups on Church Center, group hosting on Group Vitals,
our email list on Flodesk, and sermon audio on our podcast host and Spotify.

NOTIFICATIONS
The app asks for notification permission only when a person turns one of the
switches on in Your account, never at launch. Declining is respected: the
switch goes back off rather than sitting on while nothing arrives.

Two notices are sent, both from our own server: the small group guide when a
new one is published, and a reminder the evening before our Sunday gathering.
If you would like to see one during review, turn a switch on and let us know
and we will send one to your device within a few minutes.

IT IS BUILT TO WORK OFFLINE
Guides, sermons, and notes are stored on the device. If you would like to
check, put the phone in airplane mode and relaunch. The app opens to full
content rather than an error, which is deliberate: our congregation opens it
in a building with concrete walls every Sunday.

Anything else, we are at hello@homechurchnola.com and will answer quickly.
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
> private journaling, local group rosters and attendance, push notifications
> for new content, calendar integration, and native sharing. We would
> particularly ask that Leader mode be reviewed, since it is the core of the
> app and is reached through Your account, and we would welcome a call to
> demonstrate it.

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
