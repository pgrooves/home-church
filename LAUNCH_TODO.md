# Launch todo, everything only you can do

Nothing on this list is code. It is the running list of things I cannot do from
here, kept current as I work so you can come back at the end and clear it in
one sitting.

**Status key:** `[ ]` not started, `[x]` done, `[!]` blocking submission.

Last updated at the end of Phase 7. **All phases are complete.** Everything
below is what is left, and none of it is code.

> **Sign in went live, and that moved several things on this page.** Accounts
> are no longer dormant: email one time codes are working with Resend as the
> sender. Three items below were parked with the words "when you turn accounts
> on" or "moot while sign in is off," and they are now live items rather than
> future ones. The account deletion function is deployed and wired into the
> app, because Guideline 5.1.1(v) is a rejection, not a nicety. The privacy
> policy has been rewritten, because the old one said your name never left the
> phone and that stopped being true the moment the first person signed in.
>
> **The attorney item moved with them.** See the note further down: the
> document's own advice was to get a review before accounts turn on. They are
> on.

-----

## Migrations, all five done

Applied to `ibqkumxfltfiuqevviji` and verified against the live project rather
than trusting the report that applied them.

**The Supabase security report is clean** apart from two known entries, and
neither is a defect:

- **Leaked Password Protection** (WARN), a dashboard toggle. Low priority
  rather than moot now that sign in is on, because sign in is email one time
  codes and there is no password to reuse.
- **`rls_enabled_no_policy` on `public.push_log`** (INFO), which is the
  intended design. That table has RLS on and deliberately no policies, with
  grants revoked from `anon` and `authenticated`, because only the service
  role should ever read the church's send history. **Do not "fix" this by
  adding a policy.**

- [x] `0008_real_serve_teams.sql`. Seven real serve teams, requirement set on
      Home Kids and Worship Team only, the four invented ones gone.
      `groups_in_season` is false, so the finder hides.
- [x] `0009_accounts_dormant.sql`. `profiles` with RLS scoped to
      `auth.uid() = id`, no DELETE policy, signup trigger live, export function
      restricted to `authenticated`. Also cleared the pre-existing
      `hc_set_updated_at` search_path warning.
- [x] `0010_device_tokens.sql`. RLS on, and the load bearing part holds:
      `anon` has INSERT and UPDATE and **no SELECT**, so the token list cannot
      be read with the publishable key.

- [x] **`0011_lock_down_signup_trigger.sql`** applied and proven, August 12.
      Both SECURITY DEFINER advisor warnings on `hc_handle_new_user` are gone.
      The security report is now clean except for Leaked Password Protection,
      which is a dashboard toggle and moot while sign in is off.

      Worth knowing, because it is the kind of thing that gets re-litigated
      later: **the obvious test of this migration proves nothing.** Creating a
      user from the dashboard or over MCP inserts as `postgres`, which owns the
      function, so a privilege check could never have blocked it. My original
      verification steps had that flaw and the session that ran it caught it.

      What settled it was a throwaway replica in a separate schema, inserting
      as a role confirmed to have `EXECUTE = false`. The trigger fired. That
      matters because `supabase_auth_admin`, the role GoTrue inserts as during
      a real signup, held EXECUTE only through the PUBLIC grant this migration
      removed. The full reasoning is in the migration file's header.

- [x] **Deploy the account deletion function.** Done, August 12, now that
      accounts are on. `delete-account` is deployed to
      `ibqkumxfltfiuqevviji`, version 1, ACTIVE, with `verify_jwt` on. The app
      calls it from Your account and from Your data.

- [x] **The sign in email templates send a code, not a link.** Done. The app
      asks for six digits and Supabase's stock templates emailed a magic link
      whose redirect no screen here handles, so sign in was broken end to end
      until both **Magic Link** and **Confirm signup** were rewritten to print
      `{{ .Token }}` and drop `{{ .ConfirmationURL }}`. Both, not one: Supabase
      sends Confirm signup to a first time address and Magic Link to a
      returning one, so fixing either alone breaks half the church. Templates
      are in README under "Accounts" if they ever need restoring.

      **Codes land in junk** on a sending domain with no reputation yet. That
      is a DNS and sending history problem, not a template problem, and it is
      worth knowing before somebody spends an afternoon rewriting copy that
      was never the cause.

- [x] **`0012_push_delivery.sql`** applied and verified, August 12. Per-topic
      preference columns on `device_tokens`, `push_log`, `pg_cron` and `pg_net`
      enabled, `hc_send_push` and `hc_push_tick` both SECURITY DEFINER with a
      pinned `search_path` and EXECUTE revoked from `public`, `anon`, and
      `authenticated`, and the `hc-push-tick` job live on `0 * * * *`.

      The lesson from 0011 was applied rather than re-learned: both new
      SECURITY DEFINER functions were checked in the catalog, not inferred
      from the advisors staying quiet. Their ACLs grant EXECUTE to `postgres`
      and `service_role` only.

- [ ] **Leaked Password Protection** is still off in the Auth dashboard, and
      the advisor still flags it. **No longer moot, but still low priority:**
      sign in is email one time codes, so there is no password for anybody to
      reuse. It is one toggle under Authentication. Flip it and stop thinking
      about it.

- [ ] **Delete the three test accounts** when you are done testing.
      `teebacca@hotmail.com`, `treytim@gmail.com`, and `trey@pgrooves.com` are
      all yours, none are the Daigles, so nothing here needs a conversation
      first. The cleanest way to check your own work is to delete one of them
      from inside the app with the new button rather than from the dashboard.

-----

## Schedule risks, the long poles

- [!] **Apple Developer Program enrollment.** $99 a year. Enrolling as an
      organization, which is what you want if the app is published as Home
      Church and not as a person, requires a **D-U-N-S number** for the church.
      That usually takes one to two weeks. **This is the single longest lead
      time in the project.** Start it before anything else on this page.
      Registered nonprofits may qualify for a **fee waiver**, worth applying
      for at the same time but do not let it hold up enrollment.

- [ ] **Xcode 26 and a Mac.** Capacitor 8.5 requires Xcode 26. Confirm you have
      a machine that can run it, or decide who does the build.

- [ ] **Nonprofit status, when you are ready.** Parked at your request. It does
      not block launch, because giving hands off to Overflow and that does not
      depend on the answer. It only decides whether native Apple Pay giving is
      ever possible. For US churches the route is a **Candid Seal of
      Transparency**.

-----

## Before submission

- [x] ~~Support URL.~~ **Written and merged to `main`.** Should be live at
      `https://pgrooves.github.io/home-church/legal/support.html`. Nothing left
      but to open it once and confirm it renders.

- [ ] **Open both pages once and confirm they render.**

      **Read this before you do, because what is being served changed.** Both
      pages were stale and are now regenerated. The copies sitting at those
      two URLs described an app with no group rooms, no journal that leaves
      the phone, and no reporting or blocking, months after all three shipped.
      The privacy policy is the field App Review checks most reliably and the
      terms are what Guideline 1.2 wants people agreeing to before they post,
      so those were the worst two files in the repo to have drifted.

      Nothing was wrong with the generator. Nobody re-ran it, because nothing
      failed when they didn't. `npm run preflight` now fails when the pages
      and the app screens disagree, and it runs inside `npm test`.

      So confirm two things when you open them, not one: that they render, and
      that the privacy policy has a "Group rooms, where writing is the point"
      section in it. If it does not, GitHub Pages is still serving the old
      build and has not caught up.

      They are on `main`, so GitHub Pages should be serving them:

          https://pgrooves.github.io/home-church/legal/privacy.html
          https://pgrooves.github.io/home-church/legal/support.html

      Right looks like a formatted page: small caps eyebrow, serif body, warm
      off white background, same as the in app screen. Wrong looks like a 404,
      which means Pages has not built yet or its source is not set to `main`
      and root folder, or raw HTML source on screen, which means the wrong URL.

      I cannot load them from here, the sandbox proxy blocks `github.io`.

      These two go in the **Privacy Policy URL** and **Support URL** fields in
      App Store Connect. A `github.io` address is fine, Apple has no domain
      requirement. Moving them to homechurchnola.com later is a nicety.

- [x] ~~App icon set with no alpha channel.~~ **Done.** Every icon PNG carried
      an alpha channel with nothing actually transparent in it, so stripping
      was lossless. `npm run icons` regenerates the full iOS set into
      `ios-icons/` plus the web icons, and it is a script rather than a one
      time fix so it keeps being true. The logo lockups and `mark.png` were
      left alone, they use transparency for real.

      One thing to know: the largest square source in the repo is 512px, so
      the 1024 App Store icon is upscaled. It passes. If the church's original
      logo still exists as vector art, export a real 1024 and drop it in as
      `assets/icons/icon-1024.png`, which the script prefers automatically.

- [ ] **A Louisiana attorney on the privacy policy and terms. Deferred, and
      that is a reasonable call.** I had this marked as blocking submission and
      that was wrong of me.

      **Apple will approve you without it.** Review checks that a privacy
      policy exists, is reachable in the app and at a public URL, and honestly
      describes what the app does. All three are true. Nobody at Apple assesses
      legal quality.

      What an attorney protects is **your** exposure, not your approval.

      **That exposure just grew, and this item should move up your list.** The
      previous version of this note said the risk was small because there were
      no accounts and everything stayed on the phone, and that the day it
      changed was the day accounts turned on. Accounts are on. You are now
      holding names, email addresses, birthdays, and home addresses for a
      congregation that includes minors, on your own server.

      Apple still does not care and will still approve you without it. This is
      not a submission blocker and I am not marking it as one. But the
      liability section and the children's paragraph in your policy stopped
      being theoretical this week, and the honest read is that this is now the
      most valuable unchecked box on this page even though nothing enforces
      it.

- [ ] **Decide what happens when a thirteen year old signs in.** Nobody has
      made this decision yet, it has been defaulted into, and it is the one
      real risk on this page that Apple will not catch for you.

      Sign in is open to anybody with an email address. Once in, Your
      information asks for a birthday and a home address, and both sync to the
      server. A church app is used by youth groups. So the current design will,
      sooner or later, store a minor's date of birth and home address, and for
      anybody under 13 that is COPPA territory, which wants verifiable parental
      consent rather than a privacy policy.

      Guideline 5.1.4 is the Apple-facing half and we satisfy it: we have a
      policy and it names children's data. Nobody in App Review checks who
      actually signs up, so this will not be caught at submission. That is
      precisely why it needs deciding rather than discovering.

      Three ways out, cheapest first:

      1. **Stop collecting birthday and address.** Migration `0009` already
         notes that of the twelve profile fields the app itself reads exactly
         one, `first_name`. Everything else exists for church records, and a
         church management system is the better home for it. This removes the
         problem rather than managing it.
      2. **Gate account creation at 13+**, stated plainly at sign in.
      3. **Keep it and get the legal review first**, which folds into the item
         above.

      I would do the first. It is less code, less data, a shorter privacy
      policy, and it is the only one of the three that means you are not
      holding a child's home address at all.

- [ ] **Confirm the effective date on both legal screens.** It reads
      **August 11, 2026** right now. Change `EFFECTIVE` at the top of
      `js/screens/legal.js` to the real launch date before you submit, then
      re-run `node scripts/make_legal_pages.js` so the public pages match.

      The policy itself has been rewritten for accounts and the pages under
      `legal/` are already regenerated, so the date is the only thing left in
      them. Re-read the new "Signing in" section once before you submit: it
      describes what actually syncs, and you are the one who has to stand
      behind it.

- [!] **Push notifications: the code is built, the credentials are not.**
      The sending side now exists. Migration 0012 added per-topic preferences,
      a `push_log`, and an hourly `pg_cron` tick that decides in Louisiana
      local time when to send, so daylight saving cannot drift the schedule.
      The `send-push` Edge Function signs an APNs token and delivers. The app
      writes your switches to the server, because a push is addressed before
      the phone can filter it.

      **None of it can send a single notification until Apple exists.** APNs
      needs an Apple Developer account, which needs the D-U-N-S number at the
      top of this page. That is the real dependency, not the code.

      **The registration half was broken the whole time, and is fixed now.**
      `device_tokens` had never held a single row. Every part of the chain
      above was real; the request that puts a token in the table was refused
      by Postgres every time and the app said nothing. `js/native.js` upserted
      by posting with `Prefer: resolution=merge-duplicates`, which PostgREST
      turns into `insert ... on conflict do update`, and that statement needs
      `SELECT` on `device_tokens` on top of `INSERT` and `UPDATE`, because the
      conflicting row has to be read to resolve the conflict. Migration 0010
      revoked `SELECT` from anon on purpose, so it came back `42501`, which is
      a 403, which `if (!res.ok) return false` swallowed on a path with no
      error surface. Turning the switches off and deregistering are plain
      `PATCH`es and never needed `SELECT`; they only looked broken because they
      run off a token the app never got to store.

      Migration 0037 fixes it without taking Postgres's advice to grant anon
      `SELECT`, which is exactly what 0010 spent a page refusing: a readable
      token table is a downloadable list of every phone with the app on it.
      The upsert moved into `hc_register_device_token`, a SECURITY DEFINER
      function that anon may call and nothing else, and the table keeps the
      grants it had. **0037 is applied to the live project and verified there:
      a first registration, a second one taking the CONFLICT branch, and a
      reactivation, all as `anon`, with `anon` confirmed still unable to
      `SELECT` or `DELETE`. The probe rows were removed afterwards, so the
      table is empty again — correctly this time, since no real phone has
      registered yet.**

      The harness stub of `device_tokens` in `supabase/tests/harness.sql` had
      no RLS and no revoke, so a test written against it would have passed
      while production failed. That is why nothing caught this. The stub now
      copies 0010's security half verbatim, and
      `0037_register_device_token_test.sql` asserts both halves: that anon can
      register twice, and that it still cannot read the phone list.

      **The rest of the chain is live, and this note used to say otherwise.**
      Re-verified against the project while fixing the above, and steps 1 to 3
      below are all done now:

      - `pg_net`, `pg_cron`, the vault secret, all twelve `device_tokens`
        columns, `push_log`, and `hc-push-tick` on `0 * * * *`, active.
      - `HC_PUSH_CRON_SECRET` **is set on the function.** A dry run of
        `hc_send_push('test', true)` came back `200` with the composed
        notification, where it used to come back `Not configured.` That is
        pg_cron → `hc_push_tick` → `hc_send_push` → pg_net → the Edge
        Function, authenticating end to end.
      - **All four `APNS_*` secrets are set, and Apple accepts them.** A real
        send with one deliberately fake token in the table came back
        `400 BadDeviceToken` from Apple. That is the useful answer: the `.p8`
        parsed, the ES256 provider token signed, and Apple accepted the
        credentials and rejected only the made-up device token. A bad key
        gives `403 InvalidProviderToken` and a missing one never reaches
        Apple at all. The probe row was retired by the sender exactly as
        designed, then deleted.

      So the only thing that was ever missing on the sending side is the thing
      fixed above: phones to send to. `device_tokens` is still empty, which is
      now correct rather than a symptom, because no real phone has registered
      since the fix shipped.

      What is left is on the phone, not the server, and is steps 4 to 6:

      1. ~~**Deploy the function**~~ — already done, with `verify_jwt` off.
         Redeploy only if you change `send-push/index.ts`, and keep the flag:

             supabase functions deploy send-push --no-verify-jwt

         The `--no-verify-jwt` is deliberate and the function's header explains
         why at length: the database has no user session, and the alternative
         is keeping a service role key in Postgres. It authenticates callers
         with its own shared secret instead. Turning it on breaks the cron path.

      2. **Read the cron secret** that migration 0012 generated. In the SQL
         editor:

             select decrypted_secret from vault.decrypted_secrets
             where name = 'hc_push_cron_secret';

         It was generated in the database rather than written into the repo,
         so it has never been in git or in a chat window. Copy it once.

      3. **Set five secrets** on the function, under Edge Functions →
         send-push → Secrets.

         ~~**Confirmed still outstanding as of the admin dashboard work.**~~
         **Done.** All five are set, and Apple answers on the credentials.
         Verified as described above. The table below is kept for the day one
         of them has to be rotated.

         | Secret | Value |
         |---|---|
         | `HC_PUSH_CRON_SECRET` | what you just copied |
         | `APNS_KEY_ID` | the 10 character Key ID of your `.p8` |
         | `APNS_TEAM_ID` | your 10 character Team ID |
         | `APNS_PRIVATE_KEY` | the whole `.p8` file, BEGIN and END lines included |
         | `APNS_BUNDLE_ID` | `com.homechurchnola.app` |

         **`APNS_HOST` is the sixth one and the one that will waste your
         afternoon.** It defaults to Apple's production gateway. A build you
         run from Xcode onto your own phone is a *development* build and its
         token only works against `api.sandbox.push.apple.com`. TestFlight and
         the App Store are production. Sending a sandbox token to the
         production gateway fails with `BadDeviceToken`, which looks exactly
         like a bug in the code and is not. While you are testing from Xcode,
         set `APNS_HOST` to `api.sandbox.push.apple.com`, and **delete that
         secret before you submit.**

      **`APNS_HOST` IS THE ONE STILL WORTH CHECKING BEFORE YOU TEST.** It is
      the only push secret whose current value cannot be read back from
      outside, and it is the one that decides whether your own phone hears
      anything. A build run from Xcode onto a device plugged into your Mac is
      a *development* build: its token is a sandbox token and only
      `api.sandbox.push.apple.com` will accept it. TestFlight and the App
      Store are production. Get this backwards and every send fails with
      `BadDeviceToken`, which is indistinguishable at a glance from the fake
      token used in the verification above, and looks exactly like a bug in
      the code. It is not.

      So: **set `APNS_HOST` to `api.sandbox.push.apple.com` while testing from
      Xcode, and delete that secret before you submit.**

      4. **Prove the targeting without sending anything.** In the SQL editor:

             select public.hc_send_push('test', true);

         The `true` is dry run. The function reports how many phones it would
         reach and what the notification would say, and touches Apple not at
         all. Then check what came back:

             select * from net._http_response order by id desc limit 1;

      5. **Send yourself a real one**, from a device with the app installed
         and a switch turned on. Confirm the phone actually registered first,
         which is the step that never used to work:

             select token, active, wants_new_guide, wants_announcements,
                    created_at
               from public.device_tokens order by created_at desc;

         A row here means the whole registration path worked. No row, after
         turning a switch on with the app on a real phone, means either the
         Push Notifications capability is missing from the build (XCODE.md
         step 8) or the registration was refused. Both now say so in the Web
         Inspector console rather than failing silently. Then:

             select public.hc_send_push('test');

         Then read the outcome:

             select * from public.push_log order by ran_at desc limit 5;

      6. **Watch the first real Monday.** The guide notice only fires if a
         guide was actually published since the last one went out, so a quiet
         Monday is correct behaviour, not a failure. `push_log.skipped` tells
         the two apart.

- [x] ~~Decide what happens to the third switch.~~ **Season gated off.** "The
      day your group meets" needs to know which group you are in, and nothing
      in the app models that: there is no membership, only a roster a leader
      keeps on their own phone. It now hides while `groups_in_season` is
      false, the same gate Connect already uses, so no inert control ships.

      **When groups come back in season, that switch needs a group picker in
      Your information before it renders again.** It is wired to a server
      column that stays false, so turning the season on without building the
      picker would put the old problem back.

- [ ] **Validate `PrivacyInfo.xcprivacy` in Xcode.** Apple's own required
      reason API page would not load from my sandbox, so the reason codes in my
      draft manifest come from Apple Developer Forums rather than first hand
      from the docs. Xcode reports the codes it expects. Do not take my draft
      on faith.

      **The collected data list in it was wrong and is now fixed**, which is
      worth knowing separately from the reason codes above. It declared five
      types when SUBMISSION_KIT section 5 declares eight: Physical Address,
      Other Data, and User ID were missing, all three of them arriving the day
      sign in went live and Your information began syncing to `profiles`.
      Xcode generates the privacy report from that file and you type the App
      Store label from section 5 by hand, so the two were a reviewer's
      comparison apart. `npm run preflight` now fails when they disagree.
      The reason codes are still yours to check in Xcode.

- [ ] **Answer the age rating questionnaire.** Apple overhauled it in 2025.
      Tiers are now 4+, 9+, 13+, 16+, 18+, with new required sections on in-app
      controls, capabilities, medical topics, and violent themes. The **social
      media questions become required for new submissions in September 2026**,
      so you will be answering those. My drafted answers are in
      `APP_STORE_COMPLIANCE.md` section 2.6. Target rating: **4+**.

- [x] ~~Screenshots.~~ **Generated.** Six of them in `screenshots/`, at exactly
      1320 x 2868, no alpha channel, in the order that leads with the guide and
      Leader mode rather than with Home. Captions are in
      `screenshots/CAPTIONS.txt`. `node scripts/make_screenshots.js` rebuilds
      them, which matters because the content changes weekly and a stale
      screenshot on the store page is a small lie.

      They are Chromium renders using the same bundled fonts and the same CSS,
      which is honest and is accepted. If you want the last few percent of
      fidelity, retake them in the iOS simulator using the same order and
      captions. Do not ship a mix of both.

*(The orphaned accounts item that used to sit here moved up under Migrations,
since those three accounts are no longer orphaned. The effective date item is
above, under Before submission.)*

-----

## Supabase dashboard

- [x] **Move off Supabase's default auth email sender.** Done, Resend is wired
      in and codes are arriving.

      Keeping the two findings that put this on the critical path, because
      both were discovered by trying it and neither is obvious:

      1. **The default sender will not email your church.** It delivers only
         to members of the Supabase org. Every other address fails with
         `Email address not authorized`. That is not a limit you can raise,
         it is what the built in service is.
      2. **Templates are read only until custom SMTP is configured.** The
         dashboard greys out subject and body, so the code-not-link fix could
         not even be attempted first.

      So the order was SMTP, then templates, then test, and it could not have
      been any other order. One thing still worth checking before a launch
      Sunday: Supabase imposes 30 messages an hour on a newly connected
      server, raisable on the Auth, Rate Limits page.

- [!] **Auth URL configuration, and this is the one most likely to bite you.**
      Sign in works today from the GitHub Pages origin. A native build does
      not run on that origin, it runs on `capacitor://localhost`, and Site URL
      and Redirect URLs in the Supabase Auth dashboard have to know about it.

      Your six digit code flow is more forgiving here than a magic link would
      be, because typing a code back into the app needs no redirect at all, so
      there is a good chance this just works. **Do not take that on faith.**
      This is the classic failure where everything is fine in your home screen
      web app and the reviewer cannot get past the first screen. Test sign in
      on a real device from the Xcode build, not from Safari, before you
      submit.

- [x] **Migration 0043, and the two Edge Functions it changes.** Applied to the
      project and both functions redeployed, on the branch that added them.
      Nothing new had to be set up: no secrets, no keys, no dashboard. The two
      review topics travel the road 0012 and 0027 already built.

      **What was checked afterwards, rather than assumed.** The applied schema
      was read back and matches what `0043_admin_review_push_test.sql` asserts
      against the throwaway Postgres: the three new columns, `review_approvals`
      with RLS on and no anon grant, no client-role privileges of any kind left
      on `device_tokens`, and an anon-executable function list of exactly the
      five `0017`'s test allows. The security advisor returns the three
      SECURITY DEFINER warnings that migration predicts by name and no new
      class of lint.

      `hc_send_push` was then called for both new topics against the live
      project. Both queues were empty, so both composed nothing, sent nothing,
      and wrote a skipped row to `push_log` — which is the end-to-end proof
      that the deployed sender authenticates, understands the topics and
      reaches the database, without a single phone lighting up.

      `newsletter-intake` was verified twice over, because retyping it into a
      deploy API rather than sending the file off disk is a real risk and the
      dangerous version of it is silent. A dry run returned
      `{"ok":true,"found":2}`: it booted, authenticated, and drove IMAP through
      TLS, login, search and a header fetch. Both emails were already in the
      ledger so it stopped before the body parser. So the source itself was
      read back off the project and hashed: sha256
      `419f8667b75b4389a1795193c61466e804c569619acf46f9408359b30ea40b15`,
      82,074 bytes, identical to the repo file. That check matters more than it
      sounds. Line 523 of that file carries a literal U+00A0 non-breaking
      space, invisible, inside the character class that `htmlToText` uses to
      collapse runs of whitespace. A copy that turned it into an ordinary
      space would have quietly stopped collapsing `&nbsp;` runs out of
      Mailchimp mail, with nothing anywhere reporting a fault.

      **If either function is ever redeployed from a checkout**, that is a
      no-op and is the better habit: `supabase functions deploy <name>
      --no-verify-jwt` sends the exact bytes off disk.

      **The failure this avoided**, kept for whoever reads this next: applying
      the migration without redeploying is quiet in both directions. An old
      `send-push` does not know the two topics and answers 400, so the intake
      asks and nobody is told. An old `newsletter-intake` never asks at all.
      Either way the queue fills in silence, which is the behaviour 0043 exists
      to end, with every check green.

      **0043 also fixes a bug that has been live since 0010,** which is worth
      knowing about because it changes what a phone does rather than only what
      it hears. Turning a notification switch off, and turning the last one
      off, were both a `PATCH` at `device_tokens`, and both were refused by
      Postgres on every phone, every time: PostgREST turns `?token=eq.X` into a
      WHERE clause and a WHERE clause needs SELECT, which anon must never have
      on that table. `js/native.js` swallowed the refusal. The same mistake
      0037 found in the registration, in the two lines 0037's own header calls
      fine. Both now go through functions. **After this ships, a phone that
      switched notifications off will actually stop receiving them**, which
      may be visible as the church reaching fewer phones than `device_tokens`
      suggested it would.

- [!] **Deploy the two Edge Functions the admin dashboard needs.** The
      migrations are applied, the app is wired, and two of the four sections
      go through Edge Functions that have to be pushed before they work.
      Neither is optional and neither needs anything set up beyond the deploy:

      ```
      supabase functions deploy send-push --no-verify-jwt
      supabase functions deploy admin-remove-user
      ```

      `send-push` already existed and has been changed rather than added: it
      learned the `announcement` topic. **Redeploy it or posting an
      announcement will save the card and then fail to notify anybody**, which
      is the safer half of the two failure modes but still a broken button.
      `--no-verify-jwt` is not new and not careless, the caller is the
      database presenting a dedicated shared secret; the header of that file
      explains it at length.

      `admin-remove-user` is new. Until it is deployed, Remove on the Users
      screen fails with a message rather than doing anything, which is the
      right way round.

      The APNs secrets on `send-push` are the same five as before and are
      already on the list under "Push notifications". Announcements need
      nothing beyond them.

- [x] **The admin role and its three migrations.** Applied to the project on
      the branch that added them: `0025_admin_role`, `0026_admin_content`,
      `0027_announcement_push`. `teebacca@hotmail.com` is the first admin.

      Two accounts predated the signup trigger from 0009 and had no
      `profiles` row at all, which would have made Manage Users unable to
      change their role. Backfilled blank, which is exactly what that trigger
      writes, and they default to `member`.

      **Nothing here needs the dashboard.** The `announcements` Storage bucket
      and its four policies were created by migration 0026 rather than
      clicked, which is the whole point of the pass.

- [ ] **Expect four new security advisor warnings, and know why.** Two
      `0028_anon_security_definer_function_executable` and
      `0029_authenticated_security_definer_function_executable` entries for
      `hc_is_admin`, plus `hc_admin_list_users`, `hc_admin_set_role` and
      `hc_admin_send_announcement`.

      These are the same shape as the eighteen the Group tab already carries
      from 0016: in this project a SECURITY DEFINER function *is* the
      permission boundary, so the ones that matter are exactly the ones that
      have to be callable. Section 6 of `0025_admin_role.sql` has the full
      argument, including why revoking `hc_is_admin` from `anon` is not the
      fix and was in fact a real bug caught in testing.

-----

## Xcode, once you are enrolled

**`XCODE.md` is a full step by step walkthrough written for somebody who has
never shipped an app.** Every step says where to click. Use that on the day,
not the summary below.

Steps 1 to 6 of it work **without** an Apple Developer account, so you can
rehearse the whole build now and find any surprises early. Only signing,
notifications, and uploading need the paid account.

The short list:

- [ ] `npm install && npm run ios:open`
- [ ] Copy `ios-config/PrivacyInfo.xcprivacy` into `ios/App/App/` and add it to
      the App target. It lives outside `ios/` because that folder is generated
      and gitignored, and a hand written file in there gets destroyed the next
      time somebody runs `npx cap add ios`.
- [ ] `npm run icons`, then drag `ios-icons/` into the AppIcon set.
- [ ] `ITSAppUsesNonExemptEncryption` to `NO` in `Info.plist`.
- [ ] Deployment target **iOS 15**, devices **iPhone only**, version `1.0.0`,
      build `1`.
- [ ] Push Notifications capability on, and an APNs key created.
- [ ] **Test on a real device**, not just the simulator: cold start, airplane
      mode, back gesture, the giving handoff, the share sheet, add to
      calendar, and a test notification.

-----

## Content I still need from you

Neither of these blocks anything. Both render honestly as they are, they are
just quieter than they could be.

- [ ] **A destination for "I'm new here."** The only next step with no link.
      It shows as a description with no button, which is honest, but it is the
      one a first time visitor is most likely to tap. Is there a Church Center
      connect card for it?

- [ ] **What happens when someone wants to join a group, not host one?** The
      Group Vitals link you sent is the leader form. Group cards are
      information only now, because the old behavior claimed it would pass your
      name to the host from a card with nowhere to type a name. This is the
      last thing on Connect with no destination.

-----

## Decisions already made, for the record

- [x] **Accounts are off in v1.** Infrastructure gets built and ships dormant.
      Removes the account deletion requirement, the demo account, and the SMTP
      dependency. See `APP_STORE_COMPLIANCE.md` section 0.
- [x] **Home groups ship out of season**, so the placeholder groups never
      render. One boolean brings them back.
- [x] **Leader Mode data stays on the phone.** Keeps Guideline 1.2 entirely out
      of scope.
- [x] **The Linktree is not in the app.** A link to a link aggregator, inside an
      app that already carries a Guideline 4.2 risk, is the most on the nose
      version of "a collection of links" I could hand a reviewer. Everything on
      it that matters is a next step now.
- [x] **Connect points at Church Center, Group Vitals, Google Forms, Flodesk,
      and your SMS keyword** rather than a form capture pipeline in Supabase.
- [x] **The real serve teams are in**, all seven, from your screenshots.
- [x] **utm parameters stripped** from all six links. They claimed the traffic
      came from Instagram, which was true of a link in a bio and is not true of
      a tap inside the app.

-----

## Worth a second look later, not now

- [ ] **The prayer request Google Form.** It works and it ships. But prayer
      requests are often the most sensitive thing anyone tells a church, and
      routing them through Google Forms means naming Google as a processor in
      the privacy policy, which I have done. Church Center has forms too, if
      you would rather keep it in one system.

- [ ] **Real photography.** Not a blocker. The cream placeholder blocks are a
      deliberate choice and they hold up.
