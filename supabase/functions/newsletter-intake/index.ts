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

   So a transient failure writes NO ledger row and does NOT mark the email
   read. The email stays exactly as it was and the next tick, twenty minutes
   later, tries it again. That is why the classification lives in its own type
   rather than in a string match at the catch site. */
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

interface Parsed {
  title: string;
  eyebrow?: string;
  body: string;
  starts_on?: string;
  ends_on?: string;
  link_url?: string;
  image_url?: string;
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
          body: { type: 'string' },
          starts_on: { type: 'string' },
          ends_on: { type: 'string' },
          link_url: { type: 'string' },
          image_url: { type: 'string' },
        },
        required: ['title', 'body'],
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
    'weekly newsletter email. A person reviews and approves every draft before it is',
    'published, so it is much better to be accurate and sparse than complete and wrong.',
    '',
    `The newsletter was sent on ${emailDate}. Resolve every relative date ("this Sunday",`,
    '"next Wednesday", "tonight") against that date, in the America/Chicago timezone.',
    '',
    'RULES',
    '1. A newsletter usually bundles several separate things: a serve day, a members',
    '   meeting, a baptism sign-up, a schedule change. Return each one as its own',
    '   announcement. Do not merge distinct events into a single entry, and do not',
    '   split one event into several.',
    '2. Skip anything that is not an announcement: greetings, a pastor\'s letter,',
    '   scripture of the week, unsubscribe footers, "forward this to a friend",',
    '   social media links, and the newsletter\'s own masthead.',
    '3. title: short and specific, the way it would read on a card. Include the date',
    '   if the thing has one, e.g. "City Serve Day, September 12". No trailing period.',
    '4. body: one or two warm, plain sentences. Do not invent detail that is not in',
    '   the email. Do not repeat the title verbatim.',
    '5. eyebrow: a two or three word label if one is obvious ("This Sunday", "Serve",',
    '   "Kids"). Leave it out entirely if nothing fits. Never invent a category.',
    '6. starts_on / ends_on: strict YYYY-MM-DD, or leave out. starts_on is the day the',
    '   card should appear, which for a dated event is usually today, not the event',
    '   date. ends_on is the day after the thing happens, so the card retires itself.',
    '   Leave both out when the announcement has no date at all.',
    '7. link_url and image_url: choose ONLY from the candidate lists below, copied',
    '   exactly. If nothing in the lists belongs to this announcement, leave the field',
    '   out. Never write a URL that is not in the lists.',
    '8. If the email contains no real announcements, return an empty array.',
    '',
    'CANDIDATE LINKS',
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
            // Generous, and it is the thinking that spends it rather than the
            // answer: four announcements came back as 456 tokens of JSON after
            // 2,268 tokens of thought. A model that hits this ceiling stops
            // mid-JSON and the parse below fails, which is the failure
            // gemini-3-flash-preview produced every time.
            maxOutputTokens: 8192,
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

  if (!raw) {
    const reason = payload?.candidates?.[0]?.finishReason ?? 'no reason given';
    throw new Error(`Gemini returned nothing to parse (${reason}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini did not return JSON: ${raw.slice(0, 200)}`);
  }

  const list = (parsed as { announcements?: unknown })?.announcements;
  if (!Array.isArray(list)) throw new Error('Gemini returned no announcements array.');
  return list as Parsed[];
}

/* ========================================================================
   Turning what came back into rows

   Every field is re-checked here rather than trusted. The schema constrains
   the shape and nothing constrains the contents, so a date that is not a date
   and a URL that was never in the email both arrive looking perfectly valid.
   ===================================================================== */

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
function uniqueId(title: string, taken: Set<string>): string {
  const base = `announcement-${slugify(title) || 'untitled'}`;
  let id = base;
  let n = 2;
  while (taken.has(id)) { id = `${base}-${n}`; n++; }
  taken.add(id);
  return id;
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

  let body: { probe?: boolean; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* an empty body is a normal tick */ }
  const probe = body.probe === true;
  const dryRun = body.dry_run === true;

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

  const imap = new Imap();
  let found = 0;
  let parsedCount = 0;
  let draftCount = 0;
  // Emails left exactly as they were because something transient got in the
  // way. Counted rather than swallowed: a run whose only outcome was "Gemini
  // was busy" has to say so, or a week with no drafts looks like a week with
  // no newsletter.
  let deferred = 0;
  let deferredNote: string | null = null;

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
      .select('message_id')
      .in('message_id', ids.length ? ids : ['']);

    if (knownError) throw new Error(`Could not read the ledger: ${knownError.message}`);

    const seen = new Set((known ?? []).map((r) => r.message_id as string));
    const fresh = candidates.filter((c) => !seen.has(c.messageId)).slice(0, MAX_EMAILS_PER_RUN);

    if (!fresh.length) {
      await imap.close();
      return await finish(true, { found, parsed: 0, drafts: 0 }, null);
    }

    // Ids already in the table, so a generated slug does not collide with an
    // announcement somebody wrote by hand last month.
    const { data: existing } = await admin.from('announcements').select('id');
    const taken = new Set((existing ?? []).map((r) => r.id as string));

    const preview: unknown[] = [];

    for (const { uid, messageId } of fresh) {
      const raw = await imap.fetchRaw(uid);
      const envelope = splitHeaders(raw);
      const subject = decodeHeaderWords(envelope.headers['subject'] ?? '').slice(0, 300);
      const fromAddr = decodeHeaderWords(envelope.headers['from'] ?? '').slice(0, 300);
      const dateHeader = envelope.headers['date'] ?? '';
      const sentAt = dateHeader && !Number.isNaN(Date.parse(dateHeader))
        ? new Date(dateHeader).toISOString()
        : null;

      /* Everything the ledger will say about this email, whichever way it
         goes. Built up as we learn, written once at the end, so an email is
         recorded exactly once no matter which branch it takes. */
      const ledger: Record<string, unknown> = {
        message_id: messageId,
        imap_uid: uid,
        subject,
        from_addr: fromAddr,
        sent_at: sentAt,
        status: 'parsed',
        drafts: 0,
        note: null as string | null,
      };

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

        const links = html ? extractLinks(html) : [];
        const images = html ? extractImages(html) : [];

        if (text.length < 40) {
          ledger.status = 'empty';
          ledger.note = 'The email had no readable text in it.';
        } else {
          const items = await askGemini(
            geminiKey!, model, text, links, images,
            (sentAt ?? new Date().toISOString()).slice(0, 10),
          );

          const allowedLinks = links.map((l) => l.url);
          const rows = items.slice(0, MAX_DRAFTS_PER_EMAIL).map((item) => {
            const title = String(item.title ?? '').trim().slice(0, 200);
            if (!title) return null;

            const bodyText = String(item.body ?? '').trim().slice(0, 4000);
            const image = cleanChoice(item.image_url, images);
            const eyebrow = String(item.eyebrow ?? '').trim().slice(0, 40);

            return {
              id: uniqueId(title, taken),
              eyebrow: eyebrow || null,
              title,
              body: bodyText || null,
              body_html: bodyText ? textToHtml(bodyText) : null,
              image_url: image,
              image_urls: image ? [image] : [],
              video_url: null,
              link_url: cleanChoice(item.link_url, allowedLinks),
              link_title: null,
              link_image_url: null,
              starts_on: cleanDate(item.starts_on),
              ends_on: cleanDate(item.ends_on),
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
            /* The ledger row goes in FIRST, so the announcements can point at
               it and so a crash between the two leaves an email marked seen
               with no drafts rather than drafts that arrive twice. Of the two
               ways this can fail, a missing draft is recoverable by hand and a
               duplicated one is a mess in the review queue. */
            ledger.drafts = rows.length;
            const { data: emailRow, error: ledgerError } = await admin
              .from('newsletter_emails').insert(ledger).select('id').single();

            if (ledgerError) {
              // 23505 is the race: another run claimed this email between our
              // read of the ledger and now. Nothing to do and nothing wrong.
              if (ledgerError.code === '23505') continue;
              throw new Error(`Could not write the ledger: ${ledgerError.message}`);
            }

            const withSource = rows.map((r) => ({ ...r, source_email_id: emailRow.id }));
            const { error: insertError } = await admin.from('announcements').insert(withSource);
            if (insertError) {
              await admin.from('newsletter_emails')
                .update({ status: 'failed', drafts: 0, note: `Drafts would not save: ${insertError.message}`.slice(0, 500) })
                .eq('id', emailRow.id);
              throw new Error(`Could not write the drafts: ${insertError.message}`);
            }

            draftCount += rows.length;
            parsedCount += 1;
            // Only now, with the drafts safely in the table.
            await imap.markSeen(uid);
            continue;
          }
        }
      } catch (err) {
        /* Transient: leave absolutely no trace. No ledger row, no \Seen, no
           draft. The email is still unread and still unknown, so the next tick
           picks it up as though this run never happened. This is the branch
           that stops a busy model from costing the church a week. */
        if (err instanceof TransientError) {
          deferred += 1;
          deferredNote = String(err.message).slice(0, 300);
          console.warn(`newsletter-intake: deferring ${messageId}: ${err.message}`);
          continue;
        }

        /* The mailbox itself went away mid-loop. That is not this email being
           unparseable, it is the run being over, and pretending otherwise
           would mark a perfectly good newsletter failed because a socket
           dropped. Straight out to the run-level handler. */
        if (err instanceof ImapError) throw err;

        // Permanent: one email failing is not the run failing. Record it
        // against the email, so it is not retried every twenty minutes
        // forever, and carry on to the next one.
        ledger.status = 'failed';
        ledger.drafts = 0;
        ledger.note = String((err as Error).message ?? err).slice(0, 500);
        console.error(`newsletter-intake: ${messageId} failed:`, err);
      }

      if (!dryRun) {
        const { error } = await admin.from('newsletter_emails').insert(ledger);
        if (!error || error.code === '23505') {
          parsedCount += 1;
          await imap.markSeen(uid);
        }
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
    const note = deferred
      ? `${deferred} email${deferred === 1 ? '' : 's'} left for the next run. ${deferredNote ?? ''}`.trim().slice(0, 500)
      : null;

    return await finish(true, { found, parsed: parsedCount, drafts: draftCount }, note);
  } catch (err) {
    await imap.close();
    const note = String((err as Error).message ?? err).slice(0, 500);
    console.error('newsletter-intake failed:', err);
    if (probe) return json({ ok: false, probe: true, error: note }, 200);
    return await finish(false, { found, parsed: parsedCount, drafts: draftCount }, note);
  }
});
