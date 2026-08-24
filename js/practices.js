/* ==========================================================================
   Home Church, the Practices data layer
   Reads the nine files under data/practices/ and hands them to the screens.

   WHY THESE ARE FILES AND NOT SUPABASE. Everything else the app reads is
   editable from a phone, and that is right for a sermon or an event, which
   change every week and belong to this church. These do not. The words come
   from practicingtheway.org and the videos from their playlists, both of
   which belong to somebody else, and neither is something anybody here should
   be editing in a table at midnight. They are generated once, reviewed by a
   person, and committed. See scripts/build_practices.js, which is the only
   thing that writes them.

   Which also settles the other question: the app never scrapes that site and
   never calls the YouTube API. Not at boot, not on a practice page, not ever.
   A phone in a church parking lot with one bar reads a local file.

   LOADING. index.json is small and comes down at boot so the grid is ready
   before anybody taps into it. The nine are fetched one at a time, the first
   time each page is opened, and kept after that. Neither fetch blocks a
   render: a screen draws with what is in hand, this emits when more arrives,
   and the screen repaints. Same rule as the rest of the app, never blank and
   never blocked.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* Relative, like every other path in this app. Capacitor serves the bundle
     from its own origin and a leading slash resolves to the wrong place
     there. See the note at the top of index.html. */
  var DIR = 'data/practices/';

  /* Bumped in scripts/build_practices.js when the file shape changes. A file
     from the future is not rendered half way: the page says the app needs
     updating, which is true, and is a better thing to see than four sessions
     and a blank fifth. */
  var SCHEMA = 1;

  var index = null;          // [{ slug, title, icon }]
  var cache = {};            // slug -> practice, or an Error
  var inflight = {};         // slug -> true while a fetch is out

  function emit() {
    HC.store.emit('practices', null);
  }

  function readJson(file) {
    return fetch(DIR + file, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /* ------------------------------------------------------------- the index */

  function loadIndex() {
    if (index) return;
    readJson('index.json').then(function (data) {
      if (!data || !Array.isArray(data.practices)) throw new Error('no practices array');
      index = data.practices;
      emit();
    }).catch(function () {
      /* The grid is the only thing that needs this, and a grid that cannot
         draw is a screen with nothing on it. Rather than that, fall back to
         nothing and let the screen say so. It is a file inside the app, so
         this only happens if the build forgot to ship data/, which is exactly
         the mistake worth being loud about. See scripts/sync_web.js. */
      index = [];
      emit();
    });
  }

  function list() {
    return index || [];
  }

  function ready() {
    return index !== null;
  }

  /* ---------------------------------------------------------- one practice */

  /* Synchronous by design. Returns the practice, or null while it is still
     coming, and starts the fetch if nobody has. Screens in this app render to
     a string in one pass, so anything they call has to answer immediately;
     the repaint comes from the 'practices' event. */
  function get(slug) {
    if (!slug) return null;
    if (Object.prototype.hasOwnProperty.call(cache, slug)) {
      var hit = cache[slug];
      return hit instanceof Error ? null : hit;
    }
    load(slug);
    return null;
  }

  // Null while loading, an Error once it has failed. The two look the same to
  // get() and different to a screen deciding what to say.
  function failed(slug) {
    return cache[slug] instanceof Error ? cache[slug] : null;
  }

  function load(slug) {
    if (inflight[slug]) return;
    inflight[slug] = true;

    readJson(slug + '.json').then(function (data) {
      if (!data || data.schema !== SCHEMA) {
        throw new Error('This practice was written by a newer version of the app.');
      }
      cache[slug] = normalize(data);
    }).catch(function (err) {
      cache[slug] = err instanceof Error ? err : new Error(String(err));
    }).then(function () {
      delete inflight[slug];
      emit();
    });
  }

  /* Fill in what a generated file is allowed to leave out, so that every
     screen below can read a practice without checking whether each field
     survived the pipeline. A stub file, the placeholder written before any
     content has been pulled, is a real practice with empty arrays: it renders
     as a page that says so rather than as a failure. */
  function normalize(p) {
    var out = {
      slug: p.slug || '',
      title: p.title || '',
      icon: p.icon || '',
      source: p.source || {},
      // The hero line on the practice's own page. Optional, and older files
      // written before it existed simply do not have one.
      subtitle: p.subtitle || '',
      intro: Array.isArray(p.intro) ? p.intro : [],
      /* Everything the practice closes with: the companion guide, the book it
         assigns, the podcast series. Each one is a title, some prose, and
         optionally a picture and one link. */
      resources: Array.isArray(p.resources) ? p.resources.map(resource).filter(Boolean) : [],
      sessions: Array.isArray(p.sessions) ? p.sessions : [],
      extras: Array.isArray(p.extras) ? p.extras : [],
      flags: Array.isArray(p.flags) ? p.flags : []
    };

    out.sessions = out.sessions.map(function (s, i) {
      return {
        number: s.number != null ? s.number : i + 1,
        title: s.title || ('Session ' + (s.number != null ? s.number : i + 1)),
        teaching: Array.isArray(s.teaching) ? s.teaching : [],
        practice: s.practice || '',
        video: playable(s.video)
      };
    });
    out.extras = out.extras.map(playable).filter(Boolean);

    // Nothing has been generated yet. The pipeline says so in the flags and
    // the page reads it from here rather than counting empty arrays itself.
    out.pending = !out.intro.length && !out.sessions.length &&
                  !out.extras.length && !out.resources.length;

    return out;
  }

  /* A video this app can actually play, or nothing.

     `embeddable: false` is the interesting case. This app has no external
     link anywhere in it, by design: tapping a video plays it here or it does
     not play. So a video whose owner has turned embedding off is not quietly
     turned into a link out to YouTube, it is dropped, and the page shows the
     session without one. scripts/build_practices.js flags those at build
     time, which is where somebody can still do something about it. */
  /* One closing resource. Dropped rather than half drawn if it has no title,
     because a picture and a link with nothing saying what they are is not
     something to put on a page. */
  function resource(r) {
    if (!r || !r.title) return null;
    return {
      title: r.title,
      body: Array.isArray(r.body) ? r.body : (r.body ? [r.body] : []),
      image: r.image || '',
      link: (r.link && r.link.url) ? { label: r.link.label || 'Open', url: r.link.url } : null
    };
  }

  function playable(v) {
    if (!v || !v.videoId) return null;
    if (v.embeddable === false) return null;
    return {
      videoId: v.videoId,
      title: v.title || '',
      duration: v.duration || '',
      thumbnail: v.thumbnail || ('https://i.ytimg.com/vi/' + v.videoId + '/hqdefault.jpg'),
      confidence: v.confidence || ''
    };
  }

  HC.practices = {
    init: loadIndex,
    list: list,
    ready: ready,
    get: get,
    failed: failed
  };

})(window.HC = window.HC || {});
