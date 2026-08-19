# Group tab, a room your group joins with a code — mockup

A standalone rendering of a proposed sixth tab, made to be looked at before
anything in `js/` or `css/` is touched. Nothing here is wired into the app.

## What it shows

A leader with leader mode on opens a room. The app mints a six digit code and
hands it to the phone's share sheet as a prefilled text. Everyone else opens
the Group tab, types the code, and lands on the same page: this week's
discussion questions, carried over from the guide. The leader can reword, drop,
or add questions and every change lands on every phone in the room. Under each
question everybody gets a box. What you post is readable by the whole room
under your first name, taken from your profile, and editable by nobody but you.

The page carries two phones, one belonging to somebody in the group and one to
the leader hosting it. They are wired to the same state object, so posting a
note on the left really does put it on the right, and adding a question on the
right really does put it on the left. That is the whole claim of the feature and
it is easier to look at than to read.

The phones are real: the tokens from `css/tokens.css`, unedited, and the
discussion questions from `js/data.js`, on the guide for *The Table of Grace*.

## The four things to decide

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

## The one that changes the App Store submission

`APP_STORE_COMPLIANCE.md` section 2.5 names this exact feature as the thing
that would break the current answer: *"if anyone later proposes showing prayer
requests to a group, or a leader dashboard that reads members' journal entries,
that single change pulls the entire weight of Guideline 1.2 into scope."*

Notes visible to the whole room are user generated content shown to other
users, so 1.2 applies. That brings in a terms of service with a no
objectionable content clause agreed before a first post, a report control on
every note, user blocking, a filtering mechanism, published contact information
for abuse reports, and a 24 hour takedown commitment. The privacy policy gains
a class of data that is shared with other people, and the compliance matrix row
reading **User generated content: No** flips to yes.

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
| `js/native.js` | Nothing new. `shareText` already handles the text button. |
| `supabase/migrations` | New `0016_group_rooms.sql`: rooms, members, questions, notes, and the project's first insert and update policies. |
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
