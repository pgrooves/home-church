/**
 * Home Church, HomeKids lessons from the director's Google Drive folder.
 *
 * WHAT IT DOES, every hour. Signs in to Google as the church's own robot
 * account (a "service account" the director shared the folder with, as
 * Viewer), lists the folder, and reads any lesson doc it has not read before
 * or that has changed since it last did. Each doc is a teacher's plan for one
 * group bundle on one Sunday ("Champions & Heroes", "Legends & Warriors"), so
 * Gemini rewrites it as the family guide the HomeKids page draws and the
 * result is merged into that Sunday's DRAFT in homekids_lesson_drafts. An
 * admin approves it from Admin -> HomeKids. Nothing here publishes anything.
 *
 * WHY A ROBOT ACCOUNT AND NOT SOMEBODY'S OWN GOOGLE SIGN IN. A person's sign
 * in, used from a server, needs a refresh token, and Google expires those
 * after a week for apps it has not verified; reading Drive is a scope it is
 * slow to verify. A service account's key does not expire and can see exactly
 * what was shared with its address, which here is one folder.
 *
 * WHY EVERY DOC IS READ AS .docx. A Google Doc exported as .docx keeps its
 * header, and the header is where the director writes the group and the date
 * ("Home Kids - Champions & Heroes - September 27, 2026"). The plain text
 * export drops it. And a doc somebody uploaded as Word is already .docx, so
 * one reader covers both. The unzip is hand written below, like the IMAP
 * client in newsletter-intake: forty lines we can read beat a dependency.
 *
 * SECRETS (Project Settings -> Edge Functions -> Secrets)
 *   nothing new, while the folder is shared "Anyone with the link: Viewer":
 *                              GEMINI_API_KEY reads it, once the Drive API is
 *                              turned on for that key's Google Cloud project
 *   HOMEKIDS_DRIVE_API_KEY     optional, a separate key for Drive instead
 *   HOMEKIDS_DRIVE_KEY         only for a PRIVATE folder: the robot's JSON key
 *                              file, pasted whole. Wins when it is set.
 *   HOMEKIDS_DRIVE_FOLDER      optional, the folder's id or link; defaults to
 *                              the folder the director shared in October 2026
 *   HC_NEWSLETTER_CRON_SECRET  already set; the same proof of "came from cron"
 *   GEMINI_API_KEY, GEMINI_MODEL   already set for the newsletter reader
 *
 * BY HAND, with the cron secret in x-hc-cron-secret:
 *   {"probe": true}     signs in and lists the folder, reads nothing
 *   {"dry_run": true}   reads and writes the guides, saves nothing
 *   {"file": "<id>"}    reads that one doc again, whatever the ledger says
 *
 * DEPLOY
 *   supabase functions deploy homekids-drive --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEFAULT_FOLDER = '118rywZT5bU4b1VfmF0S2Ae6ZNex-e4RW';
const DEFAULT_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-3.7-flash'];
const MAX_FILES_PER_RUN = 4;
const MAX_ATTEMPTS = 4;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const GDOC = 'application/vnd.google-apps.document';
const GFOLDER = 'application/vnd.google-apps.folder';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

class TransientError extends Error {}

/* @@ drive:start
   Everything between these markers is evalled by tests/homekids-drive.test.js,
   so it stays self-contained: no imports, no Deno, nothing from above. */

type GroupKey = 'champions' | 'heroes' | 'legends';
const GROUP_KEYS: GroupKey[] = ['champions', 'heroes', 'legends'];

/* ------------------------------------------------------------ the .docx */

/* The paragraphs of a .docx, header first, as plain lines. A .docx is a zip,
   and the two parts that matter are word/header*.xml and word/document.xml.
   Stored entries are copied; deflated ones go through DecompressionStream,
   which Deno and node both have. Anything else in the zip is ignored. */
async function docxText(bytes: Uint8Array): Promise<{ header: string; body: string }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a Word document (no zip directory).');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const parts: Record<string, string> = {};

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (!/^word\/(document|header\d*)\.xml$/.test(name)) continue;
    const lNameLen = view.getUint16(local + 26, true);
    const lExtraLen = view.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + size);
    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else continue;
    parts[name] = new TextDecoder().decode(data);
  }

  if (!parts['word/document.xml']) throw new Error('This Word document has no body.');
  const header = Object.keys(parts).filter((k) => k.startsWith('word/header')).sort()
    .map((k) => xmlLines(parts[k])).join('\n');
  return { header: header.trim(), body: xmlLines(parts['word/document.xml']).trim() };
}

/* Word XML to lines: one line per paragraph, a bullet kept as "- ", tabs and
   breaks as spaces, entities decoded. Formatting is noise to a model. */
function xmlLines(xml: string): string {
  const out: string[] = [];
  for (const para of xml.split(/<\/w:p>/)) {
    const bullet = /<w:numPr>/.test(para);
    const text = para
      .replace(/<w:(tab|br)\b[^>]*\/>/g, '<w:t> </w:t>')
      .replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '\u0000$1\u0000')
      .split('\u0000').filter((_, i) => i % 2 === 1).join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
    if (text) out.push((bullet ? '- ' : '') + text);
  }
  return out.join('\n');
}

/* --------------------------------------------------- which groups, which day */

function groupsIn(text: string): GroupKey[] {
  const t = String(text || '').toLowerCase();
  const found: GroupKey[] = [];
  if (/champion/.test(t)) found.push('champions');
  if (/\bheroe?s?\b/.test(t)) found.push('heroes');
  if (/legend|warrior/.test(t)) found.push('legends');
  return found;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/* The first date written in a piece of text: "Oct 4th", "October 4",
   "September 27, 2026", "10/4", "10/4/26". A year that is not written is
   the one that puts the date nearest `reference`, which is when the doc was
   last edited, so a December doc about January lands in the right year. */
function dateIn(text: string, reference: string): string | null {
  const t = String(text || '');
  const ref = new Date(reference + 'T12:00:00Z').getTime();
  const nearest = (m: number, d: number): string | null => {
    const y = new Date(ref).getUTCFullYear();
    let best: string | null = null;
    for (const yy of [y - 1, y, y + 1]) {
      const v = iso(yy, m, d);
      if (v && (!best || Math.abs(Date.parse(v) - ref) < Math.abs(Date.parse(best) - ref))) best = v;
    }
    return best;
  };

  const named = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/i);
  const slashed = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  const pick = named && (!slashed || (named.index ?? 0) <= (slashed.index ?? 0)) ? 'named' : slashed ? 'slashed' : null;

  if (pick === 'named' && named) {
    const m = MONTHS[named[1].toLowerCase().slice(0, named[1].toLowerCase().startsWith('sept') ? 4 : 3)];
    const d = parseInt(named[2], 10);
    return named[3] ? iso(parseInt(named[3], 10), m, d) : nearest(m, d);
  }
  if (pick === 'slashed' && slashed) {
    const m = parseInt(slashed[1], 10), d = parseInt(slashed[2], 10);
    if (slashed[3]) {
      const y = parseInt(slashed[3], 10);
      return iso(y < 100 ? 2000 + y : y, m, d);
    }
    return nearest(m, d);
  }
  return null;
}

function weekday(isoDate: string): number {
  return new Date(isoDate + 'T12:00:00Z').getUTCDay();
}

function pretty(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00Z').toLocaleDateString('en-US',
    { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/* Which Sunday a doc is for, and anything a person should check about it.

   The FILE NAME WINS over the header, and the reason is the first doc this
   ever read: named "Oct 4th Champions & Heroes", headed "September 27, 2026".
   The header is a template copied forward week to week and is the half that
   gets left stale; the name is what the director types when she saves this
   week's. Either way the disagreement is written on the draft, and the admin
   can change the date before approving. */
function lessonDate(
  name: string, header: string, modelDate: string | null, modified: string,
): { date: string; note: string | null } {
  const fromName = dateIn(name, modified);
  const fromHeader = dateIn(header, modified);
  const fromModel = modelDate && /^\d{4}-\d{2}-\d{2}$/.test(modelDate) ? modelDate : null;
  const notes: string[] = [];

  let date = fromName || fromHeader || fromModel;
  if (fromName && fromHeader && fromName !== fromHeader) {
    notes.push(`The file name says ${pretty(fromName)} but the header inside says ${pretty(fromHeader)}. ` +
      `Using ${pretty(fromName)}; change the date before approving if that is wrong.`);
  }
  if (!date) {
    const d = new Date(modified + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7));
    date = d.toISOString().slice(0, 10);
    notes.push(`No date anywhere in the doc. Guessed the Sunday after it was saved, ${pretty(date)}.`);
  } else if (weekday(date) !== 0) {
    notes.push(`${pretty(date)} is not a Sunday. Check the date before approving.`);
  }
  return { date, note: notes.length ? notes.join(' ') : null };
}

/* ------------------------------------------------------------ the model */

const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string' },
    title: { type: 'string' },
    passage: { type: 'string' },
    big_idea: { type: 'string' },
    memory_verse: {
      type: 'object',
      properties: { text: { type: 'string' }, reference: { type: 'string' } },
    },
    story: { type: 'array', items: { type: 'string' } },
    groups: {
      type: 'object',
      properties: Object.fromEntries(GROUP_KEYS.map((k) => [k, {
        type: 'object',
        properties: {
          questions: { type: 'array', items: { type: 'string' } },
          activity: { type: 'string' },
        },
      }])),
    },
    prayer: { type: 'string' },
    parent_note: { type: 'string' },
  },
  required: ['title', 'story', 'groups'],
};

function lessonPrompt(name: string, header: string, body: string, groups: GroupKey[]): string {
  const who: Record<GroupKey, string> = {
    champions: 'champions: ages 3 to 4. Two or three questions a preschooler can answer with a word or by pointing. An activity with the hands: a game, a motion, something to touch.',
    heroes: 'heroes: ages 5 to 6. Three questions, one of them about their own week. An activity they can mostly do on their own.',
    legends: 'legends (the "Legends + Warriors" group): ages 7 to 12. Three or four questions with room to think, one asking them to do something for somebody else. An activity with a little challenge in it.',
  };
  return [
    'You are turning a church kids-ministry TEACHER\'S lesson plan into a FAMILY guide for',
    'the week after the lesson. A parent reads it with their child at home, at the table,',
    'in the car, at bedtime. A person reviews everything before it is published.',
    '',
    'VOICE. Short sentences and everyday words: read every line as if aloud to a four',
    'year old. Warm, never scary, never guilt or shame. Never use an em dash; use commas.',
    'At most one exclamation mark in the whole guide. Never name a child or a teacher.',
    '',
    'WHAT TO LEAVE OUT. This plan is for a classroom: supplies, room setup, videos,',
    'playlists, timings, "SHARE:" scripts, the ministry\'s weekly values routine. None of',
    'that goes in the guide. Never invent a Bible fact that is not in the passage.',
    '',
    'FIELDS',
    '- date: the Sunday the lesson is taught, YYYY-MM-DD, only if the plan says.',
    '- title: the lesson\'s story, e.g. "Jonah and the Plant". Not the series week number.',
    '- passage: the Bible reference the story comes from, e.g. "Jonah 4". Work it out',
    '  from the story if the plan does not write it.',
    '- big_idea: the plan\'s main takeaway ("Big Truth", "Bottom Line"), one sentence a',
    '  three year old can say back. Use the plan\'s words.',
    '- memory_verse: ONLY if the plan gives one, word for word. Otherwise leave it out.',
    '- story: two to four short paragraphs retelling the story for a child, faithful to',
    '  the passage. Use the plan\'s "Teach the Story" section as the source.',
    `- groups: fill ONLY these: ${groups.join(', ')}. Each has questions (array) and`,
    '  activity (one short paragraph a family can do at home with what is in a house).',
    '  Turn the plan\'s ASK lines into questions and its ACT lines and games into the',
    '  activity, rewritten for home rather than a classroom.',
    ...groups.map((g) => '  ' + who[g]),
    '- prayer: two or three sentences a child can pray, ending with Amen.',
    '- parent_note: one or two sentences to the grown up: what was taught, and one',
    '  question to ask at bedtime.',
    '',
    `FILE NAME: ${name}`,
    `HEADER: ${header || '(none)'}`,
    '',
    'LESSON PLAN',
    body,
  ].join('\n');
}

/* --------------------------------------------------------- the draft */

function s(v: unknown, max = 2000): string {
  return String(v ?? '').replace(/\s*—\s*/g, ', ').trim().slice(0, max);
}

function list(v: unknown, max = 8, len = 600): string[] {
  return (Array.isArray(v) ? v : []).map((x) => s(x, len)).filter(Boolean).slice(0, max);
}

/* The checklist is built here, not by the model, so the ids are the same
   every week and a family's ticks always mean the same thing. */
function checklistFor(lesson: Record<string, unknown>): Array<{ id: string; text: string }> {
  const items = [{ id: 'story', text: 'Read the story together' }];
  const verse = lesson.memory_verse as { text?: string } | null;
  items.push(verse && verse.text
    ? { id: 'verse', text: 'Say the memory verse to a grown up' }
    : { id: 'bigidea', text: 'Say the big idea to a grown up' });
  items.push({ id: 'talk', text: 'Talk about your group’s questions' });
  items.push({ id: 'pray', text: 'Pray the prayer together' });
  return items;
}

/* One doc's worth of guide, folded into the Sunday's draft.

   The groups this doc covers are written over; the others are left exactly as
   they were, which is how the Champions & Heroes doc and the Legends doc
   become one lesson. The shared fields (title, story, big idea...) come from
   whichever doc got there first, and are rewritten only by that same doc when
   it is edited, so two docs telling the story slightly differently do not
   swap it back and forth every hour. */
function mergeLesson(
  base: Record<string, unknown> | null,
  parsed: Record<string, unknown>,
  groups: GroupKey[],
  fileId: string,
  date: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base || {}) };
  const owner = (out._shared_from as string) || '';
  const shared = !owner || owner === fileId;

  const verse = parsed.memory_verse as { text?: unknown; reference?: unknown } | undefined;
  const fresh: Record<string, unknown> = {
    title: s(parsed.title, 200),
    passage: s(parsed.passage, 120),
    big_idea: s(parsed.big_idea, 300),
    memory_verse: verse && s(verse.text) ? { text: s(verse.text, 400), reference: s(verse.reference, 80) } : null,
    story: list(parsed.story, 6, 1200),
    prayer: s(parsed.prayer, 800),
    parent_note: s(parsed.parent_note, 800),
  };

  for (const [k, v] of Object.entries(fresh)) {
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    const had = out[k] != null && out[k] !== '' && !(Array.isArray(out[k]) && !(out[k] as unknown[]).length);
    if (!empty && (shared || !had)) out[k] = v;
    else if (!had) out[k] = Array.isArray(v) ? [] : (k === 'memory_verse' ? null : '');
  }
  if (shared) out._shared_from = fileId;

  const was = (out.groups && typeof out.groups === 'object') ? out.groups as Record<string, unknown> : {};
  const pg = (parsed.groups && typeof parsed.groups === 'object') ? parsed.groups as Record<string, Record<string, unknown>> : {};
  const next: Record<string, unknown> = { ...was };
  for (const g of groups) {
    const b = pg[g] || {};
    next[g] = { questions: list(b.questions, 5, 300), activity: s(b.activity, 800) };
  }
  out.groups = next;
  out.taught_on = date;
  out.checklist = checklistFor(out);
  return out;
}

/* @@ drive:end */

/* ------------------------------------------------------------ Google */

function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function googleToken(keyJson: string): Promise<{ token: string; email: string }> {
  let key: { client_email?: string; private_key?: string };
  try { key = JSON.parse(keyJson); } catch {
    throw new Error('HOMEKIDS_DRIVE_KEY is not the JSON key file. Paste the whole file, braces and all.');
  }
  if (!key.client_email || !key.private_key) {
    throw new Error('HOMEKIDS_DRIVE_KEY is missing client_email or private_key. Paste the whole JSON key file.');
  }
  const pem = key.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const signer = await crypto.subtle.importKey('pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);

  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signer, new TextEncoder().encode(unsigned)));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + b64url(sig),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`Google refused the robot's sign in (${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { token: body.access_token, email: key.client_email };
}

interface DriveFile { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string }

/* Two ways in, and the folder decides which.

   A folder set to "Anyone with the link: Viewer" can be read with a plain
   Google API key, the same kind of key Gemini already uses. That is how the
   director's folder is shared since October 2026, and it means no robot
   account at all: HOMEKIDS_DRIVE_API_KEY if set, otherwise GEMINI_API_KEY,
   whose Google Cloud project only needs the Drive API turned on.

   A private folder needs the robot (HOMEKIDS_DRIVE_KEY, the service account's
   JSON), which signs in and sees only what was shared with its address. If
   that secret is set it wins, so taking the folder private again later is a
   secret and a share, not a code change. */
type DriveAuth = { bearer?: string; key?: string };

function driveFetch(auth: DriveAuth, url: string): Promise<Response> {
  if (auth.key) {
    return fetch(url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(auth.key));
  }
  return fetch(url, { headers: { Authorization: 'Bearer ' + auth.bearer } });
}

function driveRefusal(auth: DriveAuth, status: number): string {
  if (auth.key && status === 403) {
    return 'Google refused the API key. Turn on the Google Drive API for the Google Cloud ' +
      'project the key belongs to (console.cloud.google.com, search "Google Drive API", Enable).';
  }
  return auth.key
    ? 'Cannot see that folder. Its sharing has to be "Anyone with the link", as Viewer.'
    : 'The robot cannot see that folder. Share it with the robot\'s email as Viewer.';
}

async function driveList(auth: DriveAuth, folder: string, depth = 0): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let page = '';
  do {
    const q = encodeURIComponent(`'${folder}' in parents and trashed = false`);
    const res = await driveFetch(auth, 'https://www.googleapis.com/drive/v3/files?q=' + q +
      '&fields=nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=200' +
      '&supportsAllDrives=true&includeItemsFromAllDrives=true' + (page ? '&pageToken=' + page : ''),
    );
    if (res.status === 404 || res.status === 403) throw new Error(driveRefusal(auth, res.status));
    if (!res.ok) throw new TransientError(`Drive answered ${res.status} listing the folder.`);
    const body = await res.json();
    for (const f of body.files ?? []) {
      // One level of subfolders, for a director who files by month.
      if (f.mimeType === GFOLDER && depth < 1) out.push(...await driveList(auth, f.id, depth + 1));
      else out.push(f);
    }
    page = body.nextPageToken ?? '';
  } while (page);
  return out;
}

async function driveDocx(auth: DriveAuth, f: DriveFile): Promise<Uint8Array> {
  const url = f.mimeType === GDOC
    ? `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(DOCX)}`
    : `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`;
  const res = await driveFetch(auth, url);
  if (res.status === 403 || res.status === 404) throw new Error(driveRefusal(auth, res.status));
  if (!res.ok) throw new TransientError(`Drive answered ${res.status} reading "${f.name}".`);
  return new Uint8Array(await res.arrayBuffer());
}

/* ------------------------------------------------------------ Gemini */

async function askGemini(apiKey: string, model: string, prompt: string): Promise<Record<string, unknown>> {
  const request = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 32768,
      responseMimeType: 'application/json',
      responseSchema: LESSON_SCHEMA,
    },
  });
  const models = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
  let busy = '';
  for (const m of models) {
    for (let i = 0; i < 2; i++) {
      if (i) await new Promise((r) => setTimeout(r, 5000));
      let r: Response;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request });
      } catch (err) { busy = `Could not reach Gemini: ${(err as Error).message}`; continue; }
      if (r.ok) {
        const payload = await r.json();
        const raw = (payload?.candidates?.[0]?.content?.parts ?? [])
          .map((p: { text?: string }) => p?.text ?? '').join('').trim();
        try { return JSON.parse(raw); } catch {
          throw new TransientError(`Gemini did not finish its answer (${payload?.candidates?.[0]?.finishReason ?? '?'}).`);
        }
      }
      if (r.status === 429 || r.status >= 500) { busy = `Gemini is busy (${r.status}) on ${m}.`; continue; }
      if (m !== model) break;
      throw new Error(`Gemini returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
  }
  throw new TransientError(busy || 'Gemini did not answer.');
}

/* ------------------------------------------------------------ main */

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const cronSecret = Deno.env.get('HC_NEWSLETTER_CRON_SECRET');
  if (!cronSecret) return json({ error: 'Not configured.' }, 500);
  if (!secretsMatch(req.headers.get('x-hc-cron-secret') ?? '', cronSecret)) return json({ error: 'No.' }, 401);

  let body: { probe?: boolean; dry_run?: boolean; file?: string } = {};
  try { body = await req.json(); } catch { /* an empty body is a normal tick */ }
  const dryRun = body.dry_run === true;

  const keyJson = Deno.env.get('HOMEKIDS_DRIVE_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  const folderSetting = (Deno.env.get('HOMEKIDS_DRIVE_FOLDER') ?? '').trim();
  const folder = (folderSetting.match(/folders\/([\w-]+)/)?.[1]) || folderSetting || DEFAULT_FOLDER;

  const apiKey = Deno.env.get('HOMEKIDS_DRIVE_API_KEY') || geminiKey;
  if (!geminiKey) return json({ ok: false, note: 'Not set up yet: GEMINI_API_KEY is missing.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let auth: DriveAuth;
    let email = 'none: reading a folder shared as "Anyone with the link" with an API key';
    if (keyJson) {
      const signedIn = await googleToken(keyJson);
      auth = { bearer: signedIn.token };
      email = signedIn.email;
    } else {
      auth = { key: apiKey };
    }
    const files = (await driveList(auth, folder))
      .filter((f) => f.mimeType === GDOC || f.mimeType === DOCX);

    if (body.probe) {
      return json({ ok: true, probe: true, robot: email, folder,
        docs: files.map((f) => ({ name: f.name, modified: f.modifiedTime })) });
    }

    const { data: ledgerRows } = await admin.from('homekids_drive_files').select('*');
    const ledger = new Map((ledgerRows ?? []).map((r) => [r.file_id as string, r]));

    const todo = files.filter((f) => {
      if (body.file) return f.id === body.file;
      const row = ledger.get(f.id);
      if (!row) return true;
      if (new Date(row.modified_time as string).getTime() !== new Date(f.modifiedTime).getTime()) return true;
      return row.status === 'deferred' && Number(row.attempts) < MAX_ATTEMPTS;
    }).sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime)).slice(0, MAX_FILES_PER_RUN);

    const results: unknown[] = [];

    for (const f of todo) {
      const prior = ledger.get(f.id);
      const sameVersion = prior && new Date(prior.modified_time as string).getTime() === new Date(f.modifiedTime).getTime();
      const attempts = sameVersion ? Number(prior!.attempts ?? 0) + 1 : 1;
      const record = (patch: Record<string, unknown>) => dryRun ? Promise.resolve() :
        admin.from('homekids_drive_files').upsert({
          file_id: f.id, name: f.name, modified_time: f.modifiedTime, attempts, ...patch,
        });

      try {
        const { header, body: text } = await docxText(await driveDocx(auth, f));
        let groups = groupsIn(f.name + ' ' + header);
        if (!groups.length) groups = [...GROUP_KEYS];

        if (text.length < 200) {
          await record({ status: 'skipped', note: 'Too little text in the doc to be a lesson.' });
          results.push({ name: f.name, skipped: 'too short' });
          continue;
        }

        const parsed = await askGemini(geminiKey, model, lessonPrompt(f.name, header, text.slice(0, 60000), groups));
        const when = lessonDate(f.name, header, (parsed.date as string) || null, f.modifiedTime.slice(0, 10));
        const id = 'homekids-' + when.date;

        // What the Sunday already has: a waiting draft, else the live lesson,
        // else nothing. A draft that was approved or discarded starts over from
        // whatever is live, so an edit after approval is a fresh proposal.
        const { data: draftRow } = await admin.from('homekids_lesson_drafts').select('*').eq('id', id).maybeSingle();
        let base: Record<string, unknown> | null = null;
        let filesSoFar: Array<Record<string, unknown>> = [];
        if (draftRow && draftRow.review_state === 'pending') {
          base = draftRow.lesson as Record<string, unknown>;
          filesSoFar = (draftRow.files as Array<Record<string, unknown>>) ?? [];
        } else {
          const { data: live } = await admin.from('homekids_lessons').select('*').eq('id', id).maybeSingle();
          if (live) base = { ...live };
        }

        const lesson = mergeLesson(base, parsed, groups, f.id, when.date);
        lesson.source_url = lesson.source_url || f.webViewLink || null;
        const filesNext = [...filesSoFar.filter((x) => x.id !== f.id), { id: f.id, name: f.name, groups }];
        const missing = GROUP_KEYS.filter((g) => !((lesson.groups as Record<string, { questions?: string[] }>)[g]?.questions?.length));
        const note = [when.note,
          missing.length ? `Still waiting on the ${missing.join(' and ')} part.` : null,
        ].filter(Boolean).join(' ') || null;

        const draft = { id, taught_on: when.date, lesson, files: filesNext, note, review_state: 'pending' };
        if (dryRun) {
          results.push({ name: f.name, draft });
        } else {
          const { error } = await admin.from('homekids_lesson_drafts').upsert(draft);
          if (error) throw new Error(`Could not save the draft: ${error.message}`);
          await record({ status: 'read', draft_id: id, note });
          results.push({ name: f.name, draft: id, groups, note });
        }
      } catch (err) {
        const message = String((err as Error).message ?? err).slice(0, 500);
        const transient = err instanceof TransientError && attempts < MAX_ATTEMPTS;
        await record({ status: transient ? 'deferred' : 'failed', note: message });
        results.push({ name: f.name, [transient ? 'deferred' : 'failed']: message });
      }
    }

    return json({ ok: true, dry_run: dryRun, docs_in_folder: files.length, read: todo.length, results });
  } catch (err) {
    console.error('homekids-drive failed:', err);
    return json({ ok: false, error: String((err as Error).message ?? err) });
  }
});
