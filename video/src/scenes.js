/* ===========================================================================
   The timeline.

   PHASE ONE. The church is launching the app in stages, and this cut shows
   only what is in the first one: Home, Calendar, Listen, Guide and Connect,
   and Settings, Give, Services, Worship and Journal behind the ••• button.
   The group room and Leader mode were in an earlier version of this video and
   are out of this one. They are features of a later phase, and a store page
   that shows them is a store page making a promise the download does not keep.

   The run is Home, Calendar, Listen, the Guide, the note somebody writes in
   it, the Journal that note lands in, then Worship, Connect and Give. The
   Guide and the Journal are over half the running time, which is the brief:
   they are what the church most wants somebody to find first. The three after
   them are the tour, and Give is last because that is where a tour of a
   church ends.

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

   TWO CUTS OUT OF ONE SET OF SCENES. `FULL` is a minute and a half and it is
   what goes on the website. `APP_STORE` is four of the same beats in the same
   order inside Apple's ceiling:
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
  setSelection, setHighlightBar, setNote, setNoteSheet, setAnswer,
  setJournalFilter, setFold,
  anchorTop, maxScroll, tapPulse
} from './drive';

export const FPS = 30;

/* THE MUSIC IS 75 BPM, WHICH AT THIRTY FRAMES A SECOND IS 24 FRAMES A BEAT
   AND 96 A BAR, EXACTLY.

   That is luck, and it is the whole reason this cut is on the grid rather
   than near it. A beat that came out at 23.6 frames would drift a frame every
   three beats and a second over the piece, and the only fixes are resampling
   the music or letting the cuts wander. 75 at 30 divides.

   So every scene below is a whole number of beats and every boundary lands on
   one by construction, with nothing to round and nothing to accumulate. The
   track is staged at public/music.wav with its first 0.4307 seconds trimmed
   off, so beat one of the music is frame zero of the video. That number is
   the track's own first beat plus a correction for the AAC encoder, and the
   note over Track in Preview.jsx has the long version.

   The two numbers that actually make a cut feel scored are further down:
   MENU_OUT, which is one beat, so the full screen list reaches opacity
   exactly on the beat the page changes under it; and the dip at a scene's
   edge, which bottoms out on the boundary. Both land the hit on the beat
   rather than near it. */
export const BEAT = 24;
export const BAR = BEAT * 4;

/* Where each tab sits in the bar, for the lit tile. js/app.js's TAB_META in
   its own order. */
const TAB = { home: 0, cal: 1, connect: 2, listen: 3, guide: 4, more: 5 };

/* The cards at either end. Neither is app footage, so the veil over them is
   opaque and the app underneath is free to sit wherever the nearest scene
   wants it. */
export const OPEN_FRAMES = BAR;
export const CLOSE_FRAMES = BAR;

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

/* WHEN A SCENE STARTS MOVING, and it is the single biggest number in this
   file. Every scene used to wait 74 frames — the later of the two caption
   holds, so that one window fitted both arrivals — which across eleven
   scenes is twenty seconds of a video in which nothing moves. Getting the
   piece back down to a minute and fourteen started here, and it cost nothing
   to read: the caption still holds exactly as long as it did, the page
   underneath simply starts moving while it is still up.

   Two numbers because the two arrivals have different things to get out of
   the way. A scene reached through the navigation spends its first sixteen
   frames under a full screen list and cannot start before that has cleared.
   A scene that carries on from the one before has nothing to clear at all,
   and the screen is one the eye is already on, so it can start almost at
   once. Both are still inside the caption's hold, which is the point: the
   dim lifts on something already in motion rather than on a photograph. */
const PRE = { nav: BEAT * 2, on: BEAT };

/* The window a scene's movement is laid out in: from PRE to just short of
   the cut. `at(p)` turns a fraction of the scene into a frame. */
function moves(frames, pre = PRE.nav) {
  const to = frames - 6;
  return (p) => Math.round(pre + (to - pre) * p);
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
      sub: 'Direct links to the sermon audio.' },
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
   The Guide, in four scenes, and then the Journal it feeds.

   The order is the brief, and it is not the order the screen is in. A guide
   opens on the Overview, and an earlier cut of this read it top to bottom:
   summary, summary, questions, one-liners, scripture, done. What that missed
   is that the summary is the thing somebody reads and then does something
   with, so it belongs next to the doing rather than three minutes before it.

   So: the index, then the half of the guide that is a take-home — the
   questions to sit with, one of them answered in the box underneath it, the
   lines worth keeping — and then back up to
   the Overview, which is where the last two scenes live. A line out of it is
   highlighted, a note is written on that line, the note is saved, and the
   Journal opens with both of them filed under the sermon they came out of.

   EVERY SCENE OPENS ON THE THING ITS CAPTION NAMES, which took fixing. The
   take-home scene used to arrive the way a guide arrives, with the Overview
   out, and fold it away before it got near a question, so the words
   Self-Reflection Questions sat over a screen of summary for two seconds.
   Every section is shut from its first frame now.

   Half this stretch is somebody putting something into the app rather than
   reading what the church put there, and that is the only half of this video
   that is.

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
      sub: "A place to review Sunday's sermon notes." },
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

/* Two. What a person takes home from a guide they are reading on their own:
   the questions to sit with, a box under each one, and the lines worth
   keeping.

   IT OPENS ON THE THING IT IS ABOUT, shut. An earlier cut of this arrived
   with the Overview out — which is how a guide opens — and spent its first
   two seconds folding that away before it got anywhere near a take-home
   question, so the caption said Self-Reflection Questions over a screen of
   summary. Every section is closed from the first frame here and the heading
   the caption names is the one in the middle of the glass, so the name and
   the screen agree while the name is up. The tap comes as it clears.

   THE SCRIPTURE INDEX IS THE ONE THING THIS VIDEO USED TO SHOW AND NO LONGER
   DOES. It was the last second of this scene, a list of references unfolding
   under a screen already on its way out, and it was the cheapest second in
   the piece to spend on getting back to a minute and fourteen. The section
   is still in the app and still in the guide; it is not in the tour. */

const ANSWER_AT = 1;   /* which question gets answered: the second one */
const ANSWER_TEXT = 'Honest answer: not yet. Writing it down anyway.';

const guideTakeHome = (frames) => {
  /* Later than PRE.on, and only here: the first thing this scene does is a
     tap, and the church asked for that tap to land as the caption goes
     rather than underneath it. Four frames before the words start to fade. */
  const at = moves(frames, BEAT * 3);
  return {
    id: 'guideTakeHome',
    navRoute: 'guide',
    arrive: 'cut',
    frames,
    /* The answer is a journal entry like any other, so it is stated for the
       whole timeline rather than typed into existence here. See writes. */
    writes: { at: at(0.33), make: answerFor },
    tab: { index: TAB.guide, lit: 0 },   /* a guide is a pushed view, not a tab */
    caption:
      { eyebrow: 'Take home', line: 'Self-Reflection Questions',
      sub: 'Questions to sit with, and a box for each.' },
    act(win, t, ctx) {
      setRoute(win, { name: 'guide-reader', id: ctx.guideId });

      setSection(win, 'short-summary', 0);
      setSection(win, 'full-summary', 0);
      setSection(win, 'scripture', 0);
      setSection(win, 'reflection', ramp(t, at(0.03), at(0.14), 0, 1, 'settle'));
      setSection(win, 'oneliners', ramp(t, at(0.76), at(0.86), 0, 1, 'settle'));

      /* THE ANSWER FINISHES WELL BEFORE THE SCROLL MOVES ON. Saved on this
         phone only appears on the last letter, and the first cut of this gave
         it seven frames before the flick to the one-liners took it off the
         glass — the save notice is half the point of the box. */
      const answer = answerFor(win, ctx);
      setAnswer(win, answer.index, ANSWER_TEXT,
        ramp(t, at(0.33), at(0.52), 0, ANSWER_TEXT.length, 'linear'));

      /* Every number is measured after the states above are applied, so it is
         where the heading actually is on this frame rather than where it was
         before the one above it unfolded. The box is anchored on itself: a
         question that runs to four lines next week puts it somewhere else,
         and this follows it there. */
      const top = (id) => Math.max(0, anchorTop(win, '[data-section="' + id + '"]') - 120);
      const box = Math.max(0, anchorTop(win, '[data-journal-key="' + answer.index + '"]') - 330);
      setScroll(win, track(t, [
        { f: at(0.00), v: top('reflection') },
        { f: at(0.14), v: top('reflection') },
        { f: at(0.22), v: top('reflection') + 240, ease: 'flick' },   /* down the questions */
        { f: at(0.30), v: box, ease: 'flick' },
        { f: at(0.80), v: box },
        { f: at(0.88), v: top('oneliners'), ease: 'flick' },
        { f: at(1.00), v: top('oneliners') + 200 }
      ]));

      tapPulse(win, '[data-section="reflection"] .hc-section__chevron', (t - at(0.01)) / 26);
      if (t > at(0.70)) {
        tapPulse(win, '[data-section="oneliners"] .hc-section__chevron', (t - at(0.76)) / 26);
      }
    }
  };
};

/* The answer, and the question it belongs under, worked out from the guide
   rather than typed in here — same reason as noteFor below. The index is
   clamped, because a short week is a guide with fewer questions in it and the
   second one is not guaranteed to exist. */
function answerFor(win, ctx) {
  const guide = win.HC.data.getGuide(ctx.guideId);
  const questions = (guide && guide.reflectionQuestions) || [];
  const index = Math.max(0, Math.min(ANSWER_AT, questions.length - 1));

  return {
    id: 'reflection-' + ctx.guideId + '-' + index,
    kind: 'reflection',
    index,
    guideId: ctx.guideId,
    path: 'reflectionQuestions.' + index,
    quote: questions[index] || null,
    text: ANSWER_TEXT,
    createdAt: eveningOf(guide) + ':50:00.000Z'
  };
}

/* Three. Back up to the Overview, which is the last thing shown in the guide
   rather than the first, because it is what the next two scenes are about. */

/* `carryOn` says the scene before this one was the take-home, so the three
   sections it opened have to be folded away and the Overview opened back up,
   on camera. The store cut has no room for the take-home and opens a guide
   straight onto this, where the Overview is already out because that is how
   a guide opens, and there is nothing below it to shut. Both are the same
   scene; what differs is where the screen was a frame earlier. */

const guideOverview = (frames, carryOn = false) => {
  const at = moves(frames, carryOn ? PRE.on : PRE.nav);
  return {
    id: 'guideOverview',
    navRoute: 'guide',
    frames,
    tab: { index: TAB.guide, lit: 0 },   /* a guide is a pushed view, not a tab */
    caption:
      { eyebrow: 'Short summary', line: 'Overview',
      sub: "What Sunday's message actually said." },
    act(win, t, ctx) {
      setRoute(win, { name: 'guide-reader', id: ctx.guideId });

      /* The two the scene before opened, folding away, and the Overview
         coming back out above them. Same carry-on, other way up. Scripture is
         held shut rather than folded: nothing opened it, and a 1-to-0 ramp on
         a closed section opens it for two frames before it closes again. */
      const shut = carryOn ? ramp(t, at(0.02), at(0.14), 1, 0, 'settle') : 0;
      setSection(win, 'reflection', shut);
      setSection(win, 'oneliners', shut);
      setSection(win, 'scripture', 0);
      setSection(win, 'short-summary',
        carryOn ? ramp(t, at(0.18), at(0.30), 0, 1, 'settle') : 1);
      setSection(win, 'full-summary', ramp(t, at(0.60), at(0.72), 0, 1, 'settle'));

      const top = (id) => Math.max(0, anchorTop(win, '[data-section="' + id + '"]') - 110);
      const from = carryOn ? top('oneliners') : 0;
      setScroll(win, track(t, [
        { f: at(0.00), v: from },
        { f: at(0.08), v: from },
        { f: at(0.22), v: top('short-summary'), ease: 'flick' },
        { f: at(0.36), v: top('short-summary') },
        { f: at(0.50), v: top('short-summary') + 210 },
        { f: at(0.68), v: top('full-summary'), ease: 'flick' },
        { f: at(0.84), v: top('full-summary') },
        { f: at(1.00), v: top('full-summary') + 230, ease: 'flick' }
      ]));

      if (carryOn) {
        tapPulse(win, '[data-section="short-summary"] .hc-section__chevron', (t - at(0.16)) / 26);
      }
      if (t > at(0.52)) {
        tapPulse(win, '[data-section="full-summary"] .hc-section__chevron', (t - at(0.58)) / 26);
      }
    }
  };
};

/* Four. Keeping a line, and writing on it.

   A sentence out of the Overview is selected, Note this comes up over it, the
   note is typed and saved, and the line is underlined in the page from then
   on. With the take-home answer two scenes back, it is the half of this video
   where somebody puts something in rather than reading what the church put
   there, and it is why the Journal scene after it has anything in it.

   `writes.at` is the frame of this scene on which the entry exists. Every
   frame of the video from there on has it and every frame before does not,
   which is applyFrame's job rather than this scene's: the Journal is a
   different scene and still needs the note, and a tab handed the Journal as
   the first thing it ever draws has never run a frame of this one. */

const NOTE_TEXT = 'The part I keep coming back to. Praying on this one.';
const NOTE_PATH = 'shortSummary.0';

const guideNote = (frames) => {
  const at = moves(frames, PRE.on);
  return {
    id: 'guideNote',
    navRoute: 'guide',
    /* My journal, the pill at the foot of the reader, which pushes a view.
       Not the navigation: the list coming up here would say a thumb went
       looking for the Journal when what it did was follow the note it had
       just written. */
    leave: 'cut',
    frames,
    /* A frame of this scene, not a fraction of it: buildTimeline only adds
       the scene's start to it, and it has to be the same number the sheet
       below opens on. */
    writes: { at: at(0.38), make: noteFor },
    tab: { index: TAB.guide, lit: 0 },
    caption:
      { eyebrow: 'From the guide', line: 'Notetaking',
      sub: 'Highlight a line and keep a thought.' },
    act(win, t, ctx) {
      setRoute(win, { name: 'guide-reader', id: ctx.guideId });
      setSection(win, 'short-summary', 1);
      setSection(win, 'full-summary', 1);

      const note = noteFor(win, ctx);
      const block = '[data-hl-path="' + NOTE_PATH + '"]';

      /* Back up from where the last scene left off, to the top of the
         Overview's first paragraph, which is the line about to be kept. */
      const summary = Math.max(0, anchorTop(win, '[data-section="full-summary"]') - 110);
      const para = Math.max(0, anchorTop(win, block) - 170);
      setScroll(win, track(t, [
        { f: at(0.00), v: summary + 230 },
        { f: at(0.10), v: para, ease: 'flick' },
        { f: at(1.00), v: para }
      ]));

      /* The drag across the sentence, then the bar over it, then the sheet.
         Each one is a state this frame is in rather than a thing that happens
         on it; see the header of drive.js, and the long note on setNote. */
      setSelection(win, block,
        t < at(0.38) ? ramp(t, at(0.14), at(0.26), 0, note.quote.length, 'linear') : 0);
      setHighlightBar(win, t >= at(0.26) && t < at(0.38));
      setNoteSheet(win, note, t >= at(0.38) && t < at(0.82),
        ramp(t, at(0.42), at(0.72), 0, note.text.length, 'linear'));

      tapPulse(win, '[data-action="hl-note"]', (t - at(0.29)) / 26);
      if (t > at(0.74)) {
        tapPulse(win, '.hc-hlsheet__foot [data-action="hl-close"]', (t - at(0.76)) / 24);
      }
      /* My journal, the pill under the reader, which is where it goes next. */
      if (t > at(0.86)) tapPulse(win, '#hc-jlink', (t - at(0.88)) / 24);
    }
  };
};

/* What the note is, worked out from the guide rather than typed in here.

   THE QUOTE COMES OFF THE GUIDE'S OWN DATA, not off the paragraph on screen,
   and that is the difference between a video and a video that tears. Remotion
   renders in several browser tabs; a tab handed the Journal first has no
   guide reader mounted and no paragraph to read, so a quote taken from the
   page would be the sentence in one tab and an empty string in another, and
   the card in the Journal would flicker between them. Asked of HC.data, every
   tab gets the same sentence whatever is on screen.

   It is a sentence rather than a fixed number of letters because the church
   publishes a new guide every week and ninety letters of next Sunday's
   overview stops in the middle of a word. */
function noteFor(win, ctx) {
  const guide = win.HC.data.getGuide(ctx.guideId);
  const para = guide && guide.shortSummary ? String(guide.shortSummary[0] || '') : '';
  const stop = para.search(/[.?!](\s|$)/);
  const end = stop > 24 ? stop + 1 : Math.min(para.length, 120);
  const quote = para.slice(0, end).replace(/\s+$/, '');

  return {
    id: 'video-note',
    kind: 'highlight',
    guideId: ctx.guideId,
    path: NOTE_PATH,
    quote,
    start: 0,
    end: quote.length,
    text: NOTE_TEXT,
    createdAt: eveningOf(guide) + ':55:00.000Z'
  };
}

/* The evening of the Sunday a guide was preached, to the hour, which is what
   both of these entries are dated. The same scheme src/stage.js uses for the
   weeks already in the journal: a card carries a date off the sermon rather
   than off whatever time the render happened to run, so two renders a day
   apart are the same video. */
function eveningOf(guide) {
  const date = String((guide && guide.preachedOn) || '');
  return (/^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : '2026-01-04') + 'T21';
}

/* --------------------------------------------------------------------------
   The Journal, which is where the note went.

   Two halves, and the second one is the point. It opens the way the pill in
   the guide opens it, scoped to the sermon that was just read, with the note
   under its heading. Then All is tapped — the app's own pill, in the app's
   own row — and the list widens to everything, every sermon shut into its own
   heading. Tapping one back open is what the scene ends on.

   That is the feature in a sentence: notes do not pile up in a list, they
   pile up under the Sunday they came out of.
   -------------------------------------------------------------------------- */

const journal = (frames) => {
  const at = moves(frames, PRE.on);
  return {
    id: 'journal',
    navRoute: 'journal',
    /* Reached by the pill at the foot of the guide, which pushes a view. */
    arrive: 'cut',
    frames,
    tab: { index: TAB.more, lit: 1 },
    caption:
      { eyebrow: 'Yours', line: 'Journal',
      sub: 'A place to drop your sermon notes.' },
    act(win, t, ctx) {
      /* The route keeps the guide on it the whole scene, because that is what
         the pill opened and the pills in the filter row are how the screen is
         widened. Changing the route instead would reset the filter. */
      setRoute(win, { name: 'journal', id: ctx.guideId });

      const wide = t >= at(0.40);
      setJournalFilter(win, wide ? 'all' : 'guide');

      /* Scoped, the sermon's own heading is already out: that is the app's
         default and the scene leaves it alone. Widened, every heading is shut
         and this is the one that comes back. */
      const key = 'g:' + ctx.guideId;
      if (wide) setFold(win, key, ramp(t, at(0.58), at(0.70), 0, 1, 'settle'));

      const fold = Math.max(0, anchorTop(win, '.hc-jfold') - 150);
      const pills = Math.max(0, anchorTop(win, '.hc-journal__filters') - 230);

      setScroll(win, track(t, [
        { f: at(0.00), v: 0 },
        { f: at(0.08), v: 0 },
        { f: at(0.18), v: fold, ease: 'flick' },      /* the note, under its sermon */
        { f: at(0.30), v: fold },
        { f: at(0.37), v: pills, ease: 'flick' },     /* back up to the row of pills */
        { f: at(0.48), v: pills },
        { f: at(0.56), v: fold, ease: 'flick' },      /* down the shut headings */
        { f: at(1.00), v: fold }
      ]));

      if (t > at(0.32) && t < at(0.52)) {
        tapPulse(win, '[data-action="journal-filter"][data-value="all"]', (t - at(0.40)) / 24);
      }
      if (t > at(0.52)) {
        tapPulse(win, '[data-action="journal-fold"][data-fold="' + key + '"]',
          (t - at(0.56)) / 24);
      }
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
      sub: 'How to support our ministry.' },
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

/* 31 BARS, 2976 FRAMES, 99.2 SECONDS, AND EVERY CUT ON A BAR LINE.

   The grid version of this was a metronome rather than an edit. Every cut
   landed on a beat and not one of them landed on a moment: of thirteen cuts,
   two coincided with anything the music does, and both by accident. A beat
   grid says when you are allowed to cut. It does not say where to.

   So the lengths below come from the track's own shape, which is:

     0      quiet, building, 4 bars of intro
     12.8s  IT COMES IN.  +4.2 dB, the biggest single moment in the track
     25.6s  IT OPENS UP.  brightness up 800 Hz, the top arrives
     35.2s  settles into a long even body
     83.2s  a late brightening, the same figure as 57.6s
     89.6s  THE OUTRO.  -5 dB, the bottom goes
     97.6s  ends

   and the piece is cut to it: Home hands over to Calendar exactly as the
   track comes in, the Guide opens exactly as it opens up, the closing tour
   starts on the late brightening, and Give lands on the outro. The card at
   the end goes up with eight bars of music left and holds through the last
   of it into a second of silence.

   EVERY LENGTH IS IN BARS, not beats. A bar at 75 BPM is 96 frames, 3.2
   seconds, and cutting on bar lines is most of the difference between clean
   and busy: a cut on any old beat is in time with the music and still feels
   restless, because the music is not changing there and the picture is.

   The bed is eight bars longer than the track the church sent, which is
   where the room came from. Eleven screens in 73 seconds was 5.7 seconds
   each however the cuts fell, and no amount of beat matching makes that
   unhurried. Those eight bars are the track's own bars 11 to 19 played
   twice; it is even enough through the middle that the join measures 0.9989
   and nobody hears it. See extend in the scratchpad, and the note over Track
   in Preview.jsx.

   Every scene is longer than it was, most by half as much again. */
export const FULL = [
  home(BAR * 3),            /* 96 - 384,    hands over as the track comes in */
  cal(BAR * 2),             /* 384 - 576 */
  listen(BAR * 2),          /* 576 - 768 */
  guideIndex(BAR * 2),      /* 768 - 960,   the Guide opens as the track does */
  guideTakeHome(BAR * 5),   /* 960 - 1440 */
  guideOverview(BAR * 3, true),  /* 1440 - 1728, on the first late brightening */
  guideNote(BAR * 3),       /* 1728 - 2016 */
  journal(BAR * 3),         /* 2016 - 2304 */
  worship(BAR * 2),         /* 2304 - 2496 */
  connect(BAR * 2),         /* 2496 - 2688, on the second late brightening */
  give(BAR * 2)             /* 2688 - 2880, on the outro */
];

/* The store cut cannot hold eleven screens in thirty seconds, so it is the
   four pages the church leads with: Home, Cal, Listen, and the Guide, which
   is still the longest thing in it. The note and the Journal are in the long
   cut only — the whole beat needs twenty seconds to read, and twenty of
   thirty seconds would cost three of these four. */
export const APP_STORE = [
  home(BEAT * 6),
  cal(BEAT * 6),
  listen(BEAT * 6),
  guideOverview(BEAT * 14)
];

/* 888 frames, 29.6 seconds, inside Apple's thirty with a beat to spare.
   Thirty eight beats would be 30.4 and would not upload.

   IT CANNOT BE CUT TO THE SONG'S SHAPE AND IT DOES NOT TRY. The track takes
   four bars to come in and another four to open up, which is twenty six of
   the thirty seconds Apple allows; a store cut that waited for either would
   be a store cut of two screens. So this one stays on the beat grid, and the
   one thing it does take from the music is where it starts: `musicFrom` puts
   the bed in at bar four, the frame the track comes in on, so the preview
   opens on a page and a bed that have both already arrived rather than on
   thirteen seconds of somebody clearing their throat. The offset is a whole
   number of bars, so the grid underneath it is the same grid. */
const APP_STORE_CARDS = { open: BEAT * 2, close: BEAT * 3 };

export const CUTS = {
  AppStorePreview: {
    scenes: APP_STORE, cards: APP_STORE_CARDS, musicFrom: BAR * 4
  },
  Marketing: {
    scenes: FULL, cards: { open: OPEN_FRAMES, close: CLOSE_FRAMES }, musicFrom: 0
  }
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

         Four of the scenes are the same page: the take-home sections, the
         Overview, and the note written in it are one screen and three of its
         parts. Opening the navigation between them says a thumb went
         somewhere, and then it does not go anywhere, which is a lie small
         enough to be confusing rather than wrong. So the list only comes up
         where the destination actually changes.

         Around the guide, the hand-overs that are not the navigation are
         taps: a row in the index, which pushes the reader, and My journal at
         the foot of it, which pushes the Journal. Both are cuts. The ones
         inside it are the same screen carrying on down itself, which is not
         a cut at all. A scene can name either; where it does not, same page
         means carry on and a different page means the navigation. */
      arrive: i === 0 ? 'card'
        : scene.arrive || (scenes[i - 1].navRoute === scene.navRoute ? 'on' : 'nav'),
      leave: i === scenes.length - 1 ? 'card'
        : scene.leave || (scenes[i + 1].navRoute === scene.navRoute ? 'on' : 'nav'),
      /* The word in the list a thumb would have pressed to get to the next
         scene. Modules and tabs both carry their route as data-id. */
      nextRoute: scenes[i + 1] ? scenes[i + 1].navRoute : null,
      /* Where in the whole video this scene's journal entry arrives, if it
         writes one: a frame of the scene on the way in, a frame of the video
         on the way out. */
      wrote: scene.writes ? { frame: at + scene.writes.at, make: scene.writes.make } : null
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
    total: at + cards.close,
    /* Everything the video writes into the journal, and the frame each one
       appears on. Empty in a cut that writes nothing, which is the store
       cut. */
    writes: placed.filter((s) => s.wrote).map((s) => s.wrote)
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

  /* WHAT THE VIDEO WRITES INTO THE JOURNAL, BEFORE ANY SCREEN IS DRAWN, and
     it belongs here rather than in the scenes that write it for two reasons.
     The Journal scene shows both and is neither of them. And a render tab
     handed the Journal as the first frame it ever draws has never run a frame
     of the guide, so an entry made inside the guide's own act() would simply
     not be there, and a card would be missing from one tab's frames and
     present in another's. Stated once, for the whole timeline, each from the
     frame it is written on. */
  if (ctx.guideId) {
    for (const wrote of timeline.writes) {
      setNote(win, frame >= wrote.frame, wrote.make(win, ctx));
    }
  }

  scene.act(win, t, ctx);

  /* The navigation, last, because opening it rebuilds a layer over whatever
     the scene just arranged and the scene should not be arranging it back.

     Out at the end of a scene and in at the start of the next, so one tap on
     the button covers the change of screen: the list comes up over the page
     you are leaving, the route changes behind it with the new line gold, and
     it fades off the page you have arrived on. That is the cut, and it is
     also the feature. */
  const MENU_OUT = BEAT * 1.5;  /* a beat and a half up, landing full ON the bar line */
  const MENU_IN = BEAT;         /* and a beat to clear off the new page */

  const leaving = scene.leave === 'nav'
    ? ramp(t, scene.frames - MENU_OUT, scene.frames, 0, 1, 'settle')
    : 0;
  const arriving = scene.arrive === 'nav' ? ramp(t, 0, MENU_IN, 1, 0, 'settle') : 0;
  setMenu(win, Math.max(leaving, arriving));

  /* The button, pressed, and then the word in the list. Both are rings over
     the real control rather than a cursor, which is the same thing every
     other tap in this piece draws. */
  if (scene.leave === 'nav') {
    tapPulse(win, '#hc-navfab', (t - (scene.frames - MENU_OUT - 8)) / 26);
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
  const dip = scene.leave === 'card' || scene.leave === 'cut' ? BEAT : 0;

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
