---
description: Get a new version ready for the App Store and Google Play. Says what changed since the last build, picks the version and build numbers, writes the What's New, hands over the laptop command, sends the Android file, and walks through both stores step by step.
---

# /new-build

Trey types `/new-build` when `main` holds what should go to the stores next.
This command does everything that can be done here and hands Trey only the
parts that need their laptop or their phone: one command for the laptop, a
few clicks in Xcode, then App Store Connect and Play Console, from the phone.

$ARGUMENTS

It follows the release path in `CLAUDE.md` ("Releasing a new version") and
does not replace it. Everything there still holds: the checks before
TestFlight, the yes before anything touches `main`, and the handoff block.

**Write every word Trey reads in plain language.** No "artifact", "commit",
"versionCode", "track" or "merge" without saying what it means in the same
sentence, or better, without the word at all. Short paragraphs, nothing
wider than a phone. Trey follows the reply with one hand while the other
holds the laptop or the phone, so every step is one action, and it names
the exact button.

---

## The two numbers, and why there are two

| | Who sees it | Rule |
|---|---|---|
| **Version**, like `1.2` | Everybody, in the App Store and Play | Goes up by one (`1.2` → `1.3`) for each new App Store release. Apple refuses new uploads under a version that is already live |
| **Build**, like `16` | Only Apple, Google and Trey | iPhone: goes up by one on **every** upload, and never starts over. Android: the Android run number, set by itself |

The version is the same on both stores. It lives in
`android/app/build.gradle` (`versionName`), and Trey types the same number
into Xcode. The iPhone build number lives only in Xcode on the laptop and in
`RELEASES.md`, which is why that file exists.

---

## First, before anything else: connect the database

Trey asked for this to be the very first thing, every run. Make one
read-only Supabase call, so the permission prompt for the database comes up
on Trey's phone straight away rather than halfway through:

- `mcp__Supabase__list_projects` (load it with `ToolSearch` first if it is
  deferred). The live project is **Home Church App**,
  `ibqkumxfltfiuqevviji`.

Do it even when the Supabase server says it is still connecting or failed
to connect: try the call, and if it fails, say so in one line and carry on.
Step 3's switch check reads through it, and says it was skipped if it is
still down then.

## Step 0. Where the last build got to

Fetch first, so everything below is about what is really on GitHub:

```bash
git fetch origin main
```

Read `RELEASES.md` on `origin/main`. Each row is one build that was handed
to Trey: its date, version, iPhone build number, status and What's New.
**The commit that added a row is the code that build was made from.** Find
it with:

```bash
git log origin/main -1 --format='%H %ad' --date=short -S'| <date> | <version> | <build> |' -- RELEASES.md
```

(The date is part of the search because a "Never uploaded" row is replaced
with a new date and the same numbers. Changing a row's Status alone does
not move it.)

### Ask Trey first, every time

Before any other work, ask Trey for the build number, even when
`RELEASES.md` has it. Trey's number is the one Xcode will count up from, so
it wins. One chat message, answered in a few words:

> Before I start, two quick things:
>
> 1. **What's the build number of your last upload?** App Store Connect
>    (in Safari, `appstoreconnect.apple.com`) → **Apps** → **Home Church**
>    → **TestFlight** lists every build, newest first. My list says
>    **1.2 (15)**.
> 2. **Where did it end up?** Live on the App Store, or uploaded but not
>    released yet (TestFlight only, waiting for review, or rejected).
>
> A reply like "15, live" is all I need.

Leave out "My list says" when `RELEASES.md` has no rows yet. Then also ask
for the version and the date it was uploaded (the same TestFlight list
shows both), because there is nothing else to go on.

**The next iPhone build is Trey's number plus one.** Every number Trey is
told to type, in Xcode and in App Store Connect, comes from that.

**If Trey's number is lower than the newest row in `RELEASES.md`**, that
row never got uploaded: it is the "Never uploaded" case in Step 2.

**If Trey's number is higher**, use Trey's, and say so in a sentence ("My list said 15, you said 17; going with 17, so this
one is 18"). A higher number usually means a build was uploaded without
`/new-build`. Then the newest row is not where "since the last build"
starts: ask for that upload's date (the TestFlight list shows it) and use
the last commit on `origin/main` before it, as below.

The second answer goes into the Status column of the row for that build
in Step 5 (`Live` or `TestFlight only`).

### Finding the starting commit from a date

The first time, or when a build was uploaded outside this command, use the
last commit on `origin/main` before the upload date:

```bash
git log origin/main -1 --format='%H %ad %s' --date=short --before='<date> 23:59'
```

Say the date and commit message back to Trey in a sentence, so a wrong
guess shows.

---

## Step 1. What changed since the last build

There are two starting points, and both are commits found in Step 0:

- **Since the last upload**: the newest row that reached App Store Connect
  (status `Live` or `TestFlight only`). This tells Trey what to try in
  TestFlight.
- **Since the last version that went live**: the newest `Live` row. This is
  what the public What's New and the review notes cover, because App Store
  readers skipped every build in between.

```bash
git log --no-merges --format='%h %ad %s' --date=short <start>..origin/main
git diff --stat <start> origin/main -- index.html js css assets data embed.html \
  ios-config capacitor.config.json package.json package-lock.json android \
  scripts/sync_web.js scripts/stamp_assets.js scripts/ios_plist.js scripts/ios_splash.js
```

Read the commit messages **and the diffs** of anything in that path list.
The messages here are good, but what a member sees is in the code.

Sort every change into one of these, and drop anything that fits none:

| Group | What goes in it |
|---|---|
| **People will notice** | Something a member sees or does differently, on a page that is switched on |
| **Behind a switch** | A page or feature that ships switched off (`cafe_on`, `group_mode_on`, `homekids_on`, `practices_on`, `alpha_on`). Named in the review notes only, never in public |
| **Fixes** | Something that was broken and now is not |
| **Under the hood** | Speed, safety, tests, cleanup. One line for the whole group |
| **Android only** | Behind `HC.native.isAndroid()`. Goes in the Play notes, never Apple's |
| **Already live, not in this build** | `supabase/` (database, Edge Functions) and `app_settings` switches. They reached every phone when they were applied. Mention only if Trey might think they wait for the build |

Docs, demo files, tests and `.claude/` are none of these.

**Nothing in the "ships in the app" paths since the last upload?** Then a
new build would be the same app with a new number. Say so, and ask whether
Trey still wants one before doing anything else.

---

## Step 2. Pick the numbers

Step 0 gave Trey's last build number and where it ended up. From there:

| The last build is | Next version | Next iPhone build |
|---|---|---|
| Live on the App Store | Up by one: `1.2` → `1.3` | Trey's number + 1 |
| Uploaded, not released | **The same** version | Trey's number + 1 |
| Never uploaded (the newest row is above Trey's number) | That row's version | Trey's number + 1, the number it would have had. Replace its row in Step 5 rather than adding one |

Versions go `1.2`, `1.3` … `1.9`, `1.10`. Never `2.0` unless Trey asks for
it.

**If the last build is waiting for review**, Apple will not take a second
build for the same version until that one is pulled back. Tell Trey: App
Store Connect → the version → **Remove from review** (near the top), then
carry on. If it is already **approved** and not yet released, it counts as
live: ask whether to release it first or skip it.

Check the version against `android/app/build.gradle`. If it differs, the
file changes in Step 5.

---

## Step 3. The checks

These come from `CLAUDE.md`, "When Trey is ready to make a TestFlight
build". Run them on `origin/main`. Report each one in a word, and stop on
any failure: fix it on a branch first, as usual.

1. **Tests.** `npm ci` if `node_modules` is missing, then `npm test`. If
   only the database part cannot run here (it needs Postgres), run
   `npm run test:js` and say which part was skipped.
2. **Android build on `main` is green.** List the **Android** runs on
   `main` (`mcp__github__actions_list`, `list_workflow_runs`,
   `android.yml`). The newest one must have passed. A red one blocks the
   release: Google gets its file from that run.
3. **The switched-off list is right.** Read the live switches, read-only:

   ```bash
   python3 scripts/hc_supabase.py select app_settings --columns key,value_text,value_bool --limit 100
   ```

   Every page that is off must be in "PAGES IN THIS BUILD THAT ARE SWITCHED
   OFF" in `SUBMISSION_KIT.md` section 7, and nothing that is on may be.
   Apple calls code it was never shown a hidden feature (Guideline 2.3.1),
   and that is a rejection. If the transport is down, say the check was
   skipped and why.
4. **New plugins.** Did `package.json` gain a dependency since the last
   upload? The laptop command's `npm install` picks it up, and
   `npm run preflight` proves it. If the plugin asks for a permission,
   `ios-config/info-plist-keys.json` needs its purpose string (preflight
   catches a missing one) and the Android permission list needs it too
   (the Android run catches that).
5. **New personal data.** Does anything since the last live version store
   something new about a person (a new table with a user id, a new form, a
   new plugin that reads contacts, location, photos)? Then Apple's App
   Privacy answers (`SUBMISSION_KIT.md` section 5) and Google's Data safety
   form (`PLAY_SUBMISSION_KIT.md` section 3) need the same change. Write
   out exactly what to change in each, and do it before submitting.

---

## Step 4. What's New, and the private notes for Apple's reviewer

### The public line

**Default, every time it holds:**

```
Bug fixes and improvements.
```

Apple's Guideline 2.3.12 allows that line for fixes, security updates and
speed. A **significant change people can see** is meant to be named.
Reviewers rarely reject over this, but naming it costs one sentence and
removes the risk. So:

- **Only fixes and under-the-hood work** since the last live version: the
  default line, as is.
- **Something in "People will notice"** that a member would describe to a
  friend (a new page that is switched on, a new button on Home, a new kind
  of notification): the default line, then one short sentence per change,
  at most three, plain words, no exclamation marks:

  ```
  Bug fixes and improvements.

  New: turn on notifications for new sermon audio from Your account.
  ```

- **Never name a switched-off page** in public, and never something
  Android-only in Apple's text, or iPhone-only in Google's.

Use the same text for Google Play, inside the language tags, 500
characters at most:

```
<en-US>
Bug fixes and improvements.
</en-US>
```

Tell Trey which one it is and why in one sentence. If it is more than the
default, say what made it more.

### Apple's Notes for Review (private, only the reviewer reads it)

This matters more for approval than the public line. It sits in
`SUBMISSION_KIT.md` section 7 and needs changing only when, since the last
live version:

- a page went on or off, or a new page ships switched off (the list),
- sign-in changed, or a demo account stopped working,
- something new lets people post or message each other (Guideline 1.2:
  report, block, filtering),
- something new takes money or links out to pay,
- account deletion moved.

If none of those happened, say "the review notes stay as they are", and
Trey does not touch that box. If one did, update section 7 on the branch in
Step 5 and give Trey the whole new text to paste, not the difference. A page
newly switched off also needs a short screen recording from a TestFlight
build with its switch on (section 7 says why); tell Trey which page.

---

## Step 5. The one change to `main`

Every build adds a row to `RELEASES.md`, and a new version also changes
`versionName` in `android/app/build.gradle`. Make both on a branch, from
fresh `origin/main`:

```bash
git checkout -B claude/build-<version>-<build> origin/main
```

- `RELEASES.md`: set the Status of the previous row (Step 0), and add the
  new row at the top of the table (or replace the "Never uploaded" one).
- `android/app/build.gradle`: `versionName "<version>"`, only if it
  changed.
- `SUBMISSION_KIT.md`: only if Step 4 changed the review notes, or Step 3
  found the privacy answers out of date.

Run `npm test` again, then ask Trey, as `CLAUDE.md` requires, in plain words:

> **Ready to put build 1.3 (16) on main?**
> - **What changes:** the build list gets a new line, and the Android
>   version label goes to 1.3. No app code changes.
> - **Who sees it:** nobody. The web version republishes looking the same.
>   GitHub makes a new Android file, labelled 1.3.
> - **Installed copies:** unaffected, every version.
> - **Undo:** I put the old lines back, about two minutes.

Mention the timing if it is Sunday morning or a group night. After the yes,
push it as a fast-forward, so the build list's commit is exactly what
`main` is:

```bash
git push origin HEAD:main
```

If `main` moved in the meantime, rebase the branch on it and push again;
never force.

**The commit that adds the row is the code this build is made from.** The
laptop command in Step 7 pulls exactly that.

---

## Step 6. The Android file

Changing `build.gradle` starts an Android run on `main` by itself. If
nothing in the Android workflow's path list changed (the version stayed the
same), start one: `mcp__github__actions_run_trigger`, `run_workflow`,
`android.yml`, ref `main`. That only builds a file; nothing goes anywhere.

Wait for it, about eight minutes, then check:

1. **It passed**, both jobs (`build` and `screens`). If not, read the log
   (`mcp__github__get_job_logs`, `failed_only`), fix it on a branch, and
   tell Trey the Android half waits. The iPhone half can still go ahead.
2. **It ran on the build list's commit** (`head_sha`), or on a later one
   with nothing app-related in between.
3. **Get the file.** `list_workflow_run_artifacts` on that run,
   `home-church-android-aab`, then `download_workflow_run_artifact` and
   download the link it returns (it expires within minutes, so use it
   straight away):

   ```bash
   D=<scratchpad>/build-<version>-<build>
   rm -rf "$D" && mkdir -p "$D/aab"
   curl -sS -o "$D/aab.zip" '<download_url>'
   unzip -o -q "$D/aab.zip" -d "$D/aab" && ls -la "$D/aab"
   keytool -printcert -jarfile "$D"/aab/*.aab | grep -m1 SHA256
   ```

4. **Check it.** The name says the right version
   (`home-church-1.3-build-N.aab`), and the SHA256 is the church's upload
   key, `4C:45:A3:6C:…:40:37:83` (the whole value is in
   `PLAY_SUBMISSION_KIT.md` section 4). Any other key, or no signature, and
   Google will refuse it: stop and say so.
5. **Send it** with `SendUserFile`, `display: attach`, and the caption
   "Android 1.3, build N. Save to Files, then upload in Play Console."

**If the download is blocked** (the network needs
`*.blob.core.windows.net` and `results-receiver.actions.githubusercontent.com`
allowed), give Trey the direct link instead, which needs them signed in to
GitHub in Safari:
`https://github.com/pgrooves/home-church/actions/runs/<run id>/artifacts/<artifact id>`.
It downloads a zip; tapping it in Files opens it.

Android's build number is that run's number, and it is the `N` in the file
name.

---

## Step 7. The reply to Trey

One message, in this order, each part with its heading, so Trey can come
back to it at each stage. Fill in every number and every text box. Nothing
left for Trey to work out.

### 1. What's in this build

Three to six short lines from Step 1, grouped "You'll notice", "Fixed",
"Behind the scenes". Then one line: **Version 1.3, iPhone build 16, Android
build N.**

### 2. On the laptop

The confirmation and command from `CLAUDE.md`, "The TestFlight handoff,
every time", copied exactly from there so the two never differ. Then, in
Xcode:

1. Click **App** in the left column, then the **General** tab. Set
   **Version** to `1.3` and **Build** to `16`. (Say "Version stays 1.3" when
   it does not change.)
2. At the top, set the device to **Any iOS Device (arm64)**.
3. Menu bar: **Product → Archive**. A few minutes.
4. In the window that opens: **Distribute App → App Store Connect →
   Upload**. Click through with the defaults.

If the command stops before Xcode opens, send a screenshot of the last
lines.

### 3. Try it on your iPhone (TestFlight)

1. Wait for Apple's email saying the build is ready. Ten minutes to an
   hour.
2. Open the **TestFlight** app → **Home Church** → **Update** (or
   **Install**).
3. Try these: one line per item in "You'll notice" and "Fixed", saying
   where to tap to see it.

If something is wrong, tell me what you saw. Don't submit; we fix it and
make the next build.

### 4. Send it to the App Store, once it works

From the phone, in **Safari**, not the App Store Connect app (the app
cannot make a new version):

1. Go to `appstoreconnect.apple.com` → **Apps** → **Home Church**.
2. Next to **iOS App**, tap the blue **+**, type `1.3`, tap **Create**.
   (Same version as last time: skip this, open the version that is already
   there, and in **Build** remove the old build with the minus.)
3. **What's New in This Version**: paste

   ```
   Bug fixes and improvements.
   ```

4. Scroll to **Build** → **Add Build** → pick **16** → **Done**.
5. **App Review Information → Notes**: leave it, or paste the new text
   below (Step 4 says which).
6. **Version Release**: **Automatically release this version**. If Apple's
   answer could land on a Sunday morning, pick **Manually release** and tap
   **Release This Version** when it suits.
7. **Save** at the top, then **Add for Review**, then **Submit to App
   Review**.

Screenshots, description and everything else carry over by themselves.
Apple usually answers within a day, by email. Tell me if they write back
with anything but approval.

### 5. Google Play

1. Save the file I sent (`home-church-1.3-build-N.aab`) to **Files**.
2. In Safari or Chrome, go to `play.google.com/console` → **Home Church
   NOLA**. (Use the website, not the Play Console app, which cannot upload.
   If the page is cramped, **aA → Request Desktop Website**.)
3. Left menu: **Test and release**, then the place the Android app is
   now, from `PLAY_SUBMISSION_KIT.md` section 0:
   - while it is still in testing: **Testing → Closed testing** → the
     track → **Create new release**. A new release does not restart the
     testers' 14 days.
   - once it is public: **Production → Create new release**.
4. **Upload** → **Files** → the `.aab`. Wait for the tick.
5. **Release name**: leave what Play fills in.
6. **Release notes**: paste

   ```
   <en-US>
   Bug fixes and improvements.
   </en-US>
   ```

7. **Next**, then **Save and publish**. If Play shows **Send changes for
   review** on the **Publishing overview** page instead, tap that.

Google usually reviews it within a few hours to two days, then phones
update by themselves.

### 6. Where we are

One line: "Step 3 of the release path: TestFlight, on your laptop", and
what comes next. End with any check from Step 3 that was skipped, and why.

---

## What not to do

- **Do not push to `main` before the yes in Step 5**, and do not count an
  earlier yes, even from this session, as covering this build.
- **Do not upload anything to Apple or Google from here.** Trey does that.
  This command makes the file, the numbers and the words.
- **Do not reuse an iPhone build number** that reached App Store Connect,
  even one that was rejected. Apple refuses it.
- **Do not name a switched-off page** in What's New, in the Play notes, or
  in screenshots.
- **Do not change the version for a rebuild** of a version that is not live
  yet. Same version, next build.
- **Do not edit `RELEASES.md` outside this command.** Its commits are how
  the next run knows where the last build started.
- **Do not send a red Android run's file**, or one signed with any key but
  the church's.
