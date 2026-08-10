---
description: Turn a sermon PDF into a new guide, in js/data.js and in Supabase, and confirm what was published.
---

Read `NEW_GUIDE_PROCESS.md` at the repo root in full and follow it exactly
to turn the attached sermon PDF into a new sermon and guide entry in
`js/data.js`.

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
do not retry it. Write the guide into `js/data.js` as normal, save the row
JSON, and say plainly that the publish has to be run from the pastor's own
machine.

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
  "id": "guide-your-slug",          // the same id you used in js/data.js
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

Nothing new to build here. The pipeline already exists in `js/print-guide.js`,
and a guide written into `js/data.js` gets its PDF from the Download guide
button on the reader screen, which paginates the same guide object and hands
it to the browser's print dialog. Do not add a second PDF path.

## Why the guide still goes into `js/data.js` too

The app reads its content from `js/data.js` today. The guide reader, the
Listen tab, leader mode, and the PDF all read `HC.data`, not Supabase. So for
now a guide is published in both places, which is what the steps above assume.

Once `HC.data` fetches from Supabase, the `js/data.js` half of this goes away
and so does this section.

## Confirm, briefly

Three facts and stop. No summary of the steps, no offer of next steps:

```
Published  The Slow Burn
Stephen, August 16 2026
guides, series-david, 7 sections, 18 questions, 14 one-liners
```
