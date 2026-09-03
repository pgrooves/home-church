/* Drives js/contact.js in Node with a stubbed transport. The Edge Function is
   not here, so this is not about the network: it is about the two things that
   decide whether the contact form on Connect keeps its promise or breaks it.

   ONE, what counts as filled in. The screen puts the cursor back in a field
   using the answer this file returns, and the Edge Function checks the same
   three rules again on its own side. Three copies of "is this an email
   address" is how a form starts accepting on screen what the server refuses.

   TWO, and this is the one worth having a test for: a failed send must reject.
   The whole reason js/screens/connect.js had no form on it for a year is that
   the last one collected a name, a contact and a note and threw all three
   away while showing a warm toast. A catch that resolved, or a resolve on a
   400, would put that back exactly. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const CONTACT_JS = path.join(__dirname, '..', 'js', 'contact.js');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

// ---- the fake world -------------------------------------------------------
let configured = true;
let nextResult = { ok: true };        // what the function "returns"
const calls = [];                     // every call that reached the transport

const auth = {
  isConfigured: () => configured,
  callPublicFunction: (path, body, fallback) => {
    calls.push({ path, body, fallback });
    if (nextResult instanceof Error) return Promise.reject(nextResult);
    return Promise.resolve(nextResult);
  }
};

const sandbox = { window: {}, console };
sandbox.window.HC = { auth: auth };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(CONTACT_JS, 'utf8'), sandbox);

const contact = sandbox.window.HC.contact;

const GOOD = { name: 'Dee Robicheaux', email: 'dee@example.com', message: 'Where do I park on a Sunday?' };

(async () => {
  console.log('\n--- whether to draw the form at all ---');

  ok('with a project behind it, the form is offered', contact.isAvailable(), true);
  configured = false;
  ok('without one it is not, and Connect draws the address instead',
     contact.isAvailable(), false);
  configured = true;

  console.log('\n--- what counts as filled in ---');

  ok('a message with everything on it has no problem',
     contact.firstProblem(GOOD), null);

  ok('no name is asked for first, since it is the first field',
     contact.firstProblem(Object.assign({}, GOOD, { name: '  ' })),
     { field: 'name', message: 'Tell us your name first.' });

  ok('no email is named as the field it is',
     contact.firstProblem(Object.assign({}, GOOD, { email: '' })).field, 'email');

  ok('and an address with no domain is turned away here rather than at the server',
     contact.firstProblem(Object.assign({}, GOOD, { email: 'dee' })).field, 'email');

  ok('so is one with no name in front of the @',
     contact.firstProblem(Object.assign({}, GOOD, { email: '@example.com' })).field, 'email');

  ok('an empty message is the last thing checked',
     contact.firstProblem(Object.assign({}, GOOD, { message: '\n  \n' })).field, 'message');

  ok('nothing at all still answers with the first field rather than throwing',
     contact.firstProblem({}).field, 'name');
  ok('and so does nothing whatsoever', contact.firstProblem().field, 'name');

  /* A newline in an address is how a header injection is attempted, and this
     address goes into Reply-To. The Edge Function strips CR and LF on its own
     side; this is the first of the two answers. */
  console.log('\n--- an address is one address, not a header ---');

  [
    'dee@example.com\nBcc: everybody@example.com',
    'dee@example.com, someone@else.com',
    'dee@example.com someone@else.com',
    '"dee"@example.com<script>'
  ].forEach(function (bad) {
    ok('refused: ' + JSON.stringify(bad).slice(0, 42),
       contact.firstProblem(Object.assign({}, GOOD, { email: bad })).field, 'email');
  });

  console.log('\n--- sending ---');

  calls.length = 0;
  const sent = await contact.send(GOOD);
  ok('a message the server accepted resolves', sent, true);
  ok('and it went to the contact function', calls[0].path, '/contact');
  ok('with the three fields on it',
     [calls[0].body.name, calls[0].body.email, calls[0].body.message],
     ['Dee Robicheaux', 'dee@example.com', 'Where do I park on a Sunday?']);

  /* Sent empty by every real caller, and sent on purpose rather than omitted:
     the function has to have something to check when a bot posts straight at
     the URL without ever loading the form. */
  ok('and the honeypot on it, empty', calls[0].body.website, '');

  calls.length = 0;
  await contact.send({
    name: '  Dee Robicheaux  ',
    email: '  dee@example.com  ',
    message: '  Where do I park?  '
  });
  ok('what is sent is trimmed, so a stray space is not a name',
     [calls[0].body.name, calls[0].body.email, calls[0].body.message],
     ['Dee Robicheaux', 'dee@example.com', 'Where do I park?']);

  const long = 'x'.repeat(9000);
  calls.length = 0;
  await contact.send({ name: long, email: 'dee@example.com', message: long });
  ok('and capped, at the same lengths the table will accept',
     [calls[0].body.name.length, calls[0].body.message.length],
     [contact.limits.name, contact.limits.message]);

  console.log('\n--- and the part the old form got wrong ---');

  calls.length = 0;
  nextResult = new Error('We could not get that through just now.');
  let rejected = null;
  await contact.send(GOOD).then(
    function () { rejected = false; },
    function (err) { rejected = err.message; }
  );
  ok('a send that failed REJECTS, it does not quietly resolve',
     rejected, 'We could not get that through just now.');
  nextResult = { ok: true };

  calls.length = 0;
  rejected = null;
  await contact.send(Object.assign({}, GOOD, { message: '' })).then(
    function () { rejected = false; },
    function (err) { rejected = err.message; }
  );
  ok('an incomplete message rejects', rejected, 'Write your message first.');
  ok('and never reaches the network at all', calls.length, 0);

  configured = false;
  calls.length = 0;
  rejected = null;
  await contact.send(GOOD).then(
    function () { rejected = false; },
    function (err) { rejected = err.message; }
  );
  ok('with no project behind it, sending rejects rather than pretending',
     rejected,
     'The form is not connected yet. Email the church directly and somebody will answer.');
  ok('and again nothing was sent anywhere', calls.length, 0);
  configured = true;

  console.log('\n' + (fail ? fail + ' failed, ' + pass + ' passed.' : pass + ' passed.'));
  process.exit(fail ? 1 : 0);
})();
