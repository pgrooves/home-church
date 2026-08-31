---
description: Publish Sunday's worship setlist. Reads a loose list of songs, finds the art and the streaming links with no API keys, confirms, then writes.
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

**No API keys are needed for any of this, and none should be asked for.** The
two halves use two different tools, and both are already available:

| What | How | Needs a key |
|---|---|---|
| Album art, Apple Music link, canonical title and artist | `scripts/resolve_songs.js` (iTunes Search) | **no** |
| Spotify link, YouTube link | **your own `WebSearch` tool**, see 3b | **no** |
| Lyrics | WebSearch, or `GENIUS_TOKEN` if one is set | no |

If you find yourself about to ask for a Spotify client secret or a YouTube API
key, stop: that is the optional accelerator in 3c, not the process. The church
does not have those keys and does not need them.

### 3a. Art and the Apple link, from the script

```bash
node scripts/resolve_songs.js --served-on 2026-08-23 \
  --sermon sermon-last-words \
  --out /tmp/worship-2026-08-23.json < /tmp/songs.txt
```

The row goes to stdout and to `--out`; a summary for a human goes to stderr.
It will report Spotify, YouTube and lyrics as `not set up, so not looked for`.
**That is expected, and 3b is what fills them in.**

Reuse what earlier Sundays resolved, so a song played in June keeps its links:

```bash
python3 scripts/hc_supabase.py select worship_sets --order served_on.desc \
  --limit 12 --columns songs > /tmp/known.json
node scripts/resolve_songs.js --served-on 2026-08-23 --known /tmp/known.json ...
```

**Do not take the first search result yourself and skip the script.** Its
scoring is the whole point: a plain "first non-karaoke result" search for this
church's own setlist returned *No One* by Elevation Worship for the song *No
Body*, and the MultiTracks Session in place of the album cut. The script gets
both right.

Exit codes: `0` everything resolved, `2` at least one song came back thin so
say which, `1` nothing was written so do not publish. On `1`, the message
`could not reach itunes.apple.com` means the network, not a song without art.

### 3b. Spotify and YouTube, with WebSearch

**This is you, not a script.** For each song, run `WebSearch` twice, scoped to
one domain each. Use the title and artist the script settled on in 3a, not the
line that was typed.

```
WebSearch  query: "So Much" Life.Church Worship song
           allowed_domains: ["open.spotify.com"]

WebSearch  query: "So Much" Life.Church Worship official
           allowed_domains: ["youtube.com"]
```

Spotify result titles have a rigid shape, and that shape is what makes this
checkable rather than a guess:

```
So Much - song and lyrics by Life.Church Worship | Spotify
└─ track ─┘                  └─ artist ─┘
```

**Spotify rules, in order:**

1. **URL must be `open.spotify.com/track/…`.** Reject `/artist/`, `/album/`,
   `/playlist/`, `/show/`, `/embed/`. Strip a locale segment: `/intl-pt/track/…`
   becomes `/track/…`.
2. **Split the title on the literal `" - song and lyrics by "`.** The artist is
   on the right. The requested artist must match the **right** side.
3. **Never accept an artist found only on the left.** `Holy Spirit (Jesus
   Culture Cover) [feat. Jay Bisaga]` has "Jesus Culture" in the track name and
   somebody else as the artist. That is the trap, and it is a real result for
   this church's own setlist.
4. **Match the artist properly, not by prefix.** `Holy Spirit - Live - song and
   lyrics by Jesus Co.` is a different artist from Jesus Culture, and it is
   also a real result for this setlist.
5. **Reject** a left side containing cover, karaoke, tribute, instrumental,
   remix, sped up, slowed, made popular by.
6. **Prefer the plain one.** Between `So Much` and `So Much - Radio Version` or
   `- MultiTracks Session` or `- Live`, take the one with no qualifier, unless
   the church's line asked for that version.

**YouTube rules:**

1. **URL must be `youtube.com/watch?v=…`.** Reject `/@handle`, `/playlist`,
   `/channel`, and `music.youtube.com`.
2. The title must contain **both** the song and the artist.
3. **Prefer the official upload**: "Official Lyric Video", "Official Music
   Video", "Official Video", or the artist's own channel.
4. **Reject** cover, karaoke, instrumental, tutorial, reaction, drum cam, and
   fan lyric re-uploads when an official one is in the results.

Then edit the two keys into the row `--out` wrote, and nothing else:

```jsonc
"links": {
  "apple":   "https://music.apple.com/...",   // from 3a, leave alone
  "spotify": "https://open.spotify.com/track/6uqYWwJnvxaea90fGpnD5K",
  "youtube": "https://www.youtube.com/watch?v=xOyWfN-nftk"
}
```

**If no result passes the rules, leave the platform out.** The screen draws
nothing for a missing link, and that is the correct outcome. A button that
opens the wrong recording is worse than no button, and nobody catches it by
looking at the screen.

### 3c. Optional, only if the church later gets keys

`.env.example` lists `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`,
`YOUTUBE_API_KEY`, `ODESLI_API_KEY` and `GENIUS_TOKEN`. With any of them set,
`resolve_songs.js` fills that platform in itself and 3b has less to do. **Do
not go looking for these, do not ask for them, and do not treat their absence
as a blocker.** Odesli in particular retired its free public endpoint and
answers 401 `PUBLIC_API_ACCESS_DEPRECATED` without a key, which is why the
script skips it rather than trying.

### The two things nothing will decide for you

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

**Never invent a link, and never publish a search query as one.**

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

Start from the summary 3a printed to stderr, add what 3b found, and add the
message and the question. Name the platforms rather than counting them: "5
links" tells nobody which five, and the whole reason 3b exists is that Spotify
and YouTube are the two people actually tap.

```
Sunday      2026-08-23
Message     sermon-last-words

1. So Much  /  Life.Church Worship
   art, Apple + Spotify + YouTube   [high, via iTunes]

2. Holy Spirit  /  Jesus Culture
   art, Apple + Spotify + YouTube   [high, via iTunes]
   ! the line named two artists: Jesus Culture / Bryan & Katie Torwalt.
     Used the first. Ask before writing.

3. Lean Back (feat. Amanda Lindsey Cook)  /  Maverick City Music & Chandler Moore
   art, Apple + Spotify   [medium, via iTunes]
   ! no YouTube result passed the rules, so the song has no YouTube button

4. No Body (feat. Jonsal Barrientes)  /  Elevation Worship
   art, Apple + Spotify + YouTube   [high, via iTunes]

Write it?
```

**Every `!` line is a question, not a footnote.** Do not write a set with one
still unanswered. Rerun Step 3 with the answer rather than editing the row by
hand, so what gets published is what the resolver actually found.

## Step 6. Write it

```bash
python3 scripts/hc_supabase.py upsert worship_sets /tmp/worship-2026-08-23.json
```

That file is what Step 3 wrote, plus the two keys 3b added to it. **Every URL
in it came from iTunes or from a search result you checked against the rules
in 3b.** Do not retype one from memory and do not adjust one to look tidier: a
link typed from memory is a dead button in front of a congregation, and it
looks exactly like a working one until somebody taps it.

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
