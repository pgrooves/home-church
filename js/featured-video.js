/* ==========================================================================
   Home Church, the featured video
   The one frame between the greeting and Announcements on Home. No heading
   over it, no caption under it, no label on it: a video, the width of the
   screen, that has already started playing by the time anybody has read
   their own name at the top.
   ==========================================================================

   WHAT IT IS FOR. One video the church wants everybody to see this week,
   in the first thing anybody looks at. It plays on mute the moment Home is
   drawn, which is the only kind of autoplay a phone will honor and the only
   kind that is polite in a room with other people in it, and the pill in the
   corner of the frame turns the sound on with one tap.

   WHERE THE LINK LIVES. `app_settings.home_featured_video`, a row like every
   other switch the church can flip without a build, read here through
   HC.data.setting(). Paste any shape of YouTube link into it and the eleven
   characters in the middle are what gets embedded; empty it and this whole
   block renders nothing at all, which is what Home looked like before this
   file existed. `/new-video <link>` is the command that writes the row. See
   migration 0063 and .claude/commands/new-video.md.

   THE FALLBACK IS A REAL VIDEO AND THAT IS DELIBERATE. Every other read
   through HC.data.setting() falls back to the behaviour the app had before
   the setting existed, which for a text row is usually ''. Here that would
   mean a phone that has never reached Supabase, on its first launch, showing
   nothing in the spot the church is now writing for. The catalogue cache is
   read synchronously before the first paint, so every launch after the first
   one already knows the current link; FALLBACK only ever shows on a genuinely
   cold install, and it is better for that install to show last season's video
   than a gap. Move it when the church moves on for good.

   WHY AN IFRAME, WHEN THIS PROJECT HAS REFUSED ONE ON HOME BEFORE. Migration
   0026 says an announcement's YouTube link is drawn as a link out rather than
   embedded, for exactly the reason this file has to answer: an iframe from
   Google on the screen the app opens to. The trade is different now because
   the ask is different. A featured video that opens the YouTube app is not a
   featured video, it is a way out of this one, and the church asked for
   something that plays here. It is one frame, on one screen, from a link an
   admin typed, under the same `frame-src` the two players in index.html have
   always had. Nothing else on Home changed, and an empty setting takes the
   iframe off the screen entirely.

   THE SOUND, AND WHY THERE ARE TWO WAYS TO TURN IT ON. The tidy way is
   YouTube's own postMessage API: `unMute` reaches the player that is already
   running and the video carries on from where it was, mid-sentence, with
   sound. That path is only taken when the player has answered the handshake
   below, because a command posted at a player that is not listening fails
   silently and a person tapping a button that does nothing is the worst
   outcome here. When there was no answer, the frame is rebuilt with the
   sound on and `start` set to where the video had got to, which always works
   and costs a reload nobody asked for. One of the two is always available.
   -------------------------------------------------------------------------- */

(function (HC) {
  'use strict';

  var c = HC.components;

  // The row the church writes, and the video that ships in the app.
  var SETTING = 'home_featured_video';
  var FALLBACK = 'https://youtu.be/p8aqXrP4wws';

  // The player's origin, for both halves of the conversation: what we post to
  // and what we refuse to listen to anything else from.
  var ORIGIN = 'https://www.youtube.com';

  function link() {
    return String(HC.data.setting(SETTING, FALLBACK) || '').trim();
  }

  /* c.youtubeId() is the guard as well as the parser. It answers '' for
     anything that is not eleven characters of base64url, which is what keeps
     a pasted playlist, a half typed link and an empty row all from reaching
     an iframe src. Nothing else in this file has to check. */
  function videoId() {
    return c.youtubeId(link());
  }

  /* A Short is filmed on a phone held upright and letterboxes into a 16:9
     frame with half the screen black on either side of it. The link says
     which it is, so nobody has to remember to set a shape. */
  function tall() {
    return /\/shorts\//i.test(link());
  }

  function src(id, opts) {
    opts = opts || {};
    return ORIGIN + '/embed/' + id +
      '?autoplay=1' +
      '&mute=' + (opts.sound ? '0' : '1') +
      // playsinline is not a preference on iOS. Without it the video goes
      // full screen the instant it starts, which on the screen the app opens
      // to would read as the app having opened into a video player.
      '&playsinline=1' +
      '&rel=0&modestbranding=1' +
      // The handshake below is only possible with this on.
      '&enablejsapi=1' +
      (opts.start ? '&start=' + opts.start : '');
  }

  /* ------------------------------------------------------------- the markup */

  function soundButton(sound) {
    return '' +
      '<button type="button" class="hc-featured__sound" data-action="featured-sound" ' +
        'data-sound="' + (sound ? 'true' : 'false') + '" ' +
        'aria-label="' + (sound ? 'Mute the video' : 'Play the video with sound') + '">' +
        c.icon(sound ? 'sound' : 'soundOff', 'hc-featured__soundicon') +
        '<span class="hc-featured__soundlabel">' +
          (sound ? 'Sound on' : 'Tap for sound') +
        '</span>' +
      '</button>';
  }

  /* Home calls this and drops what comes back straight into the page. An
     empty string is a real answer and means the church has no featured video
     this week: no frame, no button, no gap where a heading would have been. */
  function block() {
    var id = videoId();
    if (!id) return '';

    return '' +
      '<div class="hc-featured' + (tall() ? ' hc-featured--tall' : '') + '" data-featured>' +
        '<div class="hc-featured__frame">' +
          '<iframe class="hc-featured__player" data-featured-player ' +
            'src="' + src(id, {}) + '" ' +
            'title="Featured video" ' +
            'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" ' +
            'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
        '</div>' +
        soundButton(false) +
      '</div>';
  }

  /* ------------------------------------------------------------ the player

     One player at a time, because there is one Home. Every field here is
     about the frame currently on the glass and every one of them is reset
     when a new render puts a new frame there. */

  var frame = null;      // the iframe on screen
  var ready = false;     // it answered the handshake, so commands will land
  var sound = false;     // what the button currently says
  var reported = null;   // what the player last said about its own sound
  var at = 0;            // the last position it reported, in seconds
  var since = 0;         // when this frame was created, the fallback clock
  var pokes = 0;
  var poker = null;

  function post(func, args) {
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(JSON.stringify({
        event: 'command', func: func, args: args || []
      }), ORIGIN);
    } catch (err) {
      // A frame that has gone away mid tap. The reload path still works.
    }
  }

  /* YouTube's players do not volunteer anything. They answer a page that has
     said it is listening, and they say nothing at all until then, so this is
     posted every quarter second until the player replies or until it is clear
     it never will. Ten tries is two and a half seconds, which is longer than
     an embed takes to boot on a bad connection and short enough that the
     first tap on the pill is never waiting on it: the reload path below is
     what an unanswered handshake falls through to. */
  function listen() {
    stop();
    pokes = 0;
    poker = window.setInterval(function () {
      pokes += 1;
      if (ready || pokes > 10 || !frame) { stop(); return; }
      if (!frame.contentWindow) return;
      try {
        frame.contentWindow.postMessage(JSON.stringify({
          event: 'listening', id: 'hc-featured', channel: 'widget'
        }), ORIGIN);
      } catch (err) {
        stop();
      }
    }, 250);
  }

  function stop() {
    if (poker) window.clearInterval(poker);
    poker = null;
  }

  /* Anything the player says about itself. Two things are worth keeping: where
     it has got to, which is what makes a rebuilt frame pick up rather than
     start over, and whether it is muted, which is the only honest source for
     what the pill should say. Somebody unmuting from YouTube's own controls
     comes through here too, and the pill follows them. */
  function onMessage(evt) {
    if (evt.origin !== ORIGIN) return;
    if (!frame || evt.source !== frame.contentWindow) return;

    var data;
    try {
      data = JSON.parse(evt.data);
    } catch (err) {
      return;                       // not ours, or not JSON. Nothing to do.
    }
    if (!data) return;

    if (data.event === 'onReady' || data.event === 'initialDelivery' ||
        data.event === 'infoDelivery') {
      ready = true;
    }

    var info = data.info || {};
    if (typeof info.currentTime === 'number') at = info.currentTime;
    if (typeof info.muted === 'boolean') {
      reported = !info.muted;
      paint(reported);
    }
  }

  function paint(withSound) {
    sound = !!withSound;
    var button = document.querySelector('[data-featured] .hc-featured__sound');
    if (!button) return;
    if ((button.getAttribute('data-sound') === 'true') === sound) return;
    button.outerHTML = soundButton(sound);
  }

  // Where the video has got to. The player's own number when it is talking,
  // and the clock since the frame was built when it is not. A second is taken
  // off so a rebuilt frame lands just before the word that was being said
  // rather than just after it.
  function elapsed() {
    var seconds = at || (Date.now() - since) / 1000;
    return Math.max(0, Math.floor(seconds) - 1);
  }

  function rebuild(withSound) {
    var id = videoId();
    if (!id || !frame) return;
    var start = elapsed();
    frame.src = src(id, { sound: withSound, start: start });
    ready = false;
    reported = null;
    at = 0;
    since = Date.now();
    listen();
  }

  /* The pill. Called by the action handler in js/app.js, which is where every
     tap in this app is routed. */
  function toggleSound(button) {
    if (!frame) adopt();
    if (!frame) return;

    var want = button.getAttribute('data-sound') !== 'true';

    HC.native.tap('Light');
    paint(want);

    if (!ready) {
      // Nobody is listening on the other side. Rebuild, which needs no API
      // and no permission beyond the tap that just happened.
      rebuild(want);
      return;
    }

    post(want ? 'unMute' : 'mute');
    if (want) post('setVolume', [100]);
    // A muted autoplay that a browser refused is a player sitting at zero.
    // The same tap that asks for sound asks it to start.
    post('playVideo');

    /* The player is meant to answer within a frame or two, and it says what
       it is now doing rather than what it was asked to do. If it has not
       agreed by the time this fires, the command did not land and the frame
       gets rebuilt, which always works. */
    window.setTimeout(function () {
      if (reported !== want) rebuild(want);
    }, 900);
  }

  /* Take hold of whatever frame is on the glass now. Called on every view
     change rather than by the screen that drew it, so a repaint of Home,
     a swipe back onto it, and the first launch all arrive the same way.
     A frame that is already the one we hold is left alone: a repaint that
     did not touch this block should not restart the video in it. */
  function adopt() {
    var found = document.querySelector('[data-featured-player]');
    if (!found) {
      stop();
      frame = null;
      return;
    }
    if (found === frame) return;

    frame = found;
    ready = false;
    reported = null;
    sound = false;
    at = 0;
    since = Date.now();
    listen();
  }

  window.addEventListener('message', onMessage);

  HC.store.on('view', function (route) {
    if (route && route.name === 'home') adopt();
    else { stop(); frame = null; }
  });

  HC.featuredVideo = {
    block: block,
    toggleSound: toggleSound,
    // For tests, and for anybody asking what Home is about to draw.
    videoId: videoId,
    setting: SETTING,
    fallback: FALLBACK
  };
})(window.HC = window.HC || {});
