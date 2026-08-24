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

  /* 08/16/2026. The one place the app writes a date as digits, for the
     announcement label on Home, where it sits in a tracked caps eyebrow that a
     spelled out month would overrun. Everything a congregation reads in a
     sentence still goes through formatDate. */
  function formatDateNumeric(iso) {
    var d = parseDate(iso);
    return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '/' + d.getFullYear();
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

  /* Not every episode names a preacher or a passage, and a missing one must
     not leave a stray comma or a floating separator behind. Both joiners drop
     empties rather than rendering them. */

  function byline(name, iso) {
    return [name, iso ? formatDate(iso) : ''].filter(Boolean).join(', ');
  }

  function metaLine(parts) {
    return parts.filter(Boolean).join(' · ');
  }

  /* --------------------------------------------------------- open external
     Every link that leaves the app goes through here. Under Capacitor a web
     link becomes Browser.open(), which is SFSafariViewController: a real
     system browser with its own chrome and a Done button, visibly not part of
     this app. That distinction is the whole reason the giving handoff is not
     mistaken for in app payment, so it is worth keeping deliberate.

     Anything that is not a web link has to take a different road. Handing
     mailto:, sms:, or tel: to SFSafariViewController does not open Mail or
     Messages, it fails, and it fails quietly. That is how the "text SERVE"
     button and the "email the church" row would both have turned into buttons
     that do nothing the day @capacitor/browser was installed, with no error
     anywhere to explain it.
     ---------------------------------------------------------------------- */

  var SYSTEM_SCHEMES = /^(mailto|sms|tel):/i;

  function plugins() {
    return (window.Capacitor && window.Capacitor.Plugins) || null;
  }

  // Straight to the OS, which hands it to Mail, Messages, or the dialer.
  function openSystem(url) {
    try {
      var p = plugins();
      if (p && p.App && p.App.openUrl) {
        p.App.openUrl({ url: url });
        return;
      }
    } catch (err) { /* fall through to the web view, which also handles these */ }
    window.location.href = url;
  }

  function openExternal(url) {
    if (!url) return;

    if (SYSTEM_SCHEMES.test(url)) {
      openSystem(url);
      return;
    }

    try {
      var p = plugins();
      if (p && p.Browser) {
        p.Browser.open({ url: url });
        return;
      }
      var win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) win.opener = null;
    } catch (err) {
      window.location.href = url;
    }
  }

  /* Builds the sms: link behind the serve signup button. iOS separates the
     body from the number with &, not ?, and a phone that ignores the body
     still opens Messages addressed correctly, which is the part that has to
     work. Returns '' rather than a broken link when there is no number, so
     the caller can drop the button instead of showing a dead one. */
  function smsUrl(number, keyword) {
    var digits = String(number || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) digits = '1' + digits;
    var to = '+' + digits;
    return keyword ? 'sms:' + to + '&body=' + encodeURIComponent(keyword) : 'sms:' + to;
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
    listen: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 14h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M20 14h-2a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1z"/>',
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

    /* The Group tab and the reveal. `group` is the tab's own mark: a room
       with people in it, drawn as a rounded frame rather than the two figures
       Connect already uses, because at 11px two person glyphs one tab apart
       read as the same icon twice. */
    group: '<rect x="3" y="5" width="18" height="14" rx="4"/>' +
           '<circle cx="8.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/>' +
           '<circle cx="15.5" cy="12" r="1.2"/>',
    eye: '<path d="M2 12s3.8-6.4 10-6.4S22 12 22 12s-3.8 6.4-10 6.4S2 12 2 12z"/>' +
         '<circle cx="12" cy="12" r="2.6"/>',
    eyeOff: '<path d="M4 4.5 19.5 20"/>' +
            '<path d="M9.9 6A9.9 9.9 0 0 1 12 5.6c6.2 0 10 6.4 10 6.4a17 17 0 0 1-3.3 4"/>' +
            '<path d="M6.4 8.1A17 17 0 0 0 2 12s3.8 6.4 10 6.4a10 10 0 0 0 3.6-.7"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/>' +
          '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',

    /* Admin. A shield with a check in it: what the church trusted somebody
       with, rather than a cog, which would read as settings, and this is not
       where anybody changes their text size. Not `lock` either, which is
       already the closed door in the sign-in flow and would say the opposite
       of what this tile does. The check sits low and small so the shield's
       silhouette still carries at 24px in the sheet's grid. */
    shield: '<path d="M12 3.1 5 5.9v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V5.9z"/>' +
            '<path d="m9.3 12.1 1.9 1.9 3.5-3.7"/>',
    doc: '<path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/>' +
         '<path d="M13.5 3v5.5H19"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-2.9-.4L4 21l1.4-4.1A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 5h11l-1.6 3.2L16 11.5H5z"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    leaf: '<path d="M20 4C10 4 4 9 4 16v4"/><path d="M20 4c0 9-5 13-11 13H4"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',

    /* The sixth tile in the tab bar, and the only one that is not a tab. Three
       filled dots rather than three stroked circles: at 22px a 1.5 stroke ring
       is mostly hole, and next to five solid-feeling glyphs it reads as three
       specks of dust. r="1.5" filled is the same visual weight as the icons it
       sits beside. Filled means it needs the same fill="none" opt out that the
       brand marks do, which is what hc-icon--solid is for. */
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/>' +
          '<circle cx="19" cy="12" r="1.5"/>',

    /* Journal. A page with a turned corner and two written lines, which is the
       doc glyph's cousin rather than a second notebook: `guide` is already a
       book and these two must not read as the same tile in a list. */
    journal: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
             '<path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>',

    /* The nine practices, for the grid behind •••. Same 24 grid, same 1.5
       stroke, same rounded caps as everything above, because they sit in the
       same app and a second visual language for one screen is how a design
       system starts coming apart.

       They are drawn to be told apart at 30px in a three by three grid, which
       is a harder constraint than it sounds: the nine are read side by side
       rather than one at a time, so the test each one has to pass is not "is
       this legible" but "is this the only thing in the grid it could be".
       That is what settled several of them. Fasting is a plate, two concentric
       circles, and Service is a basin, a half bowl, because an empty bowl for
       both would have been two of the same drawing. Generosity keeps a heart
       even though Give already has one, since generosity and giving really are
       the same idea and pretending otherwise would have cost the clearer
       glyph; Give's heart fills its grid and this one is small and held, so
       they do not collide anywhere they actually appear together. */

    // Sundown, and the work stops. A setting sun on the horizon rather than a
    // crescent: rest at the end of a day of labour is the thing being named.
    practiceSabbath: '<path d="M3.5 18.5h17"/>' +
                     '<path d="M7.5 18.5a4.5 4.5 0 0 1 9 0"/>' +
                     '<path d="M12 5v2.4"/><path d="M5.9 7.9 7.6 9.6"/>' +
                     '<path d="M18.1 7.9 16.4 9.6"/>',

    /* Two hands together. The splay at the bottom is the whole drawing: with
       the heels of the hands closed this is a leaf, and with them apart it is
       a pair of hands. Six versions of this were rendered at 30px before that
       was obvious, so it is written down rather than left to be rediscovered. */
    practicePrayer: '<path d="M12 2.9C9.3 5.9 7.5 9 7 12.5l-.6 3.9a1.9 1.9 0 0 0 1.6 2.2l1.9.3a1.9 1.9 0 0 0 2.1-1.6z"/>' +
                    '<path d="M12 2.9c2.7 3 4.5 6.1 5 9.6l.6 3.9a1.9 1.9 0 0 1-1.6 2.2l-1.9.3a1.9 1.9 0 0 1-2.1-1.6z"/>',

    // An empty plate. Nothing on it is the whole point, so nothing is on it.
    practiceFasting: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',

    // A door standing open, which is Matthew 6:6 rather than a metaphor we
    // reached for: go into your room and shut the door.
    practiceSolitude: '<path d="M4 20.5h16"/>' +
                      '<path d="M7 20.5V4.9a1 1 0 0 1 1.2-1l6.6-1.4a1 1 0 0 1 1.2 1v17z"/>' +
                      '<circle cx="13.4" cy="12" r="0.9"/>',

    // An open book. Two page curves and a spine, which is a different drawing
    // from `book` above, two rounded panels, and from `guide`, a closed one.
    practiceScripture: '<path d="M12 7.2C10.4 5.6 8 5 4.5 5.2v12C8 17 10.4 17.6 12 19.2"/>' +
                       '<path d="M12 7.2C13.6 5.6 16 5 19.5 5.2v12C16 17 13.6 17.6 12 19.2"/>' +
                       '<path d="M12 7.2v12"/>',

    // Three, joined. A ring rather than a row, because a row of people is a
    // queue and a ring is a table.
    practiceCommunity: '<circle cx="12" cy="5.6" r="2.4"/>' +
                       '<circle cx="5.8" cy="16.4" r="2.4"/>' +
                       '<circle cx="18.2" cy="16.4" r="2.4"/>' +
                       '<path d="M10.3 7.7 7.5 14.3"/><path d="m13.7 7.7 2.8 6.6"/>' +
                       '<path d="M8.2 16.4h7.6"/>',

    /* A hand seen side on, holding something out. Drawn from the side rather
       than as a palm-up arc, because an arc under a small shape is a smiling
       face and nothing could talk it out of it. The heart is deliberate even
       though Give has one: generosity and giving are the same idea, and the
       clearer glyph was worth more than the separation. */
    practiceGenerosity: '<path d="M4.6 14.6 8 11.2a2 2 0 0 1 1.4-.6h6.2a2.4 2.4 0 0 1 0 4.8H11"/>' +
                        '<path d="M4.6 14.6 8 18h7a2.4 2.4 0 0 0 2.4-2.4"/>' +
                        '<path d="M12 8.4s-2.6-1.7-2.6-3.3a1.45 1.45 0 0 1 2.6-.85 1.45 1.45 0 0 1 2.6.85c0 1.6-2.6 3.3-2.6 3.3z"/>',

    /* A basin with a towel over the rim. John 13, and the one image the church
       already uses for this without anybody having to be told. The towel hangs
       over the edge rather than standing up inside the bowl, which was the
       first attempt and read as a spoon. */
    practiceService: '<path d="M3.6 13h16.8a8.4 8.4 0 0 1-8.4 7.6A8.4 8.4 0 0 1 3.6 13z"/>' +
                     '<path d="M4.8 11.2h4.6v7.4a2.3 2.3 0 0 1-4.6 0z"/>',

    /* A flame, with the second flame inside it that every fire glyph has. The
       first attempt put a narrow flame on a candle stand and it read as a wine
       glass, which is a long way from what this practice is about. */
    practiceWitness: '<path d="M12 3c3.5 3.6 5.5 6.2 5.5 9.1a5.5 5.5 0 1 1-11 0C6.5 9.2 8.5 6.6 12 3z"/>' +
                     '<path d="M12 17.6a2.4 2.4 0 0 1-2.4-2.4c0-1.3.8-2.1 2.4-3.9 1.6 1.8 2.4 2.6 2.4 3.9a2.4 2.4 0 0 1-2.4 2.4z"/>'
  };

  /* ------------------------------------------------------------ brand marks
     The five platforms the church posts on. Separate from PATHS above because
     these are somebody else's marks and follow their rules, not this app's:
     they are solid glyphs on a 24 grid rather than 1.5 stroke line icons, and
     they are drawn the way each brand draws itself. Instagram is the one
     outline in the set because Instagram's own mark is an outline.

     YouTube's play triangle is a hole, not a shape. fill-rule="evenodd" turns
     the inner subpath into a knockout, so the triangle takes the colour of
     whatever the glyph sits on rather than being painted a colour that has to
     be kept in sync with the circle behind it.
     ---------------------------------------------------------------------- */

  var BRANDS = {
    Instagram: '<rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8"/>' +
      '<circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
      '<circle cx="17.1" cy="6.9" r="1.15"/>',
    Facebook: '<path d="M13.4 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6a22 22 0 0 0-2.4-.12c-2.4 0-4.05 1.47-4.05 4.16V9.9H7.4V13h2.75v8z"/>',
    YouTube: '<path fill-rule="evenodd" d="M21.6 7.3a2.55 2.55 0 0 0-1.8-1.8C18.2 5.05 12 5.05 12 5.05s-6.2 0-7.8.45a2.55 2.55 0 0 0-1.8 1.8A26.6 26.6 0 0 0 2 12a26.6 26.6 0 0 0 .4 4.7 2.55 2.55 0 0 0 1.8 1.8c1.6.45 7.8.45 7.8.45s6.2 0 7.8-.45a2.55 2.55 0 0 0 1.8-1.8A26.6 26.6 0 0 0 22 12a26.6 26.6 0 0 0-.4-4.7zM10.15 15.05V8.95L15.4 12z"/>',
    X: '<path d="M13.6 10.6 20.9 2h-1.73l-6.35 7.38L7.75 2H2l7.66 11.12L2 22h1.73l6.7-7.79L15.78 22H21.5zm-2.37 2.76-.78-1.11L4.35 3.3h2.66l4.99 7.14.77 1.11 6.48 9.27h-2.66z"/>',
    TikTok: '<path d="M16.5 5.8a4.35 4.35 0 0 1-1.02-2.8h-3.13v11.55a2.47 2.47 0 1 1-2.47-2.47c.26 0 .5.04.74.12V9.02a5.7 5.7 0 0 0-.74-.05 5.68 5.68 0 1 0 5.68 5.68V8.86a7.3 7.3 0 0 0 4.28 1.37V7.14a4.32 4.32 0 0 1-3.34-1.34z"/>'
  };

  /* A platform this app has no mark for still gets a link rather than being
     dropped. church_profile is an editable table, so a sixth platform can
     appear in it any Tuesday, and a silently missing row is worse than a
     generic glyph that still opens the right page. */
  function brandIcon(label, className) {
    var body = BRANDS[label];
    if (!body) {
      return icon('arrowOut', className);
    }
    /* hc-brand is not decoration, it is the opt out of `svg { fill: none }`
       in base.css. That reset exists for the app's own stroke drawn icons and
       it wins over a fill attribute, because a stylesheet beats a presentation
       attribute. These marks are solid, so the fill has to come back as CSS.
       Set on the svg rather than on its children, so Instagram's rect and
       circle keep the fill="none" they carry themselves and stay an outline. */
    return '<svg class="hc-brand ' + esc(className || '') + '" viewBox="0 0 24 24" ' +
      'aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  /* Every social link the church has, as a centered row.

     No disc behind them, and the glyph is --hc-ink, which is near black on
     paper and near white in dark mode. One token does the whole inversion,
     so these follow the theme the way body text does rather than needing a
     second set of rules to keep in step with it.

     Renders nothing when there are no links, like everything else here. */
  function socialRow(links) {
    links = links || [];
    if (!links.length) return '';

    var html = '<div class="hc-social-row">';
    links.forEach(function (s) {
      if (!s || !s.url) return;
      html += '<button type="button" class="hc-social" data-action="open-url" ' +
        'data-url="' + esc(s.url) + '" aria-label="' + esc(s.label) + '">' +
        brandIcon(s.label, 'hc-social__icon') +
      '</button>';
    });
    return html + '</div>';
  }

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

  /* The eyebrow is optional. Home runs a column of these one after another to
     name each block, and a kicker over every one of them would be five small
     caps lines competing with the five titles they are meant to introduce.
     Passing a falsy eyebrow drops the span entirely rather than leaving an
     empty one behind for CSS to have an opinion about. */
  function sectionHeader(eyebrow, title, opts) {
    opts = opts || {};
    var cls = 'hc-section-header' + (opts.flush ? ' hc-section-header--flush' : '');
    var tag = opts.tag || 'h2';
    return '' +
      '<header class="' + cls + '"' + (opts.id ? ' id="' + esc(opts.id) + '"' : '') + '>' +
        (eyebrow
          ? '<span class="hc-eyebrow hc-section-header__eyebrow">' + esc(eyebrow) + '</span>'
          : '') +
        '<' + tag + ' class="hc-section-header__title">' + esc(title) + '</' + tag + '>' +
        '<div class="hc-section-header__rule" aria-hidden="true"></div>' +
      '</header>';
  }

  /* ------------------------------------------------------------ quote card */

  /* opts.html lets a caller hand in text it has already escaped, which is
     how the guide reader draws highlights inside a one-liner. Without it the
     card would escape the <mark> tags and print them. */
  function quoteCard(text, attribution, shareData, opts) {
    opts = opts || {};
    var share = '';
    if (shareData) {
      share = '<button type="button" class="hc-share" data-action="share" ' +
        'data-share-text="' + esc(shareData.text) + '" ' +
        'data-share-title="' + esc(shareData.title || '') + '">' +
        icon('share', 'hc-share__icon') + '<span>Share</span></button>';
    }
    return '' +
      '<figure class="hc-quote-card">' +
        '<blockquote class="hc-quote hc-quote-card__text' +
          (opts.path ? ' hc-hl-src' : '') + '"' +
          (opts.path ? ' data-hl-path="' + esc(opts.path) + '"' : '') + '>' +
          '“' + (opts.html || esc(text)) + '”' +
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
    var cls = 'hc-btn hc-btn--' + variant +
      (opts.small ? ' hc-btn--small' : '') +
      (opts.className ? ' ' + opts.className : '');
    var attrs = ['type="button"', 'class="' + cls + '"'];
    if (opts.action) attrs.push('data-action="' + esc(opts.action) + '"');
    if (opts.url) attrs.push('data-url="' + esc(opts.url) + '"');
    if (opts.id) attrs.push('data-id="' + esc(opts.id) + '"');
    if (opts.ariaLabel) attrs.push('aria-label="' + esc(opts.ariaLabel) + '"');

    /* `busy` is a button waiting on the network, and it is disabled as well as
       marked. Both matter: aria-busy tells a screen reader something is
       happening, and the disabled attribute is what stops a second tap posting
       the same answer twice on a slow connection. */
    if (opts.disabled || opts.busy) attrs.push('disabled');
    if (opts.busy) attrs.push('aria-busy="true"');

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

  /* opts.anchorId puts a real id on the section itself, which is different
     from opts.id: that one keys the toggle to its panel. Something outside the
     section may need to find it on the page, the way the month rail on Listen
     watches for the Archive to scroll past.

     opts.index === false keeps the section out of the right edge's index. A
     foldable section is two different things in this app: a part of a page,
     the way a guide's Discussion Questions is, and one item in a list, the way
     each serve team on Connect is. The first belongs in an index of the page
     and the second turns that index into a list of serve teams, and nothing
     in the markup can tell them apart. So the call site says. */
  function collapsible(opts) {
    var open = opts.open === true;
    return '' +
      '<section class="hc-section" data-section="' + esc(opts.id) + '"' +
        (opts.anchorId ? ' id="' + esc(opts.anchorId) + '"' : '') +
        (opts.index === false ? ' data-no-index' : '') + '>' +
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

  function playBadge() {
    return '' +
      '<span class="hc-play">' +
        '<span class="hc-play__disc">' +
          '<svg class="hc-play__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M8 5.5 19 12 8 18.5z"/>' +
          '</svg>' +
        '</span>' +
      '</span>';
  }

  function media(label, ratio, opts) {
    opts = opts || {};
    return '' +
      '<div class="hc-media hc-media--' + (ratio || '16x9') + (opts.play ? ' hc-media--play' : '') + '">' +
        '<span class="hc-media__label">' + esc(label) + '</span>' +
        (opts.play ? playBadge() : '') +
      '</div>';
  }

  /* ------------------------------------------------------------- cover art
     Podcast artwork, drawn rather than fetched. The show has one cover and
     every episode wears it, so this is the church lockup on a dark panel,
     which is what the art on Spotify is. Ships with the app, needs no
     network, and holds up at 64px and at full width alike.
     ---------------------------------------------------------------------- */

  function cover(label, ratio, opts) {
    opts = opts || {};
    // Small enough and the wordmark stops being readable, so the house mark
    // carries the tile on its own.
    var art = opts.compact ? 'assets/icons/mark.png' : 'assets/img/logo-lockup.png';
    var cls = 'hc-cover hc-media--' + (ratio || '1x1') +
      (opts.compact ? ' hc-cover--compact' : '') +
      (opts.play ? ' hc-cover--play' : '');
    return '' +
      '<span class="' + cls + '">' +
        '<img class="hc-cover__logo" src="' + art + '" alt="" aria-hidden="true">' +
        (label ? '<span class="hc-cover__label">' + esc(label) + '</span>' : '') +
        (opts.play ? playBadge() : '') +
      '</span>';
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
    parseDate: parseDate,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    formatDateNumeric: formatDateNumeric,
    byline: byline,
    metaLine: metaLine,
    dayName: dayName,
    nextSunday: nextSunday,
    greeting: greeting,
    pad2: pad2,
    openExternal: openExternal,
    bibleUrl: bibleUrl,
    smsUrl: smsUrl,

    sectionHeader: sectionHeader,
    quoteCard: quoteCard,
    numberedRow: numberedRow,
    checkRow: checkRow,
    button: button,
    card: card,
    row: row,
    collapsible: collapsible,
    emptyState: emptyState,
    brandIcon: brandIcon,
    socialRow: socialRow,
    media: media,
    cover: cover,
    // Exported for the Instagram rail, which draws its own tile rather than
    // going through media() or cover(): it has a real photograph to show and
    // both of those exist for the case where there is not one.
    playBadge: playBadge,
    toast: toast,
    scriptureRow: scriptureRow,
    closingScripture: closingScripture
  };

})(window.HC = window.HC || {});
