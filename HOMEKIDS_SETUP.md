# HomeKids: what is built, and the three things left to plug in

HomeKids is a page behind the ••• button, in the top half of the overlay
between **Practices** and **Services**. It has three jobs:

1. **The kids guide.** Each Sunday's lesson, retold for kids, for the week
   after it is taught: the big idea, the story, the memory verse, questions and
   an activity for the family's age group, and a prayer.
2. **The checklist and the prize box.** Three or four things a family does
   together during the week. Each one is a big tick box. Next Sunday the family
   taps **Show my teacher** and holds up the card; a full card earns a pick
   from the prize box. The ticks live on the phone only, no account needed.
3. **The two HomeKids emails.** What the weekly email to parents said, and,
   folded away underneath, what the email to volunteers said. Both arrive
   through the same mailbox reader as the church newsletter, and both wait for
   an admin to approve them, exactly like announcements.

The three groups the page is built around:

| Key | Name | Ages | Colour on the page |
|---|---|---|---|
| `champions` | Champions | 3 to 4 | sage |
| `heroes` | Heroes | 5 to 6 | amber |
| `legends` | Legends + Warriors | 7 to 12 | brick |

They live in `js/data.js` (`homekidsGroups`). Renaming one is a one-line edit
there; adding a fourth is that line plus the check in migration `0081`.

---

## Where everything is

| What | Where |
|---|---|
| Tables, approve and discard, the on/off switch | `supabase/migrations/0081_homekids.sql` |
| The page | `js/screens/homekids.js`, styles under *HomeKids* in `css/screens.css` |
| The tile in the ••• overlay | `MODULES` in `js/app.js`, gated by `homekids_on` |
| How rows reach the phone | `homekids_lessons` and `homekids_updates` in `js/content.js` |
| The ticks, the chosen group, the name on the card | the *homekids* block in `js/store.js` |
| Reading the two emails | the *HomeKids* block in `supabase/functions/newsletter-intake/index.ts` |
| Approving what the emails said | Admin → **HomeKids** |
| Writing a lesson from the director's sheet | `/new-homekids` (`.claude/commands/new-homekids.md`) |
| Sample rows and the renders | `demo-homekids/` (`node demo-homekids/render.js`) |
| Tests | `tests/homekids.test.js`, `supabase/tests/0081_homekids_test.sql` |

---

## Plug-in 1. Run the migration (once, now)

Supabase → SQL Editor → paste `supabase/migrations/0081_homekids.sql` → Run.
Safe to run twice. Until it has run, the page still opens and says the first
guide is on its way: the app treats a missing table as "nothing yet".

The page is **on** from the moment this ships. To hide the tile for a season,
Admin → App settings → **HomeKids page** → off.

## Plug-in 2. The two HomeKids emails (when you are on the lists)

**Get the emails into the reader's mailbox.** The reader signs in to the
dedicated Gmail mailbox described in `NEWSLETTER_INTAKE_SETUP.md`, the one that
already receives the church newsletter. Either:

- **Subscribe that address** to both HomeKids lists (best: nothing in between
  can break), or
- **Forward from your own inbox.** In Outlook: Settings → Mail → Rules → *Add
  new rule*, condition *From* the HomeKids sender, action *Forward to* the
  intake address. One rule per email, or one rule with both senders.

Why not an Outlook API: Microsoft no longer lets apps sign in to Outlook with
a password over IMAP; it needs an Azure app registration and OAuth tokens that
expire and have to be renewed. A forwarding rule gets the same email into the
mailbox the reader already reads, every twenty minutes, at no cost and with
nothing to renew.

**Tell the reader which emails are which.** Supabase → Project Settings →
Edge Functions → Secrets. Two new secrets, each a comma separated list:

| Secret | Example | Matches |
|---|---|---|
| `HOMEKIDS_PARENT_SENDERS` | `kids@homechurchnola.com` | anything in the From line |
| `HOMEKIDS_VOLUNTEER_SENDERS` | `subject:HomeKids Team` | `subject:` matches the subject line |

Use `subject:` when both emails come from the same address. Forwarded mail
keeps the original sender in the From line only sometimes, so with forwarding
the `subject:` form is usually the reliable one. Volunteers is checked first.

With neither secret set, which is how this ships, nothing about the newsletter
reader changes.

**Rehearse it before it writes anything:**

```bash
curl -X POST https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/newsletter-intake \
  -H "x-hc-cron-secret: <the secret>" -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

A HomeKids email shows up in `preview` with `"homekids": "parents"` or
`"volunteers"` and the items it would write. Then redeploy once:

```bash
supabase functions deploy newsletter-intake --no-verify-jwt
```

From then on the schedule picks them up every twenty minutes (more often than
the hourly you asked for, and free). Each item lands in Admin → HomeKids under
**Needs review**. **Approve** puts it on the page; **Discard** keeps it off.
An approved item has **Take down**. Items with a date leave the page on their
own the day after.

The reader is told to leave out children's names, allergies, medical details,
phone numbers and addresses. Approving is still the real check, especially on
the volunteers' side.

## Plug-in 3. The lesson plans (when the director shares the folder)

Run `/new-homekids` with the sheet: a link (if this session has a Google
Drive connector), an exported `.xlsx`, or pasted rows. It writes the guide for
all three groups, shows you the whole thing, waits for a yes, then publishes.
Once a week, the way `/new-sermon` is.

The page always shows the most recent Sunday that has happened, so a lesson
written ahead of time waits for its Sunday. The arrows step back through
earlier weeks, and each week keeps its own ticks.

---

## Decisions worth a second look

- **Volunteer items are visible to anyone who opens the page**, folded under
  *For volunteers*. Admin approval is the filter. If the volunteer email
  carries anything that should only reach the team, the next step is gating
  that section on Leader mode (`HC.store.isLeader()`), a few lines.
- **Ticks are per phone, not per child.** A family with a Champion and a Legend
  shares one list and one card, with an optional name on it ("Ava and Leo").
  Per-child lists are possible later without changing the database.
- **Admins are not pushed** when HomeKids drafts arrive. They see them in Admin
  → HomeKids. A push is a new topic in `send-push` if it turns out to be
  wanted.
