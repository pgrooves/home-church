/* ===========================================================================
   Get notified, driven.

   WHY THIS IS A BROWSER AND NOT A UNIT TEST. tests/reminders.test.js already
   asks the arithmetic every question that can be answered without a page:
   what the default is, what the presets are, whether the id is stable. None
   of that is what goes wrong with this feature. What goes wrong is the four
   steps between a thumb and a scheduled notification, and every one of them
   fails silently:

     the button is not drawn     It is drawn only where the phone can actually
                                 hold a reminder, which is one condition in
                                 js/components.js reading a function in
                                 js/native.js. Get that wrong and the Cal tab
                                 looks exactly as it did before this existed.

     the sheet does not open     A handler name that does not match the
                                 data-action on the button is a tap that does
                                 nothing at all, and nothing in the console.

     the day and time are lost   The two boxes write into a `pick` object
                                 through the delegated 'input' and 'change'
                                 listeners in js/app.js. A missed wire means
                                 Remind me schedules the default rather than
                                 what somebody picked, which looks like it
                                 worked and is wrong by a day.

     nothing is scheduled        The record and the notification are two
                                 different things and either can exist without
                                 the other. A button that says "Reminding you
                                 Friday" over a queue with nothing in it is
                                 the failure this whole feature is about.

   HOW A BROWSER PRETENDS TO BE A PHONE. There is no Capacitor here, so this
   installs one before any of the app's own scripts run: an isNativePlatform
   that says yes and a LocalNotifications that grants permission and keeps
   what it is handed in an array. That array is the assertion. Everything
   above it — the button, the sheet, the boxes, the handlers, the record — is
   the real app, unmodified.

   No database and no network. Same terms as alpha.js and swipe.js beside it.

     node tests/e2e/reminders.js
     sh tests/e2e/run.sh            runs this with the rest of them
   =========================================================================== */
'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pastTheGate = require('./past-the-gate');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.HC_REMIND_PORT || 8244);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

/* Same resolver as the tests beside this, for the same reason: playwright-core
   ships no browser of its own. */
function chrome() {
  if (process.env.HC_E2E_CHROME) return process.env.HC_E2E_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort();
    for (let i = dirs.length - 1; i >= 0; i--) {
      const exe = path.join(root, dirs[i], 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
    return null;
  } catch (e) { return null; }
}

let pass = 0, fail = 0;
const ok = (label, good, detail) => {
  if (good) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + (detail ? '\n        ' + detail : '')); fail++; }
};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not here'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

/* A phone, as far as js/native.js is concerned. Installed with addInitScript
   so it is on the window before js/native.js reads it, which is the only
   moment that matters: canRemind() is asked while the Cal tab is drawing. */
const PRETEND_PHONE = () => {
  const queue = [];
  window.__hcQueue = queue;

  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      LocalNotifications: {
        checkPermissions: () => Promise.resolve({ display: 'granted' }),
        requestPermissions: () => Promise.resolve({ display: 'granted' }),
        schedule: (opts) => {
          (opts.notifications || []).forEach((note) => {
            // iOS replaces rather than duplicates on a repeated id, and the
            // whole of "changing a reminder" depends on that being true.
            const at = queue.findIndex(n => n.id === note.id);
            const kept = {
              id: note.id,
              title: note.title,
              body: note.body,
              at: note.schedule.at.getTime(),
              extra: note.extra
            };
            if (at > -1) queue[at] = kept; else queue.push(kept);
          });
          return Promise.resolve();
        },
        cancel: (opts) => {
          (opts.notifications || []).forEach((note) => {
            const at = queue.findIndex(n => n.id === note.id);
            if (at > -1) queue.splice(at, 1);
          });
          return Promise.resolve();
        },
        getPending: () => Promise.resolve({
          notifications: queue.map(n => ({ id: n.id }))
        }),
        addListener: () => ({ remove: () => {} })
      }
    }
  };
};

(async () => {
  const exe = chrome();
  const server = await serve();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const noise = [];
  page.on('pageerror', e => noise.push('pageerror: ' + String(e)));
  page.on('console', m => {
    const text = m.text();
    // No Supabase is reachable from here, so the content fetch fails and says
    // so. That is the app working as designed.
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(text)) {
      noise.push('console: ' + text);
    }
  });

  await page.addInitScript(PRETEND_PHONE);
  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page.waitForFunction(() => window.HC && window.HC.data && window.HC.router, null,
    { timeout: 15000 });
  await pastTheGate(page);
  await page.waitForTimeout(600);

  /* One event, a fortnight out, put in from here rather than taken from the
     seed. The seed's dates are real dates the church published, so a test
     written against them passes until the day they go by. */
  await page.evaluate(() => {
    const at = new Date();
    at.setDate(at.getDate() + 14);
    const iso = at.getFullYear() + '-' +
      ('0' + (at.getMonth() + 1)).slice(-2) + '-' + ('0' + at.getDate()).slice(-2);
    window.__hcEventDay = iso;
    window.HC.data.events.length = 0;
    window.HC.data.events.push({
      id: 'event-e2e-serve',
      title: 'City Serve Day',
      date: iso,
      time: '8:00 AM',
      location: 'Meet at the church',
      blurb: 'One Saturday, four sites, everybody works.'
    });
    window.HC.router.go({ name: 'cal' }, { force: true });
  });
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------- the button */

  ok('the Cal tab draws', await page.evaluate(() => !!document.querySelector('.hc-cal')));

  const buttons = await page.evaluate(() => {
    const row = document.querySelector('.hc-event .hc-event__action');
    if (!row) return null;
    return Array.prototype.map.call(row.querySelectorAll('button'), b => ({
      action: b.getAttribute('data-action'),
      text: b.textContent.trim()
    }));
  });

  ok('an event carries two offers, not one', !!buttons && buttons.length === 2,
    JSON.stringify(buttons));
  ok('and Add to calendar is still the first of them',
    !!buttons && buttons[0].action === 'add-to-calendar', JSON.stringify(buttons));
  ok('with Get notified beside it',
    !!buttons && buttons[1].action === 'event-remind' &&
    buttons[1].text === 'Get notified', JSON.stringify(buttons));

  /* ----------------------------------------------------------- the sheet */

  await page.click('[data-action="event-remind"]');
  await page.waitForTimeout(300);

  ok('tapping it opens a sheet',
    await page.evaluate(() => !!document.querySelector('[data-sheet="remind"]')));

  const opened = await page.evaluate(() => ({
    day: document.querySelector('[data-remind="date"]').value,
    time: document.querySelector('[data-remind="time"]').value,
    presets: Array.prototype.map.call(
      document.querySelectorAll('[data-action="remind-preset"]'),
      b => b.getAttribute('data-id') + ':' + b.getAttribute('aria-pressed')),
    title: document.querySelector('.hc-sheet__preview').textContent.trim()
  }));

  ok('it says which event it is asking about',
    opened.title === 'City Serve Day', opened.title);

  /* The day before, at the event's own time, which is the whole promise of
     the button. Worked out from the event's day rather than written down,
     because the event's day is worked out from today. */
  const eventDay = await page.evaluate(() => window.__hcEventDay);
  const dayBefore = (() => {
    const parts = eventDay.split('-');
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) +
      '-' + ('0' + d.getDate()).slice(-2);
  })();

  ok('and it opens on the day before the event', opened.day === dayBefore,
    opened.day + ' want ' + dayBefore);
  ok('at the time the event starts', opened.time === '08:00', opened.time);
  ok('with the day before showing as the one chosen',
    opened.presets[0] === 'day-before:true', JSON.stringify(opened.presets));

  /* ------------------------------------------------------- editing it

     The whole point of the sheet. A default nobody can change is a default
     that is wrong for everybody it is wrong for. */

  await page.fill('[data-remind="time"]', '18:30');
  await page.waitForTimeout(150);

  const afterTyping = await page.evaluate(() =>
    Array.prototype.map.call(
      document.querySelectorAll('[data-action="remind-preset"]'),
      b => b.getAttribute('aria-pressed')));
  ok('changing the time puts the preset out',
    afterTyping.every(v => v === 'false'), JSON.stringify(afterTyping));

  await page.click('[data-action="remind-save"]');
  await page.waitForTimeout(400);

  ok('saving closes the sheet',
    await page.evaluate(() => !document.querySelector('[data-sheet="remind"]')));

  const queued = await page.evaluate(() => window.__hcQueue.slice());
  ok('and one notification is actually scheduled', queued.length === 1,
    JSON.stringify(queued));

  const when = queued[0] ? new Date(queued[0].at) : null;
  ok('for the evening that was typed, not the default',
    !!when && when.getHours() === 18 && when.getMinutes() === 30,
    when ? String(when) : 'nothing scheduled');
  ok('on the day before the event',
    !!when && when.getFullYear() + '-' + ('0' + (when.getMonth() + 1)).slice(-2) +
      '-' + ('0' + when.getDate()).slice(-2) === dayBefore,
    when ? String(when) : 'nothing scheduled');
  ok('carrying the event’s name, so the lock screen says what it is about',
    !!queued[0] && queued[0].title === 'City Serve Day',
    JSON.stringify(queued[0]));
  ok('and when and where in the body',
    !!queued[0] && /8:00 AM/.test(queued[0].body) &&
      /Meet at the church/.test(queued[0].body),
    queued[0] ? queued[0].body : '');
  ok('and the event id, so tapping it opens the right day',
    !!queued[0] && queued[0].extra && queued[0].extra.event === 'event-e2e-serve',
    JSON.stringify(queued[0] && queued[0].extra));

  /* ------------------------------------------------- what the button says */

  const label = await page.evaluate(() => {
    const b = document.querySelector('[data-action="event-remind"]');
    return b ? b.textContent.trim() : null;
  });
  ok('the button now reports the reminder rather than offering one',
    !!label && /^Reminding you /.test(label) && /6:30 PM$/.test(label), String(label));

  /* --------------------------------------------------------- changing it

     Reopening has to come back with the time that was set, not with the
     default again, and saving has to replace the queued notification rather
     than add a second one. */

  await page.click('[data-action="event-remind"]');
  await page.waitForTimeout(300);

  const reopened = await page.evaluate(() => ({
    time: document.querySelector('[data-remind="time"]').value,
    off: !!document.querySelector('[data-action="remind-clear"]')
  }));
  ok('reopening comes back with the time that was set', reopened.time === '18:30',
    reopened.time);
  ok('and offers a way to turn it off', reopened.off);

  await page.click('[data-action="remind-preset"][data-id="hour-before"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="remind-save"]');
  await page.waitForTimeout(400);

  const changed = await page.evaluate(() => window.__hcQueue.slice());
  ok('changing it replaces the notification rather than adding one',
    changed.length === 1, JSON.stringify(changed));
  ok('and the new one is an hour before the event',
    !!changed[0] && new Date(changed[0].at).getHours() === 7 &&
      new Date(changed[0].at).getMinutes() === 0,
    changed[0] ? String(new Date(changed[0].at)) : 'nothing scheduled');

  /* -------------------------------------------------------- turning it off */

  await page.click('[data-action="event-remind"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="remind-clear"]');
  await page.waitForTimeout(400);

  ok('turning it off empties the queue',
    (await page.evaluate(() => window.__hcQueue.length)) === 0);
  ok('and the button is an offer again',
    (await page.evaluate(() => {
      const b = document.querySelector('[data-action="event-remind"]');
      return b ? b.textContent.trim() : null;
    })) === 'Get notified');
  ok('and nothing is left in storage',
    (await page.evaluate(() =>
      JSON.stringify(JSON.parse(localStorage.getItem('hc:reminders') || '{}')))) === '{}');

  /* --------------------------------------------------------- housekeeping

     An event taken off the calendar takes the reminder with it. This is the
     one thing in js/reminders.js that runs without anybody tapping anything,
     and the failure is a notification about a thing that is not happening. */

  await page.click('[data-action="event-remind"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="remind-save"]');
  await page.waitForTimeout(400);
  ok('a reminder set again is queued again',
    (await page.evaluate(() => window.__hcQueue.length)) === 1);

  await page.evaluate(() => {
    // The church takes it down, and something else takes its place so the
    // list is not empty: an empty list is not the same claim as "this event
    // is gone", and sweep() is written to know the difference.
    window.HC.data.events.length = 0;
    window.HC.data.events.push({
      id: 'event-e2e-other', title: 'Something else',
      date: window.__hcEventDay, time: '9:00 AM', location: '', blurb: ''
    });
    return window.HC.reminders.sweep();
  });
  await page.waitForTimeout(300);

  ok('an event taken off the calendar takes its reminder with it',
    (await page.evaluate(() => window.__hcQueue.length)) === 0);
  ok('and the record goes with it',
    (await page.evaluate(() =>
      JSON.stringify(JSON.parse(localStorage.getItem('hc:reminders') || '{}')))) === '{}');

  ok('nothing threw along the way', noise.length === 0, noise.join('\n        '));

  await browser.close();
  server.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
