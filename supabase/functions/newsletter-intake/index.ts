/**
 * Home Church, turning the weekly newsletter into draft announcements.
 *
 * WHAT IT DOES, in order. Opens the dedicated mailbox over IMAP, finds any
 * email it has not seen before, hands the words to Gemini with a schema that
 * forces structured output, and writes each thing it found as an unpublished
 * announcement with `review_state = 'pending'`. Then it marks the email read
 * and writes down what happened. An admin opens Settings -> Admin ->
 * Announcements and finds the drafts waiting under "Needs review".
 *
 * AND SINCE 0043, IT SAYS SO. A run that added anything to either queue asks
 * for a push at the end, one for the announcements queue and one for the dates
 * queue, and only the admins hear it. Before that the only way to learn there
 * was a queue was to think of looking, which most weeks meant a newsletter
 * that arrived on Tuesday reached Home on Sunday. See tellTheAdmins() in main,
 * which is deliberately the last thing that happens rather than a trigger on
 * the table.
 *
 * NOTHING THIS FUNCTION WRITES IS EVER PUBLISHED. Every insert below is
 * `published: false`, and migration 0026's select policy means an unpublished
 * announcement is visible to admins and to nobody else. The app's own content
 * sync reads with the publishable key and no session, so a parsed draft cannot
 * reach Home even on the phone of the admin reviewing it. Approving is a
 * person tapping a button in the app, and it is the only thing anywhere in
 * this feature that sets published to true.
 *
 * WHO CALLS IT. pg_cron, every twenty minutes, through
 * `public.hc_newsletter_tick()` in migration 0038. The tick posts with pg_net,
 * which is fire and forget, so the response goes nowhere and this function
 * writes its own outcome to `newsletter_runs` and `newsletter_emails`. That is
 * not belt and braces, it is the only record there is.
 *
 * WHY verify_jwt IS OFF. Same answer as send-push: the caller is the database,
 * which has no user session to present. It proves itself with a dedicated
 * shared secret whose entire power is "cause a mailbox to be read", compared
 * in constant time below. Storing a service role key in Postgres to mint a
 * bearer token instead would put a key that bypasses RLS on every table into
 * the database, for the same convenience.
 *
 * WHY THE IMAP CLIENT IS HAND WRITTEN. There is no Deno IMAP library worth the
 * dependency, and the npm ones drag in Node's net and tls shims to do what
 * Deno.connectTls does directly. What we need is six commands and a literal
 * reader. This project already hand-signed an ES256 JWT for APNs rather than
 * take a library for it, and this is the same trade: about two hundred lines
 * we can read against a dependency we cannot.
 *
 * SECRETS, set under Project Settings -> Edge Functions -> Secrets. They are
 * project wide rather than per function, which is why these are named for the
 * job that owns them: the same page holds send-push's HC_PUSH_CRON_SECRET and
 * its four APNS_ values, and every function sees all of them. The whole list
 * and where each one comes from is in NEWSLETTER_INTAKE_SETUP.md.
 *
 *   HC_NEWSLETTER_CRON_SECRET   must equal the vault secret 0038 generated
 *   NEWSLETTER_IMAP_HOST        imap.gmail.com
 *   NEWSLETTER_IMAP_PORT        993
 *   NEWSLETTER_IMAP_USER        the dedicated address
 *   NEWSLETTER_IMAP_PASSWORD    a Google App Password, 16 letters, NOT the
 *                               account password and NOT a 2FA backup code
 *   GEMINI_API_KEY              from Google AI Studio
 *   GEMINI_MODEL                optional, defaults below
 *
 * TWO MODES FOR WHEN IT IS NOT WORKING, both POSTed with the same secret:
 *   {"probe": true}     opens the socket, logs in, counts the inbox, and
 *                       returns what it found without parsing anything. This
 *                       is the first thing to run after setting the secrets.
 *   {"dry_run": true}   does the whole job and writes nothing: no drafts, no
 *                       \Seen, no ledger rows. Returns the drafts it would
 *                       have written, so a bad parse can be looked at before
 *                       it becomes rows.
 *   {"backfill": true}  ignores the mailbox entirely and gives announcements
 *                       that already exist the event they would have got if
 *                       0040 had existed when they were parsed, and the one the
 *                       parse should have made and did not. One model call for
 *                       the batch; `limit` caps how many it looks at, default
 *                       25. Safe to run more than once: it only considers
 *                       announcements with no event yet, and every event it
 *                       writes waits in the dates queue for a person.
 *
 * DEPLOY
 *   supabase functions deploy newsletter-intake --no-verify-jwt
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

/* The model, overridable by secret so a model being retired or getting
   congested is a dashboard edit rather than a redeploy. Neither of those is
   hypothetical: gemini-2.5-flash now answers 404 to new keys with a message
   telling callers to move on, and on the day this was written the two newest
   Flash models were both answering 503 "experiencing high demand" on the free
   tier after a three minute wait.

   WHY 3.5 AND NOT THE NEWEST. Measured, on a real newsletter, not assumed.
   gemini-3.5-flash answered in 21 seconds and split a five item newsletter
   correctly. gemini-3-flash-preview spent nine thousand tokens thinking and
   hit the output ceiling before it finished the JSON. gemini-3.7-flash and
   gemini-flash-latest were both 503. The newest model is the wrong default for
   a job that has to complete inside an Edge Function invocation. */
const DEFAULT_MODEL = 'gemini-3.5-flash';

/* How far back to look, and how much to do in one run. The newsletter is
   weekly, so a fortnight is a wide net; the cap is there so a mailbox that
   somehow accumulated forty emails cannot turn one cron tick into forty model
   calls. Whatever is left over is picked up twenty minutes later. */
const SEARCH_DAYS = 14;
const MAX_EMAILS_PER_RUN = 5;
const MAX_DRAFTS_PER_EMAIL = 8;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* Constant time compare, lifted from send-push for the same reason it is there:
   a plain === leaks the length of the matching prefix through timing, and not
   doing that costs four lines. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ========================================================================
   Bytes and strings

   Everything off the wire is held as a latin1 string: one character per byte,
   nothing lost, nothing guessed. That matters because a message body is not
   text yet at the point we are reading it. It is bytes in some charset we have
   not read the header for, possibly base64, and decoding it as UTF-8 on
   arrival would replace every byte that is not valid UTF-8 with U+FFFD before
   we ever got to find out what it actually was. So: latin1 in, decode once we
   know, per part.
   ===================================================================== */

function latin1(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;   // String.fromCharCode has an argument count limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function toBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/* Bytes to text, once the part's own header has told us the charset. An
   unknown or misspelt charset is common in real mail and is not worth failing
   an entire newsletter over, so it falls back rather than throws. */
function decodeCharset(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/* ========================================================================
   The IMAP client

   Six commands: LOGIN, SELECT, SEARCH, FETCH, STORE, LOGOUT. The only part
   that is not obvious is the literal, and it is the part that makes a naive
   line-based client wrong: a server answering a FETCH sends `{12345}` at the
   end of a line and then exactly that many bytes, which contain CRLFs of their
   own. Reading responses a line at a time without handling that desynchronises
   the stream on the first email that has a blank line in it, which is all of
   them.
   ===================================================================== */

class ImapError extends Error {}

/* A failure that will probably not be a failure in twenty minutes: the model
   is busy, the rate limit is hit, a socket died mid-request.

   WHY THIS DISTINCTION IS THE MOST IMPORTANT ONE IN THE FILE. An email that
   fails to parse gets a ledger row so it is not retried forever, and that is
   correct for an email we genuinely cannot read. Applied to a 503 it is a
   disaster: the one newsletter of the week is marked failed and read, and it
   never comes back. The whole feature silently does nothing that week, and the
   only clue is a note nobody is looking at.

   So a transient failure does NOT mark the email read. The email stays exactly
   as it was in the mailbox and the next tick, twenty minutes later, tries it
   again. That is why the classification lives in its own type rather than in a
   string match at the catch site.

   SINCE 0069 IT WRITES A ROW ALL THE SAME, marked `deferred` and carrying a
   count. Leaving no trace at all made the retry free and the counting
   impossible, and an answer that arrives truncated every single time would
   then be re-read every twenty minutes for as long as the fortnight search
   could see it, with nothing anywhere saying so. The row is what bounds that
   and what makes it visible. */
class TransientError extends Error {}

class Imap {
  private conn: Deno.TlsConn | null = null;
  private buf = new Uint8Array(0);
  private seq = 0;

  async connect(host: string, port: number): Promise<string> {
    this.conn = await Deno.connectTls({ hostname: host, port });
    const greeting = await this.readLine();
    if (!/^\*\s+OK/i.test(greeting)) {
      throw new ImapError(`The mail server did not greet us: ${greeting.slice(0, 200)}`);
    }
    return greeting;
  }

  private async fill(): Promise<void> {
    if (!this.conn) throw new ImapError('Not connected.');
    const chunk = new Uint8Array(65536);
    const n = await this.conn.read(chunk);
    if (n === null) throw new ImapError('The mail server closed the connection.');
    const next = new Uint8Array(this.buf.length + n);
    next.set(this.buf);
    next.set(chunk.subarray(0, n), this.buf.length);
    this.buf = next;
  }

  private async readLine(): Promise<string> {
    for (;;) {
      for (let i = 0; i + 1 < this.buf.length; i++) {
        if (this.buf[i] === 0x0d && this.buf[i + 1] === 0x0a) {
          const line = latin1(this.buf.subarray(0, i));
          this.buf = this.buf.slice(i + 2);
          return line;
        }
      }
      await this.fill();
    }
  }

  private async readExactly(n: number): Promise<string> {
    while (this.buf.length < n) await this.fill();
    const out = latin1(this.buf.subarray(0, n));
    this.buf = this.buf.slice(n);
    return out;
  }

  /* One logical response line, with any literals spliced into it. The loop
     rather than an if is deliberate: a single FETCH response can carry two
     literals, and the second one only becomes visible after the first has been
     consumed and the rest of the line read. */
  private async readResponseLine(): Promise<string> {
    let line = await this.readLine();
    for (;;) {
      const m = /\{(\d+)\}$/.exec(line);
      if (!m) return line;
      const payload = await this.readExactly(parseInt(m[1], 10));
      const rest = await this.readLine();
      line = line.slice(0, m.index) + payload + rest;
    }
  }

  private async write(text: string): Promise<void> {
    if (!this.conn) throw new ImapError('Not connected.');
    await this.conn.write(toBytes(text));
  }

  /* Runs one command and collects every untagged line until the tagged
     completion. Throws on NO and BAD rather than returning them, because there
     is no command in this file whose failure the caller could usefully
     continue past. */
  async command(cmd: string, redact = false): Promise<string[]> {
    const tag = 'h' + String(++this.seq).padStart(4, '0');
    await this.write(`${tag} ${cmd}\r\n`);

    const lines: string[] = [];
    for (;;) {
      const line = await this.readResponseLine();
      if (line.startsWith(`${tag} `)) {
        const rest = line.slice(tag.length + 1);
        if (/^OK\b/i.test(rest)) return lines;
        const shown = redact ? cmd.split(' ')[0] : cmd.slice(0, 60);
        throw new ImapError(`${shown} was refused: ${rest.slice(0, 200)}`);
      }
      lines.push(line);
    }
  }

  /* A quoted IMAP string. App passwords are sixteen letters so neither of
     these escapes will ever fire on the happy path, which is exactly why they
     are here: the day somebody puts a real password in that secret is the day
     an unescaped quote turns an auth failure into a protocol error nobody can
     read. */
  static quote(value: string): string {
    return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  async login(user: string, password: string): Promise<void> {
    try {
      await this.command(`LOGIN ${Imap.quote(user)} ${Imap.quote(password)}`, true);
    } catch (err) {
      const detail = String((err as Error).message ?? err);
      if (/AUTHENTICATIONFAILED|Invalid credentials/i.test(detail)) {
        throw new ImapError(
          'The mailbox refused the sign in. Gmail needs a 16 letter App Password ' +
          'here, not the account password and not a 2FA backup code. ' +
          'Check NEWSLETTER_IMAP_USER and NEWSLETTER_IMAP_PASSWORD.',
        );
      }
      throw err;
    }
  }

  async selectInbox(): Promise<number> {
    const lines = await this.command('SELECT INBOX');
    for (const line of lines) {
      const m = /^\*\s+(\d+)\s+EXISTS/i.exec(line);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  }

  async search(criteria: string): Promise<number[]> {
    const lines = await this.command(`UID SEARCH ${criteria}`);
    const uids: number[] = [];
    for (const line of lines) {
      const m = /^\*\s+SEARCH\b(.*)$/i.exec(line);
      if (!m) continue;
      for (const part of m[1].trim().split(/\s+/)) {
        const n = parseInt(part, 10);
        if (Number.isFinite(n)) uids.push(n);
      }
    }
    return uids;
  }

  /* The raw source of one message, headers and all. BODY.PEEK rather than BODY
     so reading it does not set \Seen: the flag is set at the end, only once the
     drafts are safely in the table. A crash in between therefore leaves the
     email unread and it is picked up again, which is the direction we want the
     failure to fall. */
  async fetchRaw(uid: number, section = ''): Promise<string> {
    const lines = await this.command(`UID FETCH ${uid} (BODY.PEEK[${section}])`);
    for (const line of lines) {
      const i = line.indexOf(']');
      if (/^\*\s+\d+\s+FETCH/i.test(line) && i !== -1) {
        // Everything after `BODY[...]` and its space, minus the closing paren
        // the server puts on the end of the FETCH response.
        let body = line.slice(i + 1).replace(/^\s*/, '');
        body = body.replace(/\)\s*$/, '');
        return body;
      }
    }
    return '';
  }

  async markSeen(uid: number): Promise<void> {
    await this.command(`UID STORE ${uid} +FLAGS (\\Seen)`);
  }

  async close(): Promise<void> {
    try {
      if (this.conn) await this.command('LOGOUT');
    } catch {
      // A server that has already hung up is not an error worth reporting on
      // the way out of a run that otherwise worked.
    }
    try {
      this.conn?.close();
    } catch { /* already closed */ }
    this.conn = null;
  }
}

/* IMAP wants `23-Aug-2026`, always in English, regardless of anything. */
const IMAP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function imapDate(d: Date): string {
  return `${d.getUTCDate()}-${IMAP_MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/* ========================================================================
   MIME

   Enough of RFC 2045 and 2047 to get the words out of a newsletter, and no
   more. Church newsletters are sent by Mailchimp, Flodesk, Planning Center and
   Gmail itself, which between them means multipart/alternative carrying
   quoted-printable HTML about ninety per cent of the time.
   ===================================================================== */

interface Part {
  headers: Record<string, string>;
  body: string;          // still latin1 bytes-as-string
}

/* Header continuation lines are folded onto the previous one, per RFC 5322.
   Without this, a Subject long enough to wrap comes out truncated at the
   fold, which is most subjects. */
function splitHeaders(raw: string): Part {
  const end = raw.search(/\r?\n\r?\n/);
  const head = end === -1 ? raw : raw.slice(0, end);
  const body = end === -1 ? '' : raw.slice(end).replace(/^\r?\n\r?\n/, '');

  const headers: Record<string, string> = {};
  const unfolded = head.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    // First wins. A duplicated Message-ID is malformed mail and taking the
    // first is at least deterministic.
    if (!(name in headers)) headers[name] = value;
  }
  return { headers, body };
}

function contentType(headers: Record<string, string>): { type: string; charset: string; boundary: string } {
  const raw = headers['content-type'] ?? 'text/plain';
  const type = raw.split(';')[0].trim().toLowerCase();
  const charset = /charset\s*=\s*"?([^";]+)"?/i.exec(raw)?.[1]?.trim() ?? 'utf-8';
  const boundary = /boundary\s*=\s*"?([^";]+)"?/i.exec(raw)?.[1]?.trim() ?? '';
  return { type, charset, boundary };
}

function decodeQuotedPrintable(text: string): Uint8Array {
  // Soft line breaks first, then the hex escapes.
  const joined = text.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '=' && i + 2 < joined.length) {
      const hex = joined.slice(i + 1, i + 3);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        out.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    out.push(joined.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}

function decodeBase64(text: string): Uint8Array {
  try {
    return toBytes(atob(text.replace(/[^A-Za-z0-9+/=]/g, '')));
  } catch {
    return new Uint8Array(0);
  }
}

function decodePart(part: Part): string {
  const { charset } = contentType(part.headers);
  const encoding = (part.headers['content-transfer-encoding'] ?? '7bit').trim().toLowerCase();

  if (encoding === 'base64') return decodeCharset(decodeBase64(part.body), charset);
  if (encoding === 'quoted-printable') return decodeCharset(decodeQuotedPrintable(part.body), charset);
  return decodeCharset(toBytes(part.body), charset);
}

/* Walks the tree and returns every leaf that is text. Depth limited because a
   malformed message can describe a boundary that contains itself, and an
   unbounded recursion inside an Edge Function is a run that dies with no row
   written rather than an error anybody can read. */
function textParts(raw: string, depth = 0): Array<{ type: string; text: string }> {
  if (depth > 6) return [];
  const part = splitHeaders(raw);
  const { type, boundary } = contentType(part.headers);

  if (type.startsWith('multipart/') && boundary) {
    const marker = `--${boundary}`;
    const chunks = part.body.split(marker);
    const out: Array<{ type: string; text: string }> = [];
    // First chunk is the preamble and the last is the epilogue after `--`.
    for (const chunk of chunks.slice(1)) {
      if (/^--/.test(chunk)) break;
      out.push(...textParts(chunk.replace(/^\r?\n/, ''), depth + 1));
    }
    return out;
  }

  if (type === 'text/plain' || type === 'text/html') {
    return [{ type, text: decodePart(part) }];
  }
  return [];
}

/* RFC 2047, the `=?UTF-8?B?...?=` that subjects arrive wrapped in. */
function decodeHeaderWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_all, charset, enc, text) => {
    const bytes = /^b$/i.test(enc)
      ? decodeBase64(text)
      : decodeQuotedPrintable(String(text).replace(/_/g, ' '));
    return decodeCharset(bytes, charset);
  }).replace(/\?=\s+=\?/g, '');   // adjacent encoded words are joined without the space
}

/* ========================================================================
   HTML to something a model can read

   Not a parser. A newsletter's HTML is table soup with a hundred inline styles
   and we want the sentences out of it, plus the links and pictures, so the
   model has candidates to choose from rather than an invitation to invent a
   URL.
   ===================================================================== */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[body.toLowerCase()] ?? all;
  });
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|tr|table|h[1-6]|li|ul|ol|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Every https link in the HTML, in the order they appear, with the words that
   were inside the anchor. The words are what lets the model tell "Register
   here" apart from an unsubscribe footer without us hard-coding a list. */
function extractLinks(html: string): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = decodeEntities(m[1]).trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: htmlToText(m[2]).slice(0, 120) });
    if (out.length >= 80) break;
  }
  return out;
}

/* Bare URLs sitting in the text, merged in behind the anchors.

   Two cases this covers, both of which would otherwise silently lose a link.
   A newsletter sent as plain text only has no anchors to find at all, so
   extractLinks returns nothing and the model is handed "CANDIDATE LINKS: none"
   — and since it may only choose from that list, every link in the email is
   unreachable. The second is a sender who prints the URL next to the button
   rather than only wrapping it.

   Appended rather than prepended, and de-duplicated against what the anchors
   already found, so a link that has real button text keeps that text: the
   label is what tells the model a Join a group button apart from a footer. */
const BARE_URL = /https?:\/\/[^\s<>"')\]]+/gi;

function extractTextLinks(
  text: string,
  already: Array<{ url: string; text: string }>,
): Array<{ url: string; text: string }> {
  const seen = new Set(already.map((l) => l.url));
  const out: Array<{ url: string; text: string }> = [];
  for (const raw of text.match(BARE_URL) ?? []) {
    // Trailing sentence punctuation is not part of the URL.
    const url = raw.replace(/[.,;:!?]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: '' });
    if (out.length >= 40) break;
  }
  return out;
}

/* Pictures worth offering. The filter is the whole value here: a marketing
   email is mostly one-pixel tracking beacons, spacer gifs and a logo, and a
   draft announcement carrying a tracking pixel as its photograph is worse than
   one carrying no photograph at all. */
const PIXEL_HINT = /(track|beacon|pixel|spacer|\bopen\b|\.gif(\?|$)|width=["']?1["']?|height=["']?1["']?)/i;

function extractImages(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1];
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) continue;
    const url = decodeEntities(src).trim();
    if (!/^https:\/\//i.test(url)) continue;   // no http, no data:, no cid:
    if (PIXEL_HINT.test(tag) || PIXEL_HINT.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 12) break;
  }
  return out;
}

/* ========================================================================
   Gemini
   ===================================================================== */

/* THE SHAPE CHANGED ONCE ALREADY, and why is worth keeping. The first version
   asked for a single `body` string and told the model to write "one or two
   warm sentences". It produced lovely prose and quietly dropped a Join a group
   button off the bottom of the first real newsletter it read.

   That was not the model failing. A church announcement is not a paragraph, it
   is a paragraph plus a pile of specifics: a deadline, a price, an age range,
   what to bring, who to talk to, and one or more things to tap. Asking for
   prose asks the model to choose what to throw away, and the things it throws
   away are exactly the things somebody needs in order to act.

   So the shape now matches what an announcement actually is. Three fields
   rather than one, and the composition below turns them into markup the
   announcement screen already knows how to draw: js/richtext.js allows ul, li
   and a with links: 'web', so bullets and real hyperlinks survive the
   sanitizer on both the way in and the way out. */

interface ParsedLink {
  label?: string;
  url: string;
}

/* The dated thing an announcement is about, when it is about one.

   Separate from ends_on, which is about the card and not the event: a serve
   day on the 12th wants a card that retires on the 13th AND a calendar entry
   at 8am on the 12th, and those are two different dates doing two different
   jobs. Conflating them is how you get a calendar entry on the day the poster
   comes down. */
/* THE TIME IS TWO INTEGERS AND NOT "HH:MM", which looks like fussiness and is
   the fix for a real and spectacular failure.

   With `time` typed as a string the model would, perhaps one run in three,
   emit `"time": "18:00` and then fall into a degenerate loop of zeros —

     "time": "18:00000000000000000000000000000000000000000…

   — until it hit the output ceiling, which truncated the JSON mid-string and
   failed the whole batch. Twenty-five thousand tokens and seventy seconds to
   produce nothing. A free-form string invites that; an integer cannot run
   away, because the type has nowhere to go.

   Swapping the two fields made the backfill deterministic across repeated
   runs, took it from seventy seconds to seven, and as a side effect fixed the
   location field, which had been quietly going missing while the model was
   busy losing its place. */
interface ParsedEvent {
  date: string;         // YYYY-MM-DD, the day the thing happens
  hour?: number;        // 0-23, church local
  minute?: number;      // 0-59
  end_hour?: number;
  end_minute?: number;
  location?: string;
}

interface Parsed {
  title: string;
  eyebrow?: string;
  summary: string;
  details?: string[];
  links?: ParsedLink[];
  ends_on?: string;
  image_url?: string;
  event?: ParsedEvent;
}

const SCHEMA = {
  type: 'object',
  properties: {
    announcements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          eyebrow: { type: 'string' },
          summary: { type: 'string' },
          details: { type: 'array', items: { type: 'string' } },
          links: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                url: { type: 'string' },
              },
              required: ['url'],
            },
          },
          ends_on: { type: 'string' },
          image_url: { type: 'string' },
          event: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              hour: { type: 'integer' },
              minute: { type: 'integer' },
              end_hour: { type: 'integer' },
              end_minute: { type: 'integer' },
              location: { type: 'string' },
            },
            required: ['date'],
          },
        },
        required: ['title', 'summary'],
      },
    },
  },
  required: ['announcements'],
};

function prompt(
  text: string,
  links: Array<{ url: string; text: string }>,
  images: string[],
  emailDate: string,
): string {
  return [
    'You are preparing draft announcements for a church app from the church\'s own',
    'weekly newsletter email. A person reviews and approves every draft before anything',
    'is published.',
    '',
    'YOUR FIRST DUTY IS COMPLETENESS. Somebody reading the finished card must be able to',
    'act on it without ever opening the original email. Every concrete fact that would',
    'change what a person does — a deadline, a cost, an age range, a location, a time, a',
    'thing to bring, a person to contact, a form to fill in, a button to tap — must be',
    'carried across. Dropping a sign-up link because the summary read nicely without it',
    'is the worst mistake you can make here. Do not summarise detail away.',
    '',
    'Accuracy still outranks completeness: never invent a fact, a date or a URL that is',
    'not in the email. But when something IS in the email, carry it over.',
    '',
    `The newsletter was sent on ${emailDate}. Resolve every relative date ("this Sunday",`,
    '"next Wednesday", "tonight") against that date, in the America/Chicago timezone.',
    '',
    'RULES',
    '1. A newsletter usually bundles several separate things: a serve day, a members',
    '   meeting, a baptism sign-up, a schedule change. Return each one as its own',
    '   announcement. Do not merge distinct events into a single entry, and do not',
    '   split one event into several.',
    '2. Skip only what is genuinely not an announcement: greetings, a pastor\'s letter,',
    '   scripture of the week, unsubscribe and "view this in your browser" footers,',
    '   "forward this to a friend", plain social media follow links, and the',
    '   newsletter\'s own masthead. When in doubt, keep it.',
    '3. title: short and specific, the way it would read on a card. Include the date',
    '   if the thing has one, e.g. "City Serve Day, September 12". No trailing period.',
    '4. summary: one or two warm, plain sentences saying what the thing is. This is the',
    '   opening line, NOT the whole announcement — the specifics go in details.',
    '5. details: an array of short strings, one per concrete fact, drawn only from the',
    '   email. Include every one that applies: date and time, location or address,',
    '   registration or RSVP deadline, cost or price ("$15 a person", "free"), who it is',
    '   for (ages, members only, families), what to bring, who to contact and how, and',
    '   any requirement or condition. If the email lists things as bullets, keep them as',
    '   separate bullets. Empty array only if the email genuinely gives no specifics.',
    '6. links: EVERY link belonging to this announcement, not just the main one. A',
    '   "Sign up", "Register", "Join a group", "RSVP", "Give", "Learn more" or',
    '   "Directions" button is part of the announcement and must appear here. Give each',
    '   one a short `label` taken from the button or link text as it appeared in the',
    '   email, and the `url` copied EXACTLY from the candidate list below. Never write a',
    '   URL that is not in that list. If an announcement has no link, use an empty array.',
    '7. eyebrow: a two or three word label if one is obvious ("This Sunday", "Serve",',
    '   "Kids"). Leave it out entirely if nothing fits. Never invent a category.',
    '8. ends_on: strict YYYY-MM-DD, the day the card should DISAPPEAR from the app.',
    '   That is the day AFTER the event, never the event date itself — an event on',
    '   2026-09-12 takes ends_on 2026-09-13, or the card vanishes on the morning of the',
    '   thing it is announcing. Leave it out for anything with no end: an ongoing need',
    '   for volunteers, a standing invitation, a change that is simply true from now on.',
    '   Do not guess an end date for something that has none. And if you do give one,',
    '   you are saying something happens the day before it — so that same thing must',
    '   also appear in `event` below. The two answers have to agree.',
    '9. image_url: choose ONLY from the candidate images below, copied exactly, or leave',
    '   it out.',
    '10. event: the day the thing actually HAPPENS, whenever the email names one. A',
    '   gathering, a service, a serve day, a meeting, a class, a party, a blessing at a',
    '   Sunday service: if a reader could sensibly put it in their calendar, it belongs',
    '   here. "Homecoming on Friday, October 23" is an event.',
    '   A SIGN-UP FOR A DATED THING IS STILL THAT DATED THING. "Baby Blessing Sign-Up',
    '   9/20" and "Register for the retreat, October 3-5" are events, on the day of the',
    '   blessing and on the first day of the retreat. The form is how a person gets in;',
    '   the date is what they wanted in their calendar. Never give the day the sign-up',
    '   closes instead of the day the thing happens.',
    '   The date is very often in the TITLE ("9/20", "September 20") as well as in the',
    '   body — read both, and work it out however it is written: "Friday, October 23",',
    '   "Oct 4", "10/12", "this Wednesday". For a range use the first day. A DATE WITH',
    '   NO TIME IS STILL AN EVENT.',
    '   Leave event out ONLY when the email names no day at all: an ongoing need for',
    '   volunteers, a standing invitation, a policy change, a sign-up for something',
    '   whose date has not been announced yet. Never invent a day that is not there;',
    '   when a day IS there, always give it.',
    '     date      strict YYYY-MM-DD, the day it happens. Required.',
    '     hour      0-23, the start hour, church local. "8am" is 8, "7pm" is 19. Omit',
    '               entirely when the email gives no time. A date with no time is still',
    '               a real event; do not invent an hour for it.',
    '     minute    0-59, only alongside hour. Omit when the time is on the hour.',
    '     end_hour / end_minute   same, only if the email gives an end time.',
    '     location  the address or room, whenever the email gives one. Fill this in',
    '               even when the same address also appears in details: details are',
    '               read on the card, and this is what goes into the calendar entry on',
    '               somebody\'s phone, where it becomes the directions they tap.',
    '11. If the email contains no real announcements, return an empty array.',
    '',
    'CANDIDATE LINKS (copy urls exactly; the link text is what the reader saw)',
    links.length
      ? links.map((l) => `- ${l.url}${l.text ? `  (link text: ${l.text})` : ''}`).join('\n')
      : '- none',
    '',
    'CANDIDATE IMAGES',
    images.length ? images.map((u) => `- ${u}`).join('\n') : '- none',
    '',
    'NEWSLETTER TEXT',
    text,
  ].join('\n');
}

async function askGemini(
  apiKey: string,
  model: string,
  text: string,
  links: Array<{ url: string; text: string }>,
  images: string[],
  emailDate: string,
): Promise<Parsed[]> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt(text, links, images, emailDate) }] }],
          generationConfig: {
            temperature: 0.2,
            /* Generous, and it is the thinking that spends it rather than the
               answer: four announcements came back as 456 tokens of JSON after
               2,268 tokens of thought. A model that hits this ceiling stops
               mid-JSON and the parse below fails, which is the failure
               gemini-3-flash-preview produced every time.

               RAISED FROM 8,192 AFTER IT COST A REAL NEWSLETTER. The 11th of
               September carried five items with long detail lists, and the
               answer was cut off mid-array on the configured model, not on a
               preview one. 8,192 was never measured, it was the first number
               that worked; this is four times the headroom for a job that runs
               once a week, and the tokens are only spent if they are used. */
            maxOutputTokens: 32768,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
          },
        }),
      },
    );
  } catch (err) {
    // DNS, TLS, a reset socket. None of it is the email's fault.
    throw new TransientError(`Could not reach Gemini: ${String((err as Error).message ?? err)}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    /* 429 is the rate limit and 5xx is Google having a moment. Both come back
       to the same place: leave the email alone and try again on the next tick.
       503 in particular is not rare on the free tier, and it is what the newest
       Flash models were returning when this was written. */
    if (res.status === 429) {
      throw new TransientError(
        'Gemini is rate limiting us on the free tier. The newsletter is untouched and the next run will try again.',
      );
    }
    if (res.status >= 500) {
      throw new TransientError(
        `Gemini is busy (${res.status}). The newsletter is untouched and the next run will try again.`,
      );
    }
    throw new Error(`Gemini returned ${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await res.json();

  /* Gemini 3 returns thought parts alongside the answer, and only some parts
     carry `text`. Concatenating every text part is what survives that, and it
     is also correct for a long answer split across parts. */
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map((p: { text?: string }) => p?.text ?? '').join('').trim();
  const finish = String(payload?.candidates?.[0]?.finishReason ?? 'no reason given');

  /* EVERY FAILURE BELOW IS TRANSIENT, and that is the fix for a week that went
     missing rather than a loosening of the rules.

     On the 11th of September this function asked for five announcements and
     got back JSON that stopped mid-array: the model spent its output budget
     before it finished writing. JSON.parse threw, the throw was a plain Error,
     a plain Error meant "this email cannot be read", and the ledger buried the
     newsletter for good. Nobody was told, because one email failing is not the
     run failing.

     But a truncated answer says nothing about the email. It is the same kind
     of event as a 503 — the next attempt may simply work, and with the ceiling
     above raised it usually will. So all three of these defer instead: no
     ledger verdict, no \Seen, and the next tick tries again. The retrying is
     bounded in main by MAX_PARSE_ATTEMPTS, which is what keeps "try again"
     from becoming a model call every twenty minutes forever.

     Nothing has been written to the database at this point in the run, which
     is what makes a retry safe by construction rather than by argument: there
     are no drafts to duplicate, because there are none yet. */
  if (!raw) {
    throw new TransientError(`Gemini returned nothing to parse (${finish}). Trying again next run.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // MAX_TOKENS is the one worth naming outright: it is the answer being too
    // long rather than the model misbehaving, and it is what a five item
    // newsletter does to a budget that was set for four.
    throw new TransientError(
      `Gemini did not finish its JSON (${finish}). Trying again next run. It began: ${raw.slice(0, 120)}`,
    );
  }

  const list = (parsed as { announcements?: unknown })?.announcements;
  if (!Array.isArray(list)) {
    throw new TransientError(`Gemini returned no announcements array (${finish}). Trying again next run.`);
  }
  return list as Parsed[];
}

/* ========================================================================
   Turning what came back into rows

   Every field is re-checked here rather than trusted. The schema constrains
   the shape and nothing constrains the contents, so a date that is not a date
   and a URL that was never in the email both arrive looking perfectly valid.
   ===================================================================== */

/* @@ dates:start
   Everything between these two markers is evalled by
   tests/newsletter-dates.test.js, so it has to stay self-contained: no imports,
   no Deno, nothing from further up this file. The markers are what let a node
   test check date arithmetic that otherwise could only be checked by sending
   a real newsletter through a real model and waiting to see what came out. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!ISO_DATE.test(text)) return null;
  // A shape that passes the regex and is not a real day, 2026-02-31 say,
  // would be refused by the date column with an error nobody can act on.
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === text ? text : null;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* A date sitting in an announcement's own title.

   RULE 3 PUTS IT THERE. The model is asked to write titles like "City Serve
   Day, September 12" and "Baby Blessing Sign-Up 9/20", so by the time anything
   reaches this file the day is very often printed on the front of the card,
   in the church's own words, whatever the model then decided about `event`.
   Reading it back is the cheapest second opinion there is, and unlike the
   model it gives the same answer every time.

   MONTH NAMES AND SLASHES, and nothing else. "Sept 8-10" takes the 8th, the
   way the backfill prompt has always asked for a range. Hyphens are not read
   as separators for exactly that reason: in a title "9-20" is very often a
   range of somethings and "9/20" is a day. */
const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const TITLE_MONTH_DAY =
  /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/i;

const TITLE_SLASHED = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

/* WHICH YEAR, when the title does not say — and titles almost never say.
   "9/20" in a newsletter sent on the 4th of September is this September, and
   "January 5" in one sent in December is next January. So the year is the one
   that puts the day nearest the newsletter without landing it well in the
   past: anything more than a fortnight behind the email is read as next year.
   A fortnight rather than a day because a newsletter does sometimes look back
   at last Sunday, and reading that as thirteen months away would be worse. */
function resolveYear(month: number, day: number, reference: string): string | null {
  const refYear = Number(reference.slice(0, 4));
  if (!Number.isInteger(refYear)) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (y: number) => `${y}-${pad(month)}-${pad(day)}`;

  const thisYear = cleanDate(iso(refYear));
  if (thisYear && thisYear >= shiftDate(reference, -14)) return thisYear;
  return cleanDate(iso(refYear + 1)) ?? thisYear;
}

function titleDate(title: unknown, reference: string): string | null {
  const text = String(title ?? '');
  if (!cleanDate(reference)) return null;

  const named = TITLE_MONTH_DAY.exec(text);
  if (named) {
    const month = MONTH_NAMES[named[1].toLowerCase()];
    const day = Number(named[2]);
    if (month && day >= 1 && day <= 31) {
      return named[3]
        ? cleanDate(`${named[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
        : resolveYear(month, day, reference);
    }
  }

  const slashed = TITLE_SLASHED.exec(text);
  if (slashed) {
    const month = Number(slashed[1]);
    const day = Number(slashed[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      if (!slashed[3]) return resolveYear(month, day, reference);
      const year = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
      return cleanDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  }

  return null;
}

/* THE DAY THIS ANNOUNCEMENT IS ABOUT, from whichever of three sources knows.

   WHY THIS EXISTS. "Baby Blessing Sign-Up 9/20" went through this function's
   predecessor and came out with no event. The model had read the date
   perfectly — it set ends_on to the 21st, which is the 20th plus one — and
   then declined to fill in `event`, because the rule it was given said a
   sign-up and a link to a form are not events. It is a sign-up, and the thing
   being signed up for happens on a Sunday morning in September, and the
   calendar entry somebody wanted was the blessing.

   The prompt is fixed too, and the prompt is the part that will be right most
   often. But a prompt is a request and this is the guarantee, because the
   failure it prevents is silent: an announcement parsed with no event is not
   flagged, does not appear in the dates queue, and reads as correct on every
   screen in the app. Nobody finds out until somebody goes looking for a date
   that was never there.

   THREE SOURCES, MOST TRUSTWORTHY FIRST.
     stated    what the model put in `event.date`. A day it was willing to
               name outright.
     title     rule 3 asks for the date on the front of the card, so it is
               usually there, and it is the church's own wording.
     ends_on   rule 8 defines it as the day AFTER the thing happens, so an
               ends_on with no event is the model contradicting itself, and
               the day before it is the day it meant.

   WHAT IT COSTS. A card whose only date is a deadline — "sign-ups close the
   30th" for something not yet scheduled — now proposes an event on the 30th.
   That is a row in the dates queue and one tap to discard, and it is the side
   of the trade worth being on: an extra proposal is visible and a missing one
   is not. Nothing here publishes anything. Every event this produces is
   written unpublished with review_state 'pending', exactly like a stated one,
   and a person still approves it before it reaches anybody's calendar. */
function eventDateFor(
  stated: string | null,
  title: unknown,
  endsOn: string | null,
  reference: string,
): string | null {
  if (stated) return stated;

  const fromTitle = titleDate(title, reference);
  if (fromTitle) return fromTitle;

  const end = cleanDate(endsOn);
  return end ? shiftDate(end, -1) : null;
}

/* @@ dates:end */

/* @@ retry:start
   Fenced like the dates above, and evalled by tests/newsletter-retry.test.js,
   so it has to stay self-contained: no imports, no Deno, no Supabase client.
   The two constants live in here rather than up with the other settings for
   exactly that reason — the test has to see the same numbers the function
   uses, or it is testing a copy. */

/* How many times one email may be claimed before the reader gives up on it.
   Four attempts twenty minutes apart is about an hour of trying, which is long
   enough to ride out a busy model and short enough that a genuinely
   unreadable email is settled and reported the same morning. */
const MAX_PARSE_ATTEMPTS = 4;

/* How long a claim may sit before another run may take it.
   An Edge Function invocation cannot outlive its own timeout, so a row still
   marked `parsing` a quarter of an hour later is not a run in progress — it is
   a run that died holding the email. Without this, one crash at the wrong
   moment would bury a newsletter exactly the way the old permanent-failure
   rule did, which is the bug this whole change is about. */
const CLAIM_STALE_MINUTES = 15;

interface LedgerState {
  status?: string;
  attempts?: number;
  attempted_at?: string | null;
}

/* What this run may do with an email, given what the ledger already says about
   it. Pure, because it is the one piece of this feature whose corner cases are
   worth checking without a mailbox: settled means settled, a stuck claim has
   to come back, and neither of those may depend on the model or the network.

     new      no ledger row at all. Parse it.
     retry    a previous attempt deferred. Parse it again.
     reclaim  someone claimed it and never came back. Take it.
     skip     settled, or being worked on right now, or out of attempts. */
function claimDecision(row: LedgerState | null | undefined, nowMs: number): 'new' | 'retry' | 'reclaim' | 'skip' {
  if (!row) return 'new';

  const status = String(row.status ?? '');
  const attempts = Number(row.attempts ?? 0);
  const spent = !Number.isFinite(attempts) || attempts >= MAX_PARSE_ATTEMPTS;

  if (status === 'deferred') return spent ? 'skip' : 'retry';

  if (status === 'parsing') {
    const started = Date.parse(String(row.attempted_at ?? ''));
    /* A claim with no clock on it is from a version of this function that did
       not set one, or a write that half happened. Either way nothing is coming
       back for it, so it is stale by definition rather than by arithmetic. */
    if (!Number.isFinite(started)) return spent ? 'skip' : 'reclaim';
    if (nowMs - started < CLAIM_STALE_MINUTES * 60 * 1000) return 'skip';
    return spent ? 'skip' : 'reclaim';
  }

  // parsed, empty, failed. Settled, and 0038's whole point.
  return 'skip';
}

/* @@ retry:end */

/* Taking an email, so that exactly one run parses it.

   WHAT THIS REPLACES. 0038 got mutual exclusion from a single insert against a
   unique index: the loser got a 23505 and skipped, and that was airtight for
   as long as an email could only ever be parsed once. A retry breaks it,
   because the second legitimate attempt looks exactly like the duplicate the
   index was there to refuse. Both halves matter here — the twenty minute tick
   and the Fetch Announcements button really do overlap, three taps inside four
   minutes is a thing that happens, and two runs parsing one newsletter is two
   sets of drafts and two calendar entries for one evening.

   So a claim is one of two atomic writes, and never a read followed by a
   write. A new email is an insert, which the unique index still arbitrates
   exactly as before. A retry or a reclaim is an update guarded on the attempt
   count we read a moment ago — a compare-and-swap — so if another run got
   there first the count has already moved, the update matches no rows, and
   this run steps aside. Returns the ledger row id on success and null when
   somebody else has it.

   The row is written BEFORE the model is called rather than after, which is
   the same ordering 0038 chose for the drafts and for the same reason: of the
   two ways this can fail, an email recorded as claimed and never finished is
   recoverable — the staleness rule above brings it back — and an email parsed
   twice is a mess a person has to clean up by hand. */
async function claimEmail(
  admin: ReturnType<typeof createClient>,
  how: 'new' | 'retry' | 'reclaim',
  envelope: Record<string, unknown>,
  attempts: number,
): Promise<number | null> {
  const claim = {
    ...envelope,
    status: 'parsing',
    attempts,
    attempted_at: new Date().toISOString(),
    note: null as string | null,
  };

  if (how === 'new') {
    const { data, error } = await admin
      .from('newsletter_emails').insert(claim).select('id').single();

    if (error) {
      // 23505 is the race, and it is the correct outcome rather than a fault:
      // another run inserted between our read of the ledger and now.
      if (error.code === '23505') return null;
      throw new Error(`Could not claim the email: ${error.message}`);
    }
    return data.id as number;
  }

  const { data, error } = await admin
    .from('newsletter_emails')
    .update(claim)
    .eq('message_id', String(envelope.message_id))
    .eq('attempts', attempts - 1)     // the compare half of the swap
    .select('id');

  if (error) throw new Error(`Could not claim the email: ${error.message}`);
  return data && data.length ? (data[0].id as number) : null;
}

/* How a claim ends. Always called, whichever way the email went, so no row is
   left in `parsing` by a run that is still alive.

   A failure to write the outcome is logged and swallowed on purpose. The work
   is already done by this point — the drafts are in the table or they are not
   — and throwing here would turn a good parse into a failed run. A row left
   marked parsing is picked up again in a quarter of an hour by the staleness
   rule, which is the whole reason that rule exists. */
async function settleEmail(
  admin: ReturnType<typeof createClient>,
  id: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('newsletter_emails').update(patch).eq('id', id);
  if (error) console.error(`newsletter-intake: could not settle email ${id}:`, error.message);
}

/* Today, where the church is. Not UTC: an announcement retires at midnight in
   Metairie, which is the same reason hc_admin_send_announcement reads
   America/Chicago rather than now()::date. At 8pm on the 12th in Louisiana it
   is already the 13th in Greenwich, and a UTC comparison would quietly file
   away an announcement that still has an evening to run. */
function todayInChicago(): string {
  // en-CA formats as YYYY-MM-DD, which is the format the date columns want.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

/* An end date, but only if it has not already passed. Null for anything today
   or earlier, because Home hides a row the moment `today >= ends_on` and a row
   that is published and hidden is the hardest kind of wrong to notice. */
function futureDate(value: string | null): string | null {
  if (!value) return null;
  return value > todayInChicago() ? value : null;
}

/* A church-local wall clock time turned into a real instant.

   WHY THIS IS NOT `new Date(date + 'T' + time)`. That parses as the server's
   zone, and an Edge Function runs in UTC, so "Homecoming, 6pm" would land at
   6pm UTC — which is midday in Metairie, and the calendar entry on somebody's
   phone would say noon. The event has to be pinned to America/Chicago, and
   America/Chicago is -05:00 for half the year and -06:00 for the other half.

   So the offset is asked for rather than assumed, at the date in question:
   longOffset gives "GMT-05:00" and the ISO string is built with it. Probed at
   midday UTC so the answer cannot be dragged into the wrong day by the very
   offset it is being asked about, which is the bug this would otherwise have
   on exactly two nights a year.

   Returns null rather than guessing when there is no time. A church event with
   no stated hour is a real thing, and js/screens/connect.js already has an
   answer for it: eventStart() puts it at nine in the morning and lets the
   person drag it. That answer belongs in one place and this is not it. */
const CHURCH_TZ = 'America/Chicago';

function churchOffset(isoDate: string): string {
  try {
    const probe = new Date(`${isoDate}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CHURCH_TZ,
      timeZoneName: 'longOffset',
    }).formatToParts(probe);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const offset = name.replace(/^GMT/, '').trim();
    return /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : '-06:00';
  } catch {
    return '-06:00';   // standard time, the safer of the two to be wrong by
  }
}

/* Range checked here as well as typed in the schema. `integer` stops the model
   writing "eighteen o'clock"; it does not stop it writing 47, and an hour of 47
   would either throw at the database or, worse, roll the event into the next
   day. Out of range is treated as no time given, which degrades to the same
   place a missing time does. */
function churchInstant(
  isoDate: string | null,
  hour: unknown,
  minute: unknown,
): string | null {
  if (!isoDate) return null;

  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;

  const rawM = Number(minute);
  const m = Number.isInteger(rawM) && rawM >= 0 && rawM <= 59 ? rawM : 0;

  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${isoDate}T${hh}:${mm}:00${churchOffset(isoDate)}`;
}

/* A URL is kept only if the email actually contained it. This is the guard
   against the one failure mode that would be genuinely bad: a plausible,
   hallucinated link on a card people tap. */
function cleanChoice(value: unknown, allowed: string[]): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return allowed.includes(text) ? text : null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* The same conversion js/richtext.js makes on the way in, written out here
   because an Edge Function cannot call into the app. Paragraphs, escaped, and
   nothing else: `p` and `br` are both in that file's allowlist, so what this
   writes survives the sanitizer the announcement screen runs it through, and a
   draft that an admin then edits in the rich text editor starts from valid
   markup rather than from something the editor has to repair. */
function textToHtml(text: string): string {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/* The announcement's words, as markup: a paragraph, then the specifics as a
   list, then every link as its own tappable line.

   ONLY TAGS js/richtext.js ALLOWS, which is the constraint that shapes this.
   `p`, `ul`, `li` and `a` are all in that file's allowlist under links: 'web',
   so what this writes survives the sanitizer twice over — once here on the way
   into the table and once in js/screens/announcement.js on the way onto the
   screen. Anything outside the allowlist would be silently unwrapped at render
   and the detail would vanish between the review card and Home, which is the
   quietest possible way to lose the thing this whole change is about.

   Links are one per line rather than run together in a sentence because they
   are tap targets on a phone, and two hyperlinks sharing a line is two ways to
   hit the wrong one. */
function announcementHtml(
  summary: string,
  details: string[],
  links: Array<{ label?: string; url: string }>,
): string {
  let html = '';
  if (summary) html += `<p>${escapeHtml(summary).replace(/\n/g, '<br>')}</p>`;

  if (details.length) {
    html += '<ul>' + details.map((d) => `<li>${escapeHtml(d)}</li>`).join('') + '</ul>';
  }

  for (const link of links) {
    // The label is what the reader saw on the button. Falling back to the URL
    // is ugly but honest, and only happens if the model omits a label.
    const label = String(link.label ?? '').trim() || link.url;
    html += `<p><a href="${escapeHtml(link.url)}">${escapeHtml(label)}</a></p>`;
  }

  return html;
}

/* The plain text mirror, per migration 0033. Three things read this and none
   can read markup: the push notification, the Admin list, and the snippet on
   Home, which lives inside a button and so can hold no anchor.

   The details go in and the URLs do not. firstSentence() in send-push takes
   the opening sentence for the lock screen, so the summary still leads, and a
   raw https:// in a snippet under a card title is noise nobody can tap. */
function announcementText(summary: string, details: string[]): string {
  return [summary, ...details].filter(Boolean).join('\n').trim();
}

function slugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/* The same `-2`, `-3` suffix js/admin.js uses, for the same reason: ids are
   permanent because the app keys "I dismissed this" on them, and two Serve
   Days is a real thing that happens rather than a theoretical collision. */
function uniqueId(title: string, taken: Set<string>, prefix = 'announcement'): string {
  const base = `${prefix}-${slugify(title) || 'untitled'}`;
  let id = base;
  let n = 2;
  while (taken.has(id)) { id = `${base}-${n}`; n++; }
  taken.add(id);
  return id;
}

/* ========================================================================
   Backfill

   Events for announcements that already exist. The intake started writing
   events at 0040; everything parsed before that has its dates sitting in its
   words with nothing in the calendar, and re-reading the mailbox will not fix
   them because the ledger has already seen those emails.

   ONE MODEL CALL FOR THE WHOLE BATCH, not one per announcement. Twenty-five
   separate calls would be twenty-five chances to hit the free tier's rate
   limit on a job that is meant to be run once, and the model has no trouble
   holding a list. The announcements go in with their ids and come back keyed
   on the same ids, and anything it does not mention simply has no date.

   THE EVENT INHERITS THE ANNOUNCEMENT'S published, which is the rule that
   keeps the promise intact in both directions. A backfilled event for an
   announcement already on Home is published, so it appears in the calendar
   immediately, which is the point of running this. One for a draft still in
   the review queue stays unpublished and goes live when somebody approves it,
   exactly as if the intake had written it in the first place.
   ===================================================================== */

/* ONE ROW BACK FOR EVERY ROW IN, flagged rather than filtered.

   The first version asked for "an entry for each announcement that has a date"
   and got a third of them: City Serve Day, September 12 — the date sitting in
   its own title — came back with nothing at all. Sparse output is a filtering
   task and the model was cautious with it. A complete mapping with an explicit
   has_event is a labelling task, which it does not miss, and it is checkable:
   the caller knows how many rows it sent. */
const BACKFILL_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          has_event: { type: 'boolean' },
          date: { type: 'string' },
          hour: { type: 'integer' },
          minute: { type: 'integer' },
          end_hour: { type: 'integer' },
          end_minute: { type: 'integer' },
          location: { type: 'string' },
        },
        required: ['id', 'has_event'],
      },
    },
  },
  required: ['results'],
};

interface BackfillRow {
  id: string;
  title: string;
  body: string | null;
  published: boolean;
  written: string;
  endsOn: string | null;
}

function backfillPrompt(rows: BackfillRow[]): string {
  return [
    'Below are announcements already published in a church app. Each one may or may',
    'not be about something that happens on a particular day.',
    '',
    'Return one entry for EVERY announcement below, in the same order, with its id.',
    'Set has_event true and give the date when it is about a dated thing — a gathering,',
    'a service, a serve day, a meeting, a class, a party. If a reader could sensibly',
    'put it in their calendar, has_event is true. The date is very often in the TITLE',
    '("City Serve Day, September 12") as well as in the text — read both.',
    '',
    'Work the date out however it is written: "Friday, October 23", "Oct 4", "10/12",',
    '"this Wednesday", "next Sunday", "the last Saturday in October", "Christmas Eve".',
    'Each announcement carries the date it was written; resolve anything relative',
    'against THAT date, not against today.',
    '',
    'A DATE WITH NO TIME IS STILL AN EVENT. Give the date and leave time out.',
    'For a range ("Sept 8-10") use the first day. For something recurring ("every',
    'Tuesday") use the first occurrence.',
    '',
    'A SIGN-UP FOR A DATED THING IS STILL THAT DATED THING. "Baby Blessing Sign-Up',
    '9/20" is an event on the 20th: the form is how a person gets in, and the date is',
    'what they wanted in their calendar. Give the day the thing happens, never the day',
    'the sign-up closes.',
    '',
    'Set has_event false, with no date, for an announcement with genuinely no day',
    'attached: an ongoing need for volunteers, a standing invitation, a policy change.',
    'Never invent a date that is not there. But when a date IS there, always give it.',
    '',
    '  date      strict YYYY-MM-DD. Required when has_event is true.',
    '  hour      0-23, the start hour. 8am is 8, 7pm is 19. Omit when no time is given.',
    '  minute    0-59, only alongside hour. Omit when the time is on the hour.',
    '  end_hour / end_minute   same, only if the text gives an end time.',
    '  location  the address or room, only if the text gives one.',
    '',
    'ANNOUNCEMENTS',
    ...rows.map((r) => [
      `--- id: ${r.id}`,
      `written: ${r.written}`,
      `title: ${r.title}`,
      `text: ${(r.body ?? '').slice(0, 1500)}`,
    ].join('\n')),
  ].join('\n');
}

async function runBackfill(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  model: string,
  limit: number,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('announcements')
    .select('id, title, body, published, created_at, review_state, ends_on')
    .is('event_id', null)
    .neq('review_state', 'discarded')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not read the announcements: ${error.message}`);

  const rows: BackfillRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    title: String(r.title ?? ''),
    body: (r.body as string | null) ?? null,
    published: r.published === true,
    written: String(r.created_at ?? '').slice(0, 10),
    endsOn: (r.ends_on as string | null) ?? null,
  }));

  if (!rows.length) return { ok: true, backfill: true, looked_at: 0, events: 0 };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: backfillPrompt(rows) }] }],
        generationConfig: {
          temperature: 0.2,
          // Twenty-five rows of id, date and location, and the same truncation
          // risk as the parse above: one row short of the end is a date that
          // silently never gets made.
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
          responseSchema: BACKFILL_SCHEMA,
        },
      }),
    },
  );

  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      throw new TransientError(`Gemini is busy (${res.status}). Run the backfill again in a minute.`);
    }
    throw new Error(`Gemini returned ${res.status}`);
  }

  const payload = await res.json();
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map((p: { text?: string }) => p?.text ?? '').join('').trim();
  if (!raw) throw new Error('Gemini returned nothing to parse.');

  const parsed = JSON.parse(raw)?.results ?? [];

  /* WHAT THE MODEL SAID ABOUT EACH ROW, keyed on the id it was given, rather
     than the list of rows it said yes to. The loop below walks the
     announcements this function actually read instead of the model's answers,
     because a row it labelled has_event false can still be a dated thing —
     that is exactly how "Baby Blessing Sign-Up 9/20" lost its calendar entry
     on the way in — and eventDateFor gets the second and third look at it. */
  const said = new Map<string, Record<string, unknown>>();
  for (const r of parsed as Array<Record<string, unknown>>) {
    const id = String(r?.id ?? '');
    if (id) said.set(id, r);
  }

  const { data: existingEvents } = await admin.from('events').select('id');
  const takenEvents = new Set((existingEvents ?? []).map((r) => r.id as string));

  let made = 0;
  const madeFor: string[] = [];

  for (const row of rows) {
    const answer: Record<string, unknown> = said.get(row.id) ?? {};

    /* The time is only read off an answer that named a day. An hour attached
       to a has_event false row is the model's leftovers, and pinning an
       inferred date to it would be a guess resting on a guess. */
    const stated = answer.has_event === true ? cleanDate(answer.date) : null;
    const item: Record<string, unknown> = stated ? answer : {};

    const date = eventDateFor(stated, row.title, row.endsOn, row.written);
    if (!date) continue;

    const eventId = uniqueId(row.title, takenEvents, 'event');
    const at = churchInstant(date, item.hour, item.minute);

    const { error: eventError } = await admin.from('events').insert({
      id: eventId,
      title: row.title,
      description: row.body ? String(row.body).split('\n')[0].slice(0, 500) : null,
      starts_at: at ?? `${date}T09:00:00${churchOffset(date)}`,
      ends_at: churchInstant(date, item.end_hour, item.end_minute),
      time_label: at ? null : 'Time to be announced',
      location: String(item.location ?? '').trim().slice(0, 200) || null,
      category: 'gathering',
      /* Pending regardless of whether its announcement is already live. The
         announcement being approved says somebody vouched for the words; it
         says nothing about a date a model has just now worked out of them, and
         backfilled dates are the ones most worth a second look because nobody
         has ever seen them. They appear in the events queue for approval. */
      published: false,
      review_state: 'pending',
    });
    if (eventError) continue;

    const { error: linkError } = await admin.from('announcements')
      .update({ event_id: eventId }).eq('id', row.id);

    if (linkError) {
      // Nothing points at it, and an unpublished orphan is on no screen.
      await admin.from('events').delete().eq('id', eventId);
      continue;
    }

    made += 1;
    madeFor.push(row.title);
  }

  /* NO NOTIFICATION FROM HERE, unlike the ordinary parse. A backfill is run by
     hand, with a service role key, by the one person who is already looking at
     the result: telling them by push that the thing they just started has
     finished is noise, and a backfill over a year of announcements would
     announce a queue of thirty dates that nobody asked for today. The two
     review topics are for the twenty minute tick, where there is genuinely
     nobody watching. */
  return { ok: true, backfill: true, looked_at: rows.length, events: made, titles: madeFor };
}

/* ========================================================================
   main
   ===================================================================== */

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const cronSecret = Deno.env.get('HC_NEWSLETTER_CRON_SECRET');
  if (!cronSecret) {
    console.error('newsletter-intake: HC_NEWSLETTER_CRON_SECRET is not set on this function');
    return json({ error: 'Not configured.' }, 500);
  }
  if (!secretsMatch(req.headers.get('x-hc-cron-secret') ?? '', cronSecret)) {
    return json({ error: 'No.' }, 401);
  }

  let body: { probe?: boolean; dry_run?: boolean; backfill?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* an empty body is a normal tick */ }
  const probe = body.probe === true;
  const dryRun = body.dry_run === true;
  const backfill = body.backfill === true;

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Platform env missing.' }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* Every exit from here on writes a run row, except the probe and the dry
     run, which are a person at a keyboard who will read the response. This is
     the only record there is: pg_net threw the response away. */
  const finish = async (
    ok: boolean,
    counts: { found?: number; parsed?: number; drafts?: number },
    note: string | null,
    status = 200,
  ) => {
    if (!probe && !dryRun) {
      await admin.from('newsletter_runs').insert({
        ok,
        found: counts.found ?? 0,
        parsed: counts.parsed ?? 0,
        drafts: counts.drafts ?? 0,
        note,
      });
    }
    return json({ ok, ...counts, note }, status);
  };

  /* Tell the admins something is waiting on them.
   *
   * WHY THIS IS HERE AND NOT A TRIGGER ON THE TABLE, which was the first
   * design and is the tidier looking one. A statement level AFTER INSERT
   * trigger on announcements would catch every path that ever writes a pending
   * row, including a hand written one and whatever the next pipeline turns out
   * to be, and it would fire once per statement rather than once per row.
   *
   * It would also fire inside the transaction that writes the drafts, and this
   * function writes events, then a ledger row, then announcements, with a
   * rollback path on each. A notification sent from inside that sequence is a
   * notification that can go out for drafts that never landed. A push cannot
   * be unsent, which is the sentence migration 0027 is built around, so the
   * send waits until the writes are done and the run is over.
   *
   * ONE SEND PER RUN PER QUEUE, not one per email or one per draft. A
   * newsletter carries four or five items and an admin does not want four
   * notifications about one email. iOS would collapse them anyway, because
   * they share a collapse id, and relying on that to fix a decision made here
   * would be relying on it.
   *
   * FAILURES ARE SWALLOWED ON PURPOSE. The drafts are already saved and the
   * run has already succeeded. A notification that did not go out is worth a
   * line in the logs and is not worth turning a good parse into a failed run,
   * which is what throwing here would do: the admin would see "the newsletter
   * check failed" above a queue full of perfectly good drafts.
   */
  const tellTheAdmins = async (counts: { drafts: number; events: number }) => {
    const topics = [
      counts.drafts > 0 ? 'announcement_review' : null,
      counts.events > 0 ? 'event_review' : null,
    ].filter(Boolean) as string[];

    for (const topic of topics) {
      const { error } = await admin.rpc('hc_send_push', { p_topic: topic });
      if (error) {
        console.error(`newsletter-intake: could not ask for the ${topic} push:`, error.message);
      }
    }
  };

  /* Trimmed, and stripped of the angle brackets somebody pastes when they read
     <the secret> in the setup doc as a style rather than as a placeholder. It
     is the same call as stripping spaces out of the app password below, and it
     is worth more here because the failure is so much worse: an app password
     with spaces in it comes back "the mailbox refused the sign in", which
     points at the password. A host of "<imap.gmail.com>" fails DNS instead, and
     the run is logged as "failed to lookup address information", which reads
     like the network is down and names nothing. Normalising is safe because
     the bracketed form has exactly one possible meaning. */
  const host = (Deno.env.get('NEWSLETTER_IMAP_HOST') ?? 'imap.gmail.com')
    .trim().replace(/^<|>$/g, '').trim() || 'imap.gmail.com';

  // A port that is not a number is a typo, not an instruction. NaN would reach
  // Deno.connectTls and fail with something about an invalid argument.
  const parsedPort = parseInt(
    (Deno.env.get('NEWSLETTER_IMAP_PORT') ?? '993').trim().replace(/^<|>$/g, ''), 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 993;
  const user = Deno.env.get('NEWSLETTER_IMAP_USER');
  // Gmail shows an App Password as four groups of four. People paste it with
  // the spaces in, every time, and the server refuses it. Stripping them here
  // costs nothing and saves an hour of "but I copied it exactly".
  const password = (Deno.env.get('NEWSLETTER_IMAP_PASSWORD') ?? '').replace(/\s+/g, '');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

  const missing = [
    !user && 'NEWSLETTER_IMAP_USER',
    !password && 'NEWSLETTER_IMAP_PASSWORD',
    !geminiKey && 'GEMINI_API_KEY',
  ].filter(Boolean).join(', ');

  if (missing) {
    return await finish(false, {}, `Not set up yet: ${missing} is missing from this function's secrets.`, 200);
  }

  /* Backfill exits here, before the mailbox is opened. It has nothing to do
     with email: it reads announcements that are already in the table and gives
     the dated ones the event they would have got had 0040 existed when they
     were parsed. Writes no run row either, because it is not a run — a person
     triggered it once and is reading the response. */
  if (backfill) {
    try {
      const limit = Math.min(Math.max(parseInt(String(body.limit ?? 25), 10) || 25, 1), 50);
      return json(await runBackfill(admin, geminiKey!, model, limit));
    } catch (err) {
      console.error('newsletter-intake backfill failed:', err);
      return json({ ok: false, backfill: true, error: String((err as Error).message ?? err) }, 200);
    }
  }

  const imap = new Imap();
  let found = 0;
  let parsedCount = 0;
  let draftCount = 0;
  /* What this run actually added to each queue, which is not the same as what
     is in each queue. The counts here decide WHETHER the admins are told; the
     sender counts the queue itself to decide what to say. See tellTheAdmins()
     above and compose() in send-push. */
  let newDrafts = 0;
  let newEvents = 0;
  // Emails left exactly as they were because something transient got in the
  // way. Counted rather than swallowed: a run whose only outcome was "Gemini
  // was busy" has to say so, or a week with no drafts looks like a week with
  // no newsletter.
  let deferred = 0;
  let deferredNote: string | null = null;
  /* Emails this run settled as unreadable, which is the other half of what the
     note has to carry. Before 0069 a failed email was recorded in a table no
     screen reads and the run stayed silent: on the 11th of September the whole
     newsletter was lost and the Admin screen said "Newsletter checked 3
     minutes ago" in the ordinary grey. A failure nobody is told about is the
     failure this feature keeps having, so it goes in the note, which that
     screen draws as a warning. */
  let failedCount = 0;
  let failedNote: string | null = null;

  try {
    await imap.connect(host, port);
    await imap.login(user!, password);
    const exists = await imap.selectInbox();

    if (probe) {
      await imap.close();
      return json({
        ok: true, probe: true, host, port, user,
        messages_in_inbox: exists,
        model,
        note: 'Connected, signed in, and read the mailbox. The pipeline can reach it.',
      });
    }

    /* Two searches, unioned. UNSEEN is the fast path and the one that matters
       almost every time. SINCE is the safety net for the case that would
       otherwise lose a newsletter silently: somebody opens the inbox in a
       browser to see whether anything arrived, which marks it read, and the
       poll never looks at it again. Fetching a handful of headers we have
       already seen is a much smaller cost than missing an email. */
    const since = new Date(Date.now() - SEARCH_DAYS * 24 * 3600 * 1000);
    const unseen = await imap.search('UNSEEN');
    const recent = await imap.search(`SINCE ${imapDate(since)}`);
    const uids = [...new Set([...unseen, ...recent])].sort((a, b) => a - b);
    found = uids.length;

    if (!uids.length) {
      await imap.close();
      return await finish(true, { found: 0, parsed: 0, drafts: 0 }, null);
    }

    /* Headers first, bodies second. A newsletter body is a few hundred
       kilobytes of table soup and there is no reason to pull one down to
       discover we parsed it last Tuesday. */
    const candidates: Array<{ uid: number; messageId: string }> = [];
    for (const uid of uids) {
      const head = await imap.fetchRaw(uid, 'HEADER.FIELDS (MESSAGE-ID)');
      const messageId = splitHeaders(head).headers['message-id']?.trim();
      if (messageId) candidates.push({ uid, messageId });
    }

    const ids = candidates.map((c) => c.messageId);
    const { data: known, error: knownError } = await admin
      .from('newsletter_emails')
      .select('message_id, status, attempts, attempted_at')
      .in('message_id', ids.length ? ids : ['']);

    if (knownError) throw new Error(`Could not read the ledger: ${knownError.message}`);

    /* What the ledger already knows about each of them, which since 0069 is
       more than "seen or not": an email can be mid-parse in another run, or
       waiting on a retry after an attempt that deferred. claimDecision holds
       the rules and is tested on its own. */
    const ledgerState = new Map<string, LedgerState>();
    for (const row of known ?? []) {
      ledgerState.set(row.message_id as string, row as LedgerState);
    }

    const now = Date.now();
    const fresh = candidates
      .map((c) => ({ ...c, how: claimDecision(ledgerState.get(c.messageId), now) }))
      .filter((c) => c.how !== 'skip')
      .slice(0, MAX_EMAILS_PER_RUN) as Array<{
        uid: number;
        messageId: string;
        how: 'new' | 'retry' | 'reclaim';
      }>;

    if (!fresh.length) {
      await imap.close();
      return await finish(true, { found, parsed: 0, drafts: 0 }, null);
    }

    // Ids already in the table, so a generated slug does not collide with an
    // announcement somebody wrote by hand last month.
    const { data: existing } = await admin.from('announcements').select('id');
    const taken = new Set((existing ?? []).map((r) => r.id as string));

    // The same guard on the events side. Ids are permanent in this project and
    // 'event-homecoming' is exactly the sort of slug two Octobers apart would
    // both want.
    const { data: existingEvents } = await admin.from('events').select('id');
    const takenEvents = new Set((existingEvents ?? []).map((r) => r.id as string));

    const preview: unknown[] = [];

    for (const { uid, messageId, how } of fresh) {
      const raw = await imap.fetchRaw(uid);
      const envelope = splitHeaders(raw);
      const subject = decodeHeaderWords(envelope.headers['subject'] ?? '').slice(0, 300);
      const fromAddr = decodeHeaderWords(envelope.headers['from'] ?? '').slice(0, 300);
      const dateHeader = envelope.headers['date'] ?? '';
      const sentAt = dateHeader && !Number.isNaN(Date.parse(dateHeader))
        ? new Date(dateHeader).toISOString()
        : null;

      // Which attempt this is. The claim below only succeeds if the ledger is
      // still one short of it, so two runs cannot both be attempt three.
      const attempt = Number(ledgerState.get(messageId)?.attempts ?? 0) + 1;

      /* Everything the ledger will say about this email, whichever way it
         goes. Built up as we learn and written when the claim settles, so an
         email is recorded exactly once no matter which branch it takes. */
      const ledger: Record<string, unknown> = {
        status: 'parsed',
        drafts: 0,
        note: null as string | null,
      };

      /* THE CLAIM, before the model is called and before anything is written.
         A dry run claims nothing: it is a person reading the answer, it must
         leave the mailbox exactly as it found it, and taking a claim would
         make the next real run skip the email it was rehearsing. */
      let claimId: number | null = null;
      if (!dryRun) {
        claimId = await claimEmail(admin, how, {
          message_id: messageId,
          imap_uid: uid,
          subject,
          from_addr: fromAddr,
          sent_at: sentAt,
        }, attempt);

        // Another run has it. Not an error, and not ours to report.
        if (claimId === null) continue;
      }

      try {
        const parts = textParts(raw);
        const html = parts.filter((p) => p.type === 'text/html').map((p) => p.text).join('\n');
        const plain = parts.filter((p) => p.type === 'text/plain').map((p) => p.text).join('\n');

        // Plain text when the sender provided a real one, HTML flattened when
        // they did not. Most newsletters send both and the plain part is often
        // a stub saying "view this in your browser", so the longer of the two
        // is the honest choice rather than a fixed preference.
        const fromHtml = html ? htmlToText(html) : '';
        const text = (plain.trim().length > fromHtml.length ? plain : fromHtml).trim().slice(0, 60000);

        const htmlLinks = html ? extractLinks(html) : [];
        // The anchors first, then anything written out as bare text. See
        // extractTextLinks: a plain-text-only newsletter has no anchors at all,
        // and the model may only choose from this list.
        const links = [...htmlLinks, ...extractTextLinks(text, htmlLinks)];
        const images = html ? extractImages(html) : [];

        if (text.length < 40) {
          ledger.status = 'empty';
          ledger.note = 'The email had no readable text in it.';
        } else {
          // The day the newsletter was sent, which is what every relative date
          // in it is relative to — the model is told it, and eventDateFor
          // resolves "9/20" against the same day so the two cannot disagree.
          const emailDay = (sentAt ?? new Date().toISOString()).slice(0, 10);

          const items = await askGemini(
            geminiKey!, model, text, links, images, emailDay,
          );

          const allowedLinks = links.map((l) => l.url);

          // The calendar entries this email produces, filled in as the
          // announcements are built and written before them: announcements
          // .event_id points at events, so the events have to exist first or
          // the foreign key refuses the whole batch.
          const events: Array<Record<string, unknown>> = [];

          const rows = items.slice(0, MAX_DRAFTS_PER_EMAIL).map((item) => {
            const title = String(item.title ?? '').trim().slice(0, 200);
            if (!title) return null;

            const summary = String(item.summary ?? '').trim().slice(0, 2000);
            const image = cleanChoice(item.image_url, images);
            const eyebrow = String(item.eyebrow ?? '').trim().slice(0, 40);

            const details = (Array.isArray(item.details) ? item.details : [])
              .map((d) => String(d ?? '').trim())
              .filter(Boolean)
              .slice(0, 20);

            /* Every link the model returned, filtered to the ones the email
               actually contained. The allowlist stays exactly as strict as it
               was when this carried one link: completeness is the goal, but a
               plausible invented URL on a card the congregation taps is still
               the worst thing this function could produce. */
            const keptLinks = (Array.isArray(item.links) ? item.links : [])
              .map((l) => ({
                label: String(l?.label ?? '').trim().slice(0, 80),
                url: cleanChoice(l?.url, allowedLinks),
              }))
              .filter((l): l is { label: string; url: string } => !!l.url)
              .slice(0, 10);

            const bodyText = announcementText(summary, details).slice(0, 4000);

            /* The calendar entry, when this announcement is about a dated
               thing. Built here rather than in a second pass so it can borrow
               the title and summary that were just settled.

               UNPUBLISHED, like the announcement beside it, and published by
               hc_admin_approve_announcement in the same transaction when
               somebody approves. See migration 0040.

               TIME. A time the email actually gave is used as given. When it
               gives none, the row still needs a starts_at because the column
               is not null, so it takes nine in the morning — the same guess
               eventStart() in js/screens/connect.js has always made for the
               .ics — and time_label says plainly that the hour is not known.
               Without that label the Connect card would print "9:00 AM" as
               though the church had said so, which is a guess wearing the
               clothes of a fact. */
            /* WHICH DAY, from the model's answer if it gave one and from the
               announcement's own words if it did not. See eventDateFor: the
               date it works out from a title or from ends_on is the fix for a
               real card that came through with its date read correctly and its
               calendar entry dropped anyway. */
            const eventDate = eventDateFor(
              item.event ? cleanDate(item.event.date) : null,
              title,
              cleanDate(item.ends_on),
              emailDay,
            );
            const eventRow = eventDate
              ? {
                id: uniqueId(title, takenEvents, 'event'),
                title,
                description: summary || null,
                starts_at: churchInstant(eventDate, item.event?.hour, item.event?.minute)
                  ?? `${eventDate}T09:00:00${churchOffset(eventDate)}`,
                ends_at: churchInstant(eventDate, item.event?.end_hour, item.event?.end_minute),
                time_label: churchInstant(eventDate, item.event?.hour, item.event?.minute)
                  ? null
                  : 'Time to be announced',
                location: String(item.event?.location ?? '').trim().slice(0, 200) || null,
                signup_url: keptLinks[0]?.url ?? null,
                category: 'gathering',
                // Pending, and published only when somebody approves the event
                // itself. Since 0041 that is a separate tap from approving the
                // announcement: a date landing in the church's calendar is a
                // different decision from the wording of a card.
                published: false,
                review_state: 'pending',
              }
              : null;

            if (eventRow) events.push(eventRow);

            return {
              id: uniqueId(title, taken),
              event_id: eventRow ? eventRow.id : null,
              eyebrow: eyebrow || null,
              title,
              body: bodyText || null,
              body_html: (summary || details.length || keptLinks.length)
                ? announcementHtml(summary, details, keptLinks)
                : null,
              image_url: image,
              image_urls: image ? [image] : [],
              video_url: null,
              /* The first link also becomes the link card at the bottom of the
                 announcement, which is the one with a thumbnail and a host
                 under it. All of them, this one included, are already in
                 body_html as tappable lines, so nothing is lost if there is
                 more than one. */
              link_url: keptLinks[0]?.url ?? null,
              link_title: keptLinks[0]?.label || null,
              link_image_url: null,
              /* NO starts_on, EVER, and that is a fix rather than an omission.

                 It used to be set to the newsletter's own date, which bought
                 nothing — a draft is invisible until somebody approves it, so
                 the day it was parsed is not a day anything happens — and cost
                 the one thing this feature promises. The model reads "the day
                 the card should appear" and sometimes answers with the event
                 date, which is in the future, and a future starts_on means the
                 admin taps Approve and Home does not change. Approve has to
                 mean "on Home now", so the window it starts with is open.

                 An admin who wants one held until December can still set it on
                 the form. That is a decision a person makes, and it is not one
                 worth guessing wrong on every announcement to support. */
              starts_on: null,

              /* An end date only if it is still ahead of us. A parse that
                 returns a date already gone produces a row that is published,
                 correct, and invisible — the worst of the three, because
                 nothing on screen says why. Better to leave the window open
                 and let somebody take it down than to file it away on the day
                 it arrives. See liveAnnouncements() in js/data.js, which is
                 the filter this is respecting. */
              ends_on: futureDate(cleanDate(item.ends_on)),
              priority: 0,
              // The two that make this whole feature safe. Never anything else.
              published: false,
              review_state: 'pending',
              source: 'newsletter',
              pinned: false,
            };
          }).filter(Boolean) as Array<Record<string, unknown>>;

          if (!rows.length) {
            ledger.status = 'empty';
            ledger.note = 'Read it, but nothing in it looked like an announcement.';
          } else if (dryRun) {
            preview.push({ subject, drafts: rows });
            draftCount += rows.length;
          } else {
            /* The ledger row is already there — the claim above wrote it
               before the model was called, which is the ordering 0038 chose
               for this insert and 0069 generalised. The announcements point at
               it by id, and a crash between here and the end leaves an email
               marked claimed with no drafts rather than drafts that arrive
               twice. Of the two ways this can fail, a missing draft is
               recoverable and a duplicated one is a mess in the review queue.

               A claim that comes back with nothing to parse is not possible
               here: claimId is only null on a dry run, and a dry run never
               reaches this branch. */
            const emailId = claimId as number;

            /* Events first, for the foreign key. An event landing with no
               announcement pointing at it is the harmless direction to fail:
               it is unpublished, so it is on no screen, and the next line
               either claims it or it sits inert. The reverse would be an
               announcement referring to an event that does not exist, which
               the database refuses outright. */
            if (events.length) {
              const { error: eventError } = await admin.from('events').insert(events);
              if (eventError) {
                throw new Error(`Could not write the events: ${eventError.message}`);
              }
              // Counted after the insert returned, never before it. Nobody is
              // told about a date that did not land.
              newEvents += events.length;
            }

            const withSource = rows.map((r) => ({ ...r, source_email_id: emailId }));
            const { error: insertError } = await admin.from('announcements').insert(withSource);
            if (insertError) {
              throw new Error(`Could not write the drafts: ${insertError.message}`);
            }

            await settleEmail(admin, emailId, {
              status: 'parsed', drafts: rows.length, note: null,
            });

            draftCount += rows.length;
            newDrafts += rows.length;
            parsedCount += 1;
            // Only now, with the drafts safely in the table.
            await imap.markSeen(uid);
            continue;
          }
        }
      } catch (err) {
        /* Transient: the email is NOT marked read, so the next tick picks it
           up and tries again. This is the branch that stops a busy model —
           or, since 0069, an answer that arrived truncated — from costing the
           church a week.

           WHAT CHANGED AT 0069. This used to leave absolutely no trace, which
           made the retry free and the counting impossible: an email that
           deferred every single time would be re-read every twenty minutes for
           as long as the mailbox search could see it, and nothing anywhere
           said so. Now the claim is already in the ledger, so the outcome is
           written onto it — deferred while there are attempts left, failed
           when they run out — and the email is settled and reported rather
           than quietly retried forever.

           Still no \Seen either way, until it is genuinely settled. */
        if (err instanceof TransientError) {
          const reason = String(err.message).slice(0, 400);
          const spent = attempt >= MAX_PARSE_ATTEMPTS;

          if (claimId !== null) {
            await settleEmail(admin, claimId, {
              status: spent ? 'failed' : 'deferred',
              drafts: 0,
              note: spent
                ? `Gave up after ${MAX_PARSE_ATTEMPTS} attempts. ${reason}`.slice(0, 500)
                : reason,
            });
          }

          if (spent) {
            failedCount += 1;
            failedNote = reason;
            // Settled, so it stops being found. Without this the fortnight
            // search would keep handing it back to a claim that now refuses.
            if (!dryRun) await imap.markSeen(uid);
            console.error(`newsletter-intake: giving up on ${messageId} after ${attempt}: ${err.message}`);
          } else {
            deferred += 1;
            deferredNote = reason;
            console.warn(`newsletter-intake: deferring ${messageId} (attempt ${attempt}): ${err.message}`);
          }
          continue;
        }

        /* The mailbox itself went away mid-loop. That is not this email being
           unparseable, it is the run being over, and pretending otherwise
           would mark a perfectly good newsletter failed because a socket
           dropped. Straight out to the run-level handler. */
        if (err instanceof ImapError) throw err;

        /* Permanent, and since 0069 that means something narrower than it used
           to: a failure that happened AFTER rows were written, or one that has
           nothing to do with the model. Reading the email again would write a
           second set of drafts over the first, so these settle where they
           fall, and the run note below says so out loud. */
        ledger.status = 'failed';
        ledger.drafts = 0;
        ledger.note = String((err as Error).message ?? err).slice(0, 500);
        failedCount += 1;
        failedNote = String(ledger.note);
        console.error(`newsletter-intake: ${messageId} failed:`, err);
      }

      /* The outcome of a claim that did not write drafts: empty, or failed.
         The drafts branch settles itself above and continues, because it has a
         count to record that this does not. */
      if (!dryRun && claimId !== null) {
        await settleEmail(admin, claimId, ledger);
        parsedCount += 1;
        await imap.markSeen(uid);
      }
    }

    await imap.close();

    if (dryRun) {
      return json({ ok: true, dry_run: true, found, drafts: draftCount, deferred, preview });
    }

    /* A deferred email leaves the run `ok` on purpose: the mailbox was reached
       and nothing is broken, it simply has to be tried again. But it does carry
       a note, and the Admin screen draws the newest run's note whether or not
       it is ok, which is what keeps "Gemini has been busy for two days" from
       being indistinguishable from "no newsletter arrived". */
    const lines: string[] = [];
    if (deferred) {
      lines.push(`${deferred} email${deferred === 1 ? '' : 's'} left for the next run. ${deferredNote ?? ''}`.trim());
    }
    if (failedCount) {
      lines.push(
        `${failedCount} email${failedCount === 1 ? ' could not be read' : 's could not be read'} and ` +
        `${failedCount === 1 ? 'was' : 'were'} not turned into drafts. ${failedNote ?? ''}`.trim(),
      );
    }
    const note = lines.length ? lines.join(' ').slice(0, 500) : null;

    /* After the mailbox is closed and before the run is written, which is the
       one moment where everything this run was going to write is written and
       nothing else is waiting on it. */
    await tellTheAdmins({ drafts: newDrafts, events: newEvents });

    return await finish(true, { found, parsed: parsedCount, drafts: draftCount }, note);
  } catch (err) {
    await imap.close();
    const note = String((err as Error).message ?? err).slice(0, 500);
    console.error('newsletter-intake failed:', err);
    if (probe) return json({ ok: false, probe: true, error: note }, 200);
    return await finish(false, { found, parsed: parsedCount, drafts: draftCount }, note);
  }
});
