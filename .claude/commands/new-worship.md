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

## Step 3. Find the art and the links

Per song, and in this order, because each step feeds the next:

1. **Look back first.** A song the church has played before already has its
   art and its links resolved, and reusing them costs one query and keeps the
   same recording on the screen two months running:

   ```bash
   python3 scripts/hc_supabase.py select worship_sets --order served_on.desc \
     --limit 12 --columns songs
   ```

   Match on title and artist together. Same title, different artist, is a
   different recording and not a match.

2. **iTunes Search** for anything left, which gives the canonical title and
   artist, the album art, and the Apple Music link, with no key and no
   account:

   ```bash
   curl -s "https://itunes.apple.com/search?term=oceans+hillsong+united&entity=song&limit=5"
   ```

   Take `artworkUrl100` and swap `100x100bb` for `600x600bb` in the URL. That
   is a real size on the same CDN and it is the one the screen wants: the art
   is drawn at up to 320pt and 100px would be a blur.

3. **Odesli** for everything else, from the Apple link:

   ```bash
   curl -s "https://api.song.link/v1-alpha.1/links?url=<apple url>&userCountry=US"
   ```

   `linksByPlatform` has `spotify`, `youtube`, `youtubeMusic`, `amazonMusic`,
   `tidal` and `pandora`. `pageUrl` is the song.link page itself, which goes
   in `links.all`. Store every platform it returns, not only the three the
   screen draws today: the row is cheap and adding a fourth mark later is one
   line in `js/screens/worship.js`.

4. **Lyrics.** Search for the song's page on a lyrics site and check the
   result is that song by that artist. **If you cannot resolve one you trust,
   say so and leave `lyricsUrl` out.** A missing Lyrics link draws nothing,
   and a Lyrics link that lands on a search page or on the wrong song is worse
   than no link at all. Never invent a URL and never publish a search query
   as a link.

**If the egress proxy blocks these**, which is normal in a web session and
looks like `ERR_TUNNEL_CONNECTION_FAILED` or a 403 on CONNECT, do not guess
URLs from memory. Say which songs you could not resolve, ask for the links, or
publish the titles and artists now and fill the rest in on a later run. A set
of four titles with no art is a real screen. Four links to the wrong
recordings is not.

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
not a courtesy. Show what a person can actually check, which is the songs and
the Sunday, and be explicit about anything you could not find:

```
Sunday      August 23 2026
Message     Last Words, linked

1. So Much            Life.Church Worship     art, 3 links, lyrics
2. Holy Spirit        Jesus Culture           art, 3 links, lyrics
3. Lean Back          Maverick City Music     art, 3 links, no lyrics found
4. No Body            Elevation Worship       art, 3 links, lyrics

Write it?
```

## Step 6. Write it

```bash
python3 scripts/hc_supabase.py upsert worship_sets /tmp/worship-2026-08-23.json
```

The row:

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
Linked to Last Words
```

Two lines and stop, no postamble.

---

**This reaches phones on its own.** The Worship screen reads
`HC.data.worshipSets`, and `js/content.js` fills that from the `worship_sets`
table on every app open. So a set written here shows up on the next open, with
no matching edit in `js/data.js` and no `?v=` bump in `index.html`. Do not add
it to `js/data.js`, that is how a catalogue ends up in two places again.
