/* ===========================================================================
   The timeline.

   Every scene below is one thing somebody at this church actually does with
   the app, and the whole piece is written for them rather than for a reviewer
   or a developer: nothing in it explains a capability, everything in it shows
   a Thursday night.

   TWO CUTS OUT OF ONE SET OF SCENES. `APP_STORE` is the one that goes on the
   store page and it is capped by Apple: an app preview has to come in between
   fifteen and thirty seconds, and there is no arguing with the upload form. At
   thirty seconds, four features done slowly beats seven done at a gallop, so
   that cut is the guide, the room, the worship set and the journal. `FULL` has
   no ceiling and carries everything, including Leader mode, Listen, Connect
   and Home, at exactly the same pace. It is the one for the website.

   The scene durations are the same in both. Adding a scene to a cut adds its
   length rather than squeezing the others, which is the only way two cuts stay
   the same piece of film.

   THE PACE. Every scene is one caption and then two or three moves, with a
   pause after each one. A screen that keeps moving is a screen nobody reads,
   and this is an app for people who are about to be handed a phone in a living
   room, not a product demo.

   Read the header of drive.js before changing a number: every line in here has
   to describe a position at a frame rather than a step to take, or the render
   comes apart.
   =========================================================================== */

import { track, ramp } from './timing';
import {
  setRoute, setScroll, setTab, setSection, setEpisode,
  setChecked, pressCheck, setViewShift, revealAnswer,
  anchorTop, maxScroll, tapPulse
} from './drive';

export const FPS = 30;

/* Where each tab sits in the bar, for the lit tile. js/app.js's TAB_META in
   its own order. Everything behind the ••• sheet, which is the room, worship
   and the journal, lights More. */
const TAB = { home: 0, cal: 1, connect: 2, listen: 3, guide: 4, more: 5 };

/* The cards at either end. Neither is app footage, so the veil over them is
   opaque and the app underneath is free to sit wherever the nearest scene
   wants it. */
export const OPEN_FRAMES = 54;
export const CLOSE_FRAMES = 84;

/* --------------------------------------------------------------------------
   The guide, 7.8 seconds.

   Sunday's message, written up before the group meets. Open the discussion
   questions, read down them, tick two off as the group covers them. The ticks
   go through the app's own handler, so the line above them repaints itself
   from "18 in all" to "1 of 18 covered" as they land.
   -------------------------------------------------------------------------- */

const guide = {
  id: 'guide',
  frames: 234,
  tab: { index: TAB.guide, lit: 0 },   /* a guide is a pushed view, not a tab */
  caption: { eyebrow: "This week's guide", line: "Sunday's message, ready for your group" },
  cap: { in: 5, out: 52 },
  act(win, t, ctx) {
    setRoute(win, { name: 'guide-reader', id: ctx.guideId });

    /* Shut from the first frame rather than folded on camera. A guide opens
       with its overview out, which is right on a phone and is a thousand
       pixels of prose here, and folding it was a beat that cost two seconds
       and taught nobody anything. What it buys is the six sections in view
       under the caption, which is the shape of every guide this church
       publishes and the thing worth looking at. */
    setSection(win, 'short-summary', 0);
    setSection(win, 'group', ramp(t, 84, 132, 0, 1, 'settle'));

    /* Measured after the section has been put where this frame wants it, so
       the questions are found where they actually are. */
    const questions = anchorTop(win, '[data-section="group"] .hc-qgroup');
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 26, v: 0 },
      { f: 76, v: 70, ease: 'flick' },      /* a thumb, reading the top of it */
      { f: 134, v: 70 },
      { f: 178, v: Math.max(0, questions - 150), ease: 'flick' },
      { f: 234, v: Math.max(0, questions - 150) }
    ]));

    setChecked(win, ctx.guideId, '0-0', t >= 188);
    setChecked(win, ctx.guideId, '0-1', t >= 212);

    /* The tick lands a touch large and settles, which is the app's own press
       state held for a dozen frames rather than for as long as a thumb is. */
    pressCheck(win, '0-0', 1 + 0.22 * ramp(t, 188, 202, 1, 0, 'flick'));
    pressCheck(win, '0-1', 1 + 0.22 * ramp(t, 212, 226, 1, 0, 'flick'));
    tapPulse(win, '[data-check-key="0-0"] .hc-check__box', (t - 186) / 24);
    if (t >= 208) tapPulse(win, '[data-check-key="0-1"] .hc-check__box', (t - 210) / 24);
  }
};

/* --------------------------------------------------------------------------
   The room, 9 seconds. The longest scene, because it is the one the whole app
   is really for.

   A host opens a room and the app hands them a six digit code to text the
   group. Everybody answers on their own phone, and nothing is visible until
   the host opens it, one at a time, as the conversation gets there. The scene
   is the three things in that order: the code, the questions, and one person's
   answer opened to the room.
   -------------------------------------------------------------------------- */

const FIRST_Q = '[data-section^="h-"]';

const DEE = '[data-action="room-open-answer"][data-id="a3"]';

const room = {
  id: 'room',
  frames: 270,
  tab: { index: TAB.more, lit: 1 },
  caption: { eyebrow: 'Thursday night', line: 'Open a room and go through it together' },
  cap: { in: 5, out: 50 },
  act(win, t) {
    setRoute(win, { name: 'group' });

    /* The first question, opened slowly. Under it: the question carried over
       from the guide, who has answered, and which of them the room has been
       shown. */
    const heads = win.document.querySelectorAll(FIRST_Q);
    const id = heads.length ? heads[0].getAttribute('data-section') : null;
    if (id) setSection(win, id, ramp(t, 136, 184, 0, 1, 'settle'));

    /* The host opens Dee's answer, and what she wrote unfolds under the two
       already open. This is the scene, and everything before it is getting
       into position for it. */
    revealAnswer(win, 'a3', t >= 200);
    tapPulse(win, DEE, (t - 198) / 26);

    /* Pinned just under the top of the question while it opens, so the answers
       unfold down into the space below rather than off the bottom, then eased
       further down after the reveal so the answer that just arrived is on
       screen rather than under the tab bar. */
    const q = anchorTop(win, FIRST_Q);
    const at = (offset) => Math.max(0, q - offset);
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 34, v: 0 },
      { f: 78, v: 44, ease: 'flick' },   /* a thumb, reading the code */
      { f: 96, v: 44 },
      { f: 148, v: at(110), ease: 'flick' },
      { f: 202, v: at(110) },
      { f: 244, v: at(-190), ease: 'flick' },
      { f: 270, v: at(-190) }
    ]));
  }
};

/* --------------------------------------------------------------------------
   Leader mode, 4.6 seconds. In the long cut only.

   One question filling the screen, for the person holding the phone in a room
   of eight. Moving to the next one is a re-render the app cannot animate with
   its transitions off, so the scene carries the old question out to the left
   and brings the next in from the right by hand, and swaps them at the moment
   the screen is empty.
   -------------------------------------------------------------------------- */

const SWIPE_AT = 96;
const SWIPE_LEN = 24;

const present = {
  id: 'present',
  frames: 138,
  tab: { index: TAB.guide, lit: 0 },
  caption: { eyebrow: 'Leading it', line: 'Big enough to read across the room' },
  cap: { in: 5, out: 46 },
  act(win, t, ctx) {
    const half = SWIPE_LEN / 2;
    const p = (t - SWIPE_AT) / SWIPE_LEN;
    const past = p >= 0.5;

    setRoute(win, { name: 'present', id: ctx.guideId, index: past ? 3 : 2 });

    if (p <= 0 || p >= 1) {
      setViewShift(win, 0, 1);
    } else if (!past) {
      const q = ramp(t, SWIPE_AT, SWIPE_AT + half, 0, 1, 'settle');
      setViewShift(win, -110 * q, 1 - q);
    } else {
      const q = ramp(t, SWIPE_AT + half, SWIPE_AT + SWIPE_LEN, 0, 1, 'lift');
      setViewShift(win, 110 * (1 - q), q);
    }

    /* Covered this one, ticked before moving on. The key belongs to whichever
       question is up, so it is read off the button rather than written here. */
    const btn = win.document.querySelector('.hc-present__check');
    const key = btn && btn.getAttribute('data-check-key');
    if (key) {
      setChecked(win, ctx.guideId, key, !past && t >= 74);
      if (!past) {
        pressCheck(win, key, 1 + 0.22 * ramp(t, 74, 88, 1, 0, 'flick'));
        tapPulse(win, '.hc-present__check .hc-check__box', (t - 72) / 24);
      }
    }
  }
};

/* --------------------------------------------------------------------------
   Worship, 5 seconds.

   What the band played on Sunday, still there on Wednesday when the song is
   stuck in your head and you cannot remember what it is called.
   -------------------------------------------------------------------------- */

const worship = {
  id: 'worship',
  frames: 126,
  tab: { index: TAB.more, lit: 1 },
  caption: { eyebrow: 'What we sang', line: "Sunday's songs, all week" },
  cap: { in: 5, out: 40 },
  act(win, t) {
    setRoute(win, { name: 'worship' });

    /* One long even pass rather than a flick that stops. A record on this
       screen is nearly a phone tall, so a flick shows one and a half of them
       and then sits still; a steady pan gets the whole set past the glass,
       which is what the scene is for. */
    const bottom = maxScroll(win);
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 62, v: 0 },
      { f: 120, v: Math.round(bottom * 0.72), ease: 'settle' },
      { f: 126, v: Math.round(bottom * 0.72) }
    ]));
  }
};

/* --------------------------------------------------------------------------
   The journal, 4.8 seconds.

   Where what you wrote in a guide ends up, along with anything you wrote on
   your own. The line under the title is the whole promise and it is the app's
   own words: nobody else can see any of it.
   -------------------------------------------------------------------------- */

const journal = {
  id: 'journal',
  frames: 126,
  tab: { index: TAB.more, lit: 1 },
  caption: { eyebrow: 'Just for you', line: 'Somewhere to put what you heard' },
  cap: { in: 5, out: 40 },
  act(win, t) {
    setRoute(win, { name: 'journal' });

    /* All the way down. Three entries is a short screen, and stopping halfway
       would leave the scene sitting on the same picture the caption was over. */
    const bottom = maxScroll(win);
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 62, v: 0 },
      { f: 116, v: bottom, ease: 'settle' },
      { f: 126, v: bottom }
    ]));
  }
};

/* --------------------------------------------------------------------------
   Listen, 4.8 seconds. Long cut only.
   -------------------------------------------------------------------------- */

const listen = {
  id: 'listen',
  frames: 144,
  tab: { index: TAB.listen, lit: 1 },
  caption: { eyebrow: 'Every message', line: 'All the way back to 2024' },
  cap: { in: 5, out: 46 },
  act(win, t) {
    setRoute(win, { name: 'listen' });

    const rows = anchorTop(win, '.hc-sermon');
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 70, v: 0 },
      { f: 116, v: Math.max(0, rows - 190), ease: 'flick' },
      { f: 144, v: Math.max(0, rows - 190) }
    ]));

    setEpisode(win, 0, ramp(t, 118, 142, 0, 1, 'settle'));
    tapPulse(win, '.hc-sermon .hc-sermon__chevron', (t - 116) / 24);
  }
};

/* --------------------------------------------------------------------------
   Connect, 4.6 seconds. Long cut only.
   -------------------------------------------------------------------------- */

const connect = {
  id: 'connect',
  frames: 138,
  tab: { index: TAB.connect, lit: 1 },
  caption: { eyebrow: 'Get involved', line: 'Find your people, and a place to serve' },
  cap: { in: 5, out: 40 },
  act(win, t) {
    setRoute(win, { name: 'connect' });

    const teams = anchorTop(win, '[data-section^="team-"]');
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 62, v: 0 },
      { f: 106, v: Math.max(0, teams - 210), ease: 'flick' },
      { f: 138, v: Math.max(0, teams - 210) }
    ]));

    const first = win.document.querySelector('[data-section^="team-"]');
    const id = first && first.getAttribute('data-section');
    if (id) setSection(win, id, ramp(t, 104, 128, 0, 1, 'settle'));
    tapPulse(win, '[data-section^="team-"] .hc-section__chevron', (t - 102) / 24);
  }
};

/* --------------------------------------------------------------------------
   Home, 4.4 seconds. Long cut only, and last in it.

   The front door: the greeting, this Sunday's times, and the address. Warmest
   screen in the app and the note to go out on.
   -------------------------------------------------------------------------- */

const home = {
  id: 'home',
  frames: 132,
  tab: { index: TAB.home, lit: 1 },
  caption: { eyebrow: 'Home Church, Metairie', line: 'Sunday, and everything before it' },
  cap: { in: 5, out: 46 },
  act(win, t) {
    setRoute(win, { name: 'home' });
    const bottom = maxScroll(win);
    setScroll(win, track(t, [
      { f: 0, v: 0 },
      { f: 72, v: 0 },
      { f: 122, v: Math.round(bottom * 0.55), ease: 'flick' },
      { f: 132, v: Math.round(bottom * 0.55) }
    ]));
  }
};

/* --------------------------------------------------------------------------
   The two cuts.
   -------------------------------------------------------------------------- */

/* 54 + 234 + 270 + 126 + 126 + 84 = 894 frames, 29.8 seconds. Apple takes an
   app preview between fifteen and thirty, so there is a fifth of a second of
   room in that and no more, and anything added here has to come off something
   else. What came off, to make the room nine seconds long, was Home, Listen,
   Connect and Leader mode. They are all in the long cut. */
export const APP_STORE = [guide, room, worship, journal];

/* No ceiling on this one. Same scenes at the same speed, plus the four the
   store page could not hold. 48.2 seconds. */
export const FULL = [guide, room, present, worship, journal, listen, connect, home];

export const CUTS = { AppStorePreview: APP_STORE, Marketing: FULL };

/* Lay a list of scenes out on a timeline. The lit tile travels from wherever
   the scene before left it, worked out here rather than written down twice, so
   a scene can appear in both cuts in different company and the bar still makes
   sense in each. */
export function buildTimeline(scenes) {
  let at = OPEN_FRAMES;
  let from = TAB.home;

  const placed = scenes.map((scene) => {
    const entry = {
      ...scene,
      start: at,
      end: at + scene.frames,
      tabFrom: from,
      tabTo: scene.tab.index,
      tabLit: scene.tab.lit
    };
    at += scene.frames;
    from = scene.tab.index;
    return entry;
  });

  return { scenes: placed, appEnd: at, total: at + CLOSE_FRAMES };
}

/* --------------------------------------------------------------------------
   One frame of the whole video, applied to the app.
   -------------------------------------------------------------------------- */

export function applyFrame(win, frame, ctx, timeline) {
  /* Before the first scene and after the last, hold the nearest one's opening
     or closing state. A card is over the top either way, and an app parked
     mid-scroll behind an opaque card is an app that does not have to start
     again when the card lifts. */
  const scenes = timeline.scenes;
  let scene = scenes[0];

  for (const s of scenes) {
    if (frame >= s.start) scene = s;
  }
  const t = Math.max(0, Math.min(scene.frames, frame - scene.start));

  /* The lit tile slides from the tab the last scene was on to this one's while
     the veil is still down, arriving as the app comes back rather than having
     teleported while nobody was looking. Guide and Leader mode are pushed
     views, so on those the tile travels and then puts itself out, which is
     what the bar does when you open a guide. */
  setTab(
    win,
    ramp(t, 10, 44, scene.tabFrom, scene.tabTo, 'settle'),
    ramp(t, 22, 50, scene.tabFrom === scene.tabTo ? scene.tabLit : 1, scene.tabLit, 'settle')
  );

  scene.act(win, t, ctx);
}

/* What the veil and the caption are doing on a given frame. Null outside the
   app footage, where the cards take over. */
export function captionAt(frame, timeline) {
  const scene = timeline.scenes.find((s) => frame >= s.start && frame < s.end);
  if (!scene) return null;

  const t = frame - scene.start;
  const { in: capIn, out: capOut } = scene.cap;

  /* Opaque for the change of screen, then down to a dim the app reads through,
     then off. Back up over the last twelve frames, which is the cut into the
     next scene: the screen behind it changes where nothing can be seen. */
  const veil = track(t, [
    { f: 0, v: 0.97 },
    { f: 14, v: 0.66, ease: 'settle' },
    { f: capOut, v: 0.66 },
    { f: capOut + 26, v: 0, ease: 'settle' },
    { f: scene.frames - 12, v: 0 },
    { f: scene.frames, v: 0.97, ease: 'settle' }
  ]);

  const text = Math.min(
    ramp(t, capIn, capIn + 16, 0, 1, 'lift'),
    ramp(t, capOut - 6, capOut + 14, 1, 0, 'settle')
  );

  return { ...scene.caption, veil, text, rise: ramp(t, capIn, capIn + 20, 10, 0, 'lift') };
}
