---
description: One-page app report for the pastor. Counts from the database and GitHub, as a branded PDF, sent to Trey.
---

# /report

A one-page PDF for the pastor covering the last 14 days: accounts,
notifications, group rooms, journal, cafe, what was published, what's coming
up, and the state of the app. Every number has a "last time" next to it where
that means something.

It is read-only. Nothing is written to the database, and nothing is asked:
run it start to finish.

$ARGUMENTS

---

## Steps

1. **Numbers from the database.** Run `scripts/report.sql` exactly as it is,
   with `execute_sql` on project `ibqkumxfltfiuqevviji`. It is one `select`.
   Save the value of its `report` column, unchanged, to `reports/db.json`.
   Never add a query that returns a name, an email, or anything somebody
   wrote: the privacy policy promises the app doesn't track anyone, and the
   footer of the page says so too.

2. **Make the PDF.**

   ```bash
   node scripts/make_report.js --db reports/db.json
   ```

   It adds what comes from the repository by itself: changes on `main` in
   the period, from git (it deepens a shallow clone as needed), and the App
   Store version from `RELEASES.md`. It writes
   `reports/Home Church report <date>.pdf` and a `.png` of the same page.

3. **Look at the PNG** before sending. One page, nothing cut off, nothing
   that obviously doesn't add up (a total smaller than its "new", a feed
   flagged as not updating). If something is off, say so in one line next
   to the file. Don't hold the report back over it.

4. **Send the PDF** to Trey with `SendUserFile` (`status: proactive` when
   this is the scheduled run). Caption: `App report, <period>`. Then a
   reply of no more than three short lines: the two or three numbers that
   moved most, and anything flagged.

`reports/` is git ignored. The repository is public, so never commit a
report or `db.json`.

## What each number means

| On the page | Where it comes from |
|---|---|
| Accounts | `auth.users`, minus the two App Review demo accounts |
| Phones getting notifications | Active `device_tokens` |
| Notifications delivered | `push_log`, church topics only (no admin review alerts, no tests) |
| People who signed in | `last_sign_in_at` in the period. A new sign-in, not an app open: the app doesn't record opens |
| Group rooms, joins, notes | `group_rooms`, `group_room_members`, `group_room_notes` (removed notes left out) |
| Journal writers | People with at least one entry in the period. Counted, never read |
| Cafe orders | Square production orders that were paid. Sandbox orders are tests |
| Messages to the office | `contact_messages` |
| Published | Rows created in the period and published |
| Coming up | Approved events in the next 14 days, first four |
| Improvements made | Non-merge commits on `main` in the period |
| Automatic updates | Instagram, TikTok and newsletter syncs. "Not updating" if a feed has had no successful run for 6 hours |

## The schedule

A scheduled task runs this every other Sunday at about 6am Central and
sends the PDF to Trey, who forwards it to the pastor.
