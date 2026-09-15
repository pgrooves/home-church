---
description: Turn raw sermon transcripts into a new guide, written here rather than elsewhere, published to Supabase, and confirmed.
---

Read `NEW_GUIDE_PROCESS.md` at the repo root in full before you start. It is
still the source of truth for the data shape, for the ids, for "One name per
message," and for everything about this app that has nothing to do with where
the words came from. This command changes one thing about that document: the
input is a **raw sermon transcript** rather than a PDF manuscript, and the
analysis and the writing happen here, in this session, instead of arriving
finished. Where this file and that one give different numbers for a section,
this file wins, and "Where the quotas differ" below says why.

`/new-guide` is unchanged and still the right command when you have a
manuscript or a clean PDF. Use this one when what you have is what the
recorder heard.

If no transcript is pasted into this message, stop and ask for one before
doing anything else. If a PDF is attached instead of a transcript, say so and
point at `/new-guide` rather than reading the PDF here.

$ARGUMENTS

---

# Writing the guide from the transcript

**Invocation.** The user types `/new-sermon` and pastes one or more raw
transcripts in the same message. They are auto-generated from live audio,
badly garbled, and may be two or three recordings of the same service. The
user may name the preacher. If they do not, default to Stephen Daigle, and
ask only if the transcript genuinely makes it ambiguous.

**Do not ask clarifying questions before starting.** Produce the full result.
The only two exceptions are a transcript you genuinely cannot read and a
genuinely ambiguous preacher. Everything else that would normally be a
question, which series this belongs to, how long the message ran, is a
publishing fact rather than a writing fact, so it waits for the draft check in
Step 4 where it costs nothing to ask.

## Step 0: Read the repo first, before writing a word

Conform to what exists rather than to what this file assumes:

1. `NEW_GUIDE_PROCESS.md`. The writing spec, the voice rules, the id
   conventions, "One name per message." Everything in it still applies except
   the section counts this file overrides.
1. The three complete guides in `js/data.js`, `guide-seat-table`,
   `guide-slow-burn` and `guide-unsung-heroes`. They are the voice reference
   and the shape reference, and they show what done well actually reads like
   better than any paraphrase here. **Read them, never write to them.**
   `js/data.js` is the cold start seed now, not a catalogue, and the finished
   guide goes to Supabase. See "Why this no longer touches `js/data.js`" at the
   bottom of this file.
1. `js/screens/guide.js`, how the reader consumes the fields, which are
   required and which are optional.
1. `js/print-guide.js`, how the PDF is built client side from the same rows.
1. `supabase/migrations/0001_content_cms.sql`, the `guides` and `podcasts`
   columns with their shape guards, which is the actual contract.

**Match the existing shape exactly. Do not invent field names.** A guide is
one row in `guides` and one row in `podcasts`, in the columns that are already
there. Anything this file describes that has no column is not a thing to add a
column for, it is a thing to hand to the pastor in the chat. Step 3 is the one
case where that comes up.

## Step 1: Analyze the transcript

### 1a. Expect heavy garbling and reconstruct

Transcripts are auto-generated from live audio and are consistently mangled.
Names, places and scripture references come through wrong. Your job is to
reconstruct what was actually said, using biblical knowledge and context.

Real examples from past weeks, to calibrate how far off these get:

|Transcript says                    |Actually                       |
|-----------------------------------|-------------------------------|
|Ephi                               |Ephod                          |
|Pepperoni, Hepron, Heberon         |Hebron                         |
|Kayla, Kalah                       |Keilah                         |
|second saving 21                   |2 Samuel 2:1                   |
|Stephen Samuel                     |2nd Samuel                     |
|Zach why                           |Zechariah 4:10                 |
|First East 2, 1, 4                 |1 Kings 2:1-4                  |
|Armatai                            |Amittai                        |
|Harsh, Tarsha's, guitarsists       |Tarshish                       |
|Jabra                              |Joppa                          |
|Minava                             |Nineveh                        |
|J.R. Bo the two, Jericho the second|Jeroboam II                    |
|Tim Hack                           |Tim Keller                     |
|statuitiveness                     |stick-to-itiveness             |
|Papa, published progress           |John Bunyan, Pilgrim's Progress|
|Atomic Havocs                      |Atomic Habits                  |
|Al Noble                           |Alfred Nobel                   |
|Dr. Kent                           |Kent Hughes                    |
|Gabriel was by the nerd prophetic  |Gad the prophet                |
|Stavo, Sofa, Simon, South          |Solomon                        |

Rules for reconstruction:

- When a quote is clearly a specific verse, identify the real reference and
  represent it accurately.
- Repair scrambled sentences into what the preacher plainly intended.
- Capture his actual point, his illustrations and his turns of phrase, cleaned
  up.
- **Never invent content he did not preach.** A detail too garbled to recover
  with confidence gets left out rather than guessed. A number you cannot read
  gets omitted rather than asserted.
- If he states as fact something that is a pastoral inference rather than
  explicit in the text, write it as he preached it. Do not silently correct
  him.

Keep a short list as you go of the calls you made where the transcript was
ambiguous. It is one line of the confirmation at the end, and it is the line
the pastor is most likely to want to argue with.

### 1b. Multi-recording synthesis

If more than one transcript is pasted, they are almost certainly the same
service recorded at different service times.

- Treat them as **one sermon**.
- **Capture the union, not the intersection.** One service will carry a story,
  a line, an application or a scripture the others skipped. Nothing said in one
  recording may be lost because another dropped it.
- Where one is garbled and another is clear on the same point, use the clearer.
- Produce one merged guide. Do not report the differences between services
  unless asked.

### 1c. Work the material before writing

1. Read every transcript all the way through.
1. Identify the central text, the theme, and the preacher's movements. Usually
   three, with a setup and a close.
1. List every scripture referenced, passing mentions included.
1. Collect the sharpest one-liners, lightly cleaned for readability.
1. Note every illustration and story. **These are the most valuable material in
   the transcript**, because the discussion questions hang on them.
1. Only then write.

## Step 2: Write the sections

### Hard rules that apply to every word

- **No em-dashes anywhere.** Not in summaries, questions, one-liners or
  scripture notes. Use commas. This is the single most violated rule, it is a
  brand rule, and it is checked again in the publishing half below. Scan the
  whole output before you finish.
- **The preacher goes by first name.** Stephen, Alan, Jim. `preacher` carries
  the full name once, `preacher_short` carries the first name, and the prose
  uses the first name and never "the pastor" once the name is known.
- Second person, contractions, warm and direct, matching the preacher's own
  register. You are speaking to one person reading alone, not to a
  congregation.
- No guilt mechanics. Invitational, never scolding.

### Where the quotas differ from `NEW_GUIDE_PROCESS.md`

That document was written for a manuscript, where the argument arrives already
compressed. A transcript is forty minutes of live speech, and writing it up at
manuscript length produces a guide that reads like a court record. So the
summary and the question counts below are deliberately tighter than the ones in
`NEW_GUIDE_PROCESS.md` and in the column comments of migration `0001`. Those
are not stale, they describe the three guides in `js/data.js`, which were
written the other way. Nothing in the database enforces either set, the shape
guards check that these columns hold arrays and nothing more, so both sit side
by side in the table without complaint. **Use the numbers here.**

### The eyebrow labels are not yours to set

`js/screens/guide.js` hard codes them. Short Summary, Full Summary, For the
Group, Take Home, From the Pulpit, Referenced in the Sermon, in that order,
locked. There is no field for them and no reordering them from data. They are
listed against each section below so you know what the reader will draw over
your words, not so you can write them anywhere.

### 2a. Short summary, `short_summary`

Drawn under **Short Summary**, titled Overview, and expanded by default.
**Exactly three paragraphs.** It has to stand alone for the person who never
opens the other five sections. Paragraph one sets the scene and the central
question. Paragraph two carries the movements. Paragraph three lands the
application and the hope.

### 2b. Full summary, `full_summary`

Drawn under **Full Summary**.

**Length discipline, and this is the part that matters:**

- **Six to nine paragraphs. Three to five sentences each. Roughly 500 to 700
  words total.**
- A leader should be able to re-live the whole arc in about two minutes of
  reading.
- Short sentences. A sentence with three clauses is two sentences.

**Keep:** every distinct movement, the anchor stories and illustrations by
name, his sharpest phrasings, personal disclosures, and the closing turn.

**Cut:** elaboration on a point already made, the same thing restated in other
words, secondary asides, background that drives no question, and the pile-up
of "he also said, and he went on to note."

**One story gets one or two sentences, not a paragraph.** Name it, land its
point, move on. It needs to be recognizable to someone who was in the room, not
reconstructed for someone who was not.

Test: read it out loud. If you run out of breath inside a sentence, or lose the
thread partway through, it is too dense.

### 2c. Anchors, `anchors`

Nested inside the full summary in the reader, under the label "Where it went."
**Exactly three**, each `{ "label": "...", "body": "..." }`. A short label of
two or three words, often a repeated grammatical pattern, "Grace pursues,
Grace provides, Grace produces," and a one paragraph body. These are the
sermon's own movements, the ones you identified in Step 1c, not a structure you
are imposing on it. The transcript makes them easier to find than a manuscript
does, because he usually says them out loud twice.

### 2d. Discussion questions, `group_sections`

Drawn under **For the Group**. An array of `{ "heading": "...", "questions":
[...] }`. **Five or six sections, 12 to 15 questions total**, two or three per
section, and let the sermon dictate inside that.

Always open with a low stakes section anyone can answer and close with one
concrete calendarable action. `Opening` and `Closing` are the right headings
for those two; the existing guides say "Getting started" and "This week," which
is the same thing in different words and equally fine. **The middle headings
come from the sermon's own language**, short phrases he actually used,
"Lo-debar," "Dead dog," "Boats to Tarshish," not generic categories.

**Quality standards, hard-won through many rounds of rejection. Do not
regress:**

- **Sermon-specific, never generic.** Every question should be impossible to
  ask of a different sermon. Tie it to the specific story, the specific verse,
  the specific phrase he used.
- **Introspective and forward-looking.** Press inward on what is true of you,
  and outward on what you will actually do this week.
- **Concrete enough that a person cannot deflect with a general answer.** Force
  specificity. "Name the one tribe in front of you," not "do you embrace small
  things?"
- **Never ask what other people, or Christians, or the world think.** That lets
  a person hide behind a category. Press the individual.
- **No vague belief-checks.** "Do you actually believe that?" and "do you need
  to clean yourself up?" are banned. They are shallow and subjective. Replace a
  belief-check with a specific follow-up to the question you just asked.

### 2e. Self-reflection questions, `reflection_questions`

Drawn under **Take Home**. A flat array of strings, no headings. **Exactly
eight.** More pointed and more personal than the group questions, built for
private journaling rather than a quick answer in a living room. Several should
ask the person to physically write something down, since these are meant to be
sat with alone.

### 2f. One-liners, `one_liners`

Drawn under **From the Pulpit**, one card each. **Ten to twenty**, his actual
lines, lightly cleaned for readability. This is the most shareable content in
the app and each line has to stand on its own with zero context. A transcript
is the best source of these there is, so pull real ones and do not write new
ones in his register to pad the count. Light cleanup for length is fine.
Fabricating a line whole cloth and attributing it is not.

### 2g. Scripture index, `scriptures`

Drawn under **Referenced in the Sermon**. `{ "reference": "...", "note": "..."
}` objects. **Every passage he referenced**, explicit reads and passing
mentions alike, each with a one line note on how he used it. Order them by
their role in the sermon, the primary text first, then the supporting passages
in the order they came up.

### 2h. Closing scripture, `closing_scripture`

One `{ "text": "...", "reference": "..." }`, a verse from the anchor text that
lands the whole sermon. Usually one already quoted in the full summary.

### 2i. The cover metadata, and where each piece actually goes

This is the part a transcript-first writer gets wrong most often, because the
natural thing to do is put the name of the message on the guide, and the guide
is the one row that must not carry it.

- **The title you propose** goes on `podcasts.title`, with `(Working Title)`
  after it, exactly that string, one space before the parenthesis. Short and
  evocative, from the sermon's own language. Past examples: *Cave Season*,
  *The Slow Burn*, *Faithful With Small*, *A Seat at the Table*, *Unsung
  Heroes*, *Rise Again*, *Last Words*, *Served His Generation*, *Boats to
  Tarshish*, *Out of the Depths*. Propose it exactly as carefully as if it were
  final, the suffix is not a licence to hand in a worse title.
- **`guides.theme_title` stays `null`.** The guide inherits the name through
  `HC.data.guideTitle()`. "One name per message" in `NEW_GUIDE_PROCESS.md` has
  the reasoning, and "The title publishes as a working title" below has what it
  means for the row you write.
- **`guides.subtitle`** is a short descriptive phrase, lowercase led, that
  describes the guide rather than naming the message. "the friends who carried
  David back," "what Jonah prayed at the bottom."
- **`guides.primary_passage`** is the anchor text.
- **`guides.occasion`** is usually null. Father's Day, Christmas Eve, and
  nothing else.
- **A week-in-the-series marker is not a field.** There is no column for
  `JONAH, WEEK TWO` on either row, and inventing one is exactly what Step 0
  rules out. `series_id` is what puts the series name at the top of the reader.
  If the week matters, say it in the draft check, not in the data.

## Step 3: Sensitive content

Some sermons deal with mental health, self-harm, disordered eating, abuse,
addiction or grief. When they do, three rules bind the writing:

- **Summarize the shape of a personal disclosure, never the method.** If he
  described specific behaviors he used to harm himself, name that it happened
  and what it cost, without the operational detail. A guide gets read privately
  by people in unknown states, and specifics can function as instruction rather
  than as testimony.
- **Never write a group question that asks someone to disclose thoughts of
  self-harm out loud.** That is not a conversation to stage in a living room.
  Questions may go to pain, shame and avoidance. They may not go there.
- The reflection questions are private, so they may go closer in, but they still
  ask a person to notice and to write, never to relive.

**The leader's note has no column, so do not invent one.** When a sermon dealt
substantially with mental distress, write the note, and hand it to the pastor
in the chat rather than into a row: what the sermon opened up, guidance to
listen rather than fix, encouragement toward a licensed counselor and the
pastoral team if something serious surfaces, and the 988 Suicide and Crisis
Lifeline, closing on a line reminding the leader they are not expected to be a
counselor, only a friend who does not flinch. Save it beside the row JSON and
say plainly in the confirmation that it is written and not published.

Putting it in the guide for real is a schema change and a render change, a
column on `guides`, a block in `js/screens/guide.js`, a block in
`js/print-guide.js`, and a cream card in the design system. That is a
deliberate piece of work and the pastor's call, not something to improvise
inside a guide publish. Do not smuggle it into `short_summary` or into a group
section heading instead, which puts leader instructions in front of every
member who opens the guide.

## Step 4: Show the draft before it goes anywhere

Paste the drafted content back into the chat, or at minimum the proposed title,
the `short_summary` and the three `anchors`. Lead with the title, suffix and
all, because it is the one piece the whole church sees on a card without
opening anything.

This is also where the two questions you did not ask at the start get asked,
in one breath, alongside the draft rather than before it:

1. **Which series is this in?** A new one means a new `series` row and flipping
   the old one's `is_current`, which the publishing half covers.
2. **Roughly how long was the message?** For `podcasts.duration`, if the
   transcript does not make it obvious.

Real pastoral content is going out under the church's name and a quick read
from whoever is driving the session catches a wrong name, a misjudged tone or a
scripture reference that needs a second look faster than finding it live. Skip
this only if the user says to go straight through.

## Step 5: Checklist before you publish

- [ ] Six rendered sections all present and populated, plus `anchors` and
      `closing_scripture`.
- [ ] **Zero em-dashes** anywhere in the row. Search and destroy.
- [ ] Preacher by first name throughout the prose, full name only in
      `preacher`.
- [ ] `short_summary` is exactly three paragraphs.
- [ ] `full_summary` is 6 to 9 paragraphs, 3 to 5 sentences each, 500 to 700
      words.
- [ ] Exactly three anchors, drawn from his own movements.
- [ ] 5 or 6 group sections, 12 to 15 questions, opening low stakes, closing
      calendarable. Sermon-specific, concrete, no "what do others think," no
      belief-checks.
- [ ] Exactly eight reflection questions, several asking the person to write
      something down.
- [ ] 10 to 20 one-liners, all genuinely his.
- [ ] Every scripture he touched is in the index with a usage note.
- [ ] Multiple recordings synthesized as one, union not intersection, nothing
      dropped.
- [ ] Sensitive content handled per Step 3, leader's note written and handed
      over in the chat if one was warranted.
- [ ] `theme_title` null, the proposed name on `podcasts.title` with
      `(Working Title)`.
- [ ] Ids kebab-case, permanent, no `working-title` in the slug.
- [ ] Every field is a column that already exists.

**No `?v=N` bump.** `index.html` cache-busts `css/` and `js/` changes, and
publishing a guide changes neither. The row goes to Supabase and the app
fetches it on open. Bump the version when you change code, not when you add
content. `NEW_GUIDE_PROCESS.md` Step 6 says the same thing.

**No PDF as a build artifact.** `js/print-guide.js` paginates the guide client
side when a leader taps Download guide, and a guide fetched from Supabase is
the same object by then. The data is the deliverable. Do not add a second PDF
path.

## Step 6: One extra line on the receipt

The publishing half below ends with a five line confirmation, and that is still
the shape. A transcript adds one line to it, and only when there is something
to put on it: the calls you made where the transcript was ambiguous, and
anything you deliberately left out because it was too garbled to recover. Name
them in a clause each and stop.

```
Reconstructed  "Kayla" as Keilah, "second saving 21" as 2 Samuel 2:1.
               Dropped an unreadable figure in the Hebron story.
```

That is the line the pastor is most likely to correct, and it is worth more
than a paragraph about how the synthesis went. If the transcript was clean and
nothing was dropped, leave the line off rather than writing that there was
nothing to report. Everything else in the confirmation stays exactly as it is
below, five facts, no summary of the steps, no offer of next steps.

Everything from here is the publishing half, and it is identical to
`/new-guide`. The transcript changed where the words came from. It changed
nothing about where they go.

---

# Publishing the guide to Supabase

Everything above is the writing, and it is the source of truth for the
deliverables, the section quotas, the voice rules and the draft check before
anything is published, with `NEW_GUIDE_PROCESS.md` behind it for everything it
does not override. Do not re-derive any of that from here. What follows is the
half neither of those covers: the finished guide goes into the `guides` table,
so a typo fix on a Saturday night never needs an App Store build. It is
identical, line for line, to the second half of `/new-guide`, on purpose. A
transcript and a manuscript publish the same way.

## Before you start writing

Sixty seconds now beats writing a whole guide and then finding you cannot
publish it.

Read **`supabase/ACCESS.md`** and establish a working transport before you
start. It says which of the two to use, the Supabase MCP server or
`scripts/hc_supabase.py`, and gives the SQL equivalent of every script verb
below. Confirm the project ref is `ibqkumxfltfiuqevviji`, the one
`js/config.js` reads. Never ask for a key to be pasted into the chat.

A missing `.env` or a refused `supabase.co` connection is what a web session
looks like, and most sessions on this app are web sessions from a phone. Use
MCP and carry on.

Only if neither transport works: write the guide anyway, save the finished row
JSON to a file, and say plainly that the publish has to be run separately. Do
not fall back to writing it into `js/data.js`, that is what created two copies
of the catalogue in the first place.

Guides are the worst case for hand written SQL in this repo. Every field is
prose, the summaries and sections are jsonb, and an apostrophe in the middle of
a `'...'` string is a real hazard. Dollar quote everything, cast the jsonb
columns, and read the row back before you report it published.

## After the guide is written and approved

**The series row has to exist first.** `guides.series_id` is a real foreign
key. For a new series, create it and flip the old one in the same pass:

```bash
python3 scripts/hc_supabase.py upsert series '{"id":"series-xxx","title":"...","subtitle":"...","blurb":"...","started_on":"2026-08-16","is_current":true}'
python3 scripts/hc_supabase.py update series series-david '{"is_current": false}'
```

**Give it `art_url` while you are there.** It is optional and it is the one
field that shows up on five screens: the rail on Listen, the latest message
above it, every episode row under it, every guide in the series on the Guide
index, and the week's guide card on Home. The church has already made the
graphic — it is the picture on the announcement that launched the series — so
this is usually a copy of that announcement's `image_url`:

```bash
python3 scripts/hc_supabase.py update series series-xxx '{"art_url": "https://.../series-art.png"}'
```

An external URL is what this column is for, the same as album art on a worship
set. Leave it off and every one of those five places draws the house tile it
has always drawn, which is also what they fall back to if the URL ever dies.

**Then publish the guide.** Same content, same ids, snake_case columns. The
column names map one for one onto the `Guide {}` model in section 6 of the
design system doc:

```jsonc
{
  "id": "guide-your-slug",          // permanent, see supabase/README.md
  "sermon_id": "sermon-your-slug",
  "series_id": "series-david",
  "theme_title": null,              // stays null, the name lives on the podcast row
  "subtitle": "...",
  "primary_passage": "2 Samuel 13",
  "preacher": "Stephen Daigle",     // full name, used once
  "preacher_short": "Stephen",      // first name, used everywhere else
  "preached_on": "2026-08-16",
  "occasion": null,
  "short_summary": ["...", "...", "..."],
  "full_summary": ["..."],
  "anchors": [{ "label": "...", "body": "..." }],
  "group_sections": [{ "heading": "...", "questions": ["..."] }],
  "reflection_questions": ["..."],
  "one_liners": ["..."],
  "scriptures": [{ "reference": "...", "note": "..." }],
  "closing_scripture": { "text": "...", "reference": "..." },
  "published": true
}
```

```bash
python3 scripts/hc_supabase.py upsert guides /tmp/guide-your-slug.json
```

Upsert rather than insert, so re-publishing after a correction is the same
command as publishing the first time and a half finished publish is always
safe to just run again. Set `"published": false` to stage a guide the app
cannot see yet, it stays fully readable to you.

**Before you upsert, grep the JSON for an em-dash.** It is a hard brand rule
and this is the last place it can be caught cheaply.

**Then the sermon row, last.** `NEW_GUIDE_PROCESS.md` Step 3 calls it the
sermon object; in Supabase it is a row in `podcasts`, and it goes up after the
guide because `podcasts.guide_id` is the foreign key that points back at it.
A guide with no sermon row renders with no name at all, since `guideTitle()`
resolves through `sermon.title` and has nothing to fall back on:

```jsonc
{
  "id": "sermon-your-slug",
  "series_id": "series-jonah",
  "guide_id": "guide-your-slug",              // the row you just wrote
  "title": "Boats to Tarshish (Working Title)",
  "preacher": "Stephen Daigle",
  "preacher_short": "Stephen",
  "preached_on": "2026-09-06",                // the Sunday, drives sort order
  "published_on": null,                       // no episode yet, that is Tuesday
  "duration": "35 min",
  "passage": "Jonah 1",
  "episode_url": null,                        // Listen reads "Audio coming soon!"
  "platform": "Spotify",
  "media_type": "audio",
  "summary": [],                              // the episode notes, on Tuesday
  "description": "One or two sentences, the hook, shown on Listen.",
  "published": true
}
```

```bash
python3 scripts/hc_supabase.py upsert podcasts /tmp/sermon-your-slug.json
```

The nulls and the empty arrays are the point rather than an unfinished job.
They are what `/new-podcast` fills in, and the app draws every one of them as
a sensible waiting state in the meantime.

## The title publishes as a working title

The name of the message is not on the guide row. It is `podcasts.title` on the
sermon row above, and on Sunday nobody knows it yet, because the episode posts
Tuesday carrying whatever the church actually decided to call this. So the
title you proposed publishes with `(Working Title)` after it, exactly that
string, one space before the parenthesis:

```jsonc
"title": "Boats to Tarshish (Working Title)"
```

`NEW_GUIDE_PROCESS.md` has the reasoning under "One name per message." Three
things it rules out, worth repeating here because this is the file that
writes the row:

- **Not in the id.** `sermon-boats-tarshish`, never
  `sermon-boats-tarshish-working-title`. Ids are permanent, the suffix is not.
- **Not on the guide.** `theme_title` stays `null`, `subtitle` describes the
  guide rather than naming it. One field carries the name and one field
  carries the marker, because they are the same field.
- **Not hedged in the prose.** The guide's own sentences never mention that
  the title is provisional. The suffix is the whole notice.

`/new-podcast` overwrites the field with the real title on Tuesday, which
retires the marker without anybody doing anything about it.

## Check for a suffix that went stale

A message that never gets an episode keeps its marker forever, and a
`/new-podcast` run three weeks late leaves three of them stacked up. Neither
is visible from inside the week you are working on, so look while you are
already here:

```sql
select id, title, preached_on
  from public.podcasts
 where title like '%(Working Title)%'
   and preached_on < current_date - 14
 order by preached_on;
```

Anything it returns goes in the confirmation as one line, named, and stops
there. Do not rewrite them. An old working title is sometimes the right
title that simply never had an episode behind it, and choosing the church's
words for them is not a call this command gets to make. `/edit-content` drops
a suffix, or puts a better title on, in one sentence when you decide to.

## The reading plan moves itself

**There is no step here.** Publishing the guide already moved it, and this
section exists so that you know that and do not go and move it a second time.

A reading plan can name the series it walks beside, `reading_plans.series_id`.
When it does, writing a guide in that series fires a trigger that re-anchors
the plan's `starts_on` so its week is the week of the sermon, however the
Sundays actually fell. Migration `0055`, and the whole of it is:

```
starts_on = the latest sermon's date - (its number in the series - 1) * 7
```

Home still counts days from `starts_on` and still takes `weeks[n]` for the week
it counted, which is what keeps the reading right on a Wednesday. This only
moves the day it counts from.

Three things follow, and all three are things not to do:

- **Do not set `starts_on` or `current_week` by hand** on a plan that follows a
  series. The next guide will overwrite them, and in the meantime Home shows
  the week you typed rather than the week the church is on.
- **Do not skip it for a late guide.** Publishing Tuesday's guide for Sunday's
  sermon anchors on `preached_on`, not on today, so a guide written late lands
  on the right week and a guide written early does not jump ahead of itself.
- **Do not worry about a correction.** The anchor is taken from the latest
  sermon in the series, never from the guide you happen to be writing, so
  fixing week 1's typo in week 3 leaves the plan in week 3.

What you do owe it is **one look afterwards**, because a plan silently on the
wrong week looks exactly like a plan on the right one:

```sql
select id, series_id, starts_on, current_week, total_weeks,
       weeks ->> (floor((current_date - starts_on) / 7)::int) as reading_now
  from public.reading_plans where is_current;
```

The week and the reading are the last line of the confirmation below. If the
week is right and the reading is not, the schedule in `weeks` is short or out
of order, and that is a content fix on the plan rather than anything to do with
the guide you just published.

**Two cases where there is a step.** Both are one call, and it is idempotent,
so running it when it was not needed costs nothing:

```sql
select * from public.hc_reading_plan_follow_series('series-jonah');
```

- **A new plan for a new series.** Create the plan row with its `series_id`,
  `total_weeks`, and the whole schedule in `weeks`, flip the old plan's
  `is_current` to false, then call the function once to put the new plan on the
  week the sermons say. `0055` section 4 is a worked example of the whole
  thing, and `supabase/README.md` has the shape of the row.
- **A guide deleted rather than unpublished.** The trigger listens for a guide
  being written, not for one going away. Unpublishing is a write and moves the
  plan on its own; a delete needs the call.

If the plan the church is reading has no `series_id`, none of this applies to
it and none of it ran. That is a real choice and not an oversight: a plan
through the Psalms in a season of topical messages should keep counting its own
weeks off the calendar, exactly as `0024` built it to.

## The PDF

Nothing new to build here. The pipeline already exists in `js/print-guide.js`.
The Download guide button on the reader screen paginates whatever guide object
is in `HC.data` and hands it to the browser's print dialog, and a guide fetched
from Supabase is the same object by then. Do not add a second PDF path.

## Why this no longer touches `js/data.js`

It used to. The app read its content only from `js/data.js`, so a guide had to
be written in both places, and the two were free to drift.

`js/content.js` ended that. It fetches every content table on open and swaps
the rows into the `HC.data` arrays in place, so the guide reader, the Listen
tab, leader mode, and the PDF all read Supabase content without knowing it.
Supabase is the source of truth. Publish there and stop.

`js/data.js` is still in the repo and still matters, but its job is narrow now:
it is the cold start seed, what a brand new install with no signal opens to
before the first fetch lands. It is a frozen snapshot, not a second catalogue
to maintain. Let it go stale. Nobody needs to keep it current, and editing it
by hand is how the two copies diverge again.

## Last: narrate it

Every guide section carries a play button, and the recording behind it is made
here. A guide that skips this step is published and silent, and nothing in the
app says so, so this is part of publishing rather than an extra.

**Run it after the row is in Supabase, never before.** The narrator reads the
published guide, not your draft, so the order is: upsert, read the row back,
then narrate. Narrating first records text that may still change.

**The working title is not a reason to wait for Tuesday.** The recordings do
not say the message's name, only the reader's own heading for each section, so
nothing spoken here is provisional and nothing here has to be redone when
`/new-podcast` renames the row. The audio made today is the final audio.
`scripts/narration_text.js` has the reasoning at `sectionText`, and
`tests/narration.test.js` holds it in place: a rename moves no section's hash.
So the guide goes out complete on Sunday, which is the whole point of doing
this here rather than leaving a note for later.

```bash
npm run narrate          # writes the text, then speaks it
npm run narrate:upload   # needs SUPABASE_SERVICE_ROLE_KEY in the environment
```

**Read the first command's output before letting the second one run.** It
prints where the guides came from. `source supabase` is correct. `source seed`
means it could not reach the project and fell back to the three guides frozen
in `js/data.js`, so the guide you just wrote is not among them and every guide
it missed stays silent. It warns in six lines when that happens. Do not
narrate past that warning.

**This needs a real machine, and most sessions on this app are not one.** The
speech model is a 340MB local download and the upload is an HTTPS PUT to
`supabase.co`, which the web session proxy refuses, exactly as
`supabase/ACCESS.md` describes. MCP is not a way around it: it reaches Postgres,
and Storage has no MCP path at all.

So in a web session: publish the guide, say plainly that the narration has not
been made yet, and give the pastor the two commands above to run on the Mac.
Do not report the guide as fully published without saying which half is
missing. In a session on a real machine with `.env` present, just run them.

First run on any machine needs the model, once. `NEW_GUIDE_PROCESS.md`
Step 5b has the four commands.

**It costs nothing.** Kokoro-82M is Apache 2.0 and runs on the CPU: no API, no
key, no account, no quota, no per-play charge. A weekly guide is about four
minutes of laptop time, and re-running with unchanged text regenerates nothing
at all. Do not swap it for a hosted TTS service without saying out loud what
that would cost the church per year.

**Never re-speak the catalogue to publish one guide.** If a run reports it is
about to make far more sections than the guide you just wrote, something
changed the narrator's own wording rather than a guide's, and every hash in
the catalogue moved at once. Stop, and reseal instead:

```bash
npm run narrate:reseal                              # speaks nothing
npm run narrate                                     # makes the new guide only
npm run narrate:upload -- --only guide-your-slug    # sends that guide only
```

The reseal records a decision rather than checking anything, so it is the
pastor's call and not a step to take on your own initiative. Say what moved
and what it would cost to re-speak, then let them choose.
`NEW_GUIDE_PROCESS.md` Step 5b has the whole of it.

## Confirm, briefly

Five facts and stop, six in the one case below. No summary of the steps, no
offer of next steps:

```
Published  The Slow Burn (Working Title)
Stephen, August 16 2026
guides, series-david, 7 sections, 18 questions, 14 one-liners
Reading    week 2 of 4, Jonah 1:11 to 2:10, grace at the bottom
Narrated   6 sections, 9.4 min, af_heart
```

Print the title the way it went into the row, suffix included, rather than
tidying it up for the confirmation. The line is the receipt for what the
church will see on the Home card in a minute, and a receipt that reads
cleaner than the row is worse than no receipt.

The reading line is what the check above returned, said in one line, because a
plan that quietly stopped following its series is only visible in a week number
somebody read out loud. Leave it off only when the current plan follows no
series, where there is nothing to report rather than something missing.

If the narration did not run, say which half is missing and what to run,
rather than leaving the last line off:

```
Not narrated. Run `npm run narrate && npm run narrate:upload` on the Mac,
this session cannot reach Storage.
```

The sixth line, last, and only when the stale check found something. Name
them and stop, no recommendation about what they should be called:

```
Still working titles  Boats to Tarshish, Aug 30. No episode yet.
```
