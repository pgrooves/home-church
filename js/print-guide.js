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
    return page('hc-print-page--cover',
      '<p class="hc-print-eyebrow">Home Church &middot; Small Group Guide</p>' +
      '<h1 class="hc-print-h1">' + c.esc(HC.data.guideTitle(guide)) + '</h1>' +
      '<p class="hc-print-subtitle">' + c.esc(guide.subtitle) + '</p>' +
      '<div class="hc-print-divider" aria-hidden="true"></div>' +
      '<p class="hc-print-meta">Based on the sermon &middot; ' + c.esc(guide.primaryPassage) + '</p>' +
      '<p class="hc-print-colophon">' + c.esc(guide.preacher) + ' &middot; ' + c.esc(c.formatDate(guide.preachedOn)) +
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

  HC.print = { guide: guide };

})(window.HC = window.HC || {});
