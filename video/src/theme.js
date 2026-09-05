/* ===========================================================================
   The dark palette, copied from css/tokens.css.

   Copied rather than imported because the video's own chrome (the veil, the
   captions, the two cards) is drawn by React outside the app's iframe, where
   the app's custom properties do not reach. These six numbers are the ones
   that appear outside the phone. If tokens.css moves, move them here too:
   there is a test in the app's preflight for a lot of things, but nothing can
   tell you that a video is the wrong colour.
   =========================================================================== */

export const HC = {
  paper: '#1A1918',   /* --hc-paper, dark: the ground everything sits on */
  cream: '#232120',   /* --hc-cream, dark: raised surfaces */
  ink: '#F2EEE7',     /* --hc-ink, dark: primary text */
  mid: '#9A938A',     /* --hc-mid, dark: secondary text */
  rule: '#3A3633',    /* --hc-rule, dark: hairlines */
  accent: '#C4B5A2',  /* --hc-accent, dark: eyebrows and numerals */
  gold: '#CBAC74'     /* --hc-gold, dark: the mark */
};

/* The two bundled faces, by the names css/fonts.css gives them. */
export const FACE = {
  display: '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  reading: '"Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

/* The phone this is shot on: 6.9 inch iPhone, 440 x 956 logical points.
   Rendered at --scale=3 that is 1320 x 2868, which is the size App Store
   Connect asks for and the same size scripts/make_screenshots.js writes. */
export const PHONE = { width: 440, height: 956 };
