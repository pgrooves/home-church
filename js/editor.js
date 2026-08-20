/* ==========================================================================
   Home Church, the editor
   The writing surface in the Journal: bold, italic, underline, two kinds of
   list, and a button that puts a real scripture link in the text.

   ON contenteditable AND execCommand. execCommand is deprecated, and it also
   works in every WKWebView this app ships to, in Safari, and in Chrome. The
   replacement is to own a document model, a selection model and an undo
   stack, which is a text editor, and this app is not one. Five buttons on a
   contenteditable is the right amount of technology for the job. If it ever
   stops working, the fallback is a plain textarea and markdown, and the store
   already keeps a plain text mirror that would make that swap survivable.

   WHAT IS STORED IS NEVER WHAT THE BROWSER PRODUCED. Every save goes through
   HC.journal.sanitize(), which keeps six tags and one attribute and unwraps
   the rest. So a paste out of Word, or whatever a future browser decides
   bold means, lands in the same six tags as everything else.

   SELECTION IS THE WHOLE PROBLEM. Tapping a toolbar button moves focus out of
   the text, and a browser with no selection has nothing to embolden. Every
   control here is guarded by a mousedown that refuses to take focus, and the
   scripture sheet, which really does take focus, saves the range on the way
   in and puts it back on the way out.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  // Where the caret was before the scripture sheet opened.
  var savedRange = null;

  // The sheet's own state. Three steps, and the fourth is optional.
  var pick = { book: '', chapter: 0, verse: 0, through: 0 };

  /* --------------------------------------------------------------- the field */

  var TOOLS = [
    { cmd: 'bold', label: 'Bold', glyph: 'B', cls: 'hc-tool--b' },
    { cmd: 'italic', label: 'Italic', glyph: 'I', cls: 'hc-tool--i' },
    { cmd: 'underline', label: 'Underline', glyph: 'U', cls: 'hc-tool--u' },
    { cmd: 'insertUnorderedList', label: 'Bulleted list', glyph: '•' },
    { cmd: 'insertOrderedList', label: 'Numbered list', glyph: '1.' }
  ];

  function toolbar() {
    var html = '<div class="hc-tools" role="toolbar" aria-label="Formatting">';

    TOOLS.forEach(function (t) {
      html += '<button type="button" class="hc-tool ' + (t.cls || '') + '" ' +
        'data-action="editor-format" data-cmd="' + t.cmd + '" data-keep-focus ' +
        'aria-label="' + c.esc(t.label) + '">' + c.esc(t.glyph) + '</button>';
    });

    html += '<button type="button" class="hc-tool hc-tool--wide" data-action="scripture-open" ' +
      'data-keep-focus>' + c.icon('plus', 'hc-tool__icon') + 'Add scripture</button>';

    return html + '</div>';
  }

  /* The writing surface itself. Not a textarea: a textarea cannot hold a
     link, and a scripture reference that is not a link is just some letters.

     role="textbox" and aria-multiline are what make a contenteditable div
     announce itself as a text field to VoiceOver rather than as a group of
     paragraphs. The label is the one the caller gives it. */
  function field(opts) {
    opts = opts || {};
    var html = HC.journal.sanitize(opts.html || '');

    return '' +
      '<div class="hc-editor">' +
        toolbar() +
        '<div class="hc-rt" contenteditable="true" role="textbox" aria-multiline="true" ' +
          'data-journal-body ' +
          (opts.id ? 'id="' + c.esc(opts.id) + '" ' : '') +
          'aria-label="' + c.esc(opts.label || 'What you want to say') + '" ' +
          'data-placeholder="' + c.esc(opts.placeholder || '') + '"' +
          // No whitespace between the tag and the content: a contenteditable
          // that starts with a newline shows an empty first line and the
          // :empty placeholder never fires.
          '>' + html + '</div>' +
        '<p class="hc-journal__status" data-journal-status aria-live="polite"></p>' +
      '</div>';
  }

  /* ------------------------------------------------------------ formatting */

  function format(cmd) {
    try {
      // Tags, not inline styles. Without this, Chrome emits <span style> for
      // bold, which the sanitizer correctly throws away, which would look
      // like a button that does nothing.
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(cmd, false, null);
    } catch (err) { /* an old web view. The words are still there. */ }
  }

  /* ------------------------------------------------------- the scripture sheet

     Three dropdowns and an optional fourth. Native <select> on iOS is a wheel
     at the bottom of the screen, which is exactly the right control for a
     list of sixty-six things and costs nothing to get.

     The verse list is built from js/bible.js, so it stops where the chapter
     stops. That is the whole reason those numbers ship: a free number field
     accepts John 3:400 and sends somebody to a page that says nothing found.
     ---------------------------------------------------------------------- */

  function remember() {
    try {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      var node = range.commonAncestorContainer;
      var el = node.nodeType === 1 ? node : node.parentNode;
      // Only a caret that was inside a writing surface is worth keeping.
      savedRange = el && el.closest && el.closest('.hc-rt') ? range.cloneRange() : null;
    } catch (err) {
      savedRange = null;
    }
  }

  function bookOptions() {
    var html = '<option value="">Choose a book</option>';
    ['Old', 'New'].forEach(function (t) {
      html += '<optgroup label="' + t + ' Testament">';
      HC.bible.books.forEach(function (b) {
        if (b.testament !== t) return;
        html += '<option value="' + c.esc(b.name) + '"' +
          (pick.book === b.name ? ' selected' : '') + '>' + c.esc(b.name) + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function numberOptions(total, current, blank) {
    var html = '<option value="0">' + c.esc(blank) + '</option>';
    for (var n = 1; n <= total; n++) {
      html += '<option value="' + n + '"' + (current === n ? ' selected' : '') + '>' + n + '</option>';
    }
    return html;
  }

  function sheet() {
    var book = pick.book ? HC.bible.getBook(pick.book) : null;
    // A one chapter book has no chapter to choose. Ask for the verse instead
    // of making somebody pick 1 out of a list of 1.
    var single = book && book.chapters === 1;
    var chapter = single ? 1 : pick.chapter;
    var verses = book && chapter ? HC.bible.verseCount(book.name, chapter) : 0;

    var ready = !!(book && chapter);
    var preview = ready ? HC.bible.reference(book.name, chapter, pick.verse, pick.through) : '';

    var html = '<div class="hc-sheet" data-sheet="scripture" role="dialog" aria-modal="true" ' +
        'aria-label="Add a scripture reference">' +
      '<button type="button" class="hc-sheet__scrim" data-action="scripture-close" ' +
        'tabindex="-1" aria-hidden="true"></button>' +
      '<div class="hc-sheet__panel">' +
        '<div class="hc-sheet__head">' +
          '<p class="hc-eyebrow">Add scripture</p>' +
          '<button type="button" class="hc-sheet__close" data-action="scripture-close" ' +
            'aria-label="Close">' + c.icon('close') + '</button>' +
        '</div>' +

        '<label class="hc-field">' +
          '<span class="hc-field__label">Book</span>' +
          '<select class="hc-input hc-select" data-scripture="book">' + bookOptions() + '</select>' +
        '</label>';

    if (book && !single) {
      html += '<label class="hc-field hc-mt-md">' +
        '<span class="hc-field__label">Chapter</span>' +
        '<select class="hc-input hc-select" data-scripture="chapter">' +
          numberOptions(book.chapters, pick.chapter, 'Choose a chapter') +
        '</select>' +
      '</label>';
    }

    if (verses) {
      html += '<div class="hc-sheet__verses">' +
        '<label class="hc-field">' +
          '<span class="hc-field__label">Verse</span>' +
          '<select class="hc-input hc-select" data-scripture="verse">' +
            numberOptions(verses, pick.verse, 'Whole chapter') +
          '</select>' +
        '</label>';

      // Through only appears once there is something to count from.
      if (pick.verse) {
        html += '<label class="hc-field">' +
          '<span class="hc-field__label">Through</span>' +
          '<select class="hc-input hc-select" data-scripture="through">' +
            numberOptions(verses, pick.through, 'Just the one') +
          '</select>' +
        '</label>';
      }
      html += '</div>';
    }

    html += '<div class="hc-sheet__foot">' +
      (preview ? '<p class="hc-sheet__preview">' + c.esc(preview) + '</p>' : '') +
      c.button('Add it', { action: 'scripture-insert', disabled: !ready }) +
    '</div>';

    html += '<p class="hc-caption hc-sheet__note">It goes in as a link. Tapping it opens the passage on ' +
      'Bible Gateway, in your own browser.</p>';

    return html + '</div></div>';
  }

  function open() {
    remember();
    pick = { book: '', chapter: 0, verse: 0, through: 0 };
    close();                       // never two sheets
    var host = document.getElementById('app');
    host.appendChild(c.el(sheet()));
    var select = document.querySelector('[data-scripture="book"]');
    if (select) select.focus();
  }

  function repaint() {
    var open = document.querySelector('[data-sheet="scripture"]');
    if (!open || !open.parentNode) return;
    open.parentNode.replaceChild(c.el(sheet()), open);
  }

  function close() {
    var el = document.querySelector('[data-sheet="scripture"]');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function setPick(what, value) {
    if (what === 'book') {
      pick.book = value;
      pick.chapter = 0;
      pick.verse = 0;
      pick.through = 0;
    } else {
      pick[what] = parseInt(value, 10) || 0;
      // Choosing a chapter after a verse leaves a verse that may not exist.
      if (what === 'chapter') { pick.verse = 0; pick.through = 0; }
      if (what === 'verse') pick.through = 0;
    }
    repaint();
  }

  /* Puts the link where the caret was. The range has to go back before
     execCommand, because insertHTML acts on the selection and the selection
     is currently a dropdown in a sheet. */
  function insert() {
    var book = pick.book ? HC.bible.getBook(pick.book) : null;
    if (!book) return;

    var chapter = book.chapters === 1 ? 1 : pick.chapter;
    if (!chapter) return;

    var ref = HC.bible.reference(book.name, chapter, pick.verse, pick.through);
    var html = '<a href="' + c.esc(c.bibleUrl(ref)) + '">' + c.esc(ref) + '</a>&nbsp;';

    close();

    var box = document.querySelector('.hc-rt');
    if (!box) return;
    box.focus();

    try {
      var sel = window.getSelection();
      if (savedRange) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      document.execCommand('insertHTML', false, html);
    } catch (err) {
      // No execCommand. Append rather than losing what somebody chose.
      box.innerHTML = box.innerHTML + ' ' + html;
    }

    savedRange = null;

    // The save is driven by 'input', and execCommand does not always fire one.
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }

  HC.editor = {
    field: field,
    toolbar: toolbar,
    format: format,
    remember: remember,
    openScripture: open,
    closeScripture: close,
    setPick: setPick,
    insertScripture: insert,
    // For the tests.
    _pick: function () { return pick; }
  };

})(window.HC = window.HC || {});
