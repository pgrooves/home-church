/* ===========================================================================
   What can be rendered.

   THE SIZES ARE LOGICAL POINTS, NOT PIXELS, and both compositions are rendered
   with --scale=3. 440 x 956 is the 6.9 inch iPhone's own coordinate space, the
   one the app's CSS is written against, so laying out at that size and
   rasterising at three times it is the same arrangement of pixels the phone
   draws, rather than a 440 wide layout stretched to fill a tall frame. Three
   times 440 x 956 is 1320 x 2868, which is the size App Store Connect asks for
   and the size scripts/make_screenshots.js already writes the stills at.

   App Store Connect also accepts 1290 x 2796 for the same display class. That
   is 430 x 932 at three times, so change the two numbers below if the upload
   ever wants it. Nothing in the video is pinned to the taller size.
   =========================================================================== */

import { Composition } from 'remotion';
import { Framed, Preview } from './Preview';
import { DURATION, FPS } from './scenes';
import { PHONE } from './theme';

export const RemotionRoot = () => (
  <>
    {/* The one that goes on the store page. The app fills the frame, because
        an app preview is footage of the app and a device frame inside a
        device frame is a picture of a phone on a phone. */}
    <Composition
      id="AppStorePreview"
      component={Preview}
      durationInFrames={DURATION}
      fps={FPS}
      width={PHONE.width}
      height={PHONE.height}
    />

    {/* The same twenty nine seconds in a hand-drawn device on a warm ground,
        for the website, the socials, and anywhere the bare screen would read
        as a screenshot that forgot to stop. 360 x 640 at three times is
        1080 x 1920, which every one of those places takes. */}
    <Composition
      id="Marketing"
      component={Framed}
      durationInFrames={DURATION}
      fps={FPS}
      width={360}
      height={640}
      defaultProps={{ screenWidth: 232 }}
    />
  </>
);
