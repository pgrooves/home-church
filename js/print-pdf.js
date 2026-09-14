/* ==========================================================================
   Home Church, the three documents as PDFs

   THE SAME THREE SHEETS js/print-guide.js BUILDS, on paper this time. That
   file lays a guide, a group's night, and a journal out as HTML pages for a
   browser's print dialog, which is the right road in a browser and no road at
   all inside the app: window.print() does nothing in WKWebView, and the HTML
   file the app used to hand to the share sheet arrived as tags. So this file
   builds the identical documents straight into a PDF, through js/pdf.js, and
   that is what the share sheet gets on a phone.

   WHY IT IS NOT ONE SET OF FUNCTIONS WITH TWO BACK ENDS. It nearly is, and it
   was written that way first. The two renderers do not agree about the one
   thing that shapes both documents, which is where a page ends: the HTML side
   hands that question to a print engine and guesses ahead of it with a line
   count, because it has to commit to page divisions before anything is
   measured. This side measures. It knows what Times-Roman at eleven point
   does to a paragraph of a given width, so it can fill a page honestly and
   break where the text actually runs out rather than where a three paragraph
   rule of thumb said it would. Forcing one of those to pretend to be the
   other makes both worse.

   What the two do share is the design, and that is deliberate: the sizes,
   colours, and rules below are css/print.css converted from CSS pixels to
   points, so a guide printed from a browser and a guide saved from the app
   are recognisably the same document. If print.css changes, change these.

   Nothing in here draws. It says what a guide is made of and hands the
   drawing to the sheet helper, which owns margins, page breaks and footers.
   ========================================================================== */

(function (HC) {
  'use strict';

  var mm = function (v) { return HC.pdf.mm(v); };

  /* The palette from print.css, which keeps its own fixed colours rather than
     following the app's light and dark tokens, for the reason that file gives:
     paper looks the same whichever way the phone that made it was set. */
  var PAPER    = '#F7F4EF';
  var CARD     = '#EDE8DF';
  var INK      = '#16110B';
  var MID      = '#756F65';
  var RULE     = '#CDC4B3';
  var ACCENT   = '#8F7A5C';
  var COVER    = '#1A1918';
  var COVER_INK = '#F4F0E8';
  var COVER_MID = '#C7B9A3';

  /* Type, in points. CSS pixels times 0.75 is the honest conversion, and the
     body sizes are then nudged up a little because Times has a smaller eye
     than Georgia at the same size and a guide gets read across a living room
     table. Leading is stated outright rather than as a multiplier so the
     arithmetic in the sheet below is one number, not two. */
  var TYPE = {
    eyebrow:   { font: 'Helvetica-Bold', size: 7.5,  leading: 11,   tracking: 1.05, color: ACCENT, caps: true },
    h1:        { font: 'Times-Roman',    size: 31,   leading: 34 },
    h2:        { font: 'Times-Roman',    size: 20,   leading: 24 },
    body:      { font: 'Times-Roman',    size: 11,   leading: 16.5 },
    usage:     { font: 'Times-Italic',   size: 10.5, leading: 15.5, color: MID },
    question:  { font: 'Times-Bold',     size: 10.5, leading: 15.5 },
    item:      { font: 'Times-Roman',    size: 11,   leading: 16 },
    who:       { font: 'Helvetica-Bold', size: 7.5,  leading: 11,   tracking: 0.4, caps: true },
    none:      { font: 'Times-Italic',   size: 10,   leading: 14,   color: MID },
    liner:     { font: 'Times-Italic',   size: 11,   leading: 15.5 },
    ref:       { font: 'Times-Bold',     size: 11.5, leading: 15 },
    note:      { font: 'Helvetica',      size: 8.5,  leading: 12,   color: MID },
    sectionHd: { font: 'Helvetica-Bold', size: 8,    leading: 12,   tracking: 0.4, caps: true },
    foot:      { font: 'Helvetica',      size: 6.5,  leading: 9,    tracking: 0.65, color: MID, caps: true },

    // Cover and closing pages, which are set on the dark ground.
    coverEyebrow:  { font: 'Helvetica-Bold', size: 7.5, leading: 11, tracking: 1.05, color: COVER_MID, caps: true },
    coverTitle:    { font: 'Times-Roman',    size: 34,  leading: 38, color: COVER_INK },
    coverSubtitle: { font: 'Times-Italic',   size: 15,  leading: 21, color: COVER_MID },
    coverMeta:     { font: 'Helvetica-Bold', size: 7,   leading: 11, tracking: 1,    color: COVER_MID, caps: true },
    coverNote:     { font: 'Times-Roman',    size: 11,  leading: 17, color: COVER_MID },
    quote:         { font: 'Times-Italic',   size: 17,  leading: 25, color: COVER_INK },
    quoteRef:      { font: 'Helvetica-Bold', size: 7.5, leading: 12, tracking: 0.9, color: COVER_MID, caps: true },
    wordmark:      { font: 'Helvetica',      size: 7,   leading: 11, tracking: 1.1, color: COVER_MID, caps: true }
  };

  function styled(name, over) {
    var base = TYPE[name];
    var out = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (var j in over || {}) if (Object.prototype.hasOwnProperty.call(over, j)) out[j] = over[j];
    return out;
  }

  function cased(text, style) {
    var value = String(text == null ? '' : text);
    return style && style.caps ? value.toUpperCase() : value;
  }

  /* ------------------------------------------------------------- the sheet

     Margins, the cursor, page breaks, and the footer. Everything below this
     point describes documents; this is the only part that knows about paper.

     print.css sets 20mm of padding at the top, 16mm at the sides and 24mm at
     the bottom, with the footer sitting 10mm up from the bottom edge. Those
     four numbers are repeated here rather than derived, because they are the
     page and the two files should be diffable by eye. */

  function sheet(opts) {
    var doc = HC.pdf.create();
    var title = (opts && opts.title) || '';

    var SIDE = mm(16);
    var TOP = mm(20);
    var BOTTOM = mm(24);
    var FOOT = mm(10);

    var width = doc.width - SIDE * 2;
    var page = null;
    var y = TOP;
    var number = 1;          // the cover is page one, and says nothing

    function footer() {
      if (number < 2) return;
      var top = doc.height - FOOT - TYPE.foot.leading;
      draw(page, cased(title, TYPE.foot), SIDE, top, TYPE.foot, { width: width });
      draw(page, String(number), SIDE, top, TYPE.foot, { width: width, align: 'right' });
    }

    // One line, at a given top, without touching the cursor.
    function draw(target, text, x, top, style, o) {
      var extra = o || {};
      target.text(cased(text, style), x, HC.pdf.baseline(top, style.size, style.leading), {
        font: style.font,
        size: style.size,
        color: extra.color || style.color || INK,
        tracking: style.tracking || 0,
        align: extra.align,
        width: extra.width
      });
    }

    var api = {
      doc: doc,
      width: width,
      left: SIDE,

      /* A fresh sheet of paper. The background is painted rather than left
         white because print.css paints it, and a guide that arrives cream on
         a browser and white from the app is two documents. */
      open: function () {
        page = doc.page();
        number = doc.count();
        page.rect(0, 0, doc.width, doc.height, PAPER);
        footer();
        y = TOP;
        return api;
      },

      // A dark, full bleed page, for the cover and the closing scripture.
      dark: function () {
        page = doc.page();
        number = doc.count();
        page.rect(0, 0, doc.width, doc.height, COVER);
        y = TOP;
        return api;
      },

      at: function () { return y; },
      room: function () { return doc.height - BOTTOM - y; },
      gap: function (h) { y += h; return api; },

      /* Start a new page unless `need` points fit on this one. A block taller
         than a whole page asks for one anyway and then breaks naturally,
         which is the only sane answer: there is no page tall enough. */
      need: function (h) {
        if (!page) return api.open();
        if (h > api.room() && h <= doc.height - TOP - BOTTOM) api.open();
        return api;
      },

      lines: function (text, style, w) {
        return doc.wrap(cased(text, style), style.font, style.size,
                        w == null ? width : w, style.tracking || 0);
      },

      height: function (text, style, w) {
        return api.lines(text, style, w).length * style.leading;
      },

      /* A paragraph, wrapped, drawn, and broken across pages line by line.
         Page breaking here rather than in the callers is the whole reason
         this file can describe a document as a list of paragraphs. */
      para: function (text, style, o) {
        var extra = o || {};
        var x = extra.x == null ? SIDE : extra.x;
        var w = extra.width == null ? width - (x - SIDE) : extra.width;
        var rows = api.lines(text, style, w);

        if (!page) api.open();

        for (var i = 0; i < rows.length; i++) {
          // The cover passes noBreak: it is centred on a page of its own, and
          // a line of it spilling onto a fresh sheet of paper would be worse
          // than a line sitting a little low on the cover.
          if (!extra.noBreak && style.leading > api.room()) api.open();
          draw(page, rows[i], x, y, style, {
            width: w, align: extra.align, color: extra.color
          });
          y += style.leading;
        }

        if (extra.after) y += extra.after;
        return api;
      },

      // A hairline the width of the column, or of whatever is asked for.
      rule: function (o) {
        var extra = o || {};
        var x = extra.x == null ? SIDE : extra.x;
        var w = extra.width == null ? width - (x - SIDE) : extra.width;
        if (!page) api.open();
        if (api.room() < 1) api.open();
        page.rect(x, y, w, extra.thickness || 0.6, extra.color || RULE);
        y += (extra.thickness || 0.6) + (extra.after || 0);
        return api;
      },

      // A filled panel, for the one-liner cards. Drawn before its text.
      panel: function (x, top, w, h, color) {
        page.rect(x, top, w, h, color);
        return api;
      },

      page: function () { return page; },

      /* A cover, or the closing page: one stack of lines, centred on the
         page rather than hung from the top margin. The heights are measured
         first because vertical centring cannot be done as you go. */
      centred: function (list) {
        api.dark();

        /* A line with nothing in it still takes up a line, so an absent
           series, an absent passage or a guide with no subtitle would each
           leave a hole in the middle of a cover. Dropped here rather than at
           every call site. */
        var blocks = list.filter(function (block) {
          return block.divider || String(block.text == null ? '' : block.text).trim();
        });

        var total = 0;
        blocks.forEach(function (block) {
          total += block.before || 0;
          if (block.divider) { total += 1; return; }
          total += api.height(block.text, block.style, width);
        });

        y = Math.max(TOP, (doc.height - total) / 2);

        blocks.forEach(function (block) {
          y += block.before || 0;
          if (block.divider) {
            page.rect(SIDE + (width - 48) / 2, y, 48, 1, COVER_MID);
            y += 1;
            return;
          }
          api.para(block.text, block.style, { align: 'center', noBreak: true });
        });

        return api;
      },

      done: function () { return doc.toBase64(); }
    };

    return api;
  }

  /* ----------------------------------------------------------- the pieces
     The handful of shapes all three documents are built from, so that a
     question in a guide and a question on a night sheet are the same object
     on the page. */

  // The eyebrow and heading that open a section, kept with what follows.
  function heading(s, eyebrow, h2, keepWith) {
    s.need(TYPE.eyebrow.leading + s.height(h2, TYPE.h2) + 8 + (keepWith || 0));
    s.para(eyebrow, TYPE.eyebrow, { after: 2 });
    s.para(h2, TYPE.h2, { after: 10 });
  }

  // A question and everything written under it, kept together where it fits.
  function answered(s, questionText, answers, emptyNote) {
    var indent = 14;
    var block = s.height(questionText, TYPE.question) + 8;
    if (answers.length) {
      block += TYPE.who.leading +
        s.height(answers[0].body, TYPE.body, s.width - indent) + 6;
    } else {
      block += TYPE.none.leading;
    }
    s.need(block);

    s.para(questionText, TYPE.question, { after: 4 });
    s.rule({ after: 7 });

    if (!answers.length) {
      s.para(emptyNote, TYPE.none, { x: s.left + indent, after: 12 });
      return;
    }

    answers.forEach(function (a) {
      s.need(TYPE.who.leading + TYPE.body.leading);
      s.para(a.author, TYPE.who, { x: s.left + indent, after: 1 });
      s.para(a.body, TYPE.body, { x: s.left + indent, after: 7 });
    });
    s.gap(5);
  }

  /* ------------------------------------------------------------- the guide */

  function guidePages(s, guide, series) {
    var c = HC.components;
    var meta = HC.data.guideMeta(guide);
    var title = HC.data.guideTitle(guide);

    s.centred([
      { text: 'Home Church · Small Group Guide', style: TYPE.coverEyebrow },
      { text: title, style: TYPE.coverTitle, before: 10 },
      { text: guide.subtitle, style: TYPE.coverSubtitle, before: 6 },
      { divider: true, before: 18 },
      { text: meta.passage ? 'Based on the sermon · ' + meta.passage : '',
        style: TYPE.coverMeta, before: 18 },
      { text: c.byline(meta.preacher, meta.preachedOn), style: TYPE.coverNote, before: 26 },
      { text: series ? series.title : '', style: TYPE.coverNote }
    ]);

    /* --- short summary, and how to use the thing ------------------------- */

    s.open();

    var usage = 'This guide is built around Sunday’s sermon for use in a small group ' +
      'setting. Move through the discussion questions conversationally. Not every question ' +
      'needs to be asked. The self-reflection questions are meant to go home with your group.';
    var usageHeight = s.height(usage, TYPE.usage, s.width - 12);
    s.page().rect(s.left, s.at(), 1.5, usageHeight, RULE);
    s.para(usage, TYPE.usage, { x: s.left + 12, after: 18 });

    heading(s, 'Short Summary', 'Overview', TYPE.body.leading * 2);
    (guide.shortSummary || []).forEach(function (p) {
      s.para(p, TYPE.body, { after: 9 });
    });

    /* --- full summary ----------------------------------------------------- */

    if ((guide.fullSummary || []).length) {
      s.open();
      heading(s, 'Full Summary', 'Sermon Summary', TYPE.body.leading * 2);
      guide.fullSummary.forEach(function (p) {
        s.para(p, TYPE.body, { after: 9 });
      });
    }

    /* --- the three marks -------------------------------------------------- */

    if ((guide.anchors || []).length) {
      s.open();
      heading(s, 'The Three Marks', 'Where it went');
      guide.anchors.forEach(function (a) {
        s.need(12 + TYPE.eyebrow.leading + s.height(a.body, TYPE.body));
        s.rule({ after: 10 });
        s.para(a.label, styled('eyebrow', { tracking: 0.7 }), { after: 2 });
        s.para(a.body, TYPE.body, { after: 11 });
      });
      s.rule();
    }

    /* --- discussion questions --------------------------------------------- */

    if ((guide.groupSections || []).length) {
      s.open();
      heading(s, 'For the Group', 'Discussion Questions',
              TYPE.sectionHd.leading + TYPE.item.leading);

      guide.groupSections.forEach(function (section) {
        var first = (section.questions || [])[0] || '';
        s.need(TYPE.sectionHd.leading + 8 + s.height(first, TYPE.item, s.width - 16));
        s.para(section.heading, TYPE.sectionHd, { after: 4 });
        s.rule({ after: 9 });

        (section.questions || []).forEach(function (q) {
          var rows = s.lines(q, TYPE.item, s.width - 16);
          s.need(rows.length * TYPE.item.leading);
          s.page().text('—', s.left,
            HC.pdf.baseline(s.at(), TYPE.item.size, TYPE.item.leading),
            { font: TYPE.item.font, size: TYPE.item.size, color: ACCENT });
          s.para(q, TYPE.item, { x: s.left + 16, after: 7 });
        });

        s.gap(9);
      });
    }

    /* --- self reflection --------------------------------------------------- */

    if ((guide.reflectionQuestions || []).length) {
      s.open();
      heading(s, 'Take Home', 'Self-Reflection Questions');
      guide.reflectionQuestions.forEach(function (q) {
        s.need(10 + s.height(q, TYPE.body));
        s.rule({ after: 9 });
        s.para(q, TYPE.body, { after: 9 });
      });
      s.rule();
    }

    /* --- one-liners --------------------------------------------------------- */

    if ((guide.oneLiners || []).length) {
      s.open();
      heading(s, 'From the Pulpit', 'Impactful One-Liners');
      guide.oneLiners.forEach(function (line) {
        var h = s.height(line, TYPE.liner, s.width - 28) + 16;
        s.need(h);
        s.panel(s.left, s.at(), s.width, h, CARD);
        s.panel(s.left, s.at(), 2, h, ACCENT);
        s.gap(8);
        s.para(line, TYPE.liner, { x: s.left + 14, width: s.width - 28 });
        s.gap(8 + 6);
      });
    }

    /* --- scripture index ----------------------------------------------------- */

    if ((guide.scriptures || []).length) {
      s.open();
      heading(s, 'Referenced in the Sermon', 'Scripture Index');
      guide.scriptures.forEach(function (ref) {
        s.need(10 + TYPE.ref.leading + s.height(ref.note, TYPE.note));
        s.rule({ after: 8 });
        s.para(ref.reference, TYPE.ref, { after: 1 });
        s.para(ref.note, TYPE.note, { after: 8 });
      });
      s.rule();
    }

    /* --- the closing word ------------------------------------------------------ */

    if (guide.closingScripture) {
      s.centred([
        { text: '“' + guide.closingScripture.text + '”', style: TYPE.quote },
        { text: guide.closingScripture.reference, style: TYPE.quoteRef, before: 12 },
        { text: 'Home Church · ' +
            String(HC.data.church.websiteUrl || '').replace(/^https?:\/\//, ''),
          style: TYPE.wordmark, before: 34 }
      ]);
    }
  }

  function guide(guideId) {
    var g = HC.data.getGuide(guideId);
    if (!g) throw new Error('No such guide.');
    var s = sheet({ title: HC.data.guideTitle(g) });
    guidePages(s, g, HC.data.getSeries(g.seriesId));
    return s.done();
  }

  /* ------------------------------------------------------------- the night

     Everything a group wrote on a Thursday, including the answers nobody got
     round to opening. The button says so and the cover says so again, for the
     reason js/print-guide.js sets out at length: the reveal is something that
     happens during the meeting, not a permission that outlives it. */

  function nightWhen(snap) {
    return HC.components.formatDate(
      new Date(snap.room.openedAt || Date.now()).toISOString().slice(0, 10));
  }

  function nightTitle(snap) {
    return snap.room.groupName || snap.room.guideTitle || 'Your group';
  }

  function nightPages(s, snap) {
    var when = nightWhen(snap);
    var names = (snap.members || []).map(function (m) { return m.name; });

    s.centred([
      { text: 'Home Church · Small Group', style: TYPE.coverEyebrow },
      { text: nightTitle(snap), style: TYPE.coverTitle, before: 10 },
      { text: when, style: TYPE.coverSubtitle, before: 6 },
      { divider: true, before: 18 },
      { text: snap.room.guideTitle ? 'On the guide · ' + snap.room.guideTitle : '',
        style: TYPE.coverMeta, before: 18 },
      { text: names.join(', '), style: TYPE.coverNote, before: 26 }
    ]);

    s.open();
    heading(s, 'What the group talked about', 'Discussion');

    (snap.questions || []).forEach(function (q, i) {
      var answers = (snap.notes || []).filter(function (n) {
        return n.kind === 'answer' && n.questionId === q.id;
      });
      answered(s, (i + 1) + '. ' + q.body, answers, 'Nobody wrote on this one.');
    });

    var prayers = (snap.notes || []).filter(function (n) { return n.kind === 'prayer'; });
    if (!prayers.length) return;

    s.open();
    heading(s, 'Before you go', 'Prayer Requests');
    prayers.forEach(function (r) {
      s.need(TYPE.who.leading + TYPE.body.leading);
      s.para(r.author, TYPE.who, { after: 1 });
      s.para(r.body, TYPE.body, { after: 10 });
    });
  }

  function night(snap) {
    if (!snap || !snap.room) throw new Error('There is no room to write down.');
    var s = sheet({ title: nightTitle(snap) + ', ' + nightWhen(snap) });
    nightPages(s, snap);
    return s.done();
  }

  /* ----------------------------------------------------------- the journal

     Somebody's own copy of their own words, grouped by guide exactly the way
     the Journal screen groups them. The stored HTML is not used here at all:
     this takes bodyText, which is the same writing with the markup already
     off it, so there is nothing to sanitize and nothing to get wrong. */

  function journalPages(s, entries) {
    var c = HC.components;
    var when = c.formatDate(new Date().toISOString().slice(0, 10));

    var titles = {};
    entries.forEach(function (e) { if (e.guideTitle) titles[e.guideTitle] = true; });
    var guides = Object.keys(titles).length;

    s.centred([
      { text: 'Home Church · Your Journal', style: TYPE.coverEyebrow },
      { text: 'What you wrote', style: TYPE.coverTitle, before: 10 },
      { text: entries.length + (entries.length === 1 ? ' entry' : ' entries') +
          (guides ? ', across ' + guides + (guides === 1 ? ' guide' : ' guides') : ''),
        style: TYPE.coverSubtitle, before: 6 },
      { divider: true, before: 18 },
      { text: 'Printed ' + when, style: TYPE.coverMeta, before: 18 },
      { text: 'This is your copy, and it is yours to keep. Nobody else has ever read any of it.',
        style: TYPE.coverNote, before: 26 }
    ]);

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

    s.open();

    order.forEach(function (key, index) {
      var group = groups[key];
      if (index) s.gap(8);
      heading(s, key === '__loose' ? 'No guide' : 'On the guide', group.title,
              TYPE.body.leading * 2);

      group.entries.forEach(function (e) {
        var text = e.bodyText || '';
        var paras = String(text).split(/\n+/).filter(function (p) { return p.trim(); });
        var day = c.formatDate(String(e.createdAt).slice(0, 10));

        var block = TYPE.who.leading + 6;
        if (e.quote) block += s.height('“' + e.quote + '”', TYPE.question) + 8;
        block += paras.length
          ? s.height(paras[0], TYPE.body, s.width - 14)
          : TYPE.none.leading;
        s.need(block);

        if (e.quote) {
          s.para('“' + e.quote + '”', TYPE.question, { after: 4 });
          s.rule({ after: 7 });
        }

        s.para(day, TYPE.who, { x: s.left + 14, after: 1 });

        if (!paras.length) {
          s.para('Highlighted, with nothing written about it.', TYPE.none,
                 { x: s.left + 14, after: 8 });
        } else {
          paras.forEach(function (p) {
            s.para(p, TYPE.body, { x: s.left + 14, after: 6 });
          });
        }

        if ((e.refs || []).length) {
          s.para(e.refs.join(' · '), TYPE.note, { x: s.left + 14, after: 4 });
        }

        s.gap(8);
      });
    });
  }

  function journal(entries) {
    if (!entries || !entries.length) throw new Error('There is nothing written down yet.');
    var s = sheet({ title: 'Your journal' });
    journalPages(s, entries);
    return s.done();
  }

  HC.printPdf = {
    guide: guide,
    night: night,
    journal: journal,
    sheet: sheet,
    TYPE: TYPE
  };

})(window.HC = window.HC || {});
