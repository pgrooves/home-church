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

   If phone sign-in matters, also turn on Phone auth under Authentication ->
   Providers in the Supabase dashboard and connect an SMS provider there,
   Supabase does not send text messages on its own. Email sign-in works with
   no extra setup.
   ========================================================================== */

(function (HC) {
  'use strict';

  HC.config = {
    SUPABASE_URL: '',        // e.g. 'https://xxxxxxxxxxxx.supabase.co'
    SUPABASE_ANON_KEY: ''    // the anon / public key from Project Settings -> API
  };

})(window.HC = window.HC || {});
