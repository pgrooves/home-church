# Xcode, step by step

Written for somebody who has Xcode installed and has never shipped an app.
Every step says where to click, not just what to do. If a step does not match
what you see, stop and read the troubleshooting section at the bottom rather
than guessing, because guessing in Xcode signing is how an afternoon
disappears.

**Do this on the day you are ready to launch, not before.** Steps 1 to 6 work
without an Apple Developer account and are worth doing early as a rehearsal.
Step 7 onward needs the paid account.

-----

## Before you start

- **A Mac running Xcode 26 or newer.** Capacitor 8.5 requires it. Xcode menu,
  About Xcode, to check.
- **Node installed.** In Terminal, `node --version`. Anything 18 or newer.
- **The repo cloned** somewhere you can find it.
- **An Apple Developer account** ($99/year), for steps 7 onward only.

-----

## 1. Get the code and its dependencies

Open **Terminal**. Move into the project folder and pull the latest:

```bash
cd ~/path/to/home-church
git checkout main
git pull
npm install
```

`npm install` takes a minute or two and downloads Capacitor. It will create a
`node_modules` folder, which is expected and is gitignored.

-----

## 2. Create the iOS project

**Only ever run this once.** It generates the `ios/` folder.

```bash
npx cap add ios
```

If it asks to install `@capacitor/cli`, say yes.

You now have an `ios/` folder. It is gitignored on purpose: it is generated,
and anything hand written that belongs in it lives in `ios-config/` instead.

-----

## 3. Build the web assets and open Xcode

```bash
npm run ios:open
```

That one command does four things: stamps the cache busting numbers, copies
the app's files into `www/`, runs `npx cap sync ios`, and opens Xcode.

**From now on, any time you change the app's code, run `npm run ios` before
building in Xcode.** Xcode does not see your edits until that copy happens.
This is the single most common way to spend twenty minutes wondering why a
fix did not take.

Xcode will open on a project called **App**. Give it a moment to finish
indexing, the progress bar is in the top middle.

-----

## 4. Find your way around

Three things to know, and then the rest is a settings form.

- **The left panel** is the Project Navigator, a file tree. If you do not see
  it, press **Cmd+1**.
- **At the very top of that tree** is a blue icon labelled **App**. Click it.
  The main area becomes the project settings.
- **In the settings, there is a second narrow column** listing TARGETS with
  **App** under it. Click that **App**. Now you see tabs across the top:
  General, Signing & Capabilities, Resource Tags, Info, Build Settings.

Everything in the next three steps happens in those tabs.

-----

## 5. General tab

Click **General**.

- **Display Name**: `Home Church`
- **Bundle Identifier**: `com.homechurchnola.app`
  This must never change once the app is on the store. It is the app's
  permanent identity to Apple.
- **Version**: `1.0.0`
  This is what people see on the store.
- **Build**: `1`
  Increment this every time you upload, even for the same version. Apple
  rejects a duplicate build number, which is a confusing error the first time.
- **Minimum Deployments**: set to **iOS 15.0**
- **Supported Destinations**: this is a small list. **Remove iPad** if it is
  there, using the minus button. Leave iPhone.

  Why: the layout is a centered column capped at 720 points wide, which on a
  13 inch iPad is a narrow strip in a sea of empty paper. That reads as an
  unadapted phone app and is its own rejection risk. iPhone only is the honest
  claim, and it also means you do not have to supply iPad screenshots.

- **Also remove Mac** ("Designed for iPad") if it appears.

-----

## 6. The app icon

First generate the icons, in Terminal:

```bash
npm run icons
```

That writes a folder called `ios-icons/`, every file flattened with no alpha
channel. **Apple rejects app icons that contain an alpha channel**, which is
why this is a script and not something done by hand.

Now in Xcode:

1. In the left panel, open **App**, then **Assets.xcassets**.
2. Click **AppIcon**.
3. You will see one large empty square labelled something like **App Store**
   or **1024pt**. Modern Xcode wants a single 1024 image and generates the
   rest.
4. In Finder, open the `ios-icons` folder in your project.
5. **Drag `icon-1024.png` onto that empty square.**

If your version of Xcode shows many empty squares instead of one, drag the
matching file into each by size. The filenames say which is which.

-----

## 7. Signing

**This is where the Apple Developer account is needed.** Everything above
works without one.

Click the **Signing & Capabilities** tab.

1. Tick **Automatically manage signing**.
2. **Team**: choose your team from the dropdown. If it is empty, you are not
   signed in: Xcode menu, **Settings**, **Accounts**, **+**, Apple ID, sign
   in. Then come back.
3. Xcode will churn for a few seconds and create a provisioning profile by
   itself. When it settles, the red errors should be gone.

If you see **"Failed to register bundle identifier"**, it usually means that
identifier is already taken by another account. See troubleshooting.

-----

## 8. Push notifications capability

Still on **Signing & Capabilities**:

1. Click **+ Capability**, top left of that tab.
2. Type `push` and double click **Push Notifications**.

**Now check that it actually took, because this step can lie to you.** Adding
the capability is supposed to create a file called `App.entitlements`, and it
does not always do it. The capability sits there in the list looking correct
while the file was never written or never linked, and there is no warning
anywhere.

That distinction is invisible from inside the app and it is the difference
between push working and push doing nothing. Without the `aps-environment`
key that file carries, iOS does not refuse the registration and does not
report an error. It just never answers. Permission reads granted, the app
asks for a token, and no token ever comes. Everything looks fine.

So look for it. In the Project Navigator (Cmd+1), inside the **App** folder,
there should now be **App.entitlements**.

**If it is not there**, install the copy this repo keeps. In Terminal:

```bash
cp ios-config/App.entitlements ios/App/App/
```

Then in Xcode:

1. Drag `App.entitlements` from Finder into the **App** folder in the
   Project Navigator, ticking **Copy items if needed** and the **App** target.
2. Go to **Build Settings**, search for `entitlements`, and set
   **Code Signing Entitlements** to `App/App.entitlements`.
3. Build and run again.

`npm run preflight` checks that `ios-config/App.entitlements` still exists and
still says `development`, so the repo half cannot go missing quietly. It
cannot see inside `ios/`, which is generated and gitignored, so the copy above
is yours to keep true.

## 8b. Teach AppDelegate to hand the token over

**Do not skip this. Everything above can be perfect and push will still do
nothing without it**, which is exactly what happened on the first build of
this app.

Capacitor never talks to Apple's push service directly. iOS delivers the
device token to `AppDelegate`, and the push plugin sits waiting for a message
that only two AppDelegate methods send. The plugin's own README says to add
them, and `npx cap add ios` does not, so every new project starts without
them.

With them missing there is no error anywhere. iOS registers, hands over the
token, and the app drops it one layer below any JavaScript. Permission reads
granted, `register()` succeeds, no listener fires, nothing is logged, and
`device_tokens` stays empty forever.

In Xcode, open **AppDelegate.swift** in the App folder. Find the last `}` in
the file, and paste these two methods just **above** it, so they sit inside
`class AppDelegate`:

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}

func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

The same text is in `ios-config/AppDelegate-push.swift` if you would rather
copy it from a file. `npm run preflight` checks `AppDelegate.swift` for both
methods whenever `ios/` exists on the machine, so this cannot go missing again
without something saying so.

## 8c. Event reminders, which need none of the above

The **Get notified** button on the Cal tab uses `@capacitor/local-notifications`,
and it is worth knowing what it does *not* need: no capability in Xcode, no
entitlement, no key from Apple, and no server. A local notification is
scheduled by the app and delivered by the phone to itself, so nothing in this
section touches APNs.

What it does need is the plugin being in the build, which is `npm install`
followed by `npm run ios` (that runs `npx cap sync ios`, which installs the
pod). If the plugin is missing, nothing breaks and nothing is logged: the app
asks `HC.native.canRemind()` while drawing an event, gets false, and simply
does not draw the button — the same answer a browser gets. So **a build where
Get notified never appears on the Cal tab is a build where the pod did not
install**, not a bug in the screen.

The permission is iOS's one notification permission, the same one push asks
for. A phone that has already said yes to the church's notifications is not
asked again; a phone that said no is asked once more the first time somebody
sets a reminder, which is right, because that is a different question.

-----

That is the Xcode half. The other half is in Apple's developer portal, and you
only ever do it once:

1. Go to [developer.apple.com/account](https://developer.apple.com/account),
   then **Certificates, Identifiers & Profiles**, then **Keys**.
2. Click **+**, name it something like `Home Church APNs`, tick **Apple Push
   Notifications service (APNs)**, then Continue and Register.
3. **Download the `.p8` file. You get exactly one chance.** Apple will not let
   you download it again. Put it somewhere safe and backed up.
4. Note the **Key ID** shown on that page, and your **Team ID**, which is in
   the top right of the developer portal.

You need the `.p8`, the Key ID, and the Team ID later to actually send
notifications. Nothing in the app needs them: they go into Supabase, on the
`send-push` Edge Function, and the full runbook is in `LAUNCH_TODO.md` under
"Push notifications".

**One thing to know before you test on your own phone.** The build Xcode puts
on a device plugged into your Mac is a *development* build, and the push token
it registers is only valid against Apple's **sandbox** gateway. TestFlight and
the App Store are **production**. The sender defaults to production, so while
you are testing from Xcode you have to set the `APNS_HOST` secret to
`api.sandbox.push.apple.com` and then remove it before you submit.

If you skip this, the send fails with `BadDeviceToken` and looks precisely
like a bug in the app. It is not. It is the gateway.

-----

## 9. The privacy manifest

Apple requires a privacy manifest, and Capacitor's own is empty, so the app
supplies its own.

In Terminal:

```bash
cp ios-config/PrivacyInfo.xcprivacy ios/App/App/
```

Then in Xcode, so the file is actually included in the build:

1. In the left panel, find the **App** folder (inside the outer App project).
2. Right click it, choose **Add Files to "App"...**
3. Select `PrivacyInfo.xcprivacy` from `ios/App/App/`.
4. **Before clicking Add**, check the box next to **App** under "Add to
   targets". This is the step people miss, and if it is unticked the file
   ships nowhere and Apple emails you a warning after upload.

-----

## 10. Export compliance

This saves you answering the same question on every single upload forever.

1. Click the **Info** tab.
2. Hover over any row, click the small **+** that appears.
3. Type `ITSAppUsesNonExemptEncryption` as the key.
4. Set the **Type** to **Boolean** and the **Value** to **NO**.

The app only makes ordinary HTTPS requests, which are exempt.

-----

## 11. Run it

**On the simulator first.** At the top of the Xcode window, next to the App
name, is a device dropdown. Pick any iPhone. Press **Cmd+R**.

The app should launch. Tap around. If it comes up blank, you probably skipped
`npm run ios`.

**Then on your own iPhone**, which matters more than it sounds. Plug it in,
pick it in that same dropdown, press Cmd+R. The first time, your phone will
ask you to trust the developer: **Settings, General, VPN & Device Management**,
tap your certificate, Trust.

**Check these on the real device, because the simulator lies about all of
them:**

- Cold start with the phone in **airplane mode**. The app should open to full
  content, not an error. This is the offline behavior and it is a selling
  point.
- The **back swipe** from the left edge, in the guide reader.
- The **Give** button. It should open a browser sheet with a Done button, not
  a page inside the app.
- **Share** a quote from any guide, from the one-liners section.
- **Add to calendar** on an event in Connect.
- **Download guide**, which should open the iOS share sheet.
- Turn a **notification switch** on in Your account. iOS should ask
  permission.

-----

## 12. Upload to App Store Connect

Only when everything above works on a real phone.

1. In the device dropdown, choose **Any iOS Device (arm64)**. You cannot
   archive while a simulator is selected, and the Archive menu item stays
   greyed out, which is confusing.
2. Menu bar: **Product**, then **Archive**. This takes a few minutes.
3. The **Organizer** window opens when it finishes. Your archive is listed.
4. Click **Distribute App**, then **App Store Connect**, then **Upload**.
5. Accept the defaults, click through, and wait.

The build takes ten to sixty minutes to appear in App Store Connect. You will
get an email when it is processed, and often a second email listing warnings.
Read those: they are where a missing privacy manifest entry shows up.

Then fill in the store listing from `SUBMISSION_KIT.md`, attach the build, and
submit.

-----

## Troubleshooting

**The app is blank, or my change did not appear.**
You skipped `npm run ios`. Xcode builds from `www/`, not from your source
files. Run it and build again.

**"Command PhaseScriptExecution failed with a nonzero exit code"**
Usually `www/` does not exist. Run `npm run sync`, then in Xcode: **Product**,
**Clean Build Folder** (Shift+Cmd+K), then build again.

**"Failed to register bundle identifier."**
`com.homechurchnola.app` is claimed by a different Apple account. Either use
the account that owns it, or change the identifier in the General tab and in
`capacitor.config.json` so they match. Changing it is only safe before the
first release.

**"Signing for 'App' requires a development team."**
No team selected. Step 7.

**Archive is greyed out.**
A simulator is selected. Choose **Any iOS Device (arm64)**.

**Apple emailed "ITMS-91053: Missing API declaration."**
The privacy manifest is not in the build. Redo step 9 and make sure the
**App** target box was ticked. The email names the exact API, which tells you
what to add.

**"Invalid App Store Icon. The icon can't contain an alpha channel."**
Run `npm run icons` and re-drag `icon-1024.png`. Do not export an icon from
Preview or Photoshop without flattening it.

**I changed the app and want to upload again.**
Increment **Build** in the General tab. Apple rejects a repeated build number
even when the version is the same.

-----

## The short version, once you have done it once

```bash
git pull
npm install          # only when dependencies changed
npm run ios:open
```

Then in Xcode: bump **Build**, choose **Any iOS Device**, **Product**,
**Archive**, **Distribute App**.
