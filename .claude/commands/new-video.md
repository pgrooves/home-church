---
description: Put a video in the featured spot at the top of Home. Paste the link, it confirms what is there now, then writes.
---

# /new-video

Sets one row, `app_settings.home_featured_video`, to one YouTube link. That row
is the video in the frame between the greeting and Announcements on Home: no
heading over it, no caption under it, playing on mute the moment the app opens,
with a pill on it that turns the sound on.

Setting it is the whole job. No rebuild, no submission, no code: `app_settings`
is read on every open, so the next time anybody opens the app they get the new
video.

$ARGUMENTS

---

## What the one row changes

One place, and that is the point of it. The featured frame on Home, above
Announcements, below the greeting. Nothing else in the app reads this row.

Emptying it takes the frame off Home entirely and closes the gap. That is a
normal thing to want on a week with nothing to feature, and it is how you turn
this spot off, so treat "take the video down" as an ordinary run of this
command with an empty value rather than something that needs a code change.

## Step 0. Check the plumbing

Read **`supabase/ACCESS.md`**. It says which of the two transports to use, the
Supabase MCP server or `scripts/hc_supabase.py`.

A missing `.env` or a refused connection is the ordinary shape of a web
session, not a reason to stop. Use MCP. Confirm the project ref is
`ibqkumxfltfiuqevviji`, stop only if neither transport is available, and never
ask for a key in the chat.

## Step 1. Read the link

Take it out of the message. Every shape works, because the app parses the id
out of all of them:

| Shape | Example |
|---|---|
| Share link | `https://youtu.be/p8aqXrP4wws` |
| Watch link | `https://www.youtube.com/watch?v=p8aqXrP4wws` |
| Short | `https://www.youtube.com/shorts/p8aqXrP4wws` |
| Live | `https://www.youtube.com/live/p8aqXrP4wws` |
| Bare id | `p8aqXrP4wws` |

Tracking junk after the id (`?si=`, `?is=`, `&t=`) is harmless. Store the link
exactly as it was given, junk and all: the app reads the eleven characters in
the middle and ignores the rest, and keeping what was pasted means the row
still says where it came from.

**Check the id yourself before writing it.** Eleven characters of letters,
digits, `-` and `_`:

```bash
printf '%s\n' "<link>" | grep -oE '(youtu\.be/|/embed/|/live/|/shorts/|[?&]v=)[A-Za-z0-9_-]{11}'
```

- **Nothing comes back** — that is not a YouTube link. Say so and ask for one,
  do not guess at an id.
- **The word `videoseries`** — that is a playlist, not a video. The app refuses
  it by name. Ask for one video's link.
- **A Vimeo link, an mp4, an Instagram or Facebook link** — this spot is
  YouTube only, because that is the one embed the app's `frame-src` allows for
  a single video plus Vimeo, and only YouTube is wired here. Say so plainly.
  Vimeo is a small change to `js/featured-video.js` if the church wants it; do
  not fake it with a link out.

**A Short is fine.** `/shorts/` in the link is what tells the app to draw the
frame upright instead of letterboxing a vertical video into a wide box, so keep
that part of the URL rather than converting it to a watch link.

## Step 2. Say what is there now, then write

Read the row first. Replacing a video is the normal case, and the old value
should be said out loud in the same message as the confirmation, so nobody
discovers a week later that the launch video they meant to keep is gone.

```bash
python3 scripts/hc_supabase.py select app_settings --eq key=home_featured_video \
  --columns key,kind,value_text
```

```sql
select key, kind, value_text from public.app_settings where key = 'home_featured_video';
```

Then write it:

```bash
python3 scripts/hc_supabase.py setting home_featured_video "https://youtu.be/p8aqXrP4wws"
```

```sql
update public.app_settings
   set value_text = 'https://youtu.be/p8aqXrP4wws'
 where key = 'home_featured_video';
```

**No row yet?** The project has not run `supabase/migrations/0063_home_featured_video.sql`.
Run that file rather than inserting a bare row from here: it carries the label
and the help text the Admin screen draws around the box, and a row inserted
without them is a nameless text field in front of the pastor.

**Taking the video off Home** is the same write with `""`. Not `null`, and not
deleting the row: the row is what the box in Settings → Admin → App settings is
drawn from, and an empty box is the way back.

**The `setting` verb, and not `update`.** `app_settings` is keyed on `key`
rather than `id`, so `update` comes back 400 with a message about a missing
column, which reads like the row is gone. `setting` reads `kind` off the row
first and writes the right column.

## Step 3. Read it back, then say what happened

```bash
python3 scripts/hc_supabase.py select app_settings --eq key=home_featured_video \
  --columns key,value_text
```

Report, in two or three sentences:

- the link now on the row, and the eleven character id in it,
- that it plays on mute at the top of Home the next time the app is opened,
  with the pill for sound, and that nothing has to be rebuilt or resubmitted,
- and, if it replaced a video, what the old link was.

## What not to do

- **Do not edit `js/data.js`.** It holds no featured video and should not. The
  cold start floor is the constant `FALLBACK` in `js/featured-video.js`, and it
  is only ever seen by an install that has never reached Supabase.
- **Do not change `FALLBACK` on a weekly swap.** That constant is a shipped
  file: changing it needs a build and a submission to reach a phone, which is
  the entire reason the link is a row. It is worth moving once a season, when
  the video that ships with the app has become properly old, and that is a code
  change with `npm run stamp` and a submission behind it, not this command.
- **Do not add a second setting for the shape, the sound or an on/off switch.**
  The link says whether it is a Short, the sound is the person watching's
  choice, and an empty string is off.
- **Do not put a playlist in here**, and do not paste a link to a video whose
  owner has turned embedding off. Both draw an error player, on the screen the
  app opens to. A playlist is refused by the app before it reaches a frame; an
  embed the owner has blocked cannot be detected from here, so if the video
  belongs to somebody else, watch it once in the app afterwards.

## The other two ways this row gets written

Worth knowing, and worth saying when you report back.

- **Settings → Admin → App settings → Featured video**, inside the app, on the
  pastor's own phone. Same row, saves as you type. This command exists for the
  weeks when the link arrives in a message rather than in front of the phone.
- **The Supabase SQL editor**, for the times neither of the above is to hand.
  The `update` statement above is the whole job.
