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

function freshSandbox() {
  const disk = {};
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
    const { status, body } = responses[hit]();
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body)
    });
  }

  const sandbox = {
    window: {},
    fetch: fakeFetch,
    Promise, JSON, Date, console, Object,
    setTimeout, clearTimeout
  };
  sandbox.window.HC = {
    config: { SUPABASE_URL: 'https://fake.test', SUPABASE_ANON_KEY: 'anon-key' },
    store
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(AUTH_JS, 'utf8'), sandbox);

  return { auth: sandbox.window.HC.auth, profile, responses, fetchCalls };
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

  console.log('\n' + (fail ? fail + ' failed, ' + pass + ' passed.' : pass + ' passed.'));
  process.exit(fail ? 1 : 0);
})();
