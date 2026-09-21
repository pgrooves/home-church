/**
 * Home Church, noticing when the church says the same thing twice.
 *
 * WHAT IT IS FOR. The church emails about Homecoming in September, again in
 * early October with a ticket link, and again the week before with a change of
 * time. Every one of those parses into a new announcement, so Home ends up
 * carrying three cards about one night, and the newest of them is not
 * necessarily the fullest. This reads the announcements nobody has compared
 * yet, holds them against the rest of what the church has, and writes down
 * which one looks like a second go at which, and what is new in it.
 *
 * WHAT CHANGED IN 0075, and it is the whole reason this file was rewritten
 * rather than tweaked. Until then this pass looked ONLY at drafts sitting in
 * the review queue, and compared them ONLY against announcements that had
 * already left it. Two holes fell out of that, and the church fell through
 * both in the same fortnight:
 *
 *   TWO DRAFTS COULD NOT SEE EACH OTHER. A newsletter that mentions Homecoming
 *   twice, or two fetches before anybody approves anything, put two drafts in
 *   the queue and compared each against everything except the other. Approve
 *   them both and there are two cards on Home.
 *
 *   ONCE APPROVED, NOTHING EVER LOOKED AGAIN. dedupe_checked_at was stamped and
 *   the row left the queue, and there was no equivalent of the "same night,
 *   twice" section the calendar has had since 0052.
 *
 * So this now works the way event-dedupe already did: every announcement in the
 * window is both a row to check and a row to be checked against, and the flag
 * goes on the one that should lose. The screen grew the matching section —
 * see eventDuplicatesSection's announcements twin in js/screens/admin.js.
 *
 * IT STILL MERGES NOTHING. That is the whole design. It writes three columns —
 * duplicate_of, duplicate_note, dedupe_checked_at — and stops. The merge is a
 * person tapping "Update it", which calls hc_admin_apply_announcement_update.
 * A model that could quietly rewrite a card the church has already seen and
 * approved is a different and much worse thing than a model that fills a
 * queue, and this project has kept that line since 0038.
 *
 * WHICH WAY THE FLAG POINTS is decided here and not by the model, because it
 * is a rule rather than a judgement: the flag goes on the row that should
 * lose, pointing at the row people already have. Posted beats waiting, and
 * between two of the same kind the older one wins. Stated a second time in SQL
 * in 0075's guard, because that one has to reach the same answer without this
 * file being involved.
 *
 * WHO CALLS IT. pg_cron every five minutes, and an insert on announcements
 * since 0075 — both through public.hc_dedupe_tick(), which returns without
 * calling anything unless a row is actually waiting to be checked. So the
 * ordinary week is one index lookup every five minutes and a handful of model
 * calls when a newsletter lands.
 *
 * ONE CALL FOR THE WHOLE BATCH, not one per row. A newsletter carries four or
 * five items and they are compared against the same list; asking five times
 * would cost five times as much and would let the model give two rows the same
 * parent without noticing. The answer is one entry per row, flagged rather
 * than filtered, which is the lesson the intake's own backfill schema learned:
 * a sparse answer is a filtering task and the model is cautious with it, a
 * complete one is a labelling task and it is not.
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
 * stamp, so it can be run twice on the same rows while reading the answers.
 * `{"all": true}` re-checks rows that have already been checked, which is
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
   The same sixty days the guard in 0075 uses, so the two cannot disagree about
   what is even a candidate.

   FORTY CARDS is a wide net for a church that posts a handful a month, and it
   keeps the prompt inside the budget that made the intake reliable. Wider than
   the twenty-five it was, because the list now carries the queue as well as
   what is posted. */
const CANDIDATE_DAYS = 60;
const MAX_CANDIDATES = 40;
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
  posted: boolean;         // it has left the review queue
  created: string;         // the raw timestamp, for the survivor rule
  duplicateOf: string | null;
}

function shape(r: Record<string, unknown>): Row {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    body: String(r.body ?? '').slice(0, 700),
    written: String(r.created_at ?? '').slice(0, 10),
    starts_on: (r.starts_on as string | null) ?? null,
    ends_on: (r.ends_on as string | null) ?? null,
    posted: String(r.review_state ?? '') !== 'pending',
    created: String(r.created_at ?? ''),
    duplicateOf: (r.duplicate_of as string | null) ?? null,
  };
}

/* ONE ENTRY PER ROW CHECKED, flagged rather than filtered. `same_thing` false
   is a real answer and the common one; `match_id` is only read when it is
   true. */
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

function describe(r: Row): string {
  return [
    `--- id: ${r.id}`,
    `posted: ${r.written}`,
    `title: ${r.title}`,
    r.starts_on || r.ends_on
      ? `dates: ${r.starts_on ?? '-'} to ${r.ends_on ?? '-'}`
      : 'dates: none',
    r.posted ? 'status: on Home' : 'status: waiting to be approved',
    `text: ${r.body}`,
  ].join('\n');
}

function prompt(drafts: Row[], candidates: Row[]): string {
  return [
    'A church app turns each item in its weekly email newsletter into an announcement',
    'card, and an admin can also write one by hand. The same real-world thing often',
    'gets written about more than once: a save the date, then a reminder with a ticket',
    'link, then a change of time. Those should be one card that gets updated, not three.',
    '',
    'Below are ANNOUNCEMENTS TO CHECK and EVERYTHING THE CHURCH HAS. For EVERY',
    'announcement to check, return one entry saying whether it is about the same',
    'real-world thing as one of the others. The second list contains the ones being',
    'checked as well as the rest, so one to check may well be a second go at another —',
    'but never at itself.',
    '',
    'SAME THING means the same event, the same sign-up, the same series, the same',
    'deadline. It is still the same thing when:',
    '  - the name changed ("Women\'s Night" and "Ladies Night" on the same date)',
    '  - one name is longer than the other ("Homecoming" and "Homecoming Gala")',
    '  - the wording is completely rewritten',
    '  - the time, the price, the venue or the link changed',
    '  - one says "save the date" and the other says "tickets are live"',
    '  - one is on Home and the other is still waiting to be approved',
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
    'saying what one carries that the other does not — "adds a ticket link and moves it',
    'to 6:30pm", "same night, now says dinner is included". If it genuinely adds',
    'nothing, say "nothing new, just a reminder". Write it for an admin deciding in one',
    'glance, not as a summary of the whole announcement.',
    '',
    'match_id must be copied exactly from an id in EVERYTHING THE CHURCH HAS below.',
    'Never invent one, and never give an announcement its own id.',
    '',
    'ANNOUNCEMENTS TO CHECK',
    ...drafts.map(describe),
    '',
    'EVERYTHING THE CHURCH HAS',
    ...candidates.map(describe),
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
       minutes later tries the same rows again. The one thing that must never
       happen here is a row marked checked because the model was busy — that
       is a duplicate that silently never gets caught. */
    if (res.status === 429) {
      throw new TransientError('Gemini is rate limiting us. The announcements are untouched and the next tick tries again.');
    }
    if (res.status >= 500) {
      throw new TransientError(`Gemini is busy (${res.status}). The announcements are untouched and the next tick tries again.`);
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

/* Which of two rows the church keeps. Posted beats waiting, because it is the
   one already on Home with people having read it, and between two of the same
   kind the one written first wins. Nothing here asks the model, and nothing
   here reads a title: this is the rule the merge in 0051 relies on, and a rule
   that changed with the wording would not be one.

   Stated a second time in SQL, in 0075's guard, because that one has to reach
   the same answer without this file being involved. Two statements of one
   rule, each with its own test, beat one statement neither side can see. */
function survivor(a: Row, b: Row): Row {
  if (a.posted !== b.posted) return a.posted ? a : b;
  if (a.created !== b.created) return a.created < b.created ? a : b;
  return a.id < b.id ? a : b;
}

/* The end of a chain. If the row we are about to point at is itself already
   flagged as a copy of something else, point at that something else instead,
   so three copies of one thing converge on one card rather than forming a
   queue an admin has to work through in order. Bounded, because a cycle in
   this column would otherwise be an Edge Function that never returns. */
function root(id: string, by: Map<string, Row>): string {
  let at = id;
  for (let i = 0; i < 5; i++) {
    const row = by.get(at);
    if (!row?.duplicateOf || row.duplicateOf === at) return at;
    if (!by.has(row.duplicateOf)) return at;
    at = row.duplicateOf;
  }
  return at;
}

const COLUMNS =
  'id, title, body, starts_on, ends_on, created_at, review_state, duplicate_of';

async function run(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  model: string,
  opts: { dryRun: boolean; all: boolean },
): Promise<Record<string, unknown>> {
  /* WHAT IS WAITING TO BE CHECKED, and it is no longer "a draft". Since 0075
     it is any announcement nobody has compared yet, posted ones included,
     which is what makes the pair already on Home findable at all. Newest
     first, because a duplicate that has just arrived is the one somebody is
     about to make a decision about. */
  let waiting = admin
    .from('announcements')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_DRAFTS);

  if (!opts.all) waiting = waiting.is('dedupe_checked_at', null);

  const { data: draftRows, error: draftError } = await waiting;
  if (draftError) throw new Error(`Could not read the announcements: ${draftError.message}`);

  if (!draftRows?.length) {
    return { ok: true, checked: 0, matched: 0, note: 'Nothing waiting to be checked.' };
  }

  const since = new Date(Date.now() - CANDIDATE_DAYS * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  /* What a row could be a second go at: anything else the church has that is
     not deleted — in the queue or on Home, since 0075. Two reads rather than
     one `or`, because PostgREST's or() across a date and a null is more
     fragile to read than two queries and a merge, and this runs every five
     minutes for years. */
  const recent = await admin
    .from('announcements')
    .select(COLUMNS)
    .is('deleted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES);

  if (recent.error) throw new Error(`Could not read the announcements: ${recent.error.message}`);

  const upcoming = await admin
    .from('announcements')
    .select(COLUMNS)
    .is('deleted_at', null)
    .gte('ends_on', today)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES);

  if (upcoming.error) throw new Error(`Could not read the announcements: ${upcoming.error.message}`);

  const byId = new Map<string, Row>();
  const everything: Row[] = [];
  for (const r of [...(recent.data ?? []), ...(upcoming.data ?? [])]) {
    const row = shape(r as Record<string, unknown>);
    if (byId.has(row.id)) continue;
    byId.set(row.id, row);
    everything.push(row);
  }

  /* The rows being checked are part of the list they are checked against, and
     one object each: one that fell outside the window is added rather than
     shaped twice, so the flag written below and the chain read by root() are
     looking at the same row. Same arrangement event-dedupe has had since
     0052; the prompt is what stops a row matching itself. */
  const drafted = draftRows.map((r) => {
    const row = shape(r as Record<string, unknown>);
    const known = byId.get(row.id);
    if (known) return known;
    byId.set(row.id, row);
    everything.push(row);
    return row;
  });

  /* Nothing to compare against. Still stamps them as checked, because "there
     is nothing else here" is a real answer and re-asking it every five minutes
     would be a model call to reach the same empty list. */
  if (everything.length < 2) {
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
      note: 'Nothing else posted for these to be second goes at.',
    };
  }

  const answers = await ask(apiKey, model, drafted, everything);

  const byDraft = new Map(answers.map((a) => [String(a.draft_id ?? ''), a]));
  const stamp = new Date().toISOString();
  const found: Array<Record<string, unknown>> = [];

  for (const draft of drafted) {
    const answer = byDraft.get(draft.id);
    const matchId = String(answer?.match_id ?? '');
    const other = answer?.same_thing === true && matchId !== draft.id
      ? byId.get(matchId)
      : undefined;

    /* Stamped whatever the answer was. A "no" is an answer, and asking it
       again in five minutes is how a quiet week turns into a standing Gemini
       bill.

       AND A "NO" CLEARS A FLAG NOBODY CONFIRMED, which is what makes the
       title guard in 0075 safe to leave loose. That guard pairs two rows
       whose titles contain one another, in plain SQL and with no idea what
       either of them is, so it will sometimes raise a baptism class against a
       baptism. This is the line that takes such a pair back down, five minutes
       later, without anybody tapping anything.

       Safe to clear, because of who writes this column. The guard writes it, a
       previous run of this pass writes it, and nobody else: a person only ever
       clears it, through Post separately, which also stamps dedupe_checked_at —
       and a stamped row is not in this batch at all.

       ONLY WHEN THERE IS NO MATCH AT ALL. A row can be the survivor of the
       pair being judged here and still be a second go at some third row
       itself, and clearing its flag on the way past would break that chain and
       lose a pair nobody has answered. */
    const writes: Array<{ id: string; patch: Record<string, unknown> }> = [
      { id: draft.id, patch: { dedupe_checked_at: stamp } },
    ];

    if (!other) {
      Object.assign(writes[0].patch, { duplicate_of: null, duplicate_note: null });
    }

    if (other) {
      const keep = survivor(draft, other);
      const lose = keep.id === draft.id ? other : draft;
      const target = root(keep.id, byId);
      const note = String(answer?.whats_new ?? '').trim().slice(0, 200) || null;

      /* The flag goes on the loser, which is not always the row being checked:
         a newsletter draft matched against an older draft leaves the older one
         standing and marks the new one, and a posted row matched against a
         newer posted one marks the newer. Refused when the target is the loser
         itself, which a chain of three merged in an odd order could otherwise
         produce. */
      if (target !== lose.id) {
        const at = writes.find((w) => w.id === lose.id);
        const patch = { duplicate_of: target, duplicate_note: note };
        if (at) Object.assign(at.patch, patch);
        else writes.push({ id: lose.id, patch });

        /* Held in memory as well as written, so the next row in this same
           batch sees the chain and lands on the same survivor. */
        const row = byId.get(lose.id);
        if (row) row.duplicateOf = target;

        found.push({
          duplicate: lose.id,
          duplicate_title: lose.title,
          updates: target,
          keeps_title: byId.get(target)?.title ?? '',
          whats_new: note,
          already_on_home: lose.posted,
        });
      }
    }

    if (opts.dryRun) continue;

    for (const write of writes) {
      const { error } = await admin
        .from('announcements')
        .update(write.patch)
        .eq('id', write.id);
      if (error) console.error(`announcement-dedupe: could not mark ${write.id}:`, error.message);
    }
  }

  return {
    ok: true,
    dry_run: opts.dryRun || undefined,
    checked: drafted.length,
    compared_against: everything.length,
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
