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
import { CHURCH, FACE, HC } from './theme';
import { ramp, track } from './timing';

/* --------------------------------------------------------------------------
   The veil and one line, over the app.
   -------------------------------------------------------------------------- */

/* THE PAGE GOES SOFT BEHIND ITS OWN NAME, it does not go dark.

   This was a rectangle of charcoal at 74 percent, which is a dimmer switch
   rather than a caption treatment: the screen underneath stayed sharp, so
   thirty calendar numbers competed with eight words at full detail and the
   only thing holding them apart was that one of them was darker. Defocusing
   it instead is what every sheet, plinth and disc in the app already does to
   whatever is behind it — see the backdrop-filter rules in css/components.css
   — so this is the app's own idea applied to the one layer the app does not
   draw. The scrim stays, at rather less, because the blur is doing the
   separating and the charcoal only has to carry contrast.

   The blur ramps on the radius rather than on the layer's opacity. Fading a
   backdrop-filter by its own opacity composites a blurred copy over a sharp
   one, which at the halfway point is two pictures a few pixels apart, and
   that reads as a double exposure rather than a focus pull. */
export const Caption = ({ veil, text, rise, eyebrow, line, sub }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {veil > 0.004 ? (
      <AbsoluteFill
        style={{
          backdropFilter: `blur(${(veil * 15).toFixed(2)}px) saturate(${(1 + veil * 0.25).toFixed(3)})`,
          WebkitBackdropFilter: `blur(${(veil * 15).toFixed(2)}px) saturate(${(1 + veil * 0.25).toFixed(3)})`
        }}
      />
    ) : null}
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
      {/* One sentence saying what the page is for. The name alone tells
          somebody who already has the app where they are; this is for the
          person deciding whether to download it.

          NOT SET IN --hc-mid, which is where this started and where it was
          unreadable. That token is for a timestamp under a card on a screen
          somebody is holding still, and this is eight words going past at
          thirty frames a second, half the size again in the cut that sits
          inside a drawn phone. It carries weight rather than colour: near the
          ink the line above uses, a step down in size, and 500 rather than
          400, which the design system calls the lightest weight this face may
          be set at. The hierarchy is still three deep, it is just made of
          size and weight instead of three greys. */}
      {sub ? (
        <p
          style={{
            margin: '14px 0 0',
            maxWidth: 340,
            fontFamily: FACE.reading,
            fontWeight: 500,
            fontSize: 18,
            lineHeight: '26px',
            color: '#E3DDD3'
          }}
        >
          {sub}
        </p>
      ) : null}
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
   The way out.

   The name, and then the two facts somebody who has watched this far actually
   wants: when the church meets and where it is. It used to end on a line about
   the app working without a connection, which is true, and which is a sentence
   written for somebody evaluating software rather than for somebody deciding
   whether to come on Sunday.
   -------------------------------------------------------------------------- */

export const CloseCard = ({ t, frames }) => {
  const mark = ramp(t, 4, 26, 0, 1, 'lift');
  const lift = ramp(t, 0, 30, 0.96, 1, 'lift');
  const details = ramp(t, 26, 48, 0, 1, 'lift');
  const rise = ramp(t, 26, 52, 10, 0, 'lift');

  /* NO FADE OUT AT THE END. The last frame of a preview is the one that sits
     on the store page as the poster once it has played, and a poster frame
     that has faded to charcoal is a black rectangle where a name should be.
     It ends on the lockup, holding. */

  return (
    <AbsoluteFill style={{ backgroundColor: HC.paper }}>
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 40px'
        }}
      >
        <Img
          src={staticFile('app/assets/img/logo-lockup.png')}
          style={{ width: 300, display: 'block', opacity: mark, transform: `scale(${lift})` }}
        />
        <div style={{ opacity: details, transform: `translateY(${rise}px)`, textAlign: 'center' }}>
          <Rule width={64} center />
          <p style={DETAIL}>{CHURCH.times}</p>
          <p style={{ ...DETAIL, color: HC.mid, marginTop: 6 }}>{CHURCH.address}</p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const DETAIL = {
  margin: 0,
  fontFamily: FACE.reading,
  fontWeight: 500,
  fontSize: 16,
  lineHeight: '24px',
  color: HC.ink,
  textAlign: 'center'
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
