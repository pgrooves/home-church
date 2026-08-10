/* ==========================================================================
   Home Church, content sync
   Fills HC.data from Supabase, so publishing a guide or moving an event
   never needs an App Store build.

   THE RULE THIS FILE EXISTS TO KEEP: the app is never blank and never
   blocked on the network. It renders immediately, every time, from the best
   copy it already has on the device, and the network only ever improves what
   is on screen. Three layers, in order of preference:

     1. The cache, last known good content, in localStorage. Instant.
     2. js/data.js, baked into the binary. Instant, and always present, so a
        brand new install with no signal still opens to a real app.
     3. Supabase, fetched in the background after first paint.

   That ordering is not just polish. An app that opens to empty screens on a
   bad connection is an app that fails review, and a church app gets opened
   in a building with concrete walls and bad reception every Sunday.

   HOW THE SWAP WORKS. `js/data.js` keeps its arrays in a closure and exports
   the same array objects on HC.data, so `HC.data.guides` and the internal
   `guides` variable are one array, not two. Mutating that array in place,
   rather than assigning a new one, means every helper in data.js keeps
   working with zero changes to that file. Assigning HC.data.guides = [...]
   would silently leave every helper reading the old content.

   Loaded as a classic script like everything else, no build step, no SDK.
   ========================================================================== */

(function (HC) {
  'use strict';

  var cfg = HC.config || {};
  var CACHE_KEY = 'content';
  var CACHE_VERSION = 3;      // bump when a mapping below changes shape
  var TIMEOUT_MS = 12000;

  // The tables we pull, and the HC.data key each one fills. Adding another
  // content type means adding one line here and one mapper below.
  //
  // `single: true` marks a table the app reads as one object rather than a
  // list. Home shows one reading plan, so the table keeps every plan the
  // church has run and the row flagged is_current is the one that lands in
  // HC.data.readingPlan. Same shape as series, for the same reason.
  var TABLES = [
    { table: 'series',        target: 'series',        map: mapSeries },
    { table: 'guides',        target: 'guides',        map: mapGuide },
    { table: 'podcasts',      target: 'sermons',       map: mapSermon },
    { table: 'events',        target: 'events',        map: mapEvent },
    { table: 'announcements', target: 'announcements', map: mapAnnouncement },
    { table: 'reading_plans', target: 'readingPlan',   map: mapReadingPlan, single: true }
  ];

  function configured() {
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  }

  /* ------------------------------------------------------------- mapping ---
     Supabase speaks snake_case, the app speaks camelCase, and this is the one
     place that translation lives. Every mapper is total: it fills every field
     the screens read, with a sane empty value rather than undefined, so a
     half filled row degrades to a quiet gap instead of "undefined" rendered
     on a card in front of a congregation.
     ------------------------------------------------------------------------ */

  function str(v) { return v == null ? '' : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function mapSeries(r) {
    return {
      id: r.id,
      title: str(r.title),
      subtitle: str(r.subtitle),
      startedOn: r.started_on || null,
      current: !!r.is_current,
      blurb: str(r.blurb),
      artUrl: r.art_url || null
    };
  }

  function mapGuide(r) {
    return {
      id: r.id,
      sermonId: r.sermon_id || null,
      seriesId: r.series_id || null,
      // Stays null on almost every guide so the guide inherits its name from
      // the sermon. Empty string would break that inheritance, because
      // guideMeta() picks the first truthy value and '' is falsy, so null and
      // '' happen to behave the same here. null is still the honest value.
      themeTitle: r.theme_title || null,
      subtitle: str(r.subtitle),
      primaryPassage: str(r.primary_passage),
      preacher: str(r.preacher),
      preacherShort: str(r.preacher_short),
      preachedOn: r.preached_on || null,
      occasion: r.occasion || null,
      shortSummary: arr(r.short_summary),
      fullSummary: arr(r.full_summary),
      anchors: arr(r.anchors),
      groupSections: arr(r.group_sections),
      reflectionQuestions: arr(r.reflection_questions),
      oneLiners: arr(r.one_liners),
      scriptures: arr(r.scriptures),
      closingScripture: r.closing_scripture || null
    };
  }

  function mapSermon(r) {
    return {
      id: r.id,
      seriesId: r.series_id || null,
      title: str(r.title),
      preacher: str(r.preacher),
      preacherShort: str(r.preacher_short),
      preachedOn: r.preached_on || null,
      publishedOn: r.published_on || null,
      duration: str(r.duration),
      passage: str(r.passage),
      guideId: r.guide_id || null,
      // null on both of these is meaningful, data.js falls back to the show
      // level link and to description respectively. Do not turn them into ''.
      episodeUrl: r.episode_url || null,
      summary: (r.summary && r.summary.length) ? r.summary : null,
      description: str(r.description)
    };
  }

  /* Events are stored as a real timestamptz in UTC and rendered as a local
     date plus a human time string, which is what the Connect screen reads.
     time_label wins when it is set, because "All three services" is a real
     value on this calendar and no clock time expresses it. */
  function mapEvent(r) {
    var when = r.starts_at ? new Date(r.starts_at) : null;
    return {
      id: r.id,
      title: str(r.title),
      date: when ? localDate(when) : '',
      time: r.time_label ? str(r.time_label) : (when ? localTime(when) : ''),
      location: str(r.location),
      blurb: str(r.description),
      signupUrl: r.signup_url || null,
      capacity: r.capacity == null ? null : r.capacity,
      category: str(r.category)
    };
  }

  function mapAnnouncement(r) {
    return {
      id: r.id,
      eyebrow: str(r.eyebrow) || 'One thing',
      title: str(r.title),
      body: str(r.body),
      // The window has to survive the mapping or it may as well not be in the
      // table. Home applies it at render, not here, because this payload gets
      // cached: a phone that opens tomorrow on today's cache still has to see
      // an expired announcement disappear. null on either end means open.
      startsOn: r.starts_on || null,
      endsOn: r.ends_on || null,
      priority: r.priority == null ? 0 : r.priority
    };
  }

  function mapReadingPlan(r) {
    return {
      id: r.id,
      title: str(r.title),
      subtitle: str(r.subtitle),
      // The progress bar divides by totalWeeks, so a null here would put NaN
      // on Home. The column is not null in the table, this is belt and braces
      // for a row that arrived from somewhere unexpected.
      totalWeeks: r.total_weeks || 1,
      currentWeek: r.current_week || 1,
      thisWeek: str(r.this_week),
      resources: arr(r.resources),
      current: !!r.is_current
    };
  }

  // 'YYYY-MM-DD' in the phone's own zone, which is what formatDate expects.
  function localDate(d) {
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  // '6:30 PM', no leading zero, matching how the seed content reads.
  function localTime(d) {
    var h = d.getHours();
    var m = ('0' + d.getMinutes()).slice(-2);
    var suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + m + ' ' + suffix;
  }

  /* ------------------------------------------------------------- applying --- */

  /* Replace an array's contents without replacing the array. See the note at
     the top of this file, this is the whole trick that lets data.js stay
     untouched. */
  function fill(target, rows) {
    var list = HC.data[target];
    if (!Array.isArray(list)) return false;
    list.length = 0;
    for (var i = 0; i < rows.length; i++) list.push(rows[i]);
    return true;
  }

  /* The same trick for a target the app holds as one object rather than a
     list. Screens captured HC.data.readingPlan by reference long before this
     file existed, so the object has to be edited in place, not replaced. */
  function fillOne(target, row) {
    var obj = HC.data[target];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    var key;
    for (key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) delete obj[key];
    }
    for (key in (row || {})) {
      if (Object.prototype.hasOwnProperty.call(row, key)) obj[key] = row[key];
    }
    return true;
  }

  /* Which of several rows is the one Home shows. is_current is the flag, and
     falling back to the first row means a table where nobody set it still
     renders something rather than nothing. */
  function pickCurrent(rows) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].current) return rows[i];
    }
    return rows[0];
  }

  /* Is this a project nobody has seeded yet? Every table empty is the
     signature of a fresh project, or of config.js pointed somewhere wrong.
     One empty table alongside four full ones is a very different thing: it
     is somebody having deleted the last row on purpose.

     A failed fetch never reaches here, getTable returns null for that and
     refresh() leaves it out of the payload entirely, so everything we are
     looking at is a table that answered. */
  function unseeded(payload) {
    var answered = 0;
    for (var i = 0; i < TABLES.length; i++) {
      var rows = payload[TABLES[i].table];
      if (!Array.isArray(rows)) continue;
      answered++;
      if (rows.length) return false;
    }
    return answered > 0;
  }

  /* Deleting the last row of a table is a real, intentional state and the app
     has to honor it, or content can be added and changed from Supabase but
     never actually removed. The one case worth protecting against is the
     whole project being empty, which would blank the app rather than express
     an intent, and unseeded() is a better test for that than "is this
     particular collection empty", which could never tell the two apart. */
  function apply(payload) {
    var applied = [];
    if (unseeded(payload)) return applied;

    TABLES.forEach(function (spec) {
      var rows = payload[spec.table];
      if (!Array.isArray(rows)) return;

      // An emptied single-object table clears the object rather than leaving
      // last week's plan sitting on Home forever. Screens are expected to
      // handle the empty case, the way Home skips the whole section.
      var ok = spec.single
        ? fillOne(spec.target, rows.length ? pickCurrent(rows) : null)
        : fill(spec.target, rows);

      if (ok) applied.push(spec.target);
    });
    return applied;
  }

  /* ---------------------------------------------------------------- cache --- */

  function readCache() {
    var cached = HC.store.storage.get(CACHE_KEY, null);
    if (!cached || cached.version !== CACHE_VERSION) return null;
    // Content from a different project is not this app's content.
    if (cached.project !== cfg.SUPABASE_URL) return null;
    return cached.payload || null;
  }

  /* Returns false when the write did not stick, which on a phone means the
     localStorage quota is full or this is a private window. That is survivable,
     the app just falls back to fetching fresh every launch instead of opening
     from cache, so it is recorded rather than thrown. Worth watching over
     time: guides are the big rows, roughly 18KB each, so a few years of weekly
     guides is the thing that would eventually push a 5MB quota. */
  function writeCache(payload) {
    return HC.store.storage.set(CACHE_KEY, {
      version: CACHE_VERSION,
      project: cfg.SUPABASE_URL,
      fetchedAt: new Date().toISOString(),
      payload: payload
    });
  }

  /* ---------------------------------------------------------------- fetch --- */

  function getTable(spec) {
    var url = cfg.SUPABASE_URL + '/rest/v1/' + spec.table + '?select=*';

    // AbortController keeps a stalled connection from leaving the app
    // thinking a refresh is still in flight forever. A phone on one bar of
    // signal in a concrete building does this constantly.
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    return fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        Accept: 'application/json'
      },
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      // A table that does not exist yet, or one the policies refuse, is not a
      // reason to fail the whole refresh. Every other table still lands.
      if (!res.ok) return null;
      return res.json();
    }).then(function (rows) {
      if (!Array.isArray(rows)) return null;
      return rows.map(spec.map);
    }).catch(function () {
      if (timer) clearTimeout(timer);
      return null;   // offline, blocked, aborted, all the same answer here
    });
  }

  /* ---------------------------------------------------------------- redraw --- */

  function redraw() {
    if (!HC.router || !HC.router.current) return;
    var route = HC.router.current();
    if (!route) return;

    // Never redraw out from under someone mid presentation. A leader standing
    // in front of a group does not need the slide to blink because a refresh
    // landed. They will get the new content next time they open it.
    if (route.name === 'present') return;

    // restore:true makes the router stash the current scroll position before
    // it replaces the view and put it back after, so a refresh that lands
    // while somebody is reading does not throw them back to the top.
    HC.router.go(
      { name: route.name, id: route.id, index: route.index, restore: true },
      { force: true }
    );
  }

  /* ------------------------------------------------------------------ api --- */

  var state = { status: 'idle', source: 'bundled', fetchedAt: null, cached: null };

  /* Anything watching the content layer, which today is the Profile screen's
     one line about where this phone's content came from. Mirrors how auth
     announces itself, so app.js handles both the same way. */
  function announce() {
    if (HC.store && HC.store.emit) HC.store.emit('content', HC.content.state());
  }

  /* Synchronous, and called before the first render. Reads the cache only, so
     the very first paint already shows last week's real content instead of
     whatever was frozen into the binary at build time. */
  function primeFromCache() {
    if (!configured()) return false;
    var payload = readCache();
    if (!payload) return false;
    var applied = apply(payload);
    if (applied.length) {
      state.source = 'cache';
      return true;
    }
    return false;
  }

  /* Async, and called after the first render. Fetches every table, applies
     what came back, caches it, and redraws only if something actually
     changed. Never throws, and never leaves the app worse than it found it. */
  function refresh() {
    if (!configured()) return Promise.resolve(false);
    if (!window.fetch) return Promise.resolve(false);

    state.status = 'fetching';

    return Promise.all(TABLES.map(getTable)).then(function (results) {
      var payload = {};
      var got = 0;

      results.forEach(function (rows, i) {
        if (rows) { payload[TABLES[i].table] = rows; got++; }
      });

      // Nothing came back at all. Offline, or the project is unreachable.
      // Leave the cache and the bundled content exactly as they are.
      if (!got) {
        state.status = 'offline';
        announce();
        return false;
      }

      var before = signature();
      apply(payload);
      var changed = signature() !== before;

      state.cached = writeCache(payload);
      state.status = 'ok';
      state.source = 'network';
      state.fetchedAt = new Date().toISOString();

      if (changed) redraw();
      announce();
      return changed;
    }).catch(function () {
      state.status = 'error';
      announce();
      return false;
    });
  }

  /* A cheap fingerprint of what is on screen, used to decide whether a
     refresh is worth a redraw. Counts plus the newest ids catch a new guide,
     a removed event, and a retitled message, which is everything that
     actually matters here, without stringifying 87 sermons on every boot. */
  function signature() {
    return TABLES.map(function (spec) {
      // A single object is small enough to fingerprint whole, and it has to
      // be: the reading plan moving from week 8 to week 9 changes one digit,
      // which a length-based fingerprint would miss, and missing it means
      // Home keeps last week's reading until the next cold start.
      if (spec.single) {
        return spec.target + '=' + JSON.stringify(HC.data[spec.target] || {});
      }
      var list = HC.data[spec.target] || [];
      var head = list.length ? JSON.stringify(list[0]).length + ':' + (list[0].id || '') : '';
      return spec.target + '=' + list.length + '/' + head;
    }).join('|');
  }

  HC.content = {
    primeFromCache: primeFromCache,
    refresh: refresh,
    isConfigured: configured,
    state: function () {
      return {
        status: state.status,       // idle | fetching | ok | offline | error
        source: state.source,       // bundled | cache | network
        fetchedAt: state.fetchedAt,
        cached: state.cached        // false means the cache write did not stick
      };
    }
  };

})(window.HC = window.HC || {});
