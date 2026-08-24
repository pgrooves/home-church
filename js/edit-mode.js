/* ==========================================================================
   Home Church, Edit mode
   The half hour in which an admin can fix a sentence where they are reading
   it, instead of remembering to fix it later on a form.

   WHAT IT DOES. An admin turns it on from Settings -> Admin -> Content. Every
   sentence the app has marked editable outlines itself. Tapping one turns it
   into a text box with Save and Cancel under it. Saving writes to Supabase,
   and the next time any phone in the church syncs content, that is the
   sentence it draws. There is no publish step, the same as everywhere else on
   the Admin screen.

   WHAT IT DOES NOT TOUCH, and this is the part worth being strict about,
   because the failure mode of a loose answer is a heading that reads
   "Anncouncements" for a fortnight or a button whose label no longer matches
   what the code looks for. A slot is only ever created by a screen calling
   wrap() around a sentence on purpose. Headings, button labels, tab names,
   dates, scripture, anything compared against in code, the nine Practices
   (somebody else's words, see js/practices.js), the legal pages (the App
   Store was shown those exact words), and anything a person wrote in the
   Journal or a group room are all simply never wrapped, so no amount of
   flipping the switch reveals them.

   THE TWO KINDS OF SENTENCE, which is the whole shape of this file:

     A row.   A next step's blurb, a serve team's blurb, an event's
              description, the church's tagline, the podcast blurb. These are
              already columns in tables the app syncs. Saving PATCHes that
              column. Migration 0030 section 3 grants an admin exactly those
              columns and nothing else on those tables.

     A slot.  A string that still lives in a source file, like the line under
              the Give button. Saving upserts a row into text_overrides keyed
              by a slot name, and js/data.js copy() prefers that row over the
              string in the binary. Reset deletes the row and the app's own
              words come back. Migration 0030 sections 1 and 2.

   WHY THE STATE IS IN THIS FILE AND NOWHERE ELSE. Edit mode has to turn
   itself off when the app is closed and after thirty minutes of nobody
   touching anything. Both of those are promises only this device can keep, so
   the state is a variable in this closure: not localStorage, which would
   survive a cold start, and not a row in app_settings, which would be a
   statement about every admin's phone at once and would still read `true`
   next Tuesday. Migration 0030 section 4 says the same thing from the
   database's side. Closing the app reloads this file, and a reloaded file has
   `on` false. That is the whole implementation of "turns off when you close
   the app".

   RENDERING, and why an editor open on screen survives a content sync. Every
   screen in this app renders to a string in one pass, and a content refresh
   landing mid-edit redraws the screen underneath. So the text being typed
   lives here, in `editing`, exactly the way js/screens/admin.js keeps a half
   written announcement in `draft`: the repaint reads the editor back out of
   this module and the words are still there. Typing itself draws nothing.

   Loaded as a classic script like everything else. Needs auth.js for the
   session, content.js for the refresh after a write, and components.js for
   esc() and the toast, so it sits below all three in index.html.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* Thirty minutes, as asked for. Measured from the last time a finger or a
     key touched the app, not from when the switch was flipped: an admin who
     is working steadily should not be thrown out mid sentence. */
  var IDLE_MS = 30 * 60 * 1000;

  /* How often we look at the clock. The check is a subtraction against a
     stored timestamp rather than a countdown, which is what makes it correct
     across an app that was backgrounded: iOS suspends timers, so a countdown
     would resume where it left off and quietly grant an extra twenty minutes
     to a phone that was in a pocket. A stored timestamp cannot drift that
     way, and the same subtraction runs the moment the app comes back to the
     front. */
  var TICK_MS = 30 * 1000;

  var MAX_LENGTH = 2000;         // matches the check constraint in 0030

  var on = false;
  var lastTouch = 0;
  var ticker = null;
  var wired = false;

  /* The sentence being edited right now, or null. `value` is what is in the
     box, `busy` is true while the write is in the air. One at a time, on
     purpose: two open editors on one screen is two ways to lose what you
     typed. */
  var editing = null;

  /* Every sentence the current render offered, keyed by slot. Rebuilt on
     every draw, because a screen only registers the sentences it actually
     drew, and a slot from the screen before this one is not something Save
     should be able to reach. */
  var slots = {};

  /* ---------------------------------------------------------------- who */

  /* Whether to draw the switch at all. Not a security boundary and not trying
     to be, the same as the rest of the Admin screen: the database refuses
     every write here for anybody who is not an admin, in the policies from
     0030. This only decides whether the app offers a door. */
  function available() {
    return !!(HC.admin && HC.admin.isAdmin() && HC.content && HC.content.isConfigured());
  }

  function isOn() {
    return on && available();
  }

  /* ------------------------------------------------------------- the clock */

  function touch() {
    lastTouch = Date.now();
  }

  function idleFor() {
    return Date.now() - lastTouch;
  }

  function tick() {
    if (!on) return;
    // Signed out, or demoted, while edit mode was on. isOn() already answers
    // false for both, so nothing more can be edited either way; this is what
    // takes the pill off the screen and stops the clock rather than leaving
    // them running against a session that no longer exists.
    if (!available()) return disable('gone');
    if (idleFor() < IDLE_MS) return;
    disable('idle');
  }

  /* Wired once, on boot, rather than when the switch goes on. Two reasons:
     adding and removing document listeners on a toggle is how a listener ends
     up attached twice, and the cost of these when edit mode is off is one
     `if` per tap on a phone that is already handling the tap. */
  function start() {
    if (wired) return;
    wired = true;

    document.addEventListener('pointerdown', function () {
      if (on) touch();
    }, true);
    document.addEventListener('keydown', function () {
      if (on) touch();
    }, true);

    /* Coming back from the background. The timer above may not have run while
       the app was away, so the elapsed time is checked here as well, which is
       what makes "thirty minutes" true rather than "thirty minutes of the app
       being on screen". */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tick();
    });
  }

  /* ------------------------------------------------------------- the switch */

  function enable() {
    if (!available()) return false;
    on = true;
    touch();
    if (!ticker) ticker = window.setInterval(tick, TICK_MS);
    paintPill();
    return true;
  }

  /* `why` is 'idle' when the clock ran out, 'gone' when the session or the
     role went away under us, and undefined when somebody pressed the switch,
     which js/app.js speaks to itself. The first two say so out loud, because
     edit mode going quiet on its own with no explanation is how somebody
     concludes their edits have stopped saving. */
  function disable(why) {
    var wasOn = on;
    on = false;
    editing = null;
    if (ticker) { window.clearInterval(ticker); ticker = null; }
    paintPill();
    if (wasOn && why && HC.components) {
      HC.components.toast(why === 'idle'
        ? 'Edit mode turned off after thirty minutes.'
        : 'Edit mode is off.');
    }
    return wasOn;
  }

  function toggle() {
    return isOn() ? (disable(), false) : enable();
  }

  /* ------------------------------------------------------------ the slots */

  /* A row's slot name is derived rather than chosen, so two screens drawing
     the same next step reach the same sentence. Slots for source strings are
     chosen by hand in the screen that draws them, in the form
     'screen.what-it-is', and the shape is enforced by the database in 0030.

     The colons are what keeps the two namespaces apart: a derived slot can
     never collide with a hand written one, because 0030 refuses a slot with a
     colon in it and every derived slot has two. Derived slots are never sent
     to text_overrides, they name a column to PATCH. */
  function slotFor(desc) {
    if (desc.slot) return desc.slot;
    return desc.table + ':' + desc.id + ':' + desc.column;
  }

  function register(desc) {
    var slot = slotFor(desc);
    slots[slot] = {
      slot: slot,
      kind: desc.table ? 'row' : 'copy',
      table: desc.table || '',
      id: desc.id || '',
      column: desc.column || '',
      // The in-memory object and key to patch on a successful save, so the
      // sentence changes under the thumb rather than a second later when the
      // content sync lands. Optional: without it the refresh is what updates
      // the screen, which is correct, just slower.
      target: desc.target || null,
      field: desc.field || '',
      value: desc.value == null ? '' : String(desc.value),
      label: desc.label || 'this text',
      // A source string can go back to what shipped in the app. A table row
      // has no such thing to go back to: the words in the table are the only
      // copy the church has.
      resettable: !desc.table,
      rows: desc.rows || 0
    };
    return slots[slot];
  }

  function known(slot) {
    return Object.prototype.hasOwnProperty.call(slots, slot) ? slots[slot] : null;
  }

  /* Called by the router before a screen draws, so the registry describes
     what is on the glass rather than accumulating every sentence the app has
     ever drawn. The open editor is deliberately not cleared here: a repaint
     mid-edit has to leave the box and its words alone. */
  function beginRender() {
    slots = {};
    /* The pill is outside every screen, so nothing else would ever take it
       down on a draw that happens because somebody signed out. One
       getElementById per screen draw, which is nothing, and it means the pill
       cannot outlive the mode it is announcing. */
    if (on && !available()) disable('gone');
    else paintPill();
  }

  /* -------------------------------------------------------------- drawing */

  function esc(s) {
    return HC.components.esc(s);
  }

  /* THE ONE FUNCTION SCREENS CALL.

       HC.edit.wrap(html, desc)

     `html` is what the screen would have drawn anyway. `desc` says what
     sentence is inside it. Off, this returns `html` untouched and costs one
     boolean, which is what lets it be called from screens that are drawn
     hundreds of times a day by people who will never see edit mode.

     Note that the descriptor is registered even when edit mode is off. It is
     one object per wrapped sentence per draw, and doing it unconditionally
     means turning the switch on does not need the screen to have been drawn
     again first. */
  function wrap(html, desc) {
    var entry = register(desc);
    if (!isOn()) return html;
    if (editing && editing.slot === entry.slot) return editor(entry);

    /* A sentence the church cleared draws nothing, which is the point of
       being allowed to clear it, and it also leaves an admin nothing to tap
       to put it back. So while edit mode is on, and only then, an empty slot
       draws a line saying so. Screens pass '' for this case rather than
       having to know about it. */
    if (!html) {
      html = '<p class="hc-caption hc-editable__empty">Nothing here. Tap to write it.</p>';
    }

    return '' +
      '<div class="hc-editable" data-action="edit-open" data-slot="' + esc(entry.slot) + '" ' +
        'role="button" tabindex="0" ' +
        'aria-label="Edit ' + esc(entry.label) + '">' +
        html +
        '<span class="hc-editable__mark" aria-hidden="true">' +
          HC.components.icon('pencil', 'hc-editable__icon') +
        '</span>' +
      '</div>';
  }

  /* The box, drawn in place of the sentence. Deliberately not a sheet over
     the screen: the point of editing in place is seeing the words in the
     layout they live in, and a panel covering that is a form with extra
     steps. */
  function editor(entry) {
    var busy = !!editing.busy;
    var rows = entry.rows || Math.min(8, Math.max(3,
      Math.ceil((editing.value.length || 1) / 42)));

    return '' +
      '<div class="hc-edit">' +
        '<span class="hc-edit__label">' + esc(entry.label) + '</span>' +
        '<textarea class="hc-input hc-textarea hc-edit__box" rows="' + rows + '" ' +
          'data-edit-field="' + esc(entry.slot) + '" ' +
          'maxlength="' + MAX_LENGTH + '" ' +
          (busy ? 'disabled ' : '') +
          'autocomplete="off" spellcheck="true">' + esc(editing.value) + '</textarea>' +
        '<div class="hc-edit__actions">' +
          '<button type="button" class="hc-btn hc-btn--primary hc-edit__save" ' +
            'data-action="edit-save"' + (busy ? ' disabled' : '') + '>' +
            (busy ? 'Saving…' : 'Save') + '</button>' +
          '<button type="button" class="hc-btn hc-btn--tertiary" ' +
            'data-action="edit-cancel"' + (busy ? ' disabled' : '') + '>Cancel</button>' +
          (entry.resettable && hasOverride(entry.slot)
            ? '<button type="button" class="hc-btn hc-btn--tertiary" ' +
                'data-action="edit-reset"' + (busy ? ' disabled' : '') + '>Reset to original</button>'
            : '') +
        '</div>' +
        '<p class="hc-caption hc-edit__note">Saving changes this for everybody in the app.</p>' +
      '</div>';
  }

  function hasOverride(slot) {
    var list = HC.data.textOverrides || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].slot === slot) return true;
    }
    return false;
  }

  /* The pill above the tab bar, which exists because edit mode can end on its
     own. Something has to say it is on, and it has to be somewhere no screen
     redraws, so it is appended to the body once and shown or hidden from
     here. It is also the fastest way out, which matters more than it sounds:
     the alternative is walking back to Settings -> Admin -> Content to press
     a switch you can no longer see the effect of. */
  function paintPill() {
    var node = document.getElementById('hc-edit-pill');

    if (!isOn()) {
      if (node) node.remove();
      return;
    }
    if (node) return;

    node = document.createElement('div');
    node.id = 'hc-edit-pill';
    node.className = 'hc-edit-pill';
    node.setAttribute('role', 'status');
    node.innerHTML =
      '<span class="hc-edit-pill__text">Edit mode. Tap any outlined text.</span>' +
      '<button type="button" class="hc-edit-pill__done" data-action="edit-mode-off">Done</button>';
    document.body.appendChild(node);
  }

  /* ------------------------------------------------------------- editing */

  function open(slot) {
    var entry = known(slot);
    if (!entry || !isOn()) return false;
    touch();
    editing = { slot: slot, value: entry.value, busy: false };
    return true;
  }

  function cancel() {
    editing = null;
  }

  // Every keystroke. Draws nothing, for the reason in the header.
  function setValue(text) {
    if (!editing) return;
    editing.value = String(text == null ? '' : text);
    touch();
  }

  function editingSlot() {
    return editing ? editing.slot : '';
  }

  function isEditing(slot) {
    return !!(editing && editing.slot === slot);
  }

  function busy() {
    return !!(editing && editing.busy);
  }

  /* ------------------------------------------------------------- writing */

  /* Both writes go through js/auth.js like every other admin write, so they
     carry the session and are judged by the policies in 0030 rather than by
     anything this file believes about who is holding the phone. */
  function writeCopy(slot, value) {
    return HC.auth.restFetch('/text_overrides', {
      method: 'POST',
      headers: {
        // Upsert. A slot is written far more often than it is created, and
        // asking the app to know which one this is would mean a read first.
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: { slot: slot, value: value }
    });
  }

  function writeRow(entry, value) {
    var patch = {};
    patch[entry.column] = value;
    return HC.auth.restFetch('/' + entry.table +
      '?id=eq.' + encodeURIComponent(entry.id), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: patch
    });
  }

  /* Put the new words on screen now rather than when the next content sync
     lands. The refresh that follows is what makes it true everywhere else;
     this is what makes it true here, immediately, which is the difference
     between a save that feels like it worked and one that feels like it
     might not have. */
  function applyLocally(entry, value) {
    if (entry.kind === 'row') {
      if (entry.target && entry.field) entry.target[entry.field] = value;
      entry.value = value;
      return;
    }
    var list = HC.data.textOverrides || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].slot === entry.slot) {
        list[i].value = value;
        entry.value = value;
        return;
      }
    }
    list.push({ slot: entry.slot, value: value });
    entry.value = value;
  }

  function forgetLocally(slot) {
    var list = HC.data.textOverrides || [];
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] && list[i].slot === slot) list.splice(i, 1);
    }
  }

  /* Save, and hand back a promise so js/app.js can repaint and say something
     human either way. A failure deliberately leaves `editing` exactly as it
     was, words and all: a bad connection should cost a second attempt, not
     the sentence somebody just wrote. */
  function save() {
    if (!editing || editing.busy) return Promise.resolve(false);
    var entry = known(editing.slot);
    if (!entry) return Promise.resolve(false);

    var value = String(editing.value == null ? '' : editing.value).trim();
    if (value.length > MAX_LENGTH) {
      return Promise.reject(new Error('That is longer than this space can hold. ' +
        'Try a shorter sentence, or write it as a page in Admin.'));
    }
    if (entry.kind === 'row' && !value) {
      return Promise.reject(new Error('This one cannot be left empty. ' +
        'Rewrite it, or take the whole item down from Admin.'));
    }

    editing.busy = true;
    touch();

    var write = entry.kind === 'row' ? writeRow(entry, value) : writeCopy(entry.slot, value);

    return write.then(function () {
      applyLocally(entry, value);
      editing = null;
      // Confirms what the tables actually hold, and updates the cache every
      // other phone reads on its next cold start.
      if (HC.content && HC.content.refresh) HC.content.refresh();
      return true;
    }).catch(function (err) {
      if (editing) editing.busy = false;
      throw err;
    });
  }

  /* Back to the words that shipped in the app. Only ever offered for a source
     string, and it is a delete rather than a write of the original, so the
     app's own copy stays the one source of that sentence. */
  function reset() {
    if (!editing || editing.busy) return Promise.resolve(false);
    var entry = known(editing.slot);
    if (!entry || !entry.resettable) return Promise.resolve(false);

    editing.busy = true;
    touch();

    return HC.auth.restFetch('/text_overrides?slot=eq.' + encodeURIComponent(entry.slot), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }).then(function () {
      forgetLocally(entry.slot);
      editing = null;
      if (HC.content && HC.content.refresh) HC.content.refresh();
      return true;
    }).catch(function (err) {
      if (editing) editing.busy = false;
      throw err;
    });
  }

  HC.edit = {
    start: start,
    available: available,
    isOn: isOn,
    enable: enable,
    disable: disable,
    toggle: toggle,
    touch: touch,
    idleFor: idleFor,

    beginRender: beginRender,
    wrap: wrap,

    open: open,
    cancel: cancel,
    setValue: setValue,
    isEditing: isEditing,
    editingSlot: editingSlot,
    busy: busy,
    save: save,
    reset: reset,

    // Test seams. Nothing in the app calls these.
    _slots: function () { return slots; },
    _idleMs: IDLE_MS
  };

})(window.HC = window.HC || {});
