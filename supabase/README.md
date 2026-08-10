# Content management, in Supabase

Sermon guides, events, podcast episodes, and whatever comes next live in
Supabase rather than in app code. Publishing and editing happen through slash
commands in Claude Code. Nothing here requires a new App Store build, which is
the whole point: a typo in Saturday's guide gets fixed on Saturday.

---

## Which project am I pointed at

The account has two similarly named projects, so the display name is not a
reliable way to tell them apart. The project ref is. It is the random looking
string in the project URL, `https://<ref>.supabase.co`, and it is unique.

The app already ships pointed at one of them, in `js/config.js`. That is the
one to use, because it is the project the phones already talk to for sign-in.

To see which ref your `.env` is aimed at, and whether it agrees with the app:

```bash
python3 scripts/hc_supabase.py check
```

It prints both refs, says whether they match, and lists every table in the
project. Run it against each of your two projects if you are still unsure
which is which, the one with a `profiles` table is the one the app has been
using.

---

## First time setup

1. **Credentials.** Copy `.env.example` to `.env` at the repo root and fill
   in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings,
   API keys. `.env` is git ignored. The service role key never goes in
   `js/config.js`, never gets committed, and never gets pasted into a chat.

2. **Create the tables.** Supabase dashboard, SQL Editor, New query, paste all
   of `supabase/migrations/0001_content_cms.sql`, Run. It is safe to run more
   than once.

3. **Verify.**

   ```bash
   python3 scripts/hc_supabase.py verify
   ```

   That proves all four tables exist, that each is readable with the anon key
   the way a phone reads it, and that each refuses an anonymous write.

4. **Seed it**, optionally, with the content already in `js/data.js`:

   ```bash
   node scripts/export_seed.js
   python3 scripts/hc_supabase.py upsert series   supabase/seed/series.json
   python3 scripts/hc_supabase.py upsert guides   supabase/seed/guides.json
   python3 scripts/hc_supabase.py upsert podcasts supabase/seed/podcasts.json
   python3 scripts/hc_supabase.py upsert events   supabase/seed/events.json
   ```

   Order matters, series before guides before podcasts, because the foreign
   keys point that way.

---

## The tables

| Table | Holds | Read by |
|---|---|---|
| `series` | Sermon series, name, blurb, cover art, which one is current | Listen, Grow |
| `guides` | Small group guides, the whole `Guide {}` model | Grow, guide reader, leader mode |
| `podcasts` | Sunday messages as episodes, external media links | Listen |
| `events` | The events calendar | Connect |
| `announcements` | The single One thing card, with a date window | Home |

**Why these five and not everything in `js/data.js`.** Collection count is the
wrong way to look at it. What matters is how often something changes. These
five are everything that churns: guides and podcasts weekly, announcements
most weeks, events monthly, series every few months. The rest of `data.js`,
`church`, the show level `podcast` info, `readingPlan`, `groups`,
`serveTeams`, and `nextSteps`, is config that changes once or twice a year,
and shipping it in the binary is fine. Give any of them a table when that
stops being true, the pattern is in `/new-content-type`.

**Ids are readable text slugs, not uuids.** `guide-slow-burn`, not
`8f3e...`. This is not a style preference. A leader's question checkmarks and
private journal entries are stored on their own phone keyed by the guide id,
so a uuid primary key would have orphaned every leader's notes the day the app
switched to reading from Supabase. Titles move, ids never do, and a slug that
no longer matches its title is fine because nobody sees it.

**Lists and nested shapes are `jsonb`.** A guide's sections are not shredded
into child tables. The guide is always read whole and never queried by
individual question, jsonb round trips straight into the app with no assembly
step, and nobody fixing a typo should have to think about joins. Check
constraints on each of those columns catch the one mistake that actually
happens, a bare string sent where a list was expected, which renders as
nothing at all and is invisible until a leader opens the guide.

**`published` gives you a draft state for free.** Set it false and the app
cannot see the row, while Claude Code and the service role key still read it
normally. It is also the right way to pull a cancelled event, because it is
reversible and a delete is not.

**Two links between guides and podcasts, and only one is a foreign key.**
`podcasts.guide_id` is the real constraint. `guides.sermon_id` is a plain text
column on purpose, because the guide is written within a day or two of Sunday
while the episode posts after, so the guide names a row that does not exist
yet. Making that a foreign key would mean no guide could ever be published
before its episode, which is backwards from how the week actually runs.

---

## Row level security

The rule for every content table: **the world can read published rows, and
nobody can write.**

That second half looks like it would lock out the publishing commands too. It
does not, and the reason is worth knowing because it explains why these tables
have no insert policy:

> The `service_role` key bypasses row level security entirely, at the Postgres
> level, by design. So the correct way to make a table service-role-write-only
> is to turn RLS on and then simply never write an INSERT, UPDATE, or DELETE
> policy. There is nothing to grant. `anon` and `authenticated` fall through
> to the default deny, and the service role never consults policies at all.

Writing an explicit `to service_role` policy would be noise at best and
actively misleading at worst, because it would suggest the service role is
gated by something it is not.

So each table gets exactly two moves:

```sql
alter table public.guides enable row level security;

create policy "guides are publicly readable"
  on public.guides for select
  to anon, authenticated
  using (published);
```

Plus explicit grants, `select` to `anon` and `authenticated`, and `insert`,
`update`, `delete` revoked from both. Supabase already grants broad privileges
on the public schema and leans on RLS to gate them. The revokes mean a policy
added by mistake later cannot open a hole on its own.

**What this means in practice.** The anon key ships in `js/config.js` and in
the app binary, which is fine, it can only ever read published content. The
service role key lives in one file, `.env`, on machines you control, and it is
the only thing that can publish. If it ever leaks, rotate it in the dashboard,
Project Settings, API keys, and update `.env`.

`verify` checks all of this against the live project rather than trusting that
the SQL did what it says.

---

## Day to day

Everything goes through slash commands in Claude Code:

| Command | Does |
|---|---|
| `/new-guide` | Sermon PDF to a full guide, into `js/data.js` and `guides` |
| `/new-event` | Asks for what is missing, confirms, writes to `events` |
| `/new-podcast` | Episode to `podcasts`, links its guide, puts the real title on the message |
| `/new-announcement` | The One thing card on Home, with a date window so it retires itself |
| `/edit-content` | Plain language fix to any row, shows current versus proposed, writes after you confirm |
| `/new-content-type` | Scaffolds another content type, table and command |

Under all of them is one script, `scripts/hc_supabase.py`. It is the only
thing that holds the service role key, and it is standard library Python with
no pip install, which keeps the repo's no build step promise intact.

```bash
python3 scripts/hc_supabase.py check
python3 scripts/hc_supabase.py verify
python3 scripts/hc_supabase.py select guides --order preached_on.desc --limit 5
python3 scripts/hc_supabase.py select events --ilike title=serve
python3 scripts/hc_supabase.py upsert events event.json
python3 scripts/hc_supabase.py update events event-serve-day '{"published": false}'
python3 scripts/hc_supabase.py when 2026-08-20 19:00
```

There is no `delete`, on purpose. Unpublish instead.

`when` converts church local time to the UTC value `events.starts_at` wants.
New Orleans is UTC-5 in summer and UTC-6 in winter, and hand converting that
is how a Christmas Eve service ends up on the wrong day.

---

## Adding a fifth content type

Run `/new-content-type announcements` and it does all of this. By hand it is
five steps:

1. `cp supabase/migrations/TEMPLATE_new_content_type.sql supabase/migrations/0003_announcements.sql`,
   replace `THING`, fill in the columns
2. Paste it into the SQL editor and run it
3. Add the table name to `CONTENT_TABLES` in `scripts/hc_supabase.py`, one line
4. Copy `.claude/commands/new-event.md` as the shape of the new command
5. Add a row to the table list above

The template already carries the house pattern, slug id, `published`,
`created_at`, `updated_at`, the shared `hc_set_updated_at` trigger, and the
public-read-no-write RLS pair. If a new table does not look like the other
four, that is worth a second thought before running it.

---

## How the app reads it

`js/content.js` is the read side. Three layers, and the app is never blank and
never waiting on the network:

1. **The cache**, last known good content in `localStorage`, applied
   synchronously before the first paint. A returning phone opens straight to
   this week's guide.
2. **`js/data.js`**, baked into the binary, which is what a brand new install
   with no signal falls back to. This is why that file still ships and should
   keep shipping.
3. **Supabase**, fetched in the background after the first paint. If something
   actually changed, the current screen redraws in place with the scroll
   position kept.

Two behaviors worth knowing, because they look like bugs and are not:

- **An empty table is ignored, except for announcements.** A guides table that
  comes back empty, because somebody is still setting the project up, will not
  wipe the guides that shipped in the binary. Announcements are the deliberate
  exception, zero announcements is a real instruction, it means take the
  banner down, and honoring it is what lets a dated announcement retire
  itself.
- **A table that fails does not fail the refresh.** Every other table still
  lands, and the one that failed keeps whatever it already had.

`js/data.js` is never modified by any of this. `HC.data`'s arrays are mutated
in place rather than reassigned, because the helpers in `data.js` close over
those same array objects, so assigning a new array would leave every helper
reading stale content while the screens showed the new.

## Still to do

**The publishing commands still write to both places**, Supabase and
`js/data.js`, which is one step more than should be needed now that the read
side is live. That belt and braces is deliberate for the first few weeks:
publish a guide, confirm it appears on a real phone from Supabase alone, and
then delete the `js/data.js` half from `/new-guide`, `/new-podcast`, and
`/new-event`. Each of those files marks exactly which step to remove.
`/new-announcement` never had the second half, so it is the cleanest one to
watch first.

**Running migrations from the terminal** needs
`supabase/migrations/0002_optional_migration_runner.sql`, which is optional and
the recommendation is to skip it. Read its header first, it explains what the
service role key can do afterward.
