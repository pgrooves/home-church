# Google Play compliance, written before the build

The Android version is the same app as the iOS one: the same `www/`, the same
Supabase project, the same switches. So most of `APP_STORE_COMPLIANCE.md`
carries over unchanged, and this file does not repeat it. It covers what
Google asks that Apple does not, what Google asks differently, and the
decisions that have to be made before the Android project is generated,
because some of them change what goes into the build. What to type into
Play Console, step by step, is `PLAY_SUBMISSION_KIT.md`.

Written October 27, 2026. Policy dates below are from Google's own pages
where those were reachable and from secondary sources where they were not;
`support.google.com` is blocked from the session that wrote this, and the
lines that rest on a secondary source say so.

**Decided October 27:** Give hidden on Android, target ages 13 and over, and
the first Android release ships without push. All three on the condition
that nothing changes or hides for the iPhone app, which is how every Android
difference below is built: a branch on `HC.native.isAndroid()` that an iPhone
never takes, pinned by `tests/android.test.js`.

Status key: **Done** means true in the repo today. **Build** means it gets
done as part of generating the Android project. **Decide** means it needs an
answer from Trey first. **Console** means it is a form in Play Console.

-----

## 0. The account, and the gate in front of production

**Status: personal account, paid. Decide later: organization account.**

The developer account is a personal one. That has three consequences that an
organization account would not.

1. **Identity.** The legal name and address on the Google payments profile
   must match one person's government ID. Google shows that legal name and
   the country on the Play listing, next to the developer name "Home Church
   NOLA". The street address only shows if the app sells something through
   Google Play billing, which it never will (section 3).
2. **Device check.** The account owner has to sign in to the Play Console app
   on a real Android phone running Android 10 or later, once. A borrowed
   phone is fine; remove the church account from it afterwards.
3. **Closed test before production.** At least **12 testers opted in for 14
   days in a row** on a closed testing track, after which Google asks how the
   testing went before it grants production access. Recruit 14 or 15 so one
   person opting out does not reset the clock. Testers who never open the
   app are the usual reason that application is refused.

**The way out of 2 and 3** is an organization account, which needs a free
D-U-N-S number for the church. The church has an EIN, which is the usual
basis for one; nonprofit status is not required. A personal account cannot
be converted, so this would be a second $25 account and an app transfer.
Nothing in this file or in the build depends on which account publishes.

-----

## 1. What the build itself has to be

| Requirement | Status | Notes |
|---|---|---|
| **Android App Bundle (`.aab`)**, not an APK | Done | `.github/workflows/android.yml` builds one on every push. |
| **Play App Signing** | Console | Mandatory for new apps. Google holds the key that signs what phones install; we hold an **upload key** that only proves an upload came from us. A lost upload key can be reset through Google support, which a lost iOS certificate cannot. |
| **Target API 36 (Android 16)** | Done | Required for new apps and updates since August 31, 2026. Capacitor 8's template already sets `targetSdkVersion = 36` and `compileSdkVersion = 36`. Every Capacitor major bump must be checked against Google's then current target. |
| **16 KB memory pages** | Done | Required for apps targeting Android 15+, and only about native `.so` libraries. Our plugins ship none, but Firebase brings one in (`libdatastore_shared_counter.so`, from androidx datastore). It is aligned, and `scripts/android_manifest_check.js` fails the build if any library ever is not. |
| **`versionCode` goes up on every upload** | Done | Play refuses a repeat. The Action uses its run number, which only goes up, so nobody raises it by hand. `versionName` is 1.1, matching iOS. |
| **`minSdkVersion` 24** | Build | Capacitor 8's floor, Android 7. Fine. |

**No webview-wrapper problem.** Google's policy against apps that are only a
website in a frame is the Android cousin of Apple 4.2. The same answer holds:
the content ships inside the app and works offline, and the app does native
work a website cannot (notifications, reminders, biometrics on the Journal,
the system share sheet, add to calendar).

-----

## 2. Permissions, kept to the ones a feature needs

Google asks about permissions that Apple handles through Info.plist strings,
and a few of them carry their own Play Console declarations. The rule for
this app: **every permission in the merged manifest has a feature that needs
it, and the build fails if a new one appears.** A plugin update that quietly
adds a permission is the Android version of the privacy manifest drifting.

What the merged manifest holds, read from the first real build. **Done:**
`scripts/android_manifest_check.js` holds this list and fails the build on
anything else.

| Permission | From | Why |
|---|---|---|
| `INTERNET` | Capacitor | Content |
| `ACCESS_NETWORK_STATE` | Capacitor, Firebase | Knowing there is no signal |
| `POST_NOTIFICATIONS` | local and push notifications | Asked at runtime on Android 13+, the same moment iOS asks |
| `VIBRATE` | haptics | Taps |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | local notifications | Reminders survive a restart |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | biometric auth | The Journal lock (the second is for phones older than Android 9) |
| `c2dm.permission.RECEIVE` | push notifications | Firebase Cloud Messaging. Present although push is off, harmless |
| `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | androidx | Internal, signature level, grants nothing to another app |

None of these carries a Play Console declaration.

**Not requested, on purpose:**

- **Calendar (`READ_CALENDAR`, `WRITE_CALENDAR`).** The calendar plugin's
  README tells you to add both. We do not, because the app only ever calls
  `createEventWithPrompt`, which on Android opens the phone's own New Event
  screen through an intent and needs no permission at all. Adding them would
  put "calendar" in the Data safety form for a feature that never reads one.
  The build must not add them, and the manifest check enforces it.
- **Storage or photos.** Files the app writes (a calendar invite, a printed
  guide) go to the app's own cache directory, which needs nothing. Google's
  photo and video permissions policy therefore does not apply.
- **`USE_EXACT_ALARM`.** Restricted by Play to alarm clock and calendar apps.
  Not used.

**`SCHEDULE_EXACT_ALARM`: removed. Done.** Not restricted by Play, but the
local notifications plugin asks for it by default, and on Android 12+ that
sends people to a Settings screen the first time they ask for a reminder.
Reminders are "the event starts in an hour", not an alarm clock, so on
Android `js/native.js` schedules them inexact (`isExactNotification: false`,
an Android-only field the iPhone payload does not carry) and the manifest
removes the permission.

-----

## 3. Payments: the one real Android problem

**Coffee: fine. Give: Done, hidden on Android.**

Google's Payments policy splits payments three ways: digital goods, which
must use Play billing; physical goods and services, which must not; and
"tax exempt donations", which must not either.

- **Coffee is physical goods.** A drink you pick up at the counter is the
  textbook case for paying outside Play, and the Square checkout opening in
  the browser is exactly what the policy expects. No change.
- **Give is a donation, and the exemption needs proof of tax exempt status.**
  Google asks for verifiable documentation, which for a US organization means
  an IRS determination letter. **The church has an EIN but no determination
  letter**, and Google is enforcing this now: in 2026 it refused an update to
  AnkiDroid over a donation link, even after the developer sent in a 501(c)(6)
  letter (secondary source; the official page was unreachable). A church is
  tax exempt by law without applying, but that is not a document a reviewer
  can check.

  Apple treated the same button as fine, because Apple's rule is about the
  payment never happening inside the app. Google's rule is about *who* the
  money goes to, so the same button that passed Apple can fail Google.

**Built: Android ships with Give hidden**, by platform, until the church has
a determination letter. `offersGiving()` in `js/native.js` is the one
answer, and the Give stop in the menu, the giving row on Home and the button
on the Give screen all ask it. Hidden means the Give tab, the row in the
overflow sheet, and every other link to Overflow, not just the tab. People
can still give on the church website; the app just does not link to it on
Android. When the letter exists, flip it on in a new build and send Google
the letter if asked.

The alternative is to keep Give and answer a rejection if it comes. That is
cheap to try and expensive to lose, because a payments rejection can hold up
every update after it, which is the AnkiDroid situation.

-----

## 4. Account deletion needs a web page too

**In app: Done. On the web: Done, goes live with `main`.**

Apple accepts deletion inside the app. Google wants that **and** a public web
link where somebody can request deletion **without installing the app**, and
the link goes on the Data safety form, where it shows on the store listing.

The privacy policy currently says you can delete your account "and you do not
have to email anybody or visit a website to do it". That stays true, but it
is not enough for Google. The plan:

- A page at `legal/delete-account.html`, built by `npm run legal` like the
  other three, saying in order: delete from the app (Your account, Your data,
  Delete my account); or open the web version, sign in, and do the same
  there; or email `hello@homechurchnola.com` and the church will do it
  within a stated number of days. It names what is deleted and what is not
  (on-phone data is not ours to delete; Connect form email in the church
  mailbox is on request).
- **Live link:** `https://pgrooves.github.io/home-church/legal/delete-account.html`,
  once it reaches `main`.

-----

## 5. Privacy policy wording

**Done, additions only.** The policy is good, and it was written for an
iPhone. One policy covers both stores; nothing about the iPhone was taken
out, and the effective date moved to October 27, 2026.

- "Apple gives us an anonymous token for your device" and "Apple, which
  delivers notifications": **left as is for now**, because it is still the
  whole truth: an Android phone registers no token while push is off. When
  Android push ships, Google (Firebase Cloud Messaging) is added beside
  Apple.
- "Face ID, Touch ID, or your passcode" gains "or on an Android phone your
  fingerprint, face, or screen lock". The switch on Settings says the
  Android words on Android only.
- "you do not have to email anybody or visit a website to do it" stays, and
  a sentence after it links the deletion page from section 4.
- "Giving opens Overflow" became "Giving, on an iPhone or on the web, opens
  Overflow".

The policy is generated from `js/screens/legal.js`, so the change is made
there and `npm run legal` rebuilds the web copy.

-----

## 6. Data safety form, drafted

**Console.** Google's equivalent of the App Privacy questionnaire. It is
drafted from the same facts as `SUBMISSION_KIT.md` section 5, translated into
Google's categories, and it must stay consistent with the privacy policy;
Google compares the two.

**Does the app collect or share any of the required user data types? Yes.**
**Is all collected data encrypted in transit? Yes** (HTTPS to Supabase only).
**Can users request deletion? Yes**, in app and at the section 4 link.

| Google category | Data type | Collected | Shared | Required? | Purpose |
|---|---|---|---|---|---|
| Personal info | Name | Yes | No | Optional | App functionality, Account management |
| Personal info | Email address | Yes | No | Required to sign in | Account management |
| Personal info | User IDs | Yes | No | Required to sign in | Account management |
| Personal info | Address | Yes | No | Optional | App functionality |
| Personal info | Phone number | Yes | No | Optional | Account management |
| Personal info | Other info | Yes | No | Optional | App functionality |
| Financial info | Purchase history | Yes | No | Optional | App functionality |
| App activity | Other user-generated content | Yes | No | Optional | App functionality |
| Device or other IDs | Device or other IDs | Yes | No | Optional | App functionality |

Everything else: not collected. No location, no contacts, no calendar, no
photos, no health, no web browsing, no app interactions, no crash logs or
diagnostics, no advertising ID.

Why each answer:

- **Shared: No everywhere.** Google does not count passing data to a service
  provider that processes it for us (Supabase, Resend, Gmail, Firebase) as
  sharing. Opening Overflow, Square, Church Center or a Google form in the
  browser is the person going to another site, not us sending data.
- **Other info** is birthday, campus and marital status. **Not** "religious
  beliefs": the app has no field for it, and a church publishing the app is
  not data about the person, the same answer as Apple's Sensitive Info.
- **Phone number**: declared for the same reason as on iOS, the code path
  exists.
- **Purchase history**: Coffee orders, declared although Coffee ships
  switched off, because the code is in the build. Card details are not ours;
  Square collects them on its own page.
- **Other user-generated content**: group room writing, Journal entries for a
  signed in person, and Connect form messages.
- **Device or other IDs**: the FCM push token, which on Android plays the
  role the APNs token plays on iOS, including being linked to an account for
  Coffee orders and admin alerts.
- **No advertising ID.** Firebase Messaging does not need it. The build
  removes `com.google.android.gms.permission.AD_ID` if any dependency adds it,
  and the ads declaration in section 9 says No.

If push is not in the first Android release (section 8), the Device IDs row
stays, because the Coffee code path stores it the moment push is added and
over-declaring costs nothing.

-----

## 7. Target audience, content rating, and the kids question

**Console. Decide: target age groups.**

Google asks for target age groups separately from the content rating, and
the answer decides whether the much stricter **Families policy** applies.
Picking any group under 13 pulls the whole app into it: certified ad SDKs
only, extra data rules, and closer review of everything else.

**Decided: 13 and over** (the 13 to 15, 16 to 17 and 18+ groups).
Same reasoning as Apple 2.6: the app is for a congregation that includes
families, it is not directed at children, and the privacy policy already
says no accounts for under 13s. HomeKids is a page for parents, and the
store listing and screenshots should show it that way, because Google also
asks whether the app "could unintentionally appeal to children" and looks at
the listing to decide.

**Content rating (IARC questionnaire)**, the same answers as Apple's in
`SUBMISSION_KIT.md` section 6, in Google's wording:

- Category: "All Other App Types", or "Reference, News or Educational" if
  offered.
- Violence, sexuality, language, controlled substances, gambling: None.
- **Users can interact or exchange content: Yes.** Group rooms. Same reason
  as on Apple: answering No because the rest of the app is private would be
  a false answer.
- Shares the user's location: No. Digital purchases: No.
- Unrestricted internet: No, for the same reason as Apple (specific links
  handed to the browser).

Expected result: Everyone, or Teen because of user interaction. Take what
the questionnaire gives.

**User generated content.** Google's UGC policy asks for the same things
Apple 1.2 does: terms agreed before posting, report, block, moderation and a
contact for abuse reports. All built, `APP_STORE_COMPLIANCE.md` section 2.5.
Nothing Android specific.

-----

## 8. Push notifications on Android

**Build. Needs from Trey: a Firebase project.**

Android push goes through Firebase Cloud Messaging, not APNs. Three pieces:

1. **A Firebase project** for the church, made at
   `console.firebase.google.com` in a phone browser, with an Android app
   registered as `com.homechurchnola.app`. It produces a
   `google-services.json`, which goes in the build. That file is not a
   secret (it ships inside every APK), so it can be committed.
2. **The app registers as `android`.** `js/native.js` currently always says
   `p_platform: 'ios'`. It becomes the real platform. The database already
   accepts `android` (`device_tokens_platform_known`, migration 0010), so no
   migration.
3. **`send-push` learns FCM.** A second sender beside the APNs one, choosing
   by `platform`. It needs an FCM service account key as a new Edge Function
   secret. Deploying that function and setting the secret are live changes
   and get asked about first, per CLAUDE.md. Apple delivery does not change.

**Until all three are done, push stays off on Android. Done.** On Android,
registering for push without `google-services.json` crashes the app, so
`pushAvailable()` in `js/native.js` is checked before the plugin is touched
at all, and `ANDROID_PUSH` is the one line to flip when both halves ship. A first Android
release without push is acceptable; the Notifications screen says it is
coming rather than offering a switch that does nothing (Apple 2.1 and
Google's equivalent both reject dead controls).

-----

## 9. The rest of the App content page

**Console.** Short answers, each a form in Play Console:

| Form | Answer |
|---|---|
| Privacy policy URL | `https://pgrooves.github.io/home-church/legal/privacy.html` |
| Ads | **No ads** |
| App access | Some functionality is restricted. Reuse the two demo accounts and the script from `SUBMISSION_KIT.md` sections 1 and 7, which already exist because Apple needed them. |
| Content rating | Section 7 |
| Target audience | Section 7 |
| Data safety | Section 6 |
| Government app | No |
| Financial features | None. Coffee takes payment through Square for food; that is not a financial feature in Google's sense. |
| Health apps | No |
| News app | No |
| Exact alarm | Not asked, unless `USE_EXACT_ALARM` appears, which it must not |

-----

## 10. Store listing assets

| Asset | Requirement | Status |
|---|---|---|
| App name | 30 characters | `Home Church NOLA`, same as iOS |
| Short description | 80 characters | Build, written in the Play submission kit |
| Full description | 4000 characters | Build, adapted from the iOS one, still only naming what is switched on |
| App icon | 512 x 512, 32-bit PNG | `assets/icons/icon-512.png` exists; check it against Google's shape guidance, which masks icons differently from iOS |
| Adaptive launcher icon | Foreground and background layers | Build, generated from the same source as the iOS set |
| Feature graphic | 1024 x 500 | Build |
| Phone screenshots | 2 to 8, 9:16, rendered at phone size | Build, from the same plan as the iOS set |
| Category | Lifestyle | Same as iOS |
| Contact email | `hello@homechurchnola.com` | Same as the support page |

-----

## 11. How the Android build works

- **`android/` is committed**, unlike `ios/`. Nobody generates it on a
  laptop: the GitHub Action builds from whatever is in the repo, so the
  project has to be in the repo. The Capacitor template's own `.gitignore`
  keeps build output and the copied web app out.
- **`npm run android`** stamps, copies the web app into `www/`, and runs
  `npx cap sync android`. The Action runs it; so can anybody with the SDK.
- **The launcher icon** comes from `python3 scripts/make_icons.py --android`,
  which draws Android's adaptive icon from `assets/icons/mark.png` and
  touches nothing iOS or the web reads.
- **The launch screen** is plain paper, light and dark, the same as iOS, so
  the house in `js/splash.js` is the first thing anybody sees.
- **Every push** builds the bundle, checks permissions and alignment, then
  runs the debug build on an Android emulator and saves phone screenshots
  (`scripts/android_screens.js`), failing if Give or the push switches ever
  appear on Android.
- **The upload key** goes in four repository secrets, `HC_UPLOAD_KEYSTORE_BASE64`,
  `HC_UPLOAD_STORE_PASSWORD`, `HC_UPLOAD_KEY_ALIAS` and
  `HC_UPLOAD_KEY_PASSWORD`, when it is time for the first upload. Until then
  the bundle is unsigned and the runs are checks.

-----

## 12. Decisions, in one place

1. **Give on Android**: hidden until there is an IRS determination letter.
   Decided October 27. Section 3.
2. **Target age groups**: 13 and over. Decided October 27. Section 7.
3. **Push in the first Android release**: ships without, added in an
   update. Decided October 27. Section 8.
4. **Account**: stay personal, or add an organization account once a
   D-U-N-S number arrives. Section 0. Does not block anything.
