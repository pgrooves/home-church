# Home Church NOLA: App Design System

**What this file is.** A design and brand specification for building the Home Church NOLA mobile app. It synthesizes the church’s existing web presence, voice, and content structure with the print design system already in use for small group sermon guides. Hand this to a designer, a developer, or an AI coding assistant as the source of truth for how the app should look, sound, and behave.

**Confidence labels.** Every section is tagged so you know what to trust:

- `[VERIFIED]` pulled directly from homechurchnola.com
- `[ESTABLISHED]` from the locked sermon guide print system, already in production use
- `[PROPOSED]` my recommendation, needs your sign-off
- `[VERIFY]` you need to confirm against real brand assets before building

-----

## 1. Brand foundation

### 1a. Who this is `[VERIFIED]`

Home Church is a New Orleans area church, physically located at **216 Giuffrias Ave, Metairie, LA 70001**. Sunday gatherings at **8:00 AM, 9:30 AM, and 11:00 AM**. Lead pastors are **Stephen and Laura Daigle**.

### 1b. The core metaphor `[VERIFIED]`

Everything runs through one idea: **home**. Not a building, not a weekly event, a family you belong to.

Language the church actually uses about itself:

- “We’re building a home. Come join the family.”
- “Everyone is welcome. Everyone is family.”
- “Not just a gathering, but a family.”
- “Imagine a church that feels like Home.”
- “A church of the city. Built from New Orleans. Built for New Orleans.”
- “Church is meant to be a family, not just a moment on the weekend.”

Stated mission: create a church that is a home to all ages and represents the diversity of the city, and change the way people see Christ, Christians, and the Church.

Stated vision arc: **know God, find freedom, discover purpose**, so people can make a difference beyond the walls of the church, reaching families, business, arts and entertainment, education, politics, and media.

**Design implication.** The app is not a broadcast channel or a media library with a church logo on it. It is the digital front door of a house. Every screen should answer “do I belong here” before it answers “what is happening here.” Warmth beats slickness. Presence beats polish.

### 1c. Existing site architecture `[VERIFIED]`

Primary nav is deliberately tiny: **Home / Give / Serve / Grow**. Giving is handled off-site through Overflow. Grow currently hosts teaching resources for the active sermon series (a 20-week Life of David reading plan, Bible Project links, and a book recommendation, Robert Alter’s *The David Story*).

**Design implication.** The church already thinks in verbs, not nouns. Carry that into the app’s information architecture. Four to five top-level destinations maximum.

-----

## 2. Voice and tone

### 2a. How Home Church actually talks `[VERIFIED]`

Warm, direct, unpretentious, second person. Contractions everywhere. Short declarative sentences. Invitational rather than instructional. Emotionally honest without being saccharine. Comfortable with a little New Orleans swagger.

### 2b. Voice rules for the app `[PROPOSED]`

**Do:**

- Speak to one person, not an audience. “Your group meets Thursday,” not “Members’ groups meet on Thursdays.”
- Use the church’s own words. Home, family, belong, together, city.
- Keep empty states human. “Nothing here yet. Your first guide will show up after Sunday.” not “No results found.”
- Let confirmation be warm. “You’re in. See you Thursday.” not “Registration successful.”

**Don’t:**

- No corporate churchspeak. Avoid “engage,” “leverage,” “utilize,” “resource” as a verb.
- No guilt mechanics. Never shame a streak break, a missed reading day, or low attendance.
- No fake urgency. No countdown timers on spiritual content.
- No exclamation-mark stacking. One is plenty.

### 2c. Formatting rule carried from the guides `[ESTABLISHED]`

**No em-dashes anywhere in the product.** Use commas. This rule was hard-won in the sermon guide work and should extend to every string in the app, including microcopy, notifications, and error states. It keeps the voice conversational rather than editorial.

-----

## 3. Visual system

### 3a. The two-palette problem, and how to solve it `[VERIFY]`

There are effectively two Home Church visual languages already in play:

1. **The web/social language.** Photography-forward, high contrast, near-black and white, minimal chrome. The Instagram voice uses a black heart. The site leans on large photographs of actual people in the room.
1. **The print/document language.** The warm paper system developed for the small group guides: off-white stock, near-black display type, muted taupe accents, generous whitespace.

These are compatible, they are the same brand at different temperatures. The web language is the church in public. The print language is the church at the kitchen table.

**Recommendation:** build the app on the warm paper system as its base, and use the high-contrast photographic language for hero moments (sermon cards, event headers, series art). The app is an intimate space, so it should feel like the guides, with the website’s boldness reserved for imagery.

**Before building, confirm with whoever owns brand assets:** the official logo files and clear-space rules, the actual brand typeface if one is licensed, and whether there is an existing brand guide that supersedes any of this.

### 3b. Color tokens `[ESTABLISHED]` base, `[PROPOSED]` extensions

The core six are lifted directly from the sermon guide system and are already in production use across every guide produced.

```
/* Core surfaces and ink */
--hc-paper        #F7F4EF   /* warm off-white, primary app background */
--hc-ink          #111111   /* near-black, primary text */
--hc-dark         #1A1918   /* near-black panel, headers, cover strips */
--hc-cream        #EDE8DF   /* warm cream, cards and raised surfaces */

/* Supporting */
--hc-mid          #7A7570   /* muted warm gray, secondary text, captions */
--hc-rule         #C8C0B0   /* thin warm rules, dividers, hairlines */
--hc-accent       #B5A898   /* muted taupe, eyebrows, numerals, active states */

/* Proposed extensions for interactive states */
--hc-accent-deep  #8F8271   /* pressed states, higher contrast accent text */
--hc-paper-sunk   #EFEAE2   /* inset wells, input fields, disabled surfaces */
--hc-success      #5F7355   /* muted sage, confirmations */
--hc-warning      #A8763F   /* muted amber, gentle attention */
--hc-error        #8B4A3F   /* muted brick, destructive and error */
--hc-overlay      rgba(26,25,24,0.55)  /* scrims over photography */
```

**Semantic assignments `[PROPOSED]`**

|Role                                  |Token                                           |
|--------------------------------------|------------------------------------------------|
|App background                        |`--hc-paper`                                    |
|Card / list item background           |`--hc-cream`                                    |
|Primary text                          |`--hc-ink`                                      |
|Secondary text, timestamps, metadata  |`--hc-mid`                                      |
|Dividers, hairlines                   |`--hc-rule`                                     |
|Section eyebrows, numerals, tab active|`--hc-accent`                                   |
|Primary button fill                   |`--hc-dark`                                     |
|Primary button text                   |`--hc-paper`                                    |
|Secondary button                      |transparent w/ `--hc-rule` 1px border           |
|Nav bar, headers                      |`--hc-dark` or `--hc-paper` depending on context|

**Dark mode `[PROPOSED]`**

Do not invert to pure black. Home Church’s dark is warm, not clinical. Invert to a warm charcoal family:

```
--hc-paper-dark   #1A1918   /* becomes background */
--hc-cream-dark   #232120   /* becomes card surface */
--hc-ink-dark     #F2EEE7   /* becomes primary text */
--hc-mid-dark     #9A938A   /* secondary text */
--hc-rule-dark    #3A3633   /* dividers */
--hc-accent-dark  #C4B5A2   /* accent lifts slightly for contrast */
```

### 3c. Typography `[ESTABLISHED]` with `[PROPOSED]` mobile adaptation

The guide system pairs a light humanist serif for display with a small tracked sans for labels. That pairing is the brand’s typographic signature and should carry into the app.

**Display and reading face: Cormorant** (Light, Regular, Italic, LightItalic, SemiBold, Bold)
Open source, free to use, available at [github.com/CatharsisFonts/Cormorant](https://github.com/CatharsisFonts/Cormorant). Elegant, high contrast, generous. Perfect for headlines, scripture, sermon titles, and pull quotes.

**Label and UI face: a neutral grotesque.** The print system uses Helvetica. For app work, use the platform system font (SF Pro on iOS, Roboto on Android) or Inter for cross-platform consistency. Reserve it for all-caps labels, buttons, tab bars, form fields, and dense metadata.

**Critical constraint:** Cormorant is beautiful but has a small x-height and thin light weights. It is a display and long-form reading face, not a UI face. Never set body UI, buttons, or form labels in Cormorant Light below 16pt.

**Type scale `[PROPOSED]`**

|Role      |Face             |Size / Line                |Notes                              |
|----------|-----------------|---------------------------|-----------------------------------|
|Display XL|Cormorant Light  |40 / 44                    |Sermon series title, cover moments |
|Display L |Cormorant Light  |32 / 36                    |Screen titles                      |
|Display M |Cormorant Light  |26 / 30                    |Section titles                     |
|Eyebrow   |Sans, 600        |11 / 14, +0.12em, uppercase|`--hc-accent`, sits above titles   |
|Body serif|Cormorant Regular|17 / 26                    |Sermon summaries, long-form reading|
|Body sans |Sans, 400        |16 / 24                    |UI copy, lists, forms              |
|Question  |Cormorant Regular|18 / 27                    |Discussion and reflection questions|
|Pull quote|Cormorant Italic |20 / 29                    |One-liner cards                    |
|Caption   |Sans, 400        |13 / 18                    |`--hc-mid`, timestamps, metadata   |
|Button    |Sans, 600        |16 / 20, +0.02em           |                                   |
|Tab label |Sans, 500        |11 / 14                    |                                   |

**The eyebrow pattern is the brand’s most recognizable typographic move.** A tiny tracked all-caps label in taupe, sitting directly above a large light serif title, with a short rule beneath. Use it at the top of every major section. It is doing more brand work than the logo is.

### 3d. Spacing and layout `[PROPOSED]`

Base unit **4pt**. Use multiples: 4, 8, 12, 16, 24, 32, 48, 64.

- Screen horizontal padding: **20pt**
- Card internal padding: **20pt**
- Gap between stacked cards: **12pt**
- Space above a section eyebrow: **40pt**
- Space between eyebrow and title: **6pt**
- Space between title and its rule: **10pt**
- Space between rule and content: **16pt**

**Generous whitespace is a brand value, not a preference.** The guides breathe on purpose. Resist the urge to increase density. If a screen feels too empty, the answer is usually less content, not tighter spacing.

### 3e. Shape, elevation, and rules `[PROPOSED]`

- **Corner radius:** 12pt on cards, 10pt on buttons, 8pt on inputs, 999pt on pills and avatars.
- **Elevation:** near-flat. Home Church is not a Material Design app. Separate surfaces with color (`--hc-cream` on `--hc-paper`) and hairlines, not drop shadows. Where a shadow is unavoidable (bottom sheets, modals), use `0 -2px 24px rgba(26,25,24,0.10)`.
- **Hairlines:** 0.5pt in `--hc-rule`. Use them liberally as section separators. They are quiet and warm where a gray box would be loud.
- **The left edge rule.** The signature card treatment from the guides: a cream card with a 1.5pt taupe rule down its left edge. Use this for quotes, highlighted scripture, and anything meant to feel “set apart on the page.”

### 3f. Photography `[VERIFIED]` direction, `[PROPOSED]` treatment

The site uses real, warm, candid photographs of actual people in the actual room. Baptisms, kids, worship, families, the pastors. Nothing staged, nothing stock.

**Rules:**

- Never use stock photography. Ever. It breaks the entire premise of “this is our family.”
- Prefer wide shots with air around subjects, which pairs with the generous layout.
- When text overlays a photo, use the `--hc-overlay` scrim rather than darkening the image itself.
- Keep color grading warm. If images run cool, warm them in post so they sit correctly against the paper background.

### 3g. Motion `[PROPOSED]`

- Duration: 200ms for small state changes, 300ms for transitions, 400ms for sheets.
- Easing: `cubic-bezier(0.4, 0.0, 0.2, 1)` standard, `cubic-bezier(0.0, 0.0, 0.2, 1)` for entering.
- Motion should feel unhurried, matching the whitespace. No bouncing, no springs with overshoot, no confetti.
- The one place to allow delight: completing a reading plan week or a group check-in. Even then, keep it to a soft fade and a warm color wash, not particles.

### 3h. Iconography `[PROPOSED]`

Thin line icons, 1.5pt stroke, rounded caps, 24pt grid. Lucide or Phosphor (light weight) both fit. Avoid filled icons except for active tab states. Icons should feel drawn, not engineered.

-----

## 4. Component specifications

### 4a. Section header

The most-used pattern in the app. Direct port from the guides.

```
[EYEBROW IN TRACKED CAPS, --hc-accent, 11pt]
Large Serif Title in Cormorant Light 26pt
[short rule, 22% width, 0.75pt, --hc-accent]
```

### 4b. Content card

Background `--hc-cream`, radius 12, padding 20, no shadow. Optional 1.5pt `--hc-accent` left edge rule for emphasis variants.

### 4c. Quote card

The one-liner treatment from the guides, unchanged: `--hc-cream` background, 1.5pt taupe left edge, quote set in Cormorant Italic 20pt with curly quotation marks, attribution below in tracked caps `--hc-mid`.

### 4d. Numbered question row

For self-reflection lists. A taupe two-digit numeral (01, 02) right-aligned in a narrow left column, question text in Cormorant 18pt to its right, 0.5pt `--hc-rule` hairline above each row. This is the single most distinctive component carried from print and it should survive intact.

### 4e. Buttons

- **Primary:** `--hc-dark` fill, `--hc-paper` text, radius 10, height 52, full width on mobile.
- **Secondary:** transparent, 1pt `--hc-rule` border, `--hc-ink` text.
- **Tertiary / text:** `--hc-accent-deep` text, no chrome, used for inline actions.
- Minimum touch target 44x44 regardless of visual size.

### 4f. Tab bar

Four to five items maximum. `--hc-paper` background with a 0.5pt `--hc-rule` top hairline. Inactive icons and labels `--hc-mid`, active `--hc-ink` with the icon in `--hc-accent`. No pill backgrounds, no bold indicators.

### 4g. Empty states

An empty state is a hospitality moment. Structure: a small line illustration or icon in `--hc-rule`, a one-line warm explanation in Cormorant Italic `--hc-mid`, and a single action if one exists. Never a shrug, never an error tone.

-----

## 5. Proposed app architecture

### 5a. Navigation `[PROPOSED]`

Mirror the site’s verb-based simplicity. Five tabs:

|Tab        |Purpose                                                                         |
|-----------|--------------------------------------------------------------------------------|
|**Home**   |Personalized front door. Next gathering, this week’s guide, one thing to act on.|
|**Listen** |The podcast. Sermon archive, current series, episode notes, out to Spotify.    |
|**Grow**   |Reading plans, small group guides, resources, notes.                            |
|**Connect**|Groups, serve teams, events, next steps.                                        |
|**Give**   |Giving, currently handled by Overflow.                                          |

### 5b. Screen inventory `[PROPOSED]`

**Home**

- Greeting with first name, warm and time-aware
- Next gathering card: day, time, location, directions action
- This week’s sermon guide entry point
- Current reading plan progress, quiet and non-punitive
- One announcement maximum

**Listen**

- Latest episode with podcast cover art and a way straight into Spotify
- Current series hero with series art
- Episode list with title, preacher, date, duration, grouped by series
- Rows open in place to the episode’s own notes, so you can read what a
  message is about without leaving the app to find out
- Per-episode: summary, the Spotify link, and a link into the matching small group guide
- The show card at the foot, for following the podcast rather than one episode

**Grow**

- Active reading plan with week-by-week structure (the 20-week Life of David plan is the existing model)
- Small group guide library, organized by series then sermon
- Individual guide reader, see section 6
- Personal notes, searchable
- Resources: recommended books, Bible Project links

**Connect**

- Find a group: filter by day, location, life stage
- My group: meeting details, roster, leader contact, this week’s guide
- Serve teams and signup
- Events calendar
- Next steps: I’m new, baptism, membership, prayer request

**Give**

- Handoff to Overflow, or native giving if that changes later
- Giving history if available

### 5c. Leader mode `[PROPOSED]`

Trey’s actual workflow is the strongest argument for this feature. Small group leaders need:

- The current week’s guide in a presentation-friendly reading view
- The ability to mark which questions were used
- Attendance and prayer request capture
- A private leader-notes field per member
- Push when a new guide is published

This is the highest-leverage differentiator versus a generic church app. Most church apps serve attenders. Almost none serve leaders.

-----

## 6. Rendering sermon guides in-app `[ESTABLISHED]` structure

The guide format is already locked and in production. The app should render it natively rather than shipping PDFs, with PDF export retained for leaders who print.

**Guide structure, in fixed order:**

1. **Short Summary** (eyebrow: `SHORT SUMMARY`, title: Overview)
1. **Full Summary** (eyebrow: `FULL SUMMARY`, title: Sermon Summary)
1. **Discussion Questions** (eyebrow: `FOR THE GROUP`, title: Discussion Questions)
1. **Self-Reflection Questions** (eyebrow: `TAKE HOME`, title: Self-Reflection Questions)
1. **Impactful One-Liners** (eyebrow: `FROM THE PULPIT`, title: Impactful One-Liners)
1. **Scripture Index** (eyebrow: `REFERENCED IN THE SERMON`, title: Scripture Index)

**Mobile rendering notes:**

- Each of the six becomes a collapsible section, with Short Summary expanded by default.
- Discussion questions get checkboxes so a leader can track coverage live.
- One-liners render as the cream quote cards and should be individually shareable as images, this is the most social-ready content in the whole app.
- Scripture references are tappable, opening the passage inline or in the user’s preferred Bible app.
- Self-reflection questions get an optional private journal field beneath each one, which becomes the seed of the personal notes feature.

**Content model `[PROPOSED]`**

```
Guide {
  id, sermonId, seriesId
  themeTitle          // "The Slow Burn"
  subtitle            // "what David and Bathsheba teach us..."
  primaryPassage      // "2 Samuel 11 & 12"
  preacher            // "Stephen"
  preachedOn          // date
  occasion?           // "Father's Day"
  shortSummary        // [paragraph]
  fullSummary         // [paragraph]
  anchors             // [{ label, body }]
  groupSections       // [{ heading, questions: [string] }]
  reflectionQuestions // [string]
  oneLiners           // [string]
  scriptures          // [{ reference, note }]
  closingScripture    // { text, reference }
}
```

-----

## 7. Accessibility `[PROPOSED]`

Non-negotiable, and worth stating because this palette has real risks.

- **Contrast.** `--hc-mid` (#7A7570) on `--hc-paper` (#F7F4EF) is roughly 4.5:1, which passes for normal text but only barely. Never use `--hc-mid` below 13pt. `--hc-accent` (#B5A898) on paper is roughly 2.4:1 and **fails**, so it is decorative only. Never set body copy, form labels, or anything a user must read in `--hc-accent`. Use `--hc-accent-deep` when accent-colored text must be legible.
- **Cormorant Light is a contrast risk** at small sizes. Do not go below 16pt in Light. Prefer Regular for anything under 20pt.
- Support Dynamic Type. The generous spacing gives room to scale, use it.
- All touch targets minimum 44x44.
- Full VoiceOver and TalkBack labeling, especially on the numbered question rows where the numeral is decorative and should be hidden from screen readers.
- Respect reduce-motion.
- Provide audio-only mode for sermons, which matters for low-bandwidth and for driving.

-----

## 8. Implementation starter

### 8a. Design tokens as code `[PROPOSED]`

```js
export const colors = {
  paper:      '#F7F4EF',
  paperSunk:  '#EFEAE2',
  cream:      '#EDE8DF',
  ink:        '#111111',
  dark:       '#1A1918',
  mid:        '#7A7570',
  rule:       '#C8C0B0',
  accent:     '#B5A898',
  accentDeep: '#8F8271',
  success:    '#5F7355',
  warning:    '#A8763F',
  error:      '#8B4A3F',
};

export const space = { xs:4, sm:8, md:12, base:16, lg:24, xl:32, xxl:48, xxxl:64 };
export const radius = { sm:8, md:10, lg:12, pill:999 };

export const type = {
  displayXL: { family:'Cormorant', weight:'300', size:40, line:44 },
  displayL:  { family:'Cormorant', weight:'300', size:32, line:36 },
  displayM:  { family:'Cormorant', weight:'300', size:26, line:30 },
  eyebrow:   { family:'Inter', weight:'600', size:11, line:14, tracking:0.12, transform:'uppercase' },
  bodySerif: { family:'Cormorant', weight:'400', size:17, line:26 },
  bodySans:  { family:'Inter', weight:'400', size:16, line:24 },
  question:  { family:'Cormorant', weight:'400', size:18, line:27 },
  quote:     { family:'Cormorant', weight:'400', style:'italic', size:20, line:29 },
  caption:   { family:'Inter', weight:'400', size:13, line:18 },
  button:    { family:'Inter', weight:'600', size:16, line:20 },
};
```

### 8b. Suggested stack `[PROPOSED]`

React Native with Expo is the pragmatic choice for a church this size: one codebase, over-the-air updates without app store review (which matters when a guide has a typo on Saturday night), and straightforward push notifications. Cormorant loads cleanly via `expo-font`.

If the guide pipeline stays Python and ReportLab, keep it. Publish guides as structured JSON to the app and generate the PDF from the same source for leaders who print.

-----

## 9. Things to confirm before you build `[VERIFY]`

1. **Official brand assets.** Logo files, clear space, minimum sizes, and whether a formal brand guide exists that overrides anything here.
1. **Licensed typeface.** If the church has a paid display face in use on print or motion graphics, it should replace or sit alongside Cormorant.
1. **Exact web palette.** Pull the real hex values off the live site with a color picker or from the Squarespace theme settings, and reconcile against the paper system above.
1. **Service times.** The site currently lists 8:00, 9:30, and 11:00 AM, while older Instagram posts reference 10:00 AM. Confirm current times before hardcoding.
1. **Backend reality.** What church management system is in use (Planning Center, Breeze, Church Community Builder)? That determines whether groups, serve teams, and events can be pulled live or must be entered manually.
1. **Giving.** Whether Overflow stays as an external handoff or giving comes in-app.
1. **Who owns content.** Someone has to publish guides weekly. The app’s value collapses if that pipeline is unclear.

-----

## 10. The one-sentence design brief

Build a warm, quiet, generously spaced app that feels like the small group guide it carries, where a light serif and a whisper of taupe do the brand work, real photographs of real people carry the emotion, and every screen answers “you belong here” before it answers anything else.