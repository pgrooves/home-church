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
commands. With no date in the message it is the most recent Sunday, which is
today when today is Sunday. Say which Sunday you picked before anything is
written.

**Now write both halves to disk before you start the sermon work:**

```bash
/tmp/sunday-2026-09-20-setlist.txt     # the song list, verbatim, as typed
/tmp/sunday-2026-09-20.json            # { sunday, sermon_id, guide_id, series_id, title }
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

- **Step 4's draft check happens.** Show the title, the `short_summary` and
  the three anchors, ask which series this is in and roughly how long the
  message ran, and wait. Real pastoral content is going out under the
  church's name and the fact that a setlist is queued behind it is not a
  reason to skip the read. Skip it only if the user says to go straight
  through, which is what that step already says.
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
- **Step 5's confirmation happens.** Show the resolved set and wait for a
  yes. Every `!` line is still a question, and an unanswered one still stops
  the write. This is the half where a wrong recording ships under a right
  title and nobody catches it by looking at the screen.

Hold its two line confirmation for the receipt, same as Step 1.

**A guide that did not publish does not hold the setlist back.** If Step 1
was rejected, abandoned, or could not reach Supabase, publish the setlist
anyway with `sermon_id` null. That is the case `/new-worship` Step 2 already
calls normal, the screen finds the message by date, and Tuesday fills the id
in. Say plainly in the receipt which half went up and which did not.

## Step 3. Make sure Tuesday is covered

The episode does not post until Tuesday, so `/new-podcast` is not part of
this run. **A standing weekly routine handles it**: it wakes Tuesday evening
Central, looks for a message still carrying `(Working Title)`, and runs
`/new-podcast` for it, or ends silently when there is nothing waiting.

**There is one routine, not one per Sunday.** Check before you create
anything:

- List the account's routines and look for one named **Tuesday episode
  check**. Found it, and it is enabled, there is nothing to do. Say so in one
  clause of the receipt and stop.
- Missing or disabled, recreate or re-enable it, on `0 0 * * 3` UTC, which is
  7pm Central Tuesday on daylight time, with the standalone prompt described
  below. Cron is fixed UTC and Central is not, so when daylight saving ends in
  November this becomes 6pm Central until somebody moves it to `0 1 * * 3`.
  An hour early on a Tuesday costs nothing, so it is worth knowing rather than
  worth fixing in a hurry.
- **No routines tooling in this session**, which is what a terminal session
  on the Mac looks like, print the reminder instead and do not pretend it is
  scheduled:

```
Tuesday    run /new-podcast, no scheduler in this session
```

The routine's prompt has to stand entirely on its own, because it fires into
a fresh session on a fresh container. **It does not read the files from Step
0, which are long gone.** It finds its work in the database, with the
complement of the stale check `/new-sermon` already documents:

```sql
select id, title, preached_on, episode_url
  from public.podcasts
 where title like '%(Working Title)%'
   and preached_on >= current_date - 14
 order by preached_on desc;
```

Nothing returned is the normal outcome most weeks and the run ends without
saying anything. One row is the week's message, and `/new-podcast` takes it
from there. More than one means a Sunday was missed, so handle the most
recent and name the others rather than working through them unasked.

That run is not unattended either, and that is fine. `/new-podcast` tries to
fetch the show first and asks for the episode's title, date, Spotify link and
description when the proxy refuses, which is the ordinary shape of a web
session. The routine notifies, the question reaches your phone, and the
episode goes up when you answer it.

**The one thing to actually watch, and it is not the schedule.** A routine
created from inside a session carries no connector grant, so the Tuesday
session may come up with no Supabase MCP server, and `.env` is not there
either. `supabase/ACCESS.md` calls that "neither transport," and on a
scheduled run with nobody watching it would otherwise look exactly like a
quiet week. So the routine's prompt is written to break the silence in that
one case: it says out loud that the check could not run and that
`/new-podcast` needs running by hand. If a Tuesday ever reports that, the fix
is to recreate the routine from the Routines screen on claude.ai, where the
Supabase connector can be attached to it, rather than to change anything
here.

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
Reconstructed  "Jabra" as Joppa, "Minava" as Nineveh.

Published  4 songs for September 20 2026
Linked to Boats to Tarshish, art and links on all four

Tuesday    routine is set, 7pm Central
```

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
