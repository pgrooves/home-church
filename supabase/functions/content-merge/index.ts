/**
 * Home Church, merging two cards the robot never paired.
 *
 * WHAT IT IS FOR, and why it exists even though three other files already
 * exist to stop this happening. announcement-dedupe and event-dedupe notice
 * duplicates, 0075's guards notice the obvious ones instantly, and between
 * them they will still miss one: two titles with no word in common, a pair
 * sixty-one days apart, a newsletter that renames a thing completely. When
 * that happens the church is looking at two cards on Home knowing perfectly
 * well they are one thing, and the answer has to be a button rather than a
 * support request.
 *
 * So this is the hand-picked merge. An admin taps "Merge with", picks the
 * other row, and this works out what the merged card would say.
 *
 * IT WRITES NOTHING. Not to the announcements table, not to events, not to
 * anything. It reads two rows and returns what the merge would produce, field
 * by field, and the app shows that to the admin with Save and Cancel under it.
 * Saving calls hc_admin_merge_announcement or hc_admin_merge_event with the
 * exact fields this returned, so the thing that was previewed is the thing
 * that is written — there is no second model call between the two, and
 * therefore no chance of them disagreeing.
 *
 * THAT IS A BIGGER JOB FOR THE MODEL THAN ANYTHING ELSE IN THIS PROJECT, and
 * it is worth being plain about the line that moved. Everywhere else a model
 * writes advisory columns and a person decides; here a model writes the words
 * that will be on Home. What keeps the old promise intact is that the person
 * still decides, having READ THE RESULT — not a summary of it, not a
 * confidence score, the actual words. A merge nobody looked at cannot happen
 * through this path, because this path cannot write.
 *
 * WHAT THE MODEL IS AND IS NOT ASKED. It merges PROSE: the title, the blurb,
 * the body, the place, the link label. It is asked for no date, no time, no
 * list of days and no picture, because every one of those already has a rule
 * written down somewhere in this project and a rule beats a judgement:
 *
 *   the start and the hour   0052's rule. A time somebody vouched for is never
 *                            replaced by the parser's nine in the morning.
 *   the days                 0074's rule. Unioned, because a day lost in a
 *                            merge is a night the church is no longer meeting.
 *   when a card comes down    the later of the two ends_on, so a merged card
 *                            does not vanish early.
 *   the pictures             the survivor's, or the other one's when it has
 *                            none. A model choosing photographs is a model
 *                            choosing photographs.
 *
 * The URLs are the one middle case: the model picks BETWEEN the two, and the
 * answer is checked against them here before it goes anywhere. A link is the
 * one field where being subtly wrong sends the church somewhere else, so an
 * invented one is dropped rather than shown.
 *
 * WHO CAN CALL IT. An admin, checked the way admin-remove-user checks: the
 * caller's token is verified against the auth server, and their role is read
 * server side with the service key rather than believed from the request.
 *
 * SECRETS, shared project-wide and already set for the newsletter intake:
 *   GEMINI_API_KEY, GEMINI_MODEL (optional)
 *
 * DEPLOY
 *   supabase functions deploy content-merge
 *
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
 * by the platform. Do not add them by hand and do not paste the key anywhere.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEFAULT_MODEL = 'gemini-3.5-flash';
const CHURCH_TZ = 'America/Chicago';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  /* `apikey` is on this list and is not on delete-account's, which has worked
     for a year in the wrapper that is only ever run from inside the app. The
     contact form's version carries it, this follows that one, and the reason
     is HC.auth.callFunction: it sends the publishable key alongside the
     session token, so a browser that does preflight this at all will ask
     about that header and a list without it fails the request before the
     function is reached. */
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function churchDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHURCH_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/* ------------------------------------------------------------- the prompt
 *
 * ONE SHAPE FOR BOTH TABLES, with the field names swapped, because the job is
 * the same job: two people wrote about one thing and neither read the other,
 * and what is wanted is the one card they would have written together. Asking
 * the same question twice in two prompts is how the announcement merge and the
 * date merge come to behave differently for no reason anybody chose.
 */

const ANNOUNCEMENT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    eyebrow: { type: 'string' },
    body: { type: 'string' },
    body_html: { type: 'string' },
    link_url: { type: 'string' },
    link_title: { type: 'string' },
    nothing_new: { type: 'boolean' },
    what_changed: { type: 'string' },
  },
  required: ['title', 'body', 'nothing_new', 'what_changed'],
};

const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    location: { type: 'string' },
    signup_url: { type: 'string' },
    nothing_new: { type: 'boolean' },
    what_changed: { type: 'string' },
  },
  required: ['title', 'nothing_new', 'what_changed'],
};

const SHARED_RULES = [
  'RULES, and the first one is the one that matters most:',
  '',
  '1. NOTHING IS DROPPED. Every concrete fact either card carries — a price, a',
  '   deadline, an age range, a thing to bring, a person to contact, a room, a',
  '   time — must survive into the merged version. The commonest failure here is',
  '   producing something that reads beautifully and has quietly lost the',
  '   sign-up deadline. If you cannot fit a detail gracefully, fit it',
  '   ungracefully; do not lose it.',
  '',
  '2. INVENT NOTHING. Every fact in your answer must be in one of the two cards.',
  '   No dates, no prices, no names, no URLs that are not already there.',
  '',
  '3. WHEN THE TWO DISAGREE, THE NEW ONE WINS on things that change — a time, a',
  '   price, a venue, a link. A later write about one thing is usually a',
  '   correction. When they disagree about something that does not change, keep',
  '   both facts rather than choosing.',
  '',
  '4. THE KEPT CARD\'S VOICE. Write it the way the kept card is written. The',
  '   church has already read that one; a merge should look like it grew rather',
  '   than like it was replaced.',
  '',
  '5. nothing_new is TRUE only when the other card adds no fact at all — a',
  '   reminder that repeats what is already there. Say it honestly: an admin who',
  '   is told nothing changed will not read the rest, so a false "nothing new"',
  '   is how a ticket link gets lost.',
  '',
  '6. what_changed is ONE SHORT SENTENCE, at most 140 characters, saying what',
  '   the merged card gained. "Adds the ticket link and the $25 price."',
  '   "Nothing new, it was a reminder." For an admin deciding in one glance.',
].join('\n');

function announcementPrompt(keep: Row, other: Row): string {
  return [
    'A church app has two announcement cards that are about the SAME real-world thing,',
    'written at different times by different people. An admin has said so and asked for',
    'them to become one card. Write the merged version of the card the church is',
    'KEEPING.',
    '',
    SHARED_RULES,
    '',
    'THE FIELDS YOU ARE WRITING',
    '  title       short, what the thing is called.',
    '  eyebrow     the little line above the title, or empty. Keep it short.',
    '  body        the card in plain words, no markup. This is what a phone reads out',
    '              and what search looks at, so it must carry everything.',
    '  body_html   the same words as simple markup. ONLY these tags are allowed:',
    '              <p>, <ul>, <li>, <a href="...">. Anything else is stripped before',
    '              it is drawn, so using it loses the words inside it.',
    '  link_url    the one button link. It must be COPIED EXACTLY from one of the two',
    '              cards below, or left empty. Never edit a URL, never combine two.',
    '  link_title  what that button says.',
    '',
    'THE CARD BEING KEPT',
    describeAnnouncement(keep),
    '',
    'THE OTHER CARD',
    describeAnnouncement(other),
  ].join('\n');
}

function eventPrompt(keep: Row, other: Row): string {
  return [
    'A church app has two calendar entries that are the SAME real-world gathering,',
    'entered twice by different people. An admin has said so and asked for them to',
    'become one. Write the merged version of the entry the church is KEEPING.',
    '',
    'YOU ARE NOT DECIDING THE DATE, THE TIME OR THE DAYS. Those are worked out by',
    'rules the church already wrote down, and whatever you say about them is ignored.',
    'Write the words.',
    '',
    SHARED_RULES,
    '',
    'THE FIELDS YOU ARE WRITING',
    '  title        short, what the gathering is called.',
    '  description  two or three warm sentences, no markup, carrying every concrete',
    '               fact either entry has.',
    '  location     where it is. A room, or an address, as the church wrote it.',
    '  signup_url   the registration link. COPIED EXACTLY from one of the two entries',
    '               below, or left empty. Never edit a URL.',
    '',
    'THE ENTRY BEING KEPT',
    describeEvent(keep),
    '',
    'THE OTHER ENTRY',
    describeEvent(other),
  ].join('\n');
}

type Row = Record<string, unknown>;

function describeAnnouncement(r: Row): string {
  return [
    `written: ${String(r.created_at ?? '').slice(0, 10)}`,
    `on Home: ${r.review_state !== 'pending' ? 'yes' : 'not yet'}`,
    `title: ${str(r.title)}`,
    `eyebrow: ${str(r.eyebrow) || '(none)'}`,
    `shows from: ${r.starts_on ?? '(as soon as it is posted)'}`,
    `comes down: ${r.ends_on ?? '(no end date)'}`,
    `link: ${str(r.link_url) || '(none)'}`,
    `link label: ${str(r.link_title) || '(none)'}`,
    `text: ${str(r.body)}`,
  ].join('\n');
}

function describeEvent(r: Row): string {
  const starts = String(r.starts_at ?? '');
  const days = eventDays(r);
  return [
    `written: ${String(r.created_at ?? '').slice(0, 10)}`,
    `on the calendar: ${r.published === true ? 'yes' : 'not yet'}`,
    `title: ${str(r.title)}`,
    `days: ${days.join(' and ') || '(none)'}`,
    `time: ${str(r.time_label) ? `not known (${str(r.time_label)})` : clock(starts)}`,
    `where: ${str(r.location) || '(not given)'}`,
    `sign-up: ${str(r.signup_url) || '(none)'}`,
    `about: ${str(r.description) || '(nothing written)'}`,
  ].join('\n');
}

function clock(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '(no date)';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ, hour: 'numeric', minute: '2-digit',
  }).format(d);
}

/* Every church day an event is on. The same answer public.hc_event_days gives
   in SQL and event-dedupe gives in TypeScript; three statements of one rule,
   which is one too many and is still better than a join in a place that
   cannot do one. */
function eventDays(r: Row): string[] {
  const first = r.starts_at ? churchDay(String(r.starts_at)) : '';
  const rest = Array.isArray(r.also_on)
    ? (r.also_on as unknown[]).map((d) => String(d ?? '').slice(0, 10)).filter(Boolean)
    : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of [first, ...rest]) {
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out.sort();
}

/* ------------------------------------------------------------- the model */

async function ask(
  apiKey: string,
  model: string,
  text: string,
  schema: unknown,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
      },
    );
  } catch (err) {
    throw new Error(`Could not reach the model: ${String((err as Error).message ?? err)}`);
  }

  if (res.status === 429) {
    throw new Error('The model is busy right now. Try again in a minute.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('content-merge: model returned', res.status, detail.slice(0, 300));
    throw new Error('The model could not work that one out. Try again in a minute.');
  }

  const payload = await res.json();
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map((p: { text?: string }) => p?.text ?? '').join('').trim();

  if (!raw) {
    const reason = payload?.candidates?.[0]?.finishReason ?? 'no reason given';
    throw new Error(`The model returned nothing to read (${reason}).`);
  }

  return JSON.parse(raw);
}

/* ---------------------------------------------------------- the two merges */

interface Change {
  field: string;
  label: string;
  before: string;
  after: string;
}

function record(
  changes: Change[],
  field: string,
  label: string,
  before: unknown,
  after: unknown,
): void {
  const a = before == null ? '' : String(before);
  const b = after == null ? '' : String(after);
  if (a === b) return;
  changes.push({ field, label, before: a, after: b });
}

/* A URL the model handed back, only if it is one of the two it was given.
   Anything else is dropped rather than shown: a link is the one field where
   being subtly wrong sends somebody else's Sunday somewhere else. */
function knownUrl(given: unknown, ...allowed: unknown[]): string {
  const want = str(given);
  if (!want) return '';
  for (const a of allowed) {
    if (str(a) && str(a) === want) return want;
  }
  return '';
}

function mergeAnnouncement(
  keep: Row,
  other: Row,
  said: Record<string, unknown>,
): { fields: Record<string, unknown>; changes: Change[] } {
  const changes: Change[] = [];

  const title = str(said.title) || str(keep.title);
  const eyebrow = str(said.eyebrow) || str(keep.eyebrow) || str(other.eyebrow);
  const body = str(said.body) || str(keep.body);
  const bodyHtml = str(said.body_html);
  const linkUrl = knownUrl(said.link_url, keep.link_url, other.link_url) ||
    str(keep.link_url) || str(other.link_url);
  const linkTitle = str(said.link_title) || str(keep.link_title) || str(other.link_title);

  /* WHEN THE CARD COMES DOWN: the later of the two, never the earlier. Taking
     the earlier one would retire a merged card before the thing it is about
     has happened, which is a card disappearing off Home for no reason anybody
     could explain. */
  const startsOn = [keep.starts_on, other.starts_on]
    .filter((d) => typeof d === 'string' && d).sort()[0] ?? null;
  const endsOn = [keep.ends_on, other.ends_on]
    .filter((d) => typeof d === 'string' && d).sort().pop() ?? null;

  /* The pictures: the kept card's, or the other one's when it has none. Never
     both, and never chosen by the model. */
  const keepImages = Array.isArray(keep.image_urls) ? keep.image_urls as unknown[] : [];
  const otherImages = Array.isArray(other.image_urls) ? other.image_urls as unknown[] : [];
  const images = keepImages.length ? keepImages : otherImages;
  const imageUrl = str(keep.image_url) || str(other.image_url);

  record(changes, 'title', 'What it is called', keep.title, title);
  record(changes, 'eyebrow', 'The line above it', keep.eyebrow, eyebrow);
  record(changes, 'body', 'The words', keep.body, body);
  record(changes, 'link_url', 'The link', keep.link_url, linkUrl);
  record(changes, 'link_title', 'What the link says', keep.link_title, linkTitle);
  record(changes, 'starts_on', 'Shows from', keep.starts_on, startsOn);
  record(changes, 'ends_on', 'Comes down', keep.ends_on, endsOn);
  record(changes, 'image_url', 'The picture', keep.image_url, imageUrl);

  if (!keepImages.length && otherImages.length) {
    record(changes, 'image_urls', 'The pictures', '(none)',
      `${otherImages.length} from the other card`);
  }

  const fields: Record<string, unknown> = { title, body };
  if (eyebrow) fields.eyebrow = eyebrow;
  if (bodyHtml) fields.body_html = bodyHtml;
  if (linkUrl) fields.link_url = linkUrl;
  if (linkTitle) fields.link_title = linkTitle;
  if (startsOn) fields.starts_on = startsOn;
  if (endsOn) fields.ends_on = endsOn;
  if (imageUrl) fields.image_url = imageUrl;
  if (images.length) fields.image_urls = images;

  return { fields, changes };
}

function mergeEvent(
  keep: Row,
  other: Row,
  said: Record<string, unknown>,
): { fields: Record<string, unknown>; changes: Change[] } {
  const changes: Change[] = [];

  const title = str(said.title) || str(keep.title);
  const description = str(said.description) || str(keep.description) || str(other.description);
  const location = str(said.location) || str(keep.location) || str(other.location);
  const signupUrl = knownUrl(said.signup_url, keep.signup_url, other.signup_url) ||
    str(keep.signup_url) || str(other.signup_url);

  /* 0052's rule about the hour, restated because this is a second way in to
     the same merge: the other row's date and time are taken ONLY when it
     actually knows an hour, which is exactly when its time_label is null. A
     reminder email that named no time carries the parser's nine in the
     morning, and copying that across would move a seven o'clock service. */
  const otherKnowsTheHour = !str(other.time_label) && !!other.starts_at;
  const keepKnowsTheHour = !str(keep.time_label) && !!keep.starts_at;

  const startsAt = (otherKnowsTheHour && !keepKnowsTheHour)
    ? String(other.starts_at)
    : String(keep.starts_at ?? '');
  const timeLabel = (otherKnowsTheHour && !keepKnowsTheHour) ? '' : str(keep.time_label);

  /* 0074's rule about the days: unioned, minus whichever one the start has
     landed on. A day lost in a merge is a night the church is quietly no
     longer meeting. */
  const firstDay = startsAt ? churchDay(startsAt) : '';
  const allDays = Array.from(new Set([...eventDays(keep), ...eventDays(other)]))
    .filter((d) => d && d !== firstDay)
    .sort();

  const capacity = keep.capacity ?? other.capacity ?? null;

  record(changes, 'title', 'What it is called', keep.title, title);
  record(changes, 'description', 'What it is', keep.description, description);
  record(changes, 'location', 'Where', keep.location, location);
  record(changes, 'signup_url', 'The sign-up link', keep.signup_url, signupUrl);
  record(changes, 'starts_at', 'When it starts',
    keep.starts_at ? `${churchDay(String(keep.starts_at))}, ${str(keep.time_label) || clock(String(keep.starts_at))}` : '',
    startsAt ? `${firstDay}, ${timeLabel || clock(startsAt)}` : '');
  record(changes, 'also_on', 'The other days it runs',
    eventDays(keep).slice(1).join(', ') || '(none)',
    allDays.join(', ') || '(none)');
  record(changes, 'capacity', 'How many it takes', keep.capacity, capacity);

  const fields: Record<string, unknown> = { title, also_on: allDays };
  if (description) fields.description = description;
  if (location) fields.location = location;
  if (signupUrl) fields.signup_url = signupUrl;
  if (startsAt) fields.starts_at = startsAt;
  /* Always said, never omitted, because the SQL side reads an absent key as
     "the hour did not change" and an empty string as "it is a known hour
     now". Both are real answers and they must not be confused. */
  fields.time_label = timeLabel;
  if (capacity != null) fields.capacity = capacity;

  return { fields, changes };
}

/* ========================================================================
   main
   ===================================================================== */

const ANNOUNCEMENT_COLUMNS =
  'id, title, eyebrow, body, body_html, starts_on, ends_on, link_url, link_title, ' +
  'image_url, image_urls, event_id, review_state, created_at, deleted_at';

const EVENT_COLUMNS =
  'id, title, description, starts_at, ends_at, time_label, location, signup_url, ' +
  'capacity, also_on, published, review_state, created_at';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !serviceKey || !anonKey) {
    console.error('content-merge: platform env vars missing');
    return json({ error: 'This is not set up correctly. Please tell the church.' }, 500);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'You need to be signed in to do that.' }, 401);

  let payload: { kind?: string; source_id?: string; target_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const kind = String(payload.kind ?? '').trim();
  const sourceId = String(payload.source_id ?? '').trim();
  const targetId = String(payload.target_id ?? '').trim();

  if (kind !== 'announcement' && kind !== 'event') {
    return json({ error: 'That is not something this can merge.' }, 400);
  }
  if (!sourceId || !targetId) {
    return json({ error: 'Pick something to merge with.' }, 400);
  }
  if (sourceId === targetId) {
    return json({ error: 'That is the same one. Pick a different one to merge with.' }, 400);
  }

  // Who is asking, according to the auth server rather than to the request.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: whoError } = await asCaller.auth.getUser();
  if (whoError || !userData?.user) {
    return json({ error: 'That sign in has expired. Sign in again and try once more.' }, 401);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // And whether they are an admin, read here with the service key rather than
  // trusted from the request, and read fresh so a demotion takes effect at once.
  const { data: me, error: roleError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (roleError) {
    console.error('content-merge: could not read the caller role', roleError.message);
    return json({ error: 'Could not check who you are. Try again in a moment.' }, 500);
  }
  if (me?.role !== 'admin') return json({ error: 'Admins only.' }, 403);

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  if (!geminiKey) {
    return json({ error: 'Merging is not set up yet: the church has no model key.' }, 500);
  }

  const table = kind === 'announcement' ? 'announcements' : 'events';
  const columns = kind === 'announcement' ? ANNOUNCEMENT_COLUMNS : EVENT_COLUMNS;

  const { data: rows, error: readError } = await admin
    .from(table)
    .select(columns)
    .in('id', [sourceId, targetId]);

  if (readError) {
    console.error('content-merge: could not read the rows', readError.message);
    return json({ error: 'Could not read those two. Try again in a moment.' }, 500);
  }

  const keep = (rows ?? []).find((r) => String((r as Row).id) === targetId) as Row | undefined;
  const other = (rows ?? []).find((r) => String((r as Row).id) === sourceId) as Row | undefined;

  if (!keep || !other) {
    return json({ error: 'One of those is not there any more. Reload and try again.' }, 404);
  }
  if (kind === 'announcement' && keep.deleted_at) {
    return json({ error: 'The one you picked has been deleted. Restore it first.' }, 400);
  }

  let said: Record<string, unknown>;
  try {
    said = kind === 'announcement'
      ? await ask(geminiKey, model, announcementPrompt(keep, other), ANNOUNCEMENT_SCHEMA)
      : await ask(geminiKey, model, eventPrompt(keep, other), EVENT_SCHEMA);
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 502);
  }

  const merged = kind === 'announcement'
    ? mergeAnnouncement(keep, other, said)
    : mergeEvent(keep, other, said);

  /* WHETHER ANYTHING ACTUALLY CHANGED is answered by the diff, not by the
     model. It is asked for `nothing_new` and its answer is carried through as
     a sentence for the admin to read, but a model that says "nothing new"
     while the diff shows a new ticket link would otherwise hide that link
     behind a message saying there was nothing to see. The diff is what the
     app draws and the diff is what decides whether Save is offered. */
  const unchanged = merged.changes.length === 0;

  return json({
    ok: true,
    kind,
    source_id: sourceId,
    target_id: targetId,
    keeps_title: str(keep.title),
    other_title: str(other.title),
    unchanged,
    note: unchanged
      ? 'Nothing new. The other one says nothing this one does not already say.'
      : (String(said.what_changed ?? '').trim().slice(0, 200) ||
         'The other one adds something. What changes is below.'),
    fields: merged.fields,
    changes: merged.changes,
  });
});
