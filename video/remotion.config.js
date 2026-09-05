/* ===========================================================================
   Remotion, configured for this piece.

   Only the studio and the CLI read this file. Anything that has to be true of
   a render no matter who starts it is passed on the command line in
   package.json instead, where it can be read next to the script that uses it.
   =========================================================================== */

import { Config } from '@remotion/cli/config';

/* THE APP NEEDS A GPU, or something pretending convincingly to be one. The tab
   bar and the pull-to-refresh disc are glass: backdrop-filter over a blurred
   copy of whatever is behind them. Chromium falls back to no blur at all when
   it cannot composite, which does not error, it just quietly renders the bar
   as a flat panel with the page legible straight through it. angle puts
   SwiftShader underneath, which blurs correctly on a machine with no display
   attached, which is every machine this is likely to render on. */
Config.setChromiumOpenGlRenderer('angle');

/* Remotion downloads its own Chrome Headless Shell the first time it renders,
   which is the right default and fails behind a network that will not let it.
   Point HC_CHROME at a headless shell already on the machine and it will use
   that instead. It has to be a headless shell or a Chrome new enough for the
   new headless mode: an ordinary older Chrome binary exits immediately on the
   --headless flag Remotion passes, with a message about old headless being
   removed that reads like a crash.

     HC_CHROME=/path/to/chrome-headless-shell npm run render */
if (process.env.HC_CHROME) {
  Config.setBrowserExecutable(process.env.HC_CHROME);
}

/* H.264 in an MP4. App Store Connect takes .mp4, .mov and .m4v for an app
   preview, and this is the one that also plays everywhere else. */
Config.setCodec('h264');

/* Three times the composition's logical size. See the header of src/Root.jsx
   for why the compositions are 440 points wide and not 1320 pixels. */
Config.setScale(3);

Config.setOverwriteOutput(true);
