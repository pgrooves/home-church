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

  /* refresh() only repaints when its own fingerprint of the content changed,
     and from the second tab onwards it is comparing against a cache this same
     call wrote a moment earlier. Redraw regardless. */
  const route = HC.router.current();
  if (route) HC.router.go(route, { force: true, animate: false, replace: true });

  return HC.content.state().source === 'network' ||
         HC.content.state().source === 'cache';
}
