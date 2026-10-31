#!/usr/bin/env node
/*
 * The /report PDF. One branded page for the pastor, counts only.
 *
 *   node scripts/make_report.js --db reports/db.json
 *
 * --db is the JSON object `scripts/report.sql` returns (the value of its
 * `report` column). The rest comes from this repository: changes on main
 * from git, and the App Store version from RELEASES.md.
 *
 * Writes reports/Home Church report <date>.pdf and a .png of the same page,
 * so whoever ran it can look before sending. reports/ is git ignored: this
 * repository is public and the report is for the pastor.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TZ = 'America/Chicago';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const dbPath = arg('--db', path.join(ROOT, 'reports', 'db.json'));
const outDir = arg('--out', path.join(ROOT, 'reports'));
let db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
if (Array.isArray(db)) db = db[0];
if (db && db.report) db = db.report;

const start = new Date(db.period_start);
const end = new Date(db.generated_at);

/* ---------- formatting ---------- */

const fmtDay = (d, opts) =>
  new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: TZ, month: 'short', day: 'numeric' }, opts || {})).format(d);
const isoDay = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const n = (x) => Number(x || 0).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- from the repository ---------- */

function git(cmd) {
  try { return execSync('git ' + cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (e) { return ''; }
}

function appChanges() {
  const since = new Date(start.getTime() - 86400000).toISOString();
  // Cloud sessions clone shallow. Deepen far enough to see the whole period.
  git('fetch --quiet --shallow-since=' + since + ' origin main');
  const ref = git('rev-parse --verify --quiet origin/main') ? 'origin/main' : 'HEAD';
  const out = git('log ' + ref + ' --no-merges --since=' + start.toISOString() + ' --format=%h');
  return out ? out.split('\n').length : 0;
}

function releases() {
  const text = fs.readFileSync(path.join(ROOT, 'RELEASES.md'), 'utf8');
  const rows = text.split('\n')
    .filter((l) => /^\|\s*\d{4}-\d\d-\d\d\s*\|/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()))
    .map((c) => ({ date: c[1], version: c[2], build: c[3], status: c[4] }));
  const live = rows.find((r) => /live/i.test(r.status));
  let liveVersion = live ? live.version : null;
  if (!liveVersion) {
    const m = text.match(/\*\*(\d+(?:\.\d+)+) \(\d+\)\*\*, uploaded and live/);
    liveVersion = m ? m[1] : '?';
  }
  const latest = rows[0];
  const next = latest && latest.version !== liveVersion ? latest : null;
  return { liveVersion, next };
}

const changes = appChanges();
const rel = releases();

/* ---------- the page ---------- */

const b64 = (p) => fs.readFileSync(path.join(ROOT, p)).toString('base64');
const logo = 'data:image/png;base64,' + b64('assets/img/logo-lockup-ink.png');
const manrope = 'data:font/woff2;base64,' + b64('assets/fonts/manrope-latin.woff2');
const poppins = 'data:font/woff2;base64,' + b64('assets/fonts/poppins-800.woff2');

function tile(label, value, sub) {
  return '<div class="tile"><div class="tv">' + value + '</div><div class="tl">' + label + '</div>' +
    (sub ? '<div class="ts">' + sub + '</div>' : '') + '</div>';
}

function row(label, now, prev) {
  if (prev === undefined) return '<tr><td>' + label + '</td><td class="num wide">' + now + '</td></tr>';
  return '<tr><td>' + label + '</td><td class="num">' + now + '</td><td class="pv"><span class="prev">last time ' +
    n(prev) + '</span></td></tr>';
}

const feeds = (db.feeds || []).map((f) => {
  const ageH = f.last_ok ? (end - new Date(f.last_ok)) / 3600000 : Infinity;
  return { name: f.feed, ok: ageH <= 6 };
});
const down = feeds.filter((f) => !f.ok).map((f) => f.name);
const feedLine = down.length
  ? '<span class="warn">Not updating: ' + esc(down.join(', ')) + '</span>'
  : 'All running';

const upcoming = (db.upcoming || []).map((e) =>
  '<li><span class="when">' + fmtDay(new Date(e.starts_at), { weekday: 'short' }) + '</span>' + esc(e.title) + '</li>'
).join('') || '<li class="none">Nothing on the calendar</li>';
const moreEvents = db.upcoming_count > (db.upcoming || []).length
  ? '<li class="none">and ' + (db.upcoming_count - db.upcoming.length) + ' more</li>' : '';

const cafe = db.cafe_orders
  ? n(db.cafe_orders) + ' <span class="unit">($' + (db.cafe_cents / 100).toFixed(0) + ')</span>'
  : '0';

const period = fmtDay(start) + ' – ' + fmtDay(end, { year: 'numeric' });

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Manrope;font-weight:200 800;src:url(${manrope}) format('woff2')}
@font-face{font-family:Poppins;font-weight:800;src:url(${poppins}) format('woff2')}
@page{size:Letter;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:8.5in;height:11in}
body{background:#F7F4EF;color:#111;font:16px/1.4 Manrope,sans-serif;padding:.6in .65in .5in;display:flex;flex-direction:column}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #111;padding-bottom:16px}
header img{height:30px}
.title{text-align:right}
.title h1{font:800 26px/1 Poppins,sans-serif;letter-spacing:-.01em}
.title p{color:#6D6864;font-size:14px;margin-top:6px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0 8px}
.tile{background:#EDE8DF;border-radius:14px;padding:16px 14px 14px}
.tv{font:800 34px/1 Poppins,sans-serif}
.tl{font-weight:700;font-size:13px;margin-top:8px;line-height:1.25}
.ts{color:#71675A;font-size:12.5px;margin-top:4px;font-weight:600}
h2{font:800 13px/1 Poppins,sans-serif;text-transform:uppercase;letter-spacing:.09em;color:#71675A;margin:26px 0 8px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 36px}
table{width:100%;border-collapse:collapse}
td{padding:8px 0;border-bottom:1px solid #C8C0B0;font-size:15px;vertical-align:baseline}
td.num{text-align:right;font-weight:800;font-size:17px;width:56px}
td.pv{text-align:right;width:84px;white-space:nowrap}
td.num.wide{width:auto;white-space:nowrap}
.prev{color:#6D6864;font-size:11.5px}
.unit{font-weight:600;font-size:13px;color:#6D6864}
ul{list-style:none}
li{padding:8px 0;border-bottom:1px solid #C8C0B0;font-size:15px}
li.none{color:#6D6864}
.when{display:inline-block;width:92px;font-weight:800;white-space:nowrap}
.warn{color:#8B4A3F;font-weight:700}
footer{margin-top:auto;padding-top:14px;border-top:1px solid #C8C0B0;color:#6D6864;font-size:11.5px;display:flex;justify-content:space-between}
</style></head><body>
<header>
  <img src="${logo}" alt="Home Church">
  <div class="title"><h1>App report</h1><p>${period}</p></div>
</header>

<div class="tiles">
  ${tile('Accounts', n(db.accounts_total), '+' + n(db.accounts_new) + ' new')}
  ${tile('Phones getting notifications', n(db.phones_ios + db.phones_android), '+' + n(db.phones_new) + ' new')}
  ${tile('Notifications delivered', n(db.notif_delivered), 'last time ' + n(db.notif_delivered_prev))}
  ${tile('People who signed in', n(db.signins), 'in these two weeks')}
</div>

<div class="cols">
  <div>
    <h2>Taking part</h2>
    <table>
      ${row('Group rooms opened', n(db.rooms), db.rooms_prev)}
      ${row('People who joined a room', n(db.room_joins), db.room_joins_prev)}
      ${row('Notes shared in rooms', n(db.room_notes), db.room_notes_prev)}
      ${row('Journal writers', n(db.journal_people), db.journal_people_prev)}
      ${row('Cafe orders', cafe, db.cafe_orders_prev)}
      ${row('Messages to the office', n(db.contact), db.contact_prev)}
    </table>
  </div>
  <div>
    <h2>Published</h2>
    <table>
      ${row('Sermon guides', n(db.pub_guides))}
      ${row('Sermon episodes', n(db.pub_sermons))}
      ${row('Worship setlists', n(db.pub_worship))}
      ${row('HomeKids lessons', n(db.pub_homekids))}
      ${row('Announcements', n(db.pub_ann))}
      ${row('Events added', n(db.pub_events))}
    </table>
  </div>
</div>

<div class="cols">
  <div>
    <h2>Coming up</h2>
    <ul>${upcoming}${moreEvents}</ul>
  </div>
  <div>
    <h2>The app</h2>
    <table>
      ${row('In the App Store', 'v' + esc(rel.liveVersion))}
      ${rel.next ? row('Next version', 'v' + esc(rel.next.version)) : ''}
      ${row('Improvements made', n(changes))}
      ${row('iPhone / Android', n(db.phones_ios) + ' / ' + n(db.phones_android))}
      ${row('Automatic updates', feedLine)}
    </table>
  </div>
</div>

<footer>
  <span>Counts only. Nobody's activity is tracked individually.</span>
  <span>Made ${fmtDay(end, { year: 'numeric' })}</span>
</footer>
</body></html>`;

(async () => {
  const { chromium } = require('playwright');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, 'Home Church report ' + isoDay(end));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: base + '.pdf', format: 'Letter', printBackground: true });
  await page.screenshot({ path: base + '.png' });
  await browser.close();
  console.log(base + '.pdf');
  console.log(base + '.png');
})().catch((e) => { console.error(e); process.exit(1); });
