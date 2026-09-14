/* ===========================================================================
   Add to calendar, the first button under every event on the Cal tab.

   WHY THIS FILE EXISTS. The button shipped doing the wrong thing on a phone
   and the right thing everywhere else, which is the worst shape a bug can
   have: it worked in a browser, it worked in the simulator's browser, it
   worked for anybody testing the site, and in the packaged TestFlight build
   it put up the send-to sheet — AirDrop, Messages, Mail, Save to Files — with
   no way anywhere on it to put the event on a calendar. Nothing threw.
   Somebody had to tap it on a real phone to find out.

   The difference is one word. Sharing a file asks which app or person to send
   it to, and Calendar is not an app you send a file to. Opening a file asks
   iOS to show it, and iOS knows what an .ics is: the event comes up with an
   Add on it. So js/native.js hands the written file to the file opener, and
   only falls back to the share sheet when that plugin is not in the build.

   Three things are worth holding still, and all three are about which road
   the tap takes rather than about what the file says.

   THE FILE OPENER GOES FIRST. If a build has both plugins, and the shipped
   one does, the tap must reach the opener and must not reach Share. That is
   the bug, stated as a test.

   THE SHARE SHEET IS STILL THERE UNDERNEATH. A native build made without the
   opener plugin — somebody's older checkout, an `npx cap sync` that did not
   run — should degrade to the sheet that shipped before rather than to a
   button that does nothing at all.

   AND A BROWSER STILL DOWNLOADS. No Capacitor, no plugins, an anchor and a
   blob, which is the road that was always working.

   No browser and no phone. Same shape as tests/reminders.test.js: js/native.js
   runs in a VM, window.Capacitor.Plugins is whichever fakes the case under
   test calls for, and each fake records that it was called so the test can ask
   which road was taken.
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

/* js/native.js asks nothing of the DOM until something is shared, and the
   browser road asks for exactly one anchor. `calls` is handed back alongside
   HC so a test can read what the fakes saw. */
function load(plugins) {
  const calls = { write: [], open: [], share: [], anchors: [], toasts: [] };

  const anchor = {
    click: function () { calls.anchors.push(this.download); },
    addEventListener: function () {},
    set href(v) {}, get href() { return ''; },
    download: ''
  };

  const sandbox = {
    window: {
      console: console,
      Blob: function (parts, opts) { this.parts = parts; this.type = opts && opts.type; },
      URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
      setTimeout: () => 0
    },
    document: {
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: () => anchor,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    navigator: {}
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  sandbox.window.navigator = sandbox.navigator;
  sandbox.Blob = sandbox.window.Blob;
  sandbox.URL = sandbox.window.URL;
  sandbox.document = sandbox.document;

  if (plugins) {
    sandbox.window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: plugins(calls)
    };
  }

  vm.createContext(sandbox);
  ['data.js', 'store.js', 'components.js', 'native.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  });

  // Toasts are the one thing native.js says out loud, and no case here wants
  // one. Stubbed after loading so components.js keeps its own shape.
  sandbox.window.HC.components.toast = function (msg) { calls.toasts.push(msg); };

  return { HC: sandbox.window.HC, calls: calls };
}

function filesystem(calls) {
  return {
    writeFile: function (opts) {
      calls.write.push({ path: opts.path, directory: opts.directory, encoding: opts.encoding });
      return Promise.resolve({ uri: 'file:///cache/' + opts.path });
    }
  };
}

function share(calls) {
  return {
    share: function (opts) { calls.share.push(opts); return Promise.resolve(); }
  };
}

function fileOpener(calls, behaviour) {
  return {
    open: function (opts) {
      calls.open.push(opts);
      return behaviour === 'reject'
        ? Promise.reject(new Error('no app can open this'))
        : Promise.resolve();
    }
  };
}

const EVENT = {
  title: 'Baby Blessing, September 20',
  description: 'All three services. Come early, sit anywhere.',
  location: '4640 Utica St, Metairie',
  start: new Date('2026-09-20T14:00:00Z')
};

/* --------------------------------------------- the phone opens the file */

(function () {
  const { HC, calls } = load(function (calls) {
    return {
      Filesystem: filesystem(calls),
      Share: share(calls),
      FileOpener: fileOpener(calls),
      Haptics: { impact: function () {} }
    };
  });

  return HC.native.addToCalendar(EVENT).then(function (result) {
    ok('a phone with the opener plugin says the event got somewhere', result, true);
    ok('the .ics is written to the cache first',
      calls.write.map(w => [w.path, w.directory, w.encoding]),
      [['baby-blessing-september-20.ics', 'CACHE', 'utf8']]);
    ok('and handed to the file opener, not the share sheet',
      calls.open.map(o => [o.filePath, o.contentType, o.openWithDefault]),
      [['file:///cache/baby-blessing-september-20.ics', 'text/calendar', true]]);
    ok('THE SHARE SHEET IS NEVER OPENED, which is the whole bug',
      calls.share.length, 0);
    ok('and nothing is apologised for', calls.toasts, []);
  })

  /* ------------------------- a native build without the opener plugin */

  .then(function () {
    const { HC, calls } = load(function (calls) {
      return { Filesystem: filesystem(calls), Share: share(calls) };
    });

    return HC.native.addToCalendar(EVENT).then(function (result) {
      ok('a build without the opener still gets the file off the phone', result, true);
      ok('by way of the share sheet, on the file it already wrote',
        calls.share.map(s => s.url),
        ['file:///cache/baby-blessing-september-20.ics']);
      ok('and it writes that file exactly once', calls.write.length, 1);
    });
  })

  /* ----------------- the opener is there and iOS turns the file down */

  .then(function () {
    const { HC, calls } = load(function (calls) {
      return {
        Filesystem: filesystem(calls),
        Share: share(calls),
        FileOpener: fileOpener(calls, 'reject')
      };
    });

    return HC.native.addToCalendar(EVENT).then(function (result) {
      ok('an opener that refuses falls through to the sheet', result, true);
      ok('having tried the opener first', calls.open.length, 1);
      ok('and the sheet gets the same one written file',
        calls.share.map(s => s.url),
        ['file:///cache/baby-blessing-september-20.ics']);
    });
  })

  /* ------------------------------------------------------- a browser */

  .then(function () {
    const { HC, calls } = load(null);

    return HC.native.addToCalendar(EVENT).then(function (result) {
      ok('a browser downloads the .ics, as it always did', result, true);
      ok('through an anchor named after the event',
        calls.anchors, ['baby-blessing-september-20.ics']);
      ok('with no filesystem and no plugins touched',
        [calls.write.length, calls.open.length, calls.share.length], [0, 0, 0]);
    });
  })

  /* ------------------------------- and the file itself is still an .ics */

  .then(function () {
    const { HC } = load(null);
    const ics = HC.native.buildIcs(EVENT);

    ok('the file is a one event calendar',
      [ics.indexOf('BEGIN:VCALENDAR') === 0, /END:VCALENDAR$/.test(ics)], [true, true]);
    ok('with the event on it',
      ics.indexOf('SUMMARY:Baby Blessing\\, September 20') > -1, true);
    ok('and CRLF between its lines, which strict clients insist on',
      ics.indexOf('\r\n') > -1 && ics.indexOf('\n\n') === -1, true);
  })

  .then(function () {
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
  });
})();
