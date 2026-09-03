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

Four facts and stop. No summary of the steps, no offer of next steps:

```
Published  The Slow Burn
Stephen, August 16 2026
guides, series-david, 7 sections, 18 questions, 14 one-liners
Narrated   6 sections, 9.4 min, af_heart
```

If the narration did not run, say which half is missing and what to run,
rather than leaving the last line off:

```
Not narrated. Run `npm run narrate && npm run narrate:upload` on the Mac,
this session cannot reach Storage.
```
