/* ==========================================================================
   Home Church, highlighting
   Select something in a guide, and keep it. The selection bar that floats
   over the words, the note sheet that opens underneath, and the plumbing that
   turns a browser Range into the anchor js/journal.js stores.

   WHAT IS HIGHLIGHTABLE. Prose. The two summaries, the anchor paragraphs
   under Where it went, and the one-liners. Not the discussion questions and
   not the reflection prompts: both are drawn inside buttons and textareas,
   where dragging across the words fights the control rather than selecting
   anything, and both already have somewhere of their own for what you think
   about them. Every highlightable block carries data-hl-path, and that
   attribute is the whole contract between this file and js/screens/guide.js.

   ONE BLOCK AT A TIME. A selection that runs from one paragraph into the next
   is clamped to the one it started in. Anchoring across blocks doubles the
   problem in §2c of JOURNAL_TAB.md and buys nothing anybody asked for.

   WE DO NOT FIGHT THE SYSTEM MENU. iOS puts up its own Copy / Look Up callout
   on a selection. Ours sits above the words, theirs sits wherever it likes,
   and both work. Trying to suppress the platform one costs the ability to
   copy a line out of a guide, which is a thing people do.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var bar = null;          // the floating Note this / Highlight bar
  var pending = null;      // { guideId, path, quote, start, end } under the bar

  /* ------------------------------------------------- range to plain offsets

     The block on screen is not plain text: it already contains <mark>
     elements from earlier highlights, and marks are elements with text nodes
     inside them. So the offset of the selection has to be counted by walking
     the text nodes in order, not read off any single node. */

  function offsetWithin(block, container, offset) {
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
    var count = 0;
    var node;
    while ((node = walker.nextNode())) {
      if (node === container) return count + offset;
      count += node.nodeValue.length;
    }
    // The container was an element rather than a text node, which happens
    // when a selection ends on a boundary. Everything up to here is the
    // honest answer.
    return count;
  }

  function blockOf(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentNode);
    return el && el.closest ? el.closest('[data-hl-path]') : null;
  }

  /* What is selected right now, as something the store could keep. Returns
     null for anything that is not a real selection inside one block. */
  function fromSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

    var range = sel.getRangeAt(0);
    var block = blockOf(range.startContainer);
    if (!block) return null;

    var reader = block.closest('[data-guide]');
    if (!reader) return null;

    var text = block.textContent;
    var start = offsetWithin(block, range.startContainer, range.startOffset);

    // Clamped to this block, per the note at the top of this file.
    var end = blockOf(range.endContainer) === block
      ? offsetWithin(block, range.endContainer, range.endOffset)
      : text.length;

    if (end <= start) return null;

    var quote = text.slice(start, end).trim();
    if (quote.length < 2) return null;

    // Trimming moved the start, so move the offsets with it or the anchor
    // points at whitespace the quote does not contain.
    var lead = text.slice(start, end).indexOf(quote);

    return {
      guideId: reader.getAttribute('data-guide'),
      path: block.getAttribute('data-hl-path'),
      quote: quote,
      start: start + (lead > 0 ? lead : 0),
      end: start + (lead > 0 ? lead : 0) + quote.length
    };
  }

  /* ----------------------------------------------------------- the bar */

  function hideBar() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
    pending = null;
  }

  /* Where the selection is on screen, or null when it is nowhere: a range
     inside a collapsed section has no box. A person cannot select text they
     cannot see, so this is not a case anybody reaches by hand, but a bar
     placed from a zero rect lands in the corner of the screen attached to
     nothing, which is worse than no bar. */
  function rectOf() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    return rect;
  }

  function showBar(at) {
    hideBar();
    if (!rectOf()) return;
    pending = at;

    bar = c.el(
      '<div class="hc-hlbar" role="group" aria-label="What to do with what you selected">' +
        '<button type="button" class="hc-hlbar__btn" data-action="hl-note" data-keep-focus>' +
          c.icon('pencil', 'hc-hlbar__icon') + 'Note this</button>' +
        '<span class="hc-hlbar__rule" aria-hidden="true"></span>' +
        '<button type="button" class="hc-hlbar__btn" data-action="hl-mark" data-keep-focus>' +
          'Highlight</button>' +
      '</div>');

    document.getElementById('app').appendChild(bar);
    place();
  }

  // Centered over the selection, above it, and never off either edge.
  function place() {
    if (!bar) return;
    var rect = rectOf();
    if (!rect) { hideBar(); return; }

    var width = bar.offsetWidth || 220;
    var pad = 8;
    var left = rect.left + (rect.width / 2) - (width / 2);
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

    /* Above the words when there is room, otherwise below them, so the bar
       never covers what is about to be quoted.

       Then clamped into the viewport, which is not belt and braces: select
       the last line on screen and "below" is off the bottom edge, so the bar
       is drawn where nobody can reach it and the feature looks broken rather
       than misplaced. 60 clears the header; the bottom margin clears the tab
       bar. */
    var height = bar.offsetHeight || 44;
    var above = rect.top - height - 10;
    var top = above > 60 ? above : rect.bottom + 10;
    top = Math.max(60, Math.min(top, window.innerHeight - height - 90));

    bar.style.left = Math.round(left) + 'px';
    bar.style.top = Math.round(top) + 'px';
  }

  /* ---------------------------------------------------------- the sheet

     The note sheet is the scripture sheet's sibling: same overlay, same way
     out. It carries data-entry, which is what makes the editor's ordinary
     debounced save in js/app.js write to this entry without knowing it is in
     a sheet at all. */

  function noteSheet(entry) {
    return '' +
      '<div class="hc-sheet" data-sheet="note" data-entry="' + c.esc(entry.id) + '" ' +
          'role="dialog" aria-modal="true" aria-label="Write a note about this">' +
        '<button type="button" class="hc-sheet__scrim" data-action="hl-close" ' +
          'tabindex="-1" aria-hidden="true"></button>' +
        '<div class="hc-sheet__panel">' +
          '<div class="hc-sheet__head">' +
            '<p class="hc-eyebrow">Your note</p>' +
            '<button type="button" class="hc-sheet__close" data-action="hl-close" ' +
              'aria-label="Close">' + c.icon('close') + '</button>' +
          '</div>' +

          '<blockquote class="hc-quote hc-hlsheet__quote">' + c.esc(entry.quote) + '</blockquote>' +

          HC.editor.field({
            id: 'hc-hl-note',
            html: entry.bodyHtml,
            label: 'Your note about this',
            placeholder: 'What did that land on?'
          }) +

          '<div class="hc-sheet__foot hc-hlsheet__foot">' +
            c.button('Done', { action: 'hl-close' }) +
            c.button('Remove the highlight', {
              action: 'hl-remove', id: entry.id, variant: 'tertiary', small: true
            }) +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function openNote(entry) {
    closeNote();
    document.getElementById('app').appendChild(c.el(noteSheet(entry)));
    var box = document.getElementById('hc-hl-note');
    if (box) box.focus();
  }

  /* Closing redraws the block the note belongs to. Writing in the sheet
     changes how the mark underneath it is drawn, from a plain highlight to a
     noted one, and nothing else would ever repaint it: the guide is behind
     the sheet, already rendered, and the entry it is drawn from changed while
     it was covered up. Without this the page catches up only on the next
     visit, which reads as the note not having saved. */
  function closeNote() {
    var el = document.querySelector('[data-sheet="note"]');
    if (!el) return;

    var entry = HC.journal.get(el.getAttribute('data-entry'));
    if (el.parentNode) el.parentNode.removeChild(el);
    if (entry && entry.guideId && entry.path) redraw(entry.guideId, entry.path);
  }

  /* ------------------------------------------------------------- making one

     Both buttons make an entry. A highlight with no note is still something
     somebody did on purpose, and it shows in the Journal as the quotation on
     its own. There is no second concept to explain. */

  function create(withNote) {
    if (!pending) return;
    var at = pending;
    var guide = HC.data.getGuide(at.guideId);

    var entry = HC.journal.create({
      kind: 'highlight',
      guideId: at.guideId,
      guideTitle: guide ? HC.data.guideTitle(guide) : null,
      path: at.path,
      quote: at.quote,
      start: at.start,
      end: at.end
    });

    hideBar();
    clearSelection();
    redraw(at.guideId, at.path);
    HC.native.tap('Light');

    if (withNote) openNote(entry);
    else c.toast('Highlighted. It is in your Journal.');
  }

  function clearSelection() {
    try {
      var sel = window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    } catch (err) { /* nothing to clear */ }
  }

  /* Redraw one block rather than the screen. The reader is full of open and
     closed sections and a remembered scroll position, and rebuilding it to
     paint one underline would throw all of that away. */
  function redraw(guideId, path) {
    var block = document.querySelector('[data-hl-path="' + path + '"]');
    if (!block) return;
    block.innerHTML = HC.journal.marked(guideId, path, block.textContent);
  }

  function open(id) {
    // Unreachable while locked, since no marks are drawn, but the guard costs
    // a line and this is the function that puts somebody's writing on screen.
    if (HC.journal.isLocked()) return;
    var entry = HC.journal.get(id);
    if (entry) openNote(entry);
  }

  function remove(id) {
    var entry = HC.journal.get(id);
    if (!entry) return;
    var guideId = entry.guideId;
    var path = entry.path;
    HC.journal.remove(id);
    closeNote();
    redraw(guideId, path);
    c.toast('Highlight removed.');
  }

  /* ------------------------------------------------------------------ wiring

     selectionchange rather than a pointer event, because it is the only thing
     that fires for every way a selection can be made: a drag, a double tap on
     a word, the grab handles being moved afterwards, and the keyboard.

     The delay is not politeness. On iOS the selection is still settling while
     the grab handles are moving, and a bar that repositions on every tick
     flickers under the thumb doing the moving.  */

  var settle = null;

  function onSelectionChange() {
    window.clearTimeout(settle);
    settle = window.setTimeout(function () {
      // Never over a sheet: the note sheet contains its own writing surface,
      // and selecting inside it is editing, not highlighting.
      if (document.querySelector('.hc-sheet')) { hideBar(); return; }

      // A locked journal has nowhere to put a highlight, and offering to make
      // one would draw a mark that is then not drawn. See marked().
      if (HC.journal.isLocked()) { hideBar(); return; }

      var at = fromSelection();
      if (!at) { hideBar(); return; }
      showBar(at);
    }, 220);
  }

  function init() {
    document.addEventListener('selectionchange', onSelectionChange);

    // The bar is placed in viewport coordinates, so it has to go when the
    // words underneath it move. Hiding beats chasing: a bar that follows a
    // scrolling paragraph is harder to hit than one that waits to be asked
    // again.
    var scroller = document.getElementById('hc-scroll');
    if (scroller) scroller.addEventListener('scroll', function () { if (bar) hideBar(); },
      { passive: true });

    // Leaving the guide takes both of these with it.
    HC.store.on('view', function () { hideBar(); closeNote(); });
  }

  HC.highlight = {
    init: init,
    create: create,
    open: open,
    remove: remove,
    closeNote: closeNote,
    hideBar: hideBar,
    redraw: redraw,
    // For the tests.
    _pending: function () { return pending; },
    _fromSelection: fromSelection
  };

})(window.HC = window.HC || {});
