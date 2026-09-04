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
  var CACHE_VERSION = 13;     // bump when a mapping below changes shape
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
    // Home lists these newest first now rather than showing one, so the order
    // it draws is the order they arrive in rather than something the screen
    // has to re-sort. It still sorts, because a cached payload from before
    // this line existed is not ordered, and because Home's tie-break is
    // priority rather than date.
    { table: 'announcements', target: 'announcements', map: mapAnnouncement,
      order: 'created_at.desc' },
    { table: 'reading_plans', target: 'readingPlan',   map: mapReadingPlan, single: true },

    /* What the band played, newest Sunday first. The order is the order the
       week carousel runs in, so the current week is the slide the screen opens
       on. js/data.js sorts it again anyway, because a payload cached before
       this line existed arrives in no order at all. */
    { table: 'worship_sets',  target: 'worshipSets',   map: mapWorshipSet,
      order: 'served_on.desc' },
    // `order` matters here and nowhere else so far: Connect shows the first
    // group as "your group", and PostgREST returns rows in no guaranteed
    // order, so without this which group that is could change between fetches.
    { table: 'groups',        target: 'groups',        map: mapGroup,
      order: 'sort_order.asc,name.asc' },
    { table: 'serve_teams',   target: 'serveTeams',    map: mapServeTeam,
      order: 'sort_order.asc,name.asc' },
    { table: 'next_steps',    target: 'nextSteps',     map: mapNextStep,
      order: 'sort_order.asc,title.asc' },

    // The rail at the top of Connect. Newest first, and capped, because a rail
    // is a glance and not an archive. The sync job keeps nine rows, so the
    // limit is belt and braces for a table that grew for some reason nobody
    // remembers. Until the account is connected this table is empty, which
    // Connect renders as nothing at all rather than as an empty strip.
    { table: 'instagram_posts', target: 'instagramPosts', map: mapInstagramPost,
      order: 'posted_at.desc', limit: 9 },

    // `neverEmpty` is the one exception to deleting a row propagating, and it
    // is deliberate. Home, Profile, Give, and the printed guide all read
    // church.address.city without checking, so a cleared profile is not an
    // empty state, it is four broken screens. A church with no name is not
    // something anyone means to say. Edit the row, do not delete it.
    /* Prose the church owns, written from Settings -> Admin -> Content
       instead of from a source file. Deliberately not the nine Practices,
       which are somebody else's work and stay on the build script that
       generates them: see the header of js/practices.js and migration 0026. */
    { table: 'content_pages', target: 'contentPages', map: mapContentPage,
      order: 'sort_order.asc,title.asc' },

    /* App-wide switches. Read with the publishable key like everything else
       here, which is what lets a signed out phone see the pinned banner. */
    { table: 'app_settings', target: 'appSettings', map: mapAppSetting,
      order: 'sort_order.asc,label.asc' },

    /* Sentences an admin rewrote in place, from Edit mode. Read like every
       other table here, with no session, because a rewritten caption is not
       an admin's private view of the app: it is what the church now says, and
       a signed out phone has to read the same words. An empty table is the
       normal state and means nothing has been rewritten. See js/edit-mode.js
       and migration 0030. */
    { table: 'text_overrides', target: 'textOverrides', map: mapTextOverride,
      order: 'slot.asc', whole: true },

    { table: 'church_profile', target: 'church',  map: mapChurch,
      single: true, neverEmpty: true },
    { table: 'podcast_show',   target: 'podcast', map: mapPodcastShow,
      single: true, neverEmpty: true }
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
      closingScripture: r.closing_scripture || null,
      /* Which sections have been narrated, keyed by the section ids the
         reader draws. Resolved to full URLs here rather than in the reader,
         so the screen never has to know the bucket exists. A guide published
         before narration shipped has no column value at all, which arrives as
         undefined and becomes {}, and every section simply has no play
         button. See migration 0046. */
      narration: narrationUrls(r.narration)
    };
  }

  /* The stored path is bucket-relative, 'guide-slow-burn/af_heart/group.mp3',
     for the same reason instagram stores an object path rather than a URL: a
     project that moves keeps working, and nothing in the table is a link that
     can rot on its own. */
  function narrationUrls(value) {
    var out = {};
    if (!value || typeof value !== 'object') return out;
    Object.keys(value).forEach(function (section) {
      var row = value[section];
      if (!row || !row.path) return;
      out[section] = {
        src: storageUrl('narration', row.path),
        seconds: Number(row.seconds) || 0,
        voice: str(row.voice)
      };
    });
    return out;
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

  /* An announcement's pictures, as one list. image_urls when the row has one,
     the single image_url when it does not, and [] when there is no picture at
     all. Strings only: anything else in the array is dropped rather than
     drawn. */
  function imageList(r) {
    var list = Array.isArray(r.image_urls) ? r.image_urls : [];
    var urls = list.filter(function (u) {
      return typeof u === 'string' && u.trim();
    }).map(function (u) { return u.trim(); });
    if (urls.length) return urls;
    return r.image_url ? [String(r.image_url)] : [];
  }

  function mapAnnouncement(r) {
    return {
      id: r.id,
      // The date Home prints on the label. starts_on is already a date and is
      // the day the church chose to publish, so it wins. When it is null the
      // announcement went up the moment the row was written, and created_at is
      // a timestamptz in UTC, so it goes through localDate rather than having
      // its first ten characters taken: an announcement written at eight in
      // the evening in Metairie is stored on the following UTC day, and
      // slicing the string would date the card tomorrow.
      publishedOn: r.starts_on ||
        (r.created_at ? localDate(new Date(r.created_at)) : null),
      title: str(r.title),
      body: str(r.body),
      /* The same words as markup, or null for a row written before migration
         0033. Not sanitized here, deliberately: this file runs before
         js/richtext.js is loaded and, more to the point, the screen that draws
         it sanitizes on the way to innerHTML, which is the only place that can
         be true of a payload restored from a cache written by an older build.
         See js/screens/announcement.js. */
      bodyHtml: r.body_html || null,
      // The window has to survive the mapping or it may as well not be in the
      // table. Home applies it at render, not here, because this payload gets
      // cached: a phone that opens tomorrow on today's cache still has to see
      // an expired announcement disappear. null on either end means open.
      startsOn: r.starts_on || null,
      endsOn: r.ends_on || null,
      /* The event this announcement is about, when it is about a dated thing.
         An id and not the event itself: the events list is synced separately
         and the announcement screen looks it up there, so there is one copy of
         an event in this payload rather than one per announcement that
         mentions it. Null for every announcement written before 0040 and for
         every one that is not about a date. */
      eventId: r.event_id || null,
      priority: r.priority == null ? 0 : r.priority,
      // null rather than '' on both, because Home tests them for truthiness
      // to decide whether to draw a frame or a button at all, and an empty
      // frame is worse than no frame. Same rule as episodeUrl above.
      imageUrl: r.image_url || null,
      videoUrl: r.video_url || null,
      /* Every picture, in order. One list rather than a lead image and a list
         beside it, so nothing downstream has to work out whether image_url is
         also the first of these: the mapper answers that here, once, and falls
         back to the single column for a row written before 0033 and for a
         cached payload that has never seen one.

         Filtered rather than trusted, because this array crosses the network
         and comes back out of localStorage: a null in it would draw an <img>
         with no src, which is the broken image glyph in the middle of a
         gallery. */
      images: imageList(r),
      /* The attached link. All three can be null and each of them means
         something on its own: no link at all, a link with no name of its own,
         and a link whose thumbnail the admin took off with the x on the form.
         See js/screens/announcement.js. */
      linkUrl: r.link_url || null,
      linkTitle: r.link_title || null,
      linkImageUrl: r.link_image_url || null,
      /* The strip under the top bar, on every tab, carrying this
         announcement's title. Coerced rather than passed through, because a
         phone holding a cached payload written before migration 0028 has no
         such key and `undefined` in a flag is how a banner appears on every
         phone at once. See the note on HC.data.setting for the same rule one
         table over. */
      pinned: !!r.pinned,
      // Sorting the list needs something monotonic that survives the cache.
      // starts_on is the date the church chose and is frequently null;
      // created_at always exists and is what the table is indexed on.
      createdAt: r.created_at || null
    };
  }

  /* A page of the church's own words. `sections` is [{heading, body}] where
     body is one string, blank lines and all: splitting it into paragraphs is
     the screen's business, because that is a rendering decision and this file
     only translates. See migration 0026 section 2 for why the shape is this
     plain. */
  function mapContentPage(r) {
    return {
      id: r.id,
      title: str(r.title),
      eyebrow: str(r.eyebrow),
      blurb: str(r.blurb),
      sections: arr(r.sections).map(function (s) {
        return { heading: str(s && s.heading), body: str(s && s.body) };
      }),
      sortOrder: r.sort_order == null ? 0 : r.sort_order
    };
  }

  /* One switch or one short string. `kind` names which column is live, and
     the mapper resolves it here rather than making four screens each work it
     out: everything downstream reads `.value` and gets a boolean or a string
     according to the row's own type. */
  function mapAppSetting(r) {
    var kind = r.kind === 'text' ? 'text' : 'boolean';
    return {
      key: r.key,
      label: str(r.label),
      help: str(r.help),
      kind: kind,
      value: kind === 'text' ? str(r.value_text) : !!r.value_bool,
      sortOrder: r.sort_order == null ? 0 : r.sort_order
    };
  }

  /* Deliberately not run through str() on the way in the way every other
     mapper's text is. An override's value is not null in the table, and the
     difference between '' and absent is load bearing here: '' is the church
     having taken a line off a screen. str(null) would turn a row that somehow
     arrived empty into the same thing, which is fine, and is why this still
     coerces rather than passing the value straight through. */
  function mapTextOverride(r) {
    return {
      slot: str(r.slot),
      value: r.value == null ? '' : String(r.value)
    };
  }

  function mapGroup(r) {
    return {
      id: r.id,
      name: str(r.name),
      day: str(r.day),
      // Connect renders this straight into "Thursdays, 6:30 PM", so it stays
      // the display string the church wrote rather than a parsed time.
      time: str(r.time_label),
      neighborhood: str(r.neighborhood),
      host: str(r.host),
      lifeStage: str(r.life_stage),
      blurb: str(r.blurb),
      // Missing reads as full rather than open. Sending somebody to a group
      // that cannot take them is the worse of the two mistakes.
      openings: r.openings === true
    };
  }

  /* `requirement` is a condition somebody has to clear before they can serve,
     a background check for Home Kids or the training process for Worship. It
     stays out of the blurb and gets its own line, because buried inside the
     description it reads as part of the pitch rather than as the thing a
     person needs to know before they decide. */
  function mapServeTeam(r) {
    return {
      id: r.id,
      name: str(r.name),
      commitment: str(r.commitment),
      requirement: str(r.requirement),
      blurb: str(r.blurb)
    };
  }

  /* A next step with no url is a description and nothing more, which is a
     real state and renders as one. null rather than '' because Connect tests
     it for truthiness to decide whether there is a button at all, and a step
     that promises an action it cannot perform is the exact thing this pass
     exists to remove. */
  function mapNextStep(r) {
    return {
      id: r.id,
      title: str(r.title),
      blurb: str(r.blurb),
      url: r.url || null,
      ctaLabel: str(r.cta_label)
    };
  }

  /* An object path inside a public Storage bucket, as a URL a phone can load.

     Built here rather than on the screen because it is the one field whose
     value depends on which Supabase project the app is pointed at, and that
     is this file's business. Each path segment is encoded separately so a
     slash in the path stays a slash and a space in a filename does not
     become a broken image. */
  function storageUrl(bucket, path) {
    return cfg.SUPABASE_URL + '/storage/v1/object/public/' + bucket + '/' +
      String(path).split('/').map(encodeURIComponent).join('/');
  }

  /* A post in the Connect rail.

     `image_path` is an object path in the `instagram` bucket, never a URL on
     instagram.com, and the difference is the whole design. Their CDN links
     are signed and expire within days, so a stored one goes blank on its own.
     Worse, loading them on the phone would hand Meta every congregant's IP
     address on every visit to Connect, which is the exact trade this project
     already refused when it pulled Google Fonts out of index.html. The sync
     job mirrors the bytes into Storage and the phone only ever talks to
     Supabase.

     A row with no image_path is a post whose picture never made it into the
     bucket. It maps to '' and Connect drops it, because a tile with no
     picture is not a smaller tile, it is a hole in a row of photographs. */
  function mapInstagramPost(r) {
    return {
      id: r.id,
      permalink: str(r.permalink),
      imageUrl: r.image_path ? storageUrl('instagram', r.image_path) : '',
      // VIDEO and CAROUSEL_ALBUM both draw as one still. Only VIDEO gets a
      // play badge, because that badge is a promise about what a tap does.
      mediaType: str(r.media_type) || 'IMAGE',
      caption: str(r.caption),
      postedAt: r.posted_at || null
    };
  }

  /* One song in a set. Total in the same way every mapper here is, and more
     carefully than most, because this is the one shape in the schema that
     arrives as free JSON rather than as columns: a row hand written into the
     SQL editor can hold anything at all, and what it must never do is put the
     word "undefined" under a piece of album art.

     Only the title survives being missing. A song with no title is not a
     smaller row, it is a blank space where a song should be, so
     mapWorshipSet below drops it.

     `links` is filtered down to the platforms that are actually strings. The
     screen reads it by name, so a null under `spotify` and a missing
     `spotify` have to mean the same thing, which is no Spotify button. */
  function songLinks(v) {
    var out = {};
    if (!v || typeof v !== 'object') return out;
    Object.keys(v).forEach(function (k) {
      if (typeof v[k] === 'string' && v[k].trim()) out[k] = v[k].trim();
    });
    return out;
  }

  function mapSong(s) {
    if (!s || typeof s !== 'object') return { title: '' };
    return {
      title: str(s.title),
      artist: str(s.artist),
      // '' rather than null on both: the screen asks whether they are truthy
      // and draws the house cover, or no Lyrics link, when they are not.
      artUrl: str(s.artUrl || s.art_url),
      lyricsUrl: str(s.lyricsUrl || s.lyrics_url),
      links: songLinks(s.links)
    };
  }

  /* One Sunday's setlist.

     NO TITLE FIELD, and there is no missing line here. The name of that
     morning's message is written in podcasts.title and nowhere else, and
     HC.data.worshipTitle() resolves it through sermonId, or through the date
     when the episode has not posted yet. Adding a title to this mapper would
     be adding the second copy the whole arrangement exists to prevent. */
  function mapWorshipSet(r) {
    return {
      id: r.id,
      servedOn: r.served_on || null,
      // Null is meaningful: the set was published before the episode was, and
      // the screen matches on the date until /new-podcast fills this in.
      sermonId: r.sermon_id || null,
      songs: arr(r.songs).map(mapSong).filter(function (s) { return s.title; })
    };
  }

  function mapChurch(r) {
    return {
      // Carried through for the same reason as podcast_show above: Edit mode
      // PATCHes this row by its id when the tagline or the serve invitation
      // is rewritten where it is read.
      id: r.id,
      name: str(r.name),
      tagline: str(r.tagline),
      pastors: str(r.pastors),
      // Nested, because Home and Profile read church.address.city directly.
      // Flattening it here would mean touching four screens for no gain.
      address: {
        line1: str(r.address_line1),
        city: str(r.address_city),
        state: str(r.address_state),
        zip: str(r.address_zip)
      },
      mapsUrl: str(r.maps_url),
      serviceDay: str(r.service_day),
      serviceTimes: arr(r.service_times),
      givingUrl: str(r.giving_url),
      websiteUrl: str(r.website_url),
      social: arr(r.social),

      // Every serve team funnels through one SMS keyword rather than a form
      // per team, which is how the church already runs it.
      serve: {
        number: str(r.serve_signup_number),
        keyword: str(r.serve_signup_keyword),
        title: str(r.serve_signup_title),
        blurb: str(r.serve_signup_blurb)
      },

      // Groups run in seasons. Missing reads as in season, because a church
      // that has not set this yet almost certainly has groups running, and
      // hiding them by default would be the worse of the two mistakes.
      groupsInSeason: r.groups_in_season !== false,
      groupsOffSeasonNote: str(r.groups_off_season_note),
      // A flyer over that paragraph, when there is one. Empty is the ordinary
      // answer and Connect draws no frame at all rather than a gap. See
      // migration 0048.
      groupsNoteImageUrl: str(r.groups_note_image_url),

      /* Which face that card is wearing, and read strictly: a missing column
         is between seasons, because "Open now" over the between seasons
         sentence is the worse of the two mistakes. NOT the same thing as
         groupsInSeason above, which decides whether the finder is drawn at
         all. Migration 0049 says why they are two columns.

         The evergreen sentence beside it is only ever read by the Admin form,
         which shows what the button would put back. Connect draws the live
         note and never this. */
      groupsNoteInSeason: r.groups_note_in_season === true,
      groupsBetweenSeasonsNote: str(r.groups_between_seasons_note),

      /* Alpha runs in seasons too, and the same reading of a missing column
         for the same reason. The url is the registration for whichever run is
         open: empty is a real answer and the screen falls back to the one in
         its own source rather than drawing a button with nothing behind it.
         See js/screens/alpha.js. */
      alphaInSeason: r.alpha_in_season !== false,
      alphaSignupUrl: str(r.alpha_signup_url),
      alphaOffSeasonNote: str(r.alpha_off_season_note)
    };
  }

  function mapPodcastShow(r) {
    return {
      // Carried through because Edit mode PATCHes this row by its id when
      // somebody rewrites the show's blurb on Listen. Nothing else reads it.
      id: r.id,
      name: str(r.name),
      platform: str(r.platform),
      showUrl: str(r.show_url),
      blurb: str(r.blurb)
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
      // The first day of week 1. Home counts from it rather than reading
      // current_week, which is only the fallback for a row without one.
      startsOn: str(r.starts_on),
      currentWeek: r.current_week || 1,
      /* The whole schedule, one entry per week in the order the church reads
         them, so the reading advances with the week number instead of waiting
         for somebody to retype it on a Sunday. Empty until a plan has one, and
         then thisWeek is what Home draws. See 0032. */
      weeks: arr(r.weeks).map(str),
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

  /* '6:30 PM', no leading zero, matching how the seed content reads.

     ONE CLOCK, IN js/components.js. This used to be its own six lines, and
     then the reminder sheet on the Cal tab needed to say a time back to
     somebody and grew a second six. An event reading "6:30 PM" above a
     reminder reading "06:30 pm" is the shape that mistake takes, so the
     formatter moved to components.js and both sides call it.

     Reached at call time rather than held in a variable: js/components.js
     loads after this file, and a reference taken while this one is being
     evaluated would be undefined forever. */
  function localTime(d) {
    return HC.components.formatClock(d);
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

      // Config the whole app dereferences, kept whatever the table says. See
      // the note on neverEmpty in TABLES.
      if (!rows.length && spec.neverEmpty) return;

      // An emptied single-object table otherwise clears the object rather than
      // leaving last week's plan sitting on Home forever. Screens are expected
      // to handle the empty case, the way Home skips the whole section.
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
    if (spec.order) url += '&order=' + encodeURIComponent(spec.order);
    // Only the Instagram rail sets this so far. Ordering has to be set with
    // it or a limit would take an arbitrary nine rows rather than the newest
    // nine, which PostgREST will happily do.
    if (spec.limit) url += '&limit=' + encodeURIComponent(spec.limit);

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

      /* Merge onto the cache rather than replacing it.

         A refresh where three tables answer and eight time out used to write
         those three over the whole cached payload. The screen was fine,
         because apply() only touches what came back. The next cold start was
         not: it primed from a cache missing eight tables and fell through to
         the copy frozen into the binary for all of them. So one bad minute of
         signal on a Sunday could quietly roll a phone back to build time
         content, and nothing anywhere would say so.

         Keeping the previous cache underneath means a partial answer can only
         ever improve what is stored. */
      var merged = Object.assign({}, readCache() || {}, payload);

      state.cached = writeCache(merged);
      state.status = (got === TABLES.length) ? 'ok' : 'partial';
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
      /* `whole` is the same argument as `single`, for a list. The overrides
         table is a handful of short rows and the thing that changes in it is
         one sentence inside one of them, which is precisely what the cheap
         fingerprint below is built not to notice. Missing it would mean an
         edit made on one admin's phone did not appear on anybody else's until
         their next cold start, which is the one promise Edit mode makes. */
      if (spec.whole) {
        return spec.target + '=' + JSON.stringify(HC.data[spec.target] || []);
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
        status: state.status,       // idle | fetching | ok | partial | offline | error
        source: state.source,       // bundled | cache | network
        fetchedAt: state.fetchedAt,
        cached: state.cached        // false means the cache write did not stick
      };
    }
  };

})(window.HC = window.HC || {});
