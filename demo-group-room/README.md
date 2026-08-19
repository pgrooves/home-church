# Group tab, a room your group joins with a code — mockup

A standalone rendering of a proposed sixth tab, made to be looked at before
anything in `js/` or `css/` is touched. Nothing here is wired into the app.

## What it shows

A leader with leader mode on opens a room. The app mints a six digit code and
hands it to the phone's share sheet as a prefilled text. Everyone else opens
the Group tab, types the code, and lands on the same page: this week's
discussion questions, carried over from the guide. The leader can reword, drop,
or add questions and every change lands on every phone in the room. Under each
question everybody gets a box, and what you write goes in under your first name,
taken from your profile.

**Answers stay shut until the leader opens them.** A group works down the page
one question at a time, so nobody should be reading answer four while answer one
is being discussed. Every answer is a switch on the leader's phone: open one
name, open a whole question, or open the room, and close any of them again the
same way. The leader does not get an early look either. He sees who has
answered, not what they said. Your own writing is the exception, always visible
to you and marked as not out yet.

**The last box on the page is the prayer list**, and it is the one thing never
held back. Anyone adds to it and everyone reads it.

**The end of the page is the end of the night.** *Print everything to PDF* and
*Send as text*, side by side. One sheet carries the guide, every question asked,
every answer whether it was opened or not, and the prayer list.

The page carries two phones, one belonging to somebody in the group and one to
the leader hosting it. They are wired to the same state object, so opening an
answer on the right really does show it on the left, and posting a note on the
left really does put it on the right. That is the whole claim of the feature and
it is easier to look at than to read.

The phones are real: the tokens from `css/tokens.css`, unedited, and the
discussion questions from `js/data.js`, on the guide for *The Table of Grace*.

## The six things to decide

- **Writing needs an account, reading does not.** A note carries a first name
  and an owner, and the app cannot tell who you are unless you are signed in.
  The room stays readable to anyone with the code, and the first attempt to
  post is what asks you to sign in. **Recommended.**
- **It catches up, it is not instant.** The app talks to Supabase with plain
  `fetch` and carries no SDK. Polling every few seconds while the tab is open,
  plus a pull on focus, keeps that true. Realtime over a websocket is the other
  answer and it is a bigger change than it sounds.
- **Host is a row, not a switch.** `leaderMode` today is a checkbox in Profile
  that anybody can flip. The room's host has to be a `host_id` the database
  enforces, or every guest can rewrite the questions.
- **Codes expire at midnight.** Six digits is a million rooms, which is plenty
  when only tonight's are live. Enforce uniqueness among open rooms only.
- **Hiding has to be real.** If the phone holds every answer and simply declines
  to draw them, one look at the network tab undoes the feature. A closed answer
  must not leave the database, so the read policy enforces this, not the screen.
  **Recommended.**
- **The leader waits with everyone else.** Drawn so the leader sees who has
  answered and not what they wrote. Kinder default, keeps the room honest.
  Letting him read first makes moderation easier before the fact, and it is the
  version §2.5 calls a leader dashboard. **Recommended**, but your call.

## The one that changes the App Store submission

`APP_STORE_COMPLIANCE.md` section 2.5 names this exact feature as the thing
that would break the current answer: *"if anyone later proposes showing prayer
requests to a group, or a leader dashboard that reads members' journal entries,
that single change pulls the entire weight of Guideline 1.2 into scope."*

Read that next to the prayer box at the bottom of the page. It is not a near
miss, it is the same feature, named. Answers and prayer requests visible to the
whole room are user generated content shown to other users, so 1.2 applies.
That brings in a terms of service with a no objectionable content clause agreed
before a first post, a report control on every note, user blocking, a filtering
mechanism, published contact information for abuse reports, and a 24 hour
takedown commitment. The privacy policy gains a class of data that is shared
with other people, and the compliance matrix row reading **User generated
content: No** flips to yes.

### And the sheet is the part nothing can reach

Every other control here works because the content is still inside the app: a
note comes down, an answer closes, an account is deleted. Once the night is a
PDF in a group text it is a file on five phones, and Dee's sister and Marcus's
job are in it. Taking a note down afterwards does not touch it.

Two things worth settling before this ships: say plainly on that button what is
about to leave, and decide whether prayer requests go in the sheet by default or
only when the room says so. One line either way, and much harder to answer after
the first text has gone out.

None of that is a reason not to build it. It is a reason to price it into the
schedule before the build starts rather than during review.

## What it touches

| File | Change |
|---|---|
| `js/app.js` | A sixth entry in `TAB_META` and `TITLES`. Tile width already comes from `--hc-tab-count`. |
| `js/router.js` | One name in `TABS`. `js/swipe.js` reads that array, so swiping picks it up for free. |
| `js/screens/group.js` | New screen, a script tag in `index.html`, and a run of `npm run stamp`. |
| `js/store.js` | Caches the room, its questions, and the notes last seen. |
| `js/content.js` | Untouched. That file is the read only publishing pipeline. |
| `js/auth.js` | Its `restFetch` is the model for authenticated writes. This is the app's first user write. |
| `js/native.js` | Nothing new. `shareText` handles the code, `shareFile` handles the sheet. |
| `js/print-guide.js` | Most of the export already exists. `standaloneHtml` builds a paginated document with `print.css` inlined and hands it to the share sheet, where iOS offers Print, Save to Files and Mail. The night sheet is a second document built the same way. Note `window.print()` is a silent no-op inside WKWebView, which is why that road exists. |
| `supabase/migrations` | New `0016_group_rooms.sql`: rooms, members, questions, notes, prayer requests, and the project's first insert and update policies. Whether an answer is open is a column on the note, and the read policy has to honour it. |
| `supabase/functions/delete-account` | Has to learn about notes. |
| `css/screens.css` | One new block. |

## The tab bar

The design system asks for four to five tabs and this makes six. Measured in
the mockup, whose phones are a real 375pt wide, a sixth tab takes each tile from
**67.8pt down to 56.2pt**. Tap targets stay legal. The label is what runs out of
room, and **Connect** is the one that does it, setting 48.5pt wide at 11px and
leaving under 4pt of air on each side.

If it reads badly on a real phone, the fallback is not a smaller font. It is
putting the room inside the Guide tab, where the questions already live, and
surfacing it as a banner whenever a room is open.

## Building it

`mockup.src.html` carries placeholders for the two brand lockups. `build.js`
inlines both into a single self-contained file:

    cd demo-group-room && node build.js

Output is `mockup.html`, which opens directly in a browser with no server.
