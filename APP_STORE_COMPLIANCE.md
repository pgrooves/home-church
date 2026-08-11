# App Store compliance, gap analysis

Phase 2 of the launch brief. Written August 11, 2026 against commit `f4f28ef`,
and against the App Store Review Guidelines as fetched the same day.

Read `AUDIT.md` first. This document does not repeat the findings there, it
maps them to guideline numbers, assigns severity, and says what has to change.

**Severity means:**

- **Blocker.** I expect a rejection if we submit with this unresolved.
- **High.** Real risk, or a promise the app makes and does not keep.
- **Medium.** Would survive review, should not ship.
- **Polish.** Worth doing, not worth delaying for.

**On certainty.** App Review is partly subjective and the same binary can pass
one reviewer and fail another. Where I am guessing, I say so. Section 2.1 is
the one where I am least able to promise you an outcome.

-----

## 0. The scope decision that changes everything else

**Recommendation: ship v1 with sign in switched off. Build the account
infrastructure now, leave it dormant.**

This is not a shortcut. It is the smaller and safer launch, and it follows a
pattern this codebase already established: `js/auth.js` was written to be inert
until `js/config.js` was filled in.

Here is what turning sign in off removes from the critical path:

| Requirement | With accounts on | With accounts off |
|---|---|---|
| 5.1.1(v) in-app account deletion | **Blocker.** Needs an Edge Function, a deletion screen, cascade logic. | **Does not apply.** No account creation, no deletion requirement. |
| Demo account in review notes (2.1) | **Blocker.** Reviewer must be given working credentials. | **Not needed.** Nothing to sign in to. |
| Production SMTP before launch | **Blocker.** Supabase's default sender is rate limited and not for production. A reviewer who requests a code and never receives it rejects the app. | **Not on the critical path.** |
| App Privacy label | Contact info, name, physical address, birthdate, gender, all linked to the user. | Close to "Data Not Collected." |
| RLS for user owned data | Required. | Nothing to protect. |
| Privacy policy length | Long. | Short and mostly "it stays on your phone." |

**And one argument I want to make explicitly, because I do not think it is
obvious.** An account in a church app associates a named individual with a
religious congregation. Under GDPR that is special category data. Under Apple's
own App Privacy taxonomy it lands in **Sensitive Info**, which is the most
scrutinized bucket on the nutrition label and the one most likely to draw a
follow up question in review. Combined with birthdate, gender, marital status,
and a home address, which is what `js/screens/profile.js:105` collects today,
that is a meaningful amount of sensitive personal data to be holding on a free
tier project for a feature that **currently does nothing at all**, because the
`profiles` table does not exist.

The identity form does not have to go away. It keeps working exactly as it does
now, saving to the phone, which is honest and is what v1 originally shipped. The
only change is that the "sign in and this follows you to another phone" promise
comes out until it is true.

**What I will still build in Phase 4, ready and unrun:** the `profiles`
migration with correct RLS, the account deletion Edge Function, and the data
export path. They ship as files, not as behavior. The day you want accounts, the
work is done and reviewed.

Three real users exist in the live project. Section 2.2 covers what to do
with them.

**If you overrule me and want accounts in v1**, everything in this document
still holds, the Blockers in the table above come back, and the SMTP item moves
to the top of `LAUNCH_TODO.md`. Say the word and I will scope it that way
instead. I would just rather you make that call knowing it adds three
independent rejection vectors for a feature that has never once worked.

-----

## 2.1 Minimum functionality, Guideline 4.2

### The honest assessment

**Status: this is our largest rejection risk, and I cannot promise you an
outcome.**

The relevant text is short and broad:

> Your app should include features, content, and UI that elevate it beyond a
> repackaged website. If your app is not particularly useful, unique, or
> "app-like," it doesn't belong on the App Store.

And 4.2.2, which is the one that actually fits our shape:

> Other than catalogs, apps shouldn't primarily be marketing materials,
> advertisements, web clippings, content aggregators, or a collection of links.

**Here is what a reviewer sees today, tab by tab.** I am being deliberately
unkind, because that is the useful exercise:

| Tab | What it does | How it reads |
|---|---|---|
| Home | Service times, address, a card linking to the guide, an announcement, a reading plan row | A church homepage |
| Listen | 87 episodes. Notes expand in place, but **every play button leaves the app** for Buzzsprout or Spotify | A directory of links |
| Guide | Three full guides. Deep reading, per question checkmarks, private journaling, presentation mode | **A real app** |
| Connect | Groups, teams, events, forms. **All placeholder, all being removed** before submission | Close to empty |
| Give | One paragraph, one button that **leaves the app** | A link |

Two of five tabs are link-outs. One is about to be nearly empty. That is a
credible 4.2.2 pattern, and if we submit as-is I would put the odds of a first
pass rejection somewhere around even. I would not bet either way with
confidence.

**The good news is that the Guide is genuinely not a website.** The six section
reader, the per question coverage tracking, the private journaling, and leader
presentation mode are stateful, local, offline, and purpose built. That is the
app. The strategy is to make the rest of the product point at it, and to add
native capability that a website provably cannot have.

### What I recommend building, and what I recommend skipping

**Mandatory for launch. I would not submit without these four.**

**1. Push notifications when a new guide is published.** `@capacitor/push-notifications`.

This is the single highest value item in the entire brief. It is the canonical
answer to "why is this an app and not a website," a reviewer can be shown it
working, and it simultaneously fixes a Blocker in section 2.7: Profile currently
has three notification switches that promise a Monday morning cadence and do
nothing (`js/screens/profile.js:218`).

Device tokens can be stored anonymously. **Push does not require accounts**, which
is why it survives the section 0 decision intact.

**2. Real offline reading, made visible.** Mostly already built.

`js/content.js` is already a correct three layer cache and it is the best code in
the repo. Two things are missing. First, the partial cache bug at
`js/content.js:504`, where a refresh in which three of eleven tables answer
writes a partial payload over the full cached one, so the next cold start falls
back to build time content for the other eight. Second, and more important for
review, **the capability is invisible.** A reviewer in a good office with good
wifi will never know the app works offline unless we say so on screen and in the
review notes.

**3. Native share sheet for one-liner quote cards.** `@capacitor/share`.

`js/app.js:149` already calls `navigator.share` with a clipboard fallback. Under
Capacitor this becomes a real UIActivityViewController for roughly ten lines of
change. Cheap, visible, and it is exactly the kind of OS integration 4.2 is
asking about.

**4. Add to calendar for events.** Writes a `.ics` and hands it to the system.

Cheap, unambiguously native, and it gives the Connect tab something to do that a
web page cannot. It also partly answers the "Connect is empty" problem by making
the events that do exist actionable.

**Also do, because they cost almost nothing:**

**5. Haptics on meaningful confirmations.** `@capacitor/haptics`. Three lines,
applied to checking off a question and saving a prayer request. It will not
clear 4.2 on its own, but it is the texture difference between a web view and an
app and reviewers feel it without articulating it.

**6. Fix or remove Download guide.** `js/print-guide.js:221` calls
`window.print()`, which is a **no-op in WKWebView**. The button is dead in the
packaged app. This is a Blocker under 2.1 regardless of 4.2. My preference is to
route it through the native share sheet so a leader can save or AirDrop the
guide, which turns a dead button into a second native capability. Removing it is
the acceptable fallback.

**Recommend deferring. My reasoning, so you can disagree:**

**7. Biometric lock on Leader Mode notes.** Good privacy story, moderate work,
and it protects data that never leaves the phone anyway. Strong candidate for
1.1. Not needed to clear 4.2 once the four above are in.

**8. Background audio with lock screen controls.** **This is the strongest
possible 4.2 answer and I am still recommending against it for launch.** It
would require hosting or proxying the audio, an in-app player, the audio
background mode entitlement, and `MPNowPlayingInfoCenter` integration. That is
the largest piece of work in this entire brief, it duplicates something Spotify
already does well, and declaring a background mode you use marginally invites
its own scrutiny under 2.5.4. If we get rejected on 4.2 after doing items 1
through 6, this is the escalation.

**9. Home screen widget or Live Activity.** No. Both require a native Swift
target outside Capacitor's model. Wrong shape for this codebase and this brief's
"no new frameworks without making the case" rule.

### 4.2 summary

| Item | Severity | Guideline |
|---|---|---|
| App reads as a collection of links across two of five tabs | **Blocker** | 4.2, 4.2.2 |
| Push notifications absent | **Blocker** | 4.2 (and 2.1) |
| Offline capability invisible | High | 4.2 |
| Share is web API, not native | Medium | 4.2 |
| No calendar integration | Medium | 4.2 |
| Download guide is dead in WKWebView | **Blocker** | 2.1 |

-----

## 2.2 Account requirements, Guideline 5.1.1

Numbering correction to the brief: account deletion **and** the "do not require
a login for content that does not need one" rule are now both inside
**5.1.1(v)**, not 5.1.1 and 5.1.1(iv).

> If your app doesn't include significant account-based features, let people use
> it without a login. If your app supports account creation, you must also offer
> account deletion within the app.

### Login gating: we are clean, and it was almost an accident

**Status: compliant.** Nothing in this app is behind a login. Home, Listen,
Guide, Connect, Give, the full guide reader, presentation mode, and Leader Mode
all render with no session. Leader Mode is a local boolean at
`js/store.js:106`, flipped by a switch on Profile.

This is our strongest position in the whole document and it needs to be stated
explicitly in the review notes, because a reviewer who sees a sign in form on
Profile may assume something is gated behind it.

### Account deletion

**Status with accounts off: does not apply.** No account creation, no
requirement.

**Status with accounts on: Blocker.** For completeness, the requirement, which
your brief slightly overstated. Apple's actual position:

> Offer to delete the entire account record, along with associated personal
> data. You may include additional options, but only offering to temporarily
> deactivate or disable an account is insufficient.

and

> If people need to visit a website to finish deleting their account, include a
> link directly to the page on your website where they can complete the process.

So deletion must be **initiated** in the app, and a website may complete it. A
hybrid is permitted. I still recommend doing it properly in-app, because a
church app bouncing you to a web form to delete your account looks worse than
the work costs. Deleting a Supabase auth user requires the service role key,
which must never ship in the client, so this needs an Edge Function either way.
Phase 4 will produce it, dormant.

### Third party and social login

**Status: none present, so 4.8 does not apply.** `js/auth.js` uses Supabase OTP
over email or phone only. No Google, no Facebook, no Apple.

**Flag for later:** the moment Google or Facebook login is added, **Sign in with
Apple becomes mandatory** under 4.8. Plain email OTP does not trigger it. If
anyone proposes "just add Google sign in, it's easier," that decision carries
Sign in with Apple with it.

### Data minimization, 5.1.1(iii)

**Status: currently fails. Severity High.**

> Apps should only request access to data relevant to the core functionality of
> the app and should only collect and use data that is required to accomplish
> the relevant task.

`js/screens/profile.js:105` collects first name, last name, gender, birthdate,
campus, marital status, street, unit, city, state, and ZIP. Not one of those
twelve fields is used by any feature in the app. The app renders a greeting from
the first name (`js/screens/home.js:12`) and initials in the avatar
(`js/app.js:75`). That is it. Everything else is collected for a church
database that this app does not talk to.

Collecting a home address and a birthdate to render a greeting is exactly what
5.1.1(iii) is aimed at.

**What to change:** with accounts off, this is local only and much less exposed,
but I would still trim it. My recommendation is to keep first name, last name,
and email, and move the rest behind an explicit, clearly optional "Help the
church know you" section with a plain sentence saying what it is for. If the
church needs a full member record, a church management system is the right home
for it, not this app's profile screen.

### The three existing users

Three rows in `auth.users` with no profile data anywhere, because the table does
not exist. **Recommendation: delete them before launch.** They have no data to
lose, they signed in to a feature that never worked, and starting the production
project with zero accounts is cleaner than starting with three orphans. I will
put the SQL in Phase 4. Tell me if any of them is you or the Daigles and you
would rather keep them.

-----

## 2.3 Privacy, Guideline 5.1

### Privacy policy

**Status: absent. Severity: Blocker.** 5.1.1(i) is unambiguous:

> All apps must include a link to their privacy policy in the App Store Connect
> metadata field **and within the app in an easily accessible manner.**

Both are required. A URL in App Store Connect alone is not enough. Phase 3
produces it as a real screen using the existing design system, reachable from
Profile.

The policy must explicitly cover three things Apple names:

1. What is collected, how, and every use of it.
2. That every third party receiving user data gives it equal protection.
3. **Retention and deletion policy, and how a user revokes consent or requests
   deletion.** This is the sub-clause most often missed.

### Terms of service

**Status: absent. Severity: High, not Blocker.** Correction to the brief:
**Apple does not require a Terms of Service.** It requires a privacy policy. A
ToS becomes mandatory only when you have user generated content, where 1.2
requires users to agree to terms forbidding objectionable content, or when you
supply a custom EULA instead of Apple's standard one.

We have neither. So the ToS is a good idea and I will write it, but it is not
what will get us rejected, and if the schedule gets tight it is the first thing
to move.

### Third parties, and the one I want to remove

| Third party | What it receives | Recommendation |
|---|---|---|
| **Supabase** (us-east-2, Ohio) | Content reads. With accounts off, nothing personal. | Keep. Disclose. |
| **Google Fonts** (`index.html:31`) | **Every user's IP address, on every cold launch, render blocking** | **Self host.** See below. |
| **Overflow** | Whatever the user does after tapping the button, in their own browser | Keep. Disclose the handoff. |
| **Buzzsprout, Spotify, BibleGateway, Apple Maps** | Same, user initiated, in the system browser | Keep. Disclose. |
| **APNs**, once push ships | Device token | Keep. Disclose. |

**Self hosting the fonts is a small change with a disproportionate payoff.**
Cormorant and Poppins are both open licensed. Two woff2 files, roughly 40KB.
Doing it removes a render blocking third party request from every cold launch,
removes an entire disclosure from the privacy policy, makes the app's typography
work correctly offline on first launch, and lets us answer the App Privacy
questionnaire more cleanly. There is no argument for keeping it that survives
contact with a packaged app, where the font files could have shipped in the
bundle all along.

### App Privacy questionnaire, filled in

**Assuming accounts off, fonts self hosted, push shipped, and the Connect forms
wired to a church email address.**

| Category | Collected | Details |
|---|---|---|
| Contact Info | **Yes** | Name, Email Address, Phone Number. Only when a user chooses to fill in a Connect form. Purpose: **App Functionality**. Linked to user: **Yes**. Used for tracking: **No**. |
| User Content | **Yes** | Other User Content, the free text note on a Connect form. Purpose: **App Functionality**. Linked: **Yes**. Tracking: **No**. |
| Identifiers | **Yes** | Device ID, the APNs push token. Purpose: **App Functionality**. Linked to user: **No**. Tracking: **No**. |
| Health & Fitness | No | |
| Financial Info | **No** | The Overflow handoff happens in the system browser. We never see it. |
| Location | No | |
| Sensitive Info | **No** | This is the answer we get to give because accounts are off. See section 0. |
| Contacts | No | |
| Browsing History | No | |
| Search History | No | |
| Usage Data | No | No analytics of any kind. |
| Diagnostics | No | No crash reporting. |
| Purchases | No | |
| Other Data | No | |

**App Tracking Transparency: we declare no tracking.** Nothing links user or
device data across apps or websites, there is no ad network, no analytics SDK,
no attribution SDK. `NSPrivacyTracking` is `false` and `NSPrivacyTrackingDomains`
is empty. **No ATT prompt should ever appear**, and if one does, something was
added that should not have been.

One judgment call worth knowing about: Apple provides an **optional disclosure
exemption** for data a user chooses to provide through the app's interface in a
regular customer service context, where it is not used for tracking or
advertising and disclosure is given at the point of collection. The Connect
forms plausibly qualify. **I recommend declaring them anyway.** Over-declaring
costs nothing and under-declaring is a metadata rejection.

### Privacy manifest, `PrivacyInfo.xcprivacy`

**Status: does not exist, because the iOS project does not exist. Severity:
Blocker once we package.** Required since spring 2024.

I verified that **Capacitor core ships its own manifest declaring nothing**:
`NSPrivacyAccessedAPITypes` is an empty array, tracking false, no collected data
types. So our app manifest must declare our own usage plus anything our chosen
plugins bring.

Draft, to be validated in Xcode before submission:

```xml
NSPrivacyTracking            false
NSPrivacyTrackingDomains     (empty)
NSPrivacyCollectedDataTypes  Contact Info, User Content, Device ID
                             (per the table above)
NSPrivacyAccessedAPITypes
  NSPrivacyAccessedAPICategoryUserDefaults    reason CA92.1
```

`CA92.1` covers reading and writing app-specific configuration accessible only
to the app itself, which is what Capacitor's iOS layer does. I am declaring it
defensively even though our own JavaScript uses `localStorage` rather than
`UserDefaults`, because the embedded Capacitor code touches it and
`ITMS-91053` warnings key off the binary, not the source language.

**Honesty note:** Apple's canonical required-reason API page returned a 404 and
then an empty body on two different URLs from this sandbox, so `CA92.1` and
`C617.1` are confirmed from Apple Developer Forums rather than first hand from
the documentation. **Before submission this manifest must be validated in
Xcode**, which reports the reason codes it expects. I have added that to
`LAUNCH_TODO.md` rather than leaving it as an assumption.

`C617.1`, file timestamps, is only needed if we add `@capacitor/filesystem`. The
add-to-calendar and share-a-guide work in section 2.1 may pull it in. I will
confirm when those are built rather than guessing now.

### Analytics, crash reporting, logging

**Status: none, and I recommend keeping it that way for v1.** I grepped for it.
The only logging is `js/store.js:75`, which logs a failed pub/sub subscriber to
the console. Nothing is transmitted.

This is worth protecting. "No analytics" is why the privacy label above is as
short as it is. If someone wants crash reporting later, that is a real
conversation, but it changes the Diagnostics answer and adds an SDK that needs
its own signed privacy manifest.

-----

## 2.4 Giving and donations, Guideline 3.2.1

**Status: architecturally correct today. Severity: Medium, mostly a review
notes problem.**

Donations to a nonprofit are not digital content and do not require In-App
Purchase. The current design hands off to Overflow and takes no payment in the
app, which is the conservative and correct position.

**The mechanism is already right.** `js/screens/give.js:22` fires `open-url`,
which routes through `openExternal()` at `js/components.js:90`. That helper
already prefers `Capacitor.Plugins.Browser` when present, which on iOS is
`SFSafariViewController`. That is the Apple-sanctioned way to hand off, and it
is visibly a system browser with its own chrome and a Done button, so it cannot
be mistaken for in-app commerce.

**What has to change:**

1. **Install `@capacitor/browser`.** Without it, `openExternal` falls through to
   `window.open`, which under Capacitor may open inside the app's own web view.
   A payment flow rendering inside the app's web view with no system chrome is
   precisely the ambiguity 3.2.1 disputes are made of. This is a one line
   dependency and it is the single most important giving-related change.
2. **Say so in the review notes, unprompted.** Section 2.8 of the submission kit
   will carry the exact wording. A reviewer who finds a Give tab in a church app
   and has to work out for themselves whether it circumvents IAP is a reviewer
   who may just reject and ask.
3. Keep the button label honest. "Give through Overflow" plus "Opens Overflow in
   your browser" (`js/screens/give.js:27`) is already exactly right. Do not let
   anyone shorten it to "Give."

**What I need from you, and why I am not deciding it.** You said to hold off on
nonprofit status. That is fine and it does not block this launch, because the
external handoff does not depend on it. But you should know what the answer
buys. Guideline 3.2.1(vi) reads:

> Approved nonprofits may fundraise directly within their own apps or third-party
> apps, provided those fundraising campaigns adhere to all App Review Guidelines
> and **offer Apple Pay support**.

For US organizations, approval runs through a **Candid Seal of Transparency**.
So the status question does not gate shipping the Overflow handoff, it gates
whether we could ever offer a native Apple Pay give inside the app. That is a
1.1 conversation, and `LAUNCH_TODO.md` tracks it as a schedule item rather than
a blocker.

**One thing to verify with the church's finance side before submission:** Apple
may ask, in review, how funds are used and whether tax receipts are available to
donors. Overflow presumably handles receipting. Somebody should be able to
answer that in one sentence if it is asked.

-----

## 2.5 User generated content, Guideline 1.2

**Status: 1.2 does not apply, and your answer to question 3 is what keeps it
that way.**

This is worth documenting carefully, because it is the difference between a
short review and a long one.

Every piece of user entered content in this app is **private to its author and
never leaves their device**:

| Content | Where | Visible to |
|---|---|---|
| Guide journal entries | `hc:guideState`, `js/store.js:198` | Author only, on that device |
| Question checkmarks | `hc:guideState`, `js/store.js:172` | Author only |
| Group roster and attendance | `hc:roster`, `js/store.js:247` | Author only |
| Private per member notes | `hc:roster`, `js/screens/leader.js:25` | Author only |
| Prayer requests | `hc:prayers`, `js/store.js:279` | Author only |
| Profile fields | `hc:profile`, `js/store.js:143` | Author only |

There is no feed, no comments, no messaging, no profiles visible to others, no
sharing between users. **Nothing any user types is ever shown to any other
user.**

Therefore none of 1.2's four requirements are triggered: no content filtering
mechanism, no report mechanism, no user blocking, no published contact info for
abuse reports. We still publish contact information, but as ordinary support
information, not as a 1.2 obligation.

**This must be stated affirmatively in the review notes.** A reviewer who sees
"prayer requests" and "group roster" in a church app will reasonably assume
shared data unless told otherwise. Getting ahead of it is worth a sentence.

**The one thing that could break this:** the Connect forms, once they email a
church address. That is still not UGC, because the content is not displayed to
other users in the app, it is a contact form. 1.2 remains inapplicable. But if
anyone later proposes showing prayer requests to a group, or a leader dashboard
that reads members' journal entries, **that single change pulls the entire
weight of Guideline 1.2 into scope** and turns this into a different and much
harder submission. Worth writing down somewhere the next person will find it.

-----

## 2.6 Children and age rating

**Status: needs answering, no structural problem. Severity: Medium.**

**Recommendation: 4+. Do not use the Kids Category.**

The Kids Category carries substantially heavier restrictions: no third party
analytics or advertising, parental gates on external links, and much closer
scrutiny of any data collection. This app is for a congregation, which includes
families, but it is not *directed at children* in the sense Apple means. Its
content is sermon guides and discussion questions written for adults leading
groups. Entering the Kids Category would be volunteering for restrictions that
buy us nothing.

**We are not knowingly collecting data from anyone under 13**, and with accounts
off in v1 we are barely collecting data from anyone. The birthdate field at
`js/screens/profile.js:123` is local only and I have recommended trimming it
under 5.1.1(iii) anyway.

**Phase 0 finding you need to know about.** Apple overhauled age ratings in
2025. The tiers are now **4+, 9+, 13+, 16+, 18+**, replacing the old 12+ and
17+. The questionnaire gained new required sections covering **In-app controls,
Capabilities, Medical or wellness topics, and Violent themes**, and separately a
set of **social media capability questions**. Responses to the main update were
required by January 31, 2026. **The social media questions become required for
new submissions starting September 2026**, which is next month, so we will be
answering them.

Draft answers, for the submission kit:

| Question area | Answer |
|---|---|
| Violence, cartoon or realistic | None |
| Sexual content or nudity | None |
| Profanity or crude humor | None |
| Alcohol, tobacco, drug use or references | None |
| Simulated gambling, contests | None |
| Horror or fear themes | None |
| Mature or suggestive themes | None |
| Medical or wellness topics | None |
| Unrestricted web access | **See the judgment call below** |
| User generated content | **No.** See section 2.5. |
| Social media capabilities | **No.** No feed, no messaging, no user to user interaction. |
| In-app purchases | No |
| Age assurance / parental controls | Not applicable |

**The one judgment call: "unrestricted web access."** The app opens specific,
known URLs in `SFSafariViewController`. A user can then navigate anywhere from
inside that browser. Strictly, that question is aimed at apps that embed a
browser as a feature, and the conventional answer for an app that only hands off
to specific external links is **No**. I am recommending **No**, and flagging that
it is a defensible-either-way call rather than a certainty. Answering Yes would
push the rating to 17+ or 18+ for no benefit.

**Resulting rating: 4+.**

-----

## 2.7 App completeness, Guideline 2.1

This section holds the most Blockers, and none of them are hard to fix. They are
just currently untrue.

> Submissions to App Review should be final versions with all necessary metadata
> and fully functional URLs included; placeholder text, empty websites, and
> other temporary content should be scrubbed before submission.

### Controls that promise an action and do not perform it

**Severity: Blocker. This is also arguably 2.3.1, "don't include any hidden,
dormant, or undocumented features," since these are dormant features presented
as live ones.**

| Location | What it tells the user | What actually happens |
|---|---|---|
| `js/app.js:284` | "We will pass your name to the host. Expect a text this week." | A toast. Nothing sent, nobody told, and **no name is even captured**, the card has no input field. |
| `js/app.js:288` | "Noted. Someone from that team will find you on Sunday." | A toast. Nothing recorded. |
| `js/app.js:292` | "Got it. This one waits on your phone until the church system is connected." | `form.reset()`. The name, contact, and note the user typed are **discarded**. The copy says they are held on the phone. They are not. |
| `js/screens/profile.js:218` | Three switches: new guide Monday morning, Saturday Sunday-reminder, group day reminder | A boolean in `localStorage`. No push infrastructure exists. No notification will ever arrive. |
| `js/screens/guide.js:236` | "Download guide" | `window.print()` at `js/print-guide.js:221`, a **no-op in WKWebView**. |
| `js/screens/profile.js:88` | "Sign in and your information follows you to any phone" | Nothing syncs. The `profiles` table does not exist. |
| `js/screens/profile.js:109` | "Synced to your account." | Same. Untrue. |

**Superseded on August 11, and the replacement is smaller.** I had planned to
build a Supabase submissions table plus an Edge Function that forwarded to a
church address. Then you sent the six links, and they made that unnecessary.

The church already runs real infrastructure for every one of these: **Church
Center** for baptism and Alpha, **Group Vitals** for group hosting, a **Google
Form** for prayer, **Flodesk** for the email list, and an **SMS keyword** for
serving. Pointing the app at those is a smaller change than building a parallel
capture pipeline, and a better one, because those systems have somebody watching
them and a second copy of a member's contact details sitting in a Supabase
project nobody checks would be a liability rather than a feature.

**Status: done.** Migration `0007_connect_real_destinations.sql`, applied. The
three lying actions are deleted from `js/app.js`. Connect rewritten. Zero forms
remain on the screen. This also incidentally answers the README's long standing
open question about which church management system holds this data: **Planning
Center** and **Group Vitals**.

### Placeholder content

**Severity: Blocker.**

- **The roster ships seeded with six invented people.** `js/store.js:229` inserts
  Anna, Marcus, Dee, Jasmine, Paul, and Renee on first read. Every user, and
  certainly the reviewer, opens Leader Mode to a fake group. This must become an
  empty state, which already exists and is well written at
  `js/screens/leader.js:81`.
- **The group finder is now season gated, which solves the placeholder problem
  by accident and it is worth understanding why.** `church_profile.groups_in_season`
  hides the entire finder and shows one warm card in its place. So **if we
  submit while out of season, the four groups with invented host names never
  render at all**, and there is nothing for a reviewer to find. If we submit in
  season, those four rows must be the church's real groups with real hosts,
  because a reviewer reading "Trey and Anna, Lakeview, young families" is
  reading placeholder content. Either is fine. Pick one deliberately rather
  than discovering it at submission.
- **Connect no longer risks being empty**, which was my concern when I wrote
  this section. It now carries four serve teams with real descriptions, the SMS
  signup, three events, and six next steps of which five go somewhere real.
- `js/screens/profile.js:287` hardcodes "Version 1.0", disconnected from any
  build number.

### Demo account and review notes

**Status with accounts off: no demo account needed.** Nothing to sign in to.

**But the review notes carry a Blocker of their own.** A reviewer will never
find Leader Mode. It lives behind a switch on the Profile screen, reached only
by tapping the avatar in the top bar, and it is the app's entire differentiator.
If the reviewer does not see presentation mode, the roster, and prayer capture,
they are assessing 4.2 against a reading app with two link-out tabs. **That is
how this app gets rejected on 4.2 without anyone having seen the reason it
should pass.**

The review notes must walk them there in numbered steps. Phase 7 will write
them.

If push notifications ship, the reviewer also needs to be able to see one. That
means either a scheduled send during the review window or a documented way to
trigger one, which needs thinking through in Phase 5.

-----

## 2.8 Everything else

| Item | Status | Severity | What to do |
|---|---|---|---|
| **Accurate metadata (2.3)** | Not written | High | Phase 7. Description must not claim anything from the 2.7 table above until it is true. |
| **Hidden or dormant features (2.3.1)** | **Fails today** | **Blocker** | Same fix as 2.7. Dormant features presented as live ones is exactly what this clause names. |
| **Beta or trial framing** | Clean | None | No "beta", "coming soon", or "trial" copy anywhere. Verified by grep. |
| **Encryption export compliance** | Not declared | **Blocker** | Set `ITSAppUsesNonExemptEncryption` to **`false`** in `Info.plist`. The app uses only standard HTTPS, which is exempt. Setting it in the plist avoids being asked on every single upload. |
| **Background modes** | None used | None | Declare none. If background audio is ever added, that changes. |
| **Required device capabilities** | Not set | Medium | Leave at the default. Nothing here needs a specific capability, and over-declaring shrinks the eligible device list for no reason. |
| **Support URL** | **Missing** | **Blocker** | Required field in App Store Connect and it must resolve. `homechurchnola.com` exists; it needs a page that actually addresses app support, not just the homepage. Added to `LAUNCH_TODO.md`. |
| **Marketing URL** | Optional | Polish | `homechurchnola.com` is fine. |
| **iPad support** | Undecided | High | **Recommend iPhone only for v1.** The layout is capped at 720px (`css/base.css:108`) and centered, which on a 13 inch iPad is a narrow column in a sea of paper. That reads as an unadapted phone app, which is its own 4.2 risk. Declaring iPhone only also removes the 2064x2752 screenshot requirement. |
| **App icon alpha channel** | **Fails** | **Blocker** | All seven PNGs are colortype 6, RGBA. Apple rejects icons containing transparency. Re-export flattened at the full iOS size set. |
| **`user-scalable=no`** | Set at `index.html:8` | Medium | WKWebView honors this where Safari ignores it, so pinch zoom will actually be disabled in the packaged app. Given the app has its own text scale control, this is defensible, but it removes an accessibility affordance some users depend on. I would remove it. |
| **Contrast** | Fails AA in light mode | High | Not a rejection reason. Apple very rarely rejects on contrast. It is a quality issue and it affects real people in this congregation, which is the better reason to fix it. `--hc-mid` at 4.16 on paper and 3.74 on cards, `--hc-accent-deep` at 3.42. Phase 6. |
| **Partial cache overwrite** | `js/content.js:504` | Medium | A refresh where some tables time out writes a partial payload over the full cache. Phase 6. |
| **`role="application"`** | `index.html:47` | Medium | Wrong role for a reading app. Hands nearly all keystrokes to the app. Phase 6. |
| **Dynamic Type** | Not supported | Medium | The app has its own three step scale but ignores the system setting. Phase 6. |

-----

## Recommended launch scope

Ordered by what blocks what. Everything in **Must** has to be done before
submission. I am not recommending anything in the deferred list for v1.

### Must, in dependency order

1. **Decide the accounts question** (section 0). Everything downstream branches
   on it. My recommendation: off for v1, infrastructure built and dormant.
2. **Make the four dishonest controls honest.** Connect forms to Supabase plus a
   forwarding Edge Function, group and serve taps given real inputs, notification
   switches wired to real push. (2.7, Blocker)
3. **Push notifications.** (4.2 and 2.7, Blocker)
4. **Privacy policy and account deletion screens.** Written as real screens in
   the design system. Deletion screen ships dormant if accounts are off. (5.1, Blocker)
5. **Remove placeholder content**, and decide what Connect becomes. (2.7, Blocker)
6. **Fix or reroute Download guide.** (2.1, Blocker)
7. **Self host the fonts.** (privacy, performance, offline fidelity)
8. **Native share sheet, add to calendar, haptics.** (4.2)
9. **Capacitor project, icons without alpha, `PrivacyInfo.xcprivacy`,
   `ITSAppUsesNonExemptEncryption`, `@capacitor/browser`.** (Phase 5, Blockers)
10. **Quality pass:** contrast, offline visibility, the cache bug, `role`,
    Dynamic Type, error states. (Phase 6)
11. **Submission kit**, with the Leader Mode walkthrough and the giving
    explanation as the two load bearing pieces. (Phase 7)

### Deferring, deliberately

Biometric lock on leader notes. Background audio with lock screen controls.
Widgets and Live Activities. iPad layout. Sign in and profile sync. Guide
checkmark and journal sync across devices.

### Where I am genuinely uncertain

**4.2 is a coin flip until the native capabilities land, and it is not a
certainty afterward.** A church app in a web wrapper with two link-out tabs is a
recognizable shape to a reviewer who sees hundreds of them. What we have going
for us is that the guide reader is real, the offline behavior is real, and the
Leader Mode story is genuinely unusual. What we have going against us is that
none of that is visible in the first thirty seconds unless the review notes
point at it.

If we are rejected, I expect it to be 4.2, I expect the appeal to be winnable
with a better demonstration rather than more code, and background audio is the
escalation if it is not.

-----

**Waiting on your sign off on the scope above, and specifically on the accounts
question in section 0 and the Connect tab question in 2.7, before I write any
code.**
