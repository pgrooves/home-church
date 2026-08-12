/* ==========================================================================
   Home Church, auth
   Identity and profile sync, talking to Supabase's own HTTP API directly,
   no SDK. That keeps the no-build-step, no-npm-install promise in the top
   level README intact, Supabase's REST and Auth endpoints are plain JSON
   over fetch.

   Until js/config.js has real values, isConfigured() is false and every
   method below is a no-op or a friendly rejection. Nothing about the rest
   of the app depends on Supabase existing.

   Sign-in is a single identifier field, email or phone, verified by a one
   time code, no passwords to manage or reset. Supabase calls this OTP.
   Email works with no extra setup. Phone needs an SMS provider turned on
   in the Supabase dashboard first, see js/config.js.

   NOTE ON THE API CONTRACT: the endpoint shapes below (POST /auth/v1/otp,
   /auth/v1/verify, /auth/v1/token, and the profiles REST table) match
   Supabase's documented Auth and PostgREST APIs at the time this was
   written. This has not been tested against a live project, because none
   exists yet. When you connect a real project, sign in once and watch the
   network tab, if a field name has moved, that is the first place to look.
   ========================================================================== */

(function (HC) {
  'use strict';

  var cfg = HC.config || {};
  var SESSION_KEY = 'session';
  var PROFILE_TABLE = 'profiles';

  function configured() {
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  }

  /* ------------------------------------------------------------- session */

  var session = configured() ? HC.store.storage.get(SESSION_KEY, null) : null;

  function setSession(next) {
    session = next;
    if (next) {
      HC.store.storage.set(SESSION_KEY, next);
    } else {
      HC.store.storage.remove(SESSION_KEY);
    }
    HC.store.emit('auth', { signedIn: !!next, user: next ? next.user : null });
  }

  function isSignedIn() {
    return !!session;
  }

  function getUser() {
    return session ? session.user : null;
  }

  /* --------------------------------------------------------- identifiers */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function looksLikeEmail(value) {
    return EMAIL_RE.test(String(value || '').trim());
  }

  // Accepts loose US-style input ("504-644-7097") and normalizes toward the
  // E.164 shape Supabase's phone auth expects ("+15046447097"). Anyone
  // typing an international number should lead with +, we leave that alone.
  function normalizePhone(value) {
    var raw = String(value || '').trim();
    if (raw.indexOf('+') === 0) return '+' + raw.slice(1).replace(/\D/g, '');
    var digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits[0] === '1') return '+' + digits;
    return digits ? '+' + digits : '';
  }

  function looksLikePhone(value) {
    return normalizePhone(value).length >= 8;
  }

  // What the sign-in form actually sends: { email } or { phone }, never both.
  function classify(identifier) {
    var value = String(identifier || '').trim();
    if (looksLikeEmail(value)) return { channel: 'email', value: value };
    if (looksLikePhone(value)) return { channel: 'phone', value: normalizePhone(value) };
    return null;
  }

  /* ------------------------------------------------------------- fetch io */

  function authUrl(path) {
    return cfg.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1' + path;
  }

  function restUrl(path) {
    return cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1' + path;
  }

  function friendlyError(body, fallback) {
    return (body && (body.error_description || body.msg || body.error || body.message)) || fallback;
  }

  var OFFLINE_MESSAGE = 'Could not reach the church’s servers. Check your connection and try again.';

  // fetch() rejects with a bare TypeError when there is no network path at
  // all, no server, DNS failure, offline. That is a different problem than
  // an API returning a 4xx, and it deserves different, warmer copy.
  function networkSafe(promise) {
    return promise.catch(function (err) {
      if (err instanceof TypeError) throw new Error(OFFLINE_MESSAGE);
      throw err;
    });
  }

  function gotrueFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({
      'Content-Type': 'application/json',
      apikey: cfg.SUPABASE_ANON_KEY
    }, opts.headers || {});

    return networkSafe(fetch(authUrl(path), {
      method: opts.method || 'POST',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    })).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(friendlyError(body, 'Something went wrong. Try again in a moment.'));
        return body;
      });
    });
  }

  /* -------------------------------------------------------- session upkeep */

  function storeSessionFromResponse(body) {
    setSession({
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
      user: {
        id: body.user && body.user.id,
        email: body.user && body.user.email,
        phone: body.user && body.user.phone
      }
    });
  }

  // Refreshes ahead of expiry rather than waiting for a 401, so a signed-in
  // visit that spans more than an hour does not quietly fall back to guest.
  function ensureFreshSession() {
    if (!session) return Promise.resolve(null);
    if (session.expiresAt - Date.now() > 60000) return Promise.resolve(session);

    return gotrueFetch('/token?grant_type=refresh_token', {
      body: { refresh_token: session.refreshToken }
    }).then(function (body) {
      storeSessionFromResponse(body);
      return session;
    }).catch(function () {
      setSession(null);
      return null;
    });
  }

  /* ------------------------------------------------------------- sign in */

  // Sends the one time code. Resolves to { channel, value } so the UI knows
  // whether to say "check your email" or "check your texts".
  function requestCode(identifier) {
    if (!configured()) return Promise.reject(new Error('Accounts are not set up for this church yet.'));
    var id = classify(identifier);
    if (!id) return Promise.reject(new Error('That does not look like an email or a phone number.'));

    var body = { create_user: true };
    body[id.channel] = id.value;

    return gotrueFetch('/otp', { body: body }).then(function () { return id; });
  }

  // Verifies the code the person was sent and completes sign in, creating
  // the account on first verification if it did not already exist.
  function verifyCode(identifier, code) {
    var id = classify(identifier);
    if (!id) return Promise.reject(new Error('That does not look like an email or a phone number.'));
    if (!code || !code.trim()) return Promise.reject(new Error('Enter the code first.'));

    var body = {
      type: id.channel === 'email' ? 'email' : 'sms',
      token: code.trim()
    };
    body[id.channel] = id.value;

    return gotrueFetch('/verify', { body: body }).then(function (session) {
      storeSessionFromResponse(session);
      return syncAfterSignIn();
    });
  }

  function signOut() {
    var done = session
      ? gotrueFetch('/logout', { headers: { Authorization: 'Bearer ' + session.accessToken } }).catch(function () {})
      : Promise.resolve();
    return done.then(function () { setSession(null); });
  }

  /* ---------------------------------------------------- account deletion

     Guideline 5.1.1(v): an app that lets somebody create an account has to
     let them delete it from inside the app. Signing out is not deletion, and
     neither is erasing this phone, so this gets its own path and its own
     confirmation rather than being folded into either.

     The service role key needed to remove a row from auth.users must never
     ship in the bundle, so the deletion itself happens in the delete-account
     Edge Function. What goes over the wire is the caller's own access token
     and nothing else. The function works out whose account that is; no user
     id is sent, because a function that accepts one is a function that will
     eventually delete the wrong person.
     ------------------------------------------------------------------- */

  function functionsUrl(path) {
    return cfg.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1' + path;
  }

  function deleteAccount() {
    if (!isSignedIn()) return Promise.reject(new Error('You are not signed in.'));

    return ensureFreshSession().then(function (fresh) {
      // A session that would not refresh cannot authorize a deletion. Say so,
      // rather than signing them out quietly, which looks like it worked.
      if (!fresh) throw new Error('That sign in has expired. Sign in again and try once more.');

      return networkSafe(fetch(functionsUrl('/delete-account'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + fresh.accessToken
        }
      })).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) {
            throw new Error(friendlyError(body,
              'We could not finish deleting your account. Please email the church and we will do it by hand.'));
          }
          // The user this session belonged to no longer exists, so the tokens
          // are dead. Drop them here instead of calling /logout, which would
          // 401 against a deleted user and look like a failure.
          setSession(null);
          return true;
        });
      });
    });
  }

  /* --------------------------------------------------------- profile sync */

  var FIELD_MAP = {
    firstName: 'first_name',
    lastName: 'last_name',
    gender: 'gender',
    birthdate: 'birthdate',
    campus: 'campus',
    maritalStatus: 'marital_status',
    street: 'street',
    unit: 'unit',
    city: 'city',
    state: 'state',
    zip: 'zip',
    photoUrl: 'photo_url'
  };

  function toRemote(local) {
    var out = {};
    Object.keys(FIELD_MAP).forEach(function (camel) {
      if (local[camel] !== undefined) out[FIELD_MAP[camel]] = local[camel] || null;
    });
    return out;
  }

  function toLocal(remote) {
    var out = {};
    Object.keys(FIELD_MAP).forEach(function (camel) {
      var snake = FIELD_MAP[camel];
      if (remote[snake] !== undefined && remote[snake] !== null) out[camel] = remote[snake];
    });
    return out;
  }

  function restFetch(path, opts) {
    return ensureFreshSession().then(function (fresh) {
      if (!fresh) throw new Error('Signed out.');
      opts = opts || {};
      var headers = Object.assign({
        'Content-Type': 'application/json',
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + fresh.accessToken
      }, opts.headers || {});

      return networkSafe(fetch(restUrl(path), {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      })).then(function (res) {
        if (res.status === 204) return null;
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!res.ok) throw new Error(friendlyError(body, 'Could not reach your saved profile.'));
          return body;
        });
      });
    });
  }

  // Pulls the row a database trigger should create alongside every new
  // auth.users entry, see README, Supabase setup. Falls back to creating it
  // here in case that trigger is not wired up yet.
  function fetchOrCreateRemoteProfile(uid) {
    return restFetch('/' + PROFILE_TABLE + '?id=eq.' + uid + '&select=*', {
      headers: { Accept: 'application/vnd.pgrst.object+json' }
    }).catch(function () {
      return restFetch('/' + PROFILE_TABLE, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: { id: uid }
      }).then(function (rows) { return Array.isArray(rows) ? rows[0] : rows; });
    });
  }

  // Remote wins, since it is the copy that follows the person across
  // devices. Local edits made only on this phone would otherwise vanish the
  // first time they sign in on it, this way they are the ones that win the
  // very first sync and every visit after that reflects the server.
  function syncAfterSignIn() {
    var user = getUser();
    if (!user || !user.id) return Promise.resolve();

    return fetchOrCreateRemoteProfile(user.id).then(function (remote) {
      var patch = toLocal(remote || {});
      patch.email = user.email || '';
      patch.phone = user.phone || '';
      HC.store.updateProfile(patch);
    }).catch(function () {
      // Offline, or the table is not there yet. Sign-in still succeeded,
      // the person just keeps working from whatever is on this device.
    });
  }

  // Always saves locally first so the UI never waits on a network round
  // trip to feel like it worked, then pushes the same patch to Supabase in
  // the background when signed in.
  function saveProfile(patch) {
    HC.store.updateProfile(patch);
    if (!isSignedIn()) return Promise.resolve();

    var user = getUser();
    return restFetch('/' + PROFILE_TABLE + '?id=eq.' + user.id, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: toRemote(patch)
    }).catch(function () {
      HC.components.toast('Saved on this phone. We will sync it once you are back online.');
    });
  }

  function sendPasswordReset() {
    // Not offered, sign-in is code based rather than password based. Kept
    // as a named export so a future password option has somewhere to land.
    return Promise.reject(new Error('This church signs in with a code, not a password.'));
  }

  /* --------------------------------------------------------------- init */

  // Best effort session restore on boot. Runs after the shell has already
  // painted, Profile just re-renders itself if it is the visible screen
  // once this resolves.
  function init() {
    if (!configured() || !session) return;
    ensureFreshSession().then(function (fresh) {
      if (fresh) syncAfterSignIn().then(function () { HC.store.emit('auth', { signedIn: true, user: getUser() }); });
    });
  }

  HC.auth = {
    isConfigured: configured,
    isSignedIn: isSignedIn,
    getUser: getUser,
    classify: classify,
    requestCode: requestCode,
    verifyCode: verifyCode,
    signOut: signOut,
    deleteAccount: deleteAccount,
    saveProfile: saveProfile,
    sendPasswordReset: sendPasswordReset,
    init: init
  };

})(window.HC = window.HC || {});
