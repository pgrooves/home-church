---
description: The whole Sunday in one command. Writes the week's guide from the transcript, publishes the setlist, and leaves Tuesday's episode to the standing routine.
---

# /new-sunday

Sunday afternoon, one message, both halves of the week's content. Paste the
setlist and the raw transcript under their markers and this runs
`/new-sermon` and then `/new-worship`, in that order, and confirms that the
Tuesday routine is in place to run `/new-podcast` when the episode posts.

```
/new-sunday

SETLIST
1. Oceans - Hillsong United
2. How Great Is Our God - Chris Tomlin
3. Great Are You Lord - Bryan & Katie Torwalt

TRANSCRIPT
so if you have your Bible go ahead and turn with me to second saving 21...
```

Add `--go` and it publishes both halves without stopping, which is what a
Sunday afternoon actually wants. **Read "Going straight through" below before
you rely on it**, because it moves a judgment call off the pastor and onto
this command, and the whole of what it is allowed to decide is written there.

```
/new-sunday --go    series-jonah, 38 min
```

**Read a dash of any kind as `--go`.** A phone's keyboard turns `--` into an
en dash without being asked, so `–go`, `—go` and `-go` all arrive here meaning
the same thing, and so does the phrase "go straight through". Treating a
smart-quoted dash as an unrecognized flag, and then stopping twice for
confirmations the user thought they had turned off, is a bug in this file
rather than a typo in their message.

**A date on its own line at the top of the TRANSCRIPT block is the Sunday**,
not transcript content. People put it there because that is where it looks
like it belongs. Take it, and say which Sunday you read.

$ARGUMENTS

---

## What this file is, and what it is not

**This file owns the sequence and nothing else.** It does not restate a
quota, a voice rule, a column name or a publishing step, because every one of
those already lives in the command it hands off to, and a second copy is a
copy free to drift. Where this file and a delegated one appear to disagree
about how something is written or published, **the delegated one wins.**

What it does own: splitting one message into two inputs, keeping the setlist
alive through a long run, the order the two commands go in, what happens when
one half is missing or fails, and the single receipt at the end.

The three commands underneath are unchanged and still work on their own. A
week where only the setlist needs publishing is still `/new-worship`.

## Going straight through, with `--go`

Without it, this run stops twice: once at `/new-sermon` Step 4 to show the
draft and ask which series and how long the message ran, and once at
`/new-worship` Step 5 to show the resolved set. **With `--go`, neither
happens.** Both halves publish and the receipt is the first thing you read.

**Give it the two facts in the command line** and there is nothing left to
ask for:

```
/new-sunday --go    series-jonah, 38 min
```

Leave them out and they are derived rather than asked about. The series is
the one with `is_current` set, which is right on every Sunday that continues
a series. The duration comes off the transcript's own timestamps when it has
them, and is left off the row when it does not, which the app draws as a
sensible blank.

### What `--go` is allowed to decide, and what it is not

`/new-sermon` Step 4 already ends with "Skip this only if the user says to go
straight through," so turning it off is that command's own provision and not
an override at all.

`/new-worship` Step 5 is different. It says "Always show the finished set and
wait for a yes. This is a required step, not a courtesy," and `--go` overrules
it. **That is the one place this file overrules a delegated one, it is
deliberate, and it is narrow.** It buys the quiet Sunday, and the price is
paid by a single rule:

**Never guess. Drop instead, and say what was dropped.** That rule costs
almost nothing here, because `/new-worship` Step 3b already answers the
question "what if no result passes the rules" with "leave the platform out,
the screen draws nothing for a missing link, and that is the correct
outcome." A song that goes up with two buttons instead of three is a small
thing anybody can fix later with `/edit-content`. A song that goes up with a
button that opens the wrong recording is the thing nobody catches by looking
at the screen, and the confirmation step existed to catch exactly that. So
the confirmation goes and its judgment stays: anything short of a clean match
under 3b's rules is left off rather than shipped.

### The two things `--go` still stops for

Neither is judgment. Both are information the command does not have and
cannot derive, and guessing at either is worse than a Sunday evening
interruption.

- **A message that starts a new series.** A new series is a new row with a
  title, a subtitle, a blurb and artwork, plus flipping the old one's
  `is_current`, and none of that is inferable from a transcript. If the
  sermon plainly continues the current series, carry on. If it reads like a
  new one and the command line did not name a series, stop and ask.
- **A setlist line naming two artists.** `Holy Spirit: Jesus Culture or
  Bryan & Katie Torwalt` is two different recordings and picking one silently
  is picking wrong half the time. `/new-worship` already refuses to decide
  this and so does `--go`. **You control this one from your side**: one artist
  per line and it never comes up.

Everything else that would have been a question becomes a line in the
receipt.

## Step 0. Split the message, then save both halves

Read `$ARGUMENTS` and cut it on the two markers. `SETLIST` and `TRANSCRIPT`
on their own lines, either order, case insensitive, with or without
decoration around them.

- **Both markers present.** The ordinary case. Everything under `SETLIST` up
  to the next marker is the song list; everything under `TRANSCRIPT` to the
  end is the transcript, and more than one transcript block is normal, see
  `/new-sermon` Step 1b.
- **No markers at all.** Do not guess. A transcript mentions song titles, and
  a worship leader reads the setlist out loud from the stage, so inference
  here is wrong often enough to matter. Say which marker you could not find,
  show the shape above, and stop.
- **One marker.** Run that half only, skip the other, and say so in the
  receipt. A Sunday with no setlist and a Sunday with no recording are both
  real weeks.

**Then establish the Sunday**, once, here, and pass the same date to both
commands. Look in three places, in order: on the command line, on a line of
its own at the top of the `TRANSCRIPT` block, and failing both, the most
recent Sunday, which is today when today is Sunday. Say which Sunday you
picked before anything is written.

**Now write both halves to disk before you start the sermon work:**

```bash
/tmp/sunday-2026-09-20-setlist.txt   # the song list, verbatim, as typed
/tmp/sunday-2026-09-20.json          # sunday, sermon_id, guide_id, series_id
```

This is the one piece of bookkeeping that earns its keep. `/new-sermon`
reads `NEW_GUIDE_PROCESS.md`, three complete guides out of `js/data.js`,
`guide.js`, `print-guide.js` and migration `0001`, then holds forty minutes
of transcript, and `/new-worship` adds a resolver run and a search per song
on top. That is a long session, and the first thing to fall out of a
compacted one is the short list somebody pasted at the top an hour ago.
**Step 2 reads the setlist from that file, never from scrollback.** Fill in
the json as each id comes into existence, so a run that gets interrupted can
be picked back up by reading it.

The files are for this run only. They are gone by Tuesday and nothing
depends on them then, see Step 3.

## Step 1. The guide

Read `.claude/commands/new-sermon.md` in full and execute it against the
transcript half, exactly as though it had been typed on its own. All of it,
including the parts that are inconvenient in a chained run:

- **Step 4's draft check happens, unless `--go` was passed.** Show the title,
  the `short_summary` and the three anchors, ask which series this is in and
  roughly how long the message ran, and wait. Real pastoral content is going
  out under the church's name and the fact that a setlist is queued behind it
  is not a reason to skip the read. With `--go` it is skipped, which is that
  step's own provision rather than an override, and the two answers come from
  the command line or are derived as "Going straight through" describes.
- **The narration is part of it and is the half most often dropped.** That
  command ends by speaking the guide's six sections and uploading them, and a
  guide published without it is live with six silent play buttons and nothing
  in the app saying so. It runs here, in this session, and the receipt carries
  its line. Three commands, in this order:

  ```bash
  npm run narrate:setup    # venv and model, idempotent, ~3 min on a fresh container
  npm run narrate:sync     # pulls what is already spoken out of Supabase
  npm run narrate          # speaks only the new guide, once sync has run
  npm run narrate:upload   # sends it and writes guides.narration
  ```

  **Run all four, in that order, every week.** The first two are idempotent
  and cost nothing when they are not needed, so there is no judgment call to
  get wrong. `narrate:sync` is the one whose absence is expensive and silent:
  without it the narrator finds no manifest and no mp3s, and speaks the entire
  catalogue, half an hour to publish six sections. `/new-sermon` has the whole
  of why.

  **If `narrate` reports it is about to make far more sections than the guide
  you just wrote, stop and ask.** That means hashes moved across the
  catalogue, and resealing rather than re-speaking is a decision about audio
  already published. It belongs to the pastor, not to this run.

- **Its confirmation is not printed on its own.** Hold the five or six lines
  and fold them into the single receipt at the end of this file.

When it is done, write `sermon_id`, `guide_id`, `series_id` and the proposed
title into the json from Step 0.

**If a PDF arrived where the transcript should be**, that is `/new-guide`,
not this. Say so, run `.claude/commands/new-guide.md` for this half instead,
and carry on to Step 2 unchanged.

## Step 2. The setlist

Read `.claude/commands/new-worship.md` in full and execute it against
`/tmp/sunday-<date>-setlist.txt`, with the Sunday from Step 0.

Two things about running it here rather than alone, and the first one is the
reason this order is worth having:

- **Step 2 of that command will find a message now.** It is written for a
  Sunday afternoon where the episode does not exist yet and `sermon_id` is
  left null. Step 1 just published the `podcasts` row, so the select on
  `preached_on` returns it and the setlist gets linked the moment it is
  written. That is the normal path here, not a surprise, and it is why the
  guide goes first.
- **Step 5's confirmation happens, unless `--go` was passed.** Show the
  resolved set and wait for a yes. Every `!` line is a question, and an
  unanswered one stops the write. This is the half where a wrong recording
  ships under a right title and nobody catches it by looking at the screen.
  With `--go`, the confirmation goes and its judgment stays: every `!` line
  becomes a dropped link and a line in the receipt instead of a question,
  except a line naming two artists, which still stops. "Going straight
  through" is the whole of what that is allowed to decide.

Hold its two line confirmation for the receipt, same as Step 1.

**A guide that did not publish does not hold the setlist back.** If Step 1
was rejected, abandoned, or could not reach Supabase, publish the setlist
anyway with `sermon_id` null. That is the case `/new-worship` Step 2 already
calls normal, the screen finds the message by date, and Tuesday fills the id
in. Say plainly in the receipt which half went up and which did not.

## Step 3. Tuesday runs itself, on the second transport

The episode does not post until Tuesday, so `/new-podcast` is not part of
this run. **A standing routine wakes Tuesday evening Central**, looks for a
message still carrying `(Working Title)`, and runs `/new-podcast` for it, or
ends silently when there is nothing. It wakes again Wednesday, and that is the
retry: attaching an episode removes the marker, so the same query that finds
work on Tuesday finds nothing on Wednesday and no state passes between them.

**How it reaches Supabase is the part worth knowing**, because the obvious
answer is wrong and a week was lost to it. A scheduled session has **no MCP
connector**: connectors are enabled per chat, nobody opened this one, and a
routine created from inside a session cannot carry a grant with it. It also
has **no `.env`**, because that file is git ignored and the container is a
fresh clone. `supabase/ACCESS.md` calls that combination "neither transport,"
and the routine reported it every week instead of working.

**One environment variable is the way through.**
`SUPABASE_SERVICE_ROLE_KEY`, set on the environment, reaches every session in
it including the ones nobody opened, and `scripts/hc_supabase.py` reads it
when there is no `.env`. The URL it falls back to `js/config.js` for, which is
committed and public, so there is one thing to configure rather than two.
That is the second transport, in the one place it was missing.
`supabase/ACCESS.md` has the whole of it, including what it means to put a
service_role key on an environment.

**There is one routine, not one per Sunday.** Check before you create
anything:

- List the account's routines and look for one named **Tuesday episode
  check**. Found it, and it is enabled, there is nothing to do. Say so in one
  clause of the receipt and stop.
- Missing or disabled, recreate or re-enable it on `0 0 * * 3,4` UTC, which is
  7pm Central Tuesday and Wednesday during daylight time. Cron is fixed UTC
  and Central is not, so when daylight saving ends in November this becomes
  6pm Central until somebody moves it to `0 1 * * 3,4`. An hour early costs
  nothing.
- **No routines tooling in this session**, which is what a terminal session
  on the Mac looks like, print the reminder instead and do not pretend it is
  scheduled:

```
Tuesday    run /new-podcast, no scheduler in this session
```

**Its prompt must check the transport before the work and say which variable
is missing if one is.** A scheduled run cannot ask a question and get an
answer, so the only useful thing it can do with a missing credential is name
it. The failure mode to design against is not an error, it is a quiet week
that looks exactly like a finished one.

## Step 4. One receipt, not three

Each command underneath ends with its own confirmation. **Print one.** Lead
with the Sunday, then the guide's lines, then the setlist's, then Tuesday in
a single clause. No summary of the steps, no offer of next steps.

```
Sunday     September 20 2026

Published  Boats to Tarshish (Working Title)
Stephen, September 20 2026
guides, series-jonah, 7 sections, 14 questions, 16 one-liners
Reading    week 2 of 4, Jonah 1:11 to 2:10, grace at the bottom
Narrated   6 sections, 9.4 min, af_heart
Reconstructed  "Jabra" as Joppa, "Minava" as Nineveh.

Published  4 songs for September 20 2026
Linked to Boats to Tarshish, art and links on all four

Tuesday    routine is set, 7pm Central
```

**The `Narrated` line is not optional and its absence is the bug to watch
for.** A guide can be published, correct, and silent, and nothing on any
screen says which. If that line is missing from a receipt, the audio was not
made, whatever else the receipt says.

The lines each command owns are still that command's to write, in its own
words, including the ones it only prints in particular cases: the
reconstruction line, the stale working titles line, the narration warning,
and the note when a song went up thin. Do not tidy them, do not merge them,
and do not drop one because the receipt is getting long. A receipt that
reads cleaner than what was actually published is worse than no receipt.

**Say out loud what did not happen.** A skipped half, a rejected draft, a
setlist published with no message behind it, a narration that has to be run
on the Mac. The whole value of one command on a Sunday afternoon is that the
one thing you read at the end is true.
