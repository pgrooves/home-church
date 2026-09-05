/* ===========================================================================
   The timeline.

   Twenty nine seconds at 30fps, which is the top of the range App Store
   Connect accepts for an app preview and leaves nothing on the table.

   Each scene owns a stretch of frames and one feature. `act` is called once
   per frame with the app's window and the frame number counted from the start
   of that scene, and puts the app where that frame says it should be. Read the
   header of drive.js before changing one: every line in here has to describe a
   position rather than a step, or the render comes apart.

   THE VEIL AND THE CAPTION. A scene opens with the app dimmed under a warm
   charcoal veil and one line of type over it, then the veil lifts and the app
   plays clean for the rest of the scene. Three things fall out of that, and
   all three are the reason it is built this way rather than as titles between
   the footage:

     the cut is covered   Changing screens is a re-render, and a re-render with
                          the app's transitions switched off is a hard jump. It
                          happens under an opaque veil, so nobody sees it.
     the app never stops  The scroll of a scene starts while the caption is
                          still up, so the veil lifts on something already
                          moving instead of on a still.
     the words are the    An eyebrow in tracked caps over a large light line is
     brand's own          the app's most recognisable typographic move. It is
                          on nearly every screen. The captions are that, at
                          full size.
   =========================================================================== */

import { track, ramp } from './timing';
import {
  setRoute, setScroll, setTab, setSection, setEpisode,
  setChecked, pressCheck, setViewShift, anchorTop, maxScroll, tapPulse
} from './drive';

export const FPS = 30;

/* Where each tab sits in the bar, for the lit tile. js/app.js's TAB_META, in
   its order: the tile is drawn at `index * 100%` of one tab's width. */
const TAB = { home: 0, cal: 1, connect: 2, listen: 3, guide: 4, more: 5 };

/* --------------------------------------------------------------------------
   1. The guide, 7.5 seconds. The longest scene, and the first one, because it
   is the one thing no other church app does well and the reason somebody would
   install this.

   THE ORDER OF THESE FIVE IS NOT AESTHETIC. SUBMISSION_KIT.md section 4 works
   it out for the stills and the reasoning carries: most people see the
   beginning and stop, so the differentiator goes first, and Home goes last
   because it is the weakest thing to lead with, looking like every other
   church app until you know what is behind it. The stills run guide, leader
   mode, index, listen, connect, home. This runs the same argument with the
   index dropped for time.

   Everything in it is a thing a person does on a Thursday night: fold the
   overview away, open the discussion questions, read down them, tick two off.
   The two ticks go through the app's own handler, so the count at the top of
   the section repaints itself as they land.
   -------------------------------------------------------------------------- */

const guide = {
  id: 'guide',
  frames: 225,
  /* The tile starts on Guide and puts itself out, which is what the bar does
     when a guide is opened from the index: a guide is a pushed view, not a
     tab, and nothing in the bar is current while one is on screen. */
  tab: { from: TAB.guide, to: TAB.guide, lit: 0 },
  caption: { eyebrow: 'The guide', line: 'Ready before your group meets' },
  cap: { in: 4, out: 44 },
  act(win, t, ctx) {
    setRoute(win, { name: 'guide-reader', id: ctx.guideId });

    /* The overview is open when a guide is opened, which is right on a phone
       and wrong here: it is a thousand pixels of prose between the top of the
       screen and the six sections that are the point. Folding it is the first
       thing a leader does and the first thing this scene does. */
    setSection(win, 'short-summary', ramp(t, 40, 74, 1, 0, 'settle'));
    setSection(win, 'group', ramp(t, 84, 116, 0, 1, 'settle'));

    /* Read after the sections have been put where this frame wants them, so
       the questions are measured where they actually are rather than where
       they were before the overview folded. */
    const questions = anchorTop(win, '[data-section="group"] .hc-qgroup');
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 116, v: 0 },
      { f: 152, v: Math.max(0, questions - 150), ease: 'flick' },
      { f: 196, v: Math.max(0, questions - 150) },
      { f: 225, v: Math.max(0, questions - 40), ease: 'flick' }
    ]));

    setChecked(win, ctx.guideId, '0-0', t >= 162);
    setChecked(win, ctx.guideId, '0-1', t >= 186);

    /* The tick lands a touch large and settles, which is the app's own press
       state held for four frames instead of for as long as a thumb is down. */
    pressCheck(win, '0-0', 1 + 0.22 * ramp(t, 162, 174, 1, 0, 'flick'));
    pressCheck(win, '0-1', 1 + 0.22 * ramp(t, 186, 198, 1, 0, 'flick'));
    tapPulse(win, '[data-check-key="0-0"] .hc-check__box', (t - 160) / 22);
    if (t >= 182) tapPulse(win, '[data-check-key="0-1"] .hc-check__box', (t - 184) / 22);
  }
};

/* --------------------------------------------------------------------------
   3. Leader mode, 4 seconds.

   One question filling the screen. Moving between two of them is a re-render
   the app cannot animate with its transitions off, so the scene carries the
   old one out to the left and brings the next one in from the right by hand,
   and swaps the question at the moment the screen is empty. Same movement the
   app makes on a phone, drawn from the frame number instead of the clock.
   -------------------------------------------------------------------------- */

const SWIPE_AT = 74;      /* frame the questions change over */
const SWIPE_LEN = 22;     /* how long the pass takes */

const present = {
  id: 'present',
  frames: 117,
  tab: { from: TAB.guide, to: TAB.guide, lit: 0 },
  caption: { eyebrow: 'Leader mode', line: 'Reads across a living room' },
  cap: { in: 4, out: 40 },
  act(win, t, ctx) {
    const half = SWIPE_LEN / 2;
    const p = (t - SWIPE_AT) / SWIPE_LEN;   /* 0 to 1 across the pass */
    const past = p >= 0.5;

    setRoute(win, { name: 'present', id: ctx.guideId, index: past ? 3 : 2 });

    if (p <= 0 || p >= 1) {
      setViewShift(win, 0, 1);
    } else if (!past) {
      /* Out to the left, the question that is finished. */
      const q = ramp(t, SWIPE_AT, SWIPE_AT + half, 0, 1, 'settle');
      setViewShift(win, -110 * q, 1 - q);
    } else {
      /* In from the right, the one that is next. */
      const q = ramp(t, SWIPE_AT + half, SWIPE_AT + SWIPE_LEN, 0, 1, 'lift');
      setViewShift(win, 110 * (1 - q), q);
    }

    /* Covered this one, ticked before the leader moves on. The key belongs to
       whichever question is up, so it is read off the button rather than
       written down here. */
    const btn = win.document.querySelector('.hc-present__check');
    const key = btn && btn.getAttribute('data-check-key');
    if (key) {
      setChecked(win, ctx.guideId, key, !past && t >= 52);
      if (!past) {
        pressCheck(win, key, 1 + 0.22 * ramp(t, 52, 64, 1, 0, 'flick'));
        tapPulse(win, '.hc-present__check .hc-check__box', (t - 50) / 22);
      }
    }
  }
};

/* --------------------------------------------------------------------------
   4. Listen, 4 seconds.

   Past the latest message and into the back catalogue, then one row opens to
   show that every sermon carries its notes. A hundred and two of them in the
   list, which is the fact the scene is really making.
   -------------------------------------------------------------------------- */

const listen = {
  id: 'listen',
  frames: 117,
  tab: { from: TAB.guide, to: TAB.listen, lit: 1 },
  caption: { eyebrow: 'Listen', line: 'Every message since 2024, with the notes' },
  cap: { in: 4, out: 40 },
  act(win, t) {
    setRoute(win, { name: 'listen' });

    const rows = anchorTop(win, '.hc-sermon');
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 26, v: 0 },
      { f: 76, v: Math.max(0, rows - 190), ease: 'flick' },
      { f: 117, v: Math.max(0, rows - 190) }
    ]));

    setEpisode(win, 0, ramp(t, 84, 112, 0, 1, 'settle'));
    tapPulse(win, '.hc-sermon .hc-sermon__chevron', (t - 82) / 22);
  }
};

/* --------------------------------------------------------------------------
   5. Connect, 3.5 seconds.

   The seven serve teams, and one of them opened to show that joining is a
   button and not a phone call.
   -------------------------------------------------------------------------- */

const connect = {
  id: 'connect',
  frames: 96,
  tab: { from: TAB.listen, to: TAB.connect, lit: 1 },
  caption: { eyebrow: 'Connect', line: 'Find your people, and a place to serve' },
  cap: { in: 4, out: 30 },
  act(win, t) {
    setRoute(win, { name: 'connect' });

    const teams = anchorTop(win, '[data-section^="team-"]');
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 16, v: 0 },
      { f: 58, v: Math.max(0, teams - 210), ease: 'flick' },
      { f: 96, v: Math.max(0, teams - 210) }
    ]));

    /* Opened early on purpose. The scene is the shortest one and the veil
       starts closing eight frames from its end, so a team that finishes
       unfolding at frame 94 unfolds in the dark. */
    const first = win.document.querySelector('[data-section^="team-"]');
    const id = first && first.getAttribute('data-section');
    if (id) setSection(win, id, ramp(t, 58, 80, 0, 1, 'settle'));
    tapPulse(win, '[data-section^="team-"] .hc-section__chevron', (t - 56) / 22);
  }
};

/* --------------------------------------------------------------------------
   6. Home, 5 seconds, last.

   Two flicks and a pause between them, which is how anybody reads a home
   screen: far enough to see there is more, a beat to take it in, then the
   rest. Nothing is tapped.

   Last rather than first, for the reason at the top of this file. By now the
   app has shown what it is for, and Home reads as the front door of a house
   somebody has been shown around rather than as another church app's landing
   page. It is also the warmest screen in the app, which is the note to go out
   on.
   -------------------------------------------------------------------------- */

const home = {
  id: 'home',
  frames: 147,
  tab: { from: TAB.connect, to: TAB.home, lit: 1 },
  caption: { eyebrow: 'Home Church, Metairie', line: 'Sunday, and everything before it' },
  cap: { in: 4, out: 42 },
  act(win, t) {
    setRoute(win, { name: 'home' });
    const bottom = maxScroll(win);
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 26, v: 0 },
      { f: 74, v: Math.round(bottom * 0.56), ease: 'flick' },
      { f: 92, v: Math.round(bottom * 0.56) },
      { f: 140, v: bottom, ease: 'flick' }
    ]));
  }
};

export const SCENES = [guide, present, listen, connect, home];

/* Cards top and tail the footage. Their frames are not app frames: the veil is
   opaque over both, so the app underneath is free to sit at whatever the
   nearest scene wants and nobody sees it. */
export const OPEN_FRAMES = 66;
export const CLOSE_FRAMES = 102;

/* Laid out once, so the composition, the veil and the driver all read the same
   arithmetic rather than three copies of it. */
export const TIMELINE = (() => {
  let at = OPEN_FRAMES;
  const placed = SCENES.map((scene) => {
    const entry = { ...scene, start: at, end: at + scene.frames };
    at += scene.frames;
    return entry;
  });
  return { scenes: placed, appEnd: at, total: at + CLOSE_FRAMES };
})();

export const DURATION = TIMELINE.total;

/* --------------------------------------------------------------------------
   One frame of the whole video, applied to the app.
   -------------------------------------------------------------------------- */

export function applyFrame(win, frame, ctx) {
  /* Before the first scene and after the last, hold the nearest one's opening
     or closing state. The cards are over the top either way, and an app parked
     mid-scroll behind an opaque card is an app that does not have to boot
     again when the card lifts. */
  const scenes = TIMELINE.scenes;
  let scene = scenes[0];
  let t = frame - scene.start;

  for (const s of scenes) {
    if (frame >= s.start) { scene = s; t = frame - s.start; }
  }
  t = Math.max(0, Math.min(scene.frames, t));

  /* The lit tile slides from the tab the last scene was on to this one's while
     the veil is still down, so it is arriving as the app comes back rather
     than having teleported while nobody was looking. Guide and Leader mode are
     pushed views rather than tabs, so on those the tile travels to Guide and
     then puts itself out, which is what the app does when you open a guide. */
  const tab = scene.tab;
  setTab(
    win,
    ramp(t, 8, 40, tab.from, tab.to, 'settle'),
    ramp(t, 20, 46, tab.from === tab.to ? tab.lit : 1, tab.lit, 'settle')
  );

  scene.act(win, t, ctx);
}

/* What the veil and the caption are doing on a given frame. Returns null
   outside the app footage, where the cards take over. */
export function captionAt(frame) {
  const scene = TIMELINE.scenes.find((s) => frame >= s.start && frame < s.end);
  if (!scene) return null;

  const t = frame - scene.start;
  const { in: capIn, out: capOut } = scene.cap;

  /* Opaque for the change of screen, then down to a dim the app reads through,
     then off. Back up over the last eight frames, which is the cut into the
     next scene: the screen behind it changes while nothing can be seen. */
  const veil = track(t, [
    { f: 0, v: 0.97 },
    { f: 10, v: 0.66, ease: 'settle' },
    { f: capOut, v: 0.66 },
    { f: capOut + 20, v: 0, ease: 'settle' },
    { f: scene.frames - 8, v: 0 },
    { f: scene.frames, v: 0.97, ease: 'settle' }
  ]);

  const text = Math.min(
    ramp(t, capIn, capIn + 12, 0, 1, 'lift'),
    ramp(t, capOut - 4, capOut + 12, 1, 0, 'settle')
  );

  return { ...scene.caption, veil, text, rise: ramp(t, capIn, capIn + 16, 10, 0, 'lift') };
}
