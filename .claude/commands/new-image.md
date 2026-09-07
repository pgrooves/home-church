---
description: Point at a picture and it becomes a series' artwork everywhere the app draws that series. Confirms the series first, then writes.
---

# /new-image

Sets one column, `series.art_url`, for one series. That column is the church's
own graphic for a series, and setting it is the whole job: no rebuild, no
submission, no code. The app reads the `series` table on every open.

Use it the week a new series starts, when the graphic exists but the app is
still drawing the house tile for it.

$ARGUMENTS

---

## What the one column changes

Five places, all at once, and they are why this is worth doing properly:

| Screen | Where it lands |
|---|---|
| Listen | the series rail at the top |
| Listen | the latest message's hero, behind the play disc |
| Listen | every episode row's square, for every message in the series |
| Guide | a thumb beside every guide in the series, on the index |
| Home | the week's guide card |

All five go through `HC.data.seriesArt()` and `c.cover()`, and all five lay the
picture **over** the drawn house tile rather than instead of it. So a URL that
dies, a phone with no signal, and a series with no art all end up showing the
same drawn cover rather than a hole. That is the safety net, and it is also the
reason a wrong URL here is quiet: it does not break the screen, it just never
appears. Read the row back at the end. Do not assume.

One file serves three shapes, cropped from the centre: 16:9 on the hero, 4:3 on
the rail, 1:1 on the thumbs. Step 3 is about that.

## Step 0. Check the plumbing

Read **`supabase/ACCESS.md`**. It says which of the two transports to use, the
Supabase MCP server or `scripts/hc_supabase.py`.

A missing `.env` or a refused connection is the ordinary shape of a web
session, not a reason to stop. Use MCP. Confirm the project ref is
`ibqkumxfltfiuqevviji`, stop only if neither transport is available, and never
ask for a key in the chat.

## Step 1. Which series

```bash
python3 scripts/hc_supabase.py select series --order started_on.desc --limit 6 \
  --columns id,title,started_on,is_current,art_url
```

- **The message names one**, by title or id, use it.
- **It does not**, take the row with `is_current` true. That is nearly always
  right: this is a command for a series that has just started.
- **Two could be meant**, or the current one already has art and the message
  reads like it is about a different series, show the candidates with their
  dates and ask. One question is cheaper than a wrong series wearing a picture
  on five screens.

**A series that already has `art_url` is a replacement, not a mistake.** Say
the old value out loud before you overwrite it, in the same message as the
confirmation. Graphics do get redone mid series and that is a normal edit.

**No series row at all yet?** Stop and say so. `/new-guide` creates the series
row, and creating one here from a picture would guess at the title, the
subtitle and the start date. Point at `/new-guide` instead.

## Step 2. Find the picture

Four ways the picture arrives, in the order they are worth trying.

### A. A URL in the message

The simplest case, and the one to prefer. It has to be **https** — the app is
served over https and a browser will refuse a mixed content image without
saying anything useful.

Try to fetch it, but read the result carefully:

```bash
curl -sSI --max-time 20 "<url>" | head -5
```

- A 200 and an `image/*` content type, good.
- A 404 or an HTML page, ask. That URL is not the picture.
- **`CONNECT tunnel failed` or a 403 from the proxy is not a verdict on the
  URL.** Web sessions cannot reach most external hosts, and the church's
  graphics live on hosts like `usercontent.flodesk.com` that are routinely
  blocked here while being perfectly fine on every phone. Say you could not
  check it from this session and carry on. Do not swap in a different URL, and
  do not report the picture as broken.

### B. It is already on an announcement

The usual case at the start of a series: the church made one graphic, it went
out on the launch announcement, and that row already holds a working URL.

```bash
python3 scripts/hc_supabase.py select announcements --order created_at.desc --limit 8 \
  --columns id,title,image_url
```

Match on the series name in the announcement title. Copy `image_url` across
**exactly**, character for character, escapes included: `%21Jonah-1.png` is a
different URL from `!Jonah-1.png` on some hosts, and the point of copying is
that both rows end up pointing at the same file.

### C. A file on this machine

A path in the message, or an attachment that landed on disk. Check it is
really there before promising anything, and get its size and shape:

```bash
ls -l "<path>" && file "<path>"
```

**Look before you decide it is not there.** An attached picture sometimes
arrives as a real file and sometimes only as pixels in the conversation, and
which one it is depends on the client rather than on anything anybody typed.
Check the obvious places for something image shaped written in the last few
minutes before falling through to D:

```bash
ls -lt . /tmp "$TMPDIR" 2>/dev/null | head -30
```

It has to be hosted somewhere the app can reach, which means Supabase Storage,
which means the **service role key** in `.env`. If there is no `.env`, this
route is closed in this session, so go to D rather than half-doing it.

```bash
# 1. Upload. The bucket caps files at 5MB and takes jpeg, png, webp and heic.
SUPABASE_URL=$(grep -E '^SUPABASE_URL=' .env | cut -d= -f2-)
SERVICE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-)
OBJECT="series/series-jonah-2026-09-06.png"      # series id and the start date

curl -sS -X POST "$SUPABASE_URL/storage/v1/object/announcements/$OBJECT" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: image/png" \
  -H "x-upsert: true" \
  --data-binary @"<path>"

# 2. The public URL, which is what goes in the column.
echo "$SUPABASE_URL/storage/v1/object/public/announcements/$OBJECT"
```

Fetch that public URL once before writing it. An upload that answered 200 and
a file that actually serves are two different facts.

**Why the `announcements` bucket.** It is already public for reads, already
capped and already limited to image types, and the graphic in it is usually
the same file that went out on the announcement anyway. The `series/` prefix
keeps it apart from the month folders the Admin form writes, and nothing in the
app lists the bucket, so nothing is disturbed by it being there. If series art
ever becomes its own body of work, with several files per series, give it its
own bucket in a migration, the way 0015, 0026 and 0046 each did, and say so
here. One file a season does not need one.

### D. Only a picture in the chat

An image attached to the message and nothing else: no URL, no file on disk.

**Say so plainly and stop.** A picture that exists only as pixels in a
conversation cannot be re-uploaded byte for byte, and a re-encoded copy of the
church's artwork is not the church's artwork. Do not screenshot it, do not
redraw it, and do not go looking for something similar on the internet.

Then give the two ways forward, which are both short:

1. **Put it on the announcement.** Admin, the series announcement, add the
   picture, save. Then run `/new-image` again and it is case B.
2. **Send the file or a link**, a share link that resolves to the image itself,
   or the file on a machine with `.env` on it.

## Step 3. Look at the crop before you publish it

The graphic is centre-cropped into a 16:9 hero, a 4:3 rail tile and a 1:1
thumb. A tall banner with the series name across the bottom loses the name in
the square. A wide email header loses its edges everywhere.

If you can see the picture, look at it and say what will happen. If the title
sits near the middle it survives all three, which is what most series artwork
does. If it does not, say so and ask whether they have a square version, then
publish whichever they choose. Their call, not yours: a graphic that crops
imperfectly still beats the house tile, and the church knows what the artwork
is for.

## Step 4. Write it

```bash
python3 scripts/hc_supabase.py update series series-jonah \
  '{"art_url": "https://.../artwork.png"}'
```

```sql
update public.series set art_url = 'https://.../artwork.png' where id = 'series-jonah';
```

Taking one off is the same shape, with `null`. Null is a real value here and it
means "wear the house tile", which is what every series without a graphic does.

## Step 5. Read it back, then say what happened

```bash
python3 scripts/hc_supabase.py select series --eq id=series-jonah --columns id,title,art_url
```

Report, in a couple of sentences:

- the series, by its title, and the URL now on it,
- that it shows on Listen, Guide and Home the next time the app is opened, with
  no rebuild and no submission, because the table is read on every open,
- and, if you could not fetch the URL from this session, that it went unchecked
  here and is worth a glance on a phone.

## What not to do

- **Do not edit `js/data.js`.** It is the cold start seed, a frozen snapshot.
  Art written there shows up for nobody and puts the catalogue in two places.
- **Do not commit the image into `assets/`.** A bundled file does not reach an
  installed iOS app without an App Store submission, which is the entire reason
  content lives in Supabase.
- **Do not add a column.** `art_url` is the one, it is what all five screens
  read, and guides and podcasts deliberately have no artwork of their own: a
  message belongs to a series and wears the series' picture.
- **Do not touch the announcement's own `image_url`.** Copying from it is the
  point; editing it is a different job and `/edit-content` is the command for
  that.
