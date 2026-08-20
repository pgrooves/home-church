/* ==========================================================================
   Home Church, journal
   Everything a person writes in this app, wherever they wrote it: a note on
   something they highlighted in a guide, an answer to a self-reflection
   question, or a blank page opened in somebody's living room.

   This file is the Journal tab's js/rooms.js. It owns the store, the
   sanitizer, and later the sync, and it knows nothing about how any of it is
   drawn. js/screens/journal.js only ever renders what this hands it.

   THREE RULES THIS FILE EXISTS TO KEEP.

   1. LOCAL FIRST, ALWAYS. Every write lands in localStorage synchronously and
      is on screen before anything touches the network. A journal that needs a
      signal is not a journal. Signed out, this is the whole feature and
      nothing about the tab changes except one caption.

   2. NOTHING IS STORED AS HTML THAT HAS NOT BEEN THROUGH sanitize(). Every
      other screen in this app renders strings it built itself and escapes
      every value through c.esc(). This is the first feature that keeps markup
      somebody typed, so the allowlist below is the only door it comes through,
      and it runs on the way in and again on the way out. See sanitize().

   3. AN ENTRY BELONGS TO WHOEVER WROTE IT, AND ONLY THEY SEE IT. Sign out,
      hand somebody the phone, and they must not find your journal sitting
      there. Every entry carries an ownerId and the list is filtered by it.
      See owner() and the note on adoption in adoptLoose().
   ========================================================================== */

(function (HC) {
  'use strict';

  var KEY = 'journal';

  /* entries is an object rather than an array because everything here looks
     an entry up by id: the guide reader asking what is anchored to a
     paragraph, the sync merging one row, a card being edited. */
  var state = null;

  function load() {
    if (state) return state;
    var saved = HC.store.storage.get(KEY, null) || {};
    state = {
      entries: saved.entries || {},
      // The last account to sign in on this phone. Not the same thing as who
      // is signed in now, and it is what stops one person's loose notes being
      // adopted by the next person who signs in. See adoptLoose().
      lastOwner: saved.lastOwner || null,
      lastPulledAt: saved.lastPulledAt || null
    };
    return state;
  }

  function persist() {
    HC.store.storage.set(KEY, load());
    HC.store.emit('journal', null);
  }

  /* ------------------------------------------------------------------ ids
     Minted on the phone, not by the database, so an entry written on a plane
     keeps the same id when it finally uploads and the upsert has something
     stable to key on. A uuid because that is what the column is. */

  function uuid() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      var b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 16; i++) hex.push((b[i] + 0x100).toString(16).slice(1));
      return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
             hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' +
             hex.slice(10).join('');
    } catch (err) {
      // No crypto at all. Not a uuid, and good enough to key a row nobody
      // else will ever hold: this is a private table with one writer.
      return 'j' + Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
    }
  }

  /* ---------------------------------------------------------------- owner */

  // The account signed in right now, or the string 'local' when nobody is.
  function owner() {
    var user = HC.auth && HC.auth.isSignedIn() && HC.auth.getUser();
    return (user && user.id) || 'local';
  }

  function mine(entry) {
    return entry && entry.ownerId === owner();
  }

  /* Loose notes, written signed out, join the account that signs in next.
     That is the ordinary case: somebody uses the app for a month, writes
     things, then finally signs in, and their writing should follow them.

     It must not happen when a second person signs in on the same phone. So
     adoption only runs when this phone has never seen a different account.
     Without that check, signing out, writing something private, and handing
     the phone to somebody who signs in would hand them what you wrote. */
  function adoptLoose(uid) {
    var s = load();
    var first = !s.lastOwner || s.lastOwner === uid;

    if (first) {
      Object.keys(s.entries).forEach(function (id) {
        if (s.entries[id].ownerId === 'local') {
          s.entries[id].ownerId = uid;
          s.entries[id].dirty = true;
        }
      });
    }

    s.lastOwner = uid;
    persist();
  }

  /* ------------------------------------------------------------ sanitizer

     The allowlist, and nothing else gets through. Everything not named here
     is unwrapped: the tag goes, its text stays. That is deliberately not the
     same as dropping the element, because a person who pastes a paragraph
     wrapped in something we do not keep should still have their words.

     <a> is the one that carries an attribute, and href has to survive because
     the whole point of the scripture button is a link. It survives only when
     it points at Bible Gateway, which is the only place this app ever links a
     verse. Anything else, including javascript: and data:, loses the href and
     keeps the text.

     b and i are mapped rather than allowed. contenteditable emits either
     depending on the browser and the day, and one representation in storage is
     worth more than being permissive about two. */

  var ALLOWED = {
    STRONG: 'strong', B: 'strong',
    EM: 'em', I: 'em',
    U: 'u', S: 's', STRIKE: 's',
    UL: 'ul', OL: 'ol', LI: 'li',
    P: 'p', BR: 'br', DIV: 'p',
    A: 'a'
  };

  var VOID = { br: true };
  var BIBLE = 'https://www.biblegateway.com/';

  // Blocks that must never end up inside a <p>. See the note in cleanNodes().
  var BLOCK_INSIDE = /<(ul|ol|p)[\s>]/i;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function cleanNodes(nodes) {
    var out = '';
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.nodeType === 3) {          // text
        out += esc(node.nodeValue);
        return;
      }
      if (node.nodeType !== 1) return;    // comments and the rest, gone

      var tag = ALLOWED[node.tagName];
      var inner = VOID[tag] ? '' : cleanNodes(node.childNodes);

      if (!tag) {
        out += inner;                     // unwrap, keep the words
        return;
      }
      if (tag === 'br') {
        out += '<br>';
        return;
      }
      if (tag === 'a') {
        var href = node.getAttribute('href') || '';
        // Not startsWith: this has to run in older WKWebViews too.
        out += href.indexOf(BIBLE) === 0
          ? '<a href="' + esc(href) + '">' + inner + '</a>'
          : inner;
        return;
      }

      /* A paragraph cannot contain a list. This is not pedantry: press
         return and then the bullet button and a browser hands back
         `first line<div><ul>…</ul></div>`, div maps to p above, and what
         would be stored is `<p><ul>…</ul></p>`. Every parser that then reads
         it back closes the p before the ul and leaves a stray empty one
         after, so the markup changes shape every time it is saved and
         reloaded. Unwrap instead: the block inside already carries the
         break. */
      if (tag === 'p' && BLOCK_INSIDE.test(inner)) {
        out += inner;
        return;
      }

      out += '<' + tag + '>' + inner + '</' + tag + '>';
    });
    return out;
  }

  /* Runs on the way in, when something is saved, and again on the way out,
     before anything reaches innerHTML. Twice is not belt and braces: the copy
     on the phone can have been written by an older build of this file, or by
     a sync from one, and the version that renders is the version that must
     decide what is safe. */
  function sanitize(html) {
    if (!html) return '';
    try {
      var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
      return cleanNodes(doc.body.childNodes).trim();
    } catch (err) {
      // No DOMParser, or something malformed enough to throw. Fall back to
      // the safest possible reading: it is all text.
      return esc(String(html).replace(/<[^>]*>/g, ''));
    }
  }

  /* The plain text mirror. Search runs on it, the export writes it, and it is
     what crosses into a group room, where other people read it and where
     stored markup has no business going. Block tags become line breaks so a
     bulleted list does not come out as one run-on sentence. */
  function plainText(html) {
    if (!html) return '';
    try {
      var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
      var walk = function (nodes) {
        var out = '';
        Array.prototype.forEach.call(nodes, function (node) {
          if (node.nodeType === 3) { out += node.nodeValue; return; }
          if (node.nodeType !== 1) return;
          var tag = node.tagName;
          if (tag === 'BR') { out += '\n'; return; }
          var inner = walk(node.childNodes);
          if (tag === 'LI') out += '\n' + inner;
          else if (tag === 'P' || tag === 'DIV' || tag === 'UL' || tag === 'OL') out += '\n' + inner + '\n';
          else out += inner;
        });
        return out;
      };
      return walk(doc.body.childNodes).replace(/\n{3,}/g, '\n\n').trim();
    } catch (err) {
      return String(html).replace(/<[^>]*>/g, '').trim();
    }
  }

  // Plain text on its way to becoming an entry: paragraphs, escaped.
  function textToHtml(text) {
    var paras = String(text || '').split(/\n{2,}/).filter(function (p) { return p.trim(); });
    return paras.map(function (p) {
      return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* Every Bible Gateway link in the body, as the references they name. What
     the "your own scripture index" list is built from, and what makes an
     entry findable by the verse it sits on. */
  function refsIn(html) {
    var found = [];
    var re = /<a href="https:\/\/www\.biblegateway\.com\/[^"]*">([^<]+)<\/a>/g;
    var m;
    while ((m = re.exec(html || ''))) {
      var ref = m[1].replace(/&amp;/g, '&').trim();
      if (ref && found.indexOf(ref) === -1) found.push(ref);
    }
    return found;
  }

  /* ----------------------------------------------------------------- read */

  function get(id) {
    var entry = load().entries[id];
    return entry && !entry.deletedAt && mine(entry) ? entry : null;
  }

  // Newest first, which is how every list in this app wants them. Pinned
  // entries come first regardless, since pinning is a person saying so.
  function all(opts) {
    opts = opts || {};
    var s = load();

    var list = Object.keys(s.entries).map(function (id) { return s.entries[id]; })
      .filter(function (e) { return !e.deletedAt && mine(e); });

    if (opts.guideId) list = list.filter(function (e) { return e.guideId === opts.guideId; });
    if (opts.kind) list = list.filter(function (e) { return e.kind === opts.kind; });
    if (opts.withScripture) list = list.filter(function (e) { return (e.refs || []).length; });

    if (opts.search) {
      var needle = opts.search.toLowerCase();
      list = list.filter(function (e) {
        return ((e.bodyText || '') + ' ' + (e.title || '') + ' ' + (e.quote || '') + ' ' +
                (e.guideTitle || '')).toLowerCase().indexOf(needle) !== -1;
      });
    }

    return list.sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
    });
  }

  function forGuide(guideId) {
    return guideId ? all({ guideId: guideId }) : [];
  }

  // Everything anchored into one block of one guide, for drawing the marks.
  function forAnchor(guideId, path) {
    return all({ guideId: guideId }).filter(function (e) {
      return e.path === path && typeof e.start === 'number';
    });
  }

  function count() {
    return all().length;
  }

  /* ---------------------------------------------------------------- write */

  function stamp(entry) {
    entry.updatedAt = new Date().toISOString();
    entry.dirty = true;
    return entry;
  }

  /* One door in. Everything that makes an entry, from any of the four ways
     in, comes through here, so there is one place that decides what an entry
     is and one place that sanitizes. */
  function create(patch) {
    patch = patch || {};
    var now = new Date().toISOString();
    var html = sanitize(patch.bodyHtml || textToHtml(patch.bodyText || ''));

    var entry = {
      id: patch.id || uuid(),
      ownerId: owner(),
      kind: patch.kind || 'entry',

      guideId: patch.guideId || null,
      guideTitle: patch.guideTitle || guideTitleFor(patch.guideId),

      path: patch.path || null,
      quote: patch.quote || null,
      start: typeof patch.start === 'number' ? patch.start : null,
      end: typeof patch.end === 'number' ? patch.end : null,

      title: patch.title || '',
      bodyHtml: html,
      bodyText: plainText(html),
      refs: refsIn(html),

      pinned: !!patch.pinned,
      createdAt: patch.createdAt || now,
      updatedAt: now,
      deletedAt: null,
      dirty: true
    };

    load().entries[entry.id] = entry;
    persist();
    return entry;
  }

  function update(id, patch) {
    var s = load();
    var entry = s.entries[id];
    if (!entry || !mine(entry)) return null;

    Object.keys(patch).forEach(function (k) {
      if (k === 'bodyHtml' || k === 'bodyText') return;   // handled below
      entry[k] = patch[k];
    });

    if (patch.bodyHtml !== undefined || patch.bodyText !== undefined) {
      var html = sanitize(patch.bodyHtml !== undefined
        ? patch.bodyHtml
        : textToHtml(patch.bodyText || ''));
      entry.bodyHtml = html;
      entry.bodyText = plainText(html);
      entry.refs = refsIn(html);
    }

    if (patch.guideId !== undefined && patch.guideTitle === undefined) {
      entry.guideTitle = guideTitleFor(patch.guideId);
    }

    stamp(entry);
    persist();
    return entry;
  }

  /* Soft, and this is the one place where the reason is worth writing down.
     A hard delete syncs as an absence, and an absence is indistinguishable
     from a row the other phone has not been told about yet, so the other
     phone helpfully uploads it again. Forever. A tombstone is a row that says
     the thing is gone, and it syncs like any other row. */
  function remove(id) {
    var s = load();
    var entry = s.entries[id];
    if (!entry || !mine(entry)) return false;
    entry.deletedAt = new Date().toISOString();
    stamp(entry);
    persist();
    return true;
  }

  function togglePin(id) {
    var entry = get(id);
    if (!entry) return false;
    update(id, { pinned: !entry.pinned });
    return !entry.pinned;
  }

  function guideTitleFor(guideId) {
    if (!guideId || !HC.data) return null;
    var guide = HC.data.getGuide(guideId);
    return guide ? HC.data.guideTitle(guide) : null;
  }

  /* ------------------------------------------------- the old journal keys

     v1 kept the guide reader's self-reflection answers in
     guideState[guideId].journal[questionIndex], which is a different place
     from this and holds the same kind of thing: something somebody wrote,
     about a guide, in answer to a prompt. They are journal entries and always
     were, so they move here once and the reader writes through this file from
     then on.

     This runs on every launch and does nothing after the first, because it is
     keyed on the entry id rather than on a flag: an id derived from the guide
     and the question index means the same answer can never be imported twice,
     even if a flag were lost or a phone restored from an old backup.

     Nothing is deleted from guideState. It costs a few kilobytes and it means
     a person who installs this build, writes nothing, and rolls back to the
     previous one still has their answers. */

  function migrateFromGuideState() {
    var raw = HC.store.storage.get('guideState', {}) || {};
    var s = load();
    var moved = 0;

    Object.keys(raw).forEach(function (guideId) {
      var bucket = raw[guideId] || {};
      var answers = bucket.journal || {};

      Object.keys(answers).forEach(function (index) {
        var text = answers[index];
        if (!text || !String(text).trim()) return;

        // Deterministic, so a second run recognises what it already imported.
        var id = 'reflection-' + guideId + '-' + index;
        if (s.entries[id]) return;

        var guide = HC.data && HC.data.getGuide(guideId);
        var question = guide && guide.reflectionQuestions && guide.reflectionQuestions[+index];

        create({
          id: id,
          kind: 'reflection',
          guideId: guideId,
          path: 'reflectionQuestions.' + index,
          quote: question || null,
          bodyText: text,
          // The date is honestly unknown: the old shape never stored one. The
          // guide's own date is the closest true thing and beats stamping
          // every one of them with today, which would bunch a year of writing
          // into a single afternoon at the top of the list.
          createdAt: guideDate(guide) || new Date().toISOString()
        });
        moved++;
      });
    });

    return moved;
  }

  function guideDate(guide) {
    if (!guide || !HC.data) return null;
    var on = HC.data.guideMeta(guide).preachedOn;
    return on ? new Date(on + 'T12:00:00').toISOString() : null;
  }

  /* ----------------------------------------------- the guide reader's boxes

     The self-reflection questions still live in the guide, and they still
     save as you type. They are entries now, so the reader reads and writes
     through here rather than through guideState. Keyed on the same
     deterministic id the migration uses, which is what makes editing an
     answer an update rather than a second entry every time somebody types. */

  function reflectionId(guideId, index) {
    return 'reflection-' + guideId + '-' + index;
  }

  function getReflection(guideId, index) {
    var entry = get(reflectionId(guideId, index));
    return entry ? entry.bodyText : '';
  }

  function setReflection(guideId, index, text, question) {
    var id = reflectionId(guideId, index);
    var existing = load().entries[id];

    if (!String(text || '').trim()) {
      if (existing && !existing.deletedAt) remove(id);
      return;
    }
    if (existing && !existing.deletedAt && mine(existing)) {
      update(id, { bodyText: text, quote: question || existing.quote });
      return;
    }
    create({
      id: id,
      kind: 'reflection',
      guideId: guideId,
      path: 'reflectionQuestions.' + index,
      quote: question || null,
      bodyText: text
    });
  }

  /* ----------------------------------------------------------------- init */

  function init() {
    load();
    migrateFromGuideState();

    // Signing in adopts what was written signed out, once, and only on a
    // phone that has not belonged to somebody else. See adoptLoose().
    HC.store.on('auth', function (evt) {
      if (evt && evt.signedIn && evt.user && evt.user.id) adoptLoose(evt.user.id);
      HC.store.emit('journal', null);
    });
  }

  HC.journal = {
    init: init,

    all: all,
    get: get,
    forGuide: forGuide,
    forAnchor: forAnchor,
    count: count,

    create: create,
    update: update,
    remove: remove,
    togglePin: togglePin,

    getReflection: getReflection,
    setReflection: setReflection,

    sanitize: sanitize,
    plainText: plainText,
    textToHtml: textToHtml,
    refsIn: refsIn,

    owner: owner,
    // Exported for the tests and for nothing else.
    _state: load,
    _migrate: migrateFromGuideState,
    _adopt: adoptLoose
  };

})(window.HC = window.HC || {});
