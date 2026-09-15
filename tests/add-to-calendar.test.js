/* ===========================================================================
   Add to calendar, the first button under every event on the Cal tab.

   WHY THIS FILE EXISTS. This button has been wrong twice, both times only on
   a phone, both times silently, and both times it took somebody tapping it on
   a real device to find out. That is the worst shape a bug can have and it is
   the reason this file is as long as it is.

   THE FIRST WRONG ROAD was Share.share() on the .ics: the send-to sheet, with
   AirDrop and Messages and Mail on it and nothing that adds an event, because
   Calendar is not an app you send a file to.

   THE SECOND WRONG ROAD looked like the fix and was not. The file was handed
   to a document interaction controller, on the reasoning that iOS knows what
   an .ics is. It does — it drew the event, the day around it, the notes. What
   it drew was QuickLook, whose job is to show a document and whose buttons
   are Close and Share. No Add. Safari's version of that same screen has an
   Add To Calendar across the bottom, because Safari special cases calendar
   files, and QuickLook does not.

   THE ROAD THAT WORKS is EKEventEditViewController, the sheet iOS itself puts
   up for a new event, filled in, with Add and Cancel on it. So what this file
   holds still is which road a tap takes, because both wrong answers were one
   plugin call away from the right one and neither of them threw.

   THE SHEET GOES FIRST. If the calendar plugin is in the build, the tap must
   reach it and must not reach Share. That is both bugs, stated as one test.

   CANCEL IS NOT A FAILURE. The sheet opening is the whole of what this app
   promises. Somebody who reads the event and changes their mind has been
   served, and the caller must not apologise to them — it toasts on false, so
   a cancel that answered false would put "could not open your calendar" on
   screen right after their own decision.

   THE SHARE SHEET IS STILL THERE UNDERNEATH, for a native build made without
   the plugin — an older checkout, an `npx cap sync` that did not run.
   Degrading to what shipped before beats a button that does nothing, and
   `npm run preflight` fails on that build before it ships.

   AND A BROWSER STILL DOWNLOADS, which is the road that was right all along.

   THE TWO ROADS AGREE ABOUT THE HOUR. The sheet is filled from the same
   start and end the .ics is written from, because two roads disagreeing by an
   hour is a difference nobody would notice until two people compared phones.

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
  const calls = { sheet: [], write: [], share: [], anchors: [], toasts: [] };

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

/* The system New Event sheet. `outcome` is what the person did with it:
   'saved' hands back an id, 'canceled' hands back null — which is what the
   plugin does on iOS — and 'reject' is the sheet never opening at all. */
function calendar(calls, outcome) {
  return {
    createEventWithPrompt: function (opts) {
      calls.sheet.push(opts);
      if (outcome === 'reject') return Promise.reject(new Error('no sheet'));
      return Promise.resolve({ id: outcome === 'canceled' ? null : 'ek-1' });
    }
  };
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

const START = new Date('2026-09-20T14:00:00Z');
const EVENT = {
  title: 'Baby Blessing, September 20',
  description: 'All three services. Come early, sit anywhere.',
  location: '4640 Utica St, Metairie',
  start: START
};

/* ------------------------------------------- the phone puts up the sheet */

(function () {
  const { HC, calls } = load(function (calls) {
    return {
      CapacitorCalendar: calendar(calls, 'saved'),
      Filesystem: filesystem(calls),
      Share: share(calls),
      Haptics: { impact: function () {} }
    };
  });

  return HC.native.addToCalendar(EVENT).then(function (result) {
    ok('a phone with the calendar plugin says the sheet opened', result, true);
    ok('the event is handed over filled in',
      calls.sheet.map(s => [s.title, s.location, s.description]),
      [['Baby Blessing, September 20',
        '4640 Utica St, Metairie',
        'All three services. Come early, sit anywhere.']]);
    ok('with the start the Cal tab gave it, in milliseconds',
      calls.sheet[0].startDate, START.getTime());
    ok('and an hour assumed for an event with no end',
      calls.sheet[0].endDate - calls.sheet[0].startDate, 60 * 60 * 1000);
    ok('NO SHARE SHEET, which was the first bug', calls.share.length, 0);
    ok('AND NO FILE WRITTEN, which was the second', calls.write.length, 0);
    ok('and nothing is apologised for', calls.toasts, []);
  })

  /* ------------------------------------------------- cancel is an answer */

  .then(function () {
    const { HC, calls } = load(function (calls) {
      return {
        CapacitorCalendar: calendar(calls, 'canceled'),
        Filesystem: filesystem(calls),
        Share: share(calls)
      };
    });

    return HC.native.addToCalendar(EVENT).then(function (result) {
      ok('somebody who taps Cancel is not told anything went wrong', result, true);
      ok('and is not handed a share sheet as a consolation prize',
        [calls.share.length, calls.write.length], [0, 0]);
    });
  })

  /* --------------------- an end the church actually gave, carried across */

  .then(function () {
    const { HC, calls } = load(function (calls) {
      return { CapacitorCalendar: calendar(calls, 'saved') };
    });

    const end = new Date('2026-09-20T16:30:00Z');
    return HC.native.addToCalendar(Object.assign({}, EVENT, { end: end }))
      .then(function () {
        ok('a real end time is used rather than the assumed hour',
          calls.sheet[0].endDate, end.getTime());
      });
  })

  /* ------------------- and the .ics agrees with the sheet about the hour */

  .then(function () {
    const { HC, calls } = load(function (calls) {
      return { CapacitorCalendar: calendar(calls, 'saved') };
    });

    return HC.native.addToCalendar(EVENT).then(function () {
      const ics = HC.native.buildIcs(EVENT);
      const stamp = (ms) => new Date(ms).toISOString()
        .replace(/[-:]/g, '').replace(/\.\d{3}/, '');

      ok('DTSTART is the same moment the sheet was given',
        ics.indexOf('DTSTART:' + stamp(calls.sheet[0].startDate)) > -1, true);
      ok('and so is DTEND',
        ics.indexOf('DTEND:' + stamp(calls.sheet[0].endDate)) > -1, true);
    });
  })

  /* ----------------------- a native build without the calendar plugin */

  .then(function () {
    const { HC, calls } = load(function (calls) {
      return { Filesystem: filesystem(calls), Share: share(calls) };
    });

    return HC.native.addToCalendar(EVENT).then(function (result) {
      ok('a build without the plugin still gets the file off the phone', result, true);
      ok('by way of the share sheet, as it did before', calls.share.length, 1);
      ok('on an .ics named after the event',
        calls.write.map(w => [w.path, w.directory, w.encoding]),
        [['baby-blessing-september-20.ics', 'CACHE', 'utf8']]);
    });
  })

  /* --------------------- the plugin is there and the sheet refuses to open */

  .then(function () {
    const { HC, calls } = load(function (calls) {
      return {
        CapacitorCalendar: calendar(calls, 'reject'),
        Filesystem: filesystem(calls),
        Share: share(calls)
      };
    });

    return HC.native.addToCalendar(EVENT).then(function (result) {
      ok('a sheet that will not open falls through to the share sheet', result, true);
      ok('having tried the sheet first', calls.sheet.length, 1);
      ok('and the share sheet gets the file', calls.share.length, 1);
    });
  })

  /* ------------------------------------------------------------ a browser */

  .then(function () {
    const { HC, calls } = load(null);

    return HC.native.addToCalendar(EVENT).then(function (result) {
      ok('a browser downloads the .ics, as it always did', result, true);
      ok('through an anchor named after the event',
        calls.anchors, ['baby-blessing-september-20.ics']);
      ok('with no plugin touched anywhere',
        [calls.sheet.length, calls.write.length, calls.share.length], [0, 0, 0]);
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
