/* ===========================================================================
   The order announcements sit in, on both screens that claim to know it.

   WHY THIS FILE EXISTS. There are two lists of the same announcements: the
   cards on Home, ordered by HC.data.liveAnnouncements(), and the Posted list
   on the Admin screen, which is where the arrows that set that order live. The
   arrows are only honest if the two lists agree, and when they stopped
   agreeing the bug did not look like a bug in ordering. It looked like the
   arrows were broken: you moved a card and this screen did not change, the
   greyed-out top arrow was on the second row, and an edit to an announcement
   moved it somewhere nobody had asked for.

   So what is asserted here is the agreement itself, not the arithmetic. Every
   block below builds one table of rows and asks both sides where they think
   the cards go.

   THE THREE WAYS AN ANNOUNCEMENT GETS A POSITION, all tested here, because
   each of them was wrong in a different way:

     the arrows      renumber the live list from the top. Always did work; the
                     screen was drawing a different list.
     a new one       is born above the top of Home, because once the arrows
                     have numbered anything, the 0 the column defaults to is
                     not "no opinion", it is last.
     approving one   the same, for the drafts the newsletter parses.

   And one thing that must NOT set a position: saving an edit. That is the
   regression this file exists to hold, because it is silent and it happens
   minutes after somebody has finished ordering the list.

   No browser, and no Supabase. js/admin.js talks to one fake below that keeps
   the table in an array and answers like PostgREST does, which is what lets a
   write and the read after it be asserted against each other.
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

/* --------------------------------------------------------------- the fakes */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => Array.from(map.keys())[i],
    get length() { return map.size; }
  };
}

/* The announcements table, and every request js/admin.js makes of it.

   It answers reads out of the same array the writes land in, on purpose: a
   reorder is several PATCHes followed by a re-read, and the only question
   worth asking about it is whether the list that comes back is the list
   somebody asked for. A fake that recorded the writes and answered reads from
   a fixture could not be asked that. */
function fakeAuth(rows) {
  const calls = [];
  const api = {
    calls: calls,
    rows: rows,

    restFetch: function (pathname, opts) {
      opts = opts || {};
      calls.push({ path: pathname, method: opts.method || 'GET', body: opts.body || null });

      const one = /^\/announcements\?id=eq\.([^&]+)/.exec(pathname);
      if (one && opts.method === 'PATCH') {
        const row = rows.filter(r => r.id === decodeURIComponent(one[1]))[0];
        if (row) Object.assign(row, opts.body);
        return Promise.resolve(null);
      }

      if (pathname === '/announcements' && opts.method === 'POST') {
        const row = Object.assign({}, opts.body);
        rows.push(row);
        return Promise.resolve([row]);
      }

      // order=created_at.desc, and the id after it so a tie in this file is
      // not a tie in the fake.
      if (pathname.indexOf('/announcements?select=') === 0) {
        return Promise.resolve(rows.slice().sort(function (a, b) {
          const ca = String(a.created_at || ''), cb = String(b.created_at || '');
          if (ca !== cb) return ca < cb ? 1 : -1;
          return String(a.id) < String(b.id) ? -1 : 1;
        }));
      }

      return Promise.resolve([]);
    },

    rpc: function (name, args) {
      calls.push({ rpc: name, args: args });
      if (name === 'hc_admin_approve_announcement') {
        const row = rows.filter(r => r.id === args.p_id)[0];
        // What migration 0038's function does, and the whole of what it does:
        // it does not touch priority, which is the reason approve has to.
        if (row) { row.published = true; row.review_state = 'approved'; }
      }
      return Promise.resolve(null);
    }
  };
  return api;
}

function load(rows) {
  const sandbox = { window: { localStorage: fakeStorage(), console: console } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  ['data.js', 'admin.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  });

  const HC = sandbox.window.HC;
  HC.auth = fakeAuth(rows);
  HC.store = { emit: function () {}, getProfile: function () { return {}; } };
  HC.content = { refresh: function () {} };
  // Enough of the sanitizer for saveAnnouncement to make a body out of a
  // paragraph. What it actually strips is tests/journal.test.js's business.
  HC.richtext = {
    sanitize: function (html) { return html; },
    plainText: function (html) { return String(html).replace(/<[^>]*>/g, ''); }
  };
  return HC;
}

const settle = () => new Promise(function (r) { setImmediate(r); });

async function loaded(rows) {
  const HC = load(rows);
  HC.admin.loadAnnouncements();
  await settle();
  await settle();
  return HC;
}

/* A row as the announcements table holds it. Published, live, and written by
   hand unless a block below says otherwise. */
function row(over) {
  return Object.assign({
    id: 'a', title: 'Something', body: null, body_html: null,
    starts_on: null, ends_on: null, priority: 0,
    published: true, pinned: false, review_state: null, deleted_at: null,
    created_at: '2026-01-01T00:00:00Z'
  }, over || {});
}

/* The same row after the trip through js/content.js, in the fields the order
   is made of. Written out here rather than by running the real mapper, which
   would need the whole sync: what matters is that this is the shape
   liveAnnouncements() reads, and tests/announcements.test.js holds it too.

   Unpublished and deleted rows are dropped, because the content sync reads
   with the publishable key and asks for `deleted_at=is.null`, so no phone —
   an admin's included — is ever holding one. */
function synced(rows) {
  return rows.filter(function (r) {
    return r.published !== false && !r.deleted_at;
  }).map(function (r) {
    return {
      id: r.id,
      title: r.title,
      publishedOn: r.starts_on || String(r.created_at || '').slice(0, 10),
      startsOn: r.starts_on || null,
      endsOn: r.ends_on || null,
      priority: r.priority == null ? 0 : r.priority,
      pinned: !!r.pinned,
      createdAt: r.created_at || null
    };
  });
}

function onHome(HC, rows) {
  HC.data.announcements.length = 0;
  synced(rows).forEach(function (a) { HC.data.announcements.push(a); });
  return HC.data.liveAnnouncements().map(a => a.id);
}

const ids = list => list.map(r => r.id);

/* --------------------------------------------- the two lists say one thing */

(async function () {

{
  const rows = [
    row({ id: 'march',  created_at: '2026-03-01T00:00:00Z', priority: 0 }),
    row({ id: 'june',   created_at: '2026-06-01T00:00:00Z', priority: 0 }),
    row({ id: 'lifted', created_at: '2026-02-01T00:00:00Z', priority: 4 })
  ];
  const HC = await loaded(rows);

  ok('the admin list is Home\'s list, in Home\'s order',
    ids(HC.admin.orderedLive()), onHome(HC, rows));
  ok('and that order is priority first, then newest',
    ids(HC.admin.orderedLive()), ['lifted', 'june', 'march']);
}

{
  /* The list the screen draws, which is the one that was wrong: it used to be
     the table newest first while the arrows were numbered from Home's order,
     so the two disagreed about every row and about which one the disabled top
     arrow belonged to. */
  const rows = [
    row({ id: 'newest-but-last', created_at: '2026-06-01T00:00:00Z', priority: 1 }),
    row({ id: 'moved-to-top',    created_at: '2026-01-01T00:00:00Z', priority: 3 }),
    row({ id: 'middle',          created_at: '2026-03-01T00:00:00Z', priority: 2 }),
    row({ id: 'next-month',      created_at: '2026-05-01T00:00:00Z', starts_on: '2099-01-01' }),
    row({ id: 'a-draft',         created_at: '2026-04-01T00:00:00Z', published: false }),
    row({ id: 'in-the-queue',    created_at: '2026-07-01T00:00:00Z', review_state: 'pending',
          published: false }),
    row({ id: 'binned',          created_at: '2026-07-02T00:00:00Z',
          deleted_at: '2026-07-03T00:00:00Z' })
  ];
  const HC = await loaded(rows);

  ok('the Posted list opens with Home, in Home\'s order',
    ids(HC.admin.postedOrder()).slice(0, 3), onHome(HC, rows));

  ok('then everything not on Home today, newest first',
    ids(HC.admin.postedOrder()),
    ['moved-to-top', 'middle', 'newest-but-last', 'next-month', 'a-draft']);

  // The queue draws its own cards above this list and the bin draws its own
  // below it. A row in either one appearing here as well is one announcement
  // on one screen twice, with a different set of buttons each time.
  ok('a draft in the review queue is not in it',
    ids(HC.admin.postedOrder()).includes('in-the-queue'), false);
  ok('nor is a deleted one',
    ids(HC.admin.postedOrder()).includes('binned'), false);
}

/* --------------------------------------------------------------- the arrows */

{
  const rows = [
    row({ id: 'top',    created_at: '2026-06-01T00:00:00Z' }),
    row({ id: 'middle', created_at: '2026-05-01T00:00:00Z' }),
    row({ id: 'bottom', created_at: '2026-04-01T00:00:00Z' })
  ];
  const HC = await loaded(rows);

  ok('before anybody touches an arrow, the order is the dates',
    ids(HC.admin.orderedLive()), ['top', 'middle', 'bottom']);

  const moved = await HC.admin.reorderAnnouncement('bottom', 'up');
  ok('moving one up reports that it moved', moved, true);

  HC.admin.loadAnnouncements();
  await settle();
  await settle();

  ok('up swaps it with the one above it',
    ids(HC.admin.orderedLive()), ['top', 'bottom', 'middle']);
  ok('and Home says the same thing', onHome(HC, rows), ['top', 'bottom', 'middle']);

  await HC.admin.reorderAnnouncement('bottom', 'up');
  HC.admin.loadAnnouncements();
  await settle();
  await settle();

  ok('twice up puts it on top', ids(HC.admin.orderedLive()),
    ['bottom', 'top', 'middle']);
  ok('and Home still says the same thing', onHome(HC, rows),
    ['bottom', 'top', 'middle']);

  const nope = await HC.admin.reorderAnnouncement('bottom', 'up');
  ok('up from the top does nothing at all', nope, false);

  await HC.admin.reorderAnnouncement('bottom', 'down');
  HC.admin.loadAnnouncements();
  await settle();
  await settle();

  ok('and down puts it back', ids(HC.admin.orderedLive()),
    ['top', 'bottom', 'middle']);
}

{
  // An arrow on a card that is not on Home today would move it up a list it is
  // not in, so the screen does not draw one. The list it would move in has to
  // agree about that or the indexes the arrows are disabled at are wrong.
  const rows = [
    row({ id: 'live',       created_at: '2026-06-01T00:00:00Z' }),
    row({ id: 'next-month', created_at: '2026-06-02T00:00:00Z', starts_on: '2099-01-01' }),
    row({ id: 'came-down',  created_at: '2026-06-03T00:00:00Z', ends_on: '2020-01-01' })
  ];
  const HC = await loaded(rows);

  ok('only what is on Home today can be moved',
    ids(HC.admin.orderedLive()), ['live']);
  ok('and it is on Home', onHome(HC, rows), ['live']);
}

/* ------------------------------------------------- what a new one is born with */

{
  const rows = [
    row({ id: 'lifted',  created_at: '2026-01-01T00:00:00Z', priority: 3 }),
    row({ id: 'ordered', created_at: '2026-02-01T00:00:00Z', priority: 2 }),
    row({ id: 'last',    created_at: '2026-03-01T00:00:00Z', priority: 1 })
  ];
  const HC = await loaded(rows);

  await HC.admin.saveAnnouncement({
    title: 'Homecoming', bodyHtml: '<p>Sunday.</p>', images: [], published: true
  });

  const post = HC.auth.calls.filter(c => c.method === 'POST')[0];
  ok('a new announcement is written above the top of Home', post.body.priority, 4);

  HC.admin.loadAnnouncements();
  await settle();
  await settle();

  // announcementId() slugs the title, per 0003: the id is permanent because
  // "I dismissed this" is keyed on it.
  ok('so it is the first card on Home',
    onHome(HC, rows)[0], 'announcement-homecoming');
  ok('and the first row on the admin screen',
    ids(HC.admin.postedOrder())[0], 'announcement-homecoming');
}

{
  // Nobody has used an arrow yet, so nothing is carrying a number and the
  // dates are doing the ordering. A new one still goes on top, and this is
  // the case that must not start the numbering off in the wrong place.
  const rows = [row({ id: 'only', created_at: '2026-01-01T00:00:00Z' })];
  const HC = await loaded(rows);

  ok('the first number written is one', HC.admin.nextPriority(), 1);
}

{
  // A deleted row's number is not counted. It is not on Home, nothing can see
  // it, and letting it push every future announcement higher would mean the
  // numbers climbed for a reason nobody could look at.
  const rows = [
    row({ id: 'live',  priority: 2 }),
    row({ id: 'binned', priority: 9, deleted_at: '2026-07-03T00:00:00Z' })
  ];
  const HC = await loaded(rows);

  ok('a deleted announcement does not raise the ceiling',
    HC.admin.nextPriority(), 3);
}

/* --------------------------------------------- and what an edit must not touch */

{
  /* The regression. Saving an edit used to send the priority the row had when
     the editor opened, which is the number from before the last reorder, or 0
     for a row nobody had ever moved. Fixing a typo would drop the card to the
     bottom of Home, quietly, and the arrows would appear to have forgotten
     what somebody had just told them. */
  const rows = [
    row({ id: 'top',    created_at: '2026-01-01T00:00:00Z', priority: 2 }),
    row({ id: 'second', created_at: '2026-02-01T00:00:00Z', priority: 1 })
  ];
  const HC = await loaded(rows);

  await HC.admin.saveAnnouncement({
    id: 'top', title: 'Homecoming, fixed', bodyHtml: '<p>Sunday.</p>',
    images: [], published: true
  });

  const patch = HC.auth.calls.filter(c => c.method === 'PATCH')[0];
  ok('an edit sends no priority at all',
    Object.prototype.hasOwnProperty.call(patch.body, 'priority'), false);

  HC.admin.loadAnnouncements();
  await settle();
  await settle();

  ok('so the card is where it was left', ids(HC.admin.orderedLive()),
    ['top', 'second']);
  ok('on Home as well', onHome(HC, rows), ['top', 'second']);
}

/* ------------------------------------------------------- approving a draft */

{
  const rows = [
    row({ id: 'lifted', created_at: '2026-01-01T00:00:00Z', priority: 2 }),
    row({ id: 'last',   created_at: '2026-02-01T00:00:00Z', priority: 1 }),
    // What the newsletter intake writes: unpublished, in the queue, and with
    // the priority the column defaults to, which is now last place.
    row({ id: 'parsed', created_at: '2026-08-01T00:00:00Z', priority: 0,
          published: false, review_state: 'pending' })
  ];
  const HC = await loaded(rows);

  await HC.admin.approveAnnouncement('parsed');

  HC.admin.loadAnnouncements();
  await settle();
  await settle();

  ok('an approved draft goes to the top of Home, not the bottom',
    onHome(HC, rows), ['parsed', 'lifted', 'last']);
  ok('and the admin list agrees',
    ids(HC.admin.postedOrder()), ['parsed', 'lifted', 'last']);
}

{
  // The approval is the promise; the position is not. If the second write
  // fails the announcement is still live, one arrow from where it belongs,
  // and saying "that did not work" about a card that is on Home would be a
  // lie somebody would act on by approving it twice.
  const rows = [
    row({ id: 'parsed', priority: 0, published: false, review_state: 'pending' })
  ];
  const HC = await loaded(rows);
  const realFetch = HC.auth.restFetch;
  HC.auth.restFetch = function (pathname, opts) {
    if (opts && opts.method === 'PATCH') return Promise.reject(new Error('offline'));
    return realFetch(pathname, opts);
  };

  let threw = false;
  await HC.admin.approveAnnouncement('parsed').then(null, function () { threw = true; });

  ok('a failed reposition does not fail the approval', threw, false);
  ok('and the announcement is published', rows[0].published, true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

})();
