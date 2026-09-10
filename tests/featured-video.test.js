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
function boot(value, origin, base) {
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
  /* Keyed by name rather than answering every setting with the same string.
     That is not tidiness: js/components.js reads `home_embed_base` through
     this same call, and a fake that handed it the video's link would point
     the wrapper at youtu.be and pass anyway. */
  sandbox.HC.data = {
    setting: (key, fallback) => {
      if (key === 'home_featured_video') return value === undefined ? fallback : value;
      if (key === 'home_embed_base') return base === undefined ? fallback : base;
      return fallback;
    }
  };
  sandbox.HC.store = { on: () => {} };
  vm.runInContext(read('js', 'featured-video.js'), sandbox);

  return sandbox.HC.featuredVideo;
}

// components.js alone, on a named origin, for the URL builder every player in
// the app shares.
function componentsAt(origin) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.location = { origin: origin, protocol: origin.split(':')[0] + ':' };
  vm.createContext(sandbox);
  vm.runInContext(read('js', 'components.js'), sandbox);
  return sandbox.HC.components;
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
    /* THE BUG THIS IS HERE FOR, and it was every YouTube player in the app,
       not only this one. The web build runs on https and the packaged app
       runs on capacitor://localhost, where a document sends no referrer at
       all; YouTube answers a player request with no referrer with "Video
       player configuration error. Error 153" and a button out to the YouTube
       app. Nothing in the page can fix that, so on that origin the frame
       holds embed.html, which is published on https and holds YouTube. */
    const native = boot('https://youtu.be/' + ID, 'capacitor://localhost');
    const html = native.block();

    ok('YouTube is not framed directly, because it cannot work there',
      html.indexOf('youtube.com/embed') !== -1, false);
    okTrue('the wrapper is framed instead',
      html.indexOf('https://pgrooves.github.io/home-church/embed.html') !== -1);
    okTrue('and it is told which video', html.indexOf('v=' + ID) !== -1);
    okTrue('and to start muted', html.indexOf('mute=1') !== -1);

    /* The pill has to be there and has to mean something. Through the wrapper
       it is one message further away and still one tap. */
    okTrue('and the pill is still on the frame',
      html.indexOf('data-action="featured-sound"') !== -1);

    // file:// is the same question with the same answer: no referrer either.
    okTrue('a file:// page is wrapped too',
      boot('https://youtu.be/' + ID, 'file://').block().indexOf('embed.html') !== -1);

    // The harness itself: a module loaded with no page under it must not throw.
    okTrue('and a page that does not exist at all still builds a frame',
      boot('https://youtu.be/' + ID, null).block().indexOf('embed.html') !== -1);

    // A Short is still a Short on the way through the wrapper.
    okTrue('the upright shape survives the wrapper',
      boot('https://www.youtube.com/shorts/' + ID, 'capacitor://localhost')
        .block().indexOf('hc-featured--tall') !== -1);
  }

  console.log('\n--- moving the wrapper without a build ---');
  {
    /* The URL of a page published somewhere else is the one part of this that
       can be wrong from inside a shipped app, so it is a row. What must not
       happen is a bad row taking video down: anything that is not an https
       URL falls back to the constant rather than being pasted into a src. */
    const moved = boot('https://youtu.be/' + ID, 'capacitor://localhost',
      'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/app');
    okTrue('a row that names another folder is followed',
      moved.block().indexOf(
        'https://ibqkumxfltfiuqevviji.supabase.co/storage/v1/object/public/app/embed.html'
      ) !== -1);

    /* The shape a pasted URL actually arrives in. A chat client, a mail
       client and a markdown editor all wrap one in angle brackets, and the
       box this row is edited in is a text field on a pastor's phone. Refusing
       the value would fall back to the constant and look like nothing
       happened, on phones only. */
    okTrue('angle brackets round a pasted URL are not part of it',
      boot('https://youtu.be/' + ID, 'capacitor://localhost',
        '<https://ibqkumxfltfiuqevviji.supabase.co/x>').block()
        .indexOf('https://ibqkumxfltfiuqevviji.supabase.co/x/embed.html') !== -1);

    okTrue('a trailing slash does not double up',
      boot('https://youtu.be/' + ID, 'capacitor://localhost',
        'https://pgrooves.github.io/home-church/').block()
        .indexOf('home-church/embed.html') !== -1);

    [['an empty row', ''], ['http, which would be mixed content', 'http://example.com'],
     ['a sentence', 'wherever the video lives'],
     ['something with a quote in it', 'https://x/"><img onerror=x']].forEach(bad => {
      okTrue('falls back to the built-in wrapper on ' + bad[0],
        boot('https://youtu.be/' + ID, 'capacitor://localhost', bad[1]).block()
          .indexOf('https://pgrooves.github.io/home-church/embed.html') !== -1);
    });
  }

  console.log('\n--- the one URL builder every player in the app uses ---');
  {
    /* c.youtubeEmbedUrl() is shared with the Practices sessions, Alpha and an
       announcement's video through js/app.js, which is the whole point: they
       all had error 153 and they all get the same answer. */
    const web = componentsAt('https://pgrooves.github.io');
    const app = componentsAt('capacitor://localhost');

    okTrue('a tapped video plays with sound on the web',
      web.youtubeEmbedUrl({ id: ID, sound: true }).indexOf('mute=0') !== -1);
    okTrue('and with sound through the wrapper too',
      app.youtubeEmbedUrl({ id: ID, sound: true }).indexOf('mute=0') !== -1);

    okTrue('a playlist is a playlist on the web',
      web.youtubeEmbedUrl({ list: 'PLabcdefghij', sound: true })
        .indexOf('/embed/videoseries?list=PLabcdefghij') !== -1);
    okTrue('and is handed to the wrapper as one',
      app.youtubeEmbedUrl({ list: 'PLabcdefghij', sound: true })
        .indexOf('embed.html?list=PLabcdefghij') !== -1);

    ok('a playlist pasted as a video id is still refused',
      web.youtubeEmbedUrl({ id: 'videoseries' }), '');
    ok('and so is a made up id', web.youtubeEmbedUrl({ id: 'nope' }), '');
    ok('and so is nothing at all', web.youtubeEmbedUrl({}), '');

    /* The fallback the featured frame uses when the wrapper never answers:
       YouTube directly, which is the player this started with. */
    okTrue('direct skips the wrapper even where the wrapper would be used',
      app.youtubeEmbedUrl({ id: ID, direct: true })
        .indexOf('https://www.youtube.com/embed/' + ID) === 0);

    okTrue('and picking up mid video survives both paths',
      web.youtubeEmbedUrl({ id: ID, start: 42 }).indexOf('start=42') !== -1 &&
      app.youtubeEmbedUrl({ id: ID, start: 42 }).indexOf('start=42') !== -1);
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
