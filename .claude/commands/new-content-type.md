---
description: Scaffold another content type, its table, app wiring, and slash command, following the pattern the existing ones use.
---

# /new-content-type

Adds a whole new kind of content, staff bios, serve teams, whatever comes
next, by copying the pattern the existing types already use. Run it with the
name of the thing:

```
/new-content-type announcements
/new-content-type staff bios
```

$ARGUMENTS

---

This exists so that adding a fifth content type is a fifteen minute job with
an obvious shape, rather than a design exercise every time. Everything below
is mechanical. If a step needs a decision, the answer is "do what `events`
does."

## Step 1. Settle the shape

Ask for the columns if they were not given. Keep it to what a screen actually
displays. A column nobody renders is a column somebody has to maintain.

Then apply the house rules, which are not negotiable per table:

- **The id is a readable text slug**, singular-prefixed and permanent.
  `announcement-serve-day`, `staff-laura-daigle`. Never a uuid. Ids key things
  stored on people's phones, and they never get renamed to follow a title.
- **Plain values get real Postgres types.** Dates are `date`, times are
  `timestamptz` in UTC, links are `text`.
- **Lists and nested shapes go in `jsonb`**, with a `jsonb_typeof(...) =
  'array'` check constraint. The constraint catches the one mistake that
  actually happens, a bare string sent where a list was expected, which
  renders as nothing and is invisible until somebody opens the screen.
- **Every table gets `published`, `created_at`, `updated_at`.** No exceptions.
  `published` is what gives you a draft state for free.

## Step 2. Write the migration

```bash
cp supabase/migrations/TEMPLATE_new_content_type.sql \
   supabase/migrations/0003_announcements.sql
```

Replace `THING` with the table name throughout, fill in the columns, and add
indexes for whatever the app sorts or filters on.

Do not write a second `updated_at` function. The template attaches to
`public.hc_set_updated_at()` from `0001`, which is shared by every table.

Do not write an insert, update, or delete policy. The template turns row level
security on and adds a select policy only. That is what makes the table
service-role-write-only, because the service role bypasses row level security
entirely, so leaving the write policies out is the mechanism, not an
oversight. The long version is in `0001`, section 7.

## Step 3. Run it

Paste the file into the Supabase SQL editor and run it, or use
`mcp__Supabase__apply_migration` with the file's contents. Use
`apply_migration` rather than `execute_sql` for anything that creates or
alters a table.

Then confirm the table is there, whichever way `supabase/ACCESS.md` says to
reach the project. It will not be flagged as a content table until Step 4.

## Step 4. Register it in the CLI

Two small edits, in `scripts/hc_supabase.py`:

```python
CONTENT_TABLES = ["series", "guides", "podcasts", "events", "announcements",
                  "reading_plans"]
```

and a probe row in `PROBE_ROWS` for the new table, which has to be a valid
row: `verify` inserts it as an anonymous user and needs the write refused on
permissions, so a payload that fails validation first would prove nothing.
Give it whatever the not-null columns and check constraints demand, and
nothing else.

Those are the only changes that file ever needs. `check`, `verify`, `select`,
`upsert`, and `update` all pick the new table up from that list.

## Step 5. Wire it into the app

**Do not skip this one.** Everything up to here gives you a table the CLI can
write and the app never reads. A content type that is not registered in
`js/content.js` is invisible on a phone no matter how good the row is, and the
failure is silent: publishing appears to work and nothing changes on screen.

Two edits, next to the existing ones:

```js
var TABLES = [
  ...
  { table: 'your_table', target: 'yourThing', map: mapYourThing }
];
```

and a mapper beside the others. Every mapper is total, it fills every field
the screens read with a sane empty value rather than undefined, so a half
filled row degrades to a quiet gap instead of `undefined` rendered on a card
in front of a congregation. `str()` and `arr()` are there for that.

`target` is the key on `HC.data` the rows land in, and it has to already
exist there, because `fill()` replaces an array's contents rather than the
array itself. That is the whole trick that lets `js/data.js` keep working as
the cold start seed.

**If the app reads one object rather than a list**, the way Home reads one
reading plan, add `single: true` to the spec. The row flagged `is_current`
becomes the object, and `fillOne()` edits it in place for the same reason
`fill()` does not replace arrays. Handle the empty case on screen: no row
should render nothing, not `undefined`.

Then bump `CACHE_VERSION` at the top of the file. Any change to the shape of
what a mapper returns needs it, or phones will apply a cached payload that
predates the new fields.

## Step 6. Write the slash command

Copy `.claude/commands/new-event.md`, it is the simplest one and the closest
to a template. Keep its bones, they are the same every time:

0. Check the plumbing the way `supabase/ACCESS.md` describes, trying the
   Supabase MCP server before the script, and stop only when neither
   transport is available
1. Collect the fields, asking for everything missing in one message rather
   than one at a time
2. Write any prose in the church's voice, **zero em-dashes**, first name only
   for preachers, no fake urgency, no guilt
3. Pick a permanent slug id and check it is free
4. **Show the finished row and wait for a yes**
5. `upsert`
6. Confirm in two or three lines and stop, no postamble

## Step 7. Seed it, if there is existing content

If this content type already lives in `js/data.js`, add a mapping block to
`scripts/export_seed.js` next to the other four. It reads `js/data.js` through
Node and writes Supabase shaped JSON into `supabase/seed/`, so the new table
starts life holding the real content rather than empty.

## Step 8. Update the docs

Two files, both short:

- `supabase/README.md`, add the table to the list with a one line description
- The root `README.md`, add the command to the commands list

## What not to do

- Do not add a `delete` path. Unpublishing with `{"published": false}` is
  reversible, and deletes are not. There is no delete in the CLI on purpose.
- Do not write a new client for Supabase. There are two transports and
  `supabase/ACCESS.md` describes both: the Supabase MCP server, and
  `scripts/hc_supabase.py`, which is the only thing in this repo holding the
  service role key. A third means a third place to get the security wrong.
- Do not add the plumbing instructions to your new command. Point at
  `supabase/ACCESS.md` the way the others do, so there is one copy to keep
  right.
- Do not put media in Supabase storage. External links, the way podcasts
  does. That was a cost decision and it is still right.
