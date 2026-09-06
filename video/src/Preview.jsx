/* ===========================================================================
   The piece itself: the app, the veil, the words, and a card at each end.

   Two compositions use this. `AppStorePreview` renders it at the phone's own
   size and fills the frame with it, which is what App Store Connect wants: an
   app preview is the app, not a picture of a phone. `Marketing` puts the same
   twenty nine seconds inside a device on a warm ground, for the website and
   for anywhere a bare screen recording would read as a screenshot.
   =========================================================================== */

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AppStage } from './AppStage';
import { Caption, CloseCard, OpenCard } from './Type';
import { loadBrandFonts } from './fonts';
import { HC, PHONE } from './theme';
import { applyFrame, captionAt, CLOSE_FRAMES, OPEN_FRAMES, TIMELINE } from './scenes';

export const Preview = ({ scale = 1 }) => {
  loadBrandFonts();

  const frame = useCurrentFrame();
  const caption = captionAt(frame);
  const inOpen = frame < OPEN_FRAMES;
  const inClose = frame >= TIMELINE.appEnd;

  return (
    <AbsoluteFill
      style={{
        width: PHONE.width * scale,
        height: PHONE.height * scale,
        backgroundColor: HC.paper,
        overflow: 'hidden'
      }}
    >
      <AppStage frame={frame} apply={applyFrame} scale={scale} />

      {/* Everything above the glass is drawn at phone scale and then taken up
          with the phone, so one set of numbers describes the layout whichever
          composition is rendering. */}
      <AbsoluteFill
        style={{
          width: PHONE.width,
          height: PHONE.height,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        {caption ? <Caption {...caption} /> : null}
        {inOpen ? <OpenCard t={frame} frames={OPEN_FRAMES} /> : null}
        {inClose ? <CloseCard t={frame - TIMELINE.appEnd} frames={CLOSE_FRAMES} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------------------------
   The device, for the marketing cut.

   Drawn rather than photographed: a rounded slab in the app's own near-black
   with a lit edge, the same near-flat treatment the design system asks for
   everywhere else. No shadow theatre, no reflections, no hand holding it.
   -------------------------------------------------------------------------- */

export const Framed = ({ screenWidth }) => {
  const scale = screenWidth / PHONE.width;
  const screenHeight = PHONE.height * scale;
  const bezel = Math.round(9 * scale + 4);
  const radius = Math.round(56 * scale + bezel);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#131211',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* A single soft warmth behind the phone, so the ground is not a flat
          field. Taupe at four percent, which is barely there on purpose. */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(60% 42% at 50% 38%, rgba(196,181,162,0.10) 0%, rgba(196,181,162,0) 70%)'
        }}
      />

      <div
        style={{
          position: 'relative',
          width: screenWidth + bezel * 2,
          height: screenHeight + bezel * 2,
          padding: bezel,
          borderRadius: radius,
          backgroundColor: '#000000',
          border: '1px solid rgba(196,181,162,0.22)',
          boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
          overflow: 'hidden'
        }}
      >
        {/* POSITION RELATIVE IS LOAD BEARING. Preview is an AbsoluteFill, so
            it lays itself out against the nearest positioned ancestor. Without
            this the nearest one is the composition, and the phone renders as
            an empty slab with the app pinned to the top left corner of the
            frame beside it. Nothing about the arrangement below says so, which
            is why it is said here. */}
        <div
          style={{
            position: 'relative',
            width: screenWidth,
            height: screenHeight,
            borderRadius: radius - bezel,
            overflow: 'hidden',
            backgroundColor: HC.paper
          }}
        >
          <Preview scale={scale} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
