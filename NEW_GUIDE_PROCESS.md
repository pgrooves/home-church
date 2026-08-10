# Adding a New Sermon Guide

Give this file to Claude Code, in this repo, alongside a sermon PDF (a
transcript or manuscript), and say **"new guide"** or **"new sermon."**
That is the whole trigger. Everything below is instructions for Claude, not
for you.

If you're the pastor or a leader reading this instead: you don't need to
understand any of the code below. Attach a PDF, say "new guide," and answer
whatever Claude asks you (usually just "is this in the current series or a
new one").

-----

## What you're doing

This app's guides live in `js/data.js`, in two arrays: `sermons` and
`guides`. A sermon and its guide are two separate objects linked by ID,
`sermon.guideId` points at `guide.id`. Adding a new week means appending one
object to each array.

**One name per message.** `sermon.title` is the only place a message's name
is written. The guide inherits it through `HC.data.guideTitle()`, which is
what Home, the guide index, the reader, the PDF, leader mode, and every
shared one-liner all read. So a guide has no title of its own to keep in
sync, and `guide.themeTitle` stays `null` unless a guide truly needs a
different name from its message. This matters because the title you propose
in Step 1 is provisional: the podcast episode posts a day or two later
carrying the church's own title for the message, and `/new-podcast`
overwrites `sermon.title` with it. One field changes and the whole app
follows. See `NEW_PODCAST_PROCESS.md`.

**Never rename an id.** Ids are opaque and permanent. A leader's question
checkmarks and journal entries are stored on their phone keyed by
`guide.id`, so renaming `guide-unsung-heroes` because the episode turned out
to be called something else would silently orphan their notes. Titles move,
ids don't, and a slug that no longer matches its title is fine.

Nothing else in the codebase needs to change, every screen (Home, Listen,
Guide index, Guide reader, Connect) reads from these arrays and picks up a
new entry automatically. Newest-first ordering is automatic too, everything
sorts by `preachedOn`, don't reorder the arrays by hand.

Read the guides in `js/data.js` before starting. There are three complete
ones, `guide-seat-table`, `guide-slow-burn`, and `guide-unsung-heroes`.
Those are your ground truth for structure, depth, and voice, more than
anything written here.
This document explains the shape and the rules; the existing guides show
what "done well" actually looks like. When in doubt, match them, not this
file's paraphrase of them.

-----

## Step 1: Read the PDF

Extract, at minimum:

- Sermon title (if the PDF doesn't give you a clean one, propose one, short,
  concrete, no churchy subtitle padding, matching the tone of "The Slow
  Burn" or "A Seat at the Table")
- Preacher's full name
- Date preached, or ask if it's not in the document
- Primary passage(s)
- The sermon's actual content: the argument, the movement, the illustrations,
  any memorable lines the preacher actually said

Then ask the pastor/user two things before writing anything:

1. **Which series is this in?** Check the `series` array. If it's a new
   series, you'll need a new series object too (id, title, subtitle,
   startedOn, current: true, blurb), and you should flip the
   previously-current series' `current` flag to `false`.
2. **Roughly how long was the sermon?** For the `duration` field on the
   sermon object, if it's not stated in the PDF.

Don't guess a scripture reference, a date, or an attribution. Ask rather
than invent. Getting a Bible reference wrong in a published guide is a real
error, not a style issue.

-----

## Step 2: Write the guide content

This is the actual work, and it is writing, not extraction. The guide is a
distinct piece of pastoral writing built from the sermon, not a transcript
summary. Read both existing guides in `js/data.js` before writing a single
word, they are the voice reference.

### Voice rules, non-negotiable

- Second person, contractions, warm and direct. Speak to one person reading
  alone, not a congregation.
- **No em-dashes anywhere.** Use commas. This is a hard brand rule, it
  applies to every string, including questions and notes.
- Discussion and reflection questions must be specific enough that a person
  cannot deflect with a general answer. Never ask what other people or
  "other Christians" think. Ask about their own week, their own name for
  themselves, their own Tuesday.
- No guilt mechanics. The tone is invitational, never a scolding.
- One-liners are things the preacher actually could have said, pull the
  real ones from the PDF where you can, and write in that register where
  you have to bridge gaps. Don't invent a quote and attribute it as if
  spoken if it wasn't; light paraphrase for length is fine, fabricating a
  line whole-cloth is not.

### The six sections, fixed order, each with a quota

The reader renders these in this exact order, this is locked in the code
(`js/screens/guide.js`), don't reorder them:

1. **Short Summary** (`shortSummary`) — three paragraphs. This is what
   shows expanded by default, it has to work as a stand-alone read for
   someone who won't open the other five sections.
2. **Full Summary** (`fullSummary`) — eight to ten paragraphs, the real
   walk through the sermon's argument, following the text or the sermon's
   own structure. Include real specifics: verse numbers, names, the actual
   turns in the argument. This is the section that proves the guide was
   built from this sermon and not a template.
3. **Anchors** (`anchors`, nested inside the full summary in the UI) —
   exactly three. Each is `{ label, body }`, a short label (two or three
   words, often a repeated grammatical pattern like "Grace pursues / Grace
   provides / Grace produces") and a one-paragraph body. These are the
   sermon's own movements or points, not something you're imposing, find
   them in the actual structure of what was preached.
4. **Group Sections** (`groupSections`) — seven objects, each
   `{ heading, questions }`. Both existing guides use exactly seven, six is
   acceptable only if the sermon's own structure genuinely doesn't support
   a seventh. Headings are short phrases pulled from the sermon's own
   language ("Lo-debar," "Dead dog," "This week"). Two or three questions
   per section. Always open with a "Getting started" section (low-stakes,
   easy to answer) and close with a "This week" section (one concrete,
   calendarable action). 17-19 questions total across all sections is the
   range the existing guides sit in.
5. **Reflection Questions** (`reflectionQuestions`) — exactly eight,
   flat array of strings, no headings. These are for take-home private
   journaling, one notch more exposed than the group questions.
6. **One-Liners** (`oneLiners`) — twelve to fifteen short, quotable lines
   from the sermon. Each renders as its own card. These are the most
   shareable content in the app, they need to stand alone with zero
   context.
7. **Scripture Index** (`scriptures`) — ten to fourteen objects, each
   `{ reference, note }`. Every reference actually cited or alluded to
   in the sermon, with a one-sentence note on why it's there or how a
   leader would use it. Include cross-references the sermon draws on, not
   just the primary passage.
8. **Closing Scripture** (`closingScripture`) — one `{ text, reference }`,
   the verse that best lands the whole sermon. Usually something already
   quoted in the full summary.

(The numbering above is for this document. The actual six rendered
sections are Short Summary, Full Summary, Discussion Questions, Self
Reflection, One-Liners, Scripture Index, `anchors` and `closingScripture`
are data attached to two of those six, not separate sections of their own.)

-----

## Step 3: The two objects

### Sermon object, append to the `sermons` array

```js
{
  id: 'sermon-your-slug',        // kebab-case, unique
  seriesId: 'series-xxx',        // must match an id in the series array
  title: 'The Sermon Title',
  preacher: 'Full Name',
  preacherShort: 'First name',   // used everywhere except this one field
  preachedOn: '2026-08-16',      // YYYY-MM-DD, drives sort order everywhere
  duration: '40 min',
  passage: '2 Samuel 13',
  guideId: 'guide-your-slug',    // must match the guide's id below, this is the link
  episodeUrl: null,              // this message's Spotify episode link, null falls back to the show
  summary: null,                 // the Spotify episode notes as an array of paragraphs,
                                 // null falls back to `description` below
  description: 'One or two sentences, the hook, shown on the Listen screen.'
}
```

### Guide object, append to the `guides` array

```js
{
  id: 'guide-your-slug',
  sermonId: 'sermon-your-slug',  // must match the sermon's id above
  seriesId: 'series-xxx',
  themeTitle: null,              // leave null, the guide takes its name from
                                 // sermon.title. Only set a string here if this
                                 // guide genuinely needs a different name than
                                 // the message, which is rare. See "One name
                                 // per message" below.
  subtitle: 'A short, lowercase-led descriptive line',
  primaryPassage: '2 Samuel 13',
  preacher: 'Full Name',
  preacherShort: 'First name',
  preachedOn: '2026-08-16',

  shortSummary: [ /* 3 paragraphs */ ],
  fullSummary: [ /* 8-10 paragraphs */ ],
  anchors: [ /* exactly 3, { label, body } */ ],
  groupSections: [ /* 7, { heading, questions: [] }, 17-19 questions total */ ],
  reflectionQuestions: [ /* exactly 8 strings */ ],
  oneLiners: [ /* 12-15 strings */ ],
  scriptures: [ /* 10-14, { reference, note } */ ],
  closingScripture: { text: '...', reference: '...' }
}
```

Slug convention: `sermon-` and `guide-` prefixes, then two or three words
from the title, lowercase, hyphenated. `The Slow Burn` became
`sermon-slow-burn` / `guide-slow-burn`.

-----

## Step 4: Show the draft before it goes anywhere

Paste the drafted guide content back into the chat, or at minimum the
`shortSummary` and the three `anchors`, before writing it into `data.js`.
This is real pastoral content going out under the church's name, a quick
sanity check from whoever's driving the session catches a wrong name, a
misjudged tone, or a scripture reference that needs a second look, faster
than finding it after it's live. Skip this only if the user explicitly says
to go straight through.

-----

## Step 5: Wire it in and verify

1. Add the sermon object to `sermons`, the guide object to `guides`, and
   (only if needed) a new series object to `series`.
2. Serve the app locally (`python3 -m http.server` from the repo root, or
   just open `index.html`) and check:
   - The new sermon appears on Listen, newest first if it's the most recent.
   - Its archive row opens to the episode notes, and "Listen on Spotify"
     points at `episodeUrl` when you set one, at the show when you didn't.
   - It shows the "Open the group guide" link.
   - The Guide index lists it under the right series.
   - The guide reader opens, all six sections render, Short Summary is
     expanded by default and the other five collapse correctly.
   - No console errors, no horizontal scroll at 320px or 390px width.
3. If Playwright is available, drive the checks above headlessly instead
   of by hand, it's faster and repeatable. Otherwise the manual pass is
   enough, this app has no build step and no test framework by design, a
   fresh session doesn't need to set one up to add a guide.

-----

## Step 6: Commit and push

### Bump the asset version

`index.html` loads every local file with a `?v=N` query string. Bump that
number, in all of the css and js tags at once, whenever you change anything
in `css/` or `js/`, which includes every edit to `js/data.js`. Without it a
phone that has opened the app before keeps serving last week's copy out of
cache and never sees the new content, and iOS Safari holds on the hardest.
This is the no-build-step stand-in for a content hash.


Commit message should name the sermon and note it's new guide content, not
a code change. Push straight to `main` by default, the same way every other
change in this repo's history has gone out, unless told otherwise. If you're
working on a separate branch for some reason (a session harness forced one
on you, for instance), merge it into `main` and push `main` yourself,
finishing the job rather than leaving the guide stranded on a branch nobody
asked for.

-----

## What NOT to do

- Don't touch the six-section order, the component code that renders it
  lives in `js/screens/guide.js` and `js/components.js`, this task never
  needs to modify either file.
- Don't invent scripture references, dates, or attributed quotes. Ask.
- Don't write a thin or generic guide to move fast. A guide that could
  apply to any sermon on the same general topic is a failure, the whole
  point of this app's guide reader is that it was clearly built from
  the specific thing that was actually preached.
- Don't add a seventh section, a badge, a completion percentage, or
  anything the app's design system already rules out. If unsure, check
  `README.md`, "Decisions worth not undoing."
