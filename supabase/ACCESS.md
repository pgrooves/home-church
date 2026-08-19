# Two ways to reach Supabase

Every slash command in `.claude/commands/` needs to read and write the content
tables. There are two transports for that, and which one is available depends
entirely on where the session is running. Check for one, fall back to the
other, and only stop if neither works.

This file is the single place that knowledge lives. The commands point here
rather than each carrying their own copy, so the two cannot drift.

---

## Which transport

**Try the Supabase MCP server first.** It is the one that works from a phone,
and this app is largely built from one. It reaches the project over Anthropic's
own path, so the egress proxy that blocks `supabase.co` in web sessions does
not apply. If `mcp__Supabase__execute_sql` is available, use it.

**Otherwise use `scripts/hc_supabase.py`.** It needs `.env` at the repo root
and a shell to run in, which means a real machine. It is the better tool when
you have it: the verbs are shorter, `upsert` refuses a row with no `id`, and
nothing has to be hand quoted.

**If neither is available**, say so plainly and stop before writing anything.
Do not fall back to editing `js/data.js`. That file is the cold start seed, not
a content store, and writing to it is what put the catalogue in two places.

Symptoms worth recognizing, so you do not misdiagnose them:

| What you see | What it means |
|---|---|
| `.env not found at the repo root` | No credentials here. Web session. Use MCP. |
| `CONNECT tunnel failed, response 403` | The proxy blocks `supabase.co`. Not a flaky network, do not retry. Use MCP. |
| MCP server needs authorization | Not connected on this account. Use the script, or ask the pastor to connect it. |

The project ref is **`ibqkumxfltfiuqevviji`**, "Home Church App". It is the one
`js/config.js` points at. Confirm you are writing to that ref and not another
project before any write.

---

## The same operation, both ways

`hc_supabase.py` verbs map onto SQL one for one.

### Check the plumbing

```bash
python3 scripts/hc_supabase.py check
```

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

### Read rows

```bash
python3 scripts/hc_supabase.py select events --eq id=event-serve-day
python3 scripts/hc_supabase.py select guides --order preached_on.desc --limit 5
```

```sql
select * from events where id = 'event-serve-day';
select * from guides order by preached_on desc limit 5;
```

### Insert or overwrite by id

```bash
python3 scripts/hc_supabase.py upsert events /tmp/event.json
```

```sql
insert into events (id, title, starts_at, published)
values ('event-serve-day', 'City Serve Day', '2026-09-12T14:00:00+00:00', true)
on conflict (id) do update set
  title = excluded.title,
  starts_at = excluded.starts_at,
  published = excluded.published
returning id, title;
```

List only the columns you are setting. Naming every column and passing null
for the ones you do not care about will overwrite real values with null and
trip the not-null defaults on `created_at`.

### Patch one row

```bash
python3 scripts/hc_supabase.py update events event-serve-day '{"published": false}'
```

```sql
update events set published = false where id = 'event-serve-day'
returning id, published;
```

Always `returning` something. An `update` against an id that does not exist
succeeds and changes nothing, and without a returned row you will report a
write that never happened. The script catches this for you and raw SQL does
not.

### Church local time to the UTC value `events.starts_at` wants

```bash
python3 scripts/hc_supabase.py when 2026-08-20 19:00
```

```sql
select (timestamp '2026-08-20 19:00' at time zone 'America/Chicago');
-- 2026-08-21 00:00:00+00
```

Ask, do not do the arithmetic. New Orleans is UTC-5 in summer and UTC-6 in
winter, and Postgres knows which without being told. `2026-12-24 17:00` comes
back as `2026-12-24 23:00+00`, an hour different from the same clock time in
August, which is exactly the mistake that puts a Christmas Eve service on the
wrong day.

### Let somebody host a group room

```bash
python3 scripts/hc_supabase.py host someone@example.com on
python3 scripts/hc_supabase.py host someone@example.com off
```

This is the one thing in the app that is deliberately not self service, see
migration 0016: hosting a room is real authority over other people's writing,
so the church grants it rather than a switch in Profile. The command looks
the person up by the email they signed in with and flips
`public.profiles.can_host`. They need to have signed in at least once already,
because that is what creates the profile row.

No script or MCP access? Ask them their `id` and use `mcp__Supabase__execute_sql`:

```sql
update public.profiles set can_host = true where id = '<uuid>';
```

### Run a migration

```bash
python3 scripts/hc_supabase.py apply supabase/migrations/0004_reading_plans.sql
```

Use `mcp__Supabase__apply_migration`, not `execute_sql`, for anything that
creates or alters a table. Paste the migration file's contents as the query and
name it after the file.

---

## Writing SQL by hand, safely

The script took JSON and handled quoting. Raw SQL does not, and this content is
full of apostrophes.

**Dollar quote every piece of prose.** A guide body containing `God's` will end
a `'...'` string early and produce either a syntax error or, worse, valid SQL
that writes the wrong thing:

```sql
update guides set subtitle = $hc$What God's kindness actually costs$hc$
where id = 'guide-slow-burn' returning id;
```

`$hc$` is arbitrary, it just has to not appear in the text. Use it for anything
a human wrote, every time, even when the string looks safe today.

**Pass jsonb columns as a dollar quoted literal with a cast**, which is how the
list and nested shapes on `guides` and `reading_plans` go in:

```sql
update reading_plans
set resources = $hc$[{"label": "The Bible Project", "url": "https://..."}]$hc$::jsonb
where id = 'plan-david' returning id;
```

**Nothing here relaxes the rules in the command you are running.** The service
role bypasses row level security entirely, so raw SQL will happily do things
the app never could. The id conventions in `supabase/README.md`, the em-dash
rule, the confirm-before-writing step, and "ids are permanent" all still apply,
and they matter more here because there is no script refusing a malformed row
on your behalf.

**Read back what you wrote.** One `select` after the write, showing the row as
it now stands, before you tell anyone it is published.
