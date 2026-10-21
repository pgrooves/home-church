/* ===========================================================================
   This week's content, already on its way in.

   prepare.mjs reads the church's live tables once, downloads every picture it
   can reach, and writes the lot into public/app as one file per table at
   `rest/v1/<table>`, which is exactly the path js/content.js builds its
   requests from once config.js points the project at this folder. So by the
   time anything here runs, the app has already fetched this week's content
   with its own fetch, mapped it with its own twenty mapping functions, filled
   HC.data and written its own cache. No screen was touched and no mapper was
   copied into this folder to go stale.

   What is left for this file is the one thing the app must not do during a
   render: go and ask again.

   WHY THAT MATTERS MORE THAN IT SOUNDS. Remotion renders with several browser
   tabs at once and each one boots its own copy of the app. A refresh firing
   mid shot is one tab repainting a screen another tab has already drawn, and
   frames that disagree are frames that tear. Against a folder of files the
   answer is always the same bytes, so this is belt and braces rather than a
   fix, but a refresh is also a redraw, and a redraw halfway through a scroll
   is a scroll that jumps.
   =========================================================================== */

export async function stage(win) {
  const HC = win.HC;
  if (!HC.content) return false;

  /* Finish whatever the boot started, so no tab is drawing the seed while
     another draws the week. It is reading files off the same disk Remotion is
     serving the composition from, so this is quick and it cannot fail
     halfway. */
  await HC.content.refresh();

  const quiet = () => Promise.resolve(false);
  HC.content.refresh = quiet;
  HC.content.refreshIfStale = quiet;

  seedJournal(HC);

  /* refresh() only repaints when its own fingerprint of the content changed,
     and from the second tab onwards it is comparing against a cache this same
     call wrote a moment earlier. Redraw regardless. */
  const route = HC.router.current();
  if (route) HC.router.go(route, { force: true, animate: false, replace: true });

  return HC.content.state().source === 'network' ||
         HC.content.state().source === 'cache';
}

/* --------------------------------------------------------------------------
   A few weeks of somebody's journal.

   The Journal scene is about notes piling up under the sermon they came out
   of, which needs more than one sermon in there. These are the ones that were
   already written; the one made on camera is the Deliverance scene's, and it
   is deliberately not here, because a note that is in the list before it is
   written is a note the video did not just write.

   EVERYTHING ABOUT THEM IS STATED. The id, so eight render tabs write the
   same row rather than eight; the date, because the Journal sorts on it and
   returns 0 on a tie, and three creates in the same millisecond is three tabs
   each getting their own order; and the guide, so the headings are the
   church's real series rather than invented ones. The loose notes in an
   earlier version of this video tore several times a second for exactly the
   missing middle one of those. See the README.

   The dates come off the sermons rather than being typed in, so a render next
   month is a journal from last month rather than a journal that stopped in
   October. Written the evening of the sermon, which is when somebody would
   have written them.

   The slate is wiped first. localStorage survives between renders on the same
   machine, and the video should be the same video on the second run as on the
   first. */
const SEEDS = [
  'Did not know this was in there. Look the Acts passage up again.',
  'The bit about the armour. Put this where I will see it on Monday.',
  'Kept thinking about this the whole drive home.'
];

function seedJournal(HC) {
  if (!HC.journal || !HC.data) return;

  HC.journal.all().forEach((entry) => HC.journal.remove(entry.id));

  const guides = HC.data.guidesByDate() || [];
  SEEDS.forEach((body, i) => {
    /* Guide 0 is the one the Deliverance scene opens and writes in. */
    const guide = guides[i + 1];
    if (!guide) return;
    HC.journal.create({
      id: 'video-seed-' + i,
      createdAt: eveningOf(guide.preachedOn, i),
      guideId: guide.id,
      guideTitle: HC.data.guideTitle(guide),
      bodyText: body
    });
  });
}

/* The evening of the Sunday it was preached, a few minutes apart so two
   sermons published on the same date still sort the same way every time. */
function eveningOf(date, n) {
  const day = /^\d{4}-\d{2}-\d{2}/.test(String(date || ''))
    ? String(date).slice(0, 10)
    : '2026-01-04';
  return day + 'T21:' + (40 - n * 5) + ':00.000Z';
}
