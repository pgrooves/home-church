/* ==========================================================================
   Home Church, journal
   Everything a person writes in this app, wherever they wrote it: a note on
   something they highlighted in a guide, an answer to a self-reflection
   question, or a blank page opened in somebody's living room.

   This file is the Journal tab's js/rooms.js. It owns the store, the link
   policy the sanitizer runs under, and later the sync, and it knows nothing
   about how any of it is drawn. js/screens/journal.js only ever renders what
   this hands it.

   THREE RULES THIS FILE EXISTS TO KEEP.

   1. LOCAL FIRST, ALWAYS. Every write lands in localStorage synchronously and
      is on screen before anything touches the network. A journal that needs a
      signal is not a journal. Signed out, this is the whole feature and
      nothing about the tab changes except one caption.

   2. NOTHING IS STORED AS HTML THAT HAS NOT BEEN THROUGH sanitize(). Every
      other screen in this app renders strings it built itself and escapes
      every value through c.esc(). This was the first feature that kept markup
      somebody typed, so the allowlist in js/richtext.js is the only door it
      comes through, and it runs on the way in and again on the way out. See
      sanitize() below, which is that allowlist under this tab's link policy.

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

  /* Disk, then the screen, then, a moment later, the network.

     The push is debounced rather than immediate because typing calls this on
     every keystroke's debounce already, and a request per word would be both
     wasteful and slower to settle than one request per pause. Nothing waits
     on it: the entry is saved and on screen before this is even scheduled. */
  var pushTimer = null;

  function persist() {
    HC.store.storage.set(KEY, load());
    HC.store.emit('journal', null);

    if (!canSync()) return;
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(function () {
      push().catch(function () { /* still dirty, tried again next time */ });
    }, 1500);
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

     MOVED, AND STILL MEANS THE SAME THING. The allowlist, the unwrapping rule
     and the plain text mirror now live in js/richtext.js, because a second
     feature keeps markup somebody typed: an admin writes an announcement in
     the same editor this tab does. Two copies of a sanitizer is one copy that
     gets fixed.

     What is left here is the Journal's half of the decision, which is the link
     policy. 'bible' means the only href that survives is Bible Gateway's, so
     the scripture button works and a paragraph pasted out of an email cannot
     smuggle a link into somebody's notes. That matters more here than it looks:
     an entry can be pushed to a group room, where other people read it.

     Rule 2 in the header is unchanged. Nothing is stored as HTML that has not
     been through sanitize(), and it runs on the way in and again on the way
     out. */

  function esc(value) {
    return HC.richtext.esc(value);
  }

  function sanitize(html) {
    return HC.richtext.sanitize(html, { links: 'bible' });
  }

  function plainText(html) {
    return HC.richtext.plainText(html);
  }

  // Plain text on its way to becoming an entry: paragraphs, escaped.
  function textToHtml(text) {
    return HC.richtext.textToHtml(text);
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

  /* Everything anchored into one block of one guide, for drawing the marks.

     Either a quote or a pair of offsets is enough, because locate() below
     resolves from either. Requiring both would have quietly refused to draw
     an entry that carries only the words, which is the more durable half of
     the anchor and the half that survives the guide being edited. */
  function forAnchor(guideId, path) {
    return all({ guideId: guideId }).filter(function (e) {
      return e.path === path && (typeof e.start === 'number' || !!e.quote);
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

  /* ------------------------------------------------------------- anchors

     A highlight points at a run of characters inside one block of one guide,
     and guides are edited from a phone with no build step. So the anchor has
     to survive somebody fixing a typo in the paragraph it sits in.

     Four things are stored, and they are tried in order of how much they can
     be trusted:

       path    which block, as an address into the guide object:
               'shortSummary.2', 'groupSections.0.questions.3'
       quote   the exact text that was selected
       start   where it was, as an offset into that block's plain text
       end

     `quote` is tried first, because text that has moved is still the same
     text. The offsets are the fallback, and they are only believed when the
     characters they point at are still the ones that were highlighted.

     WHEN BOTH FAIL, THE ENTRY SURVIVES AND THE MARK DOES NOT. The paragraph
     was rewritten; there is nothing honest to underline any more. But the
     quotation was stored with the entry, so the Journal still shows exactly
     what was highlighted and what was written about it. The note is the
     valuable thing. The mark is a convenience. */

  function locate(entry, text) {
    if (!entry || !text) return null;

    if (entry.quote) {
      // The same sentence can appear twice in a paragraph, so when it does,
      // take the occurrence nearest to where it used to be.
      var best = -1;
      var from = 0;
      var at;
      while ((at = text.indexOf(entry.quote, from)) !== -1) {
        if (best === -1 || Math.abs(at - (entry.start || 0)) < Math.abs(best - (entry.start || 0))) {
          best = at;
        }
        from = at + 1;
      }
      if (best !== -1) return { start: best, end: best + entry.quote.length };
    }

    // No quote to match, or the words are gone. Believe the offsets only if
    // what is there now is what was highlighted then.
    if (typeof entry.start === 'number' && typeof entry.end === 'number' &&
        entry.end <= text.length &&
        (!entry.quote || text.slice(entry.start, entry.end) === entry.quote)) {
      return { start: entry.start, end: entry.end };
    }

    return null;
  }

  /* One block of guide prose, escaped, with every highlight in it wrapped in
     a <mark>. Built as a string because that is how every screen in this app
     renders: no DOM surgery after paint, so a re-render is idempotent and
     nothing has to be undone before it can be done again.

     Overlapping highlights are not nested. The first one placed wins and a
     later one that would collide is skipped for drawing only; its entry is
     untouched and still in the Journal. Nested marks would need a proper
     interval tree to render and would look like a smudge on the page. */

  function marked(guideId, path, text) {
    text = String(text == null ? '' : text);
    if (!guideId) return esc(text);

    /* A locked journal is locked everywhere it surfaces, not only on its own
       screen. Which lines somebody underlined, and which of those they wrote
       about, is their journal showing through a guide. So while the lock is
       on, a guide renders exactly as it does for somebody who has never
       highlighted anything. */
    if (isLocked()) return esc(text);

    var ranges = [];
    forAnchor(guideId, path).forEach(function (entry) {
      var at = locate(entry, text);
      if (!at) return;
      var clash = ranges.some(function (r) { return at.start < r.end && r.start < at.end; });
      if (!clash) ranges.push({ start: at.start, end: at.end, entry: entry });
    });

    if (!ranges.length) return esc(text);

    ranges.sort(function (a, b) { return a.start - b.start; });

    var out = '';
    var cursor = 0;
    ranges.forEach(function (r) {
      out += esc(text.slice(cursor, r.start));
      // A highlight that carries a note is drawn a shade heavier, so the page
      // says which ones you wrote about without opening any of them.
      /* role and tabindex rather than a real <button>. A button inside a
         paragraph suppresses text selection across itself on iOS, which
         would mean the one sentence you already highlighted is the one
         sentence you can never highlight a longer version of. See the
         keydown handler in js/app.js for the keyboard half. */
      out += '<mark class="hc-hl' + (r.entry.bodyText ? ' hc-hl--noted' : '') + '" ' +
        'data-action="hl-open" data-id="' + esc(r.entry.id) + '" ' +
        'role="button" tabindex="0" ' +
        'aria-label="' + esc(r.entry.bodyText ? 'Your note on this' : 'Highlighted') + '">' +
        esc(text.slice(r.start, r.end)) + '</mark>';
      cursor = r.end;
    });
    out += esc(text.slice(cursor));
    return out;
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

  /* ----------------------------------------------------------------- sync

     Local is the source of truth and the network is a courier. Nothing below
     is ever waited on by anything a person can see: a save is already on
     screen and already on disk before push() is called, and a push that fails
     leaves the entry dirty to try again later. A journal that needs a signal
     is not a journal.

     LAST WRITE WINS, PER ENTRY, ON updated_at. The realistic conflict is "I
     edited this on my iPad an hour ago", not two people typing at once, and
     there is only ever one person. The comparison is on when somebody typed,
     which is why the phone sends its own updated_at and migration 0023's
     trigger does not overwrite it.

     DELETES ARE ROWS. See remove(). A tombstone is pushed like anything else
     and only purged locally once the server has it, because a hard delete
     syncs as an absence and the other phone would upload it again.

     WHAT NEVER GOES UP. Entries owned by 'local'. Signed out, nothing here
     runs at all. */

  var TABLE = 'journal_entries';
  var syncing = false;

  function toRow(entry) {
    return {
      id: entry.id,
      kind: entry.kind,
      guide_id: entry.guideId,
      guide_title: entry.guideTitle,
      path: entry.path,
      quote: entry.quote,
      range_start: entry.start,
      range_end: entry.end,
      title: entry.title || null,
      body_html: entry.bodyHtml,
      body_text: entry.bodyText,
      refs: entry.refs || [],
      pinned: !!entry.pinned,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      deleted_at: entry.deletedAt
      // user_id is deliberately absent. Migration 0023's trigger sets it from
      // the caller's own token, so a client cannot put a row anywhere but its
      // own journal even if it tried.
    };
  }

  function fromRow(row) {
    return {
      id: row.id,
      ownerId: row.user_id || owner(),
      kind: row.kind || 'entry',
      guideId: row.guide_id,
      guideTitle: row.guide_title,
      path: row.path,
      quote: row.quote,
      start: row.range_start,
      end: row.range_end,
      title: row.title || '',
      // Sanitized again on arrival. The row may have been written by an older
      // build of this file, and the version that renders is the version that
      // decides what is safe.
      bodyHtml: sanitize(row.body_html || ''),
      bodyText: row.body_text || '',
      refs: row.refs || [],
      pinned: !!row.pinned,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      dirty: false
    };
  }

  function canSync() {
    return !!(HC.auth && HC.auth.isConfigured() && HC.auth.isSignedIn());
  }

  // Everything written since the last time this phone looked, merged in.
  function pull() {
    var s = load();
    var since = s.lastPulledAt;
    var path = '/' + TABLE + '?select=*&order=updated_at.asc' +
      (since ? '&updated_at=gt.' + encodeURIComponent(since) : '');

    return HC.auth.restFetch(path).then(function (rows) {
      if (!Array.isArray(rows)) return 0;
      var changed = 0;

      rows.forEach(function (row) {
        var incoming = fromRow(row);
        var here = s.entries[incoming.id];

        // A local edit that has not gone up yet and is newer than what came
        // down keeps the field. It is still dirty and will win on the push.
        if (here && here.dirty && here.updatedAt >= incoming.updatedAt) return;
        if (here && here.updatedAt > incoming.updatedAt) return;

        s.entries[incoming.id] = incoming;
        changed++;
      });

      if (rows.length) s.lastPulledAt = rows[rows.length - 1].updated_at;
      if (changed || rows.length) persist();
      return changed;
    });
  }

  // Everything this phone has that the server has not been told about.
  function push() {
    var s = load();
    var me = owner();

    var pending = Object.keys(s.entries)
      .map(function (id) { return s.entries[id]; })
      .filter(function (e) { return e.dirty && e.ownerId === me; });

    if (!pending.length) return Promise.resolve(0);

    /* One request for the batch. Prefer: resolution=merge-duplicates is
       PostgREST's upsert, keyed on the primary key, which is exactly what an
       entry that may or may not have made it up before needs. */
    return HC.auth.restFetch('/' + TABLE + '?on_conflict=id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: pending.map(toRow)
    }).then(function () {
      pending.forEach(function (entry) {
        entry.dirty = false;
        // Now that the server holds the tombstone, the phone does not have to.
        if (entry.deletedAt) delete s.entries[entry.id];
      });
      persist();
      return pending.length;
    });
  }

  /* Both directions, one call, and never two at once: a second sync landing
     mid flight would push entries the first one is already pushing and mark
     them clean before the first one's answer arrives. Failure is silent by
     design; the entries stay dirty and the next sync tries again. */
  function sync() {
    if (!canSync() || syncing) return Promise.resolve(false);
    syncing = true;

    return pull()
      .then(push)
      .then(function () { syncing = false; return true; })
      .catch(function () { syncing = false; return false; });
  }

  /* ------------------------------------------------------------ the lock

     Face ID in front of the Journal, for whoever wants it. Off by default,
     and off for everybody whose phone cannot do it, which includes every
     browser. See the long note in js/native.js about what this is: the
     phone's own check in front of a screen, not encryption.

     The state is in memory and nowhere else. That is the whole design: a
     locked flag in localStorage would survive a force quit and could be
     edited by anybody who can edit localStorage, which is exactly the person
     it would need to stop. In memory means every cold start begins locked,
     with no way to write "already unlocked" from outside the running app. */

  var unlocked = false;

  /* Defined below the things that call it. Function declarations hoist, and
     keeping the lock in one block reads better than scattering it through the
     file to satisfy an ordering nothing enforces. */
  function lockOn() {
    return !!HC.store.getProfile().lockJournal;
  }

  // What the screens ask before drawing anything.
  function isLocked() {
    return lockOn() && !unlocked;
  }

  function unlockNow() {
    if (!lockOn()) return Promise.resolve(true);
    return HC.native.unlock('Open your journal').then(function (ok) {
      if (ok) {
        unlocked = true;
        HC.store.emit('journal', null);
      }
      return ok;
    });
  }

  /* Locking again is the half people forget, and it is the half that makes
     the feature real. Three things do it: turning the switch on, leaving the
     app, and time.

     The delay exists because the alternative is unusable. Opening a scripture
     link sends somebody to Safari and back, and a journal that demands Face
     ID on the way back from checking a verse is a journal nobody turns the
     lock on for twice. A minute is long enough to look something up and far
     shorter than the time it takes to hand somebody your phone and walk
     away. */
  var LOCK_AFTER = 60000;
  var leftAt = 0;

  function lockAgain() {
    unlocked = false;
    HC.store.emit('journal', null);
  }

  function watchForeground() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        leftAt = Date.now();
        return;
      }
      if (lockOn() && unlocked && leftAt && Date.now() - leftAt > LOCK_AFTER) lockAgain();
      leftAt = 0;
    });
  }

  /* ----------------------------------------------------------------- init */

  function init() {
    load();
    migrateFromGuideState();

    // Signing in adopts what was written signed out, once, and only on a
    // phone that has not belonged to somebody else. See adoptLoose().
    HC.store.on('auth', function (evt) {
      if (evt && evt.signedIn && evt.user && evt.user.id) {
        adoptLoose(evt.user.id);
        sync();
      }
      HC.store.emit('journal', null);
    });

    /* Signing out is not a reason to throw anything away. The entries stay on
       the phone, owned by the account that wrote them, which is what makes
       them invisible to whoever signs in next and still there when their
       owner comes back. See mine(). */

    if (canSync()) sync();

    /* Coming back to the app is when another phone's writing arrives. There
       is no push channel here and there does not need to be: a journal is not
       a conversation, and once per foreground is as live as it has to be. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) sync();
    });

    watchForeground();
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

    locate: locate,
    marked: marked,

    sanitize: sanitize,
    plainText: plainText,
    textToHtml: textToHtml,
    refsIn: refsIn,

    owner: owner,
    sync: sync,

    isLocked: isLocked,
    lockOn: lockOn,
    unlockNow: unlockNow,
    lockAgain: lockAgain,
    canSync: canSync,

    // Exported for the tests and for nothing else.
    _state: load,
    _push: push,
    _pull: pull,
    _toRow: toRow,
    _fromRow: fromRow,
    _migrate: migrateFromGuideState,
    _adopt: adoptLoose
  };

})(window.HC = window.HC || {});
