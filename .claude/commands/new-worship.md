---
description: Publish Sunday's worship setlist. Reads a loose list of songs, finds the art and the links, confirms, then writes.
---

# /new-worship

Adds one row to the `worship_sets` table, which is what the Worship screen
behind ••• reads. Run it with the week's songs, in the order they were played:

```
/new-worship
1. Oceans - Hillsong United
2. How Great Is Our God - Chris Tomlin
3. Great Are You Lord - Bryan & Katie Torwalt
```

$ARGUMENTS

---

## Step 0. Check the plumbing

Read **`supabase/ACCESS.md`**. It says which of the two transports to use, the
Supabase MCP server or `scripts/hc_supabase.py`, and gives the SQL equivalent
of every script verb below.

A missing `.env` or a refused connection is the ordinary shape of a web
session, not a reason to stop. Use MCP. Confirm the project ref is
`ibqkumxfltfiuqevviji`, stop only if neither transport is available, and never
ask for a key in the chat.

## Step 1. Read the list

The list arrives however somebody typed it on a Sunday afternoon, and the
shapes below are all the same list:

```
1. Oceans - Hillsong United        Oceans — Hillsong United
2. Holy Spirit: Jesus Culture      • Holy Spirit (Jesus Culture)
   Lean Back, Maverick City        Lean Back by Maverick City Music
```

So: numbered, bulleted or bare lines; a dash, an em-dash, a colon, a comma, a
`by` or parentheses between the song and who sings it. Read it the way a
person would.

**The order is the setlist.** Never sort it, never group it, never move the
fast ones to the top. What arrives first was played first.

Three things to handle rather than guess at:

- **Alternates.** `Holy Spirit: Jesus Culture or Bryan & Katie Torwalt` is two
  recordings of one song, and picking one silently is picking one wrong half
  the time. Say what each one is, the Torwalts wrote it and Jesus Culture cut
  the version most people know, and ask which the band played.
- **Featuring credits.** `Maverick City Music (featuring Chandler Moore)` is
  one artist and a credit. Store the artist. The credit belongs in the row
  only if it is how the recording is actually billed.
- **A song with no artist.** Ask. The screen holds a song with no artist
  without breaking, but a blank line under the art is not the goal, and the
  band knows which version they played.

## Step 2. Find the date, and the message

The set belongs to a Sunday. With no date in the command, it is the most
recent Sunday, which is today when today is Sunday. **Say which Sunday you
picked**, in the confirmation, before anything is written.

Then find that morning's message, which is what the header on the screen
links to:

```bash
python3 scripts/hc_supabase.py select podcasts --eq preached_on=2026-08-23 \
  --columns id,title,preached_on
```

- One match, use its id.
- **No match, leave `sermon_id` null and carry on.** This is the normal case
  on a Sunday afternoon: the setlist goes up hours after the service and the
  episode does not post until Monday. The screen finds the message by date
  meanwhile, and `/new-podcast` fills the id in when the episode lands.
- Two matches, which happens when the church preaches two messages in one
  morning, ask which one.

**Never write the sermon's title into this row.** There is no column for it,
deliberately. `podcasts.title` is the only place a message is named and the
screen reads through to it, which is what makes renaming a message rename it
here too. Migration `0034_worship_sets.sql` is the long version.

## Step 3. Resolve the art and the links

**One command. Do not hand roll this with curl, and do not fill in a link from
memory.** `scripts/resolve_songs.js` reads the list, searches iTunes for each
song, takes the album art and the Apple Music link off the best match, asks
Odesli for every other platform, and writes the finished row:

```bash
node scripts/resolve_songs.js --served-on 2026-08-23 \
  --sermon sermon-last-words \
  --out /tmp/worship-2026-08-23.json < /tmp/songs.txt
```

The row goes to stdout and to `--out`. A summary for a human goes to stderr,
and that summary is what Step 5 shows.

**Reuse what earlier Sundays already resolved.** A song the church played in
June keeps its art and its links, which saves the lookups and keeps the same
recording on screen two months running:

```bash
python3 scripts/hc_supabase.py select worship_sets --order served_on.desc \
  --limit 12 --columns songs > /tmp/known.json
node scripts/resolve_songs.js --served-on 2026-08-23 --known /tmp/known.json ... 
```

A song cached during the keyless window has art and an Apple link and nothing
else. Once `ODESLI_API_KEY` exists, those entries are looked up again rather
than reused, so the first run after the key lands is what backfills them. A
song that already has its platforms is never refetched.

### What its exit code means

| Code | Meaning | What to do |
|---|---|---|
| 0 | Every song came back with art and *at least one* link | Go to Step 5 |
| 2 | At least one song has no art or no links at all | Go to Step 5 and **say which ones** |
| 1 | Something went wrong, nothing was written | Read the message, do not publish |

**Exit 0 does not mean every platform.** It means no song came back empty. A
set with art and an Apple link and nothing else exits 0, which is correct and
is also exactly what a missing `ODESLI_API_KEY` produces. Read the link counts
in the summary rather than the exit code when you want to know whether the
platforms are there.

The message on exit 1 that matters most is `could not reach
itunes.apple.com`. **That is a blocked egress proxy, not a song without art**,
and it is the difference between "these four songs have no art" and "nothing
was resolved at all". Do not publish a set on the back of it. Either run the
command on a machine with open network access, or ask for the links and pass
them in by hand. This exact failure is how the first setlist went up with four
titles and nothing else.

### Where the links actually come from

Odesli used to answer this in one call. Its API is retired, so the resolver
now assembles the same row from four sources, and **every one of them is
checked against the length of the recording iTunes already matched**:

| Source | Gives | Key needed |
|---|---|---|
| iTunes Search | title, artist, art, Apple link, **duration** | no |
| song.link page | Tidal, Amazon, Deezer, Pandora | no |
| Deezer API | **ISRC**, Deezer link | no |
| YouTube search | YouTube, YouTube Music | no |
| Spotify embed | **verifies** a Spotify id | no |

**Length is the whole trick.** A worship title is not unique: "Holy Spirit"
by Jesus Culture has four Spotify releases, "So Much" has a radio edit and a
MultiTracks session, and a title search lands on whichever one the service
ranks first. On the 8/23 set every correct match agreed with Apple to within
**one millisecond**, while the radio edit of "So Much" was out by 198
seconds. So nothing is accepted on its name. It matches the length, or it
does not go in the row.

### Spotify has to be handed in

Spotify is the one service that cannot be searched: its search page renders
in the browser and carries no results in the HTML, its API needs a token,
and the endpoint that mints an anonymous one is blocked. The resolver
therefore **verifies rather than finds**.

So: search the web for each song's Spotify track, and pass the ids in.

```bash
node scripts/resolve_songs.js --served-on 2026-08-23 \
  --spotify "So Much=6uqYWwJnvxaea90fGpnD5K;Holy Spirit=5Xjcst6Rle74VteHx0zczO" \
  < /tmp/songs.txt
```

Pass every plausible candidate; they are cheap. Each one is fetched from
Spotify's embed page, which is server rendered and carries the exact
duration, and any id whose length disagrees with Apple's is dropped. **A
wrong id costs a missing link, never a wrong one**, so there is no need to be
certain before passing one in. A song with no verified id gets a `!` line
telling you so.

When several ids all match the same length, they are re-releases of one
recording. Prefer the one whose release date matches the album iTunes
matched: for 8/23 that put Holy Spirit on the 2012 *Live From New York* cut
rather than the 2020, 2021 or 2023 re-issues.

### YouTube, and the channel check

A YouTube upload is taken only from **the artist's own channel**, at a
matching length. Both checks are needed and "Lean Back" is why: the official
upload runs 15:48 against Apple's 15:45, and a reposted lyric video sits at
15:49 — one second *closer*. Length alone picks the repost.

The cost is that an official upload on a **label** channel goes unmatched.
TRIBL carries Maverick City, and the resolver does not know that, deliberately:
a table of which channel belongs to which label would be wrong the first week
somebody signs elsewhere. You get `! no YouTube upload on this artist's own
channel`. Check it once, and if it is right, it is a real link to add.

### Why not just search the web for all of them

Because the web will happily give you five plausible links and no way to tell
which is the recording the band played. That is the mistake this whole file
exists to prevent, and it is not hypothetical: a search for "Holy Spirit
Jesus Culture" returns four different Spotify ids and a fan-made lyric video
above the official upload. Search is fine for *finding candidates*. The
length check is what decides.

### If Odesli ever comes back

`ODESLI_API_KEY` in `.env` still works and still runs first, because one call
that matches on the recording's own identity beats four that infer it from a
length. Without a key Odesli is not called at all — an unkeyed request can
only answer 401, so the resolver stopped making one.

### The two things it will not decide for you

- **A line naming two artists.** `Holy Spirit: Jesus Culture or Bryan & Katie
  Torwalt` is two recordings of one song. The script uses the first so the run
  can finish, and prints `! the line named two artists`. **Ask which one the
  band played before Step 6**, and rerun with the answer. The Torwalts wrote
  that one and Jesus Culture cut the version most people know, so say that
  rather than asking a bare question.
- **A match it is not sure of.** Anything printed `[low, ...]` or
  `[none, ...]` gets a `! check this one` and usually a runner up. Read the
  match out in Step 5 and let somebody confirm it. A wrong recording under the
  right title is the one mistake nobody catches by looking at the screen.

### Lyrics

Filled in automatically when `GENIUS_TOKEN` is in `.env`, checked against the
song that was actually matched rather than the line that was typed. Left empty
when there is no token, and an empty one draws no Lyrics link at all.

**Never invent a lyrics URL and never publish a search query as a link.** A
Lyrics button that lands on a results page or on somebody else's song is worse
than no button.

## Step 4. Pick an id

Derived from the date, always: `worship-2026-08-23`. One set per Sunday and
the date is unique in the table, so this cannot collide with anything except
a set for that same morning, which is the collision you want.

```bash
python3 scripts/hc_supabase.py select worship_sets --eq id=worship-2026-08-23 --columns id
```

If it already exists, this is an edit rather than a new set. Say so, show what
changes, and upsert over it.

## Step 5. Confirm before writing

**Always show the finished set and wait for a yes.** This is a required step,
not a courtesy.

The summary Step 3 printed to stderr is already the right shape, so show that
rather than rewriting it, and add the message and the question:

```
Sunday      2026-08-23
Message     sermon-last-words

1. So Much  /  Life.Church Worship
   art, 6 links, lyrics   [high, via iTunes]

2. Holy Spirit  /  Jesus Culture
   art, 6 links, lyrics   [high, via iTunes]
   ! the line named two artists: Jesus Culture / Bryan & Katie Torwalt.
     Used the first. Ask before writing.

3. Lean Back (feat. Amanda Lindsey Cook & Chandler Moore)  /  Maverick City Music
   art, 6 links, no lyrics   [medium, via iTunes]

4. No Body  /  Elevation Worship
   art, 6 links, lyrics   [high, via iTunes]

Write it?
```

A resolved song reads `art, 8 links`: Apple, Spotify, YouTube, YouTube Music,
Deezer, Tidal, Amazon and Pandora. Fewer than that is not a failure, but say
which ones are short and why in the confirmation, rather than letting it pass
as normal, so nobody discovers it on a phone on Sunday morning.

**Every `!` line is a question, not a footnote.** Do not write a set with one
still unanswered. Rerun Step 3 with the answer rather than editing the row by
hand, so what gets published is what the resolver actually found.

## Step 6. Write it

```bash
python3 scripts/hc_supabase.py upsert worship_sets /tmp/worship-2026-08-23.json
```

That file is what Step 3 wrote. **Do not retype it and do not edit the links
in it by hand**: every URL in there came back from a service, and one typed
from memory is a dead button in front of a congregation.

The shape, for reading rather than for writing:

```jsonc
{
  "id": "worship-2026-08-23",
  "served_on": "2026-08-23",
  "sermon_id": "sermon-last-words",     // null until the episode is published
  "songs": [
    {
      "title": "Oceans (Where Feet May Fail)",
      "artist": "Hillsong UNITED",
      "artUrl": "https://is1-ssl.mzstatic.com/.../600x600bb.jpg",
      "lyricsUrl": "https://...",       // leave out when you found none
      "links": {
        "youtube": "...", "spotify": "...", "apple": "...",
        "amazon": "...", "youtubeMusic": "...", "tidal": "...",
        "all": "https://song.link/..."
      }
    }
  ],
  "published": true
}
```

Only `title` is load bearing on a song. Art, links and lyrics are each
optional and a missing one draws nothing rather than a hole, which is what
lets a set go up on the Sunday and be filled in on the Monday.

Set `"published": false` to stage a set nobody should see yet. The app cannot
see it, you still can.

Media stays on the external host. Nothing is uploaded to Supabase storage,
same as podcasts and Instagram, and it is still a cost decision.

## Step 7. Confirm, briefly

```
Published  4 songs for August 23 2026
Linked to Last Words, art and links on all four
```

Two lines and stop, no postamble. **If any song went up thin, say so on the
second line** rather than letting "published" imply it is complete:

```
Published  4 songs for August 23 2026
Lean Back has no art or links, nothing matched it
```

---

**This reaches phones on its own.** The Worship screen reads
`HC.data.worshipSets`, and `js/content.js` fills that from the `worship_sets`
table on every app open. So a set written here shows up on the next open, with
no matching edit in `js/data.js` and no `?v=` bump in `index.html`. Do not add
it to `js/data.js`, that is how a catalogue ends up in two places again.
