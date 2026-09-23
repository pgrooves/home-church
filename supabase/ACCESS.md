# Two ways to reach Supabase

Every slash command in `.claude/commands/` needs to read and write the content
tables. There are two transports for that, and which one is available depends
entirely on where the session is running. Check for one, fall back to the
other, and only stop if neither works.

This file is the single place that knowledge lives. The commands point here
rather than each carrying their own copy, so the two cannot drift.

---

## Which transport

**Try `scripts/hc_supabase.py` first.** It takes the service role key from
`.env` at the repo root, or from `SUPABASE_SERVICE_ROLE_KEY` in the
environment, and the project URL from `js/config.js`. The verbs are short,
`upsert` refuses a row with no `id`, and nothing has to be hand quoted.

**This used to say to try MCP first, and that was wrong for three reasons**,
all of which cost a week between them:

- **It is not available everywhere.** A connector is enabled per chat, so a
  scheduled session never has it and cannot be given it. The script runs
  anywhere there is a shell.
- **It prompts.** `Bash(python3 scripts/hc_supabase.py:*)` is allowlisted in
  `.claude/settings.json`, so the script asks nobody for anything. An MCP tool
  call puts an Allow once dialog in front of the pastor for every read and
  every write, and on a phone there is no "don't ask again" on it.
- **It was two code paths.** The same publish behaved differently on a Sunday
  and on a Tuesday, which is exactly where a difference hides until it
  matters.

**Fall back to the Supabase MCP server** when the script cannot run: no shell,
no key, or a repo you are not standing in. If `mcp__Supabase__execute_sql` is
available it reaches the same project and writes the same rows.

**`supabase.co` is reachable from a web session.** An earlier version of this
file said the egress proxy blocks it and that MCP was the way around. That is
no longer true here: the script talks to `https://<ref>.supabase.co` directly
and so does the narration upload. Do not plan around a block that is not
there, and do not reintroduce that claim without testing it first.

**If neither is available**, say so plainly and stop before writing anything.
Do not fall back to editing `js/data.js`. That file is the cold start seed, not
a content store, and writing to it is what put the catalogue in two places.

Symptoms worth recognizing, so you do not misdiagnose them:

| What you see | What it means |
|---|---|
| `SUPABASE_URL not set` (or the key) | No credentials on this machine or in this environment. Use MCP. |
| `CONNECT tunnel failed, response 403` | The proxy blocks `supabase.co`. Not a flaky network, do not retry. Use MCP. |
| MCP server needs authorization | Not connected on this account. Use the script, or ask the pastor to connect it. |

## The scheduled session, where neither transport used to exist

A session nobody opened, fired by a Routine, is the one case where both
transports used to be missing at once, and it is worth knowing why because the
answer is not obvious from either half.

**MCP is per chat, not per account.** The Supabase connector is connected at
the org level and still arrives disabled in a fired session, because enabling
it is something a person does in a conversation and a scheduled run has no
conversation. A Routine created from inside a session cannot carry a connector
grant with it either. So `mcp__Supabase__*` is simply absent there.

**And there is no `.env`**, because `.env` is git ignored and the container is
a fresh clone.

That combination is "neither transport," and a Tuesday routine reported it
every week rather than doing its job.

**One environment variable is the way through**, set on the environment rather
than in a file, because those reach every session in it including the ones
nobody opened:

```
SUPABASE_SERVICE_ROLE_KEY=<the service_role key>
```

**That is the whole list.** `SUPABASE_URL` is not needed and should not be set:
`hc_supabase.py` falls back to the URL in `js/config.js`, which is committed,
served to every phone, and therefore no secret at all. One thing to configure
instead of two, and the URL cannot drift from the app because it is the app's
own value rather than a second copy of it.

The order is `.env`, then the environment, then `js/config.js` for the URL
alone. A machine with a real `.env` behaves exactly as it always did, a `.env`
deliberately pointed at another project still wins, and nothing about any of
this changes what a command does with the data.

**The key is never derived.** No file in this repo holds it and none should.
If it is missing the script refuses and says so.

**`SUPABASE_SERVICE_ROLE_KEY` bypasses row level security**, which is the whole
reason it can write the content tables, and putting it on the environment means
every session in that environment can write every table. That is the same trust
already given to a `.env` on the pastor's laptop, and it is worth saying out
loud rather than discovering. It never belongs in `js/config.js`, in anything
the app downloads, or in the repo.

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

### Turn Leader mode on for somebody

**An admin does this from their phone**, which is the point of it: Admin →
Manage users → the Leader mode switch on their row. Everything below is the
way in when nobody is an admin yet, or when the app is not the thing that is
working.

```bash
python3 scripts/hc_supabase.py host someone@example.com on
python3 scripts/hc_supabase.py host someone@example.com off
```

Leader mode is deliberately not self service, see migrations 0016 and 0036: a
leader hosts a room, edits the questions their whole group answers, and can
take down anything anybody wrote in one, which is real authority over other
people's writing. It was a switch in Profile once and is not any more. The
command looks the person up by the email they signed in with and flips
`public.profiles.can_host`, the column Leader mode is kept in. They need to
have signed in at least once already, because that is what creates the profile
row.

Admins host without it. `hc_is_leader()` is `can_host or role = 'admin'`, so
there is nothing to grant an admin.

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

---

## What neither transport can do: Storage

Both transports above reach Postgres. Neither reaches Storage.

`hc_supabase.py` has no upload verb, and the MCP server has no Storage tool at
all, so there is no way to put a file in a bucket from a web session. The
buckets are `instagram`, `announcements` and `narration`, and everything that
fills them is a script run on a real machine with the service role key:
`scripts/upload_narration.js` for the guide audio, the Instagram sync for the
images.

This is worth knowing before you promise anything. A guide can be published
over MCP from a phone in full, and its narration cannot. The row and the audio
are two different writes to two different systems, and only one of them travels.

| What you see | What it means |
|---|---|
| `CONNECT tunnel failed, response 403` to `supabase.co` on an upload | Same proxy, same answer as the tables. There is no MCP fallback for this one. Hand the command to somebody on a Mac. |
