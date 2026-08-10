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

Sixty seconds now beats writing a whole guide and then finding the
credentials are missing:

```bash
python3 scripts/hc_supabase.py check
```

Stop and say so if `.env` is missing, if the four tables are not there yet, or
if the project ref in `.env` does not match the one the app reads in
`js/config.js`. Never ask for a key to be pasted into the chat.

If the connection is refused outright, this is a web session and the egress
proxy blocks `supabase.co`. That is a policy denial, not a flaky network, so
do not retry it. Write the guide anyway, save the finished row JSON to a file,
and say plainly that the publish has to be run from the pastor's own machine.
Do not fall back to writing it into `js/data.js`, that is what created two
copies of the catalogue in the first place.

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

## Confirm, briefly

Three facts and stop. No summary of the steps, no offer of next steps:

```
Published  The Slow Burn
Stephen, August 16 2026
guides, series-david, 7 sections, 18 questions, 14 one-liners
```
