/* ==========================================================================
   Home Church, guide download
   Builds a paginated, printable version of any guide straight from the
   same data.js object the reader renders, then hands it to the browser's
   own print dialog, save as PDF included. New guides need nothing here,
   this reads whatever is in the guides array.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;
  var SHEET_ID = 'hc-print-sheet';

  function page(className, innerHtml) {
    return '<div class="hc-print-page ' + className + '">' + innerHtml + '</div>';
  }

  function footer(title, num) {
    return '<div class="hc-print-foot"><span>' + c.esc(title) + '</span><span>' + c.esc(num) + '</span></div>';
  }

  function coverPage(guide, series) {
    var meta = HC.data.guideMeta(guide);
    return page('hc-print-page--cover',
      '<p class="hc-print-eyebrow">Home Church &middot; Small Group Guide</p>' +
      '<h1 class="hc-print-h1">' + c.esc(HC.data.guideTitle(guide)) + '</h1>' +
      '<p class="hc-print-subtitle">' + c.esc(guide.subtitle) + '</p>' +
      '<div class="hc-print-divider" aria-hidden="true"></div>' +
      '<p class="hc-print-meta">Based on the sermon &middot; ' + c.esc(meta.passage) + '</p>' +
      '<p class="hc-print-colophon">' + c.esc(c.byline(meta.preacher, meta.preachedOn)) +
        (series ? '<br>' + c.esc(series.title) : '') + '</p>'
    );
  }

  function shortSummaryPage(guide, num) {
    var body = '<p class="hc-print-usage">This guide is built around Sunday&rsquo;s sermon for use in a small group ' +
      'setting. Move through the discussion questions conversationally. Not every question needs to be asked. ' +
      'The self-reflection questions are meant to go home with your group.</p>' +
      '<p class="hc-print-eyebrow">Short Summary</p>' +
      '<h2 class="hc-print-h2">Overview</h2>';
    guide.shortSummary.forEach(function (p) { body += '<p class="hc-print-body">' + c.esc(p) + '</p>'; });
    return page('', body + footer(HC.data.guideTitle(guide), num));
  }

  // Full summary can run long, so it is split across as many pages as it
  // takes, roughly three paragraphs per page, matching how the short summary
  // page reads. The heading only appears on the first page.
  function fullSummaryPages(guide, startNum) {
    var out = [];
    var perPage = 3;
    var paras = guide.fullSummary;
    var num = startNum;
    for (var i = 0; i < paras.length; i += perPage) {
      var chunk = paras.slice(i, i + perPage);
      var body = '';
      if (i === 0) {
        body += '<p class="hc-print-eyebrow">Full Summary</p>' +
          '<h2 class="hc-print-h2">Sermon Summary</h2>';
      }
      chunk.forEach(function (p) { body += '<p class="hc-print-body">' + c.esc(p) + '</p>'; });
      out.push(page('', body + footer(HC.data.guideTitle(guide), num)));
      num++;
    }
    return out;
  }

  function anchorsPage(guide, num) {
    if (!guide.anchors || !guide.anchors.length) return null;
    var body = '<p class="hc-print-eyebrow">The Three Marks</p>' +
      '<h2 class="hc-print-h2">Where it went</h2><div class="hc-print-anchors">';
    guide.anchors.forEach(function (a) {
      body += '<div class="hc-print-anchor">' +
        '<p class="hc-print-anchor-label">' + c.esc(a.label) + '</p>' +
        '<p class="hc-print-anchor-body">' + c.esc(a.body) + '</p>' +
      '</div>';
    });
    body += '</div>';
    return page('', body + footer(HC.data.guideTitle(guide), num));
  }

  // Discussion questions are grouped two or three sections per page so a
  // section never splits mid-list.
  function discussionPages(guide, startNum) {
    var out = [];
    var sections = guide.groupSections;
    var num = startNum;
    var i = 0;
    while (i < sections.length) {
      var body = '';
      if (i === 0) {
        body += '<p class="hc-print-eyebrow">For the Group</p>' +
          '<h2 class="hc-print-h2">Discussion Questions</h2>';
      }
      var placed = 0;
      while (i < sections.length && placed < 3) {
        var section = sections[i];
        body += '<div class="hc-print-qsection"><h3>' + c.esc(section.heading) + '</h3><ul>';
        section.questions.forEach(function (q) { body += '<li>' + c.esc(q) + '</li>'; });
        body += '</ul></div>';
        i++;
        placed++;
      }
      out.push(page('', body + footer(HC.data.guideTitle(guide), num)));
      num++;
    }
    return out;
  }

  function reflectionPage(guide, num) {
    var body = '<p class="hc-print-eyebrow">Take Home</p>' +
      '<h2 class="hc-print-h2">Self-Reflection Questions</h2><div class="hc-print-reflect">';
    guide.reflectionQuestions.forEach(function (q) {
      body += '<div class="hc-print-reflect-item"><p class="hc-print-reflect-text">' + c.esc(q) + '</p></div>';
    });
    body += '</div>';
    return page('', body + footer(HC.data.guideTitle(guide), num));
  }

  function oneLinerPages(guide, startNum) {
    var out = [];
    var lines = guide.oneLiners;
    var perPage = 10;
    var num = startNum;
    for (var i = 0; i < lines.length; i += perPage) {
      var chunk = lines.slice(i, i + perPage);
      var body = '';
      if (i === 0) {
        body += '<p class="hc-print-eyebrow">From the Pulpit</p>' +
          '<h2 class="hc-print-h2">Impactful One-Liners</h2>';
      }
      body += '<div class="hc-print-liners">';
      chunk.forEach(function (line) { body += '<div class="hc-print-liner">' + c.esc(line) + '</div>'; });
      body += '</div>';
      out.push(page('', body + footer(HC.data.guideTitle(guide), num)));
      num++;
    }
    return out;
  }

  function scripturePages(guide, startNum) {
    var out = [];
    var items = guide.scriptures;
    var perPage = 7;
    var num = startNum;
    for (var i = 0; i < items.length; i += perPage) {
      var chunk = items.slice(i, i + perPage);
      var body = '';
      if (i === 0) {
        body += '<p class="hc-print-eyebrow">Referenced in the Sermon</p>' +
          '<h2 class="hc-print-h2">Scripture Index</h2>';
      }
      chunk.forEach(function (s) {
        body += '<div class="hc-print-scripture">' +
          '<p class="hc-print-scripture-ref">' + c.esc(s.reference) + '</p>' +
          '<p class="hc-print-scripture-note">' + c.esc(s.note) + '</p>' +
        '</div>';
      });
      out.push(page('', body + footer(HC.data.guideTitle(guide), num)));
      num++;
    }
    return out;
  }

  function closingPage(guide) {
    if (!guide.closingScripture) return null;
    return page('hc-print-page--closing',
      '<p class="hc-print-quote">&ldquo;' + c.esc(guide.closingScripture.text) + '&rdquo;</p>' +
      '<p class="hc-print-quote-ref">' + c.esc(guide.closingScripture.reference) + '</p>' +
      '<p class="hc-print-wordmark">Home Church &middot; ' + c.esc(HC.data.church.websiteUrl.replace(/^https?:\/\//, '')) + '</p>'
    );
  }

  function buildPages(guide, series) {
    var pages = [coverPage(guide, series)];
    var num = 2;

    pages.push(shortSummaryPage(guide, num)); num++;

    fullSummaryPages(guide, num).forEach(function (p) { pages.push(p); num++; });

    var anchors = anchorsPage(guide, num);
    if (anchors) { pages.push(anchors); num++; }

    discussionPages(guide, num).forEach(function (p) { pages.push(p); num++; });

    pages.push(reflectionPage(guide, num)); num++;

    oneLinerPages(guide, num).forEach(function (p) { pages.push(p); num++; });

    scripturePages(guide, num).forEach(function (p) { pages.push(p); num++; });

    var closing = closingPage(guide);
    if (closing) pages.push(closing);

    return pages.join('');
  }

  function removeSheet() {
    var el = document.getElementById(SHEET_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    window.removeEventListener('afterprint', removeSheet);
  }

  /* A complete, self contained HTML document for one guide.
     ------------------------------------------------------------------------
     window.print() is a no-op inside WKWebView. It works in Safari and does
     nothing at all inside a packaged app, silently, which made Download guide
     a dead button the moment this was wrapped for iOS. It was the kind of
     dead button that is hard to notice, because it fails without an error.

     So on a phone the guide becomes a real file instead, handed to the system
     share sheet, where iOS offers Print, Save to Files, and Mail. A leader
     ends up with the same piece of paper by a different road.

     print.css is fetched and inlined rather than linked, because the file
     leaves the app and a relative stylesheet link would resolve to nothing
     wherever it lands. If the fetch fails the document still opens, it just
     arrives unstyled, which is worse than the alternative and much better
     than nothing. */
  /* One document wrapper, used by the guide and by the night sheet. Pulled
     out of standaloneHtml when the Group tab needed the same thing around a
     different set of pages: there is no reason for two copies of the
     stylesheet inlining, and a second copy is how they drift. */
  function wrap(title, pagesHtml) {
    return fetch('css/print.css')
      .then(function (res) { return res.ok ? res.text() : ''; })
      .catch(function () { return ''; })
      .then(function (css) {
        return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
          '<meta charset="utf-8">\n' +
          '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
          '<title>' + c.esc(title) + ', Home Church</title>\n' +
          '<style>\n' +
            // The screen rules in print.css only apply inside @media print, so
            // the sheet needs to be visible on screen too when it stands alone.
            'body{margin:0;background:#fff;color:#111;' +
              'font-family:Georgia,"Times New Roman",serif;}\n' +
            '#' + SHEET_ID + '{display:block !important;}\n' +
            css + '\n' +
          '</style>\n' +
          '</head>\n<body>\n' +
          '<div id="' + SHEET_ID + '">' + pagesHtml + '</div>\n' +
          '</body>\n</html>';
      });
  }

  function standaloneHtml(guideId) {
    var g = HC.data.getGuide(guideId);
    if (!g) return Promise.reject(new Error('No such guide.'));
    var series = HC.data.getSeries(g.seriesId);
    return wrap(HC.data.guideTitle(g), buildPages(g, series));
  }

  /* ------------------------------------------------------------ the night
     What a group actually did on a Thursday, as one sheet. Everything goes
     in: the guide it was built on, every question including the ones the host
     added, what each person wrote whether or not it was opened during the
     evening, and the prayer list.

     ON PRINTING EVERYTHING. The reveal is a thing that happens during the
     meeting, not a permission that outlives it. By the time this sheet is
     made the group has been through the questions together, and a sheet that
     silently dropped the answers nobody got to would be a worse record than
     no sheet. Said plainly on the button and again on the cover, because the
     one thing this must not do is surprise somebody.

     Pagination is by an estimated line count rather than a fixed number of
     questions per page. One question can have six answers and the next can
     have none, and chunking by count puts a page break in the middle of the
     only interesting thing on the page. */

  function nightCover(snap, when) {
    var names = snap.members.map(function (m) { return m.name; });
    return page('hc-print-page--cover',
      '<p class="hc-print-eyebrow">Home Church &middot; Small Group</p>' +
      '<h1 class="hc-print-h1">' + c.esc(snap.room.groupName || snap.room.guideTitle || 'Your group') + '</h1>' +
      '<p class="hc-print-subtitle">' + c.esc(when) + '</p>' +
      '<div class="hc-print-divider" aria-hidden="true"></div>' +
      (snap.room.guideTitle
        ? '<p class="hc-print-meta">On the guide &middot; ' + c.esc(snap.room.guideTitle) + '</p>'
        : '') +
      '<p class="hc-print-colophon">' + c.esc(names.join(', ')) + '</p>'
    );
  }

  // Roughly how many lines a block will take, for deciding where a page ends.
  function linesFor(text, perLine) {
    return Math.max(1, Math.ceil((text || '').length / (perLine || 60)));
  }

  function nightQuestionPages(snap, startNum, title) {
    var out = [];
    var num = startNum;
    var budget = 26;         // lines that fit under the heading on one page
    var used = 0;
    var body = '';
    var first = true;

    function flush() {
      if (!body) return;
      out.push(page('', body + footer(title, num)));
      num++;
      body = '';
      used = 0;
    }

    snap.questions.forEach(function (q, i) {
      var answers = snap.notes.filter(function (n) {
        return n.kind === 'answer' && n.questionId === q.id;
      });

      var cost = 3 + linesFor(q.body, 52);
      answers.forEach(function (a) { cost += 1 + linesFor(a.body, 58); });

      // A block that will not fit starts a new page, unless the page is empty,
      // in which case it is simply a long block and gets one to itself.
      if (used && used + cost > budget) flush();

      if (first || !body) {
        body += '<p class="hc-print-eyebrow">What the group talked about</p>' +
                '<h2 class="hc-print-h2">Discussion</h2>';
        first = false;
      }

      body += '<div class="hc-print-night-q">' +
        '<p class="hc-print-question">' + (i + 1) + '. ' + c.esc(q.body) + '</p>';

      if (!answers.length) {
        body += '<p class="hc-print-night-none">Nobody wrote on this one.</p>';
      }
      answers.forEach(function (a) {
        body += '<div class="hc-print-night-a">' +
          '<p class="hc-print-night-who">' + c.esc(a.author) + '</p>' +
          '<p class="hc-print-body">' + c.esc(a.body) + '</p>' +
        '</div>';
      });
      body += '</div>';
      used += cost;
    });

    flush();
    return out;
  }

  function nightPrayerPages(snap, startNum, title) {
    var prayers = snap.notes.filter(function (n) { return n.kind === 'prayer'; });
    if (!prayers.length) return [];

    var out = [];
    var num = startNum;
    var perPage = 8;
    for (var i = 0; i < prayers.length; i += perPage) {
      var body = '';
      if (i === 0) {
        body += '<p class="hc-print-eyebrow">Before you go</p>' +
                '<h2 class="hc-print-h2">Prayer Requests</h2>';
      }
      prayers.slice(i, i + perPage).forEach(function (r) {
        body += '<div class="hc-print-night-a">' +
          '<p class="hc-print-night-who">' + c.esc(r.author) + '</p>' +
          '<p class="hc-print-body">' + c.esc(r.body) + '</p>' +
        '</div>';
      });
      out.push(page('', body + footer(title, num)));
      num++;
    }
    return out;
  }

  function buildNightPages(snap) {
    if (!snap || !snap.room) return '';

    var when = c.formatDate(new Date(snap.room.openedAt || Date.now())
      .toISOString().slice(0, 10));
    var title = (snap.room.groupName || snap.room.guideTitle || 'Your group') + ', ' + when;

    var pages = [nightCover(snap, when)];
    var num = 2;

    nightQuestionPages(snap, num, title).forEach(function (p) { pages.push(p); num++; });
    nightPrayerPages(snap, num, title).forEach(function (p) { pages.push(p); num++; });

    return pages.join('');
  }

  function nightHtml(snap) {
    if (!snap || !snap.room) return Promise.reject(new Error('There is no room to write down.'));
    var when = c.formatDate(new Date(snap.room.openedAt || Date.now())
      .toISOString().slice(0, 10));
    return wrap((snap.room.groupName || snap.room.guideTitle || 'Your group') + ', ' + when,
                buildNightPages(snap));
  }

  // The print dialog road, for a browser. On a phone window.print() is a
  // no-op, which is why the app hands a file to the share sheet instead.
  function night(snap) {
    if (!snap || !snap.room) return;
    removeSheet();
    var sheet = document.createElement('div');
    sheet.id = SHEET_ID;
    sheet.innerHTML = buildNightPages(snap);
    document.body.appendChild(sheet);
    window.addEventListener('afterprint', removeSheet);
    window.setTimeout(removeSheet, 60000);
    window.print();
  }

  /* ---------------------------------------------------------- the journal

     Everything somebody has written, as one document they can keep.

     THIS IS NOT A CONVENIENCE. The journal syncs to an account now, which
     means the church holds a copy of writing that is often the most personal
     thing in the app. A person who wants their own copy of their own words
     should not have to ask anybody for it, and should not have to trust that
     the app will still be here next year. So this exists for the same reason
     the Your data screen exists, and it is one tap from the list.

     Grouped by guide, newest first, exactly the way the Journal screen groups
     them, so the paper and the screen tell the same story in the same order.

     Markup goes through the sanitizer once more on the way out. This document
     leaves the app and opens in a browser somebody else's phone chose, which
     is the last place to start trusting a stored string. */

  function journalCover(entries, when) {
    var guides = {};
    entries.forEach(function (e) { if (e.guideTitle) guides[e.guideTitle] = true; });
    var count = Object.keys(guides).length;

    return page('hc-print-page--cover',
      '<p class="hc-print-eyebrow">Home Church &middot; Your Journal</p>' +
      '<h1 class="hc-print-h1">What you wrote</h1>' +
      '<p class="hc-print-subtitle">' +
        entries.length + (entries.length === 1 ? ' entry' : ' entries') +
        (count ? ', across ' + count + (count === 1 ? ' guide' : ' guides') : '') +
      '</p>' +
      '<div class="hc-print-divider" aria-hidden="true"></div>' +
      '<p class="hc-print-meta">Printed ' + c.esc(when) + '</p>' +
      '<p class="hc-print-colophon">This is your copy, and it is yours to keep. ' +
        'Nobody else has ever read any of it.</p>'
    );
  }

  function journalPages(entries, startNum, title) {
    var out = [];
    var num = startNum;
    var budget = 26;
    var used = 0;
    var body = '';
    var heading = null;      // the guide whose section we are inside

    function flush() {
      if (!body) return;
      out.push(page('', body + footer(title, num)));
      num++;
      body = '';
      used = 0;
    }

    // Grouped the way the screen groups them, loose notes last.
    var order = [];
    var groups = {};
    entries.forEach(function (e) {
      var key = e.guideId || '__loose';
      if (!groups[key]) {
        groups[key] = { title: e.guideTitle || 'Loose notes', entries: [] };
        order.push(key);
      }
      groups[key].entries.push(e);
    });
    order = order.filter(function (k) { return k !== '__loose'; })
      .concat(groups.__loose ? ['__loose'] : []);

    order.forEach(function (key) {
      var group = groups[key];

      group.entries.forEach(function (e) {
        var text = e.bodyText || '';
        var cost = 3 + linesFor(e.quote, 52) + linesFor(text, 58);
        var opening = heading !== key;
        if (opening) cost += 3;

        if (used && used + cost > budget) flush();

        // A page that starts mid-section says which section it is, so a
        // sheet read out of order still makes sense.
        if (opening || !body) {
          body += '<p class="hc-print-eyebrow">' +
            (key === '__loose' ? 'No guide' : 'On the guide') + '</p>' +
            '<h2 class="hc-print-h2">' + c.esc(group.title) + '</h2>';
          heading = key;
        }

        body += '<div class="hc-print-night-q">';

        if (e.quote) {
          body += '<p class="hc-print-question">&ldquo;' + c.esc(e.quote) + '&rdquo;</p>';
        }

        body += '<div class="hc-print-night-a">' +
          '<p class="hc-print-night-who">' +
            c.esc(c.formatDate(String(e.createdAt).slice(0, 10))) +
          '</p>' +
          (text
            ? '<div class="hc-print-body">' + HC.journal.sanitize(e.bodyHtml || '') + '</div>'
            : '<p class="hc-print-night-none">Highlighted, with nothing written about it.</p>') +
          ((e.refs || []).length
            ? '<p class="hc-print-meta">' + c.esc(e.refs.join(' &middot; ')) + '</p>'
            : '') +
        '</div></div>';

        used += cost;
      });
    });

    flush();
    return out;
  }

  function buildJournalPages(entries) {
    if (!entries || !entries.length) return '';
    var when = c.formatDate(new Date().toISOString().slice(0, 10));
    var title = 'Your journal, ' + when;
    var pages = [journalCover(entries, when)];
    journalPages(entries, 2, title).forEach(function (p) { pages.push(p); });
    return pages.join('');
  }

  function journalHtml(entries) {
    if (!entries || !entries.length) {
      return Promise.reject(new Error('There is nothing written down yet.'));
    }
    return wrap('Your journal', buildJournalPages(entries));
  }

  function journal(entries) {
    if (!entries || !entries.length) return;
    removeSheet();
    var sheet = document.createElement('div');
    sheet.id = SHEET_ID;
    sheet.innerHTML = buildJournalPages(entries);
    document.body.appendChild(sheet);
    window.addEventListener('afterprint', removeSheet);
    window.setTimeout(removeSheet, 60000);
    window.print();
  }

  function guide(guideId) {
    var g = HC.data.getGuide(guideId);
    if (!g) return;
    var series = HC.data.getSeries(g.seriesId);

    removeSheet(); // in case a previous one never cleaned up
    var sheet = document.createElement('div');
    sheet.id = SHEET_ID;
    sheet.innerHTML = buildPages(g, series);
    document.body.appendChild(sheet);

    window.addEventListener('afterprint', removeSheet);
    // Some in-app browsers (notably older iOS WebViews under Capacitor)
    // never fire afterprint, so clean up on a delay regardless.
    window.setTimeout(removeSheet, 60000);

    window.print();
  }

  HC.print = {
    guide: guide,
    standaloneHtml: standaloneHtml,
    night: night,
    nightHtml: nightHtml,
    buildNightPages: buildNightPages,
    journal: journal,
    journalHtml: journalHtml,
    buildJournalPages: buildJournalPages
  };

})(window.HC = window.HC || {});
