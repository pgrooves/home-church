# Home Church

A mobile web app for Home Church, Metairie, Louisiana. Sermons, small group
guides, and a way in.

It is plain HTML, CSS, and vanilla JavaScript. There is no build step, no npm
install, and no backend. All content lives in one seed file shaped like a
future API response.

-----

## Running it

**The quick way.** Open `index.html` in a browser. Everything works from the
file system, including navigation and saved notes.

**The better way.** Serve the folder, which lets deep links and the browser
back button behave exactly as they will in production:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works. So does GitHub Pages: point Pages at the default
branch, root folder, and the app is live. Every path in the project is
relative, so it runs from a subdirectory without changes.

To see it the way it is designed, open your browser's device toolbar and set
the viewport to 390 x 844.

**Fonts.** Cormorant loads from Google Fonts and is the only network request
the app makes. If it fails, a serif fallback stack takes over and nothing
breaks.

-----

## How it is put together

```
index.html            entry point, meta tags, script order
css/
  tokens.css          design tokens, custom properties only
  base.css            reset, typography, safe areas, utilities
  components.css      reusable component classes
  screens.css         screen specific layout
js/
  data.js             seed content, shaped like a future API payload
  store.js            localStorage wrapper, app state, tiny pub/sub
  router.js           pushState routing, no hash
  components.js       render functions returning HTML strings
  screens/            one file per screen
  app.js              boot, route table, delegated event handling
assets/icons          the mark, favicon, app icons
assets/img            placeholder note, real photography goes here later
manifest.webmanifest
```

**Scripts are classic, not modules.** ES modules fail over `file://` because
of origin rules, and the brief calls for the app to run by opening the file.
Everything hangs off one `HC` global, and each file adds its own namespace.
Load order is in `index.html` and matters.

**Screens return HTML strings.** `app.js` mounts them and runs one delegated
listener per event type. Taps are wired through `data-action` attributes that
map to the `actions` table in `app.js`. Adding a new interaction means adding
a `data-action` in the markup and a matching function in that table, never a
new listener.

**State.** `js/store.js` wraps `localStorage`. Every key is prefixed `hc:` and
every read and write is inside a try/catch, so private browsing degrades to an
in memory session instead of crashing. Profile also surfaces a quiet note when
storage is unavailable.

What persists: your name and preferences, dark mode, text size, leader mode,
per guide question checkmarks, per guide journal entries, dismissed
announcements, the roster, and prayer requests.

-----

## Adding a guide

Guides are the point of this app. Add one by appending an object to the
`guides` array in `js/data.js`. Nothing else needs to change, the index,
the reader, the Home card, and leader presentation mode all pick it up.

```js
{
  id: 'guide-your-slug',          // unique, used in the URL
  sermonId: 'sermon-your-slug',   // must match an entry in `sermons`
  seriesId: 'series-david',       // must match an entry in `series`
  themeTitle: 'The Slow Burn',
  subtitle: 'How a good man ends up somewhere he never planned to go',
  primaryPassage: '2 Samuel 11 & 12',
  preacher: 'Stephen Daigle',
  preacherShort: 'Stephen',
  preachedOn: '2026-08-02',       // YYYY-MM-DD, drives newest first ordering

  shortSummary: ['...', '...', '...'],        // three paragraphs
  fullSummary: ['...', '...'],                // as many as it takes
  anchors: [{ label: '...', body: '...' }],   // the movements of the sermon
  groupSections: [                            // renders as checkable rows
    { heading: 'Getting started', questions: ['...', '...'] }
  ],
  reflectionQuestions: ['...'],               // numbered rows plus journals
  oneLiners: ['...'],                         // cream quote cards
  scriptures: [{ reference: '2 Samuel 11:1', note: 'why it matters here' }],
  closingScripture: { text: '...', reference: 'Psalm 32:5' }
}
```

Add the matching sermon to the `sermons` array and set its `guideId` to your
new guide id, which is what puts the quiet guide link on the Watch screen.

**Writing the content.** The six section structure is locked and the reader
renders it in a fixed order, so write to it rather than around it. Voice notes
that matter more than they sound:

- Second person, contractions, warm and direct. Speak to one person.
- **No em-dashes anywhere.** Use commas. This is a brand rule and it applies
  to every string in the product, including empty states and errors.
- Discussion questions have to be specific enough that a person cannot deflect
  with a general answer, and must never ask what other people think.
- No guilt. Nothing in this app shames a missed week.

-----

## Wrapping for iOS

The app is built so this is a packaging step, not a rewrite. Paths are all
relative, safe area insets are already respected, routing uses `pushState`, and
every outbound link goes through one `openExternal()` helper in
`js/components.js` that already prefers the Capacitor Browser plugin when it
is present.

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Home Church" com.homechurchnola.app
```

Set `webDir` to the repo root in `capacitor.config.json`:

```json
{
  "appId": "com.homechurchnola.app",
  "appName": "Home Church",
  "webDir": "."
}
```

Then:

```bash
npx cap add ios
npx cap sync
npx cap open ios
```

That opens Xcode. Set the app icon from `assets/icons/`, pick a team, and run
on a device.

**Worth knowing before you start.** An Apple Developer account is $99 a year.
A personal account can be created in a few minutes. An organization account,
which is what you want if the app is published as Home Church rather than as a
person, requires a D-U-N-S number for the church, and obtaining one usually
takes a week or two. Start that early, it is the long pole.

**Optional once wrapped.** Install `@capacitor/browser` so `openExternal()`
opens giving and scripture links in an in-app browser instead of leaving the
app. No code change is needed, the helper already checks for it.

-----

## Brand assets

`assets/icons/mark.svg` is a vector redraw of the Home Church mark, the gold
house outline with a cross inside and a speech bubble tail. `app-icon.svg` and
the PNG icons are generated from it.

Replace these with the official artwork when it is available, and confirm the
exact gold against the source file. The redraw currently uses `#D2B27E`. That
gold is a mark color only, it is not part of the UI palette and no interface
element should adopt it.

The mark appears on Home, on Profile, and as the app icon. It is deliberately
absent from the top bar, which stays empty except for the avatar.

-----

## Decisions worth not undoing

- **Five tabs and one Profile screen.** No drawer, no More sheet. Two
  navigation systems is one too many.
- **No shadows.** Surfaces separate with color and 0.5px hairlines.
- **No streaks, badges, day counters, or completion percentages.** The reading
  plan shows position, not pressure.
- **`--hc-accent` is decorative only.** It fails contrast on paper at roughly
  2.4:1. Anything a user has to read uses `--hc-ink`, `--hc-mid`, or
  `--hc-accent-deep`.
- **Cormorant Light never goes below 16px**, and below 20px it is set in
  Regular.
- **No stock photography, ever.** Cream placeholder blocks until real
  photographs of real people exist.
- **No in-app payment.** Giving hands off to Overflow.

-----

## Still to confirm before launch

These are marked in the code where they appear:

1. The Overflow giving URL in `js/data.js`.
2. The official logo files and the exact brand gold.
3. Whether a licensed display typeface should replace Cormorant.
4. Which church management system holds groups, serve teams, and events, which
   decides whether that content can be pulled live.
5. Who publishes a guide every week. The app's value depends on that pipeline
   more than on anything in this repo.

Seed content in `js/data.js` is written to be plausible, not authoritative.
Sermons, groups, events, and serve teams are placeholders. The two guides are
complete and written in the real voice, and they are the thing to look at.
