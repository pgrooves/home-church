/* ==========================================================================
   Home Church, the editor
   The writing surface in the Journal and on the announcement form: bold,
   italic, underline, two kinds of list, a button that puts a real scripture
   link in the text, and, where the caller allows links, a button that turns a
   selection into a hyperlink.

   TWO CALLERS, ONE SURFACE. The Journal has had this since it shipped. The
   announcement form uses the same field(), the same toolbar and the same
   sanitizer, because an admin who has written a journal entry has already
   learned this editor, and a second writing surface with its own bold button
   is how an app ends up with two of everything.

   WHAT THE TWO DISAGREE ABOUT IS LINKS, and it is one option. A journal entry
   keeps only Bible Gateway hrefs, so it gets the scripture button and no link
   button: a link button whose links are stripped on save is a lie. An
   announcement keeps http, https, mailto and tel, so it gets both. See the
   header of js/richtext.js.

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

  // Where the caret was before a sheet opened, and what was under it. The
  // words matter for the link sheet: selecting "sign up here" and tapping the
  // link button should offer those three words back as the label rather than
  // making somebody type them again.
  var savedRange = null;
  var savedText = '';

  // The scripture sheet's own state. Three steps, and the fourth is optional.
  var pick = { book: '', chapter: 0, verse: 0, through: 0 };

  // The link sheet's. Two plain fields, so unlike the scripture sheet nothing
  // here repaints as it is typed into: a repaint mid-word would take the
  // keyboard down and the caret with it.
  var linkPick = { url: '', text: '' };

  /* --------------------------------------------------------------- the field */

  var TOOLS = [
    { cmd: 'bold', label: 'Bold', glyph: 'B', cls: 'hc-tool--b' },
    { cmd: 'italic', label: 'Italic', glyph: 'I', cls: 'hc-tool--i' },
    { cmd: 'underline', label: 'Underline', glyph: 'U', cls: 'hc-tool--u' },
    { cmd: 'insertUnorderedList', label: 'Bulleted list', glyph: '•' },
    { cmd: 'insertOrderedList', label: 'Numbered list', glyph: '1.' }
  ];

  function toolbar(opts) {
    opts = opts || {};
    var html = '<div class="hc-tools" role="toolbar" aria-label="Formatting">';

    TOOLS.forEach(function (t) {
      html += '<button type="button" class="hc-tool ' + (t.cls || '') + '" ' +
        'data-action="editor-format" data-cmd="' + t.cmd + '" data-keep-focus ' +
        'aria-label="' + c.esc(t.label) + '">' + c.esc(t.glyph) + '</button>';
    });

    /* Only where the sanitizer will keep what it makes. On a journal entry
       every href but Bible Gateway's is dropped on save, so a link button
       there would be a button that appears to work and then quietly does not.
       See the header of this file. */
    if (opts.links === 'web') {
      html += '<button type="button" class="hc-tool hc-tool--wide" data-action="link-open" ' +
        'data-keep-focus>' + c.icon('arrowOut', 'hc-tool__icon') + 'Add a link</button>';
    }

    html += '<button type="button" class="hc-tool hc-tool--wide" data-action="scripture-open" ' +
      'data-keep-focus>' + c.icon('plus', 'hc-tool__icon') + 'Add scripture</button>';

    return html + '</div>';
  }

  /* The writing surface itself. Not a textarea: a textarea cannot hold a
     link, and a scripture reference that is not a link is just some letters.

     role="textbox" and aria-multiline are what make a contenteditable div
     announce itself as a text field to VoiceOver rather than as a group of
     paragraphs. The label is the one the caller gives it.

     opts.hook names the data attribute the input listener in js/app.js watches
     for, which is what decides where the keystrokes go: `journal-body` writes
     an entry, `admin-body` writes the announcement draft. It defaults to the
     Journal's, so the call that has been there since the Journal shipped is
     unchanged. */
  function field(opts) {
    opts = opts || {};
    var links = opts.links === 'web' ? 'web' : 'bible';
    var hook = opts.hook || 'journal-body';
    var html = HC.richtext.sanitize(opts.html || '', { links: links });

    return '' +
      '<div class="hc-editor">' +
        toolbar({ links: links }) +
        '<div class="hc-rt' + (opts.className ? ' ' + c.esc(opts.className) : '') + '" ' +
          'contenteditable="true" role="textbox" aria-multiline="true" ' +
          'data-' + c.esc(hook) + ' ' +
          (opts.id ? 'id="' + c.esc(opts.id) + '" ' : '') +
          'aria-label="' + c.esc(opts.label || 'What you want to say') + '" ' +
          'data-placeholder="' + c.esc(opts.placeholder || '') + '"' +
          // No whitespace between the tag and the content: a contenteditable
          // that starts with a newline shows an empty first line and the
          // :empty placeholder never fires.
          '>' + html + '</div>' +
        (opts.status === false
          ? ''
          : '<p class="hc-journal__status" data-journal-status aria-live="polite"></p>') +
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
    savedText = '';
    try {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      var node = range.commonAncestorContainer;
      var el = node.nodeType === 1 ? node : node.parentNode;
      // Only a caret that was inside a writing surface is worth keeping.
      var inside = el && el.closest && el.closest('.hc-rt');
      savedRange = inside ? range.cloneRange() : null;
      if (inside) savedText = String(sel.toString() || '').trim();
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
    // Never two sheets, whichever one was already up.
    close();
    closeLink();
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

  /* Puts markup where the caret was. The range has to go back before
     execCommand, because insertHTML acts on the selection and the selection
     is currently a dropdown in a sheet.

     Both sheets end here, because both of them do the same thing to the same
     surface: they took the caret away and they are giving it back with a link
     under it. */
  function insertAtCaret(html) {
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
    savedText = '';

    // The save is driven by 'input', and execCommand does not always fire one.
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insert() {
    var book = pick.book ? HC.bible.getBook(pick.book) : null;
    if (!book) return;

    var chapter = book.chapters === 1 ? 1 : pick.chapter;
    if (!chapter) return;

    var ref = HC.bible.reference(book.name, chapter, pick.verse, pick.through);

    close();
    insertAtCaret('<a href="' + c.esc(c.bibleUrl(ref)) + '">' + c.esc(ref) + '</a>&nbsp;');
  }

  /* ---------------------------------------------------------- the link sheet

     Two fields and a button. The same panel as the scripture sheet, because it
     is the same act from the writer's side: something is being put into the
     words that was not typed into them.

     WHY IT IS NOT execCommand('createLink'). That command needs a live
     selection and does nothing at a bare caret, so half of the taps on the
     button would appear to do nothing at all. Building the anchor and putting
     it in at the caret works both ways round: with a selection the label comes
     back already filled in, and without one somebody types the words they
     want. What goes in is a plain <a>, which is exactly what the sanitizer
     keeps, so what is stored is what was seen.
     ---------------------------------------------------------------------- */

  function linkSheet() {
    return '' +
      '<div class="hc-sheet" data-sheet="link" role="dialog" aria-modal="true" ' +
          'aria-label="Add a link">' +
        '<button type="button" class="hc-sheet__scrim" data-action="link-close" ' +
          'tabindex="-1" aria-hidden="true"></button>' +
        '<div class="hc-sheet__panel">' +
          '<div class="hc-sheet__head">' +
            '<p class="hc-eyebrow">Add a link</p>' +
            '<button type="button" class="hc-sheet__close" data-action="link-close" ' +
              'aria-label="Close">' + c.icon('close') + '</button>' +
          '</div>' +

          '<label class="hc-field">' +
            '<span class="hc-field__label">Link</span>' +
            '<input class="hc-input" type="url" data-link="url" inputmode="url" ' +
              'autocomplete="off" autocapitalize="off" spellcheck="false" ' +
              'placeholder="homechurch.org/serve" ' +
              'value="' + c.esc(linkPick.url) + '">' +
            '<span class="hc-caption hc-field__help">A web address, an email ' +
              'address, or a phone number.</span>' +
          '</label>' +

          '<label class="hc-field hc-mt-md">' +
            '<span class="hc-field__label">Words to show</span>' +
            '<input class="hc-input" type="text" data-link="text" ' +
              'autocomplete="off" placeholder="Sign up here" ' +
              'value="' + c.esc(linkPick.text) + '">' +
            '<span class="hc-caption hc-field__help">Leave it empty and the ' +
              'link shows its own address.</span>' +
          '</label>' +

          '<div class="hc-sheet__foot">' +
            c.button('Add it', { action: 'link-insert' }) +
          '</div>' +

          '<p class="hc-caption hc-sheet__note">Tapping it in the announcement ' +
            'opens the link in the phone’s own browser.</p>' +
        '</div>' +
      '</div>';
  }

  function openLink() {
    remember();
    // Whatever was selected comes back as the label, which is the whole reason
    // remember() keeps the words as well as the range.
    linkPick = { url: '', text: savedText };
    // Never two sheets, whichever one was already up.
    closeLink();
    close();
    document.getElementById('app').appendChild(c.el(linkSheet()));
    var box = document.querySelector('[data-link="url"]');
    if (box) box.focus();
  }

  function closeLink() {
    var el = document.querySelector('[data-sheet="link"]');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // Every keystroke in the sheet. Draws nothing, for the reason on linkPick.
  function setLink(what, value) {
    if (what === 'url' || what === 'text') linkPick[what] = String(value == null ? '' : value);
  }

  function insertLink() {
    var url = c.webUrl(linkPick.url);
    if (!url) {
      c.toast('That does not look like a link. Try it with the www. in front.');
      return;
    }

    var label = String(linkPick.text || '').trim() || c.urlHost(url) || url;

    closeLink();
    insertAtCaret('<a href="' + c.esc(url) + '">' + c.esc(label) + '</a>&nbsp;');
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

    openLink: openLink,
    closeLink: closeLink,
    setLink: setLink,
    insertLink: insertLink,

    // For the tests.
    _pick: function () { return pick; },
    _link: function () { return linkPick; }
  };

})(window.HC = window.HC || {});
