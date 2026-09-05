/* ===========================================================================
   The words over the footage, and the two cards.

   All of it is the app's own typographic move, at full size: a tiny tracked
   all-caps eyebrow in taupe, a large light line under it, and a short rule
   beneath. The design system calls that the most recognisable thing the brand
   does, and says it is doing more work than the logo is. It is on nearly every
   screen in the app, so a store page that opens with it looks like the same
   piece of software rather than an advert for it.
   =========================================================================== */

import { AbsoluteFill, Img, staticFile } from 'remotion';
import { FACE, HC } from './theme';
import { ramp, track } from './timing';

/* --------------------------------------------------------------------------
   The veil and one line, over the app.
   -------------------------------------------------------------------------- */

export const Caption = ({ veil, text, rise, eyebrow, line }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ backgroundColor: HC.paper, opacity: veil }} />
    <AbsoluteFill
      style={{
        opacity: text,
        transform: `translateY(${rise}px)`,
        padding: '0 40px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start'
      }}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <p
        style={{
          margin: '10px 0 0',
          fontFamily: FACE.display,
          fontWeight: 800,
          fontSize: 34,
          lineHeight: '40px',
          letterSpacing: '-0.015em',
          color: HC.ink
        }}
      >
        {line}
      </p>
      <Rule width={72} />
    </AbsoluteFill>
  </AbsoluteFill>
);

/* --------------------------------------------------------------------------
   The way in. The mark arrives first and the wordmark wipes out from behind
   it, which is the lockup assembling itself rather than fading up.
   -------------------------------------------------------------------------- */

export const OpenCard = ({ t, frames }) => {
  /* The lockup already carries the house between the two words, so there is no
     second mark above it. What arrives first is the house on its own, drawn by
     holding the wipe at the middle of the lockup for a beat before letting it
     run out to both edges. One image, one movement, and the wordmark assembles
     around the mark rather than fading up beside it. */
  /* Nothing waits. A store page gets a second and a half before somebody
     scrolls past it, and the first draft of this spent the first half second
     on an empty charcoal screen. The mark is already arriving on frame one. */
  const open = ramp(t, 0, 34, 0, 1, 'settle');
  const lift = ramp(t, 0, 26, 0.94, 1, 'lift');
  const fade = ramp(t, 0, 8, 0, 1, 'lift');
  const out = ramp(t, frames - 14, frames - 2, 1, 0, 'settle');

  /* From 34 percent either side of centre, which is where the house sits in
     the lockup, out to nothing. */
  const inset = (1 - open) * 34;

  return (
    <AbsoluteFill style={{ backgroundColor: HC.paper }}>
      <AbsoluteFill
        style={{
          opacity: out,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 40px'
        }}
      >
        <div
          style={{
            width: 312,
            opacity: fade,
            transform: `scale(${lift})`,
            clipPath: `inset(0 ${inset}% 0 ${inset}%)`
          }}
        >
          <Img src={staticFile('app/assets/img/logo-lockup.png')} style={{ width: 312, display: 'block' }} />
        </div>
        <div style={{ opacity: ramp(t, 26, 44, 0, 1, 'lift'), textAlign: 'center' }}>
          <Rule width={56} center />
          <Eyebrow center>Metairie, Louisiana</Eyebrow>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------------------------
   The way out. One promise, then the name and the sentence the store page
   already leads with.
   -------------------------------------------------------------------------- */

export const CloseCard = ({ t, frames }) => {
  const promise = track(t, [
    { f: 0, v: 0 },
    { f: 10, v: 1, ease: 'lift' },
    { f: 34, v: 1 },
    { f: 46, v: 0, ease: 'settle' }
  ]);
  const sign = ramp(t, 44, 62, 0, 1, 'lift');
  const rise = ramp(t, 44, 66, 12, 0, 'lift');

  /* NO FADE OUT AT THE END. The last frame of a preview is the one that sits
     on the store page as the poster once it has played, and a poster frame
     that has faded to charcoal is a black rectangle where a name should be.
     It ends on the lockup, holding. */

  return (
    <AbsoluteFill style={{ backgroundColor: HC.paper }}>
      <AbsoluteFill
        style={{
          opacity: promise,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 44px'
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: FACE.display,
            fontWeight: 800,
            fontSize: 34,
            lineHeight: '40px',
            letterSpacing: '-0.015em',
            color: HC.ink,
            textAlign: 'center'
          }}
        >
          It all works with no signal.
        </p>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          opacity: sign,
          transform: `translateY(${rise}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 40px'
        }}
      >
        <Img src={staticFile('app/assets/img/logo-lockup.png')} style={{ width: 292, display: 'block' }} />
        <Rule width={64} center />
        <p
          style={{
            margin: '4px 0 0',
            fontFamily: FACE.reading,
            fontWeight: 400,
            fontSize: 17,
            lineHeight: '26px',
            color: HC.mid,
            textAlign: 'center'
          }}
        >
          Sermons, guides, and a way in.
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------------------------
   Pieces.
   -------------------------------------------------------------------------- */

const Eyebrow = ({ children, center }) => (
  <span
    style={{
      fontFamily: FACE.sans,
      fontWeight: 600,
      fontSize: 12,
      lineHeight: '15px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: HC.accent,
      display: 'block',
      textAlign: center ? 'center' : 'left'
    }}
  >
    {children}
  </span>
);

const Rule = ({ width, center }) => (
  <div
    style={{
      width,
      height: 1,
      marginTop: 22,
      marginBottom: center ? 20 : 0,
      backgroundColor: HC.rule,
      alignSelf: center ? 'center' : 'flex-start'
    }}
  />
);
