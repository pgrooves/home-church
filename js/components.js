/* ==========================================================================
   Home Church, components
   Small render functions that return HTML strings, plus the shared helpers
   every screen leans on. Screens compose these, they do not reinvent them.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* ------------------------------------------------------------- utilities */

  function esc(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Turn an HTML string into a real element without touching innerHTML on body.
  function el(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild || wrap;
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Parse as local time. new Date('2026-08-02') is UTC midnight and can slide
  // a day backward west of Greenwich, which is exactly where this church is.
  function parseDate(iso) {
    var parts = String(iso).split('-');
    return new Date(+parts[0], (+parts[1]) - 1, +parts[2]);
  }

  function formatDate(iso) {
    var d = parseDate(iso);
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function formatDateShort(iso) {
    var d = parseDate(iso);
    return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
  }

  function dayName(date) {
    return DAYS[date.getDay()];
  }

  function nextSunday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    var delta = (7 - d.getDay()) % 7;   // today counts if today is Sunday
    d.setDate(d.getDate() + delta);
    return d;
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /* --------------------------------------------------------- open external
     Every link that leaves the app goes through here. Under Capacitor this
     becomes Browser.open() and nothing else in the codebase changes.
     ---------------------------------------------------------------------- */

  function openExternal(url) {
    if (!url) return;
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
        window.Capacitor.Plugins.Browser.open({ url: url });
        return;
      }
      var win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) win.opener = null;
    } catch (err) {
      window.location.href = url;
    }
  }

  function bibleUrl(reference) {
    return 'https://www.biblegateway.com/passage/?search=' +
      encodeURIComponent(reference) + '&version=ESV';
  }

  /* ----------------------------------------------------------------- icons
     Thin line icons, 1.5 stroke, rounded caps, drawn on a 24 grid.
     ---------------------------------------------------------------------- */

  var PATHS = {
    home: '<path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    watch: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5 16 12l-6 3.5z"/>',
    guide: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v3H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M8 8h7M8 11.5h5"/>',
    connect: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2"/><path d="M16 5.4a3.2 3.2 0 0 1 0 6.2M18 14.6c2 .7 3 2.5 3 5"/>',
    give: '<path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 3C19.5 15.4 12 20 12 20z"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    share: '<path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
    pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    arrowOut: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    leaf: '<path d="M20 4C10 4 4 9 4 16v4"/><path d="M20 4c0 9-5 13-11 13H4"/>'
  };

  function icon(name, className) {
    var body = PATHS[name] || '';
    return '<svg class="' + esc(className || '') + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
      'focusable="false">' + body + '</svg>';
  }

  /* -------------------------------------------------------- section header
     The signature pattern. Eyebrow, serif title, short rule. Used everywhere.
     ---------------------------------------------------------------------- */

  function sectionHeader(eyebrow, title, opts) {
    opts = opts || {};
    var cls = 'hc-section-header' + (opts.flush ? ' hc-section-header--flush' : '');
    var tag = opts.tag || 'h2';
    return '' +
      '<header class="' + cls + '">' +
        '<span class="hc-eyebrow hc-section-header__eyebrow">' + esc(eyebrow) + '</span>' +
        '<' + tag + ' class="hc-section-header__title">' + esc(title) + '</' + tag + '>' +
        '<div class="hc-section-header__rule" aria-hidden="true"></div>' +
      '</header>';
  }

  /* ------------------------------------------------------------ quote card */

  function quoteCard(text, attribution, shareData) {
    var share = '';
    if (shareData) {
      share = '<button type="button" class="hc-share" data-action="share" ' +
        'data-share-text="' + esc(shareData.text) + '" ' +
        'data-share-title="' + esc(shareData.title || '') + '">' +
        icon('share', 'hc-share__icon') + '<span>Share</span></button>';
    }
    return '' +
      '<figure class="hc-quote-card">' +
        '<blockquote class="hc-quote hc-quote-card__text">' +
          '“' + esc(text) + '”' +
        '</blockquote>' +
        '<figcaption class="hc-quote-card__foot">' +
          '<span class="hc-quote-card__attr">' + esc(attribution) + '</span>' +
          share +
        '</figcaption>' +
      '</figure>';
  }

  /* -------------------------------------------------- numbered question row
     The numeral is ornament. It is hidden from screen readers on purpose.
     ---------------------------------------------------------------------- */

  function numberedRow(number, bodyHtml) {
    return '' +
      '<div class="hc-numbered">' +
        '<span class="hc-numeral" aria-hidden="true">' + pad2(number) + '</span>' +
        '<div class="hc-numbered__body">' + bodyHtml + '</div>' +
      '</div>';
  }

  /* --------------------------------------------------------- checkable row */

  function checkRow(id, text, checked) {
    return '' +
      '<button type="button" class="hc-check" data-action="toggle-check" ' +
        'data-check-key="' + esc(id) + '" aria-pressed="' + (checked ? 'true' : 'false') + '">' +
        '<span class="hc-check__box" aria-hidden="true">' +
          icon('check', 'hc-check__tick') +
        '</span>' +
        '<span class="hc-question hc-check__text">' + esc(text) + '</span>' +
      '</button>';
  }

  /* ---------------------------------------------------------------- button */

  function button(label, opts) {
    opts = opts || {};
    var variant = opts.variant || 'primary';
    var attrs = ['type="button"', 'class="hc-btn hc-btn--' + variant + (opts.className ? ' ' + opts.className : '') + '"'];
    if (opts.action) attrs.push('data-action="' + esc(opts.action) + '"');
    if (opts.url) attrs.push('data-url="' + esc(opts.url) + '"');
    if (opts.id) attrs.push('data-id="' + esc(opts.id) + '"');
    if (opts.ariaLabel) attrs.push('aria-label="' + esc(opts.ariaLabel) + '"');
    var iconHtml = opts.icon ? icon(opts.icon, 'hc-btn__icon') : '';
    return '<button ' + attrs.join(' ') + '>' + iconHtml + '<span>' + esc(label) + '</span></button>';
  }

  /* ------------------------------------------------------------------ card */

  function card(innerHtml, opts) {
    opts = opts || {};
    var cls = 'hc-card' + (opts.edge ? ' hc-card--edge' : '') + (opts.quiet ? ' hc-card--quiet' : '');
    if (opts.action) {
      var attrs = ['type="button"', 'class="' + cls + '"', 'data-action="' + esc(opts.action) + '"'];
      if (opts.id) attrs.push('data-id="' + esc(opts.id) + '"');
      if (opts.url) attrs.push('data-url="' + esc(opts.url) + '"');
      return '<button ' + attrs.join(' ') + '>' + innerHtml + '</button>';
    }
    return '<div class="' + cls + '">' + innerHtml + '</div>';
  }

  /* ------------------------------------------------------------------- row */

  function row(opts) {
    var tag = opts.action ? 'button' : 'div';
    var attrs = ['class="hc-row' + (opts.className ? ' ' + opts.className : '') + '"'];
    if (opts.action) {
      attrs.unshift('type="button"');
      attrs.push('data-action="' + esc(opts.action) + '"');
      if (opts.id) attrs.push('data-id="' + esc(opts.id) + '"');
      if (opts.url) attrs.push('data-url="' + esc(opts.url) + '"');
    }
    var value = opts.value ? '<span class="hc-row__value">' + esc(opts.value) + '</span>' : '';
    var chevron = opts.chevron ? icon('chevronRight', 'hc-row__chevron') : '';
    var sub = opts.sub ? '<p class="hc-caption">' + esc(opts.sub) + '</p>' : '';
    var titleCls = opts.serif ? 'hc-row__title' : 'hc-row__label';
    return '' +
      '<' + tag + ' ' + attrs.join(' ') + '>' +
        '<span class="hc-row__body">' +
          '<span class="' + titleCls + '">' + esc(opts.title) + '</span>' +
          sub +
        '</span>' +
        value + chevron +
      '</' + tag + '>';
  }

  /* --------------------------------------------------- collapsible section */

  function collapsible(opts) {
    var open = opts.open === true;
    return '' +
      '<section class="hc-section" data-section="' + esc(opts.id) + '">' +
        '<h2>' +
          '<button type="button" class="hc-section__toggle" data-action="toggle-section" ' +
            'data-section-id="' + esc(opts.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '" ' +
            'aria-controls="panel-' + esc(opts.id) + '">' +
            '<span class="hc-section__heading">' +
              '<span class="hc-eyebrow">' + esc(opts.eyebrow) + '</span>' +
              '<span class="hc-section__title">' + esc(opts.title) + '</span>' +
              '<span class="hc-section__rule" aria-hidden="true"></span>' +
            '</span>' +
            icon('chevronDown', 'hc-section__chevron') +
          '</button>' +
        '</h2>' +
        '<div class="hc-section__panel" id="panel-' + esc(opts.id) + '" ' +
          'data-open="' + (open ? 'true' : 'false') + '">' +
          '<div>' + opts.body + '</div>' +
        '</div>' +
      '</section>';
  }

  /* ----------------------------------------------------------- empty state
     A hospitality moment, never a shrug.
     ---------------------------------------------------------------------- */

  function emptyState(message, iconName) {
    return '' +
      '<div class="hc-empty">' +
        icon(iconName || 'leaf', 'hc-empty__icon') +
        '<p class="hc-empty__text">' + esc(message) + '</p>' +
      '</div>';
  }

  /* ----------------------------------------------------------- media block
     A solid cream block where a real photograph will go. Never stock art.
     ---------------------------------------------------------------------- */

  function media(label, ratio, opts) {
    opts = opts || {};
    var play = opts.play
      ? '<span class="hc-play">' +
          '<span class="hc-play__disc">' +
            '<svg class="hc-play__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
              '<path d="M8 5.5 19 12 8 18.5z"/>' +
            '</svg>' +
          '</span>' +
        '</span>'
      : '';
    return '' +
      '<div class="hc-media hc-media--' + (ratio || '16x9') + (opts.play ? ' hc-media--play' : '') + '">' +
        '<span class="hc-media__label">' + esc(label) + '</span>' +
        play +
      '</div>';
  }

  /* ---------------------------------------------------------------- toast */

  var toastTimer = null;

  function toast(message) {
    var node = document.getElementById('hc-toast');
    if (!node) return;
    node.textContent = message;
    node.setAttribute('data-visible', 'true');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      node.setAttribute('data-visible', 'false');
    }, 2400);
  }

  /* --------------------------------------------------------------- scripture */

  function scriptureRow(item) {
    return '' +
      '<button type="button" class="hc-row" data-action="open-scripture" ' +
        'data-reference="' + esc(item.reference) + '">' +
        '<span class="hc-row__body">' +
          '<span class="hc-row__title">' + esc(item.reference) + '</span>' +
          '<p class="hc-caption">' + esc(item.note) + '</p>' +
        '</span>' +
        icon('arrowOut', 'hc-row__chevron') +
      '</button>';
  }

  function closingScripture(closing) {
    return '' +
      '<div class="hc-closing">' +
        '<p class="hc-quote hc-closing__text">' + esc(closing.text) + '</p>' +
        '<p class="hc-closing__ref">' + esc(closing.reference) + '</p>' +
      '</div>';
  }

  HC.components = {
    esc: esc,
    el: el,
    icon: icon,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    dayName: dayName,
    nextSunday: nextSunday,
    greeting: greeting,
    pad2: pad2,
    openExternal: openExternal,
    bibleUrl: bibleUrl,

    sectionHeader: sectionHeader,
    quoteCard: quoteCard,
    numberedRow: numberedRow,
    checkRow: checkRow,
    button: button,
    card: card,
    row: row,
    collapsible: collapsible,
    emptyState: emptyState,
    media: media,
    toast: toast,
    scriptureRow: scriptureRow,
    closingScripture: closingScripture
  };

})(window.HC = window.HC || {});
