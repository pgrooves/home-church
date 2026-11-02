/**
 * Home Church, the words of a verse, for the verse sheet.
 *
 * WHAT IT DOES. Takes a passage id from the app (JHN.3.16, ROM.12.1-ROM.12.2,
 * PSA.23) and answers with the NIV text of it, the reference written out, and
 * the copyright line the translation has to be shown with. js/verse.js draws
 * that in a sheet over whatever somebody was reading, so tapping a reference
 * no longer sends them out of the app to a web page.
 *
 * WHERE THE WORDS COME FROM. YouVersion Platform, api.youversion.com, which
 * licenses the NIV to the church's developer account. The app key for that
 * account is the one thing here that must never ship in the bundle, and it
 * is the whole reason this function exists rather than the app calling
 * YouVersion itself: a key in the bundle is a key anybody with the .ipa has.
 *
 * WHY verify_jwt IS OFF. Reading a verse is for anybody, signed in or not,
 * and the app carries a publishable key rather than a JWT, the same as the
 * contact form. The URL is therefore open, and what keeps it from being a
 * free NIV for the internet is that it only answers the one shape of id the
 * app sends, only for the one Bible it is configured for, and remembers what
 * it has already fetched so a popular verse costs YouVersion one request
 * rather than one per phone.
 *
 * PASSAGES THAT CROSS A CHAPTER. YouVersion answers 404 for one request
 * that runs from one chapter into the next (GEN.39.20-GEN.40.23, NUM.13-
 * NUM.14), so those are asked for a chapter at a time and joined here; see
 * chaptersOf(). The app sends the same id it always has, so every installed
 * build gets the words with no new release.
 *
 * THE CACHE, `scripture_cache` from migration 0076. One row per passage,
 * written with the service role and readable by nobody else. Kept for thirty
 * days and then fetched again, so a correction on YouVersion's side reaches
 * the app within a month. If the migration has not been applied the function
 * still works; it just asks YouVersion every time. Set YVP_CACHE=off to stop
 * it writing anything, should YouVersion's terms ever say it may not.
 *
 * SECRETS, under Project Settings -> Edge Functions -> Secrets:
 *
 *   YVP_APP_KEY     required. The app key from platform.youversion.com.
 *   YVP_BIBLE_ID    optional, defaults to 111, the NIV (2011). Must match
 *                   VERSION in js/bible.js, which is what the chapter button
 *                   and the label above the words use.
 *   YVP_CACHE       optional. "off" to skip the cache table entirely.
 *
 * DEPLOY
 *   supabase functions deploy bible-passage --no-verify-jwt
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform; do
 * not add them by hand.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const API = 'https://api.youversion.com/v1';
const DEFAULT_BIBLE_ID = 111;
const CACHE_DAYS = 30;
const META_ID = '_meta';

/* Fresh lookups, the ones that cost a call against the church's YouVersion
   key, per minute: for one address, and for everybody. Somebody tapping
   through a chapter does not come near the first; a script spending the
   allowance hits it at once. Verses already in the cache are never counted.
   Counted by hc_rate_take, migration 0094. */
const FRESH_PER_ADDRESS = 30;
const FRESH_FOR_EVERYBODY = 300;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // See the note on CORS in supabase/functions/contact: content-type and
  // apikey have to be named or the preflight fails as a bare TypeError.
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  });
}

/* @@ passage:start
   Everything between these markers is plain logic with no network, lifted out
   and run by tests/verse.test.js. Keep it that way. */

const BOOKS = (
  'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB ' +
  'PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP ' +
  'HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI ' +
  '2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'
).split(' ');

/* The only ids this answers: a book, a chapter, maybe a verse, and maybe a
   far end in the SAME book. Checked before anything is fetched, so nothing
   that is not a Bible reference reaches YouVersion with our key on it. */
const PASSAGE_ID = new RegExp(
  '^(' + BOOKS.join('|') + ')\\.(\\d{1,3})(?:\\.(\\d{1,3}))?' +
  '(?:-\\1\\.(\\d{1,3})(?:\\.(\\d{1,3}))?)?$');

function isPassageId(id: string): boolean {
  if (typeof id !== 'string' || id.length > 40) return false;
  const m = PASSAGE_ID.exec(id);
  if (!m) return false;
  // Either both ends name a verse or neither does: JHN.3.16-JHN.4 is not a thing.
  if (m[4] && Boolean(m[3]) !== Boolean(m[5])) return false;
  return true;
}

/* A verse range inside one chapter, as the single verses in it. The fallback
   for a YouVersion that will not take a range in one request; capped, so a
   bad id cannot turn into a hundred and seventy six requests for Psalm 119. */
function versesOf(id: string, max = 40): string[] | null {
  const m = PASSAGE_ID.exec(id);
  if (!m || !m[3] || !m[5] || m[2] !== m[4]) return null;
  const from = Number(m[3]);
  const to = Number(m[5]);
  if (to < from || to - from + 1 > max) return null;
  const out: string[] = [];
  for (let v = from; v <= to; v++) out.push(`${m[1]}.${m[2]}.${v}`);
  return out;
}

/* How many verses each chapter has, book by book: the same numbers js/bible.js
   ships, and tests/verse.test.js checks the two agree. Here for one job only,
   knowing where a chapter ends when a passage runs on into the next one. */
const VERSES: Record<string, string> = {
  GEN: '31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26',
  EXO: '22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38',
  LEV: '17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34',
  NUM: '54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13',
  DEU: '46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12',
  JOS: '18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33',
  JDG: '36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25',
  RUT: '22,23,18,22',
  '1SA': '28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13',
  '2SA': '27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25',
  '1KI': '53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53',
  '2KI': '18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30',
  '1CH': '54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30',
  '2CH': '17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23',
  EZR: '11,70,13,24,17,22,28,36,15,44',
  NEH: '11,20,32,23,19,19,73,18,38,39,36,47,31',
  EST: '22,23,15,17,14,14,10,17,32,3',
  JOB: '22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17',
  PSA: '6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6',
  PRO: '33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31',
  ECC: '18,26,22,16,20,12,29,17,18,20,10,14',
  SNG: '17,17,11,16,16,13,13,14',
  ISA: '31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24',
  JER: '19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34',
  LAM: '22,22,66,22,22',
  EZK: '28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35',
  DAN: '21,49,30,37,31,28,28,27,27,21,45,13',
  HOS: '11,23,5,19,15,11,16,14,17,15,12,14,16,9',
  JOL: '20,32,21',
  AMO: '15,16,15,13,27,14,17,14,15',
  OBA: '21',
  JON: '17,10,10,11',
  MIC: '16,13,12,13,15,16,20',
  NAM: '15,13,19',
  HAB: '17,20,19',
  ZEP: '18,15,20',
  HAG: '15,23',
  ZEC: '21,13,10,14,11,15,14,23,17,12,17,14,9,21',
  MAL: '14,17,18,6',
  MAT: '25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20',
  MRK: '45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20',
  LUK: '80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53',
  JHN: '51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25',
  ACT: '26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31',
  ROM: '32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27',
  '1CO': '31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24',
  '2CO': '24,17,18,18,21,18,16,24,15,18,33,21,14',
  GAL: '24,21,29,31,26,18',
  EPH: '23,22,21,32,33,24',
  PHP: '30,30,21,23',
  COL: '29,23,25,18',
  '1TH': '10,20,13,18,28',
  '2TH': '12,17,18',
  '1TI': '20,15,16,16,25,21',
  '2TI': '18,26,17,22',
  TIT: '16,15,15',
  PHM: '25',
  HEB: '14,18,19,16,14,20,28,13,28,39,40,29,25',
  JAS: '27,26,18,17,20',
  '1PE': '25,25,22,19,14',
  '2PE': '21,22,18',
  '1JN': '10,29,24,21,21',
  '2JN': '13',
  '3JN': '14',
  JUD: '25',
  REV: '20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21'
};

function versesIn(book: string, chapter: number): number {
  const counts = (VERSES[book] || '').split(',');
  return chapter >= 1 && chapter <= counts.length ? Number(counts[chapter - 1]) : 0;
}

/* The most chapters one passage may run across. Genesis 37-45, nine, is the
   longest the guides have used. Past this the sheet says it is too long and
   the chapter button is the way in, rather than Genesis 1-50 costing fifty
   requests. */
const MAX_CHAPTERS = 10;

/* How many chapters an id runs across: 1 for JHN.3.16 or JHN.3.16-JHN.3.18,
   2 for GEN.39.20-GEN.40.23 and NUM.13-NUM.14. */
function chapterSpan(id: string): number {
  const m = PASSAGE_ID.exec(id);
  if (!m) return 0;
  return m[4] ? Number(m[4]) - Number(m[2]) + 1 : 1;
}

/* A passage that runs across chapters, as one id per chapter. YouVersion
   answers 404 for GEN.39.20-GEN.40.23 and for NUM.13-NUM.14 in one request,
   but takes a chapter, or a range inside one, on its own:

     GEN.39.20-GEN.40.23   GEN.39.20-GEN.39.23, GEN.40
     NUM.13-NUM.14         NUM.13, NUM.14
     JHN.3.36-JHN.4.1      JHN.3.36, JHN.4.1

   A whole chapter is asked for as the chapter, the shape most likely to be
   in the cache already. Null for anything inside one chapter, anything
   running backwards, anything past MAX_CHAPTERS, and any verse that is not
   there. */
function chaptersOf(id: string, max = MAX_CHAPTERS): string[] | null {
  const m = PASSAGE_ID.exec(id);
  if (!m || !m[4] || !isPassageId(id)) return null;
  const book = m[1];
  const from = Number(m[2]);
  const to = Number(m[4]);
  if (to <= from || to - from + 1 > max || !versesIn(book, to)) return null;
  const out: string[] = [];
  for (let c = from; c <= to; c++) {
    const last = versesIn(book, c);
    const a = c === from && m[3] ? Number(m[3]) : 1;
    const b = c === to && m[5] ? Number(m[5]) : last;
    if (a < 1 || b > last || b < a) return null;
    out.push(a === 1 && b === last ? `${book}.${c}`
      : a === b ? `${book}.${c}.${a}`
      : `${book}.${c}.${a}-${book}.${c}.${b}`);
  }
  return out;
}

/* The reference for a passage put together from chapters, written the way
   the app writes it (Genesis 39:20-40:23, Numbers 13-14). The book's name is
   whatever YouVersion called it in the first chapter's reference. */
function joinedReference(firstReference: string, id: string): string {
  const m = PASSAGE_ID.exec(id);
  const name = String(firstReference || '').replace(/\s+\d+(?::\d+)?(?:-\d+)?$/, '').trim();
  if (!m || !name) return '';
  return m[3] ? `${name} ${m[2]}:${m[3]}-${m[4]}:${m[5]}` : `${name} ${m[2]}-${m[4]}`;
}

/* What YouVersion calls `content`, tidied for a sheet on a phone: no runs of
   spaces, no blank lines stacked on blank lines, nothing at either end. Line
   breaks survive, because in the Psalms they are the poetry. */
function tidy(text: string): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* @@ passage:end */

type Meta = { abbreviation: string; title: string; copyright: string };
type Passage = { reference: string; text: string };

// One per warm isolate. The version's copyright does not change between verses.
let metaMemo: { bibleId: number; meta: Meta } | null = null;

async function youversion(path: string, key: string): Promise<Response> {
  return await fetch(API + path, {
    headers: { 'X-YVP-App-Key': key, Accept: 'application/json' },
  });
}

async function fetchPassage(bibleId: number, id: string, key: string): Promise<Passage | number> {
  const res = await youversion(
    `/bibles/${bibleId}/passages/${encodeURIComponent(id)}?format=text`, key);
  if (!res.ok) return res.status;
  const body = await res.json();
  const text = tidy(body?.content);
  if (!text) return 404;
  return { reference: String(body?.reference || ''), text };
}

async function fetchMeta(bibleId: number, key: string): Promise<Meta | null> {
  const res = await youversion(`/bibles/${bibleId}`, key);
  if (!res.ok) return null;
  const body = await res.json();
  return {
    abbreviation: String(body?.localized_abbreviation || body?.abbreviation || ''),
    title: String(body?.localized_title || body?.title || ''),
    copyright: String(body?.copyright || ''),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'Use GET.' }, 405);

  const key = Deno.env.get('YVP_APP_KEY') ?? '';
  const bibleId = Number(Deno.env.get('YVP_BIBLE_ID')) || DEFAULT_BIBLE_ID;

  if (!key) {
    console.error('bible-passage: YVP_APP_KEY is not set');
    return json({ error: 'Verses are not switched on yet.' }, 503);
  }

  const id = new URL(req.url).searchParams.get('ref') ?? '';
  if (!isPassageId(id)) return json({ error: 'That is not a passage we can look up.' }, 400);

  /* The cache is a convenience and never a reason to fail. Any error from it,
     a missing table included, is logged and the request carries on to
     YouVersion as though it were not there. */
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const useCache = (Deno.env.get('YVP_CACHE') ?? '').toLowerCase() !== 'off';
  const db = useCache && url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  const since = new Date(Date.now() - CACHE_DAYS * 86400000).toISOString();

  async function cached(passageId: string): Promise<Passage | null> {
    if (!db) return null;
    const { data, error } = await db.from('scripture_cache')
      .select('reference, content')
      .eq('bible_id', bibleId).eq('passage_id', passageId)
      .gte('fetched_at', since)
      .maybeSingle();
    if (error) { console.error('bible-passage: cache read', error.message); return null; }
    return data ? { reference: data.reference, text: data.content } : null;
  }

  async function remember(passageId: string, p: Passage) {
    if (!db) return;
    const { error } = await db.from('scripture_cache').upsert({
      bible_id: bibleId,
      passage_id: passageId,
      reference: p.reference,
      content: p.text,
      fetched_at: new Date().toISOString(),
    });
    if (error) console.error('bible-passage: cache write', error.message);
  }

  /* Room for one more fresh lookup, or not. Never a reason to fail on its
     own: no database, or a counter that errors, lets the lookup through, the
     same way the cache does. The address is hashed before it is stored. */
  async function roomForFresh(): Promise<boolean> {
    if (!db) return true;
    const address = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
    const who = Array.from(new Uint8Array(digest).slice(0, 12))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    for (const [bucket, max] of [[`bible:${who}`, FRESH_PER_ADDRESS], ['bible:all', FRESH_FOR_EVERYBODY]] as const) {
      const { data, error } = await db.rpc('hc_rate_take', {
        p_bucket: bucket, p_max: max, p_window_seconds: 60,
      });
      if (error) { console.error('bible-passage: rate counter', error.message); return true; }
      if (data === false) return false;
    }
    return true;
  }

  async function meta(): Promise<Meta> {
    if (metaMemo && metaMemo.bibleId === bibleId) return metaMemo.meta;
    const hit = await cached(META_ID);
    let m: Meta | null = hit ? JSON.parse(hit.text) : null;
    if (!m) {
      m = await fetchMeta(bibleId, key);
      if (m) await remember(META_ID, { reference: m.title, text: JSON.stringify(m) });
    }
    // Never cached empty: a failed lookup is tried again on the next request.
    if (!m) return { abbreviation: 'NIV', title: '', copyright: '' };
    metaMemo = { bibleId, meta: m };
    return m;
  }

  /* One id YouVersion can answer in a single request, from the cache or
     fresh, and remembered once fetched. A number is the status to give up
     with: 429 when there is no room for another fresh lookup. */
  async function one(passageId: string): Promise<Passage | number> {
    const hit = await cached(passageId);
    if (hit) return hit;
    if (!(await roomForFresh())) return 429;
    let got = await fetchPassage(bibleId, passageId, key);

    /* A range YouVersion would not take in one go, asked for a verse at a
       time and joined. Only for a range inside one chapter, and only when
       the answer was "not like that" rather than "not allowed". */
    if (typeof got === 'number' && (got === 400 || got === 404)) {
      const verses = versesOf(passageId);
      if (verses) {
        const parts = await Promise.all(verses.map((v) => fetchPassage(bibleId, v, key)));
        if (parts.every((p) => typeof p !== 'number')) {
          const first = parts[0] as Passage;
          const last = parts[parts.length - 1] as Passage;
          got = {
            reference: first.reference && last.reference
              ? `${first.reference}-${last.reference.split(':').pop()}`
              : '',
            text: parts.map((p) => (p as Passage).text).join(' '),
          };
        }
      }
    }

    if (typeof got === 'number') {
      console.error(`bible-passage: YouVersion answered ${got} for ${passageId}`);
      return got;
    }
    await remember(passageId, got);
    return got;
  }

  function refuse(status: number) {
    if (status === 429) {
      return json({ error: 'That is a lot of verses at once. Try again in a minute.' }, 429,
        { 'Retry-After': '60' });
    }
    if (status === 404) return json({ error: 'We could not find that passage.' }, 404);
    if (status === 401 || status === 403) {
      return json({ error: 'Verses are not switched on yet.' }, 503);
    }
    return json({ error: 'The Bible is not answering right now. Try again in a moment.' }, 502);
  }

  if (chapterSpan(id) > MAX_CHAPTERS) {
    return json({ error: 'That passage is too long to show here. Read it a chapter at a time.' }, 400);
  }

  try {
    let passage: Passage | null;
    const pieces = chaptersOf(id);

    if (!pieces) {
      // Inside one chapter, the way nearly every reference is.
      const got = await one(id);
      if (typeof got === 'number') return refuse(got);
      passage = got;
    } else {
      /* Across chapters, which YouVersion will not take in one request: a
         chapter at a time, each from the cache when it is there, joined with
         a paragraph break where one chapter ends and the next begins. The
         whole is remembered too, so the next phone gets it in one read. */
      passage = await cached(id);
      if (!passage) {
        const parts = await Promise.all(pieces.map(one));
        const failed = parts.find((p) => typeof p === 'number');
        if (failed !== undefined) return refuse(failed as number);
        const done = parts as Passage[];
        passage = {
          reference: joinedReference(done[0].reference, id),
          text: done.map((p) => p.text).join('\n\n'),
        };
        await remember(id, passage);
      }
    }

    const m = await meta();
    return json({
      id,
      reference: passage.reference,
      text: passage.text,
      version: { id: bibleId, abbreviation: m.abbreviation, copyright: m.copyright },
    }, 200, { 'Cache-Control': 'public, max-age=86400' });
  } catch (err) {
    console.error('bible-passage: failed', String((err as Error)?.message ?? err));
    return json({ error: 'The Bible is not answering right now. Try again in a moment.' }, 502);
  }
});
