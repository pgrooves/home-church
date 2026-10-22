/* ===========================================================================
   The piece itself: the app, the veil, the words, and a card at each end.

   `Preview` renders one cut at the phone's own size. `Framed` puts the same
   cut inside a drawn phone on a warm ground, for the website and the socials.
   Which cut is a prop, so the store's thirty second version and the long one
   are the same component with a different list of scenes. See src/scenes.js.
   =========================================================================== */

import { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { AppStage } from './AppStage';
import { Caption, CloseCard, OpenCard } from './Type';
import { loadBrandFonts } from './fonts';
import { HC, PHONE } from './theme';
import { applyFrame, BEAT, buildTimeline, captionAt, CUTS, gradeAt } from './scenes';

/* The bed, at public/music.wav.

   NOT IN THE REPOSITORY, and deliberately: it is a licensed track and a
   licence is a thing somebody holds rather than a thing a git history should
   carry a copy of. prepare.mjs says so out loud when it is missing. What is
   staged there has had its first 0.4307 seconds taken off, so beat one of the
   music is frame zero of the video and every scene boundary after it lands on
   a beat. See the note over BEAT in scenes.js.

   THAT NUMBER IS TWO NUMBERS. The track's own first beat is at 0.3880s,
   measured off a 23ms analysis window; the other 0.0427 is 2048 samples at
   48kHz, which is what ffmpeg's AAC encoder writes in front of the audio it
   is given. Nothing trims that back off: the mp4 comes out with the audio
   stream 2048 samples longer than the video and no edit list saying to skip
   them, so every player starts the music a frame and a quarter late. Cutting
   that much further into the track cancels it exactly.

   It is an encoder quirk baked into an asset, which is not where a fix
   belongs, and the honest alternatives are worse: Remotion can only offset an
   Audio by whole frames, and a post-render remux needs an ffmpeg the person
   rendering may not have. If the number ever drifts, measure it rather than
   guess — render a few hundred frames, pull the audio out, and cross
   correlate it against the untrimmed track. Both signs of this were wrong
   once before the probe caught them.

   UNCOMPRESSED, SO THE TRIM IS THE TRIM. ffmpeg's -ss on an m4a seeks to an
   AAC frame boundary rather than to the sample asked for, which is a second
   error on top of the first. Decoded to wav and cut by sample index, there
   is nothing to round.

   The long cut runs out of music before it runs out of video, by design: the
   track ends at 72.7 seconds and the closing card holds for most of a second
   after it in silence, which is what a card you are meant to read wants. The
   store cut stops in the middle of the track, so the last beat is a fade. */
const Track = ({ from = 0 }) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={staticFile('music.wav')}
      trimBefore={from || undefined}
      volume={(f) =>
        interpolate(f, [durationInFrames - BEAT, durationInFrames - 1], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        })
      }
    />
  );
};

export const Preview = ({ cut = 'AppStorePreview', scale = 1 }) => {
  loadBrandFonts();

  const frame = useCurrentFrame();
  const timeline = useMemo(() => buildTimeline(CUTS[cut]), [cut]);

  const caption = captionAt(frame, timeline);
  const grade = gradeAt(frame, timeline);
  const inOpen = frame < timeline.openFrames;
  const inClose = frame >= timeline.appEnd;

  const apply = useMemo(
    () => (win, f, ctx) => applyFrame(win, f, ctx, timeline),
    [timeline]
  );

  return (
    <AbsoluteFill
      style={{
        width: PHONE.width * scale,
        height: PHONE.height * scale,
        backgroundColor: HC.paper,
        overflow: 'hidden'
      }}
    >
      <Track from={CUTS[cut].musicFrom} />

      {/* THE FOOTAGE, GRADED. Everything in here is one iframe showing one
          state, so there is no second copy to cross dissolve with and the
          hand-overs have to be carried by what can be done to a single
          layer: it softens and over-exposes through a cut and resolves on
          the other side. See gradeAt in scenes.js. The filter is left off
          entirely when there is nothing to do, because a blur of zero is
          still a compositing pass on every one of the frames between cuts. */}
      <AbsoluteFill
        style={{
          filter: grade.blur > 0.01 || grade.bright > 1.001
            ? `blur(${grade.blur.toFixed(2)}px) brightness(${grade.bright.toFixed(3)})`
            : undefined
        }}
      >
        <AppStage frame={frame} apply={apply} scale={scale} />
      </AbsoluteFill>

      {/* The warm half of the bloom, over the app and under the words. The
          app's own paper colour rather than white: a white flash over a warm
          charcoal screen belongs to somebody else's video, and lifting the
          charcoal towards the cream it is a dark version of is the move the
          brand would make. */}
      {grade.wash > 0.002 ? (
        <AbsoluteFill style={{ backgroundColor: HC.ink, opacity: grade.wash }} />
      ) : null}

      {/* Everything above the glass is laid out at phone scale and then taken
          up with the phone, so one set of numbers describes it whichever
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
        {inOpen ? <OpenCard t={frame} frames={timeline.openFrames} /> : null}
        {inClose ? <CloseCard t={frame - timeline.appEnd} frames={timeline.closeFrames} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------------------------
   The device, for the long cut.

   Drawn rather than photographed: a rounded slab in the app's own near-black
   with a lit edge, the same near-flat treatment the design system asks for
   everywhere else. No shadow theatre, no reflections, no hand holding it.
   -------------------------------------------------------------------------- */

export const Framed = ({ cut = 'Marketing', screenWidth = 232 }) => {
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
          field. Taupe at a tenth, which is barely there on purpose. */}
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
        {/* POSITION RELATIVE IS LOAD BEARING, on this div and the one above.
            Preview is an AbsoluteFill, so it lays itself out against the
            nearest positioned ancestor. Without these the nearest one is the
            composition, and the phone renders as an empty slab with the app
            pinned to the top left corner of the frame beside it. Nothing about
            a stack of sized divs says so, which is why it is said here. */}
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
          <Preview cut={cut} scale={scale} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
