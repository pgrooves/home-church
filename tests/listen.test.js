/* ===========================================================================
   What the link to a message's audio is allowed to say.

   THE SEAM IS THE WEEK BETWEEN THE GUIDE AND THE EPISODE. /new-guide creates
   the podcast row on the Thursday, so the message is on Listen, on the Worship
   header, and behind an "Open the group guide" link days before there is any
   audio to open. HC.data.episodeUrl answers with the show for those rows,
   because sending someone to the show is never wrong, only less specific, and
   that is the right destination for a tap. It is the wrong sentence: a button
   reading "Listen on Spotify" that lands on a show page with no such episode
   on it is the app promising something it has not got.

   The way this breaks is not a crash. It is somebody reading the label off the
   URL again, the way it used to be read, because the fallback happens to point
   at Spotify and the check looks like it works. It does work, on every row
   except the one that is still waiting, which is the only row this distinction
   exists for.

   AND IT IS ONE ANSWER FOR TWO SCREENS. Listen draws this link under every
   episode and Worship draws it on the Sunday header. Two copies of the wording
   is one screen saying the message is up while the other says it is coming.

   No browser, and no screens: the wording lives in js/data.js precisely so it
   can be checked without one. Booted exactly as tests/worship.test.js boots,
   through refresh() rather than the cache, so the real mappers run.
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

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => Array.from(map.keys())[i],
    get length() { return map.size; },
    _map: map
  };
}

function boot(tables) {
  const storage = fakeStorage();

  function respond(url) {
    const table = /rest\/v1\/([a-z_]+)/.exec(url)[1];
    const rows = tables[table];
    if (!rows) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(rows) });
  }

  const sandbox = {
    window: {
      localStorage: storage,
      fetch: (url) => respond(String(url)),
      AbortController: null,
      setTimeout: () => 0,
      clearTimeout: () => {}
    },
    console
  };
  sandbox.window.window = sandbox.window;
  sandbox.setTimeout = sandbox.window.setTimeout;
  sandbox.clearTimeout = sandbox.window.clearTimeout;
  sandbox.fetch = sandbox.window.fetch;
  vm.createContext(sandbox);

  vm.runInContext(read('js', 'data.js'), sandbox);
  vm.runInContext(read('js', 'store.js'), sandbox);
  vm.runInContext(read('js', 'config.js'), sandbox);
  vm.runInContext(read('js', 'content.js'), sandbox);

  const HC = sandbox.window.HC;
  return HC.content.refresh().then(() => HC);
}

/* The three states the catalogue is really in. The newer episodes link
   straight into Spotify, the back catalogue links each episode on the podcast
   host, and the most recent Sunday has a guide and no audio yet. */
const PODCASTS = [
  { id: 'sermon-not-yet', title: 'Served His Generation', preached_on: '2026-08-30',
    guide_id: 'guide-not-yet', episode_url: null },
  { id: 'sermon-on-spotify', title: 'What I Want Most for You', preached_on: '2026-08-23',
    guide_id: null, episode_url: 'https://open.spotify.com/episode/6bOnsRF82rB3IkrVo1cdt8' },
  { id: 'sermon-on-host', title: 'Who’s In Your Corner?', preached_on: '2026-08-09',
    guide_id: null, episode_url: 'https://www.buzzsprout.com/2420925/episodes/19623061-who-s' }
];

async function main() {

  console.log('\n--- a message whose audio has not posted ---');
  {
    const HC = await boot({ podcasts: PODCASTS });
    const waiting = HC.data.getSermon('sermon-not-yet');

    ok('the row is there, and it knows it has no episode behind it',
      HC.data.hasEpisode(waiting), false);

    ok('so the link says so rather than naming a message it cannot play',
      HC.data.episodeLabel(waiting), 'Audio coming soon!');

    /* The whole point of the change: the words move, the tap does not. */
    ok('and it still goes somewhere, the show, which is where you would wait',
      HC.data.episodeUrl(waiting), HC.data.podcast.showUrl);

    /* THE REGRESSION. The fallback URL is a Spotify URL, so a label read off
       the URL calls this one "Listen on Spotify" and reads perfectly right
       while being the one row it is wrong about. */
    ok('the fallback being a Spotify link is not the same as having an episode',
      HC.data.episodeUrl(waiting).indexOf('spotify.com') !== -1
        && !HC.data.hasEpisode(waiting),
      true);

    /* Monday. /new-podcast writes episode_url and nothing else, and every
       screen that draws this link changes with it. */
    waiting.episodeUrl = 'https://open.spotify.com/episode/44dxewnlT2ehcOThsalvtm';
    ok('filling in the episode is the only thing that has to happen',
      HC.data.episodeLabel(waiting), 'Listen on Spotify');
    ok('and the tap follows it off the show and onto the episode',
      HC.data.episodeUrl(waiting),
      'https://open.spotify.com/episode/44dxewnlT2ehcOThsalvtm');
  }

  console.log('\n--- a message that has posted names where it lands ---');
  {
    const HC = await boot({ podcasts: PODCASTS });

    ok('an episode on Spotify says Spotify',
      HC.data.episodeLabel(HC.data.getSermon('sermon-on-spotify')), 'Listen on Spotify');

    /* The back catalogue, which is most of it. The show is on Spotify and the
       episodes are on the podcast host, so this button must not claim to open
       an app it is not opening. */
    ok('an episode on the podcast host does not claim to be Spotify',
      HC.data.episodeLabel(HC.data.getSermon('sermon-on-host')), 'Listen to this message');
  }

  console.log('\n--- nothing at all ---');
  {
    const HC = await boot({ podcasts: PODCASTS });

    /* Worship draws this link off sermonForWorship, which is null on a Sunday
       with two messages on it and on a Sunday the catalogue has not caught up
       with. The screen checks before it draws, and the answer underneath is
       still a sentence rather than a crash or the word undefined. */
    ok('no sermon is not an episode',
      HC.data.hasEpisode(null), false);
    ok('and it is labelled, not left blank',
      HC.data.episodeLabel(null), 'Audio coming soon!');
    ok('and it still has the show to fall back to',
      HC.data.episodeUrl(null), HC.data.podcast.showUrl);
  }

  console.log('');
  console.log(pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
