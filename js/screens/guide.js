/* ==========================================================================
   Home Church, Guide
   The index of guides, the six section reader, and leader presentation mode.
   This is the app's signature asset, everything else is simpler.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* ------------------------------------------------------------ the index */

  // The series name is already on the header above these rows, so the eyebrow
  // carries the passage instead of repeating it.
  function guideRow(guide) {
    var meta = HC.data.guideMeta(guide);
    return '' +
      '<button type="button" class="hc-guide-row" data-action="open-guide" data-id="' + c.esc(guide.id) + '">' +
        '<span class="hc-guide-row__body">' +
          '<span class="hc-eyebrow">' + c.esc(meta.passage) + '</span>' +
          '<span class="hc-guide-row__title">' + c.esc(meta.title) + '</span>' +
          '<span class="hc-caption">' + c.esc(c.byline(meta.preacherShort, meta.preachedOn)) + '</span>' +
        '</span>' +
        c.icon('chevronRight', 'hc-row__chevron') +
      '</button>';
  }

  function index() {
    var guides = HC.data.guidesByDate();
    var html = '<div class="hc-screen">';

    html += c.sectionHeader('For your group', 'Guides', { flush: true, tag: 'h1' });
    html += '<p class="hc-body-serif hc-guide-intro">Every guide follows the same six parts, so you always know where you are. Open one, take what you need, leave the rest.</p>';

    if (!guides.length) {
      html += c.emptyState('Nothing here yet. Your guide shows up after Sunday.');
      html += '</div>';
      return c.el(html);
    }

    // Grouped by series, newest series first, which follows the newest guide.
    var order = [];
    var bySeries = {};
    guides.forEach(function (g) {
      if (!bySeries[g.seriesId]) {
        bySeries[g.seriesId] = [];
        order.push(g.seriesId);
      }
      bySeries[g.seriesId].push(g);
    });

    order.forEach(function (seriesId) {
      var series = HC.data.getSeries(seriesId);
      html += c.sectionHeader('Series', series ? series.title : 'Guides');
      html += '<div class="hc-guide-list">';
      bySeries[seriesId].forEach(function (g) { html += guideRow(g); });
      html += '</div>';
    });

    html += '</div>';
    return c.el(html);
  }

  /* --------------------------------------------------------- reader parts */

  function shortSummarySection(guide) {
    var body = '<div class="hc-prose hc-body-serif">';
    guide.shortSummary.forEach(function (p) { body += '<p>' + c.esc(p) + '</p>'; });
    body += '</div>';
    return c.collapsible({
      id: 'short-summary',
      eyebrow: 'Short Summary',
      title: 'Overview',
      body: body,
      open: true    // the only section open by default
    });
  }

  function fullSummarySection(guide) {
    var body = '<div class="hc-prose hc-body-serif">';
    guide.fullSummary.forEach(function (p) { body += '<p>' + c.esc(p) + '</p>'; });
    body += '</div>';

    if (guide.anchors && guide.anchors.length) {
      body += '<div class="hc-anchors">';
      body += '<p class="hc-eyebrow hc-eyebrow--legible hc-anchors__label">Where it went</p>';
      guide.anchors.forEach(function (a, i) {
        body += c.numberedRow(i + 1,
          '<p class="hc-anchors__title">' + c.esc(a.label) + '</p>' +
          '<p class="hc-body-serif hc-anchors__body">' + c.esc(a.body) + '</p>'
        );
      });
      body += '</div>';
    }

    return c.collapsible({
      id: 'full-summary',
      eyebrow: 'Full Summary',
      title: 'Sermon Summary',
      body: body
    });
  }

  function groupSection(guide) {
    var total = 0;
    guide.groupSections.forEach(function (s) { total += s.questions.length; });
    var covered = HC.store.checkedCount(guide.id);

    var body = '' +
      '<div class="hc-coverage" data-coverage>' +
        '<p class="hc-caption">' + coverageText(covered, total) + '</p>' +
        (covered ? '<button type="button" class="hc-btn hc-btn--tertiary" data-action="clear-checks">Start over</button>' : '') +
      '</div>';

    guide.groupSections.forEach(function (section, si) {
      body += '<div class="hc-qgroup">';
      body += '<p class="hc-eyebrow hc-eyebrow--legible hc-qgroup__label">' + c.esc(section.heading) + '</p>';
      section.questions.forEach(function (q, qi) {
        var key = si + '-' + qi;
        body += c.checkRow(key, q, HC.store.isChecked(guide.id, key));
      });
      body += '</div>';
    });

    return c.collapsible({
      id: 'group',
      eyebrow: 'For the Group',
      title: 'Discussion Questions',
      body: body
    });
  }

  function coverageText(covered, total) {
    if (!covered) return 'Check questions off as you go. ' + total + ' in all, and you will not get to them all. That is fine.';
    return covered + ' of ' + total + ' covered';
  }

  function reflectionSection(guide) {
    var body = '<p class="hc-caption hc-reflection__note">These are yours. Anything you write stays on this phone.</p>';

    guide.reflectionQuestions.forEach(function (q, i) {
      var saved = HC.store.getJournal(guide.id, String(i));
      body += c.numberedRow(i + 1,
        '<p class="hc-question">' + c.esc(q) + '</p>' +
        '<div class="hc-journal">' +
          '<label class="hc-visually-hidden" for="journal-' + i + '">Your notes on question ' + (i + 1) + '</label>' +
          '<textarea class="hc-textarea" id="journal-' + i + '" rows="2" ' +
            'data-journal-key="' + i + '" placeholder="Write it down, or do not. Both are honest.">' +
            c.esc(saved) +
          '</textarea>' +
          '<p class="hc-journal__status" data-journal-status="' + i + '" aria-live="polite"></p>' +
        '</div>'
      );
    });

    return c.collapsible({
      id: 'reflection',
      eyebrow: 'Take Home',
      title: 'Self-Reflection Questions',
      body: body
    });
  }

  function oneLinerSection(guide) {
    var body = '';
    var meta = HC.data.guideMeta(guide);
    var title = meta.title;
    guide.oneLiners.forEach(function (line) {
      body += c.quoteCard(line, meta.preacherShort + ', ' + title, {
        text: '“' + line + '”\n\n' + meta.preacherShort + ', ' + title + ', Home Church',
        title: title
      });
    });
    return c.collapsible({
      id: 'oneliners',
      eyebrow: 'From the Pulpit',
      title: 'Impactful One-Liners',
      body: body
    });
  }

  function scriptureSection(guide) {
    var body = '<div class="hc-scripture-list">';
    guide.scriptures.forEach(function (s) { body += c.scriptureRow(s); });
    body += '</div>';
    return c.collapsible({
      id: 'scripture',
      eyebrow: 'Referenced in the Sermon',
      title: 'Scripture Index',
      body: body
    });
  }

  /* ------------------------------------------------------------- the reader */

  function reader(route) {
    var guide = HC.data.getGuide(route.id);

    if (!guide) {
      return c.el(
        '<div class="hc-screen">' +
          c.sectionHeader('Guides', 'We lost that one', { flush: true, tag: 'h1' }) +
          c.emptyState('That guide is not here. Head back to the list and pick another.') +
          '<div class="hc-mt-lg">' + c.button('Back to guides', { action: 'go-guide', variant: 'secondary' }) + '</div>' +
        '</div>'
      );
    }

    var series = HC.data.getSeries(guide.seriesId);
    var leader = HC.store.getProfile().leaderMode;

    var html = '<div class="hc-screen hc-reader" data-guide="' + c.esc(guide.id) + '">';

    // Masthead
    html += '<div class="hc-reader__head">';
    html += '<p class="hc-eyebrow">' + c.esc(series ? series.title : 'Home Church') + '</p>';
    var meta = HC.data.guideMeta(guide);
    html += '<h1 class="hc-display-l hc-reader__title">' + c.esc(meta.title) + '</h1>';
    html += '<p class="hc-reader__subtitle hc-body-serif">' + c.esc(guide.subtitle) + '</p>';
    html += '<div class="hc-reader__rule" aria-hidden="true"></div>';
    html += '<p class="hc-caption hc-reader__meta">' +
      c.esc(c.metaLine([meta.preacher, meta.preachedOn ? c.formatDate(meta.preachedOn) : '', meta.passage])) + '</p>';
    // The message this guide was built from, when it has an episode of its
    // own. A guide written before the episode posts has nothing specific to
    // point at, so the button stays away rather than sending someone to the
    // show to go hunting. It appears by itself once /new-podcast fills in
    // episodeUrl, which is the same week.
    var sermon = HC.data.getSermon(guide.sermonId);
    html += '<div class="hc-reader__actions">' +
      (sermon && sermon.episodeUrl
        ? c.button('Listen to Sermon', {
            action: 'open-url', url: sermon.episodeUrl, variant: 'secondary', icon: 'listen'
          })
        : '') +
      c.button('Download guide', { action: 'download-guide', id: guide.id, variant: 'secondary', icon: 'download' }) +
    '</div>';
    html += '</div>';

    if (leader) {
      html += '<div class="hc-reader__leader">' +
        c.button('Start presentation mode', { action: 'present', id: guide.id, variant: 'secondary', icon: 'book' }) +
        '<p class="hc-caption hc-reader__leader-note">One question at a time, larger type, easy to read across a living room.</p>' +
      '</div>';
    }

    // The six sections, in the locked order.
    html += shortSummarySection(guide);
    html += fullSummarySection(guide);
    html += groupSection(guide);
    html += reflectionSection(guide);
    html += oneLinerSection(guide);
    html += scriptureSection(guide);

    html += '<div class="hc-hairline hc-mt-xl" role="presentation"></div>';
    html += c.closingScripture(guide.closingScripture);

    html += '</div>';
    return c.el(html);
  }

  /* -------------------------------------------------- presentation mode
     Leader mode only. One question at a time, big type, nothing else on the
     screen. Marking covered writes to the same store the reader uses.
     ------------------------------------------------------------------- */

  function flatQuestions(guide) {
    var flat = [];
    guide.groupSections.forEach(function (section, si) {
      section.questions.forEach(function (q, qi) {
        flat.push({ key: si + '-' + qi, heading: section.heading, text: q });
      });
    });
    return flat;
  }

  function present(route) {
    var guide = HC.data.getGuide(route.id);
    if (!guide) return reader(route);

    var flat = flatQuestions(guide);
    var i = Math.min(Math.max(route.index || 0, 0), flat.length - 1);
    var q = flat[i];
    var checked = HC.store.isChecked(guide.id, q.key);

    var html = '' +
      '<div class="hc-present" data-guide="' + c.esc(guide.id) + '" data-index="' + i + '">' +
        '<div class="hc-present__top">' +
          '<p class="hc-eyebrow">' + c.esc(q.heading) + '</p>' +
          '<p class="hc-caption hc-present__count">' + (i + 1) + ' of ' + flat.length + '</p>' +
        '</div>' +

        '<div class="hc-present__body">' +
          '<p class="hc-present__question">' + c.esc(q.text) + '</p>' +
        '</div>' +

        '<div class="hc-present__foot">' +
          '<button type="button" class="hc-check hc-present__check" data-action="toggle-check" ' +
            'data-check-key="' + c.esc(q.key) + '" aria-pressed="' + (checked ? 'true' : 'false') + '">' +
            '<span class="hc-check__box" aria-hidden="true">' + c.icon('check', 'hc-check__tick') + '</span>' +
            '<span class="hc-check__text hc-body-sans">Covered this one</span>' +
          '</button>' +
          '<div class="hc-present__nav">' +
            '<button type="button" class="hc-btn hc-btn--secondary hc-present__arrow" data-action="present-prev" ' +
              (i === 0 ? 'disabled' : '') + ' aria-label="Previous question">' +
              c.icon('chevronLeft', 'hc-btn__icon') +
            '</button>' +
            '<button type="button" class="hc-btn hc-btn--primary hc-present__arrow" data-action="present-next" ' +
              (i === flat.length - 1 ? 'disabled' : '') + ' aria-label="Next question">' +
              c.icon('chevronRight', 'hc-btn__icon') +
            '</button>' +
          '</div>' +
          '<button type="button" class="hc-btn hc-btn--tertiary hc-present__exit" data-action="exit-present" ' +
            'data-id="' + c.esc(guide.id) + '">Leave presentation mode</button>' +
        '</div>' +
      '</div>';

    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.guide = index;
  HC.screens.guideReader = reader;
  HC.screens.present = present;
  HC.screens.guideHelpers = {
    flatQuestions: flatQuestions,
    coverageText: coverageText
  };

})(window.HC = window.HC || {});
