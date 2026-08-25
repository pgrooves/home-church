#!/usr/bin/env node
/* ==========================================================================
   Home Church, one time seed export

   Reads `js/data.js`, the content the app ships with today, and writes four
   JSON files shaped for the Supabase content tables. Run it once, upsert the
   output, and the tables start life holding the real catalogue instead of
   being empty.

     node scripts/export_seed.js
     python3 scripts/hc_supabase.py upsert series   supabase/seed/series.json
     python3 scripts/hc_supabase.py upsert guides   supabase/seed/guides.json
     python3 scripts/hc_supabase.py upsert podcasts supabase/seed/podcasts.json
     python3 scripts/hc_supabase.py upsert events   supabase/seed/events.json

   Order matters. Series first, because guides and podcasts point at it, and
   guides before podcasts, because podcasts.guide_id is a real foreign key.

   This does not modify js/data.js and it does not talk to Supabase. It only
   writes files into supabase/seed/, so it is safe to run and re-run.

   A note on the sermon catalogue: `NEW_PODCAST_PROCESS.md` warns that a good
   number of the 87 sermons in data.js were invented seed content rather than
   real messages. This script exports what is there, faithfully. It is not the
   place to decide what is real, that is a content question for a human.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'supabase', 'seed');
const CHURCH_TZ = 'America/Chicago';

/* data.js is a classic script that hangs itself off `window`. Give it one. */
global.window = {};
require(path.join(ROOT, 'js', 'data.js'));
const D = global.window.HC.data;

/* ---------------------------------------------------------------- time ---
   Events need a real timestamptz. The church is in New Orleans, so a 6:30 PM
   event is 23:30Z in summer and 00:30Z the next day in winter. Rather than
   hardcode an offset that goes wrong twice a year, ask Intl what the offset
   actually was on that date.
   ------------------------------------------------------------------------ */

function offsetMinutes(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day,
    p.hour === '24' ? 0 : p.hour, p.minute, p.second);
  return (asUtc - date.getTime()) / 60000;
}

// Local wall clock time in the church's zone -> a UTC ISO string.
function churchTimeToUtc(isoDate, hours, minutes) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, hours, minutes);
  let ts = naive;
  // Two passes settles the DST edge case where the first guess lands on the
  // wrong side of a transition.
  for (let i = 0; i < 2; i++) {
    ts = naive - offsetMinutes(new Date(ts), CHURCH_TZ) * 60000;
  }
  return new Date(ts).toISOString();
}

/* Pulls a clock time out of the free text `time` field on today's events.
   '12:30 PM' parses. '8:00 AM to 1:00 PM' parses to its start. 'All three
   services' does not parse at all, and that is the case time_label exists
   for. */
function parseClock(text) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text || '');
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) hour += 12;
  return { hours: hour, minutes: Number(m[2]) };
}

/* --------------------------------------------------------------- tables --- */

const series = D.series.map(s => ({
  id: s.id,
  title: s.title,
  subtitle: s.subtitle || null,
  blurb: s.blurb || null,
  art_url: null,               // no series art in data.js yet, fill in later
  started_on: s.startedOn || null,
  is_current: !!s.current,
  published: true
}));

const guides = D.guides.map(g => ({
  id: g.id,
  sermon_id: g.sermonId || null,
  series_id: g.seriesId || null,
  theme_title: g.themeTitle || null,     // null on purpose, the name lives on the podcast row
  subtitle: g.subtitle || null,
  primary_passage: g.primaryPassage || null,
  preacher: g.preacher || null,
  preacher_short: g.preacherShort || null,
  preached_on: g.preachedOn || null,
  occasion: g.occasion || null,
  short_summary: g.shortSummary || [],
  full_summary: g.fullSummary || [],
  anchors: g.anchors || [],
  group_sections: g.groupSections || [],
  reflection_questions: g.reflectionQuestions || [],
  one_liners: g.oneLiners || [],
  scriptures: g.scriptures || [],
  closing_scripture: g.closingScripture || null,
  published: true
}));

const guideIds = new Set(guides.map(g => g.id));

function platformOf(url) {
  if (!url) return null;
  if (/spotify\.com/i.test(url)) return 'Spotify';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
  if (/buzzsprout\.com/i.test(url)) return 'Buzzsprout';
  return 'Other';
}

const podcasts = D.sermons.map(s => ({
  id: s.id,
  series_id: s.seriesId || null,
  // Only link a guide that will actually exist, or the foreign key rejects
  // the whole batch.
  guide_id: (s.guideId && guideIds.has(s.guideId)) ? s.guideId : null,
  title: s.title,
  preacher: s.preacher || null,
  preacher_short: s.preacherShort || null,
  preached_on: s.preachedOn || null,
  published_on: s.publishedOn || null,
  duration: s.duration || null,
  passage: s.passage || null,
  scripture_refs: [],                    // not tracked in data.js, filled in going forward
  episode_url: s.episodeUrl || null,
  platform: platformOf(s.episodeUrl),
  media_type: 'audio',
  summary: s.summary || [],
  description: s.description || null,
  published: true
}));

const events = D.events.map(e => {
  const clock = parseClock(e.time);
  return {
    id: e.id,
    title: e.title,
    description: e.blurb || null,
    // No clock time in the source means an event like "All three services".
    // Anchor it to 9:30 AM, the middle service, so it sorts into the right
    // place on the day, and let time_label carry what people actually read.
    starts_at: churchTimeToUtc(e.date, clock ? clock.hours : 9, clock ? clock.minutes : 30),
    ends_at: null,
    time_label: e.time || null,
    location: e.location || null,
    signup_url: null,
    capacity: null,
    category: 'gathering',
    published: true
  };
});

/* The bundled announcements normally leave both ends open, because the only
   way to retire one in data.js was to ship a build. They carry the window
   fields anyway so the shapes match, so pass through whatever is there rather
   than hardcoding null and quietly dropping it on the way to Supabase. */
const announcements = D.announcements.map(a => ({
  id: a.id,
  // The eyebrow column is no longer read by the app. Home generates that label
  // from the publish date now, so nothing typed here would reach a phone, and
  // seeding a literal into it would only mislead whoever reads the table next.
  eyebrow: null,
  title: a.title,
  body: a.body || null,
  /* The markup half of the words. A bundled announcement is the floor a phone
     with no signal stands on and it is one sentence, so this is normally null,
     which is exactly what a row written before the editor looks like. Passed
     through rather than derived from `body`: a paragraph the seed invented
     would be a paragraph nobody wrote. See migration 0033. */
  body_html: a.bodyHtml || null,
  image_urls: a.images || [],
  // The first of the list, kept in step by whoever writes the list, for a
  // phone running a build from before 0033. Never a second opinion.
  image_url: (a.images && a.images[0]) || a.imageUrl || null,
  video_url: a.videoUrl || null,
  link_url: a.linkUrl || null,
  link_title: a.linkTitle || null,
  link_image_url: a.linkImageUrl || null,
  starts_on: a.startsOn || null,
  ends_on: a.endsOn || null,
  priority: a.priority || 0,
  published: true
}));

/* The app holds one reading plan, data.js holds one object, and the table
   holds every plan the church has run with is_current marking the live one.
   So this is a one row list. */
const reading_plans = [D.readingPlan].filter(Boolean).map(p => ({
  id: p.id,
  title: p.title,
  subtitle: p.subtitle || null,
  total_weeks: p.totalWeeks,
  starts_on: p.startsOn || null,
  current_week: p.currentWeek,
  weeks: p.weeks || [],
  this_week: p.thisWeek || null,
  resources: p.resources || [],
  is_current: p.current !== false,
  published: true
}));

/* Groups keep their data.js order, because Connect shows the first one as
   "your group" and the table has to preserve that rather than leave it to
   however Postgres returns rows. Tens, so a group can be slotted between two
   others without renumbering the rest. */
const groups = D.groups.map((g, i) => ({
  id: g.id,
  name: g.name,
  day: g.day || null,
  time_label: g.time || null,
  neighborhood: g.neighborhood || null,
  host: g.host || null,
  life_stage: g.lifeStage || null,
  blurb: g.blurb || null,
  openings: g.openings === true,
  sort_order: (i + 1) * 10,
  published: true
}));

/* Serve teams and next steps keep their data.js order for the same reason
   groups do, the screen renders them in list order. */
const serve_teams = D.serveTeams.map((t, i) => ({
  id: t.id,
  name: t.name,
  commitment: t.commitment || null,
  blurb: t.blurb || null,
  sort_order: (i + 1) * 10,
  published: true
}));

const next_steps = D.nextSteps.map((s, i) => ({
  id: s.id,
  title: s.title,
  blurb: s.blurb || null,
  sort_order: (i + 1) * 10,
  published: true
}));

/* Two single row tables. The app reads each as one object, so these are one
   row lists, the same shape as reading_plans. */
const church_profile = [{
  id: 'church-home',
  name: D.church.name,
  tagline: D.church.tagline || null,
  pastors: D.church.pastors || null,
  address_line1: D.church.address ? D.church.address.line1 : null,
  address_city: D.church.address ? D.church.address.city : null,
  address_state: D.church.address ? D.church.address.state : null,
  address_zip: D.church.address ? D.church.address.zip : null,
  maps_url: D.church.mapsUrl || null,
  service_day: D.church.serviceDay || null,
  service_times: D.church.serviceTimes || [],
  giving_url: D.church.givingUrl || null,
  website_url: D.church.websiteUrl || null,
  social: D.church.social || [],
  published: true
}];

const podcast_show = [{
  id: 'show-home-church-nola',
  name: D.podcast.name,
  platform: D.podcast.platform || null,
  show_url: D.podcast.showUrl || null,
  blurb: D.podcast.blurb || null,
  published: true
}];

/* ---------------------------------------------------------------- write --- */

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [name, rows] of Object.entries({ series, guides, podcasts, events, announcements, reading_plans,
                                  groups, serve_teams, next_steps, church_profile, podcast_show })) {
  const file = path.join(OUT_DIR, name + '.json');
  fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  console.log('wrote  %s  %d rows', path.relative(ROOT, file), rows.length);
}

const linked = podcasts.filter(p => p.guide_id).length;
console.log('\n%d of %d messages have a guide attached.', linked, podcasts.length);
console.log('Upsert in this order: series, guides, podcasts, events, then the rest, which have no foreign keys.');
console.log('Series before guides before podcasts, the foreign keys point that way.');
