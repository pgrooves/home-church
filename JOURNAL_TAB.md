# The Journal tab

A map, not a build. What it is, what it touches, what has to be decided before
anybody writes the first line, and what I would cut.

Read `Home Church app design system.md` §4f (tab bar) and §5a (navigation)
alongside this. The relevant precedent in code is `js/rooms.js` +
`js/screens/group.js`, which is the only other feature in this app where one
person's writing is stored anywhere but their own phone.

---

## 1. What it is

One place that holds everything a person writes in this app, wherever they
wrote it.

Four ways in:

1. **Highlight in a guide.** Select text anywhere in the reader, tap "Note
   this", and a note field opens with the highlighted line pinned above it.
   The note lands in the Journal tagged to that guide, with the quote as its
   header. The highlight stays drawn in the guide.
2. **A scratch entry.** Start from the Journal tab with nothing in mind, which
   is what happens when you are sitting in somebody's living room and want a
   box to type in. A guide picker lets you tag it afterward, or not at all.
3. **The self-reflection questions**, which the guide reader already has. Those
   are journal entries and have been all along; they just had nowhere to live
   but the guide they came from. See §3.
4. **The end of a group night.** When a room closes, offer to keep what you
   wrote. Room content is deleted after ninety days by migration 0022, so this
   is the only way any of it survives. See §9.

Two ways out:

- **The Group tab suggests them.** Answering a room question for a guide you
  have already journaled against offers your own entries as a starting point.
  It fills the draft box. It never posts anything.
- **Export.** The whole journal as one file, through the same share sheet the
  night sheet uses. If we are going to hold somebody's writing we should never
  be the only ones who can.

---

## 2. The five things to decide first

Everything else is ordinary work. These five change what gets built.

### 2a. There is no seventh tab slot

`js/app.js` line 12 already says this out loud:

> Six now. The design system asks for four to five and this is the one place
> that pushed past it, deliberately: on a 375pt phone each tile goes from
> 67.8pt to 56.2pt … If it ever reads badly the answer is not a smaller font,
> it is moving the room inside Guide.

A seventh tile is 48.2pt on a 375pt phone. The tap target is still legal, but
"Connect" is a 48.5pt label, so it stops fitting and the bar starts hyphenating
or truncating. This is not a font-size problem to solve; it is a slot problem.

Three honest options:

| | What moves | Cost | My read |
|---|---|---|---|
| **A. Journal takes Give's slot** | Give becomes a row on Home and a row in Connect | Small. `js/screens/give.js` is 38 lines and already just hands off to Overflow. Keep the route so old links still land. | **Recommended.** Give is one button to an external site. It is the only tab that is not somewhere you spend time. Journal is somewhere you spend time. |
| **B. No tab. Journal lives under the avatar**, next to Your account | Nothing moves | Smallest | It hides the feature. Nobody browses their account menu. If the point is that notes accumulate visibly, this defeats it. |
| **C. Seven tabs** | Nothing | Smallest to build, largest to live with | The bar is already over budget. Do not. |

A is a product decision, not a technical one, so it is yours. Everything below
works under any of the three; only `TAB_META` changes.

### 2b. "Stays on this phone" stops being true

The app currently promises, in five places, that notes never leave the device:

- `js/screens/guide.js:148` — "These are yours. Anything you write stays on this phone."
- `js/screens/guide.js:41` — "Saved on this phone."
- `js/screens/legal.js:80–86` — the privacy policy's "what stays on your phone, and only on your phone" list, which names guide notes first.
- `js/screens/legal.js:183` — the terms' "we claim nothing over anything you write here", which says the same.
- `js/screens/legal.js:275` and the Your data screen's two-pile explanation.

Syncing the journal to an account changes all five, plus
`APP_STORE_COMPLIANCE.md` §2.5 and the Data Safety answers in
`SUBMISSION_KIT.md`. That is not a blocker, it is a checklist item that is very
easy to ship without noticing, and shipping a privacy policy that is wrong
about where somebody's writing lives is the worst kind of quiet bug.

The shape that keeps the promise mostly intact:

> **Local first, always. Synced only when signed in, and said plainly on the
> screen where you write.**

The journal works fully signed out and offline. Signing in adds a copy on the
server so it follows you to a new phone. The caption under the editor reads
"On this phone" when signed out and "On this phone, and in your account" when
signed in — the same honesty the Group tab uses about closed answers.

And one more thing the policy has to say, because it is true and vague copy
would be a lie by omission: rows in Postgres are readable by whoever
administers the database. Nobody at the church has a *screen* that shows a
journal entry, and RLS means no other account can read one, but "encrypted so
that not even we can read it" is a claim this app cannot make. Client-side
encryption is not workable here — sign-in is a one-time code, there is no
password to derive a key from, and a key that lives on one phone means the
sync is decorative. So: honest copy, not crypto theater.

### 2c. Highlights have to survive the guide being edited

Guides come from Supabase and are editable from a phone with no build step,
which is the whole point of the CMS. A highlight anchored to "characters 40–92
of the third paragraph" breaks silently the first time somebody fixes a typo in
that paragraph.

The anchor stores four things, in order of trust:

```js
{
  guideId:  'g-2026-08-16',
  path:     'groupSections.0.questions.3',   // stable address into the guide object
  quote:    'the exact text that was selected',
  start: 40, end: 92                          // offsets into that block's plain text
}
```

On render, re-locate in this order: exact `quote` match inside that block →
offsets, if the block's text still matches what it was → give up on the mark
but **keep the entry**. An orphaned highlight shows in the Journal exactly as
it always did, because `quote` was stored with it; it just stops being drawn in
the guide, with a quiet line saying the guide was updated. The note is the
valuable thing. The mark is a convenience.

Paths address the guide object as it already exists in `js/data.js`:
`shortSummary.2`, `fullSummary.0`, `anchors.1.body`,
`groupSections.0.questions.3`, `reflectionQuestions.2`, `oneLiners.1`,
`scriptures.4.note`, `closingScripture.text`.

**A selection that crosses two paragraphs gets clamped to the one it started
in.** Multi-block ranges double the anchoring problem and nobody has asked for
one.

### 2d. Rich text means storing markup, and this app never has

Every screen in this app renders HTML strings and escapes every value through
`c.esc()`. There is no HTML anywhere that did not come from the app's own
source. Bold and bullets break that.

The rule to hold:

> **Sanitize on the way in and on the way out. Never `innerHTML` a stored
> string that has not been through the allowlist on this launch.**

Allowlist, and nothing else: `<strong> <em> <u> <s> <ul> <ol> <li> <p> <br>`
and `<a>` where `href` starts with `https://www.biblegateway.com/`. Attributes
are stripped except that one `href`. Anything else becomes its text.

Two representations are stored, not one:

- `bodyHtml` — the sanitized subset, what the editor renders.
- `bodyText` — a plain-text mirror, regenerated on every save.

`bodyText` is what search runs against, what the export writes, and — this is
the one that matters — **what goes into a group room**. Room notes are plain
text in the database (`hc_room_post`) and are read by other people. Formatted
journal text converting itself into a room note is exactly the path by which
one person's stored markup ends up rendered on somebody else's phone. It
converts to text at the boundary and there is nothing to argue about.

Implementation: `contenteditable` with the four format buttons, and a paste
handler that flattens to plain text. `document.execCommand` is deprecated and
also works in every WKWebView we ship to; it is the right amount of technology
for four buttons. What is stored is the sanitizer's output, never the raw
`innerHTML` of the editable.

### 2e. Two phones, one journal, and the delete that comes back

Last-write-wins per entry on `updated_at` is fine for a journal — the realistic
conflict is "I edited the same entry on my iPad an hour ago", not simultaneous
editing.

The one that actually bites is deletes. Delete an entry on your phone, and the
laptop that still has it pushes it back on next sync, forever. So deletes are
soft: `deleted_at` is set, the row syncs like any other, and the local copy is
purged only after the push lands.

And a privacy bug worth naming before it exists: **sign out, hand the phone to
your spouse, they sign in, and the local journal is sitting there.** Every local
entry carries `ownerId` — a user id, or the string `local` for anything written
signed out. The Journal only ever draws entries owned by `local` or by the
account currently signed in. Signing in adopts the `local` ones. Signing out
leaves everything on the phone, which is right; it just stops being visible to
the next person who signs in.

---

## 3. `HC.store.getJournal` already exists, and it is this feature

`js/store.js:194–210` stores the guide reader's self-reflection answers under
`guideState[guideId].journal[questionIndex]`. Those are journal entries. They
have a guide, a prompt, and a body, and they are already on every phone that
has used the app.

So the new store **absorbs them on first launch**, one time, into entries with
`kind: 'reflection'`, `guideId`, `path: 'reflectionQuestions.N'`, and the
question text as `quote`. The textarea in the guide reader stays exactly where
it is and reads and writes through the new store instead of the old one.

Two things fall out of that, both good:

- The Journal tab is not empty on the day it ships. Anyone who has used the app
  opens it and finds their own writing already there, tagged.
- There is one answer to "where does my writing live", instead of two.

Keep `getJournal`/`setJournal` as thin shims over the new store for one
release so nothing breaks mid-refactor, then delete them.

---

## 4. Data model

### Local (the source of truth, always)

`hc:journal` in localStorage:

```js
{
  entries: {                       // id -> entry
    'j-1755..-a7f': {
      id, ownerId,                 // uuid | 'local'
      kind,                        // 'entry' | 'highlight' | 'reflection' | 'night'
      guideId, guideTitle,         // guideTitle denormalized: a guide can be renamed
      path, quote,                 // the anchor, for highlight/reflection
      start, end,
      title,                       // optional, first line if blank
      bodyHtml, bodyText,
      refs: ['John 3:16'],         // scripture linked in the body, extracted on save
      pinned: false,
      createdAt, updatedAt,        // ISO
      deletedAt: null,
      dirty: true                  // needs pushing
    }
  },
  lastPulledAt: '2026-08-20T...'
}
```

`guideTitle` is denormalized for the same reason `group_rooms.guide_title` is:
a closed room and an old journal entry both have to read right after the thing
they point at has moved.

### Remote (migration `0023_journal.sql`)

Unlike group rooms, **nobody reads anybody else's rows**, so this needs no
`SECURITY DEFINER` functions and no `hc_journal_*` API. Four plain RLS policies
on `auth.uid() = user_id` are the whole security model. The precedent is 0009
(`profiles`), not 0016.

```sql
create table public.journal_entries (
  id          uuid primary key,              -- minted on the phone
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('entry','highlight','reflection','night')),
  guide_id    text,
  guide_title text,
  path        text,
  quote       text,
  range_start int,
  range_end   int,
  title       text,
  body_html   text,
  body_text   text,
  refs        text[] not null default '{}',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
```

Notes on that:

- `id` is generated client-side so an entry written on a plane has the same id
  when it finally uploads. Upsert with `Prefer: resolution=merge-duplicates`.
- `on delete cascade` means the existing `delete-account` Edge Function already
  removes the journal. Worth a line in its comment so nobody wonders.
- **Not** on migration 0022's ninety-day sweep. Room content expires because it
  is other people's writing sitting in a shared place. A journal is the
  opposite of that and expires never.
- No word filter (0020). That is for text other people read.
- Index on `(user_id, updated_at desc)` for the pull, and `(user_id, guide_id)`
  for the Group tab's suggestion lookup.

### Sync

- **Push** on save, debounced, and on every sign-in. Failure is silent and the
  entry stays `dirty`; the app already behaves this way for profile fields.
- **Pull** on sign-in and on app foreground: `updated_at=gt.<lastPulledAt>`.
- **Merge** per entry, later `updatedAt` wins whole.
- Signed out, none of this runs and nothing about the tab changes except the
  caption under the editor.

---

## 5. The four surfaces

### 5a. Highlighting in the guide reader

Every block of guide prose gets `data-hl-path="shortSummary.2"` when rendered.
A `selectionchange` handler scoped to `.hc-reader` waits for a non-collapsed
selection inside one of those, then floats a two-button bar above it:

    ┌─────────────────────────┐
    │  Note this  ·  Highlight │
    └─────────────────────────┘

- **Highlight** saves an entry with an empty body. It shows in the Journal as a
  quote card. Every highlight is an entry; there is no second concept.
- **Note this** does the same and immediately opens the note sheet, with the
  quote pinned above the editor and the full editor toolbar below it.

Do not try to replace the iOS callout menu. It appears alongside, ours sits
above the selection, and both are fine.

Drawing the marks: highlights are applied at render time by splitting the
block's plain text at the offsets and escaping each segment separately, then
wrapping the middle in `<mark class="hc-hl" data-entry="…">`. No DOM surgery
after paint, so a re-render is idempotent and the existing string-rendering
model is untouched. Tapping a `<mark>` opens its entry.

**One highlight treatment, not five colors.** This app is a two-palette calm
thing and a rack of highlighter colors would be the loudest element in it. A
warm wash, and a small dog-ear on the ones that carry a note.

### 5b. The Journal tab

```
JOURNAL
Everything you wrote
────────────────────

[ + New entry ]        [ search ]

All · This guide · Highlights · Scripture

┌ THIS WEEK ─────────────────────────────┐
│ FROM THE GUIDE · Held By What Holds You │
│ "the exact line you highlighted"        │
│ Your note, two lines of it, then…       │
│ Aug 18                                  │
└─────────────────────────────────────────┘

┌ LOOSE NOTES ───────────────────────────┐
│ Thursday, Marcus's house                │
│ Something he said about his dad…        │
│ Aug 14 · no guide                       │
└─────────────────────────────────────────┘
```

Grouped by guide, newest first, with a "Loose notes" group for untagged ones —
the same grouping the Guide index already does by series, so it is a pattern
that exists rather than a new one. Filter chips reuse `data-action="filter"`
from Connect. An entry opens as a pushed view (`journal-entry`), not a modal,
so the back gesture works for free.

Empty state, in the app's voice, never a shrug: *"Nothing here yet. Highlight
something in a guide, or start with a blank page. Both count."*

**No streaks, no counts, no "you journaled 4 days this week."** The guide
reader says "Write it down, or do not. Both are honest." A streak counter
argues with that.

### 5c. The editor

One component, used by the note sheet and the full entry screen alike, so
there is one place where formatting and scripture live.

```
┌───────────────────────────────────────┐
│  B   I   U   •   1.    + Add scripture│
├───────────────────────────────────────┤
│                                       │
│  Your writing goes here.              │
│                                       │
├───────────────────────────────────────┤
│  Guide: [ Held By What Holds You  ▾ ] │
│  On this phone, and in your account.  │
└───────────────────────────────────────┘
```

The guide picker is a `<select>` styled to match `hc-input`, listing guides
newest first plus "No guide". Native pickers on iOS are a wheel at the bottom
of the screen, which is the right thing here and free.

**+ Add scripture** opens a three-step sheet — Book, then Chapter, then Verse
(with an optional "through" for a range) — and inserts a link into the text at
the caret:

```html
<a href="https://www.biblegateway.com/passage/?search=John%203%3A16&version=ESV">John 3:16</a>
```

built by the existing `c.bibleUrl()`, opened by the existing
`c.openExternal()`, which under Capacitor is `SFSafariViewController` — a real
browser with a Done button, same as every other outbound link in the app.

That needs a new `js/bible.js`: 66 book names and the verse count of every
chapter. It is 1,189 numbers, about 6KB as a compact string, no network, works
offline like everything else. Chapter counts alone would be smaller but then
the verse field is a free number input that will happily accept John 3:400.

`bibleUrl()` hardcodes `version=ESV`. Leave it. If a translation preference is
ever wanted it belongs in Profile, once, for the whole app.

### 5d. The Group tab suggestion

In `questionBlock()` in `js/screens/group.js`, above the answer box, when
`snap.room.guideId` matches entries this person has:

    From your journal ·  ⌄ 3

Tapping expands a short list of one-line previews. Tapping one **appends its
`bodyText` into the draft** and closes the list. It does not post. It does not
replace what is already typed. The draft still goes through the same
`room-post` path with the same terms gate.

Ranking: entries anchored to that exact question first, then anything else
tagged to that guide, then loose entries from the last seven days.

This is the only place journal text crosses into something other people read,
which is why §2d insists it crosses as plain text.

---

## 6. Files

**New**

| File | What |
|---|---|
| `js/journal.js` | The data layer. Store, sanitizer, anchor resolution, sync. The `js/rooms.js` of this feature: no screen code, and the only file that talks to Supabase about entries. |
| `js/editor.js` | The rich-text field, the format buttons, the scripture sheet. Used by two screens. |
| `js/bible.js` | 66 books, chapter and verse counts. Data only. |
| `js/screens/journal.js` | The tab and the single-entry view. |
| `supabase/migrations/0023_journal.sql` | Table, RLS, indexes. |
| `tests/journal.test.js` | Sanitizer, anchor re-location, sync merge, the `ownerId` rule. |

**Changed**

| File | What |
|---|---|
| `js/router.js` | `journal` into `TABS` |
| `js/app.js` | `TAB_META`, `TITLES`, the route table, and the new `data-action` handlers |
| `js/store.js` | The one-time migration out of `guideState[*].journal`; shims |
| `js/screens/guide.js` | `data-hl-path` on prose blocks; reflection textareas write through the new store; marks drawn at render |
| `js/screens/group.js` | The suggestion row in `questionBlock()`, and its signature line |
| `js/screens/legal.js` | Privacy policy and terms, per §2b |
| `js/print-guide.js` | The journal export, alongside the guide and night sheets |
| `css/components.css`, `css/screens.css` | `hc-hl`, `hc-editor`, `hc-journal-card`, the scripture sheet |
| `index.html` | Four script tags, in dependency order |
| `APP_STORE_COMPLIANCE.md`, `SUBMISSION_KIT.md` | The data-safety answers |

`npm run stamp` after every one of these, or a returning phone quietly runs
last week's JavaScript.

---

## 7. Build order

Each phase is shippable on its own, which matters because phase 1 alone is
already worth having.

1. **The store and the tab.** `js/journal.js`, the tab, scratch entries, plain
   text only, local only, plus the migration of existing reflection answers.
   Nothing else in the app changes. Ship it.
2. **The editor.** Formatting, the sanitizer, the guide picker.
3. **Scripture.** `js/bible.js` and the picker sheet.
4. **Highlighting.** Selection bar, anchors, marks in the reader, the note
   sheet. The largest and least certain phase; do it after the journal exists
   and has somewhere to put what it makes.
5. **Sync.** Migration 0023, push/pull, `ownerId`, the legal copy in §2b, the
   compliance docs. One phase, together, so the promise and the code change in
   the same commit.
6. **The seams.** Group tab suggestions, keep-tonight on room close, export.

---

## 8. Ideas worth taking

- **Reflection answers become entries** (§3). Day-one content, one concept
  instead of two.
- **Keep tonight.** When a room closes, offer to save your own answers and the
  prayer requests as one entry tagged to that guide. Room data is swept at
  ninety days; this is the only thing that keeps it.
- **Your own scripture index.** Every verse you have linked or highlighted, in
  one list. The Guide reader already has a Scripture Index section, so this is
  the same component pointed at a different source.
- **Sunday's questions, waiting.** When a new guide lands, a quiet card at the
  top of the Journal: "Three questions from Sunday." Taps straight into the
  reflection section. Uses data that already exists.
- **Export.** `js/print-guide.js` already knows how to build a standalone HTML
  file and hand it to the share sheet. A third sheet, for the journal, is
  mostly a template.
- **Face ID lock**, later. `APP_STORE_COMPLIANCE.md:181` floats this for leader
  notes; the journal is the stronger candidate. Phase 7 at the earliest.

## Ideas worth skipping

- **Streaks, counters, reminders to journal.** Against the app's voice, on
  purpose. See §5b.
- **Five highlight colors.** One treatment, plus a mark for "has a note."
- **Sharing an entry to the group with one tap.** The suggestion flow fills a
  draft you then choose to post. A one-tap share of private writing into a room
  is a mistake somebody makes once, at speed, and cannot take back.
- **Client-side encryption.** See §2b. Not workable on code-based sign-in, and
  the honest version of the copy is fine.

---

## 9. Open questions

1. **Which tab slot** (§2a). A, B, or C. Everything else waits on nothing.
2. **Does the journal sync at all in v1**, or is phase 5 a later release? Local
   only is a smaller thing to review and keeps five pieces of privacy copy true
   as written.
3. **"Journal" or "Notes"** on the tile? Journal is warmer and matches what the
   guide already calls its take-home section. Notes is shorter and would fit
   the bar better if the seventh-tab option ever wins.
4. **Does a highlight with no note belong in the list**, or in a quieter
   "Highlights" filter? I have it in the list, because a highlight is a thing
   you did on purpose.
