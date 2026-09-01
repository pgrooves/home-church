# Content management, in Supabase

Sermon guides, events, podcast episodes, the weekly reading plan, and whatever
comes next live in Supabase rather than in app code. Publishing and editing
happen through slash commands in Claude Code. Nothing here requires a new App
Store build, which is the whole point: a typo in Saturday's guide gets fixed on
Saturday.

**How to reach the project is in [`ACCESS.md`](ACCESS.md)**, next to this file.
Two transports, the Supabase MCP server and `scripts/hc_supabase.py`, and it
says which to use where. Read that first if a command cannot connect. Most
editing on this app happens from a phone, where the script cannot run at all.

---

## Which project am I pointed at

The project ref is how you tell projects apart. It is the random looking string
in the project URL, `https://<ref>.supabase.co`, and it is unique where a
display name is not.

This app's ref is **`ibqkumxfltfiuqevviji`**, "Home Church App". It is what
`js/config.js` ships pointed at, so it is the project the phones already talk
to, and it is the only one to publish into.

To confirm what `.env` is aimed at, on a machine that has one:

```bash
python3 scripts/hc_supabase.py check
```

It prints both refs, says whether they match, and lists every table. From a
phone, the dashboard shows the ref in the project URL, and `ACCESS.md` has the
SQL that lists the tables.

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
| `events` | The events calendar | Cal |
| `announcements` | The announcement cards at the top of Home, each with a date window, formatted words, any number of pictures, an optional YouTube video and an optional link | Home, Admin, the announcement's own page |
| `reading_plans` | The Reading together plan, one row per plan | Home |
| `worship_sets` | One Sunday's songs, in the order they were played, each with its album art and its links. No sermon title in here, deliberately: the screen reads that through to `podcasts` | Worship |
| `groups` | Small groups, night, host, neighborhood, and whether there is room | Connect |
| `serve_teams` | The Lend a hand list | Connect |
| `next_steps` | The next step cards | Connect |
| `church_profile` | Name, address, service times, giving and social links. One row | Home, Profile, Give, the PDF |
| `podcast_show` | The show card, not the episodes. One row | Listen |
| `content_pages` | Prose the church owns, edited in the app rather than in a source file. Not the Practices, those are somebody else's writing | Give, Admin |
| `app_settings` | App-wide switches and short strings, one row per setting, carrying its own label and type | Home, Admin |

**That is all of it.** Every piece of content the app renders now lives in a
table. Nothing left in `js/data.js` has to be edited to change what a phone
shows, which is the whole point: no content change needs a build or a merge.

**Two of these behave differently on delete, on purpose.** `church_profile`
and `podcast_show` are marked `neverEmpty` in `js/content.js`. Emptying them
leaves the bundled copy in place rather than clearing it, because Home,
Profile, Give, and the printed guide all read `church.address.city` without
checking first, and a church with no name is not a state anybody means to
express. Edit those rows, do not delete them. Every other table takes deletion
literally.

**`groups.openings` is the field to keep honest.** False renders "Full for
now" instead of "Room for more", and a group showing room it does not have
sends somebody to a door that cannot take them. It is one boolean and it goes
stale the week a group fills up.

**`groups.sort_order` decides which group Connect calls "your group"**, since
it shows the first one. Tens, so a group can be slotted between two others
without renumbering everything.

**`reading_plans` used to be the one to know about**, because it moved every
week and moving it was a chore that lost to a busy Sunday. It does not any
more. Two columns are written once when a plan starts and nothing is touched
again for the length of it:

- **`starts_on`**, the first day of week 1. Home counts the weeks from it
  (0024), so a plan that began on May 3rd is on week 17 in August without
  anybody saying so.
- **`weeks`**, the whole schedule as a jsonb array, one entry per week in
  reading order. Home takes the entry for the week it just counted (0032), so
  the reading advances with the number beside it.

`current_week` and `this_week` are now fallbacks, for a plan missing either of
the two above, or one running past the end of its list.

Starting a new plan is a second row with `is_current` true and the old one
flipped to false, never a deletion, so last year's plan stays on record.

Writing a new plan's schedule, three ways, all equivalent:

- **Ask Claude Code.** "Start the Philippians plan on September 6th, eight
  weeks, one chapter a week." This is the one that works from a phone with
  nothing installed.
- **Supabase dashboard**, Table Editor, `reading_plans`, edit the row. Also
  works from a phone.
- **From a machine with `.env`:**

  ```bash
  python3 scripts/hc_supabase.py update reading_plans plan-david \
    '{"starts_on": "2026-05-03", "weeks": ["1 Samuel 16 and 17", "1 Samuel 18 to 20"]}'
  ```

A single week's wording can also be fixed from Home in Edit mode, by an admin,
without touching the rest of the row.

It reaches phones on the next app open. No build, no merge, no release.

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

### The three tables that break that rule, on purpose

`announcements`, `content_pages` and `app_settings` have a second writer: a
signed in admin, from inside the app, holding nothing but their own session.
The Admin dashboard is that writer. Migration `0026_admin_content.sql` gives
each of the three an INSERT, UPDATE and DELETE policy gated on
`public.hc_is_admin()`, and grants those privileges to `authenticated`.

**This is one layer of defence where the other tables have two**, and that is
the unavoidable cost of letting anybody write from a phone. The other tables
are safe both because RLS denies by default and because the write privileges
are revoked outright; either alone would hold. These three depend on RLS
alone. It is why the write policies are generated from one loop with one
condition in them, and why `supabase/tests/0026_admin_content_test.sql`
asserts the refusal as a real member rather than reading the policy and
nodding.

Their SELECT policies are `published or public.hc_is_admin()`, which is what
lets an admin see their own drafts. The app's content sync reads with the
publishable key and no session, so a draft can never reach Home even on an
admin's own phone.

`profiles` gains no new policy at all, which is deliberate and is the more
interesting half. The obvious design is "admins can read and update every
profile", and it is wrong: RLS cannot be restricted to particular columns, so
an admin UPDATE policy would hand every admin the ability to rewrite anybody's
home address as a side effect of being able to change a role. Roles are read
through `hc_admin_list_users()` and written through `hc_admin_set_role()`,
both of which check `hc_is_admin()` on their first line and touch exactly the
columns they name. A trigger, `hc_guard_role_change`, refuses any write to
`profiles.role` that did not come from an admin acting on somebody else, which
is what closes the hole that everybody has always been allowed to write their
own profile row and `role` is now a column on it.

---

## Day to day

Everything goes through slash commands in Claude Code:

| Command | Does |
|---|---|
| `/new-guide` | Sermon PDF to a full guide, into `js/data.js` and `guides` |
| `/new-event` | Asks for what is missing, confirms, writes to `events` |
| `/new-podcast` | Episode to `podcasts`, links its guide, puts the real title on the message |
| `/new-announcement` | The announcement card on Home, with a date window so it retires itself |
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

- **An empty table is honored, an empty project is not.** Deleting the last
  row of a table removes it from the app, which is what makes content genuinely
  removable and not just addable. The one thing the app refuses is a payload
  where *every* table came back empty, which is a project nobody has seeded
  rather than an instruction, and it keeps the bundled content instead of
  blanking the app. A table that failed to fetch never reaches that decision,
  it is left out of the payload entirely.
- **A table that fails does not fail the refresh.** Every other table still
  lands, and the one that failed keeps whatever it already had.

**How to check it on an actual phone.** Open the app, go to Profile, and read
the last line under the version number. It says one of:

| Line | Means |
|---|---|
| Content is up to date, checked today at 6:42 PM | Fetched from Supabase just now |
| Showing your saved copy | Cache, the network did not answer this time |
| Showing the copy that came with the app | `js/data.js`, so no cache and no network yet |

That line is the whole device check. It reads as ordinary warm copy to anyone
else, and it means you never have to guess whether a new guide actually
landed.

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
