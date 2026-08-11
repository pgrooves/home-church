---
description: Add an event to the Connect tab calendar. Asks for whatever is missing, confirms, then writes.
---

# /new-event

Adds one row to the `events` table, which is what the Connect tab's calendar
reads.

$ARGUMENTS

---

## Step 0. Check the plumbing

Read **`supabase/ACCESS.md`**. It says which of the two transports to use, the
Supabase MCP server or `scripts/hc_supabase.py`, and gives the SQL equivalent
of every script verb below. It also has the SQL form of `when`, which matters
here more than in any other command.

A missing `.env` or a refused connection is the ordinary shape of a web
session, not a reason to stop. Use MCP. Confirm the project ref is
`ibqkumxfltfiuqevviji`, stop only if neither transport is available, and never
ask for a key in the chat.

## Step 1. Collect the details

Six fields. Take whatever came in with the command, then ask for the rest in
one message rather than one at a time. Nobody wants six rounds of questions to
add a coffee hour.

| Field | Required | Notes |
|---|---|---|
| Title | yes | What it is called on the calendar |
| Date and time | yes | Church local time, New Orleans, never UTC in conversation |
| Location | yes | `216 Giuffrias Ave`, or a room like `The Loft, upstairs` |
| Description | yes | The warm paragraph people actually read |
| Signup | no | A link, or a capacity, or nothing at all |
| Category | no | `gathering`, `serve`, `next-step`, `class`, `kids` |

Two things worth asking about specifically, because they are the ones that
come back later as corrections:

- **An end time**, if it has one. `ends_at` is optional and most events do not
  need one, but a serve day does.
- **Events without a clock time.** "All three services" is a real value on
  this calendar and it is not a timestamp. When that is the answer, still pick
  an anchor time so the event sorts to the right place in the day, and put the
  human phrase in `time_label`. The app shows `time_label` when it is set.

Do not invent a date, a room, or a signup link. Ask.

## Step 2. Write the description in the church's voice

This is the one field with real writing in it, and it goes out under the
church's name.

- Warm, second person, contractions. "If you are ready, we would love to get
  in the water with you," not "Registration is now open for the baptism
  service."
- **Zero em-dashes.** Use commas. Check before writing.
- One exclamation mark at most, across the whole thing.
- No fake urgency, no countdown language, no guilt.
- Two or three sentences. The existing events in `js/data.js` are the length
  reference.

## Step 3. Convert the time

`starts_at` is stored in UTC. New Orleans is UTC-5 in summer and UTC-6 in
winter, so do not do this conversion by hand:

```bash
python3 scripts/hc_supabase.py when 2026-08-20 19:00
# 2026-08-21T00:00:00+00:00
```

Note that an evening event correctly lands on the next calendar day in UTC.
That is right, and it is exactly the thing that looks like a bug and gets
"fixed" into a real one.

## Step 4. Pick an id

Kebab case, `event-` prefixed, two or three words. `event-baptism`,
`event-serve-day`, `event-newcomers`.

For something recurring, put the date in the slug so next year's does not
collide: `event-serve-day-2026`.

Check it is free:

```bash
python3 scripts/hc_supabase.py select events --eq id=event-your-slug --columns id
```

## Step 5. Confirm before writing

**Always show the finished row and wait for a yes.** This is a required step,
not a courtesy. Show it as plain facts, with the time in church local time,
not the UTC value, because that is what the person can actually check:

```
Title       Baptism Sunday
When        Sunday, August 23 2026, all three services
Where       216 Giuffrias Ave
Signup      none
Category    gathering

If you are ready, we would love to get in the water with you. Tell us by the
Sunday before and we will handle the rest, towel included.

Write it?
```

## Step 6. Write it

```bash
python3 scripts/hc_supabase.py upsert events /tmp/event-your-slug.json
```

The row:

```jsonc
{
  "id": "event-baptism",
  "title": "Baptism Sunday",
  "description": "...",
  "starts_at": "2026-08-23T14:30:00+00:00",
  "ends_at": null,
  "time_label": "All three services",   // null when the clock time is the whole story
  "location": "216 Giuffrias Ave",
  "signup_url": null,
  "capacity": null,
  "category": "gathering",
  "published": true
}
```

Set `"published": false` to stage something not announced yet. The app cannot
see it, you still can.

## Step 7. Confirm, briefly

```
Added  Baptism Sunday
Sunday, August 23 2026, 216 Giuffrias Ave
```

Two lines and stop.

---

**This reaches phones on its own.** The Connect tab reads `HC.data.events`,
and `js/content.js` fills that from the `events` table on every app open. So
an event written here shows up on the next open, with no matching edit in
`js/data.js` and no `?v=N` bump in `index.html`. Do not add it to
`js/data.js`, that is how the catalogue ends up in two places again.
