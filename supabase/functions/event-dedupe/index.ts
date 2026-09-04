/**
 * Home Church, noticing when the calendar has one night in it twice.
 *
 * WHAT IT IS FOR. The church emails about Homecoming three times, and the
 * intake parses a date out of each one, so the Cal tab ends up with
 * "Homecoming" and "Homecoming Gala" on the same evening — and with "Ladies
 * Night" beside "Women's Night", because two people wrote about one thing and
 * neither used the other's name for it. This reads the events nobody has
 * compared yet, holds them against the rest of the calendar, and writes down
 * which one looks like a second copy of which, and how they differ.
 *
 * IT MERGES NOTHING. Three columns — duplicate_of, duplicate_note,
 * dedupe_checked_at — and it stops. The merge is a person tapping Merge on the
 * Admin screen, which calls hc_admin_apply_event_update in migration 0052.
 * This is the same line announcement-dedupe holds and 0038 first drew, and it
 * matters more here: half the rows this looks at are already on the church's
 * calendar, and a model quietly deleting one of those is a date disappearing
 * out of a screen people plan their week around.
 *
 * WHAT IT LOOKS AT, and how that differs from the announcements pass. That one
 * only ever reads drafts in the review queue, because a second card on Home is
 * a nuisance. This one reads every event in the window, approved ones
 * included, because a second entry in the calendar is two Add to calendar
 * buttons and, once tapped, two things in somebody's phone that this app can
 * never reach again. The duplicate worth catching is usually one that was
 * approved a fortnight ago.
 *
 * WHICH WAY THE FLAG POINTS is decided here and not by the model, because it
 * is a rule rather than a judgement: the flag goes on the row that should
 * lose, pointing at the row people already have. Published beats pending, and
 * between two of the same kind the older one wins. So the model answers "are
 * these the same night", which is a question about English, and this file
 * answers "which one survives", which is a question about the church.
 *
 * WHO CALLS IT. pg_cron, every five minutes at two minutes past, through
 * public.hc_event_dedupe_tick(), which returns without calling anything unless
 * an event is actually waiting to be checked.
 *
 * SECRETS, all shared project-wide and already set for the newsletter intake:
 *   HC_NEWSLETTER_CRON_SECRET, GEMINI_API_KEY, GEMINI_MODEL (optional)
 *
 * BY HAND:
 *   curl -X POST https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/event-dedupe \
 *     -H "x-hc-cron-secret: <the secret>" -H "Content-Type: application/json" \
 *     -d '{"dry_run": true}'
 *
 * `dry_run` compares everything and writes nothing, including the checked
 * stamp, so it can be run twice on the same events while reading the answers.
 * `{"all": true}` re-checks events that have already been checked, which is
 * what to use after changing the prompt.
 *
 * DEPLOY
 *   supabase functions deploy event-dedupe --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEFAULT_MODEL = 'gemini-3.5-flash';

/* The window, and how much of it goes in one prompt.

   A FORTNIGHT BACK, because a reminder that lands on the Thursday of an event
   week still describes something the calendar has, and an admin who merges the
   day after has lost nothing. Further back than that, two rows about a night
   that has been and gone are two rows nobody will ever look at.

   EVERYTHING AHEAD, with no far edge. Duplicates cluster on a date and a
   church books the big ones a year out; a window that stopped at three months
   would miss exactly the pair that gets emailed about most often.

   SIXTY CANDIDATES is the whole calendar for a church this size, and these
   rows are short — a title, a date, a place, a line of blurb. */
const WINDOW_DAYS = 14;
const MAX_CANDIDATES = 60;
const MAX_DRAFTS = 10;
const BLURB = 300;

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
  blurb: string;
  when: string;          // what the model reads: the day, and the hour or that there is none
  starts: string;        // the raw timestamp, for ordering and for the answer
  location: string;
  published: boolean;
  created: string;
  duplicateOf: string | null;
}

/* America/Chicago, the same church clock the intake and the Cal tab use. The
   day matters more than anything else in this comparison, and a date rendered
   in UTC turns a seven in the evening into the next morning, which would have
   the model calling one night two. */
const CHURCH_TZ = 'America/Chicago';

function churchDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHURCH_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function churchTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ, hour: 'numeric', minute: '2-digit',
  }).format(d);
}

function shape(r: Record<string, unknown>): Row {
  const starts = String(r.starts_at ?? '');
  const label = String(r.time_label ?? '').trim();
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    blurb: String(r.description ?? '').slice(0, BLURB),
    /* An hour the church actually gave, or the plain fact that it did not.
       time_label is what the intake writes when the email named no time, so a
       row carrying one is a row whose nine in the morning is a placeholder —
       and telling the model that outright stops it reading two placeholders as
       agreement, or a placeholder and a real seven o'clock as a disagreement. */
    when: starts
      ? churchDay(starts) + (label ? `, time not known (${label})` : `, ${churchTime(starts)}`)
      : 'no date',
    starts,
    location: String(r.location ?? '').trim(),
    published: r.published === true,
    created: String(r.created_at ?? ''),
    duplicateOf: (r.duplicate_of as string | null) ?? null,
  };
}

/* ONE ENTRY PER EVENT CHECKED, flagged rather than filtered, for the reason
   announcement-dedupe sets out: a sparse answer is a filtering task and the
   model is cautious with it, a complete one is a labelling task and it is
   not. */
const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          event_id: { type: 'string' },
          same_thing: { type: 'boolean' },
          match_id: { type: 'string' },
          how_they_differ: { type: 'string' },
        },
        required: ['event_id', 'same_thing'],
      },
    },
  },
  required: ['results'],
};

function describe(r: Row): string {
  return [
    `--- id: ${r.id}`,
    `title: ${r.title}`,
    `when: ${r.when}`,
    r.location ? `where: ${r.location}` : 'where: not given',
    r.published ? 'status: on the calendar' : 'status: waiting to be approved',
    r.blurb ? `about: ${r.blurb}` : 'about: nothing written',
  ].join('\n');
}

function prompt(drafts: Row[], candidates: Row[]): string {
  return [
    'A church app keeps one calendar. Dates reach it two ways: somebody types one',
    'in, and a model parses one out of the weekly email newsletter. The same night',
    'therefore gets entered more than once, under different names — "Ladies Night"',
    'and "Women\'s Night", "Homecoming" and "Homecoming Gala" — and the calendar ends',
    'up showing one evening as two.',
    '',
    'Below are EVENTS TO CHECK and THE WHOLE CALENDAR. For EVERY event to check,',
    'return one entry saying whether it is another copy of one of the other events:',
    'the same real-world gathering, entered twice. The calendar list contains the',
    'events to check as well as the rest, so one event to check may well be a copy',
    'of another — but never of itself.',
    '',
    'THE SAME NIGHT means one gathering that somebody would attend once. It is still',
    'the same night when:',
    '  - the names differ ("Ladies Night" and "Women\'s Night")',
    '  - one name is longer than the other ("Homecoming" and "Homecoming Gala")',
    '  - one has a location or a blurb and the other has none',
    '  - one says the time is not known and the other gives an hour ON THE SAME DAY',
    '  - one is on the calendar and the other is still waiting to be approved',
    '',
    'It is NOT the same night when it is:',
    '  - a different day. Two dates are two events unless one of them plainly says',
    '    the time is not known and they share the day. A weekly gathering on the 3rd',
    '    and the 10th is two events, however identical the wording.',
    '  - the next occurrence of something recurring, or one of a series',
    '  - two different things on one evening (a men\'s breakfast and a women\'s night',
    '    can share a date and share nothing else)',
    '  - a whole-church service and a small piece of it',
    'When you are not sure, say false. Two rows an admin can see and merge in a tap',
    'is a small mess; two nights merged into one is a date that leaves the church\'s',
    'calendar and cannot be got back from the phones that already have it.',
    '',
    'For a match, write `how_they_differ`: one short sentence, at most 140',
    'characters, for an admin deciding in a glance — "same Friday, this one adds the',
    'location and a 6:30 start", "same night, only the name is different". Do not',
    'summarise either event; say what one has that the other does not.',
    '',
    'match_id must be copied exactly from an id in THE WHOLE CALENDAR below. Never',
    'invent one, and never give an event its own id.',
    '',
    'EVENTS TO CHECK',
    ...drafts.map(describe),
    '',
    'THE WHOLE CALENDAR',
    ...candidates.map(describe),
  ].join('\n');
}

interface Answer {
  event_id?: string;
  same_thing?: boolean;
  match_id?: string;
  how_they_differ?: string;
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
    /* Left completely alone on a busy model, exactly as announcement-dedupe
       does: dedupe_checked_at stays null, so the next tick tries the same rows
       again. A row marked checked because the model was busy is a duplicate
       that silently never gets caught. */
    if (res.status === 429) {
      throw new TransientError('Gemini is rate limiting us. The events are untouched and the next tick tries again.');
    }
    if (res.status >= 500) {
      throw new TransientError(`Gemini is busy (${res.status}). The events are untouched and the next tick tries again.`);
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

/* Which of two rows the church keeps. Published beats pending, because it is
   the one already on the Cal tab and in the announcements pointing at it, and
   between two of the same kind the one written first wins. Nothing here asks
   the model, and nothing here reads a title: this is the rule the merge in
   0052 relies on, and a rule that changed with the wording would not be one. */
function survivor(a: Row, b: Row): Row {
  if (a.published !== b.published) return a.published ? a : b;
  if (a.created !== b.created) return a.created < b.created ? a : b;
  return a.id < b.id ? a : b;
}

/* The end of a chain. If the row we are about to point at is itself already
   flagged as a copy of something else, point at that something else instead,
   so three copies of one night converge on one row rather than forming a queue
   an admin has to work through in order. Bounded, because a cycle in this
   column would otherwise be an Edge Function that never returns. */
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

async function run(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  model: string,
  opts: { dryRun: boolean; all: boolean },
): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const COLUMNS = 'id, title, description, starts_at, time_label, location, published, created_at, duplicate_of';

  let waiting = admin
    .from('events')
    .select(COLUMNS)
    .gte('starts_at', since)
    .order('starts_at', { ascending: true })
    .limit(MAX_DRAFTS);

  if (!opts.all) waiting = waiting.is('dedupe_checked_at', null);

  const { data: draftRows, error: draftError } = await waiting;
  if (draftError) throw new Error(`Could not read the events: ${draftError.message}`);

  if (!draftRows?.length) {
    return { ok: true, checked: 0, matched: 0, note: 'Nothing waiting to be checked.' };
  }

  /* The whole window, drafts included, because the pair this exists to catch
     is often two rows that both arrived this week and neither of which anybody
     has looked at. announcement-dedupe can keep its two lists apart — a draft
     there is only ever compared against something published — and this one
     cannot. The prompt is what stops an event matching itself. */
  const { data: allRows, error: allError } = await admin
    .from('events')
    .select(COLUMNS)
    .gte('starts_at', since)
    .order('starts_at', { ascending: true })
    .limit(MAX_CANDIDATES);

  if (allError) throw new Error(`Could not read the calendar: ${allError.message}`);

  const everything = (allRows ?? []).map((r) => shape(r as Record<string, unknown>));
  const byId = new Map(everything.map((r) => [r.id, r]));

  /* The events being checked are part of the calendar they are checked
     against, and one object each: a draft that fell outside the sixty is added
     rather than shaped twice, so the flag written below and the chain read by
     root() are looking at the same row. */
  const drafted = draftRows.map((r) => {
    const row = shape(r as Record<string, unknown>);
    const known = byId.get(row.id);
    if (known) return known;
    byId.set(row.id, row);
    everything.push(row);
    return row;
  });
  everything.sort((a, b) => (a.starts < b.starts ? -1 : a.starts > b.starts ? 1 : 0));

  /* Nothing to compare against. Still stamps them as checked, because "there
     is nothing else in the calendar" is a real answer and re-asking it every
     five minutes would be a model call to reach the same empty list. */
  if (everything.length < 2) {
    if (!opts.dryRun) {
      await admin
        .from('events')
        .update({ dedupe_checked_at: new Date().toISOString() })
        .in('id', drafted.map((d) => d.id));
    }
    return {
      ok: true,
      checked: drafted.length,
      matched: 0,
      note: 'Nothing else in the calendar for these to be copies of.',
    };
  }

  const answers = await ask(apiKey, model, drafted, everything);

  const byDraft = new Map(answers.map((a) => [String(a.event_id ?? ''), a]));
  const stamp = new Date().toISOString();
  const found: Array<Record<string, unknown>> = [];

  for (const draft of drafted) {
    const answer = byDraft.get(draft.id);
    const matchId = String(answer?.match_id ?? '');
    const other = answer?.same_thing === true && matchId !== draft.id
      ? byId.get(matchId)
      : undefined;

    /* Stamped whatever the answer was. A "no" is an answer, and asking it
       again in five minutes is how a quiet calendar turns into a standing
       Gemini bill.

       AND A "NO" CLEARS A FLAG NOBODY CONFIRMED, which is what makes the
       same-day guard in migration 0053 safe to leave loose. That guard pairs
       two events on one day whose titles share a word, in plain SQL and with
       no idea what either of them is, so it will sometimes raise a men's
       breakfast against a women's night. This is the line that takes such a
       pair back down, five minutes later, without anybody tapping anything.

       Safe to clear, because of who writes this column. The guard writes it, a
       previous run of this pass writes it, and nobody else: a person only ever
       clears it, through Keep both, which also stamps dedupe_checked_at — and
       a stamped row is not in this batch at all. So every flag reaching this
       line is one no human has answered for.

       ONLY WHEN THERE IS NO MATCH AT ALL, which is the whole of why this is
       not simply part of the patch below. A row can be the survivor of the
       pair being judged here and still be a copy of some third row itself, and
       clearing its flag on the way past would break that chain and lose a pair
       nobody has answered. */
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
      const note = String(answer?.how_they_differ ?? '').trim().slice(0, 200) || null;

      /* The flag goes on the loser, which is not always the row being checked:
         a newsletter draft matched against an older draft leaves the older one
         standing and marks the new one, and an already published row matched
         against a newer published one marks the newer. Refused when the target
         is the loser itself, which a chain of three merged in an odd order
         could otherwise produce. */
      if (target !== lose.id) {
        const at = writes.find((w) => w.id === lose.id);
        const patch = { duplicate_of: target, duplicate_note: note };
        if (at) Object.assign(at.patch, patch);
        else writes.push({ id: lose.id, patch });

        /* Held in memory as well as written, so the next draft in this same
           batch sees the chain and lands on the same survivor. */
        const row = byId.get(lose.id);
        if (row) row.duplicateOf = target;

        found.push({
          duplicate: lose.id,
          duplicate_title: lose.title,
          merges_into: target,
          keeps_title: byId.get(target)?.title ?? '',
          how_they_differ: note,
          already_on_the_calendar: lose.published,
        });
      }
    }

    if (opts.dryRun) continue;

    for (const write of writes) {
      const { error } = await admin.from('events').update(write.patch).eq('id', write.id);
      if (error) console.error(`event-dedupe: could not mark ${write.id}:`, error.message);
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
    console.error('event-dedupe: HC_NEWSLETTER_CRON_SECRET is not set on this function');
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

  /* NO RUN LOG, the same call announcement-dedupe makes and for the same
     reason: nobody is standing at a button waiting for this, and what it does
     is already visible where it matters — the card says "looks like the same
     night as" or it does not. A failure leaves dedupe_checked_at null and the
     next tick tries again. */
  try {
    return json(await run(admin, geminiKey, model, {
      dryRun: body.dry_run === true,
      all: body.all === true,
    }));
  } catch (err) {
    console.error('event-dedupe failed:', err);
    return json({ ok: false, note: String((err as Error).message ?? err) });
  }
});
