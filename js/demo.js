/* ==========================================================================
   Home Church, demo mode, sample data on a preview link

   WHAT IT IS FOR. Every Cloudflare preview runs a branch's code against the
   one live Supabase project, so an idea that needs data the database does
   not have yet, or that would write things people would see, cannot be tried
   on a preview. Add ?demo=<name> to a preview link and the app answers from
   demo/<name>.json in the branch instead.

     https://<branch>.home-church.pages.dev/?demo=cafe
     https://<branch>.home-church.pages.dev/?demo=cafe&v=cafe   (opens on Coffee)

   WHERE IT CAN SWITCH ON, and nowhere else: an https page on *.pages.dev,
   and http://127.0.0.1 for rendering here. Not GitHub Pages, not the App
   Store app (capacitor://localhost), not anything else. This file ships in
   the app and does nothing there; demo/ does not ship at all.

   WHAT REACHES THE LIVE PROJECT WHILE IT IS ON. Only reads, made the way a
   signed-out visitor to the web version makes them: the publishable key and
   no session, so the same row level security decides what comes back. So
   guides, events and the rest look real. Everything else is answered here:

   1. A route in the sample file, matched on the path. First match wins.
   2. An overlay: the live rows of a table with the sample's rows laid over
      them by key. app_settings uses it, so a demo can turn one page on or
      open the cafe without copying every other setting.
   3. Sign in, sign out, codes: all accepted, for any address. The demo can
      start signed in as the sample's pretend person.
   4. Any other write, rpc or function call: a quiet success that went
      nowhere. Nothing a demo does is ever sent.

   It keeps its own storage. Every key the app writes goes under hc-demo:
   instead of hc: (js/store.js asks HC.demo), cleared each time a ?demo link
   is opened, so a demo starts fresh and never touches a real session on the
   same address. It stays on for the tab, through the router dropping the
   query, until Exit on the banner.

   SAMPLE FILE, demo/<name>.json. Every key is optional.

     {
       "title":    "Coffee",                          // on the banner
       "signedIn": { "id": "<uuid>", "email": "..." }, // start signed in
       "overlay":  { "app_settings": [ { "key": "cafe_on", "value_bool": true } ] },
       "routes":   [ { "match": "/rest/v1/profiles", "body": { ... } },
                     { "match": "/rpc/hc_cafe_ahead", "method": "POST", "body": 3 } ],
       "effects":  [ { "rpc": "hc_admin_approve_event", "table": "events",
                       "set": { "published": true, "review_state": "approved" } } ]
     }

   EFFECTS make a screen move the way it would. When the app calls a named
   rpc, the row its p_id names gets `set` laid over it for the rest of the
   tab, in every route answering that table, and an eq filter on a column an
   effect changed is honoured for that row: approve a date and it leaves the
   `review_state=eq.pending` list. Nothing is sent; the rpc is still answered
   here like any other.

   "{{today}}" anywhere in the file becomes today's date at church,
   2026-10-25, so a demo can say "open today" on whatever day it is opened.
   ========================================================================== */

(function (HC) {
  'use strict';

  var FLAG = 'hc-demo';
  var PREFIX = 'hc-demo:';
  var NAME = /^[a-z0-9-]{1,40}$/;

  function allowedHere(loc) {
    if (loc.protocol === 'https:' && /\.pages\.dev$/i.test(loc.hostname)) return true;
    return loc.protocol === 'http:' && loc.hostname === '127.0.0.1';
  }

  function session(op, value) {
    try {
      if (op === 'get') return window.sessionStorage.getItem(FLAG);
      if (op === 'set') window.sessionStorage.setItem(FLAG, value);
      if (op === 'clear') window.sessionStorage.removeItem(FLAG);
    } catch (err) { /* private mode: on for this page only */ }
    return null;
  }

  function clearOwnStorage() {
    try {
      var doomed = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) doomed.push(k);
      }
      doomed.forEach(function (k) { window.localStorage.removeItem(k); });
    } catch (err) { /* nothing stored, nothing to clear */ }
  }

  /* Which demo, if any. A ?demo link starts one fresh; otherwise this tab
     carries on with the one it already had. */
  function pick(loc) {
    if (!allowedHere(loc)) return null;
    var asked = new URLSearchParams(loc.search).get('demo');
    if (asked && NAME.test(asked)) {
      clearOwnStorage();
      session('set', asked);
      return { name: asked, fresh: true };
    }
    var held = session('get');
    return held && NAME.test(held) ? { name: held, fresh: false } : null;
  }

  /* ------------------------------------------------------------- answers */

  function churchToday(now) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(now || new Date());
    } catch (err) {
      return (now || new Date()).toISOString().slice(0, 10);
    }
  }

  function parseSample(text, now) {
    var today = churchToday(now);
    var sample = JSON.parse(String(text).split('{{today}}').join(today));
    sample.routes = Array.isArray(sample.routes) ? sample.routes : [];
    sample.overlay = sample.overlay && typeof sample.overlay === 'object' ? sample.overlay : {};
    sample.effects = Array.isArray(sample.effects) ? sample.effects : [];
    return sample;
  }

  function demoUser(sample, email) {
    var who = sample.signedIn || {};
    return {
      id: who.id || '00000000-0000-0000-0000-00000000de30',
      email: email || who.email || 'demo@example.org'
    };
  }

  function sessionBody(sample, email) {
    return {
      access_token: 'demo', token_type: 'bearer', refresh_token: 'demo',
      expires_in: 30 * 24 * 3600, user: demoUser(sample, email)
    };
  }

  /* The keys a PostgREST filter on `key` asks for, or null for all of them:
     key=eq.cafe_on, key=in.(cafe_on,cafe_every_day). */
  function keysAskedFor(path) {
    var q = path.split('?')[1] || '';
    var p = new URLSearchParams(q).get('key');
    if (!p) return null;
    var eq = /^eq\.(.+)$/.exec(p);
    if (eq) return [eq[1]];
    var inn = /^in\.\((.*)\)$/.exec(p);
    if (inn) return inn[1].split(',').map(function (s) { return s.replace(/^"|"$/g, ''); });
    return null;
  }

  /* Rows match on `key` (app_settings) or, when a sample row has no key, on
     `id`, which is every other table: a guide's narration, say. A row matched
     on id only ever changes a row the live project sent. It is never added,
     because a sample row is a few columns, and a guide made of a few columns
     is a broken guide rather than a new one. */
  function overlayRows(live, rows, path) {
    var asked = keysAskedFor(path);
    var out = (Array.isArray(live) ? live : []).slice();
    rows.forEach(function (row) {
      var by = row && 'key' in row ? 'key' : 'id';
      if (by === 'key' && asked && asked.indexOf(row.key) === -1) return;
      var at = -1;
      out.forEach(function (r, i) { if (r && r[by] === row[by]) at = i; });
      if (at === -1) { if (by === 'key') out.push(row); }
      else out[at] = Object.assign({}, out[at], row);
    });
    return out;
  }

  /* The effect a call has, if the sample gives it one. */
  function effectFor(sample, method, path) {
    if (method !== 'POST') return null;
    var name = (/^\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(path) || [])[1];
    if (!name) return null;
    return (sample.effects || []).filter(function (e) {
      return e && e.rpc === name && e.table && e.set;
    })[0] || null;
  }

  /* Remembers what an effect did: changed[table][id] = columns. */
  function recordEffect(changed, effect, body) {
    var args = {};
    try { args = JSON.parse(body || '{}') || {}; } catch (err) { return changed; }
    var id = args.p_id;
    if (id === undefined || id === null) return changed;
    changed[effect.table] = changed[effect.table] || {};
    changed[effect.table][id] = Object.assign({}, changed[effect.table][id], effect.set);
    return changed;
  }

  /* A route's rows with what the effects did laid over them. Only rows an
     effect touched are ever changed or filtered out; everything else is the
     sample as written. */
  function applyEffects(rows, changed, path) {
    var table = (/^\/rest\/v1\/([a-z0-9_]+)/.exec(path) || [])[1];
    var mine = table && changed && changed[table];
    if (!mine || !Array.isArray(rows)) return rows;
    var cols = {};
    Object.keys(mine).forEach(function (id) {
      Object.keys(mine[id]).forEach(function (k) { cols[k] = true; });
    });
    var out = rows.map(function (r) {
      return r && Object.prototype.hasOwnProperty.call(mine, r.id) ? Object.assign({}, r, mine[r.id]) : r;
    });
    new URLSearchParams(path.split('?')[1] || '').forEach(function (v, k) {
      var eq = /^eq\.(.*)$/.exec(v);
      if (!eq || !cols[k]) return;
      out = out.filter(function (r) {
        return !r || !Object.prototype.hasOwnProperty.call(mine, r.id) || String(r[k]) === eq[1];
      });
    });
    return out;
  }

  /* What to do with one request to Supabase. Pure, so tests can ask it. */
  function decide(sample, method, path) {
    if (path.indexOf('/auth/v1/') === 0) return { kind: 'auth' };
    for (var i = 0; i < sample.routes.length; i++) {
      var r = sample.routes[i];
      if (r && r.match && path.indexOf(r.match) !== -1 &&
          (!r.method || String(r.method).toUpperCase() === method)) {
        return { kind: 'route', body: r.body === undefined ? null : r.body, status: r.status || 200 };
      }
    }
    var reading = method === 'GET' || method === 'HEAD';
    var table = (/^\/rest\/v1\/([a-z0-9_]+)/.exec(path) || [])[1];
    if (reading && table && table !== 'rpc' && Array.isArray(sample.overlay[table])) {
      return { kind: 'overlay', rows: sample.overlay[table] };
    }
    if (reading && (path.indexOf('/rest/v1/') === 0 || path.indexOf('/storage/v1/') === 0)) {
      return { kind: 'read' };
    }
    if (path.indexOf('/functions/v1/') === 0) return { kind: 'fake', body: {} };
    if (path.indexOf('/rest/v1/rpc/') === 0) return { kind: 'fake', body: [] };
    return { kind: 'fake', body: 'echo' };
  }

  /* --------------------------------------------------------------- fetch */

  function headerOf(init, input, name) {
    var h = (init && init.headers) || (input && input.headers);
    if (!h) return '';
    if (typeof h.get === 'function') return h.get(name) || '';
    for (var k in h) if (k.toLowerCase() === name.toLowerCase()) return h[k];
    return '';
  }

  function json(body, status, accept) {
    if (/pgrst\.object/.test(accept || '') && Array.isArray(body)) body = body.length ? body[0] : null;
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function echo(init) {
    try {
      var b = JSON.parse((init && init.body) || 'null');
      return Array.isArray(b) ? b : (b ? [b] : []);
    } catch (err) { return []; }
  }

  /* The sample is read synchronously, on purpose and only here. js/auth.js
     reads the session the moment it loads, a few scripts later, so a demo
     that starts signed in has to have written it by then. A preview is the
     only place this can run. */
  function load(name) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', 'demo/' + name + '.json', false);
      x.send();
      if (x.status !== 200) throw new Error('missing');
      return { sample: parseSample(x.responseText), failed: false };
    } catch (err) {
      return { sample: parseSample('{}'), failed: true };
    }
  }

  function start(choice) {
    var realFetch = window.fetch.bind(window);
    var loaded = load(choice.name);
    var sample = loaded.sample;

    if (choice.fresh && sample.signedIn) {
      // The shape js/auth.js keeps, under this mode's own prefix.
      try {
        window.localStorage.setItem(PREFIX + 'session', JSON.stringify({
          accessToken: 'demo', refreshToken: 'demo',
          expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
          user: demoUser(sample)
        }));
      } catch (err) { /* private mode: sign in by hand, any address works */ }
    }

    // What the sample's effects have done this tab. See "EFFECTS" above.
    var changed = {};

    function base() {
      return (HC.config && HC.config.SUPABASE_URL) || '';
    }

    function isSupabase(url) {
      var b = base();
      return b ? url.indexOf(b + '/') === 0 : /^https:\/\/[a-z0-9]+\.supabase\.co\//.test(url);
    }

    function anonRead(url, init, input) {
      var key = (HC.config && HC.config.SUPABASE_ANON_KEY) || headerOf(init, input, 'apikey');
      var headers = { apikey: key, Authorization: 'Bearer ' + key };
      ['Accept', 'Prefer', 'Range'].forEach(function (n) {
        var v = headerOf(init, input, n);
        if (v) headers[n] = v;
      });
      return realFetch(url, { method: (init && init.method) || 'GET', headers: headers });
    }

    function auth(path, init) {
      var body = {};
      try { body = JSON.parse((init && init.body) || '{}') || {}; } catch (err) { /* none */ }
      if (/^\/auth\/v1\/logout/.test(path)) return json(null, 204);
      if (/^\/auth\/v1\/(token|verify)/.test(path)) return json(sessionBody(sample, body.email));
      if (/^\/auth\/v1\/user/.test(path)) return json(demoUser(sample, body.email));
      return json({});
    }

    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!isSupabase(url)) return realFetch(input, init);
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var path = url.slice(url.indexOf('/', 'https://'.length));
      var accept = headerOf(init, input, 'Accept');
      var effect = effectFor(sample, method, path);
      if (effect) recordEffect(changed, effect, init && init.body);
      var d = decide(sample, method, path);
      if (d.kind === 'auth') return Promise.resolve(auth(path, init));
      if (d.kind === 'route') {
        return Promise.resolve(json(applyEffects(d.body, changed, path), d.status, accept));
      }
      if (d.kind === 'read') return anonRead(url, init, input);
      if (d.kind === 'overlay') {
        return anonRead(url, init, input)
          .then(function (res) { return res.ok ? res.json() : []; })
          .catch(function () { return []; })
          .then(function (live) { return json(overlayRows(live, d.rows, path), 200, accept); });
      }
      return Promise.resolve(json(d.body === 'echo' ? echo(init) : d.body, 200, accept));
    };

    function banner() {
      var el = document.createElement('div');
      el.id = 'hc-demo-banner';
      el.setAttribute('role', 'status');
      // Low on the screen, above the two round buttons, clear of the header.
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' +
        'bottom:calc(env(safe-area-inset-bottom, 0px) + 92px);z-index:2147483000;' +
        'display:flex;align-items:center;gap:10px;padding:5px 6px 5px 12px;' +
        'border-radius:999px;background:rgba(28,28,30,.88);color:#fff;' +
        'font:600 12px/1.2 -apple-system,system-ui,sans-serif;white-space:nowrap;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.25)';
      var text = document.createElement('span');
      text.textContent = loaded.failed
        ? 'Demo “' + choice.name + '” not found · nothing saves'
        : 'Demo' + (sample.title ? ' · ' + sample.title : '') + ' · nothing saves';
      var exit = document.createElement('button');
      exit.type = 'button';
      exit.textContent = 'Exit';
      exit.style.cssText = 'border:0;border-radius:999px;padding:4px 10px;background:#fff;' +
        'color:#1c1c1e;font:inherit;cursor:pointer';
      exit.addEventListener('click', function () {
        session('clear');
        clearOwnStorage();
        window.location.replace(window.location.pathname);
      });
      el.appendChild(text);
      el.appendChild(exit);
      document.body.appendChild(el);

      /* At the top while the splash is up, so it does not sit on the
         buttons at the bottom of the gate's last stop. Back down once Home
         is on the glass. */
      if (HC.splash && HC.splash.showing()) {
        el.style.bottom = 'auto';
        el.style.top = 'calc(env(safe-area-inset-top, 0px) + 8px)';
        HC.splash.whenGone(function () {
          el.style.top = '';
          el.style.bottom = 'calc(env(safe-area-inset-bottom, 0px) + 92px)';
        });
      }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner);
    else banner();

    return sample;
  }

  var choice = (typeof window !== 'undefined' && window.location) ? pick(window.location) : null;

  HC.demo = {
    on: !!choice,
    name: choice ? choice.name : null,
    sample: null,
    // For tests.
    _allowedHere: allowedHere,
    _decide: decide,
    _parseSample: parseSample,
    _overlayRows: overlayRows,
    _effectFor: effectFor,
    _recordEffect: recordEffect,
    _applyEffects: applyEffects,
    _keysAskedFor: keysAskedFor
  };

  if (choice) HC.demo.sample = start(choice);

})(window.HC = window.HC || {});
