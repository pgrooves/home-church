# Adding a New Podcast Episode

Give this file to Claude Code, in this repo, and say **"new podcast."**
That is the whole trigger. Everything below is instructions for Claude, not
for you.

If you're the pastor or a leader reading this instead: you don't need to
understand any of the code below. Say "new podcast" after the week's episode
posts to Spotify, and answer whatever Claude asks. Usually it asks nothing,
sometimes it asks you to paste the episode details.

This is the companion to `NEW_GUIDE_PROCESS.md`. The guide gets written from
the sermon within a day or two of Sunday. The podcast episode posts the
Monday or Tuesday after. This process is what happens second, and it is the
step that puts the church's real title on the message.

-----

## What you're doing

Two things, and the second is the one people forget:

1. Attaching the week's Spotify episode to its sermon, so the Listen tab
   points at the episode itself instead of falling back to the show.
2. **Replacing the provisional title with the real one.** When the guide was
   written, nobody knew what the church would call the message, so a title
   was proposed from the sermon content. The episode carries the actual name.
   That name wins.

`sermon.title` is the only place a message's name is written. Home, the guide
index, the guide reader, the PDF, leader mode, and every shared one-liner all
read it through `HC.data.guideTitle()`. So step 2 is one field, and the whole
app follows it. Do not go hunting for other copies of the title, there aren't
any, and adding one would undo the point.

-----

## Step 1: Get the episode

Try to fetch it yourself first:

```
https://open.spotify.com/show/7iJGZvY5MVm7CjPggvvPOa
```

That is `podcast.showUrl` in `js/data.js`, and it is the source of truth for
the show. The episode links you want are on that page.

**This fetch often fails, and that's expected.** Claude Code sessions running
on the web go through an egress proxy that blocks `open.spotify.com` and the
podcast host behind it, returning a 403. That is a policy denial, not a
transient error. Don't retry it, don't try to route around it, and don't go
looking for a mirror.

When the fetch fails, or when it succeeds but the page doesn't give you clean
per-episode data, just ask:

> The episode fetch is blocked from this session. Paste me the new episode's
> title, publish date, Spotify link, and description, and I'll take it from
> there.

Either way, what you need per episode is:

- **Title**, exactly as the church wrote it, including capitalization
- **Publish date**, the day it posted
- **Spotify episode link**, the `open.spotify.com/episode/...` URL
- **Description**, the episode notes
- **Duration**, if it's given

Don't invent any of these. An episode link you guessed at is worse than the
show-level fallback that's already there, because the fallback always works
and a wrong link is a dead end for whoever taps it.

-----

## Step 2: Match it to a Sunday

Episodes post the Monday or Tuesday after the service, sometimes later in the
week. So the message's Sunday is **the most recent Sunday on or before the
publish date**. `HC.data.sermonForEpisodeDate(publishedOn)` does exactly this
and returns the matching sermon, or `null`.

Use it, then say out loud what it matched so a bad match is visible before
anything is written:

> Episode posted 2026-08-11 (Tuesday), so that's the Sunday 2026-08-09
> service, which is `sermon-unsung-heroes`.

Two things to watch:

- **An episode that posts more than a week late** will match the wrong
  Sunday, because the rule only ever looks back to the nearest one. If the
  date arithmetic gives you a Sunday whose sermon already has an
  `episodeUrl`, stop and ask rather than overwriting it.
- **Two messages on one Sunday** (a Christmas Eve week, a guest speaker
  alongside the regular message) makes the date ambiguous. The date is only
  the matchmaker. `sermon.guideId` and `guide.sermonId` are the real link and
  they stay that way. If a Sunday has two sermons, ask which one this episode
  is.

-----

## Step 3a: The sermon already exists (the normal case)

The guide was written first, which is how it usually goes. Update the sermon
object in place:

```js
{
  id: 'sermon-unsung-heroes',    // DO NOT TOUCH, see below
  title: 'The Real Episode Title',   // overwrite the provisional title
  duration: '39 min',                // from the episode, if it differs
  episodeUrl: 'https://open.spotify.com/episode/...',
  summary: [ /* episode notes, see Step 4 */ ],
  // everything else stays exactly as it is
}
```

**Never rename the id**, even when the new title makes the old slug look
wrong. `sermon-unsung-heroes` stays `sermon-unsung-heroes` forever. Ids are
opaque, and `guide.id` in particular is the key a leader's question
checkmarks and journal entries are stored under in `localStorage` on their
own phone. Rename one and you silently orphan their notes. A slug that no
longer matches its title is completely fine and nobody ever sees it.

**Don't touch `guide.themeTitle`.** It's `null`, and null is what makes the
guide inherit the new title automatically. Setting it to the new title would
technically render the same thing today and re-introduce exactly the drift
this whole design removes. Leave it alone.

Report the rename plainly when you're done:

> `sermon-unsung-heroes` renamed: "Unsung Heroes" to "The Friends You
> Actually Need". The guide, the Home card, the reader, and the PDF all pick
> that up automatically.

If the titles already match, say so and skip the rename. Nothing to do.

-----

## Step 3b: No sermon for that Sunday yet

The episode beat the guide. Create the sermon object now, with no guide
attached:

```js
{
  id: 'sermon-your-slug',            // kebab-case from the episode title
  seriesId: 'series-xxx',            // ask if it isn't obvious
  title: 'The Real Episode Title',
  preacher: 'Full Name',             // ask if the episode doesn't say
  preacherShort: 'First name',
  preachedOn: '2026-08-16',          // the Sunday from Step 2, not the publish date
  duration: '39 min',
  passage: '2 Samuel 20',            // ask if the episode doesn't say
  guideId: null,                     // no guide yet, this is the point
  episodeUrl: 'https://open.spotify.com/episode/...',
  summary: [ /* episode notes */ ],
  description: 'One or two sentences, the hook, shown on the Listen screen.'
}
```

This is the better order, not the broken one. When `/new-guide` runs later
for that Sunday, it attaches to this existing sermon rather than inventing a
second one, and it inherits the real title for free. The disconnect never
happens in this direction.

Ask for whatever the episode notes don't tell you rather than guessing at a
preacher or a passage. Getting an attribution wrong in a published app is a
real error, not a style issue.

-----

## Step 4: The summary

`summary` is an array of paragraphs, and it's what the Listen tab shows when
someone opens a message. It comes from the episode's own notes.

- **Use the episode description as written** where it's real content. Split
  it into paragraphs if it runs long. Don't rewrite it into the guide's
  voice, this is the church's own copy about its own message.
- **Leave `summary: null` if the episode notes are boilerplate.** A lot of
  podcast descriptions are one generic line, something like "Message from
  Home Church NOLA, visit us at homechurchnola.com." That is worse than what
  the app already has, so null it and let it fall back to the hand-written
  `description`. Null is a real answer here, not a failure.
- **Never paste a description with an em-dash into `data.js`.** No em-dashes
  anywhere is a hard brand rule in this repo. Replace them with commas, which
  is the only edit you make to the church's own wording.

`description` stays as it is either way. It's the one-line hook, it's yours,
and the summary doesn't replace it.

-----

## Step 5: Verify

Serve the app (`python3 -m http.server` from the repo root) and check:

- The message shows the new title on Listen, and the same new title on the
  Home card, in the guide index, and at the top of the guide reader. If
  those three disagree, something set `themeTitle` and it shouldn't have.
- The archive row opens and "Listen on Spotify" goes to the episode, not the
  show. Compare the href against what you were given.
- The Download guide button still produces a PDF with the new title in the
  footer of every page.
- No console errors, no horizontal scroll at 320px or 390px.

If Playwright is available, drive those headlessly, it's faster and
repeatable. Otherwise the manual pass is enough. This app has no build step
and no test framework by design, and a fresh session doesn't need to set one
up to add an episode.

-----

## Backfilling the whole catalogue

Everything above handles one episode, which is the weekly case. Say **"new
podcast, backfill"** to run the back catalogue in one pass instead.

A sermon with no `episodeUrl` still works, it just falls back to the show, so
backfill is a sharpening pass and never an emergency. Nothing is broken while
it's undone.

### Getting every episode at once

Scraping the show page one episode at a time is the wrong tool here. Two
better routes, in order:

**The Spotify Web API**, which is the only place the per-episode links exist:

```
POST https://accounts.spotify.com/api/token      # client_credentials grant
GET  https://api.spotify.com/v1/shows/7iJGZvY5MVm7CjPggvvPOa/episodes?market=US&limit=50
```

A free Spotify developer app gives you a client id and secret, no user login
and no review process, and the episodes response carries everything this
process needs per episode: `name`, `description`, `release_date`,
`duration_ms`, and `external_urls.spotify`. Page through with `offset` if the
show has more than fifty. Keep the credentials out of the repo, pass them as
environment variables, and never commit them to `js/config.js` or anywhere
else.

**The podcast RSS feed**, if the API is more setup than it's worth. It has
every episode's title, date, description, and duration, but *not* the Spotify
links, so it gets you everything except the one field backfill exists to
fill. Useful for correcting titles and notes in bulk, then adding links by
hand for the episodes that matter most.

Both of these are blocked from web sessions by the egress proxy, the same as
the show page. Backfill realistically runs from Claude Code on a machine with
open network access, or from a pasted list.

### The matching pass

Walk episodes oldest to newest and, for each one, do Step 2 and then Step 3a
or 3b exactly as written. Then report the whole run as one table, every
message with its Sunday, whether it matched, and what its title changed from
and to. One table beats a running commentary, and it makes a bad match
obvious.

### When a sermon matches no episode

Do not delete it and do not invent an episode for it. There are two honest
reasons a sermon has no episode, and neither one is a problem to fix in a
hurry:

1. **The episode has not posted yet.** Leave it alone, it fixes itself next
   week.
2. **The message was never podcast.** Leave it alone. The show-level fallback
   is correct and the guide is still worth having.

The invented seed sermons that used to live here are gone. `js/data.js` now
holds the real catalogue, 87 messages transcribed from the podcast feed and
running back to November 2024, so a sermon in that file is a message that
actually happened. **Never delete a sermon that has a guide hanging off it
without asking**, because deleting a guide throws away real writing and
orphans the checkmarks and journal entries a leader saved under its id on
their own phone.

### Episodes with nothing recorded

Plenty of episodes do not state a preacher or a passage in their notes.
Twenty eight and forty three of them respectively, at the time of the
import. Leave those fields `null` rather than guessing. The byline and the
meta line both drop empties, so a message with neither renders as a title, a
date, and a duration, which is honest and looks fine. Getting an attribution
wrong in a published app is a real error, a missing one is not.

-----

## Step 6: Commit and push

Commit message should name the episode and note it's content, not a code
change, and should call out the rename explicitly if there was one. Push
straight to `main` by default, the same way every other change in this repo's
history has gone out, unless told otherwise. If you're working on a separate
branch for some reason (a session harness forced one on you, for instance),
merge it into `main` and push `main` yourself, finishing the job rather than
leaving the episode stranded on a branch nobody asked for.

-----

## What NOT to do

- **Don't rename any id**, ever, for any reason. Titles move, ids don't.
- **Don't set `guide.themeTitle`.** Null is doing real work.
- **Don't invent an episode URL or a publish date.** Ask. The show-level
  fallback already works, so a missing link costs nothing and a wrong one
  costs a dead tap.
- **Don't retry a blocked fetch or look for a mirror.** A 403 from the proxy
  is a policy denial. Ask the user to paste instead.
- **Don't rewrite the guide** to match a new title. The guide's content was
  built from the sermon and is still correct. Only the name changes.
- **Don't reorder the `sermons` array.** Everything sorts by `preachedOn`
  automatically.
- **Don't add a title field anywhere.** One message, one name, on the sermon.
