---
description: Turn a sermon PDF into a new guide, publish it to Supabase, and confirm what was published.
---

Read `NEW_GUIDE_PROCESS.md` at the repo root in full and follow it exactly
to turn the attached sermon PDF into a new sermon and guide. That document
governs the writing. This one governs where it goes, which is Supabase, and
not `js/data.js`. See "Why this no longer touches js/data.js" below.

If no PDF is attached to this message, stop and ask for one before doing
anything else, the process document depends on it.

$ARGUMENTS

---

# Publishing the guide to Supabase

Everything above is unchanged and `NEW_GUIDE_PROCESS.md` is still the source
of truth for the writing itself, the seven deliverables, the section quotas,
the voice rules, and the draft check before anything is published. Do not
re-derive any of that from this file. What follows is the one thing that
document does not cover: the finished guide also goes into the `guides` table,
so a typo fix on a Saturday night never needs an App Store build.

## Before you start writing

Sixty seconds now beats writing a whole guide and then finding you cannot
publish it.

Read **`supabase/ACCESS.md`** and establish a working transport before you
start. It says which of the two to use, the Supabase MCP server or
`scripts/hc_supabase.py`, and gives the SQL equivalent of every script verb
below. Confirm the project ref is `ibqkumxfltfiuqevviji`, the one
`js/config.js` reads. Never ask for a key to be pasted into the chat.

A missing `.env` or a refused `supabase.co` connection is what a web session
looks like, and most sessions on this app are web sessions from a phone. Use
MCP and carry on.

Only if neither transport works: write the guide anyway, save the finished row
JSON to a file, and say plainly that the publish has to be run separately. Do
not fall back to writing it into `js/data.js`, that is what created two copies
of the catalogue in the first place.

Guides are the worst case for hand written SQL in this repo. Every field is
prose, the summaries and sections are jsonb, and an apostrophe in the middle of
a `'...'` string is a real hazard. Dollar quote everything, cast the jsonb
columns, and read the row back before you report it published.

## After the guide is written and approved

**The series row has to exist first.** `guides.series_id` is a real foreign
key. For a new series, create it and flip the old one in the same pass:

```bash
python3 scripts/hc_supabase.py upsert series '{"id":"series-xxx","title":"...","subtitle":"...","blurb":"...","started_on":"2026-08-16","is_current":true}'
python3 scripts/hc_supabase.py update series series-david '{"is_current": false}'
```

**Give it `art_url` while you are there.** It is optional and it is the one
field that shows up on five screens: the rail on Listen, the latest message
above it, every episode row under it, every guide in the series on the Guide
index, and the week's guide card on Home. The church has already made the
graphic — it is the picture on the announcement that launched the series — so
this is usually a copy of that announcement's `image_url`:

```bash
python3 scripts/hc_supabase.py update series series-xxx '{"art_url": "https://.../series-art.png"}'
```

An external URL is what this column is for, the same as album art on a worship
set. Leave it off and every one of those five places draws the house tile it
has always drawn, which is also what they fall back to if the URL ever dies.

**Then publish the guide.** Same content, same ids, snake_case columns. The
column names map one for one onto the `Guide {}` model in section 6 of the
design system doc:

```jsonc
{
  "id": "guide-your-slug",          // permanent, see supabase/README.md
  "sermon_id": "sermon-your-slug",
  "series_id": "series-david",
  "theme_title": null,              // stays null, the name lives on the podcast row
  "subtitle": "...",
  "primary_passage": "2 Samuel 13",
  "preacher": "Stephen Daigle",     // full name, used once
  "preacher_short": "Stephen",      // first name, used everywhere else
  "preached_on": "2026-08-16",
  "occasion": null,
  "short_summary": ["...", "...", "..."],
  "full_summary": ["..."],
  "anchors": [{ "label": "...", "body": "..." }],
  "group_sections": [{ "heading": "...", "questions": ["..."] }],
  "reflection_questions": ["..."],
  "one_liners": ["..."],
  "scriptures": [{ "reference": "...", "note": "..." }],
  "closing_scripture": { "text": "...", "reference": "..." },
  "published": true
}
```

```bash
python3 scripts/hc_supabase.py upsert guides /tmp/guide-your-slug.json
```

Upsert rather than insert, so re-publishing after a correction is the same
command as publishing the first time and a half finished publish is always
safe to just run again. Set `"published": false` to stage a guide the app
cannot see yet, it stays fully readable to you.

**Before you upsert, grep the JSON for an em-dash.** It is a hard brand rule
and this is the last place it can be caught cheaply.

**Then the sermon row, last.** `NEW_GUIDE_PROCESS.md` Step 3 calls it the
sermon object; in Supabase it is a row in `podcasts`, and it goes up after the
guide because `podcasts.guide_id` is the foreign key that points back at it.
A guide with no sermon row renders with no name at all, since `guideTitle()`
resolves through `sermon.title` and has nothing to fall back on:

```jsonc
{
  "id": "sermon-your-slug",
  "series_id": "series-jonah",
  "guide_id": "guide-your-slug",              // the row you just wrote
  "title": "Boats to Tarshish (Working Title)",
  "preacher": "Stephen Daigle",
  "preacher_short": "Stephen",
  "preached_on": "2026-09-06",                // the Sunday, drives sort order
  "published_on": null,                       // no episode yet, that is Tuesday
  "duration": "35 min",
  "passage": "Jonah 1",
  "episode_url": null,                        // Listen reads "Audio coming soon!"
  "platform": "Spotify",
  "media_type": "audio",
  "summary": [],                              // the episode notes, on Tuesday
  "description": "One or two sentences, the hook, shown on Listen.",
  "published": true
}
```

```bash
python3 scripts/hc_supabase.py upsert podcasts /tmp/sermon-your-slug.json
```

The nulls and the empty arrays are the point rather than an unfinished job.
They are what `/new-podcast` fills in, and the app draws every one of them as
a sensible waiting state in the meantime.

## The title publishes as a working title

The name of the message is not on the guide row. It is `podcasts.title` on the
sermon row above, and on Sunday nobody knows it yet, because the episode posts
Tuesday carrying whatever the church actually decided to call this. So the
title you proposed publishes with `(Working Title)` after it, exactly that
string, one space before the parenthesis:

```jsonc
"title": "Boats to Tarshish (Working Title)"
```

`NEW_GUIDE_PROCESS.md` has the reasoning under "One name per message." Three
things it rules out, worth repeating here because this is the file that
writes the row:

- **Not in the id.** `sermon-boats-tarshish`, never
  `sermon-boats-tarshish-working-title`. Ids are permanent, the suffix is not.
- **Not on the guide.** `theme_title` stays `null`, `subtitle` describes the
  guide rather than naming it. One field carries the name and one field
  carries the marker, because they are the same field.
- **Not hedged in the prose.** The guide's own sentences never mention that
  the title is provisional. The suffix is the whole notice.

`/new-podcast` overwrites the field with the real title on Tuesday, which
retires the marker without anybody doing anything about it.

## Check for a suffix that went stale

A message that never gets an episode keeps its marker forever, and a
`/new-podcast` run three weeks late leaves three of them stacked up. Neither
is visible from inside the week you are working on, so look while you are
already here:

```sql
select id, title, preached_on
  from public.podcasts
 where title like '%(Working Title)%'
   and preached_on < current_date - 14
 order by preached_on;
```

Anything it returns goes in the confirmation as one line, named, and stops
there. Do not rewrite them. An old working title is sometimes the right
title that simply never had an episode behind it, and choosing the church's
words for them is not a call this command gets to make. `/edit-content` drops
a suffix, or puts a better title on, in one sentence when you decide to.

## The reading plan moves itself

**There is no step here.** Publishing the guide already moved it, and this
section exists so that you know that and do not go and move it a second time.

A reading plan can name the series it walks beside, `reading_plans.series_id`.
When it does, writing a guide in that series fires a trigger that re-anchors
the plan's `starts_on` so its week is the week of the sermon, however the
Sundays actually fell. Migration `0055`, and the whole of it is:

```
starts_on = the latest sermon's date - (its number in the series - 1) * 7
```

Home still counts days from `starts_on` and still takes `weeks[n]` for the week
it counted, which is what keeps the reading right on a Wednesday. This only
moves the day it counts from.

Three things follow, and all three are things not to do:

- **Do not set `starts_on` or `current_week` by hand** on a plan that follows a
  series. The next guide will overwrite them, and in the meantime Home shows
  the week you typed rather than the week the church is on.
- **Do not skip it for a late guide.** Publishing Tuesday's guide for Sunday's
  sermon anchors on `preached_on`, not on today, so a guide written late lands
  on the right week and a guide written early does not jump ahead of itself.
- **Do not worry about a correction.** The anchor is taken from the latest
  sermon in the series, never from the guide you happen to be writing, so
  fixing week 1's typo in week 3 leaves the plan in week 3.

What you do owe it is **one look afterwards**, because a plan silently on the
wrong week looks exactly like a plan on the right one:

```sql
select id, series_id, starts_on, current_week, total_weeks,
       weeks ->> (floor((current_date - starts_on) / 7)::int) as reading_now
  from public.reading_plans where is_current;
```

The week and the reading are the last line of the confirmation below. If the
week is right and the reading is not, the schedule in `weeks` is short or out
of order, and that is a content fix on the plan rather than anything to do with
the guide you just published.

**Two cases where there is a step.** Both are one call, and it is idempotent,
so running it when it was not needed costs nothing:

```sql
select * from public.hc_reading_plan_follow_series('series-jonah');
```

- **A new plan for a new series.** Create the plan row with its `series_id`,
  `total_weeks`, and the whole schedule in `weeks`, flip the old plan's
  `is_current` to false, then call the function once to put the new plan on the
  week the sermons say. `0055` section 4 is a worked example of the whole
  thing, and `supabase/README.md` has the shape of the row.
- **A guide deleted rather than unpublished.** The trigger listens for a guide
  being written, not for one going away. Unpublishing is a write and moves the
  plan on its own; a delete needs the call.

If the plan the church is reading has no `series_id`, none of this applies to
it and none of it ran. That is a real choice and not an oversight: a plan
through the Psalms in a season of topical messages should keep counting its own
weeks off the calendar, exactly as `0024` built it to.

## The PDF

Nothing new to build here. The pipeline already exists in `js/print-guide.js`.
The Download guide button on the reader screen paginates whatever guide object
is in `HC.data` and hands it to the browser's print dialog, and a guide fetched
from Supabase is the same object by then. Do not add a second PDF path.

## Why this no longer touches `js/data.js`

It used to. The app read its content only from `js/data.js`, so a guide had to
be written in both places, and the two were free to drift.

`js/content.js` ended that. It fetches every content table on open and swaps
the rows into the `HC.data` arrays in place, so the guide reader, the Listen
tab, leader mode, and the PDF all read Supabase content without knowing it.
Supabase is the source of truth. Publish there and stop.

`js/data.js` is still in the repo and still matters, but its job is narrow now:
it is the cold start seed, what a brand new install with no signal opens to
before the first fetch lands. It is a frozen snapshot, not a second catalogue
to maintain. Let it go stale. Nobody needs to keep it current, and editing it
by hand is how the two copies diverge again.

## Last: narrate it

Every guide section carries a play button, and the recording behind it is made
here. A guide that skips this step is published and silent, and nothing in the
app says so, so this is part of publishing rather than an extra.

**Run it after the row is in Supabase, never before.** The narrator reads the
published guide, not your draft, so the order is: upsert, read the row back,
then narrate. Narrating first records text that may still change.

**The working title is not a reason to wait for Tuesday.** The recordings do
not say the message's name, only the reader's own heading for each section, so
nothing spoken here is provisional and nothing here has to be redone when
`/new-podcast` renames the row. The audio made today is the final audio.
`scripts/narration_text.js` has the reasoning at `sectionText`, and
`tests/narration.test.js` holds it in place: a rename moves no section's hash.
So the guide goes out complete on Sunday, which is the whole point of doing
this here rather than leaving a note for later.

```bash
npm run narrate          # writes the text, then speaks it
npm run narrate:upload   # needs SUPABASE_SERVICE_ROLE_KEY in the environment
```

**Read the first command's output before letting the second one run.** It
prints where the guides came from. `source supabase` is correct. `source seed`
means it could not reach the project and fell back to the three guides frozen
in `js/data.js`, so the guide you just wrote is not among them and every guide
it missed stays silent. It warns in six lines when that happens. Do not
narrate past that warning.

**This needs a real machine, and most sessions on this app are not one.** The
speech model is a 340MB local download and the upload is an HTTPS PUT to
`supabase.co`, which the web session proxy refuses, exactly as
`supabase/ACCESS.md` describes. MCP is not a way around it: it reaches Postgres,
and Storage has no MCP path at all.

So in a web session: publish the guide, say plainly that the narration has not
been made yet, and give the pastor the two commands above to run on the Mac.
Do not report the guide as fully published without saying which half is
missing. In a session on a real machine with `.env` present, just run them.

First run on any machine needs the model, once. `NEW_GUIDE_PROCESS.md`
Step 5b has the four commands.

**It costs nothing.** Kokoro-82M is Apache 2.0 and runs on the CPU: no API, no
key, no account, no quota, no per-play charge. A weekly guide is about four
minutes of laptop time, and re-running with unchanged text regenerates nothing
at all. Do not swap it for a hosted TTS service without saying out loud what
that would cost the church per year.

## Confirm, briefly

Five facts and stop, six in the one case below. No summary of the steps, no
offer of next steps:

```
Published  The Slow Burn (Working Title)
Stephen, August 16 2026
guides, series-david, 7 sections, 18 questions, 14 one-liners
Reading    week 2 of 4, Jonah 1:11 to 2:10, grace at the bottom
Narrated   6 sections, 9.4 min, af_heart
```

Print the title the way it went into the row, suffix included, rather than
tidying it up for the confirmation. The line is the receipt for what the
church will see on the Home card in a minute, and a receipt that reads
cleaner than the row is worse than no receipt.

The reading line is what the check above returned, said in one line, because a
plan that quietly stopped following its series is only visible in a week number
somebody read out loud. Leave it off only when the current plan follows no
series, where there is nothing to report rather than something missing.

If the narration did not run, say which half is missing and what to run,
rather than leaving the last line off:

```
Not narrated. Run `npm run narrate && npm run narrate:upload` on the Mac,
this session cannot reach Storage.
```

The sixth line, last, and only when the stale check found something. Name
them and stop, no recommendation about what they should be called:

```
Still working titles  Boats to Tarshish, Aug 30. No episode yet.
```
