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
   the six digits, and drop {{ .ConfirmationURL }} entirely. The link is not
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
    SUPABASE_ANON_KEY: 'sb_publishable_x7NBiMU-rIxRwu68xCydGQ_fnwzR8Ey'
  };

})(window.HC = window.HC || {});
