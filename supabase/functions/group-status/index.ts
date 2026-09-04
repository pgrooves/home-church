/**
 * Home Church, keeping the home groups card on Connect current.
 *
 * WHAT IT DOES. Reads the announcements the church has already published,
 * finds the most recent one about home groups, shortens it to fit the card on
 * the Connect tab where the group finder would be, and writes it there along
 * with which season the card should say it is in. One model call, no mailbox,
 * nothing on a schedule.
 *
 * WHO CALLS IT. An admin, by tapping "Update from the latest announcement" at
 * the foot of Settings -> Admin -> Announcements. That reaches
 * `public.hc_admin_refresh_group_status()` (migrations 0048 and 0050), which
 * checks hc_is_admin(), enforces a fifteen second cooldown, and posts here
 * with pg_net. pg_net is fire and forget, so the response goes nowhere: this
 * function writes its own outcome to `group_status_runs`, and the app watches
 * that table for a row newer than the one it started with. Every exit below
 * therefore writes exactly one row.
 *
 * WHY IT IS ITS OWN FUNCTION rather than another mode inside newsletter-intake,
 * where it started life and where migration 0048 said it would live. Two
 * reasons, and the second one is the one that moved it:
 *
 *   It is a different job. That function is two hundred lines of hand written
 *   IMAP client wrapped around a mailbox. This never opens a socket to
 *   anything but Google, and it reads a table the other function happens to
 *   write. Sharing a deployment made them one thing to redeploy and one thing
 *   to break.
 *
 *   And a small function can be deployed by whoever is holding the keyboard.
 *   The intake is a hundred kilobytes; this is one screen of prompt and one of
 *   checking. Shipping a fix to this feature should not mean redeploying the
 *   church's mailbox reader.
 *
 * WHAT IT MUST NOT DO, and this is the whole of the difference between this and
 * the newsletter intake next door. Everything the intake writes waits in a
 * review queue, because it runs every twenty minutes with nobody watching and
 * it writes a card that goes to the whole church. This writes straight to a
 * public paragraph — so it only ever runs when a person presses a button that
 * says what it will do, and the two things below are load bearing:
 *
 *   Every link, date, time and phone number in the announcement has to survive
 *   the shortening. Checked after the model answers and before anything is
 *   written; one retry naming what was dropped; and if the second answer drops
 *   something too, nothing is written at all. A paragraph that reads well and
 *   has lost the number you text to get into a group is worse than the
 *   between-seasons sentence it replaced.
 *
 *   The previous words are kept in the run log, so a shortening nobody likes
 *   is one tap from being put back.
 *
 * IT NEVER TOUCHES `groups_in_season`. That column draws the group finder out
 * of the `groups` table, which still holds the placeholder rows migration 0008
 * left there. What this writes is `groups_note_in_season`, which is a fact
 * about the card. Migration 0049's header is the long version.
 *
 * SECRETS, all of which already exist for the newsletter intake and are shared
 * project wide, so turning this on adds no setup:
 *
 *   HC_NEWSLETTER_CRON_SECRET   proves the caller is our database
 *   GEMINI_API_KEY              from Google AI Studio
 *   GEMINI_MODEL                optional, defaults below
 *
 * WHY verify_jwt IS OFF. Same answer as newsletter-intake and send-push: the
 * caller is Postgres, which has no user session to present. It proves itself
 * with the shared secret, compared in constant time below, whose entire power
 * is "cause one paragraph to be rewritten from an announcement the church has
 * already published".
 *
 * BY HAND, when something looks wrong:
 *   curl -X POST https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/group-status \
 *     -H "x-hc-cron-secret: <the secret>" -H "Content-Type: application/json" \
 *     -d '{"dry_run": true}'
 *
 * `dry_run` does everything except the two writes: no paragraph, no run row.
 * It returns what it would have written, so a bad shortening can be looked at
 * before it is on a screen.
 *
 * `{"models": true}` answers the question that comes up every time Google
 * congests or retires something: which model should GEMINI_MODEL be set to
 * today. It asks the API which models this key can reach, then sends each
 * likely one a two word prompt and reports what came back. Nothing about the
 * church is in that request and nothing is written; the key never leaves the
 * function. This exists because the alternative is pasting an API key into a
 * terminal to run curl, and because "Gemini is busy" is a sentence somebody
 * will read again in six months with no idea what to try instead.
 *
 * DEPLOY
 *   supabase functions deploy group-status --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

/* The model, overridable by secret so a model being retired or congested is a
   dashboard edit rather than a redeploy. The default is the one the newsletter
   intake settled on after measuring: gemini-3.5-flash answers in about twenty
   seconds where the newer Flash models were returning 503 on the free tier and
   the preview model spent nine thousand tokens thinking and never finished its
   JSON. See NEWSLETTER_INTAKE_SETUP.md, "When the model breaks". */
const DEFAULT_MODEL = 'gemini-3.5-flash';

/* How many announcements to look at, and how long the answer may be.

   TWELVE, because the question is "what did the church last say about home
   groups" and the answer is nearly always the newest one. A wider net costs
   tokens and invites the model to reach past a current announcement for an
   older one whose wording it likes better.

   300 CHARACTERS, because that box holds a paragraph. The between-seasons
   sentence the app ships with is 148 and reads as one comfortable block on a
   phone; twice that is where it starts to be a wall. A cap, not a target, and
   the prompt says so. */
const LOOKBACK = 12;
const NOTE_MAX = 300;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* Constant time compare, the same four lines send-push and newsletter-intake
   both carry: a plain === leaks the length of the matching prefix through
   timing, and not doing that is cheap. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Gemini being busy is not this feature being broken, and the two get
   different sentences. 429 and 5xx are the free tier having a moment; the
   right answer to both is "nothing was changed, try again in a minute". */
class TransientError extends Error {}

function todayInChicago(): string {
  // en-CA formats as YYYY-MM-DD. The church is in Metairie; the model is told
  // today's date so it can read "this Sunday" without guessing a year.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

interface GroupRow {
  id: string;
  title: string;
  body: string;
  written: string;
  links: string[];
  image: string;
}

/* Every link on an announcement, wherever it is kept.

   THREE PLACES AND NOT ONE, which is a fact about the table rather than a
   choice made here: link_url is the card's own button (migration 0033), the
   anchors in body_html are the ones inside the words the intake wrote, and a
   bare URL in the plain body is what an admin writing by hand produces. A
   check that only knew about the first would happily let the model drop a
   sign-up link that lives in the second. */
function announcementLinks(row: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (u: unknown) => {
    const url = String(u ?? '').trim();
    if (url && !out.includes(url)) out.push(url);
  };

  add(row.link_url);

  const html = String(row.body_html ?? '');
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) add(m[1]);

  const body = String(row.body ?? '');
  for (const m of body.matchAll(/https?:\/\/[^\s<>"')]+/gi)) add(m[0]);

  return out;
}

/* ------------------------------------------------------------------------
   What has to survive the shortening

   Three kinds of thing, and each is checked the way it is actually written
   rather than by string equality, because "September 6" and "Sept 6" are the
   same date and a check that said otherwise would refuse every good answer the
   model gives.

   A LINK is checked exactly. There is one correct spelling of a URL and the
   model was handed it.

   A PHONE NUMBER is checked on its digits. (833) 801-3857 and 833-801-3857 are
   the same number and the church writes it both ways.

   A DATE is checked as a month and a day, in any of the ways a person writes
   them: "September 6", "Sept 6", "Sep 6th", "9/6". A TIME the same, with or
   without the minutes and the space. What this deliberately does not do is
   resolve "this Sunday" — the model is told to keep those words as they are,
   and a relative date that survived word for word passes here because the
   words are what was checked.
   --------------------------------------------------------------------- */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function digitsOnly(text: string): string {
  return text.replace(/\D+/g, '');
}

function monthDayTokens(text: string): Array<{ label: string; month: number; day: number }> {
  const out: Array<{ label: string; month: number; day: number }> = [];
  const seen = new Set<string>();

  const push = (label: string, month: number, day: number) => {
    const key = `${month}-${day}`;
    if (month < 1 || month > 12 || day < 1 || day > 31 || seen.has(key)) return;
    seen.add(key);
    out.push({ label, month, day });
  };

  // "September 6", "Sept 6th", "Sep. 6"
  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  for (const m of text.matchAll(named)) {
    push(m[0], MONTHS.indexOf(m[1].toLowerCase()) + 1, parseInt(m[2], 10));
  }

  // "9/6", "9/6/26". The year is dropped: this is a check that the day
  // survived, not a date parser.
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) {
    push(m[0], parseInt(m[1], 10), parseInt(m[2], 10));
  }

  return out;
}

function hasMonthDay(note: string, month: number, day: number): boolean {
  const flat = note.toLowerCase();
  const name = MONTHS[month - 1];
  const named = new RegExp(`\\b${name}[a-z]*\\.?\\s+0?${day}(?:st|nd|rd|th)?\\b`);
  const numeric = new RegExp(`\\b0?${month}\\/0?${day}\\b`);
  return named.test(flat) || numeric.test(flat);
}

function timeTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/gi)) {
    const hour = parseInt(m[1], 10);
    const minute = m[2] ?? '00';
    const half = m[3].toLowerCase();
    const token = `${hour}:${minute}${half}m`;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

/* A token is always "9:00am": hour, colon, two minutes, am or pm. Both sides
   are flattened of spaces and full stops first, so "9:00 AM", "9:00a.m." and
   "9am" are all the same time as far as this is concerned. The bare form
   counts only on the hour, because "7pm" does not carry "7:30pm". */
function hasTime(note: string, token: string): boolean {
  const half = token.slice(-2);
  const [hour, minute] = token.slice(0, -2).split(':');
  const flat = note.toLowerCase().replace(/[\s.]+/g, '');
  const withMinutes = `${parseInt(hour, 10)}:${minute}${half}`;
  const bare = `${parseInt(hour, 10)}${half}`;
  return flat.includes(withMinutes) || (minute === '00' && flat.includes(bare));
}

/* Everything in the announcement the shortened note has to still carry, as a
   list of complaints when it does not. An empty list is a pass. */
function whatWasLost(source: string, links: string[], note: string): string[] {
  const lost: string[] = [];

  for (const url of links) {
    if (!note.includes(url)) lost.push(`the link ${url}`);
  }

  // Ten digits or more: a phone number, not a date and not a dollar amount.
  const noteDigits = digitsOnly(note);
  for (const m of source.matchAll(/(?:\+?\d[\d\s().-]{8,}\d)/g)) {
    const digits = digitsOnly(m[0]);
    if (digits.length >= 10 && !noteDigits.includes(digits)) {
      lost.push(`the number ${m[0].trim()}`);
    }
  }

  for (const token of monthDayTokens(source)) {
    if (!hasMonthDay(note, token.month, token.day)) lost.push(`the date ${token.label}`);
  }

  for (const token of timeTokens(source)) {
    if (!hasTime(note, token)) lost.push(`the time ${token.replace(':00', '')}`);
  }

  return lost;
}

/* ------------------------------------------------------------------------
   Asking
   --------------------------------------------------------------------- */

/* `in_season` is required alongside `found` rather than optional, which is the
   same lesson the newsletter intake's backfill schema learned the hard way: a
   field the model may leave out is a field it leaves out. Labelling every
   answer is a task it does reliably; speaking up only sometimes is not. */
const SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    announcement_id: { type: 'string' },
    note: { type: 'string' },
    in_season: { type: 'boolean' },
  },
  required: ['found'],
};

function prompt(rows: GroupRow[], today: string, retry: string[]): string {
  return [
    'Below are the most recent announcements from a church app, newest first.',
    `Today is ${today}.`,
    '',
    'ONE: decide which of them, if any, is the church\'s most recent word about HOME',
    'GROUPS — small groups that meet in homes during the week. Sign-ups opening, a',
    'season starting or ending, how to join, where they meet. An announcement about a',
    'one-off event, a serve day, a class, a women\'s night or a conference is NOT a',
    'home groups announcement, however warm it is. If none of them is about home',
    'groups, set found false and stop.',
    '',
    'TWO: write that announcement as ONE short paragraph for a box on the Connect',
    `screen headed "Home groups". At most ${NOTE_MAX} characters, and shorter is`,
    'better. Plain sentences, no bullets, no headings, no markdown, no emoji. Warm and',
    'plain, the way one person tells another where something stands. Do not open with',
    '"Attention" or "Exciting news".',
    '',
    'WHAT YOU MAY NOT DROP, and this is the part that matters most. Every link, every',
    'date, every time and every phone number in that announcement has to appear in',
    'your paragraph. Copy each one exactly as it is written: a URL character for',
    'character, a phone number with its own punctuation, a date the way the church',
    'wrote it. Shorten the words around them, never them. If keeping all of them',
    `takes you past ${NOTE_MAX} characters, drop adjectives and whole sentences of`,
    'encouragement until it fits — never a detail somebody needs in order to turn up.',
    '',
    'Invent nothing. No date that is not there, no link that is not there, and nothing',
    'about groups being "open to everyone" or "filling fast" unless the announcement',
    'says so. If it says "this Sunday", write "this Sunday" — do not work out which',
    'Sunday it was.',
    '',
    'THREE: set in_season. True if that announcement is telling people groups are',
    'running or about to be — opening, launching, taking sign-ups, still taking',
    'sign-ups, meeting this week. False if it is telling them a season has finished or',
    'is paused — wrapping up, taking a break, back in the spring, no groups over the',
    'summer. Judge the announcement, not the calendar: an announcement from August',
    'saying groups open in September is in season, because that is what the church has',
    'most recently said about them.',
    '',
    'Return the id of the announcement you used, so a person can check your work.',
    ...(retry.length
      ? ['',
        'YOUR PREVIOUS ANSWER WAS REJECTED because it dropped ' + retry.join(', ') + '.',
        'Write it again and keep every one of those, exactly as the announcement has it.']
      : []),
    '',
    'ANNOUNCEMENTS',
    ...rows.map((r) => [
      `--- id: ${r.id}`,
      `posted: ${r.written}`,
      `title: ${r.title}`,
      `text: ${r.body.slice(0, 1500)}`,
      r.links.length ? `links: ${r.links.join(' , ')}` : 'links: none',
    ].join('\n')),
  ].join('\n');
}

async function ask(
  apiKey: string,
  model: string,
  rows: GroupRow[],
  today: string,
  retry: string[],
): Promise<{ found?: boolean; announcement_id?: string; note?: string; in_season?: boolean }> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt(rows, today, retry) }] }],
          generationConfig: {
            temperature: 0.2,
            /* Generous, and it is the thinking that spends it rather than the
               answer: this asks for one short paragraph and gets back a few
               hundred tokens of JSON after a few thousand of thought. A model
               that hits the ceiling stops mid-JSON and the parse below fails. */
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
          },
        }),
      },
    );
  } catch (err) {
    // DNS, TLS, a reset socket. None of it is the announcement's fault.
    throw new TransientError(`Could not reach Gemini: ${String((err as Error).message ?? err)}`);
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new TransientError(
        'Gemini is rate limiting us on the free tier. Nothing was changed, try again in a minute.');
    }
    if (res.status >= 500) {
      throw new TransientError(
        `Gemini is busy (${res.status}). Nothing was changed, try again in a minute.`);
    }
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini returned ${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await res.json();

  /* Gemini 3 returns thought parts alongside the answer and only some parts
     carry `text`. Concatenating every text part is what survives that, and it
     is also correct for an answer split across parts. */
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map((p: { text?: string }) => p?.text ?? '').join('').trim();

  if (!raw) {
    const reason = payload?.candidates?.[0]?.finishReason ?? 'no reason given';
    throw new Error(`Gemini returned nothing to parse (${reason}).`);
  }

  return JSON.parse(raw);
}

/* ------------------------------------------------------------------------
   Which model to use today

   WHY THIS IS IN THE APP'S OWN CODE rather than in a runbook. Twice now the
   answer to "why did nothing get parsed" has been that Google was shedding
   load on the model this project names, and both times the fix was one word in
   one secret. What made it slow was not the fix, it was finding out which word:
   the honest way needs the API key in a terminal, and the key lives in a
   secrets page precisely so it is not in terminals.

   So the function that holds the key asks on our behalf. It reports names and
   status codes, nothing else, and it writes nothing at all.

   PREFERRING FLASH, and saying why out loud: this job is one short paragraph
   out of a page of announcements, on a free tier measured in requests per day.
   Flash answers it in twenty seconds. A Pro model would answer it slightly
   better, considerably slower, and would spend a quota that exists for the
   newsletter reader too.
   --------------------------------------------------------------------- */

interface ModelTry {
  model: string;
  status: number | string;
  ok: boolean;
  note?: string;
}

/* A one word answer is all this needs: the question is "does this model answer
   this key right now", not "is it any good". maxOutputTokens is deliberately
   small, and a thinking model that spends it all before replying still tells us
   what we asked, because it answers 200 either way. */
async function tryModel(apiKey: string, model: string): Promise<ModelTry> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 64 },
        }),
      },
    );

    if (res.ok) return { model, status: 200, ok: true };

    const detail = await res.text().catch(() => '');
    return {
      model,
      status: res.status,
      ok: false,
      note: res.status === 503
        ? 'busy'
        : res.status === 429
          ? 'rate limited'
          : detail.slice(0, 120),
    };
  } catch (err) {
    return { model, status: 'unreachable', ok: false, note: String((err as Error).message ?? err) };
  }
}

async function listModels(apiKey: string, current: string): Promise<Record<string, unknown>> {
  let names: string[] = [];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, note: `Could not list models: ${res.status} ${detail.slice(0, 200)}` };
    }
    const payload = await res.json();
    names = (payload?.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: { name?: string }) => String(m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
  } catch (err) {
    return { ok: false, note: `Could not reach Gemini: ${String((err as Error).message ?? err)}` };
  }

  /* Flash first, newest first within that, and never a preview or an
     experimental build: this runs unattended behind a button somebody presses
     twice a season, and a model that can be withdrawn without notice is not a
     thing to point a church at. The current one is always tried, whatever it
     is, because "is it back yet" is half the question. */
  const candidates = names
    .filter((n) => /flash/.test(n) && !/(preview|exp|thinking|image|tts|live)/.test(n))
    .sort()
    .reverse()
    .slice(0, 6);

  if (!candidates.includes(current)) candidates.unshift(current);

  const tried: ModelTry[] = [];
  for (const model of candidates) tried.push(await tryModel(apiKey, model));

  const working = tried.filter((t) => t.ok).map((t) => t.model);

  return {
    ok: true,
    current,
    current_works: tried.some((t) => t.model === current && t.ok),
    working,
    suggestion: working.find((m) => m !== current) ?? working[0] ?? null,
    tried,
    reachable_count: names.length,
    note: working.length
      ? 'Set GEMINI_MODEL in Project Settings -> Edge Functions -> Secrets to one of `working`. Both functions read it on the next run; neither needs redeploying.'
      : 'Nothing answered. That is Google having a bad afternoon rather than a setting: the newsletter leaves the email untouched and the next tick tries again.',
  };
}

/* ------------------------------------------------------------------------
   The run
   --------------------------------------------------------------------- */

async function run(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  model: string,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  /* Published rows only, and that is the whole filter. A draft in the review
     queue has not been agreed to by anybody, and this writes to a screen the
     church can see: shortening an unapproved draft onto Connect would be the
     review queue leaking out of its back door. */
  const { data, error } = await admin
    .from('announcements')
    .select('id, title, body, body_html, link_url, image_url, created_at')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(LOOKBACK);

  if (error) throw new Error(`Could not read the announcements: ${error.message}`);

  const rows: GroupRow[] = (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    written: String(r.created_at ?? '').slice(0, 10),
    links: announcementLinks(r as Record<string, unknown>),
    image: String(r.image_url ?? '').trim(),
  }));

  if (!rows.length) {
    return { ok: true, changed: false, note: 'There are no announcements to read yet.' };
  }

  const today = todayInChicago();

  /* One retry, and only for a dropped detail. The first answer is usually
     right; when it is not, naming the exact thing it lost is the correction
     that works, and it costs one more call on a button pressed a few times a
     season. A second failure is reported rather than retried again: at that
     point the model is not going to keep the link, and the honest outcome is
     the card keeping the words it already had. */
  let answer = await ask(apiKey, model, rows, today, []);
  let picked = rows.find((r) => r.id === String(answer.announcement_id ?? '')) ?? null;
  let note = String(answer.note ?? '').replace(/\s+/g, ' ').trim();

  // Nothing about home groups, which is the ordinary answer for most of the
  // year and is a success.
  if (answer.found !== true) {
    return {
      ok: true,
      changed: false,
      note: `Nothing in the last ${rows.length} announcements is about home groups, so the card was left as it is.`,
    };
  }

  /* Said it found one and then did not name it, or named one we did not send.
     Rare, and worth its own sentence rather than being folded into the line
     above: "nothing was posted about home groups" would be a lie, and whoever
     read it would go looking for an announcement that is in fact sitting
     there. */
  if (!picked || !note) {
    return {
      ok: false,
      changed: false,
      note: 'The answer did not name one of the announcements it was given, so nothing was changed. Try again in a moment.',
    };
  }

  let lost = whatWasLost(picked.title + '\n' + picked.body, picked.links, note);

  if (lost.length) {
    answer = await ask(apiKey, model, rows, today, lost);
    const second = rows.find((r) => r.id === String(answer.announcement_id ?? '')) ?? null;
    const secondNote = String(answer.note ?? '').replace(/\s+/g, ' ').trim();
    if (answer.found === true && second && secondNote) {
      picked = second;
      note = secondNote;
      lost = whatWasLost(second.title + '\n' + second.body, second.links, note);
    }
  }

  // Const from here down, so nothing below has to wonder whether the retry
  // moved it.
  const chosen = picked;

  if (lost.length) {
    // Not written. Named, so an admin knows what to type in by hand rather
    // than guessing what the robot disliked about the announcement.
    return {
      ok: false,
      changed: false,
      announcement_id: chosen.id,
      note: `The shortened version dropped ${lost.join(', ')}, so nothing was changed.`,
    };
  }

  /* The ceiling is checked here as well as asked for. A model that ran long is
     not a reason to refuse a good paragraph, but a paragraph that would
     overflow the box is not one either, so this is the one place a bad answer
     is trimmed rather than rejected — at a sentence boundary, so it never ends
     mid-word, and only when there is a sentence to cut at. */
  if (note.length > NOTE_MAX) {
    const cut = note.slice(0, NOTE_MAX);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    const trimmed = stop > 80 ? cut.slice(0, stop + 1) : '';
    const kept = trimmed || note;
    const stillLost = whatWasLost(chosen.title + '\n' + chosen.body, chosen.links, kept);
    if (stillLost.length) {
      return {
        ok: false,
        changed: false,
        announcement_id: chosen.id,
        note: `The shortened version was too long for the box, and cutting it to fit would have dropped ${stillLost.join(', ')}. Nothing was changed.`,
      };
    }
    note = kept;
  }

  const { data: profile, error: readError } = await admin
    .from('church_profile')
    .select('id, groups_off_season_note, groups_note_image_url, groups_note_in_season')
    .eq('published', true)
    .limit(1);

  if (readError) throw new Error(`Could not read the church profile: ${readError.message}`);

  /* Both halves of what the card says now, kept so undoing puts it back whole.
     A run that carried a flyer over and was then undone note-only would leave
     this season's poster above last season's sentence. */
  const previous = profile?.[0]?.groups_off_season_note ?? null;
  const previousImage = profile?.[0]?.groups_note_image_url ?? null;

  /* Which face the card should be wearing. An answer that left the field out
     is read as in season rather than as a season that has ended, because it
     got here by finding a current announcement about home groups and the
     ordinary reason a church posts one is that groups are happening. The
     costly mistake is the other way: "Between seasons" over a paragraph
     explaining how to join. */
  const inSeason = answer.in_season !== false;
  const seasonMoved = (profile?.[0]?.groups_note_in_season === true) !== inSeason;

  if (String(previous ?? '').trim() === note && !seasonMoved) {
    return {
      ok: true,
      changed: false,
      in_season: inSeason,
      announcement_id: chosen.id,
      previous_note: previous,
      previous_image: previousImage,
      note: 'The card already says this, so nothing was changed.',
    };
  }

  /* The words and the label in one write, which is the whole reason the label
     is decided here rather than by a second call afterwards. "Between seasons"
     standing over a paragraph about how to join a group is the bug this exists
     to fix, and two writes are two chances to leave the card in exactly that
     state.

     groups_in_season is NOT in this update and must never be: that boolean
     draws the group finder from the `groups` table, which still holds the
     placeholder rows migration 0008 left there. */
  const update: Record<string, unknown> = {
    groups_off_season_note: note,
    groups_note_in_season: inSeason,
  };

  /* The flyer, when the announcement has one. Carried over rather than
     uploaded: it is the church's own art for this season and it is already on
     Home, so nothing new is being published here. An admin who wants a
     different one replaces it in the form, and one who wants none takes it
     off there. */
  if (chosen.image) update.groups_note_image_url = chosen.image;

  const result = {
    ok: true,
    changed: true,
    in_season: inSeason,
    announcement_id: chosen.id,
    previous_note: previous,
    previous_image: previousImage,
    new_note: note,
    note: inSeason
      ? `Shortened from ${chosen.title}, and the card now says groups are open.`
      : `Shortened from ${chosen.title}, which says this season has finished.`,
  };

  if (dryRun) return { ...result, changed: false, dry_run: true };

  const { error: writeError } = await admin
    .from('church_profile')
    .update(update)
    .eq('published', true);

  if (writeError) throw new Error(`Could not write the note: ${writeError.message}`);

  return result;
}

/* ========================================================================
   main
   ===================================================================== */

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const cronSecret = Deno.env.get('HC_NEWSLETTER_CRON_SECRET');
  if (!cronSecret) {
    console.error('group-status: HC_NEWSLETTER_CRON_SECRET is not set on this function');
    return json({ error: 'Not configured.' }, 500);
  }
  if (!secretsMatch(req.headers.get('x-hc-cron-secret') ?? '', cronSecret)) {
    return json({ error: 'No.' }, 401);
  }

  let body: { dry_run?: boolean; models?: boolean } = {};
  try { body = await req.json(); } catch { /* an empty body is the ordinary call */ }
  const dryRun = body.dry_run === true;
  const models = body.models === true;

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Platform env missing.' }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* EVERY EXIT WRITES A ROW, except a dry run, which is a person at a keyboard
     reading the response. This is the only record there is: pg_net threw the
     response away the moment the request was accepted, and the Admin screen is
     watching this table for a row newer than the one it started with. A path
     out of here that wrote nothing would leave a button spinning for a minute
     and then apologising for a run that in fact succeeded. */
  const settle = async (row: Record<string, unknown>) => {
    if (!dryRun) {
      const { error } = await admin.from('group_status_runs').insert({
        ok: row.ok === true,
        changed: row.changed === true,
        in_season: row.in_season ?? null,
        announcement_id: row.announcement_id ?? null,
        previous_note: row.previous_note ?? null,
        previous_image: row.previous_image ?? null,
        new_note: row.new_note ?? null,
        note: row.note ?? null,
      });
      if (error) console.error('group-status: could not log the run:', error.message);
    }
    return json(row);
  };

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

  if (!geminiKey) {
    return await settle({
      ok: false,
      changed: false,
      note: 'Not set up yet: GEMINI_API_KEY is missing from this function\'s secrets.',
    });
  }

  /* Answers before the run, and writes no log row: this is a person at a
     keyboard asking what to put in a secret, not an attempt to update the
     card. */
  if (models) return json(await listModels(geminiKey, model));

  try {
    return await settle(await run(admin, geminiKey, model, dryRun));
  } catch (err) {
    console.error('group-status failed:', err);
    /* A busy model and a broken one read the same to a person standing at a
       button, so both say the same true thing: nothing was changed. The
       difference is the sentence TransientError carries, which names waiting a
       minute as the fix. */
    return await settle({
      ok: false,
      changed: false,
      note: String((err as Error).message ?? err),
    });
  }
});
