/* ===========================================================================
   The subscribable calendar: supabase/functions/calendar/feed.mjs, and the
   addresses the Subscribe sheet on the Cal tab hands out.

   WHY THIS FILE EXISTS. A subscribed calendar is the one thing in this app
   that goes on changing somebody's phone after they have stopped looking at
   it. When it is wrong it is wrong on every subscriber's phone at once, and
   nobody opens the app to notice. So the decisions that could put an event on
   the wrong day are held still here:

     An evening event in Metairie is the next day in UTC. It has to land on
     the church's day.

     A class on two Sundays is two events, with two UIDs, and the second one
     at the same clock time even across the end of daylight saving.

     "All three services" is a day, not nine in the morning.

     A long blurb is folded at 75 bytes without cutting a character in half.

     A row that cannot be placed is skipped, never a reason to break the feed.

   And the sheet's links: webcal for Apple, the address encoded into Google's
   and Outlook's add pages, and no button at all with no Supabase to point at.

   No network.
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

// A fixed "now" so DTSTAMP is predictable.
const NOW = Date.UTC(2026, 9, 19, 15, 0);

// Every VEVENT in a feed, unfolded, as objects keyed by property name.
function parse(text) {
  const lines = text.replace(/\r\n /g, '').split('\r\n');
  const events = [];
  let cur = null;
  lines.forEach((line) => {
    if (line === 'BEGIN:VEVENT') { cur = {}; return; }
    if (line === 'END:VEVENT') { events.push(cur); cur = null; return; }
    if (!cur) return;
    const at = line.indexOf(':');
    cur[line.slice(0, at)] = line.slice(at + 1);
  });
  return events;
}

function loadApp(config) {
  const sandbox = { window: { console: console } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  sandbox.window.HC = { components: {}, config: config };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'screens', 'cal.js'), 'utf8'), sandbox);
  return sandbox.window.HC.screens.calHelpers;
}

(async function () {
  const F = await import('../supabase/functions/calendar/feed.mjs');

  /* ------------------------------------------------------------ the days */

  // 6:30 PM on Thursday 23 October in Metairie is 23:30 UTC, still the 23rd.
  // 8 PM is 01:00 UTC on the 24th, and the church's day must still be the 23rd.
  ok('an evening event is on the church\'s day, not the UTC one',
    F.churchDay(Date.UTC(2026, 9, 24, 1, 0)), '2026-10-23');

  ok('6:30 PM in October is 23:30 UTC (daylight time)',
    new Date(F.churchInstant('2026-10-23', 18, 30)).toISOString(), '2026-10-23T23:30:00.000Z');
  ok('and 6:30 PM in November is 00:30 UTC the next day (standard time)',
    new Date(F.churchInstant('2026-11-05', 18, 30)).toISOString(), '2026-11-06T00:30:00.000Z');
  ok('the morning daylight saving ends still reads its own clock',
    new Date(F.churchInstant('2026-11-01', 10, 0)).toISOString(), '2026-11-01T16:00:00.000Z');

  /* ------------------------------------------------------- timed events */

  const supper = {
    id: 'event-supper', title: 'Fall supper, bring a dish',
    description: 'Tables in the yard; kids welcome.',
    starts_at: '2026-10-23T23:30:00Z', ends_at: '2026-10-24T01:30:00Z',
    time_label: null, location: '216 Giuffrias Ave', signup_url: null,
    also_on: null, updated_at: '2026-10-01T12:00:00Z'
  };
  let [e] = parse(F.buildFeed([supper], NOW));
  ok('a timed event starts at its instant', e.DTSTART, '20261023T233000Z');
  ok('and ends at its ends_at', e.DTEND, '20261024T013000Z');
  ok('its UID is the event id', e.UID, 'event-supper@homechurchnola.com');
  ok('commas and semicolons are escaped', e.SUMMARY + ' | ' + e.DESCRIPTION,
    'Fall supper\\, bring a dish | Tables in the yard\\; kids welcome.');
  ok('the location comes through', e.LOCATION, '216 Giuffrias Ave');
  ok('LAST-MODIFIED is updated_at', e['LAST-MODIFIED'], '20261001T120000Z');

  [e] = parse(F.buildFeed([Object.assign({}, supper, { ends_at: null })], NOW));
  ok('no ends_at is an hour, as on the Add to calendar button', e.DTEND, '20261024T003000Z');

  [e] = parse(F.buildFeed([Object.assign({}, supper, { time_label: 'Doors 6:30 PM' })], NOW));
  ok('a label the app reads as a clock time stays timed', e.DTSTART, '20261023T233000Z');

  /* ------------------------------------------------------ all-day events */

  const baptism = {
    id: 'event-baptism', title: 'Baptism Sunday',
    description: 'Tell us if you want to be baptized.',
    starts_at: '2026-11-01T15:00:00Z', ends_at: null,
    time_label: 'All three services', location: null,
    signup_url: 'https://homechurchnola.com/baptism', also_on: null,
    updated_at: null
  };
  [e] = parse(F.buildFeed([baptism], NOW));
  ok('words for a time make an all-day event', e['DTSTART;VALUE=DATE'], '20261101');
  ok('that ends the next day, as the spec counts it', e['DTEND;VALUE=DATE'], '20261102');
  ok('and the words go in the notes, with the sign up link',
    e.DESCRIPTION,
    'All three services\\n\\nTell us if you want to be baptized.\\n\\nSign up: https://homechurchnola.com/baptism');
  ok('the sign up link is also the URL', e.URL, 'https://homechurchnola.com/baptism');
  ok('no location is no LOCATION line', 'LOCATION' in e, false);

  /* ---------------------------------------------------- one event, two days */

  // Two Sundays, 9 AM, the second one after the clocks go back.
  const klass = {
    id: 'event-membership', title: 'Membership class',
    starts_at: '2026-10-25T14:00:00Z', ends_at: '2026-10-25T15:30:00Z',
    also_on: ['2026-11-08', '2026-10-25'], updated_at: '2026-10-02T00:00:00Z'
  };
  const days = parse(F.buildFeed([klass], NOW));
  ok('a class on two Sundays is two events, the starting day not doubled', days.length, 2);
  ok('each day has its own UID',
    days.map((d) => d.UID),
    ['event-membership@homechurchnola.com', 'event-membership-20261108@homechurchnola.com']);
  ok('the second Sunday keeps 9 AM across the change to standard time',
    days[1].DTSTART, '20261108T150000Z');
  ok('and keeps its length', days[1].DTEND, '20261108T163000Z');

  /* ----------------------------------------------------------- the shape */

  const text = F.buildFeed([supper, baptism], NOW);
  ok('the feed opens and closes as a calendar',
    [text.startsWith('BEGIN:VCALENDAR\r\n'), text.endsWith('END:VCALENDAR\r\n')], [true, true]);
  ok('it is named Home Church', /\r\nX-WR-CALNAME:Home Church\r\n/.test(text), true);
  ok('every line ends CRLF, never a bare LF', /[^\r]\n/.test(text), false);

  const empty = F.buildFeed([], NOW);
  ok('no events is still a valid calendar', parse(empty).length, 0);

  const broken = [
    { id: 'event-nodate', title: 'Nothing', starts_at: 'soon' },
    { id: '', title: 'No id', starts_at: '2026-10-23T23:30:00Z' },
    supper
  ];
  ok('rows that cannot be placed are skipped, not fatal', parse(F.buildFeed(broken, NOW)).length, 1);

  /* --------------------------------------------------------------- folding */

  const long = 'DESCRIPTION:' + 'It’s a long one. '.repeat(20);
  const folded = F.fold(long);
  const enc = new TextEncoder();
  ok('a long line folds to 75 bytes or fewer per line',
    folded.split('\r\n').every((l) => enc.encode(l).length <= 75), true);
  ok('and unfolds back to exactly what went in', folded.replace(/\r\n /g, ''), long);
  ok('a short line is left alone', F.fold('SUMMARY:Short'), 'SUMMARY:Short');

  /* --------------------------------------------------- the sheet's links */

  const cal = loadApp({ SUPABASE_URL: 'https://abc.supabase.co/' });
  const links = cal.subscribeLinks();
  ok('the feed is the calendar function', links.feed, 'https://abc.supabase.co/functions/v1/calendar');
  ok('Apple gets webcal:', links.apple, 'webcal://abc.supabase.co/functions/v1/calendar');
  ok('Google gets the webcal address, encoded',
    links.google,
    'https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fabc.supabase.co%2Ffunctions%2Fv1%2Fcalendar');
  ok('Outlook gets the https address and the name',
    links.outlook,
    'https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fabc.supabase.co%2Ffunctions%2Fv1%2Fcalendar&name=Home%20Church');

  ok('no Supabase project, no links', loadApp({ SUPABASE_URL: '' }).subscribeLinks(), null);

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) process.exit(1);
})();
