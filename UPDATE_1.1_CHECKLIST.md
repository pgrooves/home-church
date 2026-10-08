# Version 1.1, the update after build 16

Build 16 (version 1.0) was approved and releases on October 25, 2026. This
is everything that has to happen to submit the next update, the one with
**HomeKids** and **Coffee** (the Happy Lion Cafe), and have it approved the
first time. It was prepared on the branch `claude/app-store-update-prep` on
October 8, 2026, and **that branch is not merged on purpose**: merging it
publishes the new privacy policy and terms at the public URLs Apple has, and
that should happen when the update is submitted, not before.

Do these in order. Nothing in steps 1 to 3 touches App Store Connect.

---

## What this branch already changed

| What | Where | Why |
|---|---|---|
| Privacy policy: an **Ordering coffee** section, Square in the services list, HomeKids in what stays on your phone, coffee orders in how long we keep things, HomeKids in Children, a second exception to "tokens are anonymous" | `js/screens/legal.js` | 5.1.1(i): the policy has to name what is collected, who it goes to, and how long it is kept. Coffee sends an email address and a name to Square and keeps an order history, and the old policy said none of that. |
| Privacy policy: Gemini and Groq named, and what they are and are not given | `js/screens/legal.js` | 5.1.2(i) asks for disclosure when personal data goes to a third-party AI. None does, and the policy now says so plainly instead of leaving a reviewer to wonder about the "Gemini" labels in Admin. |
| Terms of use: an **Ordering coffee** section (who sells, who takes payment, what to do when an order goes wrong, refunds) | `js/screens/legal.js` | The first feature that takes money. |
| Your data screen: HomeKids ticks and the coffee cart on the phone; coffee orders in the account; account deletion says it takes the orders | `js/screens/legal.js` | It lists what is stored, so it has to list the new things. `cafe_orders` cascades on account deletion, so the promise is true. |
| Support page: a coffee section, and the notes line corrected (the journal syncs when signed in) | `scripts/make_legal_pages.js` | Support URL is checked by reviewers. |
| Public pages regenerated | `legal/*.html` | They must match the app; preflight checks it. |
| Privacy manifest: **Purchase History** added, **Device ID** now Linked | `ios-config/PrivacyInfo.xcprivacy`, `scripts/preflight.js` | A coffee order stores the phone's push token beside the account. |
| App Privacy answers, age rating notes, review notes, What's New, description, rejection risks | `SUBMISSION_KIT.md` sections 3, 5, 6, 7, 9 | |
| "Version 1.0" in Your account now says "Version 1.1" | `js/screens/profile.js` | Change it if you choose another version number. |

HomeKids needed nothing beyond the policy text: everything it keeps stays on
the phone, it needs no sign in, it adds no permission, and every lesson is
approved by a person before families see it.

---

## 1. After October 25: bring the branch up to date

Anything merged to `main` since October 8 has to come in, and has to be
checked against the policy, because this review only covered the app as it
was on October 8.

```bash
git checkout claude/app-store-update-prep
git pull origin claude/app-store-update-prep
git merge origin/main
```

If `legal/*.html` conflicts, do not hand merge it: take either side and
regenerate (step 2). Then ask a session to **compare `main` against
`845fcf6`** (where this branch started) and check anything new against the
privacy policy and the App Store guidelines. Things that would need the
policy or the App Privacy answers changed: a new form, a new third-party
service, anything new sent to the server, photos, location, contacts, a new
permission prompt, or anything that takes payment.

## 2. Set the date, regenerate, test

1. `js/screens/legal.js`, `EFFECTIVE`: set it to the day you will merge.
2. Regenerate the public pages and run everything:

   ```bash
   npx http-server -p 8770 -s &      # or: python3 -m http.server 8770 &
   node scripts/make_legal_pages.js
   npm run preflight
   npm test
   ```

## 3. Decide, before building

- [ ] **Is Square on the cafe owner's production account?** If Coffee is
      still on Trey's sandbox, it cannot go to the public, and it cannot be
      hidden from the reviewer and turned on later (Guideline 2.3.1). Either
      wait for production, or submit with Coffee off and leave Coffee out of
      the review notes, What's New, and description, then ship it in its own
      update once production is live.
- [ ] **Who sells the coffee?** The terms say the Happy Lion Cafe makes and
      sells the drinks and Square takes payment on the cafe's behalf, and
      that refunds are made by the cafe through Square. Confirm that is how it
      works with the owner, and change the Ordering coffee section of the
      terms if not.
- [ ] **Version number.** `1.1.0` is assumed (Your account says
      "Version 1.1"). Any version above `1.0.0` works; the build number must
      be above 16.

## 4. Merge, which publishes the policy

Merge the branch into `main`. GitHub Pages republishes
`pgrooves.github.io/home-church/legal/privacy.html`, `terms.html` and
`support.html` within a few minutes. Open all three on a phone and check
they show the new date and the Ordering coffee section.

## 5. Build

- [ ] `npm run ios`, then in Xcode: Version `1.1.0`, Build `17` or above.
- [ ] Copy `ios-config/PrivacyInfo.xcprivacy` to `ios/App/App/` again. It
      changed, and Xcode does not see the copy in `ios-config/`.
- [ ] Archive and upload. If upload warns ITMS-91053 or about the privacy
      manifest, fix it before submitting.

## 6. App Store Connect, the day you submit

- [ ] **+ Version** on the iOS app, `1.1.0`, and pick the new build.
- [ ] **What's New in This Version**: `SUBMISSION_KIT.md` section 3.
- [ ] **Description**: the HOMEKIDS and COFFEE paragraphs in section 3
      (optional, but accurate metadata is cheaper than a question).
- [ ] **App Privacy**: two edits, `SUBMISSION_KIT.md` section 5. Add
      **Purchases → Purchase History** (linked, App Functionality, not
      tracking), and change **Device ID** to linked. Publish. These go on
      the live store page immediately, which is why they wait until today.
- [ ] **Age rating**: answer again if asked; nothing changes
      (`SUBMISSION_KIT.md` section 6).
- [ ] **App Review Information → Notes**: paste section 7, fill in the two
      passwords. Check both demo accounts still sign in.
- [ ] **App Review Information → Attachment**: the screen recording of a
      full coffee order (section 7 says what to show). The notes promise it.
- [ ] **Admin → Pages → Happy Lion Cafe page: ON**, and HomeKids page on.
      Sign out and check Coffee and HomeKids are in the navigation.
- [ ] Screenshots: optional. The old ones are still accurate; a Coffee or
      HomeKids one would help but is not required.
- [ ] Submit.

## 7. If Apple writes back

`SUBMISSION_KIT.md` section 9, "New in v1.1", has a prepared answer for
each of the four ways Coffee could be questioned. The likeliest is "we could
not test the cafe" because ordering only opens on Sunday mornings: the
recording is the answer, and opening the cafe by hand for a short window
they name is the fallback.
