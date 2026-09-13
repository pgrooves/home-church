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

   ERROR 153, AND WHY THERE ARE TWO FRAMES. The packaged app does not run on
   https. It runs on `capacitor://localhost`, and a document on a scheme that
   is not http or https sends no referrer, by specification. YouTube's player
   will not configure itself without one: the frame becomes "Video player
   configuration error. Error 153" over two buttons, one of which is Watch on
   YouTube. A block whose whole purpose is a video that plays here, ending as
   a door out to the YouTube app, is the worst version of this feature that
   could ship, and it shipped. It was not this block's fault and not this
   block's alone: every YouTube player in the app had it, on every phone,
   while the web build played all of them perfectly.

   Nothing in this file could fix that, because no referrer policy can invent
   an https referrer and iOS will not serve a bundled app over https. So the
   player moved to a page that has an https origin of its own: embed.html at
   the repo root, published by the same GitHub Pages build the web version
   runs on. On a phone this frame holds that page and that page holds
   YouTube. c.youtubeEmbedUrl() decides which, by asking what origin the app
   is on rather than what device it is, and every other player in the app now
   goes through the same call.

   THE SOUND SURVIVED THE MOVE. The wrapper holds the YouTube API on an
   origin where the API works, so the pill's message goes one hop further and
   the video unmutes in place exactly as it does on the web. The rebuild path
   is still underneath both, for a frame that answers nothing.
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

  /* Both players in one call, and which one it is depends on the origin this
     app is running on rather than on the phone. See the note over
     c.youtubeEmbedUrl(): on https it is YouTube directly, on
     capacitor://localhost it is embed.html, which is the only way a player
     ever gets a referrer to show. `direct` forces the first, which is what
     this file falls back to if the wrapper never answers. */
  function src(id, opts) {
    opts = opts || {};
    return c.youtubeEmbedUrl({
      id: id,
      sound: !!opts.sound,
      start: opts.start,
      direct: !!opts.direct
    });
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
  var wrapped = false;   // it is embed.html rather than YouTube itself
  var ready = false;     // somebody is listening, so a command will land
  var sound = false;     // what the button currently says
  var reported = null;   // what the player last said about its own sound
  var at = 0;            // the last position it reported, in seconds
  var since = 0;         // when this frame was created, the fallback clock
  var pokes = 0;
  var poker = null;
  var rescue = null;     // the wrapper has this long to say it is there

  /* Ask for the sound, in whichever language the frame speaks.

     Through the wrapper it is one message, because embed.html is holding the
     YouTube API on an origin where the API works and is doing the talking.
     Direct, it is YouTube's own postMessage commands. Either way this only
     reaches a player that is listening; the rebuild below is what covers the
     case where none is. */
  function askSound(on) {
    if (!frame || !frame.contentWindow) return;
    try {
      if (wrapped) {
        frame.contentWindow.postMessage({ hc: 'sound', on: !!on }, c.embedOrigin());
        return;
      }
      frame.contentWindow.postMessage(JSON.stringify({
        event: 'command', func: on ? 'unMute' : 'mute', args: []
      }), ORIGIN);
      if (on) {
        frame.contentWindow.postMessage(JSON.stringify({
          event: 'command', func: 'setVolume', args: [100]
        }), ORIGIN);
      }
      // A muted autoplay a browser refused is a player sitting still. The
      // same tap that asks for sound asks it to start.
      frame.contentWindow.postMessage(JSON.stringify({
        event: 'command', func: 'playVideo', args: []
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
     what an unanswered handshake falls through to.

     Not run for the wrapper, which does this handshake itself, on its own
     origin, and reports what it hears. */
  function listen() {
    stop();
    if (wrapped || !c.embedOrigin || !ownOrigin()) return;
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
    if (rescue) window.clearTimeout(rescue);
    rescue = null;
  }

  function ownOrigin() {
    var loc = window.location;
    if (!loc || (loc.protocol !== 'https:' && loc.protocol !== 'http:')) return '';
    return loc.origin || '';
  }

  /* Anything the frame says about itself. Two things are worth keeping: where
     the video has got to, which is what makes a rebuilt frame pick up rather
     than start over, and whether it is muted, which is the only honest source
     for what the pill should say. Somebody unmuting from YouTube's own
     controls comes through here too, and the pill follows them.

     Two dialects, because there are two frames. embed.html speaks in plain
     objects with an `hc` on them; YouTube speaks in JSON strings. The origin
     is not the test -- the wrapper's origin is wherever it is published, and
     an app on a custom scheme cannot always say what its own is -- so what is
     checked is that this came from the window we put on the glass, which
     nothing else can claim. */
  function onMessage(evt) {
    if (!frame || evt.source !== frame.contentWindow) return;

    var data = evt.data;

    // The wrapper.
    if (data && typeof data === 'object' && data.hc) {
      if (data.hc === 'here' || data.hc === 'ready') {
        // It exists, so the fallback to a direct frame is called off.
        if (rescue) { window.clearTimeout(rescue); rescue = null; }
        if (data.hc === 'ready') ready = true;
        return;
      }
      if (data.hc === 'state') {
        if (typeof data.time === 'number') at = data.time;
        if (typeof data.sound === 'boolean') {
          reported = data.sound;
          paint(reported);
        }
      }
      return;
    }

    // YouTube itself.
    if (evt.origin !== ORIGIN) return;
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
    /* `direct` follows whatever this frame already is, rather than asking the
       question again. It matters after a fallback: the wrapper was not there
       four seconds ago, and a rebuild that quietly went back to it would take
       a working YouTube error message and make it a black rectangle, one tap
       after the person asked for sound. */
    frame.src = src(id, { sound: withSound, start: start, direct: !wrapped });
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

    askSound(want);

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

    stop();
    frame = found;
    wrapped = c.embedIsWrapped();
    ready = false;
    reported = null;
    sound = false;
    at = 0;
    since = Date.now();
    listen();

    /* THE ONE THING THAT CANNOT BE TESTED FROM A DESK. The wrapper is a page
       at a URL, published somewhere else, and a URL can be wrong: Pages off,
       the repo renamed, `home_embed_base` pointed at a folder that has no
       embed.html in it. A frame like that is a black rectangle at the top of
       Home that says nothing at all.

       embed.html announces itself the moment it runs, so silence here means
       it is not there, and silence is answered by framing YouTube directly.
       That is the player this started with, error 153 and all -- which is a
       poor video and still a better one than a black box, because it says
       what is wrong and offers a way to watch.

       EIGHT SECONDS, WHICH IS LONGER THAN IT SOUNDS. The wrapper is seven
       kilobytes and speaks before it has fetched anything else, so this is
       not waiting on YouTube. It is waiting on a church car park's worth of
       signal, and cutting it short would turn a slow video into a broken one
       for the person with two bars. Nothing is waiting on this timer: the
       video is already loading behind it and the pill already works. */
    if (!wrapped) return;
    rescue = window.setTimeout(function () {
      rescue = null;
      if (!frame) return;
      var id = videoId();
      if (!id) return;
      wrapped = false;
      frame.src = src(id, { direct: true });
      since = Date.now();
      listen();
    }, 8000);
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
