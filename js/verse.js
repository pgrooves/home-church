/* ==========================================================================
   Home Church, the verse sheet
   Tap a reference anywhere in the app and the words come up over whatever
   you were reading, the way they do in the YouVersion app, instead of a web
   page opening on top of it.

   WHERE IT IS OPENED FROM. Two doors, both in js/app.js:
     'open-scripture'   the scripture rows on a guide
     the link handler   a scripture link inside a journal entry or an
                        announcement, bible.com or the Bible Gateway ones
                        entries written before this carried
   Both hand over the reference as written, and this does the rest.

   WHERE THE WORDS COME FROM. supabase/functions/bible-passage, which asks
   YouVersion with the church's key. Never YouVersion directly: the key would
   have to ship in the bundle. The function answers a GET with nothing
   secret in it, and index.html's connect-src already allows that host.

   WHAT HAPPENS WITH NO SIGNAL. Every passage somebody has opened is kept on
   this phone, so the verses from Sunday's guide still open on the train. One
   that has never been opened says so and offers bible.com instead, which
   is the honest answer: the words are not here, and that button is where
   they are.

   WHAT IT WILL NOT DO is guess. A reference js/bible.js cannot read, or one
   that runs past the end of its chapter, never reaches the network. It goes
   straight to bible.com's search, which is where the old Bible Gateway link
   would have sent it anyway.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var KEY = 'verses';          // hc:verses in localStorage, via HC.store
  var KEEP = 150;              // passages kept on the phone, newest first

  /* What is on screen right now: the passages the reference named, which one
     is showing, and what came back for it. `ticket` is bumped on every open,
     so an answer that arrives after the sheet moved on is dropped rather than
     painted over the passage somebody is now reading. */
  var view = null;
  var ticket = 0;

  /* ------------------------------------------------------------ the cache */

  function cacheKey(id) {
    return HC.bible.VERSION.id + ':' + id;
  }

  function readCache() {
    var all = HC.store.storage.get(KEY, null);
    return all && typeof all === 'object' && Array.isArray(all.order) ? all : { order: [], items: {} };
  }

  function fromCache(id) {
    return readCache().items[cacheKey(id)] || null;
  }

  function toCache(id, passage) {
    var all = readCache();
    var k = cacheKey(id);
    all.items[k] = passage;
    all.order = [k].concat(all.order.filter(function (x) { return x !== k; }));
    // Oldest out first. A hundred and fifty passages is a few months of guides.
    all.order.splice(KEEP).forEach(function (gone) { delete all.items[gone]; });
    HC.store.storage.set(KEY, all);
  }

  /* ---------------------------------------------------------- the network */

  function endpoint(id) {
    var base = String(HC.config && HC.config.SUPABASE_URL || '').replace(/\/$/, '');
    return base ? base + '/functions/v1/bible-passage?ref=' + encodeURIComponent(id) : '';
  }

  /* Resolves with { reference, text, version } or rejects with an Error whose
     message is the one to show. `offline` on the error means the network
     never answered, which the sheet words differently from a real refusal. */
  function fetchPassage(id) {
    var url = endpoint(id);
    if (!url || typeof fetch !== 'function') {
      return Promise.reject(Object.assign(new Error('Verses are not switched on yet.'), { offline: true }));
    }
    return fetch(url, {
      method: 'GET',
      headers: { apikey: HC.config.SUPABASE_ANON_KEY }
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || !body || !body.text) {
          throw new Error((body && body.error) || 'We could not open that passage.');
        }
        return {
          reference: body.reference || '',
          text: String(body.text),
          version: body.version || {}
        };
      });
    }, function () {
      throw Object.assign(new Error('You look to be offline.'), { offline: true });
    });
  }

  /* ------------------------------------------------------------ the sheet */

  function paragraphs(text) {
    return String(text || '').split(/\n{2,}/).map(function (para) {
      return '<p class="hc-body-serif hc-verse__text">' +
        c.esc(para).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* One passage of several: "Matthew 10:1-4; Mark 3:31-35" is two, and the
     pills across the top move between them without closing anything. */
  function pills() {
    if (view.passages.length < 2) return '';
    return '<div class="hc-verse__pills" role="tablist">' +
      view.passages.map(function (p, i) {
        var on = i === view.index;
        return '<button type="button" class="hc-verse__pill" role="tab" ' +
          'data-action="verse-show" data-id="' + i + '" ' +
          'aria-selected="' + (on ? 'true' : 'false') + '">' +
          c.esc(HC.bible.label(p)) + '</button>';
      }).join('') +
    '</div>';
  }

  function body() {
    var p = view.passages[view.index];
    var got = view.results[view.index];

    if (!got || got.loading) {
      return '<p class="hc-caption hc-verse__status" aria-live="polite">Opening ' +
        c.esc(HC.bible.label(p)) + '…</p>';
    }

    if (got.error) {
      return '<p class="hc-caption hc-verse__status" aria-live="polite">' +
        c.esc(got.offline
          ? 'This passage is not saved on this phone yet, and it needs a connection the first time.'
          : got.error) +
        '</p>';
    }

    var v = got.version || {};
    return paragraphs(got.text) +
      (v.copyright || v.abbreviation
        ? '<p class="hc-caption hc-verse__credit">' +
            c.esc(v.copyright || v.abbreviation) + '</p>'
        : '');
  }

  function sheet() {
    var p = view.passages[view.index];
    var got = view.results[view.index] || {};
    var version = (got.version && got.version.abbreviation) || HC.bible.VERSION.abbreviation;

    return '' +
      '<div class="hc-sheet" data-sheet="verse" role="dialog" aria-modal="true" ' +
          'aria-label="' + c.esc(view.label) + '">' +
        '<button type="button" class="hc-sheet__scrim" data-action="verse-close" ' +
          'tabindex="-1" aria-hidden="true"></button>' +
        '<div class="hc-sheet__panel hc-verse">' +
          '<div class="hc-sheet__head">' +
            '<p class="hc-eyebrow">' + c.esc(version) + '</p>' +
            '<button type="button" class="hc-sheet__close" data-action="verse-close" ' +
              'aria-label="Close">' + c.icon('close') + '</button>' +
          '</div>' +
          pills() +
          '<h2 class="hc-sheet__preview hc-verse__ref">' + c.esc(HC.bible.label(p)) + '</h2>' +
          '<div class="hc-verse__body">' + body() + '</div>' +
          '<div class="hc-sheet__foot">' +
            c.button('Read the full chapter', {
              action: 'open-url', url: HC.bible.chapterUrl(p), variant: 'secondary'
            }) +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function paint() {
    var el = document.querySelector('[data-sheet="verse"]');
    if (!view) return;
    var fresh = c.el(sheet());
    if (el && el.parentNode) {
      // Keep the panel where it was scrolled to while the words arrive.
      var top = el.querySelector('.hc-sheet__panel').scrollTop;
      el.parentNode.replaceChild(fresh, el);
      fresh.querySelector('.hc-sheet__panel').scrollTop = top;
      // Drawn already, so the entrance animation has already been seen once.
      fresh.setAttribute('data-settled', 'true');
    } else {
      document.getElementById('app').appendChild(fresh);
      var close = fresh.querySelector('.hc-sheet__close');
      if (close) close.focus();
    }
  }

  function load(index) {
    var p = view.passages[index];
    var id = HC.bible.usfm(p);
    var mine = ticket;

    var hit = fromCache(id);
    if (hit) {
      view.results[index] = hit;
      return;
    }

    view.results[index] = { loading: true };
    fetchPassage(id).then(function (got) {
      toCache(id, got);
      if (mine !== ticket || !view) return;
      view.results[index] = got;
      paint();
    }, function (err) {
      if (mine !== ticket || !view) return;
      view.results[index] = { error: err.message, offline: !!err.offline };
      paint();
    });
  }

  /* ------------------------------------------------------------- the API */

  function open(reference) {
    var passages = HC.bible.parseAll(reference);
    if (!passages.length) {
      c.openExternal(c.bibleUrl(reference));
      return;
    }

    ticket++;
    close();
    view = {
      label: String(reference || '').trim(),
      passages: passages,
      index: 0,
      results: []
    };
    load(0);
    paint();
  }

  function show(index) {
    if (!view || !view.passages[index]) return;
    view.index = index;
    if (!view.results[index] || view.results[index].error) load(index);
    paint();
  }

  function close() {
    var el = document.querySelector('[data-sheet="verse"]');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function dismiss() {
    ticket++;
    close();
    view = null;
  }

  function isOpen() {
    return !!document.querySelector('[data-sheet="verse"]');
  }

  function init() {
    // Leaving takes the sheet with it, the same rule the reminder sheet keeps.
    HC.store.on('view', function () {
      if (isOpen()) dismiss();
    });

    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && isOpen()) dismiss();
    });
  }

  HC.verse = {
    init: init,
    open: open,
    show: show,
    close: dismiss,
    isOpen: isOpen,
    // For tests/verse.test.js.
    _fromCache: fromCache,
    _endpoint: endpoint
  };

})(window.HC = window.HC || {});
