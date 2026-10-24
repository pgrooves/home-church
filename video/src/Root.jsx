/* ===========================================================================
   What can be rendered.

   THE SIZES ARE LOGICAL POINTS, NOT PIXELS, and both are rendered at three
   times. 440 x 956 is the 6.9 inch iPhone's own coordinate space, the one the
   app's CSS is written against, so laying out at that size and rasterising at
   three times it is the same arrangement of pixels the phone draws rather than
   a narrow layout stretched to fill a tall frame. Three times 440 x 956 is
   1320 x 2868, which App Store Connect asks for and which
   scripts/make_screenshots.js already writes the stills at.

   App Store Connect also accepts 1290 x 2796 for the same display class. That
   is 430 x 932 at three times, so change two numbers below if the upload ever
   wants it. Nothing in the video is pinned to the taller size.
   =========================================================================== */

import { Composition } from 'remotion';
import { Card, Framed, Preview, Sunday } from './Preview';
import { buildTimeline, CUTS, FPS, LEAD } from './scenes';
import { PHONE } from './theme';

const length = (cut) => buildTimeline(CUTS[cut]).total;

export const RemotionRoot = () => (
  <>
    {/* The one that goes on the store page: 29.8 seconds, because Apple takes
        an app preview between fifteen and thirty and there is no arguing with
        the upload form. The app fills the frame, with no device drawn around
        it, because a preview is footage of the app and a phone inside a phone
        is a picture of a phone. */}
    <Composition
      id="AppStorePreview"
      component={Preview}
      durationInFrames={length('AppStorePreview')}
      fps={FPS}
      width={PHONE.width}
      height={PHONE.height}
      defaultProps={{ cut: 'AppStorePreview' }}
    />

    {/* The full minute and fourteen, in a drawn phone on a warm ground, for the
        website and the socials. No thirty second ceiling out here. 360 x 640 at
        three times is 1080 x 1920, which every one of those places takes. */}
    <Composition
      id="Marketing"
      component={Framed}
      durationInFrames={length('Marketing') + LEAD}
      fps={FPS}
      width={360}
      height={640}
      defaultProps={{ cut: 'Marketing', screenWidth: 232 }}
    />

    {/* Sunday morning, on the wall. 640 x 360 at three times is 1920 x 1080,
        which every projector and television in a church building takes
        without asking. The portrait cuts are 9:16 because a phone is; this
        one is the room's shape, and the two thirds of it a vertical video
        cannot fill carry the lockup, the list of what the app does, and a QR
        code sized to scan from the back row. */}
    <Composition
      id="Sunday"
      component={Sunday}
      durationInFrames={length('Marketing') + LEAD}
      fps={FPS}
      width={640}
      height={360}
      defaultProps={{ cut: 'Marketing' }}
    />

    {/* The still that goes up when the video is not playing: same ground,
        same size, phone taken out and the code put in the space it leaves.
        One frame, rendered with `remotion still`. */}
    <Composition
      id="SundayCard"
      component={Card}
      durationInFrames={1}
      fps={FPS}
      width={640}
      height={360}
    />
  </>
);
