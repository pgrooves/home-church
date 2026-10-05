/**
 * Home Church, the second model: Groq, asked only when Gemini is busy.
 *
 * Plain JavaScript in its own file, the way cafe.mjs is, so the Edge
 * Functions that use it and tests/groq-fallback.test.js run the same lines.
 *
 * WHY IT EXISTS. Gemini's free tier answers 429 and 503 often enough that a
 * newsletter has gone a day late more than once waiting for it. Groq is a
 * different company with its own free tier, so a busy spell at Google is not
 * a busy spell here. It is a BACKUP and nothing more: every caller asks Gemini
 * first, the same prompt goes to both word for word, and Groq is only asked
 * when Gemini has refused.
 *
 * WHERE IT IS USED, and where it is deliberately not. Only where a person
 * reads the answer before the church does: newsletter drafts (the review
 * queue), the two dedupe passes (advisory flags) and content-merge (a preview
 * with Save and Cancel under it). NOT in homekids-drive or the HomeKids emails,
 * where the voice families read matters most and a late guide costs little,
 * and NOT in group-status, the one function that writes straight to a public
 * card. Whatever Groq wrote is labelled GROQ_LABEL where the admin reads it.
 *
 * OFF UNTIL THE KEY IS THERE. With no GROQ_API_KEY secret the callers never
 * reach this file and behave exactly as they did before it existed.
 *
 * IT NEVER THROWS. Every way it can fail comes back as { ok: false, reason },
 * and every caller treats that exactly as it already treats Gemini being busy:
 * nothing written, try again next time. A backup that could turn a busy
 * afternoon into a hard failure would be worse than no backup.
 *
 * SECRETS
 *   GROQ_API_KEY   from console.groq.com -> API Keys. Turns this on.
 *   GROQ_MODEL     optional, defaults to DEFAULT_GROQ_MODEL below.
 */

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

/* What the admin screens say about anything this wrote. One string, so the
   review queue, the merge preview and the dedupe notes cannot drift into
   three different names for the same thing. */
export const GROQ_LABEL = 'Groq (backup)';

/* Is this Gemini answer one worth handing to Groq. Busy and rate limited
   only: a 400 or a 404 is our request being wrong, and asking a second model
   the same wrong question just hides that. A null status is a fetch that never
   got an answer at all (DNS, TLS, a reset socket), which is busy too. */
export function geminiWasBusy(status) {
  return status === null || status === 429 || status >= 500;
}

/* ------------------------------------------------------------ the schema

   Gemini and Groq take the same JSON Schema with one difference that matters.
   Groq's strict mode, the one that constrains the answer to the shape rather
   than hoping, insists that every object lists every property as required and
   allows nothing else. Gemini's schemas here leave fields out of `required`
   to mean "may be omitted".

   So each optional field becomes required-but-nullable: the model must write
   the key, and writes null where Gemini would have left it out. dropNulls()
   below then takes those nulls back out, so the caller gets the shape it has
   always parsed and none of the code after the model call has to know which
   model answered. */
export function strictSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };

  if (out.type === 'object' && out.properties) {
    const required = new Set(out.required || []);
    const props = {};
    for (const [key, value] of Object.entries(out.properties)) {
      const inner = strictSchema(value);
      props[key] = required.has(key) ? inner : nullable(inner);
    }
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }

  if (out.type === 'array' && out.items) out.items = strictSchema(out.items);
  return out;
}

function nullable(schema) {
  if (schema.type === 'object' || schema.type === 'array') {
    return { anyOf: [schema, { type: 'null' }] };
  }
  return { ...schema, type: [schema.type, 'null'] };
}

/* Every null key, removed, all the way down. Gemini never sends null for any
   field in these schemas, so a null can only be strictSchema's stand-in for
   "left out", and leaving it in would turn `item.event ?? fallback` checks
   into a null that looks like an answer. Nulls inside arrays are dropped too:
   a list of links with a null in it is a list with a hole the callers do not
   expect. */
export function dropNulls(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null).map(dropNulls);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (v !== null) out[key] = dropNulls(v);
    }
    return out;
  }
  return value;
}

/* ------------------------------------------------------------- the request

   OpenAI's chat format, which is what Groq speaks. The prompt is the same
   text Gemini was sent, as the one user message, with nothing added: the
   voice comes from the prompt, and a second prompt for the backup would be a
   second voice to keep in step.

   REASONING LOW. gpt-oss thinks before it answers, and the thinking is
   counted against Groq's free per-minute token allowance. These are reading
   and sorting jobs with the rules spelled out in the prompt; they do not need
   it to deliberate at length, and every token it does not spend thinking is
   one the answer can use. */
export function groqRequest({ model, prompt, schema, temperature = 0.2, maxTokens = 8192 }) {
  return {
    model: model || DEFAULT_GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_completion_tokens: maxTokens,
    reasoning_effort: 'low',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'answer', strict: true, schema: strictSchema(schema) },
    },
  };
}

/* The answer as the callers want it: the parsed JSON, nulls removed, or the
   reason there is not one. Checked here rather than trusted, because strict
   mode has been reported ignored on gpt-oss-120b, answering in prose. A
   prose answer is a reason, not a result.
   @returns {{ ok: true, value: any } | { ok: false, reason: string }} */
export function readGroqAnswer(payload) {
  const choice = payload?.choices?.[0];
  const text = String(choice?.message?.content ?? '').trim();
  const finish = String(choice?.finish_reason ?? 'no reason given');

  if (!text) return { ok: false, reason: `Groq returned nothing to read (${finish}).` };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      reason: `Groq did not answer in JSON (${finish}; ${text.length} characters).`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'Groq answered, but not with the object that was asked for.' };
  }
  return { ok: true, value: dropNulls(parsed) };
}

/**
 * Ask Groq. Resolves to { ok: true, value, model } or { ok: false, reason }.
 * Never rejects.
 *
 * TOO LARGE IS NORMAL. The free tier allows about 8,000 tokens a minute on
 * gpt-oss-120b, and a long newsletter is bigger than that on its own. Groq
 * answers 413 or 429 and this says so; the caller then does what it did before
 * Groq existed, which is try again on the next run.
 *
 * @returns {Promise<{ ok: true, value: any, model: string } | { ok: false, reason: string }>}
 */
export async function askGroq({
  apiKey, model, prompt, schema, temperature, maxTokens, fetchImpl = fetch,
}) {
  const body = groqRequest({ model, prompt, schema, temperature, maxTokens });

  let res;
  try {
    res = await fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: `Could not reach Groq: ${String(err?.message ?? err)}` };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const why = res.status === 413 ? 'this one is too long for the free tier'
      : res.status === 429 ? 'rate limited, or too long for the free tier'
      : res.status >= 500 ? 'busy'
      : 'refused the request';
    return {
      ok: false,
      reason: `Groq ${why} (${res.status} on ${body.model}): ${detail.slice(0, 200)}`,
    };
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, reason: 'Groq answered with something that was not JSON.' };
  }

  const read = readGroqAnswer(payload);
  return read.ok ? { ...read, model: body.model } : read;
}
