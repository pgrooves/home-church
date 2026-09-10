/* ===========================================================================
   The featured video, the frame at the top of Home.

   WHAT CAN GO WRONG HERE, in the order it would hurt. This block is on the
   screen the app opens to, above everything else the church has to say, and
   it is built from a string an admin pasted into a text box. So:

   1. A LINK THAT IS NOT A VIDEO must draw nothing. An empty row, a half
      pasted URL, a playlist: every one of them has to come back as the empty
      string, because the alternative is YouTube's error player at the top of
      Home on a Sunday morning. This is the one that is worth a test on its
      own, because none of it throws.
   2. THE PLAYER'S PARAMETERS. Muted and autoplay together are the only kind
      of autoplay a phone honors, and playsinline is what keeps iOS from
      taking the video full screen the moment the app opens. Lose any one of
      them and the feature is either silent-and-still or a video player the
      app apparently launched into. enablejsapi is what the sound pill talks
      over.
   3. THE SPOT HAS NO WORDS IN IT. The church asked for a video with no text
      around it, which is a thing a later edit can undo without anything
      failing, so it is asserted: no eyebrow, no caption, no section header.
   4. WHERE IT SITS. Between the greeting and Announcements, which is a fact
      about js/screens/home.js and is checked there, in its source, because a
      block that quietly moves under the gathering card is still a block that
      renders.

   No browser. block() is a string builder, exactly like c.cover() in
   tests/series-art.test.js, and what the player does once it is on the glass
   is the browser tests' business.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};
const okTrue = (label, got) => ok(label, !!got, true);

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/* --------------------------------------------------------------- the fakes

   The real components.js, for the same reason series-art.test.js runs it: the
   YouTube id parser it hands over is half of what is under test, and a
   stand-in could disagree with it about what an id is.

   HC.data and HC.store are the two things the module reaches for at load, and
   both are one method deep here. `undefined` for the setting means the row has
   never arrived, which is what makes the fallback testable. */
function boot(value, origin) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.document = { querySelector: () => null };
  // The page under the module. `null` is no page at all, which is this test
  // harness itself and has to not throw.
  if (origin !== null) {
    const url = origin || 'https://pgrooves.github.io';
    sandbox.location = { origin: url, protocol: url.split(':')[0] + ':' };
  }
  sandbox.addEventListener = () => {};
  sandbox.setInterval = () => 0;
  sandbox.clearInterval = () => {};
  sandbox.setTimeout = () => 0;
  vm.createContext(sandbox);

  vm.runInContext(read('js', 'components.js'), sandbox);
  sandbox.HC.data = {
    setting: (key, fallback) => (value === undefined ? fallback : value)
  };
  sandbox.HC.store = { on: () => {} };
  vm.runInContext(read('js', 'featured-video.js'), sandbox);

  return sandbox.HC.featuredVideo;
}

const ID = 'p8aqXrP4wws';

function main() {

  console.log('\n--- the link, in every shape somebody arrives with ---');
  {
    const shapes = {
      'the share link, with its tracking tail':
        'https://youtu.be/' + ID + '?is=fSrYlG7ls3KFNRLP',
      'the watch link': 'https://www.youtube.com/watch?v=' + ID,
      'the embed link': 'https://www.youtube.com/embed/' + ID,
      'a live URL': 'https://www.youtube.com/live/' + ID,
      'a Short': 'https://www.youtube.com/shorts/' + ID,
      'a bare id': ID
    };

    Object.keys(shapes).forEach(label => {
      ok('the id comes out of ' + label, boot(shapes[label]).videoId(), ID);
    });
  }

  console.log('\n--- what must never reach an iframe ---');
  {
    const refused = {
      'an empty row, which is how the church takes the video down': '',
      'a row of spaces': '   ',
      'a playlist, which would draw an error player':
        'https://www.youtube.com/playlist?list=PLuvBAmoZzsCAcademy',
      'the playlist embed path, which is a real eleven character id':
        'https://www.youtube.com/embed/videoseries?list=PLxxxxxxxxxxxxxxxxxx',
      'a Vimeo link, which this spot does not do': 'https://vimeo.com/76979871',
      'half a link': 'https://youtu.be/',
      'a sentence somebody typed': 'the one from Sunday'
    };

    Object.keys(refused).forEach(label => {
      const fv = boot(refused[label]);
      ok('no id from ' + label, fv.videoId(), '');
      ok('and nothing is drawn at all', fv.block(), '');
    });
  }

  console.log('\n--- the player ---');
  {
    const html = boot('https://youtu.be/' + ID).block();

    okTrue('embeds the video', html.indexOf('https://www.youtube.com/embed/' + ID) !== -1);

    /* The four that are load bearing. Muted and autoplay are the pair a
       browser will actually honor; playsinline is what keeps iOS in the app;
       enablejsapi is what the sound pill talks over. */
    okTrue('starts on its own', html.indexOf('autoplay=1') !== -1);
    okTrue('and starts muted, which is the only way that is allowed',
      html.indexOf('mute=1') !== -1);
    okTrue('and stays in the page rather than going full screen',
      html.indexOf('playsinline=1') !== -1);
    okTrue('and can be spoken to, which is how the sound goes on',
      html.indexOf('enablejsapi=1') !== -1);
    okTrue('with the origin the API is supposed to be given',
      html.indexOf('origin=https%3A%2F%2Fpgrooves.github.io') !== -1);
    okTrue('and the iframe is allowed to autoplay by the page as well',
      /allow="[^"]*autoplay/.test(html));

    okTrue('the sound pill is there', html.indexOf('data-action="featured-sound"') !== -1);
    okTrue('and it says what it is for, out loud',
      html.indexOf('Tap for sound') !== -1);
    okTrue('and to a screen reader',
      html.indexOf('aria-label="Play the video with sound"') !== -1);
    ok('and it starts in the muted state, like the player',
      html.indexOf('data-sound="false"') !== -1, true);
  }

  console.log('\n--- the packaged app, where error 153 came from ---');
  {
    /* THE BUG THIS IS HERE FOR. The web build runs on https and the packaged
       app runs on capacitor://localhost. Asking that origin for the JS API
       does not degrade, it replaces the whole player with "Video player
       configuration error. Error 153" and a button out to the YouTube app.
       So the API is asked for where it can be granted and nowhere else. */
    const native = boot('https://youtu.be/' + ID, 'capacitor://localhost');
    const html = native.block();

    okTrue('the video is still embedded', html.indexOf('/embed/' + ID) !== -1);
    okTrue('still muted', html.indexOf('mute=1') !== -1);
    okTrue('still starts on its own', html.indexOf('autoplay=1') !== -1);
    ok('but the API is not asked for, because it cannot be granted there',
      html.indexOf('enablejsapi') !== -1, false);
    ok('and no origin is handed over either',
      html.indexOf('origin=') !== -1, false);

    /* The pill has to be there and has to mean something. Without the API it
       is the rebuild path alone, which needs nothing from YouTube. */
    okTrue('and the pill is still on the frame',
      html.indexOf('data-action="featured-sound"') !== -1);

    // file:// is the same question with a different answer nobody wants.
    ok('a file:// page is treated the same way',
      boot('https://youtu.be/' + ID, 'file://').block().indexOf('enablejsapi') !== -1,
      false);

    // The harness itself: a module loaded with no page under it must not throw.
    okTrue('and a page that does not exist at all still builds a frame',
      boot('https://youtu.be/' + ID, null).block().indexOf('/embed/' + ID) !== -1);
  }

  console.log('\n--- no words around it, which is what was asked for ---');
  {
    const html = boot('https://youtu.be/' + ID).block();

    ok('no eyebrow over it', html.indexOf('hc-eyebrow') !== -1, false);
    ok('no section header', html.indexOf('hc-section') !== -1, false);
    ok('no caption under it', html.indexOf('hc-latest__caption') !== -1, false);

    /* The pill is the only text in the block, and it is on the video rather
       than around it. Everything else is a frame. */
    const words = html.replace(/<[^>]*>/g, '').trim();
    ok('the only words in the whole block are the pill\'s', words, 'Tap for sound');
  }

  console.log('\n--- the shape it is drawn in ---');
  {
    ok('an ordinary video gets the wide frame',
      boot('https://youtu.be/' + ID).block().indexOf('hc-featured--tall') !== -1, false);
    okTrue('a Short is drawn upright instead of letterboxed',
      boot('https://www.youtube.com/shorts/' + ID).block()
        .indexOf('hc-featured--tall') !== -1);
  }

  console.log('\n--- the row it reads, and the floor under it ---');
  {
    const fv = boot(undefined);          // nothing has ever come back from Supabase
    ok('the setting it reads is the one the migration seeds and /new-video writes',
      fv.setting, 'home_featured_video');
    okTrue('and a phone that has never reached Supabase still has a video',
      fv.videoId() !== '');
    okTrue('the migration seeds the same key',
      read('supabase', 'migrations', '0063_home_featured_video.sql')
        .indexOf("'home_featured_video'") !== -1);
    okTrue('and the Admin screen refuses to offer it for deletion',
      read('js', 'screens', 'admin.js').indexOf('home_featured_video: true') !== -1);
  }

  console.log('\n--- where Home puts it ---');
  {
    const home = read('js', 'screens', 'home.js');
    const greeting = home.indexOf('hc-home__greeting');
    const video = home.indexOf('HC.featuredVideo.block()');
    const announcements = home.indexOf("c.sectionHeader('', 'Announcements')");

    okTrue('Home draws it', video !== -1);
    okTrue('under the greeting', greeting !== -1 && greeting < video);
    okTrue('and above Announcements', announcements !== -1 && video < announcements);

    okTrue('and index.html loads the file that draws it',
      read('index.html').indexOf('js/featured-video.js') !== -1);
  }

  console.log('');
  console.log(pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
}

main();
