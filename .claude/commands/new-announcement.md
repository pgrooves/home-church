---
description: Publish the One thing card on Home. Asks for what is missing, confirms, then writes.
---

# /new-announcement

Adds one row to the `announcements` table, which is the single "One thing"
card at the top of Home.

$ARGUMENTS

---

## Step 0. Check the plumbing

Read **`supabase/ACCESS.md`**. There are two transports and it says which to
use: the Supabase MCP server when it is there, `scripts/hc_supabase.py` when
you have `.env` and a shell. Every command below is written in the script's
verbs, and that file has the SQL equivalent of each one.

Most sessions on this app are web sessions from a phone, where `.env` does not
exist and the proxy blocks `supabase.co`. That is the normal case, not a
failure. Use MCP and carry on.

Confirm the project ref is `ibqkumxfltfiuqevviji`, the one `js/config.js`
reads. Only stop if neither transport is available, and never ask for a key in
the chat.

## Step 1. Collect the details

| Field | Required | Notes |
|---|---|---|
| Title | yes | `City Serve Day, September 12`. The thing itself, with its date in it |
| Body | yes | One or two sentences, what to do about it |
| Eyebrow | no | Defaults to `One thing`. Rarely worth changing |
| Runs from | no | Null shows it immediately |
| Runs until | no | Null runs until you take it down |

**Ask about the end date specifically.** It is the field that makes this
hands off, and it is the one nobody thinks to give you. An announcement for a
September 12 serve day should stop showing on September 13, and setting
`ends_on` now means nobody has to remember to come back and remove it.

## Step 2. Write it in the church's voice

Home shows one announcement at a time, so this is the single most read piece
of copy in the app. It has to earn the slot.

- Warm, second person, contractions. "Four sites, one Saturday, every hand we
  can get," not "Volunteer registration is now open."
- **Zero em-dashes.** Use commas.
- One exclamation mark at most, and usually none.
- No fake urgency and no guilt. Never a countdown, never a scolding about low
  signups.
- Two sentences. The existing announcement in `js/data.js` is the length
  reference, and it is the right length.
- Name the concrete next step. "Sign up at the Welcome Desk or tell your
  group leader" is the sentence that does the work.

## Step 3. Pick an id

Kebab case, `announcement-` prefixed. `announcement-serve-day`.

**Ids are permanent.** The app stores "I dismissed this" on each phone keyed
by the announcement id, so reusing an old id means the new announcement is
invisible to everyone who dismissed the old one, and renaming an id makes a
dismissed one reappear. A new announcement always gets a new id, and a
recurring one gets the year in the slug, `announcement-serve-day-2027`.

Check it is free:

```bash
python3 scripts/hc_supabase.py select announcements --eq id=announcement-your-slug --columns id
```

## Step 4. Check what is already running

Home shows one. If another announcement is live in the same window, say so
and ask which should win, then either set `priority` higher on the new one or
unpublish the old one:

```bash
python3 scripts/hc_supabase.py select announcements --eq published=true \
  --columns id,title,starts_on,ends_on,priority
```

## Step 5. Confirm before writing

Show it as it will read on Home, and wait for a yes:

```
One thing
City Serve Day, September 12
Four sites, one Saturday, every hand we can get. Sign up at the Welcome Desk
or tell your group leader.

Runs   now until September 13 2026
Write it?
```

## Step 6. Write it

```bash
python3 scripts/hc_supabase.py upsert announcements /tmp/announcement-your-slug.json
```

```jsonc
{
  "id": "announcement-serve-day",
  "eyebrow": "One thing",
  "title": "City Serve Day, September 12",
  "body": "Four sites, one Saturday, every hand we can get. Sign up at the Welcome Desk or tell your group leader.",
  "starts_on": null,          // null shows it immediately
  "ends_on": "2026-09-13",    // takes itself down, nobody has to remember
  "priority": 0,
  "published": true
}
```

To pull one early, unpublish rather than delete:

```bash
python3 scripts/hc_supabase.py update announcements announcement-serve-day '{"published": false}'
```

## Step 7. Confirm, briefly

```
Published  City Serve Day, September 12
Runs until September 13 2026
```

Two lines and stop.

---

**This one is genuinely live.** Unlike the other content commands, there is no
`js/data.js` half to keep in step. `js/content.js` fetches announcements on
every app open, and an empty result is honored rather than ignored, which is
what lets a dated announcement take itself down. So this writes once and every
phone picks it up the next time the app opens.
