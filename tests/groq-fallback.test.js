/* ===========================================================================
   The Groq backup, asked only when Gemini is busy.

   WHAT IS WORTH HOLDING STILL, and every one of these is a promise about
   what the backup does NOT do:

     IT NEVER THROWS. Every failure, a 413 for a newsletter too long for the
     free tier included, comes back as a reason, so the callers fall through
     to the "try again next run" they already had.

     IT DOES NOT CHANGE THE SHAPE. Groq's strict mode needs every field
     required, so optional fields go over as nullable and the nulls are taken
     back out, and the code after the model call reads the same object it
     always did.

     A PROSE ANSWER IS NOT AN ANSWER. Strict mode has been reported ignored on
     gpt-oss-120b; text that is not a JSON object is a reason, not a result.

     IT STAYS OUT OF WHAT FAMILIES READ. homekids-drive and group-status never
     import it, and the newsletter intake never asks it for a HomeKids email.

     IT SAYS SO. The merge preview names the backup when it wrote the words,
     says nothing when Gemini did, and escapes what it prints.

   No network: askGroq is handed a fake fetch.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

(async () => {
  const G = await import('../supabase/functions/_shared/groq.mjs');

  /* ------------------------------------------------------------ busy */

  ok('429 is busy', G.geminiWasBusy(429), true);
  ok('503 is busy', G.geminiWasBusy(503), true);
  ok('no answer at all is busy', G.geminiWasBusy(null), true);
  ok('400 is our mistake, not busy', G.geminiWasBusy(400), false);
  ok('404 is our mistake, not busy', G.geminiWasBusy(404), false);

  /* ---------------------------------------------------------- schema */

  // The dedupe shape: two required, two optional.
  const dedupe = {
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
  const strict = G.strictSchema(dedupe);
  const item = strict.properties.results.items;

  ok('every property becomes required', item.required, ['draft_id', 'same_thing', 'match_id', 'whats_new']);
  ok('nothing else is allowed', item.additionalProperties, false);
  ok('a required field stays as it was', item.properties.draft_id, { type: 'string' });
  ok('an optional field becomes nullable', item.properties.match_id, { type: ['string', 'null'] });
  ok('the top level is strict too', [strict.required, strict.additionalProperties], [['results'], false]);
  ok('the original schema is not touched', dedupe.properties.results.items.required, ['draft_id', 'same_thing']);

  // The newsletter's optional nested object and array.
  const nested = G.strictSchema({
    type: 'object',
    properties: {
      title: { type: 'string' },
      links: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
      event: { type: 'object', properties: { date: { type: 'string' }, hour: { type: 'integer' } }, required: ['date'] },
    },
    required: ['title'],
  });
  ok('an optional object is anyOf it or null', nested.properties.event.anyOf[1], { type: 'null' });
  ok('and is strict inside', nested.properties.event.anyOf[0].required, ['date', 'hour']);
  ok('an optional integer is nullable', nested.properties.event.anyOf[0].properties.hour.type, ['integer', 'null']);
  ok('an optional array is anyOf it or null', nested.properties.links.anyOf[1], { type: 'null' });

  /* ----------------------------------------------------------- nulls */

  ok('nulls come back out, all the way down',
    G.dropNulls({ a: 1, b: null, c: { d: null, e: 'x' }, f: [null, { g: null, h: 2 }] }),
    { a: 1, c: { e: 'x' }, f: [{ h: 2 }] });
  ok('false and empty are answers, not nulls',
    G.dropNulls({ a: false, b: '', c: 0, d: [] }), { a: false, b: '', c: 0, d: [] });

  /* --------------------------------------------------------- request */

  const req = G.groqRequest({ prompt: 'the same words Gemini got', schema: dedupe, temperature: 0.1, maxTokens: 4096 });
  ok('the default model', req.model, G.DEFAULT_GROQ_MODEL);
  ok('the prompt goes over word for word, alone', req.messages, [{ role: 'user', content: 'the same words Gemini got' }]);
  ok('strict json schema', [req.response_format.type, req.response_format.json_schema.strict], ['json_schema', true]);
  ok('settings carried', [req.temperature, req.max_completion_tokens], [0.1, 4096]);
  ok('a GROQ_MODEL secret wins', G.groqRequest({ model: 'openai/gpt-oss-20b', prompt: '', schema: dedupe }).model, 'openai/gpt-oss-20b');

  /* ---------------------------------------------------------- answer */

  const answer = (content, finish = 'stop') => ({ choices: [{ message: { content }, finish_reason: finish }] });

  ok('a JSON object is read, nulls removed',
    G.readGroqAnswer(answer('{"results":[{"draft_id":"a","same_thing":false,"match_id":null,"whats_new":null}]}')),
    { ok: true, value: { results: [{ draft_id: 'a', same_thing: false }] } });
  ok('prose is a reason, not a result',
    G.readGroqAnswer(answer('Sure! Here are the results: ...')).ok, false);
  ok('nothing is a reason', G.readGroqAnswer(answer('', 'length')).ok, false);
  ok('a bare array is not the object asked for', G.readGroqAnswer(answer('[1,2]')).ok, false);
  ok('a missing payload is a reason', G.readGroqAnswer(undefined).ok, false);

  /* ------------------------------------------------------------- ask */

  const fake = (status, body) => async (url, init) => {
    fake.last = { url, init };
    if (status === 'throw') throw new Error('socket hang up');
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };

  let got = await G.askGroq({
    apiKey: 'gsk_test', prompt: 'p', schema: dedupe,
    fetchImpl: fake(200, answer('{"results":[]}')),
  });
  ok('a good answer', got, { ok: true, value: { results: [] }, model: G.DEFAULT_GROQ_MODEL });
  ok('the key goes in the header, not the url',
    [fake.last.url, fake.last.init.headers.Authorization], [G.GROQ_URL, 'Bearer gsk_test']);

  got = await G.askGroq({ apiKey: 'k', prompt: 'p', schema: dedupe, fetchImpl: fake(413, 'Request too large') });
  ok('too long for the free tier is a reason', [got.ok, /too long/.test(got.reason)], [false, true]);

  got = await G.askGroq({ apiKey: 'k', prompt: 'p', schema: dedupe, fetchImpl: fake(429, 'rate limit') });
  ok('rate limited is a reason', got.ok, false);

  got = await G.askGroq({ apiKey: 'k', prompt: 'p', schema: dedupe, fetchImpl: fake(503, 'busy') });
  ok('Groq busy is a reason', got.ok, false);

  got = await G.askGroq({ apiKey: 'k', prompt: 'p', schema: dedupe, fetchImpl: fake('throw') });
  ok('a dead socket is a reason, not a throw', [got.ok, /socket hang up/.test(got.reason)], [false, true]);

  got = await G.askGroq({ apiKey: 'k', prompt: 'p', schema: dedupe, fetchImpl: fake(200, answer('I think they match.')) });
  ok('a prose answer is a reason', got.ok, false);

  /* ----------------------------------------------------- who uses it */

  const uses = (f) => /_shared\/groq\.mjs/.test(read('supabase/functions/' + f + '/index.ts'));
  ok('newsletter-intake uses it', uses('newsletter-intake'), true);
  ok('content-merge uses it', uses('content-merge'), true);
  ok('announcement-dedupe uses it', uses('announcement-dedupe'), true);
  ok('event-dedupe uses it', uses('event-dedupe'), true);
  ok('homekids-drive does NOT', uses('homekids-drive'), false);
  ok('group-status does NOT', uses('group-status'), false);

  const intake = read('supabase/functions/newsletter-intake/index.ts');
  ok('the intake never asks it for a HomeKids email',
    /const groqKey = spec \? undefined : Deno\.env\.get\('GROQ_API_KEY'\)/.test(intake), true);
  ok('the intake only labels when the backup wrote it',
    /const stamp = writtenBy \? \{ written_by: writtenBy \} : \{\};/.test(intake), true);

  /* ------------------------------------------------- the merge preview */

  // The same sandbox tests/merge-panel.test.js draws the panel in.
  const store = new Map();
  const sandbox = { window: { console, localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => Array.from(store.keys())[i],
    get length() { return store.size; },
  } } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  ['data.js', 'store.js', 'components.js'].forEach((f) =>
    vm.runInContext(read('js/' + f), sandbox));
  const c = sandbox.window.HC.components;

  const preview = (writtenBy) => ({
    kind: 'announcement', sourceId: 'a', targetId: 'b', step: 'preview', error: '',
    preview: {
      keeps_title: 'Homecoming', other_title: 'Homecoming Gala', unchanged: false,
      note: 'Adds the ticket link.',
      changes: [{ field: 'link_url', label: 'Link', before: '', after: 'https://example.com/t' }],
      written_by: writtenBy,
    },
  });
  const TARGETS = [{ id: 'b', title: 'Homecoming', when: 'On Home' }];

  let html = c.mergePanel(preview(null), TARGETS, {});
  ok('Gemini wrote it: the preview says nothing about a backup', /Written by/.test(html), false);

  html = c.mergePanel(preview('Groq (backup)'), TARGETS, {});
  ok('the backup wrote it: the preview says so', /Written by Groq \(backup\), because Gemini was busy/.test(html), true);

  html = c.mergePanel(preview('<img src=x onerror=alert(1)>'), TARGETS, {});
  ok('and escapes it', /<img/.test(html), false);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
