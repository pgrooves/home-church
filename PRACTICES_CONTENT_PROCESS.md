# Getting the Practicing the Way content into the app

The Practices section ships with nine **placeholder** files. The grid, the
icons, the navigation, and the page template are all finished and live. What
is missing is the words and the videos, and this file is how they get in.

Give this file to Claude Code, in this repo, and say **"load the practices."**
That is the whole trigger, and everything below is instructions for Claude.

If you are reading this yourself instead: you do not need any of the code
below. Skip to **"The short version"**, then to **"Doing it by hand"** if the
automatic path does not work. Either way, read
**"The one thing to settle first"** before you put anything in the app.

-----

## The one thing to settle first

**Confirm with Practicing the Way that reproducing their session text inside a
church app is something they are happy with, and keep the reply.**

Nobody has done this yet. They give their courses away to churches and the
whole point of their organisation is that churches run them, so this is very
likely fine, but "very likely fine" is not the same as asked. Their material,
their call. A short email naming what the app does, that it is free, that it
is Home Church only, and that every page credits them, is the whole errand.

The app already credits them properly. `credit()` in `js/screens/practices.js`
puts the same attribution block under the header on the grid and on all nine
practice pages, with a link to `practicingtheway.org`, and the bottom of each
page names the exact page its words came from. Do not remove either one, and
do not let a future edit quietly reword them into something vaguer.

If they would rather the text were not reproduced, the fallback is a good one:
keep the videos and the practice action lines, replace the teaching paragraphs
with a sentence pointing at their page. The template handles a session with no
teaching text without any change, because `teaching` is just an array and an
empty one renders nothing.

-----

## What you are producing

One file per practice, in `data/practices/`, plus `index.json` which is the
grid's order. The app reads those files and nothing else. It never scrapes
practicingtheway.org and never calls the YouTube API on anybody's phone; that
work happens once, here, on a laptop, where a person can look at the result
before it ships.

The nine, with the playlist behind each:

| practice | page | playlist |
| --- | --- | --- |
| Sabbath | practicingtheway.org/sabbath | `PL6zls_4DoKIxWQnGB_MA639KE4GZzrKK6` |
| Prayer | practicingtheway.org/prayer | `PL6zls_4DoKIx8AMvLlTyYFcq0HVQ7PcBv` |
| Fasting | practicingtheway.org/fasting | `PL6zls_4DoKIwEPaswOvpZUVK45P9bWHhn` |
| Solitude | practicingtheway.org/solitude | `PL6zls_4DoKIwmEAighMzCWI5YdzYC1ryk` |
| Scripture | practicingtheway.org/scripture | `PL6zls_4DoKIy5VUZrhMOCu62vWKa_-2RL` |
| Community | practicingtheway.org/community | `PL6zls_4DoKIxayL6ukxEs-GBjN0JUCoB3` |
| Generosity | practicingtheway.org/generosity | `PL6zls_4DoKIykoOl71P4PIMfuUes_K1pq` |
| Service | practicingtheway.org/service | `PL6zls_4DoKIyLOoVi26-SS5eTNmX2e31g` |
| Witness | practicingtheway.org/witness | `PL6zls_4DoKIx3qL8Fqbg5m1lNPczkPNky` |

The same list is at the top of `scripts/build_practices.js`, which is the only
thing that writes these files.

-----

## The short version

```bash
export YOUTUBE_API_KEY=...        # or just have yt-dlp on PATH
npm run practices -- --report     # propose, print, write nothing
npm run practices -- --write      # once the mapping looks right
```

`--report` is the default and `--write` has to be asked for on purpose. Do one
practice at a time while you are learning what the reports look like:

```bash
npm run practices -- --report sabbath
```

-----

## Read the report before you write anything

This is the part that matters, and it is why the script prints instead of
just running.

**The playlists do not line up with the site.** They are not guaranteed to
have one video per written session. One of them has thirteen videos against
four sessions. So the script does not quietly pair them up. It proposes a
mapping and marks how sure it is:

| marker | what it means | trust it? |
| --- | --- | --- |
| `certain` | the video's own title names its session ("Session 2: Resting") | yes |
| `GUESSED` | no session numbers anywhere, but the counts matched, so they were zipped in playlist order | **check every one** |
| `NONE` | no honest pairing was available | the session ships without a video |

Anything that did not map to a session goes to **extras**, which the page
shows under "Also in this series" at the bottom. Trailers, Q&A, bonus
conversations. They are kept, and they are kept apart, so that nothing in the
run of sessions above is something the site never actually taught.

Then read the flags. Every one of them is a thing a person has to decide:

- `promotional-content` — book preorders, cohort signups, newsletter pitches.
  Already kept out of the data. Check that none of it was real teaching text
  the pattern caught by mistake.
- `count-mismatch` / `shape-mismatch` — the playlist and the site disagree
  about how many sessions there are. Decide what the right pairing is and, if
  the script cannot get there on its own, fix it by hand afterwards.
- `missing-practice-line` — a session with no "Practice:" action step. Usually
  means the site words it differently on that page. Add it by hand.
- `missing-intro` / `no-sessions-found` — almost always means the page is
  rendered by JavaScript and there was nothing in the HTML to read. See below.
- `embedding-disabled` — the owner has turned embedding off for that video. It
  is dropped rather than turned into a link out, because this app plays video
  in the app or not at all. Nothing to fix in code; it is worth knowing.
- `unavailable-videos` — private or deleted slots in the playlist.

The flags are written into the data file too, not just printed, so whoever
opens one in six months sees the same warnings.

-----

## When the automatic path does not work

**The page is JavaScript-rendered, or the network cannot reach it.** Open the
page in a browser, save it (`File > Save Page As`, or Share > Save on a
phone), and hand the file over:

```bash
npm run practices -- --write sabbath --html ~/Downloads/sabbath.html
```

**The machine that can reach YouTube is not the machine building the app.**
Dump the playlist where it works and bring the file:

```bash
yt-dlp --flat-playlist -J "https://www.youtube.com/playlist?list=PL6zls_4DoKIxWQnGB_MA639KE4GZzrKK6" > sabbath.pl.json
npm run practices -- --write sabbath --playlist-json sabbath.pl.json
```

Both flags together work too. A `playlistItems` response from the YouTube Data
API is also accepted; it carries no durations, so the pages simply will not
print a running time, and that gets flagged rather than filled in with a
plausible number.

**A YouTube Data API key** comes from console.cloud.google.com: new project,
enable "YouTube Data API v3", create an API key. It is free at this volume and
it is read-only. Do not commit it. `yt-dlp` needs no key at all and is the
easier path if you can install it.

-----

## Doing it by hand

This always works and needs no network, no key, and no script. Copy the text
off the page into the file yourself. `--stub` writes the empty shape to start
from:

```bash
npm run practices -- --stub sabbath
```

Then fill it in. The whole shape:

```json
{
  "schema": 1,
  "slug": "sabbath",
  "title": "Sabbath",
  "icon": "practiceSabbath",
  "source": {
    "site": "https://practicingtheway.org/sabbath",
    "playlistId": "PL6zls_4DoKIxWQnGB_MA639KE4GZzrKK6",
    "playlistVia": "by hand",
    "generatedAt": null
  },
  "intro": [
    "First overview paragraph.",
    "Second overview paragraph."
  ],
  "sessions": [
    {
      "number": 1,
      "title": "Stopping",
      "teaching": ["One paragraph per entry."],
      "practice": "The action step, without the word Practice: in front of it.",
      "video": {
        "videoId": "dQw4w9WgXcQ",
        "title": "Session 1: Stopping",
        "duration": "11:52",
        "seconds": 712,
        "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        "embeddable": true,
        "confidence": "by hand"
      }
    }
  ],
  "extras": [],
  "flags": []
}
```

Rules that are easy to get wrong:

- **`videoId` is the eleven characters after `v=`**, not the whole URL. In
  `youtube.com/watch?v=dQw4w9WgXcQ&list=PL...` it is `dQw4w9WgXcQ`. The app
  refuses anything that is not eleven characters of letters, digits, `-` and
  `_`, and shows a toast instead of building a broken player.
- **`video` may be `null`.** A session with no video renders without one.
- **`teaching` is one string per paragraph.** Do not paste four paragraphs into
  one string; the page will set them as a single wall of type.
- **`practice` has no "Practice:" prefix.** The page draws that label itself.
- **`thumbnail`** can be left off entirely. It falls back to
  `https://i.ytimg.com/vi/<videoId>/hqdefault.jpg`, which is what you would
  have typed anyway.
- **Leave `schema` at 1.** The app refuses a file whose schema it does not
  know rather than half-rendering it.
- **Do not paste in book preorders or cohort ads.** See the flags section.

You can do this for one practice and let the script do the other eight. The
files are independent.

-----

## Checking your work

```bash
npm run test:js          # the pipeline's own tests, plus the rest of the app
python3 -m http.server 8000
```

Then open `http://localhost:8000`, device toolbar at 390 x 844, and go
**•••** > **Practices**. Do not open `index.html` straight off the disk for
this: the practice files are read with `fetch`, and browsers refuse `fetch`
over `file://`, so the grid will come up empty and it will look like your data
is broken when it is not.

What to look at on a page you just filled in:

- The credit block is under the header, above everything else.
- Sessions run in order, and each one is video, then teaching, then the
  practice step. Same three, same order, on all nine pages.
- Nothing from a book ad made it in.
- Tap a video. It should play **in the page**. If it opens the YouTube app or
  a browser tab, something is wrong: nothing in this section is allowed to
  leave the app except the `practicingtheway.org` credit link.

Then, before committing:

```bash
npm run stamp
```

Skip that and returning phones keep serving the old build from cache, quietly.
Data files under `data/` are not covered by the stamp, because they are
fetched rather than script-tagged, and `fetch` in `js/practices.js` already
passes `cache: 'no-cache'`.

-----

## As you go

The nine are independent and the app does not care how many are filled in.
Ship one, ship three, ship all nine. A practice still on its placeholder says
"This practice has not been added yet" on its own page, and its icon still
sits in the grid, which is the honest state and needs no other handling.
