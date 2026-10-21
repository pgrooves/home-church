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
   to find first. The three after it are the tour, and Give is last because
   that is where a tour of a church ends.

   NOTHING IN HERE IS ABOUT RUNNING A GROUP, and that is a decision rather
   than an oversight. The guide's best known half is the discussion questions,
   with a checkbox on each one and an eyebrow reading FOR THE GROUP, and the
   Group tab that makes them worth having is not in the first launch. Selling
   a group night to somebody downloading the app on day one is selling them
   something that needs seven other people and a Thursday. So the guide is
   shown the way one person uses it on a Tuesday: the message written down,
   the questions to sit with on your own, the lines worth keeping, and every
   passage that was read. The discussion questions are still on the screen,
   because they are in the app, they are just not what the words point at.

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
  setCalMonth, setCalDay, setMenu, menuLink,
  anchorTop, maxScroll, tapPulse
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

/* How long the caption holds, in frames, the same at every scene length.

   TWO SETS, because a scene arrived at through the navigation spends its
   first twenty frames under a full screen list and the caption cannot start
   until that has cleared, where a scene that simply carries on from the one
   before can start straight away.

   THE HOLD IS THE SENTENCE'S, not the title's. A page name is read in a
   glance; eight words under it are not, and the first cut of this gave them
   under a second, which at this size is a sentence somebody notices and then
   misses. The sentences came down to about seven words each at the same time,
   because a caption that needs three seconds is a caption that is too long
   for a video. */
const CAP_NAV = { in: 22, out: 82 };
const CAP_ON = { in: 8, out: 68 };

/* How far the page goes back while its name is over it. 0.62 left too much
   of the screen competing with the sentence, which on a calendar grid is
   thirty numbers behind eight words. Far enough back to read the caption,
   near enough to see it is a real screen under there. */
const DIM = 0.74;

/* The window a scene's movement is laid out in: from a little before the
   caption clears, so the veil lifts on something already moving, to just
   short of the cut. `at(p)` turns a fraction of the scene into a frame. */
function moves(frames) {
  const from = CAP_NAV.out - 8;   /* the later of the two, so one window fits both */
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
      sub: 'This week, the moment you open it.' },
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
      sub: 'Everything coming up, and a reminder.' },
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
      sub: 'Every message, with its notes.' },
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
    /* A tap on a row, which pushes the reader. Not the navigation, and not
       nothing either: the screen really does change. A short dip covers the
       push the way the app's own view transition would. */
    leave: 'cut',
    frames,
    tab: { index: TAB.guide, lit: 1 },
    caption:
      { eyebrow: 'Every Sunday', line: 'Guides',
      sub: 'Every message, written down and kept.' },
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
    arrive: 'cut',
    frames,
    tab: { index: TAB.guide, lit: 0 },   /* a guide is a pushed view, not a tab */
    caption:
      { eyebrow: 'Short summary', line: 'Overview',
      sub: "What Sunday's message actually said." },
    act(win, t, ctx) {
      setRoute(win, { name: 'guide-reader', id: ctx.guideId });

      /* THE OVERVIEW IS ALREADY OUT when a guide opens, and it is left that
         way. An earlier cut shut it on the first frame to get to the
         discussion questions faster, which was the right move for a video
         about a group night and the wrong one for this. On the first day of
         an app the person downloading it is on their own: what they want to
         know is that Sunday's message is written down and they can read it
         back on Tuesday. That is this section and the one under it. */
      setSection(win, 'short-summary', 1);
      setSection(win, 'full-summary', ramp(t, at(0.44), at(0.58), 0, 1, 'settle'));

      const overview = Math.max(0, anchorTop(win, '[data-section="short-summary"]') - 110);
      const summary = Math.max(0, anchorTop(win, '[data-section="full-summary"]') - 110);

      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.08), v: 0 },
        { f: at(0.26), v: overview, ease: 'flick' },   /* into the prose */
        { f: at(0.40), v: overview + 190 },
        { f: at(0.62), v: summary, ease: 'flick' },
        { f: at(0.78), v: summary },
        { f: at(1.00), v: summary + 240, ease: 'flick' }
      ]));

      tapPulse(win, '[data-section="full-summary"] .hc-section__chevron', (t - at(0.42)) / 26);
    }
  };
};

/* Three. The rest of what is in there, and the half of it a person reading on
   their own gets the most out of: questions to sit with, the lines worth
   keeping, and every passage that was read from the stage. Long cut only. */

const guideMore = (frames) => {
  const at = moves(frames);
  return {
    id: 'guideMore',
    navRoute: 'guide',
    frames,
    tab: { index: TAB.guide, lit: 0 },
    caption:
      { eyebrow: 'Take home', line: 'Self-Reflection Questions',
      sub: 'Questions to sit with, and every verse.' },
    act(win, t, ctx) {
      setRoute(win, { name: 'guide-reader', id: ctx.guideId });

      /* IT CARRIES ON FROM THE SCENE BEFORE RATHER THAN CUTTING TO A NEW
         ARRANGEMENT. Both summaries are still open, because that is where the
         last scene left this screen, and the first thing that happens here is
         folding them away, on camera, with the chevrons turning over. Setting
         them shut on the first frame instead made the whole page jump the
         moment the caption came up, which read as a cut to somewhere else on
         a screen nobody had left. */
      const shut = ramp(t, at(0.02), at(0.16), 1, 0, 'settle');
      setSection(win, 'short-summary', shut);
      setSection(win, 'full-summary', shut);
      setSection(win, 'reflection', ramp(t, at(0.24), at(0.38), 0, 1, 'settle'));
      setSection(win, 'oneliners', ramp(t, at(0.54), at(0.66), 0, 1, 'settle'));
      setSection(win, 'scripture', ramp(t, at(0.80), at(0.90), 0, 1, 'settle'));

      /* Follows whichever section is opening. Each one is measured after the
         states above are applied, so the number is where the heading actually
         is on this frame rather than where it was before the one above it
         unfolded. The fold is watched from the top of the first summary,
         which is the one thing on the page that does not move while the two
         below it collapse. */
      const top = (id) => Math.max(0, anchorTop(win, '[data-section="' + id + '"]') - 120);
      setScroll(win, track(t, [
        { f: at(0.00), v: top('short-summary') },
        { f: at(0.18), v: top('short-summary') },
        { f: at(0.28), v: top('reflection'), ease: 'flick' },
        { f: at(0.50), v: top('reflection') },
        { f: at(0.60), v: top('oneliners'), ease: 'flick' },
        { f: at(0.76), v: top('oneliners') },
        { f: at(0.86), v: top('scripture'), ease: 'flick' },
        { f: at(1.00), v: top('scripture') }
      ]));

      tapPulse(win, '[data-section="short-summary"] .hc-section__chevron', (t - at(0.00)) / 26);
      if (t > at(0.46)) tapPulse(win, '[data-section="oneliners"] .hc-section__chevron', (t - at(0.52)) / 26);
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
      sub: "Sunday's songs, all week long." },
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
      sub: 'Find a group, join a team.' },
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
      sub: 'One button, and what it pays for.' },
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

/* 54 + 228 + 264 + 204 + 168 + 348 + 342 + 180 + 180 + 156 + 96 = 2220 frames,
   74.0 seconds, which is the length the church asked for.

   Everything before the Guide is tighter than it was, because the first pass
   at this length dragged: Home, Cal and Listen are each about two seconds
   shorter and have the same number of beats in them. The Guide keeps 840
   frames, which is more than a third of the piece and still the point of it.
   Worship, Connect and Give follow it and close the tour. */
export const FULL = [
  home(228),
  cal(264),
  listen(204),
  guideIndex(168),
  guideReader(348),
  guideMore(342),
  worship(180),
  connect(180),
  give(156)
];

/* The store cut cannot hold nine pages in thirty seconds, so it is the four
   the church leads with: Home, Cal, Listen, and the Guide, which is still the
   longest thing in it. Worship, Connect and Give are in the long cut. */
export const APP_STORE = [
  home(150),
  cal(156),
  listen(144),
  guideReader(318)
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
      /* HOW THIS SCENE IS ARRIVED AT AND LEFT, and the answer is not always
         the navigation.

         Three of the scenes are the same page: the guide index, the
         discussion questions and the take-home sections are one screen and
         two of its parts. Opening the navigation between them says a thumb
         went somewhere, and then it does not go anywhere, which is a lie
         small enough to be confusing rather than wrong. So the list only
         comes up where the destination actually changes.

         Inside the guide, one of the two hand-overs is a tap on a row in the
         index, which pushes the reader and is a cut; the other is the same
         screen carrying on down itself, which is not a cut at all. A scene
         can name either; where it does not, same page means carry on and a
         different page means the navigation. */
      arrive: i === 0 ? 'card'
        : scene.arrive || (scenes[i - 1].navRoute === scene.navRoute ? 'on' : 'nav'),
      leave: i === scenes.length - 1 ? 'card'
        : scene.leave || (scenes[i + 1].navRoute === scene.navRoute ? 'on' : 'nav'),
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

  const leaving = scene.leave === 'nav'
    ? ramp(t, scene.frames - MENU_OUT, scene.frames - 10, 0, 1, 'settle')
    : 0;
  const arriving = scene.arrive === 'nav' ? ramp(t, 3, MENU_IN, 1, 0, 'settle') : 0;
  setMenu(win, Math.max(leaving, arriving));

  /* The button, pressed, and then the word in the list. Both are rings over
     the real control rather than a cursor, which is the same thing every
     other tap in this piece draws. */
  if (scene.leave === 'nav') {
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
  const onPage = scene.arrive === 'on' || scene.arrive === 'cut';
  const { in: capIn, out: capOut } = onPage ? CAP_ON : CAP_NAV;

  /* THE VEIL ONLY EXISTS FOR THE CAPTION NOW, except at the two ends.

     A scene arrived at through the navigation spends its first twenty frames
     under a full screen list, and a veil underneath that is two dimmers in
     series: the app went almost black at every change of screen in the first
     cut of this. A scene that carries on from the one before has nothing to
     cover at all and should not dip, because a dip between the discussion
     questions and the reflection questions reads as a change of screen on a
     screen that never changed. Only the first scene takes a hand-over from
     the opening card, and only the last hands over to the closing one. */
  const up = scene.arrive === 'card' ? 0.86 : scene.arrive === 'cut' ? 0.9 : 0;
  const down = scene.leave === 'card' ? 0.97 : scene.leave === 'cut' ? 0.9 : 0;
  const dip = scene.leave === 'card' ? 12 : scene.leave === 'cut' ? 10 : 0;

  const veil = track(t, [
    { f: 0, v: up },
    { f: scene.arrive === 'nav' ? 16 : 0, v: up },
    { f: scene.arrive === 'nav' ? 30 : 10, v: DIM, ease: 'settle' },
    { f: capOut, v: DIM },
    { f: capOut + 22, v: 0, ease: 'settle' },
    { f: scene.frames - dip, v: 0 },
    { f: scene.frames, v: down, ease: 'settle' }
  ]);

  const text = Math.min(
    ramp(t, capIn, capIn + 16, 0, 1, 'lift'),
    ramp(t, capOut - 6, capOut + 16, 1, 0, 'settle')
  );

  return { ...scene.caption, veil, text, rise: ramp(t, capIn, capIn + 20, 10, 0, 'lift') };
}
