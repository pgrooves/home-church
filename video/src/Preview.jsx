/* ===========================================================================
   The piece itself: the app, the veil, the words, and a card at each end.

   `Preview` renders one cut at the phone's own size. `Framed` puts the same
   cut inside a drawn phone on a warm ground, for the website and the socials.
   Which cut is a prop, so the store's thirty second version and the long one
   are the same component with a different list of scenes. See src/scenes.js.
   =========================================================================== */

import { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { AppStage } from './AppStage';
import { Caption, CloseCard, FeaturePanel, OpenCard } from './Type';
import { loadBrandFonts } from './fonts';
import { ramp } from './timing';
import { FACE, HC, PHONE } from './theme';
import { applyFrame, BAR, BEAT, buildTimeline, cameraAt, captionAt, CUTS, gradeAt, LEAD, LEAD_FADE } from './scenes';

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

export const Preview = ({ cut = 'AppStorePreview', scale = 1, wordless = false }) => {
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
        {caption ? <Caption {...caption} wordless={wordless} /> : null}
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

const FramedBody = ({ cut = 'Marketing', screenWidth = 232 }) => {
  const scale = screenWidth / PHONE.width;
  const screenHeight = PHONE.height * scale;
  const bezel = Math.round(9 * scale + 4);
  const radius = Math.round(56 * scale + bezel);

  const frame = useCurrentFrame();
  const timeline = useMemo(() => buildTimeline(CUTS[cut]), [cut]);
  const cam = cameraAt(frame, timeline);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#131211',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* A single soft warmth behind the phone, so the ground is not a flat
          field. Taupe at a tenth, which is barely there on purpose. It leans
          with the camera, at a fraction of it, so the ground has parallax
          against the device instead of being a sticker behind it. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 42% at ${(50 + cam.x * 0.22).toFixed(2)}% ${(38 + cam.y * 0.18).toFixed(2)}%, rgba(196,181,162,0.10) 0%, rgba(196,181,162,0) 70%)`
        }}
      />

      <div
        style={{
          position: 'relative',
          transform: `translate3d(${cam.x.toFixed(2)}px, ${cam.y.toFixed(2)}px, 0) scale(${cam.scale.toFixed(4)})`,
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

      <Vignette />
      <Grain frame={frame} />
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------------------------
   The way in: black, silence, and then the track.

   Both of the cuts that play to a room open on nothing for two beats — no
   picture and no sound — and then the music lands on the frame the lockup
   starts to appear on. Starting cold on a logo and a downbeat is how a
   slideshow opens; two beats of black is the room going quiet first, and it
   costs a second and a half.

   The length is a whole number of beats, so the music's own grid is
   untouched: everything downstream is the same timeline moved two beats
   later. The store cut does not get this. Apple gives a preview thirty
   seconds and somebody scrolling past gives it about two, and the first of
   them cannot be black.
   -------------------------------------------------------------------------- */
const Opening = ({ children }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      <Sequence from={LEAD}>{children}</Sequence>
      <AbsoluteFill
        style={{
          backgroundColor: '#000000',
          opacity: ramp(frame, LEAD, LEAD + LEAD_FADE, 1, 0, 'settle'),
          pointerEvents: 'none'
        }}
      />
    </AbsoluteFill>
  );
};

export const Framed = (props) => (
  <Opening>
    <FramedBody {...props} />
  </Opening>
);

/* The corners go down, which is the oldest trick there is for making the
   middle of a frame the subject. Barely: the phone is already the only lit
   thing in the picture and this is here to stop the ground reading as a flat
   field behind it. */
const Vignette = () => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background:
        'radial-gradient(74% 56% at 50% 46%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.42) 100%)'
    }}
  />
);

/* GRAIN, AND IT IS NOT NOSTALGIA.

   A warm charcoal radial gradient across 1080 pixels at eight bits a channel
   is about forty steps of tone over a very long ramp, which is banding, and
   it was banding: concentric rings around the glow behind the phone, the
   kind that only show once the thing is encoded and on somebody's screen.
   Noise is the fix — it dithers the ramp, and the encoder spends a few more
   bits on the gradient instead of smoothing it into rings.

   It is four percent and it moves. Still grain over moving pictures reads as
   a dirty lens, so the tile is offset by the frame number, which is cheap
   where generating noise per frame is not: one 140 pixel tile, one
   background-position, no filter pass. The numbers are coprime with the tile
   so the pattern does not come back around for a couple of thousand
   frames. */
const GRAIN_TILE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">' +
      '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>' +
      '<feColorMatrix type="saturate" values="0"/></filter>' +
      '<rect width="140" height="140" filter="url(#n)"/>' +
    '</svg>'
  );

const Grain = ({ frame }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity: 0.04,
      mixBlendMode: 'overlay',
      backgroundImage: `url("${GRAIN_TILE}")`,
      backgroundRepeat: 'repeat',
      backgroundPosition: `${(frame * 37) % 140}px ${(frame * 61) % 140}px`
    }}
  />
);

/* ===========================================================================
   Sunday morning, on the wall.

   The same piece, landscape, for a projector or a television in the room
   before a service. Everything else here is 9:16 because a phone is; this is
   1920 x 1080 because a sanctuary screen is, and a vertical video on a
   sixteen by nine screen is two thirds of a wall doing nothing. So the empty
   two thirds carry the things a congregation needs and the phone cannot say
   large enough: who it is, what they are looking at, and where to get it.

   THE NAME OF THE PAGE MOVED OFF THE GLASS. In the portrait cuts the caption
   sits over the app, which works at arm's length and does not work at forty
   feet: a phone-sized caption inside a phone-sized phone inside a sixteen by
   nine frame is four point type by the time it reaches the back row. Here it
   is beside the phone at thirty points of a 640 point frame, and it changes
   as the phone changes, so the words and the screen are always the same
   feature. The veil stays behind on the glass even though the words left —
   it is what covers the two card hand-overs, and it is what sends the eye
   right to read and brings it back.

   Apple's badge is Apple's own artwork, fetched from developer.apple.com
   rather than drawn here: the guidelines ask for the supplied file and they
   are right to, since a hand-made one is a trademark somebody redrew.
   =========================================================================== */

const STAGE = { width: 640, height: 360 };

const SundayBody = ({ cut = 'Marketing' }) => {
  loadBrandFonts();

  const frame = useCurrentFrame();
  const timeline = useMemo(() => buildTimeline(CUTS[cut]), [cut]);
  const cam = cameraAt(frame, timeline);
  const caption = captionAt(frame, timeline);

  /* The phone is sized off the frame's height rather than its width, which
     is the whole difference between this and the portrait cuts. */
  const screenHeight = 290;
  const scale = screenHeight / PHONE.height;
  const screenWidth = PHONE.width * scale;
  const bezel = Math.round(9 * scale + 4);
  const radius = Math.round(56 * scale + bezel);
  const phoneTop = Math.round((STAGE.height - (screenHeight + bezel * 2)) / 2);
  const phoneBottom = phoneTop + screenHeight + bezel * 2;

  return (
    <AbsoluteFill style={{ backgroundColor: '#131211' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(52% 58% at ${(42 + cam.x * 0.18).toFixed(2)}% ${(46 + cam.y * 0.14).toFixed(2)}%, rgba(196,181,162,0.11) 0%, rgba(196,181,162,0) 70%)`
        }}
      />

      {/* THE VIGNETTE GOES HERE, under the chrome rather than over it. Over
          the top it put a diagonal sheen across anything pale in the corner
          it is darkest in, which on a sheet of white looked like a crease.
          It is a treatment for the ground and the device, not the furniture. */}
      <Vignette />

      <div
        style={{
          position: 'absolute',
          left: 204,
          top: phoneTop,
          transform: `translate3d(${(cam.x * 0.6).toFixed(2)}px, ${(cam.y * 0.6).toFixed(2)}px, 0) scale(${cam.scale.toFixed(4)})`,
          width: screenWidth + bezel * 2,
          height: screenHeight + bezel * 2,
          padding: bezel,
          borderRadius: radius,
          backgroundColor: '#000000',
          border: '1px solid rgba(196,181,162,0.22)',
          boxShadow: '0 22px 70px rgba(0,0,0,0.6)',
          overflow: 'hidden'
        }}
      >
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
          <Preview cut={cut} scale={scale} wordless />
        </div>
      </div>

      {/* Top left: who it is. */}
      <Img
        src={staticFile('app/assets/img/logo-lockup.png')}
        style={{ position: 'absolute', left: 34, top: 30, width: 150, display: 'block' }}
      />

      {/* Bottom left: where to get it. The code is its own slide now. */}
      <Img
        src={staticFile('app-store-badge.svg')}
        style={{ position: 'absolute', left: 34, top: phoneBottom - 40, width: 134, display: 'block' }}
      />

      {/* Right: whatever the phone is showing, and nothing else. */}
      <div
        style={{
          position: 'absolute',
          left: 382,
          top: 0,
          width: 224,
          height: STAGE.height,
          display: 'flex',
          alignItems: 'center'
        }}
      >
        {caption ? <FeaturePanel {...caption} width={224} /> : null}
      </div>

      <Grain frame={frame} />
    </AbsoluteFill>
  );
};

export const Sunday = (props) => (
  <Opening>
    <SundayBody {...props} />
  </Opening>
);

/* ===========================================================================
   The card that goes up when the video is not playing.

   One still, the same size and the same ground as the Sunday cut, with the
   phone taken out and the code put in the middle of the space it leaves.
   What it is for is the minute after the video ends and the minute before it
   starts: a room full of people who have just watched the thing and now want
   it, looking at a wall that has stopped telling them how.

   THE CODE IS ON A WHITE CARD AND THAT IS NOT A STYLE DECISION. The file the
   church supplied is dark modules on a transparent ground, so on this
   charcoal it is a dark square on a dark wall: invisible, and unreadable to
   a scanner even where it is visible. White is also simply what a scanner
   wants. At 170 of the frame's 360 points it is very nearly half the height
   of the picture, which from the back of a sanctuary is more than enough.
   =========================================================================== */

export const Card = () => {
  loadBrandFonts();
  const qr = 170;

  return (
    <AbsoluteFill style={{ backgroundColor: '#131211' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(52% 58% at 50% 48%, rgba(196,181,162,0.11) 0%, rgba(196,181,162,0) 70%)'
        }}
      />
      <Vignette />

      <Img
        src={staticFile('app/assets/img/logo-lockup.png')}
        style={{ position: 'absolute', left: 34, top: 30, width: 150, display: 'block' }}
      />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: qr + 40,
            padding: 20,
            boxSizing: 'border-box',
            borderRadius: 22,
            backgroundColor: '#FFFFFF',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            textAlign: 'center'
          }}
        >
          <span
            style={{
              display: 'block',
              fontFamily: FACE.sans,
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#6D6864',
              marginBottom: 12
            }}
          >
            Scan to download
          </span>
          <Img src={staticFile('qr.png')} style={{ width: qr, height: qr, display: 'block' }} />
          <Img
            src={staticFile('app-store-badge.svg')}
            style={{ width: qr - 16, display: 'block', margin: '14px auto 0' }}
          />
        </div>
      </AbsoluteFill>

      <Grain frame={0} />
    </AbsoluteFill>
  );
};
