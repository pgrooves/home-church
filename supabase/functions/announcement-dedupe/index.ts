/**
 * Home Church, noticing when the newsletter says the same thing twice.
 *
 * WHAT IT IS FOR. The church emails about Homecoming in September, again in
 * early October with a ticket link, and again the week before with a change of
 * time. Every one of those parses into a new announcement, so Home ends up
 * carrying three cards about one night, and the newest of them is not
 * necessarily the fullest. This reads the drafts nobody has reviewed yet,
 * compares them with the announcements the church already has, and writes down
 * which draft looks like an update to which card, and what is new in it.
 *
 * IT MERGES NOTHING. That is the whole design. It writes three columns on the
 * draft — duplicate_of, duplicate_note, dedupe_checked_at — and stops. The
 * merge is a person tapping "Update it" in the review queue, which calls
 * hc_admin_apply_announcement_update in migration 0051. A model that could
 * quietly rewrite a card the church has already seen and approved is a
 * different and much worse thing than a model that fills a queue, and this
 * project has kept that line since 0038.
 *
 * WHO CALLS IT. pg_cron, every five minutes, through public.hc_dedupe_tick(),
 * which returns without calling anything unless a draft is actually waiting to
 * be checked. So the ordinary week is one index lookup every five minutes and
 * a handful of model calls when a newsletter lands.
 *
 * ONE CALL FOR THE WHOLE BATCH, not one per draft. A newsletter carries four or
 * five items and they are compared against the same list of existing cards;
 * asking five times would cost five times as much and would let the model give
 * two drafts the same parent without noticing. The answer is one entry per
 * draft, flagged rather than filtered, which is the lesson the intake's own
 * backfill schema learned: a sparse answer is a filtering task and the model is
 * cautious with it, a complete one is a labelling task and it is not.
 *
 * SECRETS, all shared project-wide and already set for the newsletter intake:
 *   HC_NEWSLETTER_CRON_SECRET, GEMINI_API_KEY, GEMINI_MODEL (optional)
 *
 * BY HAND:
 *   curl -X POST https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/announcement-dedupe \
 *     -H "x-hc-cron-secret: <the secret>" -H "Content-Type: application/json" \
 *     -d '{"dry_run": true}'
 *
 * `dry_run` compares everything and writes nothing, including the checked
 * stamp, so it can be run twice on the same drafts while reading the answers.
 * `{"all": true}` re-checks drafts that have already been checked, which is
 * what to use after changing the prompt.
 *
 * DEPLOY
 *   supabase functions deploy announcement-dedupe --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEFAULT_MODEL = 'gemini-3.5-flash';

/* How much to compare against, and how many to do at once.

   SIXTY DAYS BACK, plus anything still dated in the future however old the row
   is. A reminder about a Christmas concert can arrive in November about a card
   written in September, and the whole point of this is catching exactly that.

   TWENTY-FIVE CARDS is a wide net for a church that posts a handful a month,
   and it keeps the prompt inside the budget that made the intake reliable. */
const CANDIDATE_DAYS = 60;
const MAX_CANDIDATES = 25;
const MAX_DRAFTS = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

class TransientError extends Error {}

interface Row {
  id: string;
  title: string;
  body: string;
  written: string;
  starts_on: string | null;
  ends_on: string | null;
}

function shape(r: Record<string, unknown>): Row {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    body: String(r.body ?? '').slice(0, 700),
    written: String(r.created_at ?? '').slice(0, 10),
    starts_on: (r.starts_on as string | null) ?? null,
    ends_on: (r.ends_on as string | null) ?? null,
  };
}

/* ONE ENTRY PER DRAFT, flagged rather than filtered. `same_thing` false is a
   real answer and the common one; `match_id` is only read when it is true. */
const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          draft_id: { type: 'string' },
          same_thing: { type: 'boolean' },
          match_id: { type: 'string' },
          whats_new: { type: 'string' },
        },
        required: ['draft_id', 'same_thing'],
      },
    },
  },
  required: ['results'],
};

function prompt(drafts: Row[], candidates: Row[]): string {
  return [
    'A church app turns each item in its weekly email newsletter into an announcement',
    'card. The same real-world thing often gets emailed about more than once: a save',
    'the date, then a reminder with a ticket link, then a change of time. Those should',
    'be one card that gets updated, not three cards.',
    '',
    'Below are NEW DRAFTS that nobody has reviewed yet, and EXISTING CARDS the church',
    'already has. For EVERY draft, return one entry saying whether it is about the same',
    'real-world thing as one of the existing cards.',
    '',
    'SAME THING means the same event, the same sign-up, the same series, the same',
    'deadline. It is still the same thing when:',
    '  - the name changed ("Women\'s Night" and "Ladies Night" on the same date)',
    '  - the wording is completely rewritten',
    '  - the time, the price, the venue or the link changed',
    '  - one says "save the date" and the other says "tickets are live"',
    '',
    'It is NOT the same thing when it is:',
    '  - the next occurrence of something recurring (September\'s serve day and',
    '    October\'s serve day are two things, even with identical wording)',
    '  - a different event that happens to share a date or an audience',
    '  - a general invitation next to a specific dated event',
    'When you are not sure, say false. A wrongly merged card loses words somebody',
    'wrote; a wrongly separate card is two cards an admin can see and fix in a tap.',
    '',
    'For a match, also write `whats_new`: one short sentence, at most 140 characters,',
    'saying what the draft carries that the existing card does not — "adds a ticket',
    'link and moves it to 6:30pm", "same night, now says dinner is included". If the',
    'draft genuinely adds nothing, say "nothing new, just a reminder". Write it for an',
    'admin deciding in one glance, not as a summary of the whole announcement.',
    '',
    'match_id must be copied exactly from an EXISTING CARD id below. Never invent one,',
    'and never point a draft at another draft.',
    '',
    'NEW DRAFTS',
    ...drafts.map((d) => [
      `--- draft_id: ${d.id}`,
      `posted: ${d.written}`,
      `title: ${d.title}`,
      d.starts_on || d.ends_on ? `dates: ${d.starts_on ?? '-'} to ${d.ends_on ?? '-'}` : 'dates: none',
      `text: ${d.body}`,
    ].join('\n')),
    '',
    'EXISTING CARDS',
    ...candidates.map((c) => [
      `--- id: ${c.id}`,
      `posted: ${c.written}`,
      `title: ${c.title}`,
      c.starts_on || c.ends_on ? `dates: ${c.starts_on ?? '-'} to ${c.ends_on ?? '-'}` : 'dates: none',
      `text: ${c.body}`,
    ].join('\n')),
  ].join('\n');
}

interface Answer {
  draft_id?: string;
  same_thing?: boolean;
  match_id?: string;
  whats_new?: string;
}

async function ask(
  apiKey: string,
  model: string,
  drafts: Row[],
  candidates: Row[],
): Promise<Answer[]> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt(drafts, candidates) }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
          },
        }),
      },
    );
  } catch (err) {
    throw new TransientError(`Could not reach Gemini: ${String((err as Error).message ?? err)}`);
  }

  if (!res.ok) {
    /* Left completely alone on a busy model, which is what makes the tick safe
       to leave running: dedupe_checked_at stays null, so the next tick five
       minutes later tries the same drafts again. The one thing that must never
       happen here is a draft marked checked because the model was busy — that
       is a duplicate that silently never gets caught. */
    if (res.status === 429) {
      throw new TransientError('Gemini is rate limiting us. The drafts are untouched and the next tick tries again.');
    }
    if (res.status >= 500) {
      throw new TransientError(`Gemini is busy (${res.status}). The drafts are untouched and the next tick tries again.`);
    }
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini returned ${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await res.json();
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map((p: { text?: string }) => p?.text ?? '').join('').trim();

  if (!raw) {
    const reason = payload?.candidates?.[0]?.finishReason ?? 'no reason given';
    throw new Error(`Gemini returned nothing to parse (${reason}).`);
  }

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.results) ? parsed.results : [];
}

async function run(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  model: string,
  opts: { dryRun: boolean; all: boolean },
): Promise<Record<string, unknown>> {
  let drafts = admin
    .from('announcements')
    .select('id, title, body, starts_on, ends_on, created_at')
    .eq('review_state', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_DRAFTS);

  if (!opts.all) drafts = drafts.is('dedupe_checked_at', null);

  const { data: draftRows, error: draftError } = await drafts;
  if (draftError) throw new Error(`Could not read the drafts: ${draftError.message}`);

  if (!draftRows?.length) {
    return { ok: true, checked: 0, matched: 0, note: 'Nothing waiting to be checked.' };
  }

  const since = new Date(Date.now() - CANDIDATE_DAYS * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  /* What a draft could be an update to: anything the church already has that
     is not itself in the queue and not deleted. Two reads rather than one
     `or`, because PostgREST's or() across a date and a null is more fragile to
     read than two queries and a merge, and this runs every five minutes for
     years. */
  const recent = await admin
    .from('announcements')
    .select('id, title, body, starts_on, ends_on, created_at')
    .neq('review_state', 'pending')
    .is('deleted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES);

  if (recent.error) throw new Error(`Could not read the announcements: ${recent.error.message}`);

  const upcoming = await admin
    .from('announcements')
    .select('id, title, body, starts_on, ends_on, created_at')
    .neq('review_state', 'pending')
    .is('deleted_at', null)
    .gte('ends_on', today)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES);

  if (upcoming.error) throw new Error(`Could not read the announcements: ${upcoming.error.message}`);

  const seen = new Set<string>();
  const candidates: Row[] = [];
  for (const r of [...(recent.data ?? []), ...(upcoming.data ?? [])]) {
    const row = shape(r as Record<string, unknown>);
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    candidates.push(row);
  }

  const drafted = draftRows.map((r) => shape(r as Record<string, unknown>));

  /* Nothing to compare against. Still stamps the drafts as checked, because
     the answer "there is nothing this could duplicate" is a real answer and
     re-asking it every five minutes for the life of the queue would be a model
     call to reach the same empty list. */
  if (!candidates.length) {
    if (!opts.dryRun) {
      await admin
        .from('announcements')
        .update({ dedupe_checked_at: new Date().toISOString() })
        .in('id', drafted.map((d) => d.id));
    }
    return {
      ok: true,
      checked: drafted.length,
      matched: 0,
      note: 'Nothing posted yet for these to be updates of.',
    };
  }

  const answers = await ask(apiKey, model, drafted, candidates);

  const byId = new Map(answers.map((a) => [String(a.draft_id ?? ''), a]));
  const stamp = new Date().toISOString();
  const found: Array<Record<string, unknown>> = [];

  for (const draft of drafted) {
    const answer = byId.get(draft.id);
    const matched = answer?.same_thing === true &&
      candidates.some((c) => c.id === String(answer?.match_id ?? ''));

    const patch: Record<string, unknown> = {
      dedupe_checked_at: stamp,
      duplicate_of: matched ? String(answer?.match_id) : null,
      duplicate_note: matched
        ? String(answer?.whats_new ?? '').trim().slice(0, 200) || null
        : null,
    };

    if (matched) {
      found.push({
        draft: draft.id,
        draft_title: draft.title,
        updates: String(answer?.match_id),
        whats_new: patch.duplicate_note,
      });
    }

    if (!opts.dryRun) {
      const { error } = await admin
        .from('announcements')
        .update(patch)
        .eq('id', draft.id);
      if (error) console.error(`announcement-dedupe: could not mark ${draft.id}:`, error.message);
    }
  }

  return {
    ok: true,
    dry_run: opts.dryRun || undefined,
    checked: drafted.length,
    compared_against: candidates.length,
    matched: found.length,
    found,
  };
}

/* ========================================================================
   main
   ===================================================================== */

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const cronSecret = Deno.env.get('HC_NEWSLETTER_CRON_SECRET');
  if (!cronSecret) {
    console.error('announcement-dedupe: HC_NEWSLETTER_CRON_SECRET is not set on this function');
    return json({ error: 'Not configured.' }, 500);
  }
  if (!secretsMatch(req.headers.get('x-hc-cron-secret') ?? '', cronSecret)) {
    return json({ error: 'No.' }, 401);
  }

  let body: { dry_run?: boolean; all?: boolean } = {};
  try { body = await req.json(); } catch { /* an empty body is the ordinary tick */ }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Platform env missing.' }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

  if (!geminiKey) {
    return json({ ok: false, note: 'Not set up yet: GEMINI_API_KEY is missing.' });
  }

  /* NO RUN LOG, unlike the newsletter intake and the home groups button, and
     the difference is who is waiting. Those two are started by a person
     standing at a button who needs to be told what happened. This is a tick
     nobody watches, and what it does is already visible in the place it
     matters: the review card says "looks like an update to" or it does not. A
     failure leaves dedupe_checked_at null, so the next tick simply tries
     again. */
  try {
    return json(await run(admin, geminiKey, model, {
      dryRun: body.dry_run === true,
      all: body.all === true,
    }));
  } catch (err) {
    console.error('announcement-dedupe failed:', err);
    return json({ ok: false, note: String((err as Error).message ?? err) });
  }
});
