/* ===========================================================================
   The app, running.

   This component is the reason the video is not a slideshow. It mounts one
   iframe, loads the real Home Church into it from public/app, and then hands
   it to drive.js one frame at a time. Everything inside the phone is the
   shipping HTML, the shipping CSS and the shipping JavaScript, painting live.
   Nothing here is a screenshot, a mockup, or a rebuild of a screen in React.

   WHY THAT IS WORTH THE TROUBLE. A video made of stills goes stale the week
   the app changes and nobody can tell by looking. This one cannot: it opens
   the same guide the app would open, off the same seed in js/data.js, through
   the same router. If a section stops folding, the video stops folding.

   ONE IFRAME FOR THE WHOLE PIECE, not one per scene. Booting the app costs a
   second or so, and Remotion renders with several browser tabs at once, so a
   per-scene iframe would pay that cost dozens of times. It is also more
   honest: this is one session of the app, walked through five screens, the way
   a person walks through it.

   THREE THINGS ARE DONE TO IT ON THE WAY IN, all in boot():

     the splash is removed   It has already done its job by the time anything
                             is rendered, and it is a fixed layer over
                             everything until it decides to leave.
     motion is switched off  Every CSS transition and animation in the app.
                             See the header of drive.js: they run on the wall
                             clock, and a render has no wall clock.
     a profile is seeded     Sarah, with leader mode on, because an app with no
                             name in it greets a stranger and a store page
                             should show the app people actually use. The same
                             seed scripts/make_screenshots.js uses.
   =========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import { stage } from './stage';
import { PHONE } from './theme';

/* Motion, off. `animation: none` rather than a zero duration on purpose: a
   zeroed animation still applies its fill mode, which on the app's view enter
   would leave a screen parked at the opacity the first keyframe asks for. */
const FREEZE = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
  html, .hc-scroll { scroll-behavior: auto !important; }
  /* The caret in the journal's writing surface blinks on its own clock. */
  * { caret-color: transparent !important; }
`;

export const AppStage = ({ frame, apply, scale = 1 }) => {
  const iframe = useRef(null);
  const win = useRef(null);
  const ctx = useRef({ guideId: null });
  const pending = useRef(frame);
  const [handle] = useState(() =>
    delayRender('Booting Home Church inside the composition', { timeoutInMilliseconds: 120000 })
  );

  useEffect(() => {
    let dropped = false;
    boot(iframe.current)
      .then((booted) => {
        if (dropped) return;
        win.current = booted;
        ctx.current.guideId = firstGuideId(booted);
        /* The frame that was asked for while the app was still coming up has
           already been through the layout effect below and found nothing to
           drive. Drive it now, before the shutter opens. */
        if (pending.current != null) apply(booted, pending.current, ctx.current);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
    return () => { dropped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  /* Layout effect rather than an effect: this runs after React has written the
     DOM and before the browser paints, which is the only window where a change
     is guaranteed to be in the picture Remotion takes of this frame. */
  useLayoutEffect(() => {
    pending.current = frame;
    if (!win.current) return;
    apply(win.current, frame, ctx.current);
  });

  return (
    <div
      style={{
        width: PHONE.width * scale,
        height: PHONE.height * scale,
        overflow: 'hidden',
        /* The app paints its own ground; this is only here so a frame dropped
           during boot is warm charcoal rather than white. */
        backgroundColor: '#1A1918'
      }}
    >
      <iframe
        ref={iframe}
        src={staticFile('app/index.html')}
        title="Home Church"
        scrolling="no"
        style={{
          width: PHONE.width,
          height: PHONE.height,
          border: 0,
          display: 'block',
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      />
    </div>
  );
};

async function boot(el) {
  await loaded(el);
  const win = el.contentWindow;

  /* js/app.js builds the shell, and nothing can be driven until it has. */
  await until(() => win.HC && win.HC.router && win.HC.store && win.document.getElementById('hc-tabbar'));

  const style = win.document.createElement('style');
  style.id = 'hc-video-freeze';
  style.textContent = FREEZE;
  win.document.head.appendChild(style);

  const splash = win.document.getElementById('hc-splash');
  if (splash) splash.remove();

  win.HC.store.updateProfile({
    firstName: 'Sarah',
    lastName: 'B',
    leaderMode: true,
    theme: 'dark'
  });

  /* updateProfile stores the choice and tells the app about it. It does not
     paint: writing `theme: 'dark'` and stopping leaves the app in whatever the
     renderer's own colour scheme is, which on a headless Chromium with no
     display attached is light. This is the line js/app.js runs when somebody
     taps the moon in the top bar. */
  win.HC.store.applyPreferences();

  /* A room, a journal and the account both of them need. See src/stage.js for
     what is furniture and what is the app. */
  stage(win);

  /* Redraw whatever the app opened on. It painted Home before any of the above
     happened, which is a Home that greets a stranger: js/screens/home.js reads
     the first name at render time and writes "Welcome home." when there is not
     one. Every screen after this is drawn from a router change and picks the
     profile up on its own; this is only the first. */
  win.HC.router.go(win.HC.router.current() || { name: 'home' }, {
    force: true, animate: false, replace: true
  });

  /* Manrope and Poppins ship with the app, so this resolves immediately. It is
     here for the case where it does not: a frame drawn in the fallback system
     sans is a frame of somebody else's app. */
  await win.document.fonts.ready;

  return win;
}

function loaded(el) {
  return new Promise((resolve) => {
    if (el.contentWindow && el.contentDocument && el.contentDocument.readyState === 'complete') {
      return resolve();
    }
    el.addEventListener('load', () => resolve(), { once: true });
  });
}

function until(test, timeout = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let ok = false;
      try { ok = test(); } catch (err) { ok = false; }
      if (ok) return resolve();
      if (Date.now() - started > timeout) {
        return reject(new Error('The app did not finish starting inside the iframe.'));
      }
      setTimeout(tick, 16);
    };
    tick();
  });
}

function firstGuideId(win) {
  try {
    const guides = win.HC.data.guidesByDate();
    return guides && guides.length ? guides[0].id : null;
  } catch (err) {
    return null;
  }
}
