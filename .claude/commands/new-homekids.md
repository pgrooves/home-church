---
description: Turn the HomeKids director's lesson plan into this week's kids guide on the HomeKids page. Reads the sheet, writes for all three age groups, confirms, then publishes.
---

# /new-homekids

Writes one row to `homekids_lessons`, which is what the HomeKids page behind
••• reads: the Bible story retold for kids, the big idea, the memory verse,
questions and an activity for each of the three groups, a prayer, and the
checklist a family ticks off during the week and shows the teacher next Sunday
for a prize. Migration `0081_homekids.sql` is the table.

Run it with the lesson plan, however it arrives:

```
/new-homekids https://docs.google.com/spreadsheets/d/...      a sheet in the shared folder
/new-homekids ~/Downloads/HomeKids Oct 4.xlsx                  an exported copy
/new-homekids <pasted rows>                                    copied out of the sheet
```

$ARGUMENTS

---

This is the kids' version of `/new-sermon`: the source is a teacher's plan
rather than a transcript, and the reader may be four years old. The guide is
a companion for the week AFTER the lesson is taught, so a family can go back
over it together at the table, in the car, at bedtime.

## Step 0. Check the plumbing

Read **`supabase/ACCESS.md`** and follow it, Supabase MCP server first, the
script second. Confirm the project ref is `ibqkumxfltfiuqevviji`. Stop only if
neither transport is available, and never ask for a key in the chat.

## Step 1. Read the lesson plan

The director shares a Google Drive folder of sheets, one per Sunday or one tab
per Sunday. Read it in this order of preference:

1. **A Google Drive or Sheets connector**, if this session has one. Read the
   sheet the link points at; if it is the folder, list it and pick the sheet
   for the Sunday asked about, or the newest one, and say which you picked.
2. **An exported file** (`.xlsx` or `.csv`): read it with the xlsx skill.
3. **Pasted rows**: use them as given.

If none of those works, ask for an export rather than guessing at a lesson.

What to pull out, whatever the sheet calls its columns:

| Field | Usually in the sheet as |
|---|---|
| Sunday | date, week of |
| Title | lesson title, story |
| Passage | scripture, Bible passage |
| Big idea | bottom line, main point, key truth |
| Memory verse | memory verse, verse of the month |
| Per-group notes | Champions / Heroes / Legends / Warriors columns or tabs, questions, activity, craft, game |

The sheet is for teachers, not families. It has room setups, supply lists and
timing that do not belong on the page. Leave them out.

## Step 2. Gemini writes the guide

**Gemini writes every HomeKids guide. Do not write one yourself.** The words
families read come from the same Gemini prompt the hourly Drive watcher uses,
so a lesson sent by hand and a lesson from the folder read the same and are
reviewed the same way. That prompt, its rules for each age group and the
checklist live in `supabase/functions/homekids-drive/index.ts`.

Send the lesson's text to the `homekids-drive` function as `lesson`, the same
way the hourly tick reaches it: from SQL, with the cron secret read out of the
vault so it never appears in the chat.

```sql
select net.http_post(
  url := 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/homekids-drive',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-hc-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                          where name = 'hc_newsletter_cron_secret')),
  body := $hk${"lesson": {"name": "<file name>", "header": "<header line>",
    "text": "<the lesson text>"}}$hk$::jsonb,
  timeout_milliseconds := 150000);
-- then, a minute later:
select content from net._http_response where id = <the id it returned>;
```

Without `"save": true` that is a preview and nothing is written. If Gemini is
busy (503) or runs out of room, the reply lists every model it tried and why;
wait a few minutes and send it again rather than writing the guide another way.

## Step 3. Show it and wait

Show Gemini's guide as the page would read it, top to bottom: the big idea,
the first note to parents (what the kids learned), the story, each group's
questions and activity, the prayer, the second note to parents (the bedtime
question), and the line saying which Gemini model wrote it. Every guide has
both notes to parents; the schema requires them. **Wait for a yes.**

## Step 4. Save it for approval

Send the same request again with `"save": true`. It lands in Admin, HomeKids,
Lessons to review, where Approve puts it on the page. Do not write to
`homekids_lessons` directly.

## Step 5. Confirm

Two or three lines: the title, the Sunday, and that it is on HomeKids. Stop.

## What not to do

- Do not copy the teacher's supply list, room setup or timings onto the page.
- Do not change a checklist item's `id` on a lesson already published.
- Do not put a lesson on a Sunday it was not taught. A week runs Monday to
  Sunday and the page shows that week's Sunday, so a lesson published two
  weeks early simply waits for its week.
