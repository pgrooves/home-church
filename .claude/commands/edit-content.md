---
description: Fix any published content by describing the change in plain language. Shows current versus proposed, writes only after you confirm.
---

# /edit-content

The general purpose fixer. Describe an edit the way you would say it out loud
and this finds the row, shows you exactly what would change, and writes only
after you say yes.

```
/edit-content fix the typo in this week's guide, "their" should be "there"
              in the second discussion question
/edit-content move Thursday's event to 7pm instead of 6:30
/edit-content the Spotify link on last Sunday's episode is wrong, here's the right one
/edit-content unpublish the serve day event, it got cancelled
```

$ARGUMENTS

---

## Step 0. Check the plumbing

```bash
python3 scripts/hc_supabase.py check
```

Missing `.env` or missing tables means stop. A refused connection means this
is a web session and the proxy blocks `supabase.co`, so the edit has to be
made from the pastor's own machine.

## Step 1. Work out which table

Usually obvious from the words used:

| They said | Table |
|---|---|
| guide, question, one-liner, summary, reflection, scripture index | `guides` |
| event, calendar, signup, "Thursday's thing" | `events` |
| episode, podcast, Spotify link, sermon title | `podcasts` |
| series, the current series, series art | `series` |

Ambiguous cases worth slowing down on:

- **"The sermon title"** lives on `podcasts.title`, never on the guide. The
  guide inherits its name. Changing it on the guide would create a second
  copy of the name and break the inheritance the whole design depends on.
- **"This week's guide"** means the most recent by `preached_on`, not the most
  recently created.

If you genuinely cannot tell, ask. One short question beats editing the wrong
row.

## Step 2. Find the row

Search rather than guess.

```bash
# Most recent, when they said "this week's" or "last Sunday's"
python3 scripts/hc_supabase.py select guides --order preached_on.desc --limit 5 \
  --columns id,subtitle,preached_on,preacher_short

# By name, case insensitive contains
python3 scripts/hc_supabase.py select events --ilike title=serve

# Upcoming events, when they said a weekday like "Thursday's"
python3 scripts/hc_supabase.py select events --order starts_at.asc --limit 10 \
  --columns id,title,starts_at,time_label,location
```

- **Exactly one match**: go on to Step 3.
- **More than one**: show them with enough detail to tell apart, dates and
  titles, and ask which one. Never pick the first and hope.
- **None**: say so plainly. Do not create the row. `/edit-content` edits, it
  does not publish. That is what `/new-guide`, `/new-event`, and
  `/new-podcast` are for.

## Step 3. Read the whole row before changing anything

```bash
python3 scripts/hc_supabase.py select guides --eq id=guide-slow-burn
```

This matters most for the jsonb columns on `guides`, the ones holding the
sections. To change the second discussion question you have to read
`group_sections`, find the actual question, and count carefully.

**"The second discussion question" is ambiguous and gets it wrong half the
time.** It could mean the second question in the whole guide, or the second
question in the section they are looking at. Read both candidates and quote
them back. If they are different questions, ask which one, do not pick.

## Step 4. Show current versus proposed

**This is the whole point of the command. Always show it, and always wait.**

Quote the exact current value and the exact proposed value. Not a description
of the change, the values themselves, so a wrong guess is obvious on sight:

```
guides / guide-slow-burn
group_sections[3].questions[1]

now       Where in your week do you notice their patience with you?
proposed  Where in your week do you notice there patience with you?
```

Wait. If that example looks backwards, that is the point, this display is what
catches it before it is published.

For a time change, show church local time, not the UTC value, because that is
what the person can actually verify:

```
events / event-serve-day
starts_at

now       Thursday, September 10 2026, 6:30 PM
proposed  Thursday, September 10 2026, 7:00 PM
```

## Step 5. Write only the columns that changed

```bash
# A plain column
python3 scripts/hc_supabase.py update events event-serve-day \
  '{"starts_at": "2026-09-11T00:00:00+00:00"}'

# A jsonb column, read-modify-write, the whole array with one value changed
python3 scripts/hc_supabase.py update guides guide-slow-burn /tmp/patch.json
```

Two rules, and they are not style preferences:

1. **Patch, never re-upsert.** `update` touches only the columns named.
   Re-publishing the whole row through `upsert` to fix one typo will quietly
   blank every column not included in the payload.
2. **Read-modify-write for jsonb.** Postgres has no partial array update
   here. Take the array that came back in Step 3, change the one element, and
   send the entire array back. Do not hand build a fresh array from memory,
   that is how the other seventeen questions get lost.

For a time change, convert with the helper rather than by hand:

```bash
python3 scripts/hc_supabase.py when 2026-09-10 19:00
```

## Step 6. The house rules still apply

Any text going in is content going out under the church's name:

- **Zero em-dashes.** If they hand you a replacement line containing one,
  swap it for a comma and mention that you did.
- First name only wherever a preacher is shown.
- Second person, contractions, warm and direct.
- If a fix would break a section quota, an eighth reflection question deleted
  down to seven, say so before writing rather than after.

**Ids never change.** If the edit implies renaming a slug, do not. Leader
checkmarks and journal entries on people's phones are keyed to the id. A slug
that no longer matches its title is fine, orphaned notes are not.

## Step 7. Unpublishing

To pull something without deleting it:

```bash
python3 scripts/hc_supabase.py update events event-serve-day '{"published": false}'
```

The app stops seeing it immediately, and it stays fully readable to you. Prefer
this to deleting, every time. There is no delete in the CLI on purpose.

## Step 8. Confirm, briefly

```
Updated  guides / guide-slow-burn
group_sections[3].questions[1], "their" is now "there"
```

Two lines and stop.

---

**This reaches phones on its own.** `js/content.js` fetches every content
table on open and swaps the rows into `HC.data`, so an edit made here is on
every phone the next time the app opens. No matching edit in `js/data.js`, no
`?v=N` bump in `index.html`, no build. A Saturday night typo fix is now just
this command.

The one thing worth saying in the confirmation is that it lands on next open
rather than instantly, because a phone sitting open on the guide already will
not change under the reader.
