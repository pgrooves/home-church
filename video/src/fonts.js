/* ===========================================================================
   The two typefaces, loaded into the composition itself.

   The app inside the iframe loads these for itself out of css/fonts.css. This
   is for the layer above it: the captions and the two cards are drawn by React
   in the outer document, which has no stylesheet of its own and would set
   every one of those lines in the renderer's fallback sans.

   Same two files, off the same staged copy of the app, so there is one set of
   font binaries in this repo and the video cannot drift from the product by
   using a different cut of Poppins.

   loadBrandFonts() holds the render open until both faces are actually usable.
   Remotion does not wait for fonts on its own, and a frame drawn a beat early
   is a frame set in Helvetica.
   =========================================================================== */

import { continueRender, delayRender, staticFile } from 'remotion';

let started = null;

export function loadBrandFonts() {
  if (started) return started;

  const handle = delayRender('Loading Manrope and Poppins', { timeoutInMilliseconds: 60000 });

  started = (async () => {
    const faces = [
      new FontFace('Manrope', `url(${staticFile('app/assets/fonts/manrope-latin.woff2')}) format('woff2')`, {
        weight: '200 800',
        style: 'normal',
        display: 'block'
      }),
      new FontFace('Poppins', `url(${staticFile('app/assets/fonts/poppins-800.woff2')}) format('woff2')`, {
        weight: '800',
        style: 'normal',
        display: 'block'
      })
    ];

    const loaded = await Promise.all(faces.map((f) => f.load()));
    loaded.forEach((f) => document.fonts.add(f));
    await document.fonts.ready;
  })();

  started.then(
    () => continueRender(handle),
    () => continueRender(handle)
  );

  return started;
}
