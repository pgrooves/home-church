/* ===========================================================================
   The timeline.

   PHASE ONE. The church is launching the app in stages, and this cut shows
   only what is in the first one: the five tabs, Home, Cal, Connect, Listen and
   Guide, and nothing behind the ••• sheet. The group room, Leader mode and the
   journal were all in the previous version of this video and are all out of
   this one. They are features of a later phase, and a store page that shows
   them is a store page making a promise the download does not keep.

   The run is Home, Cal, Listen, the Guide, then Worship, Connect and Give.
   The Guide is more than a third of the running time and gets three scenes of
   its own, which is the brief: it is the thing the church most wants somebody
   to find first, so it gets the index, the reader, and the half of a guide
   people do not discover on their own. The three after it are the tour, and
   Give is last because that is where a tour of a church ends.

   TWO CUTS OUT OF ONE SET OF SCENES. `FULL` is a minute and fourteen seconds,
   which is the length the church asked for, and it is what goes on the website.
   `APP_STORE` is the same five beats in the same order inside Apple's ceiling:
   an app preview has to come in between fifteen and thirty seconds and there is
   no arguing with the upload form.

   Every scene below is a function of its own length. The beats are laid out as
   fractions of the time the scene has, so the same choreography plays at both
   lengths and there is one description of what happens rather than two that
   drift. Caption timing is absolute, because reading speed does not scale.

   EVERY CAPTION IS THE APP'S OWN WORDS. The line is the name of the page or
   the section being shown, as the app writes it, and the eyebrow above it is
   that screen's own eyebrow. Nothing in here is a slogan about the app: an
   earlier version had lines like "all the way back to 2024" over Listen, and
   a caption that advertises a page is a caption telling somebody what to
   think about a screen they can see for themselves. Naming it does more, and
   it means the words on the card and the words on the glass agree.

   Read the header of drive.js before changing a number: every line in here has
   to describe a position at a frame rather than a step to take, or the render
   comes apart.
   =========================================================================== */

import { track, ramp } from './timing';
import {
  setRoute, setScroll, setTab, setSection, setEpisode,
  setChecked, pressCheck, setCalMonth, setCalDay,
  setMenu, menuLink, anchorTop, maxScroll, tapPulse
} from './drive';

export const FPS = 30;

/* Where each tab sits in the bar, for the lit tile. js/app.js's TAB_META in
   its own order. */
const TAB = { home: 0, cal: 1, connect: 2, listen: 3, guide: 4, more: 5 };

/* The cards at either end. Neither is app footage, so the veil over them is
   opaque and the app underneath is free to sit wherever the nearest scene
   wants it. */
export const OPEN_FRAMES = 54;
export const CLOSE_FRAMES = 96;

/* How long the caption holds, in frames, the same at every scene length. The
   veil is gone 26 frames after this and starts closing 12 before the end, so
   anything shorter than about 130 frames is a caption with a glimpse of app
   after it. */
const CAP = { in: 22, out: 56 };

/* The window a scene's movement is laid out in: from a little before the
   caption clears, so the veil lifts on something already moving, to just
   short of the cut. `at(p)` turns a fraction of the scene into a frame. */
function moves(frames) {
  const from = CAP.out - 8;
  const to = frames - 6;
  return (p) => Math.round(from + (to - from) * p);
}

/* --------------------------------------------------------------------------
   Home. The noticeboard first, which is what somebody opens the app on a
   Tuesday to see, then down past the service times to this week's message.
   -------------------------------------------------------------------------- */

const home = (frames) => {
  const at = moves(frames);
  return {
    id: 'home',
    navRoute: 'home',
    frames,
    tab: { index: TAB.home, lit: 1 },
    caption:
      { eyebrow: 'Home Church, Metairie', line: 'Home',
      sub: 'What is going on this week, the moment you open the app.' },
    cap: CAP,
    act(win, t) {
      setRoute(win, { name: 'home' });

      /* Each notice brought up in turn, with a beat on each one to read it.
         Measured off the cards themselves rather than typed in, because the
         church publishes these and three this week is four next week. */
      const cards = win.document.querySelectorAll('.hc-banner');
      const card = (n) => {
        const el = cards[Math.min(n, cards.length - 1)];
        if (!el) return 0;
        const sc = win.document.getElementById('hc-scroll');
        return Math.max(0, Math.round(
          el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop
        ) - 150);
      };

      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.12), v: 0 },
        { f: at(0.30), v: card(1), ease: 'flick' },
        { f: at(0.44), v: card(1) },
        { f: at(0.60), v: card(2), ease: 'flick' },
        { f: at(0.74), v: card(2) },
        { f: at(0.94), v: Math.round(maxScroll(win) * 0.58), ease: 'flick' },
        { f: at(1.00), v: Math.round(maxScroll(win) * 0.58) }
      ]));
    }
  };
};

/* --------------------------------------------------------------------------
   Cal. A dot on a day, the day opened, then forward a month and the same
   again, then down to the list of everything coming.
   -------------------------------------------------------------------------- */

const cal = (frames) => {
  const at = moves(frames);
  return {
    id: 'cal',
    navRoute: 'cal',
    frames,
    tab: { index: TAB.cal, lit: 1 },
    caption:
      { eyebrow: 'Every date in one place', line: 'Calendar',
      sub: 'Every service, class and gathering, and a reminder if you want one.' },
    cap: CAP,
    act(win, t) {
      setRoute(win, { name: 'cal' });

      /* This month, then next, and the grid has to be on screen when it
         changes or the step is a beat nobody sees. So the order is: open a
         day, read it, shut it and come back to the top, step the month in
         full view, open a day on the other side, then down to the list.

         The month is stated as an offset rather than a name, so the scene
         says "next month" and gets next month whenever it is rendered. */
      /* TWO DAYS IN THIS MONTH, not one in this month and one in the next.
         The step across the month boundary was in an earlier cut and it read
         well, right up until the church's real calendar went in: everything
         they have published is in the month the render runs in, so stepping
         forward showed a grid with nothing on it and a scene about an empty
         November. It steps when there is something to step to; counting the
         dots is how it knows. */
      setCalMonth(win, 0);
      const dots = win.document.querySelectorAll('[data-action="cal-day"]').length;
      const other = dots > 1 ? dots - 1 : 0;
      setCalDay(
        win,
        t < at(0.16) ? -1 : t < at(0.42) ? 0 : t < at(0.54) ? -1 : other
      );

      const panel = anchorTop(win, '.hc-cal__panel');
      const upcoming = Math.round(maxScroll(win) * 0.72);

      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.18), v: 0 },
        { f: at(0.28), v: Math.max(0, panel - 320), ease: 'flick' },
        { f: at(0.40), v: Math.max(0, panel - 320) },
        { f: at(0.48), v: 0, ease: 'flick' },     /* grid in full view to step */
        { f: at(0.62), v: 0 },
        { f: at(0.72), v: Math.max(0, panel - 320), ease: 'flick' },
        { f: at(0.82), v: Math.max(0, panel - 320) },
        { f: at(0.94), v: upcoming, ease: 'flick' },
        { f: at(1.00), v: upcoming }
      ]));

      tapPulse(win, '[data-action="cal-day"][aria-pressed="true"]', (t - at(0.14)) / 26);
      if (t >= at(0.56)) {
        tapPulse(win, '[data-action="cal-day"][aria-pressed="true"]', (t - at(0.60)) / 26);
      }
    }
  };
};

/* --------------------------------------------------------------------------
   Listen. Past this week's message into the back catalogue, then one row
   opened to show every sermon carries its notes.
   -------------------------------------------------------------------------- */

const listen = (frames) => {
  const at = moves(frames);
  return {
    id: 'listen',
    navRoute: 'listen',
    frames,
    tab: { index: TAB.listen, lit: 1 },
    caption:
      { eyebrow: 'Wherever you listen', line: 'Listen',
      sub: 'Every message we have preached, with the notes that came with it.' },
    cap: CAP,
    act(win, t) {
      setRoute(win, { name: 'listen' });

      const rows = anchorTop(win, '.hc-sermon');
      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.14), v: 0 },
        { f: at(0.40), v: Math.max(0, rows - 190), ease: 'flick' },
        { f: at(0.64), v: Math.max(0, rows - 190) },
        { f: at(0.80), v: Math.max(0, rows - 120), ease: 'flick' },
        { f: at(1.00), v: Math.max(0, rows - 120) }
      ]));

      setEpisode(win, 0, ramp(t, at(0.66), at(0.86), 0, 1, 'settle'));
      tapPulse(win, '.hc-sermon .hc-sermon__chevron', (t - at(0.64)) / 26);
    }
  };
};

/* --------------------------------------------------------------------------
   The Guide, in three scenes and half the running time.

   One. The index: every Sunday the church has written up, this week at the
   top, all of it on the phone.
   -------------------------------------------------------------------------- */

const guideIndex = (frames) => {
  const at = moves(frames);
  return {
    id: 'guideIndex',
    navRoute: 'guide',
    frames,
    tab: { index: TAB.guide, lit: 1 },
    caption:
      { eyebrow: 'For your group', line: 'Guides',
      sub: 'Every Sunday written up for your group, saved on your phone.' },
    cap: CAP,
    act(win, t) {
      setRoute(win, { name: 'guide' });

      /* THE SHORTEST SCENE IN THE PIECE, and it has to be. Three Sundays
         published so far is three rows and an intro, which fits on the glass
         with room to spare: there is nothing here to scroll, and six seconds
         of a screen that cannot move is six seconds of a still photograph.
         What it is for is the sentence at the top, which says every guide is
         the same six parts in the same order, and the tap that opens one.

         It gets longer on its own as the church publishes. maxScroll is
         whatever the list happens to need, so a year from now this scene is
         a scroll down a year of Sundays without anybody editing it. */
      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.24), v: 0 },
        { f: at(0.80), v: maxScroll(win), ease: 'flick' },
        { f: at(1.00), v: maxScroll(win) }
      ]));

      /* The tap that opens this week's, which the next scene cuts to. */
      tapPulse(win, '.hc-guide-row', (t - at(0.62)) / 26);
    }
  };
};

/* Two. The reader, and the part of it a group actually works through. The
   ticks go through the app's own handler, so the line above them repaints
   itself from "18 in all" to "1 of 18 covered" as they land. */

const guideReader = (frames) => {
  const at = moves(frames);
  return {
    id: 'guideReader',
    navRoute: 'guide',
    frames,
    tab: { index: TAB.guide, lit: 0 },   /* a guide is a pushed view, not a tab */
    caption:
      { eyebrow: 'For the group', line: 'Discussion Questions',
      sub: 'What to talk about on Thursday, ticked off as your group goes.' },
    cap: CAP,
    act(win, t, ctx) {
      setRoute(win, { name: 'guide-reader', id: ctx.guideId });

      /* Shut from the first frame rather than folded on camera. A guide opens
         with its overview out, which is right on a phone and is a thousand
         pixels of prose here. What shutting it buys is the six sections in
         view under the caption, which is the shape of every guide this church
         publishes and the thing worth looking at. */
      setSection(win, 'short-summary', 0);
      setSection(win, 'group', ramp(t, at(0.16), at(0.36), 0, 1, 'settle'));

      /* Measured after the section has been put where this frame wants it, so
         the questions are found where they actually are. */
      const questions = anchorTop(win, '[data-section="group"] .hc-qgroup');
      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.06), v: 0 },
        { f: at(0.14), v: 70, ease: 'flick' },
        { f: at(0.38), v: 70 },
        { f: at(0.56), v: Math.max(0, questions - 150), ease: 'flick' },
        { f: at(1.00), v: Math.max(0, questions - 150) }
      ]));

      setChecked(win, ctx.guideId, '0-0', t >= at(0.70));
      setChecked(win, ctx.guideId, '0-1', t >= at(0.86));

      /* The tick lands a touch large and settles, which is the app's own press
         state held for a dozen frames rather than for as long as a thumb is. */
      pressCheck(win, '0-0', 1 + 0.22 * ramp(t, at(0.70), at(0.70) + 14, 1, 0, 'flick'));
      pressCheck(win, '0-1', 1 + 0.22 * ramp(t, at(0.86), at(0.86) + 14, 1, 0, 'flick'));
      tapPulse(win, '[data-check-key="0-0"] .hc-check__box', (t - at(0.70) + 2) / 26);
      if (t >= at(0.84)) tapPulse(win, '[data-check-key="0-1"] .hc-check__box', (t - at(0.86) + 2) / 26);
    }
  };
};

/* Three. The half of a guide nobody finds on their own: the questions to take
   home, the lines worth repeating, and every passage that was read from the
   stage. Long cut only. */

const guideMore = (frames) => {
  const at = moves(frames);
  return {
    id: 'guideMore',
    navRoute: 'guide',
    frames,
    tab: { index: TAB.guide, lit: 0 },
    caption:
      { eyebrow: 'Take home', line: 'Self-Reflection Questions',
      sub: 'Questions to sit with on your own, the lines worth keeping, every verse.' },
    cap: CAP,
    act(win, t, ctx) {
      setRoute(win, { name: 'guide-reader', id: ctx.guideId });

      setSection(win, 'short-summary', 0);
      setSection(win, 'group', 0);
      setSection(win, 'reflection', ramp(t, at(0.10), at(0.26), 0, 1, 'settle'));
      setSection(win, 'oneliners', ramp(t, at(0.46), at(0.60), 0, 1, 'settle'));
      setSection(win, 'scripture', ramp(t, at(0.76), at(0.88), 0, 1, 'settle'));

      /* Follows whichever section is opening. Each one is measured after the
         states above are applied, so the number is where the heading actually
         is on this frame rather than where it was before the one above it
         unfolded. */
      const top = (id) => Math.max(0, anchorTop(win, '[data-section="' + id + '"]') - 120);
      setScroll(win, track(t, [
        { f: at(0.00), v: top('reflection') },
        { f: at(0.40), v: top('reflection') },
        { f: at(0.54), v: top('oneliners'), ease: 'flick' },
        { f: at(0.70), v: top('oneliners') },
        { f: at(0.84), v: top('scripture'), ease: 'flick' },
        { f: at(1.00), v: top('scripture') }
      ]));

      tapPulse(win, '[data-section="oneliners"] .hc-section__chevron', (t - at(0.44)) / 26);
    }
  };
};

/* --------------------------------------------------------------------------
   Worship. What the band played on Sunday, still there on Wednesday when the
   song is stuck in your head and you cannot remember what it is called.
   -------------------------------------------------------------------------- */

const worship = (frames) => {
  const at = moves(frames);
  return {
    id: 'worship',
    navRoute: 'worship',
    frames,
    tab: { index: TAB.more, lit: 1 },
    caption:
      { eyebrow: 'What we sang', line: 'Worship',
      sub: "Sunday's songs, and somewhere to hear each one again." },
    cap: CAP,
    act(win, t) {
      setRoute(win, { name: 'worship' });

      /* One long even pass rather than a flick that stops. A record on this
         screen is nearly a phone tall, so a flick shows one and a half of
         them and then sits still; a steady pan gets the set past the glass,
         which is what the scene is for. */
      const bottom = maxScroll(win);
      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.14), v: 0 },
        { f: at(0.92), v: Math.round(bottom * 0.78), ease: 'settle' },
        { f: at(1.00), v: Math.round(bottom * 0.78) }
      ]));
    }
  };
};

/* --------------------------------------------------------------------------
   Connect. How to reach a person, and the seven teams that need hands.
   -------------------------------------------------------------------------- */

const connect = (frames) => {
  const at = moves(frames);
  return {
    id: 'connect',
    navRoute: 'connect',
    frames,
    tab: { index: TAB.connect, lit: 1 },
    caption:
      { eyebrow: 'Find your people', line: 'Connect',
      sub: 'Reach a real person, find a group, join a team.' },
    cap: CAP,
    act(win, t) {
      setRoute(win, { name: 'connect' });

      const teams = anchorTop(win, '[data-section^="team-"]');
      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.12), v: 0 },
        { f: at(0.52), v: Math.max(0, teams - 210), ease: 'flick' },
        { f: at(1.00), v: Math.max(0, teams - 210) }
      ]));

      const first = win.document.querySelector('[data-section^="team-"]');
      const id = first && first.getAttribute('data-section');
      if (id) setSection(win, id, ramp(t, at(0.56), at(0.76), 0, 1, 'settle'));
      tapPulse(win, '[data-section^="team-"] .hc-section__chevron', (t - at(0.54)) / 26);
    }
  };
};

/* --------------------------------------------------------------------------
   Give, last.

   One screen: a thank you, a paragraph naming what the money actually does,
   and one button. Nothing scrolls because there is nothing below it, which is
   the right amount of screen for the thing a church is most often accused of
   making complicated. The only movement is the tap.
   -------------------------------------------------------------------------- */

const give = (frames) => {
  const at = moves(frames);
  return {
    id: 'give',
    navRoute: 'give',
    frames,
    tab: { index: TAB.more, lit: 1 },
    caption:
      { eyebrow: 'Thank you', line: 'Give',
      sub: 'One button, and the plain truth about what it pays for.' },
    cap: CAP,
    act(win, t) {
      setRoute(win, { name: 'give' });
      setScroll(win, 0);
      tapPulse(win, '.hc-screen .hc-btn--primary, .hc-screen .hc-btn', (t - at(0.52)) / 28);
    }
  };
};

/* --------------------------------------------------------------------------
   The two cuts.
   -------------------------------------------------------------------------- */

/* 54 + 234 + 270 + 210 + 108 + 378 + 354 + 186 + 186 + 144 + 96 = 2220 frames,
   74.0 seconds, which is the length the church asked for.

   Everything before the Guide is tighter than it was, because the first pass
   at this length dragged: Home, Cal and Listen are each about two seconds
   shorter and have the same number of beats in them. The Guide keeps 840
   frames, which is more than a third of the piece and still the point of it.
   Worship, Connect and Give follow it and close the tour. */
export const FULL = [
  home(234),
  cal(270),
  listen(210),
  guideIndex(108),
  guideReader(378),
  guideMore(354),
  worship(186),
  connect(186),
  give(144)
];

/* The store cut cannot hold nine pages in thirty seconds, so it is the four
   the church leads with: Home, Cal, Listen, and the Guide, which is still the
   longest thing in it. Worship, Connect and Give are in the long cut. */
export const APP_STORE = [
  home(156),
  cal(156),
  listen(132),
  guideReader(324)
];

/* The open and close cards are shorter in the store cut, which is where the
   last few frames come from: 54 + 156 + 156 + 132 + 324 + 72 = 894, 29.8
   seconds, inside Apple's thirty. */
const APP_STORE_CARDS = { open: 54, close: 72 };

export const CUTS = {
  AppStorePreview: { scenes: APP_STORE, cards: APP_STORE_CARDS },
  Marketing: { scenes: FULL, cards: { open: OPEN_FRAMES, close: CLOSE_FRAMES } }
};

/* Lay a cut out on a timeline. The lit tile travels from wherever the scene
   before left it, worked out here rather than written down twice, so a scene
   can appear in both cuts in different company and the bar still makes sense
   in each. */
export function buildTimeline(cut) {
  const { scenes, cards } = cut;
  let at = cards.open;
  let from = TAB.home;

  const placed = scenes.map((scene, i) => {
    const entry = {
      ...scene,
      start: at,
      end: at + scene.frames,
      tabFrom: from,
      tabTo: scene.tab.index,
      tabLit: scene.tab.lit,
      /* Whether this scene is arrived at and left through the navigation,
         which is every scene but the first and the last: the cards at the
         ends are not places anybody navigated to. */
      menuIn: i > 0,
      menuOut: i < scenes.length - 1,
      /* The word in the list a thumb would have pressed to get to the next
         scene. Modules and tabs both carry their route as data-id. */
      nextRoute: scenes[i + 1] ? scenes[i + 1].navRoute : null
    };
    at += scene.frames;
    from = scene.tab.index;
    return entry;
  });

  return {
    scenes: placed,
    openFrames: cards.open,
    closeFrames: cards.close,
    appEnd: at,
    total: at + cards.close
  };
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
     teleported while nobody was looking. A guide is a pushed view, so there
     the tile travels to Guide and then puts itself out, which is what the bar
     does when you open one. */
  setTab(
    win,
    ramp(t, 10, 44, scene.tabFrom, scene.tabTo, 'settle'),
    ramp(t, 22, 50, scene.tabFrom === scene.tabTo ? scene.tabLit : 1, scene.tabLit, 'settle')
  );

  scene.act(win, t, ctx);

  /* The navigation, last, because opening it rebuilds a layer over whatever
     the scene just arranged and the scene should not be arranging it back.

     Out at the end of a scene and in at the start of the next, so one tap on
     the button covers the change of screen: the list comes up over the page
     you are leaving, the route changes behind it with the new line gold, and
     it fades off the page you have arrived on. That is the cut, and it is
     also the feature. */
  const MENU_OUT = 30;   /* frames the list takes to come up at the end */
  const MENU_IN = 22;    /* and to clear at the start of the next scene */

  const leaving = scene.menuOut
    ? ramp(t, scene.frames - MENU_OUT, scene.frames - 10, 0, 1, 'settle')
    : 0;
  const arriving = scene.menuIn ? ramp(t, 3, MENU_IN, 1, 0, 'settle') : 0;
  setMenu(win, Math.max(leaving, arriving));

  /* The button, pressed, and then the word in the list. Both are rings over
     the real control rather than a cursor, which is the same thing every
     other tap in this piece draws. */
  if (scene.menuOut) {
    tapPulse(win, '#hc-navfab', (t - (scene.frames - MENU_OUT - 4)) / 26);
    if (scene.nextRoute && t > scene.frames - 16) {
      tapPulse(win, menuLink(scene.nextRoute), (t - (scene.frames - 14)) / 22);
    }
  }
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
  /* IT WAITS FOR THE NAVIGATION TO GET OUT OF THE WAY. A scene arrived at
     through the overlay spends its first twenty frames under a full screen
     list, and a veil underneath that is two dimmers in series: the first cut
     of this had the app almost black for most of a second at every change of
     screen. So on those scenes the veil starts at nothing and comes up as the
     list clears, which also means the caption fades in on the page rather
     than on the list. The first scene has no list before it and takes the
     hand-over from the opening card instead. */
  const veil = track(t, scene.menuIn ? [
    { f: 0, v: 0 },
    { f: 16, v: 0 },
    { f: 30, v: 0.62, ease: 'settle' },
    { f: capOut, v: 0.62 },
    { f: capOut + 22, v: 0, ease: 'settle' },
    { f: scene.frames - (scene.menuOut ? 0 : 12), v: 0 },
    { f: scene.frames, v: scene.menuOut ? 0 : 0.97, ease: 'settle' }
  ] : [
    { f: 0, v: 0.86 },
    { f: 10, v: 0.62, ease: 'settle' },
    { f: capOut, v: 0.62 },
    { f: capOut + 22, v: 0, ease: 'settle' },
    /* No climb at the end. The navigation coming up is what covers the change
       of screen now, and a veil underneath it would only darken the list. The
       last scene has no navigation after it, so that one still dips to meet
       the closing card. */
    { f: scene.frames - (scene.menuOut ? 0 : 12), v: 0 },
    { f: scene.frames, v: scene.menuOut ? 0 : 0.97, ease: 'settle' }
  ]);

  const text = Math.min(
    ramp(t, capIn, capIn + 16, 0, 1, 'lift'),
    ramp(t, capOut - 6, capOut + 14, 1, 0, 'settle')
  );

  return { ...scene.caption, veil, text, rise: ramp(t, capIn, capIn + 20, 10, 0, 'lift') };
}
