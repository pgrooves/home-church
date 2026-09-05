/* ===========================================================================
   Movement, as a function of the frame number.

   Two helpers. `track` is for anything that moves through a series of held
   positions, which is most of this video: a thumb does not scroll a screen at
   a constant rate for five seconds, it flicks, watches it land, and flicks
   again. `ramp` is the one-off fade.
   =========================================================================== */

import { interpolate, Easing } from 'remotion';

/* THE FLICK IS THE IMPORTANT ONE. cubic-bezier(0.16, 1, 0.3, 1) leaves fast
   and arrives slowly, which is what a scroll does once the finger is off it,
   and it is the difference between footage of an app and a slideshow with a
   pan on it. `settle` is the app's own --hc-ease, for anything the app itself
   would have moved. */
export const EASE = {
  flick: Easing.bezier(0.16, 1, 0.3, 1),
  settle: Easing.bezier(0.4, 0, 0.2, 1),
  lift: Easing.bezier(0, 0, 0.2, 1),
  linear: (t) => t
};

/* Keyframes, in order, each `{ f, v }` with an optional `ease` naming how it
   arrives from the one before. Before the first and after the last, the value
   is held rather than extrapolated, so a scene that runs long simply sits
   still instead of scrolling off the end of the screen.

     track(t, [{ f: 0, v: 0 }, { f: 30, v: 0 }, { f: 78, v: 640, ease: 'flick' }])
*/
export function track(t, keys) {
  if (!keys.length) return 0;
  if (t <= keys[0].f) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.f) return last.v;

  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t > b.f) continue;
    const a = keys[i - 1];
    if (b.f === a.f) return b.v;
    return interpolate(t, [a.f, b.f], [a.v, b.v], {
      easing: EASE[b.ease] || EASE.settle,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    });
  }
  return last.v;
}

/* One move, from one number to another, held at both ends. */
export function ramp(t, from, to, a, b, ease) {
  return interpolate(t, [from, to], [a, b], {
    easing: EASE[ease] || EASE.settle,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
}
