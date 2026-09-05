# Planning Center and Group Vitals, mapped

This is a design document and not a set of instructions. Nothing in this file
has been built. It exists to answer one question — what is the most
interactive, compatible and adaptable way to get the data that already lives in
Planning Center and Group Vitals into this app — and to name the handful of
things that have to be found out before a line of it is written.

**Read the caveat in section 12 before you trust a number in here.** The
session that wrote this could search the web but could not open
`api.planningcenteronline.com` or `groupvitals.com`, so a few specifics are
recalled rather than read. They are all flagged, and section 12 is the list.

---

## 0. What has already been decided

Four questions were asked and answered before this was written, and everything
below assumes those answers.

| | Decision |
|---|---|
| **Direction** | Read-only mirror first. Data flows in. Nothing the app does writes back to Planning Center. |
| **First scope** | People and identity, and the calendar. With the honest addendum: *not sure yet what is possible* — which is why section 11 is a probe and not a build. |
| **Identity** | Keep app accounts and Planning Center people separate for now, but add the columns that let them be linked later. |
| **Group Vitals** | Assume no API until told otherwise. Send the email in section 10. |

Read-only is the decision the rest of this document leans on hardest, so it is
worth saying why it is the right one rather than the timid one. Planning Center
is the church's system of record. It holds the giving history and the
children's check-in roster. A bug in a phone app that can only read is a wrong
date on a screen; a bug in a phone app that can write is a phone call from
somebody whose record was overwritten. The write-back conversation is a real
one and it should happen — but after the read half has been running quietly for
a season, not on the same afternoon.

---

## 1. The two services are not the same kind of problem

The instinct is to treat this as one integration with two sources. It is not.
It is one integration and one link.

**Planning Center has a real, documented, free public API.** One API across
People, Calendar, Groups, Services, Check-Ins, Giving and Registrations. Token
auth, JSON:API, webhooks, an API explorer that runs against your own
organisation's real data. It is one of the better church-software APIs there
is, and it is included with the subscription rather than sold as a tier.

**Group Vitals appears to have none.** Searching turns up their marketing site,
their attendance and metrics pages, and a page about how they sync with
FellowshipOne — and nothing at all resembling developer documentation, an API
key screen, a webhook setting or a Zapier listing. Their own published
integration list is FellowshipOne and Church Community Builder, with Planning
Center named as a *possible future* integration rather than a shipped one.
Their documented way to get data in is a spreadsheet import.

That asymmetry decides the shape of the whole thing:

- Planning Center is an **integration**. It gets a sync, a mirror, columns, a
  cron tick and tests.
- Group Vitals is a **link**, exactly as it is today at
  `https://homechurchnola.groupvitals.com/leaderform`, plus an optional
  spreadsheet path if you want the group finder to be live before they ship an
  API.

Do not build a scraper against Group Vitals. A logged-in HTML scrape of a
vendor's admin site breaks on their next deploy, probably violates their terms,
and puts the church's group roster in a place no one agreed to put it. If the
group finder needs to be live and they have no API, the answer is the CSV in
section 10 or moving groups into Planning Center — not scraping.

---

## 2. The shape: a mirror, not a proxy

The single most important decision in this document, and the one everything
else follows from.

**The phone never talks to Planning Center.** An Edge Function on a schedule
reads Planning Center and writes Supabase. The app reads Supabase exactly the
way it reads Supabase today, through the anon key and the published-read
policies, and does not know that Planning Center exists.

```
  Planning Center                Supabase                     The app
  ───────────────                ────────                     ───────

  Calendar  ─┐
  People    ─┤   pg_cron tick     pco-sync         events      js/data.js
  Groups    ─┼──────────────▶   Edge Function ──▶  groups   ──▶ fetches, and
  Services  ─┤   every N min      (service_role)   profiles     falls back to
  Registr.  ─┘                          │          worship      the bundle
                                        │
                                        └──▶ pco_sync_runs   (what happened,
                                             pco_objects      and the raw
                                                              payload)
```

Five reasons, all of them specific to this app rather than general good
practice:

**The bundled fallback survives.** `js/data.js` carries a whole church in it so
the app works on a phone with no signal in a church basement. That only works
because every screen already reads from one place with one shape. A screen that
fetched Planning Center directly would be a screen with no offline story.

**No token on the device.** A Planning Center token is not scoped to a
congregant. It reads the giving records. It cannot ship inside an app binary,
it cannot sit in `js/config.js` next to the anon key, and a proxy endpoint that
holds it and forwards anything the app asks for is the same problem wearing a
hat.

**Rate limits are per token, not per person.** Planning Center's limit is
believed to be around 100 requests per 20 seconds *per authenticated user* —
one bucket shared by the whole congregation, not one each. Three hundred people
opening the Cal tab on a Sunday morning would spend it in seconds. A sync that
runs once every twenty minutes spends a few dozen requests an hour, forever.

**Planning Center's bad morning is not the church's bad morning.** If their API
is slow, a mirror serves yesterday's calendar and nobody notices. A proxy shows
a spinner on the tab people opened to find out what time the thing starts.

**The App Store review already went one way on this.** `APPLY`-adjacent
documents in this repo — `APP_STORE_COMPLIANCE.md` in particular — make claims
about what data leaves the device and where it goes. A mirror keeps those
claims true, because the answer stays "Supabase, and nowhere else."

The cost of a mirror is staleness, and the mitigation is section 8. Twenty
minutes is not a problem for a church calendar. If some particular thing needs
to be immediate, webhooks make that one thing immediate without changing the
shape.

---

## 3. What Planning Center can actually give us

This is the "not sure yet what is possible" answer, product by product, mapped
onto tables that already exist in this schema. The right-hand column is the
recommendation, not a plan of record.

### Calendar — `calendar/v2`

Events, and separately **event instances**, which is the thing that matters and
the thing every first attempt at this gets wrong. `events` is *"Ladies Night,
monthly, third Thursday"*. `event_instances` is the actual nights. The Cal tab
draws nights. **Sync instances, not events.** Also carries resources, rooms and
tags, none of which the congregation needs.

The field to build the whole editorial model on is the one that says an event
is visible in Church Center. See section 6.

> **→ Mirrors into `public.events`.** The table already exists, already has
> `starts_at`, `location`, `signup_url`, `category` and `published`, and
> already has a review queue and a de-duplication pass around it. This is the
> best-fitting piece of the whole integration and it should be first.

### Registrations — `registrations/v2`

Signups, and a public API for them is recent (their changelog announced it
rather than it having always been there). This is what turns a date on a screen
into a thing a person can get into: the real registration URL, whether it is
open, and whether it is full.

> **→ Fills in `events.signup_url` and `events.capacity`.** Both columns exist
> and both are hand-typed today. Note the app currently hard-codes Church
> Center registration URLs in `js/data.js` — the Alpha and baptism links in
> `nextSteps` — and those go stale silently when the church makes next year's
> event. This is the fix for that.

### Groups — `groups/v2`

Group types, groups, memberships, group events, enrollment status, location,
and whether a group is open. Everything the Connect tab's group finder wants.

> **→ Mirrors into `public.groups`, *if the church's groups are in here at
> all*.** They may not be — that is the whole Group Vitals question, and the
> probe in section 11 answers it in about a second. If Planning Center Groups
> is empty or stale because Group Vitals is where the real work happens, this
> stays a link-out and `groups_in_season` stays a boolean somebody flips twice
> a year.

### People — `people/v2`

People, households, emails, phone numbers, field definitions, forms, lists.
Also the most sensitive thing in the building.

> **→ Almost nothing, for now, and that is the decision from section 0.** No
> mirror of the directory. What People is *for* in phase one is a single column
> — `profiles.pco_person_id`, nullable, unique, unpopulated — so that the day
> somebody wants "your group" to know which group is theirs, the schema is
> already shaped for it. Section 9.

### Services — `services/v2`

Plans, teams, team members, scheduled people, and **songs**.

> **→ The one nobody asks for and everybody should.** `worship_sets` is
> populated by `/new-worship` from a list somebody types out. The worship
> leader already typed that list into Services on Thursday. A sync from the
> Sunday plan's song list into `worship_sets.songs` would let
> `scripts/resolve_songs.js` do exactly what it does now — iTunes art, Apple
> Music, Spotify, lyrics — with the typing removed and the song titles spelled
> the way the church spells them. It is a small, self-contained, low-stakes
> integration, and it is a very good second thing to build.
>
> Services teams could also drive `public.serve_teams`, which is worth knowing
> but is less obviously an improvement — see the questions in section 13.

### Check-Ins — `check_ins/v2`

Attendance. No congregant-facing use. Skip.

### Giving — `giving/v2`

Read-only donation data. The Give screen should keep doing what it does, which
is send people to Church Center where the payment form and its compliance
already live. Do not put giving history in this app without a conversation that
starts somewhere other than a design document.

### Publishing

Planning Center added a sermons and media product. Whether this church uses it
is a question for section 13 — if they do, it may have opinions about the same
sermons `podcasts` and `guides` already carry, and two systems believing they
own the sermon list is a problem worth not creating by accident.

---

## 4. The four columns

Every table that gets mirrored gets the same four columns, and they are the
mechanism by which this stays adaptable rather than becoming a thing nobody
dares touch.

```sql
alter table public.events
  add column if not exists source              text not null default 'church',
  add column if not exists external_id         text,
  add column if not exists external_updated_at timestamptz,
  add column if not exists source_synced_at    timestamptz;

-- 'church'      typed by a person, in the admin screens or by a slash command
-- 'newsletter'  parsed out of an email by the intake, 0038
-- 'pco'         mirrored from Planning Center

create unique index if not exists events_external_key
  on public.events (source, external_id) where external_id is not null;
```

`source` is the one that earns its place. This table already has two
populations in it — hand-typed rows and newsletter-parsed rows — and every
piece of behaviour built on top of it has had to infer which is which from
`review_state` being null or not. A third population makes that inference
untenable. Say it outright in a column and every downstream question gets
easier, the de-duplication pass in section 7 most of all.

`external_updated_at` is what makes the sync cheap: hold Planning Center's own
timestamp, ask only for rows changed since the newest one held, and a run that
finds nothing new costs one request.

### The hand-edit problem

The thing that kills mirrors. Somebody in the church rewrites an event's blurb
in the Admin screen because the one Planning Center holds is internal shorthand
— *"Ladies Nt — Loft — SETUP 5:30"* — and twenty minutes later the sync puts
the shorthand back. It happens once, the person stops trusting the screen, and
the feature is dead.

Three ways out, and the recommendation is the third:

1. **Sync wins always.** Simple, and wrong: the app is then a read-only window
   onto internal shorthand, and the Admin screens become decorative for any
   event Planning Center knows about.
2. **First write wins.** A row edited by hand is never touched again. Also
   wrong, and worse, because the event's *time* then goes stale, which is the
   one field a calendar absolutely must get right.
3. **Per-field.** A row carries the set of fields a person has edited, and the
   sync writes every field except those.

```sql
alter table public.events
  add column if not exists locally_edited text[] not null default '{}';
```

The Admin update path appends the field name; the sync skips anything named.
The rule that falls out of it is a good one and worth stating in the migration
header: **Planning Center owns the facts, the church owns the words.** Times,
dates, places and registration links come down every twenty minutes and
overwrite whatever is there. Titles and blurbs, once a person has touched them,
are theirs. An event's time being right is not a matter of taste; how it is
described to the congregation is nothing but.

The Admin card should say so, quietly, on any row whose `source` is `'pco'`:
*From Planning Center. The date and time update themselves.*

---

## 5. Where it collides with the newsletter intake

Two robots now write to `public.events`. The intake reads an email and guesses;
the sync reads the church's own database and knows. They will write about the
same night, and probably in the same week, because the newsletter is announcing
the event somebody put on the Planning Center calendar.

This is not a problem to solve later. It is the first thing that will happen
after the sync is turned on, because the calendar already has rows in it.

The good news is that the machinery for it is built. Migration 0052 gave
`events` three columns — `duplicate_of`, `duplicate_note`, `dedupe_checked_at`
— an Edge Function that finds pairs, and a Merge button that moves everything
across and keeps the survivor's id so nobody's *Add to calendar* breaks. A
mirrored row lands with `dedupe_checked_at` null, which is precisely the state
that makes the tick spend a model call on it. **The sync needs to do nothing at
all to get the de-duplication pass to notice it**, which is a rare thing to be
able to say and a credit to how 0052 was written.

One rule does need amending, and it should be amended deliberately.

0052 decides which row survives a merge as *"the one people already have"*: a
published event beats a queued one, and between two of the same kind the older
wins. That was right when both candidates were guesses. It is not right when
one of them is the church's own record. A newsletter-parsed event that has been
sitting on the calendar for a fortnight will beat a mirrored one under the
current rule, and the calendar keeps the guessed time.

> **Proposed amendment, for a migration of its own rather than a quiet edit:**
> a row with `source = 'pco'` survives against a row that is not, regardless of
> age or published state, and the merge carries the survivor's `starts_at`,
> `ends_at`, `location` and `signup_url` over the other's. The existing rule
> stands unchanged for every other pair.
>
> The id question needs a decision at the same time, and it cuts the other way:
> 0052 keeps the survivor's id so that announcements pointing at the event and
> phones that already added it stay pointed at the same thing. If a mirrored
> row wins, either it inherits the loser's id — messy, since `external_id` then
> disagrees with the primary key's shape — or the announcement links move. The
> function already moves announcement links. **Recommendation: the mirrored row
> keeps its own id and the existing repointing does its job**, but this is the
> single fiddliest corner of the whole design and it deserves its own test
> before it deserves confidence.

The same collision exists in miniature for `group-status`, the function that
reads the latest announcement about home groups and writes the Connect card
with a model call. If Planning Center Groups turns out to hold the real groups,
that function is obsoleted by data rather than improved by it, and the honest
move is to retire it rather than to have two things writing one paragraph.

---

## 6. The publishing gate is already built, and it belongs to the church

The temptation is to give mirrored events a review queue like the newsletter's:
every one lands unpublished, an admin approves it, it goes live. Resist it.

The newsletter has a queue because a language model guessed at what an email
meant, and a wrong guess would put a card in front of the whole church. That
reasoning does not transfer. A Planning Center event was typed by a member of
staff into the church's own system, and asking them to approve it a second time
in a different app is not a safeguard — it is a chore that will be abandoned in
about three weeks, at which point the Cal tab is empty and everybody blames the
sync.

Planning Center already has the switch. An event is either published to Church
Center or it is not, and the staff already use that switch to decide what the
congregation may see. The building-maintenance block and the elders' meeting
are not on Church Center for the same reason they should not be on the Cal tab.

> **Mirror only what is visible in Church Center, and publish it directly.** No
> queue, no second approval. `review_state` stays null on mirrored rows —
> which, per migration 0041's own header, is already exactly what it means for
> a row the service role wrote and published.

Two consequences to build for, both of them small and both of them the kind of
thing that is otherwise found by a congregation:

**Unpublishing must propagate.** An event pulled from Church Center — cancelled,
or moved, or posted in error — has to come off the Cal tab. A sync that only
ever adds is a sync that leaves a cancelled event on three hundred phones. Each
run should mark every mirrored row it did not see this time as
`published = false` rather than deleting it, so that a bad run is recoverable
and a person can see what happened.

**A bad run must not empty the calendar.** The failure mode is a token expiring
or the church renaming a calendar, the sync seeing zero events, and dutifully
unpublishing the lot. **A run that returns nothing changes nothing, and says so
loudly in `pco_sync_runs`.** Write that guard on the first day, not after.

---

## 7. Cadence: poll first, and let a webhook do the poking

Planning Center supports webhooks — subscriptions configured in the developer
UI, payloads signed with HMAC-SHA256 in an `X-PCO-Webhooks-Authenticity`
header. Whether Calendar and Groups fire the events we would want is one of the
things section 12 says to check first, and public sources genuinely disagree.

Poll anyway, at least at first. Polling on `external_updated_at` is
self-healing in a way webhooks are not: a missed delivery, a duplicate
delivery, two deliveries out of order and a redeploy during a delivery are all
non-events for a poller, and all real bugs for a webhook consumer. And the
pattern is already in this repo, working, with tests — `pg_cron` calls a
function that posts to an Edge Function, which does the work and writes a run
row. `hc_newsletter_tick()` is the model to copy, down to the run table.

Twenty minutes is a good starting number and it matches the intake.

When immediacy is wanted later, **the webhook should trigger a sync run rather
than carry a payload.** The endpoint verifies the signature, writes nothing,
and pokes the same function the cron pokes. Ordering bugs, replay bugs and
partial-payload bugs all disappear, the polling path stays the only code that
writes, and losing a webhook costs twenty minutes rather than a row.

---

## 8. Identity, staying shut but not locked

The decision was: separate now, linkable later. What that costs today is one
column and about ten minutes.

```sql
alter table public.profiles
  add column if not exists pco_person_id text;

create unique index if not exists profiles_pco_person_key
  on public.profiles (pco_person_id) where pco_person_id is not null;

comment on column public.profiles.pco_person_id is
  'The Planning Center person this account belongs to, once somebody has said
   so. Null on every row until a linking flow exists, and null is the normal
   state — an account is not less of an account for not being in the church
   database. Nothing may be inferred from an email address matching.';
```

That comment is the load-bearing part. The obvious shortcut — match on email
address and link automatically — is the thing not to do. Households share
addresses, people use a work address in one system and a personal one in the
other, and a wrong match does not show somebody the wrong name, it shows them
somebody else's group, somebody else's serve team, and eventually somebody
else's giving. **A link is a thing a person does deliberately, once, and can
undo.** Until that flow exists the column stays empty, and the app is no worse
for it.

What linking would eventually unlock, so that the shape can be judged: the
Connect tab saying *your* group rather than the first row by `sort_order`;
serve teams showing what somebody is actually on; a next step that is already
done not being offered again. All of it genuinely good, none of it worth
guessing an identity for.

---

## 9. Group Vitals, and the email to send

Until somebody at Group Vitals says otherwise, this is the design:

- **The leader form stays a link.** `/leaderform` works, it is theirs, it is
  watched by a person. Nothing improves by wrapping it.
- **The group finder stays a link too**, unless the CSV path below is taken.
- **`public.groups` gets the same four columns from section 4**, so that a CSV
  import, a future API, or a move to Planning Center Groups all land in the
  same place and none of them is a rewrite. `source` would be `'groupvitals'`.
- **An optional import.** They will hand over a spreadsheet — their documented
  onboarding path is a spreadsheet import, so an export is very likely to
  exist. A `scripts/import_groups.js` that reads a CSV and upserts `groups`
  with `source = 'groupvitals'` would make the finder live at the cost of
  somebody re-exporting it when a season turns. That is twice a year, which is
  the same cadence `groups_in_season` already gets flipped at.

And send this, or something like it, to their support address. It is two
questions and it costs nothing to ask:

> Subject: API or scheduled export access for our church app
>
> Hi — we're Home Church in Metairie, on `homechurchnola.groupvitals.com`.
>
> We've built our own congregation-facing app, and we'd like it to show an
> accurate list of open groups rather than sending people out to a browser.
> Two questions:
>
> 1. Is there any API, webhook or scheduled export available on our account —
>    even a nightly CSV to an S3 bucket or an emailed report? Read-only is all
>    we need: group name, day, time, neighbourhood, host first names, whether
>    it has openings, and the join link.
> 2. Is Planning Center integration on the roadmap with any timeframe? We run
>    Planning Center alongside Group Vitals and we'd rather not maintain two
>    group lists.
>
> Happy to work with whatever exists, including something manual.
>
> Thanks,

Their answer changes the plan in one direction only: if there is an API, the
group finder becomes a real sync using the same four columns and the same tick.
If there is not, nothing above needs revisiting.

There is a third possibility worth holding in mind rather than acting on: if
Planning Center Groups turns out to already hold the groups — because Group
Vitals is being used for the coaching and health metrics on top of a roster
that lives in Planning Center — then the group finder can go live from the
Planning Center sync this week and none of this section matters. The probe
answers that.

---

## 10. Step zero is a probe, not a build

The honest starting point, given "not sure yet what is possible." Before any
schema changes, one read-only script that answers the questions this document
had to guess at.

`scripts/pco_probe.js` — run locally, never deployed, reads only, writes a
report to stdout and nothing to anywhere:

1. Authenticate with a Personal Access Token from `.env` and confirm which
   organisation it belongs to.
2. For each of `people`, `calendar`, `groups`, `services`, `registrations`:
   fetch one page, report whether the token can see it at all, and how many
   records there are.
3. **Calendar:** the next twenty event instances, with times, and how many of
   their parent events are visible in Church Center. This is the single most
   informative output — it says whether the Cal tab could be live tomorrow.
4. **Groups:** every group type and group, with enrollment status. This is the
   Group Vitals question. Either the church's real groups are in here or they
   are not, and it takes one page to find out.
5. **Registrations:** open signups, with URLs, so they can be compared against
   the hard-coded Alpha and baptism links in `js/data.js` — which may already
   be pointing at last year's event.
6. **Services:** the most recent plan's song list, to size up the worship idea
   in section 3.
7. Report the rate-limit headers seen, and whether `where[updated_at][gt]`
   filtering actually works on each endpoint, because the whole incremental
   design rests on it.

Everything after this is informed. A day spent here saves a week of building
against a guess. The token goes in `.env` next to the Supabase service role key
— **it is the same class of secret as that one**, it reads giving records, and
it belongs in exactly one file on one machine.

---

## 11. Build order

Each of these is shippable on its own and each is useful without the next.

| | What | Why here |
|---|---|---|
| **0** | The probe. | Everything else is a guess until it runs. |
| **1** | Calendar → `events`, read-only, Church-Center-visible only, twenty-minute tick, run table, empty-run guard. | Best-fitting table, clearest value, machinery already there. |
| **2** | The de-duplication amendment from section 5, with tests. | Must land close behind 1, because the collision starts immediately. |
| **3** | Registrations → `signup_url` and `capacity`, retiring the hard-coded URLs in `js/data.js`. | Small, and fixes links that go stale silently today. |
| **4** | `profiles.pco_person_id` and the four columns on `groups`. | Ten minutes, no behaviour change, keeps every door open. |
| **5** | Services songs → `worship_sets`. | Self-contained, removes a weekly chore, low stakes if it breaks. |
| **6** | Groups, *if* the probe found real ones. | Otherwise the Group Vitals link stands and this is deleted from the list. |
| **7** | Webhook as a poke, if anything turns out to need immediacy. | Optimisation, not architecture. |
| **later** | Linking, personalisation, and only then any conversation about writing back. | After a season of the read half being boring. |

---

## 12. What to verify before writing code

The session that wrote this could not reach Planning Center's documentation —
the environment blocked `api.planningcenteronline.com` and
`developer.planning.center`. The following are recalled or came out of search
summaries, and every one of them is cheap to confirm in the API explorer, which
runs against this church's own data:

- **The rate limit.** Widely repeated as 100 requests per minute; better
  sources say 100 per 20 seconds per authenticated user, with a stricter 75 per
  20 seconds once the offset goes past 30,000. Either is plenty for a mirror,
  but the retry logic should be written against the real number and the real
  headers.
- **Pagination.** Believed `per_page`, default 25, maximum 100, with
  offset-based paging. Confirm before writing a paging loop.
- **`where[updated_at][gt]` on each endpoint used.** The incremental design in
  section 4 depends on it. If it is not supported somewhere, that endpoint
  syncs by full sweep instead, which is fine but should be a decision rather
  than a surprise.
- **Which events fire webhooks.** Public sources genuinely disagree about
  whether Calendar and Groups fire at all. There is an `available_events` call
  — run it rather than designing around an assumption. Section 7 is deliberately
  written so that the answer does not change the architecture.
- **The exact field that means "visible in Church Center."** The whole
  editorial model in section 6 rests on it. Confirm the name and confirm it is
  filterable rather than only readable — if it cannot be filtered on, the sync
  fetches and discards, which costs requests but changes nothing else.
- **Whether the Registrations public API covers what section 3 assumes.** It is
  recent. It may not expose capacity or remaining spots.
- **Group Vitals.** Everything in section 9 is inferred from a marketing site
  that could not be opened directly. The email settles it.

---

## 13. Open questions

Answers to these change the plan. They are roughly in order of how much.

1. **Is the church's calendar actually maintained in Planning Center Calendar,
   or does it live in somebody's head and reach Church Center by hand?** If
   staff keep Calendar current, item 1 in the build order is worth doing this
   month. If the real calendar is a Google Sheet and Church Center gets the
   leftovers, a sync would faithfully mirror an incomplete calendar and make
   things worse. The probe shows what is in there; only you can say whether
   that is everything.

2. **Are the home groups in Planning Center Groups, in Group Vitals, or in
   both?** This is the fork in section 9 and it decides whether the group
   finder can be live at all. If both, which one does a leader actually update
   when their group fills?

3. **Who at the church can create a Personal Access Token, and whose account
   would it belong to?** A PAT is tied to a person, and it dies when that
   person's account does. If the token belongs to a staff member who leaves,
   the Cal tab stops updating some Tuesday for reasons nobody connects to a
   resignation. Worth considering an OAuth application owned by the church, or
   at minimum a documented owner and a note in `LAUNCH_TODO.md`.

4. **Should mirrored events be able to carry an announcement?** Right now
   announcements point at events via `announcements.event_id`, and the
   newsletter intake creates both. If Planning Center creates the event, does
   anything create the announcement — or does an event appearing on the Cal tab
   quietly, with no card on Home, feel like the right amount of noise?

5. **Does the church use Planning Center Publishing for sermons?** If so, it
   has opinions about the same sermons `podcasts` and `guides` carry, and two
   systems believing they own the sermon list is a mess best avoided by
   deciding now rather than discovering later.

6. **Would the serve teams be better driven by Services teams?** `serve_teams`
   is a short hand-maintained list funnelling through one SMS keyword, and it
   probably changes twice a year. Services teams are an operational roster with
   a lot of rows the congregation has no reason to see. This one may be worth
   leaving exactly as it is, and it is listed here so that leaving it alone is a
   decision.

7. **How stale is too stale?** Twenty minutes is proposed because it matches the
   intake. If somebody moves an event an hour before it starts, is twenty
   minutes acceptable — or is that the case that justifies a webhook?
