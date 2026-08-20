/* ===========================================================================
   The Group tab against the real schema.

   Not a stub. A real PostgREST 12 speaking to a real Postgres with migrations
   0016 through 0021 applied, and two real browser contexts driving the real
   app: two phones, one room. Every request the app makes to Supabase is
   forwarded to that PostgREST with the /rest/v1 prefix stripped, so the code
   under test is js/auth.js and js/rooms.js exactly as they ship, and every
   answer comes back through the row level security policies rather than
   through anything written for a test.

   What that buys, and what a Node stub could never say: when the host has not
   opened an answer, the member's phone is not hiding it. It was never sent.
   =========================================================================== */
const { chromium } = require('playwright-core');
const crypto = require('crypto');

const PGRST = process.env.HC_E2E_API || 'http://127.0.0.1:3001';
const APP = process.env.HC_E2E_APP || 'http://127.0.0.1:8899/index.html';
const SECRET = process.env.HC_E2E_SECRET || 'hc-e2e-secret-that-is-at-least-32-chars-long';

/* The project's real Supabase URL, read out of the app's own config rather
   than written down twice, so this keeps working when that changes. Nothing
   is ever sent there: every request to it is intercepted below. */
const SUPA = (require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'js', 'config.js'), 'utf8')
  .match(/SUPABASE_URL:\s*'([^']+)'/) || [])[1];
if (!SUPA) { console.error('Could not read SUPABASE_URL out of js/config.js'); process.exit(1); }

/* playwright-core ships no browser of its own. This machine keeps one under
   PLAYWRIGHT_BROWSERS_PATH; anywhere else, let playwright resolve its own and
   fall over with its own message, which is clearer than one invented here. */
function chrome() {
  if (process.env.HC_E2E_CHROME) return process.env.HC_E2E_CHROME;
  const fs = require('fs'), path = require('path');
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    // Full chromium only. The directory also holds chromium_headless_shell,
    // which sorts after it and is not a browser this can drive.
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort();
    for (var i = dirs.length - 1; i >= 0; i--) {
      const exe = path.join(root, dirs[i], 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
    return null;
  } catch (e) { return null; }
}

const HOST = { id: 'c0000000-0000-0000-0000-000000000001', name: 'Trey', email: 'host@e2e.test' };
const MEMBER = { id: 'c0000000-0000-0000-0000-000000000002', name: 'Priya', email: 'member@e2e.test' };

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

// ---- a GoTrue shaped token, signed the way PostgREST expects ---------------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(user) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({
    sub: user.id, email: user.email, role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 7200
  });
  const sig = crypto.createHmac('sha256', SECRET).update(head + '.' + body).digest('base64url');
  return head + '.' + body + '.' + sig;
}

async function phone(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  /* Real offline for this harness. context.setOffline() stops the browser
     reaching the network, and every Supabase call here is intercepted before
     it gets there and served by Node, which is still online. So the switch
     that matters is this one. */
  const net = { down: false };
  page.on('pageerror', e => errs.push(user.name + ': ' + e.message));
  /* One handler per phone, registered once. Two of them, added later in the
     script, race each other and the second call throws "already handled".
     accept() takes the prompt text and confirms ignore it. */
  page.on('dialog', d => d.accept('It read as a dig at somebody.'));

  // Every Supabase call, forwarded to the real thing.
  await page.route(SUPA + '/**', async (route) => {
    if (net.down) { await route.abort(); return; }
    const req = route.request();
    const path = req.url().slice(SUPA.length).replace(/^\/rest\/v1/, '');
    const h = req.headers();
    const out = {};
    ['authorization', 'content-type', 'accept', 'prefer'].forEach(k => { if (h[k]) out[k] = h[k]; });
    try {
      const res = await fetch(PGRST + path, {
        method: req.method(), headers: out, body: req.postData() || undefined
      });
      const text = await res.text();
      if (process.env.TRACE && path.startsWith('/rpc'))
        console.log('   ~ ' + user.name + ' ' + path + ' ' + (req.postData() || '') +
                    ' -> ' + res.status + ' ' + text.slice(0, 160));
      await route.fulfill({ status: res.status, body: text,
        headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
    } catch (e) {
      await route.abort();
    }
  });

  await page.addInitScript(([u, t]) => {
    localStorage.setItem('hc:session', JSON.stringify({
      accessToken: t, refreshToken: 'not-used-here',
      expiresAt: Date.now() + 7200e3, user: { id: u.id, email: u.email }
    }));
    localStorage.setItem('hc:profile', JSON.stringify({ firstName: u.name, canHost: u.name === 'Trey' }));
  }, [user, token(user)]);

  await page.goto(APP);
  await page.waitForTimeout(900);
  await page.locator('.hc-tab', { hasText: 'Group' }).click();
  await page.waitForTimeout(700);
  return { ctx, page, errs, user, net };
}

const text = (p) => p.locator('.hc-group').innerText();
const tap = async (p, sel) => { await p.locator(sel).first().click(); await p.waitForTimeout(900); };

(async () => {
  const b = await chromium.launch(chrome() ? { executablePath: chrome() } : {});
  const host = await phone(b, HOST);
  const member = await phone(b, MEMBER);

  // ---- 1. hosting ---------------------------------------------------------
  ok('the host is offered Leader mode', (await text(host.page)).includes('Host tonight'), true);
  ok('and a member is not', (await text(member.page)).includes('Host tonight'), false);

  await tap(host.page, '[data-action="room-open"]');
  const hostText = await text(host.page);
  const code = (hostText.match(/ROOM (\d{3} \d{3})/) || [])[1];
  ok('opening a room mints a six digit code', !!code, true);
  console.log('      room code: ' + code);
  ok('and the guide questions came across',
     (await host.page.locator('.hc-room-q[data-question]').count()) > 0, true);

  // ---- 2. the terms gate, which the database enforces too ------------------
  const bare = code.replace(' ', '');
  await member.page.fill('input[name="code"]', bare);
  await member.page.waitForTimeout(200);
  await tap(member.page, '[data-action="room-join"]');
  ok('the member is in the room', (await text(member.page)).includes('ROOM ' + code), true);

  const q = await member.page.locator('.hc-room-q[data-question]').first().getAttribute('data-question');
  await member.page.fill('[data-draft="' + q + '"]', 'A courtroom, honestly.');
  await member.page.waitForTimeout(200);
  await tap(member.page, '[data-action="room-post"]');
  ok('writing hits the terms gate first',
     (await text(member.page)).includes('Before you write'), true);

  /* The gate is not decoration: the row is not there. Counted as the AUTHOR,
     which took a wrong answer to work out. The first version of this helper
     asked as the host, got zero after a successful post, and reported that
     the post had failed. It had not: the host cannot read a shut answer, so
     asking them how many notes exist is asking the wrong person. */
  const roomId = await host.page.evaluate(() => HC.rooms.snapshot().room.id);
  const countNotes = async () => {
    const r = await fetch(PGRST + '/group_room_notes?select=id&room_id=eq.' + roomId, {
      headers: { Authorization: 'Bearer ' + token(MEMBER) } });
    return (await r.json()).length;
  };
  ok('and nothing was written while it was up', await countNotes(), 0);

  await tap(member.page, '[data-action="room-accept-terms"]');
  await member.page.fill('[data-draft="' + q + '"]', 'A courtroom, honestly.');
  await member.page.waitForTimeout(200);
  await tap(member.page, '[data-action="room-post"]');
  ok('after agreeing, the answer goes in', await countNotes(), 1);

  // ---- 3. the rule the whole feature rests on ------------------------------
  await host.page.evaluate(() => HC.rooms.refresh());
  await host.page.waitForTimeout(600);
  const hostSees = await text(host.page);
  ok('the host is told somebody answered', hostSees.includes('1 answer in'), true);
  ok('and is shown the name', hostSees.includes('Priya'), true);
  ok('BUT NOT THE WORDS, the host waits with everybody else',
     hostSees.includes('A courtroom'), false);

  // The claim underneath that: it is not on the phone to be revealed.
  const raw = await host.page.evaluate(() => JSON.stringify(HC.rooms.snapshot().notes));
  ok('and the answer is not in the host\'s snapshot at all', raw.includes('A courtroom'), false);
  const overTheWire = await fetch(PGRST + '/group_room_notes?select=*&room_id=eq.' + roomId, {
    headers: { Authorization: 'Bearer ' + token(HOST) } }).then(r => r.json());
  ok('nor does the API hand it over when asked directly', overTheWire.length, 0);

  // ---- 4. the reveal ------------------------------------------------------
  await tap(host.page, '.hc-chip[data-action="room-open-answer"]');
  ok('opening one answer shows it to the host', (await text(host.page)).includes('A courtroom'), true);
  await member.page.evaluate(() => HC.rooms.refresh());
  await member.page.waitForTimeout(600);
  ok('and to the room', (await text(member.page)).includes('A courtroom'), true);

  // ---- 5. the filter, guideline 1.2 ---------------------------------------
  const q2 = await member.page.locator('.hc-room-q[data-question]').nth(1).getAttribute('data-question');
  await member.page.fill('[data-draft="' + q2 + '"]', 'what a retard');
  await member.page.waitForTimeout(200);
  await tap(member.page, '[data-action="room-post"]');
  ok('a slur is refused, by the server', (await member.page.locator('.hc-toast').innerText()).includes('slur'), true);
  ok('and nothing was stored', await countNotes(), 1);

  // ---- 6. report, and the host queue --------------------------------------
  /* Through the box, not through HC.rooms.pray(). Calling the data layer
     skipped the gate on the screen and the database refused the write,
     which is the gate working: the host has not agreed either. */
  await host.page.fill('[data-prayer="1"]', 'Pray for my sister.');
  await host.page.waitForTimeout(200);
  await tap(host.page, '[data-action="room-pray"]');
  ok('the host meets the same gate on their first write',
     (await text(host.page)).includes('Before you write'), true);
  await tap(host.page, '[data-action="room-accept-terms"]');
  await host.page.fill('[data-prayer="1"]', 'Pray for my sister.');
  await host.page.waitForTimeout(200);
  await tap(host.page, '[data-action="room-pray"]');
  await member.page.evaluate(() => HC.rooms.refresh());
  await member.page.waitForTimeout(700);
  ok('a prayer request is visible with no reveal',
     (await text(member.page)).includes('Pray for my sister'), true);

  const prayerNote = await member.page.locator('.hc-prayers .hc-note').first().getAttribute('data-note');
  await tap(member.page, '.hc-prayers .hc-note [data-action="room-report"]');
  await host.page.evaluate(() => HC.rooms.refresh());
  await host.page.waitForTimeout(700);
  const queue = await text(host.page);
  ok('the report reaches the host', queue.includes('Priya reported'), true);
  ok('with the reason', queue.includes('read as a dig'), true);
  ok('and both buttons', (await host.page.locator('.hc-queue [data-action="room-resolve-report"]').count())
     + (await host.page.locator('.hc-queue [data-action="room-take-down"]').count()), 2);

  // Leave it up. The report closes; the writing stays.
  await tap(host.page, '.hc-queue [data-action="room-resolve-report"]');
  ok('leaving it up empties the queue', await host.page.locator('.hc-queue').count(), 0);
  ok('and the prayer request is still there',
     (await text(host.page)).includes('Pray for my sister'), true);

  // ---- 7. blocking, which the policy enforces -----------------------------
  await tap(member.page, '.hc-prayers .hc-note [data-action="room-block"]');
  ok('the blocked person\'s writing is gone from the member\'s screen',
     (await text(member.page)).includes('Pray for my sister'), false);
  const asMember = await fetch(PGRST + '/group_room_notes?select=*&room_id=eq.' + roomId, {
    headers: { Authorization: 'Bearer ' + token(MEMBER) } }).then(r => r.json());
  ok('and the API will not hand it to them either',
     asMember.some(n => n.body.includes('my sister')), false);
  ok('an unblock row appeared', (await member.page.locator('[data-action="room-unblock"]').count()) > 0, true);
  await tap(member.page, '[data-action="room-unblock"]');
  ok('and unblocking brings it back', (await text(member.page)).includes('Pray for my sister'), true);

  // ---- 8. take down, the other ending -------------------------------------
  await tap(host.page, '.hc-notes .hc-note [data-action="room-take-down"]');
  await member.page.evaluate(() => HC.rooms.refresh());
  await member.page.waitForTimeout(700);
  ok('a takedown removes it for the room too',
     (await text(member.page)).includes('A courtroom'), false);

  /* ---- 8b. what you already wrote about this guide ------------------------

     The Journal's one crossing into the Group tab, and the only place private
     writing can reach a room. Three things have to be true: it offers what
     this person wrote about tonight's guide, tapping one only fills the box,
     and it appends rather than eating a half typed answer. */

  const guideId = await member.page.evaluate(() => HC.rooms.snapshot().room.guideId);
  ok('the room knows which guide it came from', !!guideId, true);

  await member.page.evaluate((gid) => {
    HC.journal.create({
      guideId: gid, kind: 'highlight',
      quote: 'a good friend keeps it real',
      bodyText: 'This is the line I underlined on Sunday.'
    });
  }, guideId);
  await member.page.evaluate(() => HC.screens.groupHelpers.repaint(true));
  await member.page.waitForTimeout(400);

  const q3 = await member.page.locator('.hc-room-q[data-question] [data-draft]')
    .first().getAttribute('data-draft');

  ok('the room offers what you wrote about this guide',
     (await member.page.locator('[data-action="room-journal-toggle"]').count()) > 0, true);

  await tap(member.page, '[data-action="room-journal-toggle"]');
  ok('and shows it when asked',
     (await text(member.page)).includes('This is the line I underlined on Sunday.'), true);

  // A half typed answer, to prove the suggestion does not eat it.
  await member.page.fill('[data-draft="' + q3 + '"]', 'Still thinking, but');
  await member.page.waitForTimeout(300);

  const before = await countNotes();
  await tap(member.page, '[data-action="room-journal-use"]');

  const filled = await member.page.inputValue('[data-draft="' + q3 + '"]');
  ok('tapping one appends to the box rather than replacing it',
     filled, 'Still thinking, but\n\nThis is the line I underlined on Sunday.');
  ok('and posts nothing on its own', await countNotes(), before);

  ok('what crossed over is plain text, not markup', /[<>]/.test(filled), false);

  // ---- 9. the sheet -------------------------------------------------------
  const sheet = await host.page.evaluate(() => HC.print.buildNightPages(HC.rooms.snapshot()));
  ok('the night sheet is built from the live room', sheet.includes('Pray for my sister'), true);

  // ---- 10. offline --------------------------------------------------------
  host.net.down = true;
  await host.page.evaluate(() => HC.rooms.refresh().catch(() => {}));
  await host.page.waitForTimeout(800);
  const off = await text(host.page);
  ok('with no signal the room is still on the screen', off.includes('ROOM ' + code), true);
  ok('and it says so rather than pretending', off.includes('Not up to date'), true);
  host.net.down = false;

  const errs = host.errs.concat(member.errs);
  console.log(errs.length ? '\nJS ERRORS:\n' + errs.join('\n') : '\nno js errors on either phone');
  console.log(fail ? fail + ' failed, ' + pass + ' passed.' : pass + ' passed.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
