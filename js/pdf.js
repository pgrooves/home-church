/* ==========================================================================
   Home Church, a PDF in a few hundred lines

   WHY THIS EXISTS, and it is worth saying plainly because writing a PDF
   writer is not an obvious thing to do in a church app.

   Every "download" in this app used to hand over an HTML file. In a browser
   that was fine, because the browser also had window.print() and the print
   dialog offers Save as PDF. Inside the packaged app it was not fine at all.
   window.print() is a silent no-op in WKWebView, so the app took the other
   road: it wrote the sheet to a file and handed it to the iOS share sheet.
   The file was .html, and what a leader on TestFlight actually got was a
   document that opens in whatever app claims .html, or in Mail as a wall of
   tags. "A bunch of text jargon and gibberish", which is exactly right.

   iOS will not turn HTML into a PDF for us from inside a web view, and this
   project has no bundler, so a print library is not on the table either: the
   smallest of them is a megabyte, and it would have to be vendored by hand
   into a repo whose whole promise is that you can read every line of it.

   So the app writes the PDF itself. That is less frightening than it sounds
   for the documents this app makes, because all three of them are text on
   paper: paragraphs, headings, rules, and a coloured rectangle behind a
   cover. No images, no tables, no transparency, no embedded fonts.

   NO EMBEDDED FONTS is the decision the rest of this file hangs on. Every PDF
   reader ever written already has the fourteen standard fonts, so naming
   Times-Roman costs nothing and weighs nothing: a twelve page guide comes out
   around 40KB, which matters on a phone that is about to hand it to Messages.
   The price is that the document can only say what WinAnsi can spell, which
   is English plus the typographic punctuation this app actually uses. See
   encode() for what happens to anything else.

   THE WIDTH TABLES ARE NOT DECORATION. Nothing here can ask a font how wide a
   word is, so a line break has to be computed from Adobe's own metrics for
   those fonts. The five tables below are those metrics, one entry per WinAnsi
   character code from 32 to 255, in thousandths of the font size. They are
   copied from the Adobe Font Metrics files that ship with every PostScript
   implementation, and they are exact, not approximations: Times-Roman's space
   is 250 and its capital A is 722 wherever this document is opened.

   WHAT THIS DELIBERATELY DOES NOT DO. No compression, because a Deflate
   implementation is another two hundred lines to save twenty kilobytes on a
   document nobody is storing at scale. No incremental updates, no forms, no
   annotations, no outline. One pass, one file, done.

   Nothing in here knows what a guide is. js/print-pdf.js is the file that
   knows, and this one only knows about paper.
   ========================================================================== */

(function (HC) {
  'use strict';

  var PAGE_WIDTH = 612;    // US Letter at 72 points to the inch
  var PAGE_HEIGHT = 792;

  /* Character widths in thousandths of an em, WinAnsi codes 32 through 255.
     A zero is a code WinAnsi leaves undefined (127, 129, 141, 143, 144, 157),
     never a zero width glyph. */
  var WIDTHS = {
    'Times-Roman': [
      250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
      500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
      921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722,
      556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
      333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
      500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541, 0,
      500, 0, 333, 500, 444, 1000, 500, 500, 333, 1000, 556, 333, 889, 0, 611, 0,
      0, 333, 333, 444, 444, 350, 500, 1000, 333, 980, 389, 333, 722, 0, 444, 500,
      250, 333, 500, 500, 500, 500, 200, 500, 333, 760, 276, 500, 564, 333, 760, 333,
      400, 564, 300, 300, 333, 500, 453, 250, 333, 300, 310, 500, 750, 750, 750, 444,
      722, 722, 722, 722, 722, 722, 889, 667, 611, 611, 611, 611, 333, 333, 333, 333,
      722, 722, 722, 722, 722, 722, 722, 564, 722, 722, 722, 722, 722, 722, 556, 500,
      444, 444, 444, 444, 444, 444, 667, 444, 444, 444, 444, 444, 278, 278, 278, 278,
      500, 500, 500, 500, 500, 500, 500, 564, 500, 500, 500, 500, 500, 500, 500, 500
    ],
    'Times-Bold': [
      250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278,
      500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
      930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778,
      611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500,
      333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500,
      556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520, 0,
      500, 0, 333, 500, 500, 1000, 500, 500, 333, 1000, 556, 333, 1000, 0, 667, 0,
      0, 333, 333, 500, 500, 350, 500, 1000, 333, 1000, 389, 333, 722, 0, 444, 500,
      250, 333, 500, 500, 500, 500, 220, 500, 333, 747, 300, 500, 570, 333, 747, 333,
      400, 570, 300, 300, 333, 556, 540, 250, 333, 300, 330, 500, 750, 750, 750, 500,
      722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 389, 389, 389, 389,
      722, 722, 778, 778, 778, 778, 778, 570, 778, 722, 722, 722, 722, 722, 611, 556,
      500, 500, 500, 500, 500, 500, 722, 444, 444, 444, 444, 444, 278, 278, 278, 278,
      500, 556, 500, 500, 500, 500, 500, 570, 500, 556, 556, 556, 556, 500, 556, 500
    ],
    'Times-Italic': [
      250, 333, 420, 500, 500, 833, 778, 214, 333, 333, 500, 675, 250, 333, 250, 278,
      500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 675, 675, 675, 500,
      920, 611, 611, 667, 722, 611, 611, 722, 722, 333, 444, 667, 556, 833, 667, 722,
      611, 722, 611, 500, 556, 722, 611, 833, 611, 556, 556, 389, 278, 389, 422, 500,
      333, 500, 500, 444, 500, 444, 278, 500, 500, 278, 278, 444, 278, 722, 500, 500,
      500, 500, 389, 389, 278, 500, 444, 667, 444, 444, 389, 400, 275, 400, 541, 0,
      500, 0, 333, 500, 556, 889, 500, 500, 333, 1000, 500, 333, 944, 0, 556, 0,
      0, 333, 333, 556, 556, 350, 500, 889, 333, 980, 389, 333, 667, 0, 389, 444,
      250, 389, 500, 500, 500, 500, 275, 500, 333, 760, 276, 500, 675, 333, 760, 333,
      400, 675, 300, 300, 333, 500, 523, 250, 333, 300, 310, 500, 750, 750, 750, 500,
      611, 611, 611, 611, 611, 611, 889, 667, 611, 611, 611, 611, 333, 333, 333, 333,
      722, 667, 722, 722, 722, 722, 722, 675, 722, 722, 722, 722, 722, 556, 611, 500,
      500, 500, 500, 500, 500, 500, 667, 444, 444, 444, 444, 444, 278, 278, 278, 278,
      500, 500, 500, 500, 500, 500, 500, 675, 500, 500, 500, 500, 500, 444, 500, 444
    ],
    'Helvetica': [
      278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
      1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
      333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
      556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0,
      556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
      0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 500,
      278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
      400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
      667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
      722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
      556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500
    ],
    'Helvetica-Bold': [
      278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
      975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
      333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
      611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0,
      556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
      0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 556,
      278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
      400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
      722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
      722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
      556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
      611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556
    ]
  };

  // The order the fonts are written into the file, which is also what /F1 to
  // /F5 mean inside a content stream.
  var FONT_ORDER = ['Times-Roman', 'Times-Bold', 'Times-Italic',
                    'Helvetica-Bold', 'Helvetica'];

  /* The twenty seven characters WinAnsi keeps between 128 and 159, where
     Latin-1 keeps control codes. Everything else below 256 is Latin-1 and
     needs no table, which is why this one is short. The app reaches for most
     of these on purpose: curly quotes, the em dash, the ellipsis. */
  var HIGH = {
    0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133,
    0x2020: 134, 0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138,
    0x2039: 139, 0x0152: 140, 0x017D: 142, 0x2018: 145, 0x2019: 146,
    0x201C: 147, 0x201D: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151,
    0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155, 0x0153: 156,
    0x017E: 158, 0x0178: 159
  };

  // WinAnsi has nothing at these six, so a width table entry of 0 there is a
  // hole rather than a narrow glyph, and nothing may be drawn with them.
  var UNDEFINED = { 127: true, 129: true, 141: true, 143: true, 144: true, 157: true };

  /* One string to the bytes a PDF literal will carry.

     ANYTHING WE CANNOT SPELL BECOMES A QUESTION MARK, visibly. A journal is
     the document this matters for: people write emoji in their own writing,
     and an emoji has no WinAnsi code. Dropping it silently would quietly
     shorten somebody's sentence; a question mark says a character was there
     and this document could not carry it. Line endings are handled by the
     caller, which splits on them before anything gets here, so a stray one
     landing in a literal would break the file and is turned into a space. */
  function encode(text) {
    var out = [];
    var str = String(text == null ? '' : text);

    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);

      if (code === 0x0A || code === 0x0D || code === 0x09) { out.push(32); continue; }
      if (code === 0xA0) { out.push(32); continue; }          // a hard space is a space
      if (HIGH[code] != null) { out.push(HIGH[code]); continue; }
      if (code < 256 && !UNDEFINED[code] && code >= 32) { out.push(code); continue; }

      /* One question mark per character somebody typed, which for an emoji
         means skipping its second half: JavaScript holds those as a surrogate
         pair, two code units for one thing on the screen, and letting both
         through turns every emoji into "??". */
      if (code >= 0xD800 && code <= 0xDBFF &&
          i + 1 < str.length &&
          str.charCodeAt(i + 1) >= 0xDC00 && str.charCodeAt(i + 1) <= 0xDFFF) {
        i++;
      }

      out.push(63);                                            // '?'
    }

    return out;
  }

  /* A PDF literal string. Parentheses and backslashes are structural, and
     everything outside plain ASCII goes as an octal escape so the finished
     file is ASCII from end to end. That is not required by the format, it
     just means the whole document survives being handled as text by anything
     between here and the share sheet. */
  function literal(codes) {
    var out = '(';
    for (var i = 0; i < codes.length; i++) {
      var c = codes[i];
      if (c === 40 || c === 41 || c === 92) out += '\\' + String.fromCharCode(c);
      else if (c >= 32 && c <= 126) out += String.fromCharCode(c);
      else out += '\\' + ('00' + c.toString(8)).slice(-3);
    }
    return out + ')';
  }

  // Points, from the millimetres print.css is written in.
  function mm(value) { return value * 72 / 25.4; }

  // '#F7F4EF' to the three numbers a PDF colour operator wants.
  function rgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function colorOp(hex) {
    var c = rgb(hex);
    return num(c[0]) + ' ' + num(c[1]) + ' ' + num(c[2]);
  }

  // Three decimals is more than paper can tell apart, and it keeps the
  // content stream readable for anybody who opens the file in a text editor.
  function num(value) {
    var n = Math.round(value * 1000) / 1000;
    return String(n);
  }

  /* ----------------------------------------------------------- measuring */

  function widthsFor(font) {
    return WIDTHS[font] || WIDTHS['Times-Roman'];
  }

  /* How wide a string will be, in points, at this size in this font.

     Tracking counts between the glyphs and not after the last one. PDF's own
     Tc operator does add it after the last glyph, which matters nowhere
     except when centring, and centring is exactly what the covers do. */
  function measure(text, font, size, tracking) {
    var table = widthsFor(font);
    var codes = encode(text);
    var total = 0;

    for (var i = 0; i < codes.length; i++) {
      total += (table[codes[i] - 32] || 0) / 1000 * size;
    }
    if (tracking && codes.length > 1) total += tracking * (codes.length - 1);

    return total;
  }

  /* Greedy line breaking, which is what a browser does too.

     A single word longer than the line gets cut at the character that
     overflows rather than being allowed to run off the page. That happens
     with a pasted URL, and a URL running into the margin is how a sheet ends
     up looking broken. */
  function wrap(text, font, size, maxWidth, tracking) {
    var words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';

    function push() { if (line) { lines.push(line); line = ''; } }

    function fits(candidate) { return measure(candidate, font, size, tracking) <= maxWidth; }

    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var candidate = line ? line + ' ' + word : word;

      if (fits(candidate)) { line = candidate; continue; }

      push();

      if (fits(word)) { line = word; continue; }

      // Too long to ever fit. Break it where it overflows, and keep going.
      var piece = '';
      for (var j = 0; j < word.length; j++) {
        if (piece && !fits(piece + word[j])) { lines.push(piece); piece = ''; }
        piece += word[j];
      }
      line = piece;
    }

    push();
    return lines.length ? lines : [''];
  }

  /* --------------------------------------------------------------- pages

     Everything a caller draws is in points from the TOP LEFT of the page,
     because that is how the rest of this app thinks and how print.css is
     written. PDF's own origin is the bottom left, and the one conversion
     lives in here so nothing above it ever has to hold both ideas at once. */

  function createPage(doc) {
    var ops = [];

    var page = {
      /* One line of text. `top` is where the line's baseline sits, measured
         down from the top of the page. Callers get the baseline from
         HC.pdf.baseline() rather than working it out themselves. */
      text: function (value, x, top, opts) {
        var o = opts || {};
        var font = o.font || 'Times-Roman';
        var size = o.size || 11;
        var tracking = o.tracking || 0;
        var codes = encode(value);
        if (!codes.length) return page;

        var left = x;
        if (o.align === 'center' && o.width) {
          left = x + (o.width - measure(value, font, size, tracking)) / 2;
        } else if (o.align === 'right' && o.width) {
          left = x + o.width - measure(value, font, size, tracking);
        }

        ops.push('q');
        ops.push(colorOp(o.color || '#16110B') + ' rg');
        ops.push('BT');
        ops.push('/F' + (FONT_ORDER.indexOf(font) + 1) + ' ' + num(size) + ' Tf');
        if (tracking) ops.push(num(tracking) + ' Tc');
        ops.push('1 0 0 1 ' + num(left) + ' ' + num(doc.height - top) + ' Tm');
        ops.push(literal(codes) + ' Tj');
        ops.push('ET');
        ops.push('Q');
        return page;
      },

      /* A filled rectangle, which in this app is either a page's paper, a
         card behind a one-liner, or a rule. A rule is a rectangle rather than
         a stroked line on purpose: a stroke of width w straddles the path and
         lands on a half pixel, and a hairline that renders at different
         weights on screen and on paper is the sort of thing somebody notices
         without being able to say what is wrong. */
      rect: function (x, top, width, height, color) {
        ops.push('q');
        ops.push(colorOp(color || '#000000') + ' rg');
        ops.push(num(x) + ' ' + num(doc.height - top - height) + ' ' +
                 num(width) + ' ' + num(height) + ' re f');
        ops.push('Q');
        return page;
      },

      stream: function () { return ops.join('\n'); }
    };

    return page;
  }

  /* ------------------------------------------------------------- the file */

  function create() {
    var pages = [];

    var doc = {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,

      page: function () {
        var page = createPage(doc);
        pages.push(page);
        return page;
      },

      count: function () { return pages.length; },

      measure: measure,
      wrap: wrap,

      /* The finished document as a binary string, one character per byte.
         Everything this writer emits is ASCII apart from the four byte
         comment on line two, which is the conventional way of telling old
         file transfer tools that a PDF is not text. */
      build: function () {
        var out = '%PDF-1.4\n%âãÏÓ\n';
        var offsets = [];
        var objects = [];

        // 1 catalog, 2 pages, 3 to 7 the fonts, then two objects per page.
        var fontBase = 3;
        var pageBase = fontBase + FONT_ORDER.length;

        var kids = [];
        for (var i = 0; i < pages.length; i++) kids.push((pageBase + i * 2) + ' 0 R');

        objects.push('<< /Type /Catalog /Pages 2 0 R >>');
        objects.push('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>');

        FONT_ORDER.forEach(function (name) {
          objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /' + name +
                       ' /Encoding /WinAnsiEncoding >>');
        });

        var fontRefs = FONT_ORDER.map(function (name, k) {
          return '/F' + (k + 1) + ' ' + (fontBase + k) + ' 0 R';
        }).join(' ');

        pages.forEach(function (page, k) {
          var contents = pageBase + k * 2 + 1;
          objects.push('<< /Type /Page /Parent 2 0 R ' +
            '/MediaBox [0 0 ' + PAGE_WIDTH + ' ' + PAGE_HEIGHT + '] ' +
            '/Resources << /Font << ' + fontRefs + ' >> >> ' +
            '/Contents ' + contents + ' 0 R >>');

          var stream = page.stream();
          objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
        });

        objects.forEach(function (body, k) {
          offsets.push(out.length);
          out += (k + 1) + ' 0 obj\n' + body + '\nendobj\n';
        });

        var xref = out.length;
        out += 'xref\n0 ' + (objects.length + 1) + '\n';
        out += '0000000000 65535 f \n';
        offsets.forEach(function (offset) {
          out += ('0000000000' + offset).slice(-10) + ' 00000 n \n';
        });

        out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
        out += 'startxref\n' + xref + '\n%%EOF\n';

        return out;
      },

      /* What both roads out of here want. The share sheet on a phone takes
         base64, because Capacitor's Filesystem writes binary that way, and a
         browser takes bytes to wrap in a Blob. */
      toBase64: function () {
        var binary = doc.build();
        if (typeof btoa === 'function') return btoa(binary);
        /* global Buffer */
        return Buffer.from(binary, 'binary').toString('base64');
      },

      toBytes: function () {
        var binary = doc.build();
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 255;
        return bytes;
      }
    };

    return doc;
  }

  /* Where a line's baseline goes, given the top of its line box, the type
     size, and the leading. Roughly centred in the box the way a browser
     centres one, so a paragraph set at 1.5 leading here sits where the same
     paragraph sits in print.css. */
  function baseline(top, size, leading) {
    return top + (leading - size) * 0.5 + size * 0.72;
  }

  HC.pdf = {
    create: create,
    measure: measure,
    wrap: wrap,
    baseline: baseline,
    encode: encode,
    mm: mm,
    rgb: rgb,
    WIDTH: PAGE_WIDTH,
    HEIGHT: PAGE_HEIGHT,
    FONTS: FONT_ORDER
  };

})(window.HC = window.HC || {});
