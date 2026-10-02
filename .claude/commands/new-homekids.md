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

## Step 2. Write the guide

The house voice, turned toward kids. Every rule from `/new-sermon` still holds,
**zero em-dashes** above all, and these on top:

- **Short sentences, everyday words.** Read every line as if aloud to a four
  year old, then check a twelve year old would not roll their eyes.
- **No fear, no guilt, no shame.** A storm can be scary in the story; the kid
  reading is never told they are bad or behind.
- **First names only for anybody at church**, and no child's name, ever.

Fields, in the shape the table wants:

- `title`, `passage`, `taught_on` (the Sunday, `YYYY-MM-DD`)
- `big_idea`: one sentence a Champion can say back. Eight words is plenty.
- `memory_verse`: `{ "text", "reference" }`, in a kid-friendly translation
  (NIrV or ICB). If the sheet gives a verse, use it word for word.
- `story`: two to four short paragraphs retelling the passage. Faithful to the
  text, nothing added that is not in it.
- `groups`: one block per group, all three, every week:
  - `champions` (ages 3 to 4): two or three questions a preschooler can answer
    with a word or a point, and an activity with the hands, a game, a motion.
  - `heroes` (ages 5 to 6): three questions, one of them about their own week;
    an activity they can mostly do on their own.
  - `legends` (Legends + Warriors, 7 to 12): three or four questions with room
    to think, one that asks them to do something for somebody else; an
    activity with a little challenge in it.
  Use the sheet's own questions and activities first, rewritten for a family at
  home rather than a classroom. Write new ones only where the sheet has none.
- `checklist`: three or four things a family does together during the week.
  Short, doable, and the same for every group, because the teacher checks one
  list. Each has a permanent `id`, a short word: `story`, `verse`, `talk`,
  `pray`, `kind`, `try`. Keep the ids the same from week to week where the
  meaning is the same; they key the ticks on people's phones.
- `prayer`: two or three sentences a kid can pray, ending in Amen.
- `parent_note`: one or two sentences to the grown up. What was taught, and
  one question to ask at bedtime.
- `source_url`: the sheet's link, if there is one. Not shown on the page.

The id is `homekids-` plus the Sunday: `homekids-2026-10-04`. Check it is free.

## Step 3. Show it and wait

Show the finished row as the page would read it, top to bottom: the big idea,
the story, the verse, each group's questions and activity, the prayer, the
checklist, the note to parents. Then the JSON. **Wait for a yes.**

## Step 4. Publish

`upsert homekids_lessons` with `published: true`. The page picks it up on the
next content refresh; nothing else needs touching.

## Step 5. Confirm

Two or three lines: the title, the Sunday, and that it is on HomeKids. Stop.

## What not to do

- Do not copy the teacher's supply list, room setup or timings onto the page.
- Do not change a checklist item's `id` on a lesson already published.
- Do not put a lesson on a Sunday it was not taught. The page shows the most
  recent Sunday that has happened, so an early publish simply waits.
