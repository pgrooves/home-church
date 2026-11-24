/* ===========================================================================
   Home Church, the whole calendar as one subscribable .ics.

   Pure. Rows from public.events go in, the text of a calendar comes out, and
   nothing here touches the network or the clock unless it is handed one, so
   tests/calendar-feed.test.js can hold every decision still. index.ts next
   door is the door: it reads the table and serves what this returns.

   WHY A FEED AND NOT MORE BUTTONS. Add to calendar copies one event onto one
   phone, once. If the church moves it, the copy does not move. A subscribed
   calendar is the church's own calendar sitting beside somebody's personal
   one: every event at once, and a moved or cancelled event moves or vanishes
   on their phone the next time it refreshes, with nobody tapping anything.

   THE SAME DECISIONS AS THE APP, so the Cal tab and somebody's phone never
   disagree about a date:

     Days. starts_at is the first day and also_on lists the others (migration
     0074). Each day is its own VEVENT with its own UID, rather than one event
     with RDATEs, because RDATE in a subscribed feed is the part of the spec
     Google is least reliable about, and a class missing its second Sunday is
     exactly the bug 0074 was written to stop.

     Times. starts_at is an instant and is used as one. An event whose
     time_label is words rather than a clock ("All three services") has a
     starts_at of nine in the morning only because a row needs one, which the
     app explains at startsAtIso in js/screens/cal.js. Here it becomes an
     all-day event with the words in the notes, because a subscribed event
     nobody can drag should not claim a time nobody announced.

     Length. An hour when there is no ends_at, the same guess js/native.js
     makes for the Add to calendar button.

     Several services. A time_label that names more than one clock time
     ("5:00pm and 6:30pm") is one VEVENT per time, each an hour long unless
     ends_at says otherwise, and the label goes in the notes. Christmas Eve
     Eve 2026 is why: the Cal tab said 5:00pm and 6:30pm, and every
     subscriber's phone said 5 PM to 6 PM and nothing else, because this
     file only ever read starts_at. The first time keeps the plain UID, so
     the entry already on people's phones is the one that stays; each later
     time gets its own.

   UIDs are the event id, plus the date for every day after the first. Stable
   UIDs are what let a calendar app move an event instead of drawing it twice
   when the church changes its time.
   =========================================================================== */

export const TIME_ZONE = 'America/Chicago';
export const CALENDAR_NAME = 'Home Church';
const UID_HOST = 'homechurchnola.com';
const HOUR = 60 * 60 * 1000;

/* The same reading of a clock time out of free text that eventStart in
   js/screens/cal.js uses. A label it can read is a timed event and one it
   cannot is a day. */
const CLOCK = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric'
});

// 'YYYY-MM-DD', the church's day an instant falls on.
export function churchDay(ms) {
  return dayFormat.format(new Date(ms));
}

function churchParts(ms) {
  const out = {};
  partsFormat.formatToParts(new Date(ms)).forEach((p) => { out[p.type] = +p.value; });
  return out;
}

// How far the church's clock is ahead of UTC at one instant, in ms. Negative.
function offsetAt(ms) {
  const p = churchParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/* The instant a church clock reads hour:minute on a church day. Twice round,
   so a day either side of a daylight saving change lands on the right side
   of it. */
export function churchInstant(day, hour, minute) {
  const [y, m, d] = String(day).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

function two(n) { return n < 10 ? '0' + n : String(n); }

// 'YYYYMMDDTHHMMSSZ'.
function stamp(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) +
    'T' + two(d.getUTCHours()) + two(d.getUTCMinutes()) + two(d.getUTCSeconds()) + 'Z';
}

// 'YYYYMMDD', for an all-day event.
function dateValue(day) {
  return String(day).replace(/-/g, '');
}

function nextDay(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return n.getUTCFullYear() + '-' + two(n.getUTCMonth() + 1) + '-' + two(n.getUTCDate());
}

// Same rules as icsEscape in js/native.js.
export function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/* Lines over 75 octets are folded, which the spec requires and the
   single-event .ics never needed because nothing in it ran long. A blurb
   does. Counted in UTF-8 bytes, and never splitting a character, because an
   apostrophe from a phone keyboard is three bytes and a cut through it is a
   question mark on somebody's calendar. */
const encoder = new TextEncoder();

export function fold(line) {
  if (encoder.encode(line).length <= 75) return line;
  const out = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
      limit = 74;   // the leading space on a continuation counts
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

function daysOf(row, first) {
  const also = Array.isArray(row.also_on)
    ? row.also_on.map((d) => String(d).slice(0, 10)).filter((d) => d && d !== first)
    : [];
  return [first].concat(also).filter((d, i, all) => all.indexOf(d) === i).sort();
}

/* Every clock time in a label, in order, as [hour, minute] on a 24 hour
   clock. "5:00pm and 6:30pm" is two; "7pm" is one; "All three services" is
   none. Only used when there are at least two, so a label that merely
   repeats starts_at changes nothing. */
const LABEL_TIME = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;

export function labelTimes(label) {
  const out = [];
  String(label || '').replace(LABEL_TIME, (all, h, m, ap) => {
    const hour = (+h % 12) + (/pm/i.test(ap) ? 12 : 0);
    const minute = m ? +m : 0;
    if (+h >= 1 && +h <= 12 && minute < 60 &&
        !out.some((t) => t[0] === hour && t[1] === minute)) out.push([hour, minute]);
    return all;
  });
  return out.sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
}

function notes(row, label) {
  const parts = [];
  if (label) parts.push(label);
  if (row.description) parts.push(String(row.description).trim());
  if (row.signup_url) parts.push('Sign up: ' + row.signup_url);
  return parts.join('\n\n');
}

/* Every VEVENT one row becomes, as arrays of unfolded lines. Empty for a row
   that cannot be placed on a day, which is skipped rather than allowed to
   break the whole feed for everybody subscribed. */
export function eventsFor(row, now) {
  const startMs = Date.parse(row.starts_at);
  if (!row.id || !row.title || Number.isNaN(startMs)) return [];

  const first = churchDay(startMs);
  const label = row.time_label ? String(row.time_label).trim() : '';
  const allDay = !!label && !CLOCK.test(label);

  const endMs = row.ends_at ? Date.parse(row.ends_at) : NaN;
  const length = !Number.isNaN(endMs) && endMs > startMs ? endMs - startMs : HOUR;
  const clock = churchParts(startMs);

  const modified = Date.parse(row.updated_at);
  const several = allDay ? [] : labelTimes(label);
  const services = several.length >= 2 ? several : null;
  const description = notes(row, allDay || services ? label : '');

  /* One slot per service when the label names several, else the one
     starts_at has always given. The first slot of the first day is the
     plain UID, as it always was. */
  const slots = services || [[clock.hour % 24, clock.minute]];

  const out = [];
  daysOf(row, first).forEach((day) => (allDay ? [null] : slots).forEach((slot, i) => {
    let uid = day === first ? row.id : row.id + '-' + dateValue(day);
    if (services && i > 0) uid += '-' + two(slot[0]) + two(slot[1]);
    const lines = ['BEGIN:VEVENT', 'UID:' + uid + '@' + UID_HOST, 'DTSTAMP:' + stamp(now)];

    if (allDay) {
      lines.push('DTSTART;VALUE=DATE:' + dateValue(day));
      lines.push('DTEND;VALUE=DATE:' + dateValue(nextDay(day)));
    } else {
      const start = day === first && (!services || (slot[0] === clock.hour % 24 && slot[1] === clock.minute))
        ? startMs
        : churchInstant(day, slot[0], slot[1]);
      lines.push('DTSTART:' + stamp(start));
      lines.push('DTEND:' + stamp(start + (services && i > 0 ? HOUR : length)));
    }

    lines.push('SUMMARY:' + escapeText(row.title));
    if (description) lines.push('DESCRIPTION:' + escapeText(description));
    if (row.location) lines.push('LOCATION:' + escapeText(row.location));
    if (row.signup_url) lines.push('URL:' + String(row.signup_url).replace(/[\r\n]/g, ''));
    if (!Number.isNaN(modified)) lines.push('LAST-MODIFIED:' + stamp(modified));
    lines.push('END:VEVENT');
    out.push(lines);
  }));
  return out;
}

/* The calendar. REFRESH-INTERVAL and X-PUBLISHED-TTL ask for six hours;
   Apple listens, Google refreshes on its own schedule, roughly daily, and
   says so nowhere. */
export function buildFeed(rows, now) {
  const at = now == null ? Date.now() : now;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Home Church//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + CALENDAR_NAME,
    'X-WR-CALDESC:' + escapeText('Everything on the Home Church calendar, kept up to date.'),
    'X-WR-TIMEZONE:' + TIME_ZONE,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H'
  ];
  (rows || []).forEach((row) => {
    eventsFor(row, at).forEach((event) => { lines.push.apply(lines, event); });
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
