/* ===========================================================================
   Continue as guest, for the tests that are not about the gate.

   Every browser test in here drives the app as a phone that has never signed
   in, and since js/gate.js exists that is a phone the app asks a question
   before it lets anybody through. The layer is over everything at z-index 95,
   so a test that does not answer the question spends its timeout watching a
   click land on the splash.

   This is the one thing those tests have in common with a person at that
   moment: they tap Continue as guest. Nothing in the app is reached around,
   and no build flag makes the gate go away for tests, because a gate that can
   be turned off from outside is a gate.

   Returns once the layer has actually gone, and returns quietly on a build
   where no gate ever appears, so js/config.js being emptied one day cannot
   make every test in this folder hang.

     const pastTheGate = require('./past-the-gate');
     await pastTheGate(page);
   =========================================================================== */
'use strict';

const GATE_UP = () => !!(window.HC && window.HC.gate && window.HC.gate.step());
const GONE = () => !document.getElementById('hc-splash');

module.exports = async function pastTheGate(page) {
  // Whichever comes first: a way in to answer, or a greeting that left on its
  // own because this phone is signed in or this church has no accounts.
  await page.waitForFunction(
    () => !document.getElementById('hc-splash') ||
          !!(window.HC && window.HC.gate && window.HC.gate.step()),
    null, { timeout: 25000 }
  );

  if (await page.evaluate(GATE_UP)) {
    // A beat for the lift to finish before the tap, the same beat a thumb
    // takes. Clicking mid-climb works, but it is not what this is standing in
    // for and it makes a flaky test out of a moving button.
    await page.waitForTimeout(500);
    await page.click('[data-gate="guest"]');
  }

  await page.waitForFunction(GONE, null, { timeout: 25000 });
};
