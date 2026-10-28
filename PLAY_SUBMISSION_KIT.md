# Google Play submission kit

Everything you type or upload in Play Console, in the order you will need it,
written to be done from a phone. The reasoning behind each answer is in
`PLAY_COMPLIANCE.md`; this file is the doing.

Paste-ready text is in grey boxes. Copy the whole box.

-----

## 0. Where things stand

| Step | Who | Status |
|---|---|---|
| Developer account paid (personal) | Trey | Done |
| Android device check | Trey | Done, October 27 |
| Identity documents | Google | Waiting, "a few days" |
| Contact phone number | Trey | After identity, one text code |
| Create the app | Trey | After both verifications |
| Upload key | Trey and Claude | Right before the first upload |
| Closed test, 12 testers, 14 days | Trey | After the first upload |
| Apply for production | Trey | After day 14 |
| Live on Google Play | Google | About a week after applying |

Play Console will not let you create the app until Google has verified your
identity and the phone number. Nothing below can be started before then
except section 7, recruiting testers.

-----

## 1. Create the app

Play Console, **Create app**.

| Field | Answer |
|---|---|
| App name | `Home Church NOLA` |
| Default language | English (United States) – en-US |
| App or game | App |
| Free or paid | **Free.** Permanent: a free app can never become paid |
| Developer Program Policies | Tick |
| US export laws | Tick |

-----

## 2. Store listing

**Grow users → Store presence → Main store listing.**

### App name, 30 characters

```
Home Church NOLA
```

### Short description, 80 characters

```
Sermons and small group guides from Home Church in Metairie, Louisiana.
```
(71)

### Full description, 4000 characters

Same rule as the App Store: **only what is switched on**, and on Android
**never Give** (`PLAY_COMPLIANCE.md` section 3). Headings are sentence case
rather than capitals, because Play's metadata policy is wary of capitals.

```
Home Church is a church in Metairie, Louisiana. This is our app.

This week's guide
Every Sunday message becomes a small group guide, published the same week. Six parts, always in the same order, so you know where you are: an overview, a fuller summary of where the message went, discussion questions for your group, self-reflection questions to take home, the lines worth repeating, and every passage referenced from the stage.

Check questions off as your group covers them. Write your own notes beside the reflection questions.

For people who lead groups
Ask the church to turn on Leader mode and every guide gains a presentation view: one question at a time, large type, readable across a living room without anybody hunching over a screen.

Your journal
Everything you have written down, from a guide or on your own, in one place. It is saved on your phone, and in your account if you sign in, so it follows you to a new one. Only you can see it.

It works with no signal
Guides, sermons, and your notes are saved on your phone. Church buildings and living rooms are not known for reception. The app opens to this week's material whether or not you have bars.

Everything else
Every message we have preached since November 2024, with the notes for each one. The songs from Sunday, and where to hear them again. Service times and directions. What is coming up, and a button to put it on your calendar. Serve teams and how to join one.

No ads and no tracking. Signing in is optional.

216 Giuffrias Ave, Metairie, LA 70001
Sundays at 8:00, 9:30, and 11:00
Stephen and Laura Daigle, lead pastors
```
(about 1,600)

When a switched-off page launches (Group, HomeKids, Practices, Alpha,
Coffee), add its paragraph here the same week, as on iOS.

### Graphics

All in `play/`, already the sizes Play asks for. Open the file in the GitHub
app or on github.com and save it to Photos, then pick it in Play Console.

| Slot | File | Size |
|---|---|---|
| App icon | `play/icon-512.png` | 512 x 512, 32-bit PNG |
| Feature graphic | `play/feature-graphic.png` | 1024 x 500, no alpha |
| Phone screenshots | `play/screenshots/1-…` to `6-…`, in order | 1080 x 1920 |

Skip the tablet and Chromebook screenshot slots. They are optional.

**Regenerate the screenshots the week you submit.** They show live content,
and on October 28 that included a sermon titled "(Working Title)" and a video
still loading. Ask Claude to rerun `node scripts/make_screenshots.js
--android`; it takes a minute. They are drawn as the Android app, so Give
never appears in them.

### Category and contact

**Grow users → Store presence → Store settings.**

| Field | Answer |
|---|---|
| App category | Lifestyle |
| Tags | Pick the closest to faith or religion that Play offers, and nothing else |
| Email | `hello@homechurchnola.com` |
| Phone | Leave empty. It would be public |
| Website | `https://www.homechurchnola.com` |

-----

## 3. App content

**Policy and programs → App content.** Each is a short form. Do them in this
order; target audience needs the first three done first.

### Privacy policy

```
https://pgrooves.github.io/home-church/legal/privacy.html
```

### Ads

**No, my app does not contain ads.**

### App access

**All or some functionality in my app is restricted**, then **Add
instructions**. Use the same two demo accounts as Apple (`SUBMISSION_KIT.md`
section 1); the passwords are the ones set there.

| Field | Answer |
|---|---|
| Name | `Group leader account` |
| Username | `homechurchappleader@outlook.com` |
| Password | the host password |

Any other information:

```
Type the email address and tap "Send me a code". For this address the app asks for a PASSWORD instead of a code; nothing is emailed. Almost everything works without signing in: tap "Continue as guest". Signing in shows the Journal saving to an account and, for this leader account, Leader mode: open the menu (round button, bottom right), then Guide, open any guide, and tap "Start presentation mode". A second, member account for testing Report and Block: homechurchappreview@outlook.com, password: ______. Group rooms, HomeKids, Practices, Alpha and Coffee are in the build but switched off for the whole church while they are released in phases; church staff turn each on from an admin screen. Contact: hello@homechurchnola.com
```

Fill the blank with the member password before saving.

### Content rating

Start the questionnaire. Email: `hello@homechurchnola.com`. Category: **All
Other App Types**.

| Question | Answer |
|---|---|
| Violence, blood, gore | No |
| Fear, horror | No |
| Sexuality, nudity | No |
| Language, crude humor | No |
| Controlled substances, alcohol, tobacco | No |
| Gambling, simulated gambling | No |
| Users can interact or exchange content | **Yes** |
| Shares the user's physical location with other users | No |
| Lets users buy digital goods | No |
| Hate symbols | No |
| Is a web browser or search engine | No |

The Yes is group rooms, and it is the honest answer even while Group is
switched off, because it is in the build. Take whatever rating comes back.

### Target audience and content

| Question | Answer |
|---|---|
| Target age groups | **13–15, 16–17, 18 and over.** Nothing younger |
| Could the store listing unintentionally appeal to children? | No |

Picking any group under 13 puts the whole app under Google's Families
policy. HomeKids is a page for parents, which is how the listing describes
the app.

### News app

**No.**

### Data safety

The long one. It takes about ten minutes.

**Data collection and security**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes |
| Account creation methods | **Username and other authentication** (an email address, then a one-time code) |
| Delete account URL | `https://pgrooves.github.io/home-church/legal/delete-account.html` |
| Can users request that some data is deleted without deleting the account? | Yes. Journal entries, group room posts and everything on the phone can each be deleted on their own |
| Independent security review | No |

**Data types.** Tick exactly these, and nothing else:

- Personal info: **Name, Email address, User IDs, Address, Phone number, Other info**
- Financial info: **Purchase history**
- App activity: **Other user-generated content**
- Device or other IDs: **Device or other IDs**

**For each one**, Play asks the same four questions:

| | Answer for every type |
|---|---|
| Collected or shared? | **Collected** only. Not shared |
| Processed ephemerally? | No |
| Required or optional? | **Optional**, except Email address and User IDs, which are **required** (needed to sign in) |
| Why collected? | **App functionality**, plus **Account management** for Name, Email address, User IDs and Phone number |

Never tick Analytics, Advertising or marketing, Personalization, or Fraud
prevention. None of them happens.

### Government apps, financial features, health

| Form | Answer |
|---|---|
| Government apps | No |
| Financial features | My app doesn't provide any financial features |
| Health apps | My app does not have any health features |

### Advertising ID

**No**, the app does not use an advertising ID.

-----

## 4. The upload key, once

The first bundle has to be signed with an upload key. Google holds the key
phones actually trust (Play App Signing); the upload key only proves an
upload came from us, and if it is ever lost Google can reset it.

When you get here, tell Claude. Claude will:

1. Make the key in this session, and put a file in the session's scratch
   folder holding it as text plus its password.
2. Walk you through four **repository secrets** on GitHub (github.com →
   the repo → Settings → Secrets and variables → Actions → New repository
   secret), pasted from that file: `HC_UPLOAD_KEYSTORE_BASE64`,
   `HC_UPLOAD_STORE_PASSWORD`, `HC_UPLOAD_KEY_ALIAS`, `HC_UPLOAD_KEY_PASSWORD`.
3. Ask you to save the same file somewhere private you will not lose, like
   a note in your password manager. **Never in the repository, which is
   public.**

From then on every build the GitHub Action makes is signed.

-----

## 5. The first upload, to a closed test

1. Get the bundle. github.com → the repo → **Actions** → the latest green
   **Android** run on `main` → **Artifacts** → `home-church-android-aab`.
   It downloads as a zip; tap it in Files to unzip. Inside is
   `home-church-1.1-build-N.aab`.
2. Play Console → **Test and release → Testing → Closed testing** →
   **Create track** (or use the one already there) → **Manage track**.
3. **Countries/regions**: United States.
4. **Testers**: **Create email list**, name it `Home Church testers`, and
   paste the testers' Gmail addresses, one per line. Feedback channel:
   `hello@homechurchnola.com`.
5. **Create new release.** Accept **Play App Signing** if asked (the
   default, a Google-generated key). Upload the `.aab`.
6. Release name: `1.1 (build N)`, with N from the file name. Release notes:

```
<en-US>
The first test of Home Church on Android. Open it a few times a week, read this week's guide, and tell us anything that looks wrong or confusing: hello@homechurchnola.com
</en-US>
```

7. **Review release → Start rollout to Closed testing.** Google reviews it,
   usually within a day or two.
8. When it is approved, the track shows a **join link**. Send that to your
   testers with the message in section 7. The 14 days count from when each
   person opts in, so get all of them in on the same day if you can.

-----

## 6. Apply for production, after day 14

**Dashboard → Apply for production** appears once 12 or more testers have
been opted in for 14 days in a row. Google asks roughly these questions.
Drafts below; replace the blanks with what really happened, because Google
compares the answers with what it saw.

**How did you recruit testers?**

```
Members of our church and their families who use Android phones. We asked them in person and by text, and sent each the opt-in link.
```

**How easy was it to recruit testers?**

```
Fairly hard. Most of our congregation uses iPhones, and the app has been on the App Store since 2026. We recruited ___ Android users from the church and from members' families.
```

**Describe the engagement you received from testers.**

```
Testers used the app through ___ Sundays: reading the week's small group guide, listening to sermons, checking the calendar, and using it with no signal in our building. ___ testers sent feedback.
```

**Summarize the feedback, and how you collected it.**

```
By email to hello@homechurchnola.com and in person after services. ___ (what they said).
```

**What changes did you make based on the test?**

```
___ (each change, in a sentence). The Android build runs the same code as our iPhone app, so fixes reached both.
```

**Who is the intended audience?**

```
The congregation of Home Church in Metairie, Louisiana, and anyone in the New Orleans area looking for a church, 13 and over.
```

**How does your app provide value?**

```
Each week's sermon becomes a small group guide the same week, with discussion questions, reflection questions and every passage referenced. Group leaders present it in large type in a living room. Everything is saved for use with no signal. It is free, with no ads or tracking.
```

**Expected installs in the first year:** the lowest band offered (under
1,000 is realistic for one church).

**How did you decide it is ready?**

```
It is the same app our iPhone users have had on the App Store since 2026, and the closed test confirmed it works the same on Android.
```

-----

## 7. Recruiting testers, now

You can start this today. You need **14 or 15 people** with an Android
phone, so one dropping out does not reset the clock. They do not have to be
members; family, friends and coworkers anywhere in the country count.

Collect each person's **Gmail address** (the Google account on their
Android phone). That goes into section 5 step 4.

Text to send them once the join link exists:

```
Thanks for helping test the Home Church app on Android! Two minutes:

1. Open this link on your Android phone and tap "Become a tester": [JOIN LINK]
2. Tap the link to Google Play on that page and install Home Church.
3. Keep it installed for the next 2 weeks, and open it every few days. Read the guide, play a sermon, look around.
4. Anything weird or confusing, text me or email hello@homechurchnola.com. Even "the font is small" helps.

Please don't leave the test until I say we're done. Google counts days in a row.
```

-----

## 8. Every update after launch

1. The change lands on `main` (with your yes, as always).
2. The Android action builds a signed bundle, its build number one higher.
3. Download it as in section 5 step 1.
4. Play Console → **Production → Create new release** → upload → notes →
   **Start rollout**. Google reviews updates in hours to a couple of days.

iOS is unchanged by any of this. A change to the app reaches iPhones through
TestFlight and Android through this, separately.

-----

## 9. Later, when you are ready

### Push notifications on Android

Needs a free Firebase project. From a phone browser:

1. `console.firebase.google.com` → **Create a project**, name it
   `Home Church`. **Turn Google Analytics off** when asked; on, it would add
   a line to the Data safety form.
2. **Add app → Android.** Package name, exactly:
   `com.homechurchnola.app`. Nickname: `Home Church Android`. Skip the SHA
   certificate.
3. **Download `google-services.json`** and send it to Claude in a chat. It
   is not a secret; it ships inside the app.
4. **Project settings → Service accounts → Generate new private key.** This
   one **is** a secret. Do not send it in chat or commit it; Claude will
   walk you through pasting it into Supabase as an Edge Function secret.

Claude then adds the Firebase sender to `send-push`, flips `ANDROID_PUSH` in
`js/native.js`, and adds Google to the privacy policy's list of services.
Deploying `send-push` and setting the secret are live changes and get asked
about first.

### Give on Android

Needs an IRS determination letter for the church. When it exists,
`offersGiving()` in `js/native.js` becomes `true` everywhere, the listing
gains its giving sentence back, and the letter goes to Google if asked.

### An organization account

Once the church has a D-U-N-S number, an organization account ($25) belongs
to the church instead of a person and shows the church's name on the
listing. The app moves across with Play Console's **app transfer**, keeping
its reviews and installs.
