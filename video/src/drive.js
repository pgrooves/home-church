/* ===========================================================================
   Hands on the app.

   Every function in here reaches into the running app inside the iframe and
   puts one thing into a stated position. None of them toggle, step, advance,
   or otherwise depend on where the app already was.

   THAT RULE IS THE WHOLE FILE. Remotion renders a video by asking for frame
   n, and it does not promise to ask in order: it opens several browser tabs
   and gives each of them a stretch of the timeline, so a tab can be handed
   frame 640 as the first thing it ever does. A scene written as "on frame 300,
   tap the checkbox" renders correctly in the studio and comes out of a real
   render with the box unchecked, or checked twice, depending on which tab drew
   which frame.

   So the scenes below never say tap. They say: at frame 300 this box is
   checked, this section is 70 percent open, this screen is scrolled to 812.
   Ask for any frame in any order and the app arrives in the same state.

   WHY THE MOTION IS DRIVEN AND NOT PLAYED. The app animates beautifully on a
   phone, and none of that animation can be used here. A CSS transition runs on
   the wall clock, and a render does not: frame 41 might be drawn eight seconds
   after frame 40, or eight milliseconds. Anything mid-transition when the
   shutter opens is luck. So boot() switches every transition and animation in
   the app off, and these functions redraw the same movements from the frame
   number, which is the one thing that is the same every time.

   The two collapsing sections are the nicest case: css/components.css animates
   them from `grid-template-rows: 0fr` to `1fr`, so a fraction of an `fr` is a
   section caught halfway open, and setSection() can put it anywhere.
   =========================================================================== */

/* --- the shell ------------------------------------------------------------ */

/* Which screen is on. Compared by the same three fields js/router.js keys a
   route by, so asking for the screen already showing costs nothing and does
   not re-render, which matters because a re-render every frame would throw
   away the scroll position sixty times a second. */
export function setRoute(win, route) {
  const cur = win.HC.router.current() || {};
  const same =
    cur.name === route.name &&
    (cur.id || null) === (route.id || null) &&
    (cur.index == null ? null : cur.index) === (route.index == null ? null : route.index);
  if (same) return;
  win.HC.router.go(route, { force: true, animate: false, replace: true });
}

/* The one scroll container. Clamped, because a scene that asks for 900 on a
   screen with 700 of travel should sit at the bottom rather than fail. */
export function setScroll(win, top) {
  const el = win.document.getElementById('hc-scroll');
  if (!el) return;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  el.scrollTop = Math.min(Math.max(0, top), max);
}

/* How far along the tab bar the lit tile sits, and whether it is lit at all.
   js/app.js writes whole numbers here on a tap. Fractions are legal and are
   what makes the tile slide between two tabs over several frames: the CSS is
   `translateX(calc(var(--hc-tab-index) * 100%))`, so 2.4 is two fifths of the
   way from Connect to Listen. */
export function setTab(win, index, lit) {
  const bar = win.document.getElementById('hc-tabbar');
  if (!bar) return;
  bar.style.setProperty('--hc-tab-index', String(index));
  bar.style.setProperty('--hc-tab-tile', lit === false ? '0' : '1');
}

/* --- things that open ----------------------------------------------------- */

/* A collapsible section of a guide, or of Connect, held `amount` open.

   Three things move together and all three are set by hand, because the CSS
   that normally moves them is switched off: the row itself, the padding the
   open state adds above the contents, and the chevron, which turns over as the
   section comes up. Setting only the first gives you a section that unfolds
   under a chevron that has already flipped, which looks like a bug. */
export function setSection(win, id, amount) {
  const doc = win.document;
  const panel = doc.getElementById('panel-' + id);
  const toggle = doc.querySelector('[data-action="toggle-section"][data-section-id="' + cssq(id) + '"]');
  if (!panel) return;

  const open = amount > 0.001;
  panel.setAttribute('data-open', open ? 'true' : 'false');
  panel.style.gridTemplateRows = amount + 'fr';
  const inner = panel.firstElementChild;
  if (inner) inner.style.paddingTop = (16 * amount).toFixed(2) + 'px';

  if (toggle) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const chev = toggle.querySelector('.hc-section__chevron');
    if (chev) chev.style.transform = 'rotate(' + (180 * amount).toFixed(1) + 'deg)';
  }
}

/* The notes under a sermon on Listen. Same grid trick, different markup: the
   row is a button and the panel is its sibling, so this one is found through
   the row rather than by id. */
export function setEpisode(win, index, amount) {
  const row = win.document.querySelectorAll('.hc-sermon')[index];
  if (!row) return;
  const panel = row.querySelector('.hc-episode');
  const main = row.querySelector('.hc-sermon__main');
  if (!panel) return;

  const open = amount > 0.001;
  panel.setAttribute('data-open', open ? 'true' : 'false');
  panel.style.gridTemplateRows = amount + 'fr';
  const inner = panel.querySelector('.hc-episode__inner');
  if (inner) inner.style.paddingTop = (12 * amount).toFixed(2) + 'px';

  if (main) {
    main.setAttribute('aria-expanded', open ? 'true' : 'false');
    const chev = main.querySelector('.hc-sermon__chevron');
    if (chev) chev.style.transform = 'rotate(' + (180 * amount).toFixed(1) + 'deg)';
  }
}

/* --- things that get ticked ----------------------------------------------- */

/* A discussion question, checked or not.

   This one goes through the app's own click handler rather than writing the
   store directly, because the handler does three things the store does not:
   it flips aria-pressed on the button, it repaints the "18 in all" line at the
   top of the section, and it asks the phone for a haptic tap. Two of those are
   on screen. Gated on the store's answer, so it is a tap only when the frame
   asks for a state the app is not already in. */
export function setChecked(win, guideId, key, want) {
  if (!guideId) return;
  const is = !!win.HC.store.isChecked(guideId, key);
  if (is === !!want) return;
  const btn = win.document.querySelector('[data-action="toggle-check"][data-check-key="' + cssq(key) + '"]');
  if (btn) btn.click();
  else win.HC.store.toggleChecked(guideId, key);
}

/* The tick drawn a little larger for a few frames after it lands, which is the
   one thing a phone does here that a still cannot show: a check that arrives
   rather than one that was always there. Scale only, on the box, so nothing
   below it moves. */
export function pressCheck(win, key, scale) {
  const btn = win.document.querySelector('[data-action="toggle-check"][data-check-key="' + cssq(key) + '"]');
  if (!btn) return;
  const box = btn.querySelector('.hc-check__box');
  if (box) box.style.transform = 'scale(' + scale.toFixed(3) + ')';
}

/* --- the whole view ------------------------------------------------------- */

/* Slide and fade the mounted screen. Used where the app itself would animate
   between two states it cannot animate between here: Leader mode moving from
   one question to the next is a re-render, and a re-render with transitions
   off is a hard cut. This carries the old question out to the left and brings
   the new one in from the right, over frames the scene owns. */
export function setViewShift(win, dx, opacity) {
  const view = win.document.getElementById('hc-view');
  if (!view) return;
  view.style.transform = dx ? 'translateX(' + dx.toFixed(2) + 'px)' : '';
  view.style.opacity = opacity == null ? '' : String(opacity);
}

/* --- the room ------------------------------------------------------------- */

/* The host opening one person's answer to the room.

   This is the feature the Group tab exists for: everybody writes at the same
   time, nothing is visible until the host opens it, and the host opens them
   one at a time as the conversation gets there. On a phone it is a tap on a
   name, a row written to the database, and eight seconds later that answer is
   on five other phones.

   Here it is the same state change made locally. `openedAt` is the whole of
   it, in both places the app keeps it: `notes`, which carries the words, and
   `index`, which carries who wrote what. Nulled, the name wears a padlock and
   the words are not drawn at all, which is not a trick, it is js/screens/
   group.js filtering on exactly this field. Filled in, the name wears an eye
   and the answer unfolds underneath.

   snapshot() hands back a copy of each array holding the same row objects, so
   writing to them writes to the room the screen is about to draw. The screen
   is redrawn afterwards because the room repaints on a poll rather than on a
   change, and there is no poll running here. */
export function revealAnswer(win, noteId, open) {
  const snap = win.HC.rooms.snapshot();
  const rows = snap.notes.concat(snap.index).filter((n) => n.id === noteId);
  if (!rows.length) return;

  const want = open ? rows[0].createdAt || new Date().toISOString() : null;
  const already = rows.every((r) => (r.openedAt || null) === (want || null));
  if (already) return;

  rows.forEach((r) => { r.openedAt = want; });
  redraw(win);
}

/* Rebuild the screen that is on. The room is the one screen in the app that
   redraws itself under you rather than on a tap, and with the poll switched
   off nothing else will. */
export function redraw(win) {
  const route = win.HC.router.current();
  if (route) win.HC.router.go(route, { force: true, animate: false, replace: true });
}

/* --- keeping a line out of a guide ---------------------------------------- */

/* The first `chars` characters of a block, selected, the way a thumb dragging
   across them would leave it. Zero clears the selection.

   A selection is state rather than a gesture, which is the only reason this
   can be in a video at all: setting the same range on sixty consecutive
   frames leaves the same range, and growing it by three characters a frame is
   a drag. What it draws in is the ::selection rule in AppStage's boot CSS,
   because Chromium's own is a blue nothing else in this app comes near. */
export function setSelection(win, selector, chars) {
  const doc = win.document;
  const sel = win.getSelection && win.getSelection();
  if (!sel) return;

  if (!(chars > 0)) {
    if (sel.rangeCount) sel.removeAllRanges();
    return;
  }

  const el = doc.querySelector(selector);
  if (!el) return;
  const walker = doc.createTreeWalker(el, win.NodeFilter.SHOW_TEXT, null, false);
  const node = walker.nextNode();
  if (!node) return;

  const range = doc.createRange();
  range.setStart(node, 0);
  range.setEnd(node, Math.min(Math.round(chars), node.textContent.length));
  sel.removeAllRanges();
  sel.addRange(range);
}

/* Note this / Highlight, the bar that comes up over a selection.

   THE APP PUTS IT UP A FIFTH OF A SECOND AFTER THE SELECTION SETTLES, and
   that delay is not politeness either: on a phone the grab handles are still
   moving while the selection changes, and a bar that repositions on every
   tick flickers under the thumb doing the moving. See onSelectionChange in
   js/highlight.js.

   A render has no fifth of a second. Frames are drawn one at a time with the
   clock stopped between them, so a timer set while frame 300 is being drawn
   fires somewhere in the middle of frame 301, or 340, or never. This runs the
   app's own handler now instead of in 220 milliseconds, by swapping that one
   timer for a straight call and putting setTimeout back. It is the same
   decision as switching the CSS transitions off: the app's behaviour is
   right, its timing cannot be used. Gated on whether the bar is already
   there, so the frame after this one does nothing. */
export function setHighlightBar(win, up) {
  const there = !!win.document.querySelector('.hc-hlbar');
  if (!!up === there) return;

  if (!up) { win.HC.highlight.hideBar(); return; }

  const real = win.setTimeout;
  win.setTimeout = function (fn, ms) {
    if (ms === 220) { fn(); return 0; }
    return real.apply(win, arguments);
  };
  try {
    win.document.dispatchEvent(new win.Event('selectionchange'));
  } finally {
    win.setTimeout = real;
  }
}

/* The entry itself: there, or not there.

   NOT MADE BY PRESSING Note this, which is the one place in this piece where
   the app's own button is not what happens, and it is worth the paragraph.
   js/highlight.js mints a uuid and stamps the clock, so eight render tabs
   pressing that button make eight different entries with eight different
   timestamps, and the card in the Journal carries both. The same tearing the
   loose notes had, with a worse symptom: the mark in the prose is keyed on
   the id, so the tabs would not even agree about which words are underlined.

   So the entry is written through the same HC.journal.create the button calls,
   with the id and the date stated rather than minted. Every tab writes the
   same row. `want` is a position, not a press: a frame before the note exists
   says false and gets no note, a frame after says true and gets exactly one,
   whichever order the two frames are drawn in.

   redraw() is the app's, and it is what paints the underline into the
   paragraph. It no-ops on any screen the paragraph is not on, which is how
   the Journal scene can ask for this without touching anything. */
export function setNote(win, want, note) {
  const HC = win.HC;
  if (!HC || !HC.journal || !note) return;

  const has = !!HC.journal.get(note.id);
  if (has === !!want) return;

  if (!want) {
    HC.highlight.closeNote();
    HC.journal.remove(note.id);
    HC.highlight.redraw(note.guideId, note.path);
    return;
  }

  const guide = HC.data.getGuide(note.guideId);
  HC.journal.create({
    id: note.id,
    createdAt: note.createdAt,
    kind: 'highlight',
    guideId: note.guideId,
    guideTitle: guide ? HC.data.guideTitle(guide) : null,
    path: note.path,
    quote: note.quote,
    start: note.start,
    end: note.end,
    bodyText: note.text
  });
  HC.highlight.redraw(note.guideId, note.path);
}

/* A caret, which does not blink, because a blink is a thing the wall clock
   does and there is no wall clock here. */
const CARET = '<span style="display:inline-block;width:2px;height:1.05em;' +
  'margin:0 0 -0.18em 2px;background:#CBAC74"></span>';

/* The sheet over the guide, and the words appearing in it.

   The entry already holds the whole note, because the entry is what the
   Journal draws from and a half typed card is not what anybody would have
   saved. What is on screen is overwritten every frame with however much of it
   has been typed by now, so the sheet opens empty under its placeholder and
   fills up. Nothing is read back out of the box, which is what makes that
   safe: the box is a display here, not a source. */
export function setNoteSheet(win, note, open, chars) {
  const doc = win.document;
  const sheet = doc.querySelector('[data-sheet="note"]');

  if (open && !sheet) win.HC.highlight.open(note.id);
  else if (!open && sheet) win.HC.highlight.closeNote();
  if (!open) return;

  const box = doc.getElementById('hc-hl-note');
  if (!box) return;
  const typed = note.text.slice(0, Math.max(0, Math.round(chars)));
  const done = typed.length >= note.text.length;
  box.innerHTML = typed
    ? '<p>' + escapeHtml(typed) + (done ? '' : CARET) + '</p>'
    : '';
}

/* --- the journal ---------------------------------------------------------- */

/* Which slice of the Journal is showing: `guide` for the one sermon it was
   opened from, `all` for everything.

   THE WAY OUT OF A SCOPED JOURNAL IS A PILL, and it is the app's own: arrive
   from a guide and the row reads This guide · All · Highlights · Scripture,
   with the first one pressed. Tapping All is what widens the list, and the
   headings go from one sermon to every sermon somebody has written under,
   each shut. That is the whole of the Journal scene's second half and it is
   not a trick played on the screen; it is the button.

   Gated on the screen's own answer, so a frame asking for the slice already
   showing does not repaint. A repaint here is cheap and visible: it rebuilds
   the list and takes the scroll with it. */
export function setJournalFilter(win, id) {
  const helpers = win.HC.screens && win.HC.screens.journalHelpers;
  if (!helpers || !helpers.getFilter || helpers.getFilter() === id) return;

  const btn = win.document.querySelector(
    '[data-action="journal-filter"][data-value="' + cssq(id) + '"]');
  if (btn) { btn.click(); return; }
  helpers.setFilter(id);
  helpers.repaint();
}

/* One sermon's heading in the Journal, held `amount` open.

   Same grid-rows trick as setSection, different markup: the panel is found
   through the heading's aria-controls rather than by a known id, because the
   ids are positional and the church publishes more guides every week. The
   screen is also told, so that a repaint, if one ever happens mid scene,
   leaves the fold where the frame put it rather than shutting it. */
export function setFold(win, key, amount) {
  const doc = win.document;
  const btn = doc.querySelector(
    '[data-action="journal-fold"][data-fold="' + cssq(key) + '"]');
  if (!btn) return;
  const panel = doc.getElementById(btn.getAttribute('aria-controls'));
  if (!panel) return;

  const open = amount > 0.001;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  panel.setAttribute('data-open', open ? 'true' : 'false');
  panel.style.gridTemplateRows = amount + 'fr';
  const chev = btn.querySelector('.hc-jfold__chevron');
  if (chev) chev.style.transform = 'rotate(' + (180 * amount).toFixed(1) + 'deg)';

  const helpers = win.HC.screens && win.HC.screens.journalHelpers;
  if (helpers && helpers.setFold) helpers.setFold(key, open);
}

/* --- the navigation ------------------------------------------------------- */

/* The round button in the corner and the full screen list behind it, held
   `amount` open.

   THIS IS HOW THE APP IS GOT AROUND NOW, and it is why it is in the video at
   all. The tab bar is still in there, and a phone can have it back from Your
   account, but the button is what ships: see navStyle in js/store.js. A video
   that cut between screens without ever showing the thing you press to change
   screens would be teaching the wrong app.

   Opened by tapping the app's own button, because the list is built at the
   moment of the tap rather than sitting in the document waiting. Setting the
   attribute by hand gets an empty overlay. The tap is a toggle, which is the
   one thing the header of this file says never to do, so it is gated on the
   state the app itself publishes: ask for open twice and the second ask does
   nothing.

   The fade is then taken off the app and done here, frame by frame, for the
   reason every other movement is: the CSS transition that would have run it
   has been switched off, and a layer that is either fully there or fully gone
   is a cut rather than a navigation. */
export function setMenu(win, amount) {
  const app = win.document.getElementById('app');
  if (!app) return;

  const want = amount > 0.002;
  const open = app.getAttribute('data-navmenu') === 'open';
  if (want !== open) {
    const fab = win.document.getElementById('hc-navfab');
    if (fab) fab.click();
  }

  const menu = win.document.querySelector('.hc-navmenu');
  if (menu) menu.style.opacity = want ? String(Math.min(1, amount)) : '';
}

/* The line in that list for a given screen, so a tap can land on the word
   somebody would actually have pressed. The links carry the same data-action
   and data-id the tab tiles carried, so this matches on the route's name. */
export function menuLink(route) {
  return '.hc-navmenu__link[data-id="' + route + '"], ' +
         '.hc-navmenu__link[data-action="tab"][data-id="' + route + '"]';
}

/* --- the calendar --------------------------------------------------------- */

/* Which month the grid is showing. Stated as an offset from the month the
   render is running in, so the scene says "next month" and gets next month
   whenever it is made.

   Walks there a tap at a time through the app's own stepper rather than
   reaching into the screen's state, which is both the honest way and the only
   way: `view` is a variable inside js/screens/cal.js and nothing exposes it.
   Bounded, because a loop that taps a button until a label matches is one
   typo away from spinning forever. */
export function setCalMonth(win, offset) {
  const target = new Date();
  target.setDate(1);
  target.setMonth(target.getMonth() + offset);
  const wantMonth = target.toLocaleString('en-US', { month: 'long' });
  const wantYear = String(target.getFullYear());

  for (let guard = 0; guard < 24; guard++) {
    const labels = win.document.querySelectorAll('.hc-cal__stepper-label');
    if (labels.length < 2) return;

    const month = labels[0].textContent.trim();
    const year = labels[1].textContent.trim();
    if (month === wantMonth && year === wantYear) return;

    const showing = new Date(month + ' 1, ' + year);
    const step = showing < target ? '1' : '-1';
    const btn = win.document.querySelector('[data-action="cal-step"][data-id="month:' + step + '"]');
    if (!btn) return;
    btn.click();
  }
}

/* The nth day of the showing month that has something on it, open. Only days
   with an event are buttons, so counting the buttons counts the dots.

   `nth` of -1 closes whatever is open. Stated rather than toggled, as
   everything here is: aria-pressed is the app's own answer to "is this one
   showing", so asking for the day already open costs nothing. */
export function setCalDay(win, nth) {
  const days = Array.prototype.slice.call(
    win.document.querySelectorAll('[data-action="cal-day"]')
  );
  const open = days.filter((d) => d.getAttribute('aria-pressed') === 'true');
  const want = nth < 0 ? null : days[nth];

  if (!want) {
    const close = win.document.querySelector('[data-action="cal-day-close"]');
    if (open.length && close) close.click();
    return;
  }
  if (want.getAttribute('aria-pressed') === 'true') return;
  want.click();
}

/* --- where things are ----------------------------------------------------- */

/* How far down the scroller something sits, in the scroller's own coordinates.

   Scenes scroll to answers from this rather than to numbers typed into the
   timeline, and that is not tidiness. The app's content changes every Sunday:
   a guide with a longer overview moves every section under it, and a hardcoded
   1240 that framed the discussion questions in August frames the middle of a
   paragraph in September. Nobody would notice until the video was on the store
   page. Asked this way, the scene says what it wants to look at and the number
   comes from the page that is actually on screen. */
export function anchorTop(win, selector) {
  const doc = win.document;
  const el = doc.querySelector(selector);
  const sc = doc.getElementById('hc-scroll');
  if (!el || !sc) return 0;
  return Math.round(el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop);
}

export function maxScroll(win) {
  const el = win.document.getElementById('hc-scroll');
  if (!el) return 0;
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/* --- the thumb ------------------------------------------------------------ */

/* A ring where a finger landed, drawn over the app for a few frames.

   IT LIVES INSIDE THE IFRAME rather than in the React layer above it, because
   the only honest place to put it is on top of the thing that was tapped, and
   only the app knows where that is: the checkbox it belongs to has moved with
   every scroll of the scene. Asking the element for its rectangle costs one
   line here and saves a set of hand-typed coordinates that would be wrong the
   first week a guide runs long.

   `progress` is 0 to 1 across the life of one tap. Off screen at either end. */
export function tapPulse(win, selector, progress) {
  const doc = win.document;
  let ring = doc.getElementById('hc-video-tap');
  if (!ring) {
    ring = doc.createElement('div');
    ring.id = 'hc-video-tap';
    ring.style.cssText = [
      'position:fixed', 'z-index:200', 'pointer-events:none',
      'width:76px', 'height:76px', 'margin:-38px 0 0 -38px', 'border-radius:999px',
      'border:1.5px solid rgba(196,181,162,0.85)',
      'background:radial-gradient(circle, rgba(196,181,162,0.22) 0%, rgba(196,181,162,0) 70%)',
      'opacity:0', 'left:-999px', 'top:-999px'
    ].join(';');
    doc.body.appendChild(ring);
  }

  if (!(progress > 0 && progress < 1)) {
    ring.style.opacity = '0';
    return;
  }

  const el = doc.querySelector(selector);
  if (!el) { ring.style.opacity = '0'; return; }
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.bottom < 0 || r.top > win.innerHeight) { ring.style.opacity = '0'; return; }

  ring.style.left = (r.left + r.width / 2) + 'px';
  ring.style.top = (r.top + r.height / 2) + 'px';
  /* Out from under the finger and gone: opens fast, keeps going, fades the
     whole way. The same shape as the ripple the app's own buttons draw. */
  ring.style.transform = 'scale(' + (0.35 + progress * 0.85).toFixed(3) + ')';
  ring.style.opacity = (1 - progress).toFixed(3);
}

/* CSS attribute selectors need their quotes and backslashes escaped. Every id
   in this app is a slug, so this never fires, and it costs one line to make
   that not matter. */
function cssq(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

/* The note is written here rather than by somebody typing, so there is
   nothing in it to escape. It goes through this anyway, because the one
   place in this folder that puts a string into innerHTML is the one place
   worth not having to think about again. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
