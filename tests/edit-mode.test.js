/* ===========================================================================
   Edit mode, the parts that are not about how it looks.

   WHAT IS WORTH TESTING HERE. Edit mode writes to the church's live content
   from a phone, with no draft state and no publish step, so the questions
   this file asks are the ones whose wrong answers are loud: does a save send
   only the column it said it would, does a failed save keep the words
   somebody typed, does the thing turn itself off, and does a phone that has
   never reached Supabase still draw real sentences.

   The security half is not here and cannot be. "A member cannot write this"
   is a claim about policies, and it is asserted as a real member against a
   real database in supabase/tests/0030_text_overrides_test.sql. Nothing in
   this file is a security boundary and nothing in js/edit-mode.js is either.

   No browser. jsdom is not a dependency of this project and is not going to
   become one, so the handful of DOM calls edit-mode.js makes are faked below,
   the way tests/announcements.test.js fakes localStorage.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};
const okTrue = (label, got) => ok(label, !!got, true);

/* --------------------------------------------------------------- the fakes */

const RealDate = Date;

/* Every request js/edit-mode.js makes, in order, and whatever we told it to
   answer. `fail` makes the next call reject, which is how the offline path is
   tested without an offline. */
function fakeAuth() {
  const calls = [];
  const api = {
    calls: calls,
    fail: null,
    restFetch: function (pathname, opts) {
      calls.push({ path: pathname, opts: opts || {} });
      if (api.fail) {
        const err = api.fail;
        api.fail = null;
        return Promise.reject(err);
      }
      return Promise.resolve(null);
    }
  };
  return api;
}

function fakeDom() {
  const body = { children: [], appendChild: n => body.children.push(n) };
  return {
    hidden: false,
    body: body,
    listeners: {},
    addEventListener: function (name, fn) {
      (this.listeners[name] = this.listeners[name] || []).push(fn);
    },
    getElementById: function (id) {
      return body.children.filter(n => n.id === id)[0] || null;
    },
    createElement: function () {
      const node = { id: '', className: '', innerHTML: '', attrs: {} };
      node.setAttribute = (k, v) => { node.attrs[k] = v; };
      node.remove = () => {
        const i = body.children.indexOf(node);
        if (i >= 0) body.children.splice(i, 1);
      };
      return node;
    }
  };
}

function load(opts) {
  opts = opts || {};
  const clock = { now: RealDate.now() };
  const auth = fakeAuth();
  const doc = fakeDom();
  const toasts = [];

  const FakeDate = function (a, b, c) { return new RealDate(a, b, c); };
  FakeDate.now = () => clock.now;

  const sandbox = {
    window: {
      setInterval: () => 1,
      clearInterval: () => {},
      requestAnimationFrame: fn => fn()
    },
    document: doc,
    Date: FakeDate,
    console: console,
    Promise: Promise,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Math: Math,
    isAdmin: opts.admin !== false
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = doc;
  vm.createContext(sandbox);

  ['data.js', 'edit-mode.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  });

  const HC = sandbox.window.HC;

  // The three neighbours edit-mode.js talks to, no more of them than it uses.
  HC.admin = { isAdmin: () => sandbox.isAdmin };
  HC.content = { isConfigured: () => true, refresh: () => Promise.resolve(true) };
  HC.auth = auth;
  HC.components = {
    esc: s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;'),
    icon: () => '<svg></svg>',
    toast: m => toasts.push(m)
  };

  return { HC: HC, auth: auth, doc: doc, clock: clock, toasts: toasts, sandbox: sandbox };
}

/* A sentence in a source file and the descriptor a screen would pass. */
const NOTE = 'Opens Overflow in your browser.';
const noteDesc = () => ({
  slot: 'give.note',
  value: NOTE,
  label: 'the line under the Give button'
});

/* ------------------------------------------------------------- the floor --- */

{
  const { HC } = load();

  ok('with no override, a slot reads the words in the app',
    HC.data.copy('give.note', NOTE), NOTE);

  HC.data.textOverrides.push({ slot: 'give.note', value: 'Opens Overflow. Card or bank.' });
  ok('an override wins over the words in the app',
    HC.data.copy('give.note', NOTE), 'Opens Overflow. Card or bank.');

  HC.data.textOverrides[0].value = '';
  ok('an override cleared to nothing is honored rather than falling back',
    HC.data.copy('give.note', NOTE), '');

  ok('an unrelated slot is unaffected',
    HC.data.copy('listen.empty', 'Nothing yet.'), 'Nothing yet.');
}

/* --------------------------------------------------------------- drawing --- */

{
  const { HC } = load();
  const drawn = '<p class="hc-caption">' + NOTE + '</p>';

  ok('off, wrap draws exactly what the screen handed it',
    HC.edit.wrap(drawn, noteDesc()), drawn);
  okTrue('and the slot is registered anyway, so turning it on needs no redraw',
    HC.edit._slots()['give.note']);

  HC.edit.enable();
  const outlined = HC.edit.wrap(drawn, noteDesc());
  okTrue('on, the sentence is outlined', outlined.indexOf('hc-editable') > -1);
  okTrue('and it is a tap target that says what it edits',
    outlined.indexOf('data-action="edit-open"') > -1 &&
    outlined.indexOf('aria-label="Edit the line under the Give button"') > -1);
  okTrue('and the words are still inside it', outlined.indexOf(NOTE) > -1);

  HC.edit.open('give.note');
  const box = HC.edit.wrap(drawn, noteDesc());
  okTrue('tapping it draws a box holding the sentence',
    box.indexOf('<textarea') > -1 && box.indexOf(NOTE) > -1);
  okTrue('with Save and Cancel',
    box.indexOf('data-action="edit-save"') > -1 &&
    box.indexOf('data-action="edit-cancel"') > -1);
  ok('and no reset, because nothing has been overridden yet',
    box.indexOf('data-action="edit-reset"') > -1, false);

  HC.data.textOverrides.push({ slot: 'give.note', value: 'Something else.' });
  okTrue('once there is an override, reset is offered',
    HC.edit.wrap(drawn, noteDesc()).indexOf('data-action="edit-reset"') > -1);

  ok('a sentence the church cleared draws nothing when edit mode is off',
    (HC.edit.disable(), HC.edit.wrap('', noteDesc())), '');
  HC.edit.enable();
  okTrue('and a way back to it when edit mode is on',
    HC.edit.wrap('', noteDesc()).indexOf('hc-editable__empty') > -1);
}

/* ------------------------------------------------------ saving a sentence --- */

{
  const { HC, auth } = load();
  HC.edit.enable();
  HC.edit.wrap('<p>' + NOTE + '</p>', noteDesc());
  HC.edit.open('give.note');
  HC.edit.setValue('  Opens Overflow. Card, bank, or stock.  ');

  HC.edit.save().then(function (saved) {
    okTrue('a source string saves', saved);
    ok('as an upsert into text_overrides', auth.calls[0].path, '/text_overrides');
    ok('carrying the slot and the trimmed words', auth.calls[0].opts.body,
      { slot: 'give.note', value: 'Opens Overflow. Card, bank, or stock.' });
    okTrue('as an upsert rather than an insert that fails the second time',
      /merge-duplicates/.test(auth.calls[0].opts.headers.Prefer));
    ok('the box closes', HC.edit.editingSlot(), '');
    ok('and the app reads the new words immediately',
      HC.data.copy('give.note', NOTE), 'Opens Overflow. Card, bank, or stock.');
  });
}

/* ------------------------------------------------------------ saving a row --- */

{
  const { HC, auth } = load();
  const step = { id: 'step-baptism', title: 'I want to be baptized', blurb: 'The next one is August 23.' };
  HC.edit.enable();
  HC.edit.wrap('<p>' + step.blurb + '</p>', {
    table: 'next_steps', id: step.id, column: 'blurb',
    target: step, field: 'blurb', value: step.blurb, label: 'the description'
  });

  const slot = 'next_steps:step-baptism:blurb';
  okTrue('a row gets a slot derived from where it lives', HC.edit._slots()[slot]);

  HC.edit.open(slot);
  HC.edit.setValue('The next one is November 2.');
  HC.edit.save().then(function () {
    ok('a row saves as a patch of its own row',
      auth.calls[0].path, '/next_steps?id=eq.step-baptism');
    ok('and sends nothing but the one column', auth.calls[0].opts.body,
      { blurb: 'The next one is November 2.' });
    ok('the sentence on screen changes under the thumb',
      step.blurb, 'The next one is November 2.');

    // Emptying a row is not the same act as clearing a caption: there is no
    // fallback underneath it, so it would leave a gap nobody can see to fix.
    // Chained rather than run alongside, because the save above closes the
    // box when it lands and a second edit opened before then would be closed
    // by somebody else's promise.
    HC.edit.open(slot);
    HC.edit.setValue('   ');
    return HC.edit.save().then(
      () => ok('a row cannot be emptied', 'allowed', 'refused'),
      () => { ok('a row cannot be emptied', 'refused', 'refused');
              ok('and the box stays open with the words in it', HC.edit.editingSlot(), slot); }
    );
  });
}

/* -------------------------------------------------- when the save does not --- */

{
  const { HC, auth } = load();
  HC.edit.enable();
  HC.edit.wrap('<p>' + NOTE + '</p>', noteDesc());
  HC.edit.open('give.note');
  HC.edit.setValue('Words somebody just typed.');
  auth.fail = new Error('Offline.');

  HC.edit.save().then(
    () => ok('a failed save is reported as a failure', 'resolved', 'rejected'),
    () => {
      ok('a failed save is reported as a failure', 'rejected', 'rejected');
      ok('the box is still open', HC.edit.editingSlot(), 'give.note');
      ok('the button is live again rather than stuck on Saving', HC.edit.busy(), false);
      okTrue('and the words are still there',
        HC.edit.wrap('<p>x</p>', noteDesc()).indexOf('Words somebody just typed.') > -1);
      ok('nothing was written', HC.data.copy('give.note', NOTE), NOTE);
    }
  );
}

/* --------------------------------------------------------- back to normal --- */

{
  const { HC, auth } = load();
  HC.data.textOverrides.push({ slot: 'give.note', value: 'Something the church tried.' });
  HC.edit.enable();
  HC.edit.wrap('<p>x</p>', noteDesc());
  HC.edit.open('give.note');

  HC.edit.reset().then(function () {
    ok('reset deletes the override rather than writing the original back',
      auth.calls[0].path, '/text_overrides?slot=eq.give.note');
    ok('and it is a delete', auth.calls[0].opts.method, 'DELETE');
    ok('so the app draws its own words again',
      HC.data.copy('give.note', NOTE), NOTE);
  });
}

{
  const { HC } = load();
  const team = { id: 'team-kids', blurb: 'Birth through fifth grade.' };
  HC.edit.enable();
  HC.edit.wrap('<p>x</p>', { table: 'serve_teams', id: team.id, column: 'blurb',
    target: team, field: 'blurb', value: team.blurb, label: 'what the team does' });
  HC.edit.open('serve_teams:team-kids:blurb');

  HC.edit.reset().then(function (done) {
    ok('a row has no original to go back to, so reset does nothing', done, false);
  });
}

/* ------------------------------------------------------------ turning off --- */

{
  const { HC, clock } = load();
  HC.edit.enable();
  okTrue('the switch goes on', HC.edit.isOn());

  clock.now += 29 * 60 * 1000;
  HC.edit.touch();
  clock.now += 29 * 60 * 1000;
  okTrue('working steadily does not run the clock out',
    (HC.edit.idleFor() < HC.edit._idleMs) && HC.edit.isOn());

  clock.now += 2 * 60 * 1000;
  // What the every-thirty-seconds check and the return from the background
  // both run. Thirty-one minutes since the last tap, so it ends.
  HC.edit.disable('idle');
  ok('thirty minutes of nothing turns it off', HC.edit.isOn(), false);
}

{
  const { HC, sandbox, doc } = load();
  HC.edit.enable();
  HC.edit.wrap('<p>x</p>', noteDesc());
  HC.edit.open('give.note');
  HC.edit.disable();
  ok('turning it off closes whatever was open', HC.edit.editingSlot(), '');

  HC.edit.enable();
  sandbox.isAdmin = false;
  ok('and somebody who is no longer an admin is no longer in edit mode',
    HC.edit.isOn(), false);

  // The pill lives outside every screen, so nothing else would take it down
  // when a session ends. The next draw does.
  HC.edit.beginRender();
  ok('and the pill announcing it goes with them', doc.body.children.length, 0);
}

{
  // Edit mode lives in this module and nowhere else, so a fresh load, which
  // is what a cold start is, is a phone with it off. This is the whole
  // implementation of "turns off when you close the app" and it is worth one
  // assertion, because a later change to localStorage would pass every other
  // test in this file.
  const { HC } = load();
  ok('a freshly launched app has edit mode off', HC.edit.isOn(), false);
}

/* --------------------------------------------------------- the registry --- */

{
  const { HC } = load();
  HC.edit.enable();
  HC.edit.wrap('<p>x</p>', noteDesc());
  HC.edit.beginRender();
  ok('a sentence that is no longer drawn cannot be opened',
    HC.edit.open('give.note'), false);
}

/* ------------------------------------------------------------------ done --- */

setTimeout(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) process.exit(1);
}, 50);
