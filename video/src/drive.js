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
