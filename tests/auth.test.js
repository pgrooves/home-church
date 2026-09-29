/* Drives js/auth.js in Node with a stubbed fetch, the way tests/rooms.test.js
   drives js/rooms.js. Not the whole file: just the profile sync that runs
   after sign-in, which is the one place a value on the server becomes a
   value on the phone.

   THE BUG THIS EXISTS FOR. can_host is set on the server, by the church, and
   nothing ever read it back down onto the phone: FIELD_MAP is the only list
   syncAfterSignIn used to build a local profile from a remote row, and
   can_host was never on it. The Group tab's "Host tonight" section reads a
   local field that was, correctly, always false. Every layer under it
   worked: the database had the right value, the row came back over the
   wire, and nothing in the app was ever going to look at it. A unit test on
   js/rooms.js could not have caught this, because rooms.js never touches a
   profile; it lives entirely in js/auth.js, which had no test file at all
   until this one. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const AUTH_JS = path.join(__dirname, '..', 'js', 'auth.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

function freshSandbox(seed) {
  const disk = {};
  Object.keys(seed || {}).forEach(k => { disk[k] = JSON.stringify(seed[k]); });
  const profile = {};
  const store = {
    storage: {
      get: (k, d) => (k in disk ? JSON.parse(disk[k]) : d),
      set: (k, v) => { disk[k] = JSON.stringify(v); return true; },
      remove: (k) => { delete disk[k]; }
    },
    emit() {},
    on() {},
    getProfile: () => profile,
    updateProfile: (patch) => Object.assign(profile, patch)
  };

  const responses = {}; // path prefix -> () => { status, body }
  const fetchCalls = [];
  function fakeFetch(url) {
    fetchCalls.push(url);
    const hit = Object.keys(responses).find(p => url.includes(p));
    if (!hit) throw new Error('unstubbed fetch: ' + url);
    const { status, body, offline } = responses[hit]();
    // What a real fetch does with no network path: reject with a TypeError.
    if (offline) return Promise.reject(new TypeError('Load failed'));
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body)
    });
  }

  const sandbox = {
    window: {},
    fetch: fakeFetch,
    Promise, JSON, Date, console, Object, TypeError,
    setTimeout, clearTimeout
  };
  sandbox.window.HC = {
    config: {
      SUPABASE_URL: 'https://fake.test',
      SUPABASE_ANON_KEY: 'anon-key',
      // Deliberately not the real address, and deliberately odd in its
      // casing and spacing: the point of the tests below is that neither
      // decides whether somebody gets in.
      PASSWORD_ACCOUNTS: ['  Demo.Leader@Example.com  ']
    },
    store
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(AUTH_JS, 'utf8'), sandbox);

  return { auth: sandbox.window.HC.auth, profile, responses, fetchCalls, disk };
}

function stubSignIn({ responses }, remoteProfileRow) {
  responses['/auth/v1/verify'] = () => ({
    status: 200,
    body: {
      access_token: 'tok', refresh_token: 'ref', expires_in: 3600,
      user: { id: 'u1', email: 'trey@example.com' }
    }
  });
  responses['/rest/v1/profiles'] = () => ({ status: 200, body: remoteProfileRow });
}

(async () => {
  // ---- the bug, made concrete: the server says yes, does the phone learn it
  {
    const t = freshSandbox();
    stubSignIn(t, { id: 'u1', first_name: 'Trey', can_host: true });
    await t.auth.verifyCode('trey@example.com', '123456');
    ok('can_host: true on the server ends up as canHost: true on the phone',
       t.profile.canHost, true);
    ok('and an ordinary field still comes through the same sync',
       t.profile.firstName, 'Trey');
  }

  // ---- the other direction: a revoked host finds out
  {
    const t = freshSandbox();
    stubSignIn(t, { id: 'u1', first_name: 'Trey', can_host: false });
    await t.auth.verifyCode('trey@example.com', '123456');
    ok('can_host: false syncs down too, not just the true case',
       t.profile.canHost, false);
  }

  /* ---- a row with no can_host on it at all, which is a project that has not
     run 0016 yet, or a select that came back thin. Leader mode has to read as
     off rather than as whatever this phone last held: the alternative is a
     phone that keeps drawing the leader tools after the church took them
     away, which is precisely what an admin turning the switch off means to
     do. Same rule as role, tested directly below. */
  {
    const t = freshSandbox();
    t.profile.canHost = true;
    t.profile.role = 'admin';
    stubSignIn(t, { id: 'u1', first_name: 'Trey' });
    await t.auth.verifyCode('trey@example.com', '123456');
    ok('a row with no can_host column leaves nobody a leader',
       t.profile.canHost, false);
    ok('and nobody an admin either', t.profile.role, 'member');
  }

  /* ---- signing out. Leader mode and the admin role describe a relationship
     to the church rather than something about this handset, so neither may
     survive into whoever picks the phone up next. */
  {
    const t = freshSandbox();
    stubSignIn(t, { id: 'u1', first_name: 'Trey', can_host: true, role: 'admin' });
    await t.auth.verifyCode('trey@example.com', '123456');
    ok('signed in as a leader', t.profile.canHost, true);

    t.responses['/auth/v1/logout'] = () => ({ status: 204, body: null });
    await t.auth.signOut();
    ok('signing out turns Leader mode off on this phone', t.profile.canHost, false);
    ok('and takes the admin role with it', t.profile.role, 'member');
    ok('but leaves what the phone itself knows alone', t.profile.firstName, 'Trey');
  }

  // ---- the security property the comments promise: never pushed back up
  //
  // can_host must never ride along in an ordinary profile save, or a phone
  // could grant itself hosting by lying in the request. Built with its own
  // capturing fetch from the start, since the point is to watch the wire.
  {
    let capturedBody = null;
    const disk = {}; const profile = { firstName: 'Trey', canHost: true };
    const store = {
      storage: { get: (k, d) => (k in disk ? JSON.parse(disk[k]) : d),
                 set: (k, v) => { disk[k] = JSON.stringify(v); }, remove: (k) => { delete disk[k]; } },
      emit() {}, on() {}, getProfile: () => profile, updateProfile: (p) => Object.assign(profile, p)
    };
    store.storage.set('session', { accessToken: 'tok', refreshToken: 'ref',
      expiresAt: Date.now() + 3600e3, user: { id: 'u1', email: 'trey@example.com' } });

    const sandbox = {
      window: {}, Promise, JSON, Date, console, Object, setTimeout, clearTimeout,
      fetch: (url, opts) => {
        if (url.includes('/rest/v1/profiles') && opts && opts.method === 'PATCH') {
          capturedBody = JSON.parse(opts.body);
        }
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve([{}]) });
      }
    };
    sandbox.window.HC = { config: { SUPABASE_URL: 'https://fake.test', SUPABASE_ANON_KEY: 'anon-key' }, store };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(AUTH_JS, 'utf8'), sandbox);

    await sandbox.window.HC.auth.saveProfile({ firstName: 'Treyford' });
    ok('saving a profile edit never sends can_host, however the local copy is set',
       capturedBody && ('can_host' in capturedBody), false);
  }

  /* ---- the password door, which exists because submission 1.0 (8) was
     rejected under Guideline 2.1: the reviewer was handed a mailbox to fetch
     a code from and never got into the app at all. A short list of addresses
     is asked for a password instead. See js/config.js.

     Four things have to be true and each is worth a test. The list has to be
     read forgivingly, because the address is typed by somebody reading it off
     a form in App Store Connect. Nobody outside the list may reach the
     password path. A password sign-in has to land in exactly the same place a
     code sign-in lands, or Leader mode is not there when the reviewer looks
     for it. And no email may go out, because the whole point is that nobody
     is watching that inbox. */
  {
    const t = freshSandbox();
    ok('the configured address is on the list',
       t.auth.usesPassword('demo.leader@example.com'), true);
    ok('and casing and stray spaces in what was typed do not decide it',
       t.auth.usesPassword('  DEMO.Leader@Example.COM '), true);
    ok('an ordinary member is not on the list',
       t.auth.usesPassword('trey@example.com'), false);
    ok('nor is a near miss on the address',
       t.auth.usesPassword('demo.leader@example.net'), false);
    ok('and a phone number can never be, the password door is email only',
       t.auth.usesPassword('504-644-7097'), false);
  }

  // ---- the thing the reviewer is actually here to see: a password sign-in
  // arrives at a phone that knows it is holding a leader's account.
  {
    const t = freshSandbox();
    t.responses['/auth/v1/token'] = () => ({
      status: 200,
      body: {
        access_token: 'tok', refresh_token: 'ref', expires_in: 3600,
        user: { id: 'u1', email: 'demo.leader@example.com' }
      }
    });
    t.responses['/rest/v1/profiles'] = () => ({
      status: 200,
      body: { id: 'u1', first_name: 'Dana', can_host: true }
    });

    await t.auth.signInWithPassword('demo.leader@example.com', 'hunter2');
    ok('a password sign-in is signed in', t.auth.isSignedIn(), true);
    ok('and lands on the same profile sync the code path lands on',
       t.profile.canHost, true);
    ok('name and all', t.profile.firstName, 'Dana');
    ok('it goes to the password grant',
       t.fetchCalls.some(u => u.includes('/auth/v1/token?grant_type=password')), true);
    ok('and never asks Supabase to send anybody an email',
       t.fetchCalls.some(u => u.includes('/auth/v1/otp')), false);
  }

  // ---- a wrong password says so in the app's own voice rather than
  // Supabase's. The address was accepted a panel ago, so there is only one
  // thing left that can be wrong and no reason to be vague about it.
  {
    const t = freshSandbox();
    t.responses['/auth/v1/token'] = () => ({
      status: 400,
      body: { error: 'invalid_grant', error_description: 'Invalid login credentials' }
    });

    let message = null;
    try { await t.auth.signInWithPassword('demo.leader@example.com', 'wrong'); }
    catch (err) { message = err.message; }
    ok('a wrong password is said plainly',
       message, 'That password did not match. Check it and try again.');
    ok('and nobody is signed in on the strength of it', t.auth.isSignedIn(), false);
  }

  /* ---- staying signed in across an App Store update.

     THE BUG THIS IS FOR. Somebody who had not opened the app in over an hour
     (so, after every update) came back to a sign-in screen and had to fetch
     a code again. The first launch has an expired access token, so the app
     refreshes, and ensureFreshSession() used to throw the whole session away
     on any failure at all: the radio still waking up, a 5xx, one of the three
     simultaneous refreshes launch used to send losing the race. The auth logs
     showed those three and four at a time, same token, same second. */
  const EXPIRED = { session: { accessToken: 'old', refreshToken: 'ref-1',
    expiresAt: Date.now() - 1000, user: { id: 'u1', email: 'trey@example.com' } } };
  const REFRESHED = () => ({ status: 200, body: {
    access_token: 'new', refresh_token: 'ref-2', expires_in: 3600,
    user: { id: 'u1', email: 'trey@example.com' } } });

  {
    const t = freshSandbox(EXPIRED);
    t.responses['/auth/v1/token'] = () => ({ offline: true });
    let message = null;
    try { await t.auth.rpc('anything'); } catch (err) { message = err.message; }
    ok('no network during a refresh still says so', /reach the church/.test(message), true);
    ok('AND DOES NOT SIGN ANYBODY OUT', t.auth.isSignedIn(), true);
    ok('the refresh token is still on disk for next time', t.disk.session && JSON.parse(t.disk.session).refreshToken, 'ref-1');

    t.responses['/auth/v1/token'] = REFRESHED;
    t.responses['/rest/v1/rpc/anything'] = () => ({ status: 200, body: { fine: true } });
    const got = await t.auth.rpc('anything');
    ok('and the next call, with signal, refreshes and goes through', got, { fine: true });
    ok('holding the new refresh token', JSON.parse(t.disk.session).refreshToken, 'ref-2');
  }

  {
    const t = freshSandbox(EXPIRED);
    t.responses['/auth/v1/token'] = () => ({ status: 503, body: { message: 'upstream' } });
    try { await t.auth.rpc('anything'); } catch (err) { /* expected */ }
    ok('a server error on refresh does not sign anybody out', t.auth.isSignedIn(), true);
  }

  {
    const t = freshSandbox(EXPIRED);
    t.responses['/auth/v1/token'] = () => ({ status: 429, body: { message: 'slow down' } });
    try { await t.auth.rpc('anything'); } catch (err) { /* expected */ }
    ok('nor does being rate limited', t.auth.isSignedIn(), true);
  }

  {
    const t = freshSandbox(EXPIRED);
    t.responses['/auth/v1/token'] = () => ({ status: 400,
      body: { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' } });
    try { await t.auth.rpc('anything'); } catch (err) { /* expected */ }
    ok('but a refresh token Supabase refuses does sign out', t.auth.isSignedIn(), false);
    ok('and leaves nothing on disk', 'session' in t.disk, false);
  }

  {
    const t = freshSandbox(EXPIRED);
    t.responses['/auth/v1/token'] = REFRESHED;
    t.responses['/rest/v1/rpc/'] = () => ({ status: 200, body: [] });
    await Promise.all([t.auth.rpc('a'), t.auth.rpc('b'), t.auth.rpc('c')]);
    ok('three calls at launch share ONE refresh, never reusing a spent token',
       t.fetchCalls.filter(u => u.includes('grant_type=refresh_token')).length, 1);
    await t.auth.rpc('d');
    ok('and once it lands, nobody refreshes again for the next hour',
       t.fetchCalls.filter(u => u.includes('grant_type=refresh_token')).length, 1);
  }

  {
    const t = freshSandbox(EXPIRED);
    t.responses['/auth/v1/token'] = () => ({ offline: true });
    t.auth.init();
    await new Promise(r => setTimeout(r, 0));
    ok('launching offline leaves the person signed in', t.auth.isSignedIn(), true);
  }

  console.log('\n' + (fail ? fail + ' failed, ' + pass + ' passed.' : pass + ' passed.'));
  process.exit(fail ? 1 : 0);
})();
