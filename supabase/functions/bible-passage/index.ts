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

/* What YouVersion calls `content`, tidied for a sheet on a phone: no runs of
   spaces, no blank lines stacked on blank lines, nothing at either end. Line
   breaks survive, because in the Psalms they are the poetry. */
function tidy(text: string): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
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

  try {
    let passage = await cached(id);

    if (!passage) {
      let got = await fetchPassage(bibleId, id, key);

      /* A range YouVersion would not take in one go, asked for a verse at a
         time and joined. Only for a range inside one chapter, and only when
         the answer was "not like that" rather than "not allowed". */
      if (typeof got === 'number' && (got === 400 || got === 404)) {
        const verses = versesOf(id);
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
        console.error(`bible-passage: YouVersion answered ${got} for ${id}`);
        if (got === 404) return json({ error: 'We could not find that passage.' }, 404);
        if (got === 401 || got === 403) {
          return json({ error: 'Verses are not switched on yet.' }, 503);
        }
        return json({ error: 'The Bible is not answering right now. Try again in a moment.' }, 502);
      }

      passage = got;
      await remember(id, passage);
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
