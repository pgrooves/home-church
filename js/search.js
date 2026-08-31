/* ==========================================================================
   Home Church, search
   One box that looks through the whole app: every message, every guide and
   every question inside it, announcements, events, groups, serve teams, next
   steps, setlists, the practices, the reading plan, whatever the church has
   written on a content page, whatever anybody has written in their own
   journal on this phone, and the screens themselves.

   WHAT "EVERYTHING" MEANS HERE, said plainly, because a search box that
   quietly misses things is worse than one that says what it looks at.

   Two halves, and they are indexed two different ways.

   The first is content: rows in js/data.js as the church has them today,
   walked generically rather than field by field. Generic on purpose. A new
   column on `announcements`, a new key inside a worship set's `songs` JSON,
   a new section in a guide, all of them are searchable the day they land,
   because nothing here names the fields it reads. The alternative, a list of
   field names in this file, is a list that goes stale in a fortnight and
   fails silently when it does.

   The second is the screens. Sentences like the lede on Alpha or the note
   under the Give button are not rows in a table, they are strings in
   js/screens/*.js drawn through HC.data.copy(). Nothing exports them, so the
   only honest way to read them is to draw the screen and take its text. That
   is what screenText() does, once, when somebody first opens Search.

   DRAWING A SCREEN TO READ IT COSTS NOTHING VISIBLE AND MUST COST NOTHING
   ELSE. Two rules make that true. It happens inside a <template>, whose
   content lives in an inert document, so the dozen <img> tags on Home do not
   fetch a dozen photographs to be counted as words nobody will read; and the
   only screens drawn are the ones that build a string and hand it back.
   Group and Admin are deliberately not on that list: Group's draw touches
   its own module state and the room is a private conversation rather than
   published text, and Admin fetches. Both still appear as places you can go.

   WHAT IS NOT IN HERE AND SHOULD NOT BE. Anything the person searching is
   not already allowed to read. The journal is on the index because it is
   theirs and it never leaves the phone, and it comes straight back off again
   the moment the journal lock is on, which is the whole point of that lock.
   A group room is not on it at all.

   NOTHING HERE REACHES THE INTERNET. Everything below reads what is already
   on the phone. The one thing it does fetch is the nine practice files, which
   are files in this app's own bundle and are read exactly as opening a
   practice reads them, so that a practice nobody has opened is still
   searchable by what is written inside it rather than only by its name. See
   the header of js/practices.js.

   The index is built the first time somebody searches and thrown away when
   the content underneath it moves, which is what the subscriptions at the
   bottom are for. Rebuilding is a few milliseconds and happens with a
   keyboard on screen, so it is never on the boot path.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* ------------------------------------------------------------- normalizing

     Lowercased, and a handful of characters folded onto the ones a person
     actually has on their keyboard.

     THIS FUNCTION IS LENGTH PRESERVING AND HAS TO STAY THAT WAY. Every
     character maps to exactly one character, never to two and never to none.
     That is what lets an index found in the normalized string be used
     directly against the original to cut a snippet and put the <mark> in the
     right place. String.normalize('NFD') would fold accents more thoroughly
     and would also move every index after the first accented letter, which
     is how a highlight ends up a character to the left of the word it means.

     The curly apostrophe is the entry that earns its keep. Nearly every
     title in this app carries one, "Who's In Your Corner?" among them, and
     nobody types it. Without this line that message is unfindable by name. */
  var FOLD = {
    '‘': '\'', '’': '\'', '‚': '\'', '‛': '\'',
    '“': '"', '”': '"', '„': '"',
    '–': '-', '—': '-', '−': '-',
    '…': '.', ' ': ' ', ' ': ' ', ' ': ' ',
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ñ': 'n', 'ç': 'c'
  };

  function normalize(value) {
    var s = String(value == null ? '' : value).toLowerCase();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      out += (FOLD[ch] || ch);
    }
    return out;
  }

  // One line of running text, which is what a snippet is cut out of.
  function collapse(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  /* The words somebody typed. Two characters is the floor: one letter
     matches most of the catalogue and the list it produces is noise. */
  function tokenize(query) {
    return normalize(query).split(/\s+/).filter(function (t) { return t.length > 0; });
  }

  /* ---------------------------------------------------------- harvesting text

     Walk anything and collect the strings a person could have read.

     The skip lists are the whole of the judgement here, and both are about
     the same thing: an id, a URL and a slug are all text, and none of them
     are words. Leaving them in means typing "guide" matches every row in the
     catalogue by its own primary key, which is a search that always returns
     everything, which is a search that is never used twice. */

  function skipKey(key) {
    if (!key) return false;
    if (/^id$|Id$|^ids$/.test(key)) return true;
    if (/^url$|Url$|^urls$|^href$/.test(key)) return true;
    return /^(icon|slug|schema|image|images|thumb|thumbnail|kind|createdAt|updatedAt|deletedAt|owner|ownerId|sortOrder|colour|color|aspect|videoId|refs)$/.test(key);
  }

  function skipValue(text) {
    if (!text) return true;
    // A link, a scheme, or a bare date column. None of these are read aloud.
    if (/^(https?:|mailto:|sms:|tel:|data:|\/\/)/i.test(text)) return true;
    return /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(text);
  }

  // Markup somebody typed in the announcement editor, as the words inside it.
  // Done on the string rather than through the DOM, because this runs over
  // every row and a parse per row is not worth what it buys.
  function detag(html) {
    return String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, '\'');
  }

  /* The recursion. Depth bounded because a cycle in the data would otherwise
     be a hang rather than a bug, and the total bounded because a runaway row
     should cost a truncated snippet and not the phone's memory. */
  var MAX_DEPTH = 8;
  var MAX_TEXT = 40000;

  function harvest(value, out, depth) {
    if (value == null || out.length >= MAX_TEXT) return out;
    if (depth > MAX_DEPTH) return out;

    if (typeof value === 'string') {
      var text = value.indexOf('<') !== -1 ? detag(value) : value;
      text = collapse(text);
      if (!skipValue(text)) out.push(text);
      return out;
    }

    if (typeof value !== 'object') return out;

    if (Object.prototype.toString.call(value) === '[object Array]') {
      for (var i = 0; i < value.length; i++) harvest(value[i], out, depth + 1);
      return out;
    }

    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (skipKey(key)) continue;
      harvest(value[key], out, depth + 1);
    }
    return out;
  }

  /* Every readable string in a record, kept as separate pieces rather than
     joined. The pieces matter: entry() below tells prose from metadata by
     how long each one is, and once they are joined that is gone. */
  function pieces(value) {
    return harvest(value, [], 0);
  }

  function textOf(value) {
    return pieces(value).join(' ');
  }

  /* ------------------------------------------------------- reading a screen

     A screen drawn where nobody can see it, for its words.

     THE TEMPLATE IS NOT AN OPTIMISATION. A <template>'s content sits in a
     document with no browsing context, so the images inside it are never
     fetched. Built with createElement('div') instead, opening Search would
     quietly pull down every poster and thumbnail on every screen in the app,
     on whatever connection the phone happens to have. This app has refused
     that kind of background traffic twice already, once for the typefaces
     and once for the Instagram rail, and it is not going to introduce it
     through the search box.

     HC.components.el is swapped for the duration, because that is the one
     call every screen makes to turn its string into an element, and it is
     the only place the choice of container can be made from outside. It goes
     back in a finally, so a screen that throws cannot leave the app drawing
     into inert templates. */
  function inertEl(html) {
    var t = document.createElement('template');
    if ('content' in t) {
      t.innerHTML = String(html).trim();
      return t.content.firstElementChild || t.content;
    }
    var d = document.createElement('div');
    d.innerHTML = String(html).trim();
    return d.firstElementChild || d;
  }

  function screenText(name) {
    if (!HC.router || !HC.router.renderRoute) return '';
    if (typeof document === 'undefined' || !document.createElement) return '';

    var components = HC.components;
    var real = components.el;
    var node = null;
    try {
      components.el = inertEl;
      node = HC.router.renderRoute({ name: name });
    } catch (err) {
      node = null;   // a screen that cannot draw is simply not on the index
    } finally {
      components.el = real;
    }
    return node ? collapse(node.textContent || '') : '';
  }

  /* ----------------------------------------------------------- the index

     One entry per thing you can land on. `text` is everything readable about
     it with the original punctuation intact, because that is what a snippet
     is cut from; `hay` is the normalized copy the matching runs against.

     `base` is what separates a message from the screen it is listed on. Both
     genuinely contain the words somebody typed, and a person searching for a
     sermon title wants the sermon, not the tab. See rank() below. */
  var RECORD = 100;
  var PLACE = 20;

  /* How long a harvested string has to be before it counts as something
     somebody wrote rather than something somebody filled in. Roughly a
     clause. "Adam Suter", "41 min" and "2 Samuel 9" fall under it; "What a
     forgotten grandson of a dead king teaches us about grace" does not. */
  var PROSE_MIN = 40;

  /* The same sentence twice, dropped for the snippet's sake.

     This is not a hypothetical tidy-up, it is the shape of the catalogue. A
     sermon carries both `summary`, which is the paragraphs, and
     `description`, which is the first line of them cut short for a card. Read
     one after the other they make a snippet that stammers: "Pastor Adam
     continues our study on the life of David. Pastor Adam continues our…".

     Containment rather than equality, because the short one is a truncation
     of the long one and not a copy of it. Only for the shorter pieces, which
     keeps this a handful of substring checks per record rather than a matrix
     of them; the matching haystack is untouched either way, so nothing
     becomes unfindable by being left out of the snippet. */
  var DEDUPE_MAX = 300;

  function dedupe(list) {
    var kept = [];
    list.forEach(function (piece) {
      if (piece.length <= DEDUPE_MAX) {
        for (var i = 0; i < kept.length; i++) {
          if (kept[i].indexOf(piece) !== -1) return;
        }
      }
      kept.push(piece);
    });
    return kept;
  }

  function entry(opts) {
    var title = collapse(opts.title);
    var sub = collapse(opts.sub || '');
    var lowTitle = normalize(title);
    var lowSub = normalize(sub);

    var parts = Object.prototype.toString.call(opts.text) === '[object Array]'
      ? opts.text
      : (opts.text ? [String(opts.text)] : []);

    /* Two strings out of the same pieces, doing two different jobs.

       `all` is everything, and it is what the matching runs against, because
       a preacher's name and a passage are exactly the sort of thing people
       type into a box like this.

       `body` is what a snippet is cut from, and it is the prose only. A
       record walked generically comes back as its paragraphs and also as its
       columns, and a snippet built from all of it opens "Adam Suter Adam 41
       min 2 Samuel 9 Pastor Adam continues…", which is a row of fields read
       out loud under a heading that already said two of them. Records with no
       long string in them at all, a setlist among them, keep everything,
       because a short line is better than a blank one. */
    var all = collapse(parts.join(' '));
    var prose = parts.filter(function (p) { return p.length >= PROSE_MIN; });
    var body = collapse(dedupe(prose.length ? prose : parts).join(' '));

    /* The name and the line under it are drawn directly above the snippet, so
       a snippet that opens by repeating them says nothing. Harvesting an
       object reaches both along with everything else, and they come out at
       the front, so they are cut off there.

       Only at the front. A title turning up again in the middle of a summary
       is the message being talked about, which is worth showing. */
    var lowBody = normalize(body);
    if (lowTitle && lowBody.indexOf(lowTitle) === 0) {
      body = collapse(body.slice(title.length));
      lowBody = normalize(body);
    }
    if (lowSub && lowBody.indexOf(lowSub) === 0) {
      body = collapse(body.slice(sub.length));
      lowBody = normalize(body);
    }

    return {
      kind: opts.kind,
      title: title,
      sub: sub,
      route: opts.route,
      base: opts.base == null ? RECORD : opts.base,

      // What the snippet is cut out of, and its normalized twin. Indices in
      // one are indices in the other, which is what normalize() guarantees.
      body: body,
      lowBody: lowBody,

      lowTitle: lowTitle,
      lowSub: lowSub,

      // What the matching runs against: the name, the line under it, and
      // every piece rather than only the prose ones, so a message is found by
      // its preacher and its passage as readily as by a sentence four
      // paragraphs into its summary.
      hay: normalize(collapse(title + ' ' + sub + ' ' + all))
    };
  }

  /* Screens drawn for their words. Everything else in PLACES is still a
     destination you can search for by name, it just contributes its title
     rather than its paragraphs.

     Group is off this list because a room is a private conversation and not
     published text, and because its draw writes to its own module state.
     Admin is off it because it fetches. */
  var DEEP = {
    home: true, listen: true, guide: true, connect: true,
    worship: true, practices: true, alpha: true, give: true,
    profile: true, privacy: true, terms: true, data: true
  };

  /* Everywhere you can go, taken from the lists that already decide the tab
     bar and the ••• sheet rather than written out again here, so a module
     added to js/app.js is searchable without anybody remembering this file.
     The three legal pages are the exception: they are pushed views nothing
     enumerates, and they are the pages people go looking for by name. */
  function places() {
    var titles = HC.titles || {};
    var out = [];
    var seen = {};

    function add(name, sub) {
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push({ name: name, sub: sub || '' });
    }

    ((HC.router && HC.router.TABS) || []).forEach(function (n) { add(n); });
    (HC.modules || []).forEach(function (m) { add(m.route, m.sub); });
    ['profile', 'privacy', 'terms', 'data'].forEach(function (n) { add(n); });

    return out.map(function (p) {
      return entry({
        kind: 'Screen',
        title: titles[p.name] || p.name,
        sub: p.sub,
        route: { name: p.name },
        base: PLACE,
        text: DEEP[p.name] ? screenText(p.name) : ''
      });
    });
  }

  /* Everything the church has published. One block per collection, and each
     one says only three things: what to call it, where tapping it goes, and
     which object to read. The reading itself is harvest() above. */
  function published() {
    var d = HC.data;
    var out = [];
    if (!d) return out;

    (d.sermons || []).forEach(function (s) {
      out.push(entry({
        kind: 'Message',
        title: s.title,
        sub: [s.preacher, s.passage].filter(Boolean).join(' · '),
        route: { name: 'listen' },
        text: pieces(s)
      }));
    });

    (d.guides || []).forEach(function (g) {
      out.push(entry({
        kind: 'Guide',
        title: d.guideTitle ? d.guideTitle(g) : (g.themeTitle || g.id),
        sub: g.subtitle || '',
        route: { name: 'guide-reader', id: g.id },
        text: pieces(g)
      }));
    });

    (d.series || []).forEach(function (s) {
      out.push(entry({
        kind: 'Series',
        title: s.title,
        sub: s.subtitle || '',
        route: { name: 'listen' },
        text: pieces(s)
      }));
    });

    /* Every announcement, including the ones whose window has closed. That is
       the same answer js/screens/announcement.js gives and for the same
       reason: a card comes off Home at midnight because Home is what the
       church is saying today, and somebody who went looking for an
       announcement should find the words they were reading. The page says how
       old it is when they get there. */
    (d.announcements || []).forEach(function (a) {
      out.push(entry({
        kind: 'Announcement',
        title: a.title,
        sub: a.eyebrow || '',
        route: { name: 'announcement', id: a.id },
        text: pieces(a)
      }));
    });

    (d.events || []).forEach(function (e) {
      out.push(entry({
        kind: 'Event',
        title: e.title || e.name,
        sub: e.location || '',
        route: { name: 'connect' },
        text: pieces(e)
      }));
    });

    (d.groups || []).forEach(function (g) {
      out.push(entry({
        kind: 'Group',
        title: g.name,
        sub: [g.day, g.neighborhood].filter(Boolean).join(' · '),
        route: { name: 'connect' },
        text: pieces(g)
      }));
    });

    (d.serveTeams || []).forEach(function (t) {
      out.push(entry({
        kind: 'Serve',
        title: t.name || t.title,
        sub: t.blurb || '',
        route: { name: 'connect' },
        text: pieces(t)
      }));
    });

    (d.nextSteps || []).forEach(function (s) {
      out.push(entry({
        kind: 'Next step',
        title: s.title || s.name,
        sub: s.blurb || '',
        route: { name: 'connect' },
        text: pieces(s)
      }));
    });

    /* A setlist has no name of its own, and it must not grow one: the only
       place a message is named is the sermon, which is what lets Monday's
       rename in the podcast reach the Worship screen with nothing to keep in
       step. See tests/worship.test.js. So the Sunday it was sung is the
       title, and the songs are the line underneath, which is what somebody
       searching for a song is looking at anyway. */
    (d.worshipSets || []).forEach(function (w) {
      var songs = (w.songs || []).map(function (s) { return s && s.title; })
        .filter(Boolean).join(', ');
      out.push(entry({
        kind: 'Worship',
        title: w.servedOn && HC.components
          ? HC.components.formatDate(w.servedOn)
          : (w.servedOn || 'Setlist'),
        sub: songs,
        route: { name: 'worship' },
        text: pieces(w)
      }));
    });

    (d.contentPages || []).forEach(function (p) {
      out.push(entry({
        kind: 'Page',
        title: p.title,
        sub: p.eyebrow || '',
        route: { name: 'page', id: p.id },
        text: pieces(p)
      }));
    });

    if (d.readingPlan) {
      out.push(entry({
        kind: 'Reading plan',
        title: d.readingPlan.title,
        sub: d.readingPlan.subtitle || '',
        route: { name: 'home' },
        text: pieces(d.readingPlan)
      }));
    }

    /* The church itself: the address, the service times, the pastors, the
       number people text to serve. All of it is on the glass somewhere, and
       "what time is church" is the single most likely thing anybody types
       into a box like this. */
    if (d.church) {
      out.push(entry({
        kind: 'Church',
        title: d.church.name || 'Home Church',
        sub: d.church.tagline || '',
        route: { name: 'connect' },
        text: pieces(d.church)
      }));
    }

    if (d.podcast) {
      out.push(entry({
        kind: 'Podcast',
        title: d.podcast.name,
        sub: d.podcast.platform || '',
        route: { name: 'listen' },
        text: pieces(d.podcast)
      }));
    }

    /* Sentences an admin rewrote from inside the app. The screens above are
       drawn live, so an override is already in what they say; these rows are
       here for the slots on screens that are not drawn for their text, and
       they cost one short entry each.

       The slot's own prefix names the screen it belongs to, which is exactly
       enough to land somebody in the right place, and the row is skipped when
       that prefix is not a route this app has. A slot is a name the app
       assigns and the shape of it is not enforced anywhere; without this
       check a slot named after something that is not a screen would draw a
       result that goes nowhere, which the router quietly resolves to Home. */
    var titles = HC.titles || {};
    (d.textOverrides || []).forEach(function (o) {
      var where = String(o.slot || '').split('.')[0];
      if (!titles[where]) return;
      out.push(entry({
        kind: 'Screen',
        title: titles[where],
        sub: '',
        route: { name: where },
        base: PLACE,
        text: o.value || ''
      }));
    });

    return out;
  }

  /* The nine, and the sessions inside them.

     get() is called for every one of them rather than only for the ones
     already in hand, which is what asks js/practices.js to read the seven or
     eight files nobody has opened. They are files in this app's own bundle,
     the read is the same one opening a practice does, and it is what makes
     the sentence inside a session findable by somebody who has never been to
     that page. It answers null while a file is on its way, so a practice
     contributes its name now and the rest of itself a moment later: the
     'practices' event that lands with it throws this index away, and the next
     keystroke rebuilds it with the words in. */
  function practices() {
    if (!HC.practices || !HC.practices.list) return [];
    return HC.practices.list().map(function (p) {
      var full = HC.practices.get ? HC.practices.get(p.slug) : null;
      return entry({
        kind: 'Practice',
        title: p.title,
        sub: full && full.subtitle ? full.subtitle : '',
        route: { name: 'practice', id: p.slug },
        text: full ? pieces(full) : []
      });
    });
  }

  /* What this person has written, and only while the journal is open. The
     lock is the whole reason the check is here: a locked journal that is
     still searchable from the top bar is not locked. */
  function journal() {
    if (!HC.journal || !HC.journal.all) return [];
    if (HC.journal.isLocked && HC.journal.isLocked()) return [];

    return HC.journal.all().map(function (e) {
      return entry({
        kind: 'Journal',
        title: e.title || e.guideTitle || 'Journal entry',
        sub: e.guideTitle && e.title ? e.guideTitle : '',
        route: { name: 'journal-entry', id: e.id },
        text: collapse([e.title, e.quote, e.bodyText, e.guideTitle].filter(Boolean).join(' '))
      });
    });
  }

  var index = null;

  function build() {
    return places().concat(published(), practices(), journal())
      .filter(function (e) { return e.title || e.hay; });
  }

  function entries() {
    if (!index) index = build();
    return index;
  }

  function invalidate() {
    index = null;
  }

  /* --------------------------------------------------------------- ranking

     Every token has to be somewhere in the entry, which is what makes typing
     more words narrow the list rather than widen it. Everything after that
     is about which of the matches to put first, and the order is the order
     somebody would guess: the thing actually called that, then the thing
     with the phrase in it, then the screen it happens to be listed on. */
  function rank(e, query, tokens) {
    for (var i = 0; i < tokens.length; i++) {
      if (e.hay.indexOf(tokens[i]) === -1) return 0;
    }

    var score = e.base;

    if (e.lowTitle === query) score += 400;
    else if (e.lowTitle.indexOf(query) === 0) score += 260;
    else if (e.lowTitle.indexOf(query) !== -1) score += 180;
    else if (tokens.every(function (t) { return e.lowTitle.indexOf(t) !== -1; })) score += 110;

    if (e.lowSub.indexOf(query) !== -1) score += 40;

    /* The whole phrase, and how far into the entry it sits. A guide whose
       first paragraph is about grace is a better answer for "grace" than one
       that mentions it on page four. */
    var at = e.hay.indexOf(query);
    if (at !== -1) score += 60 - Math.min(50, Math.floor(at / 400));

    return score;
  }

  /* ---------------------------------------------------------- the snippet

     The line under a result, showing where the words were found, with the
     words themselves marked. Cut from `text`, whose punctuation is intact,
     using indices found in `hay`, which is why normalize() must never change
     a string's length.

     Returns escaped HTML. Nothing that reaches it has been through the
     sanitizer, so nothing that comes out of it may carry markup: an
     announcement's <strong> was turned into a space by detag() long before
     this, and everything else is escaped here, one piece at a time, around
     the marks this function adds itself. */
  var BEFORE = 60;
  var AFTER = 170;
  var MAX_MARKS = 12;

  function snippet(e, tokens) {
    var esc = HC.components ? HC.components.esc : function (s) { return String(s); };
    var text = e.body;
    var low = e.lowBody;
    if (!text) return '';

    /* Where to open the window. The first word that landed, or the start of
       the text when none of them did: a result matched on its title alone
       still gets a line under it, and the first line of a thing is the right
       line to show when nothing else has been asked for. */
    var at = -1;
    tokens.forEach(function (t) {
      var i = low.indexOf(t);
      if (i !== -1 && (at === -1 || i < at)) at = i;
    });
    if (at === -1) at = 0;

    var from = Math.max(0, at - BEFORE);
    var to = Math.min(text.length, at + AFTER);

    // Start and end on whole words, so a snippet never opens mid-syllable.
    if (from > 0) {
      var space = text.indexOf(' ', from);
      if (space !== -1 && space < at) from = space + 1;
    }
    if (to < text.length) {
      var back = text.lastIndexOf(' ', to);
      if (back > at) to = back;
    }

    var ranges = [];
    tokens.forEach(function (t) {
      var i = low.indexOf(t, from);
      while (i !== -1 && i < to && ranges.length < MAX_MARKS) {
        ranges.push([i, Math.min(to, i + t.length)]);
        i = low.indexOf(t, i + t.length);
      }
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });

    var html = '';
    var cursor = from;
    ranges.forEach(function (r) {
      if (r[0] < cursor) return;             // overlapping tokens, keep the first
      html += esc(text.slice(cursor, r[0]));
      html += '<mark class="hc-search__hit">' + esc(text.slice(r[0], r[1])) + '</mark>';
      cursor = r[1];
    });
    html += esc(text.slice(cursor, to));

    return (from > 0 ? '…' : '') + html + (to < text.length ? '…' : '');
  }

  /* ---------------------------------------------------------- the answer

     A ranked list, with the screens held to a handful at the bottom. That cap
     is the one piece of tuning in this file and it is load bearing: a screen
     carries every word on it, so without it a search for anything at all
     returns Home, Listen, Connect and the rest alongside the thing somebody
     was actually looking for, every single time. A screen whose own name is
     what was typed outranks the cap on its own, through rank() above. */
  var LIMIT = 60;
  var PLACE_LIMIT = 5;

  function results(query, limit) {
    var q = normalize(collapse(query));
    var tokens = tokenize(q);
    if (!tokens.length || q.length < 2) return [];

    var scored = [];
    entries().forEach(function (e) {
      var score = rank(e, q, tokens);
      if (score > 0) scored.push({ entry: e, score: score });
    });

    scored.sort(function (a, b) {
      if (a.score !== b.score) return b.score - a.score;
      return a.entry.title < b.entry.title ? -1 : (a.entry.title > b.entry.title ? 1 : 0);
    });

    var out = [];
    var placesShown = 0;
    for (var i = 0; i < scored.length && out.length < (limit || LIMIT); i++) {
      var e = scored[i].entry;
      if (e.base === PLACE) {
        if (placesShown >= PLACE_LIMIT) continue;
        placesShown++;
      }
      out.push({
        kind: e.kind,
        title: e.title,
        sub: e.sub,
        route: e.route,
        score: scored[i].score,
        snippet: snippet(e, tokens)
      });
    }
    return out;
  }

  /* The index is a photograph of the content, so it is thrown away whenever
     the content moves. Every one of these is a real path: a sync landing,
     a practice file arriving, an entry written, and signing in or out, which
     changes whose journal this is. */
  if (HC.store && HC.store.on) {
    ['content', 'practices', 'journal', 'auth'].forEach(function (evt) {
      HC.store.on(evt, invalidate);
    });
  }

  HC.search = {
    results: results,
    entries: entries,
    invalidate: invalidate,

    // Exported for tests, and for anything that needs to ask the same
    // question this file asks rather than a slightly different one.
    normalize: normalize,
    tokenize: tokenize,
    textOf: textOf
  };

})(window.HC = window.HC || {});
