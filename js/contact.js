/* ==========================================================================
   Home Church, the contact form
   Everything that talks to the server about a message from the form at the
   top of Connect. js/screens/connect.js draws the form and does not contain
   a fetch, the same division js/rooms.js keeps with the Group tab.

   WHERE IT GOES. supabase/functions/contact, which writes the message down
   and then asks Resend to email it to the church. That function's header is
   where the reasoning about delivery lives; what matters here is the contract
   it keeps, because this file's whole job is to not soften it:

     resolves   the church has the email. Say so.
     rejects    it did not go. Say that instead, in the error's own words,
                and leave the mailto on screen.

   THE ONE THING THIS FILE MUST NEVER DO is catch a rejection and resolve
   anyway, or thank somebody optimistically while the request is in flight.
   The top of js/screens/connect.js is a list of three controls that used to
   do the equivalent, and the next steps form that "collected a name, a
   contact, and a note and then threw all three away" is the reason that
   screen had no form on it at all until this one.

   NOT A DRAFT STORE. What somebody has typed lives in js/screens/connect.js
   for as long as the screen is on, and nowhere else. It is not written to
   localStorage on purpose: an unsent message to the church sitting on a
   shared phone is not a convenience, and everything else this app keeps on a
   device is that person's own.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* The caps the Edge Function enforces and the table's constraints repeat.
     Here as well so that a long message is a sentence a person can read
     before they tap, rather than a 400 afterwards. */
  var MAX_NAME = 120;
  var MAX_EMAIL = 200;
  var MAX_MESSAGE = 4000;

  /* Deliberately loose, and the same shape the function checks. Nothing here
     can tell whether an address exists, and a regex that tries is a regex
     that turns somebody's perfectly good address away. What it does catch is
     the two mistakes that actually happen: a name typed into the email box,
     and a missing domain. */
  var EMAIL = /^[^\s@,;:<>"'\\]+@[^\s@,;:<>"'\\]+\.[A-Za-z]{2,}$/;

  function trimmed(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  /* Whether to draw the form at all. Without a Supabase project there is
     nothing behind it, and a form with nothing behind it is the one thing the
     Connect screen refuses to draw. The screen falls back to the church's
     email address, which needs no server and has always worked. */
  function isAvailable() {
    return !!(HC.auth && HC.auth.isConfigured && HC.auth.isConfigured());
  }

  /* The first thing wrong with what was typed, in the church's voice, or null
     when there is nothing wrong. Returned rather than thrown: the caller is a
     tap handler that wants to put the cursor in the offending field, and it
     needs to know which one.

     Exported so the screen and the send path check the same rules. Two copies
     of "what counts as filled in" is how a form starts refusing at the server
     what it accepted on screen. */
  function firstProblem(draft) {
    draft = draft || {};
    if (!trimmed(draft.name, MAX_NAME)) {
      return { field: 'name', message: 'Tell us your name first.' };
    }
    if (!trimmed(draft.email, MAX_EMAIL)) {
      return { field: 'email', message: 'We need an email address to write back to.' };
    }
    if (!EMAIL.test(trimmed(draft.email, MAX_EMAIL))) {
      return { field: 'email', message: 'That does not look like an email address.' };
    }
    if (!trimmed(draft.message, MAX_MESSAGE)) {
      return { field: 'message', message: 'Write your message first.' };
    }
    return null;
  }

  /* Sends it. Resolves only when the church has it.

     `website` is the honeypot and it is sent empty, every time, by the one
     caller that is a person. It is on the wire rather than only in the markup
     so that the function has something to check even when a bot posts
     straight to the URL without ever loading the form. */
  function send(draft) {
    if (!isAvailable()) {
      return Promise.reject(new Error(
        'The form is not connected yet. Email the church directly and somebody will answer.'
      ));
    }

    var problem = firstProblem(draft);
    if (problem) return Promise.reject(new Error(problem.message));

    return HC.auth.callPublicFunction('/contact', {
      name: trimmed(draft.name, MAX_NAME),
      email: trimmed(draft.email, MAX_EMAIL),
      message: trimmed(draft.message, MAX_MESSAGE),
      website: trimmed(draft.website, 200)
    }, 'We could not get that through just now. Email the church directly and somebody will answer.')
      .then(function () { return true; });
  }

  HC.contact = {
    isAvailable: isAvailable,
    firstProblem: firstProblem,
    send: send,
    limits: { name: MAX_NAME, email: MAX_EMAIL, message: MAX_MESSAGE }
  };

})(window.HC = window.HC || {});
