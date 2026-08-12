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

- [x] Every inert control removed or given a real destination.
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

Turn on Leader mode and the guide gains a presentation view: one question at
a time, large type, readable across a living room without anybody hunching
over a screen. Keep a roster, mark who came, and write down what people asked
you to pray for.

None of that leaves your phone. Not to us, not to anyone. A group leader
holds things people said out loud in a room, and those belong to the room.

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

Answer as of v1: accounts off, fonts bundled, push shipped.

**Does this app collect data? Yes.** Three types, and none of them for
tracking.

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| **Device ID** | Yes | **No** | No | App Functionality |
| **Name** | Yes | Yes | No | App Functionality |
| **Email Address** | Yes | Yes | No | App Functionality |
| **Phone Number** | Yes | Yes | No | App Functionality |
| **Other User Content** | Yes | Yes | No | App Functionality |

Everything else: **Not Collected.** Specifically no Health, no Financial Info,
no Location, no Sensitive Info, no Contacts, no Browsing History, no Search
History, no Usage Data, no Diagnostics, no Purchases.

**Notes on the two that need explaining:**

- **Device ID** is the APNs push token and nothing else. Not linked, because
  v1 has no accounts and there is no name to link it to.
- **Name, email, phone, and user content** are collected only when somebody
  chooses to fill in a Connect form, and those forms open in the system
  browser and post to Church Center, Group Vitals, Flodesk, or a Google form.
  The app never handles the values. Apple offers an optional disclosure
  exemption for data volunteered in a customer service context and these
  plausibly qualify, but **declare them anyway.** Over-declaring costs
  nothing. Under-declaring is a metadata rejection.

**Tracking: No.** No ATT prompt should ever appear. No analytics SDK, no ad
network, no attribution. If a prompt appears, something was added that should
not have been.

-----

## 6. Age rating questionnaire, filled in

**Target: 4+.**

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
| User generated content | **No** |
| Social media capabilities | **No** |
| Unrestricted web access | **No**, see below |
| Age assurance / parental controls | Not applicable |

**Two answers worth understanding before you click them.**

**User generated content: No.** People write notes, keep a roster, and record
prayer requests, and every one of those stays on the author's own phone and is
never shown to any other user. There is no feed, no comments, no messaging.
That is what keeps Guideline 1.2 out of scope entirely. If a future version
ever shows one person's writing to another person, this answer changes and so
does the whole submission.

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

NO ACCOUNT IS NEEDED, AND THERE IS NO LOGIN
Nothing in this app is behind a sign in. Every screen, including all leader
features, is fully available on first launch. There is no demo account
because there is nothing to sign in to.

HOW TO SEE LEADER MODE, WHICH IS THE HEART OF THE APP
This is not obvious and we would rather point you straight at it:

  1. Tap the circle in the top right corner of any screen. This opens
     Your account.
  2. Scroll to "Leader mode" and turn the switch on.
  3. Tap "Open leader tools" to see the roster and prayer capture.
  4. Then tap the Guide tab, open any guide, and tap "Start presentation
     mode" at the top. That is the one question at a time view group
     leaders use while running a meeting.

WHY THERE IS NO CONTENT MODERATION OR REPORTING
Everything a person writes in this app, notes, roster, attendance, and prayer
requests, is stored only on their own device and is never transmitted or
shown to any other user. There is no feed, no comments, and no messaging.
There is no user generated content in the Guideline 1.2 sense and therefore
nothing to moderate or report.

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
three switches on in Your account, never at launch. If you would like to see
one delivered during review, please let us know and we will send a test to
your device.

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
