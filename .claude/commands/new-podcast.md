---
description: Attach the week's episode to its sermon, in js/data.js and in Supabase, and put the church's real title on the message.
---

Read `NEW_PODCAST_PROCESS.md` at the repo root in full and follow it exactly
to attach the latest Spotify episode to its sermon in `js/data.js`, and to
replace that sermon's provisional title with the episode's real one.

Try fetching the show yourself first. If the egress proxy blocks it, which is
normal in web sessions, ask for the episode's title, publish date, Spotify
link, and description rather than guessing at any of them.

If the request mentions backfilling, the back catalogue, or older episodes,
follow the "Backfilling the whole catalogue" section instead of the
single-episode steps. Read the placeholder warning in that section before
writing anything, most of the sermons currently in `js/data.js` are invented
seed content rather than real messages.

$ARGUMENTS

---

# Publishing the episode to Supabase

Everything above is unchanged and `NEW_PODCAST_PROCESS.md` is still the source
of truth for matching an episode to its Sunday, for the title rename and why
it is one field, and for backfilling. What follows is the extra step: the
episode also becomes a row in the `podcasts` table.

## Before you start

```bash
python3 scripts/hc_supabase.py check
```

Stop on a missing `.env`, missing tables, or a project ref that does not match
`js/config.js`. A refused connection means this is a web session and the proxy
blocks `supabase.co`, so the write happens from the pastor's own machine.

## Linking the episode to its guide

`podcasts.guide_id` is a real foreign key, and the guide was written days
earlier so it usually already exists:

```bash
python3 scripts/hc_supabase.py select guides --order preached_on.desc --limit 10 \
  --columns id,subtitle,primary_passage,preached_on,preacher_short
```

Match on the preached date first, that is the reliable signal, and on the
passage second. **Do not match on the title**, the entire reason this process
exists is that the episode title and the working title are usually different.

One clear match, use it and say which one. More than one candidate, show them
with their dates and passages and ask. No guide at all, leave `guide_id` null,
plenty of messages never get a guide and that is a normal row.

Publish the guide before the episode. A `guide_id` pointing at a row that does
not exist yet rejects the whole write.

## The row

```jsonc
{
  "id": "sermon-your-slug",          // the same id as in js/data.js
  "series_id": "series-david",
  "guide_id": "guide-your-slug",     // null when there is no guide
  "title": "Who's In Your Corner?",  // the church's own title, the real one
  "preacher": "Stephen Daigle",      // full name, used once
  "preacher_short": "Stephen",       // first name, used everywhere else
  "preached_on": "2026-08-09",       // the Sunday, drives sort order
  "published_on": "2026-08-10",      // the day the episode posted
  "duration": "33 min",
  "passage": "2 Samuel 15-19",
  "scripture_refs": ["2 Samuel 15", "2 Samuel 16"],
  "episode_url": "https://...",      // null falls back to the show link
  "platform": "Spotify",
  "media_type": "audio",             // or video
  "summary": ["paragraph", "paragraph"],
  "description": "One line hook for the Listen list.",
  "published": true
}
```

```bash
python3 scripts/hc_supabase.py upsert podcasts /tmp/sermon-your-slug.json
```

Media stays on the external host. Nothing is uploaded to Supabase storage,
that was a cost decision and the podcast host already handles bandwidth,
transcoding, and the directories for free.

## The rename, in the database too

`podcasts.title` is the only place a message's name is written, exactly like
`sermon.title` in `js/data.js`. The guide inherits it, and `guides.theme_title`
stays null so that inheritance keeps working. So the rename is still one
field, and writing the new title onto the guide as well is the one thing this
design exists to prevent.

Ids never move with a title, in either place. Leader checkmarks and journal
entries live on people's phones keyed by the guide id.

## Confirm, briefly

```
Published  Who's In Your Corner?
Stephen, August 9 2026
Renamed from Unsung Heroes, linked to guide-unsung-heroes
```
