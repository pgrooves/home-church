# Home Church, standing rules for Claude

The app is live in the App Store. People have it open on their phones, and
the web version at https://pgrooves.github.io/home-church is served straight
from `main`. Read this before changing anything.

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

## Working on a branch

Work on a branch, not `main`. When a branch has something to look at, give
Trey a way to see it: screenshots from the real app rendered here (Chromium
is installed), and a preview link if one exists for the branch. Merge to
`main` only after a yes, as above.
