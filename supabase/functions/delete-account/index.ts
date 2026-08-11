/**
 * Home Church, account deletion.
 *
 * WHY THIS IS A SERVER FUNCTION AND NOT A LINE OF JAVASCRIPT IN THE APP.
 * Removing a row from auth.users requires the service role key. That key
 * bypasses row level security entirely, at the Postgres level, so anything
 * holding it can read and write every table in the project. It must never
 * ship inside the app, where anybody can read it out of the bundle in about
 * fifteen seconds. So deletion happens here, where the key stays on the
 * server, and the app calls this with nothing but the caller's own token.
 *
 * WHAT APPLE ACTUALLY REQUIRES, since it is easy to overshoot or undershoot.
 * Guideline 5.1.1(v): an app that supports account creation must let people
 * start deleting the account inside the app. Offering only to deactivate is
 * not enough. Finishing on a website is permitted, but starting on one is
 * not. This function is what makes the in-app path real.
 *
 * DORMANT IN V1. Version 1 of the app ships with sign in switched off, so
 * there are no accounts to delete and Apple's requirement does not apply.
 * This is deployed anyway, and tested, so that turning accounts on is a
 * client change rather than a scramble.
 *
 * WHAT GETS DELETED. The auth user, which cascades to public.profiles through
 * the foreign key in migration 0009. Notes, guide checkmarks, group rosters,
 * and prayer requests are not touched because they were never here. They live
 * on the person's phone and the app erases them separately, from Your data.
 *
 * DEPLOY
 *   supabase functions deploy delete-account
 *
 * The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY variables are injected into
 * every Edge Function by the platform. Do not add them by hand and do not
 * paste the key anywhere.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !serviceKey || !anonKey) {
    console.error('delete-account: platform env vars missing');
    return json({ error: 'This is not set up correctly. Please tell the church.' }, 500);
  }

  // The caller's own token, and nothing else, decides whose account this is.
  // Never accept a user id from the request body. That would let anyone who
  // can reach this URL delete anybody's account by guessing a uuid, which is
  // the single worst bug this function could have.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'You need to be signed in to do that.' }, 401);

  // Verified against the auth server rather than decoded locally, so an
  // expired or forged token fails here instead of later.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: whoError } = await asCaller.auth.getUser();
  if (whoError || !userData?.user) {
    return json({ error: 'That sign in has expired. Sign in again and try once more.' }, 401);
  }

  const userId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // profiles cascades from auth.users, so this one call takes both. If more
  // user owned tables are ever added, either give them the same cascading
  // foreign key or delete them here, before this line, and say so in the
  // privacy policy. A table that survives account deletion is a promise
  // broken quietly.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error('delete-account: failed for user', userId, deleteError.message);
    return json({ error: 'We could not finish deleting your account. Please email the church and we will do it by hand.' }, 500);
  }

  console.log('delete-account: deleted user', userId);
  return json({ ok: true });
});
