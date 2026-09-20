/* ==========================================================================
   Home Church, Supabase configuration
   Empty by default. The app ships and runs exactly as it does today, no
   accounts, everything on this device, until both values below are filled in.

   To activate:
   1. Create a project at supabase.com.
   2. Run the SQL in README.md, "Supabase setup", to create the profiles
      table and its row level security policies.
   3. Project Settings -> API, copy the Project URL and the anon public key.
      The anon key is safe to ship in client code, it has no power beyond
      what the row level security policies allow.
   4. Paste both below. Sign in, create account, and profile sync switch on
      automatically, nothing else in the app needs to change.

   EMAIL SIGN-IN NEEDS ONE DASHBOARD EDIT. Supabase sends a magic link by
   default, not a code, and this app asks for a code. Same endpoint, same
   token, the only difference is what the email says. In Authentication ->
   Emails, edit both the "Magic Link" template (returning members) and the
   "Confirm signup" template (first time signing in) to print {{ .Token }},
   the code, and drop {{ .ConfirmationURL }} entirely. How many digits that
   token is comes from Email OTP Length on the same dashboard page, which is
   eight for this project and six by default; the app's fields say eight, so
   the two have to agree. The link is not
   just redundant here, it is broken, nothing in the app handles the redirect
   it lands on. See README, "Accounts", for the templates to paste.

   If phone sign-in matters, also turn on Phone auth under Authentication ->
   Providers in the Supabase dashboard and connect an SMS provider there,
   Supabase does not send text messages on its own.
   ========================================================================== */

(function (HC) {
  'use strict';

  HC.config = {
    SUPABASE_URL: 'https://ibqkumxfltfiuqevviji.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_x7NBiMU-rIxRwu68xCydGQ_fnwzR8Ey',

    /* THE ACCOUNTS THAT SIGN IN WITH A PASSWORD INSTEAD OF A CODE.
       Everybody else types an address and we email them eight digits. These
       addresses are asked for a password instead, and no email is sent.

       WHY THIS EXISTS. Guideline 2.1 requires that whoever reviews the app
       can reach every feature it has, and Leader mode belongs to an account
       rather than to a phone. Reaching it through an emailed code means the
       reviewer has to log into somebody else's mailbox first, which is what
       submission 1.0 (8) was rejected for on September 17: they could not
       get in, so they never saw the app. A password is what the demo
       credential fields in App Store Connect are shaped for, and it takes
       the mailbox out of the loop entirely.

       WHAT IS AND IS NOT A SECRET. An address here is not one, which is why
       it can sit in a file that ships. The password is set in Supabase and
       lives nowhere in this bundle. Anybody reading this can learn that this
       account signs in with a password; that is all they can learn.

       THE ADDRESS MUST MATCH APP STORE CONNECT CHARACTER FOR CHARACTER.
       There is no fallback path on the sign-in screen, deliberately: a
       "have a password?" link would be shown to a whole congregation to
       help one person who was sent written instructions. So the safety net
       is a test rather than a button. Before submitting, type the address
       exactly as it appears in the App Store Connect demo credential field
       on a real device and confirm the password panel is what comes up.
       Comparison is case-insensitive and trims whitespace; nothing else is
       forgiven. See SUBMISSION_KIT.md, "The two demo accounts". */
    PASSWORD_ACCOUNTS: [
      'homechurchappleader@outlook.com',  // the host, marked as a group leader
      'homechurchappreview@outlook.com'   // the member, for the Guideline 1.2 walkthrough
    ]
  };

})(window.HC = window.HC || {});
