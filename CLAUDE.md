# Home Church, standing rules for Claude

The app is live in the App Store. People have it open on their phones, and
the web version at https://pgrooves.github.io/home-church is served straight
from `main`. Read this before changing anything.

## Trey works only on a phone

Trey always works from their iPhone, never a laptop or desktop. So:

- Never ask Trey to run a command, open a terminal, use Xcode, or open
  `localhost`. Do that here and report back what happened.
- Show work with full, clickable links and screenshots. Render screenshots at
  phone size (390 x 844).
- Write setup steps for a phone browser or the iOS app. If something really
  needs a computer, say so up front.
- Keep replies easy to read on a small screen: short paragraphs, narrow
  tables, nothing that needs scrolling sideways.

## Ask first before anything people would see

Before any action below, stop and tell Trey, in plain words:

1. **What changes**, in a sentence.
2. **Who sees it, and when**: right away, on the app's next content refresh
   (open phones included), or only after the next App Store release.
3. **Whether installed copies still work.** Older builds keep running for
   weeks. Say whether the change is safe for every version people have.
4. **How to undo it**, and how fast.
5. **Timing**, if it's Sunday morning or a group night, or close to one.

Then wait for a clear yes. A yes covers that one change only, not the next
one, and not the same kind of change later in the session.

### These are live the moment they happen

- **Pushing or merging to `main`.** GitHub Pages republishes the web version
  within minutes. `embed.html` is served from there too, and every installed
  copy of the app plays video through it, so a broken `embed.html` stops video
  in the App Store build as well.
- **Supabase migrations** (`apply_migration`, or SQL that creates, alters or
  drops anything). There is one live project and every installed version uses
  it. Add things; don't rename or remove what a shipped build reads.
- **SQL that writes rows** (`insert`, `update`, `delete`, `upsert`) on the
  live project, outside a slash command's own confirm step.
- **Deploying an Edge Function.** It replaces the live one for every version.
- **`app_settings` changes**: page switches (`cafe_on`, `group_mode_on`,
  `homekids_on`, `practices_on`, `alpha_on`), `maintenance_mode_on`,
  `home_embed_base` and the rest. They reach open phones on the next
  refresh, and every installed build reads the same switch. Turning on a page
  that's half-built in an older build shows it to those people too.
- **Secrets** set on Edge Functions, and anything in the Supabase or Square
  dashboards.

The slash commands in `.claude/commands/` already show what will change and
ask before they write. That counts as the confirmation, so don't ask twice.
Still mention the timing if it's a Sunday morning.

### These are safe without asking

Editing files on a branch, running tests, rendering screenshots, read-only
SQL (`select`), reading logs and advisors, and pushing a branch other than
`main`. App code (`index.html`, `js/`, `css/`, `assets/`) only reaches phones
in a new App Store build, so changing it on a branch is never live. It goes
live on the web version when it lands on `main`.

## Working on a branch, and the preview link

Work on a branch, not `main`. Merge to `main` only after a yes, as above.

Cloudflare Pages (project `home-church`) builds every pushed branch and
gives it its own address. **Every time you push a branch, end your reply
with that branch's full preview link**, written out in full so Trey can tap it:

> Preview: https://<branch-alias>.home-church.pages.dev

Don't build the link from the branch name yourself. Long names get cut off,
and an early link shows the old build. Instead:

1. Push, then wait for the **Cloudflare Pages** check on that commit in
   GitHub (it takes a minute or two).
2. Take the **Branch Preview URL** from it. That address always shows the
   latest push on the branch. The check also gives a per-commit URL that
   never changes; use that one if Trey wants to compare two versions.
3. If the build failed, say so and fix it, instead of sending a link.

Previews talk to the live Supabase project. Looking is harmless; submitting
anything on a preview (an order, a journal entry, a prayer request) is real.
The cafe's Square checkout returns to the live GitHub Pages site afterwards.

`home-church.pages.dev` itself is a copy of `main` nobody uses. The live web
version is still https://pgrooves.github.io/home-church.
